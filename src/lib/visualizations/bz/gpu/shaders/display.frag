#version 300 es

precision highp float;
precision highp int;
precision highp sampler2D;

in vec2 vUv;

uniform sampler2D uState;
uniform int uGridSize;
uniform int uPeriodic;
uniform int uGeometry;
uniform int uModel;
uniform int uView;
uniform int uPalette;
uniform float uActiveRadiusFraction;
uniform float uSpacingSquared;
uniform float uDiffusionU;
uniform float uDiffusionV;
uniform float uEpsilon;
uniform float uQ;
uniform float uF;
uniform float uA;
uniform float uB;
uniform float uGamma;
uniform vec2 uActiveMean;
uniform float uDiagnosticScale;
uniform float uExposure;
uniform float uGammaDisplay;
uniform int uGlass;
uniform vec2 uViewportSize;
uniform int uV2Display;
uniform int uV2Style;
uniform vec2 uV2RangeU;
uniform vec2 uV2RangeV;
uniform vec2 uV2RangeReaction;
uniform vec2 uV2RangeDiffusion;
uniform vec2 uV2RangeNet;
uniform vec2 uV2RangeFront;
uniform vec2 uV2RangeDifference;
uniform vec4 uV2Phase;
uniform vec4 uV2Treatment;
uniform vec4 uV2LuminousMix;
uniform vec4 uV2FerroinMix;
uniform vec3 uV2Shape;
uniform vec2 uV2Bloom;
uniform int uV2OutputLinear;
uniform sampler2D uV2PhaseLut;
uniform sampler2D uV2PaletteLut;
uniform sampler2D uV2DivergingLut;

layout(location = 0) out vec4 outColour;

const float PI = 3.14159265358979323846;
const float TAU = 6.28318530717958647692;

ivec2 wrapCoordinate(ivec2 coordinate) {
	return ivec2(
		(coordinate.x % uGridSize + uGridSize) % uGridSize,
		(coordinate.y % uGridSize + uGridSize) % uGridSize
	);
}

vec4 neighbourState(ivec2 neighbour, vec4 centre) {
	bool outside = neighbour.x < 0 || neighbour.y < 0 || neighbour.x >= uGridSize || neighbour.y >= uGridSize;
	if (outside) {
		if (uPeriodic == 0) return centre;
		neighbour = wrapCoordinate(neighbour);
	}
	vec4 sampleValue = texelFetch(uState, neighbour, 0);
	return sampleValue.b < 0.5 ? centre : sampleValue;
}

vec2 laplacianAt(ivec2 coordinate, vec4 centre) {
	vec2 north = neighbourState(coordinate + ivec2(0, 1), centre).rg;
	vec2 south = neighbourState(coordinate + ivec2(0, -1), centre).rg;
	vec2 east = neighbourState(coordinate + ivec2(1, 0), centre).rg;
	vec2 west = neighbourState(coordinate + ivec2(-1, 0), centre).rg;
	return (north + south + east + west - 4.0 * centre.rg) / uSpacingSquared;
}

float frontAt(ivec2 coordinate, vec4 centre) {
	float north = neighbourState(coordinate + ivec2(0, 1), centre).r;
	float south = neighbourState(coordinate + ivec2(0, -1), centre).r;
	float east = neighbourState(coordinate + ivec2(1, 0), centre).r;
	float west = neighbourState(coordinate + ivec2(-1, 0), centre).r;
	return length(vec2(east - west, north - south)) / (2.0 * sqrt(uSpacingSquared));
}

bool finiteActive(vec4 state) {
	return state.b >= 0.5 && !any(isnan(state.rg)) && !any(isinf(state.rg));
}

/*
 * Display-only interpolation. The cell owning the output point decides whether
 * it is chemistry, obstacle or exterior. Inactive neighbours contribute zero
 * weight, then the active weights are renormalised, so colour never bleeds
 * through a no-flux mask. The PDE continues to use raw texels.
 */
