import { browser } from '$app/environment';
import type { NoteDocument } from './model';

export type LocalDraftRecord = {
	noteId: string;
	document: NoteDocument;
	serverRevision: number;
	clientSequence: number;
	idempotencyKey: string;
	dirty: boolean;
	updatedAt: string;
};

type LocalHistoryRecord = {
	id?: number;
	noteId: string;
	document: NoteDocument;
	clientSequence: number;
	createdAt: string;
};

export type LocalOutboxRecord = {
	idempotencyKey: string;
	noteId: string;
	document: NoteDocument;
	expectedRevision: number;
	clientSequence: number;
	createdAt: string;
};

type DraftDatabase = import('dexie').Dexie & {
	drafts: import('dexie').Table<LocalDraftRecord, string>;
	history: import('dexie').Table<LocalHistoryRecord, number>;
	outbox: import('dexie').Table<LocalOutboxRecord, string>;
};

let databasePromise: Promise<DraftDatabase | null> | undefined;

async function getDatabase() {
	if (!browser || !('indexedDB' in globalThis)) return null;
	if (!databasePromise) {
		databasePromise = import('dexie').then(({ Dexie }) => {
			const database = new Dexie('suvroghosh-ink-notes') as DraftDatabase;
			database.version(1).stores({
				drafts: 'noteId, dirty, updatedAt',
				history: '++id, noteId, createdAt'
			});
			database.version(2).stores({
				drafts: 'noteId, dirty, updatedAt',
				history: '++id, noteId, createdAt',
				outbox: 'idempotencyKey, noteId, clientSequence, createdAt'
			});
			return database;
		});
	}
	return databasePromise;
}

export async function loadLocalDraft(noteId: string) {
	const database = await getDatabase();
	return (await database?.drafts.get(noteId)) ?? null;
}

export async function saveLocalDraft(record: LocalDraftRecord, keepHistory = true) {
	const database = await getDatabase();
	if (!database) return;
	await database.transaction('rw', database.drafts, database.history, async () => {
		await database.drafts.put(record);
		if (keepHistory) {
			await database.history.add({
				noteId: record.noteId,
				document: record.document,
				clientSequence: record.clientSequence,
				createdAt: record.updatedAt
			});
			const history = await database.history
				.where('noteId')
				.equals(record.noteId)
				.reverse()
				.sortBy('createdAt');
			const stale = history.slice(30).flatMap((entry) => (entry.id ? [entry.id] : []));
			if (stale.length > 0) await database.history.bulkDelete(stale);
		}
	});
}

export async function markLocalDraftSynced(
	noteId: string,
	serverRevision: number,
	acknowledgedSequence: number
) {
	const database = await getDatabase();
	const current = await database?.drafts.get(noteId);
	if (!database || !current) return;
	const hasNewerWork = (current.clientSequence ?? 0) > acknowledgedSequence;
	await database.drafts.put({
		...current,
		serverRevision,
		dirty: hasNewerWork,
		updatedAt: hasNewerWork ? current.updatedAt : new Date().toISOString()
	});
}

export async function clearLocalDraft(noteId: string) {
	const database = await getDatabase();
	if (!database) return;
	await database.transaction('rw', database.drafts, database.history, database.outbox, async () => {
		await database.drafts.delete(noteId);
		const historyKeys = await database.history.where('noteId').equals(noteId).primaryKeys();
		await database.history.bulkDelete(historyKeys);
		const outboxKeys = await database.outbox.where('noteId').equals(noteId).primaryKeys();
		await database.outbox.bulkDelete(outboxKeys);
	});
}

export async function enqueueOutbox(record: LocalOutboxRecord) {
	const database = await getDatabase();
	await database?.outbox.put(record);
}

export async function acknowledgeOutbox(idempotencyKey: string) {
	const database = await getDatabase();
	await database?.outbox.delete(idempotencyKey);
}

export async function loadOldestOutboxOperation(noteId: string) {
	const database = await getDatabase();
	const operations =
		(await database?.outbox.where('noteId').equals(noteId).sortBy('createdAt')) ?? [];
	return operations[0] ?? null;
}

export async function listRecoverableDrafts() {
	const database = await getDatabase();
	return (await database?.drafts.where('dirty').equals(1).reverse().sortBy('updatedAt')) ?? [];
}
