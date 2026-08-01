import {
	MAX_NEWTON_ROOTS,
	MAX_PALETTE_STOPS,
	MAX_PERTURBATION_SHADER_ITERATIONS,
	MAX_POLYNOMIAL_COEFFICIENTS,
	MAX_SHADER_ITERATIONS
} from './shaderConstants';

export type FractalShaderVariant =
	| 'escape'
	| 'burning-ship'
	| 'tricorn'
	| 'phoenix'
	| 'custom-map'
	| 'newton'
	| 'quadratic-double-single'
	| 'quadratic-perturbation';

export const FRACTAL_VERTEX_SOURCE = `#version 300 es
precision highp float;

out vec2 v_uv;

void main() {
	vec2 positions[3] = vec2[3](
		vec2(-1.0, -1.0),
		vec2(3.0, -1.0),
		vec2(-1.0, 3.0)
	);
	vec2 position = positions[gl_VertexID];
	v_uv = position * 0.5 + 0.5;
	gl_Position = vec4(position, 0.0, 1.0);
}
`;

const COMMON_FRAGMENT_SOURCE = `
precision highp float;
precision highp int;

in vec2 v_uv;
out vec4 fragmentColor;

uniform vec2 u_resolution;
uniform vec2 u_center;
uniform float u_spanY;
uniform float u_rotation;
uniform int u_flipY;
uniform int u_planeMode;
uniform int u_familyId;
uniform int u_maxIterations;
uniform float u_bailoutSquared;
uniform int u_exponent;
uniform vec2 u_juliaC;
uniform vec2 u_phoenixP;
uniform vec2 u_phoenixPrevious;
uniform int u_customConjugate;
uniform int u_customAbsReal;
uniform int u_customAbsImaginary;
uniform int u_customAddC;
uniform int u_customMemory;
uniform vec2 u_customMemoryCoefficient;
uniform int u_customInitialZ;
uniform int u_customDistanceValid;
uniform int u_colorMode;
uniform float u_paletteOffset;
uniform float u_paletteCycles;
uniform float u_distanceLightAngle;
uniform float u_distanceLightStrength;
uniform int u_paletteCount;
uniform float u_palettePositions[${MAX_PALETTE_STOPS}];
uniform vec3 u_paletteColors[${MAX_PALETTE_STOPS}];
uniform vec3 u_interiorColor;
uniform int u_trapKind;
uniform vec2 u_trapPosition;
uniform float u_trapRadius;
uniform float u_trapSpacing;
uniform float u_trapRotation;
uniform float u_trapMix;
uniform int u_analyticInterior;
uniform float u_convergenceTolerance;
uniform float u_newtonRelaxation;
uniform float u_seed;

const int MAX_ITERATIONS = ${MAX_SHADER_ITERATIONS};
const int MAX_PALETTE_STOPS = ${MAX_PALETTE_STOPS};
const float LARGE_DISTANCE = 1.0e20;

vec2 complexMultiply(vec2 a, vec2 b) {
	return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x);
}

vec2 complexDivide(vec2 a, vec2 b) {
	float denominator = max(dot(b, b), 1.0e-30);
	return vec2(
		(a.x * b.x + a.y * b.y) / denominator,
		(a.y * b.x - a.x * b.y) / denominator
	);
}

vec2 complexPowerInteger(vec2 value, int exponent) {
	vec2 result = vec2(1.0, 0.0);
	for (int index = 0; index < 12; index += 1) {
		if (index >= exponent) break;
		result = complexMultiply(result, value);
	}
	return result;
}

vec2 pixelToComplex() {
	vec2 normalized = gl_FragCoord.xy / max(u_resolution, vec2(1.0));
	float localX = (normalized.x - 0.5) * u_spanY * (u_resolution.x / max(1.0, u_resolution.y));
	float localY = (normalized.y - 0.5) * u_spanY;
	if (u_flipY == 1) localY = -localY;
	float cosine = cos(u_rotation);
	float sine = sin(u_rotation);
	return u_center + vec2(
		cosine * localX - sine * localY,
		sine * localX + cosine * localY
	);
}

float randomDither(vec2 point) {
	vec3 value = fract(vec3(point.xyx) * 0.1031 + u_seed * 0.000001);
	value += dot(value, value.yzx + 33.33);
	return fract((value.x + value.y) * value.z);
}

vec3 palette(float inputValue) {
	float cycles = clamp(abs(u_paletteCycles), 0.05, 64.0);
	float value = fract(inputValue * cycles + u_paletteOffset);
	vec3 previousColor = u_paletteColors[0];
	float previousPosition = u_palettePositions[0];
	for (int index = 1; index < MAX_PALETTE_STOPS; index += 1) {
		if (index >= u_paletteCount) break;
		float position = u_palettePositions[index];
		vec3 color = u_paletteColors[index];
		if (value <= position) {
			float amount = clamp(
				(value - previousPosition) / max(position - previousPosition, 1.0e-6),
				0.0,
				1.0
			);
			return mix(previousColor, color, amount);
		}
		previousPosition = position;
		previousColor = color;
	}
	return previousColor;
}

vec3 categoricalPalette(int requestedIndex) {
	int count = max(1, u_paletteCount);
	int wrapped = ((requestedIndex % count) + count) % count;
	for (int index = 0; index < MAX_PALETTE_STOPS; index += 1) {
		if (index >= count) break;
		if (index == wrapped) return u_paletteColors[index];
	}
	return u_paletteColors[0];
}

float trapDistance(vec2 value) {
	vec2 local = value - u_trapPosition;
	float cosine = cos(u_trapRotation);
	float sine = sin(u_trapRotation);
	local = vec2(
		cosine * local.x + sine * local.y,
		-sine * local.x + cosine * local.y
	);
	float radius = max(abs(u_trapRadius), 1.0e-8);
	float spacing = max(abs(u_trapSpacing), 1.0e-8);
	if (u_trapKind == 0) return length(local);
	if (u_trapKind == 1) return abs(local.y);
	if (u_trapKind == 2) return abs(length(local) - radius);
	if (u_trapKind == 3) return min(abs(local.x), abs(local.y));
	vec2 grid = abs(mod(local + spacing * 0.5, spacing) - spacing * 0.5);
	return min(grid.x, grid.y);
}

bool knownMandelbrotInterior(vec2 c) {
	float shifted = c.x - 0.25;
	float q = shifted * shifted + c.y * c.y;
	bool cardioid = q * (q + shifted) <= 0.25 * c.y * c.y;
	bool periodTwoBulb = (c.x + 1.0) * (c.x + 1.0) + c.y * c.y <= 0.0625;
	return cardioid || periodTwoBulb;
}

vec3 escapeColor(
	bool escaped,
	int iteration,
	float smoothIteration,
	float distanceEstimate,
	float nearestTrap
) {
	if (!escaped && u_colorMode != 5) return u_interiorColor;
	float maximumIterations = max(1.0, float(u_maxIterations));
	float value = smoothIteration / max(12.0, maximumIterations * 0.12);
	float brightness = 1.0;
	if (u_colorMode == 0) {
		value = 0.98;
	} else if (u_colorMode == 1) {
		value = float((iteration / 3) % 24) / 24.0;
	} else if (u_colorMode == 4) {
		float worldPerPixel = u_spanY / max(1.0, u_resolution.y);
		float pixelDistance = distanceEstimate / max(1.0e-15, worldPerPixel);
		brightness = 0.22 + 0.78 * (1.0 - exp(-max(0.0, pixelDistance) * 0.12));
		vec2 localNormal = vec2(
			(v_uv.x - 0.5) * (u_resolution.x / max(1.0, u_resolution.y)),
			v_uv.y - 0.5
		);
		if (u_flipY == 1) localNormal.y = -localNormal.y;
		float cosine = cos(u_rotation);
		float sine = sin(u_rotation);
		vec2 planeNormal = vec2(
			cosine * localNormal.x - sine * localNormal.y,
			sine * localNormal.x + cosine * localNormal.y
		);
		planeNormal = length(planeNormal) > 1.0e-12
			? normalize(planeNormal)
			: vec2(0.0, 1.0);
		vec2 lightDirection = vec2(cos(u_distanceLightAngle), sin(u_distanceLightAngle));
		float directional = clamp(
			0.5 + 0.5 * dot(planeNormal, lightDirection),
			0.0,
			1.0
		);
		float relief = 0.28 + 0.72 * directional;
		brightness *= mix(1.0, relief, clamp(u_distanceLightStrength, 0.0, 1.0));
	} else if (u_colorMode == 5) {
		float normalizedTrap = nearestTrap / max(1.0e-15, u_spanY);
		float trapTone = exp(-normalizedTrap * 34.0);
		brightness = mix(0.25, 1.0, trapTone * clamp(u_trapMix, 0.0, 1.0));
		value = -log(max(1.0e-12, normalizedTrap)) * 0.073;
	}
	vec3 color = palette(value) * brightness;
	float dither = (randomDither(gl_FragCoord.xy) - 0.5) / 255.0;
	return clamp(color + dither, 0.0, 1.0);
}
`;