vec4 maskAwareState(vec2 fieldUv) {
	vec2 cell = vec2(fieldUv.x, 1.0 - fieldUv.y) * float(uGridSize) - 0.5;
	ivec2 ownerCoordinate = clamp(ivec2(floor(cell + 0.5)), ivec2(0), ivec2(uGridSize - 1));
	vec4 owner = texelFetch(uState, ownerCoordinate, 0);
	if (owner.a < 0.5 || owner.b < 0.5) return owner;
	ivec2 base = ivec2(floor(cell));
	vec2 fraction = fract(cell);
	vec2 weighted = vec2(0.0);
	float activeWeight = 0.0;
	for (int offsetY = 0; offsetY <= 1; offsetY += 1) {
		for (int offsetX = 0; offsetX <= 1; offsetX += 1) {
			ivec2 offset = ivec2(offsetX, offsetY);
			ivec2 coordinate = clamp(base + offset, ivec2(0), ivec2(uGridSize - 1));
			vec4 sampleValue = texelFetch(uState, coordinate, 0);
			float weight = (offsetX == 0 ? 1.0 - fraction.x : fraction.x)
				* (offsetY == 0 ? 1.0 - fraction.y : fraction.y);
			if (weight > 0.0 && finiteActive(sampleValue)) {
				weighted += sampleValue.rg * weight;
				activeWeight += weight;
			}
		}
	}
	if (activeWeight <= 0.0) return vec4(0.0, 0.0, owner.b, owner.a);
	return vec4(weighted / activeWeight, owner.b, owner.a);
}

vec2 reactionAt(vec2 state) {
	if (uModel == 0) {
		return vec2(
			(
				state.x * (1.0 - state.x)
				- uF * state.y * (state.x - uQ) / (state.x + uQ)
			) / uEpsilon,
			state.x - state.y
		);
	}
	float autocatalysis = state.x * state.x * state.y;
	return vec2(
		uGamma * (uA - state.x + autocatalysis),
		uGamma * (uB - autocatalysis)
	);
}

vec3 ferroin(float phase, float amplitude) {
	vec3 reducedRed = vec3(0.52, 0.025, 0.018);
	vec3 violet = vec3(0.30, 0.055, 0.46);
	vec3 oxidizedBlue = vec3(0.025, 0.18, 0.58);
	vec3 colour = phase < 0.333333
		? mix(reducedRed, violet, phase * 3.0)
		: phase < 0.666667
			? mix(violet, oxidizedBlue, (phase - 0.333333) * 3.0)
			: mix(oxidizedBlue, reducedRed, (phase - 0.666667) * 3.0);
	return mix(colour * 0.45, colour * 1.25 + vec3(0.06, 0.015, 0.02), amplitude);
}

vec3 cerium(float value) {
	vec3 colourless = vec3(0.88, 0.87, 0.79);
	vec3 straw = vec3(0.88, 0.65, 0.12);
	vec3 gold = vec3(0.48, 0.25, 0.015);
	return value < 0.62
		? mix(colourless, straw, value / 0.62)
		: mix(straw, gold, (value - 0.62) / 0.38);
}

vec3 phaseSpectrum(float phase) {
	return 0.54 + 0.46 * cos(TAU * (phase + vec3(0.0, 0.666667, 0.333333)));
}

vec3 scientific(float value) {
	vec3 low = vec3(0.055, 0.105, 0.285);
	vec3 middle = vec3(0.08, 0.49, 0.49);
	vec3 high = vec3(0.95, 0.87, 0.20);
	return value < 0.5
		? mix(low, middle, value * 2.0)
		: mix(middle, high, value * 2.0 - 1.0);
}

vec3 highContrast(float value) {
	return value < 0.5
		? mix(vec3(0.005), vec3(0.0, 0.72, 0.90), value * 2.0)
		: mix(vec3(0.0, 0.72, 0.90), vec3(1.0, 0.94, 0.02), value * 2.0 - 1.0);
}

