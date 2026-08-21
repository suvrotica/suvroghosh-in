export type RngState = number;

export type RandomStep = {
	value: number;
	state: RngState;
};

const FALLBACK_SEED = 0x6d2b79f5;

export function normalizeSeed(seed: number): RngState {
	const normalized = seed >>> 0;
	return normalized === 0 ? FALLBACK_SEED : normalized;
}

function nextUint32(state: RngState) {
	let value = normalizeSeed(state);
	value ^= value << 13;
	value ^= value >>> 17;
	value ^= value << 5;
	const nextState = value >>> 0;
	return { value: nextState, state: normalizeSeed(nextState) };
}

/** A small serializable xorshift32 generator. */
export function nextRandom(state: RngState): RandomStep {
	const step = nextUint32(state);
	return { value: step.value / 0x1_0000_0000, state: step.state };
}

export function nextDie(state: RngState) {
	const step = nextInt(state, 6);
	return {
		value: step.value + 1,
		state: step.state
	};
}

export function nextInt(state: RngState, maximumExclusive: number) {
	if (
		!Number.isInteger(maximumExclusive) ||
		maximumExclusive < 1 ||
		maximumExclusive > 0xffff_ffff
	) {
		throw new RangeError('maximumExclusive must be an unsigned 32-bit positive integer');
	}
	// Xorshift32 cycles through all 2^32 - 1 non-zero states. Rejection
	// sampling keeps each bucket exactly the same size instead of using a
	// slightly biased multiply-and-floor mapping.
	const outcomeCount = 0xffff_ffff;
	const acceptedCount = outcomeCount - (outcomeCount % maximumExclusive);
	let cursor = state;
	while (true) {
		const step = nextUint32(cursor);
		cursor = step.state;
		if (step.value <= acceptedCount) {
			return { value: (step.value - 1) % maximumExclusive, state: cursor };
		}
	}
}

export function freshBrowserSeed(cryptoSource: Pick<Crypto, 'getRandomValues'> = crypto) {
	const seed = new Uint32Array(1);
	cryptoSource.getRandomValues(seed);
	return normalizeSeed(seed[0]);
}
