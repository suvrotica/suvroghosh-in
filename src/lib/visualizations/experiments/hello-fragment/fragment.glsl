#ifdef GL_ES
precision highp float;
#endif

uniform vec2 u_resolution;
uniform vec2 u_mouse;
uniform float u_time;
uniform float u_speed;
uniform float u_scale;
uniform float u_rings;
uniform float u_warp;
uniform float u_glow;
uniform float u_palette;
uniform bool u_cellular;

varying vec2 vTexCoord;

const float TAU = 6.28318530718;

vec3 palette(float value, float paletteId) {
	vec3 calmA = vec3(0.025, 0.075, 0.13);
	vec3 calmB = vec3(0.2, 0.9, 0.82);
	vec3 electricA = vec3(0.08, 0.015, 0.18);
	vec3 electricB = vec3(0.95, 0.22, 1.0);
	vec3 cellularA = vec3(0.02, 0.12, 0.08);
	vec3 cellularB = vec3(0.95, 0.78, 0.18);

	vec3 calm = mix(calmA, calmB, value);
	vec3 electric = mix(electricA, electricB, value);
	vec3 cellular = mix(cellularA, cellularB, value);
	vec3 firstChoice = mix(calm, electric, step(0.5, paletteId));
	return mix(firstChoice, cellular, step(1.5, paletteId));
}

void main() {
	vec2 resolution = max(u_resolution, vec2(1.0));
	vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / min(resolution.x, resolution.y);
	vec2 mouse = (u_mouse - 0.5 * resolution) / min(resolution.x, resolution.y);
	float time = u_time * u_speed;

	uv *= u_scale;
	mouse *= u_scale;
	float pointerDistance = length(uv - mouse);
	float pointerWarp = sin(pointerDistance * 10.0 - time * 2.0) * u_warp * 0.06;
	uv += normalize(uv - mouse + vec2(0.0001)) * pointerWarp;

	vec2 sourceA = vec2(sin(time * 0.31), cos(time * 0.23)) * 0.36;
	vec2 sourceB = vec2(cos(time * 0.27), sin(time * 0.37)) * 0.33;
	float waveA = sin(length(uv - sourceA) * u_rings - time * 2.2);
	float waveB = sin(length(uv - sourceB) * (u_rings * 1.08) - time * 1.8);
	float pointerWave = sin(pointerDistance * (u_rings + 4.0) - time * 3.0);
	float interference = (waveA + waveB + pointerWave * 0.7) / 2.7;

	vec2 cells = sin(uv.yx * vec2(8.0, 10.0) + time + interference);
	float cellularField = sin((cells.x + cells.y) * 3.0 + time * 1.4);
	float field = mix(interference, cellularField, u_cellular ? 0.72 : 0.0);

	float ridges = pow(1.0 - abs(field), 4.0);
	float centreGlow = 0.035 / max(0.025, pointerDistance);
	float brightness = clamp(0.18 + field * 0.18 + ridges * u_glow + centreGlow * 0.3, 0.0, 1.0);
	float colourPhase = 0.5 + 0.5 * sin(field * TAU + length(uv) * 3.0 - time * 0.6);
	vec3 colour = palette(clamp(colourPhase * 0.72 + brightness * 0.28, 0.0, 1.0), u_palette);
	colour += ridges * vec3(0.28, 0.34, 0.42) * u_glow;
	colour *= 1.0 - smoothstep(0.18, 1.15, length(uv) * 0.72);

	gl_FragColor = vec4(colour, 1.0);
}
