import { expressionToGlsl } from './expression';
import type { ExpressionNode, Viewport } from './types';

const vertexSource = `
attribute vec2 a_position;

void main() {
	gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const complexLibrary = `
const float PI = 3.141592653589793;
const float TAU = 6.283185307179586;

vec2 c_mul(vec2 a, vec2 b) {
	return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x);
}

vec2 c_div(vec2 a, vec2 b) {
	float denominator = dot(b, b);
	if (denominator < 1e-24) {
		return vec2(sign(a.x + 1e-20), sign(a.y + 1e-20)) * 1e18;
	}
	return vec2(
		(a.x * b.x + a.y * b.y) / denominator,
		(a.y * b.x - a.x * b.y) / denominator
	);
}

vec2 c_exp(vec2 value) {
	float scale = exp(clamp(value.x, -42.0, 42.0));
	return scale * vec2(cos(value.y), sin(value.y));
}

vec2 c_log(vec2 value) {
	return vec2(log(max(length(value), 1e-24)), atan(value.y, value.x));
}

vec2 c_sin(vec2 value) {
	float positive = exp(clamp(value.y, -42.0, 42.0));
	float negative = 1.0 / positive;
	float coshY = 0.5 * (positive + negative);
	float sinhY = 0.5 * (positive - negative);
	return vec2(sin(value.x) * coshY, cos(value.x) * sinhY);
}

vec2 c_cos(vec2 value) {
	float positive = exp(clamp(value.y, -42.0, 42.0));
	float negative = 1.0 / positive;
	float coshY = 0.5 * (positive + negative);
	float sinhY = 0.5 * (positive - negative);
	return vec2(cos(value.x) * coshY, -sin(value.x) * sinhY);
}

vec2 c_tan(vec2 value) {
	return c_div(c_sin(value), c_cos(value));
}

vec2 c_sqrt(vec2 value) {
	float radius = length(value);
	float realPart = sqrt(max(0.0, 0.5 * (radius + value.x)));
	float imaginaryPart = sqrt(max(0.0, 0.5 * (radius - value.x)));
	return vec2(realPart, value.y < 0.0 ? -imaginaryPart : imaginaryPart);
}

vec2 c_pow(vec2 base, vec2 exponent) {
	return c_exp(c_mul(exponent, c_log(base)));
}

vec2 c_powi(vec2 base, int exponent) {
	vec2 result = vec2(1.0, 0.0);
	int count = exponent < 0 ? -exponent : exponent;
	for (int index = 0; index < 16; index++) {
		if (index < count) result = c_mul(result, base);
	}
	return exponent < 0 ? c_div(vec2(1.0, 0.0), result) : result;
}

vec3 hsv_to_rgb(float hue, float saturation, float value) {
	vec3 phase = abs(fract(hue + vec3(0.0, 0.6666667, 0.3333333)) * 6.0 - 3.0);
	return value * mix(vec3(1.0), clamp(phase - 1.0, 0.0, 1.0), saturation);
}
`;

function fragmentSource(expression: string) {
	return `
precision highp float;

uniform vec2 u_resolution;
uniform vec2 u_center;
uniform float u_span_im;

${complexLibrary}

void main() {
	vec2 plane = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
	vec2 z = u_center + plane * u_span_im;
	vec2 value = ${expression};

	bool invalid = value.x != value.x || value.y != value.y ||
		abs(value.x) > 1e19 || abs(value.y) > 1e19;
	if (invalid) {
		gl_FragColor = vec4(0.18, 0.18, 0.20, 1.0);
		return;
	}

	float magnitude = max(length(value), 1e-30);
	float logMagnitude = log(magnitude);
	float logBand = fract(logMagnitude / log(2.0));
	float magnitudeDistance = min(logBand, 1.0 - logBand);
	float phase = atan(value.y, value.x);
	float hue = fract(phase / TAU + 1.0);
	float phaseBand = fract(hue * 12.0);
	float phaseDistance = min(phaseBand, 1.0 - phaseBand);

	float magnitudeContour = smoothstep(0.025, 0.065, magnitudeDistance);
	float phaseContour = smoothstep(0.012, 0.034, phaseDistance);
	float bandLight = 0.78 + 0.16 * cos(TAU * logBand);
	vec3 colour = hsv_to_rgb(hue, 0.84, bandLight);
	colour *= mix(0.62, 1.0, magnitudeContour);
	colour *= mix(0.76, 1.0, phaseContour);

	float zeroWeight = 1.0 - smoothstep(-22.0, -16.0, logMagnitude);
	colour = mix(colour, vec3(0.004, 0.008, 0.025), zeroWeight);

	float poleWeight = smoothstep(16.0, 22.0, logMagnitude);
	colour = mix(colour, vec3(1.0, 0.96, 0.88), poleWeight);

	gl_FragColor = vec4(pow(clamp(colour, 0.0, 1.0), vec3(0.92)), 1.0);
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
	private resolutionLocation: WebGLUniformLocation | null = null;
	private centerLocation: WebGLUniformLocation | null = null;
	private spanLocation: WebGLUniformLocation | null = null;
	private positionLocation = -1;

	constructor(private readonly canvas: HTMLCanvasElement) {
		const gl = canvas.getContext('webgl', {
			alpha: false,
			antialias: false,
			depth: false,
			preserveDrawingBuffer: false,
			premultipliedAlpha: false
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
		this.resolutionLocation = this.gl.getUniformLocation(nextProgram, 'u_resolution');
		this.centerLocation = this.gl.getUniformLocation(nextProgram, 'u_center');
		this.spanLocation = this.gl.getUniformLocation(nextProgram, 'u_span_im');
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
		if (!this.program) return;
		const gl = this.gl;
		gl.useProgram(this.program);
		gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
		gl.enableVertexAttribArray(this.positionLocation);
		gl.vertexAttribPointer(this.positionLocation, 2, gl.FLOAT, false, 0, 0);
		gl.uniform2f(this.resolutionLocation, this.canvas.width, this.canvas.height);
		gl.uniform2f(this.centerLocation, viewport.centerRe, viewport.centerIm);
		gl.uniform1f(this.spanLocation, viewport.spanIm);
		gl.drawArrays(gl.TRIANGLES, 0, 6);
	}

	destroy() {
		if (this.program) this.gl.deleteProgram(this.program);
		this.gl.deleteBuffer(this.buffer);
		this.gl.getExtension('WEBGL_lose_context')?.loseContext();
		this.program = null;
	}
}
