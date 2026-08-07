const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

export function hashString(value: string): number {
	let hash = FNV_OFFSET;
	for (let index = 0; index < value.length; index += 1) {
		hash ^= value.charCodeAt(index);
		hash = Math.imul(hash, FNV_PRIME);
	}
	return hash >>> 0;
}

export function hashToHex(hash: number): string {
	return (hash >>> 0).toString(16).padStart(8, '0');
}

export function mixHash(left: number, right: number): number {
	let value = (left ^ right) >>> 0;
	value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
	value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
	return (value ^ (value >>> 16)) >>> 0;
}

export function deriveSubseed(seed: string | number, label: string | number): string {
	const source = `${String(seed)}\u241f${String(label)}`;
	return `${String(seed)}:${String(label)}:${hashToHex(hashString(source))}`;
}

function canonicalise(value: unknown, seen: WeakSet<object>): unknown {
	if (value === null || typeof value !== 'object') {
		if (typeof value === 'number' && !Number.isFinite(value)) return null;
		return value;
	}
	if (seen.has(value)) throw new TypeError('Cannot hash a cyclic value.');
	seen.add(value);
	try {
		if (Array.isArray(value)) return value.map((entry) => canonicalise(entry, seen));
		return Object.fromEntries(
			Object.entries(value as Record<string, unknown>)
				.filter(([, entry]) => entry !== undefined)
				.sort(([left], [right]) => left.localeCompare(right))
				.map(([key, entry]) => [key, canonicalise(entry, seen)])
		);
	} finally {
		seen.delete(value);
	}
}

export function stableStringify(value: unknown): string {
	return JSON.stringify(canonicalise(value, new WeakSet()));
}

export function hashValue(value: unknown): string {
	return hashToHex(hashString(stableStringify(value)));
}
