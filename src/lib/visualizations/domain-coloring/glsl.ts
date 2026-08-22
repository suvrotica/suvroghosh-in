/** Shared WebGL1-compatible complex arithmetic and phase-colour implementation. */
export const DOMAIN_GLSL_LIBRARY = String.raw`
const float PI = 3.141592653589793;
const float TAU = 6.283185307179586;
const float INVALID_SENTINEL = 9.0e29;

vec2 c_mul(vec2 a, vec2 b) {
	return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x);
}

vec2 c_div(vec2 a, vec2 b) {
	float denominator = dot(b, b);
	if (denominator == 0.0) {
		if (dot(a, a) == 0.0) return vec2(INVALID_SENTINEL, -INVALID_SENTINEL);
		return vec2(sign(a.x + 1.0e-20), sign(a.y + 1.0e-20)) * 1.0e18;
	}
	return vec2(
		(a.x * b.x + a.y * b.y) / denominator,
		(a.y * b.x - a.x * b.y) / denominator
	);
}

vec2 c_exp(vec2 value) {
	if (value.x > 42.0) return vec2(cos(value.y), sin(value.y)) * 1.0e18;
	if (value.x < -42.0) return vec2(0.0);
	float scale = exp(value.x);
	return scale * vec2(cos(value.y), sin(value.y));
}

vec2 c_log(vec2 value) {
	float radius = length(value);
	if (radius == 0.0) return vec2(INVALID_SENTINEL, -INVALID_SENTINEL);
	return vec2(log(radius), atan(value.y, value.x));
}

vec2 c_sin(vec2 value) {
	if (abs(value.y) > 42.0) return vec2(INVALID_SENTINEL, -INVALID_SENTINEL);
	float positive = exp(value.y);
	float negative = 1.0 / positive;
	float coshY = 0.5 * (positive + negative);
	float sinhY = 0.5 * (positive - negative);
	return vec2(sin(value.x) * coshY, cos(value.x) * sinhY);
}

vec2 c_cos(vec2 value) {
	if (abs(value.y) > 42.0) return vec2(INVALID_SENTINEL, -INVALID_SENTINEL);
	float positive = exp(value.y);
	float negative = 1.0 / positive;
	float coshY = 0.5 * (positive + negative);
	float sinhY = 0.5 * (positive - negative);
	return vec2(cos(value.x) * coshY, -sin(value.x) * sinhY);
}

vec2 c_tan(vec2 value) {
	return c_div(c_sin(value), c_cos(value));
}

vec2 c_sqrt(vec2 value) {
	float radius = length(value);
	float realPart = sqrt(max(0.0, 0.5 * (radius + value.x)));
	float imaginaryPart = sqrt(max(0.0, 0.5 * (radius - value.x)));
	return vec2(realPart, value.y < 0.0 ? -imaginaryPart : imaginaryPart);
}

vec2 c_conj(vec2 value) {
	return vec2(value.x, -value.y);
}

vec2 c_sinc(vec2 value) {
	vec2 result = vec2(1.0, 0.0);
	if (length(value) >= 1.0e-3) {
		result = c_div(c_sin(value), value);
	} else {
		vec2 z2 = c_mul(value, value);
		vec2 z4 = c_mul(z2, z2);
		vec2 z6 = c_mul(z4, z2);
		result = vec2(1.0, 0.0) - z2 / 6.0 + z4 / 120.0 - z6 / 5040.0;
	}
	return result;
}

vec2 c_pow(vec2 base, vec2 exponent) {
	return c_exp(c_mul(exponent, c_log(base)));
}

vec2 c_powi(vec2 base, int exponent) {
	vec2 result = vec2(1.0, 0.0);
	vec2 factor = base;
	int remaining = exponent < 0 ? -exponent : exponent;
	for (int index = 0; index < 31; index++) {
		if (remaining > 0) {
			if (remaining - (remaining / 2) * 2 == 1) result = c_mul(result, factor);
			factor = c_mul(factor, factor);
			remaining = remaining / 2;
		}
	}
	return exponent < 0 ? c_div(vec2(1.0, 0.0), result) : result;
}

bool invalid_complex(vec2 value) {
	return value.x != value.x || value.y != value.y ||
		abs(value.x) > 1.0e28 || abs(value.y) > 1.0e28;
}

vec3 hsv_to_rgb(float hue, float saturation, float value) {
	vec3 phase = abs(fract(hue + vec3(0.0, 0.6666667, 0.3333333)) * 6.0 - 3.0);
	return value * mix(vec3(1.0), clamp(phase - 1.0, 0.0, 1.0), saturation);
}

vec3 domain_colour(vec2 value, bool contours) {
	float magnitude = max(length(value), 1.0e-30);
	float logMagnitude = log(magnitude);
	float logBand = fract(logMagnitude / log(2.0));
	float magnitudeDistance = min(logBand, 1.0 - logBand);
	float phase = atan(value.y, value.x);
	float hue = fract(phase / TAU + 1.0);
	float phaseBand = fract(hue * 12.0);
	float phaseDistance = min(phaseBand, 1.0 - phaseBand);
	float magnitudeContour = contours ? smoothstep(0.025, 0.065, magnitudeDistance) : 1.0;
	float phaseContour = contours ? smoothstep(0.012, 0.034, phaseDistance) : 1.0;
	float seaContour = contours ? smoothstep(0.035, 0.08, abs(logMagnitude / log(2.0))) : 1.0;
	float bandLight = 0.78 + 0.16 * cos(TAU * logBand);
	vec3 colour = hsv_to_rgb(hue, 0.84, bandLight);
	colour *= mix(0.62, 1.0, magnitudeContour);
	colour *= mix(0.76, 1.0, phaseContour);
	colour *= mix(0.78, 1.0, seaContour);
	float zeroWeight = 1.0 - smoothstep(-22.0, -16.0, logMagnitude);
	colour = mix(colour, vec3(0.004, 0.008, 0.025), zeroWeight);
	float poleWeight = smoothstep(16.0, 22.0, logMagnitude);
	colour = mix(colour, vec3(1.0, 0.96, 0.88), poleWeight);
	return pow(clamp(colour, 0.0, 1.0), vec3(0.92));
}
`;
