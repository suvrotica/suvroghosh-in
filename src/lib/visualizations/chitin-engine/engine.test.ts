import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const rendererHarness = vi.hoisted(() => ({
	instances: [] as Array<{
		id: number;
		canvas: HTMLCanvasElement;
		disposed: boolean;
		options: {
			onContextLost?: () => void;
			onContextRestored?: () => void;
			onError?: (error: Error) => void;
		};
	}>,
	failExportRender: false,
	fallbackFrames: vi.fn()
}));

vi.mock('./webgl-renderer', async (importOriginal) => {
	const actual = await importOriginal<typeof import('./webgl-renderer')>();
	class TestWebGLRenderer {
		readonly canvas: HTMLCanvasElement;
		readonly id: number;
		readonly options: (typeof rendererHarness.instances)[number]['options'];
		isContextLost = false;

		constructor(
			canvas: HTMLCanvasElement,
			options: (typeof rendererHarness.instances)[number]['options'] = {}
		) {
			this.canvas = canvas;
			this.options = options;
			this.id = rendererHarness.instances.length;
			rendererHarness.instances.push({
				id: this.id,
				canvas,
				disposed: false,
				options
			});
		}

		setSize(width: number, height: number, pixelRatio = 1): boolean {
			this.canvas.width = Math.round(width * pixelRatio);
			this.canvas.height = Math.round(height * pixelRatio);
			return true;
		}

		render(): { truncated: boolean } {
			if (rendererHarness.failExportRender && this.id > 0) {
				throw new Error('Synthetic export WebGL failure.');
			}
			return { truncated: false };
		}

		dispose(): void {
			rendererHarness.instances[this.id].disposed = true;
		}
	}
	return { ...actual, WebGLRenderer: TestWebGLRenderer };
});

vi.mock('./fallback-renderer', () => ({
	FallbackRenderer: class TestFallbackRenderer {
		readonly canvas: HTMLCanvasElement;
		constructor(canvas: HTMLCanvasElement) {
			this.canvas = canvas;
		}
		setSize(): boolean {
			return true;
		}
		render(): void {}
		dispose(): void {
			this.canvas.width = 1;
			this.canvas.height = 1;
		}
	},
	renderFallbackFrame: rendererHarness.fallbackFrames
}));

import { ChitinEngine, resolveViewportAllocation } from './engine';
import { DEFAULT_EXHIBIT_STATE } from './genome';

type TestCanvas = HTMLCanvasElement & { removed: boolean };

function canvasContext(): CanvasRenderingContext2D {
	return {} as CanvasRenderingContext2D;
}

function createTestCanvas(): TestCanvas {
	const listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();
	const context = canvasContext();
	const canvas = {
		width: 300,
		height: 150,
		className: '',
		dataset: {} as DOMStringMap,
		style: {} as CSSStyleDeclaration,
		removed: false,
		setAttribute: vi.fn(),
		addEventListener: vi.fn((type: string, listener: EventListenerOrEventListenerObject) => {
			const values = listeners.get(type) ?? new Set();
			values.add(listener);
			listeners.set(type, values);
		}),
		removeEventListener: vi.fn((type: string, listener: EventListenerOrEventListenerObject) => {
			listeners.get(type)?.delete(listener);
		}),
		getContext: vi.fn((kind: string) => (kind === '2d' ? context : {})),
		getBoundingClientRect: vi.fn(() => ({
			x: 0,
			y: 0,
			left: 0,
			top: 0,
			right: 800,
			bottom: 600,
			width: 800,
			height: 600,
			toJSON: () => ({})
		})),
		setPointerCapture: vi.fn(),
		releasePointerCapture: vi.fn(),
		hasPointerCapture: vi.fn(() => true),
		replaceWith: vi.fn(),
		remove: vi.fn(() => {
			canvas.removed = true;
		}),
		toBlob: vi.fn((callback: BlobCallback) => {
			callback(new Blob(['png'], { type: 'image/png' }));
		})
	} as unknown as TestCanvas;
	return canvas;
}

