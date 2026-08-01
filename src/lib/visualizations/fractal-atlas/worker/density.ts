import { SeededRandom } from '../../../utils/seeded-random';
import {
	FRACTAL_WORKER_LIMITS,
	isDensityTaskConfig,
	type DensityFrame,
	type DensityTaskConfig,
	type NebulabrotWindows
} from './protocol';

const UINT32_MAX = 0xffff_ffff;
const TONE_HISTOGRAM_BINS = 256;
/**
 * The first escape pass and replay can each use this many orbit steps per turn.
 * Keeping the amount finite makes pause/cancel cooperative between Worker turns.
 */
const MAX_ORBIT_STEPS_PER_BATCH = 2_000_000;

const DEFAULT_NEBULABROT_WINDOWS: NebulabrotWindows = [
	[1, 50],
	[51, 200],
	[201, FRACTAL_WORKER_LIMITS.maxIterations]
];

export class DensityAccumulator {
	readonly config: DensityTaskConfig;
	readonly histogramBytes: number;

	private readonly random: SeededRandom;
	private readonly pixelCount: number;
	private readonly channelCount: 1 | 3;
	private readonly density: Uint32Array;
	private readonly bailoutSquared: number;
	private readonly iterationWindows: NebulabrotWindows;

	private batchesProcessed = 0;
	private sequence = 0;
	private samplesProcessedValue = 0;
	private escapingOrbitsValue = 0;
	private accumulatedOrbitsValue = 0;
	private plottedOrbitPointsValue = 0;

	constructor(config: DensityTaskConfig) {
		if (!isDensityTaskConfig(config)) {
			throw new RangeError('Invalid or unsafe Buddhabrot/Nebulabrot Worker configuration.');
		}
		this.config = cloneDensityConfig(config);
		this.random = new SeededRandom(config.seed);
		this.pixelCount = config.width * config.height;
		this.channelCount = config.mode === 'nebulabrot' ? 3 : 1;
		this.density = new Uint32Array(this.pixelCount * this.channelCount);
		this.histogramBytes = this.density.byteLength;
		this.bailoutSquared = config.bailout * config.bailout;
		this.iterationWindows =
			config.mode === 'nebulabrot'
				? cloneIterationWindows(config.iterationWindows ?? DEFAULT_NEBULABROT_WINDOWS)
				: DEFAULT_NEBULABROT_WINDOWS;
	}

	get complete(): boolean {
		return this.samplesProcessedValue >= this.config.targetSamples;
	}

	get samplesProcessed(): number {
		return this.samplesProcessedValue;
	}

	get totalSamples(): number {
		return this.config.targetSamples;
	}

	get shouldPublishFrame(): boolean {
		const cadence = this.config.publishEveryBatches ?? 1;
		return this.complete || this.batchesProcessed % cadence === 0;
	}

	advanceBatch(): void {
		if (this.complete) return;
		const remaining = this.config.targetSamples - this.samplesProcessedValue;
		const workBound = Math.max(
			1,
			Math.floor(MAX_ORBIT_STEPS_PER_BATCH / this.config.maxIterations)
		);
		const batchSize = Math.min(remaining, this.config.samplesPerBatch, workBound);

		for (let sampleIndex = 0; sampleIndex < batchSize; sampleIndex += 1) {
			this.accumulateCandidate(
				this.random.range(this.config.sampleBounds.minRe, this.config.sampleBounds.maxRe),
				this.random.range(this.config.sampleBounds.minIm, this.config.sampleBounds.maxIm)
			);
		}
		this.samplesProcessedValue += batchSize;
		this.batchesProcessed += 1;
	}

	createFrame(running: boolean): DensityFrame {
		this.sequence += 1;
		const { pixels, clipCounts } = this.toneMap();
		return {
			mode: this.config.mode,
			width: this.config.width,
			height: this.config.height,
			sequence: this.sequence,
			pixels,
			samplesProcessed: this.samplesProcessedValue,
			targetSamples: this.config.targetSamples,
			escapingOrbits: this.escapingOrbitsValue,
			accumulatedOrbits: this.accumulatedOrbitsValue,
			plottedOrbitPoints: this.plottedOrbitPointsValue,
			progress: this.samplesProcessedValue / this.config.targetSamples,
			clipCounts,
			histogramBytes: this.histogramBytes,
			running: running && !this.complete,
			complete: this.complete
		};
	}

	private accumulateCandidate(cRe: number, cIm: number): void {
		let zRe = 0;
		let zIm = 0;
		let escapeIteration = 0;

		for (let iteration = 1; iteration <= this.config.maxIterations; iteration += 1) {
			const nextRe = zRe * zRe - zIm * zIm + cRe;
			const nextIm = 2 * zRe * zIm + cIm;
			zRe = nextRe;
			zIm = nextIm;
			if (zRe * zRe + zIm * zIm > this.bailoutSquared) {
				escapeIteration = iteration;
				break;
			}
		}

		if (escapeIteration === 0) return;
		this.escapingOrbitsValue += 1;
		if (escapeIteration < this.config.minEscapeIterations) return;

		const channels = this.channelsForEscape(escapeIteration);
		if (channels.length === 0) return;
		this.accumulatedOrbitsValue += 1;

		zRe = 0;
		zIm = 0;
		for (let iteration = 1; iteration <= escapeIteration; iteration += 1) {
			const nextRe = zRe * zRe - zIm * zIm + cRe;
			const nextIm = 2 * zRe * zIm + cIm;
			zRe = nextRe;
			zIm = nextIm;
			const pixelIndex = this.orbitPixelIndex(zRe, zIm);
			if (pixelIndex < 0) continue;
			this.plottedOrbitPointsValue += 1;
			for (const channel of channels) this.increment(channel, pixelIndex);
		}
	}

