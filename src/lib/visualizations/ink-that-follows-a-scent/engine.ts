import { ChemicalField } from './field.ts';
import { clampSettings, DEFAULT_SETTINGS } from './presets.ts';
import { sampleInitialPosition, sampleStandardNormal } from './random.ts';
import {
	DEFAULT_SEED,
	DESKTOP_PARTICLE_COUNT,
	DIFFUSION_SCALE,
	FIXED_TIMESTEP,
	LOGICAL_HEIGHT,
	LOGICAL_WIDTH,
	MAX_DRIFT_SPEED,
	SENSITIVITY_SCALE,
	TRAIL_HEIGHT,
	TRAIL_WIDTH,
	type EngineConfig,
	type PairedEngineSnapshot,
	type PresetId,
	type RunSnapshot,
	type SimulationEditEvent,
	type SimulationSettings
} from './types.ts';

/**
 * Reflects a coordinate into [0, max] via mirror reflection at the walls.
 */
export function reflectCoordinate(value: number, max: number): number {
	let x = value;
	let guard = 0;
	while ((x < 0 || x > max) && guard < 8) {
		if (x < 0) x = -x;
		if (x > max) x = 2 * max - x;
		guard += 1;
	}
	if (x < 0) return 0;
	if (x > max) return max;
	return x;
}

export class ChemotaxisRun {
	readonly particleCount: number;
	readonly px: Float32Array;
	readonly py: Float32Array;
	readonly prevX: Float32Array;
	readonly prevY: Float32Array;
	readonly trailWidth: number;
	readonly trailHeight: number;
	readonly trailBuffer: Float32Array;
	private readonly gradScratch: Float32Array;

	averageChemical: number;
	uphillStepFraction: number;
	maxTrailIntensity: number;
	meanTrailIntensity: number;
	lastSensitivity: number;

	constructor(
		particleCount = DESKTOP_PARTICLE_COUNT,
		trailWidth = TRAIL_WIDTH,
		trailHeight = TRAIL_HEIGHT
	) {
		this.particleCount = particleCount;
		this.px = new Float32Array(particleCount);
		this.py = new Float32Array(particleCount);
		this.prevX = new Float32Array(particleCount);
		this.prevY = new Float32Array(particleCount);
		this.trailWidth = trailWidth;
		this.trailHeight = trailHeight;
		this.trailBuffer = new Float32Array(trailWidth * trailHeight);
		this.gradScratch = new Float32Array(2);

		this.averageChemical = 0;
		this.uphillStepFraction = 0;
		this.maxTrailIntensity = 0;
		this.meanTrailIntensity = 0;
		this.lastSensitivity = DEFAULT_SETTINGS.sensitivity;
	}

	reset(seed: number, field: ChemicalField, initialSensitivity: number): void {
		for (let i = 0; i < this.particleCount; i += 1) {
			const pos = sampleInitialPosition(seed, i, this.particleCount, LOGICAL_WIDTH, LOGICAL_HEIGHT);
			this.px[i] = pos.x;
			this.py[i] = pos.y;
			this.prevX[i] = pos.x;
			this.prevY[i] = pos.y;
		}
		this.trailBuffer.fill(0);
		this.uphillStepFraction = 0;
		this.maxTrailIntensity = 0;
		this.meanTrailIntensity = 0;
		this.lastSensitivity = initialSensitivity;
		this.recomputeAverageChemical(field);
	}

	clearTrails(): void {
		this.trailBuffer.fill(0);
		this.maxTrailIntensity = 0;
		this.meanTrailIntensity = 0;
	}

	recomputeAverageChemical(field: ChemicalField): number {
		if (field.maxConcentration <= 0) {
			this.averageChemical = 0;
			return 0;
		}
		let sum = 0;
		for (let i = 0; i < this.particleCount; i += 1) {
			sum += field.sampleConcentration(this.px[i], this.py[i]);
		}
		this.averageChemical = sum / this.particleCount;
		return this.averageChemical;
	}

