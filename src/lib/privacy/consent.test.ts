import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

class MemoryStorage {
	values = new Map<string, string>();
	blocked = false;
	getItem(key: string) {
		if (this.blocked) throw new Error('blocked');
		return this.values.get(key) ?? null;
	}
	setItem(key: string, value: string) {
		if (this.blocked) throw new Error('blocked');
		this.values.set(key, value);
	}
}

let storage: MemoryStorage;
let browser: EventTarget & { localStorage: MemoryStorage };
let visibility: EventTarget;
let cleanup: Array<() => void>;

beforeEach(() => {
	vi.resetModules();
	vi.useFakeTimers();
	vi.setSystemTime(new Date('2026-10-22T06:00:00Z'));
	storage = new MemoryStorage();
	browser = Object.assign(new EventTarget(), { localStorage: storage });
	visibility = new EventTarget();
	vi.stubGlobal('window', browser);
	vi.stubGlobal('document', visibility);
	cleanup = [];
});

afterEach(() => {
	cleanup.forEach((dispose) => dispose());
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

describe('media privacy consent lifecycle', () => {
	it('starts off and remembers rejection and acceptance for the same 180 days', async () => {
		const consent = await import('./consent');
		cleanup.push(consent.initializeConsent());
		expect(consent.getConsent()).toBeNull();
		expect(consent.saveConsent({ media: false })).toEqual({ persisted: true });
		const rejected = consent.getConsent()!;
		expect(rejected).toMatchObject({ v: 2, media: false });
		expect(rejected).not.toHaveProperty('analytics');
		expect(rejected.expiresAt - rejected.savedAt).toBe(consent.CONSENT_LIFETIME_MS);
		consent.saveConsent({ media: true });
		const accepted = consent.getConsent()!;
		expect(accepted).toMatchObject({ v: 2, media: true });
		expect(accepted.expiresAt - accepted.savedAt).toBe(consent.CONSENT_LIFETIME_MS);
		expect(JSON.parse(storage.getItem(consent.CONSENT_KEY)!)).toEqual(accepted);
	});

	it('loads a saved choice after a fresh module lifecycle and returns immutable snapshots', async () => {
		const original = await import('./consent');
		original.saveConsent({ media: true });
		vi.resetModules();
		const consent = await import('./consent');
		const record = consent.getConsent()!;
		expect(record.media).toBe(true);
		record.media = false;
		expect(consent.getConsent()!.media).toBe(true);
	});

	it('reads legacy records as media-only without renewing or changing their permission', async () => {
		const consent = await import('./consent');
		const savedAt = Date.now() - 86_400_000;
		const expiresAt = savedAt + consent.CONSENT_LIFETIME_MS;
		for (const analytics of [false, true]) {
			for (const media of [false, true]) {
				const legacy = { v: 1, analytics, media, savedAt, expiresAt };
				expect(consent.parseConsent(JSON.stringify(legacy))).toEqual({
					v: 2,
					media,
					savedAt,
					expiresAt
				});
			}
		}
		storage.setItem(
			consent.CONSENT_KEY,
			JSON.stringify({ v: 1, analytics: true, media: true, savedAt, expiresAt })
		);
		cleanup.push(consent.initializeConsent());
		expect(consent.getConsent()).toEqual({ v: 2, media: true, savedAt, expiresAt });
		vi.advanceTimersByTime(expiresAt - Date.now());
		expect(consent.getConsent()).toBeNull();
	});

	it('fails closed for malformed, unsupported, expired or forged-duration records', async () => {
		const consent = await import('./consent');
		const now = Date.now();
		const valid = {
			v: 2,
			media: true,
			savedAt: now,
			expiresAt: now + consent.CONSENT_LIFETIME_MS
		};
		for (const value of [
			'{',
			'null',
			'true',
			JSON.stringify({ ...valid, v: 3 }),
			JSON.stringify({ ...valid, media: 1 }),
			JSON.stringify({ ...valid, v: 1 }),
			JSON.stringify({ ...valid, v: 1, analytics: 1 }),
			JSON.stringify({ ...valid, v: 1, analytics: true, expiresAt: now + 1 }),
			JSON.stringify({ ...valid, expiresAt: now + 1 }),
			JSON.stringify({
				...valid,
				savedAt: now + 100_000,
				expiresAt: now + 100_000 + consent.CONSENT_LIFETIME_MS
			})
		]) {
			expect(consent.parseConsent(value)).toBeNull();
		}
		expect(consent.parseConsent(JSON.stringify(valid), valid.expiresAt)).toBeNull();
		expect(consent.parseConsent(JSON.stringify(valid))).toEqual(valid);
		expect(consent.parseConsent(JSON.stringify({ ...valid, analytics: true }))).toEqual(valid);
	});

	it('notifies subscribers immediately and on current-visit changes and expiry', async () => {
		const consent = await import('./consent');
		cleanup.push(consent.initializeConsent());
		const listener = vi.fn();
		cleanup.push(consent.subscribeConsent(listener));
		expect(listener).toHaveBeenLastCalledWith(null);
		consent.saveConsent({ media: true });
		expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({ v: 2, media: true }));
		vi.advanceTimersByTime(consent.CONSENT_LIFETIME_MS + 1);
		expect(listener).toHaveBeenLastCalledWith(null);
		expect(consent.getConsent()).toBeNull();
	});

	it('keeps blocked-storage choices in memory across focus events', async () => {
		storage.blocked = true;
		const consent = await import('./consent');
		cleanup.push(consent.initializeConsent());
		expect(consent.saveConsent({ media: true })).toEqual({ persisted: false });
		browser.dispatchEvent(new Event('focus'));
		expect(consent.getConsent()).toEqual(expect.objectContaining({ v: 2, media: true }));
	});

	it('announces repeated rejection so a one-time video can be unloaded', async () => {
		const consent = await import('./consent');
		const listener = vi.fn();
		cleanup.push(consent.subscribeConsent(listener));
		consent.saveConsent({ media: false });
		listener.mockClear();
		consent.saveConsent({ media: false });
		expect(listener).toHaveBeenCalledOnce();
	});

	it('synchronizes cross-tab rejection, removal and invalid records', async () => {
		const consent = await import('./consent');
		cleanup.push(consent.initializeConsent());
		consent.saveConsent({ media: true });
		const emit = (key: string | null, newValue: string | null) =>
			browser.dispatchEvent(
				Object.assign(new Event('storage'), { key, newValue, storageArea: storage })
			);
		const rejected = { ...consent.getConsent()!, media: false };
		emit(consent.CONSENT_KEY, JSON.stringify(rejected));
		expect(consent.getConsent()!.media).toBe(false);
		emit(consent.CONSENT_KEY, '{');
		expect(consent.getConsent()).toBeNull();
		consent.saveConsent({ media: true });
		emit(null, null);
		expect(consent.getConsent()).toBeNull();
	});

	it('shares one reference-counted listener lifecycle and disposes once', async () => {
		const add = vi.spyOn(browser, 'addEventListener');
		const remove = vi.spyOn(browser, 'removeEventListener');
		const consent = await import('./consent');
		const first = consent.initializeConsent();
		const second = consent.initializeConsent();
		expect(add.mock.calls.filter(([type]) => type === 'storage')).toHaveLength(1);
		first();
		first();
		expect(remove.mock.calls.filter(([type]) => type === 'storage')).toHaveLength(0);
		second();
		expect(remove.mock.calls.filter(([type]) => type === 'storage')).toHaveLength(1);
	});

	it('announces settings requests without writing consent', async () => {
		const consent = await import('./consent');
		const listener = vi.fn();
		browser.addEventListener(consent.PRIVACY_SETTINGS_EVENT, listener);
		consent.openPrivacySettings();
		expect(listener).toHaveBeenCalledOnce();
		expect(storage.values.size).toBe(0);
	});
});
