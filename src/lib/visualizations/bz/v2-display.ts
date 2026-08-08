import { assertValidBZFieldState } from './initial-conditions';
import { computeBZDerivativeTerms } from './solver';
import { assertValidBZSetup } from './validation';
import { bzPhaseAt } from './v2-analysis';
import {
	BZ_V2_DISPLAY_VERSION,
	type BZDisplayProfileV2,
	type BZFerroinMixV2,
	type BZLuminousMixV2,
	type BZV2FixedRange,
	type BZV2PhaseCoordinate,
	type BZV2RangeMode
} from './v2-types';
import type { BZFieldState, BZPalette, BZSetup, BZViewMode } from './types';

const TAU = 2 * Math.PI;
const MAXIMUM_OUTPUT_PIXELS = 67_108_864;

export type BZDisplayViewV2 =
	| BZViewMode
	| 'ferroin-proxy'
	| 'luminous-composite'
	| 'phase'
	| 'front'
	| 'refractory';

export type BZDisplayInterpolationV2 = 'mask-aware-bilinear' | 'raw-cell';
export type BZDisplayRangeKeyV2 = keyof BZDisplayProfileV2['ranges'];

/**
 * The serialisable V2 display-profile contract. Every value affects
 * presentation only; no solver accepts this object.
 */
export type BZRenderProfileV2 = BZDisplayProfileV2;

export type { BZFerroinMixV2, BZLuminousMixV2 } from './v2-types';

export interface BZDisplayViewMetadataV2 {
	readonly label: string;
	readonly quantity: string;
	readonly signed: boolean;
	readonly description: string;
	readonly rangeKey: BZDisplayRangeKeyV2 | null;
}

export const BZ_VIEW_METADATA_V2: Readonly<Record<BZDisplayViewV2, BZDisplayViewMetadataV2>> =
	Object.freeze({
		dish: {
			label: 'Profile composite',
			quantity: '(u, v, |∇u|)',
			signed: false,
			description: 'The selected profile maps the same numerical state into representative colour.',
			rangeKey: null
		},
		'ferroin-proxy': {
			label: 'Ferroin-inspired representative colour',
			quantity: '(u, v, |∇u|)',
			signed: false,
			description:
				'A disclosed display proxy; pixels are not measured ferroin or ferriin concentrations.',
			rangeKey: null
		},
		'luminous-composite': {
			label: 'Luminous phase composite',
			quantity: '(phase, u, v, |∇u|)',
			signed: false,
			description: 'A display transformation in linear light; the numerical state is unchanged.',
			rangeKey: null
		},
		u: {
			label: 'Fast field u',
			quantity: 'u',
			signed: false,
			description: 'The unmodified activator-like numerical field.',
			rangeKey: 'u'
		},
		v: {
			label: 'Recovery field v',
			quantity: 'v',
			signed: false,
			description: 'The unmodified recovery-like numerical field.',
			rangeKey: 'v'
		},
		'reaction-u': {
			label: 'Reaction contribution',
			quantity: 'Rᵤ',
			signed: true,
			description: 'The local reaction contribution to the instantaneous u derivative.',
			rangeKey: 'reaction-u'
		},
		'diffusion-u': {
			label: 'Diffusion contribution',
			quantity: 'Dᵤ∇²u',
			signed: true,
			description: 'The signed five-point diffusion contribution to the u derivative.',
			rangeKey: 'diffusion-u'
		},
		'net-u': {
			label: 'Net u derivative',
			quantity: '∂u/∂t',
			signed: true,
			description: 'Reaction and diffusion contributions added without a numerical clamp.',
			rangeKey: 'net-u'
		},
		phase: {
			label: 'Calibrated phase',
			quantity: 'atan2((v-v₀)/sᵥ, (u-u₀)/sᵤ)',
			signed: false,
			description: 'Phase relative to the fixed centre and scales disclosed by the profile.',
			rangeKey: 'phase'
		},
		front: {
			label: 'Wavefront indicator',
			quantity: '|∇u|',
			signed: false,
			description: 'The physical-space gradient magnitude of u with mask-aware no-flux neighbours.',
			rangeKey: 'front'
		},
		refractory: {
			label: 'Refractory coordinate',
			quantity: '(v-v₀)/sᵥ',
			signed: true,
			description: 'A fixed-profile recovery coordinate; it does not alter the v field.',
			rangeKey: 'refractory'
		},
		mask: {
			label: 'Physical mask',
			quantity: 'M',
			signed: false,
			description: 'Active chemistry, impermeable obstacles, and the exterior of the dish.',
			rangeKey: null
		},
		'difference-from-mean': {
			label: 'u minus active-area mean',
			quantity: 'u − ū',
			signed: true,
			description:
				'Spatial structure relative to the current active-area mean, shown on a fixed range.',
			rangeKey: 'difference-from-mean'
		}
	});

export const BZ_DISPLAY_RANGE_KEYS_V2: readonly BZDisplayRangeKeyV2[] = Object.freeze([
	'u',
	'v',
	'reaction-u',
	'diffusion-u',
	'net-u',
	'phase',
	'front',
	'refractory',
	'difference-from-mean'
]);

const fixedRange = (
	minimum: number,
	maximum: number,
	units: BZV2FixedRange['units']
): Readonly<BZV2FixedRange> => Object.freeze({ minimum, maximum, units });

/**
 * Reference ranges for the V2 Oregonator search family. A validated hero may clone
 * these and replace values from its calibration record; it must never silently auto-scale.
 */
export const BZ_OREGONATOR_REFERENCE_RANGES_V2 = Object.freeze({
	u: fixedRange(0, 0.82, 'dimensionless'),
	v: fixedRange(0, 0.3, 'dimensionless'),
	'reaction-u': fixedRange(-40, 40, 'dimensionless-rate'),
	'diffusion-u': fixedRange(-40, 40, 'dimensionless-rate'),
	'net-u': fixedRange(-40, 40, 'dimensionless-rate'),
	phase: fixedRange(-Math.PI, Math.PI, 'radians'),
	front: fixedRange(0, 5, 'dimensionless'),
	refractory: fixedRange(-0.1, 2.5, 'dimensionless'),
	'difference-from-mean': fixedRange(-0.3, 0.7, 'dimensionless')
}) satisfies BZDisplayProfileV2['ranges'];

export const BZ_OREGONATOR_REFERENCE_PHASE_V2: Readonly<BZV2PhaseCoordinate> = Object.freeze({
	// Fixed once for the promoted V2 search family from the sampled excitable
	// excursion. It is deliberately not recomputed from each displayed frame.
	centreU: 0.1,
	centreV: 0.1,
	scaleU: 0.42,
	scaleV: 0.12
});

