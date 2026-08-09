import { DEFAULT_GENOME, normalizeGenome, validateGenome } from './genome';
import { deterministicId, hashString32 } from './seed';
import {
	CHITIN_SCHEMA_VERSION,
	type ArchiveLoadResult,
	type ArchiveRecord,
	type CreatureGenome,
	type StorageLike
} from './types';

export const ARCHIVE_STORAGE_KEY = 'suvro:chitin-engine:archive:v1';
export const ARCHIVE_FORMAT = 'suvro-chitin-archive';
export const ARCHIVE_VERSION = 1 as const;
export const MAX_ARCHIVE_RECORDS = 12;
export const MAX_ARCHIVE_BYTES = 128_000;

const GENOME_KEYS = Object.freeze(Object.keys(DEFAULT_GENOME));

type ArchiveEnvelope = Readonly<{
	format: typeof ARCHIVE_FORMAT;
	version: typeof ARCHIVE_VERSION;
	records: readonly ArchiveRecord[];
}>;

export type ArchiveWriteResult = ArchiveLoadResult &
	Readonly<{
		ok: boolean;
	}>;

function recordFrom(value: unknown): Record<string, unknown> | undefined {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: undefined;
}

function cleanText(value: unknown, maximumLength: number): string | undefined {
	if (typeof value !== 'string') return undefined;
	const cleaned = value
		.normalize('NFKC')
		.replace(/[\p{Cc}\p{Cf}]+/gu, ' ')
		.replace(/\s+/gu, ' ')
		.trim();
	if (!cleaned) return undefined;
	return Array.from(cleaned).slice(0, maximumLength).join('');
}

function validCreatedAt(value: unknown): string | undefined {
	const text = cleanText(value, 48);
	if (!text || !Number.isFinite(Date.parse(text))) return undefined;
	return text;
}

function validateArchiveRecord(
	value: unknown,
	index: number,
	issues: string[]
): ArchiveRecord | undefined {
	const source = recordFrom(value);
	if (!source) {
		issues.push(`Archive record ${index + 1} was not an object and was skipped.`);
		return undefined;
	}
	if (source.version !== ARCHIVE_VERSION) {
		issues.push(`Archive record ${index + 1} has an unsupported version and was skipped.`);
		return undefined;
	}
	const id = cleanText(source.id, 80);
	const label = cleanText(source.label, 80);
	const createdAt = validCreatedAt(source.createdAt);
	const genomeSource = recordFrom(source.genome);
	const completeGenome =
		genomeSource !== undefined && GENOME_KEYS.every((key) => Object.hasOwn(genomeSource, key));
	if (
		!id ||
		!label ||
		!createdAt ||
		genomeSource?.schemaVersion !== CHITIN_SCHEMA_VERSION ||
		!completeGenome
	) {
		issues.push(`Archive record ${index + 1} has invalid metadata or genome data and was skipped.`);
		return undefined;
	}
	const validated = validateGenome(genomeSource);
	if (validated.issues.length > 0) {
		issues.push(`Archive record ${index + 1} was repaired while loading.`);
	}
	return Object.freeze({
		version: ARCHIVE_VERSION,
		id,
		label,
		createdAt,
		genome: validated.genome
	});
}

function unavailableResult(message: string): ArchiveLoadResult {
	return Object.freeze({ records: Object.freeze([]), issues: Object.freeze([message]) });
}

type ArchiveReadStatus = Readonly<{
	result: ArchiveLoadResult;
	mayModify: boolean;
}>;

function readStatus(result: ArchiveLoadResult, mayModify: boolean): ArchiveReadStatus {
	return Object.freeze({ result, mayModify });
}

function readArchive(storage: StorageLike | null | undefined): ArchiveReadStatus {
	if (!storage) {
		return readStatus(
			unavailableResult('Browser storage is unavailable; the archive remains session-only.'),
			false
		);
	}
	let text: string | null;
	try {
		text = storage.getItem(ARCHIVE_STORAGE_KEY);
	} catch {
		return readStatus(
			unavailableResult('Browser storage could not be read; the archive remains session-only.'),
			false
		);
	}
	if (text === null || text === '') {
		return readStatus(
			Object.freeze({ records: Object.freeze([]), issues: Object.freeze([]) }),
			true
		);
	}
	if (text.length > MAX_ARCHIVE_BYTES) {
		return readStatus(
			unavailableResult('Stored archive exceeded its safety limit and was ignored.'),
			false
		);
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(text) as unknown;
	} catch {
		return readStatus(unavailableResult('Stored archive was malformed and was ignored.'), false);
	}
	const envelope = recordFrom(parsed);
	if (
		envelope?.format !== ARCHIVE_FORMAT ||
		envelope.version !== ARCHIVE_VERSION ||
		!Array.isArray(envelope.records)
	) {
		return readStatus(
			unavailableResult('Stored archive used an unsupported format and was ignored.'),
			false
		);
	}

	const issues: string[] = [];
	const records: ArchiveRecord[] = [];
	const seen = new Set<string>();
	for (let index = 0; index < envelope.records.length; index += 1) {
		const record = validateArchiveRecord(envelope.records[index], index, issues);
		if (!record) continue;
		if (seen.has(record.id)) {
			issues.push(`Duplicate archive record ${record.id} was skipped.`);
			continue;
		}
		seen.add(record.id);
		if (records.length < MAX_ARCHIVE_RECORDS) records.push(record);
		else if (records.length === MAX_ARCHIVE_RECORDS) {
			issues.push(`Archive was trimmed to ${MAX_ARCHIVE_RECORDS} specimens.`);
		}
	}
	return readStatus(
		Object.freeze({ records: Object.freeze(records), issues: Object.freeze(issues) }),
		true
	);
}

