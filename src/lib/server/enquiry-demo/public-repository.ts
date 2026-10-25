import { DemoError, MAX_SNAPSHOT_BYTES, type EnquirySnapshot } from './store';
import { readBoundedBody, withDeadline } from '../http/body';

export interface PublicWorkspace {
	sessionHash: string;
	scopeKey: string;
	version: number;
	state: EnquirySnapshot;
	expiresAt: string;
	staffUntil: string | null;
	nextDueAt: string | null;
}
export interface WorkspaceCreate {
	sessionHash: string;
	scopeKey: string;
	admissionKey: string;
	state: EnquirySnapshot;
	expiresAt: string;
	staffUntil: string | null;
	nextDueAt: string | null;
}
export interface WorkspacePatch {
	state: EnquirySnapshot;
	staffUntil: string | null;
	nextDueAt: string | null;
}
export interface PublicRepository {
	create(input: WorkspaceCreate): Promise<PublicWorkspace | null>;
	load(sessionHash: string): Promise<PublicWorkspace | null>;
	cas(sessionHash: string, version: number, patch: WorkspacePatch): Promise<PublicWorkspace | null>;
	due(limit?: number): Promise<PublicWorkspace[]>;
	removeExpired(): Promise<number>;
}

const unavailable = () =>
	new DemoError(503, 'The saved demonstration is temporarily unavailable. Please try again.');
const hash = (value: string) => /^[a-f0-9]{64}$/.test(value);
const timestamp = (value: unknown) =>
	typeof value === 'string' && Number.isFinite(Date.parse(value));

/** Server-only RPC access. The caller supplies private configuration; it is never serialized. */
export class SupabasePublicRepository implements PublicRepository {
	private url: string;
	private serviceKey: string;
	private fetcher: typeof fetch;
	private signal: AbortSignal | undefined;
	constructor(
		config: { url: string; serviceKey: string; allowLoopback?: boolean; signal?: AbortSignal },
		fetcher: typeof fetch = fetch
	) {
		let url: URL;
		try {
			url = new URL(config.url);
		} catch {
			throw unavailable();
		}
		const loopback =
			config.allowLoopback &&
			!process.env.VERCEL &&
			['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
		if (
			(url.protocol !== 'https:' && !(loopback && url.protocol === 'http:')) ||
			url.username ||
			url.password ||
			url.search ||
			url.hash ||
			!config.serviceKey
		)
			throw unavailable();
		this.url = url.toString().replace(/\/$/, '');
		this.serviceKey = config.serviceKey;
		this.fetcher = fetcher;
		this.signal = config.signal;
	}
	private checkCancelled(): void {
		if (this.signal?.aborted)
			throw new DemoError(
				408,
				'This request was interrupted. Refresh the demonstration to check its saved state before trying again.'
			);
	}
	private async rpc(
		name: string,
		args: Record<string, unknown>,
		maximum = 1024 * 1024
	): Promise<unknown> {
		this.checkCancelled();
		const body = JSON.stringify(args);
		if (Buffer.byteLength(body, 'utf8') > MAX_SNAPSHOT_BYTES + 4096)
			throw new DemoError(
				429,
				'This temporary demonstration is full. Reset the sample data to continue.'
			);
		try {
			const result = await withDeadline(async (deadlineSignal) => {
				const signal = this.signal
					? AbortSignal.any([deadlineSignal, this.signal])
					: deadlineSignal;
				this.checkCancelled();
				const response = await this.fetcher(`${this.url}/rest/v1/rpc/${name}`, {
					method: 'POST',
					headers: {
						apikey: this.serviceKey,
						authorization: `Bearer ${this.serviceKey}`,
						'content-type': 'application/json'
					},
					body,
					signal,
					redirect: 'error',
					cache: 'no-store'
				});
				this.checkCancelled();
				if (!response.ok) throw unavailable();
				const bytes = await readBoundedBody(response, maximum, 15_000, signal);
				this.checkCancelled();
				return JSON.parse(new TextDecoder().decode(bytes));
			}, 15_000);
			this.checkCancelled();
			return result;
		} catch {
			this.checkCancelled();
			throw unavailable();
		}
	}
	private workspace(value: unknown): PublicWorkspace | null {
		if (value === null) return null;
		if (!value || typeof value !== 'object' || Array.isArray(value)) throw unavailable();
		const row = value as Record<string, unknown>;
		if (
			typeof row.sessionHash !== 'string' ||
			!hash(row.sessionHash) ||
			typeof row.scopeKey !== 'string' ||
			!hash(row.scopeKey) ||
			!Number.isSafeInteger(row.version) ||
			Number(row.version) < 0 ||
			!timestamp(row.expiresAt) ||
			(row.staffUntil !== null && !timestamp(row.staffUntil)) ||
			(row.nextDueAt !== null && !timestamp(row.nextDueAt)) ||
			!row.state ||
			typeof row.state !== 'object'
		)
			throw unavailable();
		return {
			sessionHash: row.sessionHash,
			scopeKey: row.scopeKey,
			version: Number(row.version),
			state: row.state as EnquirySnapshot,
			expiresAt: String(row.expiresAt),
			staffUntil: row.staffUntil as string | null,
			nextDueAt: row.nextDueAt as string | null
		};
	}
	async create(input: WorkspaceCreate): Promise<PublicWorkspace | null> {
		if (!hash(input.sessionHash) || !hash(input.scopeKey) || !hash(input.admissionKey))
			throw unavailable();
		return this.workspace(
			await this.rpc('enquiry_demo_create', {
				p_session_hash: input.sessionHash,
				p_scope_key: input.scopeKey,
				p_admission_key: input.admissionKey,
				p_state: input.state,
				p_expires_at: input.expiresAt,
				p_staff_until: input.staffUntil,
				p_next_due_at: input.nextDueAt
			})
		);
	}
	async load(sessionHash: string): Promise<PublicWorkspace | null> {
		if (!hash(sessionHash))
			throw new DemoError(410, 'This temporary demonstration has expired. Start a new session.');
		return this.workspace(await this.rpc('enquiry_demo_get', { p_session_hash: sessionHash }));
	}
	async cas(
		sessionHash: string,
		version: number,
		patch: WorkspacePatch
	): Promise<PublicWorkspace | null> {
		if (!hash(sessionHash) || !Number.isSafeInteger(version) || version < 0) throw unavailable();
		return this.workspace(
			await this.rpc('enquiry_demo_cas', {
				p_session_hash: sessionHash,
				p_version: version,
				p_state: patch.state,
				p_staff_until: patch.staffUntil,
				p_next_due_at: patch.nextDueAt
			})
		);
	}
	async due(limit = 20): Promise<PublicWorkspace[]> {
		if (!Number.isInteger(limit) || limit < 1 || limit > 20) throw unavailable();
		const result = await this.rpc('enquiry_demo_due', { p_limit: limit }, 12 * 1024 * 1024);
		if (!Array.isArray(result) || result.length > limit) throw unavailable();
		return result.map((row) => {
			const workspace = this.workspace(row);
			if (!workspace) throw unavailable();
			return workspace;
		});
	}
	async removeExpired(): Promise<number> {
		const result = await this.rpc('enquiry_demo_cleanup', {});
		if (!Number.isSafeInteger(result) || Number(result) < 0) throw unavailable();
		return Number(result);
	}
}