interface ProfileOverrides {
	readonly id: string;
	readonly title: string;
	readonly style: BZDisplayProfileV2['style'];
	readonly palette: BZPalette;
	readonly disclosure: string;
	readonly exposure?: number;
	readonly bloom?: number;
	readonly highlight?: number;
	readonly saturation?: number;
	readonly contrast?: number;
	readonly gamma?: number;
	readonly bloomThreshold?: number;
	readonly bloomRadius?: number;
	readonly frontScale?: number;
	readonly phase?: Readonly<BZV2PhaseCoordinate>;
	readonly ranges?: BZDisplayProfileV2['ranges'];
	readonly defaultView?: BZViewMode;
	readonly ferroinMix?: Readonly<BZFerroinMixV2>;
	readonly luminousMix?: Readonly<BZLuminousMixV2>;
}

/** Creates a deeply immutable, validated fixed-range V2 renderer profile. */
export function createBZRenderProfileV2(overrides: Readonly<ProfileOverrides>): BZRenderProfileV2 {
	const sourceRanges = overrides.ranges ?? BZ_OREGONATOR_REFERENCE_RANGES_V2;
	const ranges = Object.fromEntries(
		Object.entries(sourceRanges).map(([key, range]) => [key, Object.freeze({ ...range })])
	) as BZDisplayProfileV2['ranges'];
	const profile: BZRenderProfileV2 = {
		id: overrides.id,
		title: overrides.title,
		version: BZ_V2_DISPLAY_VERSION,
		style: overrides.style,
		palette: overrides.palette,
		defaultView: overrides.defaultView ?? 'dish',
		rangeMode: 'fixed',
		ranges: Object.freeze(ranges),
		phase: Object.freeze({ ...(overrides.phase ?? BZ_OREGONATOR_REFERENCE_PHASE_V2) }),
		exposure: overrides.exposure ?? 1.25,
		bloom: overrides.bloom ?? 0.12,
		highlight: overrides.highlight ?? 0.58,
		saturation: overrides.saturation ?? 1.06,
		interpolation: 'mask-aware-manual-bilinear',
		toneMap: 'aces-fitted',
		outputTransfer: 'srgb',
		disclosure: overrides.disclosure,
		frontScale: overrides.frontScale ?? 0.2,
		contrast: overrides.contrast ?? 1.04,
		gamma: overrides.gamma ?? 1,
		bloomThreshold: overrides.bloomThreshold ?? 0.52,
		bloomRadius: overrides.bloomRadius ?? 1.7,
		ferroinMix: Object.freeze({
			recoveryWeight: 0.7,
			activatorLuminanceWeight: 0.34,
			gradientHighlightWeight: 0.5,
			...overrides.ferroinMix
		}),
		luminousMix: Object.freeze({
			phaseWeight: 0.78,
			recoveryWeight: 0.22,
			frontWeight: 0.44,
			...overrides.luminousMix
		})
	};
	assertValidBZRenderProfileV2(profile);
	return Object.freeze(profile);
}

export const BZ_LUMINOUS_REFERENCE_PROFILE_V2 = createBZRenderProfileV2({
	id: 'oregonator-luminous-reference-v2',
	title: 'Luminous Oregonator reference',
	style: 'luminous-composite',
	palette: 'ferroin',
	disclosure:
		'Luminous phase composite; fixed engineering reference ranges; display transformation only.'
});

export const BZ_FERROIN_REFERENCE_PROFILE_V2 = createBZRenderProfileV2({
	id: 'oregonator-ferroin-reference-v2',
	title: 'Ferroin-inspired Oregonator reference',
	style: 'ferroin-proxy',
	palette: 'ferroin',
	bloom: 0.07,
	highlight: 0.42,
	saturation: 1,
	disclosure:
		'Ferroin-inspired representative colour; pixels are not measured chemical concentrations.'
});

export const BZ_SCIENTIFIC_REFERENCE_PROFILE_V2 = createBZRenderProfileV2({
	id: 'oregonator-scientific-reference-v2',
	title: 'Scientific Oregonator reference',
	style: 'scientific',
	palette: 'scientific',
	defaultView: 'u',
	bloom: 0,
	highlight: 0,
	saturation: 1,
	exposure: 1,
	contrast: 1,
	disclosure: 'Fixed-range scientific field display; no bloom or chemical-colour claim.'
});

export const BZ_PHASE_REFERENCE_PROFILE_V2 = createBZRenderProfileV2({
	id: 'oregonator-phase-reference-v2',
	title: 'Oregonator phase reference',
	style: 'phase-spectrum',
	palette: 'phase-spectrum',
	bloom: 0,
	highlight: 0,
	saturation: 1,
	exposure: 1,
	contrast: 1,
	disclosure: 'Cyclic phase hue from the fixed profile centre and scales; diagnostic display only.'
});

export const BZ_DISPLAY_PROFILES_V2: readonly BZRenderProfileV2[] = Object.freeze([
	BZ_LUMINOUS_REFERENCE_PROFILE_V2,
	BZ_FERROIN_REFERENCE_PROFILE_V2,
	BZ_SCIENTIFIC_REFERENCE_PROFILE_V2,
	BZ_PHASE_REFERENCE_PROFILE_V2
]);

export function getBZDisplayProfileV2(id: string): BZRenderProfileV2 {
	const profile = BZ_DISPLAY_PROFILES_V2.find((candidate) => candidate.id === id);
	if (!profile) throw new RangeError(`Unknown BZ V2 display profile: ${id}`);
	return profile;
}

export function assertValidBZRenderProfileV2(profile: Readonly<BZRenderProfileV2>): void {
	if (!profile.id.trim() || !profile.title.trim() || !profile.disclosure.trim()) {
		throw new TypeError('A V2 display profile requires an id, title, and disclosure.');
	}
	if (profile.version !== BZ_V2_DISPLAY_VERSION) {
		throw new RangeError('The V2 display profile version is unsupported.');
	}
	if (profile.rangeMode !== 'fixed') {
		throw new RangeError('A calibrated V2 display profile must default to fixed ranges.');
	}
	if (
		profile.interpolation !== 'mask-aware-manual-bilinear' ||
		profile.toneMap !== 'aces-fitted' ||
		profile.outputTransfer !== 'srgb'
	) {
		throw new RangeError('The V2 interpolation, tone-map, or output-transfer contract is invalid.');
	}
	for (const key of BZ_DISPLAY_RANGE_KEYS_V2) {
		const range = profile.ranges[key];
		if (
			!range ||
			!Number.isFinite(range.minimum) ||
			!Number.isFinite(range.maximum) ||
			!(range.maximum > range.minimum)
		) {
			throw new RangeError(`The V2 ${key} display range must be finite and increasing.`);
		}
	}
	if (
		![
			profile.phase.centreU,
			profile.phase.centreV,
			profile.phase.scaleU,
			profile.phase.scaleV
		].every(Number.isFinite) ||
		!(profile.phase.scaleU > 0) ||
		!(profile.phase.scaleV > 0)
	) {
		throw new RangeError('The V2 phase coordinate is invalid.');
	}
	for (const [label, value, allowZero] of [
		['exposure', profile.exposure, false],
		['bloom', profile.bloom, true],
		['highlight', profile.highlight, true],
		['saturation', profile.saturation, false],
		['frontScale', profile.frontScale, false],
		['contrast', profile.contrast, false],
		['gamma', profile.gamma, false],
		['bloomThreshold', profile.bloomThreshold, true],
		['bloomRadius', profile.bloomRadius, true],
		['ferroin recovery weight', profile.ferroinMix.recoveryWeight, true],
		['ferroin activator weight', profile.ferroinMix.activatorLuminanceWeight, true],
		['ferroin gradient weight', profile.ferroinMix.gradientHighlightWeight, true],
		['luminous phase weight', profile.luminousMix.phaseWeight, true],
		['luminous recovery weight', profile.luminousMix.recoveryWeight, true],
		['luminous front weight', profile.luminousMix.frontWeight, true]
	] as const) {
		if (!Number.isFinite(value) || (allowZero ? value < 0 : value <= 0)) {
			throw new RangeError(`V2 display ${label} is invalid.`);
		}
	}
	if (profile.bloomThreshold > 1) {
		throw new RangeError('V2 display bloomThreshold must lie from zero to one.');
	}
}

