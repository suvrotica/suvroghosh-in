#version 300 es

precision highp float;
precision highp int;

in vec2 v_uv;
layout(location = 0) out vec4 out_mobile;
layout(location = 1) out vec4 out_deposit;
layout(location = 2) out vec4 out_flow;

uniform sampler2D u_mobile;
uniform sampler2D u_deposit;
uniform sampler2D u_flow;
uniform vec2 u_texel;
uniform vec2 u_aspect;
uniform float u_dt;
uniform float u_time;
uniform int u_mode;
uniform float u_diffusion;
uniform float u_surface_moisture;
uniform float u_drying;
uniform float u_viscosity;
uniform float u_flow_strength;
uniform float u_turbulence;
uniform float u_granulation;
uniform float u_edge_darkening;
uniform float u_mixing;
uniform float u_texture;
uniform float u_force_dry;
uniform float u_float_mode;
uniform float u_seed;

uniform float u_injecting;
uniform int u_brush;
uniform vec2 u_brush_from;
uniform vec2 u_brush_to;
uniform float u_brush_radius;
uniform float u_pressure;
uniform vec2 u_tilt;
uniform vec3 u_pigment_color;
uniform float u_pigment_amount;
uniform float u_transparency;
uniform float u_water_amount;
uniform float u_stroke_force;
uniform float u_pigment_granulation;
uniform float u_pigment_staining;
uniform float u_pigment_density;
uniform float u_eraser_strength;
uniform float u_eraser_softness;
uniform float u_wet_lifting;

const float VELOCITY_RANGE = 0.12;

vec4 sample_field(sampler2D field, vec2 uv) {
	vec2 dimensions = vec2(textureSize(field, 0));
	vec2 pixel = clamp(uv, vec2(0.0), vec2(1.0)) * dimensions - 0.5;
	ivec2 lower = ivec2(floor(pixel));
	ivec2 upper = lower + ivec2(1);
	lower = clamp(lower, ivec2(0), ivec2(dimensions) - ivec2(1));
	upper = clamp(upper, ivec2(0), ivec2(dimensions) - ivec2(1));
	vec2 amount = fract(pixel);
	vec4 a = texelFetch(field, lower, 0);
	vec4 b = texelFetch(field, ivec2(upper.x, lower.y), 0);
	vec4 c = texelFetch(field, ivec2(lower.x, upper.y), 0);
	vec4 d = texelFetch(field, upper, 0);
	return mix(mix(a, b, amount.x), mix(c, d, amount.x), amount.y);
}

vec2 decode_velocity(vec2 velocity) {
	vec2 unpacked = (velocity - 0.5) * VELOCITY_RANGE;
	return mix(unpacked, velocity, u_float_mode);
}

vec2 encode_velocity(vec2 velocity) {
	vec2 packed = velocity / VELOCITY_RANGE + 0.5;
	return mix(packed, velocity, u_float_mode);
}

float hash12(vec2 point) {
	vec3 p3 = fract(vec3(point.xyx) * 0.1031);
	p3 += dot(p3, p3.yzx + 33.33 + u_seed * 0.00001);
	return fract((p3.x + p3.y) * p3.z);
}

float grain(vec2 uv) {
	float fine = hash12(floor(uv / u_texel) + vec2(u_seed * 0.01));
	float broad = hash12(floor(uv / (u_texel * 4.0)) + vec2(19.7));
	return mix(fine, broad, 0.38);
}

float segment_distance(vec2 point, vec2 start, vec2 end) {
	vec2 p = point * u_aspect;
	vec2 a = start * u_aspect;
	vec2 b = end * u_aspect;
	vec2 segment = b - a;
	float amount = clamp(dot(p - a, segment) / max(dot(segment, segment), 0.0000001), 0.0, 1.0);
	return length(p - (a + segment * amount));
}

