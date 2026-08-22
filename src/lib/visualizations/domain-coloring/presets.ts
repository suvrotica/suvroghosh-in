import type {
	BranchCut,
	CameraOrientation,
	CameraState,
	Complex,
	ComplexFeature,
	DomainBounds,
	DomainColoringPreset,
	FeatureFamily,
	FeatureKind,
	HeightSettings,
	OverlayState,
	RenderQuality,
	Viewport
} from './types';

const TAU = Math.PI * 2;
const MAX_GENERATED_FEATURES = 256;

type PresetDefinition = Omit<DomainColoringPreset, 'camera' | 'height' | 'quality' | 'overlays'> & {
	defaults?: {
		cameraDistance?: number;
		cameraOrientation?: CameraOrientation;
		logCap?: number;
		verticalScale?: number;
		componentScale?: number;
		componentCap?: number;
		quality?: RenderQuality;
		overlays?: Partial<OverlayState>;
	};
};

function view(centerRe: number, centerIm: number, spanRe: number, spanIm: number): Viewport {
	return { centerRe, centerIm, spanRe, spanIm };
}

function cameraFor(
	viewport: Viewport,
	distance: number,
	orientation: CameraOrientation = 'isometric'
): CameraState {
	const angles: Record<CameraOrientation, readonly [number, number]> = {
		isometric: [-Math.PI / 4, Math.atan(1 / Math.sqrt(2))],
		top: [0, Math.PI / 2],
		'front-real': [0, 0],
		'front-imaginary': [Math.PI / 2, 0]
	};
	const [azimuth, elevation] = angles[orientation];
	return {
		orientation,
		projection: 'orthographic',
		azimuth,
		elevation,
		distance,
		zoom: 1,
		targetX: viewport.centerRe,
		targetY: 0,
		targetZ: viewport.centerIm
	};
}

function heightSettings(
	logCap = 6,
	verticalScale = 0.65,
	componentScale = 1,
	componentCap = 6
): HeightSettings {
	return {
		lens: 'log-magnitude',
		compression: 'linear',
		verticalScale,
		logCap,
		componentScale,
		componentCap
	};
}

function overlaySettings(overrides: Partial<OverlayState> = {}): OverlayState {
	return {
		contours: true,
		grid: true,
		markers: true,
		mesh: false,
		lighting: true,
		caps: true,
		...overrides
	};
}

function preset(definition: PresetDefinition): DomainColoringPreset {
	const { defaults = {}, ...data } = definition;
	return {
		...data,
		camera: cameraFor(
			data.view,
			defaults.cameraDistance ?? Math.max(data.view.spanRe, data.view.spanIm) * 1.35,
			defaults.cameraOrientation
		),
		height: heightSettings(
			defaults.logCap,
			defaults.verticalScale,
			defaults.componentScale,
			defaults.componentCap
		),
		quality: defaults.quality ?? 'medium',
		overlays: overlaySettings(defaults.overlays)
	};
}

function feature(
	id: string,
	kind: FeatureKind,
	re: number,
	im: number,
	label: string,
	order?: number,
	note?: string
): ComplexFeature {
	return {
		id,
		kind,
		z: { re, im },
		label,
		...(order === undefined ? {} : { order }),
		...(note === undefined ? {} : { note })
	};
}

function cleanCoordinate(value: number): number {
	return Math.abs(value) < 1e-14 ? 0 : value;
}

function rootsOfUnity(
	count: number,
	kind: 'zero' | 'pole',
	idPrefix: string,
	phaseOffset = 0
): ComplexFeature[] {
	return Array.from({ length: count }, (_, index) => {
		const angle = (phaseOffset + TAU * index) / count;
		return feature(
			`${idPrefix}-${index}`,
			kind,
			cleanCoordinate(Math.cos(angle)),
			cleanCoordinate(Math.sin(angle)),
			`${kind === 'zero' ? 'Zero' : 'Pole'} ${index + 1} of ${count}`,
			1
		);
	});
}

function familyLimit(limit: number): number {
	if (!Number.isFinite(limit)) return MAX_GENERATED_FEATURES;
	return Math.max(0, Math.min(MAX_GENERATED_FEATURES, Math.floor(limit)));
}

function finiteBounds(bounds: DomainBounds): boolean {
	return (
		Number.isFinite(bounds.minRe) &&
		Number.isFinite(bounds.maxRe) &&
		Number.isFinite(bounds.minIm) &&
		Number.isFinite(bounds.maxIm) &&
		bounds.minRe <= bounds.maxRe &&
		bounds.minIm <= bounds.maxIm
	);
}

function integerWindow(first: number, last: number, limit: number, target: number): number[] {
	if (limit <= 0 || first > last) return [];
	const count = last - first + 1;
	if (count <= limit) return Array.from({ length: count }, (_, index) => first + index);
	const maximumStart = last - limit + 1;
	const start = Math.max(first, Math.min(maximumStart, Math.round(target) - Math.floor(limit / 2)));
	return Array.from({ length: limit }, (_, index) => start + index);
}

