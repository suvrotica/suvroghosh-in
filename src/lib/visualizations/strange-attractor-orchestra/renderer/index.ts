import { createCanvasRenderer } from './canvas-renderer';
import { createWebGLRenderer, OrchestraWebGLInitializationError } from './webgl-renderer';
import type { OrchestraRenderer, OrchestraRendererOptions } from './types';

export * from './quality';
export * from './render-packet';
export * from './renderer-interface';
export * from './shader-sources';
export { OrchestraCanvasRenderer, createCanvasRenderer } from './canvas-renderer';
export { OrchestraWebGLRenderer, createWebGLRenderer } from './webgl-renderer';

export type OrchestraRendererFactoryOptions = OrchestraRendererOptions &
	Readonly<{
		mode?: 'auto' | 'webgl2' | 'canvas2d';
		onFallback?: (message: string) => void;
	}>;

/**
 * Browser-only factory. Importing this module is SSR-safe; canvas/context access occurs only when
 * the host calls the function. If WebGL2 has already claimed a canvas and shader setup fails, some
 * browsers require the host to provide a fresh canvas before a 2D fallback can be created.
 */
export function createOrchestraRenderer(
	canvas: HTMLCanvasElement,
	options: OrchestraRendererFactoryOptions = {}
): OrchestraRenderer {
	if (options.mode === 'canvas2d') return createCanvasRenderer(canvas, options);
	try {
		return createWebGLRenderer(canvas, options);
	} catch (error) {
		if (options.mode === 'webgl2') throw error;
		if (error instanceof OrchestraWebGLInitializationError && error.contextClaimed) {
			// A canvas cannot switch context modes after getContext('webgl2') succeeds. Preserve the
			// actionable shader/resource error instead of masking it with a guaranteed 2D failure.
			throw error;
		}
		const message =
			error instanceof Error
				? `WebGL2 unavailable; using Canvas 2D. ${error.message}`
				: 'WebGL2 unavailable; using Canvas 2D.';
		options.onFallback?.(message);
		return createCanvasRenderer(canvas, options);
	}
}
