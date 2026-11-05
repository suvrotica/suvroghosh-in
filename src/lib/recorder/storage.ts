import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import {
	createDefaultEditRecipe,
	type ActiveRecordingSessionJournal,
	type RecordedChunkRecord,
	type RecordingMetadata,
	type StorageStatusSummary
} from './types';

const DB_NAME = 'suvro-recorder-db-v1';
const DB_VERSION = 1;
const STORE_RECORDINGS = 'recordings';
const STORE_SESSIONS = 'sessions';
const STORE_CHUNKS = 'chunks';
const STORE_BLOBS = 'blobs';
const OPFS_DIR_NAME = 'suvro-recorder-audio-v1';
const OPFS_INDEX_FILE = '_opfs_index_v1.json';

interface OpfsStorageIndex {
	recordingIds: string[];
	sessionIds: string[];
	chunkKeysByRecording: Record<string, string[]>;
}

// In-memory stores are restricted strictly to headless Node unit test environments
// where neither `window` nor `indexedDB` exists. In a real browser (`typeof window !== 'undefined'`),
// memory stores are NEVER used to satisfy or verify persistence, preventing false "Saved" states
// when browser storage (OPFS / IndexedDB) fails.
const memRecordings = new Map<string, RecordingMetadata>();
const memSessions = new Map<string, ActiveRecordingSessionJournal>();
const memChunks = new Map<string, RecordedChunkRecord>();
const memBlobs = new Map<string, Uint8Array>();

let forceDisableMemoryFallback = false;

export function setStorageTestOptions(options: {
	forceDisableMemoryFallback?: boolean;
	resetMemory?: boolean;
}): void {
	if (typeof options.forceDisableMemoryFallback === 'boolean') {
		forceDisableMemoryFallback = options.forceDisableMemoryFallback;
	}
	if (options.resetMemory) {
		memRecordings.clear();
		memSessions.clear();
		memChunks.clear();
		memBlobs.clear();
		dbPromise = null;
	}
}

export function isMemoryFallbackAllowed(): boolean {
	if (forceDisableMemoryFallback) return false;
	return typeof window === 'undefined' && typeof indexedDB === 'undefined';
}

let dbPromise: Promise<IDBDatabase | null> | null = null;

function hasIndexedDb(): boolean {
	return typeof indexedDB !== 'undefined' && indexedDB !== null;
}

function openDatabase(): Promise<IDBDatabase | null> {
	if (!hasIndexedDb()) return Promise.resolve(null);
	if (dbPromise) return dbPromise;

	dbPromise = new Promise((resolve) => {
		try {
			const req = indexedDB.open(DB_NAME, DB_VERSION);
			req.onupgradeneeded = () => {
				const db = req.result;
				if (!db.objectStoreNames.contains(STORE_RECORDINGS)) {
					const recStore = db.createObjectStore(STORE_RECORDINGS, { keyPath: 'id' });
					recStore.createIndex('createdAt', 'createdAt', { unique: false });
				}
				if (!db.objectStoreNames.contains(STORE_SESSIONS)) {
					db.createObjectStore(STORE_SESSIONS, { keyPath: 'sessionId' });
				}
				if (!db.objectStoreNames.contains(STORE_CHUNKS)) {
					const chunkStore = db.createObjectStore(STORE_CHUNKS, { keyPath: 'key' });
					chunkStore.createIndex('sessionId', 'sessionId', { unique: false });
					chunkStore.createIndex('recordingId', 'recordingId', { unique: false });
				}
				if (!db.objectStoreNames.contains(STORE_BLOBS)) {
					db.createObjectStore(STORE_BLOBS, { keyPath: 'key' });
				}
			};
			req.onsuccess = () => {
				const db = req.result;
				db.onclose = () => {
					dbPromise = null;
				};
				resolve(db);
			};
			req.onerror = () => {
				dbPromise = null;
				resolve(null);
			};
			req.onblocked = () => {
				dbPromise = null;
				resolve(null);
			};
		} catch {
			dbPromise = null;
			resolve(null);
		}
	});

	return dbPromise;
}

async function getOpfsRoot(): Promise<FileSystemDirectoryHandle | null> {
	if (
		typeof navigator === 'undefined' ||
		!navigator.storage ||
		typeof navigator.storage.getDirectory !== 'function'
	) {
		return null;
	}
	try {
		const root = await navigator.storage.getDirectory();
		return await root.getDirectoryHandle(OPFS_DIR_NAME, { create: true });
	} catch {
		return null;
	}
}

export async function computeSha256Hex(data: ArrayBuffer | Uint8Array): Promise<string> {
	const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
	if (typeof crypto !== 'undefined' && crypto.subtle) {
		try {
			const copy = new Uint8Array(bytes.byteLength);
			copy.set(bytes);
			const hashBuf = await crypto.subtle.digest('SHA-256', copy.buffer);
			return Array.from(new Uint8Array(hashBuf))
				.map((b) => b.toString(16).padStart(2, '0'))
				.join('');
		} catch {
			// Fallback to deterministic 64-char digest if crypto.subtle is unavailable
		}
	}
	let h1 = 0xdeadbeef ^ bytes.byteLength;
	let h2 = 0x41c6ce57 ^ bytes.byteLength;
	for (let i = 0; i < bytes.byteLength; i++) {
		const ch = bytes[i];
		h1 = Math.imul(h1 ^ ch, 2654435761);
		h2 = Math.imul(h2 ^ ch, 1597334677);
	}
	h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
	h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
	return (
		(h1 >>> 0).toString(16).padStart(8, '0') +
		(h2 >>> 0).toString(16).padStart(8, '0')
	).repeat(4);
}

