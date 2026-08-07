import type { FloatFramebufferFormat } from './capabilities';

export interface FloatTextureTarget {
	readonly texture: WebGLTexture;
	readonly framebuffer: WebGLFramebuffer;
}

const uniformCache = new WeakMap<WebGLProgram, Map<string, WebGLUniformLocation>>();

export function createProgram(
	gl: WebGL2RenderingContext,
	vertexSource: string,
	fragmentSource: string,
	label: string
): WebGLProgram {
	const vertex = compileShader(gl, gl.VERTEX_SHADER, vertexSource, `${label} vertex shader`);
	let fragment: WebGLShader;
	try {
		fragment = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource, `${label} fragment shader`);
	} catch (error) {
		gl.deleteShader(vertex);
		throw error;
	}
	const program = gl.createProgram();
	if (!program) {
		gl.deleteShader(vertex);
		gl.deleteShader(fragment);
		throw new Error(`Could not allocate the ${label} WebGL program.`);
	}

	try {
		gl.attachShader(program, vertex);
		gl.attachShader(program, fragment);
		gl.linkProgram(program);
		if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
			throw new Error(
				`${label} program link failed:\n${gl.getProgramInfoLog(program) ?? 'No link log.'}`
			);
		}
		return program;
	} catch (error) {
		gl.deleteProgram(program);
		throw error;
	} finally {
		gl.deleteShader(vertex);
		gl.deleteShader(fragment);
	}
}

export function createFloatTextureTarget(
	gl: WebGL2RenderingContext,
	format: FloatFramebufferFormat,
	size: number,
	data: Float32Array | null = null
): FloatTextureTarget {
	const texture = gl.createTexture();
	const framebuffer = gl.createFramebuffer();
	if (!texture || !framebuffer) {
		if (texture) gl.deleteTexture(texture);
		if (framebuffer) gl.deleteFramebuffer(framebuffer);
		throw new Error('Could not allocate a floating-point reaction–diffusion target.');
	}

	try {
		gl.bindTexture(gl.TEXTURE_2D, texture);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		gl.texImage2D(
			gl.TEXTURE_2D,
			0,
			format.internalFormat,
			size,
			size,
			0,
			gl.RGBA,
			format.uploadType,
			data
		);

		gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
		gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
		gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
		if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
			throw new Error(`The ${format.label} reaction–diffusion framebuffer is incomplete.`);
		}
		return { texture, framebuffer };
	} catch (error) {
		gl.deleteFramebuffer(framebuffer);
		gl.deleteTexture(texture);
		throw error;
	} finally {
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		gl.bindTexture(gl.TEXTURE_2D, null);
	}
}

export function deleteFloatTextureTarget(
	gl: WebGL2RenderingContext,
	target: FloatTextureTarget | null
): void {
	if (!target) return;
	gl.deleteFramebuffer(target.framebuffer);
	gl.deleteTexture(target.texture);
}

export function requiredUniform(
	gl: WebGL2RenderingContext,
	program: WebGLProgram,
	name: string
): WebGLUniformLocation {
	const cached = uniformCache.get(program)?.get(name);
	if (cached) return cached;
	const location = gl.getUniformLocation(program, name);
	if (location === null) throw new Error(`Required WebGL uniform ${name} is unavailable.`);
	const programCache = uniformCache.get(program) ?? new Map<string, WebGLUniformLocation>();
	programCache.set(name, location);
	uniformCache.set(program, programCache);
	return location;
}

function compileShader(
	gl: WebGL2RenderingContext,
	type: number,
	source: string,
	label: string
): WebGLShader {
	const shader = gl.createShader(type);
	if (!shader) throw new Error(`Could not allocate the ${label}.`);
	gl.shaderSource(shader, source);
	gl.compileShader(shader);
	if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
		const log = gl.getShaderInfoLog(shader) ?? 'No compiler log.';
		gl.deleteShader(shader);
		throw new Error(`${label} compilation failed:\n${log}`);
	}
	return shader;
}
