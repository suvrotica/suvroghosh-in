import { Vector3 } from 'three';
import type { WindSampler } from '../types';
import { SeededRng, type Seed } from './SeededRng';

export type WindDifficulty = 'gentle' | 'calcutta' | 'kalbaishakhi';

export interface WindFieldOptions {
	difficulty?: WindDifficulty;
	/** Cached broad-field samples per second. Defaults to 15 Hz. */
	temporalResolutionHz?: number;
	/** Cached broad-field lattice spacing, in metres. Defaults to 32 m. */
	gridCellSize?: number;
	/** Optional multiplier for the seeded curl field. */
	turbulenceScale?: number;
	/** Optional prevailing direction in radians, measured from +X toward +Z. */
	prevailingDirection?: number;
}

export interface ThermalDefinition {
	id: string;
	/** Centre of the thermal base, in metres. */
	center: Vector3;
	/** Core radius, in metres. */
	radius: number;
	/** Vertical extent above `center.y`, in metres. */
	height: number;
	/** Peak upward air velocity, in metres per second. */
	strength: number;
	/** Peak annular sink as a fraction of strength. Defaults to 0.18. */
	sinkRing?: number;
}

export interface GustDefinition {
	id: string;
	center: Vector3;
	/** Ellipsoidal half-extents, in metres. */
	radius: Vector3;
	/** Peak air velocity added inside the volume, in metres per second. */
	velocity: Vector3;
	startTime: number;
	duration: number;
}

interface CurlMode {
	wave: Vector3;
	direction: Vector3;
	phase: number;
	angularSpeed: number;
	weight: number;
}

interface GridCache {
	frame: number;
	values: Map<string, Vector3>;
}

const LOW_ALTITUDE = 28;
const HIGH_ALTITUDE = 150;
const SOFT_CEILING = 420;
const MODE_COUNT = 7;

const DIFFICULTY_MULTIPLIER: Readonly<Record<WindDifficulty, number>> = Object.freeze({
	gentle: 0.72,
	calcutta: 1,
	kalbaishakhi: 1.28
});

function clamp(value: number, minimum: number, maximum: number): number {
	return Math.max(minimum, Math.min(maximum, value));
}

function smoothstep(edge0: number, edge1: number, value: number): number {
	const amount = clamp((value - edge0) / (edge1 - edge0), 0, 1);
	return amount * amount * (3 - 2 * amount);
}

function lerp(start: number, end: number, amount: number): number {
	return start + (end - start) * amount;
}

function positiveFinite(value: number, label: string): number {
	if (!Number.isFinite(value) || value <= 0) {
		throw new RangeError(`${label} must be finite and positive.`);
	}
	return value;
}

function validateVector(vector: Readonly<Vector3>, label: string): void {
	if (![vector.x, vector.y, vector.z].every(Number.isFinite)) {
		throw new RangeError(`${label} must contain finite coordinates.`);
	}
}

/**
 * Seeded, continuous wind assembled from layered prevailing air, a divergence-free
 * Fourier curl field, thermals, and authored gust volumes. Broad samples are cached on
 * a spatial lattice and at 15 Hz by default, then trilinearly/intertemporally blended.
 */
export class WindField implements WindSampler {
	readonly seed: string;
	readonly difficulty: WindDifficulty;
	readonly temporalResolutionHz: number;
	readonly gridCellSize: number;

	private readonly turbulenceScale: number;
	private readonly prevailingDirection: number;
	private readonly modes: CurlMode[];
	private readonly thermals = new Map<string, ThermalDefinition>();
	private readonly gusts = new Map<string, GustDefinition>();
	private thermalList: readonly ThermalDefinition[] = [];
	private gustList: readonly GustDefinition[] = [];
	private cache0: GridCache = { frame: Number.NaN, values: new Map() };
	private cache1: GridCache = { frame: Number.NaN, values: new Map() };

	private readonly broadScratch = new Vector3();
	private readonly localScratch = new Vector3();
	private readonly cornerScratch = new Vector3();

