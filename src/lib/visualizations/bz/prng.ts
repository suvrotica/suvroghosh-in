import { SeededRandom } from '../../utils/seeded-random';
import type { Seed } from '../../utils/seeded-random';

export { SeededRandom };
export type { Seed };

/** A named stream keeps BZ initialization independent from other seeded subsystems. */
export function createBZRandom(seed: Seed, stream = 'initial'): SeededRandom {
	return new SeededRandom(seed).fork(`bz-laboratory:${stream}`);
}