async function idbPut<T>(storeName: string, value: T): Promise<void> {
	const db = await openDatabase();
	if (!db) {
		throw new Error(`IndexedDB unavailable when writing to ${storeName}.`);
	}
	await new Promise<void>((resolve, reject) => {
		let settled = false;
		const fail = (err: unknown) => {
			if (settled) return;
			settled = true;
			reject(err instanceof Error ? err : new Error(`IndexedDB write failed in ${storeName}`));
		};
		try {
			const tx = db.transaction(storeName, 'readwrite');
			const store = tx.objectStore(storeName);
			const req = store.put(value);
			req.onerror = () => fail(req.error ?? new Error(`IndexedDB request error in ${storeName}`));
			tx.oncomplete = () => {
				if (settled) return;
				settled = true;
				resolve();
			};
			tx.onerror = () => fail(tx.error ?? new Error(`IndexedDB put failed in ${storeName}`));
			tx.onabort = () => fail(tx.error ?? new Error(`IndexedDB transaction aborted in ${storeName}`));
		} catch (err) {
			fail(err);
		}
	});
}

async function idbGet<T>(storeName: string, key: string): Promise<T | null> {
	const db = await openDatabase();
	if (!db) return null;
	return new Promise<T | null>((resolve) => {
		try {
			const tx = db.transaction(storeName, 'readonly');
			const store = tx.objectStore(storeName);
			const req = store.get(key);
			req.onsuccess = () => resolve((req.result as T) ?? null);
			req.onerror = () => resolve(null);
			tx.onabort = () => resolve(null);
		} catch {
			resolve(null);
		}
	});
}

async function idbGetAll<T>(storeName: string): Promise<T[]> {
	const db = await openDatabase();
	if (!db) return [];
	return new Promise<T[]>((resolve) => {
		try {
			const tx = db.transaction(storeName, 'readonly');
			const store = tx.objectStore(storeName);
			const req = store.getAll();
			req.onsuccess = () => resolve((req.result as T[]) ?? []);
			req.onerror = () => resolve([]);
			tx.onabort = () => resolve([]);
		} catch {
			resolve([]);
		}
	});
}

async function idbDelete(storeName: string, key: string): Promise<void> {
	const db = await openDatabase();
	if (!db) return;
	await new Promise<void>((resolve) => {
		try {
			const tx = db.transaction(storeName, 'readwrite');
			const store = tx.objectStore(storeName);
			store.delete(key);
			tx.oncomplete = () => resolve();
			tx.onerror = () => resolve();
			tx.onabort = () => resolve();
		} catch {
			resolve();
		}
	});
}

async function writeOpfsBytes(key: string, copy: Uint8Array): Promise<boolean> {
	const opfsDir = await getOpfsRoot();
	if (!opfsDir) return false;
	try {
		const fileHandle = await opfsDir.getFileHandle(key, { create: true });
		if (typeof fileHandle.createWritable === 'function') {
			const writable = await fileHandle.createWritable();
			await writable.write(copy.buffer);
			await writable.close();
			return true;
		}
	} catch {
		// Fall through
	}
	return false;
}

async function readOpfsBytes(key: string): Promise<Uint8Array | null> {
	const opfsDir = await getOpfsRoot();
	if (!opfsDir) return null;
	try {
		const fileHandle = await opfsDir.getFileHandle(key, { create: false });
		const file = await fileHandle.getFile();
		const buf = await file.arrayBuffer();
		return new Uint8Array(buf);
	} catch {
		return null;
	}
}

async function deleteOpfsEntry(key: string): Promise<void> {
	const opfsDir = await getOpfsRoot();
	if (!opfsDir) return;
	try {
		await opfsDir.removeEntry(key);
	} catch {
		// Ignore if absent
	}
}

async function writeOpfsJson<T>(key: string, value: T): Promise<boolean> {
	const encoded = strToU8(JSON.stringify(value));
	const ok = await writeOpfsBytes(key, encoded);
	if (!ok) return false;
	const verifyBytes = await readOpfsBytes(key);
	return Boolean(verifyBytes && verifyBytes.byteLength === encoded.byteLength);
}

async function readOpfsJson<T>(key: string): Promise<T | null> {
	const bytes = await readOpfsBytes(key);
	if (!bytes || bytes.byteLength === 0) return null;
	try {
		return JSON.parse(strFromU8(bytes)) as T;
	} catch {
		return null;
	}
}

/**
 * Enumerates file names in the OPFS directory matching `prefix` and `suffix` when the
 * browser's `FileSystemDirectoryHandle` exposes async iteration (`keys`, `entries`, `values`, or `Symbol.asyncIterator`).
 */
async function listOpfsEntryNames(prefix: string, suffix = '.json'): Promise<string[]> {
	const opfsDir = await getOpfsRoot();
	if (!opfsDir) return [];
	const names: string[] = [];
	const dirAny = opfsDir as unknown as {
		keys?: () => AsyncIterable<string>;
		entries?: () => AsyncIterable<[string, FileSystemHandle]>;
		values?: () => AsyncIterable<FileSystemHandle>;
		[Symbol.asyncIterator]?: () => AsyncIterable<[string, FileSystemHandle] | FileSystemHandle>;
	};

	try {
		if (typeof dirAny.keys === 'function') {
			for await (const name of dirAny.keys()) {
				if (typeof name === 'string' && name.startsWith(prefix) && name.endsWith(suffix)) {
					names.push(name);
				}
			}
			return names;
		}
		if (typeof dirAny.entries === 'function') {
			for await (const [name] of dirAny.entries()) {
				if (typeof name === 'string' && name.startsWith(prefix) && name.endsWith(suffix)) {
					names.push(name);
				}
			}
			return names;
		}
		if (typeof dirAny.values === 'function') {
			for await (const handle of dirAny.values()) {
				const name = handle?.name;
				if (typeof name === 'string' && name.startsWith(prefix) && name.endsWith(suffix)) {
					names.push(name);
				}
			}
			return names;
		}
		if (typeof dirAny[Symbol.asyncIterator] === 'function') {
			for await (const item of dirAny[Symbol.asyncIterator]()) {
				const name = Array.isArray(item) ? item[0] : item?.name;
				if (typeof name === 'string' && name.startsWith(prefix) && name.endsWith(suffix)) {
					names.push(name);
				}
			}
		}
	} catch {
		// Ignore directory iteration errors; `_opfs_index_v1.json` provides a direct file-based index
	}
	return names;
}

