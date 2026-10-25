import { json, type RequestEvent } from '@sveltejs/kit';
import { BodyReadError, readBoundedBody, withDeadline } from '../http/body';
import { createLocalAdmission } from '../http/local-admission';
import { DemoError } from './store';
import type { StaffUpdate } from '../../enquiry-demo/types';
import {
	publicWorkspaces,
	sessionHash,
	startPublicSession,
	WORKSPACE_COOKIE
} from './public-runtime';
import { publicWorkerPass } from './public-worker';

const admit = createLocalAdmission({
	attempts: 120,
	globalAttempts: 600,
	windowMs: 60_000,
	concurrency: 8,
	maxKeys: 256
});
const headers = {
	'cache-control': 'private, no-store',
	'x-robots-tag': 'noindex, nofollow, noarchive'
};
const answer = (body: unknown, status = 200) => json(body, { status, headers });
function reference(value: unknown) {
	if (typeof value !== 'string' || !/^EOS-\d{5,9}$/.test(value))
		throw new DemoError(400, 'Choose a valid enquiry reference.');
	return value;
}
function staffUpdate(body: Record<string, unknown>): StaffUpdate {
	const patch: StaffUpdate = {};
	if ('ownerId' in body) {
		if (typeof body.ownerId !== 'string' || body.ownerId.length > 80)
			throw new DemoError(400, 'Choose an available member of staff.');
		patch.ownerId = body.ownerId;
	}
	if ('status' in body) {
		if (!['new', 'in-progress', 'resolved'].includes(String(body.status)))
			throw new DemoError(400, 'Choose a valid work status.');
		patch.status = body.status as StaffUpdate['status'];
	}
	if ('note' in body) {
		if (typeof body.note !== 'string' || body.note.length > 1000)
			throw new DemoError(400, 'Keep internal notes to 1,000 characters.');
		patch.note = body.note;
	}
	if ('recordResponse' in body) {
		if (typeof body.recordResponse !== 'boolean')
			throw new DemoError(400, 'Choose whether to record customer contact.');
		patch.recordResponse = body.recordResponse;
	}
	return patch;
}

export async function publicApi(event: RequestEvent): Promise<Response> {
	let address = 'unknown';
	try {
		address = event.getClientAddress();
	} catch {
		/* bounded fallback */
	}
	const ticket = admit(address);
	if (!ticket.allowed) return answer({ message: 'Please wait a moment before trying again.' }, 429);
	try {
		return await withDeadline(async (deadlineSignal) => {
			const signal = AbortSignal.any([deadlineSignal, event.request.signal]);
			const workspaces = publicWorkspaces(signal);
			if (event.request.method === 'GET') {
				const hash = sessionHash(event.cookies);
				const view = event.url.searchParams.get('view');
				const { result } = await workspaces.read(
					hash,
					(store) => {
						if (view === 'desk')
							return {
								counts: store.dashboard(),
								routingRules: store.routingRules(),
								enquiries: store.list(),
								staff: store.staff(),
								now: new Date(store.now()).toISOString(),
								settings: store.settings()
							};
						if (view === 'detail') {
							const enquiry = store.detail(reference(event.url.searchParams.get('ref')));
							if (!enquiry)
								throw new DemoError(404, 'That enquiry could not be found in your demonstration.');
							return { enquiry, staff: store.staff(), now: new Date(store.now()).toISOString() };
						}
						throw new DemoError(400, 'Choose the staff desk or an enquiry.');
					},
					{ requireStaff: true }
				);
				return answer(result);
			}
			if (event.request.headers.get('origin') !== event.url.origin)
				return answer({ message: 'Please submit this form from the demonstration page.' }, 403);
			if (event.request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json')
				return answer({ message: 'Please use the demonstration form.' }, 415);
			const bytes = await readBoundedBody(event.request, 16 * 1024, 5_000, event.request.signal);
			const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
			if (!value || typeof value !== 'object' || Array.isArray(value))
				throw new DemoError(400, 'Please use the demonstration form.');
			const body = value as Record<string, unknown>;
			if (body.action === 'start' || body.action === 'enter-staff')
				return answer(await startPublicSession(event, body.action === 'enter-staff', signal));
			const hash = sessionHash(event.cookies);
			if (body.action === 'submit') {
				const { result } = await workspaces.run(hash, (store) => store.submit(body));
				return answer({
					reference: result.enquiry.ref,
					duplicate: result.duplicate,
					createdAt: result.enquiry.createdAt,
					deadlineAt: result.enquiry.deadlineAt,
					ackStatus: result.enquiry.ackStatus
				});
			}
			if (body.action === 'logout') {
				await workspaces.run(hash, () => null, { requireStaff: true, staffUntil: null });
				return answer({ authenticated: false });
			}
			if (body.action === 'tick') return answer(await publicWorkerPass(hash, true, signal));
			const { result } = await workspaces.run(
				hash,
				(store) => {
					if (body.action === 'update')
						return {
							enquiry: store.update(
								reference(body.reference),
								staffUpdate(body),
								'Demonstration staff member'
							)
						};
					if (body.action === 'retry')
						return {
							enquiry: store.retry(reference(body.reference), 'Demonstration staff member')
						};
					if (body.action === 'sandbox') {
						if (!('mode' in body) && !('advanceMinutes' in body))
							throw new DemoError(400, 'Choose a demonstration control.');
						if (
							'mode' in body &&
							!['succeed', 'fail-next', 'always-fail'].includes(String(body.mode))
						)
							throw new DemoError(400, 'Choose a valid simulated message behaviour.');
						if (
							'advanceMinutes' in body &&
							(typeof body.advanceMinutes !== 'number' ||
								!Number.isInteger(body.advanceMinutes) ||
								body.advanceMinutes < 1 ||
								body.advanceMinutes > 1440)
						)
							throw new DemoError(400, 'Advance by 1 to 1,440 whole minutes.');
						return {
							settings: store.sandbox(
								body as { mode?: 'succeed' | 'fail-next' | 'always-fail'; advanceMinutes?: number }
							)
						};
					}
					if (body.action === 'reset') {
						if (body.confirmation !== 'RESET DEMO')
							throw new DemoError(
								400,
								'Type RESET DEMO to replace only your fictional sample data.'
							);
						store.reset();
						return { message: 'Your 30 fictional sample enquiries have been restored.' };
					}
					throw new DemoError(400, 'Choose a valid demonstration action.');
				},
				{ requireStaff: true }
			);
			return answer(result);
		}, 45_000);
	} catch (error) {
		if (error instanceof DemoError) {
			if (error.status === 410)
				event.cookies.delete(WORKSPACE_COOKIE, { path: '/demos/customer-enquiries' });
			return answer({ message: error.message, errors: error.fields }, error.status);
		}
		if (error instanceof BodyReadError)
			return answer(
				{
					message:
						error.kind === 'too-large'
							? 'This request is too large. Please keep the description short.'
							: 'This request took too long. Please try again.'
				},
				error.kind === 'too-large' ? 413 : 408
			);
		if (error instanceof SyntaxError)
			return answer({ message: 'We could not read this request. Please try again.' }, 400);
		return answer(
			{ message: 'Your private demonstration is temporarily unavailable. Please try again.' },
			503
		);
	} finally {
		ticket.release();
	}
}