	stepOne(
		seed: number,
		stepIndex: number,
		dt: number,
		field: ChemicalField,
		effectiveSensitivity: number,
		randomWandering: number,
		trailDuration: number
	): void {
		this.lastSensitivity = effectiveSensitivity;

		// 1. Exponential time-based decay of accumulated ink trails (branchless for SIMD vectorization)
		const tau = Math.max(0.5, trailDuration);
		const decay = Math.exp(-dt / tau);
		const buf = this.trailBuffer;
		const len = buf.length;
		for (let k = 0; k < len; k += 1) {
			buf[k] *= decay;
		}

		// 2. Additive biased random walk parameters
		const D = DIFFUSION_SCALE * randomWandering;
		const sigmaStep = Math.sqrt(2 * D * dt);
		const chi = SENSITIVITY_SCALE * effectiveSensitivity;
		const maxDriftSq = MAX_DRIFT_SPEED * MAX_DRIFT_SPEED;
		const grad = this.gradScratch;

		const scaleX = this.trailWidth / LOGICAL_WIDTH;
		const scaleY = this.trailHeight / LOGICAL_HEIGHT;
		const w = this.trailWidth;
		const h = this.trailHeight;
		// Normalize ink deposit per particle so 2,400 and 5,000 particle runs share comparable exposure
		const baseInk = 0.032 * (DESKTOP_PARTICLE_COUNT / Math.max(500, this.particleCount)) ** 0.65;

		let sumC = 0;
		let uphillCount = 0;
		let activeGradCount = 0;

		for (let i = 0; i < this.particleCount; i += 1) {
			const x0 = this.px[i];
			const y0 = this.py[i];
			this.prevX[i] = x0;
			this.prevY[i] = y0;

			const zx = sampleStandardNormal(seed, i, stepIndex, 0);
			const zy = sampleStandardNormal(seed, i, stepIndex, 1);

			field.sampleGradientInto(x0, y0, grad);
			const gx = grad[0];
			const gy = grad[1];

			let vx = chi * gx;
			let vy = chi * gy;
			const driftSpeedSq = vx * vx + vy * vy;
			if (driftSpeedSq > maxDriftSq) {
				const capScale = MAX_DRIFT_SPEED / Math.sqrt(driftSpeedSq);
				vx *= capScale;
				vy *= capScale;
			}

			const rawX = x0 + sigmaStep * zx + vx * dt;
			const rawY = y0 + sigmaStep * zy + vy * dt;

			const x1 = reflectCoordinate(rawX, LOGICAL_WIDTH);
			const y1 = reflectCoordinate(rawY, LOGICAL_HEIGHT);

			this.px[i] = x1;
			this.py[i] = y1;

			if (gx * gx + gy * gy > 1e-8) {
				activeGradCount += 1;
				if ((x1 - x0) * gx + (y1 - y0) * gy > 0) {
					uphillCount += 1;
				}
			}

			sumC += field.sampleConcentration(x1, y1);

			// Deposit translucent segment from (x0, y0) to (x1, y1) via midpoint + endpoint
			const segDx = x1 - x0;
			const segDy = y1 - y0;
			if (segDx * segDx + segDy * segDy <= 144) {
				const mx = ((x0 + x1) * 0.5 * scaleX) | 0;
				const my = ((y0 + y1) * 0.5 * scaleY) | 0;
				if (mx >= 0 && mx < w && my >= 0 && my < h) {
					const mIdx = my * w + mx;
					const mCur = buf[mIdx];
					const mUp = mCur + baseInk * 0.5 * (1 - 0.72 * mCur);
					buf[mIdx] = mUp < 1 ? mUp : 1;
				}

				const ex = (x1 * scaleX) | 0;
				const ey = (y1 * scaleY) | 0;
				if (ex >= 0 && ex < w && ey >= 0 && ey < h) {
					const eIdx = ey * w + ex;
					const eCur = buf[eIdx];
					const eUp = eCur + baseInk * 0.5 * (1 - 0.72 * eCur);
					buf[eIdx] = eUp < 1 ? eUp : 1;
					if (ex + 1 < w) {
						const rIdx = eIdx + 1;
						const rCur = buf[rIdx];
						const rUp = rCur + baseInk * 0.16 * (1 - 0.72 * rCur);
						buf[rIdx] = rUp < 1 ? rUp : 1;
					}
					if (ey + 1 < h) {
						const bIdx = eIdx + w;
						const bCur = buf[bIdx];
						const bUp = bCur + baseInk * 0.16 * (1 - 0.72 * bCur);
						buf[bIdx] = bUp < 1 ? bUp : 1;
					}
				}
			}
		}

		this.averageChemical = field.maxConcentration <= 0 ? 0 : sumC / this.particleCount;
		this.uphillStepFraction = activeGradCount > 0 ? uphillCount / activeGradCount : 0.5;
	}

	updateTrailStats(): void {
		const buf = this.trailBuffer;
		let maxVal = 0;
		let sumVal = 0;
		for (let i = 0; i < buf.length; i += 1) {
			const v = buf[i];
			sumVal += v;
			if (v > maxVal) maxVal = v;
		}
		this.maxTrailIntensity = maxVal;
		this.meanTrailIntensity = sumVal / buf.length;
	}