export interface BZScalarDisplayFieldV2 {
	readonly view: Exclude<BZDisplayViewV2, 'dish' | 'ferroin-proxy' | 'luminous-composite'>;
	readonly values: Float64Array;
	readonly metadata: Readonly<BZDisplayViewMetadataV2>;
}

function activeMean(values: Float64Array, mask: Uint8Array): number {
	let sum = 0;
	let count = 0;
	for (let index = 0; index < values.length; index += 1) {
		if (!mask[index] || !Number.isFinite(values[index])) continue;
		sum += values[index];
		count += 1;
	}
	return count > 0 ? sum / count : 0;
}

function maskedNeighbour(
	field: Float64Array,
	state: Readonly<BZFieldState>,
	setup: Readonly<BZSetup>,
	row: number,
	column: number,
	centre: number
): number {
	let nextRow = row;
	let nextColumn = column;
	if (nextRow < 0 || nextRow >= state.size || nextColumn < 0 || nextColumn >= state.size) {
		if (setup.boundary !== 'periodic' || setup.geometry !== 'square') return centre;
		nextRow = (nextRow + state.size) % state.size;
		nextColumn = (nextColumn + state.size) % state.size;
	}
	const index = nextRow * state.size + nextColumn;
	return state.mask[index] ? field[index] : centre;
}

/** |grad u| in physical domain coordinates, with the same impermeable-mask semantics as the PDE. */
export function createBZFrontFieldV2(
	state: Readonly<BZFieldState>,
	setup: Readonly<BZSetup>
): Float64Array {
	assertValidBZFieldState(state);
	assertValidBZSetup(setup);
	if (state.size !== setup.gridSize) throw new RangeError('Field and BZ setup grid sizes differ.');
	const output = new Float64Array(state.u.length);
	const spacing = setup.domainSize / state.size;
	for (let row = 0; row < state.size; row += 1) {
		for (let column = 0; column < state.size; column += 1) {
			const index = row * state.size + column;
			if (!state.mask[index]) continue;
			const centre = state.u[index];
			const west = maskedNeighbour(state.u, state, setup, row, column - 1, centre);
			const east = maskedNeighbour(state.u, state, setup, row, column + 1, centre);
			const south = maskedNeighbour(state.u, state, setup, row - 1, column, centre);
			const north = maskedNeighbour(state.u, state, setup, row + 1, column, centre);
			output[index] = Math.hypot(east - west, north - south) / (2 * spacing);
		}
	}
	return output;
}

/** Pure field extraction for raw scientific inspection and publication metadata. */
export function createBZScalarDisplayFieldV2(
	state: Readonly<BZFieldState>,
	setup: Readonly<BZSetup>,
	view: BZScalarDisplayFieldV2['view'],
	profile: Readonly<BZRenderProfileV2> = BZ_SCIENTIFIC_REFERENCE_PROFILE_V2
): BZScalarDisplayFieldV2 {
	assertValidBZFieldState(state);
	assertValidBZSetup(setup);
	assertValidBZRenderProfileV2(profile);
	if (state.size !== setup.gridSize) throw new RangeError('Field and BZ setup grid sizes differ.');
	let values: Float64Array;
	if (view === 'u') {
		values = new Float64Array(state.u);
	} else if (view === 'v') {
		values = new Float64Array(state.v);
	} else if (view === 'reaction-u' || view === 'diffusion-u' || view === 'net-u') {
		const derivative = computeBZDerivativeTerms(state, setup);
		values =
			view === 'reaction-u'
				? derivative.reactionU
				: view === 'diffusion-u'
					? derivative.diffusionU
					: derivative.totalU;
	} else if (view === 'phase') {
		values = new Float64Array(state.u.length);
		values.fill(Number.NaN);
		for (let index = 0; index < values.length; index += 1) {
			if (state.mask[index])
				values[index] = bzPhaseAt(state.u[index], state.v[index], profile.phase);
		}
	} else if (view === 'front') {
		values = createBZFrontFieldV2(state, setup);
	} else if (view === 'refractory') {
		values = new Float64Array(state.v.length);
		for (let index = 0; index < values.length; index += 1) {
			values[index] = state.mask[index]
				? (state.v[index] - profile.phase.centreV) / profile.phase.scaleV
				: Number.NaN;
		}
	} else if (view === 'mask') {
		values = Float64Array.from(state.mask);
	} else {
		const mean = activeMean(state.u, state.mask);
		values = new Float64Array(state.u.length);
		values.fill(Number.NaN);
		for (let index = 0; index < values.length; index += 1) {
			if (state.mask[index]) values[index] = state.u[index] - mean;
		}
	}
	return { view, values, metadata: BZ_VIEW_METADATA_V2[view] };
}

export type BZSampleClassificationV2 = 'active' | 'obstacle' | 'outside' | 'failure';

export interface BZMaskAwareSampleV2 {
	readonly classification: BZSampleClassificationV2;
	readonly value: number | null;
	readonly activeWeight: number;
}

interface SampleOptions {
	readonly allowExteriorSupport?: boolean;
}

function coordinateClassification(
	state: Readonly<BZFieldState>,
	gridX: number,
	gridY: number,
	allowExteriorSupport: boolean
): BZSampleClassificationV2 {
	if (gridX < -0.5 || gridY < -0.5 || gridX > state.size - 0.5 || gridY > state.size - 0.5) {
		return 'outside';
	}
	const column = Math.max(0, Math.min(state.size - 1, Math.floor(gridX + 0.5)));
	const row = Math.max(0, Math.min(state.size - 1, Math.floor(gridY + 0.5)));
	const index = row * state.size + column;
	if (state.mask[index]) return 'active';
	if (state.domainMask[index]) return 'obstacle';
	return allowExteriorSupport ? 'active' : 'outside';
}

