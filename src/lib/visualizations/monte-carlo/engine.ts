import {
	fieldFragmentShader,
	fieldVertexShader,
	pointFragmentShader,
	pointVertexShader
} from './shaders';

export type MonteCarloRenderOptions = {
	pointSize: number;
	pointOpacity: number;
	showOutside: boolean;
	showGrid: boolean;
	showCircle: boolean;
};

type RendererCallbacks = {
	onContextLost?: () => void;
	onContextRestored?: () => void;
};

type ProgramResources = {
	program: WebGLProgram;
	vertexArray: WebGLVertexArrayObject;
};

const DEFAULT_OPTIONS: MonteCarloRenderOptions = {
	pointSize: 3.2,
	pointOpacity: 0.68,
	showOutside: true,
	showGrid: true,
	showCircle: true
};

function compileShader(gl: WebGL2RenderingContext, type: number, source: string) {
	const shader = gl.createShader(type);
	if (!shader) throw new Error('WebGL could not allocate a shader.');
	gl.shaderSource(shader, source);
	gl.compileShader(shader);
	if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
		const message = gl.getShaderInfoLog(shader) ?? 'Unknown shader compilation error.';
		gl.deleteShader(shader);
		throw new Error(message);
	}
	return shader;
}

function createProgram(gl: WebGL2RenderingContext, vertexSource: string, fragmentSource: string) {
	const vertex = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
	const fragment = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
	const program = gl.createProgram();
	if (!program) throw new Error('WebGL could not allocate a shader program.');
	gl.attachShader(program, vertex);
	gl.attachShader(program, fragment);
	gl.linkProgram(program);
	gl.deleteShader(vertex);
	gl.deleteShader(fragment);
	if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
		const message = gl.getProgramInfoLog(program) ?? 'Unknown shader linking error.';
		gl.deleteProgram(program);
		throw new Error(message);
	}
	return program;
}

function uniform(gl: WebGL2RenderingContext, program: WebGLProgram, name: string) {
	const location = gl.getUniformLocation(program, name);
	if (location === null) throw new Error(`Required shader uniform ${name} is unavailable.`);
	return location;
}

export class MonteCarloRenderer {
	private readonly canvas: HTMLCanvasElement;
	private readonly capacity: number;
	private readonly callbacks: RendererCallbacks;
	private gl: WebGL2RenderingContext;
	private field: ProgramResources | null = null;
	private points: ProgramResources | null = null;
	private pointBuffer: WebGLBuffer | null = null;
	private pointCount = 0;
	private pixelRatio = 1;
	private contextLost = false;
	private options: MonteCarloRenderOptions = { ...DEFAULT_OPTIONS };

	constructor(canvas: HTMLCanvasElement, capacity: number, callbacks: RendererCallbacks = {}) {
		this.canvas = canvas;
		this.capacity = Math.max(1, Math.floor(capacity));
		this.callbacks = callbacks;
		const context = canvas.getContext('webgl2', {
			alpha: false,
			antialias: true,
			depth: false,
			powerPreference: 'high-performance',
			preserveDrawingBuffer: false
		});
		if (!context) throw new Error('WebGL2 is unavailable.');
		this.gl = context;
		this.canvas.addEventListener('webglcontextlost', this.handleContextLost);
		this.canvas.addEventListener('webglcontextrestored', this.handleContextRestored);
		this.createResources();
	}

	private handleContextLost = (event: Event) => {
		event.preventDefault();
		this.contextLost = true;
		this.field = null;
		this.points = null;
		this.pointBuffer = null;
		this.callbacks.onContextLost?.();
	};

	private handleContextRestored = () => {
		this.contextLost = false;
		this.createResources();
		this.callbacks.onContextRestored?.();
	};

	private createResources() {
		const gl = this.gl;
		const fieldProgram = createProgram(gl, fieldVertexShader, fieldFragmentShader);
		const fieldVertexArray = gl.createVertexArray();
		const pointProgram = createProgram(gl, pointVertexShader, pointFragmentShader);
		const pointVertexArray = gl.createVertexArray();
		const pointBuffer = gl.createBuffer();
		if (!fieldVertexArray || !pointVertexArray || !pointBuffer) {
			throw new Error('WebGL could not allocate the Monte Carlo geometry buffers.');
		}

		gl.bindVertexArray(pointVertexArray);
		gl.bindBuffer(gl.ARRAY_BUFFER, pointBuffer);
		gl.bufferData(
			gl.ARRAY_BUFFER,
			this.capacity * 3 * Float32Array.BYTES_PER_ELEMENT,
			gl.DYNAMIC_DRAW
		);
		gl.enableVertexAttribArray(0);
		gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 3 * Float32Array.BYTES_PER_ELEMENT, 0);
		gl.enableVertexAttribArray(1);
		gl.vertexAttribPointer(
			1,
			1,
			gl.FLOAT,
			false,
			3 * Float32Array.BYTES_PER_ELEMENT,
			2 * Float32Array.BYTES_PER_ELEMENT
		);
		gl.bindVertexArray(null);
		gl.bindBuffer(gl.ARRAY_BUFFER, null);