	constructor(seed: Seed = 'north-calcutta-1847', options: WindFieldOptions = {}) {
		this.seed = String(seed);
		this.difficulty = options.difficulty ?? 'calcutta';
		this.temporalResolutionHz = positiveFinite(
			options.temporalResolutionHz ?? 15,
			'Wind temporal resolution'
		);
		this.gridCellSize = positiveFinite(options.gridCellSize ?? 32, 'Wind grid cell size');
		this.turbulenceScale = positiveFinite(options.turbulenceScale ?? 1, 'Wind turbulence scale');

		const random = new SeededRng(seed).fork('wind/broad');
		this.prevailingDirection = Number.isFinite(options.prevailingDirection)
			? (options.prevailingDirection as number)
			: random.range(0, Math.PI * 2);
		this.modes = this.createCurlModes(random.fork('curl-modes'));
	}

	sample(position: Readonly<Vector3>, simulationTime: number, target = new Vector3()): Vector3 {
		validateVector(position, 'Wind sample position');
		if (!Number.isFinite(simulationTime)) {
			throw new RangeError('Wind sample time must be finite.');
		}

		this.samplePrevailing(position.y, target);
		this.sampleCachedBroad(position, simulationTime, this.broadScratch);
		target.addScaledVector(this.broadScratch, this.turbulenceAmplitude(position.y));
		this.sampleLocalFlows(position, simulationTime, this.localScratch);
		target.add(this.localScratch);
		this.addSoftCeilingAir(position, target);
		return target;
	}

	addThermal(definition: ThermalDefinition): void {
		if (!definition.id.trim()) throw new RangeError('A thermal id must not be empty.');
		validateVector(definition.center, 'Thermal centre');
		positiveFinite(definition.radius, 'Thermal radius');
		positiveFinite(definition.height, 'Thermal height');
		positiveFinite(definition.strength, 'Thermal strength');
		if (
			definition.sinkRing !== undefined &&
			(!Number.isFinite(definition.sinkRing) || definition.sinkRing < 0 || definition.sinkRing > 1)
		) {
			throw new RangeError('Thermal sink-ring strength must be between zero and one.');
		}
		this.thermals.set(definition.id, {
			...definition,
			center: definition.center.clone()
		});
		this.thermalList = [...this.thermals.values()].sort((a, b) => a.id.localeCompare(b.id));
	}

	removeThermal(id: string): boolean {
		const removed = this.thermals.delete(id);
		if (removed) {
			this.thermalList = [...this.thermals.values()].sort((a, b) => a.id.localeCompare(b.id));
		}
		return removed;
	}

	addGust(definition: GustDefinition): void {
		if (!definition.id.trim()) throw new RangeError('A gust id must not be empty.');
		validateVector(definition.center, 'Gust centre');
		validateVector(definition.radius, 'Gust radius');
		validateVector(definition.velocity, 'Gust velocity');
		positiveFinite(definition.radius.x, 'Gust X radius');
		positiveFinite(definition.radius.y, 'Gust Y radius');
		positiveFinite(definition.radius.z, 'Gust Z radius');
		if (!Number.isFinite(definition.startTime)) {
			throw new RangeError('Gust start time must be finite.');
		}
		positiveFinite(definition.duration, 'Gust duration');
		this.gusts.set(definition.id, {
			...definition,
			center: definition.center.clone(),
			radius: definition.radius.clone(),
			velocity: definition.velocity.clone()
		});
		this.gustList = [...this.gusts.values()].sort((a, b) => a.id.localeCompare(b.id));
	}

	removeGust(id: string): boolean {
		const removed = this.gusts.delete(id);
		if (removed) {
			this.gustList = [...this.gusts.values()].sort((a, b) => a.id.localeCompare(b.id));
		}
		return removed;
	}

	clearLocalFlows(): void {
		this.thermals.clear();
		this.gusts.clear();
		this.thermalList = [];
		this.gustList = [];
	}

	clearCache(): void {
		this.cache0.values.clear();
		this.cache1.values.clear();
		this.cache0.frame = Number.NaN;
		this.cache1.frame = Number.NaN;
	}

