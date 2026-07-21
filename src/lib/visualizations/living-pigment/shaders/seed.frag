#version 300 es

precision highp float;
precision highp int;

in vec2 v_uv;
layout(location = 0) out vec4 out_mobile;
layout(location = 1) out vec4 out_deposit;
layout(location = 2) out vec4 out_flow;

uniform float u_seed;
uniform int u_background;
uniform int u_regions;
uniform float u_moisture;
uniform float u_turbulence;
uniform float u_scale;
uniform float u_symmetry;
uniform float u_intensity;
uniform vec3 u_palette[5];
uniform float u_float_mode;
uniform vec2 u_aspect;

const float VELOCITY_RANGE = 0.12;

float hash12(vec2 point) {
	vec3 p3 = fract(vec3(point.xyx) * 0.1031);
	p3 += dot(p3, p3.yzx + 33.33);
	return fract((p3.x + p3.y) * p3.z);
}

float value_noise(vec2 point) {
	vec2 cell = floor(point);
	vec2 local = fract(point);
	local = local * local * (3.0 - 2.0 * local);
	float a = hash12(cell + u_seed * 0.001);
	float b = hash12(cell + vec2(1.0, 0.0) + u_seed * 0.001);
	float c = hash12(cell + vec2(0.0, 1.0) + u_seed * 0.001);
	float d = hash12(cell + vec2(1.0) + u_seed * 0.001);
	return mix(mix(a, b, local.x), mix(c, d, local.x), local.y);
}

float fbm(vec2 point) {
	float value = 0.0;
	float amplitude = 0.55;
	for (int octave = 0; octave < 4; octave++) {
		value += value_noise(point) * amplitude;
		point = point * 2.03 + vec2(9.2, 4.7);
		amplitude *= 0.48;
	}
	return value;
}

vec2 encode_velocity(vec2 velocity) {
	vec2 packed = velocity / VELOCITY_RANGE + 0.5;
	return mix(packed, velocity, u_float_mode);
}

void main() {
	vec2 uv = v_uv;
	vec2 centered = (uv - 0.5) * u_aspect;
	float grain = fbm(uv * (18.0 + 9.0 * u_scale));
	vec3 mobile = vec3(0.0);
	vec3 deposited = vec3(0.0);
	float thickness = 0.0;
	float wetness = 0.0;
	vec2 velocity = vec2(0.0);
	float local_granulation = 0.45;
	float local_staining = 0.5;

	if (u_background == 3) {
		wetness = u_moisture * (0.72 + 0.28 * grain);
	} else if (u_background >= 4 && u_background <= 6) {
		for (int index = 0; index < 12; index++) {
			if (index >= u_regions) break;
			float fi = float(index);
			vec2 center = vec2(
				hash12(vec2(u_seed + fi * 17.1, 3.7)),
				hash12(vec2(u_seed + fi * 29.3, 8.1))
			);
			center.x = mix(center.x, 0.5 + abs(center.x - 0.5) * (mod(fi, 2.0) * 2.0 - 1.0), u_symmetry);
			float radius = mix(0.1, 0.34, hash12(vec2(fi, u_seed + 11.0))) * u_scale;
			vec2 delta = (uv - center) * u_aspect;
			float warped_distance = length(delta) * (0.88 + 0.3 * fbm(uv * 7.0 + fi));
			float blob = exp(-pow(warped_distance / max(radius, 0.025), 2.2));
			if (u_background == 5) blob *= smoothstep(0.18, 0.88, grain);
			if (u_background == 6) blob *= 0.68 + 0.32 * sin((uv.x + uv.y) * 9.0 + fi);
			vec3 absorption = u_palette[index - (index / 5) * 5];
			mobile += absorption * blob * u_intensity * (0.12 + 0.045 * float(u_background - 4));
			wetness = max(wetness, blob * u_moisture);
			vec2 tangent = normalize(vec2(-delta.y, delta.x) + vec2(0.0001));
			velocity += tangent * blob * u_turbulence * 0.012 * (mod(fi, 2.0) * 2.0 - 1.0);
			local_granulation = mix(local_granulation, 0.35 + 0.55 * grain, blob * 0.45);
		}
	} else if (u_background == 7) {
		deposited = u_palette[0] * (0.015 + 0.012 * grain) * u_intensity;
		thickness = 0.08 * u_intensity;
	} else if (u_background == 8) {
		wetness = u_moisture * 0.08;
	}

	if (u_background == 5) {
		float band = smoothstep(0.58, 0.12, abs(centered.y + 0.15 * sin(centered.x * 4.0)));
		mobile += u_palette[1] * band * u_intensity * 0.045;
		wetness = max(wetness, band * u_moisture * 0.72);
	}

	out_mobile = vec4(mobile, clamp(wetness, 0.0, 1.0));
	out_deposit = vec4(deposited, thickness);
	out_flow = vec4(encode_velocity(velocity), local_granulation, local_staining);
}
