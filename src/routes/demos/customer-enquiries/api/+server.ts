import { json, type RequestEvent } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	authenticated,
	demoEnabled,
	demoStore,
	login,
	logout
} from '$lib/server/enquiry-demo/runtime';
import { DemoError } from '$lib/server/enquiry-demo/store';
import { BodyReadError, readBoundedBody } from '$lib/server/http/body';
import { createLocalAdmission } from '$lib/server/http/local-admission';
import { publicModeEnabled } from '$lib/server/enquiry-demo/public-runtime';
import { publicApi } from '$lib/server/enquiry-demo/public-api';

const admission = createLocalAdmission({
	attempts: 120,
	globalAttempts: 600,
	windowMs: 60_000,
	concurrency: 8,
	maxKeys: 256
});
const loginAdmission = createLocalAdmission({
	attempts: 8,
	globalAttempts: 20,
	windowMs: 15 * 60_000,
	concurrency: 2,
	maxKeys: 256
});
const submitAdmission = createLocalAdmission({
	attempts: 20,
	globalAttempts: 60,
	windowMs: 60 * 60_000,
	concurrency: 4,
	maxKeys: 256
});
const headers = {
	'cache-control': 'private, no-store',
	'x-robots-tag': 'noindex, nofollow, noarchive'
};
const response = (body: unknown, status = 200) => json(body, { status, headers });

function key(event: RequestEvent): string {
	try {
		return event.getClientAddress();
	} catch {
		return 'local-fallback';
	}
}

function checkedReference(value: unknown): string {
	if (typeof value !== 'string' || !/^EOS-\d{5,9}$/.test(value))
		throw new DemoError(400, 'Choose a valid enquiry reference.');
	return value;
}

function failure(error: unknown): Response {
	if (error instanceof DemoError)
		return response({ message: error.message, errors: error.fields }, error.status);
	if (error instanceof BodyReadError)
		return response(
			{
				message:
					error.kind === 'too-large'
						? 'This request is too large. Please keep the description short.'
						: 'The request took too long. Please try again.'
			},
			error.kind === 'too-large' ? 413 : 408
		);
	if (error instanceof SyntaxError)
		return response({ message: 'We could not read this request. Please try again.' }, 400);
	return response(
		{
			message:
				'The demonstration desk is temporarily unavailable. Your previously saved enquiries remain in the database. Please try again.'
		},
		503
	);
}

export const GET: RequestHandler = (event) => {
	if (publicModeEnabled(event.url)) return publicApi(event);
	if (!demoEnabled(event.url))
		return response(
			{ message: 'This working prototype is available only through the local demo launcher.' },
			404
		);
	const ticket = admission(key(event));
	if (!ticket.allowed)
		return response({ message: 'Please wait a moment before trying again.' }, 429);
	try {
		if (!authenticated(event.cookies))
			return response({ message: 'Please sign in to the staff desk.' }, 401);
		const store = demoStore();
		const view = event.url.searchParams.get('view');
		if (view === 'desk')
			return response({
				counts: store.dashboard(),
				routingRules: store.routingRules(),
				enquiries: store.list(),
				staff: store.staff(),
				now: new Date(store.now()).toISOString(),
				settings: store.settings()
			});
		if (view === 'detail') {
			const enquiry = store.detail(checkedReference(event.url.searchParams.get('ref')));
			if (!enquiry) return response({ message: 'That enquiry could not be found.' }, 404);
			return response({ enquiry, staff: store.staff(), now: new Date(store.now()).toISOString() });
		}
		return response({ message: 'Choose the staff desk or an enquiry.' }, 400);
	} catch (error) {
		return failure(error);
	} finally {
		ticket.release();
	}
};

