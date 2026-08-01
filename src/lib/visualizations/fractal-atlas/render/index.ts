import { Canvas2DFractalRenderer, type Canvas2DRendererCallbacks } from './cpu';
import { WebGLFractalRenderer, type WebGLFractalRendererCallbacks } from './webgl';

export * from './cpu';
export * from './math';
export * from './palette';
export * from './quality';
export * from './shaders';
export * from './webgl';

export type DemandFractalRenderer = WebGLFractalRenderer | Canvas2DFractalRenderer;

export interface CreateFractalRendererOptions {
	forceCpu?: boolean;
	respectWebglQueryFlag?: boolean;
}

export type FractalRendererCallbacks = WebGLFractalRendererCallbacks & Canvas2DRendererCallbacks;

/**
 * Uses WebGL2 when available and acquires Canvas 2D only if no GPU context was
 * created. If a live WebGL context is lost later, the WebGL renderer preserves
 * state and rebuilds itself on the browser's restoration event.
 */
export function createFractalRenderer(
	canvas: HTMLCanvasElement,
	callbacks: FractalRendererCallbacks = {},
	options: CreateFractalRendererOptions = {}
): DemandFractalRenderer {
	const webglDisabledByQuery =
		(options.respectWebglQueryFlag ?? true) &&
		typeof window !== 'undefined' &&
		new URLSearchParams(window.location.search).get('webgl') === 'off';
	let webglFailure: unknown;
	if (!options.forceCpu && !webglDisabledByQuery) {
		try {
			return new WebGLFractalRenderer(canvas, callbacks);
		} catch (error) {
			webglFailure = error;
			callbacks.onStatus?.(
				`${error instanceof Error ? error.message : 'WebGL2 is unavailable.'} Using the bounded Canvas 2D renderer.`
			);
		}
	}
	try {
		return new Canvas2DFractalRenderer(canvas, callbacks);
	} catch (error) {
		if (webglFailure) {
			throw new Error(
				`${webglFailure instanceof Error ? webglFailure.message : 'WebGL2 initialisation failed.'} Canvas 2D could not be acquired on the same canvas after a partial WebGL initialisation; use a separate fallback canvas.`,
				{ cause: error }
			);
		}
		throw error;
	}
}
