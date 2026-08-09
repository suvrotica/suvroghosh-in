import type { SonicEvent, SoundWorldId } from './contracts';
import { safeSoundWorld } from './patches';

export const ORCHESTRA_SCORE_SCHEMA = 'strange-attractor-orchestra-score' as const;
export const ORCHESTRA_SCORE_VERSION = 1 as const;

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | readonly JsonValue[] | { readonly [key: string]: JsonValue };

export type ExportedScoreEvent = Readonly<{
	id: string | number;
	time: number;
	type?: string;
	kind?: string;
	simulationStep?: number;
	simulationTime?: number;
	duration?: number;
	intensity?: number;
	velocity01?: number;
	pitch?: number;
	frequencyHz?: number;
	pitchHz?: number;
	pan?: number;
	region?: string | number;
	sourceFeature?: string;
	explanation?: string;
	height?: number;
	curvature?: number;
	stretching?: number;
	recurrence?: number;
	density?: number;
	noise?: number;
	seed?: string | number;
	metadata?: JsonValue;
}>;

export type OrchestraScoreDocument = Readonly<{
	schema: typeof ORCHESTRA_SCORE_SCHEMA;
	version: typeof ORCHESTRA_SCORE_VERSION;
	seed: string | number;
	soundWorld: SoundWorldId;
	events: readonly ExportedScoreEvent[];
}>;

export type ScoreJsonExport = Readonly<{
	document: OrchestraScoreDocument;
	json: string;
	blob: Blob;
	filename: string;
}>;

export type ScoreExportOptions = Readonly<{
	events: readonly SonicEvent[];
	seed?: string | number;
	soundWorld?: SoundWorldId;
	filenameStem?: string;
}>;

function finiteOptional(value: number | undefined): number | undefined {
	return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function canonicalJson(value: unknown, ancestors = new Set<object>()): JsonValue | undefined {
	if (value === null) return null;
	if (typeof value === 'string' || typeof value === 'boolean') return value;
	if (typeof value === 'number') return Number.isFinite(value) ? value : null;
	if (typeof value === 'bigint') return value.toString();
	if (Array.isArray(value)) {
		if (ancestors.has(value))
			throw new TypeError('Score metadata must not contain circular values.');
		ancestors.add(value);
		const result = value.map((item) => canonicalJson(item, ancestors) ?? null);
		ancestors.delete(value);
		return result;
	}
	if (typeof value === 'object') {
		if (ancestors.has(value))
			throw new TypeError('Score metadata must not contain circular values.');
		ancestors.add(value);
		const result: Record<string, JsonValue> = {};
		for (const key of Object.keys(value as Record<string, unknown>).sort()) {
			const child = canonicalJson((value as Record<string, unknown>)[key], ancestors);
			if (child !== undefined) result[key] = child;
		}
		ancestors.delete(value);
		return result;
	}
	return undefined;
}

function exportEvent(event: SonicEvent): ExportedScoreEvent {
	const exported: Record<string, JsonValue> = {
		id: typeof event.id === 'number' && Number.isFinite(event.id) ? event.id : String(event.id),
		time: Number.isFinite(event.time) ? Math.max(0, event.time) : 0
	};
	if (event.type !== undefined) exported.type = String(event.type);
	if (event.kind !== undefined) exported.kind = String(event.kind);
	for (const key of [
		'simulationStep',
		'simulationTime',
		'duration',
		'intensity',
		'velocity01',
		'pitch',
		'frequencyHz',
		'pitchHz',
		'pan',
		'height',
		'curvature',
		'stretching',
		'recurrence',
		'density',
		'noise'
	] as const) {
		const value = finiteOptional(event[key]);
		if (value !== undefined) exported[key] = value;
	}
	if (event.sourceFeature !== undefined) exported.sourceFeature = String(event.sourceFeature);
	if (event.explanation !== undefined) exported.explanation = String(event.explanation);
	if (typeof event.region === 'string') exported.region = event.region;
	else if (typeof event.region === 'number' && Number.isFinite(event.region)) {
		exported.region = event.region;
	}
	if (typeof event.seed === 'string') exported.seed = event.seed;
	else if (typeof event.seed === 'number' && Number.isFinite(event.seed)) {
		exported.seed = event.seed;
	}
	const metadata = canonicalJson(event.metadata);
	if (metadata !== undefined) exported.metadata = metadata;
	return exported as ExportedScoreEvent;
}

function filenameStem(value: string | undefined): string {
	const cleaned = (value ?? 'strange-attractor-orchestra')
		.toLowerCase()
		.replace(/[^a-z0-9]+/gu, '-')
		.replace(/^-+|-+$/gu, '')
		.slice(0, 80);
	return cleaned || 'strange-attractor-orchestra';
}

export function createOrchestraScoreDocument(options: ScoreExportOptions): OrchestraScoreDocument {
	const events = options.events
		.map((event, originalIndex) => ({ event: exportEvent(event), originalIndex }))
		.sort(
			(first, second) =>
				first.event.time - second.event.time ||
				String(first.event.id).localeCompare(String(second.event.id)) ||
				first.originalIndex - second.originalIndex
		)
		.map(({ event }) => event);
	const requestedSeed = options.seed ?? 'langford-1847';
	const seed =
		typeof requestedSeed === 'number' && !Number.isFinite(requestedSeed)
			? String(requestedSeed)
			: requestedSeed;
	return {
		schema: ORCHESTRA_SCORE_SCHEMA,
		version: ORCHESTRA_SCORE_VERSION,
		seed,
		soundWorld: safeSoundWorld(options.soundWorld),
		events
	};
}

/** Stable key order, event order, whitespace and trailing newline make byte-for-byte exports repeatable. */
export function stringifyOrchestraScore(document: OrchestraScoreDocument): string {
	return `${JSON.stringify(canonicalJson(document), null, 2)}\n`;
}

export function exportOrchestraScoreJson(options: ScoreExportOptions): ScoreJsonExport {
	const document = createOrchestraScoreDocument(options);
	const json = stringifyOrchestraScore(document);
	return {
		document,
		json,
		blob: new Blob([json], { type: 'application/json;charset=utf-8' }),
		filename: `${filenameStem(options.filenameStem)}.score.json`
	};
}
