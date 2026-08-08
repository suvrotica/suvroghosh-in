#version 300 es

precision highp float;
precision highp int;
precision highp sampler2D;

uniform sampler2D uState;
uniform int uGridSize;
uniform int uPeriodic;
uniform int uKind;
uniform vec2 uFrom;
uniform vec2 uTo;
uniform float uRadius;
uniform float uCellWidth;
uniform float uAmount;
uniform vec2 uTarget;
uniform float uStrength;
uniform vec2 uRecovered;

layout(location = 0) out vec4 outState;

float segmentDistance(vec2 point, vec2 start, vec2 end) {
	vec2 segment = end - start;
	float denominator = dot(segment, segment);
	float along = denominator == 0.0
		? 0.0
		: clamp(dot(point - start, segment) / denominator, 0.0, 1.0);
	return length(point - (start + along * segment));
}

ivec2 wrapCoordinate(ivec2 coordinate) {
	return ivec2(
		(coordinate.x % uGridSize + uGridSize) % uGridSize,
		(coordinate.y % uGridSize + uGridSize) % uGridSize
	);
}

void addActiveNeighbour(ivec2 neighbour, inout vec2 sum, inout float count) {
	bool outside = neighbour.x < 0 || neighbour.y < 0 || neighbour.x >= uGridSize || neighbour.y >= uGridSize;
	if (outside) {
		if (uPeriodic == 0) return;
		neighbour = wrapCoordinate(neighbour);
	}
	vec4 sampleValue = texelFetch(uState, neighbour, 0);
	if (sampleValue.b >= 0.5 && sampleValue.a >= 0.5) {
		sum += sampleValue.rg;
		count += 1.0;
	}
}

vec2 activeNeighbourMean(ivec2 coordinate) {
	vec2 sum = vec2(0.0);
	float count = 0.0;
	addActiveNeighbour(coordinate + ivec2(0, 1), sum, count);
	addActiveNeighbour(coordinate + ivec2(0, -1), sum, count);
	addActiveNeighbour(coordinate + ivec2(1, 0), sum, count);
	addActiveNeighbour(coordinate + ivec2(-1, 0), sum, count);
	return count > 0.0 ? sum / count : uRecovered;
}

void main() {
	ivec2 coordinate = ivec2(gl_FragCoord.xy);
	vec4 value = texelFetch(uState, coordinate, 0);
	// Texture y=0 is CPU row zero. Interventions use the same normalized [0,1]^2 contract.
	vec2 point = (vec2(coordinate) + 0.5) / float(uGridSize);
	float distanceValue = segmentDistance(point, uFrom, uTo);
	float effectiveRadius = (uKind == 0 || uKind == 1 || uKind == 6) && uRadius == 0.0
		? uCellWidth * 0.7071067811865476
		: uRadius;
	bool inside = distanceValue <= effectiveRadius;

	if (value.a < 0.5 || !inside) {
		outState = value;
		return;
	}

	// 3 = obstacle, 4 = recovered restore, 5 = neighbour-mean restore,
	// 6 = declared periodic state-reset source.
	if (uKind == 3) {
		value.b = 0.0;
		outState = value;
		return;
	}
	if (uKind == 4 || uKind == 5) {
		if (value.b < 0.5) {
			value.rg = uKind == 4 ? uRecovered : activeNeighbourMean(coordinate);
			value.b = 1.0;
		}
		outState = value;
		return;
	}
	if (value.b < 0.5) {
		outState = value;
		return;
	}

	if (uKind == 0 || uKind == 1) {
		float weight = uRadius > 0.0 ? max(0.0, 1.0 - distanceValue / uRadius) : 1.0;
		if (uKind == 0) {
			value.r += uAmount * weight;
		} else {
			value.r -= 0.5 * uAmount * weight;
			value.g += uAmount * weight;
		}
	} else if (uKind == 2) {
		value.rg = mix(value.rg, uTarget, uStrength);
	} else if (uKind == 6) {
		float weight = uRadius > 0.0 ? max(0.0, 1.0 - distanceValue / uRadius) : 1.0;
		value.rg = mix(value.rg, uTarget, uStrength * weight);
	}
	outState = value;
}
