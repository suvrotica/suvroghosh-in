import type { DomainColoringPreset } from './types';

export const DOMAIN_COLORING_PRESETS: readonly DomainColoringPreset[] = [
	{
		id: 'identity',
		label: 'Identity',
		expression: 'z',
		notation: 'f(z) = z',
		summary: 'The reference map: output angle is input angle, and distance from zero is unchanged.',
		notice:
			'Walk once around the origin. The hues make one complete turn, while logarithmic rings tighten towards the zero.',
		view: { centerRe: 0, centerIm: 0, spanIm: 4 }
	},
	{
		id: 'squaring',
		label: 'Squaring',
		expression: 'z^2',
		notation: 'f(z) = z²',
		summary: 'Angles double, and the origin is a zero of order two.',
		notice:
			'One trip around the origin now passes through the colour wheel twice. That winding count reveals the zero’s order.',
		view: { centerRe: 0, centerIm: 0, spanIm: 4 }
	},
	{
		id: 'reciprocal',
		label: 'Reciprocal',
		expression: '1 / z',
		notation: 'f(z) = 1/z',
		summary: 'Inversion reverses phase and turns the origin into a pole.',
		notice:
			'The phase order reverses. Magnitude bands race towards the bright centre because |1/z| grows without bound.',
		view: { centerRe: 0, centerIm: 0, spanIm: 4 }
	},
	{
		id: 'roots-of-unity',
		label: 'Roots of unity',
		expression: 'z^3 - 1',
		notation: 'f(z) = z³ − 1',
		summary: 'Three simple zeros sit at the cube roots of one.',
		notice:
			'Find the three dark convergence points. Around each one, the hue makes exactly one turn.',
		view: { centerRe: 0, centerIm: 0, spanIm: 4 }
	},
	{
		id: 'sine',
		label: 'Sine',
		expression: 'sin(z)',
		notation: 'f(z) = sin z',
		summary: 'A periodic entire function with zeros at integer multiples of π.',
		notice:
			'Pan along the real axis to see zeros repeat every π. Far above and below it, the magnitude grows rapidly.',
		view: { centerRe: 0, centerIm: 0, spanIm: 7 }
	},
	{
		id: 'exponential',
		label: 'Exponential',
		expression: 'exp(z)',
		notation: 'f(z) = eᶻ',
		summary: 'Magnitude changes with the real part; phase repeats in the imaginary direction.',
		notice:
			'Vertical travel cycles through phase, while horizontal travel crosses magnitude contours. There are no zeros.',
		view: { centerRe: 0, centerIm: 0, spanIm: 8 }
	},
	{
		id: 'logarithm',
		label: 'Logarithm',
		expression: 'log(z)',
		notation: 'f(z) = log z',
		summary: 'The principal logarithm exposes a branch point and a chosen cut.',
		notice:
			'The seam on the negative real axis belongs to the principal branch. Other branches place the same multivalued structure differently.',
		view: { centerRe: 0, centerIm: 0, spanIm: 6 }
	},
	{
		id: 'square-root',
		label: 'Square root',
		expression: 'sqrt(z)',
		notation: 'f(z) = √z',
		summary: 'The principal square root halves angles and has a branch point at zero.',
		notice:
			'The chosen branch cut lies on the negative real axis. Crossing it switches between the two possible square roots.',
		view: { centerRe: 0, centerIm: 0, spanIm: 6 }
	},
	{
		id: 'rational-map',
		label: 'Rational map',
		expression: '(z^2 - 1) / (z^2 + 1)',
		notation: 'f(z) = (z² − 1)/(z² + 1)',
		summary: 'Two zeros on the real axis and two poles on the imaginary axis share one field.',
		notice:
			'Compare the dark points near ±1 with the bright points near ±i. Hue winding runs in opposite directions around zeros and poles.',
		view: { centerRe: 0, centerIm: 0, spanIm: 4.5 }
	}
] as const;

export function domainColoringPreset(id: string) {
	return DOMAIN_COLORING_PRESETS.find((preset) => preset.id === id);
}
