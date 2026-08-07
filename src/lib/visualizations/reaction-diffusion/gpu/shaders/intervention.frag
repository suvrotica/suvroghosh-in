#version 300 es

precision highp float;
precision highp int;
precision highp sampler2D;

uniform sampler2D uState;
uniform int uGridSize;
uniform int uKind;
uniform int uTool;
uniform int uShape;
uniform vec2 uFrom;
uniform vec2 uTo;
uniform float uRadius;
uniform float uStrength;
uniform float uFalloff;
uniform int uMaskActive;

layout(location = 0) out vec4 outState;

float segmentDistance(vec2 point, vec2 start, vec2 end) {
	vec2 segment = end - start;
	float denominator = dot(segment, segment);
	float amount = denominator == 0.0
		? 0.0
		: clamp(dot(point - start, segment) / denominator, 0.0, 1.0);
	return length(point - (start + amount * segment));
}

float brushWeight(vec2 point) {
	float distanceValue = segmentDistance(point, uFrom, uTo);
	if (uKind == 1) return distanceValue <= uRadius ? 1.0 : 0.0;
	if (uShape == 2) {
		float ringDistance = abs(distanceValue - uRadius * 0.72);
		float halfWidth = max(uRadius * 0.28, 1e-12);
		return ringDistance < halfWidth
			? pow(1.0 - ringDistance / halfWidth, max(1.0, uFalloff))
			: 0.0;
	}
	if (distanceValue > uRadius) return 0.0;
	if (uShape == 1 || uShape == 3) return 1.0;
	if (uRadius == 0.0) return distanceValue == 0.0 ? 1.0 : 0.0;
	float exponentValue = max(0.25, uFalloff == 0.0 ? 1.0 : uFalloff);
	return pow(1.0 - distanceValue / uRadius, exponentValue);
}

void main() {
	ivec2 coordinate = ivec2(gl_FragCoord.xy);
	vec4 value = texelFetch(uState, coordinate, 0);
	// Texture row zero stores CPU row zero; both normalized axes therefore match
	// the exported intervention contract before display-only vertical flipping.
	vec2 point = (vec2(coordinate) + 0.5) / float(uGridSize);
	float weight = clamp(brushWeight(point), 0.0, 1.0);
	if (weight <= 0.0) {
		outState = value;
		return;
	}

	if (uKind == 1) {
		value.b = uMaskActive == 1 ? 1.0 : 0.0;
		value.rg = vec2(1.0, 0.0);
		outState = value;
		return;
	}

	if (uTool == 4 || uTool == 5) {
		value.b = uTool == 5 ? 1.0 : 0.0;
		value.rg = vec2(1.0, 0.0);
		outState = value;
		return;
	}
	if (value.b < 0.5) {
		outState = value;
		return;
	}

	float amount = uStrength * weight;
	if (uTool == 0) {
		// Canonical Add V intervention: equal U consumption and V addition.
		value.r -= amount;
		value.g += amount;
	} else if (uTool == 1) {
		value.r += amount;
		value.g -= amount;
	} else if (uTool == 2) {
		value.r += 0.5 * amount;
		value.g += 0.5 * amount;
	} else if (uTool == 3) {
		value.r += (1.0 - value.r) * weight;
		value.g += (0.0 - value.g) * weight;
	}
	outState = value;
}
