import { renderPixelDensity } from '$lib/visualizations/webgl';
import {
	GRID_NX,
	GRID_NY,
	MAT_WALL,
	type CameraState,
	type GridPoint,
	type SimulationState,
	type StudioTheme,
	type ViewMode,
	type WavePalette
} from '$lib/visualizations/acoustic-wavefield';

export interface WebGLRendererHandle {
	render: (
		state: SimulationState,
		view: ViewMode,
		theme: StudioTheme,
		palette: WavePalette,
		camera: CameraState
	) => void;
	screenToGrid: (
		clientX: number,
		clientY: number,
		view: ViewMode,
		camera: CameraState
	) => GridPoint | null;
	gridToCanvas: (
		gx: number,
		gy: number,
		view: ViewMode,
		camera: CameraState
	) => { x: number; y: number };
	resize: () => void;
	dispose: () => void;
	isContextLost: () => boolean;
}

const TERRAIN_VS = `#version 300 es
precision highp float;

layout(location = 0) in vec2 a_uv;

uniform sampler2D u_fieldTex;
uniform mat4 u_mvp;
uniform float u_reliefStrength;

out vec2 v_uv;
out float v_pressure;
out float v_rms;
out float v_mat;
out vec3 v_worldPos;

float decodePressure(vec4 texel) {
	float hi = texel.r * 255.0;
	float lo = texel.g * 255.0;
	float raw = (hi * 256.0 + lo) / 65535.0;
	return (raw - 0.5) * 2.0;
}

void main() {
	v_uv = a_uv;
	vec4 texel = texture(u_fieldTex, a_uv);
	float p = decodePressure(texel);
	v_pressure = p;
	v_rms = texel.b;
	v_mat = floor(texel.a * 5.0 + 0.5);

	float aspect = ${GRID_NX}.0 / ${GRID_NY}.0;
	float wx = (a_uv.x - 0.5) * 2.0 * aspect;
	float wy = (0.5 - a_uv.y) * 2.0;

	float wz = 0.0;
	if (u_reliefStrength > 0.01) {
		if (abs(v_mat - 1.0) < 0.25) {
			wz = 0.15 * u_reliefStrength;
		} else if (abs(v_mat - 2.0) < 0.25) {
			wz = -0.025 * u_reliefStrength;
		} else {
			wz = tanh(p * 5.2) * 0.34 * u_reliefStrength;
		}
	}

	v_worldPos = vec3(wx, wy, wz);
	gl_Position = u_mvp * vec4(wx, wy, wz, 1.0);
}
`;

