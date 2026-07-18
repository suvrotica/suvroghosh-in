<script lang="ts">
	import { onMount } from 'svelte';
	import type p5 from 'p5';
	import type {
		UniformValue,
		VisualizationDefinition,
		VisualizationParameters
	} from '$lib/visualizations/types';
	import { renderPixelDensity, supportsWebGL } from '$lib/visualizations/webgl';

	type SketchStatus = 'loading' | 'ready' | 'webgl-unavailable' | 'error';

	type Props = {
		definition: VisualizationDefinition;
		parameters: VisualizationParameters;
		paused: boolean;
		restartToken: number;
		onstatus: (status: SketchStatus, message?: string) => void;
		ontoggle: () => void;
	};

	let { definition, parameters, paused, restartToken, onstatus, ontoggle }: Props = $props();
	let host: HTMLDivElement;
	let instance: p5 | null = null;
	let elapsed = 0;
	let pointerX = 0.5;
	let pointerY = 0.5;

	function uniformValue(value: UniformValue) {
		return Array.isArray(value) ? Array.from(value) : value;
	}

	onMount(() => {
		let disposed = false;
		let resizeObserver: ResizeObserver | null = null;
		let canvasElement: HTMLCanvasElement | null = null;
		let removeCanvasListeners = () => {};

		if (!supportsWebGL()) {
			onstatus('webgl-unavailable');
			return;
		}

		onstatus('loading');

		void (async () => {
			try {
				const { default: P5 } = await import('p5');
				if (disposed) return;

				instance = new P5((p) => {
					let shaderProgram: p5.Shader;
					let density = 1;

					p.setup = () => {
						density = renderPixelDensity();
						p.pixelDensity(density);
						const renderer = p.createCanvas(
							Math.max(1, host.clientWidth),
							Math.max(1, host.clientHeight),
							p.WEBGL
						);
						canvasElement = renderer.elt as HTMLCanvasElement;
						canvasElement.tabIndex = 0;
						canvasElement.setAttribute(
							'aria-label',
							`${definition.title}. Interactive shader. Move the focal point with a pointer, touch, or the arrow keys. Press Space to pause or start.`
						);
						p.noStroke();
						shaderProgram = p.createShader(definition.vertexSource, definition.fragmentSource);

						const updatePointer = (clientX: number, clientY: number) => {
							if (!canvasElement) return;
							const bounds = canvasElement.getBoundingClientRect();
							pointerX = Math.min(
								1,
								Math.max(0, (clientX - bounds.left) / Math.max(1, bounds.width))
							);
							pointerY = Math.min(
								1,
								Math.max(0, (clientY - bounds.top) / Math.max(1, bounds.height))
							);
							if (paused) p.redraw();
						};

						const handlePointerMove = (event: PointerEvent) =>
							updatePointer(event.clientX, event.clientY);
						const handlePointerDown = (event: PointerEvent) => {
							canvasElement?.focus();
							canvasElement?.setPointerCapture(event.pointerId);
							updatePointer(event.clientX, event.clientY);
						};
						const handleKeydown = (event: KeyboardEvent) => {
							const direction = event.shiftKey ? 0.1 : 0.035;
							if (event.key === 'ArrowLeft') pointerX -= direction;
							else if (event.key === 'ArrowRight') pointerX += direction;
							else if (event.key === 'ArrowUp') pointerY -= direction;
							else if (event.key === 'ArrowDown') pointerY += direction;
							else if (event.key === 'Home') pointerX = pointerY = 0.5;
							else if (event.key === ' ') {
								event.preventDefault();
								ontoggle();
								return;
							} else return;

							event.preventDefault();
							pointerX = Math.min(1, Math.max(0, pointerX));
							pointerY = Math.min(1, Math.max(0, pointerY));
							if (paused) p.redraw();
						};

						canvasElement.addEventListener('pointermove', handlePointerMove);
						canvasElement.addEventListener('pointerdown', handlePointerDown);
						canvasElement.addEventListener('keydown', handleKeydown);
						removeCanvasListeners = () => {
							canvasElement?.removeEventListener('pointermove', handlePointerMove);
							canvasElement?.removeEventListener('pointerdown', handlePointerDown);
							canvasElement?.removeEventListener('keydown', handleKeydown);
						};

						resizeObserver = new ResizeObserver(() => {
							const width = Math.max(1, Math.round(host.clientWidth));
							const height = Math.max(1, Math.round(host.clientHeight));
							if (p.width !== width || p.height !== height) p.resizeCanvas(width, height, true);
							if (paused) p.redraw();
						});
						resizeObserver.observe(host);
						if (paused) p.noLoop();
						onstatus('ready');
					};

					p.draw = () => {
						if (!paused) elapsed += Math.min(p.deltaTime, 50) / 1000;
						const resolution = [p.width * density, p.height * density] as const;
						const pointer = [pointerX * resolution[0], (1 - pointerY) * resolution[1]] as const;
						const uniforms = definition.uniforms({
							time: elapsed,
							resolution,
							pointer,
							parameters
						});

						for (const [name, value] of Object.entries(uniforms)) {
							shaderProgram.setUniform(name, uniformValue(value));
						}

						p.shader(shaderProgram);
						p.rect(-p.width / 2, -p.height / 2, p.width, p.height);
					};
				}, host);
			} catch (error) {
				if (disposed) return;
				onstatus(
					'error',
					error instanceof Error ? error.message : 'The p5 sketch could not be created.'
				);
			}
		})();

		return () => {
			disposed = true;
			resizeObserver?.disconnect();
			removeCanvasListeners();
			instance?.remove();
			instance = null;
		};
	});

	$effect(() => {
		if (!instance) return;
		if (paused) {
			instance.noLoop();
			instance.redraw();
		} else {
			instance.loop();
		}
	});

	$effect(() => {
		if (instance && paused && parameters) instance.redraw();
	});

	$effect(() => {
		if (restartToken >= 0) {
			elapsed = 0;
			if (instance && paused) instance.redraw();
		}
	});
</script>

<div bind:this={host} class="p5-host relative h-full w-full bg-neutral-950"></div>

<style>
	.p5-host :global(canvas) {
		display: block;
		width: 100% !important;
		height: 100% !important;
		touch-action: none;
	}

	.p5-host :global(canvas:focus-visible) {
		outline: 2px solid white;
		outline-offset: -3px;
	}
</style>
