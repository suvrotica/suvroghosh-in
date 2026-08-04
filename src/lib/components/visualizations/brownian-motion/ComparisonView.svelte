<script lang="ts">
	import { onDestroy } from 'svelte';
	import { generateFractionalBrownianPaths } from '$lib/visualizations/brownian-motion/advanced/fractional-brownian';
	import { GaussianSampler } from '$lib/visualizations/brownian-motion/gaussian';
	import { sampleSymmetricStable } from '$lib/visualizations/brownian-motion/models/levy-flight';
	import { SeededRandom } from '$lib/utils/seeded-random';

	type PresetId =
		| 'free-drift'
		| 'isotropic-anisotropic'
		| 'overdamped-underdamped'
		| 'passive-active'
		| 'brownian-fractional'
		| 'brownian-levy'
		| 'weak-strong-trap'
		| 'low-high-temperature';
	type Side = 'left' | 'right';

	type ModelSpec =
		| {
				readonly kind: 'free';
				readonly label: string;
				readonly equation: string;
				readonly diffusion: number;
		  }
		| {
				readonly kind: 'drift';
				readonly label: string;
				readonly equation: string;
				readonly diffusion: number;
				readonly driftX: number;
		  }
		| {
				readonly kind: 'anisotropic';
				readonly label: string;
				readonly equation: string;
				readonly diffusionX: number;
				readonly diffusionY: number;
		  }
		| {
				readonly kind: 'underdamped';
				readonly label: string;
				readonly equation: string;
				readonly mass: number;
				readonly drag: number;
				readonly thermalEnergy: number;
		  }
		| {
				readonly kind: 'active';
				readonly label: string;
				readonly equation: string;
				readonly diffusion: number;
				readonly speed: number;
				readonly rotationalDiffusion: number;
		  }
		| {
				readonly kind: 'fractional';
				readonly label: string;
				readonly equation: string;
				readonly hurst: number;
				readonly scale: number;
		  }
		| {
				readonly kind: 'levy';
				readonly label: string;
				readonly equation: string;
				readonly stability: number;
				readonly scale: number;
		  }
		| {
				readonly kind: 'trap';
				readonly label: string;
				readonly equation: string;
				readonly diffusion: number;
				readonly stiffness: number;
		  };

	interface ComparisonPreset {
		readonly id: PresetId;
		readonly label: string;
		readonly question: string;
		readonly left: ModelSpec;
		readonly right: ModelSpec;
		readonly matchable: boolean;
		readonly couplingNote: string;
	}

	interface TheorySnapshot {
		readonly meanX: number;
		readonly meanY: number;
		readonly msd: number | null;
		readonly varianceX: number | null;
		readonly varianceY: number | null;
		readonly note: string;
	}

	interface Ensemble {
		readonly spec: ModelSpec;
		readonly x: Float64Array;
		readonly y: Float64Array;
		readonly trajectoryCount: number;
		readonly pointCount: number;
	}

	interface Camera {
		readonly centreX: number;
		readonly centreY: number;
		/** Visible vertical world span; horizontal span follows the plot aspect ratio. */
		readonly span: number;
	}

	interface ScreenPoint {
		readonly x: number;
		readonly y: number;
		readonly visible: boolean;
	}

	interface MeasuredSnapshot {
		readonly meanX: number;
		readonly meanY: number;
		readonly msd: number;
		readonly standardDeviationX: number;
		readonly standardDeviationY: number;
		readonly medianSquaredRadius: number;
	}

	interface MetricRow {
		readonly label: string;
		readonly measured: string;
		readonly theoretical: string;
	}

	interface PanState {
		readonly side: Side;
		readonly pointerId: number;
		readonly startClientX: number;
		readonly startClientY: number;
		readonly startLeft: Camera;
		readonly startRight: Camera;
	}

	const TRAJECTORY_COUNT = 52;
	const DRAWN_TRAJECTORY_COUNT = 22;
	const STEP_COUNT = 128;
	const POINT_COUNT = STEP_COUNT + 1;
	const DURATION = 4;
	const TIMESTEP = DURATION / STEP_COUNT;
	const PLOT_WIDTH = 620;
	const PLOT_HEIGHT = 330;
	const ASPECT_RATIO = PLOT_WIDTH / PLOT_HEIGHT;
	const MIN_CAMERA_SPAN = 0.3;
	const MAX_CAMERA_SPAN = 80;
	const DIVIDER_MINIMUM = 30;
	const DIVIDER_MAXIMUM = 70;

	const PRESETS: readonly ComparisonPreset[] = [
		{
			id: 'free-drift',
			label: 'Free vs drift',
			question: 'Does a moving mean change the rate at which the cloud broadens?',
			left: {
				kind: 'free',
				label: 'Free Brownian',
				equation: 'dX = √(2D) dW',
				diffusion: 0.4
			},
			right: {
				kind: 'drift',
				label: 'Drift–diffusion',
				equation: 'dX = μ dt + √(2D) dW',
				diffusion: 0.4,
				driftX: 0.65
			},
			matchable: true,
			couplingNote: 'Both panels share every Gaussian kick; the right panel adds only μ dt.'
		},
		{
			id: 'isotropic-anisotropic',
			label: 'Isotropic vs anisotropic',
			question: 'Can the same total diffusion produce a differently shaped cloud?',
			left: {
				kind: 'free',
				label: 'Isotropic diffusion',
				equation: 'Dₓ = Dᵧ = 0.51',
				diffusion: 0.51
			},
			right: {
				kind: 'anisotropic',
				label: 'Anisotropic diffusion',
				equation: 'Dₓ = 0.90, Dᵧ = 0.12',
				diffusionX: 0.9,
				diffusionY: 0.12
			},
			matchable: true,
			couplingNote:
				'The standardized x and y kicks match; only their direction-dependent amplitudes differ.'
		},
		{
			id: 'overdamped-underdamped',
			label: 'Overdamped vs underdamped',
			question: 'What does inertia leave behind before ordinary diffusion takes over?',
			left: {
				kind: 'free',
				label: 'Overdamped Brownian',
				equation: 'dX = √(2D) dW, D = 0.50',
				diffusion: 0.5
			},
			right: {
				kind: 'underdamped',
				label: 'Underdamped Langevin',
				equation: 'm dv = −γv dt + √(2γkT) dW',
				mass: 1,
				drag: 2,
				thermalEnergy: 1
			},
			matchable: true,
			couplingNote:
				'Common Gaussian inputs expose the inertial filter; the two equations still interpret those inputs differently.'
		},
		{
			id: 'passive-active',
			label: 'Passive vs active',
			question: 'How does self-propulsion turn diffusion into a persistent walk?',
			left: {
				kind: 'free',
				label: 'Passive particle',
				equation: 'dX = √(2Dₜ) dW',
				diffusion: 0.12
			},
			right: {
				kind: 'active',
				label: 'Active Brownian particle',
				equation: 'dX = v₀n(θ)dt + √(2Dₜ)dW',
				diffusion: 0.12,
				speed: 1.15,
				rotationalDiffusion: 0.65
			},
			matchable: true,
			couplingNote:
				'Translational kicks match exactly; the active panel adds an independent rotational-noise stream.'
		},
		{
			id: 'brownian-fractional',
			label: 'Brownian vs fractional',
			question: 'What changes when increments remember their predecessors?',
			left: {
				kind: 'free',
				label: 'Brownian motion',
				equation: 'MSD ∝ t',
				diffusion: 0.45
			},
			right: {
				kind: 'fractional',
				label: 'Fractional Brownian, H = 0.72',
				equation: 'MSD ∝ t²ᴴ',
				hurst: 0.72,
				scale: Math.sqrt(0.9)
			},
			matchable: false,
			couplingNote:
				'Independent ensembles: fractional increments are jointly correlated, so there is no canonical step-for-step kick to match.'
		},
		{
			id: 'brownian-levy',
			label: 'Brownian vs Lévy',
			question: 'What happens when rare jumps replace finite-variance Gaussian increments?',
			left: {
				kind: 'free',
				label: 'Brownian motion',
				equation: 'Gaussian increments, finite variance',
				diffusion: 0.45
			},
			right: {
				kind: 'levy',
				label: 'Symmetric Lévy flight',
				equation: 'α-stable increments, α = 1.45',
				stability: 1.45,
				scale: 0.28
			},
			matchable: false,
			couplingNote:
				'Independent ensembles: Gaussian and α-stable increments have no privileged one-to-one noise coupling.'
		},
		{
			id: 'weak-strong-trap',
			label: 'Weak vs strong trap',
			question: 'How quickly does a restoring force cap the cloud’s spread?',
			left: {
				kind: 'trap',
				label: 'Weak harmonic trap',
				equation: 'dX = −0.25X dt + √(2D)dW',
				diffusion: 0.5,
				stiffness: 0.25
			},
			right: {
				kind: 'trap',
				label: 'Strong harmonic trap',
				equation: 'dX = −1.40X dt + √(2D)dW',
				diffusion: 0.5,
				stiffness: 1.4
			},
			matchable: true,
			couplingNote:
				'Both traps receive identical kicks; only the exact OU restoring factor differs.'
		},
		{
			id: 'low-high-temperature',
			label: 'Low vs high temperature',
			question: 'At fixed mobility, how does thermal energy set the diffusion scale?',
			left: {
				kind: 'free',
				label: 'Low temperature',
				equation: 'D = 0.18 (fixed mobility)',
				diffusion: 0.18
			},
			right: {
				kind: 'free',
				label: 'High temperature',
				equation: 'D = 0.90 (fixed mobility)',
				diffusion: 0.9
			},
			matchable: true,
			couplingNote:
				'The standardized thermal kicks match; temperature changes their amplitude through D ∝ T.'
		}
	];

	let presetId = $state<PresetId>('free-drift');
	let matchedNoise = $state(true);
	let linkedCamera = $state(true);
	let seed = $state('comparison-1827');
	let seedDraft = $state('comparison-1827');
	let seedSequence = $state(0);
	let timeIndex = $state(STEP_COUNT);
	let dividerPercent = $state(50);
	let dividerDragging = $state(false);
	let gridElement = $state<HTMLDivElement>();
	let panState = $state<PanState | null>(null);
	let leftCamera = $state<Camera>({ centreX: 0, centreY: 0, span: 6 });
	let rightCamera = $state<Camera>({ centreX: 0, centreY: 0, span: 6 });
	let status = $state(
		'Free Brownian and drift–diffusion share the same kicks. Drag the brass divider to inspect either panel.'
	);

	let preset = $derived(PRESETS.find((candidate) => candidate.id === presetId) ?? PRESETS[0]);
	let pair = $derived(generatePair(preset, seed, matchedNoise));
	let observationTime = $derived(timeIndex * TIMESTEP);
	let leftTheory = $derived(theoryAt(pair.left.spec, observationTime));
	let rightTheory = $derived(theoryAt(pair.right.spec, observationTime));
	let leftMeasured = $derived(measureAt(pair.left, timeIndex));
	let rightMeasured = $derived(measureAt(pair.right, timeIndex));
	let leftPaths = $derived(pathData(pair.left, leftCamera, timeIndex));
	let rightPaths = $derived(pathData(pair.right, rightCamera, timeIndex));
	let leftEndpoints = $derived(endpointData(pair.left, leftCamera, timeIndex));
	let rightEndpoints = $derived(endpointData(pair.right, rightCamera, timeIndex));
	let leftOverlay = $derived(theoryOverlay(leftTheory, leftCamera));
	let rightOverlay = $derived(theoryOverlay(rightTheory, rightCamera));
	let leftMeasuredMean = $derived(
		worldToScreen(leftMeasured.meanX, leftMeasured.meanY, leftCamera)
	);
	let rightMeasuredMean = $derived(
		worldToScreen(rightMeasured.meanX, rightMeasured.meanY, rightCamera)
	);
	let leftRows = $derived(metricRows(pair.left.spec, leftMeasured, leftTheory, observationTime));
	let rightRows = $derived(
		metricRows(pair.right.spec, rightMeasured, rightTheory, observationTime)
	);

	function clamp(value: number, minimum: number, maximum: number): number {
		return Math.max(minimum, Math.min(maximum, value));
	}

	function gaussian(noiseSeed: string, trajectory: number, stream: string): GaussianSampler {
		return new GaussianSampler(new SeededRandom(`${noiseSeed}:trajectory:${trajectory}:${stream}`));
	}

	function generatePair(
		selectedPreset: ComparisonPreset,
		selectedSeed: string,
		match: boolean
	): { readonly left: Ensemble; readonly right: Ensemble } {
		const commonSeed = `${selectedSeed}:common-random-numbers`;
		const leftSeed = selectedPreset.matchable && match ? commonSeed : `${selectedSeed}:panel-a`;
		const rightSeed = selectedPreset.matchable && match ? commonSeed : `${selectedSeed}:panel-b`;
		return {
			left: generateEnsemble(selectedPreset.left, leftSeed),
			right: generateEnsemble(selectedPreset.right, rightSeed)
		};
	}

	function generateEnsemble(spec: ModelSpec, noiseSeed: string): Ensemble {
		if (spec.kind === 'fractional') {
			const paths = generateFractionalBrownianPaths({
				seed: `${noiseSeed}:davies-harte`,
				hurst: spec.hurst,
				scale: spec.scale,
				duration: DURATION,
				pointCount: POINT_COUNT,
				trajectoryCount: TRAJECTORY_COUNT
			});
			return {
				spec,
				x: paths.x,
				y: paths.y,
				trajectoryCount: TRAJECTORY_COUNT,
				pointCount: POINT_COUNT
			};
		}

		const x = new Float64Array(TRAJECTORY_COUNT * POINT_COUNT);
		const y = new Float64Array(TRAJECTORY_COUNT * POINT_COUNT);
		for (let trajectory = 0; trajectory < TRAJECTORY_COUNT; trajectory += 1) {
			const normalX = gaussian(noiseSeed, trajectory, 'x');
			const normalY = gaussian(noiseSeed, trajectory, 'y');
			const auxiliaryX = gaussian(noiseSeed, trajectory, 'auxiliary-x');
			const auxiliaryY = gaussian(noiseSeed, trajectory, 'auxiliary-y');
			const orientationNoise = gaussian(noiseSeed, trajectory, 'orientation');
			const initialVelocityX = gaussian(noiseSeed, trajectory, 'initial-velocity-x');
			const initialVelocityY = gaussian(noiseSeed, trajectory, 'initial-velocity-y');
			const stableAngleX = new SeededRandom(`${noiseSeed}:trajectory:${trajectory}:stable-angle-x`);
			const stableAngleY = new SeededRandom(`${noiseSeed}:trajectory:${trajectory}:stable-angle-y`);
			const stableExponentialX = new SeededRandom(
				`${noiseSeed}:trajectory:${trajectory}:stable-exponential-x`
			);
			const stableExponentialY = new SeededRandom(
				`${noiseSeed}:trajectory:${trajectory}:stable-exponential-y`
			);
			const orientationUniform = new SeededRandom(
				`${noiseSeed}:trajectory:${trajectory}:initial-orientation`
			);
			let positionX = 0;
			let positionY = 0;
			let velocityX = 0;
			let velocityY = 0;
			let orientation = 2 * Math.PI * orientationUniform.next();
			const offset = trajectory * POINT_COUNT;

			if (spec.kind === 'underdamped') {
				const equilibriumVelocity = Math.sqrt(spec.thermalEnergy / spec.mass);
				velocityX = equilibriumVelocity * initialVelocityX.next();
				velocityY = equilibriumVelocity * initialVelocityY.next();
			}

			for (let step = 1; step <= STEP_COUNT; step += 1) {
				if (spec.kind === 'free') {
					const scale = Math.sqrt(2 * spec.diffusion * TIMESTEP);
					positionX += scale * normalX.next();
					positionY += scale * normalY.next();
				} else if (spec.kind === 'drift') {
					const scale = Math.sqrt(2 * spec.diffusion * TIMESTEP);
					positionX += spec.driftX * TIMESTEP + scale * normalX.next();
					positionY += scale * normalY.next();
				} else if (spec.kind === 'anisotropic') {
					positionX += Math.sqrt(2 * spec.diffusionX * TIMESTEP) * normalX.next();
					positionY += Math.sqrt(2 * spec.diffusionY * TIMESTEP) * normalY.next();
				} else if (spec.kind === 'trap') {
					const decay = Math.exp(-spec.stiffness * TIMESTEP);
					const scale = Math.sqrt((spec.diffusion / spec.stiffness) * (1 - decay * decay));
					positionX = decay * positionX + scale * normalX.next();
					positionY = decay * positionY + scale * normalY.next();
				} else if (spec.kind === 'active') {
					const scale = Math.sqrt(2 * spec.diffusion * TIMESTEP);
					positionX += spec.speed * Math.cos(orientation) * TIMESTEP + scale * normalX.next();
					positionY += spec.speed * Math.sin(orientation) * TIMESTEP + scale * normalY.next();
					orientation +=
						Math.sqrt(2 * spec.rotationalDiffusion * TIMESTEP) * orientationNoise.next();
				} else if (spec.kind === 'levy') {
					const scale = spec.scale * TIMESTEP ** (1 / spec.stability);
					positionX +=
						scale *
						sampleSymmetricStable(spec.stability, stableAngleX.next(), stableExponentialX.next());
					positionY +=
						scale *
						sampleSymmetricStable(spec.stability, stableAngleY.next(), stableExponentialY.next());
				} else if (spec.kind === 'underdamped') {
					const relaxationRate = spec.drag / spec.mass;
					const velocityVariance = spec.thermalEnergy / spec.mass;
					const decay = Math.exp(-relaxationRate * TIMESTEP);
					const velocityNoiseVariance = velocityVariance * (1 - decay * decay);
					const velocityNoiseScale = Math.sqrt(velocityNoiseVariance);
					const positionVelocityCovariance = (velocityVariance * (1 - decay) ** 2) / relaxationRate;
					const positionNoiseVariance =
						((2 * velocityVariance) / relaxationRate) *
						(TIMESTEP -
							(2 * (1 - decay)) / relaxationRate +
							(1 - decay * decay) / (2 * relaxationRate));
					const correlatedScale = positionVelocityCovariance / velocityNoiseScale;
					const residualScale = Math.sqrt(
						Math.max(0, positionNoiseVariance - correlatedScale * correlatedScale)
					);
					const kickX = normalX.next();
					const kickY = normalY.next();
					positionX +=
						(velocityX * (1 - decay)) / relaxationRate +
						correlatedScale * kickX +
						residualScale * auxiliaryX.next();
					positionY +=
						(velocityY * (1 - decay)) / relaxationRate +
						correlatedScale * kickY +
						residualScale * auxiliaryY.next();
					velocityX = decay * velocityX + velocityNoiseScale * kickX;
					velocityY = decay * velocityY + velocityNoiseScale * kickY;
				}

				x[offset + step] = positionX;
				y[offset + step] = positionY;
			}
		}

		return { spec, x, y, trajectoryCount: TRAJECTORY_COUNT, pointCount: POINT_COUNT };
	}

	function theoryAt(spec: ModelSpec, time: number): TheorySnapshot {
		if (spec.kind === 'free') {
			const variance = 2 * spec.diffusion * time;
			return {
				meanX: 0,
				meanY: 0,
				msd: 2 * variance,
				varianceX: variance,
				varianceY: variance,
				note: 'Exact Gaussian propagator; radial MSD = 4Dt.'
			};
		}
		if (spec.kind === 'drift') {
			const variance = 2 * spec.diffusion * time;
			return {
				meanX: spec.driftX * time,
				meanY: 0,
				msd: 2 * variance + (spec.driftX * time) ** 2,
				varianceX: variance,
				varianceY: variance,
				note: 'The mean moves as μt; centred variance still grows as 4Dt.'
			};
		}
		if (spec.kind === 'anisotropic') {
			const varianceX = 2 * spec.diffusionX * time;
			const varianceY = 2 * spec.diffusionY * time;
			return {
				meanX: 0,
				meanY: 0,
				msd: varianceX + varianceY,
				varianceX,
				varianceY,
				note: 'The Gaussian theory contour is elliptical: Varₓ/Varᵧ = Dₓ/Dᵧ.'
			};
		}
		if (spec.kind === 'trap') {
			const variance =
				(spec.diffusion / spec.stiffness) * (1 - Math.exp(-2 * spec.stiffness * time));
			return {
				meanX: 0,
				meanY: 0,
				msd: 2 * variance,
				varianceX: variance,
				varianceY: variance,
				note: `Exact OU variance; long-time radial MSD → ${formatNumber((2 * spec.diffusion) / spec.stiffness)}.`
			};
		}
		if (spec.kind === 'underdamped') {
			const relaxationTime = spec.mass / spec.drag;
			const longTimeDiffusion = spec.thermalEnergy / spec.drag;
			const msd =
				4 * longTimeDiffusion * (time - relaxationTime * (1 - Math.exp(-time / relaxationTime)));
			return {
				meanX: 0,
				meanY: 0,
				msd,
				varianceX: msd / 2,
				varianceY: msd / 2,
				note: `Equilibrium theory: ballistic below τᵥ = ${formatNumber(relaxationTime)} s, diffusive later.`
			};
		}
		if (spec.kind === 'active') {
			const rotational = spec.rotationalDiffusion;
			const activePart =
				rotational === 0
					? spec.speed ** 2 * time ** 2
					: (2 * spec.speed ** 2 * (rotational * time + Math.exp(-rotational * time) - 1)) /
						rotational ** 2;
			const msd = 4 * spec.diffusion * time + activePart;
			return {
				meanX: 0,
				meanY: 0,
				msd,
				varianceX: msd / 2,
				varianceY: msd / 2,
				note: `Orientation-averaged theory; persistence time = ${formatNumber(1 / rotational)} s.`
			};
		}
		if (spec.kind === 'fractional') {
			const variance = spec.scale ** 2 * time ** (2 * spec.hurst);
			return {
				meanX: 0,
				meanY: 0,
				msd: 2 * variance,
				varianceX: variance,
				varianceY: variance,
				note: `Davies–Harte covariance; radial MSD ∝ t${superscript(2 * spec.hurst)}.`
			};
		}
		return {
			meanX: 0,
			meanY: 0,
			msd: null,
			varianceX: null,
			varianceY: null,
			note: `For α = ${formatNumber(spec.stability)}, the mean exists but the variance and MSD do not.`
		};
	}

	function superscript(value: number): string {
		return `^${value.toFixed(2)}`;
	}

	function measureAt(ensemble: Ensemble, index: number): MeasuredSnapshot {
		let meanX = 0;
		let meanY = 0;
		let meanSquaredRadius = 0;
		const squaredRadii = new Float64Array(ensemble.trajectoryCount);
		for (let trajectory = 0; trajectory < ensemble.trajectoryCount; trajectory += 1) {
			const offset = trajectory * ensemble.pointCount + index;
			const x = ensemble.x[offset];
			const y = ensemble.y[offset];
			meanX += x;
			meanY += y;
			const squaredRadius = x * x + y * y;
			meanSquaredRadius += squaredRadius;
			squaredRadii[trajectory] = squaredRadius;
		}
		meanX /= ensemble.trajectoryCount;
		meanY /= ensemble.trajectoryCount;
		meanSquaredRadius /= ensemble.trajectoryCount;
		let varianceX = 0;
		let varianceY = 0;
		for (let trajectory = 0; trajectory < ensemble.trajectoryCount; trajectory += 1) {
			const offset = trajectory * ensemble.pointCount + index;
			varianceX += (ensemble.x[offset] - meanX) ** 2;
			varianceY += (ensemble.y[offset] - meanY) ** 2;
		}
		varianceX /= ensemble.trajectoryCount;
		varianceY /= ensemble.trajectoryCount;
		const sorted = Array.from(squaredRadii).sort((first, second) => first - second);
		const middle = sorted.length / 2;
		const medianSquaredRadius = (sorted[middle - 1] + sorted[middle]) / 2;
		return {
			meanX,
			meanY,
			msd: meanSquaredRadius,
			standardDeviationX: Math.sqrt(varianceX),
			standardDeviationY: Math.sqrt(varianceY),
			medianSquaredRadius
		};
	}

	function metricRows(
		spec: ModelSpec,
		measured: MeasuredSnapshot,
		theory: TheorySnapshot,
		time: number
	): readonly MetricRow[] {
		if (spec.kind === 'levy') {
			return [
				{
					label: 'Median r²',
					measured: formatNumber(measured.medianSquaredRadius),
					theoretical: `scales as t${superscript(2 / spec.stability)}`
				},
				{
					label: 'Sample mean r²',
					measured: `${formatNumber(measured.msd)} (unstable)`,
					theoretical: 'MSD undefined'
				},
				{
					label: 'Mean x',
					measured: formatSigned(measured.meanX),
					theoretical: '0 (α > 1)'
				}
			];
		}
		return [
			{
				label: 'Mean x',
				measured: formatSigned(measured.meanX),
				theoretical: formatSigned(theory.meanX)
			},
			{
				label: 'Radial MSD',
				measured: formatNumber(measured.msd),
				theoretical: theory.msd === null ? 'undefined' : formatNumber(theory.msd)
			},
			{
				label: 'σₓ / σᵧ',
				measured: `${formatNumber(measured.standardDeviationX)} / ${formatNumber(measured.standardDeviationY)}`,
				theoretical:
					theory.varianceX === null || theory.varianceY === null
						? 'undefined'
						: `${formatNumber(Math.sqrt(theory.varianceX))} / ${formatNumber(Math.sqrt(theory.varianceY))}`
			}
		].map((row) =>
			time === 0 && row.label === 'σₓ / σᵧ'
				? { ...row, measured: '0 / 0', theoretical: '0 / 0' }
				: row
		);
	}

	function formatNumber(value: number): string {
		const absolute = Math.abs(value);
		if (absolute >= 10_000 || (absolute > 0 && absolute < 0.001)) return value.toExponential(2);
		if (absolute >= 100) return value.toFixed(1);
		if (absolute >= 10) return value.toFixed(2);
		return value.toFixed(3);
	}

	function formatSigned(value: number): string {
		if (Math.abs(value) < 0.0005) return '0.000';
		return `${value > 0 ? '+' : '−'}${formatNumber(Math.abs(value))}`;
	}

	function worldToScreen(x: number, y: number, camera: Camera): ScreenPoint {
		const horizontalSpan = camera.span * ASPECT_RATIO;
		const screenX = PLOT_WIDTH / 2 + ((x - camera.centreX) / horizontalSpan) * PLOT_WIDTH;
		const screenY = PLOT_HEIGHT / 2 - ((y - camera.centreY) / camera.span) * PLOT_HEIGHT;
		return {
			x: screenX,
			y: screenY,
			visible: screenX >= 0 && screenX <= PLOT_WIDTH && screenY >= 0 && screenY <= PLOT_HEIGHT
		};
	}

	function pathData(ensemble: Ensemble, camera: Camera, index: number): readonly string[] {
		const paths: string[] = [];
		for (
			let trajectory = 0;
			trajectory < Math.min(DRAWN_TRAJECTORY_COUNT, ensemble.trajectoryCount);
			trajectory += 1
		) {
			const offset = trajectory * ensemble.pointCount;
			let path = '';
			for (let point = 0; point <= index; point += 1) {
				const screen = worldToScreen(
					ensemble.x[offset + point],
					ensemble.y[offset + point],
					camera
				);
				path += `${point === 0 ? 'M' : 'L'}${screen.x.toFixed(2)},${screen.y.toFixed(2)}`;
			}
			paths.push(path);
		}
		return paths;
	}

	function endpointData(ensemble: Ensemble, camera: Camera, index: number): readonly ScreenPoint[] {
		const endpoints: ScreenPoint[] = [];
		for (let trajectory = 0; trajectory < ensemble.trajectoryCount; trajectory += 1) {
			const offset = trajectory * ensemble.pointCount + index;
			endpoints.push(worldToScreen(ensemble.x[offset], ensemble.y[offset], camera));
		}
		return endpoints;
	}

	function theoryOverlay(
		theory: TheorySnapshot,
		camera: Camera
	): {
		readonly centre: ScreenPoint;
		readonly radiusX: number;
		readonly radiusY: number;
		readonly available: boolean;
	} {
		const centre = worldToScreen(theory.meanX, theory.meanY, camera);
		const horizontalSpan = camera.span * ASPECT_RATIO;
		return {
			centre,
			radiusX:
				theory.varianceX === null ? 0 : (Math.sqrt(theory.varianceX) / horizontalSpan) * PLOT_WIDTH,
			radiusY:
				theory.varianceY === null ? 0 : (Math.sqrt(theory.varianceY) / camera.span) * PLOT_HEIGHT,
			available: theory.varianceX !== null && theory.varianceY !== null
		};
	}

	function quantile(sorted: readonly number[], probability: number): number {
		if (sorted.length === 0) return 0;
		const position = (sorted.length - 1) * probability;
		const lower = Math.floor(position);
		const upper = Math.ceil(position);
		if (lower === upper) return sorted[lower];
		return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
	}

	function fitCamera(ensembles: readonly Ensemble[]): Camera {
		const xValues: number[] = [0];
		const yValues: number[] = [0];
		for (const ensemble of ensembles) {
			for (let index = 0; index < ensemble.x.length; index += 2) {
				if (Number.isFinite(ensemble.x[index]) && Number.isFinite(ensemble.y[index])) {
					xValues.push(ensemble.x[index]);
					yValues.push(ensemble.y[index]);
				}
			}
		}
		xValues.sort((first, second) => first - second);
		yValues.sort((first, second) => first - second);
		// Robust limits stop a single Lévy jump from shrinking every ordinary step to a dot.
		const lowerX = quantile(xValues, 0.006);
		const upperX = quantile(xValues, 0.994);
		const lowerY = quantile(yValues, 0.006);
		const upperY = quantile(yValues, 0.994);
		const centreX = (lowerX + upperX) / 2;
		const centreY = (lowerY + upperY) / 2;
		const requiredVerticalSpan = Math.max(upperY - lowerY, (upperX - lowerX) / ASPECT_RATIO);
		return {
			centreX,
			centreY,
			span: clamp(requiredVerticalSpan * 1.18, 2.4, MAX_CAMERA_SPAN)
		};
	}

	function resetCameras(announce = true): void {
		if (linkedCamera) {
			const camera = fitCamera([pair.left, pair.right]);
			leftCamera = { ...camera };
			rightCamera = { ...camera };
		} else {
			leftCamera = fitCamera([pair.left]);
			rightCamera = fitCamera([pair.right]);
		}
		if (announce)
			status = linkedCamera
				? 'Linked cameras fitted to both ensembles.'
				: 'Each camera fitted to its own ensemble.';
	}

	function resetSide(side: Side): void {
		if (linkedCamera) {
			resetCameras();
			return;
		}
		if (side === 'left') leftCamera = fitCamera([pair.left]);
		else rightCamera = fitCamera([pair.right]);
		status = `Panel ${side === 'left' ? 'A' : 'B'} camera reset.`;
	}

	function choosePreset(event: Event): void {
		presetId = (event.currentTarget as HTMLSelectElement).value as PresetId;
		const next = PRESETS.find((candidate) => candidate.id === presetId) ?? PRESETS[0];
		matchedNoise = next.matchable;
		timeIndex = STEP_COUNT;
		resetCameras(false);
		status = `${next.label}. ${next.couplingNote}`;
	}

	function applySeed(event: SubmitEvent): void {
		event.preventDefault();
		const trimmed = seedDraft.trim();
		seed = trimmed || 'comparison-1827';
		seedDraft = seed;
		resetCameras(false);
		status = `Replayed both panels from seed “${seed}”.`;
	}

	function nextSeed(): void {
		seedSequence += 1;
		seed = `comparison-${String(seedSequence).padStart(3, '0')}`;
		seedDraft = seed;
		resetCameras(false);
		status = `Loaded deterministic seed “${seed}”.`;
	}

	function changeMatching(event: Event): void {
		matchedNoise = (event.currentTarget as HTMLInputElement).checked;
		resetCameras(false);
		status = matchedNoise
			? `Matched noise enabled. ${preset.couplingNote}`
			: 'Independent labelled random streams are now used for panels A and B.';
	}

	function setCameraMode(linked: boolean): void {
		linkedCamera = linked;
		resetCameras(false);
		status = linked
			? 'Cameras linked: panning or zooming either panel moves both.'
			: 'Cameras independent: each panel can now be framed separately.';
	}

	function dividerPointerDown(event: PointerEvent): void {
		dividerDragging = true;
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
		updateDivider(event);
	}

	function updateDivider(event: PointerEvent): void {
		if (!dividerDragging || !gridElement) return;
		const bounds = gridElement.getBoundingClientRect();
		dividerPercent = clamp(
			((event.clientX - bounds.left) / Math.max(1, bounds.width)) * 100,
			DIVIDER_MINIMUM,
			DIVIDER_MAXIMUM
		);
	}

	function dividerPointerUp(event: PointerEvent): void {
		dividerDragging = false;
		const target = event.currentTarget as HTMLElement;
		if (target.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId);
		status = `Panel A uses ${Math.round(dividerPercent)}% of the comparison width.`;
	}

	function dividerKeydown(event: KeyboardEvent): void {
		let next = dividerPercent;
		const increment = event.shiftKey ? 5 : 2;
		if (event.key === 'ArrowLeft') next -= increment;
		else if (event.key === 'ArrowRight') next += increment;
		else if (event.key === 'Home') next = DIVIDER_MINIMUM;
		else if (event.key === 'End') next = DIVIDER_MAXIMUM;
		else if (event.key === 'Enter' || event.key === ' ') next = 50;
		else return;
		event.preventDefault();
		dividerPercent = clamp(next, DIVIDER_MINIMUM, DIVIDER_MAXIMUM);
		status = `Panel A uses ${Math.round(dividerPercent)}% of the comparison width.`;
	}

	function currentCamera(side: Side): Camera {
		return side === 'left' ? leftCamera : rightCamera;
	}

	function setCamera(side: Side, camera: Camera): void {
		if (linkedCamera) {
			leftCamera = { ...camera };
			rightCamera = { ...camera };
		} else if (side === 'left') leftCamera = camera;
		else rightCamera = camera;
	}

	function plotPointerDown(event: PointerEvent, side: Side): void {
		const target = event.currentTarget as HTMLButtonElement;
		target.setPointerCapture(event.pointerId);
		panState = {
			side,
			pointerId: event.pointerId,
			startClientX: event.clientX,
			startClientY: event.clientY,
			startLeft: { ...leftCamera },
			startRight: { ...rightCamera }
		};
	}

	function plotPointerMove(event: PointerEvent): void {
		if (!panState || panState.pointerId !== event.pointerId) return;
		const target = event.currentTarget as HTMLButtonElement;
		const bounds = target.getBoundingClientRect();
		const reference = panState.side === 'left' ? panState.startLeft : panState.startRight;
		const deltaX =
			-((event.clientX - panState.startClientX) / Math.max(1, bounds.width)) *
			reference.span *
			ASPECT_RATIO;
		const deltaY =
			((event.clientY - panState.startClientY) / Math.max(1, bounds.height)) * reference.span;
		setCamera(panState.side, {
			centreX: reference.centreX + deltaX,
			centreY: reference.centreY + deltaY,
			span: reference.span
		});
	}

	function plotPointerUp(event: PointerEvent): void {
		if (!panState || panState.pointerId !== event.pointerId) return;
		const side = panState.side;
		panState = null;
		const target = event.currentTarget as HTMLButtonElement;
		if (target.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId);
		status = `${linkedCamera ? 'Linked cameras' : `Panel ${side === 'left' ? 'A' : 'B'}`} panned.`;
	}

	function zoomPanel(side: Side, factor: number, announce = true): void {
		const camera = currentCamera(side);
		setCamera(side, {
			...camera,
			span: clamp(camera.span * factor, MIN_CAMERA_SPAN, MAX_CAMERA_SPAN)
		});
		if (announce)
			status = `${linkedCamera ? 'Linked cameras' : `Panel ${side === 'left' ? 'A' : 'B'}`} zoomed ${factor < 1 ? 'in' : 'out'}.`;
	}

	function plotWheel(event: WheelEvent, side: Side): void {
		event.preventDefault();
		zoomPanel(side, event.deltaY < 0 ? 0.88 : 1.14, false);
	}

	function plotKeydown(event: KeyboardEvent, side: Side): void {
		const camera = currentCamera(side);
		const fraction = event.shiftKey ? 0.16 : 0.07;
		let centreX = camera.centreX;
		let centreY = camera.centreY;
		if (event.key === 'ArrowLeft') centreX -= camera.span * ASPECT_RATIO * fraction;
		else if (event.key === 'ArrowRight') centreX += camera.span * ASPECT_RATIO * fraction;
		else if (event.key === 'ArrowUp') centreY += camera.span * fraction;
		else if (event.key === 'ArrowDown') centreY -= camera.span * fraction;
		else if (event.key === '+' || event.key === '=') {
			event.preventDefault();
			zoomPanel(side, 0.85);
			return;
		} else if (event.key === '-' || event.key === '_') {
			event.preventDefault();
			zoomPanel(side, 1.18);
			return;
		} else if (event.key === '0' || event.key === 'Home') {
			event.preventDefault();
			resetSide(side);
			return;
		} else return;
		event.preventDefault();
		setCamera(side, { ...camera, centreX, centreY });
	}

	function timeInput(event: Event): void {
		timeIndex = Number((event.currentTarget as HTMLInputElement).value);
	}

	onDestroy(() => {
		dividerDragging = false;
		panState = null;
	});