float brush_mask(vec2 uv, float paper_grain) {
	float radius = max(0.001, u_brush_radius * mix(0.72, 1.28, u_pressure));
	float distance_to_stroke = segment_distance(uv, u_brush_from, u_brush_to);
	if (u_brush == 4) distance_to_stroke = length((uv - u_brush_to) * u_aspect);
	if (u_brush == 2 || u_brush == 5) {
		vec2 direction = normalize((u_brush_to - u_brush_from) * u_aspect + vec2(0.0001));
		float tilt_influence = smoothstep(0.08, 0.8, length(u_tilt));
		vec2 tilt_direction = normalize(vec2(u_tilt.x * u_aspect.x, u_tilt.y) + vec2(0.0001));
		direction = normalize(mix(direction, tilt_direction, tilt_influence * 0.72));
		vec2 normal = vec2(-direction.y, direction.x);
		vec2 delta = (uv - u_brush_to) * u_aspect;
		float along = abs(dot(delta, direction));
		float across = abs(dot(delta, normal));
		float rectangle = max(along * 0.42, across * (u_brush == 5 ? 1.9 : 1.32));
		distance_to_stroke = min(distance_to_stroke, rectangle);
	}
	float softness = (u_brush >= 7) ? u_eraser_softness : (u_brush == 1 ? 0.92 : 0.62);
	float mask = 1.0 - smoothstep(radius * max(0.08, softness), radius, distance_to_stroke);
	if (u_brush == 3) {
		mask *= smoothstep(0.42 + 0.25 * (1.0 - u_texture), 0.96, paper_grain);
	}
	if (u_brush == 5) mask *= 0.72 + 0.28 * step(0.46, paper_grain);
	return clamp(mask, 0.0, 1.0);
}

