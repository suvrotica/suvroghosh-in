<script lang="ts">
	import { onMount } from 'svelte';
	import { renderPixelDensity } from '$lib/visualizations/webgl';

	type Props = {
		fragmentSource: string;
		title: string;
		onerror?: (message: string) => void;
	};

	let { fragmentSource, title, onerror }: Props = $props();
	let canvas: HTMLCanvasElement;
	let host: HTMLDivElement;
	let status = $state('Loading shader preview…');

	const vertexSource = `
attribute vec2 a_position;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

	onMount(() => {
		const context = canvas.getContext('webgl', {
			alpha: false,
			antialias: false,
			depth: false,
			powerPreference: 'low-power'
		});

		if (!context) {
			status = 'WebGL is unavailable.';
			onerror?.(status);
			return;
		}
		const gl: WebGLRenderingContext = context;

		function compileShader(type: number, source: string) {
			const shader = gl.createShader(type);
			if (!shader) throw new Error('The browser could not create a shader.');
			gl.shaderSource(shader, source);
			gl.compileShader(shader);
			if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
				const detail = gl.getShaderInfoLog(shader) ?? 'Unknown shader compiler error.';
				gl.deleteShader(shader);
				throw new Error(detail);
			}
			return shader;
		}

		let vertexShader: WebGLShader | null = null;
		let fragmentShader: WebGLShader | null = null;
		let program: WebGLProgram | null = null;
		let buffer: WebGLBuffer | null = null;
		let animationFrame = 0;
		let previousFrame = performance.now();
		let elapsed = 0;
		let pointerX = 0.5;
		let pointerY = 0.5;
		let resizeObserver: ResizeObserver | null = null;
		const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

		try {
			vertexShader = compileShader(gl.VERTEX_SHADER, vertexSource);
			fragmentShader = compileShader(gl.FRAGMENT_SHADER, fragmentSource);
			program = gl.createProgram();
			if (!program) throw new Error('The browser could not create a shader program.');
			gl.attachShader(program, vertexShader);
			gl.attachShader(program, fragmentShader);
			gl.linkProgram(program);
			if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
				throw new Error(gl.getProgramInfoLog(program) ?? 'The shader program could not be linked.');
			}

			buffer = gl.createBuffer();
			gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
			gl.bufferData(
				gl.ARRAY_BUFFER,
				new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
				gl.STATIC_DRAW
			);
			gl.useProgram(program);
			const position = gl.getAttribLocation(program, 'a_position');
			gl.enableVertexAttribArray(position);
			gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
			status = 'Shader preview ready. Move the pointer, touch the canvas, or use arrow keys.';
		} catch (error) {
			status = error instanceof Error ? error.message : 'The shader preview could not be created.';
			onerror?.(status);
			return cleanup;
		}

		function resize() {
			const density = renderPixelDensity();
			const width = Math.max(1, Math.round(host.clientWidth * density));
			const height = Math.max(1, Math.round(host.clientHeight * density));
			if (canvas.width !== width || canvas.height !== height) {
				canvas.width = width;
				canvas.height = height;
			}
		}

		function draw(now: number) {
			if (!program) return;
			resize();
			const delta = Math.min(now - previousFrame, 50);
			previousFrame = now;
			if (!reducedMotion.matches && document.visibilityState === 'visible') elapsed += delta / 1000;

			gl.viewport(0, 0, canvas.width, canvas.height);
			gl.useProgram(program);
			const resolution = gl.getUniformLocation(program, 'u_resolution');
			const mouse = gl.getUniformLocation(program, 'u_mouse');
			const time = gl.getUniformLocation(program, 'u_time');
			if (resolution) gl.uniform2f(resolution, canvas.width, canvas.height);
			if (mouse) gl.uniform2f(mouse, pointerX * canvas.width, (1 - pointerY) * canvas.height);
			if (time) gl.uniform1f(time, elapsed);
			gl.drawArrays(gl.TRIANGLES, 0, 6);

			if (!reducedMotion.matches) animationFrame = requestAnimationFrame(draw);
		}

		function updatePointer(clientX: number, clientY: number) {
			const bounds = canvas.getBoundingClientRect();
			pointerX = Math.min(1, Math.max(0, (clientX - bounds.left) / Math.max(1, bounds.width)));
			pointerY = Math.min(1, Math.max(0, (clientY - bounds.top) / Math.max(1, bounds.height)));
			if (reducedMotion.matches) draw(performance.now());
		}

		function handlePointer(event: PointerEvent) {
			updatePointer(event.clientX, event.clientY);
		}

		function handlePointerDown(event: PointerEvent) {
			canvas.focus();
			canvas.setPointerCapture(event.pointerId);
			updatePointer(event.clientX, event.clientY);
		}

		function handleKeydown(event: KeyboardEvent) {
			const direction = event.shiftKey ? 0.1 : 0.035;
			if (event.key === 'ArrowLeft') pointerX -= direction;
			else if (event.key === 'ArrowRight') pointerX += direction;
			else if (event.key === 'ArrowUp') pointerY -= direction;
			else if (event.key === 'ArrowDown') pointerY += direction;
			else if (event.key === 'Home') pointerX = pointerY = 0.5;
			else return;

			event.preventDefault();
			pointerX = Math.min(1, Math.max(0, pointerX));
			pointerY = Math.min(1, Math.max(0, pointerY));
			if (reducedMotion.matches) draw(performance.now());
		}

		function handleMotionChange() {
			cancelAnimationFrame(animationFrame);
			previousFrame = performance.now();
			animationFrame = requestAnimationFrame(draw);
		}

		function cleanup() {
			cancelAnimationFrame(animationFrame);
			resizeObserver?.disconnect();
			canvas.removeEventListener('pointermove', handlePointer);
			canvas.removeEventListener('pointerdown', handlePointerDown);
			canvas.removeEventListener('keydown', handleKeydown);
			reducedMotion.removeEventListener('change', handleMotionChange);
			if (buffer) gl.deleteBuffer(buffer);
			if (program) gl.deleteProgram(program);
			if (vertexShader) gl.deleteShader(vertexShader);
			if (fragmentShader) gl.deleteShader(fragmentShader);
			gl.getExtension('WEBGL_lose_context')?.loseContext();
		}

		canvas.addEventListener('pointermove', handlePointer);
		canvas.addEventListener('pointerdown', handlePointerDown);
		canvas.addEventListener('keydown', handleKeydown);
		reducedMotion.addEventListener('change', handleMotionChange);
		resizeObserver = new ResizeObserver(() => {
			resize();
			if (reducedMotion.matches) draw(performance.now());
		});
		resizeObserver.observe(host);
		animationFrame = requestAnimationFrame(draw);

		return cleanup;
	});
</script>

<div
	bind:this={host}
	class="relative aspect-video min-h-52 overflow-hidden bg-neutral-950 sm:min-h-64"
>
	<canvas
		bind:this={canvas}
		tabindex="0"
		aria-label={`${title}. Interactive shader preview. Use pointer, touch, or arrow keys to move the focal point.`}
		class="block h-full w-full touch-none focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-white"
		>Interactive shader preview for {title}.</canvas
	>
	<span class="sr-only" aria-live="polite">{status}</span>
</div>