</script>

<section class="comparison" aria-labelledby="comparison-title">
	<header class="introduction">
		<div>
			<p class="eyebrow">A/B stochastic workbench</p>
			<h2 id="comparison-title">Same seed. Different physics.</h2>
			<p>{preset.question}</p>
		</div>
		<div class="sample-stamp" aria-label={`${TRAJECTORY_COUNT} trajectories per panel`}>
			<span>Ensemble</span>
			<strong>{TRAJECTORY_COUNT} × 2</strong>
			<small>{POINT_COUNT} points each</small>
		</div>
	</header>

	<div class="experiment-bar">
		<label class="preset-control">
			<span>Comparison preset</span>
			<select value={presetId} onchange={choosePreset}>
				{#each PRESETS as option, index (option.id)}
					<option value={option.id}>{String(index + 1).padStart(2, '0')} · {option.label}</option>
				{/each}
			</select>
		</label>

		<form class="seed-control" onsubmit={applySeed}>
			<label>
				<span>Replay seed</span>
				<input bind:value={seedDraft} maxlength="64" spellcheck="false" autocomplete="off" />
			</label>
			<button type="submit">Apply</button>
			<button type="button" onclick={nextSeed}>Next seed</button>
		</form>

		<div class="camera-mode">
			<span id="camera-mode-label">Camera</span>
			<div class="segmented" role="group" aria-labelledby="camera-mode-label">
				<button
					type="button"
					class:active={linkedCamera}
					aria-pressed={linkedCamera}
					onclick={() => setCameraMode(true)}>Linked</button
				>
				<button
					type="button"
					class:active={!linkedCamera}
					aria-pressed={!linkedCamera}
					onclick={() => setCameraMode(false)}>Independent</button
				>
			</div>
		</div>
	</div>

	<div class="coupling-bar">
		{#if preset.matchable}
			<label class="switch">
				<input type="checkbox" checked={matchedNoise} onchange={changeMatching} />
				<span aria-hidden="true"></span>
				<strong>Matched noise</strong>
			</label>
		{:else}
			<span class="independent-badge">Independent noise only</span>
		{/if}
		<p><strong>Coupling:</strong> {preset.couplingNote}</p>
	</div>

	<div class="time-control">
		<label for="comparison-time">Observation time</label>
		<input
			id="comparison-time"
			type="range"
			min="1"
			max={STEP_COUNT}
			step="1"
			value={timeIndex}
			oninput={timeInput}
		/>
		<output for="comparison-time">t = {observationTime.toFixed(2)} s</output>
	</div>

	<div
		class="comparison-grid"
		class:dragging={dividerDragging}
		bind:this={gridElement}
		style={`--left-panel:${dividerPercent}fr;--right-panel:${100 - dividerPercent}fr;`}
	>
		<article class="panel panel-a" aria-labelledby="comparison-panel-a-title">
			<div class="panel-heading">
				<span class="panel-letter">A</span>
				<div>
					<h3 id="comparison-panel-a-title">{pair.left.spec.label}</h3>
					<code>{pair.left.spec.equation}</code>
				</div>
			</div>

			<figure>
				<button
					type="button"
					class="plot-interaction"
					aria-label={`Panel A, ${pair.left.spec.label}. Drag or use arrow keys to pan; plus and minus zoom; zero resets.`}
					onpointerdown={(event) => plotPointerDown(event, 'left')}
					onpointermove={plotPointerMove}
					onpointerup={plotPointerUp}
					onpointercancel={plotPointerUp}
					onwheel={(event) => plotWheel(event, 'left')}
					onkeydown={(event) => plotKeydown(event, 'left')}
				>
					<svg viewBox={`0 0 ${PLOT_WIDTH} ${PLOT_HEIGHT}`} aria-hidden="true" focusable="false">
						<title
							>{pair.left.spec.label} trajectories at {observationTime.toFixed(2)} seconds</title
						>
						<defs>
							<pattern id="comparison-grid-a" width="31" height="31" patternUnits="userSpaceOnUse">
								<path d="M 31 0 L 0 0 0 31" class="grid-line" />
							</pattern>
							<clipPath id="comparison-clip-a"
								><rect width={PLOT_WIDTH} height={PLOT_HEIGHT} /></clipPath
							>
						</defs>
						<rect class="plot-paper" width={PLOT_WIDTH} height={PLOT_HEIGHT} />
						<rect
							class="grid-paper"
							width={PLOT_WIDTH}
							height={PLOT_HEIGHT}
							fill="url(#comparison-grid-a)"
						/>
						<g clip-path="url(#comparison-clip-a)">
							<path class="axis" d={`M0 ${PLOT_HEIGHT / 2}H${PLOT_WIDTH}`} />
							<path class="axis" d={`M${PLOT_WIDTH / 2} 0V${PLOT_HEIGHT}`} />
							{#each leftPaths as path, index (index)}
								<path class="trajectory" d={path} style={`--path-order:${index}`} />
							{/each}
							{#if leftOverlay.available}
								<ellipse
									class="theory-contour"
									cx={leftOverlay.centre.x}
									cy={leftOverlay.centre.y}
									rx={leftOverlay.radiusX}
									ry={leftOverlay.radiusY}
								/>
								<path
									class="theory-mean"
									d={`M${leftOverlay.centre.x - 5},${leftOverlay.centre.y} L${leftOverlay.centre.x},${leftOverlay.centre.y - 5} L${leftOverlay.centre.x + 5},${leftOverlay.centre.y} L${leftOverlay.centre.x},${leftOverlay.centre.y + 5} Z`}
								/>
							{/if}
							{#each leftEndpoints as point, index (index)}
								{#if point.visible}<circle
										class="endpoint"
										cx={point.x}
										cy={point.y}
										r={index === 0 ? 4.2 : 2.6}
									/>{/if}
							{/each}
							{#if leftMeasuredMean.visible}
								<path
									class="measured-mean"
									d={`M${leftMeasuredMean.x - 5},${leftMeasuredMean.y}h10M${leftMeasuredMean.x},${leftMeasuredMean.y - 5}v10`}
								/>
							{/if}
						</g>
						<text class="scale-label" x="12" y={PLOT_HEIGHT - 12}
							>span {formatNumber(leftCamera.span)} units</text
						>
					</svg>
				</button>
				<figcaption>
					<span><i class="measured-key"></i> measured paths / mean +</span>
					<span><i class="theory-key"></i> theory 1σ contour / mean ◇</span>
				</figcaption>
			</figure>

			<div class="camera-buttons" aria-label="Panel A camera controls">
				<button type="button" aria-label="Zoom panel A in" onclick={() => zoomPanel('left', 0.8)}
					>＋</button
				>
				<button type="button" aria-label="Zoom panel A out" onclick={() => zoomPanel('left', 1.25)}
					>−</button
				>
				<button type="button" onclick={() => resetSide('left')}>Fit A</button>
			</div>

			<dl class="metrics">
				{#each leftRows as row (row.label)}
					<div>
						<dt>{row.label}</dt>
						<dd><span>measured</span><strong>{row.measured}</strong></dd>
						<dd><span>theory</span><strong>{row.theoretical}</strong></dd>
					</div>
				{/each}
			</dl>
			<p class="theory-note"><strong>Theory.</strong> {leftTheory.note}</p>
		</article>

		<div
			class="divider"
			role="slider"
			aria-label="Panel A width"
			aria-orientation="horizontal"
			aria-valuemin={DIVIDER_MINIMUM}
			aria-valuemax={DIVIDER_MAXIMUM}
			aria-valuenow={Math.round(dividerPercent)}
			aria-valuetext={`Panel A ${Math.round(dividerPercent)} percent, panel B ${Math.round(100 - dividerPercent)} percent`}
			tabindex="0"
			onpointerdown={dividerPointerDown}
			onpointermove={updateDivider}
			onpointerup={dividerPointerUp}
			onpointercancel={dividerPointerUp}
			onkeydown={dividerKeydown}
			ondblclick={() => (dividerPercent = 50)}
		>
			<span aria-hidden="true">•••</span>
		</div>

		<article class="panel panel-b" aria-labelledby="comparison-panel-b-title">
			<div class="panel-heading">
				<span class="panel-letter">B</span>
				<div>
					<h3 id="comparison-panel-b-title">{pair.right.spec.label}</h3>
					<code>{pair.right.spec.equation}</code>
				</div>
			</div>

			<figure>
				<button
					type="button"
					class="plot-interaction"
					aria-label={`Panel B, ${pair.right.spec.label}. Drag or use arrow keys to pan; plus and minus zoom; zero resets.`}
					onpointerdown={(event) => plotPointerDown(event, 'right')}
					onpointermove={plotPointerMove}
					onpointerup={plotPointerUp}
					onpointercancel={plotPointerUp}
					onwheel={(event) => plotWheel(event, 'right')}
					onkeydown={(event) => plotKeydown(event, 'right')}
				>
					<svg viewBox={`0 0 ${PLOT_WIDTH} ${PLOT_HEIGHT}`} aria-hidden="true" focusable="false">
						<title
							>{pair.right.spec.label} trajectories at {observationTime.toFixed(2)} seconds</title
						>
						<defs>
							<pattern id="comparison-grid-b" width="31" height="31" patternUnits="userSpaceOnUse">
								<path d="M 31 0 L 0 0 0 31" class="grid-line" />
							</pattern>
							<clipPath id="comparison-clip-b"
								><rect width={PLOT_WIDTH} height={PLOT_HEIGHT} /></clipPath
							>
						</defs>
						<rect class="plot-paper" width={PLOT_WIDTH} height={PLOT_HEIGHT} />
						<rect
							class="grid-paper"
							width={PLOT_WIDTH}
							height={PLOT_HEIGHT}
							fill="url(#comparison-grid-b)"
						/>
						<g clip-path="url(#comparison-clip-b)">
							<path class="axis" d={`M0 ${PLOT_HEIGHT / 2}H${PLOT_WIDTH}`} />
							<path class="axis" d={`M${PLOT_WIDTH / 2} 0V${PLOT_HEIGHT}`} />
							{#each rightPaths as path, index (index)}
								<path class="trajectory" d={path} style={`--path-order:${index}`} />
							{/each}
							{#if rightOverlay.available}
								<ellipse
									class="theory-contour"
									cx={rightOverlay.centre.x}
									cy={rightOverlay.centre.y}
									rx={rightOverlay.radiusX}
									ry={rightOverlay.radiusY}
								/>
								<path
									class="theory-mean"
									d={`M${rightOverlay.centre.x - 5},${rightOverlay.centre.y} L${rightOverlay.centre.x},${rightOverlay.centre.y - 5} L${rightOverlay.centre.x + 5},${rightOverlay.centre.y} L${rightOverlay.centre.x},${rightOverlay.centre.y + 5} Z`}
								/>
							{/if}
							{#each rightEndpoints as point, index (index)}
								{#if point.visible}<circle
										class="endpoint"
										cx={point.x}
										cy={point.y}
										r={index === 0 ? 4.2 : 2.6}
									/>{/if}
							{/each}
							{#if rightMeasuredMean.visible}
								<path
									class="measured-mean"
									d={`M${rightMeasuredMean.x - 5},${rightMeasuredMean.y}h10M${rightMeasuredMean.x},${rightMeasuredMean.y - 5}v10`}
								/>
							{/if}
						</g>
						<text class="scale-label" x="12" y={PLOT_HEIGHT - 12}
							>span {formatNumber(rightCamera.span)} units</text
						>
					</svg>
				</button>
				<figcaption>
					<span><i class="measured-key"></i> measured paths / mean +</span>
					<span><i class="theory-key"></i> theory 1σ contour / mean ◇</span>
				</figcaption>
			</figure>

			<div class="camera-buttons" aria-label="Panel B camera controls">
				<button type="button" aria-label="Zoom panel B in" onclick={() => zoomPanel('right', 0.8)}
					>＋</button
				>
				<button type="button" aria-label="Zoom panel B out" onclick={() => zoomPanel('right', 1.25)}
					>−</button
				>
				<button type="button" onclick={() => resetSide('right')}>Fit B</button>
			</div>

			<dl class="metrics">
				{#each rightRows as row (row.label)}
					<div>
						<dt>{row.label}</dt>
						<dd><span>measured</span><strong>{row.measured}</strong></dd>
						<dd><span>theory</span><strong>{row.theoretical}</strong></dd>
					</div>
				{/each}
			</dl>
			<p class="theory-note"><strong>Theory.</strong> {rightTheory.note}</p>
		</article>
	</div>

	<footer>
		<p class="status" role="status">{status}</p>
		<p class="instrument-note">
			<strong>Reading the instrument.</strong> Solid traces and plus signs are finite-ensemble measurements.
			Dashed contours, diamonds, and “theory” readouts are analytical predictions at the selected time.
			The robust camera fit may crop the rarest Lévy jumps; its unstable sample MSD is reported, never
			mistaken for a finite theoretical variance.
		</p>
	</footer>
</section>

<style>
	.comparison {
		--lab-blue: #60799d;
		--lab-rust: #9a5f48;
		--lab-brass: #a58343;
		position: relative;
		left: calc(50% + var(--article-breakout-offset, 0rem));
		box-sizing: border-box;
		width: min(88rem, calc(100vw - 1rem));
		margin: 2.75rem 0;
		transform: translateX(-50%);
		border: 1px solid var(--rule, #c8c1b2);
		border-radius: 0.7rem;
		background: var(--paper-raised, #f6f2e8);
		color: var(--ink, #242a32);
		font-family: Roboto, system-ui, sans-serif;
		overflow: hidden;
	}

	.introduction {
		display: flex;
		align-items: start;
		justify-content: space-between;
		gap: 1.25rem;
		border-bottom: 1px solid var(--rule, #c8c1b2);
		padding: 1.1rem 1.25rem;
		background:
			linear-gradient(110deg, color-mix(in srgb, var(--lab-blue) 9%, transparent), transparent 48%),
			var(--paper-raised, #f6f2e8);
	}

	.introduction h2,
	.introduction p {
		margin: 0;
	}

	.introduction h2 {
		margin-top: 0.16rem;
		font-family: 'Source Serif 4', Georgia, serif;
		font-size: clamp(1.25rem, 2vw, 1.75rem);
		letter-spacing: -0.02em;
	}

	.introduction h2 + p {
		margin-top: 0.38rem;
		color: var(--ink-muted, #68707a);
		font-family: 'Source Serif 4', Georgia, serif;
		font-size: 0.93rem;
	}

	.eyebrow {
		color: var(--lab-rust);
		font:
			700 0.68rem 'Courier Prime',
			monospace;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}

	.sample-stamp {
		min-width: 8rem;
		border-left: 3px double var(--lab-brass);
		padding-left: 0.85rem;
		text-align: right;
	}

	.sample-stamp span,
	.sample-stamp small {
		display: block;
		color: var(--ink-muted, #68707a);
		font-size: 0.65rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.sample-stamp strong {
		display: block;
		margin: 0.15rem 0;
		font:
			700 1rem 'Courier Prime',
			monospace;
	}

	.experiment-bar {
		display: grid;
		grid-template-columns: minmax(13rem, 1.15fr) minmax(19rem, 1.6fr) auto;
		align-items: end;
		gap: 0.7rem;
		border-bottom: 1px solid var(--rule, #c8c1b2);
		padding: 0.75rem 1rem;
		background: var(--paper-soft, #ece6da);
	}

	label > span,
	.camera-mode > span {
		display: block;
		margin-bottom: 0.28rem;
		color: var(--ink-muted, #68707a);
		font-size: 0.66rem;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	select,
	input,
	button {
		font: inherit;
	}

	select,
	.seed-control input,
	button {
		min-height: 2.55rem;
		box-sizing: border-box;
		border: 1px solid var(--rule, #aaa293);
		border-radius: 0.34rem;
		background: var(--paper, #f7f2e8);
		color: var(--ink, #242a32);
	}

	select,
	.seed-control input {
		width: 100%;
		padding: 0.48rem 0.58rem;
	}

	select {
		font-weight: 700;
	}

	.seed-control {
		display: grid;
		grid-template-columns: minmax(8rem, 1fr) auto auto;
		align-items: end;
		gap: 0.4rem;
	}

	.seed-control input {
		font-family: 'Courier Prime', monospace;
	}

	button {
		padding: 0.45rem 0.68rem;
		font-size: 0.76rem;
		font-weight: 700;
		cursor: pointer;
	}

	button:hover {
		background: color-mix(in srgb, var(--lab-blue) 10%, var(--paper, #f7f2e8));
	}

	button:focus-visible,
	select:focus-visible,
	input:focus-visible,
	.divider:focus-visible,
	.plot-interaction:focus-visible {
		outline: 3px solid color-mix(in srgb, var(--lab-blue) 70%, white);
		outline-offset: 2px;
	}

	.segmented {
		display: flex;
	}

	.segmented button {
		border-radius: 0;
	}

	.segmented button:first-child {
		border-radius: 0.34rem 0 0 0.34rem;
	}

	.segmented button:last-child {
		margin-left: -1px;
		border-radius: 0 0.34rem 0.34rem 0;
	}

	.segmented button.active {
		position: relative;
		z-index: 1;
		border-color: var(--lab-blue);
		background: var(--lab-blue);
		color: white;
	}

	.coupling-bar {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		min-height: 2.8rem;
		border-bottom: 1px solid var(--rule, #c8c1b2);
		padding: 0.45rem 1rem;
	}

	.coupling-bar p {
		margin: 0;
		color: var(--ink-muted, #68707a);
		font-size: 0.75rem;
		line-height: 1.4;
	}

	.switch {
		display: inline-flex;
		flex: 0 0 auto;
		align-items: center;
		gap: 0.42rem;
		min-height: 2rem;
		cursor: pointer;
	}

	.switch input {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		opacity: 0;
	}

	.switch span {
		position: relative;
		display: block;
		width: 2.1rem;
		height: 1.15rem;
		margin: 0;
		border: 1px solid var(--rule, #aaa293);
		border-radius: 999px;
		background: var(--paper-soft, #ece6da);
	}

	.switch span::after {
		position: absolute;
		top: 0.14rem;
		left: 0.15rem;
		width: 0.75rem;
		height: 0.75rem;
		border-radius: 50%;
		background: var(--ink-muted, #68707a);
		content: '';
	}

	.switch input:checked + span {
		border-color: var(--lab-blue);
		background: color-mix(in srgb, var(--lab-blue) 22%, var(--paper, #f7f2e8));
	}

	.switch input:checked + span::after {
		left: 1.14rem;
		background: var(--lab-blue);
	}

	.switch input:focus-visible + span {
		outline: 3px solid color-mix(in srgb, var(--lab-blue) 70%, white);
		outline-offset: 2px;
	}

	.switch strong,
	.independent-badge {
		font-size: 0.72rem;
		white-space: nowrap;
	}

	.independent-badge {
		border: 1px dashed var(--lab-rust);
		border-radius: 999px;
		padding: 0.34rem 0.55rem;
		color: var(--lab-rust);
		font-weight: 700;
		letter-spacing: 0.03em;
		text-transform: uppercase;
	}

	.time-control {
		display: grid;
		grid-template-columns: auto minmax(8rem, 1fr) 6.5rem;
		align-items: center;
		gap: 0.75rem;
		border-bottom: 1px solid var(--rule, #c8c1b2);
		padding: 0.52rem 1rem;
		background: color-mix(in srgb, var(--paper-soft, #ece6da) 55%, transparent);
	}

	.time-control label,
	.time-control output {
		font:
			700 0.72rem 'Courier Prime',
			monospace;
	}

	.time-control input {
		width: 100%;
		accent-color: var(--lab-blue);
	}

	.time-control output {
		text-align: right;
	}

	.comparison-grid {
		display: grid;
		grid-template-columns: minmax(0, var(--left-panel)) 0.8rem minmax(0, var(--right-panel));
		align-items: stretch;
	}

	.panel {
		min-width: 0;
		padding-bottom: 0.5rem;
	}

	.panel-b {
		--panel-accent: var(--lab-rust);
	}

	.panel-a {
		--panel-accent: var(--lab-blue);
	}

	.panel-heading {
		display: flex;
		align-items: center;
		gap: 0.72rem;
		min-height: 4.5rem;
		border-bottom: 1px solid var(--rule, #c8c1b2);
		padding: 0.6rem 0.8rem;
	}

	.panel-letter {
		display: grid;
		width: 2rem;
		height: 2rem;
		flex: 0 0 auto;
		place-items: center;
		border: 2px solid var(--panel-accent);
		border-radius: 50%;
		color: var(--panel-accent);
		font:
			700 0.9rem 'Courier Prime',
			monospace;
	}

	.panel h3 {
		margin: 0;
		font-family: 'Source Serif 4', Georgia, serif;
		font-size: 1.05rem;
	}

	.panel code {
		display: block;
		margin-top: 0.24rem;
		color: var(--ink-muted, #68707a);
		font:
			400 0.69rem 'Courier Prime',
			monospace;
		white-space: normal;
	}

	figure {
		margin: 0;
	}

	.plot-interaction {
		display: block;
		width: 100%;
		min-height: 0;
		margin: 0;
		border: 0;
		border-radius: 0;
		background: transparent;
		padding: 0;
		cursor: grab;
		touch-action: none;
		user-select: none;
	}

	.plot-interaction:hover {
		background: transparent;
	}

	figure svg {
		display: block;
		width: 100%;
		height: auto;
		background: var(--paper, #f7f2e8);
		pointer-events: none;
	}

	.dragging .plot-interaction,
	.plot-interaction:active {
		cursor: grabbing;
	}

	.plot-paper {
		fill: color-mix(in srgb, var(--paper, #f7f2e8) 94%, var(--panel-accent));
	}

	.grid-paper {
		opacity: 0.68;
		pointer-events: none;
	}

	.grid-line {
		fill: none;
		stroke: color-mix(in srgb, var(--rule, #c8c1b2) 62%, transparent);
		stroke-width: 1;
	}

	.axis {
		fill: none;
		stroke: color-mix(in srgb, var(--ink-muted, #68707a) 35%, transparent);
		stroke-width: 1;
		stroke-dasharray: 2 5;
		vector-effect: non-scaling-stroke;
	}

	.trajectory {
		fill: none;
		stroke: var(--panel-accent);
		stroke-width: 1.35;
		stroke-linecap: round;
		stroke-linejoin: round;
		opacity: calc(0.17 + (var(--path-order) / 90));
		vector-effect: non-scaling-stroke;
	}

	.endpoint {
		fill: color-mix(in srgb, var(--panel-accent) 82%, white);
		stroke: var(--paper, #f7f2e8);
		stroke-width: 0.9;
		vector-effect: non-scaling-stroke;
	}

	.theory-contour {
		fill: color-mix(in srgb, var(--lab-brass) 7%, transparent);
		stroke: var(--lab-brass);
		stroke-width: 2.2;
		stroke-dasharray: 8 6;
		vector-effect: non-scaling-stroke;
	}

	.theory-mean {
		fill: color-mix(in srgb, var(--paper, #f7f2e8) 70%, transparent);
		stroke: var(--lab-brass);
		stroke-width: 2;
		vector-effect: non-scaling-stroke;
	}

	.measured-mean {
		fill: none;
		stroke: var(--panel-accent);
		stroke-width: 2.5;
		vector-effect: non-scaling-stroke;
	}

	.scale-label {
		fill: var(--ink-muted, #68707a);
		font:
			11px 'Courier Prime',
			monospace;
		pointer-events: none;
	}

	figcaption {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem 0.8rem;
		min-height: 2.4rem;
		box-sizing: border-box;
		border-top: 1px solid var(--rule, #c8c1b2);
		border-bottom: 1px solid var(--rule, #c8c1b2);
		padding: 0.45rem 0.65rem;
		color: var(--ink-muted, #68707a);
		font-size: 0.65rem;
		line-height: 1.35;
	}

	figcaption span {
		display: inline-flex;
		align-items: center;
		gap: 0.32rem;
	}

	figcaption i {
		display: inline-block;
		width: 1.15rem;
		height: 0;
	}

	.measured-key {
		border-top: 2px solid var(--panel-accent);
	}

	.theory-key {
		border-top: 2px dashed var(--lab-brass);
	}

	.camera-buttons {
		display: flex;
		justify-content: end;
		gap: 0.3rem;
		padding: 0.42rem 0.65rem 0;
	}

	.camera-buttons button {
		min-width: 2.25rem;
		min-height: 2.1rem;
		padding: 0.28rem 0.5rem;
	}

	.divider {
		position: relative;
		z-index: 4;
		display: grid;
		place-items: center;
		border-right: 1px solid color-mix(in srgb, var(--lab-brass) 72%, transparent);
		border-left: 1px solid color-mix(in srgb, var(--lab-brass) 72%, transparent);
		background: repeating-linear-gradient(
			45deg,
			color-mix(in srgb, var(--lab-brass) 16%, var(--paper-soft, #ece6da)) 0 3px,
			var(--paper-soft, #ece6da) 3px 6px
		);
		color: var(--lab-brass);
		min-height: 0;
		border-radius: 0;
		padding: 0;
		cursor: col-resize;
		touch-action: none;
		user-select: none;
	}

	.divider:hover {
		background: repeating-linear-gradient(
			45deg,
			color-mix(in srgb, var(--lab-brass) 24%, var(--paper-soft, #ece6da)) 0 3px,
			var(--paper-soft, #ece6da) 3px 6px
		);
	}

	.divider::before {
		position: absolute;
		top: 0;
		bottom: 0;
		left: 50%;
		width: 1px;
		background: var(--lab-brass);
		content: '';
	}

	.divider span {
		position: relative;
		z-index: 1;
		border: 1px solid var(--lab-brass);
		border-radius: 999px;
		background: var(--paper-raised, #f6f2e8);
		padding: 0.65rem 0.12rem;
		font-size: 0.54rem;
		line-height: 0.52;
		writing-mode: vertical-rl;
	}

	.metrics {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		margin: 0.45rem 0.65rem 0;
		border: 1px solid var(--rule, #c8c1b2);
		border-radius: 0.36rem;
		overflow: hidden;
	}

	.metrics > div {
		min-width: 0;
		border-right: 1px solid var(--rule, #c8c1b2);
	}

	.metrics > div:last-child {
		border-right: 0;
	}

	.metrics dt {
		border-bottom: 1px solid var(--rule, #c8c1b2);
		background: color-mix(in srgb, var(--paper-soft, #ece6da) 62%, transparent);
		padding: 0.34rem 0.42rem;
		color: var(--ink-muted, #68707a);
		font-size: 0.61rem;
		font-weight: 700;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	.metrics dd {
		min-height: 2.6rem;
		box-sizing: border-box;
		margin: 0;
		padding: 0.35rem 0.42rem;
	}

	.metrics dd + dd {
		border-top: 1px dashed color-mix(in srgb, var(--rule, #c8c1b2) 72%, transparent);
	}

	.metrics dd span,
	.metrics dd strong {
		display: block;
	}

	.metrics dd span {
		color: var(--ink-muted, #68707a);
		font-size: 0.55rem;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	.metrics dd strong {
		margin-top: 0.12rem;
		font:
			700 0.68rem 'Courier Prime',
			monospace;
		overflow-wrap: anywhere;
	}

	.metrics dd:first-of-type strong {
		color: var(--panel-accent);
	}

	.metrics dd:last-of-type strong {
		color: var(--lab-brass);
	}

	.theory-note {
		margin: 0;
		padding: 0.52rem 0.72rem 0;
		color: var(--ink-muted, #68707a);
		font-family: 'Source Serif 4', Georgia, serif;
		font-size: 0.72rem;
		line-height: 1.45;
	}

	footer {
		border-top: 1px solid var(--rule, #c8c1b2);
	}

	.status,
	.instrument-note {
		margin: 0;
		padding: 0.55rem 1rem;
		font-size: 0.75rem;
		line-height: 1.5;
	}

	.status {
		color: var(--ink, #242a32);
		font-family: 'Courier Prime', monospace;
	}

	.instrument-note {
		border-top: 1px dashed var(--rule, #c8c1b2);
		color: var(--ink-muted, #68707a);
		font-family: 'Source Serif 4', Georgia, serif;
	}

	@media (max-width: 64rem) {
		.experiment-bar {
			grid-template-columns: minmax(12rem, 1fr) minmax(19rem, 1.4fr);
		}

		.camera-mode {
			grid-column: 1 / -1;
		}

		.metrics {
			grid-template-columns: 1fr;
		}

		.metrics > div {
			border-right: 0;
			border-bottom: 1px solid var(--rule, #c8c1b2);
		}

		.metrics > div:last-child {
			border-bottom: 0;
		}
	}

	@media (max-width: 46rem) {
		.comparison {
			width: calc(100vw - 0.5rem);
		}

		.experiment-bar {
			grid-template-columns: 1fr;
		}

		.camera-mode {
			grid-column: auto;
		}

		.seed-control {
			grid-template-columns: minmax(8rem, 1fr) auto auto;
		}

		.coupling-bar {
			align-items: flex-start;
			flex-direction: column;
			gap: 0.25rem;
		}

		.comparison-grid {
			grid-template-columns: 1fr;
		}

		.divider {
			display: none;
		}

		.panel-b {
			border-top: 4px double var(--lab-brass);
		}

		.metrics {
			grid-template-columns: repeat(3, minmax(0, 1fr));
		}

		.metrics > div {
			border-right: 1px solid var(--rule, #c8c1b2);
			border-bottom: 0;
		}

		.metrics > div:last-child {
			border-right: 0;
		}
	}

	@media (max-width: 34rem) {
		.introduction {
			display: block;
		}

		.sample-stamp {
			margin-top: 0.8rem;
			text-align: left;
		}

		.seed-control {
			grid-template-columns: 1fr 1fr;
		}

		.seed-control label {
			grid-column: 1 / -1;
		}

		.time-control {
			grid-template-columns: 1fr auto;
		}

		.time-control input {
			grid-column: 1 / -1;
			grid-row: 2;
		}

		.metrics {
			grid-template-columns: 1fr;
		}

		.metrics > div {
			border-right: 0;
			border-bottom: 1px solid var(--rule, #c8c1b2);
		}

		.metrics > div:last-child {
			border-bottom: 0;
		}
	}

	@media print {
		.comparison {
			left: auto;
			width: 100%;
			transform: none;
			break-inside: avoid;
		}

		.experiment-bar,
		.coupling-bar,
		.time-control,
		.camera-buttons,
		.divider,
		.status {
			display: none;
		}

		.comparison-grid {
			grid-template-columns: 1fr 1fr;
		}
	}
</style>