	snapshot(): RunSnapshot {
		this.updateTrailStats();
		return {
			particleCount: this.particleCount,
			px: new Float32Array(this.px),
			py: new Float32Array(this.py),
			trailBuffer: new Float32Array(this.trailBuffer),
			trailWidth: this.trailWidth,
			trailHeight: this.trailHeight,
			sensitivity: this.lastSensitivity,
			telemetry: {
				averageChemical: this.averageChemical,
				uphillStepFraction: this.uphillStepFraction,
				maxTrailIntensity: this.maxTrailIntensity,
				meanTrailIntensity: this.meanTrailIntensity
			}
		};
	}
}

export class InkFollowsScentEngine {
	readonly field: ChemicalField;
	readonly sensingOnRun: ChemotaxisRun;
	readonly sensingOffRun: ChemotaxisRun;
	readonly timestep: number;

	seed: number;
	presetId: PresetId;
	stepCount: number;
	simulationTime: number;
	settings: SimulationSettings;
	sensingEnabled: boolean;
	/**
	 * Sensitivity used for the control run (0 in normal paired comparisons;
	 * configurable for unit verification of equal-sensitivity identity).
	 */
	controlSensitivity: number;

	constructor(config: EngineConfig = {}) {
		this.presetId = config.presetId ?? 'one-source';
		this.seed = config.seed ?? DEFAULT_SEED;
		this.timestep = config.timestep ?? FIXED_TIMESTEP;
		this.settings = clampSettings(config.settings ?? DEFAULT_SETTINGS);
		this.sensingEnabled = config.sensingEnabled ?? true;
		this.controlSensitivity = 0;
		this.stepCount = 0;
		this.simulationTime = 0;

		const particleCount = config.particleCount ?? DESKTOP_PARTICLE_COUNT;
		this.field = new ChemicalField(LOGICAL_WIDTH, LOGICAL_HEIGHT);
		this.field.loadPreset(this.presetId);

		this.sensingOnRun = new ChemotaxisRun(particleCount, TRAIL_WIDTH, TRAIL_HEIGHT);
		this.sensingOffRun = new ChemotaxisRun(particleCount, TRAIL_WIDTH, TRAIL_HEIGHT);

		this.restart();
	}

	/**
	 * Loads a preset ("one-source" or "curved-line") and starts a fresh experiment.
	 */
	loadPreset(presetId: PresetId, newSeed?: number): void {
		this.presetId = presetId;
		if (newSeed !== undefined) {
			this.seed = newSeed;
		}
		this.sensingEnabled = true;
		this.field.loadPreset(presetId);
		this.restart();
	}

	/**
	 * Preserves the current chemical landscape and settings, then resets particle positions,
	 * simulation time, random sequence (stepCount = 0), and trails in both runs.
	 */
	restart(newSeed?: number): void {
		if (newSeed !== undefined) {
			this.seed = newSeed;
		}
		this.stepCount = 0;
		this.simulationTime = 0;
		const activeSens = this.sensingEnabled ? this.settings.sensitivity : 0;
		this.sensingOnRun.reset(this.seed, this.field, activeSens);
		this.sensingOffRun.reset(this.seed, this.field, this.controlSensitivity);
	}

	/**
	 * Starts a fresh paired comparison from the same start using the current chemical landscape.
	 * Ensures the sensing-on run is active with non-zero sensitivity and the sensing-off run uses 0.
	 */
	startPairedComparison(): void {
		this.sensingEnabled = true;
		this.controlSensitivity = 0;
		if (this.settings.sensitivity <= 0) {
			this.settings = clampSettings({
				...this.settings,
				sensitivity: DEFAULT_SETTINGS.sensitivity
			});
		}
		this.restart();
	}

	/**
	 * Updates adjustable settings without resetting particles or trails.
	 */
	updateSettings(partial: Partial<SimulationSettings>): void {
		this.settings = clampSettings({ ...this.settings, ...partial });
	}

	/**
	 * Live toggle of chemical sensing in exploration mode.
	 * Affects future movement only; does not undo previous movement or erase trails.
	 */
	setSensingEnabled(enabled: boolean): void {
		this.sensingEnabled = enabled;
	}

	/**
	 * Clears painted chemical and active source contributions in the shared field,
	 * immediately updating average chemical at particle positions to 0 while preserving trails.
	 */
	clearChemical(): void {
		this.field.clearChemical();
		this.sensingOnRun.recomputeAverageChemical(this.field);
		this.sensingOffRun.recomputeAverageChemical(this.field);
	}