let opfsIndexChain: Promise<void> = Promise.resolve();

async function readOpfsIndex(): Promise<OpfsStorageIndex> {
	const existing = await readOpfsJson<OpfsStorageIndex>(OPFS_INDEX_FILE);
	return {
		recordingIds: Array.isArray(existing?.recordingIds) ? existing.recordingIds : [],
		sessionIds: Array.isArray(existing?.sessionIds) ? existing.sessionIds : [],
		chunkKeysByRecording:
			existing?.chunkKeysByRecording && typeof existing.chunkKeysByRecording === 'object'
				? existing.chunkKeysByRecording
				: {}
	};
}

async function updateOpfsIndex(
	mutator: (index: OpfsStorageIndex) => void
): Promise<void> {
	const next = opfsIndexChain.then(async () => {
		const opfsDir = await getOpfsRoot();
		if (!opfsDir) return;
		const index = await readOpfsIndex();
		mutator(index);
		await writeOpfsJson(OPFS_INDEX_FILE, index);
	});
	opfsIndexChain = next.catch(() => {});
	await next;
}

/**
 * Reads a binary file strictly from the specified durable backend (`opfs` or `indexeddb`),
 * never from in-memory maps.
 */
async function readBinaryFileFromDurableBackend(
	key: string,
	backend: 'opfs' | 'indexeddb'
): Promise<Uint8Array | null> {
	if (backend === 'opfs') {
		return readOpfsBytes(key);
	}
	const record = await idbGet<{ key: string; bytes: Uint8Array | ArrayBuffer }>(STORE_BLOBS, key);
	if (record?.bytes) {
		return record.bytes instanceof Uint8Array
			? new Uint8Array(record.bytes)
			: new Uint8Array(record.bytes);
	}
	return null;
}

/**
 * Writes a binary file to durable browser storage (OPFS first, then IndexedDB fallback)
 * and verifies that the bytes can be read back directly from that durable backend.
 * Throws if neither durable backend can persist and verify the data in a browser.
 */
async function writeBinaryFile(
	key: string,
	bytes: Uint8Array
): Promise<'opfs' | 'indexeddb'> {
	const copy = new Uint8Array(bytes.byteLength);
	copy.set(bytes);

	// 1. Try OPFS and verify durable readback from OPFS
	if (await writeOpfsBytes(key, copy)) {
		const opfsReadback = await readBinaryFileFromDurableBackend(key, 'opfs');
		if (opfsReadback && opfsReadback.byteLength === copy.byteLength) {
			return 'opfs';
		}
	}

	// 2. Try IndexedDB blob store and verify durable readback from IndexedDB
	try {
		await idbPut(STORE_BLOBS, { key, bytes: copy });
		const idbReadback = await readBinaryFileFromDurableBackend(key, 'indexeddb');
		if (idbReadback && idbReadback.byteLength === copy.byteLength) {
			return 'indexeddb';
		}
	} catch {
		// Fall through to check if headless test memory fallback is allowed
	}

	// 3. Only allow in-memory storage in headless Node unit tests
	if (isMemoryFallbackAllowed()) {
		memBlobs.set(key, copy);
		return 'indexeddb';
	}

	throw new Error(
		'Browser storage failed: unable to persist audio data to OPFS or IndexedDB. Free up device space or check browser site storage permissions.'
	);
}

async function readBinaryFile(key: string): Promise<Uint8Array | null> {
	const fromOpfs = await readOpfsBytes(key);
	if (fromOpfs) return fromOpfs;

	const fromIdb = await readBinaryFileFromDurableBackend(key, 'indexeddb');
	if (fromIdb) return fromIdb;

	if (isMemoryFallbackAllowed()) {
		const mem = memBlobs.get(key);
		return mem ? new Uint8Array(mem) : null;
	}
	return null;
}

async function deleteBinaryFile(key: string): Promise<void> {
	memBlobs.delete(key);
	await deleteOpfsEntry(key);
	await idbDelete(STORE_BLOBS, key);
}

async function persistMetadataDurably(meta: RecordingMetadata): Promise<void> {
	let idbSaved = false;
	try {
		await idbPut(STORE_RECORDINGS, meta);
		const readback = await idbGet<RecordingMetadata>(STORE_RECORDINGS, meta.id);
		if (readback && readback.id === meta.id) {
			idbSaved = true;
		}
	} catch {
		idbSaved = false;
	}

	const opfsSaved = await writeOpfsJson(`meta_${meta.id}.json`, meta);
	if (opfsSaved) {
		await updateOpfsIndex((index) => {
			if (!index.recordingIds.includes(meta.id)) {
				index.recordingIds.push(meta.id);
			}
		});
	}

	if (idbSaved || opfsSaved) {
		return;
	}

	if (isMemoryFallbackAllowed()) {
		memRecordings.set(meta.id, meta);
		return;
	}

	throw new Error(
		'Browser storage failed: unable to persist recording metadata to IndexedDB or OPFS.'
	);
}

