import type { VisualizationStage } from '../../types';

const previewVertexSource = `
attribute vec2 a_position;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

function previewFragment(body: string, uniforms = '') {
	return `
precision highp float;
uniform vec2 u_resolution;
uniform vec2 u_mouse;
uniform float u_time;
${uniforms}
void main() {
${body}
}`;
}

export const rawPreviewVertexSource = previewVertexSource;

export const helloFragmentStages: readonly VisualizationStage[] = [
	{
		id: 'canvas',
		label: '01',
		title: 'Give p5 a WebGL canvas',
		explanation:
			'WEBGL asks p5 for a GPU-backed drawing surface. The origin moves to the centre, which is useful when a rectangle must cover the whole view.',
		callout: 'A canvas is only the stage. Nothing interesting is being calculated yet.',
		filename: 'sketch.js',
		language: 'javascript',
		code: `function setup() {
  createCanvas(720, 405, WEBGL);
  noStroke();
}`,
		previewFragmentSource: previewFragment('  gl_FragColor = vec4(0.025, 0.03, 0.045, 1.0);')
	},
	{
		id: 'vertex',
		label: '02',
		title: 'Place the rectangle with a vertex shader',
		explanation:
			'The vertex shader positions the corners of a rectangle. Think of it as pinning a perfectly flat cinema screen into place.',
		callout: 'This program runs for vertices, not for every visible pixel.',
		filename: 'vertex.glsl',
		language: 'glsl',
		code: `attribute vec3 aPosition;
uniform mat4 uProjectionMatrix;
uniform mat4 uModelViewMatrix;

void main() {
  gl_Position = uProjectionMatrix
    * uModelViewMatrix
    * vec4(aPosition, 1.0);
}`,
		previewFragmentSource: previewFragment(
			'  vec2 uv = gl_FragCoord.xy / u_resolution;\n  gl_FragColor = vec4(vec3(0.08 + uv.x * 0.06), 1.0);'
		)
	},
	{
		id: 'fragment',
		label: '03',
		title: 'Return one colour from a fragment shader',
		explanation:
			'The fragment shader answers one small question repeatedly: what colour should this pixel be?',
		callout: 'RGBA means red, green, blue, and alpha. Each channel runs from 0.0 to 1.0.',
		filename: 'fragment.glsl',
		language: 'glsl',
		code: `precision highp float;

void main() {
  vec3 colour = vec3(0.12, 0.72, 0.82);
  gl_FragColor = vec4(colour, 1.0);
}`,
		previewFragmentSource: previewFragment('  gl_FragColor = vec4(0.12, 0.72, 0.82, 1.0);')
	},
	{
		id: 'resolution',
		label: '04',
		title: 'Pass the canvas resolution',
		explanation:
			'A uniform is one value shared by every fragment. Resolution tells every pixel how wide and tall the current drawing surface is.',
		callout: 'Uniform means shared, not unchanging. JavaScript can update it every frame.',
		filename: 'sketch.js',
		language: 'javascript',
		code: `shaderProgram.setUniform('u_resolution', [
  width * pixelDensity(),
  height * pixelDensity()
]);`,
		previewFragmentSource: previewFragment(
			'  vec2 pixels = gl_FragCoord.xy;\n  vec3 colour = vec3(pixels.x / u_resolution.x, 0.22, pixels.y / u_resolution.y);\n  gl_FragColor = vec4(colour, 1.0);'
		)
	},
	{
		id: 'coordinates',
		label: '05',
		title: 'Turn pixels into normalized coordinates',
		explanation:
			'Dividing a window-space position by resolution turns device-specific framebuffer coordinates into a portable coordinate. The same maths now works on a phone or a large monitor.',
		callout:
			'After centring, zero is in the middle and one unit has the same scale in both directions.',
		filename: 'fragment.glsl',
		language: 'glsl',
		code: `vec2 uv = (
  gl_FragCoord.xy - 0.5 * u_resolution
) / min(u_resolution.x, u_resolution.y);`,
		previewFragmentSource: previewFragment(
			'  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);\n  vec3 colour = vec3(0.5 + uv.x, 0.45 + uv.y, 0.55);\n  gl_FragColor = vec4(colour, 1.0);'
		)
	},
	{
		id: 'gradient',
		label: '06',
		title: 'Use position as colour',
		explanation:
			'Coordinates are numbers, and colours are numbers. Feeding position into colour creates a gradient without drawing a single line.',
		callout: 'The GPU evaluates this expression independently across the whole rectangle.',
		filename: 'fragment.glsl',
		language: 'glsl',
		code: `vec3 colour = vec3(
  0.5 + uv.x,
  0.5 + uv.y,
  0.65 - length(uv)
);`,
		previewFragmentSource: previewFragment(
			'  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);\n  vec3 colour = vec3(0.5 + uv.x, 0.5 + uv.y, 0.65 - length(uv));\n  gl_FragColor = vec4(colour, 1.0);'
		)
	},
	{
		id: 'time',
		label: '07',
		title: 'Let time move through the maths',
		explanation:
			'Time is another uniform. Adding it inside sine changes the phase, so a stationary equation appears to travel.',
		callout:
			'The shader does not move old pixels. It calculates a fresh image for the current moment.',
		filename: 'fragment.glsl',
		language: 'glsl',
		code: `float wave = sin(
  uv.x * 12.0 - u_time * 2.0
);

