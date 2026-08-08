#version 300 es

precision highp float;
precision highp int;
precision highp sampler2D;

uniform sampler2D uState;
uniform vec2 uActiveMean;
uniform float uFraction;

layout(location = 0) out vec4 outState;

void main() {
	ivec2 coordinate = ivec2(gl_FragCoord.xy);
	vec4 value = texelFetch(uState, coordinate, 0);
	if (value.b >= 0.5 && value.a >= 0.5) {
		value.rg = mix(value.rg, uActiveMean, uFraction);
	}
	outState = value;
}
