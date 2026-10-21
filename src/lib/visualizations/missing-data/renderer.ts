import type { MatrixFrame } from './types';
import { matrixColor } from './colors';
export { matrixColor, normalizeScore } from './colors';

const vertexSource = `
attribute vec2 a_position;
attribute vec2 a_local;
attribute vec3 a_color;
attribute float a_kind;
attribute float a_spread;
attribute float a_selected;
attribute float a_playing;
varying vec2 v_local;
varying vec3 v_color;
varying float v_kind;
varying float v_spread;
varying float v_selected;
varying float v_playing;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
  v_local = a_local;
  v_color = a_color;
  v_kind = a_kind;
  v_spread = a_spread;
  v_selected = a_selected;
  v_playing = a_playing;
}`;

const fragmentSource = `
precision mediump float;
varying vec2 v_local;
varying vec3 v_color;
varying float v_kind;
varying float v_spread;
varying float v_selected;
varying float v_playing;
void main() {
  vec2 p = abs(v_local);
  vec2 q = p - vec2(0.72, 0.60);
  float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
  vec3 ink = vec3(0.035, 0.060, 0.075);
  vec3 color = v_color;
  float fill = 1.0 - smoothstep(-0.025, 0.035, d);
  float glow = exp(-max(d, 0.0) * 13.0) * 0.13;
  vec3 outColor = mix(ink, color, fill * 0.82 + glow);
  if (v_kind < 0.5) {
    outColor = mix(ink, vec3(0.064, 0.091, 0.108), fill);
  } else if (v_kind > 1.5 && v_kind < 2.5) {
    vec3 violet = vec3(0.73, 0.62, 0.95);
    color = mix(color, violet, 0.68);
    outColor = mix(ink, color, fill * 0.57);
    float halo = exp(-abs(d - 0.09 - min(v_spread / 5.0, 0.23)) * 16.0);
    if (v_spread > 0.0) outColor += violet * halo * 0.24;
    float rim = 1.0 - smoothstep(0.025, 0.075, abs(d));
    outColor = mix(outColor, violet, rim * 0.72);
    // A permanent diagonal provenance mark, even when no spread was estimated.
    float mark = 1.0 - smoothstep(0.035, 0.085, abs(v_local.x + v_local.y - 0.45));
    outColor = mix(outColor, vec3(0.96, 0.88, 1.0), mark * fill * 0.66);
  } else if (v_kind > 2.5) {
    outColor = mix(ink, mix(color, vec3(0.80, 0.65, 0.31), 0.65), fill * 0.58);
    float stripes = step(0.55, fract((v_local.x + v_local.y) * 4.0));
    outColor *= 0.72 + stripes * 0.28;
  }
  if (v_playing > 0.5) outColor += vec3(0.11, 0.16, 0.14);
  if (v_selected > 0.5 && max(p.x, p.y) > 0.88) outColor = vec3(0.99, 0.91, 0.67);
  gl_FragColor = vec4(outColor, 1.0);
}`;