	/**
	 * Clears visible trail buffers in both runs while preserving particle positions and chemical.
	 */
	clearTrails(): void {
		this.sensingOnRun.clearTrails();
		this.sensingOffRun.clearTrails();
	}

	/**
	 * Moves the broad chemical source immediately without teleporting particles or erasing trails.
	 */
	moveSource(x: number, y: number): void {
		this.field.moveSource(x, y);
		this.sensingOnRun.recomputeAverageChemical(this.field);
		this.sensingOffRun.recomputeAverageChemical(this.field);
	}

	/**
	 * Paints chemical into the shared landscape and updates current concentration measurements.
	 */
	paintChemical(
		x0: number,
		y0: number,
		x1: number,
		y1: number,
		radius = this.settings.brushSize,
		strength?: number
	): void {
		this.field.paintStroke(x0, y0, x1, y1, radius, strength);
		this.sensingOnRun.recomputeAverageChemical(this.field);
		this.sensingOffRun.recomputeAverageChemical(this.field);
	}

	/**
	 * Erases chemical locally in the shared landscape and updates current concentration measurements.
	 */
	eraseChemical(
		x0: number,
		y0: number,
		x1: number,
		y1: number,
		radius = this.settings.brushSize,
		strength?: number
	): void {
		this.field.eraseStroke(x0, y0, x1, y1, radius, strength);
		this.sensingOnRun.recomputeAverageChemical(this.field);
		this.sensingOffRun.recomputeAverageChemical(this.field);
	}

	/**
	 * Applies a tick-stamped edit event to the engine.
	 */
	applyEditEvent(event: SimulationEditEvent): void {
		switch (event.type) {
			case 'paint':
				this.paintChemical(event.x0, event.y0, event.x1, event.y1, event.radius, event.strength);
				break;
			case 'erase':
				this.eraseChemical(event.x0, event.y0, event.x1, event.y1, event.radius, event.strength);
				break;
			case 'move-source':
				this.moveSource(event.x, event.y);
				break;
			case 'clear-chemical':
				this.clearChemical();
				break;
			case 'clear-trails':
				this.clearTrails();
				break;
			case 'set-sensing':
				this.setSensingEnabled(event.enabled);
				break;
			case 'set-settings':
				this.updateSettings(event.settings);
				break;
		}
	}

	/**
	 * Advances both the sensing-on and sensing-off runs together by `steps` fixed timesteps.
	 */
	step(steps = 1): void {
		const count = Math.max(0, Math.floor(steps));
		for (let s = 0; s < count; s += 1) {
			const currentStep = this.stepCount;
			const activeSensitivity = this.sensingEnabled ? this.settings.sensitivity : 0;

			this.sensingOnRun.stepOne(
				this.seed,
				currentStep,
				this.timestep,
				this.field,
				activeSensitivity,
				this.settings.randomWandering,
				this.settings.trailDuration
			);

			this.sensingOffRun.stepOne(
				this.seed,
				currentStep,
				this.timestep,
				this.field,
				this.controlSensitivity,
				this.settings.randomWandering,
				this.settings.trailDuration
			);

			this.stepCount += 1;
			this.simulationTime = this.stepCount * this.timestep;
		}
	}

	/**
	 * Deterministically replays a sequence of tick-stamped edit events up to `totalSteps`.
	 */
	runWithSchedule(totalSteps: number, events: readonly SimulationEditEvent[]): void {
		const byStep = new Map<number, SimulationEditEvent[]>();
		for (const ev of events) {
			const list = byStep.get(ev.step) ?? [];
			list.push(ev);
			byStep.set(ev.step, list);
		}

		for (let s = 0; s < totalSteps; s += 1) {
			const due = byStep.get(this.stepCount);
			if (due) {
				for (const ev of due) {
					this.applyEditEvent(ev);
				}
			}
			this.step(1);
		}
		const finalDue = byStep.get(this.stepCount);
		if (finalDue) {
			for (const ev of finalDue) {
				this.applyEditEvent(ev);
			}
		}
	}

	snapshot(): PairedEngineSnapshot {
		return {
			seed: this.seed,
			stepCount: this.stepCount,
			simulationTime: this.simulationTime,
			timestep: this.timestep,
			presetId: this.presetId,
			sensingEnabled: this.sensingEnabled,
			settings: { ...this.settings },
			field: this.field.snapshot(),
			sensingOn: this.sensingOnRun.snapshot(),
			sensingOff: this.sensingOffRun.snapshot()
		};
	}
}
