export const trajectoryVertexShader = `#version 300 es
precision highp float;

layout(location = 0) in vec3 a_position01;
layout(location = 1) in vec4 a_featureA;
layout(location = 2) in vec3 a_featureB;

uniform vec2 u_viewScale;
uniform float u_dpr;
uniform float u_pointPass;
uniform float u_pointScale;
uniform float u_sampleStride;
uniform float u_wakePass;
uniform float u_simulationPhase;

out float v_age01;
out float v_noise01;
out float v_curvature01;
out float v_density01;
out float v_recurrence01;
out float v_region;
out float v_curlAngle01;
out float v_wakeAge01;
out float v_weatherPhase01;

void main() {
	vec2 ndc = (a_position01.xy * 2.0 - 1.0) * u_viewScale;
	float depthScale = mix(0.94, 1.04, clamp(a_position01.z, 0.0, 1.0));

	v_age01 = clamp(a_featureA.x, 0.0, 1.0);
	v_noise01 = clamp(a_featureA.y, 0.0, 1.0);
	v_curvature01 = clamp(a_featureA.z, 0.0, 1.0);
	v_density01 = clamp(a_featureA.w, 0.0, 1.0);
	v_recurrence01 = clamp(a_featureB.x, 0.0, 1.0);
	v_region = max(0.0, floor(a_featureB.y + 0.5));
	v_curlAngle01 = clamp(a_featureB.z, 0.0, 1.0);
	v_wakeAge01 = fract(
		max(0.0, u_simulationPhase) * 0.071 + float(gl_VertexID) * 0.61803398875 +
			v_noise01 * 0.317
	);
	v_weatherPhase01 = 0.5 + 0.5 * sin(
		max(0.0, u_simulationPhase) * 0.21 + v_noise01 * 6.28318530718 +
			v_region * 0.73
	);

	vec2 wakeDirection = vec2(
		cos(v_curlAngle01 * 6.28318530718),
		sin(v_curlAngle01 * 6.28318530718)
	);
	float wakeReach = (0.0035 + v_noise01 * 0.0105 + v_density01 * 0.006) *
		v_wakeAge01 * (0.42 + v_age01 * 0.58);
	ndc += wakeDirection * wakeReach * u_wakePass;
	gl_Position = vec4(ndc * depthScale, 0.0, 1.0);

	float markSize = 1.15 + v_curvature01 * 3.1 + v_recurrence01 * 4.2;
	float hazeSize = 5.0 + v_density01 * 17.0;
	float wakeSize = 1.1 + v_noise01 * 2.2 + v_curvature01 * 1.4;
	float passSize = mix(mix(markSize, hazeSize, u_pointPass), wakeSize, u_wakePass);
	gl_PointSize = clamp(passSize * u_dpr * u_pointScale, 1.0, 38.0);
	if (
		(u_pointPass > 0.5 || u_wakePass > 0.5) &&
		mod(float(gl_VertexID), max(1.0, u_sampleStride)) >= 0.5
	) {
		gl_Position = vec4(2.0, 2.0, 0.0, 1.0);
	}
}
`;

export const trajectoryLineFragmentShader = `#version 300 es
precision highp float;

uniform float u_layerAlpha;
uniform float u_rawPass;

in float v_age01;
in float v_noise01;
in float v_curvature01;
in float v_density01;
in float v_recurrence01;
in float v_region;
in float v_weatherPhase01;

out vec4 outColour;

vec3 restrainedMineralColour(float noise01, float curvature01, float region) {
	vec3 smokyIndigo = vec3(0.24, 0.31, 0.47);
	vec3 oxidizedCopper = vec3(0.59, 0.38, 0.27);
	vec3 mineralCyan = vec3(0.36, 0.68, 0.70);
	vec3 bone = vec3(0.89, 0.87, 0.78);
	vec3 weather = noise01 < 0.5
		? mix(smokyIndigo, oxidizedCopper, noise01 * 2.0)
		: mix(oxidizedCopper, mineralCyan, (noise01 - 0.5) * 2.0);
	float regionLuminance = 0.84 + mod(region, 3.0) * 0.055;
	return mix(weather * regionLuminance, bone, curvature01 * 0.42);
}

void main() {
	vec3 transformed = restrainedMineralColour(v_noise01, v_curvature01, v_region);
	transformed *= mix(0.92, 1.06, v_weatherPhase01);
	vec3 raw = vec3(0.70, 0.72, 0.68);
	vec3 colour = mix(transformed, raw, u_rawPass);
	float ageOpacity = mix(0.035, 0.92, smoothstep(0.02, 1.0, v_age01));
	float regionPattern = mix(
		0.82,
		1.0,
		step(0.52, fract((gl_FragCoord.x + gl_FragCoord.y) * 0.09 + v_region * 0.31))
	);
	float featureLift = 0.72 + v_curvature01 * 0.2 + v_density01 * 0.06 + v_recurrence01 * 0.08;
	float alpha = clamp(u_layerAlpha * ageOpacity * regionPattern * featureLift, 0.0, 0.94);
	outColour = vec4(colour, alpha);
}
`;