/** One demand-driven WebGL canvas. The playhead is a displayed-row index. */
export function createMatrixRenderer(
	canvas: HTMLCanvasElement,
	onFailure: (reason: string) => void
): { render(frame: MatrixFrame): void; dispose(): void } {
	const gl = canvas.getContext('webgl', {
		alpha: false,
		antialias: false,
		depth: false,
		powerPreference: 'low-power',
		preserveDrawingBuffer: false
	});
	if (!gl) throw new Error('WebGL is unavailable.');
	const shaders: WebGLShader[] = [];
	let program: WebGLProgram | null = null;
	let buffer: WebGLBuffer | null = null;
	let disposed = false;
	let lost = false;
	try {
		for (const [type, source] of [
			[gl.VERTEX_SHADER, vertexSource],
			[gl.FRAGMENT_SHADER, fragmentSource]
		] as const) {
			const shader = gl.createShader(type);
			if (!shader) throw new Error('Could not allocate a matrix shader.');
			shaders.push(shader);
			gl.shaderSource(shader, source);
			gl.compileShader(shader);
			if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
				throw new Error(gl.getShaderInfoLog(shader) || 'The matrix shader did not compile.');
			}
		}
		program = gl.createProgram();
		if (!program) throw new Error('Could not allocate the matrix program.');
		shaders.forEach((shader) => gl.attachShader(program!, shader));
		gl.linkProgram(program);
		if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
			throw new Error(gl.getProgramInfoLog(program) || 'The matrix program did not link.');
		}
		buffer = gl.createBuffer();
		if (!buffer) throw new Error('Could not allocate the matrix buffer.');
	} catch (error) {
		shaders.forEach((shader) => gl.deleteShader(shader));
		if (program) gl.deleteProgram(program);
		if (buffer) gl.deleteBuffer(buffer);
		throw error;
	}
	const attributes = [
		['a_position', 2],
		['a_local', 2],
		['a_color', 3],
		['a_kind', 1],
		['a_spread', 1],
		['a_selected', 1],
		['a_playing', 1]
	] as const;
	const locations = attributes.map(([name, size]) => ({
		location: gl.getAttribLocation(program!, name),
		size
	}));
	const onContextLost = (event: Event) => {
		event.preventDefault();
		lost = true;
		onFailure('The graphics context was lost. The data and controls remain available.');
	};
	canvas.addEventListener('webglcontextlost', onContextLost);

	return {
		render(frame) {
			if (disposed || lost) return;
			const { data, observed, completion, order } = frame.experiment;
			const dpr = Math.min(1.75, window.devicePixelRatio || 1);
			const width = Math.max(1, Math.round(canvas.clientWidth * dpr));
			const height = Math.max(1, Math.round(canvas.clientHeight * dpr));
			if (canvas.width !== width || canvas.height !== height) {
				canvas.width = width;
				canvas.height = height;
			}
			gl.viewport(0, 0, width, height);
			gl.clearColor(0.035, 0.06, 0.075, 1);
			gl.clear(gl.COLOR_BUFFER_BIT);
			const stride = 11;
			const vertices = new Float32Array(data.rows * data.cols * 6 * stride);
			const corners = [-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1];
			let offset = 0;
			for (let displayRow = 0; displayRow < data.rows; displayRow++) {
				const row = order[displayRow];
				for (let col = 0; col < data.cols; col++) {
					const index = row * data.cols + col;
					const missing = observed.mask[index] === 1;
					const filled = missing && !frame.reveal && Number.isFinite(completion.values[index]);
					const kind = missing ? (filled ? 2 : frame.reveal ? 3 : 0) : 1;
					const value = missing
						? filled
							? completion.values[index]
							: frame.reveal
								? data.truth[index]
								: 0
						: observed.values[index];
					const colour = matrixColor(value);
					for (let corner = 0; corner < 6; corner++) {
						const x = corners[corner * 2];
						const y = corners[corner * 2 + 1];
						vertices.set(
							[
								-1 + ((col + (x + 1) / 2) / data.cols) * 2,
								1 - ((displayRow + (y + 1) / 2) / data.rows) * 2,
								x,
								y,
								...colour.map((channel) => channel / 255),
								kind,
								filled ? (completion.spread[index] || 0) / 12 : 0,
								row === frame.selectedRow && col === frame.selectedColumn ? 1 : 0,
								displayRow === frame.playhead ? 1 : 0
							],
							offset
						);
						offset += stride;
					}
				}
			}
			gl.useProgram(program);
			gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
			gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.DYNAMIC_DRAW);
			let attributeOffset = 0;
			for (const { location, size } of locations) {
				if (location >= 0) {
					gl.enableVertexAttribArray(location);
					gl.vertexAttribPointer(location, size, gl.FLOAT, false, stride * 4, attributeOffset * 4);
				}
				attributeOffset += size;
			}
			gl.drawArrays(gl.TRIANGLES, 0, data.rows * data.cols * 6);
		},
		dispose() {
			if (disposed) return;
			disposed = true;
			canvas.removeEventListener('webglcontextlost', onContextLost);
			if (buffer) gl.deleteBuffer(buffer);
			if (program) gl.deleteProgram(program);
			shaders.forEach((shader) => gl.deleteShader(shader));
		}
	};
}