async function readMetadataDurably(recordingId: string): Promise<RecordingMetadata | null> {
	const fromIdb = await idbGet<RecordingMetadata>(STORE_RECORDINGS, recordingId);
	if (fromIdb) return fromIdb;

	const fromOpfs = await readOpfsJson<RecordingMetadata>(`meta_${recordingId}.json`);
	if (fromOpfs) return fromOpfs;

	if (isMemoryFallbackAllowed()) {
		return memRecordings.get(recordingId) ?? null;
	}
	return null;
}

/**
 * Checks storage quota, OPFS availability, and persistent storage status.
 */
export async function getStorageStatus(): Promise<StorageStatusSummary> {
	const opfsDir = await getOpfsRoot();
	const backend: 'opfs' | 'indexeddb' = opfsDir ? 'opfs' : 'indexeddb';
	let usedBytes = 0;
	let quotaBytes = 512 * 1024 * 1024; // Conservative 512 MB default estimate if API absent
	let persisted = false;

	if (typeof navigator !== 'undefined' && navigator.storage) {
		try {
			if (typeof navigator.storage.estimate === 'function') {
				const est = await navigator.storage.estimate();
				usedBytes = est.usage ?? 0;
				quotaBytes = est.quota ?? quotaBytes;
			}
			if (typeof navigator.storage.persisted === 'function') {
				persisted = await navigator.storage.persisted();
			}
		} catch {
			// Ignore estimation errors
		}
	}

	if (usedBytes === 0 && isMemoryFallbackAllowed()) {
		for (const blob of memBlobs.values()) {
			usedBytes += blob.byteLength;
		}
	}

	const usageRatio = quotaBytes > 0 ? Math.min(1, usedBytes / quotaBytes) : 0;
	const remainingBytes = Math.max(0, quotaBytes - usedBytes);

	return {
		backend,
		persisted,
		usedBytes,
		quotaBytes,
		usageRatio,
		isLowQuota: remainingBytes < 25 * 1024 * 1024 || usageRatio > 0.9,
		isCriticalQuota: remainingBytes < 5 * 1024 * 1024 || usageRatio > 0.98
	};
}

/**
 * Requests browser persistent storage permission when saving important recordings.
 */
export async function requestPersistentStorage(): Promise<boolean> {
	if (
		typeof navigator !== 'undefined' &&
		navigator.storage &&
		typeof navigator.storage.persist === 'function'
	) {
		try {
			return await navigator.storage.persist();
		} catch {
			return false;
		}
	}
	return false;
}

/**
 * Creates or updates an active recording session journal in durable storage.
 */
export async function saveSessionJournal(
	journal: ActiveRecordingSessionJournal
): Promise<void> {
	let idbOk = false;
	try {
		await idbPut(STORE_SESSIONS, journal);
		idbOk = true;
	} catch {
		idbOk = false;
	}
	const opfsOk = await writeOpfsJson(`session_${journal.sessionId}.json`, journal);
	if (opfsOk) {
		await updateOpfsIndex((index) => {
			if (!index.sessionIds.includes(journal.sessionId)) {
				index.sessionIds.push(journal.sessionId);
			}
		});
	}
	if (idbOk || opfsOk) return;

	if (isMemoryFallbackAllowed()) {
		memSessions.set(journal.sessionId, { ...journal, gapEvents: [...journal.gapEvents] });
		return;
	}

	throw new Error('Browser storage failed: unable to persist active recording session journal.');
}

export async function getSessionJournal(
	sessionId: string
): Promise<ActiveRecordingSessionJournal | null> {
	const fromIdb = await idbGet<ActiveRecordingSessionJournal>(STORE_SESSIONS, sessionId);
	if (fromIdb) return fromIdb;

	const fromOpfs = await readOpfsJson<ActiveRecordingSessionJournal>(`session_${sessionId}.json`);
	if (fromOpfs) return fromOpfs;

	if (isMemoryFallbackAllowed()) {
		return memSessions.get(sessionId) ?? null;
	}
	return null;
}

export async function deleteSessionJournal(sessionId: string): Promise<void> {
	memSessions.delete(sessionId);
	await deleteOpfsEntry(`session_${sessionId}.json`);
	await updateOpfsIndex((index) => {
		index.sessionIds = index.sessionIds.filter((id) => id !== sessionId);
	});
	await idbDelete(STORE_SESSIONS, sessionId);
}

/**
 * Incrementally persists an ordered recording chunk and marks it `committed: true`
 * only after both the binary payload and chunk metadata are durably flushed.
 */
export async function writeRecordingChunk(options: {
	sessionId: string;
	recordingId: string;
	index: number;
	bytes: Uint8Array;
	mimeType: string;
	capturedDurationMs: number;
	timestampMs?: number;
}): Promise<RecordedChunkRecord> {
	const status = await getStorageStatus();
	if (status.isCriticalQuota) {
		throw new Error(
			'Device storage is full. Please export or delete old recordings in the Library to free up space.'
		);
	}

	const key = `chunk_${options.recordingId}_${String(options.index).padStart(6, '0')}`;
	const sha256 = await computeSha256Hex(options.bytes);

	// Durable binary write + readback verification
	await writeBinaryFile(key, options.bytes);

	const record: RecordedChunkRecord = {
		key,
		sessionId: options.sessionId,
		recordingId: options.recordingId,
		index: options.index,
		timestampMs: options.timestampMs ?? Date.now(),
		capturedDurationMs: options.capturedDurationMs,
		byteLength: options.bytes.byteLength,
		mimeType: options.mimeType,
		sha256,
		committed: true,
		bytes: new Uint8Array(options.bytes)
	};

	let chunkMetaSaved = false;
	try {
		await idbPut(STORE_CHUNKS, {
			...record,
			bytes: record.bytes
		});
		chunkMetaSaved = true;
	} catch {
		chunkMetaSaved = false;
	}

	const opfsMetaSaved = await writeOpfsJson(`chunkmeta_${key}.json`, {
		...record,
		bytes: undefined
	});
	if (opfsMetaSaved) {
		await updateOpfsIndex((index) => {
			const existing = index.chunkKeysByRecording[options.recordingId] ?? [];
			if (!existing.includes(key)) {
				index.chunkKeysByRecording[options.recordingId] = [...existing, key];
			}
		});
	}

	if (!chunkMetaSaved && !opfsMetaSaved) {
		if (isMemoryFallbackAllowed()) {
			memChunks.set(key, record);
		} else {
			throw new Error('Browser storage failed while committing incremental audio chunk.');
		}
	}

	return record;
}

