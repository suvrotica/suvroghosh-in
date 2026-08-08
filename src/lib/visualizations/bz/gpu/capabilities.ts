export type BZFloatFramebufferFormatId = 'rgba16f' | 'rgba32f';

export interface BZFloatFramebufferFormat {
	readonly id: BZFloatFramebufferFormatId;
	readonly label: 'RGBA16F' | 'RGBA32F';
	readonly internalFormat: number;
	readonly uploadType: number;
	readonly readType: number;
	readonly bytesPerComponent: 2 | 4;
}

export interface BZFloatFramebufferAttempt {
	readonly id: BZFloatFramebufferFormatId;
	readonly label: 'RGBA16F' | 'RGBA32F';
	readonly framebufferComplete: boolean;
	readonly writeReadPassed: boolean;
	readonly reason: string;
}

export interface BZShaderHighpCapabilities {
	readonly supported: boolean;
	readonly precisionBits: number;
	readonly rangeMin: number;
	readonly rangeMax: number;
}

export interface BZGpuCapabilities {
	readonly webgl2: true;
	readonly colorBufferFloatExtension: boolean;
	readonly selectedFormat: BZFloatFramebufferFormat | null;
	readonly attempts: readonly BZFloatFramebufferAttempt[];
	readonly maximumTextureSize: number;
	readonly fragmentHighp: BZShaderHighpCapabilities;
	readonly renderer: string;
	readonly message: string;
}

export interface BZGpuContextResult {
	readonly gl: WebGL2RenderingContext;
	readonly capabilities: BZGpuCapabilities;
}

const PROBE_VALUE = new Float32Array([0.1875, -0.4375, 0.6875, 1]);

/**
 * Creates the float-only scientific compute context. There is deliberately no
 * normalized-byte fallback: callers should use the CPU solver when the probe
 * cannot prove a writable and readable floating-point attachment.
 */
export function createBZGpuContext(
	canvas: HTMLCanvasElement,
	attributes: WebGLContextAttributes = {}
): BZGpuContextResult {
	const gl = canvas.getContext('webgl2', {
		alpha: false,
		antialias: false,
		depth: false,
		stencil: false,
		preserveDrawingBuffer: false,
		powerPreference: 'high-performance',
		failIfMajorPerformanceCaveat: false,
		...attributes
	});
	if (!gl) {
		throw new Error('WebGL2 is unavailable. Use the BZ CPU reference solver on this device.');
	}
	return { gl, capabilities: probeBZGpuCapabilities(gl) };
}

/** Probes RGBA32F first, then RGBA16F only as a measured compatibility fallback. */
export function probeBZGpuCapabilities(gl: WebGL2RenderingContext): BZGpuCapabilities {
	const renderer = rendererString(gl);
	const maximumTextureSize = Number(gl.getParameter(gl.MAX_TEXTURE_SIZE));
	const highpFormat = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);
	const fragmentHighp: BZShaderHighpCapabilities = {
		supported: Boolean(highpFormat && highpFormat.precision > 0),
		precisionBits: highpFormat?.precision ?? 0,
		rangeMin: highpFormat?.rangeMin ?? 0,
		rangeMax: highpFormat?.rangeMax ?? 0
	};
	const extension = gl.getExtension('EXT_color_buffer_float');
	if (!extension) {
		return {
			webgl2: true,
			colorBufferFloatExtension: false,
			selectedFormat: null,
			attempts: [],
			maximumTextureSize,
			fragmentHighp,
			renderer,
			message: 'EXT_color_buffer_float is unavailable. The BZ CPU reference solver is required.'
		};
	}
	if (!fragmentHighp.supported) {
		return {
			webgl2: true,
			colorBufferFloatExtension: true,
			selectedFormat: null,
			attempts: [],
			maximumTextureSize,
			fragmentHighp,
			renderer,
			message:
				'High-precision fragment arithmetic is unavailable. The BZ CPU reference solver is required.'
		};
	}

	const formats: readonly BZFloatFramebufferFormat[] = [
		{
			id: 'rgba32f',
			label: 'RGBA32F',
			internalFormat: gl.RGBA32F,
			uploadType: gl.FLOAT,
			readType: gl.FLOAT,
			bytesPerComponent: 4
		},
		{
			id: 'rgba16f',
			label: 'RGBA16F',
			internalFormat: gl.RGBA16F,
			uploadType: gl.FLOAT,
			readType: gl.FLOAT,
			bytesPerComponent: 2
		}
	];
	const attempts = formats.map((format) => probeFormat(gl, format));
	const selectedFormat = formats.find((_, index) => attempts[index].writeReadPassed) ?? null;
	return {
		webgl2: true,
		colorBufferFloatExtension: true,
		selectedFormat,
		attempts,
		maximumTextureSize,
		fragmentHighp,
		renderer,
		message: selectedFormat
			? `${selectedFormat.label} passed framebuffer completeness and float write/read tests.`
			: 'Neither RGBA32F nor RGBA16F passed the float framebuffer test. Use the BZ CPU solver.'
	};
}

