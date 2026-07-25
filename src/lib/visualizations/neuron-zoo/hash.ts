const FNV_OFFSET_64 = 0xcbf29ce484222325n;
const FNV_PRIME_64 = 0x100000001b3n;
const MASK_64 = 0xffffffffffffffffn;

function updateByte(hash: bigint, byte: number): bigint {
	return ((hash ^ BigInt(byte)) * FNV_PRIME_64) & MASK_64;
}

function updateUint32(hash: bigint, value: number): bigint {
	let next = hash;
	for (let shift = 24; shift >= 0; shift -= 8) next = updateByte(next, (value >>> shift) & 0xff);
	return next;
}

function updateString(hash: bigint, value: string): bigint {
	let next = updateUint32(hash, value.length);
	for (let index = 0; index < value.length; index += 1) {
		const code = value.charCodeAt(index);
		next = updateByte(next, code >>> 8);
		next = updateByte(next, code & 0xff);
	}
	return next;
}

function updateNumber(hash: bigint, value: number, view: DataView): bigint {
	view.setFloat64(0, value, false);
	let next = hash;
	for (let index = 0; index < 8; index += 1) next = updateByte(next, view.getUint8(index));
	return next;
}

function finish(hash: bigint): string {
	return hash.toString(16).padStart(16, '0');
}

export function hashNumbers(values: ArrayLike<number>): string {
	const view = new DataView(new ArrayBuffer(8));
	let hash = updateUint32(FNV_OFFSET_64, values.length);
	for (let index = 0; index < values.length; index += 1) {
		hash = updateNumber(hash, values[index], view);
	}
	return finish(hash);
}

export function hashTraceChannels(channels: Readonly<Record<string, ArrayLike<number>>>): string {
	const view = new DataView(new ArrayBuffer(8));
	let hash = FNV_OFFSET_64;
	for (const name of Object.keys(channels).sort()) {
		const values = channels[name];
		hash = updateString(hash, name);
		hash = updateUint32(hash, values.length);
		for (let index = 0; index < values.length; index += 1) {
			hash = updateNumber(hash, values[index], view);
		}
	}
	return finish(hash);
}
