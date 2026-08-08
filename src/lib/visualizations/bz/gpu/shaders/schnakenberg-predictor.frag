#version 300 es

precision highp float;
precision highp int;
precision highp sampler2D;

uniform sampler2D uState;
uniform int uGridSize;
uniform int uPeriodic;
uniform float uSpacingSquared;
uniform float uDiffusionU;
uniform float uDiffusionV;
uniform float uA;
uniform float uB;
uniform float uGamma;
uniform float uTimestep;

layout(location = 0) out vec4 outState;

ivec2 wrapCoordinate(ivec2 coordinate) {
	return ivec2(
		(coordinate.x % uGridSize + uGridSize) % uGridSize,
		(coordinate.y % uGridSize + uGridSize) % uGridSize
	);
}

vec4 neighbourState(ivec2 neighbour, vec4 centre) {
	bool outside = neighbour.x < 0 || neighbour.y < 0 || neighbour.x >= uGridSize || neighbour.y >= uGridSize;
	if (outside) {
		if (uPeriodic == 0) return centre;
		neighbour = wrapCoordinate(neighbour);
	}
	vec4 sampleValue = texelFetch(uState, neighbour, 0);
	return sampleValue.b < 0.5 ? centre : sampleValue;
}

vec2 rightHandSide(ivec2 coordinate, vec4 centre) {
	vec2 north = neighbourState(coordinate + ivec2(0, 1), centre).rg;
	vec2 south = neighbourState(coordinate + ivec2(0, -1), centre).rg;
	vec2 east = neighbourState(coordinate + ivec2(1, 0), centre).rg;
	vec2 west = neighbourState(coordinate + ivec2(-1, 0), centre).rg;
	vec2 laplacian = (north + south + east + west - 4.0 * centre.rg) / uSpacingSquared;
	float autocatalysis = centre.r * centre.r * centre.g;
	float reactionU = uGamma * (uA - centre.r + autocatalysis);
	float reactionV = uGamma * (uB - autocatalysis);
	return vec2(
		reactionU + uDiffusionU * laplacian.x,
		reactionV + uDiffusionV * laplacian.y
	);
}

void main() {
	ivec2 coordinate = ivec2(gl_FragCoord.xy);
	vec4 centre = texelFetch(uState, coordinate, 0);
	if (centre.b < 0.5) {
		outState = centre;
		return;
	}
	outState = vec4(centre.rg + uTimestep * rightHandSide(coordinate, centre), centre.ba);
}
