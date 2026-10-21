import { DEFAULT_SETTINGS, MODEL_VERSION, SCENARIOS, SOURCES } from './catalog';
import { compileRun, normalizeSettings } from './engine';
import type { Run, ScenarioId, Settings, Snapshot } from './types';

export interface ReplayState {
	readonly scenario: ScenarioId;
	readonly settings: Settings;
	readonly step: number;
}

export interface ExchangeReceipt {
	readonly version: 1;
	readonly model: string;
	readonly scenario: ScenarioId;
	readonly settings: Settings;
	readonly step: number;
	readonly snapshot: Snapshot;
	readonly assumptions: readonly string[];
	readonly sources: typeof SOURCES;
}

const REPLAY_VERSION = '1';
const MAX_SEARCH_LENGTH = 4096;
// Independent admission bound protects replay from absurd or future-incompatible
// indices. Valid admitted indices are then clamped to this compiled run's end.
const MAX_REPLAY_STEP = 64;
const SETTING_KEYS = Object.freeze([
	'identityKnown',
	'terminologyMapped',
	'authorized',
	'serviceAvailable'
] as const);
const OWNED_KEYS = new Set([
	'ohie_v',
	'ohie_s',
	'ohie_step',
	...SETTING_KEYS.map((key) => `ohie_${key}`)
]);

function boundedStep(value: number, run: Run): number {
	if (!Number.isFinite(value)) return 0;
	return Math.max(0, Math.min(Math.floor(value), MAX_REPLAY_STEP, run.snapshots.length - 1));
}

/** A canonical query string, without a leading question mark or other page state. */
export function encodeReplay(scenario: ScenarioId, settings: Settings, step: number): string {
	const run = compileRun(scenario, normalizeSettings(settings));
	const query = new URLSearchParams();
	query.set('ohie_v', REPLAY_VERSION);
	query.set('ohie_s', run.scenario);
	query.set('ohie_step', String(boundedStep(step, run)));
	for (const key of SETTING_KEYS) query.set(`ohie_${key}`, run.settings[key] ? '1' : '0');
	return query.toString();
}

/**
 * Restore only exact versioned, allowlisted replay fields. Missing, duplicate or
 * malformed owned fields reject the replay. Other page query fields are ignored.
 * A valid index beyond this scenario's last step resolves to its terminal step.
 */
export function decodeReplay(search: string): ReplayState | null {
	if (typeof search !== 'string' || search.length > MAX_SEARCH_LENGTH) return null;
	const query = new URLSearchParams(search);
	for (const key of query.keys()) {
		if (key.startsWith('ohie_') && !OWNED_KEYS.has(key)) return null;
	}
	for (const key of OWNED_KEYS) {
		if (query.getAll(key).length !== 1) return null;
	}
	if (query.get('ohie_v') !== REPLAY_VERSION) return null;
	const scenario = SCENARIOS.find((item) => item.id === query.get('ohie_s'))?.id;
	if (!scenario) return null;
	const rawStep = query.get('ohie_step')!;
	if (!/^(0|[1-9]\d{0,1})$/.test(rawStep)) return null;
	const step = Number(rawStep);
	if (step > MAX_REPLAY_STEP) return null;
	const settings = { ...DEFAULT_SETTINGS };
	for (const key of SETTING_KEYS) {
		const value = query.get(`ohie_${key}`);
		if (value !== '0' && value !== '1') return null;
		settings[key] = value === '1';
	}
	const run = compileRun(scenario, settings);
	return Object.freeze({
		scenario,
		settings: run.settings,
		step: boundedStep(step, run)
	});
}

/**
 * Export the same immutable synthetic snapshot that the viewer inspects. The
 * receipt does not simulate a new query or manufacture an outcome at export.
 */
export function exchangeReceipt(run: Run, step: number): ExchangeReceipt {
	const snapshot = run.snapshots[boundedStep(step, run)];
	return Object.freeze({
		version: 1,
		model: MODEL_VERSION,
		scenario: run.scenario,
		settings: run.settings,
		step: snapshot.step,
		snapshot,
		assumptions: run.assumptions,
		sources: SOURCES
	});
}