export async function listChunksForRecording(
	recordingId: string
): Promise<RecordedChunkRecord[]> {
	const allIdb = await idbGetAll<RecordedChunkRecord>(STORE_CHUNKS);
	const byKey = new Map<string, RecordedChunkRecord>();
	for (const c of allIdb) {
		if (c.recordingId === recordingId) byKey.set(c.key, c);
	}

	// Discover chunks persisted in OPFS (via index, directory enumeration, and sequential index probe)
	const opfsDir = await getOpfsRoot();
	if (opfsDir) {
		const candidateKeys = new Set<string>();
		const index = await readOpfsIndex();
		for (const k of index.chunkKeysByRecording[recordingId] ?? []) {
			candidateKeys.add(k);
		}
		const dirChunkFiles = await listOpfsEntryNames(`chunkmeta_chunk_${recordingId}_`, '.json');
		for (const fileName of dirChunkFiles) {
			const key = fileName.slice('chunkmeta_'.length, -'.json'.length);
			if (key) candidateKeys.add(key);
		}

		for (const key of candidateKeys) {
			if (byKey.has(key)) continue;
			const rec = await readOpfsJson<RecordedChunkRecord>(`chunkmeta_${key}.json`);
			if (rec && rec.recordingId === recordingId) {
				byKey.set(rec.key, rec);
			}
		}

		// Sequential probe fallback (`chunk_<recordingId>_000000`, `000001`, ...) in case
		// a test harness or browser provides OPFS file read/write without directory iteration
		for (let idx = 0; idx < 4096; idx++) {
			const seqKey = `chunk_${recordingId}_${String(idx).padStart(6, '0')}`;
			if (byKey.has(seqKey)) continue;
			const rec = await readOpfsJson<RecordedChunkRecord>(`chunkmeta_${seqKey}.json`);
			if (!rec) break;
			if (rec.recordingId === recordingId) {
				byKey.set(rec.key, rec);
			}
		}
	}

	if (isMemoryFallbackAllowed()) {
		for (const c of memChunks.values()) {
			if (c.recordingId === recordingId && !byKey.has(c.key)) {
				byKey.set(c.key, c);
			}
		}
	}
	return Array.from(byKey.values()).sort((a, b) => a.index - b.index);
}

/**
 * Commits a finished recording:
 * 1. Writes the immutable original audio file (`orig_<recordingId>.bin`) to durable storage.
 * 2. Reads the bytes back directly from that durable backend (never from memory) and verifies byte length + SHA-256.
 * 3. Writes the PCM Float32 channel snapshot (`pcm_<recordingId>.bin`).
 * 4. Persists and verifies the recording metadata in durable storage (`STORE_RECORDINGS` / OPFS) before returning `status: 'saved'`.
 */
export async function commitCompletedRecording(options: {
	metadata: Omit<RecordingMetadata, 'status' | 'originalSha256' | 'storageBackend'>;
	originalBytes: Uint8Array;
	pcmChannels?: Float32Array[];
	sessionId?: string;
}): Promise<RecordingMetadata> {
	const originalKey = `orig_${options.metadata.id}.bin`;
	const backend = await writeBinaryFile(originalKey, options.originalBytes);
	const originalSha256 = await computeSha256Hex(options.originalBytes);

	// Verify readback directly from durable storage (bypassing in-memory maps in browsers)
	const readback = isMemoryFallbackAllowed()
		? await readBinaryFile(originalKey)
		: await readBinaryFileFromDurableBackend(originalKey, backend);

	if (!readback || readback.byteLength !== options.originalBytes.byteLength) {
		throw new Error('Failed to verify committed audio data on durable browser storage.');
	}
	const readbackSha256 = await computeSha256Hex(readback);
	if (readbackSha256 !== originalSha256) {
		throw new Error('Committed audio data checksum mismatch on durable browser storage.');
	}

	if (options.pcmChannels && options.pcmChannels.length > 0) {
		await saveDecodedPcmSnapshot(
			options.metadata.id,
			options.pcmChannels,
			options.metadata.sampleRate
		);
	}

	const committedMeta: RecordingMetadata = {
		...options.metadata,
		status: 'saved',
		originalByteLength: options.originalBytes.byteLength,
		originalSha256,
		storageBackend: backend
	};

	await persistMetadataDurably(committedMeta);

	const verifiedMeta = await readMetadataDurably(committedMeta.id);
	if (!verifiedMeta || verifiedMeta.status !== 'saved') {
		throw new Error('Failed to verify recording metadata in durable browser storage.');
	}

	if (options.sessionId) {
		await deleteSessionJournal(options.sessionId);
	}

	void requestPersistentStorage();
	return verifiedMeta;
}

