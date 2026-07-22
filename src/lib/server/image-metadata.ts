import { imageDimensionsByPath } from './generated/image-dimensions.js';

export interface ImageDimensions {
	width: number;
	height: number;
}

const localOrigin = 'https://local-image-metadata.invalid';

function normalizePublicPath(publicPath: string): string | undefined {
	if (!publicPath.startsWith('/') || publicPath.startsWith('//')) return undefined;

	let url: URL;
	try {
		url = new URL(publicPath, localOrigin);
	} catch {
		return undefined;
	}
	if (url.origin !== localOrigin) return undefined;

	try {
		return url.pathname
			.split('/')
			.map((segment) => encodeURIComponent(decodeURIComponent(segment)))
			.join('/');
	} catch {
		return undefined;
	}
}

export function getImageDimensions(publicPath?: string): ImageDimensions | undefined {
	if (!publicPath) return undefined;
	const normalizedPath = normalizePublicPath(publicPath);
	if (!normalizedPath) return undefined;
	const dimensions = imageDimensionsByPath[normalizedPath];
	if (!dimensions) return undefined;
	return { width: dimensions[0], height: dimensions[1] };
}