const ESCAPE_MAIN_PREFIX = `
void main() {
	vec2 point = pixelToComplex();
	bool parameterPlane = u_planeMode == 0;
	vec2 z = parameterPlane ? vec2(0.0) : point;
	vec2 c = parameterPlane ? point : u_juliaC;
	if (u_familyId == 11) {
		if (u_customInitialZ == 1) {
			z = vec2(0.0);
		} else if (u_customInitialZ == 2) {
			z = point;
		} else if (u_customInitialZ == 3) {
			z = c;
		}
	}
	vec2 previous = u_familyId == 5 ? u_phoenixPrevious : vec2(0.0);
	vec2 derivative = parameterPlane ? vec2(0.0) : vec2(1.0, 0.0);
	if (u_familyId == 11) {
		if (u_customInitialZ == 1) {
			derivative = vec2(0.0);
		} else if (u_customInitialZ == 2) {
			derivative = vec2(1.0, 0.0);
		} else if (u_customInitialZ == 3) {
			derivative = parameterPlane ? vec2(1.0, 0.0) : vec2(0.0);
		}
		if (u_customDistanceValid == 0) derivative = vec2(0.0);
	}
	vec2 previousDerivative = vec2(0.0);
	vec2 checkpoint = z;
	vec2 checkpointPrevious = previous;
	float nearestTrap = parameterPlane ? LARGE_DISTANCE : trapDistance(z);
	bool escaped = false;
	int escapeIteration = u_maxIterations;
	float smoothIteration = float(u_maxIterations);
	float distanceEstimate = 0.0;

	if (
		u_analyticInterior == 1 &&
		u_familyId == 0 &&
		parameterPlane &&
		u_colorMode != 5 &&
		knownMandelbrotInterior(c)
	) {
		fragmentColor = vec4(u_interiorColor, 1.0);
		return;
	}

	float initialRadiusSquared = dot(z, z);
	if (initialRadiusSquared > u_bailoutSquared) {
		float initialRadius = sqrt(initialRadiusSquared);
		float logMagnitude = log(max(1.000001, initialRadius));
		float initialSmoothIteration = 1.0 -
			log(max(1.0e-12, logMagnitude)) / log(max(2.0, float(u_exponent)));
		float derivativeMagnitude = length(derivative);
		float initialDistanceEstimate = derivativeMagnitude > 1.0e-12
			? 0.5 * log(initialRadiusSquared) * initialRadius / derivativeMagnitude
			: 0.0;
		fragmentColor = vec4(
			escapeColor(
				true,
				0,
				initialSmoothIteration,
				initialDistanceEstimate,
				nearestTrap
			),
			1.0
		);
		return;
	}

	for (int iteration = 0; iteration < MAX_ITERATIONS; iteration += 1) {
		if (iteration >= u_maxIterations) break;
		vec2 oldZ = z;
		vec2 oldDerivative = derivative;
`;

