#version 300 es

precision highp float;
precision highp int;
precision highp sampler2D;

in vec2 vUv;

uniform sampler2D uLinearBase;
uniform sampler2D uBlurredHighlight;
uniform vec4 uTreatment;
uniform vec2 uShape;
uniform int uGlass;
uniform int uGeometry;
uniform float uActiveRadiusFraction;
uniform vec2 uViewportSize;

layout(location = 0) out vec4 outColour;

vec3 srgbToLinear(vec3 colour) {
	vec3 low = colour / 12.92;
	vec3 high = pow((colour + 0.055) / 1.055, vec3(2.4));
	return mix(high, low, lessThanEqual(colour, vec3(0.04045)));
}

vec3 linearToSrgb(vec3 colour) {
	colour = max(vec3(0.0), colour);
	vec3 low = 12.92 * colour;
	vec3 high = 1.055 * pow(colour, vec3(1.0 / 2.4)) - 0.055;
	return mix(high, low, lessThanEqual(colour, vec3(0.0031308)));
}

vec3 acesFitted(vec3 colour) {
	return clamp(
		(colour * (2.51 * colour + 0.03)) / (colour * (2.43 * colour + 0.59) + 0.14),
		0.0,
		1.0
	);
}

float sampleBlurredHighlight(vec2 uv) {
	ivec2 size = textureSize(uBlurredHighlight, 0);
	vec2 point = clamp(uv, 0.0, 1.0) * vec2(size) - 0.5;
	ivec2 low = clamp(ivec2(floor(point)), ivec2(0), size - 1);
	ivec2 high = min(low + 1, size - 1);
	vec2 fraction = fract(point);
	float a = texelFetch(uBlurredHighlight, ivec2(low.x, low.y), 0).r;
	float b = texelFetch(uBlurredHighlight, ivec2(high.x, low.y), 0).r;
	float c = texelFetch(uBlurredHighlight, ivec2(low.x, high.y), 0).r;
	float d = texelFetch(uBlurredHighlight, ivec2(high.x, high.y), 0).r;
	return mix(mix(a, b, fraction.x), mix(c, d, fraction.x), fraction.y);
}

void main() {
	ivec2 baseSize = textureSize(uLinearBase, 0);
	ivec2 coordinate = clamp(ivec2(vUv * vec2(baseSize)), ivec2(0), baseSize - 1);
	vec3 colour = texelFetch(uLinearBase, coordinate, 0).rgb;
	vec3 warmHighlight = srgbToLinear(vec3(1.0, 91.0 / 255.0, 43.0 / 255.0));
	colour += warmHighlight * sampleBlurredHighlight(vUv) * uTreatment.y;
	vec2 squarePoint = vUv * 2.0 - 1.0;
	float aspect = uViewportSize.x / max(1.0, uViewportSize.y);
	if (aspect > 1.0) squarePoint.x *= aspect;
	else squarePoint.y /= aspect;
	if (uGlass == 1 && uGeometry == 0 && all(lessThanEqual(abs(squarePoint), vec2(1.0)))) {
		vec2 centered = squarePoint * 0.5;
		float radialDistance = length(centered);
		float meniscus = smoothstep(
			uActiveRadiusFraction - 0.035,
			uActiveRadiusFraction,
			radialDistance
		);
		float directional = 0.5 + 0.5 * dot(
			normalize(centered + vec2(1e-6)),
			normalize(vec2(-0.75, 0.66))
		);
		colour += srgbToLinear(vec3(0.15, 0.19, 0.22)) * meniscus * directional;
		colour *= 1.0 - 0.1 * smoothstep(0.0, uActiveRadiusFraction, radialDistance);
		float rim = 1.0 - smoothstep(0.006, 0.026, abs(radialDistance - uActiveRadiusFraction));
		colour += srgbToLinear(vec3(0.28, 0.35, 0.39)) * rim * directional * 0.55;
	}
	float luminance = dot(colour, vec3(0.2126, 0.7152, 0.0722));
	colour = max(vec3(0.0), mix(vec3(luminance), colour, uTreatment.w));
	colour = pow(colour, vec3(uShape.x)) * uTreatment.x;
	colour = acesFitted(colour);
	colour = pow(colour, vec3(1.0 / uShape.y));
	outColour = vec4(linearToSrgb(colour), 1.0);
}
