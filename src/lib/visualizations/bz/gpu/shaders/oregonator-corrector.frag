#version 300 es

precision highp float;
precision highp int;
precision highp sampler2D;

uniform sampler2D uOriginalState;
uniform sampler2D uPredictedState;
uniform int uGridSize;
uniform int uPeriodic;
uniform float uSpacingSquared;
uniform float uDiffusionU;
uniform float uDiffusionV;
uniform float uEpsilon;
uniform float uQ;
uniform float uF;
uniform float uTimestep;

layout(location = 0) out vec4 outState;

ivec2 wrapCoordinate(ivec2 coordinate) {
	return ivec2(
		(coordinate.x % uGridSize + uGridSize) % uGridSize,
		(coordinate.y % uGridSize + uGridSize) % uGridSize
	);
}

vec4 neighbourState(sampler2D field, ivec2 neighbour, vec4 centre) {
	bool outside = neighbour.x < 0 || neighbour.y < 0 || neighbour.x >= uGridSize || neighbour.y >= uGridSize;
	if (outside) {
		if (uPeriodic == 0) return centre;
		neighbour = wrapCoordinate(neighbour);
	}
	vec4 sampleValue = texelFetch(field, neighbour, 0);
	return sampleValue.b < 0.5 ? centre : sampleValue;
}

vec2 rightHandSide(sampler2D field, ivec2 coordinate, vec4 centre) {
	vec2 north = neighbourState(field, coordinate + ivec2(0, 1), centre).rg;
	vec2 south = neighbourState(field, coordinate + ivec2(0, -1), centre).rg;
	vec2 east = neighbourState(field, coordinate + ivec2(1, 0), centre).rg;
	vec2 west = neighbourState(field, coordinate + ivec2(-1, 0), centre).rg;
	vec2 laplacian = (north + south + east + west - 4.0 * centre.rg) / uSpacingSquared;
	float reactionU = (
		centre.r * (1.0 - centre.r)
		- uF * centre.g * (centre.r - uQ) / (centre.r + uQ)
	) / uEpsilon;
	float reactionV = centre.r - centre.g;
	return vec2(
		reactionU + uDiffusionU * laplacian.x,
		reactionV + uDiffusionV * laplacian.y
	);
}

void main() {
	ivec2 coordinate = ivec2(gl_FragCoord.xy);
	vec4 original = texelFetch(uOriginalState, coordinate, 0);
	if (original.b < 0.5) {
		outState = original;
		return;
	}
	vec4 predicted = texelFetch(uPredictedState, coordinate, 0);
	vec2 k1 = rightHandSide(uOriginalState, coordinate, original);
	vec2 k2 = rightHandSide(uPredictedState, coordinate, predicted);
	// Fixed-step Heun correction. Concentrations are intentionally not clamped.
	outState = vec4(original.rg + 0.5 * uTimestep * (k1 + k2), original.ba);
}