const ESCAPE_MAIN_SUFFIX = `
		nearestTrap = min(nearestTrap, trapDistance(z));
		float radiusSquared = dot(z, z);
		if (isnan(radiusSquared) || isinf(radiusSquared)) {
			escaped = true;
			escapeIteration = iteration + 1;
			smoothIteration = float(escapeIteration);
			break;
		}
		if (radiusSquared > u_bailoutSquared) {
			escaped = true;
			escapeIteration = iteration + 1;
			float exponent = max(2.0, float(u_exponent));
			float logMagnitude = log(max(1.000001, sqrt(radiusSquared)));
			smoothIteration = float(iteration + 2) -
				log(max(1.0e-12, logMagnitude)) / log(exponent);
			float derivativeMagnitude = length(derivative);
			if (derivativeMagnitude > 1.0e-12) {
				distanceEstimate =
					0.5 * log(radiusSquared) * sqrt(radiusSquared) / derivativeMagnitude;
			}
			break;
		}
		if (
			iteration > 20 &&
			dot(z - checkpoint, z - checkpoint) < 1.0e-18 &&
			(
				(
					u_familyId != 5 &&
					(u_familyId != 11 || u_customMemory == 0)
				) ||
				dot(previous - checkpointPrevious, previous - checkpointPrevious) < 1.0e-18
			)
		) {
			break;
		}
		if (iteration % 20 == 0) {
			checkpoint = z;
			checkpointPrevious = previous;
		}
	}

	vec3 color = escapeColor(
		escaped,
		escapeIteration,
		smoothIteration,
		distanceEstimate,
		nearestTrap
	);
	fragmentColor = vec4(color, 1.0);
}
`;