/**
 * Manual bilinear sampling for a display field. Inactive weights are discarded and
 * the remaining active weights are renormalised. An obstacle-owned output point never
 * receives values from the chemistry on either side of it.
 */
export function sampleBZFieldMaskAwareV2(
	values: Float64Array,
	state: Readonly<BZFieldState>,
	gridX: number,
	gridY: number,
	options: Readonly<SampleOptions> = {}
): BZMaskAwareSampleV2 {
	if (values.length !== state.size * state.size) {
		throw new RangeError('The sampled display field does not match the BZ grid.');
	}
	if (!Number.isFinite(gridX) || !Number.isFinite(gridY)) {
		throw new RangeError('Display sample coordinates must be finite.');
	}
	const classification = coordinateClassification(
		state,
		gridX,
		gridY,
		options.allowExteriorSupport === true
	);
	if (classification !== 'active') return { classification, value: null, activeWeight: 0 };

	const x = Math.max(0, Math.min(state.size - 1, gridX));
	const y = Math.max(0, Math.min(state.size - 1, gridY));
	const x0 = Math.floor(x);
	const y0 = Math.floor(y);
	const x1 = Math.min(state.size - 1, x0 + 1);
	const y1 = Math.min(state.size - 1, y0 + 1);
	const tx = x - x0;
	const ty = y - y0;
	const samples = [
		[x0, y0, (1 - tx) * (1 - ty)],
		[x1, y0, tx * (1 - ty)],
		[x0, y1, (1 - tx) * ty],
		[x1, y1, tx * ty]
	] as const;
	let weighted = 0;
	let activeWeight = 0;
	for (const [column, row, weight] of samples) {
		if (!(weight > 0)) continue;
		const index = row * state.size + column;
		if (!state.mask[index]) continue;
		const value = values[index];
		if (!Number.isFinite(value)) return { classification: 'failure', value: null, activeWeight };
		weighted += value * weight;
		activeWeight += weight;
	}
	return activeWeight > 0
		? { classification: 'active', value: weighted / activeWeight, activeWeight }
		: { classification: 'outside', value: null, activeWeight: 0 };
}

interface PairSampleV2 {
	readonly classification: BZSampleClassificationV2;
	readonly u: number | null;
	readonly v: number | null;
	readonly activeWeight: number;
}

function samplePairMaskAware(
	state: Readonly<BZFieldState>,
	gridX: number,
	gridY: number,
	interpolation: BZDisplayInterpolationV2,
	allowExteriorSupport: boolean
): PairSampleV2 {
	const classification = coordinateClassification(state, gridX, gridY, allowExteriorSupport);
	if (classification !== 'active') {
		return { classification, u: null, v: null, activeWeight: 0 };
	}
	if (interpolation === 'raw-cell') {
		const column = Math.max(0, Math.min(state.size - 1, Math.floor(gridX + 0.5)));
		const row = Math.max(0, Math.min(state.size - 1, Math.floor(gridY + 0.5)));
		const index = row * state.size + column;
		if (!state.mask[index]) {
			return {
				classification: state.domainMask[index] ? 'obstacle' : 'outside',
				u: null,
				v: null,
				activeWeight: 0
			};
		}
		return Number.isFinite(state.u[index]) && Number.isFinite(state.v[index])
			? { classification: 'active', u: state.u[index], v: state.v[index], activeWeight: 1 }
			: { classification: 'failure', u: null, v: null, activeWeight: 1 };
	}
	const u = sampleBZFieldMaskAwareV2(state.u, state, gridX, gridY, { allowExteriorSupport });
	if (u.classification !== 'active') {
		return { classification: u.classification, u: null, v: null, activeWeight: u.activeWeight };
	}
	const v = sampleBZFieldMaskAwareV2(state.v, state, gridX, gridY, { allowExteriorSupport });
	if (v.classification !== 'active') {
		return { classification: v.classification, u: null, v: null, activeWeight: v.activeWeight };
	}
	return { classification: 'active', u: u.value, v: v.value, activeWeight: u.activeWeight };
}

function sampleDisplayField(
	values: Float64Array,
	state: Readonly<BZFieldState>,
	gridX: number,
	gridY: number,
	interpolation: BZDisplayInterpolationV2,
	allowExteriorSupport: boolean
): BZMaskAwareSampleV2 {
	if (interpolation === 'mask-aware-bilinear') {
		return sampleBZFieldMaskAwareV2(values, state, gridX, gridY, { allowExteriorSupport });
	}
	const classification = coordinateClassification(state, gridX, gridY, false);
	if (classification !== 'active') return { classification, value: null, activeWeight: 0 };
	const column = Math.max(0, Math.min(state.size - 1, Math.floor(gridX + 0.5)));
	const row = Math.max(0, Math.min(state.size - 1, Math.floor(gridY + 0.5)));
	const value = values[row * state.size + column];
	return Number.isFinite(value)
		? { classification: 'active', value, activeWeight: 1 }
		: { classification: 'failure', value: null, activeWeight: 1 };
}

function finiteExtent(
	values: Float64Array,
	mask: Uint8Array,
	signed: boolean,
	units: BZV2FixedRange['units']
): BZV2FixedRange {
	let minimum = Number.POSITIVE_INFINITY;
	let maximum = Number.NEGATIVE_INFINITY;
	for (let index = 0; index < values.length; index += 1) {
		if (!mask[index] || !Number.isFinite(values[index])) continue;
		minimum = Math.min(minimum, values[index]);
		maximum = Math.max(maximum, values[index]);
	}
	if (!Number.isFinite(minimum) || !Number.isFinite(maximum))
		return { minimum: 0, maximum: 1, units };
	if (signed) {
		const extent = Math.max(Math.abs(minimum), Math.abs(maximum), 1e-12);
		return { minimum: -extent, maximum: extent, units };
	}
	if (maximum - minimum < 1e-12) {
		const padding = Math.max(1e-6, Math.abs(maximum) * 1e-6);
		return { minimum: minimum - padding, maximum: maximum + padding, units };
	}
	return { minimum, maximum, units };
}

export interface BZRangeResolutionOptionsV2 {
	readonly rangeMode?: BZV2RangeMode;
	readonly globalRanges?: Readonly<Partial<Record<BZDisplayRangeKeyV2, BZV2FixedRange>>>;
}

