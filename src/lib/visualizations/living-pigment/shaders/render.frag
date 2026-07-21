#version 300 es

precision highp float;
precision highp int;

in vec2 v_uv;
out vec4 out_color;

uniform sampler2D u_mobile;
uniform sampler2D u_deposit;
uniform sampler2D u_flow;
uniform vec2 u_texel;
uniform vec3 u_paper_color;
uniform float u_texture;
uniform float u_edge_darkening;
uniform float u_float_mode;
uniform float u_seed;
uniform int u_mode;
uniform int u_surface;
uniform int u_overlay;

const float VELOCITY_RANGE = 0.12;

vec4 sample_field(sampler2D field, vec2 uv) {
	vec2 dimensions = vec2(textureSize(field, 0));
	vec2 pixel = clamp(uv, vec2(0.0), vec2(1.0)) * dimensions - 0.5;
	ivec2 lower = ivec2(floor(pixel));
	ivec2 upper = clamp(lower + ivec2(1), ivec2(0), ivec2(dimensions) - ivec2(1));
	lower = clamp(lower, ivec2(0), ivec2(dimensions) - ivec2(1));
	vec2 amount = fract(pixel);
	vec4 a = texelFetch(field, lower, 0);
	vec4 b = texelFetch(field, ivec2(upper.x, lower.y), 0);
	vec4 c = texelFetch(field, ivec2(lower.x, upper.y), 0);
	vec4 d = texelFetch(field, upper, 0);
	return mix(mix(a, b, amount.x), mix(c, d, amount.x), amount.y);
}

float hash12(vec2 point) {
	vec3 p3 = fract(vec3(point.xyx) * 0.1031);
	p3 += dot(p3, p3.yzx + 33.33 + u_seed * 0.00001);
	return fract((p3.x + p3.y) * p3.z);
}

float paper_grain(vec2 uv) {
	float fine = hash12(floor(uv * 920.0));
	float middle = hash12(floor(uv * 210.0) + 17.0);
	float broad = hash12(floor(uv * 48.0) + 39.0);
	float fiber = sin((uv.x * 470.0 + broad * 8.0)) * sin((uv.y * 330.0 - middle * 5.0));
	float texture = fine * 0.42 + middle * 0.32 + broad * 0.2 + fiber * 0.06;
	if (u_surface == 2) texture += (sin(uv.x * 420.0) + sin(uv.y * 360.0)) * 0.07;
	return clamp(texture, 0.0, 1.0);
}

vec2 decode_velocity(vec2 velocity) {
	return mix((velocity - 0.5) * VELOCITY_RANGE, velocity, u_float_mode);
}

vec3 to_linear(vec3 color) {
	return mix(color / 12.92, pow((color + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), color));
}

vec3 to_srgb(vec3 color) {
	color = max(color, vec3(0.0));
	return mix(color * 12.92, 1.055 * pow(color, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), color));
}

vec3 velocity_color(vec2 velocity) {
	float angle = atan(velocity.y, velocity.x) / 6.2831853 + 0.5;
	vec3 phase = vec3(0.0, 0.3333, 0.6667);
	vec3 hue = 0.55 + 0.45 * cos(6.2831853 * (angle + phase));
	return mix(vec3(0.08), hue, clamp(length(velocity) * 38.0, 0.0, 1.0));
}

void main() {
	vec4 mobile = sample_field(u_mobile, v_uv);
	vec4 deposited = sample_field(u_deposit, v_uv);
	vec4 flow = sample_field(u_flow, v_uv);
	float grain = paper_grain(v_uv);
	vec3 paper = to_linear(u_paper_color);
	paper *= mix(0.965, 1.035, grain * u_texture);

	vec3 absorption = mobile.rgb * 0.76 + deposited.rgb * 1.28;
	vec3 reflected = paper * exp(-absorption);
	float thickness = deposited.a;
	if (u_mode == 1 || u_mode == 2) {
		vec3 pigment_tint = exp(-deposited.rgb / max(vec3(thickness), vec3(0.055)));
		float body = clamp(thickness * (u_mode == 1 ? 0.7 : 0.34), 0.0, 0.78);
		reflected = mix(reflected, pigment_tint, body);
		float height_left = sample_field(u_deposit, v_uv - vec2(u_texel.x, 0.0)).a;
		float height_right = sample_field(u_deposit, v_uv + vec2(u_texel.x, 0.0)).a;
		float height_down = sample_field(u_deposit, v_uv - vec2(0.0, u_texel.y)).a;
		float height_up = sample_field(u_deposit, v_uv + vec2(0.0, u_texel.y)).a;
		vec3 normal = normalize(vec3((height_left - height_right) * 16.0, (height_down - height_up) * 16.0, 1.0));
		float highlight = pow(max(0.0, dot(normal, normalize(vec3(-0.4, 0.55, 0.75)))), 9.0);
		reflected += highlight * thickness * (u_mode == 1 ? 0.18 : 0.08);
	}

	float density_left = dot(sample_field(u_deposit, v_uv - vec2(u_texel.x, 0.0)).rgb, vec3(0.3333));
	float density_right = dot(sample_field(u_deposit, v_uv + vec2(u_texel.x, 0.0)).rgb, vec3(0.3333));
	float density_down = dot(sample_field(u_deposit, v_uv - vec2(0.0, u_texel.y)).rgb, vec3(0.3333));
	float density_up = dot(sample_field(u_deposit, v_uv + vec2(0.0, u_texel.y)).rgb, vec3(0.3333));
	float deposit_edge = clamp(length(vec2(density_right - density_left, density_up - density_down)) * 2.8, 0.0, 1.0);
	reflected *= 1.0 - deposit_edge * u_edge_darkening * 0.16;
	reflected *= mix(0.98, 1.025, (grain - 0.5) * u_texture);

	vec3 display = to_srgb(reflected);
	if (u_overlay == 1) {
		display = mix(vec3(0.08, 0.055, 0.025), vec3(0.18, 0.72, 0.94), mobile.a);
	} else if (u_overlay == 2) {
		float density = 1.0 - exp(-dot(mobile.rgb + deposited.rgb, vec3(0.22)));
		display = mix(vec3(0.03), vec3(0.95, 0.35, 0.12), density);
	} else if (u_overlay == 3) {
		display = velocity_color(decode_velocity(flow.xy));
	} else if (u_overlay == 4) {
		display = mix(vec3(0.82, 0.36, 0.12), vec3(0.12, 0.15, 0.2), 1.0 - mobile.a);
	} else if (u_overlay == 5) {
		display = vec3(grain);
	} else if (u_overlay == 6) {
		float fixed_density = 1.0 - exp(-dot(deposited.rgb, vec3(0.28)));
		display = mix(vec3(0.97), vec3(0.2, 0.11, 0.06), fixed_density);
	}

	float vignette = smoothstep(0.88, 0.25, length(v_uv - 0.5));
	display *= mix(0.94, 1.0, vignette);
	out_color = vec4(clamp(display, 0.0, 1.0), 1.0);
}