	private createCurlModes(random: SeededRng): CurlMode[] {
		const modes: CurlMode[] = [];
		for (let index = 0; index < MODE_COUNT; index += 1) {
			const wavelength = random.range(55, 230);
			const wave = new Vector3(random.range(-1, 1), random.range(-0.7, 0.7), random.range(-1, 1));
			if (wave.lengthSq() < 1e-6) wave.set(1, 0.2, 0);
			wave.normalize().multiplyScalar((Math.PI * 2) / wavelength);

			const reference = new Vector3(random.range(-1, 1), random.range(-1, 1), random.range(-1, 1));
			const direction = new Vector3().crossVectors(wave, reference);
			if (direction.lengthSq() < 1e-8) direction.crossVectors(wave, new Vector3(0, 1, 0));
			if (direction.lengthSq() < 1e-8) direction.crossVectors(wave, new Vector3(1, 0, 0));
			direction.normalize();
			// Keep vertical turbulence useful but less violent than lateral turbulence.
			direction.y *= 0.68;
			direction.normalize();

			modes.push({
				wave,
				direction,
				phase: random.range(0, Math.PI * 2),
				angularSpeed: random.range(-0.16, 0.16),
				weight: random.range(0.72, 1.18) / Math.sqrt(MODE_COUNT)
			});
		}
		return modes;
	}

	private samplePrevailing(altitude: number, target: Vector3): void {
		const middle = smoothstep(LOW_ALTITUDE * 0.65, HIGH_ALTITUDE * 0.72, altitude);
		const high = smoothstep(HIGH_ALTITUDE * 0.78, 330, altitude);
		const speed = lerp(2.35, 4.7, middle) + high * 3.7;
		const veer = middle * 0.11 + high * 0.17;
		const multiplier = DIFFICULTY_MULTIPLIER[this.difficulty];
		target.set(
			Math.cos(this.prevailingDirection + veer) * speed * multiplier,
			0,
			Math.sin(this.prevailingDirection + veer) * speed * multiplier
		);
	}

	private turbulenceAmplitude(altitude: number): number {
		const middle = smoothstep(18, 110, altitude);
		const high = smoothstep(110, 300, altitude);
		const base = lerp(1.05, 2.15, middle) + high * 1.15;
		return base * this.turbulenceScale * DIFFICULTY_MULTIPLIER[this.difficulty];
	}

	private sampleCachedBroad(
		position: Readonly<Vector3>,
		simulationTime: number,
		target: Vector3
	): void {
		const temporalPosition = simulationTime * this.temporalResolutionHz;
		const frame = Math.floor(temporalPosition);
		const timeAlpha = temporalPosition - frame;
		this.ensureCacheFrames(frame);

		this.sampleSpatialGrid(position, this.cache0, target);
		this.sampleSpatialGrid(position, this.cache1, this.localScratch);
		target.lerp(this.localScratch, timeAlpha);
	}

	private ensureCacheFrames(frame: number): void {
		if (this.cache0.frame === frame && this.cache1.frame === frame + 1) return;

		if (this.cache1.frame === frame) {
			const previous = this.cache0;
			this.cache0 = this.cache1;
			this.cache1 = previous;
			this.cache1.frame = frame + 1;
			this.cache1.values.clear();
			return;
		}

		this.cache0.frame = frame;
		this.cache0.values.clear();
		this.cache1.frame = frame + 1;
		this.cache1.values.clear();
	}

	private sampleSpatialGrid(position: Readonly<Vector3>, cache: GridCache, target: Vector3): void {
		const inverseCell = 1 / this.gridCellSize;
		const gx = position.x * inverseCell;
		const gy = position.y * inverseCell;
		const gz = position.z * inverseCell;
		const x0 = Math.floor(gx);
		const y0 = Math.floor(gy);
		const z0 = Math.floor(gz);
		const tx = gx - x0;
		const ty = gy - y0;
		const tz = gz - z0;

		target.set(0, 0, 0);
		for (let dy = 0; dy <= 1; dy += 1) {
			const wy = dy === 0 ? 1 - ty : ty;
			for (let dz = 0; dz <= 1; dz += 1) {
				const wz = dz === 0 ? 1 - tz : tz;
				for (let dx = 0; dx <= 1; dx += 1) {
					const wx = dx === 0 ? 1 - tx : tx;
					const corner = this.gridValue(cache, x0 + dx, y0 + dy, z0 + dz);
					target.addScaledVector(corner, wx * wy * wz);
				}
			}
		}
	}