export const POST: RequestHandler = async (event) => {
	if (publicModeEnabled(event.url)) return publicApi(event);
	if (!demoEnabled(event.url))
		return response(
			{ message: 'This working prototype is available only through the local demo launcher.' },
			404
		);
	if (event.request.headers.get('origin') !== event.url.origin)
		return response({ message: 'Please submit this form from the local demonstration page.' }, 403);
	if (event.request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json')
		return response({ message: 'Please use the demonstration form.' }, 415);
	const ticket = admission(key(event));
	if (!ticket.allowed)
		return response({ message: 'Please wait a moment before trying again.' }, 429);
	try {
		const bytes = await readBoundedBody(event.request, 16 * 1024, 5_000, event.request.signal);
		const input: unknown = JSON.parse(new TextDecoder().decode(bytes));
		if (!input || typeof input !== 'object' || Array.isArray(input))
			throw new DemoError(400, 'Please use the demonstration form.');
		const body = input as Record<string, unknown>;
		if (body.action === 'login') {
			const attempt = loginAdmission(key(event));
			if (!attempt.allowed)
				return response({ message: 'Too many sign-in attempts. Please wait 15 minutes.' }, 429);
			try {
				if (!login(body.password, event.cookies, event.url.protocol === 'https:'))
					return response(
						{
							message: 'That password was not recognised. Use the local demo password from setup.'
						},
						401
					);
				return response({ authenticated: true });
			} finally {
				attempt.release();
			}
		}
		if (body.action === 'submit') {
			const attempt = submitAdmission(key(event));
			if (!attempt.allowed)
				return response(
					{ message: 'The demonstration has received several enquiries. Please try again later.' },
					429
				);
			try {
				const result = demoStore().submit(body);
				return response({
					reference: result.enquiry.ref,
					duplicate: result.duplicate,
					createdAt: result.enquiry.createdAt,
					deadlineAt: result.enquiry.deadlineAt,
					ackStatus: result.enquiry.ackStatus
				});
			} finally {
				attempt.release();
			}
		}
		if (!authenticated(event.cookies))
			return response({ message: 'Please sign in before changing the staff desk.' }, 401);
		if (body.action === 'logout') {
			logout(event.cookies);
			return response({ authenticated: false });
		}
		const store = demoStore();
		if (body.action === 'update') {
			const update: {
				ownerId?: string;
				status?: 'new' | 'in-progress' | 'resolved';
				note?: string;
				recordResponse?: boolean;
			} = {};
			if ('ownerId' in body) {
				if (typeof body.ownerId !== 'string' || body.ownerId.length > 80)
					throw new DemoError(400, 'Choose a person from the staff list.');
				update.ownerId = body.ownerId;
			}
			if ('status' in body) {
				if (!['new', 'in-progress', 'resolved'].includes(String(body.status)))
					throw new DemoError(400, 'Choose a valid work status.');
				update.status = body.status as 'new' | 'in-progress' | 'resolved';
			}
			if ('note' in body) {
				if (typeof body.note !== 'string' || body.note.trim().length > 1000)
					throw new DemoError(400, 'Keep internal notes to 1,000 characters.');
				update.note = body.note;
			}
			if ('recordResponse' in body) {
				if (typeof body.recordResponse !== 'boolean')
					throw new DemoError(400, 'Choose whether to record contact with the customer.');
				update.recordResponse = body.recordResponse;
			}
			return response({
				enquiry: store.update(checkedReference(body.reference), update, 'Office coordinator')
			});
		}
		if (body.action === 'retry')
			return response({
				enquiry: store.retry(checkedReference(body.reference), 'Office coordinator')
			});
		if (body.action === 'tick') return response(store.tick('staff-sandbox'));
		if (body.action === 'sandbox') {
			if (!('mode' in body) && !('advanceMinutes' in body))
				throw new DemoError(400, 'Choose a demonstration control.');
			if ('mode' in body && !['succeed', 'fail-next', 'always-fail'].includes(String(body.mode)))
				throw new DemoError(400, 'Choose a valid simulated message behaviour.');
			if (
				'advanceMinutes' in body &&
				(typeof body.advanceMinutes !== 'number' ||
					!Number.isInteger(body.advanceMinutes) ||
					body.advanceMinutes < 1 ||
					body.advanceMinutes > 1440)
			)
				throw new DemoError(400, 'Advance the demonstration by 1 to 1,440 whole minutes.');
			return response({
				settings: store.sandbox(
					body as { mode?: 'succeed' | 'fail-next' | 'always-fail'; advanceMinutes?: number }
				)
			});
		}
		if (body.action === 'reset') {
			if (body.confirmation !== 'RESET DEMO')
				throw new DemoError(400, 'Type RESET DEMO to replace the fictional sample data.');
			store.reset();
			return response({ message: 'The 30 fictional sample enquiries have been restored.' });
		}
		return response({ message: 'Choose a valid staff action.' }, 400);
	} catch (error) {
		return failure(error);
	} finally {
		ticket.release();
	}
};