const ESCAPE_STEP = `
		int exponent = clamp(u_exponent, 2, 12);
		vec2 factor = float(exponent) * complexPowerInteger(oldZ, exponent - 1);
		z = complexPowerInteger(oldZ, exponent) + c;
		derivative = complexMultiply(factor, oldDerivative);
		if (parameterPlane) derivative += vec2(1.0, 0.0);
`;

const BURNING_SHIP_STEP = `
		vec2 folded = abs(oldZ);
		vec2 signedDerivative = oldDerivative * sign(oldZ + vec2(1.0e-20));
		z = complexMultiply(folded, folded) + c;
		derivative = complexMultiply(2.0 * folded, signedDerivative);
		if (parameterPlane) derivative += vec2(1.0, 0.0);
`;

const TRICORN_STEP = `
		vec2 conjugateZ = vec2(oldZ.x, -oldZ.y);
		vec2 conjugateDerivative = vec2(oldDerivative.x, -oldDerivative.y);
		z = complexMultiply(conjugateZ, conjugateZ) + c;
		derivative = complexMultiply(2.0 * conjugateZ, conjugateDerivative);
		if (parameterPlane) derivative += vec2(1.0, 0.0);
`;

const PHOENIX_STEP = `
		z = complexMultiply(oldZ, oldZ) + c + complexMultiply(u_phoenixP, previous);
		derivative =
			complexMultiply(2.0 * oldZ, oldDerivative) +
			complexMultiply(u_phoenixP, previousDerivative);
		if (parameterPlane) derivative += vec2(1.0, 0.0);
		previous = oldZ;
		previousDerivative = oldDerivative;
`;

const CUSTOM_MAP_STEP = `
		vec2 transformed = oldZ;
		if (u_customConjugate == 1) transformed.y = -transformed.y;
		if (u_customAbsReal == 1) transformed.x = abs(transformed.x);
		if (u_customAbsImaginary == 1) transformed.y = abs(transformed.y);
		int exponent = clamp(u_exponent, 2, 12);
		z = complexPowerInteger(transformed, exponent);
		if (u_customAddC == 1) z += c;
		if (u_customMemory == 1) {
			z += complexMultiply(u_customMemoryCoefficient, previous);
		}
		if (u_customDistanceValid == 1) {
			vec2 factor = float(exponent) * complexPowerInteger(transformed, exponent - 1);
			derivative = complexMultiply(factor, oldDerivative);
			if (u_customAddC == 1 && parameterPlane) derivative += vec2(1.0, 0.0);
			if (u_customMemory == 1) {
				derivative += complexMultiply(u_customMemoryCoefficient, previousDerivative);
			}
		} else {
			derivative = vec2(0.0);
		}
		if (u_customMemory == 1) {
			previous = oldZ;
			previousDerivative = oldDerivative;
		}
`;