export const trajectoryPointFragmentShader = `#version 300 es
precision highp float;

uniform float u_layerAlpha;
uniform float u_rawPass;
uniform float u_pointPass;
uniform float u_wakePass;

in float v_age01;
in float v_noise01;
in float v_curvature01;
in float v_density01;
in float v_recurrence01;
in float v_region;
in float v_wakeAge01;
in float v_weatherPhase01;

out vec4 outColour;

vec3 restrainedMineralColour(float noise01, float curvature01, float region) {
	vec3 smokyIndigo = vec3(0.24, 0.31, 0.47);
	vec3 oxidizedCopper = vec3(0.59, 0.38, 0.27);
	vec3 mineralCyan = vec3(0.36, 0.68, 0.70);
	vec3 bone = vec3(0.89, 0.87, 0.78);
	vec3 weather = noise01 < 0.5
		? mix(smokyIndigo, oxidizedCopper, noise01 * 2.0)
		: mix(oxidizedCopper, mineralCyan, (noise01 - 0.5) * 2.0);
	float regionLuminance = 0.82 + mod(region, 3.0) * 0.065;
	return mix(weather * regionLuminance, bone, curvature01 * 0.58);
}

float regionShape(vec2 centred, float region) {
	float family = mod(region, 3.0);
	float circleDistance = length(centred);
	float diamondDistance = abs(centred.x) + abs(centred.y);
	float squareDistance = max(abs(centred.x), abs(centred.y));
	float distanceToShape = family < 1.0
		? circleDistance
		: (family < 2.0 ? diamondDistance * 0.78 : squareDistance);
	return 1.0 - smoothstep(0.42, 0.50, distanceToShape);
}

void main() {
	vec2 centred = gl_PointCoord - vec2(0.5);
	float radial = length(centred);
	vec3 baseColour = restrainedMineralColour(v_noise01, v_curvature01, v_region);
	vec3 weatherColour = baseColour * mix(0.92, 1.06, v_weatherPhase01);
	vec3 rawColour = mix(baseColour, vec3(0.72), 0.72);
	vec3 colour = mix(weatherColour, rawColour, u_rawPass);
	float ageOpacity = mix(0.03, 1.0, smoothstep(0.04, 1.0, v_age01));

	if (u_wakePass > 0.5) {
		float wakeSpeck = 1.0 - smoothstep(0.07, 0.50, radial);
		float weatherActivation = 0.18 + v_noise01 * 0.42 + v_density01 * 0.25 +
			v_curvature01 * 0.15;
		float wakeLife = smoothstep(0.0, 0.12, v_wakeAge01) *
			(1.0 - smoothstep(0.64, 1.0, v_wakeAge01));
		float wakeAlpha = wakeSpeck * weatherActivation * wakeLife * ageOpacity *
			u_layerAlpha * 0.28;
		if (wakeAlpha <= 0.003) discard;
		outColour = vec4(mix(colour, vec3(0.63, 0.78, 0.76), 0.22), wakeAlpha);
		return;
	}

	if (u_pointPass > 0.5) {
		float haze = (1.0 - smoothstep(0.08, 0.50, radial)) * v_density01;
		if (haze <= 0.002) discard;
		outColour = vec4(colour, haze * ageOpacity * u_layerAlpha * 0.075);
		return;
	}

	float marker = regionShape(centred, v_region) * (0.12 + v_curvature01 * 0.88);
	float recurrenceRing =
		(1.0 - smoothstep(0.025, 0.07, abs(radial - 0.38))) *
		smoothstep(0.58, 0.95, v_recurrence01);
	float engravedPattern = mix(
		0.68,
		1.0,
		step(0.46, fract((gl_FragCoord.x - gl_FragCoord.y) * 0.14 + v_region * 0.37))
	);
	float alpha = max(marker * engravedPattern, recurrenceRing);
	if (alpha <= 0.008) discard;
	outColour = vec4(mix(colour, vec3(0.93, 0.90, 0.80), recurrenceRing * 0.7), alpha * ageOpacity * u_layerAlpha * 0.76);
}
`;

