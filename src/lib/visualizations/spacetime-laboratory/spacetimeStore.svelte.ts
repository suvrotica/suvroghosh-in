import { getContext, setContext } from 'svelte';
import { SvelteURLSearchParams } from 'svelte/reactivity';
import {
	DEFAULT_STATE,
	type OverlayKey,
	type QualityLevel,
	type SpacetimeModel,
	type SpacetimeState
} from './spacetimeTypes';
import {
	applyPreset,
	decodeStateFromQuery,
	encodeStateToQuery,
	setFlrwCurvature,
	sanitizeState
} from './spacetimeState';

const CONTEXT_KEY = 'spacetime-laboratory-store';
/** Bound hand-edited presentation clocks to one simulated day. */
const MAX_SHARED_TIME_SECONDS = 86_400;

function sharedTime(value: number): number {
	return Math.min(MAX_SHARED_TIME_SECONDS, Math.max(0, Number.isFinite(value) ? value : 0));
}

/** Svelte-5 runes store shared by the lab shell, canvas, controls, and graphs. */
export class SpacetimeStore {
	state = $state<SpacetimeState>(structuredClone(DEFAULT_STATE));
	hydrated = $state(false);
	/** Simulation clock in seconds, advanced by the canvas when playing. */
	time = $state(0);
	/** Frames per second, updated once per second by the canvas. */
	fps = $state(0);

	constructor() {
		if (typeof window !== 'undefined') {
			this.state = decodeStateFromQuery(window.location.search);
			this.time = sharedTime(Number(new SvelteURLSearchParams(window.location.search).get('t')));
			this.hydrated = true;
		}
	}

	update(patch: Partial<SpacetimeState>) {
		this.state = sanitizeState({ ...this.state, ...patch });
	}

	setModel(model: SpacetimeModel) {
		this.state = sanitizeState({ ...this.state, model });
	}

	setParam<K extends keyof SpacetimeState['params']>(key: K, value: SpacetimeState['params'][K]) {
		let params = { ...this.state.params, [key]: value };
		if (key === 'flrwCurvature') {
			params = setFlrwCurvature(params, value as -1 | 0 | 1);
		}
		this.state = sanitizeState({
			...this.state,
			params
		});
	}

	setObserver<K extends keyof SpacetimeState['observer']>(
		key: K,
		value: SpacetimeState['observer'][K]
	) {
		this.state = sanitizeState({
			...this.state,
			observer: { ...this.state.observer, [key]: value }
		});
	}

	setOverlay(key: OverlayKey, value: boolean) {
		this.state = sanitizeState({
			...this.state,
			overlays: { ...this.state.overlays, [key]: value }
		});
	}

	setSky<K extends keyof SpacetimeState['sky']>(key: K, value: SpacetimeState['sky'][K]) {
		this.state = sanitizeState({ ...this.state, sky: { ...this.state.sky, [key]: value } });
	}

	setDisk<K extends keyof SpacetimeState['disk']>(key: K, value: SpacetimeState['disk'][K]) {
		this.state = sanitizeState({ ...this.state, disk: { ...this.state.disk, [key]: value } });
	}

	setQuality(quality: QualityLevel) {
		this.update({ quality });
	}

	loadPreset(id: string) {
		const next = applyPreset(this.state, id);
		if (next === this.state) return;
		this.state = next;
		this.state.observer.properTime = 0;
		this.time = 0;
		this.fps = 0;
	}

	reset() {
		this.state = structuredClone(DEFAULT_STATE);
		this.time = 0;
		this.fps = 0;
	}

	randomize() {
		this.setSky('seed', Math.floor(Math.random() * 999_999) + 1);
	}

	queryString(): string {
		const query = new SvelteURLSearchParams(encodeStateToQuery(this.state));
		query.set('t', String(sharedTime(this.time)));
		return query.toString();
	}
}

export function createSpacetimeStore(): SpacetimeStore {
	const store = new SpacetimeStore();
	setContext(CONTEXT_KEY, store);
	return store;
}

export function getSpacetimeStore(): SpacetimeStore {
	return getContext<SpacetimeStore>(CONTEXT_KEY);
}
