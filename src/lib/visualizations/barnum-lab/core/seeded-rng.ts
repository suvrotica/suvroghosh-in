import {
	CORPUS_VERSION,
	ENGINE_VERSION,
	REPLAY_CORPUS_TOKEN,
	REPLAY_ENGINE_TOKEN,
	REPLAY_FORMAT_VERSION
} from './version';

export function hash32(input: string): number {
	let hash = 0x811c9dc5;
	for (let index = 0; index < input.length; index += 1) {
		hash ^= input.charCodeAt(index);
		hash = Math.imul(hash, 0x01000193);
	}
	return hash >>> 0;
}

export function hashHex(input: string): string {
	return hash32(input).toString(16).padStart(8, '0');
}

export function mulberry32(seed: number): () => number {
	let value = seed >>> 0;
	return () => {
		value = (value + 0x6d2b79f5) >>> 0;
		let mixed = value;
		mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
		mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
		return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296;
	};
}

export function rngFor(...parts: readonly string[]): () => number {
	return mulberry32(hash32(parts.join('\u241f')));
}

export function deterministicIndex(length: number, ...seedParts: readonly string[]): number {
	if (!Number.isSafeInteger(length) || length <= 0) {
		throw new RangeError('length must be a positive safe integer');
	}
	return Math.floor(rngFor(...seedParts)() * length);
}

export function deterministicShuffle<T>(
	values: readonly T[],
	...seedParts: readonly string[]
): readonly T[] {
	const result = [...values];
	const random = rngFor(...seedParts);
	for (let index = result.length - 1; index > 0; index -= 1) {
		const other = Math.floor(random() * (index + 1));
		[result[index], result[other]] = [result[other], result[index]];
	}
	return result;
}

export function normalizeSeed64(seed: string): string {
	const compact = seed.trim().toLowerCase().replace(/^0x/, '');
	if (!/^[0-9a-f]{1,16}$/.test(compact)) {
		throw new TypeError('A session seed must be one to sixteen hexadecimal characters.');
	}
	return compact.padStart(16, '0');
}

/** Uses browser cryptography when available. The documented constant is a deterministic fallback. */
export function createSessionSeed(
	cryptoSource: Pick<Crypto, 'getRandomValues'> | undefined = globalThis.crypto
): string {
	if (cryptoSource?.getRandomValues) {
		const words = new Uint32Array(2);
		cryptoSource.getRandomValues(words);
		return `${words[0].toString(16).padStart(8, '0')}${words[1].toString(16).padStart(8, '0')}`;
	}
	return 'b4a7e6d193c0528f';
}

export interface ReplayPayload {
	seed: string;
	corpusVersion: typeof CORPUS_VERSION;
	engineVersion: typeof ENGINE_VERSION;
	manifestHash: string;
	formatVersion: typeof REPLAY_FORMAT_VERSION;
}

export type ReplayParseResult =
	| { ok: true; value: ReplayPayload }
	| {
			ok: false;
			reason: 'malformed' | 'checksum' | 'unsupported-version' | 'manifest-mismatch';
			message: string;
	  };

function replayBody(seed: string, manifestHash: string): string {
	return `BL2-${REPLAY_ENGINE_TOKEN}-${REPLAY_CORPUS_TOKEN}-${manifestHash.toUpperCase()}-${normalizeSeed64(seed).toUpperCase()}`;
}

export function createReplayCode(seed: string, manifestHash: string): string {
	if (!/^[0-9a-f]{8}$/i.test(manifestHash)) {
		throw new TypeError('The corpus manifest hash must contain eight hexadecimal characters.');
	}
	const body = replayBody(seed, manifestHash);
	return `${body}-${hashHex(body).slice(0, 6).toUpperCase()}`;
}

export function parseReplayCode(code: string, expectedManifestHash: string): ReplayParseResult {
	const normalized = code.trim().toUpperCase();
	const match =
		/^(BL[12])-([A-Z0-9]+)-([A-Z0-9]+)-([0-9A-F]{8})-([0-9A-F]{16})-([0-9A-F]{6})$/.exec(
			normalized
		);
	if (!match) {
		return {
			ok: false,
			reason: 'malformed',
			message: 'That replay code is not in the expected format.'
		};
	}
	const [, formatToken, engineToken, corpusToken, manifestHash, seed, checksum] = match;
	if (formatToken !== 'BL2') {
		return {
			ok: false,
			reason: 'unsupported-version',
			message:
				'This Barnum Lab v1 replay code is incompatible with the v2 corpus and cannot be interpreted.'
		};
	}
	const body = normalized.slice(0, normalized.lastIndexOf('-'));
	if (hashHex(body).slice(0, 6).toUpperCase() !== checksum) {
		return { ok: false, reason: 'checksum', message: 'The replay code checksum does not match.' };
	}
	if (engineToken !== REPLAY_ENGINE_TOKEN || corpusToken !== REPLAY_CORPUS_TOKEN) {
		return {
			ok: false,
			reason: 'unsupported-version',
			message: 'This replay code belongs to an unavailable engine or corpus version.'
		};
	}
	if (manifestHash.toLowerCase() !== expectedManifestHash.toLowerCase()) {
		return {
			ok: false,
			reason: 'manifest-mismatch',
			message: 'The local corpus has changed, so this deck cannot be reproduced honestly.'
		};
	}
	return {
		ok: true,
		value: {
			seed: seed.toLowerCase(),
			corpusVersion: CORPUS_VERSION,
			engineVersion: ENGINE_VERSION,
			manifestHash: manifestHash.toLowerCase(),
			formatVersion: REPLAY_FORMAT_VERSION
		}
	};
}
