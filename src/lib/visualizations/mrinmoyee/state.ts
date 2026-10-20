import { DEFAULT_DESIGN, normalizeDesign, ownValue, PRESETS } from './config';
import type { AtelierDesign, DesignGroup, DesignLocks, SavedDesign } from './types';

export const SAVED_DESIGNS_KEY = 'mrinmoyee.designs.v1';
export const MAX_DESIGN_BYTES = 24 * 1024;
export const MAX_SAVED_DESIGNS = 12;
const MAX_THUMBNAIL_LENGTH = 50 * 1024;
const MAX_STORAGE_LENGTH = 750 * 1024;

const GROUP_KEYS: Record<DesignGroup, (keyof AtelierDesign)[]> = {
	face: ['face', 'faceWidth', 'eyeScale', 'headTilt', 'skinColor'],
	pose: ['pose'],
	dress: ['material', 'sariColor', 'borderColor', 'blouseColor', 'sariPattern'],
	ornament: ['crown', 'crownScale', 'ornamentDensity', 'garland', 'halo', 'flowers'],
	setting: [
		'backdrop',
		'lamps',
		'lampIntensity',
		'lightWarmth',
		'lightAngle',
		'exposure',
		'atmosphere',
		'stage',
		'bells',
		'lion'
	]
};

function validDesignSchema(input: unknown): boolean {
	if (!input || typeof input !== 'object' || Array.isArray(input)) return false;
	if (ownValue(input, 'version') !== 1) return false;
	for (const key of Object.keys(DEFAULT_DESIGN) as (keyof AtelierDesign)[]) {
		const value = ownValue(input, key);
		if (key === 'camera') {
			for (const coordinate of ['position', 'target']) {
				const tuple = ownValue(value, coordinate);
				if (
					!Array.isArray(tuple) ||
					tuple.length !== 3 ||
					!tuple.every((entry) => typeof entry === 'number' && Number.isFinite(entry))
				)
					return false;
			}
		} else if (typeof value !== typeof DEFAULT_DESIGN[key]) {
			return false;
		} else if (typeof value === 'number' && !Number.isFinite(value)) {
			return false;
		}
	}
	return true;
}

export function exportDesign(design: AtelierDesign): string {
	return JSON.stringify(normalizeDesign(design), null, 2);
}

/** A full versioned document is required; safe numeric ranges are then applied centrally. */
export function importDesign(text: string): AtelierDesign {
	if (
		typeof text !== 'string' ||
		text.length > MAX_DESIGN_BYTES ||
		new TextEncoder().encode(text).length > MAX_DESIGN_BYTES
	) {
		throw new Error('The design file exceeds the 24 KiB limit.');
	}
	let input: unknown;
	try {
		input = JSON.parse(text);
	} catch {
		throw new Error('This file is not valid JSON.');
	}
	if (ownValue(input, 'version') !== 1) {
		throw new Error('This design needs the supported version 1 format.');
	}
	if (!validDesignSchema(input)) {
		throw new Error('This file does not contain a complete Durga Atelier design.');
	}
	return normalizeDesign(input);
}

export function designToUrl(url: URL, design: AtelierDesign): string {
	if (!['https:', 'http:'].includes(url.protocol))
		throw new Error('Share links need an HTTP or HTTPS page.');
	const destination = new URL(url.href);
	const bytes = new TextEncoder().encode(JSON.stringify(normalizeDesign(design)));
	let binary = '';
	for (const byte of bytes) binary += String.fromCharCode(byte);
	destination.hash = `atelier=${btoa(binary).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/u, '')}`;
	return destination.href;
}