void main() {
	vec2 uv = v_uv;
	vec4 flow_here = sample_field(u_flow, uv);
	vec2 velocity = decode_velocity(flow_here.xy);
	float mobility_scale = u_mode == 1 ? 0.42 : 1.0;
	vec2 backtrace = clamp(uv - velocity * u_dt * mobility_scale, vec2(0.0), vec2(1.0));

	vec4 mobile_wet = sample_field(u_mobile, backtrace);
	vec4 fixed_pigment = sample_field(u_deposit, uv);
	vec4 material = sample_field(u_flow, backtrace);
	velocity = decode_velocity(material.xy);

	vec4 left_state = sample_field(u_mobile, backtrace - vec2(u_texel.x, 0.0));
	vec4 right_state = sample_field(u_mobile, backtrace + vec2(u_texel.x, 0.0));
	vec4 down_state = sample_field(u_mobile, backtrace - vec2(0.0, u_texel.y));
	vec4 up_state = sample_field(u_mobile, backtrace + vec2(0.0, u_texel.y));
	vec4 laplacian = left_state + right_state + down_state + up_state - 4.0 * mobile_wet;
	vec2 moisture_gradient = vec2(right_state.a - left_state.a, up_state.a - down_state.a) * 0.5;

	float wetness = clamp(mobile_wet.a, 0.0, 1.0);
	float local_mobility = smoothstep(0.015, 0.52, wetness);
	float mode_diffusion = u_mode == 0 ? 1.0 : (u_mode == 1 ? 0.12 : 0.5);
	vec3 channel_diffusion = vec3(0.9, 1.04, 0.82);
	mobile_wet.rgb += laplacian.rgb * channel_diffusion * u_diffusion * u_mixing * mode_diffusion * local_mobility * u_dt * 2.2;
	wetness += laplacian.a * u_diffusion * (u_mode == 1 ? 0.16 : 1.2) * u_dt;

	float paper_grain = grain(uv);
	float turbulence_angle = hash12(floor(uv * 83.0) + floor(u_time * 1.7)) * 6.2831853;
	vec2 turbulence_force = vec2(cos(turbulence_angle), sin(turbulence_angle));
	velocity += moisture_gradient * u_flow_strength * (u_mode == 1 ? 0.016 : 0.055) * local_mobility;
	velocity += turbulence_force * u_turbulence * wetness * u_dt * 0.009;
	float damping = mix(1.4, 12.0, u_viscosity) + (1.0 - wetness) * 5.0;
	velocity *= exp(-damping * u_dt);
	velocity = clamp(velocity, vec2(-VELOCITY_RANGE * 0.48), vec2(VELOCITY_RANGE * 0.48));

	float global_target = u_surface_moisture * 0.28;
	wetness += max(0.0, global_target - wetness) * u_dt * 0.018;
	float evaporation = u_drying * (u_mode == 1 ? 0.018 : 0.052) * (0.5 + 0.5 * paper_grain);
	wetness = max(0.0, wetness - evaporation * u_dt - u_force_dry * 0.16);

	float edge = clamp(length(moisture_gradient) * 20.0, 0.0, 1.0);
	float local_granulation = clamp(material.z * u_granulation, 0.0, 1.0);
	float deposition_rate = mix(0.008, 0.12, 1.0 - wetness);
	deposition_rate += paper_grain * local_granulation * 0.055;
	deposition_rate += edge * u_edge_darkening * 0.06;
	deposition_rate *= mix(1.0, 0.58, material.w);
	vec3 transfer = mobile_wet.rgb * clamp(deposition_rate * u_dt + u_force_dry * 0.18, 0.0, 0.32);
	mobile_wet.rgb = max(vec3(0.0), mobile_wet.rgb - transfer);
	fixed_pigment.rgb = min(vec3(4.0), fixed_pigment.rgb + transfer);
	fixed_pigment.a = min(2.0, fixed_pigment.a + dot(transfer, vec3(0.11)));

	if (u_injecting > 0.5) {
		float mask = brush_mask(uv, paper_grain);
		vec2 direction = normalize((u_brush_to - u_brush_from) * u_aspect + vec2(0.0001));
		float pressure_load = mix(0.55, 1.25, u_pressure);
		float pigment_load =
			u_pigment_amount * (1.0 - u_transparency) * u_pigment_density * pressure_load;
		vec3 addition = u_pigment_color * pigment_load * mask * 0.22;
		float water_load = u_water_amount * mask * mix(0.135, 0.205, u_pressure);

		if (u_brush == 6) {
			addition = vec3(0.0);
			water_load *= 1.45;
		} else if (u_brush == 7) {
			float lift = mask * u_eraser_strength;
			mobile_wet.rgb *= 1.0 - lift * 0.5;
			fixed_pigment.rgb *= 1.0 - lift * 0.2 * (1.0 - material.w * 0.72);
			fixed_pigment.a *= 1.0 - lift * 0.16;
			addition = vec3(0.0);
			water_load = u_wet_lifting * lift * 0.16;
		} else if (u_brush == 8) {
			float clearing = mask * u_eraser_strength;
			mobile_wet.rgb *= 1.0 - clearing * 0.9;
			fixed_pigment.rgb *= 1.0 - clearing * 0.58;
			fixed_pigment.a *= 1.0 - clearing * 0.62;
			addition = vec3(0.0);
			water_load = 0.0;
			wetness *= 1.0 - clearing * 0.5;
		} else if (u_brush == 5) {
			fixed_pigment.rgb = min(vec3(4.0), fixed_pigment.rgb + addition * 0.68);
			fixed_pigment.a = min(2.0, fixed_pigment.a + mask * pigment_load * 0.085);
			addition *= 0.32;
		} else if (u_brush == 3) {
			fixed_pigment.rgb = min(vec3(4.0), fixed_pigment.rgb + addition * 0.52);
			fixed_pigment.a = min(2.0, fixed_pigment.a + mask * pigment_load * 0.045);
			addition *= 0.48;
		}

		mobile_wet.rgb = min(vec3(4.0), mobile_wet.rgb + addition);
		wetness = clamp(wetness + water_load, 0.0, 1.0);
		velocity += direction * mask * u_stroke_force * (u_brush == 5 ? 0.028 : 0.012);
		float new_mass = dot(addition, vec3(0.3333));
		material.z = mix(material.z, u_pigment_granulation, clamp(new_mass * 0.42, 0.0, 0.8));
		material.w = mix(material.w, u_pigment_staining, clamp(new_mass * 0.36, 0.0, 0.8));
	}

	out_mobile = vec4(clamp(mobile_wet.rgb, vec3(0.0), vec3(4.0)), clamp(wetness, 0.0, 1.0));
	out_deposit = vec4(clamp(fixed_pigment.rgb, vec3(0.0), vec3(4.0)), clamp(fixed_pigment.a, 0.0, 2.0));
	out_flow = vec4(encode_velocity(velocity), clamp(material.zw, vec2(0.0), vec2(1.0)));
}
