#version 300 es
precision highp float;
precision highp int;

uniform sampler2D uReduction;
uniform int uSourceSize;
uniform int uMode;

out vec4 fragmentColour;

void mergeStatistic(inout vec4 aggregate, vec4 incoming) {
	if (incoming.r <= 0.0) return;
	if (aggregate.r <= 0.0) {
		aggregate = incoming;
		return;
	}
	float totalCount = aggregate.r + incoming.r;
	float delta = incoming.g - aggregate.g;
	float mergedMean = aggregate.g + delta * incoming.r / totalCount;
	float mergedM2 = aggregate.b + incoming.b
		+ delta * delta * aggregate.r * incoming.r / totalCount;
	aggregate = vec4(totalCount, mergedMean, mergedM2, 0.0);
}

void main() {
	ivec2 blockOrigin = ivec2(gl_FragCoord.xy) * 2;
	vec4 aggregate = uMode == 2
		? vec4(1.0e30, -1.0e30, 1.0e30, -1.0e30)
		: vec4(0.0);

	for (int y = 0; y < 2; y += 1) {
		for (int x = 0; x < 2; x += 1) {
			ivec2 coordinate = blockOrigin + ivec2(x, y);
			if (coordinate.x >= uSourceSize || coordinate.y >= uSourceSize) continue;
			vec4 value = texelFetch(uReduction, coordinate, 0);
			if (uMode == 0 || uMode == 1) {
				mergeStatistic(aggregate, value);
			} else if (uMode == 2) {
				aggregate.r = min(aggregate.r, value.r);
				aggregate.g = max(aggregate.g, value.g);
				aggregate.b = min(aggregate.b, value.b);
				aggregate.a = max(aggregate.a, value.a);
			} else if (uMode == 3) {
				aggregate.r += value.r;
				aggregate.g = max(aggregate.g, value.g);
				aggregate.b += value.b;
				aggregate.a += value.a;
			} else {
				aggregate += value;
			}
		}
	}
	fragmentColour = aggregate;
}