vec3 diverging(float value, bool highContrastMode) {
	if (highContrastMode) {
		return value < 0.5
			? mix(vec3(0.0, 0.24, 0.95), vec3(0.04), value * 2.0)
			: mix(vec3(0.04), vec3(1.0, 0.84, 0.0), value * 2.0 - 1.0);
	}
	vec3 negative = vec3(0.08, 0.27, 0.66);
	vec3 neutral = vec3(0.89, 0.88, 0.82);
	vec3 positive = vec3(0.70, 0.12, 0.08);
	return value < 0.5
		? mix(negative, neutral, value * 2.0)
		: mix(neutral, positive, value * 2.0 - 1.0);
}

float fixedMap(float value, vec2 range) {
	return clamp((value - range.x) / max(1e-12, range.y - range.x), 0.0, 1.0);
}

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

vec3 saturateLinear(vec3 colour, float amount) {
	float luminance = dot(colour, vec3(0.2126, 0.7152, 0.0722));
	return mix(vec3(luminance), colour, amount);
}

vec3 sampleLinearLut(sampler2D lut, float value) {
	int width = textureSize(lut, 0).x;
	float coordinate = clamp(value, 0.0, 1.0) * float(width - 1);
	int low = int(floor(coordinate));
	int high = min(width - 1, low + 1);
	return mix(
		texelFetch(lut, ivec2(low, 0), 0).rgb,
		texelFetch(lut, ivec2(high, 0), 0).rgb,
		fract(coordinate)
	);
}

vec3 orderedPalette(float value) {
	value = clamp(value, 0.0, 1.0);
	if (uPalette == 1) return cerium(value);
	if (uPalette == 2) return phaseSpectrum(value);
	if (uPalette == 4) return highContrast(value);
	return scientific(value);
}

float unsignedMap(float value) {
	return 0.5 + atan(max(0.0, value) * uDiagnosticScale) / PI;
}

float signedMap(float value) {
	return 0.5 + atan(value * uDiagnosticScale) / PI;
}

vec3 benchColour(vec2 uv) {
	float vignette = 1.0 - 0.18 * length(uv - 0.5);
	return vec3(0.018, 0.023, 0.028) * vignette;
}