export function designFromUrl(url: URL): AtelierDesign | null {
	const fragment = url.hash.slice(1);
	if (!fragment.startsWith('atelier=') || fragment.length > MAX_DESIGN_BYTES) return null;
	const encoded = fragment.slice('atelier='.length);
	if (!encoded || !/^[\w-]+$/u.test(encoded)) return null;
	try {
		const padded = encoded
			.replace(/-/gu, '+')
			.replace(/_/gu, '/')
			.padEnd(Math.ceil(encoded.length / 4) * 4, '=');
		const binary = atob(padded);
		const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
		return importDesign(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
	} catch {
		return null;
	}
}

function seededRandom(seed: string): () => number {
	let state = 2166136261;
	for (const character of seed) {
		state ^= character.codePointAt(0) ?? 0;
		state = Math.imul(state, 16777619);
	}
	return () => {
		state += 0x6d2b79f5;
		let value = Math.imul(state ^ (state >>> 15), 1 | state);
		value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
		return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
	};
}

/** Group locks preserve every parameter owned by that group, including the shared motif seed. */
export function createVariation(
	design: AtelierDesign,
	locks: DesignLocks,
	serial = 0
): AtelierDesign {
	const source = normalizeDesign(design);
	const random = seededRandom(`${source.seed}:${Number.isFinite(serial) ? Math.trunc(serial) : 0}`);
	const choose = <T>(values: readonly T[]): T => values[Math.floor(random() * values.length)];
	const mood = choose(PRESETS).design;
	const candidate = normalizeDesign({
		...source,
		face: choose(['serene', 'resolute', 'gentle']),
		faceWidth: 0.94 + random() * 0.12,
		eyeScale: 0.92 + random() * 0.16,
		headTilt: (random() - 0.5) * 8,
		pose: choose(['classic', 'open']),
		material: choose([source.material, mood.material]),
		sariColor: mood.sariColor,
		borderColor: mood.borderColor,
		blouseColor: mood.blouseColor,
		sariPattern: choose(['lotus', 'vine', 'chevron']),
		crown: choose([source.crown, mood.crown]),
		crownScale: 0.9 + random() * 0.2,
		ornamentDensity: 0.45 + random() * 0.5,
		garland: choose(['marigold', 'jasmine', 'hibiscus']),
		halo: choose(['lotus', 'sunburst', 'arch']),
		backdrop: mood.backdrop,
		lightWarmth: mood.lightWarmth,
		lightAngle: (random() - 0.5) * 100,
		lampIntensity: 0.45 + random() * 0.5,
		exposure: 0.95 + random() * 0.3,
		atmosphere: random() * 0.4
	});
	for (const group of Object.keys(GROUP_KEYS) as DesignGroup[]) {
		if (locks[group]) {
			for (const key of GROUP_KEYS[group]) {
				// Each paired assignment preserves a field's type; the union is intentionally copied whole.
				Object.assign(candidate, { [key]: source[key] });
			}
		}
	}
	if (JSON.stringify(candidate) !== JSON.stringify(source)) candidate.presetId = 'custom';
	return candidate;
}

function cleanText(input: unknown, max: number): string {
	return typeof input === 'string'
		? Array.from(input.replace(/\p{Cc}/gu, '').trim())
				.slice(0, max)
				.join('')
		: '';
}

function normalizeRecord(input: unknown): SavedDesign | null {
	const id = ownValue(input, 'id');
	const name = cleanText(ownValue(input, 'name'), 64);
	const savedAt = ownValue(input, 'savedAt');
	const design = ownValue(input, 'design');
	if (
		typeof id !== 'string' ||
		!/^[\w-]{1,80}$/u.test(id) ||
		!name ||
		typeof savedAt !== 'string' ||
		!/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/u.test(savedAt) ||
		!Number.isFinite(Date.parse(savedAt)) ||
		!validDesignSchema(design)
	)
		return null;
	const canonicalDate = new Date(savedAt).toISOString();
	if (canonicalDate.replace('.000Z', 'Z') !== savedAt.replace('.000Z', 'Z')) return null;
	const thumbnail = ownValue(input, 'thumbnail');
	const validThumbnail =
		typeof thumbnail === 'string' &&
		thumbnail.length <= MAX_THUMBNAIL_LENGTH &&
		/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z\d+/]+=*$/u.test(thumbnail);
	return {
		id,
		name,
		savedAt: canonicalDate,
		design: normalizeDesign(design),
		...(validThumbnail ? { thumbnail } : {})
	};
}

function normalizeRecords(input: unknown): SavedDesign[] {
	if (!Array.isArray(input)) return [];
	const seen = new Set<string>();
	const records: SavedDesign[] = [];
	for (const raw of input.slice(0, 100)) {
		const record = normalizeRecord(raw);
		if (!record || seen.has(record.id)) continue;
		seen.add(record.id);
		records.push(record);
		if (records.length === MAX_SAVED_DESIGNS) break;
	}
	return records;
}

export function readSavedDesigns(storage: Pick<Storage, 'getItem'>): SavedDesign[] {
	try {
		const text = storage.getItem(SAVED_DESIGNS_KEY);
		if (!text || text.length > MAX_STORAGE_LENGTH) return [];
		return normalizeRecords(JSON.parse(text));
	} catch {
		return [];
	}
}

/** Storage errors propagate so the UI can report a full or unavailable device gallery. */
export function saveDesigns(storage: Pick<Storage, 'setItem'>, records: SavedDesign[]): void {
	const normalized = normalizeRecords(records);
	try {
		storage.setItem(SAVED_DESIGNS_KEY, JSON.stringify(normalized));
	} catch {
		// A full local quota can often still retain the designs without preview images.
		storage.setItem(
			SAVED_DESIGNS_KEY,
			JSON.stringify(
				normalized.map((entry) => {
					const record = { ...entry };
					delete record.thumbnail;
					return record;
				})
			)
		);
	}
}