vec3 colour = vec3(
  0.15,
  0.5 + 0.5 * wave,
  0.75
);`,
		previewFragmentSource: previewFragment(
			'  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);\n  float wave = sin(uv.x * 12.0 - u_time * 2.0);\n  vec3 colour = vec3(0.08 + wave * 0.04, 0.5 + 0.35 * wave, 0.72 + 0.2 * wave);\n  gl_FragColor = vec4(colour, 1.0);'
		)
	},
	{
		id: 'mouse',
		label: '08',
		title: 'Make the pointer a wave source',
		explanation:
			'Mouse or touch position arrives as two more shared numbers. Distance from that point becomes a set of rings.',
		callout: 'Move a pointer, use touch, or focus the preview and press the arrow keys.',
		filename: 'fragment.glsl',
		language: 'glsl',
		code: `vec2 mouse = (
  u_mouse - 0.5 * u_resolution
) / min(u_resolution.x, u_resolution.y);

float distanceToMouse = length(uv - mouse);
float rings = sin(distanceToMouse * 28.0 - u_time * 3.0);`,
		previewFragmentSource: previewFragment(
			'  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);\n  vec2 mouse = (u_mouse - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);\n  float distanceToMouse = length(uv - mouse);\n  float rings = sin(distanceToMouse * 28.0 - u_time * 3.0);\n  float ridge = pow(1.0 - abs(rings), 5.0);\n  gl_FragColor = vec4(vec3(0.04, 0.12 + ridge * 0.55, 0.2 + ridge), 1.0);'
		)
	},
	{
		id: 'interference',
		label: '09',
		title: 'Overlap several waves',
		explanation:
			'Two circles can reinforce or cancel each other. Adding their sine waves produces interference: complexity emerging from simple repetition.',
		callout:
			'Bright ridges trace places where the combined field passes through zero, including destructive-interference nodes. Reinforced peaks and troughs appear through the surrounding colour field.',
		filename: 'fragment.glsl',
		language: 'glsl',
		code: `float waveA = sin(length(uv - sourceA) * 18.0 - time);
float waveB = sin(length(uv - sourceB) * 19.4 - time);
float interference = (waveA + waveB) * 0.5;
float ridges = pow(1.0 - abs(interference), 4.0);`,
		previewFragmentSource: previewFragment(
			'  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);\n  vec2 a = vec2(sin(u_time * 0.4), cos(u_time * 0.3)) * 0.3;\n  vec2 b = -a;\n  float waveA = sin(length(uv - a) * 18.0 - u_time * 2.0);\n  float waveB = sin(length(uv - b) * 19.4 - u_time * 1.8);\n  float interference = (waveA + waveB) * 0.5;\n  float ridges = pow(1.0 - abs(interference), 4.0);\n  gl_FragColor = vec4(vec3(0.04 + ridges * 0.65, 0.08 + ridges * 0.3, 0.16 + ridges), 1.0);'
		)
	},
	{
		id: 'final',
		label: '10',
		title: 'Warp, colour, and light the final field',
		explanation:
			'The finished shader combines moving sources, pointer-centred rings, coordinate warping, a colour palette, and a narrow glow around wave ridges.',
		callout: 'The spectacle is still just coordinates, distance, sine, addition, and colour.',
		filename: 'fragment.glsl',
		language: 'glsl',
		code: `float pointerWarp = sin(pointerDistance * 10.0 - time * 2.0)
  * u_warp * 0.06;
uv += normalize(uv - mouse + vec2(0.0001)) * pointerWarp;

float ridges = pow(1.0 - abs(interference), 4.0);
vec3 colour = palette(colourPhase, u_palette);
colour += ridges * vec3(0.28, 0.34, 0.42) * u_glow;`,
		previewFragmentSource: previewFragment(
			'  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);\n  vec2 mouse = (u_mouse - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);\n  float d = length(uv - mouse);\n  uv += normalize(uv - mouse + vec2(0.0001)) * sin(d * 10.0 - u_time * 2.0) * 0.055;\n  vec2 a = vec2(sin(u_time * 0.31), cos(u_time * 0.23)) * 0.34;\n  vec2 b = vec2(cos(u_time * 0.27), sin(u_time * 0.37)) * 0.32;\n  float waves = (sin(length(uv - a) * 19.0 - u_time * 2.2) + sin(length(uv - b) * 20.5 - u_time * 1.8) + sin(d * 23.0 - u_time * 3.0) * 0.7) / 2.7;\n  float ridges = pow(1.0 - abs(waves), 4.0);\n  float phase = 0.5 + 0.5 * sin(waves * 6.283 + length(uv) * 3.0 - u_time * 0.6);\n  vec3 colour = mix(vec3(0.07, 0.01, 0.16), vec3(0.25, 0.9, 1.0), phase);\n  colour += ridges * vec3(0.55, 0.25, 0.8);\n  colour *= 1.0 - smoothstep(0.18, 1.15, length(uv) * 0.72);\n  gl_FragColor = vec4(colour, 1.0);'
		)
	}
];
