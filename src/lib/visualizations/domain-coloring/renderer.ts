import { expressionToGlsl } from './expression';
import { DOMAIN_GLSL_LIBRARY } from './glsl';
import { viewportPlotRect } from './viewport';
import type { ExpressionNode, Viewport } from './types';

const vertexSource = `
attribute vec2 a_position;

void main() {
	gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

function fragmentSource(expression: string) {
	return `
precision highp float;

uniform vec2 u_center;
uniform vec2 u_span;
uniform vec4 u_plot;
uniform bool u_contours;

${DOMAIN_GLSL_LIBRARY}

void main() {
	vec2 plot_position = gl_FragCoord.xy - u_plot.xy;
	if (plot_position.x < 0.0 || plot_position.y < 0.0 || plot_position.x > u_plot.z || plot_position.y > u_plot.w) {
		gl_FragColor = vec4(0.0196, 0.0275, 0.0509, 1.0);
		return;
	}
	vec2 uv = plot_position / u_plot.zw;
	vec2 z = vec2(
		u_center.x + (uv.x - 0.5) * u_span.x,
		u_center.y + (uv.y - 0.5) * u_span.y
	);
	vec2 value = ${expression};
	if (invalid_complex(value)) {
		gl_FragColor = vec4(0.18, 0.18, 0.20, 1.0);
		return;
	}
	gl_FragColor = vec4(domain_colour(value, u_contours), 1.0);
}
`;
}

function compileShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader {
	const shader = gl.createShader(type);
	if (!shader) throw new Error('The graphics driver could not create a shader.');
	gl.shaderSource(shader, source);
	gl.compileShader(shader);
	if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
		const message = gl.getShaderInfoLog(shader) ?? 'Unknown shader compilation error.';
		gl.deleteShader(shader);
		throw new Error(message);
	}
	return shader;
}

function createProgram(gl: WebGLRenderingContext, expression: string): WebGLProgram {
	const vertex = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
	const fragment = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource(expression));
	const program = gl.createProgram();
	if (!program) throw new Error('The graphics driver could not create a program.');
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

export class DomainColoringRenderer {
	private readonly gl: WebGLRenderingContext;
	private readonly buffer: WebGLBuffer;
	private program: WebGLProgram | null = null;
	private centerLocation: WebGLUniformLocation | null = null;
	private spanLocation: WebGLUniformLocation | null = null;
	private plotLocation: WebGLUniformLocation | null = null;
	private contoursLocation: WebGLUniformLocation | null = null;
	private positionLocation = -1;
	private contours = true;

	constructor(private readonly canvas: HTMLCanvasElement) {
		const gl = canvas.getContext('webgl', {
			alpha: false,
			antialias: false,
			depth: false,
			preserveDrawingBuffer: true,
			premultipliedAlpha: false,
			powerPreference: 'high-performance'
		});
		if (!gl) throw new Error('WebGL is unavailable in this browser.');
		this.gl = gl;
		const buffer = gl.createBuffer();
		if (!buffer) throw new Error('The graphics driver could not allocate a drawing buffer.');
		this.buffer = buffer;
		gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
		gl.bufferData(
			gl.ARRAY_BUFFER,
			new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
			gl.STATIC_DRAW
		);
	}

	setExpression(node: ExpressionNode) {
		const nextProgram = createProgram(this.gl, expressionToGlsl(node));
		if (this.program) this.gl.deleteProgram(this.program);
		this.program = nextProgram;
		this.positionLocation = this.gl.getAttribLocation(nextProgram, 'a_position');
		this.centerLocation = this.gl.getUniformLocation(nextProgram, 'u_center');
		this.spanLocation = this.gl.getUniformLocation(nextProgram, 'u_span');
		this.plotLocation = this.gl.getUniformLocation(nextProgram, 'u_plot');
		this.contoursLocation = this.gl.getUniformLocation(nextProgram, 'u_contours');
	}

	setContours(visible: boolean) {
		this.contours = visible;
	}

	resize(width: number, height: number, density: number) {
		const pixelWidth = Math.max(1, Math.round(width * density));
		const pixelHeight = Math.max(1, Math.round(height * density));
		if (this.canvas.width !== pixelWidth || this.canvas.height !== pixelHeight) {
			this.canvas.width = pixelWidth;
			this.canvas.height = pixelHeight;
		}
		this.gl.viewport(0, 0, pixelWidth, pixelHeight);
	}

	render(viewport: Viewport) {
		if (!this.program || this.gl.isContextLost()) return;
		const gl = this.gl;
		gl.useProgram(this.program);
		gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
		gl.enableVertexAttribArray(this.positionLocation);
		gl.vertexAttribPointer(this.positionLocation, 2, gl.FLOAT, false, 0, 0);
		gl.uniform2f(this.centerLocation, viewport.centerRe, viewport.centerIm);
		gl.uniform2f(this.spanLocation, viewport.spanRe, viewport.spanIm);
		const plot = viewportPlotRect(viewport, this.canvas.width, this.canvas.height);
		gl.uniform4f(this.plotLocation, plot.x, plot.y, plot.width, plot.height);
		gl.uniform1i(this.contoursLocation, this.contours ? 1 : 0);
		gl.drawArrays(gl.TRIANGLES, 0, 6);
	}

	captureDataUrl() {
		return this.canvas.toDataURL('image/png');
	}

	destroy(loseContext = true) {
		if (this.program) this.gl.deleteProgram(this.program);
		this.gl.deleteBuffer(this.buffer);
		if (loseContext) this.gl.getExtension('WEBGL_lose_context')?.loseContext();
		this.program = null;
	}
}
