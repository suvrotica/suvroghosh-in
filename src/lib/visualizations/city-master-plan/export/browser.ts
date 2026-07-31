import type { CityResult } from '../engine/types';

export function downloadBlob(blob: Blob, filename: string): void {
	if (typeof document === 'undefined' || typeof URL === 'undefined') {
		throw new Error('Downloads are unavailable outside a browser.');
	}
	const objectUrl = URL.createObjectURL(blob);
	const anchor = document.createElement('a');
	anchor.href = objectUrl;
	anchor.download = filename;
	anchor.rel = 'noopener';
	anchor.style.position = 'fixed';
	anchor.style.left = '-10000px';
	document.body.append(anchor);
	anchor.click();
	anchor.remove();
	window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);
}

export async function canvasToBlob(
	canvas: HTMLCanvasElement,
	type = 'image/png',
	quality?: number
): Promise<Blob> {
	const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
	if (!blob) throw new Error('The browser could not encode the city image.');
	return blob;
}

function selectionCopy(text: string): boolean {
	const textarea = document.createElement('textarea');
	const activeElement = document.activeElement as HTMLElement | null;
	textarea.value = text;
	textarea.setAttribute('readonly', '');
	textarea.style.position = 'fixed';
	textarea.style.opacity = '0';
	textarea.style.pointerEvents = 'none';
	document.body.append(textarea);
	textarea.select();
	let copied: boolean;
	try {
		copied = document.execCommand('copy');
	} finally {
		textarea.remove();
		activeElement?.focus?.({ preventScroll: true });
	}
	return copied;
}

export async function copyText(text: string): Promise<void> {
	if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
		try {
			await navigator.clipboard.writeText(text);
			return;
		} catch {
			// Continue to the selection fallback for denied or unavailable clipboard permission.
		}
	}
	if (typeof document !== 'undefined' && selectionCopy(text)) return;
	throw new Error('The text could not be copied. Select the address from the browser instead.');
}

export function shareTextForCity(result: CityResult): string {
	return `My city, ${result.cityName}, scored ${result.scores.functional} for function and ${result.scores.calamity} for municipal calamity. It contains ${result.municipalPatches.length} retrospective permission${result.municipalPatches.length === 1 ? '' : 's'}.`;
}

export async function shareCity(result: CityResult, url: string): Promise<'shared' | 'copied'> {
	const text = shareTextForCity(result);
	if (typeof navigator !== 'undefined' && navigator.share) {
		try {
			await navigator.share({
				title: result.cityName,
				text,
				url
			});
			return 'shared';
		} catch (error) {
			if (error instanceof DOMException && error.name === 'AbortError') throw error;
			// A browser can expose navigator.share yet decline this invocation. Copy remains available.
		}
	}
	await copyText(`${text} ${url}`);
	return 'copied';
}

export function safeFilename(value: string): string {
	const normalized = value
		.normalize('NFKD')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 72);
	return normalized || 'fictional-city';
}
