import { describe, expect, it } from 'vitest';
import {
	ARCHIVE_FORMAT,
	ARCHIVE_STORAGE_KEY,
	MAX_ARCHIVE_RECORDS,
	clearArchive,
	createArchiveRecord,
	loadArchive,
	saveArchive,
	upsertArchiveRecord
} from './archive';
import {
	DEFAULT_EXHIBIT_STATE,
	DEFAULT_GENOME,
	normalizeExhibitState,
	normalizeGenome
} from './genome';
import type { StorageLike } from './types';
import {
	CHITIN_URL_PAYLOAD_KEY,
	MAX_CHITIN_PAYLOAD_LENGTH,
	canonicalCleanChitinUrl,
	parseChitinUrlState,
	serializeChitinUrlState,
	writeChitinStateToUrl
} from './url-state';

class MemoryStorage implements StorageLike {
	readonly values = new Map<string, string>();

	getItem(key: string): string | null {
		return this.values.get(key) ?? null;
	}

	setItem(key: string, value: string): void {
		this.values.set(key, value);
	}

	removeItem(key: string): void {
		this.values.delete(key);
	}
}

describe('Chitin Engine local archive', () => {
	it('stores only versioned lightweight records and enforces the twelve-specimen limit', () => {
		const storage = new MemoryStorage();
		const records = Array.from({ length: 15 }, (_, index) =>
			createArchiveRecord(
				normalizeGenome({ ...DEFAULT_GENOME, seed: `archive-${index}` }),
				`Specimen ${index}`,
				`2026-08-${String((index % 28) + 1).padStart(2, '0')}T12:00:00.000Z`
			)
		);
		const saved = saveArchive(storage, records);
		expect(saved.ok).toBe(true);
		expect(saved.records).toHaveLength(MAX_ARCHIVE_RECORDS);
		const stored = JSON.parse(storage.getItem(ARCHIVE_STORAGE_KEY) ?? '{}') as {
			format?: string;
			records?: unknown[];
		};
		expect(stored.format).toBe(ARCHIVE_FORMAT);
		expect(stored.records).toHaveLength(MAX_ARCHIVE_RECORDS);
		expect(loadArchive(storage).records).toEqual(saved.records);
	});

	it('upserts deterministically and clears without retaining rendered data', () => {
		const storage = new MemoryStorage();
		const record = createArchiveRecord(DEFAULT_GENOME, 'Primary specimen', '2026-08-09T12:00:00Z');
		expect(upsertArchiveRecord(storage, record).ok).toBe(true);
		expect(
			upsertArchiveRecord(storage, { ...record, label: 'Renamed specimen' }).records
		).toHaveLength(1);
		expect(loadArchive(storage).records[0]?.label).toBe('Renamed specimen');
		expect(clearArchive(storage).ok).toBe(true);
		expect(loadArchive(storage).records).toEqual([]);
	});

	it('gracefully ignores malformed data and storage failures', () => {
		const storage = new MemoryStorage();
		storage.setItem(ARCHIVE_STORAGE_KEY, '{broken');
		expect(loadArchive(storage).issues[0]).toContain('malformed');
		storage.setItem(
			ARCHIVE_STORAGE_KEY,
			JSON.stringify({ format: ARCHIVE_FORMAT, version: 1, records: [null, { version: 99 }] })
		);
		expect(loadArchive(storage).records).toEqual([]);
		expect(loadArchive(storage).issues.length).toBeGreaterThanOrEqual(2);
		storage.setItem(
			ARCHIVE_STORAGE_KEY,
			JSON.stringify({
				format: ARCHIVE_FORMAT,
				version: 1,
				records: [
					{
						version: 1,
						id: 'partial',
						label: 'Partial genome',
						createdAt: '2026-08-09T12:00:00Z',
						genome: { schemaVersion: 1, seed: 'partial' }
					}
				]
			})
		);
		expect(loadArchive(storage).records).toEqual([]);

		const throwing: StorageLike = {
			getItem: () => {
				throw new Error('denied');
			},
			setItem: () => {
				throw new Error('quota');
			},
			removeItem: () => {
				throw new Error('denied');
			}
		};
		expect(loadArchive(throwing).issues[0]).toContain('could not be read');
		expect(saveArchive(throwing, []).ok).toBe(false);
		expect(clearArchive(throwing).ok).toBe(false);
	});

	it('does not overwrite an archive that could not be read transactionally', () => {
		let writes = 0;
		const asymmetric: StorageLike = {
			getItem: () => {
				throw new Error('read denied');
			},
			setItem: () => {
				writes += 1;
			},
			removeItem: () => undefined
		};
		const record = createArchiveRecord(DEFAULT_GENOME, 'Safe record', '2026-08-09T12:00:00Z');
		expect(upsertArchiveRecord(asymmetric, record).ok).toBe(false);
		expect(writes).toBe(0);
	});
});

