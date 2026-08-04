import type { BoundaryCondition, InitialCondition, ProcessId } from './types';
import type { ProcessParameterMap } from './model-registry';

export interface ModelPreset<Id extends ProcessId> {
	readonly id: string;
	readonly label: string;
	readonly description: string;
	readonly parameters: Readonly<ProcessParameterMap[Id]>;
	readonly initialCondition?: InitialCondition;
	readonly boundary?: BoundaryCondition;
	readonly particleCount?: number;
	readonly timestep?: number;
	readonly speed?: number;
}

export type ModelPresetRegistry = {
	readonly [Id in ProcessId]: readonly ModelPreset<Id>[];
};

const unbounded = { mode: 'unbounded' } as const;
const reflectingBox = {
	mode: 'reflecting',
	bounds: { minX: -5, maxX: 5, minY: -3.5, maxY: 3.5 }
} as const;
const periodicBox = {
	mode: 'periodic',
	bounds: { minX: -5, maxX: 5, minY: -3.5, maxY: 3.5 }
} as const;

/** Curated, deterministic stories. Every selectable mode has at least two. */
export const MODEL_PRESETS: ModelPresetRegistry = {
	'random-walk': [
		{
			id: 'coin-toss-walk',
			label: 'Coin-toss walk',
			description: 'One-dimensional left-or-right steps with no directional bias.',
			parameters: {
				dimensions: 1,
				geometry: 'lattice',
				stepLength: 0.5,
				timePerStep: 0.1,
				coarseGraining: 1
			},
			initialCondition: { x: 0, y: 0, spread: 0 },
			boundary: unbounded,
			particleCount: 1,
			timestep: 0.1
		},
		{
			id: 'tiny-steps-same-diffusion',
			label: 'Tiny steps, same diffusion',
			description: 'Shorter and faster steps preserve D while making the path look continuous.',
			parameters: {
				dimensions: 2,
				geometry: 'lattice',
				stepLength: 0.08,
				timePerStep: 0.0016,
				coarseGraining: 8
			},
			initialCondition: { x: 0, y: 0, spread: 0 },
			boundary: unbounded,
			particleCount: 1,
			timestep: 0.0016
		},
		{
			id: 'ten-thousand-walkers',
			label: 'Ten thousand isotropic walkers',
			description:
				'An ensemble with every direction equally likely instead of only four lattice directions.',
			parameters: {
				dimensions: 2,
				geometry: 'isotropic',
				stepLength: 0.3,
				timePerStep: 0.03,
				coarseGraining: 1
			},
			boundary: unbounded,
			particleCount: 10_000,
			timestep: 0.03
		}
	],
	'free-brownian': [
		{
			id: 'one-indecisive-particle',
			label: 'One indecisive particle',
			description: 'A close view of one unreproducible-looking but seeded trajectory.',
			parameters: { diffusion: 0.55 },
			initialCondition: { x: 0, y: 0, spread: 0 },
			boundary: unbounded,
			particleCount: 1,
			timestep: 1 / 120
		},
		{
			id: 'thousand-histories',
			label: 'A thousand invisible histories',
			description: 'An ensemble cloud exposes the smooth Gaussian law.',
			parameters: { diffusion: 0.8 },
			initialCondition: { x: 0, y: 0, spread: 0 },
			boundary: unbounded,
			particleCount: 1_000,
			timestep: 1 / 120
		},
		{
			id: 'reflecting-box',
			label: 'Reflecting box',
			description: 'Repeated overshoots reflect cleanly from a finite container.',
			parameters: { diffusion: 0.9 },
			initialCondition: { x: 0, y: 0, spread: 0.2 },
			boundary: reflectingBox
		},
		{
			id: 'periodic-universe',
			label: 'Periodic universe',
			description: 'Display positions wrap while displacement statistics stay unwrapped.',
			parameters: { diffusion: 0.9 },
			initialCondition: { x: 0, y: 0, spread: 0.2 },
			boundary: periodicBox
		}
	],
	'drift-diffusion': [
		{
			id: 'gentle-current',
			label: 'Gentle current',
			description: 'The whole cloud drifts slowly while diffusion remains obvious.',
			parameters: { diffusion: 0.5, driftX: 0.65, driftY: 0.15 },
			boundary: unbounded
		},
		{
			id: 'strong-current-weak-noise',
			label: 'Strong current, weak noise',
			description: 'Advection dominates each path but does not alter theoretical variance.',
			parameters: { diffusion: 0.08, driftX: 1.8, driftY: -0.35 },
			boundary: unbounded
		},
		{
			id: 'weak-current-strong-noise',
			label: 'Weak current, strong noise',
			description: 'A small mean shift hides inside a rapidly widening ensemble.',
			parameters: { diffusion: 1.2, driftX: 0.28, driftY: 0.1 },
			boundary: unbounded
		}
	],
	'anisotropic-diffusion': [
		{
			id: 'narrow-channel',
			label: 'Narrow microscopic channel',
			description: 'Diffusion is much faster along the channel than across it.',
			parameters: { majorDiffusion: 1.3, minorDiffusion: 0.08, angle: 0 },
			boundary: unbounded
		},
		{
			id: 'rotated-layers',
			label: 'Rotated layered material',
			description: 'The covariance ellipse points diagonally through the stage.',
			parameters: {
				majorDiffusion: 1,
				minorDiffusion: 0.18,
				angle: Math.PI / 4
			},
			boundary: unbounded
		},
		{
			id: 'isotropic-control',
			label: 'Isotropic control',
			description: 'Equal principal values collapse the ellipse back to a circle.',
			parameters: { majorDiffusion: 0.65, minorDiffusion: 0.65, angle: 0.7 },
			boundary: unbounded
		}
	],
	'ornstein-uhlenbeck': [
		{
			id: 'weak-trap',
			label: 'Weak idealized optical trap',
			description: 'A broad stationary cloud forms around a gentle harmonic centre.',
			parameters: {
				restoringRate: 0.45,
				diffusion: 0.65,
				equilibriumX: 0,
				equilibriumY: 0
			},
			initialCondition: { x: 3, y: 0, spread: 0 },
			boundary: unbounded
		},
		{
			id: 'strong-trap',
			label: 'Strong idealized optical trap',
			description: 'Fast mean reversion holds a tight stationary distribution.',
			parameters: {
				restoringRate: 2.8,
				diffusion: 0.45,
				equilibriumX: 0,
				equilibriumY: 0
			},
			initialCondition: { x: -3, y: 1.5, spread: 0 },
			boundary: unbounded
		},
		{
			id: 'moved-trap',
			label: 'Moved trap centre',
			description:
				'The ensemble lags behind an equilibrium point displaced from its initial cloud.',
			parameters: {
				restoringRate: 1.1,
				diffusion: 0.5,
				equilibriumX: 2.5,
				equilibriumY: -1
			},
			initialCondition: { x: -2.5, y: 1, spread: 0.15 },
			boundary: unbounded
		}
	],
	'underdamped-langevin': [
		{
			id: 'visible-crossover',
			label: 'Visible inertial crossover',
			description: 'Relaxation time is long enough to reveal both ballistic and diffusive regimes.',
			parameters: {
				mass: 1,
				drag: 1,
				thermalEnergy: 1,
				forceX: 0,
				forceY: 0,
				initialVelocity: 'equilibrium'
			},
			boundary: unbounded
		},
		{
			id: 'negligible-inertia',
			label: 'Negligible inertia',
			description:
				'Velocity relaxes almost immediately and the path resembles overdamped diffusion.',
			parameters: {
				mass: 0.08,
				drag: 2.5,
				thermalEnergy: 1,
				forceX: 0,
				forceY: 0,
				initialVelocity: 'equilibrium'
			},
			boundary: unbounded
		},
		{
			id: 'heavy-particle',
			label: 'Heavy particle',
			description: 'Large mass preserves velocity long enough for visibly curved persistent paths.',
			parameters: {
				mass: 4,
				drag: 1,
				thermalEnergy: 1,
				forceX: 0.12,
				forceY: 0,
				initialVelocity: 'equilibrium'
			},
			boundary: unbounded
		}
	],
	'potential-diffusion': [
		{
			id: 'rare-barrier-crossing',
			label: 'Rare barrier crossing',
			description: 'A high double-well barrier makes thermally activated hops uncommon.',
			parameters: {
				landscape: 'double-well',
				mobility: 0.7,
				thermalEnergy: 0.35,
				centerX: 0,
				centerY: 0,
				stiffness: 1,
				transverseStiffness: 2,
				barrierHeight: 2.8,
				wellSeparation: 2,
				period: 2.5,
				tilt: 0,
				obstacles: []
			},
			initialCondition: { x: -2, y: 0, spread: 0.1 },
			boundary: unbounded
		},
		{
			id: 'frequent-barrier-crossing',
			label: 'Frequent barrier crossing',
			description: 'Higher thermal energy lets the ensemble shuttle between wells.',
			parameters: {
				landscape: 'double-well',
				mobility: 0.7,
				thermalEnergy: 1.2,
				centerX: 0,
				centerY: 0,
				stiffness: 1,
				transverseStiffness: 2,
				barrierHeight: 1.5,
				wellSeparation: 2,
				period: 2.5,
				tilt: 0,
				obstacles: []
			},
			initialCondition: { x: -2, y: 0, spread: 0.2 },
			boundary: unbounded
		},
		{
			id: 'corrugated-slope',
			label: 'Tilted corrugated landscape',
			description:
				'External tilt explicitly breaks equilibrium while periodic ridges impede motion.',
			parameters: {
				landscape: 'tilted-periodic',
				mobility: 0.8,
				thermalEnergy: 0.65,
				centerX: 0,
				centerY: 0,
				stiffness: 1,
				transverseStiffness: 1.5,
				barrierHeight: 1.2,
				wellSeparation: 2,
				period: 2.4,
				tilt: 0.28,
				obstacles: []
			},
			boundary: unbounded
		},
		{
			id: 'obstacle-course',
			label: 'Excluded obstacle course',
			description: 'A flat harmonic setting with circular regions that no path may enter.',
			parameters: {
				landscape: 'harmonic',
				mobility: 0.8,
				thermalEnergy: 0.8,
				centerX: 0,
				centerY: 0,
				stiffness: 0,
				transverseStiffness: 0,
				barrierHeight: 0,
				wellSeparation: 2,
				period: 2.5,
				tilt: 0,
				obstacles: [
					{ x: -1.2, y: 0, radius: 0.65 },
					{ x: 1.2, y: 0, radius: 0.65 }
				]
			},
			initialCondition: { x: 0, y: -2, spread: 0.15 },
			boundary: reflectingBox
		}
	],
	'active-brownian': [
		{
			id: 'passive-control',
			label: 'Passive Brownian control',
			description: 'Zero propulsion recovers ordinary translational diffusion.',
			parameters: {
				propulsionSpeed: 0,
				translationalDiffusion: 0.5,
				rotationalDiffusion: 0.8,
				obstacles: []
			},
			boundary: unbounded
		},
		{
			id: 'persistent-swimmer',
			label: 'Persistent swimmer',
			description: 'Slow rotational diffusion creates long, nearly straight runs.',
			parameters: {
				propulsionSpeed: 2,
				translationalDiffusion: 0.08,
				rotationalDiffusion: 0.18,
				obstacles: []
			},
			boundary: unbounded
		},
		{
			id: 'rapid-tumbler',
			label: 'Rapidly tumbling swimmer',
			description: 'Heading memory vanishes quickly even though self-propulsion remains strong.',
			parameters: {
				propulsionSpeed: 2,
				translationalDiffusion: 0.08,
				rotationalDiffusion: 3,
				obstacles: []
			},
			boundary: unbounded
		},
		{
			id: 'swimmer-obstacles',
			label: 'Active particles among obstacles',
			description: 'Persistent paths collide with excluded circular regions.',
			parameters: {
				propulsionSpeed: 1.7,
				translationalDiffusion: 0.06,
				rotationalDiffusion: 0.35,
				obstacles: [
					{ x: -1, y: 0, radius: 0.7 },
					{ x: 1, y: 0, radius: 0.7 }
				]
			},
			boundary: reflectingBox
		}
	],
	'brownian-bridge': [
		{
			id: 'return-origin',
			label: 'Return to the origin',
			description: 'A random excursion is guaranteed to return exactly where it began.',
			parameters: {
				diffusion: 0.8,
				startX: 0,
				startY: 0,
				endX: 0,
				endY: 0,
				duration: 4
			},
			boundary: unbounded
		},
		{
			id: 'cross-stage',
			label: 'Cross the stage',
			description: 'Many wandering routes share the same separated endpoints.',
			parameters: {
				diffusion: 0.7,
				startX: -4,
				startY: -1,
				endX: 4,
				endY: 1,
				duration: 5
			},
			boundary: unbounded
		},
		{
			id: 'wild-middle',
			label: 'Wild middle, fixed ending',
			description: 'High diffusion widens the middle without moving either endpoint.',
			parameters: {
				diffusion: 2.2,
				startX: -2,
				startY: 0,
				endX: 2,
				endY: 0,
				duration: 6
			},
			boundary: unbounded
		}
	],
	'fractional-brownian': [
		{
			id: 'antipersistent',
			label: 'Antipersistent',
			description: 'H below one half makes increments tend to reverse.',
			parameters: { hurst: 0.25, scale: 1, duration: 8, points: 1025, trajectories: 1 }
		},
		{
			id: 'ordinary-brownian',
			label: 'Ordinary Brownian',
			description: 'At H=1/2 the fractional family recovers independent Brownian increments.',
			parameters: { hurst: 0.5, scale: 1, duration: 8, points: 1025, trajectories: 1 }
		},
		{
			id: 'persistent',
			label: 'Persistent',
			description: 'H above one half makes increments tend to keep their direction.',
			parameters: { hurst: 0.78, scale: 1, duration: 8, points: 1025, trajectories: 1 }
		}
	],
	'geometric-brownian': [
		{
			id: 'steady-growth',
			label: 'Steady positive growth',
			description: 'Moderate multiplicative noise separates the lognormal mean and median.',
			parameters: { initialValue: 1, growthRate: 0.12, volatility: 0.3 },
			boundary: unbounded
		},
		{
			id: 'volatile-growth',
			label: 'Volatile multiplicative paths',
			description: 'High volatility creates a strongly skewed final-value distribution.',
			parameters: { initialValue: 1, growthRate: 0.06, volatility: 0.85 },
			boundary: unbounded
		}
	],
	'levy-flight': [
		{
			id: 'cauchy-jumps',
			label: 'Cauchy jumps',
			description: 'Alpha one produces a particularly heavy-tailed symmetric flight.',
			parameters: { dimensions: 2, stability: 1, scale: 0.32 },
			boundary: unbounded
		},
		{
			id: 'tempered-looking-locality',
			label: 'Mostly local, occasionally enormous',
			description: 'Alpha 1.6 often wanders locally but retains divergent variance.',
			parameters: { dimensions: 2, stability: 1.6, scale: 0.38 },
			boundary: unbounded
		},
		{
			id: 'gaussian-endpoint',
			label: 'Gaussian endpoint',
			description: 'Alpha two reaches the finite-variance Gaussian member of the stable family.',
			parameters: { dimensions: 2, stability: 2, scale: 0.55 },
			boundary: unbounded
		}
	],
	'first-passage': [
		{
			id: 'near-wall',
			label: 'Start near the wall',
			description: 'Most particles arrive quickly, but a long-lived tail remains.',
			parameters: {
				diffusion: 1,
				wallX: 0,
				startDistance: 0.7,
				bridgeCorrection: true
			},
			boundary: unbounded
		},
		{
			id: 'far-wall',
			label: 'A distant absorbing wall',
			description: 'A longer starting distance shifts the survival curve to later times.',
			parameters: {
				diffusion: 0.6,
				wallX: 0,
				startDistance: 2,
				bridgeCorrection: true
			},
			boundary: unbounded
		}
	]
};

export function presetsFor<Id extends ProcessId>(id: Id): readonly ModelPreset<Id>[] {
	return MODEL_PRESETS[id];
}