	private gridValue(cache: GridCache, x: number, y: number, z: number): Vector3 {
		const key = `${x},${y},${z}`;
		let value = cache.values.get(key);
		if (value) return value;

		const time = cache.frame / this.temporalResolutionHz;
		this.cornerScratch.set(x, y, z).multiplyScalar(this.gridCellSize);
		value = this.evaluateBroad(this.cornerScratch, time, new Vector3());
		cache.values.set(key, value);
		return value;
	}

	private evaluateBroad(position: Readonly<Vector3>, time: number, target: Vector3): Vector3 {
		target.set(0, 0, 0);
		for (const mode of this.modes) {
			const phase = mode.wave.dot(position) + mode.phase + mode.angularSpeed * time;
			target.addScaledVector(mode.direction, Math.sin(phase) * mode.weight);
		}
		return target;
	}

	private sampleLocalFlows(
		position: Readonly<Vector3>,
		simulationTime: number,
		target: Vector3
	): void {
		target.set(0, 0, 0);
		for (const thermal of this.thermalList) {
			this.addThermalFlow(thermal, position, target);
		}
		for (const gust of this.gustList) {
			this.addGustFlow(gust, position, simulationTime, target);
		}
	}

	private addThermalFlow(
		thermal: ThermalDefinition,
		position: Readonly<Vector3>,
		target: Vector3
	): void {
		const vertical = (position.y - thermal.center.y) / thermal.height;
		if (vertical < -0.08 || vertical > 1.08) return;

		const dx = position.x - thermal.center.x;
		const dz = position.z - thermal.center.z;
		const radial = Math.hypot(dx, dz) / thermal.radius;
		if (radial > 1.75) return;

		const lowerEnvelope = smoothstep(-0.08, 0.08, vertical);
		const upperEnvelope = 1 - smoothstep(0.76, 1.08, vertical);
		const verticalEnvelope = lowerEnvelope * upperEnvelope;
		const core = Math.exp(-2.35 * radial * radial);
		const ringWidth = (radial - 1.18) / 0.25;
		const ring = Math.exp(-ringWidth * ringWidth) * (thermal.sinkRing ?? 0.18);
		const upward = thermal.strength * verticalEnvelope * (core - ring);
		target.y += upward;

		// A weak converging inflow makes circling the column more legible without pulling hard.
		if (radial > 1e-5) {
			const inward = thermal.strength * verticalEnvelope * core * 0.055;
			target.x -= (dx / (radial * thermal.radius)) * inward;
			target.z -= (dz / (radial * thermal.radius)) * inward;
		}
	}

	private addGustFlow(
		gust: GustDefinition,
		position: Readonly<Vector3>,
		simulationTime: number,
		target: Vector3
	): void {
		const normalizedTime = (simulationTime - gust.startTime) / gust.duration;
		if (normalizedTime <= 0 || normalizedTime >= 1) return;
		const dx = (position.x - gust.center.x) / gust.radius.x;
		const dy = (position.y - gust.center.y) / gust.radius.y;
		const dz = (position.z - gust.center.z) / gust.radius.z;
		const radiusSquared = dx * dx + dy * dy + dz * dz;
		if (radiusSquared >= 1) return;

		const spatial = smoothstep(1, 0, radiusSquared);
		const temporal = Math.sin(Math.PI * normalizedTime) ** 2;
		target.addScaledVector(gust.velocity, spatial * temporal);
	}

	private addSoftCeilingAir(position: Readonly<Vector3>, target: Vector3): void {
		if (position.y <= SOFT_CEILING) return;
		const excess = smoothstep(SOFT_CEILING, SOFT_CEILING + 180, position.y);
		const multiplier = DIFFICULTY_MULTIPLIER[this.difficulty];
		const crossDirection = this.prevailingDirection + Math.PI * 0.5;
		target.x += Math.cos(crossDirection) * excess * 4.2 * multiplier;
		target.z += Math.sin(crossDirection) * excess * 4.2 * multiplier;
		target.y -= excess * 3.1 * multiplier;
	}
}