describe('Chitin Engine URL state', () => {
	it('round-trips meaningful deviations while keeping identity fields readable', () => {
		const state = normalizeExhibitState({
			...DEFAULT_EXHIBIT_STATE,
			genome: {
				...DEFAULT_GENOME,
				seed: 'shared-specimen-41',
				world: 'brine-under-ice',
				bodyWidth: 0.41,
				cellularContrast: 0.83
			},
			view: 'surface',
			quality: 'high',
			paused: true,
			cameraYaw: 0.2
		});
		const params = serializeChitinUrlState(state, new URLSearchParams('ref=article'));
		expect(params.get('ref')).toBe('article');
		expect(params.get('ce_v')).toBe('1');
		expect(params.get('ce_seed')).toBe('shared-specimen-41');
		expect(params.get('ce_preset')).toBe(state.genome.preset);
		expect(params.get('ce_world')).toBe('brine-under-ice');
		expect(params.get('ce_view')).toBe('surface');
		expect(params.get(CHITIN_URL_PAYLOAD_KEY)?.length).toBeLessThan(MAX_CHITIN_PAYLOAD_LENGTH);
		const parsed = parseChitinUrlState(params);
		expect(parsed.unsupportedVersion).toBe(false);
		expect(parsed.state).toEqual(state);
	});

	it('preserves unrelated URL parameters and leaves its input URL untouched', () => {
		const input = new URL('https://example.test/article?ref=newsletter#experiment');
		const written = writeChitinStateToUrl(input, DEFAULT_EXHIBIT_STATE);
		expect(input.searchParams.has('ce_v')).toBe(false);
		expect(written.searchParams.get('ref')).toBe('newsletter');
		expect(written.searchParams.get('ce_v')).toBe('1');
		expect(written.hash).toBe('#experiment');
	});

	it('clamps hostile deviations and safely rejects malformed or oversized payloads', () => {
		const hostile = new URLSearchParams({
			ce_v: '1',
			ce_seed: 'safe-seed',
			ce_preset: 'glassback-knifemite',
			ce_world: 'terminator-line',
			ce_view: 'surface',
			ce_g: JSON.stringify({
				g: { bodyWidth: 99, cadence: Number.POSITIVE_INFINITY, noSuchField: 3 },
				x: { y: 42, q: 'impossible', z: 'yes' }
			})
		});
		const parsed = parseChitinUrlState(hostile);
		expect(parsed.state.genome.bodyWidth).toBe(0.62);
		expect(parsed.state.genome.cadence).toBe(DEFAULT_GENOME.cadence);
		expect(parsed.state.cameraYaw).toBe(0.35);
		expect(parsed.state.quality).toBe('auto');
		expect(parsed.issues.length).toBeGreaterThanOrEqual(4);

		const malformed = new URLSearchParams(hostile);
		malformed.set(CHITIN_URL_PAYLOAD_KEY, '{broken');
		expect(parseChitinUrlState(malformed).issues.some((issue) => issue.includes('malformed'))).toBe(
			true
		);
		malformed.set(CHITIN_URL_PAYLOAD_KEY, 'x'.repeat(MAX_CHITIN_PAYLOAD_LENGTH + 1));
		expect(
			parseChitinUrlState(malformed).issues.some((issue) => issue.includes('safety limit'))
		).toBe(true);
	});

	it('rejects unsupported versions and produces a generator-free canonical URL', () => {
		const unsupported = parseChitinUrlState('?ce_v=99&ce_seed=hostile');
		expect(unsupported.unsupportedVersion).toBe(true);
		expect(unsupported.state).toEqual(DEFAULT_EXHIBIT_STATE);
		const canonical = canonicalCleanChitinUrl(
			'https://example.test/article?ref=keep&ce_v=1&ce_seed=remove&ce_future=remove#section'
		);
		expect(canonical).toBe('https://example.test/article?ref=keep');
	});
});
