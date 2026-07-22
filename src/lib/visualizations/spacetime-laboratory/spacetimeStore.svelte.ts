import { getContext, setContext } from 'svelte';
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
	sanitizeState
} from './spacetimeState';

const CONTEXT_KEY = 'spacetime-laboratory-store';

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
		this.state = sanitizeState({
			...this.state,
			params: { ...this.state.params, [key]: value }
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
		this.state = { ...this.state, quality };
	}

	loadPreset(id: string) {
		this.state = applyPreset(this.state, id);
	}

	reset() {
		this.state = structuredClone(DEFAULT_STATE);
	}

	randomize() {
		this.setSky('seed', Math.floor(Math.random() * 999_999) + 1);
	}

	queryString(): string {
		return encodeStateToQuery(this.state);
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
