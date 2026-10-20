/**
 * Minimal WebGL2 renderer for the spacetime laboratory. One full-screen
 * program draws a triangle; mode selection and comparison splits happen in the
 * fragment shader. Everything is released on destroy(), and the context is
 * lost politely so navigation frees GPU memory.
 */
export interface SpacetimeUniforms {
	[key: string]: number | boolean | readonly number[];
}

export interface SpacetimeRendererOptions {
	onError?: (message: string) => void;
	onStatus?: (message: string) => void;
}

const ATTRIBUTES = new Float32Array([-1, -1, 3, -1, -1, 3]);
const COMPILATION_TIMEOUT_MS = 15_000;

function aborted(): DOMException {
	return new DOMException('Renderer initialization was cancelled.', 'AbortError');
}

function waitForCompilation(milliseconds: number, signal?: AbortSignal): Promise<void> {
	return new Promise((resolve, reject) => {
		if (signal?.aborted) {
			reject(aborted());
			return;
		}
		const timer = setTimeout(() => {
			signal?.removeEventListener('abort', cancel);
			resolve();
		}, milliseconds);
		function cancel() {
			clearTimeout(timer);
			signal?.removeEventListener('abort', cancel);
			reject(aborted());
		}
		signal?.addEventListener('abort', cancel, { once: true });
	});
}

export class SpacetimeRenderer {
	private gl: WebGL2RenderingContext | null = null;
	private program: WebGLProgram | null = null;
	private buffer: WebGLBuffer | null = null;
	private vao: WebGLVertexArrayObject | null = null;
	private uniformLocations = new Map<string, WebGLUniformLocation | null>();
	private uniformTypes = new Map<string, number>();
	private readonly canvas: HTMLCanvasElement;
	private readonly options: SpacetimeRendererOptions;

	constructor(canvas: HTMLCanvasElement, options: SpacetimeRendererOptions = {}) {
		this.canvas = canvas;
		this.options = options;
	}

	async init(vertexSource: string, fragmentSource: string, signal?: AbortSignal): Promise<boolean> {
		if (signal?.aborted) return false;
		let creationMessage = '';
		const onCreationError = (event: Event) => {
			creationMessage = (event as WebGLContextEvent).statusMessage;
		};
		this.canvas.addEventListener('webglcontextcreationerror', onCreationError);
		let context: WebGL2RenderingContext | null;
		try {
			context = this.canvas.getContext('webgl2', {
				alpha: false,
				antialias: false,
				depth: false,
				stencil: false,
				powerPreference: 'high-performance',
				preserveDrawingBuffer: true
			});
		} catch (error) {
			if (!signal?.aborted) {
				this.options.onError?.(
					`WebGL2 context creation failed: ${error instanceof Error ? error.message : String(error)}`
				);
			}
			return false;
		} finally {
			this.canvas.removeEventListener('webglcontextcreationerror', onCreationError);
		}
		if (!context) {
			if (!signal?.aborted) {
				this.options.onError?.(
					`This browser could not create a WebGL2 context. Check browser graphics acceleration and the graphics driver.${creationMessage ? ` Browser detail: ${creationMessage}` : ''}`
				);
			}
			return false;
		}
		this.gl = context;

		let vertexShader: WebGLShader | null = null;
		let fragmentShader: WebGLShader | null = null;
		let program: WebGLProgram | null = null;
		let initialized = false;
		const ensureActive = () => {
			if (signal?.aborted || this.gl !== context) throw aborted();
			if (context.isContextLost()) {
				throw new Error(
					'The WebGL graphics context was lost while the shader was starting. Retry to create a fresh renderer.'
				);
			}
		};
		try {
			ensureActive();
			const parallelCompile = context.getExtension('KHR_parallel_shader_compile');
			this.options.onStatus?.('Compiling the spacetime graphics shader.');
			// Submit both compiles and the link before querying status. Early
			// COMPILE_STATUS reads serialize driver work and can freeze the page.
			vertexShader = this.compile(context.VERTEX_SHADER, vertexSource);
			fragmentShader = this.compile(context.FRAGMENT_SHADER, fragmentSource);
			program = context.createProgram();
			if (!program) throw new Error('The browser could not create a shader program.');
			context.attachShader(program, vertexShader);
			context.attachShader(program, fragmentShader);
			context.linkProgram(program);
			if (parallelCompile) {
				const deadline = performance.now() + COMPILATION_TIMEOUT_MS;
				while (!context.getProgramParameter(program, parallelCompile.COMPLETION_STATUS_KHR)) {
					ensureActive();
					if (performance.now() >= deadline) {
						throw new Error(
							'The graphics driver did not finish compiling the spacetime shader within 15 seconds. Retry after checking browser graphics acceleration and the driver.'
						);
					}
					await waitForCompilation(16, signal);
				}
			} else {
				// Without the extension, WebGL offers no nonblocking completion
				// query. Yield once so pending UI work can run, then perform the
				// required synchronous link check; its driver wait cannot be timed out.
				await waitForCompilation(0, signal);
			}
			ensureActive();
			if (!context.getProgramParameter(program, context.LINK_STATUS)) {
				const diagnostics = [
					context.getProgramInfoLog(program),
					context.getShaderInfoLog(vertexShader),
					context.getShaderInfoLog(fragmentShader)
				]
					.filter((log) => log?.trim())
					.join('\n');
				throw new Error(diagnostics || 'The shader program failed to compile or link.');
			}
			this.program = program;
			this.vao = context.createVertexArray();
			this.buffer = context.createBuffer();
			if (!this.vao || !this.buffer)
				throw new Error('The browser could not allocate the renderer buffers.');
			context.bindVertexArray(this.vao);
			context.bindBuffer(context.ARRAY_BUFFER, this.buffer);
			context.bufferData(context.ARRAY_BUFFER, ATTRIBUTES, context.STATIC_DRAW);
			const position = context.getAttribLocation(program, 'a_position');
			context.enableVertexAttribArray(position);
			context.vertexAttribPointer(position, 2, context.FLOAT, false, 0, 0);
			context.bindVertexArray(null);
			this.cacheUniformTypes();
			ensureActive();
			initialized = true;
			this.options.onStatus?.('The spacetime renderer is ready.');
			return true;
		} catch (error) {
			if (!signal?.aborted && !(error instanceof DOMException && error.name === 'AbortError')) {
				this.options.onError?.(
					`The spacetime renderer could not start: ${error instanceof Error ? error.message : 'Unknown shader or GPU allocation error.'}`
				);
			}
			return false;
		} finally {
			if (vertexShader) context.deleteShader(vertexShader);
			if (fragmentShader) context.deleteShader(fragmentShader);
			if (!initialized) {
				if (program && this.program !== program) context.deleteProgram(program);
				this.destroy();
			}
		}
	}