/**
 * Stores decoded Float32 PCM channels alongside the immutable original container so editing,
 * waveform zooming, and DSP enhancement work immediately even for formats a browser cannot re-decode offline.
 */
export async function saveDecodedPcmSnapshot(
	recordingId: string,
	channelData: Float32Array[],
	sampleRate: number
): Promise<void> {
	const numChannels = channelData.length;
	const numSamples = channelData[0]?.length ?? 0;
	const buf = new ArrayBuffer(16 + numChannels * numSamples * 4);
	const view = new DataView(buf);
	view.setUint32(0, 0x50434d31, true); // 'PCM1'
	view.setUint32(4, sampleRate, true);
	view.setUint32(8, numChannels, true);
	view.setUint32(12, numSamples, true);

	const floats = new Float32Array(buf, 16);
	for (let c = 0; c < numChannels; c++) {
		floats.set(channelData[c], c * numSamples);
	}

	await writeBinaryFile(`pcm_${recordingId}.bin`, new Uint8Array(buf));
}

export async function loadDecodedPcmSnapshot(
	recordingId: string
): Promise<{ channelData: Float32Array[]; sampleRate: number } | null> {
	const bytes = await readBinaryFile(`pcm_${recordingId}.bin`);
	if (!bytes || bytes.byteLength < 16) return null;
	const aligned = new ArrayBuffer(bytes.byteLength);
	new Uint8Array(aligned).set(bytes);
	const view = new DataView(aligned);
	if (view.getUint32(0, true) !== 0x50434d31) return null;

	const sampleRate = view.getUint32(4, true);
	const numChannels = view.getUint32(8, true);
	const numSamples = view.getUint32(12, true);
	if (16 + numChannels * numSamples * 4 > aligned.byteLength) return null;

	const floats = new Float32Array(aligned, 16);
	const channelData: Float32Array[] = [];
	for (let c = 0; c < numChannels; c++) {
		channelData.push(new Float32Array(floats.subarray(c * numSamples, (c + 1) * numSamples)));
	}
	return { channelData, sampleRate };
}

export async function readOriginalRecordingBytes(
	recordingId: string
): Promise<Uint8Array | null> {
	return readBinaryFile(`orig_${recordingId}.bin`);
}

/**
 * Verifies that the stored immutable original recording is durably persisted and matches its initial SHA-256 hash.
 * In browsers, this reads strictly from durable storage (`opfs` or `indexeddb`), never from memory.
 */
export async function verifyOriginalIntegrity(recordingId: string): Promise<{
	valid: boolean;
	expectedSha256: string;
	actualSha256: string;
	byteLength: number;
}> {
	const meta = await readMetadataDurably(recordingId);
	if (!meta || meta.status !== 'saved') {
		return { valid: false, expectedSha256: '', actualSha256: '', byteLength: 0 };
	}
	const bytes = isMemoryFallbackAllowed()
		? await readOriginalRecordingBytes(recordingId)
		: ((await readBinaryFileFromDurableBackend(`orig_${recordingId}.bin`, meta.storageBackend)) ??
			(await readOpfsBytes(`orig_${recordingId}.bin`)) ??
			(await readBinaryFileFromDurableBackend(`orig_${recordingId}.bin`, 'indexeddb')));
	if (!bytes) {
		return {
			valid: false,
			expectedSha256: meta.originalSha256,
			actualSha256: '',
			byteLength: 0
		};
	}
	const actualSha256 = await computeSha256Hex(bytes);
	return {
		valid: actualSha256 === meta.originalSha256 && bytes.byteLength === meta.originalByteLength,
		expectedSha256: meta.originalSha256,
		actualSha256,
		byteLength: bytes.byteLength
	};
}

export async function getRecordingMetadata(
	recordingId: string
): Promise<RecordingMetadata | null> {
	return readMetadataDurably(recordingId);
}

export async function updateRecordingMetadata(
	updated: RecordingMetadata
): Promise<RecordingMetadata> {
	if (updated.status === 'error') {
		// Unsaved in-memory rescue recording: do not mark as saved or mask storage failure
		return {
			...updated,
			updatedAt: Date.now()
		};
	}
	const next: RecordingMetadata = {
		...updated,
		updatedAt: Date.now()
	};
	await persistMetadataDurably(next);
	return next;
}