export const eventVertexShader = `#version 300 es
precision highp float;

layout(location = 0) in vec3 a_position01;
layout(location = 1) in vec4 a_eventMeta;
layout(location = 2) in float a_eventSize01;

uniform vec2 u_viewScale;
uniform float u_dpr;
uniform float u_voiceMix;

out float v_intensity01;
out float v_progress01;
out float v_cause;
out float v_region;

void main() {
	vec2 ndc = (a_position01.xy * 2.0 - 1.0) * u_viewScale;
	float depthScale = mix(0.94, 1.04, clamp(a_position01.z, 0.0, 1.0));
	gl_Position = vec4(ndc * depthScale, 0.0, 1.0);
	v_intensity01 = clamp(a_eventMeta.x, 0.0, 1.0) * u_voiceMix;
	v_progress01 = clamp(a_eventMeta.y, 0.0, 1.0);
	v_cause = clamp(floor(a_eventMeta.z + 0.5), 0.0, 7.0);
	v_region = max(0.0, floor(a_eventMeta.w + 0.5));
	gl_PointSize = clamp(
		(9.0 + clamp(a_eventSize01, 0.0, 1.0) * 17.0) * (1.0 + v_progress01 * 0.65) * u_dpr,
		5.0,
		54.0
	);
}
`;

export const eventFragmentShader = `#version 300 es
precision highp float;

in float v_intensity01;
in float v_progress01;
in float v_cause;
in float v_region;

out vec4 outColour;

float causeShape(vec2 centred, float radial, float cause) {
	float family = mod(cause, 4.0);
	float ring = 1.0 - smoothstep(0.025, 0.065, abs(radial - mix(0.24, 0.43, v_progress01)));
	float doubleRing = max(ring, 1.0 - smoothstep(0.02, 0.05, abs(radial - 0.28)));
	float crossMark = 1.0 - smoothstep(0.025, 0.075, min(abs(centred.x), abs(centred.y)));
	float diamond = 1.0 - smoothstep(0.035, 0.085, abs(abs(centred.x) + abs(centred.y) - 0.43));
	return family < 1.0 ? ring : (family < 2.0 ? doubleRing : (family < 3.0 ? crossMark : diamond));
}

void main() {
	vec2 centred = gl_PointCoord - vec2(0.5);
	float radial = length(centred);
	if (radial > 0.51) discard;
	float shape = causeShape(centred, radial, v_cause);
	float regionPattern = mix(
		0.72,
		1.0,
		step(0.5, fract((gl_FragCoord.x + gl_FragCoord.y) * 0.12 + v_region * 0.29))
	);
	float decay = (1.0 - v_progress01) * v_intensity01;
	float alpha = shape * regionPattern * decay * 0.82;
	if (alpha <= 0.005) discard;
	vec3 copper = vec3(0.75, 0.46, 0.31);
	vec3 phosphor = vec3(0.57, 0.78, 0.66);
	vec3 bone = vec3(0.94, 0.90, 0.80);
	vec3 colour = mix(copper, phosphor, mod(v_region, 2.0));
	colour = mix(colour, bone, mod(v_cause, 3.0) * 0.16);
	outColour = vec4(colour, alpha);
}
`;