const TERRAIN_FS = `#version 300 es
precision highp float;

uniform sampler2D u_fieldTex;
uniform float u_reliefStrength;
uniform float u_themeLight;
uniform float u_palette;
uniform vec3 u_eyePos;

in vec2 v_uv;
in float v_pressure;
in float v_rms;
in float v_mat;
in vec3 v_worldPos;

out vec4 fragColor;

float decodePressure(vec4 texel) {
	float hi = texel.r * 255.0;
	float lo = texel.g * 255.0;
	float raw = (hi * 256.0 + lo) / 65535.0;
	return (raw - 0.5) * 2.0;
}

vec3 sampleWaveColor(float signedAmp, float amp, float palette, float lightMode) {
	if (palette < 0.5) {
		// Vivid Coral-Gold (+p) vs Electric Cyan-Ice (-p)
		if (signedAmp >= 0.0) {
			vec3 c0 = mix(vec3(1.00, 0.28, 0.24), vec3(0.92, 0.20, 0.14), lightMode);
			vec3 c1 = mix(vec3(1.00, 0.66, 0.08), vec3(0.97, 0.50, 0.04), lightMode);
			vec3 c2 = mix(vec3(1.00, 0.96, 0.72), vec3(1.00, 0.80, 0.20), lightMode);
			return amp < 0.5 ? mix(c0, c1, amp * 2.0) : mix(c1, c2, (amp - 0.5) * 2.0);
		} else {
			vec3 c0 = mix(vec3(0.14, 0.44, 1.00), vec3(0.05, 0.36, 0.88), lightMode);
			vec3 c1 = mix(vec3(0.00, 0.86, 1.00), vec3(0.00, 0.66, 0.88), lightMode);
			vec3 c2 = mix(vec3(0.76, 0.98, 1.00), vec3(0.16, 0.84, 0.96), lightMode);
			return amp < 0.5 ? mix(c0, c1, amp * 2.0) : mix(c1, c2, (amp - 0.5) * 2.0);
		}
	}
	if (palette < 1.5) {
		// Iridescent full-spectrum wave colors
		if (signedAmp >= 0.0) {
			vec3 c0 = mix(vec3(0.16, 0.92, 0.58), vec3(0.04, 0.72, 0.44), lightMode);
			vec3 c1 = mix(vec3(0.99, 0.84, 0.10), vec3(0.94, 0.64, 0.02), lightMode);
			vec3 c2 = mix(vec3(1.00, 0.22, 0.54), vec3(0.90, 0.12, 0.44), lightMode);
			return amp < 0.45 ? mix(c0, c1, amp / 0.45) : mix(c1, c2, (amp - 0.45) / 0.55);
		} else {
			vec3 c0 = mix(vec3(0.04, 0.82, 0.96), vec3(0.02, 0.66, 0.84), lightMode);
			vec3 c1 = mix(vec3(0.32, 0.44, 1.00), vec3(0.20, 0.32, 0.92), lightMode);
			vec3 c2 = mix(vec3(0.78, 0.28, 1.00), vec3(0.62, 0.16, 0.88), lightMode);
			return amp < 0.45 ? mix(c0, c1, amp / 0.45) : mix(c1, c2, (amp - 0.45) / 0.55);
		}
	}
	// Thermal Glow (Magenta-Orange-Gold vs Electric Indigo-Violet-Aqua)
	if (signedAmp >= 0.0) {
		vec3 c0 = mix(vec3(0.94, 0.18, 0.62), vec3(0.84, 0.12, 0.50), lightMode);
		vec3 c1 = mix(vec3(1.00, 0.48, 0.10), vec3(0.96, 0.40, 0.04), lightMode);
		vec3 c2 = mix(vec3(1.00, 0.97, 0.68), vec3(1.00, 0.82, 0.18), lightMode);
		return amp < 0.5 ? mix(c0, c1, amp * 2.0) : mix(c1, c2, (amp - 0.5) * 2.0);
	} else {
		vec3 c0 = mix(vec3(0.34, 0.24, 0.96), vec3(0.24, 0.18, 0.82), lightMode);
		vec3 c1 = mix(vec3(0.62, 0.34, 1.00), vec3(0.48, 0.24, 0.88), lightMode);
		vec3 c2 = mix(vec3(0.56, 0.92, 1.00), vec3(0.14, 0.74, 0.92), lightMode);
		return amp < 0.5 ? mix(c0, c1, amp * 2.0) : mix(c1, c2, (amp - 0.5) * 2.0);
	}
}

void main() {
	vec2 texelSize = vec2(1.0 / ${GRID_NX}.0, 1.0 / ${GRID_NY}.0);
	float pL = decodePressure(texture(u_fieldTex, v_uv - vec2(texelSize.x, 0.0)));
	float pR = decodePressure(texture(u_fieldTex, v_uv + vec2(texelSize.x, 0.0)));
	float pD = decodePressure(texture(u_fieldTex, v_uv - vec2(0.0, texelSize.y)));
	float pU = decodePressure(texture(u_fieldTex, v_uv + vec2(0.0, texelSize.y)));

	float matId = floor(texture(u_fieldTex, v_uv).a * 5.0 + 0.5);
	float lightMode = u_themeLight;

	// Clean, high-contrast studio floor & distinct architectural materials
	vec3 floorCol = mix(vec3(0.068, 0.102, 0.175), vec3(0.965, 0.955, 0.925), lightMode);
	vec3 wallCol = mix(vec3(0.30, 0.36, 0.46), vec3(0.24, 0.29, 0.37), lightMode);
	vec3 absorberCol = mix(vec3(0.28, 0.16, 0.26), vec3(0.70, 0.56, 0.48), lightMode);
	vec3 lensCol = mix(vec3(0.08, 0.30, 0.46), vec3(0.72, 0.90, 0.98), lightMode);
	vec3 diffuserCol = mix(vec3(0.38, 0.33, 0.24), vec3(0.76, 0.70, 0.58), lightMode);
	vec3 resonatorCol = mix(vec3(0.46, 0.30, 0.14), vec3(0.90, 0.74, 0.50), lightMode);

	vec3 baseCol = floorCol;
	if (matId > 0.5 && matId < 1.5) {
		float brick = step(0.5, fract(v_uv.x * 56.0 + floor(v_uv.y * 36.0) * 0.5));
		baseCol = wallCol * (0.95 + 0.07 * brick);
	} else if (matId >= 1.5 && matId < 2.5) {
		float foam = sin(v_uv.x * 440.0) * sin(v_uv.y * 280.0);
		baseCol = absorberCol * (0.94 + 0.08 * foam);
	} else if (matId >= 2.5 && matId < 3.5) {
		baseCol = diffuserCol;
	} else if (matId >= 3.5 && matId < 4.5) {
		baseCol = lensCol;
	} else if (matId >= 4.5) {
		baseCol = resonatorCol;
	}

	// Architectural 1m grid lines
	float gx = abs(fract(v_uv.x * 14.0) - 0.5);
	float gy = abs(fract(v_uv.y * 9.0) - 0.5);
	float gridLine = 1.0 - smoothstep(0.0, 0.022, min(gx, gy));
	if (matId < 0.5 || matId > 3.5) {
		vec3 gridCol = mix(vec3(0.18, 0.26, 0.40), vec3(0.78, 0.76, 0.70), lightMode);
		baseCol = mix(baseCol, gridCol, gridLine * 0.34);
	}

	if (matId > 0.5 && matId < 1.5) {
		// Crisp bevelled stone wall with luminous inner-chamber edge rim
		float mL = texture(u_fieldTex, v_uv - vec2(texelSize.x, 0.0)).a;
		float mR = texture(u_fieldTex, v_uv + vec2(texelSize.x, 0.0)).a;
		float mD = texture(u_fieldTex, v_uv - vec2(0.0, texelSize.y)).a;
		float mU = texture(u_fieldTex, v_uv + vec2(0.0, texelSize.y)).a;
		float edgeGrad = abs(mL - mR) + abs(mD - mU);
		vec3 wn = normalize(vec3((mL - mR) * 4.5, (mD - mU) * 4.5, 1.0));
		float diff = clamp(dot(wn, normalize(vec3(-0.4, 0.55, 0.85))), 0.78, 1.18);
		vec3 rimCol = mix(vec3(0.56, 0.72, 0.92), vec3(0.45, 0.56, 0.70), lightMode);
		vec3 wCol = mix(baseCol * diff, rimCol, clamp(edgeGrad * 2.2, 0.0, 0.55));
		fragColor = vec4(clamp(wCol, 0.0, 1.0), 1.0);
		return;
	}

	// Perceptual high-contrast wave transfer curve so propagating ripples stay vivid
	float raw = tanh(v_pressure * 7.8);
	float amp = pow(abs(raw), 0.68);
	vec3 waveCol = sampleWaveColor(raw, amp, u_palette, lightMode);

	// Clean color blend: quiet air stays deep indigo-slate, waves light up brightly
	float mixAmt = smoothstep(0.015, 0.14, amp) * clamp(0.36 + amp * 0.64, 0.0, 1.0);
	vec3 col = mix(baseCol, waveCol, mixAmt);

	// Crisp iso-amplitude topographic wave fringes
	float contour = 1.0 - smoothstep(0.0, 0.13, abs(fract(amp * 5.0) - 0.5));
	col += waveCol * contour * amp * 0.22;

	// Subtle luminous standing-wave energy glow
	col += mix(vec3(0.06, 0.10, 0.16), vec3(0.02, 0.04, 0.06), lightMode) * v_rms * 0.45;

	// Bright sculpted studio lighting with orbit-reactive specular sheen (never muddy!)
	if (u_reliefStrength > 0.01) {
		vec3 n = normalize(vec3((pL - pR) * 16.0, (pD - pU) * 16.0, 1.0));
		vec3 lightDir = normalize(vec3(-0.42, 0.58, 0.86));
		vec3 fillDir = normalize(vec3(0.58, -0.42, 0.66));
		vec3 viewDir = normalize(u_eyePos - v_worldPos);

		float keyDiff = max(dot(n, lightDir), 0.0);
		float fillDiff = max(dot(n, fillDir), 0.0);
		float lit = 0.78 + 0.34 * keyDiff + 0.14 * fillDiff;

		vec3 halfV = normalize(lightDir + viewDir);
		float spec = pow(max(dot(n, halfV), 0.0), 34.0) * (0.16 + 0.44 * amp);
		float fresnel = pow(1.0 - max(dot(n, viewDir), 0.0), 3.0) * 0.18 * amp;

		col = col * lit + vec3(spec) + waveCol * fresnel;
	}

	fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

const SAND_VS = `#version 300 es
precision highp float;

