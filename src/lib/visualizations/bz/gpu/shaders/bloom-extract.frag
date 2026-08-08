#version 300 es

precision highp float;
precision highp int;
precision highp sampler2D;

in vec2 vUv;

uniform sampler2D uLinearBase;

layout(location = 0) out vec4 outHighlight;

/*
 * Downsample the display pass' front-linked highlight mask. The scientific
 * state texture is never read here (and never crosses the CPU boundary).
 */
void main() {
	ivec2 sourceSize = textureSize(uLinearBase, 0);
	vec2 sourcePoint = vUv * vec2(sourceSize) - 0.5;
	ivec2 centre = ivec2(floor(sourcePoint + 0.5));
	float sum = 0.0;
	float weightSum = 0.0;
	for (int y = -1; y <= 1; y += 1) {
		for (int x = -1; x <= 1; x += 1) {
			ivec2 coordinate = clamp(centre + ivec2(x, y), ivec2(0), sourceSize - 1);
			float weight = (x == 0 ? 2.0 : 1.0) * (y == 0 ? 2.0 : 1.0);
			sum += texelFetch(uLinearBase, coordinate, 0).a * weight;
			weightSum += weight;
		}
	}
	float highlight = sum / max(weightSum, 1.0);
	outHighlight = vec4(highlight, 0.0, 0.0, 1.0);
}