/** Fixed is the default; auto is deliberately frame-local and explicit. */
export function resolveBZDisplayRangeV2(
	view: BZScalarDisplayFieldV2['view'],
	state: Readonly<BZFieldState>,
	setup: Readonly<BZSetup>,
	profile: Readonly<BZRenderProfileV2>,
	options: Readonly<BZRangeResolutionOptionsV2> = {},
	preparedField?: Readonly<BZScalarDisplayFieldV2>
): Readonly<BZV2FixedRange> | null {
	const key = BZ_VIEW_METADATA_V2[view].rangeKey;
	if (!key) return view === 'mask' ? fixedRange(0, 1, 'dimensionless') : null;
	const mode = options.rangeMode ?? profile.rangeMode;
	if (mode === 'fixed') {
		const range = profile.ranges[key];
		if (!range) throw new RangeError(`Display profile ${profile.id} has no ${key} range.`);
		return range;
	}
	if (mode === 'global') {
		const range = options.globalRanges?.[key];
		if (!range) throw new RangeError(`Global ${key} display range was not supplied.`);
		if (
			!Number.isFinite(range.minimum) ||
			!Number.isFinite(range.maximum) ||
			range.maximum <= range.minimum
		) {
			throw new RangeError(`Global ${key} display range is invalid.`);
		}
		return range;
	}
	const field = preparedField ?? createBZScalarDisplayFieldV2(state, setup, view, profile);
	const units = profile.ranges[key]?.units ?? (key === 'phase' ? 'radians' : 'dimensionless');
	return finiteExtent(field.values, state.mask, BZ_VIEW_METADATA_V2[view].signed, units);
}

type LinearRgb = readonly [number, number, number];

export interface BZLinearColourStopV2 {
	readonly position: number;
	readonly linear: LinearRgb;
}

export function srgbChannelToLinearV2(value: number): number {
	const bounded = Math.max(0, Math.min(1, value));
	return bounded <= 0.04045 ? bounded / 12.92 : ((bounded + 0.055) / 1.055) ** 2.4;
}

export function linearChannelToSrgbV2(value: number): number {
	const bounded = Math.max(0, Math.min(1, value));
	return bounded <= 0.0031308 ? 12.92 * bounded : 1.055 * bounded ** (1 / 2.4) - 0.055;
}

function linearFromBytes(red: number, green: number, blue: number): LinearRgb {
	return [
		srgbChannelToLinearV2(red / 255),
		srgbChannelToLinearV2(green / 255),
		srgbChannelToLinearV2(blue / 255)
	];
}

const colourStop = (
	position: number,
	bytes: readonly [number, number, number]
): BZLinearColourStopV2 =>
	Object.freeze({ position, linear: Object.freeze(linearFromBytes(...bytes)) });

/** Shared declarative stops are suitable for generating the CPU and GPU lookup tables. */
export const BZ_PHASE_CYCLE_STOPS_V2: readonly BZLinearColourStopV2[] = Object.freeze([
	colourStop(0, [159, 9, 35]),
	colourStop(0.18, [111, 7, 47]),
	colourStop(0.4, [82, 19, 91]),
	colourStop(0.63, [35, 22, 104]),
	colourStop(0.82, [13, 53, 142]),
	colourStop(1, [159, 9, 35])
]);

export const BZ_FERROIN_RECOVERY_STOPS_V2: readonly BZLinearColourStopV2[] = Object.freeze([
	colourStop(0, [30, 2, 8]),
	colourStop(0.28, [122, 7, 31]),
	colourStop(0.58, [89, 16, 81]),
	colourStop(1, [17, 48, 139])
]);

export const BZ_SCIENTIFIC_STOPS_V2: readonly BZLinearColourStopV2[] = Object.freeze([
	colourStop(0, [4, 42, 86]),
	colourStop(0.5, [54, 138, 132]),
	colourStop(1, [250, 224, 82])
]);

export const BZ_HIGH_CONTRAST_STOPS_V2: readonly BZLinearColourStopV2[] = Object.freeze([
	colourStop(0, [0, 0, 0]),
	colourStop(0.5, [0, 196, 224]),
	colourStop(1, [255, 250, 230])
]);

export const BZ_CERIUM_STOPS_V2: readonly BZLinearColourStopV2[] = Object.freeze([
	colourStop(0, [24, 18, 12]),
	colourStop(0.55, [151, 80, 30]),
	colourStop(1, [255, 226, 102])
]);

export const BZ_DIVERGING_STOPS_V2: readonly BZLinearColourStopV2[] = Object.freeze([
	colourStop(0, [34, 86, 176]),
	colourStop(0.5, [226, 225, 216]),
	colourStop(1, [184, 43, 42])
]);

function clamp01(value: number): number {
	return Math.max(0, Math.min(1, value));
}

function mixLinear(low: LinearRgb, high: LinearRgb, amount: number): LinearRgb {
	const t = clamp01(amount);
	return [
		low[0] + (high[0] - low[0]) * t,
		low[1] + (high[1] - low[1]) * t,
		low[2] + (high[2] - low[2]) * t
	];
}

function sampleStops(stops: readonly BZLinearColourStopV2[], value: number): LinearRgb {
	const t = clamp01(value);
	for (let index = 1; index < stops.length; index += 1) {
		if (t <= stops[index].position) {
			const lower = stops[index - 1];
			const upper = stops[index];
			const width = upper.position - lower.position;
			return mixLinear(lower.linear, upper.linear, width > 0 ? (t - lower.position) / width : 0);
		}
	}
	return stops.at(-1)!.linear;
}

export function sampleBZPhaseColourLinearV2(phase: number): LinearRgb {
	const cycle = (((phase / TAU) % 1) + 1) % 1;
	return sampleStops(BZ_PHASE_CYCLE_STOPS_V2, cycle);
}

export function createBZPhaseLutV2(samples = 256): Float32Array {
	if (!Number.isSafeInteger(samples) || samples < 2 || samples > 65_536) {
		throw new RangeError('The BZ phase LUT size must be an integer from 2 to 65536.');
	}
	const lut = new Float32Array(samples * 3);
	for (let index = 0; index < samples; index += 1) {
		const colour = sampleStops(BZ_PHASE_CYCLE_STOPS_V2, index / (samples - 1));
		lut[index * 3] = colour[0];
		lut[index * 3 + 1] = colour[1];
		lut[index * 3 + 2] = colour[2];
	}
	return lut;
}

function orderedColour(palette: BZPalette, value: number): LinearRgb {
	if (palette === 'cerium') return sampleStops(BZ_CERIUM_STOPS_V2, value);
	if (palette === 'high-contrast') return sampleStops(BZ_HIGH_CONTRAST_STOPS_V2, value);
	if (palette === 'ferroin') return sampleStops(BZ_FERROIN_RECOVERY_STOPS_V2, value);
	if (palette === 'phase-spectrum') return sampleBZPhaseColourLinearV2((value - 0.5) * TAU);
	return sampleStops(BZ_SCIENTIFIC_STOPS_V2, value);
}

export function sampleBZOrderedColourLinearV2(palette: BZPalette, value: number): LinearRgb {
	return orderedColour(palette, value);
}

export function createBZPaletteLutV2(palette: BZPalette, samples = 256): Float32Array {
	if (!Number.isSafeInteger(samples) || samples < 2 || samples > 65_536) {
		throw new RangeError('The BZ palette LUT size must be an integer from 2 to 65536.');
	}
	const lut = new Float32Array(samples * 3);
	for (let index = 0; index < samples; index += 1) {
		const colour = orderedColour(palette, index / (samples - 1));
		lut[index * 3] = colour[0];
		lut[index * 3 + 1] = colour[1];
		lut[index * 3 + 2] = colour[2];
	}
	return lut;
}