const NEWTON_SOURCE = `
uniform int u_polynomialCount;
uniform vec2 u_polynomial[${MAX_POLYNOMIAL_COEFFICIENTS}];
uniform int u_rootCount;
uniform vec2 u_roots[${MAX_NEWTON_ROOTS}];

const int MAX_POLYNOMIAL_COEFFICIENTS = ${MAX_POLYNOMIAL_COEFFICIENTS};
const int MAX_ROOTS = ${MAX_NEWTON_ROOTS};

void evaluatePolynomial(vec2 z, out vec2 value, out vec2 derivative) {
	value = u_polynomial[0];
	derivative = vec2(0.0);
	for (int index = 1; index < MAX_POLYNOMIAL_COEFFICIENTS; index += 1) {
		if (index >= u_polynomialCount) break;
		derivative = complexMultiply(derivative, z) + value;
		value = complexMultiply(value, z) + u_polynomial[index];
	}
}

int closestRoot(vec2 value) {
	int selected = -1;
	float nearest = LARGE_DISTANCE;
	for (int index = 0; index < MAX_ROOTS; index += 1) {
		if (index >= u_rootCount) break;
		float distanceSquared = dot(value - u_roots[index], value - u_roots[index]);
		if (distanceSquared < nearest) {
			nearest = distanceSquared;
			selected = index;
		}
	}
	return selected;
}

void main() {
	vec2 z = pixelToComplex();
	float nearestTrap = trapDistance(z);
	float tolerance = clamp(abs(u_convergenceTolerance), 1.0e-15, 0.1);
	bool converged = false;
	int convergenceIteration = u_maxIterations;
	float residual = LARGE_DISTANCE;

	for (int iteration = 0; iteration < MAX_ITERATIONS; iteration += 1) {
		if (iteration >= u_maxIterations) break;
		vec2 polynomialValue;
		vec2 polynomialDerivative;
		evaluatePolynomial(z, polynomialValue, polynomialDerivative);
		residual = length(polynomialValue);
		if (residual <= tolerance) {
			converged = true;
			convergenceIteration = iteration;
			break;
		}
		if (dot(polynomialDerivative, polynomialDerivative) < 1.0e-24) break;
		vec2 step = complexDivide(polynomialValue, polynomialDerivative) *
			clamp(u_newtonRelaxation, 0.05, 2.0);
		z -= step;
		nearestTrap = min(nearestTrap, trapDistance(z));
		if (any(isnan(z)) || any(isinf(z))) break;
		if (length(step) <= tolerance) {
			vec2 finalValue;
			vec2 finalDerivative;
			evaluatePolynomial(z, finalValue, finalDerivative);
			residual = length(finalValue);
			if (residual <= tolerance) {
				converged = true;
				convergenceIteration = iteration + 1;
				break;
			}
		}
	}

	if (!converged) {
		vec2 finalValue;
		vec2 finalDerivative;
		evaluatePolynomial(z, finalValue, finalDerivative);
		residual = length(finalValue);
		if (residual <= tolerance) {
			converged = true;
			convergenceIteration = u_maxIterations;
		}
	}

	if (!converged) {
		fragmentColor = vec4(u_interiorColor, 1.0);
		return;
	}

	int rootIndex = closestRoot(z);
	float rootValue = float(max(rootIndex, 0)) / max(1.0, float(u_rootCount));
	float progress = 1.0 -
		clamp(float(convergenceIteration) / max(1.0, float(u_maxIterations)), 0.0, 1.0);
	float value = rootValue;
	float brightness = 0.32 + 0.68 * progress;
	if (u_colorMode == 0) {
		value = 0.98;
		brightness = 1.0;
	} else if (u_colorMode == 1) {
		value += float((convergenceIteration / 2) % 12) / 12.0;
	} else if (u_colorMode == 4) {
		brightness = 0.28 + 0.72 * exp(-residual / max(tolerance, 1.0e-12));
	} else if (u_colorMode == 5) {
		float normalizedTrap = nearestTrap / max(1.0e-15, u_spanY);
		brightness = 0.25 + 0.75 * exp(-normalizedTrap * 34.0);
		value = -log(max(1.0e-12, normalizedTrap)) * 0.073;
	}
	vec3 baseColor = u_colorMode == 6 ? categoricalPalette(rootIndex) : palette(value);
	vec3 color = baseColor * brightness;
	float dither = (randomDither(gl_FragCoord.xy) - 0.5) / 255.0;
	fragmentColor = vec4(clamp(color + dither, 0.0, 1.0), 1.0);
}
`;

/**
 * Bailey-style double-single arithmetic implemented entirely in highp float
 * operations. Viewport mapping and quadratic orbit arithmetic retain hi/lo
 * pairs throughout; converting to vec2 happens only for bailout and colouring.
 */