describe('Chitin engine lifecycle', () => {
	let callbacks: Map<number, FrameRequestCallback>;
	let nextFrame: number;
	let canvases: TestCanvas[];
	let host: HTMLElement;

	beforeEach(() => {
		rendererHarness.instances.splice(0);
		rendererHarness.failExportRender = false;
		rendererHarness.fallbackFrames.mockReset();
		callbacks = new Map();
		nextFrame = 1;
		canvases = [];
		const children: TestCanvas[] = [];
		host = {
			appendChild: vi.fn((canvas: TestCanvas) => {
				children.push(canvas);
				return canvas;
			}),
			getBoundingClientRect: vi.fn(() => ({
				x: 0,
				y: 0,
				left: 0,
				top: 0,
				right: 800,
				bottom: 600,
				width: 800,
				height: 600,
				toJSON: () => ({})
			}))
		} as unknown as HTMLElement;
		vi.stubGlobal('document', {
			visibilityState: 'visible',
			createElement: vi.fn(() => {
				const canvas = createTestCanvas();
				canvases.push(canvas);
				return canvas;
			}),
			addEventListener: vi.fn(),
			removeEventListener: vi.fn()
		});
		vi.stubGlobal('window', {
			devicePixelRatio: 2,
			addEventListener: vi.fn(),
			removeEventListener: vi.fn()
		});
		vi.stubGlobal('ResizeObserver', undefined);
		vi.stubGlobal('IntersectionObserver', undefined);
		vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
			const id = nextFrame;
			nextFrame += 1;
			callbacks.set(id, callback);
			return id;
		});
		vi.stubGlobal('cancelAnimationFrame', (id: number) => {
			callbacks.delete(id);
		});
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	function flushFrame(timestamp: number): void {
		const entry = callbacks.entries().next().value as [number, FrameRequestCallback] | undefined;
		if (!entry) throw new Error('No frame was scheduled.');
		callbacks.delete(entry[0]);
		entry[1](timestamp);
	}

	it('caps backing allocations while preserving viewport aspect', () => {
		expect(resolveViewportAllocation(800, 600, 2, 2)).toEqual({
			width: 800,
			height: 600,
			pixelRatio: 2,
			backingWidth: 1_600,
			backingHeight: 1_200,
			capped: false
		});
		const huge = resolveViewportAllocation(50_000, 25_000, 3, 3);
		expect(Math.max(huge.backingWidth, huge.backingHeight)).toBeLessThanOrEqual(4_096);
		expect(huge.backingWidth * huge.backingHeight).toBeLessThanOrEqual(12_000_000);
		expect(huge.backingWidth / huge.backingHeight).toBeCloseTo(2, 2);
		expect(huge.capped).toBe(true);
	});

	it('does not spin no-op frames for paused threat or startle transitions', () => {
		const engine = new ChitinEngine({
			host,
			state: { ...DEFAULT_EXHIBIT_STATE, paused: true },
			descriptionId: 'fixture-description'
		});
		expect(callbacks.size).toBe(1);
		engine.startle();
		flushFrame(16);
		expect(callbacks.size).toBe(0);
		engine.setThreat(true);
		expect(callbacks.size).toBe(1);
		flushFrame(32);
		expect(callbacks.size).toBe(0);
		engine.destroy();
	});

	it('halts scheduling during context loss and resumes only after restoration', () => {
		const engine = new ChitinEngine({
			host,
			state: DEFAULT_EXHIBIT_STATE,
			descriptionId: 'fixture-description'
		});
		expect(callbacks.size).toBe(1);
		rendererHarness.instances[0].options.onContextLost?.();
		expect(callbacks.size).toBe(0);
		engine.startle();
		expect(callbacks.size).toBe(0);
		rendererHarness.instances[0].options.onContextRestored?.();
		expect(callbacks.size).toBe(1);
		engine.destroy();
	});

	it('uses a fresh Canvas2D canvas after WebGL export failure and releases both', async () => {
		const engine = new ChitinEngine({
			host,
			state: { ...DEFAULT_EXHIBIT_STATE, paused: true },
			descriptionId: 'fixture-description'
		});
		rendererHarness.failExportRender = true;
		const blob = await engine.exportStill({
			width: 100,
			height: 64,
			scale: 2,
			includeLabel: false
		});
		expect(blob.type).toBe('image/png');
		expect(canvases).toHaveLength(3);
		expect(rendererHarness.instances).toHaveLength(2);
		expect(rendererHarness.instances[1].disposed).toBe(true);
		expect(rendererHarness.fallbackFrames).toHaveBeenCalledOnce();
		expect(canvases[1].width).toBe(1);
		expect(canvases[1].height).toBe(1);
		expect(canvases[2].width).toBe(1);
		expect(canvases[2].height).toBe(1);
		engine.destroy();
		expect(rendererHarness.instances[0].disposed).toBe(true);
		expect(canvases[0].removed).toBe(true);
		expect(canvases[0].width).toBe(1);
		expect(canvases[0].height).toBe(1);
	});

	it('rejects invalid export dimensions before allocating another canvas', async () => {
		const engine = new ChitinEngine({
			host,
			state: DEFAULT_EXHIBIT_STATE,
			descriptionId: 'fixture-description'
		});
		await expect(engine.exportStill({ width: Number.NaN, height: 600, scale: 4 })).rejects.toThrow(
			'positive finite'
		);
		expect(canvases).toHaveLength(1);
		engine.destroy();
	});
});