/** Shared signed scientific LUT for the GPU and CPU display paths. */
export function createBZDivergingLutV2(samples = 256): Float32Array {
	if (!Number.isSafeInteger(samples) || samples < 2 || samples > 65_536) {
		throw new RangeError('The BZ diverging LUT size must be an integer from 2 to 65536.');
	}
	const lut = new Float32Array(samples * 3);
	for (let index = 0; index < samples; index += 1) {
		const colour = sampleStops(BZ_DIVERGING_STOPS_V2, index / (samples - 1));
		lut[index * 3] = colour[0];
		lut[index * 3 + 1] = colour[1];
		lut[index * 3 + 2] = colour[2];
	}
	return lut;
}

function normalise(value: number, range: Readonly<BZV2FixedRange>): number {
	return clamp01((value - range.minimum) / (range.maximum - range.minimum));
}

function signedNormalise(value: number, range: Readonly<BZV2FixedRange>): number {
	if (value < 0) {
		return 0.5 * clamp01((value - range.minimum) / Math.max(1e-14, -range.minimum));
	}
	return 0.5 + 0.5 * clamp01(value / Math.max(1e-14, range.maximum));
}

function addLinear(left: LinearRgb, right: LinearRgb, scale = 1): LinearRgb {
	return [left[0] + right[0] * scale, left[1] + right[1] * scale, left[2] + right[2] * scale];
}

function scaleLinear(colour: LinearRgb, scale: number): LinearRgb {
	return [colour[0] * scale, colour[1] * scale, colour[2] * scale];
}

function luminousColour(
	u: number,
	v: number,
	front: number,
	profile: Readonly<BZRenderProfileV2>,
	ranges: Readonly<Record<'u' | 'v' | 'front', BZV2FixedRange>>
): LinearRgb {
	const uAmount = normalise(u, ranges.u);
	const vAmount = normalise(v, ranges.v);
	const phase = bzPhaseAt(u, v, profile.phase);
	const phaseColour = sampleBZPhaseColourLinearV2(phase);
	const recoveryColour = sampleStops(BZ_FERROIN_RECOVERY_STOPS_V2, vAmount);
	const weightTotal = Math.max(
		1e-12,
		profile.luminousMix.phaseWeight + profile.luminousMix.recoveryWeight
	);
	let colour = mixLinear(
		phaseColour,
		recoveryColour,
		profile.luminousMix.recoveryWeight / weightTotal
	);
	colour = scaleLinear(colour, 0.34 + 0.82 * uAmount + 0.16 * vAmount);
	const frontAmount = Math.max(normalise(front, ranges.front), clamp01(front * profile.frontScale));
	const warm = linearFromBytes(255, 92, 46);
	return addLinear(colour, warm, frontAmount * profile.luminousMix.frontWeight * profile.highlight);
}

function ferroinColour(
	u: number,
	v: number,
	front: number,
	profile: Readonly<BZRenderProfileV2>,
	ranges: Readonly<Record<'u' | 'v' | 'front', BZV2FixedRange>>
): LinearRgb {
	const uAmount = normalise(u, ranges.u);
	const vAmount = normalise(v, ranges.v);
	let colour = sampleStops(BZ_FERROIN_RECOVERY_STOPS_V2, vAmount);
	colour = scaleLinear(
		colour,
		0.42 +
			profile.ferroinMix.recoveryWeight * vAmount +
			profile.ferroinMix.activatorLuminanceWeight * uAmount
	);
	const frontAmount = Math.max(normalise(front, ranges.front), clamp01(front * profile.frontScale));
	return addLinear(
		colour,
		linearFromBytes(255, 105, 57),
		frontAmount * profile.ferroinMix.gradientHighlightWeight * profile.highlight
	);
}

function acesFitted(value: number): number {
	const x = Math.max(0, value);
	return clamp01((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14));
}

function toneMapLinear(colour: LinearRgb, profile: Readonly<BZRenderProfileV2>): LinearRgb {
	const luma = colour[0] * 0.2126 + colour[1] * 0.7152 + colour[2] * 0.0722;
	const saturated: LinearRgb = [
		Math.max(0, luma + (colour[0] - luma) * profile.saturation),
		Math.max(0, luma + (colour[1] - luma) * profile.saturation),
		Math.max(0, luma + (colour[2] - luma) * profile.saturation)
	];
	return [
		acesFitted(saturated[0] ** profile.contrast * profile.exposure) ** (1 / profile.gamma),
		acesFitted(saturated[1] ** profile.contrast * profile.exposure) ** (1 / profile.gamma),
		acesFitted(saturated[2] ** profile.contrast * profile.exposure) ** (1 / profile.gamma)
	];
}

function smoothstep(low: number, high: number, value: number): number {
	const amount = clamp01((value - low) / Math.max(1e-14, high - low));
	return amount * amount * (3 - 2 * amount);
}

function outputDimension(value: number | undefined, fallback: number, label: string): number {
	const dimension = value ?? fallback;
	if (!Number.isSafeInteger(dimension) || dimension < 1 || dimension > 8192) {
		throw new RangeError(`${label} must be an integer from 1 to 8192.`);
	}
	return dimension;
}

export interface BZRenderOptionsV2 extends BZRangeResolutionOptionsV2 {
	readonly profile?: Readonly<BZRenderProfileV2>;
	readonly view?: BZDisplayViewV2;
	readonly width?: number;
	readonly height?: number;
	readonly interpolation?: BZDisplayInterpolationV2;
	readonly bloom?: boolean;
	readonly glass?: boolean;
}

export interface BZPixelBufferV2 {
	readonly width: number;
	readonly height: number;
	readonly data: Uint8ClampedArray;
	readonly profileId: string;
	readonly view: BZDisplayViewV2;
	readonly rangeMode: BZV2RangeMode;
}

function blurScalar(
	source: Float32Array,
	width: number,
	height: number,
	radius: number
): Float32Array {
	if (radius < 1) return source;
	const horizontal = new Float32Array(source.length);
	const output = new Float32Array(source.length);
	for (let row = 0; row < height; row += 1) {
		for (let column = 0; column < width; column += 1) {
			let sum = 0;
			let weightSum = 0;
			for (let offset = -radius; offset <= radius; offset += 1) {
				const sampleColumn = Math.max(0, Math.min(width - 1, column + offset));
				const weight = radius + 1 - Math.abs(offset);
				sum += source[row * width + sampleColumn] * weight;
				weightSum += weight;
			}
			horizontal[row * width + column] = sum / weightSum;
		}
	}
	for (let row = 0; row < height; row += 1) {
		for (let column = 0; column < width; column += 1) {
			let sum = 0;
			let weightSum = 0;
			for (let offset = -radius; offset <= radius; offset += 1) {
				const sampleRow = Math.max(0, Math.min(height - 1, row + offset));
				const weight = radius + 1 - Math.abs(offset);
				sum += horizontal[sampleRow * width + column] * weight;
				weightSum += weight;
			}
			output[row * width + column] = sum / weightSum;
		}
	}
	return output;
}

