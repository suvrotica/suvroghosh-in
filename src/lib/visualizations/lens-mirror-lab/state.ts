import {
	defaultParameters,
	effects,
	parameterBounds,
	sanitiseParameters,
	type EffectId,
	type Parameters
} from './model';

export const sampleIds = ['calibration', 'facade', 'portrait', 'corridor', 'typography'] as const;
export type SampleId = (typeof sampleIds)[number];
export interface LabState {
	sample: SampleId;
	effect: EffectId;
	parameters: Parameters;
}

export function parseState(search: string | URLSearchParams): LabState {
	const query = typeof search === 'string' ? new URLSearchParams(search) : search;
	const rawEffect = query.get('effect');
	const effect = effects.some((entry) => entry.id === rawEffect)
		? (rawEffect as EffectId)
		: 'barrel';
	const rawSample = query.get('sample');
	const sample = sampleIds.includes(rawSample as SampleId)
		? (rawSample as SampleId)
		: 'calibration';
	const input: Partial<Parameters> = defaultParameters(effect);
	for (const key of Object.keys(parameterBounds) as (keyof typeof parameterBounds)[]) {
		const value = query.get(key);
		if (value !== null && value.trim() !== '') input[key] = Number(value);
	}
	if (query.has('axis')) input.axis = query.get('axis') === 'vertical' ? 'vertical' : 'horizontal';
	if (query.has('mirror')) input.mirror = query.get('mirror') === '1';
	input.advanced = query.get('advanced') === '1';
	return { sample, effect, parameters: sanitiseParameters(input, effect) };
}

/** Only allowlisted built-in IDs and bounded scalar settings enter a shared link. */
export function serialiseState(state: LabState): URLSearchParams {
	const safe = parseState(new URLSearchParams({ sample: state.sample, effect: state.effect }));
	const p = sanitiseParameters(state.parameters, safe.effect);
	const query = new URLSearchParams({ sample: safe.sample, effect: safe.effect });
	for (const key of Object.keys(parameterBounds) as (keyof typeof parameterBounds)[])
		query.set(key, String(Number(p[key].toFixed(4))));
	query.set('axis', p.axis);
	query.set('mirror', p.mirror ? '1' : '0');
	query.set('advanced', p.advanced ? '1' : '0');
	return query;
}

export const serializeState = serialiseState;
export const encodeState = serialiseState;
export const decodeState = parseState;
