import { decompressSync, strFromU8 } from 'fflate';
import { migrateShellRecipe } from '../model/migrations';
import type { ShellRecipe } from '../model/recipe-schema';
import { URL_STATE_PREFIX } from './encode';

const BASE64_LOOKUP = new Int16Array(128).fill(-1);
const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
for (let index = 0; index < BASE64.length; index += 1) {
	BASE64_LOOKUP[BASE64.charCodeAt(index)] = index;
}

export function base64UrlToBytes(input: string): Uint8Array {
	const normalized = input.replaceAll('-', '+').replaceAll('_', '/');
	if (normalized.length % 4 === 1 || /[^A-Za-z0-9+/]/.test(normalized)) {
		throw new SyntaxError('Malformed base64url recipe state.');
	}
	const outputLength = Math.floor((normalized.length * 6) / 8);
	const output = new Uint8Array(outputLength);
	let accumulator = 0;
	let bits = 0;
	let outputIndex = 0;
	for (let index = 0; index < normalized.length; index += 1) {
		const code = normalized.charCodeAt(index);
		const value = code < BASE64_LOOKUP.length ? BASE64_LOOKUP[code] : -1;
		if (value < 0) throw new SyntaxError('Malformed base64url recipe state.');
		accumulator = (accumulator << 6) | value;
		bits += 6;
		if (bits >= 8) {
			bits -= 8;
			output[outputIndex] = (accumulator >>> bits) & 0xff;
			outputIndex += 1;
		}
	}
	return output;
}

function extractState(input: string): string {
	let state = input.trim();
	if (state.startsWith('#')) state = state.slice(1);
	if (state.startsWith('?')) state = state.slice(1);
	if (state.startsWith('shell=')) state = state.slice('shell='.length);
	return decodeURIComponent(state);
}

export interface DecodeUrlStateOptions {
	maxCompressedBytes?: number;
	maxJsonBytes?: number;
}

export function decodeRecipeFromUrlState(
	input: string,
	options: DecodeUrlStateOptions = {}
): ShellRecipe {
	const state = extractState(input);
	if (!state.startsWith(URL_STATE_PREFIX)) {
		throw new SyntaxError(`Unsupported shell URL state prefix; expected ${URL_STATE_PREFIX}`);
	}
	const compressed = base64UrlToBytes(state.slice(URL_STATE_PREFIX.length));
	const maxCompressedBytes = options.maxCompressedBytes ?? 256_000;
	if (compressed.byteLength > maxCompressedBytes) {
		throw new RangeError(`Compressed shell URL state exceeds ${maxCompressedBytes} bytes.`);
	}
	let jsonBytes: Uint8Array;
	try {
		jsonBytes = decompressSync(compressed);
	} catch (error) {
		throw new SyntaxError(
			`Shell URL state could not be decompressed: ${error instanceof Error ? error.message : String(error)}`,
			{ cause: error }
		);
	}
	const maxJsonBytes = options.maxJsonBytes ?? 2_000_000;
	if (jsonBytes.byteLength > maxJsonBytes) {
		throw new RangeError(`Decompressed shell recipe exceeds ${maxJsonBytes} bytes.`);
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(strFromU8(jsonBytes));
	} catch (error) {
		throw new SyntaxError(
			`Shell URL state does not contain valid JSON: ${error instanceof Error ? error.message : String(error)}`,
			{ cause: error }
		);
	}
	return migrateShellRecipe(parsed);
}