/** Reads a versioned archive without assuming localStorage is available or writable. */
export function loadArchive(storage: StorageLike | null | undefined): ArchiveLoadResult {
	return readArchive(storage).result;
}

export function createArchiveRecord(
	genomeInput: CreatureGenome,
	labelInput: string,
	createdAtInput: string
): ArchiveRecord {
	const genome = normalizeGenome(genomeInput);
	const label = cleanText(labelInput, 80) ?? 'Unlabelled specimen';
	const createdAt = validCreatedAt(createdAtInput);
	if (!createdAt)
		throw new RangeError('Archive records require an explicit valid creation timestamp.');
	const genomeHash = hashString32(JSON.stringify(genome)).toString(36);
	return Object.freeze({
		version: ARCHIVE_VERSION,
		id: `ce-${deterministicId(genome.seed, `archive:${genomeHash}:${createdAt}`)}`,
		label,
		createdAt,
		genome
	});
}

export function saveArchive(
	storage: StorageLike | null | undefined,
	recordInputs: readonly ArchiveRecord[]
): ArchiveWriteResult {
	if (!storage) {
		return Object.freeze({
			ok: false,
			records: Object.freeze([]),
			issues: Object.freeze(['Browser storage is unavailable; no specimens were written.'])
		});
	}
	const issues: string[] = [];
	const records: ArchiveRecord[] = [];
	const seen = new Set<string>();
	for (
		let index = 0;
		index < recordInputs.length && records.length < MAX_ARCHIVE_RECORDS;
		index += 1
	) {
		const record = validateArchiveRecord(recordInputs[index], index, issues);
		if (!record || seen.has(record.id)) continue;
		seen.add(record.id);
		records.push(record);
	}
	if (recordInputs.length > MAX_ARCHIVE_RECORDS) {
		issues.push(`Archive was trimmed to ${MAX_ARCHIVE_RECORDS} specimens.`);
	}
	const envelope: ArchiveEnvelope = {
		format: ARCHIVE_FORMAT,
		version: ARCHIVE_VERSION,
		records
	};
	try {
		storage.setItem(ARCHIVE_STORAGE_KEY, JSON.stringify(envelope));
	} catch {
		return Object.freeze({
			ok: false,
			records: Object.freeze(records),
			issues: Object.freeze([...issues, 'Browser storage rejected the archive write.'])
		});
	}
	return Object.freeze({
		ok: true,
		records: Object.freeze(records),
		issues: Object.freeze(issues)
	});
}

export function upsertArchiveRecord(
	storage: StorageLike | null | undefined,
	record: ArchiveRecord
): ArchiveWriteResult {
	const read = readArchive(storage);
	const loaded = read.result;
	if (!read.mayModify) {
		return Object.freeze({
			ok: false,
			records: loaded.records,
			issues: Object.freeze([
				...loaded.issues,
				'Archive update was cancelled because existing storage could not be read safely.'
			])
		});
	}
	const records = [record, ...loaded.records.filter((candidate) => candidate.id !== record.id)];
	const saved = saveArchive(storage, records);
	return Object.freeze({
		ok: saved.ok,
		records: saved.records,
		issues: Object.freeze([...loaded.issues, ...saved.issues])
	});
}

export function removeArchiveRecord(
	storage: StorageLike | null | undefined,
	recordId: string
): ArchiveWriteResult {
	const id = cleanText(recordId, 80);
	const read = readArchive(storage);
	const loaded = read.result;
	if (!id) {
		return Object.freeze({
			ok: false,
			records: loaded.records,
			issues: Object.freeze([...loaded.issues, 'Archive record id was invalid.'])
		});
	}
	if (!read.mayModify) {
		return Object.freeze({
			ok: false,
			records: loaded.records,
			issues: Object.freeze([
				...loaded.issues,
				'Archive removal was cancelled because existing storage could not be read safely.'
			])
		});
	}
	const saved = saveArchive(
		storage,
		loaded.records.filter((record) => record.id !== id)
	);
	return Object.freeze({
		ok: saved.ok,
		records: saved.records,
		issues: Object.freeze([...loaded.issues, ...saved.issues])
	});
}

export function clearArchive(storage: StorageLike | null | undefined): ArchiveWriteResult {
	if (!storage) {
		return Object.freeze({
			ok: false,
			records: Object.freeze([]),
			issues: Object.freeze(['Browser storage is unavailable; nothing was cleared.'])
		});
	}
	try {
		storage.removeItem(ARCHIVE_STORAGE_KEY);
		return Object.freeze({ ok: true, records: Object.freeze([]), issues: Object.freeze([]) });
	} catch {
		return Object.freeze({
			ok: false,
			records: Object.freeze([]),
			issues: Object.freeze(['Browser storage rejected the archive clear operation.'])
		});
	}
}
