import { createHash, createHmac, randomBytes } from 'node:crypto';
import type { Cookies, RequestEvent } from '@sveltejs/kit';
import { DemoError } from './store';
import { SupabasePublicRepository, type PublicWorkspace } from './public-repository';
import { PublicWorkspaces, STAFF_TTL_MS } from './public-workspaces';

export const WORKSPACE_COOKIE = 'enquiry_demo_workspace';
const local = (url: URL) => ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
const digest = (value: string) => createHash('sha256').update(value).digest('hex');

export function publicModeEnabled(url: URL): boolean {
	return (
		process.env.ENQUIRY_DEMO_PUBLIC_ENABLED === '1' &&
		(url.protocol === 'https:' ||
			(!process.env.VERCEL && local(url) && process.env.ENQUIRY_DEMO_ALLOW_TEST_BACKEND === '1'))
	);
}

export function publicRepository(signal?: AbortSignal): SupabasePublicRepository {
	const url = process.env.SUPABASE_URL || '';
	const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
	return new SupabasePublicRepository({
		url,
		serviceKey,
		signal,
		allowLoopback: !process.env.VERCEL && process.env.ENQUIRY_DEMO_ALLOW_TEST_BACKEND === '1'
	});
}

export function publicWorkspaces(signal?: AbortSignal): PublicWorkspaces {
	return new PublicWorkspaces(publicRepository(signal), Date.now, signal);
}

export function sessionHash(cookies: Cookies): string {
	const token = cookies.get(WORKSPACE_COOKIE);
	if (!token || !/^[0-9a-f]{64}$/.test(token))
		throw new DemoError(410, 'Start your own temporary demonstration to continue.');
	return digest(token);
}

export function sandboxInfo(workspace: PublicWorkspace) {
	return { scopeKey: workspace.scopeKey, expiresAt: workspace.expiresAt };
}

export function staffActive(workspace: PublicWorkspace): boolean {
	return Boolean(workspace.staffUntil && Date.parse(workspace.staffUntil) > Date.now());
}

export async function loadPublicSession(cookies: Cookies, signal?: AbortSignal) {
	if (!cookies.get(WORKSPACE_COOKIE)) return null;
	try {
		return (
			await publicWorkspaces(signal).read(sessionHash(cookies), (_store, workspace) => workspace)
		).workspace;
	} catch (error) {
		if (error instanceof DemoError && error.status === 410) {
			cookies.delete(WORKSPACE_COOKIE, { path: '/demos/customer-enquiries' });
			return null;
		}
		throw error;
	}
}

/** Only an exact same-origin, bounded POST may call this creation operation. */
export async function startPublicSession(
	event: RequestEvent,
	grantStaff = false,
	signal?: AbortSignal
) {
	const workspaces = publicWorkspaces(signal);
	let workspace = await loadPublicSession(event.cookies, signal);
	if (!workspace) {
		const salt = process.env.NOTES_RATE_LIMIT_SALT || '';
		if (salt.length < 32)
			throw new DemoError(503, 'The public demonstration is temporarily unavailable.');
		let address = 'unknown';
		try {
			address = event.getClientAddress();
		} catch {
			/* One bounded shared fallback bucket. */
		}
		const admission = createHmac('sha256', salt)
			.update(`enquiry-demo:${Math.floor(Date.now() / 3_600_000)}:${address}`)
			.digest('hex');
		const token = randomBytes(32).toString('hex');
		workspace = await workspaces.create(digest(token), randomBytes(32).toString('hex'), admission);
		event.cookies.set(WORKSPACE_COOKIE, token, {
			path: '/demos/customer-enquiries',
			httpOnly: true,
			secure: event.url.protocol === 'https:',
			sameSite: 'strict',
			expires: new Date(workspace.expiresAt),
			maxAge: Math.max(1, Math.floor((Date.parse(workspace.expiresAt) - Date.now()) / 1000))
		});
	}
	if (grantStaff) {
		const staffUntil = new Date(
			Math.min(Date.parse(workspace.expiresAt), Date.now() + STAFF_TTL_MS)
		).toISOString();
		workspace = (await workspaces.run(workspace.sessionHash, () => null, { staffUntil })).workspace;
	}
	return { sandbox: sandboxInfo(workspace), authenticated: staffActive(workspace) };
}
