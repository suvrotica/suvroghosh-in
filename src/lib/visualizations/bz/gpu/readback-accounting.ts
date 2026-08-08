export const BZ_EXPLICIT_FULL_READ_REASONS = Object.freeze([
	'export',
	'checkpoint',
	'scientific-snapshot',
	'debug',
	'context-recovery',
	'deterministic-replay'
] as const);

export type BZGpuFullReadReason = (typeof BZ_EXPLICIT_FULL_READ_REASONS)[number];

export interface BZGpuReadbackAccounting {
	/** Engine-managed reads only; capability probes at construction/restoration are excluded. */
	readonly accountingScope: 'engine-readbacks-excluding-capability-probes';
	readonly fullFieldReadbacks: number;
	readonly fullFieldTexels: number;
	readonly fullFieldByReason: Readonly<Record<BZGpuFullReadReason, number>>;
	readonly lastFullFieldReason: BZGpuFullReadReason | null;
	readonly lastFullFieldStep: number | null;
	readonly probeReadbacks: number;
	readonly probeTexels: number;
	readonly reductionReadbacks: number;
	readonly reductionTexels: number;
	readonly telemetrySamples: number;
	readonly totalReadPixelsCalls: number;
	readonly totalReadTexels: number;
	readonly boundedReadMaximumTexels: number;
}

const FULL_REASONS = new Set<BZGpuFullReadReason>(BZ_EXPLICIT_FULL_READ_REASONS);

export function assertBZGpuFullReadReason(value: unknown): asserts value is BZGpuFullReadReason {
	if (typeof value !== 'string' || !FULL_REASONS.has(value as BZGpuFullReadReason)) {
		throw new RangeError('A full BZ field read requires an explicit supported reason.');
	}
}

function emptyReasons(): Record<BZGpuFullReadReason, number> {
	return {
		export: 0,
		checkpoint: 0,
		'scientific-snapshot': 0,
		debug: 0,
		'context-recovery': 0,
		'deterministic-replay': 0
	};
}

/**
 * Small stateful ledger kept separate from WebGL calls so the no-ordinary-full-
 * readback contract is testable without a browser graphics context.
 */
export class BZGpuReadbackLedger {
	static readonly boundedReadMaximumTexels = 16;

	private fullFieldReadbacksValue = 0;
	private fullFieldTexelsValue = 0;
	private readonly fullFieldByReasonValue = emptyReasons();
	private lastFullFieldReasonValue: BZGpuFullReadReason | null = null;
	private lastFullFieldStepValue: number | null = null;
	private probeReadbacksValue = 0;
	private probeTexelsValue = 0;
	private reductionReadbacksValue = 0;
	private reductionTexelsValue = 0;
	private telemetrySamplesValue = 0;

	recordFullField(reason: BZGpuFullReadReason, texels: number, step: number): void {
		assertBZGpuFullReadReason(reason);
		assertPositiveSafeInteger(texels, 'Full-field read texel count');
		assertStep(step);
		this.fullFieldReadbacksValue += 1;
		this.fullFieldTexelsValue += texels;
		this.fullFieldByReasonValue[reason] += 1;
		this.lastFullFieldReasonValue = reason;
		this.lastFullFieldStepValue = step;
	}

	recordProbe(texels: number): void {
		this.assertBounded(texels, 'Probe');
		this.probeReadbacksValue += 1;
		this.probeTexelsValue += texels;
	}

	recordReduction(texels: number): void {
		this.assertBounded(texels, 'Telemetry reduction');
		this.reductionReadbacksValue += 1;
		this.reductionTexelsValue += texels;
	}

	recordTelemetrySample(): void {
		this.telemetrySamplesValue += 1;
	}

	snapshot(): BZGpuReadbackAccounting {
		const totalReadPixelsCalls =
			this.fullFieldReadbacksValue + this.probeReadbacksValue + this.reductionReadbacksValue;
		const totalReadTexels =
			this.fullFieldTexelsValue + this.probeTexelsValue + this.reductionTexelsValue;
		return {
			accountingScope: 'engine-readbacks-excluding-capability-probes',
			fullFieldReadbacks: this.fullFieldReadbacksValue,
			fullFieldTexels: this.fullFieldTexelsValue,
			fullFieldByReason: Object.freeze({ ...this.fullFieldByReasonValue }),
			lastFullFieldReason: this.lastFullFieldReasonValue,
			lastFullFieldStep: this.lastFullFieldStepValue,
			probeReadbacks: this.probeReadbacksValue,
			probeTexels: this.probeTexelsValue,
			reductionReadbacks: this.reductionReadbacksValue,
			reductionTexels: this.reductionTexelsValue,
			telemetrySamples: this.telemetrySamplesValue,
			totalReadPixelsCalls,
			totalReadTexels,
			boundedReadMaximumTexels: BZGpuReadbackLedger.boundedReadMaximumTexels
		};
	}

	private assertBounded(texels: number, label: string): void {
		assertPositiveSafeInteger(texels, `${label} texel count`);
		if (texels > BZGpuReadbackLedger.boundedReadMaximumTexels) {
			throw new RangeError(
				`${label} read exceeded the ${BZGpuReadbackLedger.boundedReadMaximumTexels}-texel bound.`
			);
		}
	}
}

function assertPositiveSafeInteger(value: number, label: string): void {
	if (!Number.isSafeInteger(value) || value < 1) {
		throw new RangeError(`${label} must be a positive safe integer.`);
	}
}

function assertStep(value: number): void {
	if (!Number.isSafeInteger(value) || value < 0) {
		throw new RangeError('Full-field read step must be a non-negative safe integer.');
	}
}