type PeriodicFamilyOptions = {
	id: string;
	kind: 'zero' | 'pole' | 'critical';
	description: string;
	axis: 'real' | 'imaginary';
	period: number;
	offset?: number;
	label: (index: number) => string;
	order?: number;
	excludeIndex?: number;
};

function periodicFamily(options: PeriodicFamilyOptions): FeatureFamily {
	return {
		id: options.id,
		kind: options.kind,
		description: options.description,
		nonExhaustive: true,
		generate(bounds, requestedLimit) {
			const limit = familyLimit(requestedLimit);
			if (!finiteBounds(bounds) || limit === 0) return [];
			const fixedAxisVisible =
				options.axis === 'real'
					? bounds.minIm <= 0 && bounds.maxIm >= 0
					: bounds.minRe <= 0 && bounds.maxRe >= 0;
			if (!fixedAxisVisible) return [];

			const minimum = options.axis === 'real' ? bounds.minRe : bounds.minIm;
			const maximum = options.axis === 'real' ? bounds.maxRe : bounds.maxIm;
			const centre = (minimum + maximum) / 2;
			const offset = options.offset ?? 0;
			const epsilon = Math.abs(options.period) * 1e-12;
			const first = Math.ceil((minimum - offset - epsilon) / options.period);
			const last = Math.floor((maximum - offset + epsilon) / options.period);
			const extra = options.excludeIndex === undefined ? 0 : 2;
			const indices = integerWindow(
				first,
				last,
				Math.min(MAX_GENERATED_FEATURES, limit + extra),
				(centre - offset) / options.period
			)
				.filter((index) => index !== options.excludeIndex)
				.slice(0, limit);

			return indices.map((index) => {
				const coordinate = cleanCoordinate(offset + options.period * index);
				return feature(
					`${options.id}-${index}`,
					options.kind,
					options.axis === 'real' ? coordinate : 0,
					options.axis === 'real' ? 0 : coordinate,
					options.label(index),
					options.order ?? 1
				);
			});
		}
	};
}

type ReciprocalFamilyOptions = {
	id: string;
	kind: 'zero' | 'critical';
	description: string;
	offset: number;
	indexFor: (sign: 1 | -1, nonnegativeIndex: number) => number;
	label: (index: number) => string;
};

/** Families x = +/- 1/(pi(j + offset)), including those accumulating at zero. */
function reciprocalRealFamily(options: ReciprocalFamilyOptions): FeatureFamily {
	return {
		id: options.id,
		kind: options.kind,
		description: options.description,
		nonExhaustive: true,
		generate(bounds, requestedLimit) {
			const limit = familyLimit(requestedLimit);
			if (!finiteBounds(bounds) || limit === 0 || bounds.minIm > 0 || bounds.maxIm < 0) {
				return [];
			}

			const candidates: ComplexFeature[] = [];
			const centre = (bounds.minRe + bounds.maxRe) / 2;
			const sampleCount = Math.min(MAX_GENERATED_FEATURES, limit * 2 + 4);
			for (const sign of [1, -1] as const) {
				const low = sign === 1 ? Math.max(0, bounds.minRe) : Math.max(0, -bounds.maxRe);
				const high = sign === 1 ? bounds.maxRe : -bounds.minRe;
				if (high <= 0) continue;
				const first = Math.max(0, Math.ceil(1 / (Math.PI * high) - options.offset - 1e-12));
				const finiteLast =
					low > 0
						? Math.floor(1 / (Math.PI * low) - options.offset + 1e-12)
						: Number.POSITIVE_INFINITY;
				if (Number.isFinite(finiteLast) && first > finiteLast) continue;

				const targetMagnitude = Math.max(
					Number.MIN_VALUE,
					sign * centre > 0 ? Math.abs(centre) : (low + high) / 2
				);
				const target = 1 / (Math.PI * targetMagnitude) - options.offset;
				const indices = Number.isFinite(finiteLast)
					? integerWindow(first, finiteLast, sampleCount, target)
					: Array.from({ length: sampleCount }, (_, index) => first + index);

				for (const nonnegativeIndex of indices) {
					const re = sign / (Math.PI * (nonnegativeIndex + options.offset));
					if (re < bounds.minRe - 1e-14 || re > bounds.maxRe + 1e-14) continue;
					const familyIndex = options.indexFor(sign, nonnegativeIndex);
					candidates.push(
						feature(
							`${options.id}-${familyIndex}`,
							options.kind,
							re,
							0,
							options.label(familyIndex),
							1
						)
					);
				}
			}

			return candidates
				.sort((left, right) => {
					const distance = Math.abs(left.z.re - centre) - Math.abs(right.z.re - centre);
					return distance || left.z.re - right.z.re;
				})
				.slice(0, limit);
		}
	};
}

const EXP_MINUS_ONE_ZEROS = periodicFamily({
	id: 'exp-minus-one-zeros',
	kind: 'zero',
	description: 'Simple zeros z = 2 pi i k, generated only in the visible bounds.',
	axis: 'imaginary',
	period: TAU,
	label: (index) => `Zero at 2πi × ${index}`
});

