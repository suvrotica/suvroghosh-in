import { compressSync, strToU8 } from 'fflate';
import { ShellRecipeSchema, type ShellRecipe } from '../model/recipe-schema';
import { canonicalJson, serializeShellRecipe } from './canonical';

export const URL_STATE_PREFIX = 'sl2.';
export const DEFAULT_MAX_URL_STATE_LENGTH = 1900;

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function bytesToBase64Url(bytes: Uint8Array): string {
	let result = '';
	for (let index = 0; index < bytes.length; index += 3) {
		const a = bytes[index];
		const hasB = index + 1 < bytes.length;
		const hasC = index + 2 < bytes.length;
		const b = hasB ? bytes[index + 1] : 0;
		const c = hasC ? bytes[index + 2] : 0;
		const block = (a << 16) | (b << 8) | c;
		result += BASE64[(block >>> 18) & 63];
		result += BASE64[(block >>> 12) & 63];
		if (hasB) result += BASE64[(block >>> 6) & 63];
		if (hasC) result += BASE64[block & 63];
	}
	return result.replaceAll('+', '-').replaceAll('/', '_');
}

export function encodeRecipeToUrlState(recipe: ShellRecipe): string {
	const compactJson = canonicalJson(ShellRecipeSchema.parse(recipe));
	const compressed = compressSync(strToU8(compactJson), { level: 9 });
	return `${URL_STATE_PREFIX}${bytesToBase64Url(compressed)}`;
}

function safeFilename(name: string): string {
	const slug = name
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '')
		.slice(0, 72);
	return `${slug || 'shell-recipe'}.shell.json`;
}

export interface UrlShareState {
	kind: 'url';
	state: string;
	fragment: string;
	encodedLength: number;
	maxLength: number;
}

export interface JsonDownloadFallback {
	kind: 'json-download';
	json: string;
	filename: string;
	encodedLength: number;
	maxLength: number;
	reason: 'url-state-too-large';
}

export type PreparedRecipeShare = UrlShareState | JsonDownloadFallback;

/** Compress an ordinary recipe for a URL, or return an explicit JSON-download fallback. */
export function prepareRecipeShare(
	recipe: ShellRecipe,
	maxLength = DEFAULT_MAX_URL_STATE_LENGTH
): PreparedRecipeShare {
	const state = encodeRecipeToUrlState(recipe);
	const fragment = `#shell=${state}`;
	if (fragment.length <= maxLength) {
		return { kind: 'url', state, fragment, encodedLength: fragment.length, maxLength };
	}
	return {
		kind: 'json-download',
		json: serializeShellRecipe(recipe),
		filename: safeFilename(recipe.name),
		encodedLength: fragment.length,
		maxLength,
		reason: 'url-state-too-large'
	};
}
