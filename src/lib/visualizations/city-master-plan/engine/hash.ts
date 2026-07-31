const FNV_OFFSET = 2166136261;
const FNV_PRIME = 16777619;

export function hashString32(value: string): number {
	let hash = FNV_OFFSET;
	for (let index = 0; index < value.length; index += 1) {
		hash ^= value.charCodeAt(index);
		hash = Math.imul(hash, FNV_PRIME);
	}
	return hash >>> 0;
}

export function hashParts32(...parts: readonly (string | number | boolean)[]): number {
	return hashString32(parts.map(String).join('\u001f'));
}

export function hashUnit(...parts: readonly (string | number | boolean)[]): number {
	return hashParts32(...parts) / 0x1_0000_0000;
}

export function hexadecimal32(value: number): string {
	return (value >>> 0).toString(16).padStart(8, '0').toUpperCase();
}

export function formattedFingerprint(value: number): string {
	const hex = hexadecimal32(value);
	return `${hex.slice(0, 4)}-${hex.slice(4)}`;
}

export function hashCanonicalParts(parts: readonly string[]): string {
	let hash = FNV_OFFSET;
	for (const part of parts) {
		for (let index = 0; index < part.length; index += 1) {
			hash ^= part.charCodeAt(index);
			hash = Math.imul(hash, FNV_PRIME);
		}
		hash ^= 31;
		hash = Math.imul(hash, FNV_PRIME);
	}
	return formattedFingerprint(hash >>> 0);
}