export const DOUBLE_SINGLE_GLSL_SOURCE = `
uniform vec2 u_centerHi;
uniform vec2 u_centerLo;
uniform vec2 u_spanYPair;
uniform vec2 u_juliaCHi;
uniform vec2 u_juliaCLo;

const float DS_SPLITTER = 4097.0;

struct DS {
	float hi;
	float lo;
};

struct DSComplex {
	DS re;
	DS im;
};

DS dsMake(float hi, float lo) {
	float sum = hi + lo;
	return DS(sum, lo - (sum - hi));
}

DS dsFloat(float value) {
	return DS(value, 0.0);
}

DS dsAdd(DS a, DS b) {
	float sum = a.hi + b.hi;
	float virtualB = sum - a.hi;
	float error = (a.hi - (sum - virtualB)) + (b.hi - virtualB) + a.lo + b.lo;
	return dsMake(sum, error);
}

DS dsNegate(DS value) {
	return DS(-value.hi, -value.lo);
}

DS dsSubtract(DS a, DS b) {
	return dsAdd(a, dsNegate(b));
}

void dsSplitFloat(float value, out float high, out float low) {
	float scaled = value * DS_SPLITTER;
	high = scaled - (scaled - value);
	low = value - high;
}

DS dsMultiply(DS a, DS b) {
	float product = a.hi * b.hi;
	float aHigh;
	float aLow;
	float bHigh;
	float bLow;
	dsSplitFloat(a.hi, aHigh, aLow);
	dsSplitFloat(b.hi, bHigh, bLow);
	float error = aHigh * bHigh - product;
	error += aHigh * bLow + aLow * bHigh + aLow * bLow;
	error += a.hi * b.lo + a.lo * b.hi + a.lo * b.lo;
	return dsMake(product, error);
}

DS dsScale(DS value, float scalar) {
	return dsMultiply(value, dsFloat(scalar));
}

DSComplex dsComplex(vec2 high, vec2 low) {
	return DSComplex(dsMake(high.x, low.x), dsMake(high.y, low.y));
}

DSComplex dsComplexFloat(vec2 value) {
	return DSComplex(dsFloat(value.x), dsFloat(value.y));
}

DSComplex dsComplexAdd(DSComplex a, DSComplex b) {
	return DSComplex(dsAdd(a.re, b.re), dsAdd(a.im, b.im));
}

DSComplex dsComplexMultiply(DSComplex a, DSComplex b) {
	return DSComplex(
		dsSubtract(dsMultiply(a.re, b.re), dsMultiply(a.im, b.im)),
		dsAdd(dsMultiply(a.re, b.im), dsMultiply(a.im, b.re))
	);
}

DSComplex dsComplexScale(DSComplex value, float scalar) {
	return DSComplex(dsScale(value.re, scalar), dsScale(value.im, scalar));
}

vec2 dsComplexValue(DSComplex value) {
	return vec2(value.re.hi + value.re.lo, value.im.hi + value.im.lo);
}

DSComplex dsPixelOffsetFrom(vec2 originNormalized) {
	vec2 normalized = gl_FragCoord.xy / max(u_resolution, vec2(1.0));
	float xUnit = (normalized.x - originNormalized.x) *
		(u_resolution.x / max(1.0, u_resolution.y));
	float yUnit = normalized.y - originNormalized.y;
	if (u_flipY == 1) yUnit = -yUnit;
	DS span = dsMake(u_spanYPair.x, u_spanYPair.y);
	DS localX = dsScale(span, xUnit);
	DS localY = dsScale(span, yUnit);
	float cosine = cos(u_rotation);
	float sine = sin(u_rotation);
	return DSComplex(
		dsSubtract(dsScale(localX, cosine), dsScale(localY, sine)),
		dsAdd(dsScale(localX, sine), dsScale(localY, cosine))
	);
}

DSComplex dsPixelToComplex() {
	return dsComplexAdd(
		dsComplex(u_centerHi, u_centerLo),
		dsPixelOffsetFrom(vec2(0.5))
	);
}
`;

