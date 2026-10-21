/** Browser-local preferences. This record is a choice, never a visitor identifier. */
export interface ConsentRecord {
	v: 1;
	analytics: boolean;
	media: boolean;
	savedAt: number;
	expiresAt: number;
}

export const CONSENT_KEY = 'suvroghosh:consent';
export const CONSENT_LIFETIME_MS = 180 * 24 * 60 * 60 * 1000;
export const PRIVACY_SETTINGS_EVENT = 'suvroghosh:privacy-settings';
const MAX_TIMER_MS = 2_147_483_647;
const subscribers = new Set<(record: ConsentRecord | null) => void>();
let record: ConsentRecord | null = null;
let loaded = false;
let memoryOnly = false;
let consumers = 0;
let expiryTimer: ReturnType<typeof setTimeout> | undefined;

export function parseConsent(value: string | null, now = Date.now()): ConsentRecord | null {
	if (!value || value.length > 512) return null;
	try {
		const candidate = JSON.parse(value);
		if (
			candidate?.v !== 1 ||
			typeof candidate.analytics !== 'boolean' ||
			typeof candidate.media !== 'boolean' ||
			!Number.isSafeInteger(candidate.savedAt) ||
			!Number.isSafeInteger(candidate.expiresAt) ||
			candidate.savedAt <= 0 ||
			candidate.savedAt > now + 60_000 ||
			candidate.expiresAt !== candidate.savedAt + CONSENT_LIFETIME_MS ||
			candidate.expiresAt <= now
		)
			return null;
		return {
			v: 1,
			analytics: candidate.analytics,
			media: candidate.media,
			savedAt: candidate.savedAt,
			expiresAt: candidate.expiresAt
		};
	} catch {
		return null;
	}
}

function snapshot() {
	return record ? { ...record } : null;
}

function scheduleExpiry() {
	clearTimeout(expiryTimer);
	expiryTimer = undefined;
	if (typeof window === 'undefined' || !consumers || !record) return;
	expiryTimer = setTimeout(
		() => {
			if (record && record.expiresAt <= Date.now()) publish(null);
			else scheduleExpiry();
		},
		Math.min(MAX_TIMER_MS, Math.max(0, record.expiresAt - Date.now()))
	);
}

function publish(next: ConsentRecord | null, force = false) {
	const changed = JSON.stringify(record) !== JSON.stringify(next);
	record = next;
	scheduleExpiry();
	if (changed || force) for (const subscriber of subscribers) subscriber(snapshot());
}

function readStored() {
	if (typeof window === 'undefined') return;
	try {
		publish(parseConsent(window.localStorage.getItem(CONSENT_KEY)));
	} catch {
		/* Storage can be blocked. Keep any in-memory choice for this visit. */
	}
	loaded = true;
}

export function getConsent(): ConsentRecord | null {
	if (typeof window === 'undefined') return null;
	if (!loaded) readStored();
	if (record && record.expiresAt <= Date.now()) publish(null);
	return snapshot();
}

export function subscribeConsent(subscriber: (record: ConsentRecord | null) => void): () => void {
	const current = getConsent();
	subscribers.add(subscriber);
	subscriber(current);
	return () => {
		subscribers.delete(subscriber);
	};
}

function onStorage(event: StorageEvent) {
	try {
		if (event.storageArea !== window.localStorage) return;
	} catch {
		return;
	}
	if (event.key !== null && event.key !== CONSENT_KEY) return;
	memoryOnly = false;
	publish(parseConsent(event.key === null ? null : event.newValue));
}

function onResume() {
	if (!memoryOnly) readStored();
	getConsent();
}

/** Reference-counted lifecycle shared by the layout and individual embeds. */
export function initializeConsent(): () => void {
	if (typeof window === 'undefined') return () => {};
	if (consumers++ === 0) {
		getConsent();
		window.addEventListener('storage', onStorage);
		window.addEventListener('focus', onResume);
		document.addEventListener('visibilitychange', onResume);
		scheduleExpiry();
	}
	let disposed = false;
	return () => {
		if (disposed) return;
		disposed = true;
		if (--consumers === 0) {
			window.removeEventListener('storage', onStorage);
			window.removeEventListener('focus', onResume);
			document.removeEventListener('visibilitychange', onResume);
			clearTimeout(expiryTimer);
			expiryTimer = undefined;
		}
	};
}

export function saveConsent(choice: { analytics: boolean; media: boolean }): {
	persisted: boolean;
} {
	if (typeof window === 'undefined') return { persisted: false };
	const savedAt = Date.now();
	const next: ConsentRecord = {
		v: 1,
		analytics: choice.analytics === true,
		media: choice.media === true,
		savedAt,
		expiresAt: savedAt + CONSENT_LIFETIME_MS
	};
	let persisted = false;
	try {
		const serialized = JSON.stringify(next);
		window.localStorage.setItem(CONSENT_KEY, serialized);
		persisted = window.localStorage.getItem(CONSENT_KEY) === serialized;
	} catch {
		/* The in-memory choice remains usable when persistence is unavailable. */
	}
	loaded = true;
	memoryOnly = !persisted;
	publish(next, true);
	return { persisted };
}

export function openPrivacySettings(): void {
	if (typeof window !== 'undefined') window.dispatchEvent(new Event(PRIVACY_SETTINGS_EVENT));
}