function compositeView(
	view: BZDisplayViewV2
): view is 'dish' | 'ferroin-proxy' | 'luminous-composite' {
	return view === 'dish' || view === 'ferroin-proxy' || view === 'luminous-composite';
}

function resolvedRange(
	key: BZDisplayRangeKeyV2,
	mode: BZV2RangeMode,
	profile: Readonly<BZRenderProfileV2>,
	globalRanges: BZRenderOptionsV2['globalRanges'],
	state: Readonly<BZFieldState>,
	setup: Readonly<BZSetup>,
	prepared: Readonly<Partial<Record<BZDisplayRangeKeyV2, BZScalarDisplayFieldV2>>>
): BZV2FixedRange {
	if (mode === 'fixed') return profile.ranges[key]!;
	if (mode === 'global') {
		const range = globalRanges?.[key];
		if (!range) throw new RangeError(`Global ${key} display range was not supplied.`);
		if (
			!Number.isFinite(range.minimum) ||
			!Number.isFinite(range.maximum) ||
			range.maximum <= range.minimum
		) {
			throw new RangeError(`Global ${key} display range is invalid.`);
		}
		return range;
	}
	const view = key as BZScalarDisplayFieldV2['view'];
	const field = prepared[key] ?? createBZScalarDisplayFieldV2(state, setup, view, profile);
	return resolveBZDisplayRangeV2(view, state, setup, profile, { rangeMode: 'auto' }, field)!;
}

/**
 * Deterministic publication/CPU renderer. It reads one numerical state, manually
 * interpolates display samples, builds colour in linear light, composites restrained
 * field-linked bloom, tone maps, and finally encodes sRGB bytes.
 */
