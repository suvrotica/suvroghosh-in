import { EnquiryStore, DemoError } from './store';
import type { PublicRepository, PublicWorkspace } from './public-repository';

export const WORKSPACE_TTL_MS = 24 * 60 * 60 * 1000;
export const STAFF_TTL_MS = 8 * 60 * 60 * 1000;
export const MAX_CAS_ATTEMPTS = 4;
type Access = { requireStaff?: boolean };
type RunOptions = Access & { staffUntil?: string | null };

/** Local callbacks may be replayed on contention. Never perform external effects inside one. */
export class PublicWorkspaces {
	private repository: PublicRepository;
	private clock: () => number;
	private signal: AbortSignal | undefined;
	constructor(repository: PublicRepository, clock: () => number = Date.now, signal?: AbortSignal) {
		this.repository = repository;
		this.clock = clock;
		this.signal = signal;
	}
	private checkCancelled(): void {
		if (this.signal?.aborted)
			throw new DemoError(
				408,
				'This request was interrupted. Refresh the demonstration to check its saved state before trying again.'
			);
	}
	private checkHash(value: string) {
		if (!/^[a-f0-9]{64}$/.test(value))
			throw new DemoError(410, 'This temporary demonstration has expired. Start a new session.');
	}
	private async workspace(sessionHash: string, access: Access): Promise<PublicWorkspace> {
		this.checkCancelled();
		this.checkHash(sessionHash);
		const workspace = await this.repository.load(sessionHash);
		this.checkCancelled();
		if (
			!workspace ||
			workspace.sessionHash !== sessionHash ||
			Date.parse(workspace.expiresAt) <= this.clock() ||
			!Number.isFinite(Date.parse(workspace.expiresAt))
		)
			throw new DemoError(410, 'This temporary demonstration has expired. Start a new session.');
		if (
			access.requireStaff &&
			(!workspace.staffUntil ||
				Date.parse(workspace.staffUntil) <= this.clock() ||
				!Number.isFinite(Date.parse(workspace.staffUntil)))
		)
			throw new DemoError(403, 'Open your own staff desk before changing an enquiry.');
		return workspace;
	}
	async create(
		sessionHash: string,
		scopeKey: string,
		admissionKey: string
	): Promise<PublicWorkspace> {
		this.checkCancelled();
		this.checkHash(sessionHash);
		this.checkHash(scopeKey);
		this.checkHash(admissionKey);
		const store = new EnquiryStore(':memory:', this.clock);
		try {
			store.seed();
			this.checkCancelled();
			const workspace = await this.repository.create({
				sessionHash,
				scopeKey,
				admissionKey,
				state: store.exportSnapshot(),
				expiresAt: new Date(this.clock() + WORKSPACE_TTL_MS).toISOString(),
				staffUntil: null,
				nextDueAt: store.nextDueAt()
			});
			this.checkCancelled();
			if (!workspace)
				throw new DemoError(429, 'The demonstration is busy. Please try again later.');
			if (workspace.sessionHash !== sessionHash || workspace.scopeKey !== scopeKey)
				throw new DemoError(
					503,
					'The saved demonstration is temporarily unavailable. Please try again.'
				);
			return workspace;
		} finally {
			store.close();
		}
	}
	async read<T>(
		sessionHash: string,
		operation: (store: EnquiryStore, workspace: PublicWorkspace) => T,
		access: Access = {}
	): Promise<{ result: T; workspace: PublicWorkspace }> {
		const workspace = await this.workspace(sessionHash, access);
		const store = new EnquiryStore(':memory:', this.clock);
		try {
			store.importSnapshot(workspace.state);
			this.checkCancelled();
			const result = operation(store, workspace);
			this.checkCancelled();
			return { result, workspace };
		} finally {
			store.close();
		}
	}
	async run<T>(
		sessionHash: string,
		operation: (store: EnquiryStore, workspace: PublicWorkspace) => T,
		options: RunOptions = {}
	): Promise<{ result: T; workspace: PublicWorkspace }> {
		for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt++) {
			this.checkCancelled();
			const workspace = await this.workspace(sessionHash, options);
			const store = new EnquiryStore(':memory:', this.clock);
			try {
				store.importSnapshot(workspace.state);
				this.checkCancelled();
				const result = operation(store, workspace);
				if (result instanceof Promise)
					throw new DemoError(
						500,
						'Demonstration changes must complete locally before they are saved.'
					);
				const staffUntil =
					options.staffUntil !== undefined ? options.staffUntil : workspace.staffUntil;
				if (
					staffUntil !== null &&
					(!Number.isFinite(Date.parse(staffUntil)) ||
						Date.parse(staffUntil) > this.clock() + STAFF_TTL_MS ||
						Date.parse(staffUntil) > Date.parse(workspace.expiresAt))
				)
					throw new DemoError(400, 'Choose a valid temporary staff session.');
				this.checkCancelled();
				const saved = await this.repository.cas(sessionHash, workspace.version, {
					state: store.exportSnapshot(),
					staffUntil,
					nextDueAt: store.nextDueAt()
				});
				this.checkCancelled();
				if (saved) {
					if (saved.sessionHash !== sessionHash || saved.scopeKey !== workspace.scopeKey)
						throw new DemoError(
							503,
							'The saved demonstration is temporarily unavailable. Please try again.'
						);
					return { result, workspace: saved };
				}
			} finally {
				store.close();
			}
		}
		throw new DemoError(409, 'Another change was saved at the same time. Please try again.');
	}
}
