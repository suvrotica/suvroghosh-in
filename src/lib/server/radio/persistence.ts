import { randomUUID } from 'node:crypto';
import { env } from '$env/dynamic/private';
import type { RequestEvent } from '@sveltejs/kit';
import { createLocalAdmission } from '$lib/server/http/local-admission';
import { BodyReadError, readBoundedBody } from '$lib/server/http/body';
import { RADIO_LIMITS, type RadioUser } from '$lib/radio/types';
import { readRadioSessionUser } from './auth';
import { getRadioServerConfig } from './config';
import { createRadioStoreState, endRadioTransmissionForMember } from './store';
import {
	decodeRadioState,
	encodeRadioState,
	pruneRadioState,
	type ExpiredRadioRoom,
	type RadioSnapshot
} from './state-codec';
import {
	currentRadioState,
	rollbackRadioEffects,
	wasRadioRoomClosed,
	withRadioState
} from './state-context';
import { closeRemoteRoomOnSfu, removeRemoteParticipantFromSfu } from './livekit';

export interface RadioStateLease {
	version: number;
	snapshot: unknown;
	watchdogReadyUntilMs?: number;
}
export interface RadioPersistenceBackend {
	acquire(owner: string): Promise<RadioStateLease | null>;
	/** A successful commit atomically releases the owner's lease. */
	commit(owner: string, version: number, snapshot: RadioSnapshot): Promise<boolean>;
	release(owner: string): Promise<void>;
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const persistenceAdmission = createLocalAdmission({
	attempts: 240,
	globalAttempts: 1200,
	windowMs: 60_000,
	concurrency: 32,
	maxKeys: 512,
	perKeyConcurrency: 4
});

/** Every worker loads the committed snapshot under a database-fenced lease. */
export async function runRadioTransaction<T>(
	backend: RadioPersistenceBackend,
	action: () => Promise<T>,
	options: {
		shouldCommit?: (result: T) => boolean;
		waitMs?: number;
		cleanupRooms?: (rooms: ExpiredRadioRoom[]) => Promise<void>;
		mediaEnabled?: boolean;
		maxActionMs?: number;
	} = {}
): Promise<T> {
	const owner = randomUUID();
	const started = Date.now();
	let lease: RadioStateLease | null = null;
	let commitConfirmed = false;
	try {
		do {
			lease = await backend.acquire(owner);
			if (lease) break;
			if (Date.now() - started >= (options.waitMs ?? 4000))
				throw new Error('Radio coordination is busy.');
			await wait(40 + Math.floor(Math.random() * 60));
		} while (!lease);
		const state = decodeRadioState(lease.snapshot);
		return await withRadioState(
			state,
			async () => {
				let timer: ReturnType<typeof setTimeout> | undefined;
				async function cleanExpired(rooms: ExpiredRadioRoom[]) {
					if (!options.cleanupRooms) return;
					await options.cleanupRooms(rooms);
				}
				try {
					const expired = pruneRadioState(state);
					if (expired.length) await cleanExpired(expired);
					const actionBudget = Math.min(
						options.maxActionMs ?? 30_000,
						37_000 - (Date.now() - started)
					);
					if (actionBudget <= 0) throw new Error('Radio transaction exceeded its deadline.');
					const result = await Promise.race([
						action(),
						new Promise<never>((_resolve, reject) => {
							timer = setTimeout(
								() => reject(new Error('Radio transaction deadline exceeded.')),
								actionBudget
							);
						})
					]);
					clearTimeout(timer);
					if (options.shouldCommit && !options.shouldCommit(result)) {
						await rollbackRadioEffects();
						return result;
					}
					const justEnded = pruneRadioState(state);
					if (justEnded.length) await cleanExpired(justEnded);
					if (Date.now() - started > 38_000)
						throw new Error('Radio transaction exceeded its deadline.');
					const committed = await backend.commit(owner, lease!.version, encodeRadioState(state));
					if (!committed) throw new Error('Radio transaction lost its fencing lease.');
					commitConfirmed = true;
					return result;
				} catch (error) {
					await rollbackRadioEffects();
					throw error;
				} finally {
					clearTimeout(timer);
				}
			},
			options.mediaEnabled,
			lease.watchdogReadyUntilMs
		);
	} finally {
		// Release if acquire or commit may have reached the database without an acknowledgement.
		// The owner fence makes this safe even when the database already committed.
		if (!commitConfirmed) await backend.release(owner).catch(() => undefined);
	}
}

export function createPostgresRadioBackend(
	url: string,
	serviceKey: string
): RadioPersistenceBackend {
	const base = new URL(url);
	if (base.protocol !== 'https:') throw new Error('Radio database must use HTTPS.');
	async function rpc(name: string, body: unknown): Promise<unknown> {
		const response = await fetch(new URL(`/rest/v1/rpc/${name}`, base), {
			method: 'POST',
			headers: {
				apikey: serviceKey,
				Authorization: `Bearer ${serviceKey}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(body),
			signal: AbortSignal.timeout(4000),
			cache: 'no-store'
		});
		if (!response.ok) throw new Error('Radio persistence request failed.');
		const text = await response.text();
		if (Buffer.byteLength(text, 'utf8') > 5 * 1024 * 1024)
			throw new Error('Radio persistence response exceeds its limit.');
		return JSON.parse(text);
	}
	return {
		async acquire(owner) {
			const result = (await rpc('comm_link_state_acquire', { p_owner: owner })) as {
				acquired?: boolean;
				version?: number;
				snapshot?: unknown;
				watchdogReadyUntilMs?: number;
			};
			if (result.acquired === false) return null;
			if (result.acquired !== true || !Number.isSafeInteger(result.version))
				throw new Error('Invalid radio persistence lease.');
			return {
				version: result.version!,
				snapshot: result.snapshot,
				watchdogReadyUntilMs: Number.isFinite(result.watchdogReadyUntilMs)
					? result.watchdogReadyUntilMs
					: 0
			};
		},
		async commit(owner, version, snapshot) {
			return (
				(await rpc('comm_link_state_commit', {
					p_owner: owner,
					p_version: version,
					p_snapshot: snapshot
				})) === true
			);
		},
		async release(owner) {
			await rpc('comm_link_state_release', { p_owner: owner });
		}
	};
}

// Explicit loopback-only backend. Production never substitutes it after a database error.
let localSnapshot = encodeRadioState(createRadioStoreState());
let localVersion = 0;
let localOwner: string | null = null;
let localLeaseUntil = 0;
const localBackend: RadioPersistenceBackend = {
	async acquire(owner) {
		if (localOwner && localLeaseUntil > Date.now()) return null;
		localOwner = owner;
		localLeaseUntil = Date.now() + 45_000;
		return { version: localVersion, snapshot: structuredClone(localSnapshot) };
	},
	async commit(owner, version, snapshot) {
		if (localOwner !== owner || localVersion !== version || localLeaseUntil <= Date.now())
			return false;
		localSnapshot = structuredClone(snapshot);
		localVersion += 1;
		localOwner = null;
		return true;
	},
	async release(owner) {
		if (localOwner === owner) localOwner = null;
	}
};

function unavailable(code: string, message: string): Response {
	return Response.json(
		{ ok: false, code, error: message },
		{
			status: 503,
			headers: {
				'Cache-Control': 'private, no-store',
				'X-Robots-Tag': 'noindex, nofollow',
				'Retry-After': '3'
			}
		}
	);
}

export async function expireStaleRoomConnections(roomId: string | undefined): Promise<void> {
	if (!roomId) return;
	const room = currentRadioState().roomsById.get(roomId);
	if (!room) return;
	const now = Date.now();
	const stale = Array.from(room.participants.values()).filter(
		(member) => member.isConnected && now - Date.parse(member.lastSeenAt) > 90_000
	);
	await Promise.all(stale.map((member) => endRadioTransmissionForMember(roomId, member.userId)));
	// At most twelve active media identities per target room. Revoke before freeing
	// a capacity reservation; a provider failure rolls back and keeps the slot held.
	const cutoffs = await Promise.all(
		stale.map((member) =>
			member.mediaTokenIssuedAtMs !== undefined &&
			member.mediaTokenIssuedAtMs >= (member.mediaTokenNotBeforeMs ?? 0)
				? removeRemoteParticipantFromSfu(roomId, member.userId)
				: Promise.resolve(member.mediaTokenNotBeforeMs ?? 0)
		)
	);
	for (let index = 0; index < stale.length; index += 1) {
		const member = stale[index];
		member.isConnected = false;
		member.isMuted = true;
		member.isSpeaking = false;
		member.mediaTokenNotBeforeMs = Math.max(member.mediaTokenNotBeforeMs ?? 0, cutoffs[index]);
		if (room.hostUserId === member.userId && room.hostDisconnectedAtMs === null) {
			room.hostDisconnectedAtMs = now;
		}
		if (room.pttLease.holderUserId === member.userId) {
			room.pttLease = {
				holderUserId: null,
				holderName: null,
				acquiredAtMs: null,
				expiresAtMs: null
			};
		}
	}
}

export async function withRadioPersistence(
	event: RequestEvent,
	action: () => Promise<Response>,
	verifiedOAuthUser?: RadioUser
): Promise<Response> {
	const config = getRadioServerConfig(event.url);
	const path = event.url.pathname;
	const requiresCalls = /^\/api\/radio\/(rooms(?:\/|$)|invitations(?:\/|$)|account$|report$)/.test(
		path
	);
	if (!config.callsEnabled) {
		if (requiresCalls) return unavailable('RADIO_DISABLED', 'Audio rooms are not enabled yet.');
		// Sign-in and the shell remain usable while deployment setup is incomplete.
		// This isolated empty snapshot is discarded and can never authorize a room.
		return withRadioState(createRadioStoreState(), action);
	}
	if (
		path === '/api/radio/auth/google' ||
		path === '/api/radio/auth/signout' ||
		(path === '/api/radio/auth/callback' && !verifiedOAuthUser) ||
		(path === '/api/radio/auth/test-session' && config.loopbackFallbackAllowed)
	) {
		return withRadioState(createRadioStoreState(), action);
	}
	// Cryptographically authenticate before any RPC. Cookie presence alone must
	// never let anonymous requests monopolize the application's serialization lease.
	const signedUser = verifiedOAuthUser ?? (await readRadioSessionUser(event));
	if (!signedUser) {
		if (requiresCalls && path !== '/api/radio/invitations/preview') {
			return Response.json(
				{ ok: false, code: 'UNAUTHENTICATED', error: 'Sign in with Google to access COMM-LINK.' },
				{ status: 401 }
			);
		}
		return withRadioState(createRadioStoreState(), action);
	}
	const admission = persistenceAdmission(event.getClientAddress());
	if (!admission.allowed)
		return Response.json({ ok: false, error: 'Too many requests.' }, { status: 429 });
	try {
		// Reject cross-origin writes and finish bounded input before taking the shared DB lease.
		if (!['GET', 'HEAD', 'OPTIONS'].includes(event.request.method)) {
			const origin = event.request.headers.get('origin');
			const site = event.request.headers.get('sec-fetch-site');
			if (origin !== event.url.origin || (site && site !== 'same-origin' && site !== 'none')) {
				return Response.json(
					{ ok: false, error: 'Same-origin requests are required.' },
					{ status: 403 }
				);
			}
			const original = event.request;
			try {
				const bytes = await readBoundedBody(
					original,
					RADIO_LIMITS.MAX_JSON_BODY_BYTES,
					RADIO_LIMITS.REQUEST_TIMEOUT_MS
				);
				event.request = new Request(original.url, {
					method: original.method,
					headers: original.headers,
					signal: original.signal,
					...(bytes.byteLength ? { body: new Uint8Array(bytes).buffer } : {})
				});
			} catch (error) {
				const status = error instanceof BodyReadError && error.kind === 'too-large' ? 413 : 408;
				return Response.json(
					{
						ok: false,
						error: status === 413 ? 'Request body exceeds 16 KiB.' : 'Request body timed out.'
					},
					{ status }
				);
			}
		}
		const backend = config.loopbackFallbackAllowed
			? localBackend
			: createPostgresRadioBackend(env.SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!);
		return await runRadioTransaction(
			backend,
			async () => {
				await expireStaleRoomConnections(event.params.roomId);
				return action();
			},
			{
				shouldCommit: (response) => response.status < 400,
				mediaEnabled: !config.loopbackFallbackAllowed,
				cleanupRooms: async (rooms) => {
					await Promise.all(
						rooms.map(async (room) => {
							try {
								if (!wasRadioRoomClosed(room.id))
									await closeRemoteRoomOnSfu(room.id, room.issuedParticipantIds);
								currentRadioState().roomsById.delete(room.id);
							} catch {
								// Deny all new access while preserving the identities still needing
								// revocation. A failed old room must not block unrelated callers.
								const retained = currentRadioState().roomsById.get(room.id);
								if (retained) retained.cleanupRetryAtMs = Date.now() + 60_000;
							}
						})
					);
				}
			}
		);
	} catch {
		return unavailable(
			'RADIO_UNAVAILABLE',
			'Audio rooms are temporarily unavailable. Please try again.'
		);
	} finally {
		admission.release?.();
	}
}
