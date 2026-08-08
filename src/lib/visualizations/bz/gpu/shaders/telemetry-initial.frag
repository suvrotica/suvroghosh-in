#version 300 es
precision highp float;
precision highp int;

uniform sampler2D uState;
uniform int uSourceSize;
uniform int uMode;
uniform float uExcitationThreshold;
uniform float uNegativeTolerance;
uniform int uExcitationEnabled;

out vec4 fragmentColour;

bool finitePair(vec2 value) {
	return !any(isnan(value)) && !any(isinf(value));
}

void addStatistic(inout vec4 statistic, float sampleValue) {
	float nextCount = statistic.r + 1.0;
	float delta = sampleValue - statistic.g;
	float nextMean = statistic.g + delta / nextCount;
	statistic.b += delta * (sampleValue - nextMean);
	statistic.r = nextCount;
	statistic.g = nextMean;
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
			vec4 state = texelFetch(uState, coordinate, 0);
			bool isActiveCell = state.b >= 0.5 && state.a >= 0.5;
			if (!isActiveCell) continue;
			bool isFiniteCell = finitePair(state.rg);
			if (uMode == 0 || uMode == 1) {
				if (isFiniteCell) addStatistic(aggregate, uMode == 0 ? state.r : state.g);
			} else if (uMode == 2) {
				if (isFiniteCell) {
					aggregate.r = min(aggregate.r, state.r);
					aggregate.g = max(aggregate.g, state.r);
					aggregate.b = min(aggregate.b, state.g);
					aggregate.a = max(aggregate.a, state.g);
				}
			} else if (uMode == 3) {
				aggregate.r += 1.0;
				if (isFiniteCell) {
					aggregate.g = max(aggregate.g, max(abs(state.r), abs(state.g)));
					aggregate.b += state.r < -uNegativeTolerance || state.g < -uNegativeTolerance ? 1.0 : 0.0;
				} else {
					aggregate.a += 1.0;
				}
			} else if (uMode == 4) {
				aggregate.r += uExcitationEnabled == 1 && isFiniteCell && state.r > uExcitationThreshold
					? 1.0
					: 0.0;
			}
		}
	}
	fragmentColour = aggregate;
}
