import type { CircuitDocument } from './types';
import { importCircuitJson, exportCircuitJson } from './model';

export const STORAGE_KEY = 'suvro-circuit-bench:v1';

export interface StorageSaveStatus {
	ok: boolean;
	available: boolean;
	savedAtIso?: string;
	message: string;
}

export function isLocalStorageAvailable(
	storage: Storage | null | undefined = globalThis.localStorage
): boolean {
	if (!storage) return false;
	try {
		const probeKey = '__cb_storage_probe__';
		storage.setItem(probeKey, '1');
		storage.removeItem(probeKey);
		return true;
	} catch {
		return false;
	}
}

export function saveCircuitToStorage(
	doc: CircuitDocument,
	storage: Storage | null | undefined = globalThis.localStorage
): StorageSaveStatus {
	if (!storage) {
		return {
			ok: false,
			available: false,
			message: 'Local storage unavailable · session only'
		};
	}
	try {
		const payload = JSON.stringify({
			savedAt: new Date().toISOString(),
			circuit: JSON.parse(exportCircuitJson(doc))
		});
		storage.setItem(STORAGE_KEY, payload);
		const now = new Date().toISOString();
		return {
			ok: true,
			available: true,
			savedAtIso: now,
			message: 'Saved locally'
		};
	} catch {
		return {
			ok: false,
			available: false,
			message: 'Local storage unavailable · session only'
		};
	}
}

export function loadCircuitFromStorage(
	storage: Storage | null | undefined = globalThis.localStorage
): { ok: true; doc: CircuitDocument; savedAt?: string } | { ok: false; available: boolean } {
	if (!storage) return { ok: false, available: false };
	try {
		const raw = storage.getItem(STORAGE_KEY);
		if (!raw) return { ok: false, available: true };
		const parsed = JSON.parse(raw) as { savedAt?: string; circuit?: unknown };
		const candidate = parsed?.circuit ?? parsed;
		const validated = importCircuitJson(JSON.stringify(candidate));
		if (!validated.ok) return { ok: false, available: true };
		return {
			ok: true,
			doc: validated.doc,
			savedAt: typeof parsed?.savedAt === 'string' ? parsed.savedAt : undefined
		};
	} catch {
		return { ok: false, available: isLocalStorageAvailable(storage) };
	}
}

export function clearSavedCircuit(
	storage: Storage | null | undefined = globalThis.localStorage
): void {
	if (!storage) return;
	try {
		storage.removeItem(STORAGE_KEY);
	} catch {
		// Ignore when storage is blocked
	}
}