	private channelsForEscape(escapeIteration: number): number[] {
		if (this.channelCount === 1) return [0];
		const channels: number[] = [];
		for (let channel = 0; channel < 3; channel += 1) {
			const [minimum, maximum] = this.iterationWindows[channel];
			if (escapeIteration >= minimum && escapeIteration <= maximum) channels.push(channel);
		}
		return channels;
	}

	private orbitPixelIndex(re: number, im: number): number {
		const bounds = this.config.orbitBounds;
		if (re < bounds.minRe || re >= bounds.maxRe || im < bounds.minIm || im >= bounds.maxIm) {
			return -1;
		}
		const x = Math.floor(((re - bounds.minRe) / (bounds.maxRe - bounds.minRe)) * this.config.width);
		const y = Math.min(
			this.config.height - 1,
			Math.floor(((bounds.maxIm - im) / (bounds.maxIm - bounds.minIm)) * this.config.height)
		);
		if (x < 0 || x >= this.config.width || y < 0 || y >= this.config.height) return -1;
		return y * this.config.width + x;
	}

	private increment(channel: number, pixelIndex: number): void {
		const index = channel * this.pixelCount + pixelIndex;
		const value = this.density[index];
		if (value < UINT32_MAX) this.density[index] = value + 1;
	}

	private toneMap(): {
		pixels: Uint8ClampedArray;
		clipCounts: readonly [number, number, number];
	} {
		const pixels = new Uint8ClampedArray(this.pixelCount * 4);
		const clips =
			this.channelCount === 1
				? [this.clipCountForChannel(0)]
				: [this.clipCountForChannel(0), this.clipCountForChannel(1), this.clipCountForChannel(2)];
		const clipCounts: readonly [number, number, number] =
			this.channelCount === 1 ? [clips[0], clips[0], clips[0]] : [clips[0], clips[1], clips[2]];

		for (let pixelIndex = 0; pixelIndex < this.pixelCount; pixelIndex += 1) {
			const outputIndex = pixelIndex * 4;
			if (this.channelCount === 1) {
				const intensity = this.mapDensity(this.density[pixelIndex], clips[0]);
				pixels[outputIndex] = intensity;
				pixels[outputIndex + 1] = intensity;
				pixels[outputIndex + 2] = intensity;
			} else {
				pixels[outputIndex] = this.mapDensity(this.density[pixelIndex], clips[0]);
				pixels[outputIndex + 1] = this.mapDensity(
					this.density[this.pixelCount + pixelIndex],
					clips[1]
				);
				pixels[outputIndex + 2] = this.mapDensity(
					this.density[this.pixelCount * 2 + pixelIndex],
					clips[2]
				);
			}
			pixels[outputIndex + 3] = 255;
		}
		return { pixels, clipCounts };
	}

	private clipCountForChannel(channel: number): number {
		const offset = channel * this.pixelCount;
		let maximum = 0;
		let nonZeroCount = 0;
		for (let index = 0; index < this.pixelCount; index += 1) {
			const value = this.density[offset + index];
			if (value > 0) nonZeroCount += 1;
			if (value > maximum) maximum = value;
		}
		if (maximum <= 1 || nonZeroCount <= 1 || this.config.percentileClip >= 1) {
			return Math.max(1, maximum);
		}

		const bins = new Uint32Array(TONE_HISTOGRAM_BINS);
		const logarithmicMaximum = Math.log1p(maximum);
		for (let index = 0; index < this.pixelCount; index += 1) {
			const value = this.density[offset + index];
			if (value === 0) continue;
			const bin = Math.min(
				TONE_HISTOGRAM_BINS - 1,
				Math.floor((Math.log1p(value) / logarithmicMaximum) * (TONE_HISTOGRAM_BINS - 1))
			);
			bins[bin] += 1;
		}

		const target = Math.max(1, Math.ceil(nonZeroCount * this.config.percentileClip));
		let cumulative = 0;
		for (let bin = 0; bin < TONE_HISTOGRAM_BINS; bin += 1) {
			cumulative += bins[bin];
			if (cumulative < target) continue;
			const logarithmicValue = ((bin + 1) / TONE_HISTOGRAM_BINS) * logarithmicMaximum;
			return Math.max(1, Math.min(maximum, Math.ceil(Math.expm1(logarithmicValue))));
		}
		return Math.max(1, maximum);
	}

	private mapDensity(value: number, clipCount: number): number {
		if (value <= 0) return 0;
		const exposure = this.config.exposure;
		const denominator = Math.log1p(clipCount * exposure);
		const logarithmic =
			denominator > 0 ? Math.log1p(Math.min(value, clipCount) * exposure) / denominator : 0;
		const corrected = Math.pow(Math.max(0, Math.min(1, logarithmic)), 1 / this.config.gamma);
		return Math.round(corrected * 255);
	}
}

function cloneDensityConfig(config: DensityTaskConfig): DensityTaskConfig {
	return {
		...config,
		sampleBounds: { ...config.sampleBounds },
		orbitBounds: { ...config.orbitBounds },
		iterationWindows: config.iterationWindows
			? cloneIterationWindows(config.iterationWindows)
			: undefined
	};
}

function cloneIterationWindows(windows: NebulabrotWindows): NebulabrotWindows {
	return [
		[windows[0][0], windows[0][1]],
		[windows[1][0], windows[1][1]],
		[windows[2][0], windows[2][1]]
	];
}
