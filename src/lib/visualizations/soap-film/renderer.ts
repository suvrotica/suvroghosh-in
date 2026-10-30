import fragmentSource from './fragment.glsl?raw';
import { createColourLut } from './optics';

export type SoapFilmState = {
	/** Mean over the whole spherical bubble in flowing mode; uniform otherwise. */
	thickness: number;
	/** Camera orbit about the sphere's vertical axis, in degrees. */
	angle: number;
	flowing: boolean;
	/** Active animation time in seconds, independent of wall-clock time. */
	time: number;
};

export type SoapFilmRenderer = {
	render: (state: SoapFilmState) => void;
	destroy: () => void;
};

const vertexSource = `attribute vec2 a_position;
void main() { gl_Position = vec4(a_position, 0.0, 1.0); }`;

/** Browser-only, demand-driven renderer. The caller owns size, time and RAF. */
export function createSoapFilmRenderer(canvas: HTMLCanvasElement): SoapFilmRenderer {
	const context = canvas.getContext('webgl', {
		alpha: false,
		antialias: false,
		depth: false,
		stencil: false,
		preserveDrawingBuffer: false,
		powerPreference: 'low-power'
	});
	if (!context) throw new Error('This browser could not start WebGL.');
	const gl = context;
	let vertex: WebGLShader | null = null;
	let fragment: WebGLShader | null = null;
	let program: WebGLProgram | null = null;
	let buffer: WebGLBuffer | null = null;
	let texture: WebGLTexture | null = null;
	let disposed = false;

	function compile(type: number, source: string) {
		const shader = gl.createShader(type);
		if (!shader) throw new Error('The browser could not allocate a shader.');
		gl.shaderSource(shader, source);
		gl.compileShader(shader);
		if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
			const message = gl.getShaderInfoLog(shader) ?? 'Shader compilation failed.';
			gl.deleteShader(shader);
			throw new Error(message);
		}
		return shader;
	}

	function destroy() {
		if (disposed) return;
		disposed = true;
		if (texture) gl.deleteTexture(texture);
		if (buffer) gl.deleteBuffer(buffer);
		if (program) gl.deleteProgram(program);
		if (vertex) gl.deleteShader(vertex);
		if (fragment) gl.deleteShader(fragment);
		gl.getExtension('WEBGL_lose_context')?.loseContext();
	}

	try {
		vertex = compile(gl.VERTEX_SHADER, vertexSource);
		fragment = compile(gl.FRAGMENT_SHADER, fragmentSource);
		program = gl.createProgram();
		if (!program) throw new Error('The browser could not allocate a shader program.');
		gl.attachShader(program, vertex);
		gl.attachShader(program, fragment);
		gl.linkProgram(program);
		if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
			throw new Error(gl.getProgramInfoLog(program) ?? 'The shader could not be linked.');
		}
		buffer = gl.createBuffer();
		texture = gl.createTexture();
		if (!buffer || !texture) throw new Error('The browser could not allocate rendering resources.');
		gl.useProgram(program);
		gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
		const position = gl.getAttribLocation(program, 'a_position');
		gl.enableVertexAttribArray(position);
		gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, texture);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
		const lut = createColourLut();
		gl.texImage2D(
			gl.TEXTURE_2D,
			0,
			gl.RGBA,
			lut.width,
			lut.height,
			0,
			gl.RGBA,
			gl.UNSIGNED_BYTE,
			lut.data
		);
		gl.uniform1i(gl.getUniformLocation(program, 'u_colour'), 0);
		gl.uniform2f(gl.getUniformLocation(program, 'u_lutSize'), lut.width, lut.height);
		gl.uniform2f(
			gl.getUniformLocation(program, 'u_lutBounds'),
			lut.maxThicknessNm,
			lut.maxAngleDeg
		);
		const resolution = gl.getUniformLocation(program, 'u_resolution');
		const thickness = gl.getUniformLocation(program, 'u_thickness');
		const angle = gl.getUniformLocation(program, 'u_angle');
		const flowing = gl.getUniformLocation(program, 'u_flowing');
		const time = gl.getUniformLocation(program, 'u_time');
		return {
			render(state) {
				if (disposed || gl.isContextLost()) return;
				gl.viewport(0, 0, canvas.width, canvas.height);
				gl.useProgram(program);
				gl.uniform2f(resolution, canvas.width, canvas.height);
				gl.uniform1f(
					thickness,
					Math.min(1200, Math.max(0, Number.isFinite(state.thickness) ? state.thickness : 480))
				);
				gl.uniform1f(
					angle,
					Math.min(65, Math.max(0, Number.isFinite(state.angle) ? state.angle : 12))
				);
				gl.uniform1f(flowing, state.flowing ? 1 : 0);
				gl.uniform1f(time, Number.isFinite(state.time) ? state.time % 100000 : 0);
				gl.drawArrays(gl.TRIANGLES, 0, 3);
			},
			destroy
		};
	} catch (error) {
		destroy();
		throw error;
	}
}