export function renderBZPixelBufferV2(
	state: Readonly<BZFieldState>,
	setup: Readonly<BZSetup>,
	options: Readonly<BZRenderOptionsV2> = {}
): BZPixelBufferV2 {
	assertValidBZFieldState(state);
	assertValidBZSetup(setup);
	if (state.size !== setup.gridSize) throw new RangeError('Field and BZ setup grid sizes differ.');
	const profile = options.profile ?? BZ_LUMINOUS_REFERENCE_PROFILE_V2;
	assertValidBZRenderProfileV2(profile);
	const view = options.view ?? profile.defaultView;
	if (!BZ_VIEW_METADATA_V2[view]) throw new RangeError(`Unknown BZ V2 display view: ${view}`);
	const width = outputDimension(options.width, state.size, 'Display width');
	const height = outputDimension(options.height, state.size, 'Display height');
	if (width * height > MAXIMUM_OUTPUT_PIXELS)
		throw new RangeError('Display output exceeds the pixel budget.');
	const interpolation = options.interpolation ?? 'mask-aware-bilinear';
	const rangeMode = options.rangeMode ?? profile.rangeMode;
	const prepared: Partial<Record<BZDisplayRangeKeyV2, BZScalarDisplayFieldV2>> = {};
	const frontField =
		compositeView(view) || view === 'front' ? createBZFrontFieldV2(state, setup) : null;
	if (frontField)
		prepared.front = { view: 'front', values: frontField, metadata: BZ_VIEW_METADATA_V2.front };
	let scalarField: BZScalarDisplayFieldV2 | null = null;
	if (
		!compositeView(view) &&
		view !== 'mask' &&
		view !== 'phase' &&
		view !== 'refractory' &&
		view !== 'difference-from-mean'
	) {
		scalarField = createBZScalarDisplayFieldV2(state, setup, view, profile);
		const key = scalarField.metadata.rangeKey;
		if (key) prepared[key] = scalarField;
	}
	const uMean = view === 'difference-from-mean' ? activeMean(state.u, state.mask) : 0;
	const profileDishNeedsU = view === 'dish' && profile.style === 'scientific';
	const colourComposite =
		view === 'ferroin-proxy' ||
		view === 'luminous-composite' ||
		(view === 'dish' &&
			(profile.style === 'ferroin-proxy' || profile.style === 'luminous-composite'));
	const uRange =
		colourComposite || profileDishNeedsU || view === 'u'
			? resolvedRange('u', rangeMode, profile, options.globalRanges, state, setup, prepared)
			: profile.ranges.u!;
	const vRange =
		colourComposite || view === 'v'
			? resolvedRange('v', rangeMode, profile, options.globalRanges, state, setup, prepared)
			: profile.ranges.v!;
	const frontRange =
		colourComposite || view === 'front'
			? resolvedRange('front', rangeMode, profile, options.globalRanges, state, setup, prepared)
			: profile.ranges.front!;
	const preparedRanges = { u: uRange, v: vRange, front: frontRange };
	const scalarRange =
		scalarField && scalarField.metadata.rangeKey
			? resolvedRange(
					scalarField.metadata.rangeKey,
					rangeMode,
					profile,
					options.globalRanges,
					state,
					setup,
					prepared
				)
			: view === 'refractory'
				? resolvedRange(
						'refractory',
						rangeMode,
						profile,
						options.globalRanges,
						state,
						setup,
						prepared
					)
				: view === 'difference-from-mean'
					? resolvedRange(
							'difference-from-mean',
							rangeMode,
							profile,
							options.globalRanges,
							state,
							setup,
							prepared
						)
					: null;
	const base = new Float32Array(width * height * 3);
	const bloomSource = new Float32Array(width * height);
	const bench = linearFromBytes(7, 9, 13);
	const obstacleA = linearFromBytes(31, 35, 40);
	const obstacleB = linearFromBytes(47, 51, 55);
	const failure = linearFromBytes(255, 0, 255);
	const activeMask = linearFromBytes(226, 225, 216);
	const warmHighlight = linearFromBytes(255, 91, 43);
	const side = Math.min(width, height);
	const left = (width - side) / 2;
	const top = (height - side) / 2;
	const pixelFootprint = 1 / Math.max(1, side);
	const dishRadius = setup.activeRadius / setup.domainSize;
	const showGlass = options.glass !== false && compositeView(view);
	const useBloom = options.bloom !== false && compositeView(view) && profile.bloom > 0;

	for (let outputRow = 0; outputRow < height; outputRow += 1) {
		for (let outputColumn = 0; outputColumn < width; outputColumn += 1) {
			const pixelIndex = outputRow * width + outputColumn;
			const baseOffset = pixelIndex * 3;
			const fieldU = (outputColumn + 0.5 - left) / side;
			const fieldV = (outputRow + 0.5 - top) / side;
			if (fieldU < 0 || fieldU > 1 || fieldV < 0 || fieldV > 1) {
				base[baseOffset] = bench[0];
				base[baseOffset + 1] = bench[1];
				base[baseOffset + 2] = bench[2];
				continue;
			}
			const dx = fieldU - 0.5;
			const dy = fieldV - 0.5;
			const radius = Math.hypot(dx, dy);
			const coverage =
				setup.geometry === 'circular-dish'
					? smoothstep(-pixelFootprint, pixelFootprint, dishRadius - radius)
					: 1;
			const gridX = fieldU * state.size - 0.5;
			// Field row zero is the visual top, matching normalized intervention and
			// probe coordinates. WebGL's framebuffer is bottom-origin, so its parity
			// read reverses y while this top-origin pixel buffer does not.
			const gridY = fieldV * state.size - 0.5;
			const allowExteriorSupport =
				interpolation === 'mask-aware-bilinear' &&
				setup.geometry === 'circular-dish' &&
				coverage > 0;
			const pair = samplePairMaskAware(state, gridX, gridY, interpolation, allowExteriorSupport);
			let colour = bench;
			let frontAmount = 0;
			if (pair.classification === 'failure') {
				colour = failure;
			} else if (pair.classification === 'obstacle') {
				const column = Math.max(0, Math.min(state.size - 1, Math.floor(gridX + 0.5)));
				const row = Math.max(0, Math.min(state.size - 1, Math.floor(gridY + 0.5)));
				colour = (Math.floor(column / 2) + Math.floor(row / 2)) % 2 === 0 ? obstacleA : obstacleB;
			} else if (pair.classification === 'active' && pair.u !== null && pair.v !== null) {
				const frontSample = frontField
					? (sampleDisplayField(
							frontField,
							state,
							gridX,
							gridY,
							interpolation,
							allowExteriorSupport
						).value ?? 0)
					: 0;
				frontAmount = Math.max(
					normalise(frontSample, frontRange),
					clamp01(frontSample * profile.frontScale)
				);
				if (view === 'mask') {
					colour = activeMask;
				} else if (view === 'dish') {
					colour =
						profile.style === 'ferroin-proxy'
							? ferroinColour(pair.u, pair.v, frontSample, profile, preparedRanges)
							: profile.style === 'phase-spectrum'
								? sampleBZPhaseColourLinearV2(bzPhaseAt(pair.u, pair.v, profile.phase))
								: profile.style === 'scientific'
									? orderedColour(profile.palette, normalise(pair.u, uRange))
									: luminousColour(pair.u, pair.v, frontSample, profile, preparedRanges);
				} else if (view === 'ferroin-proxy') {
					colour = ferroinColour(pair.u, pair.v, frontSample, profile, preparedRanges);
				} else if (view === 'luminous-composite') {
					colour = luminousColour(pair.u, pair.v, frontSample, profile, preparedRanges);
				} else if (view === 'phase') {
					colour = sampleBZPhaseColourLinearV2(bzPhaseAt(pair.u, pair.v, profile.phase));
				} else {
					let value: number;
					if (view === 'u') value = pair.u;
					else if (view === 'v') value = pair.v;
					else if (view === 'refractory') {
						value = (pair.v - profile.phase.centreV) / profile.phase.scaleV;
					} else if (view === 'difference-from-mean') {
						value = pair.u - uMean;
					} else if (view === 'front') {
						value = frontSample;
					} else {
						const sample = scalarField
							? sampleDisplayField(
									scalarField.values,
									state,
									gridX,
									gridY,
									interpolation,
									allowExteriorSupport
								)
							: null;
						if (!sample || sample.classification !== 'active' || sample.value === null) {
							colour = failure;
							value = Number.NaN;
						} else value = sample.value;
					}
					if (Number.isFinite(value)) {
						const signed = BZ_VIEW_METADATA_V2[view].signed;
						colour = signed
							? sampleStops(BZ_DIVERGING_STOPS_V2, signedNormalise(value, scalarRange!))
							: orderedColour(profile.palette, normalise(value, scalarRange ?? uRange));
					}
				}
			}
			if (setup.geometry === 'circular-dish') colour = mixLinear(bench, colour, coverage);
			if (showGlass && setup.geometry === 'circular-dish') {
				const meniscus = smoothstep(dishRadius - 0.026, dishRadius, radius);
				const directional = 0.45 + 0.55 * clamp01((-dx + dy + 0.7) / 1.4);
				colour = addLinear(
					colour,
					linearFromBytes(126, 174, 194),
					meniscus * coverage * directional * 0.055
				);
				const rim =
					1 - smoothstep(pixelFootprint, pixelFootprint * 4.5, Math.abs(radius - dishRadius));
				colour = addLinear(colour, linearFromBytes(151, 191, 206), rim * directional * 0.11);
			}
			base[baseOffset] = colour[0];
			base[baseOffset + 1] = colour[1];
			base[baseOffset + 2] = colour[2];
			if (useBloom)
				bloomSource[pixelIndex] = smoothstep(profile.bloomThreshold, 1, frontAmount) * coverage;
		}
	}

	const bloomRadius = useBloom
		? Math.max(1, Math.min(12, Math.round((profile.bloomRadius * side) / state.size)))
		: 0;
	const blurred = blurScalar(bloomSource, width, height, bloomRadius);
	const data = new Uint8ClampedArray(width * height * 4);
	for (let pixelIndex = 0; pixelIndex < width * height; pixelIndex += 1) {
		const baseOffset = pixelIndex * 3;
		let colour: LinearRgb = [base[baseOffset], base[baseOffset + 1], base[baseOffset + 2]];
		if (useBloom) colour = addLinear(colour, warmHighlight, blurred[pixelIndex] * profile.bloom);
		const mapped = toneMapLinear(colour, profile);
		const outputOffset = pixelIndex * 4;
		data[outputOffset] = Math.round(linearChannelToSrgbV2(mapped[0]) * 255);
		data[outputOffset + 1] = Math.round(linearChannelToSrgbV2(mapped[1]) * 255);
		data[outputOffset + 2] = Math.round(linearChannelToSrgbV2(mapped[2]) * 255);
		data[outputOffset + 3] = 255;
	}
	return { width, height, data, profileId: profile.id, view, rangeMode };
}

/** Alias used by deterministic asset generation to make the intended path explicit. */
export const renderBZPublicationPixelBufferV2 = renderBZPixelBufferV2;

export type BZCanvasV2 = HTMLCanvasElement | OffscreenCanvas;

export function renderBZToCanvasV2<Canvas extends BZCanvasV2>(
	canvas: Canvas,
	state: Readonly<BZFieldState>,
	setup: Readonly<BZSetup>,
	options: Readonly<BZRenderOptionsV2> = {}
): Canvas {
	const pixels = renderBZPixelBufferV2(state, setup, options);
	canvas.width = pixels.width;
	canvas.height = pixels.height;
	const context = canvas.getContext('2d', { alpha: false }) as
		| CanvasRenderingContext2D
		| OffscreenCanvasRenderingContext2D
		| null;
	if (!context) throw new Error('The browser could not create a 2D BZ V2 display canvas.');
	const image = context.createImageData(pixels.width, pixels.height);
	image.data.set(pixels.data);
	context.putImageData(image, 0, 0);
	return canvas;
}