const DOUBLE_SINGLE_QUADRATIC_SOURCE = `
void main() {
	DSComplex point = dsPixelToComplex();
	bool parameterPlane = u_planeMode == 0;
	DSComplex z;
	DSComplex c;
	DSComplex derivative;
	if (parameterPlane) {
		z = dsComplexFloat(vec2(0.0));
		c = point;
		derivative = dsComplexFloat(vec2(0.0));
	} else {
		z = point;
		c = dsComplex(u_juliaCHi, u_juliaCLo);
		derivative = dsComplexFloat(vec2(1.0, 0.0));
	}
	float nearestTrap = parameterPlane ? LARGE_DISTANCE : trapDistance(dsComplexValue(z));
	bool escaped = false;
	int escapeIteration = u_maxIterations;
	float smoothIteration = float(u_maxIterations);
	float distanceEstimate = 0.0;

	vec2 initial = dsComplexValue(z);
	float initialRadiusSquared = dot(initial, initial);
	if (initialRadiusSquared > u_bailoutSquared) {
		float initialRadius = sqrt(initialRadiusSquared);
		smoothIteration = 1.0 -
			log(max(1.0e-12, log(max(1.000001, initialRadius)))) / log(2.0);
		fragmentColor = vec4(
			escapeColor(true, 0, smoothIteration, 0.0, nearestTrap),
			1.0
		);
		return;
	}

	for (int iteration = 0; iteration < MAX_ITERATIONS; iteration += 1) {
		if (iteration >= u_maxIterations) break;
		DSComplex oldZ = z;
		derivative = dsComplexScale(dsComplexMultiply(oldZ, derivative), 2.0);
		if (parameterPlane) {
			derivative = dsComplexAdd(derivative, dsComplexFloat(vec2(1.0, 0.0)));
		}
		z = dsComplexAdd(dsComplexMultiply(oldZ, oldZ), c);
		vec2 representedZ = dsComplexValue(z);
		nearestTrap = min(nearestTrap, trapDistance(representedZ));
		float radiusSquared = dot(representedZ, representedZ);
		if (isnan(radiusSquared) || isinf(radiusSquared)) {
			escaped = true;
			escapeIteration = iteration + 1;
			smoothIteration = float(escapeIteration);
			break;
		}
		if (radiusSquared > u_bailoutSquared) {
			escaped = true;
			escapeIteration = iteration + 1;
			float radius = sqrt(radiusSquared);
			smoothIteration = float(iteration + 2) -
				log(max(1.0e-12, log(max(1.000001, radius)))) / log(2.0);
			float derivativeMagnitude = length(dsComplexValue(derivative));
			if (derivativeMagnitude > 1.0e-12) {
				distanceEstimate = 0.5 * log(radiusSquared) * radius / derivativeMagnitude;
			}
			break;
		}
	}

	fragmentColor = vec4(
		escapeColor(
			escaped,
			escapeIteration,
			smoothIteration,
			distanceEstimate,
			nearestTrap
		),
		1.0
	);
}
`;

const PERTURBATION_SOURCE = `
uniform highp sampler2D u_referenceOrbit;
uniform highp sampler2D u_referenceMetadata;
uniform int u_referenceOrbitLength;
uniform int u_referenceGridSize;

vec4 referenceValue(int tileIndex, int iteration) {
	return texelFetch(u_referenceOrbit, ivec2(iteration, tileIndex), 0);
}

vec2 referencePoint(int tileIndex) {
	vec4 packed = texelFetch(u_referenceMetadata, ivec2(0, tileIndex), 0);
	return packed.xy + packed.zw;
}

int referenceLength(int tileIndex) {
	return int(texelFetch(u_referenceMetadata, ivec2(1, tileIndex), 0).x + 0.5);
}

vec2 perturbationPixelOffsetFrom(vec2 originNormalized) {
	vec2 normalized = gl_FragCoord.xy / max(u_resolution, vec2(1.0));
	float xUnit = (normalized.x - originNormalized.x) *
		(u_resolution.x / max(1.0, u_resolution.y));
	float yUnit = normalized.y - originNormalized.y;
	if (u_flipY == 1) yUnit = -yUnit;
	vec2 local = vec2(xUnit, yUnit) * u_spanY;
	float cosine = cos(u_rotation);
	float sine = sin(u_rotation);
	return vec2(
		local.x * cosine - local.y * sine,
		local.x * sine + local.y * cosine
	);
}

void main() {
	vec2 normalized = gl_FragCoord.xy / max(u_resolution, vec2(1.0));
	int gridSize = clamp(u_referenceGridSize, 1, 4);
	ivec2 tile = min(
		ivec2(gridSize - 1),
		max(ivec2(0), ivec2(floor(normalized * float(gridSize))))
	);
	int tileIndex = tile.y * gridSize + tile.x;
	vec2 tileOrigin = (vec2(tile) + vec2(0.5)) / float(gridSize);
	vec2 pixelDelta = perturbationPixelOffsetFrom(tileOrigin);
	vec2 point = referencePoint(tileIndex) + pixelDelta;
	bool parameterPlane = u_planeMode == 0;
	int tileReferenceLength = referenceLength(tileIndex);
	vec2 delta = vec2(0.0);
	vec2 deltaC = vec2(0.0);
	if (parameterPlane) {
		deltaC = pixelDelta;
	} else {
		delta = pixelDelta;
	}
	bool escaped = false;
	bool glitch = false;
	int escapeIteration = u_maxIterations;
	float smoothIteration = float(u_maxIterations);
	float distanceEstimate = 0.0;
	float nearestTrap = parameterPlane ? LARGE_DISTANCE : trapDistance(point);
	float initialRadiusSquared = dot(point, point);
	if (!parameterPlane && initialRadiusSquared > u_bailoutSquared) {
		escaped = true;
		escapeIteration = 0;
		float radius = sqrt(initialRadiusSquared);
		smoothIteration = 1.0 -
			log(max(1.0e-12, log(max(1.000001, radius)))) / log(2.0);
	}

	for (int iteration = 0; iteration < MAX_ITERATIONS; iteration += 1) {
		if (escaped) break;
		if (iteration >= u_maxIterations) break;
		if (
			iteration + 1 >= u_referenceOrbitLength ||
			iteration + 1 >= tileReferenceLength
		) {
			glitch = true;
			break;
		}
		vec4 referenceBefore = referenceValue(tileIndex, iteration);
		vec4 referenceAfter = referenceValue(tileIndex, iteration + 1);
		vec2 linear = 2.0 * (
			complexMultiply(referenceBefore.xy, delta) +
			complexMultiply(referenceBefore.zw, delta)
		);
		delta = linear + complexMultiply(delta, delta) + deltaC;
		vec2 representedReference = referenceAfter.xy + referenceAfter.zw;
		vec2 representedActual = referenceAfter.xy + (referenceAfter.zw + delta);
		vec2 representedDelta = delta;
		float actualMagnitude = length(representedActual);
		float referenceMagnitude = length(representedReference);
		float deltaMagnitude = length(representedDelta);
		bool cancellationGlitch =
			actualMagnitude < referenceMagnitude * 1.0e-6 &&
			deltaMagnitude > referenceMagnitude * 0.5;
		if (
			any(isnan(representedActual)) ||
			any(isinf(representedActual)) ||
			cancellationGlitch
		) {
			glitch = true;
			break;
		}
		nearestTrap = min(nearestTrap, trapDistance(representedActual));
		float radiusSquared = dot(representedActual, representedActual);
		if (radiusSquared > u_bailoutSquared) {
			escaped = true;
			escapeIteration = iteration + 1;
			float radius = sqrt(radiusSquared);
			smoothIteration = float(iteration + 2) -
				log(max(1.0e-12, log(max(1.000001, radius)))) / log(2.0);
			break;
		}
	}

	if (glitch) {
		// A direct double-single restart from an absolute coordinate would
		// collapse at precisely the scales where perturbation is needed. Mark
		// the pixel instead of inventing apparently plausible detail.
		fragmentColor = vec4(1.0, 0.16, 0.72, 1.0);
		return;
	}

	fragmentColor = vec4(
		escapeColor(
			escaped,
			escapeIteration,
			smoothIteration,
			distanceEstimate,
			nearestTrap
		),
		1.0
	);
}
`;

