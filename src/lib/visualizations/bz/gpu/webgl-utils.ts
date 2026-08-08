import type { BZFloatFramebufferFormat } from './capabilities';

export interface BZFloatTextureTarget {
	readonly texture: WebGLTexture;
	readonly framebuffer: WebGLFramebuffer;
}

const uniformCache = new WeakMap<WebGLProgram, Map<string, WebGLUniformLocation>>();

export function createBZProgram(
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
			const log = gl.getProgramInfoLog(program) ?? 'No linker diagnostic was supplied.';
			throw new Error(`${label} program link failed:\n${log}`);
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

export function createBZFloatTextureTarget(
	gl: WebGL2RenderingContext,
	format: BZFloatFramebufferFormat,
	size: number,
	data: Float32Array | null = null
): BZFloatTextureTarget {
	const texture = gl.createTexture();
	const framebuffer = gl.createFramebuffer();
	if (!texture || !framebuffer) {
		if (texture) gl.deleteTexture(texture);
		if (framebuffer) gl.deleteFramebuffer(framebuffer);
		throw new Error('Could not allocate a BZ floating-point texture target.');
	}
	const previousFramebuffer = gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
	const previousTexture = gl.getParameter(gl.TEXTURE_BINDING_2D) as WebGLTexture | null;
	const previousUnpackBuffer = gl.getParameter(
		gl.PIXEL_UNPACK_BUFFER_BINDING
	) as WebGLBuffer | null;

	try {
		drainErrors(gl);
		gl.bindTexture(gl.TEXTURE_2D, texture);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_BASE_LEVEL, 0);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAX_LEVEL, 0);
		gl.bindBuffer(gl.PIXEL_UNPACK_BUFFER, null);
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
		const allocationError = gl.getError();
		if (allocationError !== gl.NO_ERROR) {
			throw new Error(
				`${format.label} texture allocation failed with WebGL error 0x${allocationError.toString(16)}.`
			);
		}

		gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
		gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
		gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
		if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
			throw new Error(`The ${format.label} BZ framebuffer is incomplete.`);
		}
		return { texture, framebuffer };
	} catch (error) {
		gl.deleteFramebuffer(framebuffer);
		gl.deleteTexture(texture);
		throw error;
	} finally {
		gl.bindBuffer(gl.PIXEL_UNPACK_BUFFER, previousUnpackBuffer);
		gl.bindFramebuffer(gl.FRAMEBUFFER, previousFramebuffer);
		gl.bindTexture(gl.TEXTURE_2D, previousTexture);
	}
}

export function deleteBZFloatTextureTarget(
	gl: WebGL2RenderingContext,
	target: BZFloatTextureTarget | null
): void {
	if (!target) return;
	gl.deleteFramebuffer(target.framebuffer);
	gl.deleteTexture(target.texture);
}

export function requiredBZUniform(
	gl: WebGL2RenderingContext,
	program: WebGLProgram,
	name: string
): WebGLUniformLocation {
	const existing = uniformCache.get(program)?.get(name);
	if (existing) return existing;
	const location = gl.getUniformLocation(program, name);
	if (location === null) throw new Error(`Required BZ shader uniform ${name} is unavailable.`);
	const programUniforms = uniformCache.get(program) ?? new Map<string, WebGLUniformLocation>();
	programUniforms.set(name, location);
	uniformCache.set(program, programUniforms);
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
		const log = gl.getShaderInfoLog(shader) ?? 'No compiler diagnostic was supplied.';
		const numberedSource = source
			.split(/\r?\n/u)
			.map((line, index) => `${String(index + 1).padStart(4, ' ')} | ${line}`)
			.join('\n');
		gl.deleteShader(shader);
		throw new Error(
			`${label} compilation failed:\n${log}\n--- numbered source ---\n${numberedSource}`
		);
	}
	return shader;
}

function drainErrors(gl: WebGL2RenderingContext): void {
	for (let count = 0; count < 16 && gl.getError() !== gl.NO_ERROR; count += 1) {
		// Attribute subsequent allocation errors only to this allocation.
	}
}
