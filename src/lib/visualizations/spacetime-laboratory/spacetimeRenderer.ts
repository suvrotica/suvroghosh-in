/**
 * Minimal WebGL2 renderer for the spacetime laboratory. Two full-screen
 * programs share one quad; mode selection and comparison splits happen in the
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

	init(vertexSource: string, fragmentSource: string): boolean {
		const context = this.canvas.getContext('webgl2', {
			alpha: false,
			antialias: false,
			depth: false,
			stencil: false,
			powerPreference: 'high-performance',
			preserveDrawingBuffer: true
		});
		if (!context) {
			this.options.onError?.('WebGL2 is unavailable in this browser.');
			return false;
		}
		this.gl = context;

		try {
			const vertexShader = this.compile(context.VERTEX_SHADER, vertexSource);
			const fragmentShader = this.compile(context.FRAGMENT_SHADER, fragmentSource);
			const program = context.createProgram();
			if (!program) throw new Error('The browser could not create a shader program.');
			context.attachShader(program, vertexShader);
			context.attachShader(program, fragmentShader);
			context.linkProgram(program);
			if (!context.getProgramParameter(program, context.LINK_STATUS)) {
				throw new Error(context.getProgramInfoLog(program) ?? 'The shader program failed to link.');
			}
			context.deleteShader(vertexShader);
			context.deleteShader(fragmentShader);
			this.program = program;
		} catch (error) {
			this.options.onError?.(
				error instanceof Error ? error.message : 'The shader could not be compiled.'
			);
			return false;
		}

		this.vao = context.createVertexArray();
		context.bindVertexArray(this.vao);
		this.buffer = context.createBuffer();
		context.bindBuffer(context.ARRAY_BUFFER, this.buffer);
		context.bufferData(context.ARRAY_BUFFER, ATTRIBUTES, context.STATIC_DRAW);
		const position = context.getAttribLocation(this.program, 'a_position');
		context.enableVertexAttribArray(position);
		context.vertexAttribPointer(position, 2, context.FLOAT, false, 0, 0);
		context.bindVertexArray(null);
		this.cacheUniformTypes();
		return true;
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
		if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
			const log = gl.getShaderInfoLog(shader) ?? 'Unknown shader compiler error.';
			gl.deleteShader(shader);
			throw new Error(log);
		}
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
		if (!this.gl || !this.program) return;
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
	}
}