layout(location = 0) in vec2 a_gridPos;

uniform sampler2D u_fieldTex;
uniform mat4 u_mvp;
uniform float u_reliefStrength;
uniform float u_pointSize;

float decodePressure(vec4 texel) {
	float hi = texel.r * 255.0;
	float lo = texel.g * 255.0;
	float raw = (hi * 256.0 + lo) / 65535.0;
	return (raw - 0.5) * 2.0;
}

void main() {
	vec2 uv = vec2(a_gridPos.x / ${GRID_NX - 1}.0, a_gridPos.y / ${GRID_NY - 1}.0);
	vec4 texel = texture(u_fieldTex, uv);
	float p = decodePressure(texel);
	float mat = floor(texel.a * 5.0 + 0.5);

	float aspect = ${GRID_NX}.0 / ${GRID_NY}.0;
	float wx = (uv.x - 0.5) * 2.0 * aspect;
	float wy = (0.5 - uv.y) * 2.0;
	float wz = 0.008;
	if (u_reliefStrength > 0.01 && abs(mat - 1.0) > 0.25) {
		wz += tanh(p * 5.2) * 0.34 * u_reliefStrength + 0.016;
	}

	gl_Position = u_mvp * vec4(wx, wy, wz, 1.0);
	gl_PointSize = u_pointSize;
}
`;

const SAND_FS = `#version 300 es
precision highp float;

uniform float u_themeLight;
out vec4 fragColor;

