#version 300 es

// Canonical display mapping: rd-display-v1 (mirrored by ../display.ts).

precision highp float;
precision highp int;
precision highp sampler2D;

in vec2 vUv;

uniform sampler2D uState;
uniform int uGridSize;
uniform int uBoundary;
uniform int uDisplayMode;
uniform int uPalette;
uniform float uInverseSpacingSquared;
uniform float uDiffusionV;
uniform float uFeed;
uniform float uKill;
uniform float uDiagnosticScale;

layout(location = 0) out vec4 outColour;

ivec2 wrapCoordinate(ivec2 coordinate) {
	return ivec2(
		(coordinate.x % uGridSize + uGridSize) % uGridSize,
		(coordinate.y % uGridSize + uGridSize) % uGridSize
	);
}

vec4 neighbourState(ivec2 neighbour, vec4 centre) {
	bool outside = neighbour.x < 0 || neighbour.y < 0 || neighbour.x >= uGridSize || neighbour.y >= uGridSize;
	if (outside) {
		if (uBoundary == 0) return texelFetch(uState, wrapCoordinate(neighbour), 0);
		if (uBoundary == 1) return centre;
		return vec4(1.0, 0.0, 1.0, 1.0);
	}
	vec4 sampleValue = texelFetch(uState, neighbour, 0);
	return sampleValue.b < 0.5 ? centre : sampleValue;
}

vec3 mineral(float value) {
	vec3 darkStone = vec3(9.0, 14.0, 17.0) / 255.0;
	vec3 oxide = vec3(71.0, 56.0, 33.0) / 255.0;
	vec3 chalk = vec3(232.0, 224.0, 184.0) / 255.0;
	return value < 0.48
		? mix(darkStone, oxide, value / 0.48)
		: mix(oxide, chalk, (value - 0.48) / 0.52);
}

vec3 cividis(float value) {
	vec3 low = vec3(0.0, 32.0, 77.0) / 255.0;
	vec3 middle = vec3(99.0, 107.0, 110.0) / 255.0;
	vec3 high = vec3(254.0, 232.0, 55.0) / 255.0;
	return value < 0.5 ? mix(low, middle, value * 2.0) : mix(middle, high, value * 2.0 - 1.0);
}

vec3 highContrast(float value) {
	return value < 0.5
		? mix(vec3(0.0), vec3(0.0, 184.0, 224.0) / 255.0, value * 2.0)
		: mix(vec3(0.0, 184.0, 224.0) / 255.0, vec3(255.0, 245.0, 0.0) / 255.0, value * 2.0 - 1.0);
}

vec3 diverging(float value) {
	vec3 negative = vec3(31.0, 82.0, 184.0) / 255.0;
	vec3 neutral = vec3(232.0, 230.0, 214.0) / 255.0;
	vec3 positive = vec3(184.0, 41.0, 26.0) / 255.0;
	return value < 0.5
		? mix(negative, neutral, value * 2.0)
		: mix(neutral, positive, value * 2.0 - 1.0);
}

vec3 palette(float value) {
	value = clamp(value, 0.0, 1.0);
	if (uPalette == 1) return cividis(value);
	if (uPalette == 2) return highContrast(value);
	if (uPalette == 3) return diverging(value);
	return mineral(value);
}

void main() {
	ivec2 coordinate = ivec2(
		clamp(int(floor(vUv.x * float(uGridSize))), 0, uGridSize - 1),
		clamp(uGridSize - 1 - int(floor(vUv.y * float(uGridSize))), 0, uGridSize - 1)
	);
	vec4 centre = texelFetch(uState, coordinate, 0);
	if (centre.b < 0.5) {
		int hatch = (coordinate.x / 2 + coordinate.y / 2) % 2;
		vec3 obstacle = hatch == 0
			? vec3(20.0, 23.0, 26.0) / 255.0
			: vec3(36.0, 38.0, 41.0) / 255.0;
		outColour = vec4(obstacle, 1.0);
		return;
	}
	if (any(isnan(centre.rg)) || any(isinf(centre.rg))) {
		outColour = vec4(1.0, 0.0, 1.0, 1.0);
		return;
	}

	vec2 north = neighbourState(coordinate + ivec2(0, 1), centre).rg;
	vec2 south = neighbourState(coordinate + ivec2(0, -1), centre).rg;
	vec2 east = neighbourState(coordinate + ivec2(1, 0), centre).rg;
	vec2 west = neighbourState(coordinate + ivec2(-1, 0), centre).rg;
	vec2 laplacian = (north + south + east + west - 4.0 * centre.rg) * uInverseSpacingSquared;
	float autocatalysis = centre.r * centre.g * centre.g;
	float diffusionV = uDiffusionV * laplacian.y;
	float derivativeV = diffusionV + autocatalysis - (uFeed + uKill) * centre.g;

	if (uDisplayMode == 2) {
		vec3 composite = vec3(
		clamp(centre.r, 0.0, 1.0),
		clamp(0.62 * centre.r + 1.35 * centre.g, 0.0, 1.0),
		clamp(2.0 * centre.g, 0.0, 1.0)
		);
		outColour = vec4(composite, 1.0);
		return;
	}

	float mapped;
	if (uDisplayMode == 0) mapped = 2.0 * centre.g;
	else if (uDisplayMode == 1) mapped = centre.r;
	else if (uDisplayMode == 3) mapped = 0.5 + 0.5 * (centre.r - centre.g);
	else if (uDisplayMode == 4) mapped = autocatalysis * uDiagnosticScale;
	else if (uDisplayMode == 5) mapped = 0.5 + diffusionV * uDiagnosticScale;
	else mapped = 0.5 + derivativeV * uDiagnosticScale;

	bool signedMode = uDisplayMode == 3 || uDisplayMode == 5 || uDisplayMode == 6;
	outColour = vec4(signedMode ? diverging(clamp(mapped, 0.0, 1.0)) : palette(mapped), 1.0);
}