const SINE_ZEROS = periodicFamily({
	id: 'sine-zeros',
	kind: 'zero',
	description: 'Simple real zeros z = k pi, generated only in the visible bounds.',
	axis: 'real',
	period: Math.PI,
	label: (index) => `Zero at ${index}π`
});

const SINE_CRITICALS = periodicFamily({
	id: 'sine-criticals',
	kind: 'critical',
	description: 'Critical points z = pi/2 + k pi, generated only in the visible bounds.',
	axis: 'real',
	period: Math.PI,
	offset: Math.PI / 2,
	label: (index) => `Critical point at π/2 + ${index}π`
});

const TANGENT_ZEROS = periodicFamily({
	id: 'tangent-zeros',
	kind: 'zero',
	description: 'Simple real zeros z = k pi, generated only in the visible bounds.',
	axis: 'real',
	period: Math.PI,
	label: (index) => `Zero at ${index}π`
});

const TANGENT_POLES = periodicFamily({
	id: 'tangent-poles',
	kind: 'pole',
	description: 'Simple poles z = pi/2 + k pi, generated only in the visible bounds.',
	axis: 'real',
	period: Math.PI,
	offset: Math.PI / 2,
	label: (index) => `Pole at π/2 + ${index}π`
});

const SINC_ZEROS = periodicFamily({
	id: 'sinc-zeros',
	kind: 'zero',
	description: 'Simple zeros z = k pi for nonzero integers k.',
	axis: 'real',
	period: Math.PI,
	excludeIndex: 0,
	label: (index) => `Zero at ${index}π`
});

const RECIPROCAL_SINE_ZEROS = reciprocalRealFamily({
	id: 'reciprocal-sine-zeros',
	kind: 'zero',
	description: 'Simple zeros z = 1/(k pi), k nonzero, accumulating at the origin.',
	offset: 1,
	indexFor: (sign, index) => sign * (index + 1),
	label: (index) => `Zero at 1/(${index}π)`
});

const RECIPROCAL_SINE_CRITICALS = reciprocalRealFamily({
	id: 'reciprocal-sine-criticals',
	kind: 'critical',
	description: 'Critical points z = 1/(pi/2 + k pi), accumulating at the origin.',
	offset: 0.5,
	indexFor: (sign, index) => (sign === 1 ? index : -index - 1),
	label: (index) => `Critical point for k = ${index}`
});

const NEGATIVE_REAL_CUT: BranchCut = {
	kind: 'ray',
	origin: { re: 0, im: 0 },
	direction: { re: -1, im: 0 },
	label: 'Principal negative-real branch cut'
};

const SQRT_QUADRATIC_CUTS: readonly BranchCut[] = [
	{
		kind: 'segment',
		from: { re: -1, im: 0 },
		to: { re: 1, im: 0 },
		label: 'Preimage of the principal square-root cut on the real segment [-1, 1]'
	},
	{
		kind: 'real-preimage',
		label: 'Imaginary-axis part of the preimage of the principal square-root cut',
		test: (z: Complex) => z.re
	}
];

const THREE_ROOTS = rootsOfUnity(3, 'zero', 'cube-root-of-unity');
const FIVE_ROOTS = rootsOfUnity(5, 'zero', 'fifth-root-of-unity');
const FIFTH_NEGATIVE_ROOTS = rootsOfUnity(5, 'pole', 'fifth-root-of-minus-one', Math.PI);

