#version 300 es

precision highp float;
precision highp int;
precision highp sampler2D;

in vec2 vUv;

uniform sampler2D uHighlight;
uniform ivec2 uDirection;
uniform int uRadius;

layout(location = 0) out vec4 outBlurred;

/* A bounded triangular kernel mirrors the deterministic CPU publication path. */
void main() {
	ivec2 size = textureSize(uHighlight, 0);
	ivec2 centre = clamp(ivec2(vUv * vec2(size)), ivec2(0), size - 1);
	float sum = 0.0;
	float weightSum = 0.0;
	for (int offset = -12; offset <= 12; offset += 1) {
		if (abs(offset) > uRadius) continue;
		ivec2 coordinate = clamp(centre + uDirection * offset, ivec2(0), size - 1);
		float weight = float(uRadius + 1 - abs(offset));
		sum += texelFetch(uHighlight, coordinate, 0).r * weight;
		weightSum += weight;
	}
	float value = sum / max(weightSum, 1.0);
	outBlurred = vec4(value, 0.0, 0.0, 1.0);
}