	private cacheUniformTypes(): void {
		const gl = this.requireContext();
		if (!this.program) return;
		const count = gl.getProgramParameter(this.program, gl.ACTIVE_UNIFORMS) as number;
		this.uniformTypes.clear();
		for (let i = 0; i < count; i++) {
			const info = gl.getActiveUniform(this.program, i);
			if (info) this.uniformTypes.set(info.name, info.type);
		}
	}

	private compile(type: number, source: string): WebGLShader {
		const gl = this.requireContext();
		const shader = gl.createShader(type);
		if (!shader) throw new Error('The browser could not create a shader.');
		gl.shaderSource(shader, source);
		gl.compileShader(shader);
		return shader;
	}

	private requireContext(): WebGL2RenderingContext {
		if (!this.gl) throw new Error('Renderer is not initialized.');
		return this.gl;
	}

	private location(name: string): WebGLUniformLocation | null {
		if (!this.uniformLocations.has(name)) {
			const gl = this.requireContext();
			this.uniformLocations.set(
				name,
				this.program ? gl.getUniformLocation(this.program, name) : null
			);
		}
		return this.uniformLocations.get(name) ?? null;
	}

	render(width: number, height: number, uniforms: SpacetimeUniforms): void {
		if (!this.gl || !this.program || this.gl.isContextLost()) return;
		const gl = this.gl;
		if (this.canvas.width !== width || this.canvas.height !== height) {
			this.canvas.width = width;
			this.canvas.height = height;
		}
		gl.viewport(0, 0, width, height);
		gl.useProgram(this.program);
		gl.bindVertexArray(this.vao);

		for (const [name, value] of Object.entries(uniforms)) {
			const location = this.location(name);
			if (!location) continue;
			if (typeof value === 'boolean') gl.uniform1i(location, value ? 1 : 0);
			else if (typeof value === 'number') {
				const utype = this.uniformTypes.get(name);
				if (
					utype === gl.INT ||
					utype === gl.BOOL ||
					utype === gl.UNSIGNED_INT ||
					utype === gl.SAMPLER_2D
				)
					gl.uniform1i(location, Math.trunc(value));
				else gl.uniform1f(location, value);
			} else if (value.length === 2) gl.uniform2f(location, value[0], value[1]);
			else if (value.length === 3) gl.uniform3f(location, value[0], value[1], value[2]);
			else if (value.length === 4) gl.uniform4f(location, value[0], value[1], value[2], value[3]);
		}

		gl.drawArrays(gl.TRIANGLES, 0, 3);
		gl.bindVertexArray(null);
	}

	/** Reset the uniform-location cache after a program swap. */
	invalidateLocations(): void {
		this.uniformLocations.clear();
		this.uniformTypes.clear();
	}

	get ready(): boolean {
		return this.gl !== null && this.program !== null;
	}

	destroy(): void {
		if (!this.gl) return;
		const gl = this.gl;
		if (this.buffer) gl.deleteBuffer(this.buffer);
		if (this.vao) gl.deleteVertexArray(this.vao);
		if (this.program) gl.deleteProgram(this.program);
		gl.getExtension('WEBGL_lose_context')?.loseContext();
		this.buffer = null;
		this.vao = null;
		this.program = null;
		this.gl = null;
		this.uniformLocations.clear();
		this.uniformTypes.clear();
	}
}
