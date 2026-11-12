export function hashKey(text: string): number {
	let hash = 2166136261;
	for (let index = 0; index < text.length; index += 1) {
		hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
	}
	return hash >>> 0;
}

export function randomStream(key: number): () => number {
	let state = key;
	return () => {
		state = (state + 0x6d2b79f5) | 0;
		let value = Math.imul(state ^ (state >>> 15), state | 1);
		value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
		return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
	};
}

export function clamp(value: number, minimum = 0, maximum = 1): number {
	return Math.min(maximum, Math.max(minimum, value));
}
