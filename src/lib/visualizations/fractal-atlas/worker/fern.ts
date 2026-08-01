import { SeededRandom } from '../../../utils/seeded-random';
import {
	isBarnsleyFernTaskConfig,
	type BarnsleyFernTaskConfig,
	type FernFrame,
	type FernTransform
} from './protocol';

export const BARNSLEY_FERN_TRANSFORMS: readonly FernTransform[] = [
	{
		a: 0,
		b: 0,
		c: 0,
		d: 0.16,
		e: 0,
		f: 0,
		probability: 0.01,
		label: 'Stem'
	},
	{
		a: 0.85,
		b: 0.04,
		c: -0.04,
		d: 0.85,
		e: 0,
		f: 1.6,
		probability: 0.85,
		label: 'Successive leaflets'
	},
	{
		a: 0.2,
		b: -0.26,
		c: 0.23,
		d: 0.22,
		e: 0,
		f: 1.6,
		probability: 0.07,
		label: 'Left leaflet'
	},
	{
		a: -0.15,
		b: 0.28,
		c: 0.26,
		d: 0.24,
		e: 0,
		f: 0.44,
		probability: 0.07,
		label: 'Right leaflet'
	}
];

interface PreparedTransform {
	transform: FernTransform;
	cumulativeProbability: number;
}

export class BarnsleyFernAccumulator {
	readonly config: BarnsleyFernTaskConfig;
	readonly transforms: readonly FernTransform[];

	private readonly random: SeededRandom;
	private readonly preparedTransforms: readonly PreparedTransform[];
	private x = 0;
	private y = 0;
	private totalPointsValue = 0;
	private sequence = 0;
	private activeTransformValue: number | null = null;

	constructor(config: BarnsleyFernTaskConfig) {
		if (!isBarnsleyFernTaskConfig(config)) {
			throw new RangeError('Invalid or unsafe Barnsley fern Worker configuration.');
		}
		this.config = cloneFernConfig(config);
		this.transforms = cloneTransforms(config.transforms ?? BARNSLEY_FERN_TRANSFORMS);
		this.preparedTransforms = prepareTransforms(this.transforms);
		this.random = new SeededRandom(config.seed);

		for (let index = 0; index < config.burnIn; index += 1) this.iterate();
	}

	get complete(): boolean {
		return this.totalPointsValue >= this.config.targetPoints;
	}

	get totalPoints(): number {
		return this.totalPointsValue;
	}

	get targetPoints(): number {
		return this.config.targetPoints;
	}

	advanceBatch(running: boolean, requestedBatchSize = this.config.pointsPerBatch): FernFrame {
		const batchStart = this.totalPointsValue;
		const count = Math.min(
			Math.max(1, Math.min(this.config.pointsPerBatch, Math.floor(requestedBatchSize))),
			this.config.targetPoints - this.totalPointsValue
		);
		const points = new Float32Array(Math.max(0, count) * 2);
		const transformIndices = new Uint8Array(Math.max(0, count));

		for (let index = 0; index < count; index += 1) {
			const transformIndex = this.iterate();
			points[index * 2] = this.x;
			points[index * 2 + 1] = this.y;
			transformIndices[index] = transformIndex;
		}

		this.totalPointsValue += count;
		this.sequence += 1;
		return {
			sequence: this.sequence,
			points,
			transformIndices,
			batchStart,
			totalPoints: this.totalPointsValue,
			targetPoints: this.config.targetPoints,
			progress: this.totalPointsValue / this.config.targetPoints,
			activeTransform: this.activeTransformValue,
			running: running && !this.complete,
			complete: this.complete
		};
	}

	private iterate(): number {
		const draw = this.random.next();
		let transformIndex = this.preparedTransforms.length - 1;
		for (let index = 0; index < this.preparedTransforms.length; index += 1) {
			if (draw < this.preparedTransforms[index].cumulativeProbability) {
				transformIndex = index;
				break;
			}
		}

		const { transform } = this.preparedTransforms[transformIndex];
		const nextX = transform.a * this.x + transform.b * this.y + transform.e;
		const nextY = transform.c * this.x + transform.d * this.y + transform.f;
		if (
			!Number.isFinite(nextX) ||
			!Number.isFinite(nextY) ||
			Math.abs(nextX) > 3.4e38 ||
			Math.abs(nextY) > 3.4e38
		) {
			throw new RangeError('A fern transform produced a point outside the finite Float32 range.');
		}
		this.x = nextX;
		this.y = nextY;
		this.activeTransformValue = transformIndex;
		return transformIndex;
	}
}

function prepareTransforms(transforms: readonly FernTransform[]): PreparedTransform[] {
	const probabilityTotal = transforms.reduce(
		(total, transform) => total + transform.probability,
		0
	);
	let cumulativeProbability = 0;
	return transforms.map((transform, index) => {
		cumulativeProbability += transform.probability / probabilityTotal;
		return {
			transform,
			cumulativeProbability: index === transforms.length - 1 ? 1 : cumulativeProbability
		};
	});
}

function cloneFernConfig(config: BarnsleyFernTaskConfig): BarnsleyFernTaskConfig {
	return {
		...config,
		transforms: config.transforms ? cloneTransforms(config.transforms) : undefined
	};
}

function cloneTransforms(transforms: readonly FernTransform[]): FernTransform[] {
	return transforms.map((transform) => ({ ...transform }));
}
