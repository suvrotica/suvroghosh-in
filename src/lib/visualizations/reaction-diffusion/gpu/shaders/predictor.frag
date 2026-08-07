#version 300 es

precision highp float;
precision highp int;
precision highp sampler2D;

uniform sampler2D uState;
uniform int uGridSize;
uniform int uBoundary;
uniform float uInverseSpacingSquared;
uniform float uDiffusionU;
uniform float uDiffusionV;
uniform float uFeed;
uniform float uKill;
uniform float uTimestep;

layout(location = 0) out vec4 outState;

ivec2 wrapCoordinate(ivec2 coordinate) {
	return ivec2(
		(coordinate.x % uGridSize + uGridSize) % uGridSize,
		(coordinate.y % uGridSize + uGridSize) % uGridSize
	);
}

vec4 neighbourState(ivec2 coordinate, ivec2 neighbour, vec4 centre) {
	bool outside = neighbour.x < 0 || neighbour.y < 0 || neighbour.x >= uGridSize || neighbour.y >= uGridSize;
	if (outside) {
		if (uBoundary == 0) {
			return texelFetch(uState, wrapCoordinate(neighbour), 0);
		}
		if (uBoundary == 1) {
			return centre;
		}
		return vec4(1.0, 0.0, 1.0, 1.0);
	}

	vec4 sampleValue = texelFetch(uState, neighbour, 0);
	return sampleValue.b < 0.5 ? centre : sampleValue;
}

vec2 rightHandSide(ivec2 coordinate, vec4 centre) {
	vec2 north = neighbourState(coordinate, coordinate + ivec2(0, 1), centre).rg;
	vec2 south = neighbourState(coordinate, coordinate + ivec2(0, -1), centre).rg;
	vec2 east = neighbourState(coordinate, coordinate + ivec2(1, 0), centre).rg;
	vec2 west = neighbourState(coordinate, coordinate + ivec2(-1, 0), centre).rg;
	vec2 laplacian = (north + south + east + west - 4.0 * centre.rg) * uInverseSpacingSquared;
	float autocatalysis = centre.r * centre.g * centre.g;
	return vec2(
		uDiffusionU * laplacian.x - autocatalysis + uFeed * (1.0 - centre.r),
		uDiffusionV * laplacian.y + autocatalysis - (uFeed + uKill) * centre.g
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