function rendererString(gl: WebGL2RenderingContext): string {
	const debug = gl.getExtension('WEBGL_debug_renderer_info');
	if (debug) {
		const unmasked = gl.getParameter(debug.UNMASKED_RENDERER_WEBGL);
		if (unmasked) return String(unmasked);
	}
	return String(gl.getParameter(gl.RENDERER) ?? 'WebGL2 renderer');
}

function probeFormat(
	gl: WebGL2RenderingContext,
	format: BZFloatFramebufferFormat
): BZFloatFramebufferAttempt {
	const previousActiveTexture = Number(gl.getParameter(gl.ACTIVE_TEXTURE));
	gl.activeTexture(gl.TEXTURE0);
	const previousFramebuffer = gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
	const previousTexture0 = gl.getParameter(gl.TEXTURE_BINDING_2D) as WebGLTexture | null;
	const previousPackBuffer = gl.getParameter(gl.PIXEL_PACK_BUFFER_BINDING) as WebGLBuffer | null;
	const previousUnpackBuffer = gl.getParameter(
		gl.PIXEL_UNPACK_BUFFER_BINDING
	) as WebGLBuffer | null;
	const previousScissorEnabled = gl.isEnabled(gl.SCISSOR_TEST);
	const previousColourMask = gl.getParameter(gl.COLOR_WRITEMASK) as readonly boolean[];
	const texture = gl.createTexture();
	const framebuffer = gl.createFramebuffer();
	let framebufferComplete = false;
	let writeReadPassed = false;
	let reason = 'The probe could not allocate WebGL resources.';

	try {
		if (!texture || !framebuffer) return attempt(format, framebufferComplete, false, reason);
		drainErrors(gl);
		gl.activeTexture(gl.TEXTURE0);
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
			1,
			1,
			0,
			gl.RGBA,
			format.uploadType,
			null
		);
		gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
		gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
		gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
		framebufferComplete = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
		if (!framebufferComplete) {
			reason = 'Framebuffer completeness check failed.';
			return attempt(format, framebufferComplete, false, reason);
		}

		gl.disable(gl.SCISSOR_TEST);
		gl.colorMask(true, true, true, true);
		gl.clearBufferfv(gl.COLOR, 0, PROBE_VALUE);
		gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
		const result = new Float32Array(4);
		gl.readPixels(0, 0, 1, 1, gl.RGBA, format.readType, result);
		const error = gl.getError();
		if (error !== gl.NO_ERROR) {
			reason = `Float readback failed with WebGL error 0x${error.toString(16)}.`;
			return attempt(format, framebufferComplete, false, reason);
		}

		const tolerance = format.id === 'rgba16f' ? 0.002 : 0.000_002;
		writeReadPassed = result.every(
			(value, index) => Number.isFinite(value) && Math.abs(value - PROBE_VALUE[index]) <= tolerance
		);
		reason = writeReadPassed
			? 'The attachment completed and preserved a known signed float value.'
			: `Readback did not preserve the probe value (received ${[...result].join(', ')}).`;
	} catch (error) {
		reason = error instanceof Error ? error.message : 'Unknown float framebuffer probe failure.';
	} finally {
		gl.bindBuffer(gl.PIXEL_PACK_BUFFER, previousPackBuffer);
		gl.bindBuffer(gl.PIXEL_UNPACK_BUFFER, previousUnpackBuffer);
		gl.bindFramebuffer(gl.FRAMEBUFFER, previousFramebuffer);
		gl.colorMask(
			previousColourMask[0],
			previousColourMask[1],
			previousColourMask[2],
			previousColourMask[3]
		);
		if (previousScissorEnabled) gl.enable(gl.SCISSOR_TEST);
		else gl.disable(gl.SCISSOR_TEST);
		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, previousTexture0);
		gl.activeTexture(previousActiveTexture);
		if (framebuffer) gl.deleteFramebuffer(framebuffer);
		if (texture) gl.deleteTexture(texture);
	}

	return attempt(format, framebufferComplete, writeReadPassed, reason);
}

function attempt(
	format: BZFloatFramebufferFormat,
	framebufferComplete: boolean,
	writeReadPassed: boolean,
	reason: string
): BZFloatFramebufferAttempt {
	return {
		id: format.id,
		label: format.label,
		framebufferComplete,
		writeReadPassed,
		reason
	};
}

function drainErrors(gl: WebGL2RenderingContext): void {
	for (let count = 0; count < 16 && gl.getError() !== gl.NO_ERROR; count += 1) {
		// Discard errors from unrelated probes before attributing one to this feature.
	}
}