export async function listAllRecordings(options?: {
	includeDeleted?: boolean;
}): Promise<RecordingMetadata[]> {
	const idbItems = await idbGetAll<RecordingMetadata>(STORE_RECORDINGS);
	const byId = new Map<string, RecordingMetadata>();
	for (const item of idbItems) byId.set(item.id, item);

	// Also enumerate recordings persisted in OPFS when IndexedDB is unavailable or out of sync
	const opfsDir = await getOpfsRoot();
	if (opfsDir) {
		const candidateIds = new Set<string>();
		const index = await readOpfsIndex();
		for (const id of index.recordingIds) {
			candidateIds.add(id);
		}
		const dirMetaFiles = await listOpfsEntryNames('meta_', '.json');
		for (const fileName of dirMetaFiles) {
			const id = fileName.slice('meta_'.length, -'.json'.length);
			if (id) candidateIds.add(id);
		}
		for (const id of candidateIds) {
			const opfsMeta = await readOpfsJson<RecordingMetadata>(`meta_${id}.json`);
			if (!opfsMeta) continue;
			const existing = byId.get(opfsMeta.id);
			if (!existing || opfsMeta.updatedAt >= existing.updatedAt) {
				byId.set(opfsMeta.id, opfsMeta);
			}
		}
	}

	if (isMemoryFallbackAllowed()) {
		for (const item of memRecordings.values()) {
			if (!byId.has(item.id)) byId.set(item.id, item);
		}
	}
	const all = Array.from(byId.values());
	const filtered = options?.includeDeleted
		? all
		: all.filter((item) => item.deletedAt === null);
	return filtered.sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Soft-deletes a recording so the user can undo deletion cleanly.
 */
export async function softDeleteRecording(
	recordingId: string
): Promise<RecordingMetadata | null> {
	const meta = await getRecordingMetadata(recordingId);
	if (!meta) return null;
	return updateRecordingMetadata({
		...meta,
		deletedAt: Date.now()
	});
}

/**
 * Restores a soft-deleted recording.
 */
export async function restoreDeletedRecording(
	recordingId: string
): Promise<RecordingMetadata | null> {
	const meta = await getRecordingMetadata(recordingId);
	if (!meta) return null;
	return updateRecordingMetadata({
		...meta,
		deletedAt: null
	});
}

/**
 * Permanently deletes a recording, its original audio bytes, its PCM snapshot, and any chunks.
 */
export async function permanentlyDeleteRecording(recordingId: string): Promise<void> {
	const chunks = await listChunksForRecording(recordingId);

	memRecordings.delete(recordingId);
	await deleteOpfsEntry(`meta_${recordingId}.json`);
	await updateOpfsIndex((index) => {
		index.recordingIds = index.recordingIds.filter((id) => id !== recordingId);
		delete index.chunkKeysByRecording[recordingId];
	});
	await idbDelete(STORE_RECORDINGS, recordingId);
	await deleteBinaryFile(`orig_${recordingId}.bin`);
	await deleteBinaryFile(`pcm_${recordingId}.bin`);

	for (const chunk of chunks) {
		memChunks.delete(chunk.key);
		await deleteOpfsEntry(`chunkmeta_${chunk.key}.json`);
		await idbDelete(STORE_CHUNKS, chunk.key);
		await deleteBinaryFile(chunk.key);
	}
}

/**
 * Inspects the session journal for interrupted or crashed recording sessions and determines
 * the longest contiguous prefix of committed chunks that can be recovered safely.
 */
export async function findRecoverableSessions(
	activeTabId?: string
): Promise<
	{
		journal: ActiveRecordingSessionJournal;
		contiguousChunks: RecordedChunkRecord[];
		recoverableDurationSec: number;
		droppedTrailingChunks: number;
	}[]
> {
	const idbJournals = await idbGetAll<ActiveRecordingSessionJournal>(STORE_SESSIONS);
	const byId = new Map<string, ActiveRecordingSessionJournal>();
	for (const j of idbJournals) byId.set(j.sessionId, j);

	// Also enumerate session journals persisted in OPFS when IndexedDB is unavailable
	const opfsDir = await getOpfsRoot();
	if (opfsDir) {
		const candidateSessionIds = new Set<string>();
		const index = await readOpfsIndex();
		for (const sid of index.sessionIds) {
			candidateSessionIds.add(sid);
		}
		const dirSessionFiles = await listOpfsEntryNames('session_', '.json');
		for (const fileName of dirSessionFiles) {
			const sid = fileName.slice('session_'.length, -'.json'.length);
			if (sid) candidateSessionIds.add(sid);
		}
		for (const sid of candidateSessionIds) {
			const opfsJournal = await readOpfsJson<ActiveRecordingSessionJournal>(`session_${sid}.json`);
			if (!opfsJournal) continue;
			const existing = byId.get(opfsJournal.sessionId);
			if (!existing || opfsJournal.lastHeartbeatAt >= existing.lastHeartbeatAt) {
				byId.set(opfsJournal.sessionId, opfsJournal);
			}
		}
	}

	if (isMemoryFallbackAllowed()) {
		for (const j of memSessions.values()) {
			if (!byId.has(j.sessionId)) byId.set(j.sessionId, j);
		}
	}

	const results: {
		journal: ActiveRecordingSessionJournal;
		contiguousChunks: RecordedChunkRecord[];
		recoverableDurationSec: number;
		droppedTrailingChunks: number;
	}[] = [];

	for (const journal of byId.values()) {
		const isFreshOtherTab =
			activeTabId &&
			journal.tabId !== activeTabId &&
			Date.now() - journal.lastHeartbeatAt < 4000 &&
			journal.status === 'recording';
		if (isFreshOtherTab) continue;

		const chunks = await listChunksForRecording(journal.recordingId);
		if (chunks.length === 0) continue;

		const contiguous: RecordedChunkRecord[] = [];
		let dropped = 0;
		for (let i = 0; i < chunks.length; i++) {
			const c = chunks[i];
			if (c.index === contiguous.length && c.committed && c.byteLength > 0) {
				contiguous.push(c);
			} else {
				dropped = chunks.length - i;
				break;
			}
		}

		if (contiguous.length > 0) {
			const totalMs = contiguous.reduce((acc, c) => acc + c.capturedDurationMs, 0);
			results.push({
				journal,
				contiguousChunks: contiguous,
				recoverableDurationSec: Number((totalMs / 1000).toFixed(2)),
				droppedTrailingChunks: dropped
			});
		}
	}

	return results;
}

/**
 * Recovers an interrupted session from its committed contiguous chunks and commits a playable
 * recovered recording with clear recovery diagnostics.
 */
export async function recoverInterruptedSession(
	sessionId: string
): Promise<RecordingMetadata | null> {
	const journal = await getSessionJournal(sessionId);
	if (!journal) return null;

	const chunks = await listChunksForRecording(journal.recordingId);
	const contiguous: RecordedChunkRecord[] = [];
	let dropped = 0;

	for (let i = 0; i < chunks.length; i++) {
		const c = chunks[i];
		if (c.index === contiguous.length && c.committed) {
			const rawBytes = (await readBinaryFile(c.key)) ?? c.bytes;
			if (rawBytes && rawBytes.byteLength > 0) {
				const actualSha = await computeSha256Hex(rawBytes);
				if (actualSha === c.sha256) {
					contiguous.push({ ...c, bytes: rawBytes });
					continue;
				}
			}
		}
		dropped = chunks.length - i;
		break;
	}

	if (contiguous.length === 0) {
		await deleteSessionJournal(sessionId);
		return null;
	}

	const totalBytes = contiguous.reduce((sum, c) => sum + (c.bytes?.byteLength ?? 0), 0);
	const merged = new Uint8Array(totalBytes);
	let offset = 0;
	for (const c of contiguous) {
		if (c.bytes) {
			merged.set(c.bytes, offset);
			offset += c.bytes.byteLength;
		}
	}

	const recoveredDurationSec = Number(
		(contiguous.reduce((sum, c) => sum + c.capturedDurationMs, 0) / 1000).toFixed(2)
	);
	const pcmSnapshot = await loadDecodedPcmSnapshot(journal.recordingId);

	const recoveryNote =
		dropped > 0
			? `Recovered ${contiguous.length} committed segments (${recoveredDurationSec}s) up to the last verified boundary; ${dropped} incomplete trailing segment(s) after interruption were discarded.`
			: `Recovered all ${contiguous.length} committed segments (${recoveredDurationSec}s) after unexpected session interruption.`;

	const meta = await commitCompletedRecording({
		metadata: {
			id: journal.recordingId,
			title: `${journal.title} (Recovered)`,
			notes: recoveryNote,
			tags: ['recovered', journal.mode],
			favourite: false,
			mode: journal.mode,
			createdAt: journal.startedAt,
			updatedAt: Date.now(),
			deletedAt: null,
			durationSec: recoveredDurationSec,
			capturedMs: recoveredDurationSec * 1000,
			pausedMs: journal.pausedDurationMs,
			interruptionCount: journal.interruptionCount + 1,
			interruptionGapMs: journal.interruptionGapMs,
			sampleRate: journal.sampleRate,
			channels: journal.channels,
			originalMimeType: journal.mimeType,
			originalExtension: journal.mimeType.includes('wav')
				? 'wav'
				: journal.mimeType.includes('mp4')
					? 'mp4'
					: 'webm',
			originalByteLength: merged.byteLength,
			chunkCount: contiguous.length,
			committedChunkCount: contiguous.length,
			recoveredFromCrash: true,
			lastRecoverableSec: recoveredDurationSec,
			bookmarks: [],
			waveform: {
				bucketCount: 64,
				peaks: new Array(64).fill(0.35),
				rms: new Array(64).fill(0.18),
				peakDbfs: -6,
				rmsDbfs: -18
			},
			analysis: null,
			recipe: createDefaultEditRecipe(recoveredDurationSec, journal.mode)
		},
		originalBytes: merged,
		pcmChannels: pcmSnapshot?.channelData,
		sessionId: journal.sessionId
	});

	return meta;
}

/**
 * Exports a recording project (immutable original + PCM snapshot + metadata + non-destructive edit recipe)
 * as a portable `.zip` archive so users can back up or move a project between devices.
 */
export async function exportProjectBackupZip(recordingId: string): Promise<{
	zipBytes: Uint8Array;
	filename: string;
}> {
	const meta = await getRecordingMetadata(recordingId);
	if (!meta) throw new Error('Recording not found for backup.');
	const origBytes = await readOriginalRecordingBytes(recordingId);
	if (!origBytes) throw new Error('Original audio bytes missing for backup.');
	const pcmBytes = await readBinaryFile(`pcm_${recordingId}.bin`);

	const files: Record<string, Uint8Array> = {
		'project-metadata.json': strToU8(JSON.stringify(meta, null, 2)),
		[`original.${meta.originalExtension || 'bin'}`]: origBytes
	};
	if (pcmBytes) {
		files['pcm-snapshot.bin'] = pcmBytes;
	}

	const zipBytes = zipSync(files, { level: 6 });
	const cleanName =
		meta.title
			.trim()
			.toLowerCase()
			.replace(/[^a-z0-9_-]+/g, '-') || 'recording';
	return {
		zipBytes,
		filename: `${cleanName}-project-backup.zip`
	};
}

/**
 * Imports a `.zip` project backup exported by Recorder and restores its immutable original and recipe.
 */
export async function importProjectBackupZip(
	zipBuffer: ArrayBuffer | Uint8Array
): Promise<RecordingMetadata> {
	const bytes = zipBuffer instanceof Uint8Array ? zipBuffer : new Uint8Array(zipBuffer);
	const unzipped = unzipSync(bytes);
	const metaEntry = unzipped['project-metadata.json'];
	if (!metaEntry) {
		throw new Error('Invalid project backup ZIP: missing project-metadata.json.');
	}

	const parsedMeta = JSON.parse(strFromU8(metaEntry)) as RecordingMetadata;
	const origEntryKey = Object.keys(unzipped).find((k) => k.startsWith('original.'));
	if (!origEntryKey) {
		throw new Error('Invalid project backup ZIP: missing original audio file.');
	}

	const origBytes = unzipped[origEntryKey];
	const newId = `rec_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

	const pcmEntry = unzipped['pcm-snapshot.bin'];
	if (pcmEntry) {
		await writeBinaryFile(`pcm_${newId}.bin`, pcmEntry);
	}

	return commitCompletedRecording({
		metadata: {
			...parsedMeta,
			id: newId,
			title: `${parsedMeta.title} (Restored)`,
			updatedAt: Date.now(),
			deletedAt: null
		},
		originalBytes: origBytes
	});
}
