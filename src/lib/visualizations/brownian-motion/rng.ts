import { SeededRandom, type Seed } from '$lib/utils/seeded-random';
import { GaussianSampler } from './gaussian';

function normalizeLabel(label: string): string {
	const normalized = label.trim();
	if (!normalized) throw new RangeError('Random stream labels must not be empty.');
	return normalized;
}

/**
 * Lazily-created deterministic streams. Every label is forked from the root
 * seed material, so constructing or consuming one subsystem cannot perturb
 * any other subsystem's sequence.
 */
export class LabelledRandomStreams {
	private readonly root: SeededRandom;
	private readonly uniforms = new Map<string, SeededRandom>();
	private readonly gaussians = new Map<string, GaussianSampler>();

	constructor(readonly seed: Seed) {
		this.root = new SeededRandom(seed);
	}

	uniform(label: string): SeededRandom {
		const key = normalizeLabel(label);
		let stream = this.uniforms.get(key);
		if (!stream) {
			stream = this.root.fork(`uniform:${key}`);
			this.uniforms.set(key, stream);
		}
		return stream;
	}

	normal(label: string): GaussianSampler {
		const key = normalizeLabel(label);
		let stream = this.gaussians.get(key);
		if (!stream) {
			stream = new GaussianSampler(this.root.fork(`normal:${key}`));
			this.gaussians.set(key, stream);
		}
		return stream;
	}
}

export function createBrownianRandomStreams(seed: Seed): LabelledRandomStreams {
	return new LabelledRandomStreams(seed);
}
