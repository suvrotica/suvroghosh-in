export type FloatFramebufferFormatId = 'rgba16f' | 'rgba32f';

export interface FloatFramebufferFormat {
	readonly id: FloatFramebufferFormatId;
	readonly label: 'RGBA16F' | 'RGBA32F';
	readonly internalFormat: number;
	readonly uploadType: number;
	readonly readType: number;
}

export interface FloatFramebufferAttempt {
	readonly id: FloatFramebufferFormatId;
	readonly label: 'RGBA16F' | 'RGBA32F';
	readonly framebufferComplete: boolean;
	readonly writeReadPassed: boolean;
	readonly reason: string;
}

export interface ReactionDiffusionGpuCapabilities {
	readonly webgl2: true;
	readonly colorBufferFloatExtension: boolean;
	readonly selectedFormat: FloatFramebufferFormat | null;
	readonly attempts: readonly FloatFramebufferAttempt[];
	readonly renderer: string;
	readonly message: string;
}

export interface ReactionDiffusionContextResult {
	readonly gl: WebGL2RenderingContext;
	readonly capabilities: ReactionDiffusionGpuCapabilities;
}

const PROBE_VALUE = new Float32Array([0.1875, 0.4375, 0.6875, 0.9375]);

/**
 * Creates the scientific compute context and proves that a floating-point
 * attachment can actually be written and read. The solver deliberately has no
 * normalized 8-bit fallback; callers should select the CPU reference engine
 * when this function cannot produce a selected format.
 */
export function createReactionDiffusionContext(
	canvas: HTMLCanvasElement,
	attributes: WebGLContextAttributes = {}
): ReactionDiffusionContextResult {
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
		throw new Error(
			'WebGL2 is unavailable. Use the deterministic CPU reference engine for this experiment.'
		);
	}

	return { gl, capabilities: probeFloatRenderTargets(gl) };
}

/** Tests RGBA16F first, then RGBA32F, using FBO completeness plus a write/read round trip. */
export function probeFloatRenderTargets(
	gl: WebGL2RenderingContext
): ReactionDiffusionGpuCapabilities {
	const extension = gl.getExtension('EXT_color_buffer_float');
	const renderer = String(gl.getParameter(gl.RENDERER) ?? 'WebGL2 renderer');
	if (!extension) {
		return {
			webgl2: true,
			colorBufferFloatExtension: false,
			selectedFormat: null,
			attempts: [],
			renderer,
			message:
				'Floating-point colour attachments are unavailable. The CPU reference engine is required.'
		};
	}

	const formats: readonly FloatFramebufferFormat[] = [
		{
			id: 'rgba16f',
			label: 'RGBA16F',
			internalFormat: gl.RGBA16F,
			uploadType: gl.FLOAT,
			readType: gl.FLOAT
		},
		{
			id: 'rgba32f',
			label: 'RGBA32F',
			internalFormat: gl.RGBA32F,
			uploadType: gl.FLOAT,
			readType: gl.FLOAT
		}
	];
	const attempts = formats.map((format) => probeFormat(gl, format));
	const selectedFormat = formats.find((format, index) => attempts[index].writeReadPassed) ?? null;

	return {
		webgl2: true,
		colorBufferFloatExtension: true,
		selectedFormat,
		attempts,
		renderer,
		message: selectedFormat
			? `${selectedFormat.label} passed framebuffer completeness and floating-point write/read tests.`
			: 'No floating-point framebuffer passed the write/read test. The CPU reference engine is required.'
	};
}

function probeFormat(
	gl: WebGL2RenderingContext,
	format: FloatFramebufferFormat
): FloatFramebufferAttempt {
	const previousFramebuffer = gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
	const previousTexture = gl.getParameter(gl.TEXTURE_BINDING_2D) as WebGLTexture | null;
	const previousPackBuffer = gl.getParameter(gl.PIXEL_PACK_BUFFER_BINDING) as WebGLBuffer | null;
	const texture = gl.createTexture();
	const framebuffer = gl.createFramebuffer();
	let framebufferComplete = false;
	let writeReadPassed = false;
	let reason = 'The probe could not allocate WebGL resources.';

	try {
		if (!texture || !framebuffer)
			return { ...formatIdentity(format), framebufferComplete, writeReadPassed, reason };

		drainErrors(gl);
		gl.bindTexture(gl.TEXTURE_2D, texture);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
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
			return { ...formatIdentity(format), framebufferComplete, writeReadPassed, reason };
		}

		gl.clearBufferfv(gl.COLOR, 0, PROBE_VALUE);
		gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
		const result = new Float32Array(4);
		gl.readPixels(0, 0, 1, 1, gl.RGBA, format.readType, result);
		const error = gl.getError();
		if (error !== gl.NO_ERROR) {
			reason = `Floating-point readback failed with WebGL error 0x${error.toString(16)}.`;
			return { ...formatIdentity(format), framebufferComplete, writeReadPassed, reason };
		}

		const tolerance = format.id === 'rgba16f' ? 0.002 : 0.000_002;
		writeReadPassed = result.every(
			(value, index) => Number.isFinite(value) && Math.abs(value - PROBE_VALUE[index]) <= tolerance
		);
		reason = writeReadPassed
			? 'Framebuffer completed and the known floating-point value survived write/read.'
			: `Readback did not preserve the probe value (received ${[...result].join(', ')}).`;
	} catch (error) {
		reason =
			error instanceof Error ? error.message : 'Unknown floating-point framebuffer probe failure.';
	} finally {
		gl.bindBuffer(gl.PIXEL_PACK_BUFFER, previousPackBuffer);
		gl.bindFramebuffer(gl.FRAMEBUFFER, previousFramebuffer);
		gl.bindTexture(gl.TEXTURE_2D, previousTexture);
		if (framebuffer) gl.deleteFramebuffer(framebuffer);
		if (texture) gl.deleteTexture(texture);
	}

	return { ...formatIdentity(format), framebufferComplete, writeReadPassed, reason };
}

function formatIdentity(format: FloatFramebufferFormat) {
	return { id: format.id, label: format.label } as const;
}

function drainErrors(gl: WebGL2RenderingContext): void {
	for (let index = 0; index < 16 && gl.getError() !== gl.NO_ERROR; index += 1) {
		// Clear errors left by unrelated feature probes before attributing errors to this format.
	}
}