void main() {
	vec2 squarePoint = vUv * 2.0 - 1.0;
	float aspect = uViewportSize.x / max(1.0, uViewportSize.y);
	if (aspect > 1.0) squarePoint.x *= aspect;
	else squarePoint.y /= aspect;
	if (any(greaterThan(abs(squarePoint), vec2(1.0)))) {
		vec3 bench = benchColour(vUv);
		outColour = vec4(uV2OutputLinear == 1 ? srgbToLinear(bench) : bench, uV2OutputLinear == 1 ? 0.0 : 1.0);
		return;
	}

	vec2 fieldUv = squarePoint * 0.5 + 0.5;
	ivec2 coordinate = ivec2(
		clamp(int(floor(fieldUv.x * float(uGridSize))), 0, uGridSize - 1),
		clamp(uGridSize - 1 - int(floor(fieldUv.y * float(uGridSize))), 0, uGridSize - 1)
	);
	vec4 rawCentre = texelFetch(uState, coordinate, 0);
	vec4 centre = uV2Display == 1 ? maskAwareState(fieldUv) : rawCentre;
	vec2 centered = fieldUv - 0.5;
	float radialDistance = length(centered);

	if (centre.a < 0.5) {
		vec3 exterior = benchColour(fieldUv);
		if (uGlass == 1 && uGeometry == 0 && uV2OutputLinear == 0) {
			float rim = 1.0 - smoothstep(
				0.006,
				0.026,
				abs(radialDistance - uActiveRadiusFraction)
			);
			float highlight = smoothstep(-0.55, 0.55, dot(normalize(centered + vec2(1e-6)), normalize(vec2(-0.8, 0.6))));
			exterior += rim * mix(vec3(0.06, 0.08, 0.10), vec3(0.28, 0.35, 0.39), highlight) * 0.55;
		}
		outColour = vec4(uV2OutputLinear == 1 ? srgbToLinear(exterior) : exterior, uV2OutputLinear == 1 ? 0.0 : 1.0);
		return;
	}

	if (centre.b < 0.5) {
		int hatch = (coordinate.x / 3 + coordinate.y / 3) % 2;
		vec3 obstacle = hatch == 0 ? vec3(0.075, 0.082, 0.09) : vec3(0.15, 0.16, 0.17);
		outColour = vec4(uV2OutputLinear == 1 ? srgbToLinear(obstacle) : obstacle, uV2OutputLinear == 1 ? 0.0 : 1.0);
		return;
	}
	if (any(isnan(centre.rg)) || any(isinf(centre.rg))) {
		outColour = vec4(uV2OutputLinear == 1 ? srgbToLinear(vec3(1.0, 0.0, 1.0)) : vec3(1.0, 0.0, 1.0), uV2OutputLinear == 1 ? 0.0 : 1.0);
		return;
	}

	if (uView == 6) {
		vec3 maskColour = vec3(0.78, 0.86, 0.90);
		outColour = vec4(uV2OutputLinear == 1 ? srgbToLinear(maskColour) : maskColour, uV2OutputLinear == 1 ? 0.0 : 1.0);
		return;
	}

	vec2 reaction = reactionAt(centre.rg);
	vec2 diffusion = vec2(uDiffusionU, uDiffusionV) * laplacianAt(coordinate, rawCentre);
	vec2 netRate = reaction + diffusion;
	float frontMagnitude = frontAt(coordinate, rawCentre);

	if (uV2Display == 1) {
		float fixedPhase = fract(
			atan(
				(centre.g - uV2Phase.y) / max(1e-12, uV2Phase.w),
				(centre.r - uV2Phase.x) / max(1e-12, uV2Phase.z)
			) / TAU + 1.0
		);
		float mappedU = fixedMap(centre.r, uV2RangeU);
		float mappedV = fixedMap(centre.g, uV2RangeV);
		float mappedFront = fixedMap(frontMagnitude, uV2RangeFront);
		float frontAmount = max(mappedFront, clamp(frontMagnitude * uV2Shape.x, 0.0, 1.0));
		float bloomSource = smoothstep(uV2Bloom.x, max(1.0, uV2Bloom.x + 1e-6), frontAmount);
		vec3 colourLinear;
		if (uV2Style == 0) {
			vec3 phaseColour = sampleLinearLut(uV2PhaseLut, fixedPhase);
			vec3 recoveryColour = sampleLinearLut(uV2PaletteLut, mappedV);
			float mixTotal = max(1e-12, uV2LuminousMix.x + uV2LuminousMix.y);
			colourLinear = mix(phaseColour, recoveryColour, uV2LuminousMix.y / mixTotal);
			colourLinear *= 0.34 + 0.82 * mappedU + 0.16 * mappedV;
			vec3 warm = srgbToLinear(vec3(1.0, 92.0 / 255.0, 46.0 / 255.0));
			colourLinear += warm * frontAmount
				* (uV2LuminousMix.z * uV2Treatment.z);
		} else if (uV2Style == 1) {
			colourLinear = sampleLinearLut(uV2PaletteLut, mappedV);
			colourLinear *= 0.42 + uV2FerroinMix.x * mappedV + uV2FerroinMix.y * mappedU;
			vec3 warm = srgbToLinear(vec3(1.0, 105.0 / 255.0, 57.0 / 255.0));
			colourLinear += warm * frontAmount
				* (uV2FerroinMix.z * uV2Treatment.z);
		} else if (uV2Style == 2) {
			colourLinear = sampleLinearLut(uV2PhaseLut, fixedPhase);
		} else {
			float diagnostic;
			vec2 range;
			bool signedField = false;
			if (uView == 2) {
				diagnostic = centre.g;
				range = uV2RangeV;
			} else if (uView == 3) {
				diagnostic = reaction.x;
				range = uV2RangeReaction;
				signedField = true;
			} else if (uView == 4) {
				diagnostic = diffusion.x;
				range = uV2RangeDiffusion;
				signedField = true;
			} else if (uView == 5) {
				diagnostic = netRate.x;
				range = uV2RangeNet;
				signedField = true;
			} else if (uView == 7) {
				diagnostic = centre.r - uActiveMean.x;
				range = uV2RangeDifference;
				signedField = true;
			} else {
				diagnostic = centre.r;
				range = uV2RangeU;
			}
			float mapped = fixedMap(diagnostic, range);
			colourLinear = signedField
				? sampleLinearLut(uV2DivergingLut, mapped)
				: sampleLinearLut(uV2PaletteLut, mapped);
		}

		if (uGlass == 1 && uGeometry == 0 && uV2OutputLinear == 0) {
			float meniscus = smoothstep(
				uActiveRadiusFraction - 0.035,
				uActiveRadiusFraction,
				radialDistance
			);
			float directional = 0.5 + 0.5 * dot(
				normalize(centered + vec2(1e-6)),
				normalize(vec2(-0.75, 0.66))
			);
			colourLinear += srgbToLinear(vec3(0.15, 0.19, 0.22)) * meniscus * directional;
			colourLinear *= 1.0 - 0.1 * smoothstep(0.0, uActiveRadiusFraction, radialDistance);
		}
		if (uV2OutputLinear == 1) {
			outColour = vec4(max(vec3(0.0), colourLinear), bloomSource);
			return;
		}
		colourLinear = saturateLinear(colourLinear, uV2Treatment.w);
		colourLinear = pow(max(vec3(0.0), colourLinear), vec3(uV2Shape.y));
		colourLinear = acesFitted(colourLinear * uV2Treatment.x);
		colourLinear = pow(colourLinear, vec3(1.0 / uV2Shape.z));
		outColour = vec4(linearToSrgb(colourLinear), 1.0);
		return;
	}

	float phase = fract(atan(centre.g - uActiveMean.y, centre.r - uActiveMean.x) / TAU + 1.0);
	float amplitude = clamp(length(centre.rg - uActiveMean) * uDiagnosticScale, 0.0, 1.0);
	vec3 colour;

	if (uView == 0) {
		if (uPalette == 0) colour = ferroin(phase, amplitude);
		else if (uPalette == 1) colour = cerium(unsignedMap(centre.g));
		else if (uPalette == 2) colour = phaseSpectrum(phase);
		else if (uPalette == 4) colour = highContrast(unsignedMap(centre.r));
		else colour = scientific(unsignedMap(centre.r));
	} else if (uView == 1) {
		colour = orderedPalette(unsignedMap(centre.r));
	} else if (uView == 2) {
		colour = orderedPalette(unsignedMap(centre.g));
	} else {
		float diagnostic = uView == 3
			? reaction.x
			: uView == 4
				? diffusion.x
				: uView == 5
					? netRate.x
					: centre.r - uActiveMean.x;
		colour = diverging(clamp(signedMap(diagnostic), 0.0, 1.0), uPalette == 4);
	}

	if (uGlass == 1 && uView == 0 && uGeometry == 0) {
		float meniscus = smoothstep(
			uActiveRadiusFraction - 0.035,
			uActiveRadiusFraction,
			radialDistance
		);
		float directional = 0.5 + 0.5 * dot(normalize(centered + vec2(1e-6)), normalize(vec2(-0.75, 0.66)));
		colour += meniscus * directional * vec3(0.15, 0.19, 0.22);
		colour *= 1.0 - 0.13 * smoothstep(0.0, uActiveRadiusFraction, radialDistance);
	}

	colour = pow(max(vec3(0.0), colour * uExposure), vec3(1.0 / uGammaDisplay));
	outColour = vec4(clamp(colour, 0.0, 1.0), 1.0);
}