export const DOMAIN_COLORING_PRESETS: readonly DomainColoringPreset[] = [
	preset({
		id: 'identity',
		label: 'Identity',
		expression: 'z',
		notation: 'f(z) = z',
		category: 'Start here',
		mathematicalClass: 'polynomial',
		holomorphic: true,
		summary: 'The reference map: output angle is input angle, and distance from zero is unchanged.',
		notice: 'One circuit around the origin gives one positive hue turn and one logarithmic well.',
		articleAnchor: '#how-to-read-the-landscape',
		view: view(0, 0, 4, 4),
		features: [feature('identity-zero', 'zero', 0, 0, 'Simple zero at the origin', 1)],
		defaults: { cameraDistance: 6, logCap: 5, verticalScale: 0.7 }
	}),
	preset({
		id: 'squaring',
		label: 'Squaring',
		expression: 'z^2',
		notation: 'f(z) = z²',
		category: 'Start here',
		mathematicalClass: 'polynomial',
		holomorphic: true,
		summary: 'Angles double, and the origin is a zero of order two.',
		notice: 'The hue winds twice and the log-magnitude well has twice the identity slope.',
		articleAnchor: '#wells-spires-and-multiplicity',
		view: view(0, 0, 4, 4),
		features: [
			feature('squaring-zero', 'zero', 0, 0, 'Double zero at the origin', 2),
			feature('squaring-critical', 'critical', 0, 0, 'Critical point coincident with the zero', 1)
		],
		defaults: { cameraDistance: 6, logCap: 7, verticalScale: 0.55 }
	}),
	preset({
		id: 'cubing',
		label: 'Cubing',
		expression: 'z^3',
		notation: 'f(z) = z³',
		category: 'Start here',
		mathematicalClass: 'polynomial',
		holomorphic: true,
		summary: 'A triple zero makes three hue turns and triples the local logarithmic slope.',
		notice: 'Compare its three turns and steep well with the identity and squaring examples.',
		articleAnchor: '#wells-spires-and-multiplicity',
		view: view(0, 0, 4, 4),
		features: [
			feature('cubing-zero', 'zero', 0, 0, 'Triple zero at the origin', 3),
			feature('cubing-critical', 'critical', 0, 0, 'Critical point of multiplicity two', 2)
		],
		defaults: { cameraDistance: 6, logCap: 8, verticalScale: 0.48 }
	}),
	preset({
		id: 'reciprocal',
		label: 'Reciprocal',
		expression: '1 / z',
		notation: 'f(z) = 1/z',
		category: 'Start here',
		mathematicalClass: 'meromorphic',
		holomorphic: true,
		summary: 'Inversion reverses phase and turns the origin into a simple pole.',
		notice: 'The well becomes a clipped spire and the hue order reverses.',
		articleAnchor: '#wells-spires-and-multiplicity',
		view: view(0, 0, 4, 4),
		features: [feature('reciprocal-pole', 'pole', 0, 0, 'Simple pole at the origin', 1)],
		defaults: { cameraDistance: 6, logCap: 5, verticalScale: 0.7 }
	}),
	preset({
		id: 'quadratic-pair',
		label: 'Two zeros and a saddle',
		expression: 'z^2 + 1',
		notation: 'f(z) = z² + 1',
		category: 'Zeros, poles, and critical points',
		mathematicalClass: 'polynomial',
		holomorphic: true,
		summary: 'Two simple zeros flank a finite critical saddle at the origin.',
		notice: 'The origin is critical because f′(0)=0, but it is neither a zero nor a pole.',
		articleAnchor: '#harmonic-terrain',
		view: view(0, 0, 4.5, 4.5),
		features: [
			feature('quadratic-pair-zero-plus', 'zero', 0, 1, 'Zero at +i', 1),
			feature('quadratic-pair-zero-minus', 'zero', 0, -1, 'Zero at −i', 1),
			feature('quadratic-pair-critical', 'critical', 0, 0, 'Finite critical point; f(0) = 1', 1)
		],
		defaults: { cameraDistance: 6.5, logCap: 6 }
	}),
	preset({
		id: 'roots-of-unity',
		label: 'Roots of unity',
		expression: 'z^3 - 1',
		notation: 'f(z) = z³ − 1',
		category: 'Zeros, poles, and critical points',
		mathematicalClass: 'polynomial',
		holomorphic: true,
		summary: 'Three simple zeros sit at the cube roots of one.',
		notice:
			'Each dark convergence point has one hue turn; the origin is a separate finite critical point.',
		articleAnchor: '#wells-spires-and-multiplicity',
		view: view(0, 0, 4, 4),
		features: [
			...THREE_ROOTS,
			feature('roots-of-unity-critical', 'critical', 0, 0, 'Critical point of multiplicity two', 2)
		],
		defaults: { cameraDistance: 6.5, logCap: 7, verticalScale: 0.55 }
	}),
	preset({
		id: 'fifth-roots',
		label: 'Five roots of unity',
		expression: 'z^5 - 1',
		notation: 'f(z) = z⁵ − 1',
		category: 'Zeros, poles, and critical points',
		mathematicalClass: 'polynomial',
		holomorphic: true,
		summary: 'Five simple zeros form a regular pentagon around a high-order critical point.',
		notice: 'The five wells share one symmetry while the origin is critical without being a zero.',
		articleAnchor: '#wells-spires-and-multiplicity',
		view: view(0, 0, 4, 4),
		features: [
			...FIVE_ROOTS,
			feature('fifth-roots-critical', 'critical', 0, 0, 'Critical point of multiplicity four', 4)
		],
		defaults: { cameraDistance: 6.5, logCap: 8, verticalScale: 0.45 }
	}),
	preset({
		id: 'mixed-multiplicity',
		label: 'Mixed multiplicities',
		expression: '(z-1)^2 * (z+1)^3',
		notation: 'f(z) = (z − 1)²(z + 1)³',
		category: 'Zeros, poles, and critical points',
		mathematicalClass: 'polynomial',
		holomorphic: true,
		summary: 'A double zero and a triple zero make visibly different wells and winding counts.',
		notice:
			'Count two turns at +1, three at −1, and find the additional finite critical point at 1/5.',
		articleAnchor: '#wells-spires-and-multiplicity',
		view: view(0, 0, 5, 4),
		features: [
			feature('mixed-zero-plus', 'zero', 1, 0, 'Double zero at +1', 2),
			feature('mixed-zero-minus', 'zero', -1, 0, 'Triple zero at −1', 3),
			feature(
				'mixed-critical-plus',
				'critical',
				1,
				0,
				'Critical point coincident with the double zero',
				1
			),
			feature(
				'mixed-critical-minus',
				'critical',
				-1,
				0,
				'Critical point coincident with the triple zero',
				2
			),
			feature(
				'mixed-critical-fifth',
				'critical',
				0.2,
				0,
				'Additional finite critical point at 1/5',
				1
			)
		],
		defaults: { cameraDistance: 7, logCap: 9, verticalScale: 0.42 }
	}),
	preset({
		id: 'rational-map',
		label: 'Balanced rational map',
		expression: '(z^2 - 1) / (z^2 + 1)',
		notation: 'f(z) = (z² − 1)/(z² + 1)',
		category: 'Zeros, poles, and critical points',
		mathematicalClass: 'meromorphic',
		holomorphic: true,
		summary: 'Two zeros on the real axis and two poles on the imaginary axis share one field.',
		notice: 'The finite critical point at zero lies between four opposing logarithmic sources.',
		articleAnchor: '#rational-functions-as-superposed-potentials',
		view: view(0, 0, 4.5, 4.5),
		features: [
			feature('rational-zero-plus', 'zero', 1, 0, 'Simple zero at +1', 1),
			feature('rational-zero-minus', 'zero', -1, 0, 'Simple zero at −1', 1),
			feature('rational-pole-plus', 'pole', 0, 1, 'Simple pole at +i', 1),
			feature('rational-pole-minus', 'pole', 0, -1, 'Simple pole at −i', 1),
			feature('rational-critical', 'critical', 0, 0, 'Finite critical point at the origin', 1)
		],
		defaults: { cameraDistance: 7, logCap: 6, verticalScale: 0.65 }
	}),
	preset({
		id: 'fifth-rational-map',
		label: 'Interlaced fifth powers',
		expression: '(z^5 - 1) / (z^5 + 1)',
		notation: 'f(z) = (z⁵ − 1)/(z⁵ + 1)',
		category: 'Zeros, poles, and critical points',
		mathematicalClass: 'meromorphic',
		holomorphic: true,
		summary: 'Five zeros and five poles alternate around the unit circle.',
		notice:
			'The zero and pole constellations interlace; the origin is a fourth-order finite critical point.',
		articleAnchor: '#rational-functions-as-superposed-potentials',
		view: view(0, 0, 4, 4),
		features: [
			...rootsOfUnity(5, 'zero', 'fifth-rational-zero'),
			...FIFTH_NEGATIVE_ROOTS,
			feature('fifth-rational-critical', 'critical', 0, 0, 'Critical point of multiplicity four', 4)
		],
		defaults: { cameraDistance: 6.5, logCap: 6, verticalScale: 0.62 }
	}),
	preset({
		id: 'five-poles',
		label: 'Five poles',
		expression: '1 / (z^5 - 1)',
		notation: 'f(z) = 1/(z⁵ − 1)',
		category: 'Zeros, poles, and critical points',
		mathematicalClass: 'meromorphic',
		holomorphic: true,
		summary: 'The fifth roots of unity become five simple poles.',
		notice: 'Each spire reverses winding; the origin remains a finite fourth-order critical point.',
		articleAnchor: '#rational-functions-as-superposed-potentials',
		view: view(0, 0, 4, 4),
		features: [
			...rootsOfUnity(5, 'pole', 'five-poles-root'),
			feature('five-poles-critical', 'critical', 0, 0, 'Critical point of multiplicity four', 4)
		],
		defaults: { cameraDistance: 6.5, logCap: 7, verticalScale: 0.55 }
	}),
	preset({
		id: 'cubic-critical',
		label: 'Cubic with turning points',
		expression: 'z^3 - 3*z',
		notation: 'f(z) = z³ − 3z',
		category: 'Zeros, poles, and critical points',
		mathematicalClass: 'polynomial',
		holomorphic: true,
		summary:
			'Three real zeros and two finite critical points separate multiplicity from local folding.',
		notice: 'The critical points at ±1 are finite saddles, while the zeros are at 0 and ±√3.',
		articleAnchor: '#harmonic-terrain',
		view: view(0, 0, 6, 4.5),
		features: [
			feature('cubic-critical-zero-left', 'zero', -Math.sqrt(3), 0, 'Simple zero at −√3', 1),
			feature('cubic-critical-zero-centre', 'zero', 0, 0, 'Simple zero at 0', 1),
			feature('cubic-critical-zero-right', 'zero', Math.sqrt(3), 0, 'Simple zero at +√3', 1),
			feature('cubic-critical-left', 'critical', -1, 0, 'Critical point at −1', 1),
			feature('cubic-critical-right', 'critical', 1, 0, 'Critical point at +1', 1)
		],
		defaults: { cameraDistance: 8, logCap: 8, verticalScale: 0.5 }
	}),
	preset({
		id: 'mobius',
		label: 'Möbius map',
		expression: '(z - 1) / (z + 1)',
		notation: 'f(z) = (z − 1)/(z + 1)',
		category: 'Classical maps',
		mathematicalClass: 'meromorphic',
		holomorphic: true,
		summary: 'A single zero and pole organize a fractional-linear map.',
		notice:
			'The well at +1 and spire at −1 balance while circles and lines map to circles or lines.',
		articleAnchor: '#rational-functions-as-superposed-potentials',
		view: view(0, 0, 5, 4),
		features: [
			feature('mobius-zero', 'zero', 1, 0, 'Simple zero at +1', 1),
			feature('mobius-pole', 'pole', -1, 0, 'Simple pole at −1', 1)
		],
		defaults: { cameraDistance: 7, logCap: 6 }
	}),
	preset({
		id: 'joukowski',
		label: 'Joukowski map',
		expression: 'z + 1/z',
		notation: 'f(z) = z + 1/z',
		category: 'Classical maps',
		mathematicalClass: 'meromorphic',
		holomorphic: true,
		summary: 'A pole, two zeros, and two critical points make the classical airfoil map legible.',
		notice: 'Compare the pole at 0, zeros at ±i, and critical points at ±1.',
		articleAnchor: '#rational-functions-as-superposed-potentials',
		view: view(0, 0, 5, 5),
		features: [
			feature('joukowski-pole', 'pole', 0, 0, 'Simple pole at the origin', 1),
			feature('joukowski-zero-plus', 'zero', 0, 1, 'Simple zero at +i', 1),
			feature('joukowski-zero-minus', 'zero', 0, -1, 'Simple zero at −i', 1),
			feature('joukowski-critical-plus', 'critical', 1, 0, 'Critical point at +1', 1),
			feature('joukowski-critical-minus', 'critical', -1, 0, 'Critical point at −1', 1)
		],
		defaults: { cameraDistance: 7.5, logCap: 6 }
	}),
	preset({
		id: 'exponential',
		label: 'Exponential',
		expression: 'exp(z)',
		notation: 'f(z) = eᶻ',
		category: 'Periodicity and growth',
		mathematicalClass: 'entire',
		holomorphic: true,
		summary:
			'Log height is a plane in the real direction while hue repeats in the imaginary direction.',
		notice: 'There are no zeros or critical points: growth and phase periodicity separate cleanly.',
		articleAnchor: '#periodicity-and-growth',
		view: view(0, 0, 6, 8),
		features: [],
		defaults: { cameraDistance: 11, logCap: 5, verticalScale: 0.7 }
	}),
	preset({
		id: 'exponential-square',
		label: 'Exponential saddle',
		expression: 'exp(z^2)',
		notation: 'f(z) = exp(z²)',
		category: 'Periodicity and growth',
		mathematicalClass: 'entire',
		holomorphic: true,
		summary: 'Its natural-log magnitude is exactly x² − y².',
		notice: 'The origin is a finite critical saddle; no zero or pole creates it.',
		articleAnchor: '#harmonic-terrain',
		view: view(0, 0, 5, 5),
		features: [
			feature(
				'exponential-square-critical',
				'critical',
				0,
				0,
				'Finite critical point at the origin',
				1
			)
		],
		defaults: { cameraDistance: 7.5, logCap: 8, verticalScale: 0.48 }
	}),
	preset({
		id: 'exponential-minus-one',
		label: 'Repeated exponential zeros',
		expression: 'exp(z) - 1',
		notation: 'f(z) = eᶻ − 1',
		category: 'Periodicity and growth',
		mathematicalClass: 'entire',
		holomorphic: true,
		summary: 'Simple zeros repeat every 2π along the imaginary axis.',
		notice: 'Pan vertically to follow an infinite family of identical zero wells.',
		articleAnchor: '#periodicity-and-growth',
		view: view(0, 0, 6, 14),
		features: [],
		featureFamilies: [EXP_MINUS_ONE_ZEROS],
		defaults: { cameraDistance: 16, logCap: 6, verticalScale: 0.55 }
	}),
	preset({
		id: 'sine',
		label: 'Sine',
		expression: 'sin(z)',
		notation: 'f(z) = sin z',
		category: 'Periodicity and growth',
		mathematicalClass: 'entire',
		holomorphic: true,
		summary: 'Real-axis zeros repeat every π while magnitude grows vertically.',
		notice: 'The zero and critical families alternate along the real axis.',
		articleAnchor: '#periodicity-and-growth',
		view: view(0, 0, 14, 7),
		features: [],
		featureFamilies: [SINE_ZEROS, SINE_CRITICALS],
		defaults: { cameraDistance: 16, logCap: 7, verticalScale: 0.52 }
	}),
	preset({
		id: 'tangent',
		label: 'Tangent',
		expression: 'tan(z)',
		notation: 'f(z) = tan z',
		category: 'Periodicity and growth',
		mathematicalClass: 'meromorphic',
		holomorphic: true,
		summary: 'Alternating real zeros and poles repeat with period π.',
		notice: 'Follow the real axis: each zero well is halfway between two pole spires.',
		articleAnchor: '#periodicity-and-growth',
		view: view(0, 0, 14, 6),
		features: [],
		featureFamilies: [TANGENT_ZEROS, TANGENT_POLES],
		defaults: { cameraDistance: 16, logCap: 6, verticalScale: 0.58 }
	}),
	preset({
		id: 'sinc',
		label: 'Removable sinc',
		expression: 'sinc(z)',
		notation: 'f(z) = sinc z',
		category: 'Removable and essential singularities',
		mathematicalClass: 'removable-extension',
		holomorphic: true,
		summary: 'The analytic continuation of sin(z)/z takes the finite value 1 at the origin.',
		notice: 'The origin is not a pole or zero; nonzero integer multiples of π remain simple zeros.',
		articleAnchor: '#removable-versus-essential-singularities',
		view: view(0, 0, 14, 7),
		features: [
			feature(
				'sinc-removable',
				'removable',
				0,
				0,
				'Removed singularity with continued value 1',
				undefined,
				'The sinc builtin evaluates the analytic continuation.'
			)
		],
		featureFamilies: [SINC_ZEROS],
		defaults: { cameraDistance: 16, logCap: 8, verticalScale: 0.48 }
	}),
	preset({
		id: 'essential-exponential',
		label: 'Essential exponential',
		expression: 'exp(1/z)',
		notation: 'f(z) = exp(1/z)',
		category: 'Removable and essential singularities',
		mathematicalClass: 'essential-singularity',
		holomorphic: true,
		summary:
			'An essential singularity produces strongly directional growth and phase acceleration.',
		notice:
			'The origin is an invalid hole, not a pole; nearby peaks and wells depend on approach direction.',
		articleAnchor: '#removable-versus-essential-singularities',
		view: view(0, 0, 3, 3),
		features: [
			feature(
				'essential-exponential-origin',
				'essential',
				0,
				0,
				'Essential singularity at the origin'
			)
		],
		defaults: { cameraDistance: 5.5, logCap: 8, verticalScale: 0.42, quality: 'low' }
	}),
	preset({
		id: 'essential-sine',
		label: 'Accumulating sine zeros',
		expression: 'sin(1/z)',
		notation: 'f(z) = sin(1/z)',
		category: 'Removable and essential singularities',
		mathematicalClass: 'essential-singularity',
		holomorphic: true,
		summary:
			'Infinitely many real zero wells and critical points accumulate at an essential singularity.',
		notice:
			'Marker families are deliberately capped; finite pixels cannot resolve every zero near the origin.',
		articleAnchor: '#removable-versus-essential-singularities',
		view: view(0, 0, 2.4, 2.4),
		features: [
			feature('essential-sine-origin', 'essential', 0, 0, 'Essential singularity at the origin'),
			feature(
				'essential-sine-accumulation',
				'accumulation',
				0,
				0,
				'Accumulation point of zeros and critical points'
			)
		],
		featureFamilies: [RECIPROCAL_SINE_ZEROS, RECIPROCAL_SINE_CRITICALS],
		defaults: { cameraDistance: 5, logCap: 8, verticalScale: 0.4, quality: 'low' }
	}),
	preset({
		id: 'logarithm',
		label: 'Logarithm',
		expression: 'log(z)',
		notation: 'f(z) = log z',
		category: 'Principal branches and sheets',
		mathematicalClass: 'principal-branch',
		holomorphic: true,
		summary: 'The principal logarithm has a branch point at zero, a zero at one, and a chosen cut.',
		notice:
			'The ordinary landscape shows one principal value; the sheet view shows a finite window of the covering.',
		articleAnchor: '#branch-cuts-versus-sheets',
		view: view(0, 0, 8, 8),
		features: [
			feature('logarithm-branch', 'branch-point', 0, 0, 'Branch point at the origin'),
			feature('logarithm-zero', 'zero', 1, 0, 'Simple zero at +1', 1)
		],
		cuts: [NEGATIVE_REAL_CUT],
		sheets: {
			kind: 'log',
			defaultAllSheets: false,
			description: 'A finite radial and sheet-index window of the logarithm’s infinite covering.'
		},
		defaults: { cameraDistance: 10, logCap: 7, verticalScale: 0.55 }
	}),
	preset({
		id: 'square-root',
		label: 'Square root',
		expression: 'sqrt(z)',
		notation: 'f(z) = √z',
		category: 'Principal branches and sheets',
		mathematicalClass: 'principal-branch',
		holomorphic: true,
		summary: 'The principal square root halves angles and selects one of two connected sheets.',
		notice:
			'The origin is a branch point with a zero limit, not an ordinary zero of fractional order.',
		articleAnchor: '#branch-cuts-versus-sheets',
		view: view(0, 0, 8, 8),
		features: [
			feature('square-root-branch', 'branch-point', 0, 0, 'Two-sheet branch point at the origin')
		],
		cuts: [NEGATIVE_REAL_CUT],
		sheets: {
			kind: 'sqrt',
			defaultAllSheets: false,
			description: 'Both square-root values joined cyclically across the principal cut.'
		},
		defaults: { cameraDistance: 10, logCap: 5, verticalScale: 0.8 }
	}),
	preset({
		id: 'cube-root',
		label: 'Cube root',
		expression: 'z^(1/3)',
		notation: 'f(z) = z^(1/3)',
		category: 'Principal branches and sheets',
		mathematicalClass: 'principal-branch',
		holomorphic: true,
		summary: 'The principal cube root selects one value from a connected three-sheet covering.',
		notice: 'A trip around the origin advances to the next sheet; three trips return to the start.',
		articleAnchor: '#branch-cuts-versus-sheets',
		view: view(0, 0, 8, 8),
		features: [
			feature('cube-root-branch', 'branch-point', 0, 0, 'Three-sheet branch point at the origin')
		],
		cuts: [NEGATIVE_REAL_CUT],
		sheets: {
			kind: 'cuberoot',
			defaultAllSheets: false,
			description: 'All three cube-root values joined in cyclic sheet order.'
		},
		defaults: { cameraDistance: 10, logCap: 4, verticalScale: 0.9 }
	}),
	preset({
		id: 'sqrt-quadratic',
		label: 'Square root of z² − 1',
		expression: 'sqrt(z^2 - 1)',
		notation: 'f(z) = √(z² − 1)',
		category: 'Principal branches and sheets',
		mathematicalClass: 'principal-branch',
		holomorphic: true,
		summary: 'Two branch points inherit the exact preimage of the principal square-root cut.',
		notice: 'For this literal composition the cut preimage includes [-1,1] and the imaginary axis.',
		articleAnchor: '#branch-cuts-versus-sheets',
		view: view(0, 0, 8, 7),
		features: [
			feature('sqrt-quadratic-left', 'branch-point', -1, 0, 'Branch point at −1'),
			feature('sqrt-quadratic-right', 'branch-point', 1, 0, 'Branch point at +1')
		],
		cuts: SQRT_QUADRATIC_CUTS,
		defaults: { cameraDistance: 10, logCap: 6, verticalScale: 0.65 }
	}),
	preset({
		id: 'imaginary-power',
		label: 'Imaginary power',
		expression: 'z^i',
		notation: 'f(z) = zⁱ',
		category: 'Principal branches and sheets',
		mathematicalClass: 'principal-branch',
		holomorphic: true,
		summary: 'Magnitude depends on the chosen argument while phase depends on log radius.',
		notice: 'The negative-real seam records the principal logarithm used inside the power.',
		articleAnchor: '#branch-cuts-versus-sheets',
		view: view(0, 0, 8, 8),
		features: [
			feature(
				'imaginary-power-branch',
				'branch-point',
				0,
				0,
				'Principal-log branch point at the origin'
			)
		],
		cuts: [NEGATIVE_REAL_CUT],
		defaults: { cameraDistance: 10, logCap: 6, verticalScale: 0.65 }
	}),
	preset({
		id: 'self-power',
		label: 'Self power',
		expression: 'z^z',
		notation: 'f(z) = zᶻ',
		category: 'Principal branches and sheets',
		mathematicalClass: 'principal-branch',
		holomorphic: true,
		summary: 'A variable exponent carries principal-log structure into both magnitude and phase.',
		notice: 'The branch point is at zero; the finite principal-branch critical point is at 1/e.',
		articleAnchor: '#branch-cuts-versus-sheets',
		view: view(0, 0, 6, 6),
		features: [
			feature(
				'self-power-branch',
				'branch-point',
				0,
				0,
				'Principal-log branch point at the origin'
			),
			feature('self-power-critical', 'critical', 1 / Math.E, 0, 'Finite critical point at 1/e', 1)
		],
		cuts: [NEGATIVE_REAL_CUT],
		defaults: { cameraDistance: 8.5, logCap: 8, verticalScale: 0.5 }
	}),
	preset({
		id: 'conjugate',
		label: 'Complex conjugate',
		expression: 'conj(z)',
		notation: 'f(z) = z̄',
		category: 'Non-holomorphic control',
		mathematicalClass: 'antiholomorphic',
		holomorphic: false,
		summary: 'It shares the identity log-magnitude terrain but reverses phase orientation.',
		notice:
			'Matching terrain does not certify holomorphicity; derivative and argument-principle claims are disabled.',
		articleAnchor: '#what-the-picture-does-not-prove',
		view: view(0, 0, 4, 4),
		features: [
			feature(
				'conjugate-zero',
				'zero',
				0,
				0,
				'Zero of the antiholomorphic map',
				undefined,
				'No holomorphic multiplicity is assigned.'
			)
		],
		defaults: { cameraDistance: 6, logCap: 5, verticalScale: 0.7 }
	})
];

export function domainColoringPreset(id: string): DomainColoringPreset | undefined {
	return DOMAIN_COLORING_PRESETS.find((candidate) => candidate.id === id);
}