export function fractalFragmentSource(variant: FractalShaderVariant) {
	const iterationCap =
		variant === 'quadratic-perturbation'
			? MAX_PERTURBATION_SHADER_ITERATIONS
			: MAX_SHADER_ITERATIONS;
	const commonSource = COMMON_FRAGMENT_SOURCE.replace(
		`const int MAX_ITERATIONS = ${MAX_SHADER_ITERATIONS};`,
		`const int MAX_ITERATIONS = ${iterationCap};`
	);
	const header = `#version 300 es\n${commonSource}`;
	switch (variant) {
		case 'escape':
			return `${header}${ESCAPE_MAIN_PREFIX}${ESCAPE_STEP}${ESCAPE_MAIN_SUFFIX}`;
		case 'burning-ship':
			return `${header}${ESCAPE_MAIN_PREFIX}${BURNING_SHIP_STEP}${ESCAPE_MAIN_SUFFIX}`;
		case 'tricorn':
			return `${header}${ESCAPE_MAIN_PREFIX}${TRICORN_STEP}${ESCAPE_MAIN_SUFFIX}`;
		case 'phoenix':
			return `${header}${ESCAPE_MAIN_PREFIX}${PHOENIX_STEP}${ESCAPE_MAIN_SUFFIX}`;
		case 'custom-map':
			return `${header}${ESCAPE_MAIN_PREFIX}${CUSTOM_MAP_STEP}${ESCAPE_MAIN_SUFFIX}`;
		case 'newton':
			return `${header}${NEWTON_SOURCE}`;
		case 'quadratic-double-single':
			return `${header}${DOUBLE_SINGLE_GLSL_SOURCE}${DOUBLE_SINGLE_QUADRATIC_SOURCE}`;
		case 'quadratic-perturbation':
			return `${header}${PERTURBATION_SOURCE}`;
	}
}
