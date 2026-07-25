import type { ModelId, ModelMetrics, SpikeEvent } from './types';

export interface GateSample {
	m: number;
	h: number;
	n: number;
}

export class ModelMetricAccumulator {
	private steps = 0;
	private spikeCount = 0;
	private firstSpikeTimeMs: number | null = null;
	private lastSpikeTimeMs: number | null = null;
	private minimumPrimary: number;
	private maximumPrimary: number;
	private finalPrimary: number;
	private gateExtrema:
		| {
				m: [number, number];
				h: [number, number];
				n: [number, number];
		  }
		| undefined;

	constructor(
		private readonly modelId: ModelId,
		private readonly initialPrimary: number,
		initialGates?: GateSample
	) {
		if (!Number.isFinite(initialPrimary))
			throw new RangeError('Initial metric value must be finite.');
		this.minimumPrimary = initialPrimary;
		this.maximumPrimary = initialPrimary;
		this.finalPrimary = initialPrimary;
		if (initialGates) {
			this.gateExtrema = {
				m: [initialGates.m, initialGates.m],
				h: [initialGates.h, initialGates.h],
				n: [initialGates.n, initialGates.n]
			};
		}
	}

	observe(primary: number, event: SpikeEvent | null = null, gates?: GateSample): void {
		if (!Number.isFinite(primary)) {
			throw new RangeError(`${this.modelId} produced a non-finite primary metric.`);
		}
		this.steps += 1;
		this.minimumPrimary = Math.min(this.minimumPrimary, primary);
		this.maximumPrimary = Math.max(this.maximumPrimary, primary);
		this.finalPrimary = primary;
		if (event) {
			this.spikeCount += 1;
			this.firstSpikeTimeMs ??= event.timeMs;
			this.lastSpikeTimeMs = event.timeMs;
		}
		if (gates && this.gateExtrema) {
			for (const name of ['m', 'h', 'n'] as const) {
				const value = gates[name];
				this.gateExtrema[name][0] = Math.min(this.gateExtrema[name][0], value);
				this.gateExtrema[name][1] = Math.max(this.gateExtrema[name][1], value);
			}
		}
	}

	finish(commandHash: string): ModelMetrics {
		return {
			modelId: this.modelId,
			steps: this.steps,
			commandHash,
			spikeCount: this.spikeCount,
			firstSpikeTimeMs: this.firstSpikeTimeMs,
			lastSpikeTimeMs: this.lastSpikeTimeMs,
			minimumPrimary: this.minimumPrimary,
			maximumPrimary: this.maximumPrimary,
			initialPrimary: this.initialPrimary,
			finalPrimary: this.finalPrimary,
			restingDrift: this.finalPrimary - this.initialPrimary,
			gateExtrema: this.gateExtrema
				? {
						m: [...this.gateExtrema.m],
						h: [...this.gateExtrema.h],
						n: [...this.gateExtrema.n]
					}
				: undefined
		};
	}
}

export function median(values: readonly number[]): number {
	if (values.length === 0) throw new RangeError('Cannot calculate a median of no values.');
	const sorted = [...values].sort((left, right) => left - right);
	const middle = Math.floor(sorted.length / 2);
	return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}