void main() {
	vec2 d = gl_PointCoord - vec2(0.5);
	float r2 = dot(d, d);
	if (r2 > 0.25) discard;
	float alpha = smoothstep(0.25, 0.06, r2) * 0.78;
	vec3 sandCol = mix(vec3(1.0, 0.94, 0.76), vec3(0.11, 0.15, 0.22), u_themeLight);
	fragColor = vec4(sandCol, alpha);
}
`;

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
	const sh = gl.createShader(type);
	if (!sh) throw new Error('Failed to create shader');
	gl.shaderSource(sh, source);
	gl.compileShader(sh);
	if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
		const info = gl.getShaderInfoLog(sh) || 'Shader compile error';
		gl.deleteShader(sh);
		throw new Error(info);
	}
	return sh;
}

function createProgram(gl: WebGL2RenderingContext, vsSrc: string, fsSrc: string): WebGLProgram {
	const vs = compileShader(gl, gl.VERTEX_SHADER, vsSrc);
	const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSrc);
	const prog = gl.createProgram();
	if (!prog) throw new Error('Failed to create WebGL program');
	gl.attachShader(prog, vs);
	gl.attachShader(prog, fs);
	gl.linkProgram(prog);
	gl.deleteShader(vs);
	gl.deleteShader(fs);
	if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
		const info = gl.getProgramInfoLog(prog) || 'Program link error';
		gl.deleteProgram(prog);
		throw new Error(info);
	}
	return prog;
}

function mulMat4(a: Float32Array, b: Float32Array): Float32Array {
	const out = new Float32Array(16);
	for (let col = 0; col < 4; col++) {
		for (let row = 0; row < 4; row++) {
			out[col * 4 + row] =
				a[0 * 4 + row] * b[col * 4 + 0] +
				a[1 * 4 + row] * b[col * 4 + 1] +
				a[2 * 4 + row] * b[col * 4 + 2] +
				a[3 * 4 + row] * b[col * 4 + 3];
		}
	}
	return out;
}

function perspectiveMat4(fovRad: number, aspect: number, near: number, far: number): Float32Array {
	const f = 1 / Math.tan(fovRad * 0.5);
	const nf = 1 / (near - far);
	const m = new Float32Array(16);
	m[0] = f / aspect;
	m[5] = f;
	m[10] = (far + near) * nf;
	m[11] = -1;
	m[14] = 2 * far * near * nf;
	return m;
}

function lookAtMat4(
	eye: [number, number, number],
	center: [number, number, number],
	up: [number, number, number]
): Float32Array {
	let fx = center[0] - eye[0];
	let fy = center[1] - eye[1];
	let fz = center[2] - eye[2];
	const fl = Math.hypot(fx, fy, fz);
	fx /= fl;
	fy /= fl;
	fz /= fl;

	let sx = fy * up[2] - fz * up[1];
	let sy = fz * up[0] - fx * up[2];
	let sz = fx * up[1] - fy * up[0];
	const sl = Math.hypot(sx, sy, sz);
	sx /= sl;
	sy /= sl;
	sz /= sl;

	const ux = sy * fz - sz * fy;
	const uy = sz * fx - sx * fz;
	const uz = sx * fy - sy * fx;

	const m = new Float32Array(16);
	m[0] = sx;
	m[4] = sy;
	m[8] = sz;
	m[12] = -(sx * eye[0] + sy * eye[1] + sz * eye[2]);
	m[1] = ux;
	m[5] = uy;
	m[9] = uz;
	m[13] = -(ux * eye[0] + uy * eye[1] + uz * eye[2]);
	m[2] = -fx;
	m[6] = -fy;
	m[10] = -fz;
	m[14] = fx * eye[0] + fy * eye[1] + fz * eye[2];
	m[15] = 1;
	return m;
}

function orthoFitMat4(canvasAspect: number, gridAspect: number): Float32Array {
	const m = new Float32Array(16);
	let halfW = gridAspect;
	let halfH = 1.0;
	if (canvasAspect > gridAspect) {
		halfW = canvasAspect;
	} else {
		halfH = gridAspect / canvasAspect;
	}
	m[0] = 1 / halfW;
	m[5] = 1 / halfH;
	m[10] = -0.5;
	m[15] = 1;
	return m;
}

function invertMat4(m: Float32Array): Float32Array | null {
	const inv = new Float32Array(16);
	inv[0] =
		m[5] * m[10] * m[15] -
		m[5] * m[11] * m[14] -
		m[9] * m[6] * m[15] +
		m[9] * m[7] * m[14] +
		m[13] * m[6] * m[11] -
		m[13] * m[7] * m[10];
	inv[4] =
		-m[4] * m[10] * m[15] +
		m[4] * m[11] * m[14] +
		m[8] * m[6] * m[15] -
		m[8] * m[7] * m[14] -
		m[12] * m[6] * m[11] +
		m[12] * m[7] * m[10];
	inv[8] =
		m[4] * m[9] * m[15] -
		m[4] * m[11] * m[13] -
		m[8] * m[5] * m[15] +
		m[8] * m[7] * m[13] +
		m[12] * m[5] * m[11] -
		m[12] * m[7] * m[9];
	inv[12] =
		-m[4] * m[9] * m[14] +
		m[4] * m[10] * m[13] +
		m[8] * m[5] * m[14] -
		m[8] * m[6] * m[13] -
		m[12] * m[5] * m[10] +
		m[12] * m[6] * m[9];
	inv[1] =
		-m[1] * m[10] * m[15] +
		m[1] * m[11] * m[14] +
		m[9] * m[2] * m[15] -
		m[9] * m[3] * m[14] -
		m[13] * m[2] * m[11] +
		m[13] * m[3] * m[10];
	inv[5] =
		m[0] * m[10] * m[15] -
		m[0] * m[11] * m[14] -
		m[8] * m[2] * m[15] +
		m[8] * m[3] * m[14] +
		m[12] * m[2] * m[11] -
		m[12] * m[3] * m[10];
	inv[9] =
		-m[0] * m[9] * m[15] +
		m[0] * m[11] * m[13] +
		m[8] * m[1] * m[15] -
		m[8] * m[3] * m[13] -
		m[12] * m[1] * m[11] +
		m[12] * m[3] * m[9];
	inv[13] =
		m[0] * m[9] * m[14] -
		m[0] * m[10] * m[13] -
		m[8] * m[1] * m[14] +
		m[8] * m[2] * m[13] +
		m[12] * m[1] * m[10] -
		m[12] * m[2] * m[9];
	inv[2] =
		m[1] * m[6] * m[15] -
		m[1] * m[7] * m[14] -
		m[5] * m[2] * m[15] +
		m[5] * m[3] * m[14] +
		m[13] * m[2] * m[7] -
		m[13] * m[3] * m[6];
	inv[6] =
		-m[0] * m[6] * m[15] +
		m[0] * m[7] * m[14] +
		m[4] * m[2] * m[15] -
		m[4] * m[3] * m[14] -
		m[12] * m[2] * m[7] +
		m[12] * m[3] * m[6];
	inv[10] =
		m[0] * m[5] * m[15] -
		m[0] * m[7] * m[13] -
		m[4] * m[1] * m[15] +
		m[4] * m[3] * m[13] +
		m[12] * m[1] * m[7] -
		m[12] * m[3] * m[5];
	inv[14] =
		-m[0] * m[5] * m[14] +
		m[0] * m[6] * m[13] +
		m[4] * m[1] * m[14] -
		m[4] * m[2] * m[13] -
		m[12] * m[1] * m[6] +
		m[12] * m[2] * m[5];
	inv[3] =
		-m[1] * m[6] * m[11] +
		m[1] * m[7] * m[10] +
		m[5] * m[2] * m[11] -
		m[5] * m[3] * m[10] -
		m[9] * m[2] * m[7] +
		m[9] * m[3] * m[6];
	inv[7] =
		m[0] * m[6] * m[11] -
		m[0] * m[7] * m[10] -
		m[4] * m[2] * m[11] +
		m[4] * m[3] * m[10] +
		m[8] * m[2] * m[7] -
		m[8] * m[3] * m[6];
	inv[11] =
		-m[0] * m[5] * m[11] +
		m[0] * m[7] * m[9] +
		m[4] * m[1] * m[11] -
		m[4] * m[3] * m[9] -
		m[8] * m[1] * m[7] +
		m[8] * m[3] * m[5];
	inv[15] =
		m[0] * m[5] * m[10] -
		m[0] * m[6] * m[9] -
		m[4] * m[1] * m[10] +
		m[4] * m[2] * m[9] +
		m[8] * m[1] * m[6] -
		m[8] * m[2] * m[5];

	const det = m[0] * inv[0] + m[1] * inv[4] + m[2] * inv[8] + m[3] * inv[12];
	if (Math.abs(det) < 1e-10) return null;
	const invDet = 1 / det;
	for (let i = 0; i < 16; i++) inv[i] *= invDet;
	return inv;
}

export function createWebGLRenderer(canvas: HTMLCanvasElement): WebGLRendererHandle {
	const gl = canvas.getContext('webgl2', {
		alpha: false,
		antialias: true,
		powerPreference: 'high-performance'
	});
	if (!gl) {
		throw new Error('WebGL2 context unavailable');
	}

	let contextLost = false;
	const onLost = (e: Event) => {
		e.preventDefault();
		contextLost = true;
	};
	const onRestored = () => {
		contextLost = false;
	};
	canvas.addEventListener('webglcontextlost', onLost);
	canvas.addEventListener('webglcontextrestored', onRestored);

	const terrainProg = createProgram(gl, TERRAIN_VS, TERRAIN_FS);
	const sandProg = createProgram(gl, SAND_VS, SAND_FS);

	// Terrain mesh: 224 x 144 UV vertices
	const uvs = new Float32Array(GRID_NX * GRID_NY * 2);
	let vPtr = 0;
	for (let y = 0; y < GRID_NY; y++) {
		const v = y / (GRID_NY - 1);
		for (let x = 0; x < GRID_NX; x++) {
			uvs[vPtr++] = x / (GRID_NX - 1);
			uvs[vPtr++] = v;
		}
	}
	const indices = new Uint32Array((GRID_NX - 1) * (GRID_NY - 1) * 6);
	let iPtr = 0;
	for (let y = 0; y < GRID_NY - 1; y++) {
		for (let x = 0; x < GRID_NX - 1; x++) {
			const tl = y * GRID_NX + x;
			const tr = tl + 1;
			const bl = tl + GRID_NX;
			const br = bl + 1;
			indices[iPtr++] = tl;
			indices[iPtr++] = bl;
			indices[iPtr++] = tr;
			indices[iPtr++] = tr;
			indices[iPtr++] = bl;
			indices[iPtr++] = br;
		}
	}

	const terrainVao = gl.createVertexArray()!;
	gl.bindVertexArray(terrainVao);
	const terrainVbo = gl.createBuffer()!;
	gl.bindBuffer(gl.ARRAY_BUFFER, terrainVbo);
	gl.bufferData(gl.ARRAY_BUFFER, uvs, gl.STATIC_DRAW);
	gl.enableVertexAttribArray(0);
	gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

	const terrainEbo = gl.createBuffer()!;
	gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, terrainEbo);
	gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

	// Sand VAO (dynamic point buffer)
	const sandVao = gl.createVertexArray()!;
	gl.bindVertexArray(sandVao);
	const sandVbo = gl.createBuffer()!;
	gl.bindBuffer(gl.ARRAY_BUFFER, sandVbo);
	gl.bufferData(gl.ARRAY_BUFFER, 2000 * 2 * 4, gl.DYNAMIC_DRAW);
	gl.enableVertexAttribArray(0);
	gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
	const sandInterleaved = new Float32Array(2000 * 2);

	// Field texture (RGBA8: R/G = 16-bit signed pressure, B = RMS, A = material/5)
	const fieldTex = gl.createTexture()!;
	gl.bindTexture(gl.TEXTURE_2D, fieldTex);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
	const texData = new Uint8Array(GRID_NX * GRID_NY * 4);
	gl.texImage2D(
		gl.TEXTURE_2D,
		0,
		gl.RGBA8,
		GRID_NX,
		GRID_NY,
		0,
		gl.RGBA,
		gl.UNSIGNED_BYTE,
		texData
	);

	const uFieldLoc = gl.getUniformLocation(terrainProg, 'u_fieldTex');
	const uMvpLoc = gl.getUniformLocation(terrainProg, 'u_mvp');
	const uReliefLoc = gl.getUniformLocation(terrainProg, 'u_reliefStrength');
	const uThemeLoc = gl.getUniformLocation(terrainProg, 'u_themeLight');
	const uPaletteLoc = gl.getUniformLocation(terrainProg, 'u_palette');
	const uEyePosLoc = gl.getUniformLocation(terrainProg, 'u_eyePos');

	const uSandFieldLoc = gl.getUniformLocation(sandProg, 'u_fieldTex');
	const uSandMvpLoc = gl.getUniformLocation(sandProg, 'u_mvp');
	const uSandReliefLoc = gl.getUniformLocation(sandProg, 'u_reliefStrength');
	const uSandPointSizeLoc = gl.getUniformLocation(sandProg, 'u_pointSize');
	const uSandThemeLoc = gl.getUniformLocation(sandProg, 'u_themeLight');

	let widthCss = 1;
	let heightCss = 1;
	let dpr = 1;
	let cachedMvpW = -1;
	let cachedMvpH = -1;
	let cachedCamKey = '';
	let cachedMvpRelief: Float32Array | null = null;
	let cachedEyePos: [number, number, number] = [0, -2.05, 2.72];
	let cachedMvpOrtho: Float32Array | null = null;

	function resize(): void {
		const rect = canvas.getBoundingClientRect();
		dpr = renderPixelDensity();
		widthCss = Math.max(1, rect.width);
		heightCss = Math.max(1, rect.height);
		const targetW = Math.max(1, Math.round(widthCss * dpr));
		const targetH = Math.max(1, Math.round(heightCss * dpr));
		if (canvas.width !== targetW || canvas.height !== targetH) {
			canvas.width = targetW;
			canvas.height = targetH;
		}
		gl!.viewport(0, 0, canvas.width, canvas.height);
	}

	resize();

	function computeMvp(view: ViewMode, camera: CameraState): Float32Array {
		if (widthCss !== cachedMvpW || heightCss !== cachedMvpH) {
			cachedMvpW = widthCss;
			cachedMvpH = heightCss;
			cachedMvpRelief = null;
			cachedMvpOrtho = null;
		}
		const gridAspect = GRID_NX / GRID_NY;
		const canvasAspect = Math.max(0.2, widthCss / heightCss);
		if (view === 'interferometer') {
			if (!cachedMvpOrtho) {
				cachedMvpOrtho = orthoFitMat4(canvasAspect, gridAspect);
			}
			cachedEyePos = [0, 0, 4.0];
			return cachedMvpOrtho;
		}
		const camKey = `${camera.yawDeg.toFixed(2)}|${camera.pitchDeg.toFixed(2)}|${camera.zoom.toFixed(3)}|${camera.panX.toFixed(3)}|${camera.panY.toFixed(3)}`;
		if (!cachedMvpRelief || camKey !== cachedCamKey) {
			cachedCamKey = camKey;
			// 2.5D interactive orbit / tilt / pan / zoom perspective camera
			const fov = 0.62;
			const proj = perspectiveMat4(fov, canvasAspect, 0.08, 30.0);
			const distScale = canvasAspect < 1.35 ? 1.35 / canvasAspect : 1.0;
			const safePitch = Math.max(16, Math.min(88, camera.pitchDeg));
			const safeZoom = Math.max(0.65, Math.min(2.3, camera.zoom));
			const pitchRad = (safePitch * Math.PI) / 180;
			const yawRad = (camera.yawDeg * Math.PI) / 180;
			const dist = (3.42 * distScale) / safeZoom;
			const rHoriz = dist * Math.cos(pitchRad);

			const targetX = Math.max(-1.2, Math.min(1.2, camera.panX));
			const targetY = Math.max(-0.9, Math.min(0.9, camera.panY));
			const eyeX = targetX + rHoriz * Math.sin(yawRad);
			const eyeY = targetY - rHoriz * Math.cos(yawRad);
			const eyeZ = dist * Math.sin(pitchRad);

			cachedEyePos = [eyeX, eyeY, eyeZ];
			const viewMat = lookAtMat4(cachedEyePos, [targetX, targetY, 0.0], [0, 0, 1]);
			cachedMvpRelief = mulMat4(proj, viewMat);
		}
		return cachedMvpRelief;
	}

	function screenToGrid(
		clientX: number,
		clientY: number,
		view: ViewMode,
		camera: CameraState
	): GridPoint | null {
		const rect = canvas.getBoundingClientRect();
		const ndcX = ((clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
		const ndcY = 1 - ((clientY - rect.top) / Math.max(1, rect.height)) * 2;
		const mvp = computeMvp(view, camera);
		const inv = invertMat4(mvp);
		if (!inv) return null;

		const unproject = (zNdc: number): [number, number, number] => {
			const x = inv[0] * ndcX + inv[4] * ndcY + inv[8] * zNdc + inv[12];
			const y = inv[1] * ndcX + inv[5] * ndcY + inv[9] * zNdc + inv[13];
			const z = inv[2] * ndcX + inv[6] * ndcY + inv[10] * zNdc + inv[14];
			const w = inv[3] * ndcX + inv[7] * ndcY + inv[11] * zNdc + inv[15];
			return [x / w, y / w, z / w];
		};

		const p0 = unproject(-1);
		const p1 = unproject(1);
		const dz = p1[2] - p0[2];
		if (Math.abs(dz) < 1e-6) return null;
		const t = -p0[2] / dz;
		const wx = p0[0] + (p1[0] - p0[0]) * t;
		const wy = p0[1] + (p1[1] - p0[1]) * t;

		const aspect = GRID_NX / GRID_NY;
		const u = wx / (2 * aspect) + 0.5;
		const v = 0.5 - wy / 2;
		return {
			x: Math.max(2, Math.min(GRID_NX - 3, u * (GRID_NX - 1))),
			y: Math.max(2, Math.min(GRID_NY - 3, v * (GRID_NY - 1)))
		};
	}

	function gridToCanvas(
		gx: number,
		gy: number,
		view: ViewMode,
		camera: CameraState
	): { x: number; y: number } {
		const mvp = computeMvp(view, camera);
		const aspect = GRID_NX / GRID_NY;
		const u = gx / (GRID_NX - 1);
		const v = gy / (GRID_NY - 1);
		const wx = (u - 0.5) * 2 * aspect;
		const wy = (0.5 - v) * 2;
		const wz = view === 'relief' ? 0.06 : 0;

		const cx = mvp[0] * wx + mvp[4] * wy + mvp[8] * wz + mvp[12];
		const cy = mvp[1] * wx + mvp[5] * wy + mvp[9] * wz + mvp[13];
		const cw = mvp[3] * wx + mvp[7] * wy + mvp[11] * wz + mvp[15];
		const ndcX = cx / cw;
		const ndcY = cy / cw;
		return {
			x: (ndcX * 0.5 + 0.5) * widthCss,
			y: (0.5 - ndcY * 0.5) * heightCss
		};
	}

	function render(
		state: SimulationState,
		view: ViewMode,
		theme: StudioTheme,
		palette: WavePalette,
		camera: CameraState
	): void {
		if (contextLost) return;

		const { p, eRms, eRef, material } = state;
		const invRef = 1 / Math.max(eRef, 1e-6);
		const totalCells = GRID_NX * GRID_NY;
		for (let i = 0; i < totalCells; i++) {
			const o = i * 4;
			const pv = p[i];
			const normP = pv < -1 ? -1 : pv > 1 ? 1 : pv;
			const packed = ((normP * 0.5 + 0.5) * 65535 + 0.5) | 0;
			texData[o] = (packed >> 8) & 0xff;
			texData[o + 1] = packed & 0xff;
			const eVal = eRms[i];
			const rms = eVal > 0 ? Math.min(1, Math.sqrt(eVal * invRef)) : 0;
			texData[o + 2] = (rms * 255 + 0.5) | 0;
			texData[o + 3] = ((material[i] / 5) * 255 + 0.5) | 0;
		}

		gl!.activeTexture(gl!.TEXTURE0);
		gl!.bindTexture(gl!.TEXTURE_2D, fieldTex);
		gl!.texSubImage2D(
			gl!.TEXTURE_2D,
			0,
			0,
			0,
			GRID_NX,
			GRID_NY,
			gl!.RGBA,
			gl!.UNSIGNED_BYTE,
			texData
		);

		const isLight = theme === 'light';
		if (isLight) {
			gl!.clearColor(0.94, 0.925, 0.885, 1.0);
		} else {
			gl!.clearColor(0.045, 0.068, 0.115, 1.0);
		}
		gl!.clear(gl!.COLOR_BUFFER_BIT | gl!.DEPTH_BUFFER_BIT);
		gl!.enable(gl!.DEPTH_TEST);

		const mvp = computeMvp(view, camera);
		const reliefStrength = view === 'relief' ? 1.0 : 0.0;
		const themeVal = isLight ? 1.0 : 0.0;
		const paletteVal = palette === 'spectrum' ? 1.0 : palette === 'thermal' ? 2.0 : 0.0;

		gl!.useProgram(terrainProg);
		gl!.uniform1i(uFieldLoc, 0);
		gl!.uniformMatrix4fv(uMvpLoc, false, mvp);
		gl!.uniform1f(uReliefLoc, reliefStrength);
		gl!.uniform1f(uThemeLoc, themeVal);
		gl!.uniform1f(uPaletteLoc, paletteVal);
		gl!.uniform3f(uEyePosLoc, cachedEyePos[0], cachedEyePos[1], cachedEyePos[2]);
		gl!.bindVertexArray(terrainVao);
		gl!.drawElements(gl!.TRIANGLES, indices.length, gl!.UNSIGNED_INT, 0);

		if (state.chladniEnabled && state.chladniX.length > 0) {
			const count = state.chladniX.length;
			let sandDrawCount = 0;
			for (let k = 0; k < count; k++) {
				const cx = state.chladniX[k];
				const cy = state.chladniY[k];
				const ix = cx <= 0 ? 0 : cx >= GRID_NX - 1 ? GRID_NX - 1 : (cx + 0.5) | 0;
				const iy = cy <= 0 ? 0 : cy >= GRID_NY - 1 ? GRID_NY - 1 : (cy + 0.5) | 0;
				if (material[iy * GRID_NX + ix] === MAT_WALL) continue;
				sandInterleaved[sandDrawCount * 2] = cx;
				sandInterleaved[sandDrawCount * 2 + 1] = cy;
				sandDrawCount += 1;
			}
			if (sandDrawCount > 0) {
				gl!.enable(gl!.BLEND);
				gl!.blendFunc(gl!.SRC_ALPHA, gl!.ONE_MINUS_SRC_ALPHA);
				gl!.useProgram(sandProg);
				gl!.uniform1i(uSandFieldLoc, 0);
				gl!.uniformMatrix4fv(uSandMvpLoc, false, mvp);
				gl!.uniform1f(uSandReliefLoc, reliefStrength);
				gl!.uniform1f(uSandPointSizeLoc, Math.max(1.8, 2.1 * dpr));
				gl!.uniform1f(uSandThemeLoc, themeVal);
				gl!.bindVertexArray(sandVao);
				gl!.bindBuffer(gl!.ARRAY_BUFFER, sandVbo);
				gl!.bufferSubData(gl!.ARRAY_BUFFER, 0, sandInterleaved.subarray(0, sandDrawCount * 2));
				gl!.drawArrays(gl!.POINTS, 0, sandDrawCount);
				gl!.disable(gl!.BLEND);
			}
		}
	}

	function dispose(): void {
		canvas.removeEventListener('webglcontextlost', onLost);
		canvas.removeEventListener('webglcontextrestored', onRestored);
		gl!.deleteBuffer(terrainVbo);
		gl!.deleteBuffer(terrainEbo);
		gl!.deleteBuffer(sandVbo);
		gl!.deleteVertexArray(terrainVao);
		gl!.deleteVertexArray(sandVao);
		gl!.deleteTexture(fieldTex);
		gl!.deleteProgram(terrainProg);
		gl!.deleteProgram(sandProg);
	}

	return {
		render,
		screenToGrid,
		gridToCanvas,
		resize,
		dispose,
		isContextLost: () => contextLost
	};
}
