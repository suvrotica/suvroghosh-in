import type { PaintSettings } from './brush';
import { DEFAULT_SEED, SCENE_FAMILIES, type SceneFamily } from './scene';

export const STUDIO_PATH = '/blog/visualizations/bengali-life-through-impressionist-brushstrokes';
export const STUDIO_TITLE = 'Bengali Life Through Impressionist Brushstrokes';
export const ARTICLE_PATH =
	'/blog/visualizations/bengali-life-through-impressionist-brushstrokes-essay';
export const VERSION = 1;
export const STORAGE_KEY = 'bengali-impressionism:1';

export const SCENES = SCENE_FAMILIES;

export type View = 'adaptive' | 'landscape' | 'portrait';
export type StudioState = PaintSettings & {
	family: SceneFamily;
	seed: string;
	seconds: number;
	view: View;
};

export const DEFAULT_PAINT = {
	brushSize: 45,
	density: 65,
	warmth: 58,
	softness: 35,
	texture: 55,
	seconds: 10
};

export const DEFAULT_STATE: StudioState = {
	...DEFAULT_PAINT,
	family: 'street',
	seed: DEFAULT_SEED,
	view: 'adaptive'
};

const QUERY_FIELDS = {
	family: 'scene',
	seed: 'seed',
	brushSize: 'brush',
	density: 'density',
	warmth: 'warmth',
	softness: 'softness',
	texture: 'texture',
	seconds: 'time',
	view: 'view'
} satisfies Record<keyof StudioState, string>;

export function validSeed(seed: unknown): seed is string {
	return typeof seed === 'string' && /^[a-z0-9_-]{1,36}$/i.test(seed);
}

export function readState(input: unknown): StudioState {
	const values =
		input && typeof input === 'object'
			? (input as Partial<Record<keyof StudioState, unknown>>)
			: {};
	function number(key: keyof typeof DEFAULT_PAINT, min = 0, max = 100) {
		const value = values[key];
		const parsed = typeof value === 'string' && /^\d{1,3}$/.test(value) ? Number(value) : value;
		return typeof parsed === 'number' && Number.isInteger(parsed)
			? Math.max(min, Math.min(max, parsed))
			: DEFAULT_PAINT[key];
	}
	return {
		family:
			typeof values.family === 'string' && Object.hasOwn(SCENES, values.family)
				? (values.family as SceneFamily)
				: DEFAULT_STATE.family,
		seed: validSeed(values.seed) ? values.seed : DEFAULT_STATE.seed,
		brushSize: number('brushSize'),
		density: number('density'),
		warmth: number('warmth'),
		softness: number('softness'),
		texture: number('texture'),
		seconds: number('seconds', 4, 20),
		view: values.view === 'landscape' || values.view === 'portrait' ? values.view : 'adaptive'
	};
}

export function stateFromQuery(query: URLSearchParams) {
	if (query.has('v') && query.get('v') !== String(VERSION)) return undefined;
	const entries = Object.entries(QUERY_FIELDS).filter(([, name]) => query.has(name));
	if (!entries.length && !query.has('v')) return undefined;
	return readState(Object.fromEntries(entries.map(([key, name]) => [key, query.get(name)])));
}

export function stateQuery(state: StudioState, resume = false) {
	const query = new URLSearchParams({ v: String(VERSION) });
	for (const key of Object.keys(QUERY_FIELDS) as (keyof StudioState)[]) {
		query.set(QUERY_FIELDS[key], String(state[key]));
	}
	if (resume) query.set('resume', '1');
	return query.toString();
}

export function outputSize(aspect: number, longSide: number) {
	return aspect >= 1
		? { width: longSide, height: Math.max(1, Math.round(longSide / aspect)) }
		: { width: Math.max(1, Math.round(longSide * aspect)), height: longSide };
}