		this.field = { program: fieldProgram, vertexArray: fieldVertexArray };
		this.points = { program: pointProgram, vertexArray: pointVertexArray };
		this.pointBuffer = pointBuffer;
		this.pointCount = 0;
	}

	setOptions(options: MonteCarloRenderOptions) {
		this.options = { ...options };
	}

	resize(width: number, height: number, pixelRatio: number) {
		this.pixelRatio = Math.min(2, Math.max(1, pixelRatio));
		const nextWidth = Math.max(1, Math.round(width * this.pixelRatio));
		const nextHeight = Math.max(1, Math.round(height * this.pixelRatio));
		if (this.canvas.width !== nextWidth) this.canvas.width = nextWidth;
		if (this.canvas.height !== nextHeight) this.canvas.height = nextHeight;
		this.draw();
	}

	append(points: Float32Array, start: number, end: number) {
		if (this.contextLost || !this.pointBuffer || end <= start) return;
		const boundedStart = Math.max(0, Math.min(this.capacity, Math.floor(start)));
		const boundedEnd = Math.max(boundedStart, Math.min(this.capacity, Math.floor(end)));
		const gl = this.gl;
		gl.bindBuffer(gl.ARRAY_BUFFER, this.pointBuffer);
		gl.bufferSubData(
			gl.ARRAY_BUFFER,
			boundedStart * 3 * Float32Array.BYTES_PER_ELEMENT,
			points.subarray(boundedStart * 3, boundedEnd * 3)
		);
		gl.bindBuffer(gl.ARRAY_BUFFER, null);
		this.pointCount = Math.max(this.pointCount, boundedEnd);
	}

	replace(points: Float32Array, count: number) {
		if (this.contextLost || !this.pointBuffer) return;
		this.pointCount = 0;
		this.append(points, 0, Math.min(count, this.capacity));
	}

	private setFieldUniforms(pass: number) {
		if (!this.field) return;
		const gl = this.gl;
		const program = this.field.program;
		gl.uniform1i(uniform(gl, program, 'u_pass'), pass);
		gl.uniform1i(uniform(gl, program, 'u_show_grid'), this.options.showGrid ? 1 : 0);
		gl.uniform1i(uniform(gl, program, 'u_show_circle'), this.options.showCircle ? 1 : 0);
		gl.uniform3f(uniform(gl, program, 'u_background'), 0.018, 0.027, 0.045);
		gl.uniform3f(uniform(gl, program, 'u_field'), 0.035, 0.065, 0.09);
		gl.uniform3f(uniform(gl, program, 'u_grid'), 0.32, 0.42, 0.49);
		gl.uniform3f(uniform(gl, program, 'u_axis'), 0.51, 0.62, 0.68);
		gl.uniform3f(uniform(gl, program, 'u_boundary'), 0.91, 0.95, 0.96);
	}

	draw() {
		if (this.contextLost || !this.field || !this.points) return;
		const gl = this.gl;
		gl.viewport(0, 0, this.canvas.width, this.canvas.height);
		gl.disable(gl.DEPTH_TEST);
		gl.disable(gl.BLEND);

		gl.useProgram(this.field.program);
		gl.bindVertexArray(this.field.vertexArray);
		this.setFieldUniforms(0);
		gl.drawArrays(gl.TRIANGLES, 0, 3);

		if (this.pointCount > 0) {
			gl.enable(gl.BLEND);
			gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
			gl.useProgram(this.points.program);
			gl.bindVertexArray(this.points.vertexArray);
			gl.uniform1f(
				uniform(gl, this.points.program, 'u_point_size'),
				this.options.pointSize * this.pixelRatio
			);
			gl.uniform1f(uniform(gl, this.points.program, 'u_opacity'), this.options.pointOpacity);
			gl.uniform1i(
				uniform(gl, this.points.program, 'u_show_outside'),
				this.options.showOutside ? 1 : 0
			);
			gl.uniform3f(uniform(gl, this.points.program, 'u_inside_colour'), 0.28, 0.83, 0.75);
			gl.uniform3f(uniform(gl, this.points.program, 'u_outside_colour'), 0.96, 0.58, 0.45);
			gl.drawArrays(gl.POINTS, 0, this.pointCount);
		}

		gl.enable(gl.BLEND);
		gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
		gl.useProgram(this.field.program);
		gl.bindVertexArray(this.field.vertexArray);
		this.setFieldUniforms(1);
		gl.drawArrays(gl.TRIANGLES, 0, 3);
		gl.bindVertexArray(null);
	}

	destroy() {
		this.canvas.removeEventListener('webglcontextlost', this.handleContextLost);
		this.canvas.removeEventListener('webglcontextrestored', this.handleContextRestored);
		if (this.contextLost) return;
		const gl = this.gl;
		if (this.pointBuffer) gl.deleteBuffer(this.pointBuffer);
		if (this.points) {
			gl.deleteVertexArray(this.points.vertexArray);
			gl.deleteProgram(this.points.program);
		}
		if (this.field) {
			gl.deleteVertexArray(this.field.vertexArray);
			gl.deleteProgram(this.field.program);
		}
		this.pointBuffer = null;
		this.points = null;
		this.field = null;
	}
}
