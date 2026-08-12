import { z } from 'zod';

const finiteNumber = z.number().finite();
const normalizedAge = finiteNumber.min(0).max(1);

export const GrowthKeyframeSchema = z
	.object({
		age: normalizedAge,
		value: finiteNumber
	})
	.strict();

export const GrowthEpisodeSchema = z
	.object({
		start: normalizedAge,
		end: normalizedAge,
		value: finiteNumber
	})
	.strict()
	.refine((episode) => episode.end >= episode.start, {
		message: 'An episode must end at or after it starts.',
		path: ['end']
	});

const ConstantGrowthLawSchema = z
	.object({
		type: z.literal('constant'),
		value: finiteNumber
	})
	.strict();

const LinearGrowthLawSchema = z
	.object({
		type: z.literal('linear'),
		start: finiteNumber,
		end: finiteNumber
	})
	.strict();

const HermiteGrowthLawSchema = z
	.object({
		type: z.literal('hermite'),
		start: finiteNumber,
		end: finiteNumber,
		startSlope: finiteNumber.default(0),
		endSlope: finiteNumber.default(0),
		clampOvershoot: z.boolean().default(true)
	})
	.strict();

const StepGrowthLawSchema = z
	.object({
		type: z.literal('step'),
		base: finiteNumber,
		episodes: z.array(GrowthEpisodeSchema).max(32)
	})
	.strict();

const SinusoidGrowthLawSchema = z
	.object({
		type: z.literal('sinusoid'),
		offset: finiteNumber,
		amplitude: finiteNumber,
		cycles: finiteNumber.min(0).max(128),
		phase: finiteNumber.default(0)
	})
	.strict();

const KeyframedGrowthLawSchema = z
	.object({
		type: z.literal('keyframes'),
		interpolation: z.enum(['linear', 'smooth', 'step']),
		points: z.array(GrowthKeyframeSchema).min(1).max(32)
	})
	.strict()
	.superRefine((law, context) => {
		for (let index = 1; index < law.points.length; index += 1) {
			if (law.points[index].age <= law.points[index - 1].age) {
				context.addIssue({
					code: 'custom',
					message: 'Keyframe ages must be strictly increasing.',
					path: ['points', index, 'age']
				});
			}
		}
	});

/**
 * A JSON-safe, deterministic value-over-normalized-age description.
 *
 * Hermite output is clamped to the interval between its endpoints by default.
 * This intentionally prevents unconstrained cubic overshoot in ordinary recipes.
 */
export const GrowthLawSchema = z.discriminatedUnion('type', [
	ConstantGrowthLawSchema,
	LinearGrowthLawSchema,
	HermiteGrowthLawSchema,
	StepGrowthLawSchema,
	SinusoidGrowthLawSchema,
	KeyframedGrowthLawSchema
]);

export type GrowthKeyframe = z.infer<typeof GrowthKeyframeSchema>;
export type GrowthEpisode = z.infer<typeof GrowthEpisodeSchema>;
export type GrowthLaw = z.infer<typeof GrowthLawSchema>;

export const constantLaw = (value: number): GrowthLaw => ({ type: 'constant', value });

export const linearLaw = (start: number, end: number): GrowthLaw => ({
	type: 'linear',
	start,
	end
});

function clampAge(age: number): number {
	if (!Number.isFinite(age)) return 0;
	return Math.min(1, Math.max(0, age));
}

function clampBetween(value: number, a: number, b: number): number {
	return Math.min(Math.max(a, b), Math.max(Math.min(a, b), value));
}

function evaluateHermite(
	age: number,
	start: number,
	end: number,
	startSlope: number,
	endSlope: number,
	clampOvershoot: boolean
): number {
	const t2 = age * age;
	const t3 = t2 * age;
	const h00 = 2 * t3 - 3 * t2 + 1;
	const h10 = t3 - 2 * t2 + age;
	const h01 = -2 * t3 + 3 * t2;
	const h11 = t3 - t2;
	const value = h00 * start + h10 * startSlope + h01 * end + h11 * endSlope;
	return clampOvershoot ? clampBetween(value, start, end) : value;
}

function keyframeSegment(points: GrowthKeyframe[], age: number): number {
	if (points.length < 2 || age <= points[0].age) return 0;
	for (let index = 1; index < points.length; index += 1) {
		if (age <= points[index].age) return index - 1;
	}
	return points.length - 2;
}

function evaluateKeyframes(
	points: GrowthKeyframe[],
	interpolation: 'linear' | 'smooth' | 'step',
	age: number
): number {
	if (points.length === 1 || age <= points[0].age) return points[0].value;
	const last = points[points.length - 1];
	if (age >= last.age) return last.value;

	const index = keyframeSegment(points, age);
	const left = points[index];
	const right = points[index + 1];
	if (interpolation === 'step') return left.value;

	let localAge = (age - left.age) / (right.age - left.age);
	if (interpolation === 'smooth') {
		localAge = localAge * localAge * (3 - 2 * localAge);
	}
	return left.value + (right.value - left.value) * localAge;
}

/** Evaluate a growth law at normalized age. Ages outside [0, 1] are clamped. */
export function evaluateGrowthLaw(law: GrowthLaw, age: number): number {
	const t = clampAge(age);
	switch (law.type) {
		case 'constant':
			return law.value;
		case 'linear':
			return law.start + (law.end - law.start) * t;
		case 'hermite':
			return evaluateHermite(
				t,
				law.start,
				law.end,
				law.startSlope,
				law.endSlope,
				law.clampOvershoot
			);
		case 'step': {
			let value = law.base;
			for (const episode of law.episodes) {
				if (t >= episode.start && t <= episode.end) value = episode.value;
			}
			return value;
		}
		case 'sinusoid':
			return law.offset + law.amplitude * Math.sin(Math.PI * 2 * law.cycles * t + law.phase);
		case 'keyframes':
			return evaluateKeyframes(law.points, law.interpolation, t);
	}
}

export function sampleGrowthLaw(law: GrowthLaw, count: number): Float64Array {
	const sampleCount = Math.max(1, Math.floor(count));
	const result = new Float64Array(sampleCount);
	for (let index = 0; index < sampleCount; index += 1) {
		const age = sampleCount === 1 ? 0 : index / (sampleCount - 1);
		result[index] = evaluateGrowthLaw(law, age);
	}
	return result;
}
