#ifdef GL_ES
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
precision highp int;
#define RM_FRAGMENT_HIGHP 1
#else
precision mediump float;
precision mediump int;
#define RM_FRAGMENT_HIGHP 0
#endif
#endif

// These literal tokens are replaced by buildFragmentSource() before compilation.
#define RM_MAIN_STEPS __MAIN_STEPS__
#define RM_SHADOW_STEPS __SHADOW_STEPS__
#define RM_AO_SAMPLES __AO_SAMPLES__
#define RM_ENABLE_SHADOWS __ENABLE_SHADOWS__
#define RM_ENABLE_AO __ENABLE_AO__

uniform vec2 u_resolution;
uniform float u_time;
uniform float u_stage;
uniform float u_debug;
uniform vec2 u_camera;
uniform float u_focalLength;
uniform float u_fogAmount;
uniform float u_palette;
uniform float u_pulseRadius;
uniform float u_pulseStrength;

const float FAR_CLIP = 30.0;
const float NEAR_CLIP = 0.08;
const float SAFETY_FACTOR = 0.8;
const float MINIMUM_STEP = 0.003;
const vec3 ORB_POSITION = vec3(0.0, 1.55, -7.0);

const float MATERIAL_FLOOR = 1.0;
const float MATERIAL_STONE = 2.0;
const float MATERIAL_CYAN = 3.0;
const float MATERIAL_AMBER = 4.0;
const float MATERIAL_ORB = 5.0;

float currentStage() {
	return floor(clamp(u_stage, 1.0, 8.0) + 0.5);
}

mat2 rotate2d(float angle) {
	float c = cos(angle);
	float s = sin(angle);
	return mat2(c, -s, s, c);
}

vec2 nearer(vec2 firstSurface, vec2 secondSurface) {
	return secondSurface.x < firstSurface.x ? secondSurface : firstSurface;
}

float smoothUnion(float firstDistance, float secondDistance, float radius) {
	float blend = clamp(0.5 + 0.5 * (secondDistance - firstDistance) / radius, 0.0, 1.0);
	return mix(secondDistance, firstDistance, blend) - radius * blend * (1.0 - blend);
}

float sdPlane(vec3 point) {
	return point.y;
}

// @excerpt one-distance:start
float sdSphere(vec3 point, vec3 centre, float radius) {
	return length(point - centre) - radius;
}
// @excerpt one-distance:end

float sdRoundedBox(vec3 point, vec3 halfSize, float radius) {
	vec3 offset = abs(point) - halfSize + radius;
	return length(max(offset, 0.0)) + min(max(offset.x, max(offset.y, offset.z)), 0.0) - radius;
}

float sdCappedCylinderY(vec3 point, float halfHeight, float radius) {
	vec2 offset = abs(vec2(length(point.xz), point.y)) - vec2(radius, halfHeight);
	return min(max(offset.x, offset.y), 0.0) + length(max(offset, 0.0));
}

// An upper-half annulus, subtracted in 2D and then extruded a short distance in z.
float sdArchExtrusion(
	vec3 point,
	float outerRadius,
	float innerRadius,
	float halfDepth
) {
	float radialDistance = length(point.xy);
	float ring = max(radialDistance - outerRadius, -(radialDistance - innerRadius));
	ring = max(ring, -point.y);
	return max(ring, abs(point.z) - halfDepth);
}

float sdColumn(vec3 point) {
	float shaft = sdCappedCylinderY(point - vec3(0.0, 1.32, 0.0), 1.18, 0.27);
	float base = sdRoundedBox(point - vec3(0.0, 0.18, 0.0), vec3(0.49, 0.18, 0.43), 0.07);
	float capital = sdRoundedBox(
		point - vec3(0.0, 2.48, 0.0),
		vec3(0.46, 0.18, 0.39),
		0.06
	);
	// The only smooth blend joins parts carrying the same stable stone material.
	return smoothUnion(shaft, min(base, capital), 0.055);
}

// @excerpt fold-space:start
vec2 boundedRepeatDepth(float worldDepth) {
	const float spacing = 4.0;
	float coordinate = worldDepth + 1.5;
	float cell = clamp(floor(coordinate / spacing + 0.5), -6.0, 0.0);
	return vec2(coordinate - cell * spacing, cell);
}

vec3 foldArchitecturalSpace(vec3 point) {
	vec2 repeated = boundedRepeatDepth(point.z);
	vec3 localPoint = vec3(point.x, point.y, repeated.x);
	// A small per-cell rotation is rigid and therefore distance-preserving.
	localPoint.xy = rotate2d(repeated.y * 0.022) * localPoint.xy;
	return localPoint;
}
// @excerpt fold-space:end

// @excerpt constructive-geometry:start
vec2 mapBay(vec3 point, float includeEmissiveSeams) {
	vec2 result = vec2(1000.0, MATERIAL_STONE);

	float leftColumn = sdColumn(point - vec3(-2.46, 0.0, 0.0));
	float rightColumn = sdColumn(point - vec3(2.46, 0.0, 0.0));
	result = nearer(result, vec2(min(leftColumn, rightColumn), MATERIAL_STONE));

	vec3 archPoint = point - vec3(0.0, 2.5, 0.0);
	float arch = sdArchExtrusion(archPoint, 2.76, 2.19, 0.24);
	result = nearer(result, vec2(arch, MATERIAL_STONE));

	float leftButtress = sdRoundedBox(
		point - vec3(-3.25, 1.38, 0.0),
		vec3(0.31, 1.38, 0.31),
		0.08
	);
	float rightButtress = sdRoundedBox(
		point - vec3(3.25, 1.38, 0.0),
		vec3(0.31, 1.38, 0.31),
		0.08
	);
	result = nearer(result, vec2(min(leftButtress, rightButtress), MATERIAL_STONE));

	if (includeEmissiveSeams > 0.5) {
		float cyanArch = sdArchExtrusion(archPoint, 2.84, 2.77, 0.265);
		result = nearer(result, vec2(cyanArch, MATERIAL_CYAN));

		float leftCapitalSeam = sdRoundedBox(
			point - vec3(-2.46, 2.68, 0.0),
			vec3(0.5, 0.035, 0.42),
			0.018
		);
		float rightCapitalSeam = sdRoundedBox(
			point - vec3(2.46, 2.68, 0.0),
			vec3(0.5, 0.035, 0.42),
			0.018
		);
		result = nearer(
			result,
			vec2(min(leftCapitalSeam, rightCapitalSeam), MATERIAL_AMBER)
		);
	}

	return result;
}
// @excerpt constructive-geometry:end

// mapScene is the only source of visible three-dimensional geometry.
vec2 mapScene(vec3 point) {
	float stage = currentStage();
	if (stage < 5.0) {
		return vec2(sdSphere(point, vec3(0.0, 1.55, -4.4), 1.0), MATERIAL_STONE);
	}

	vec2 result = vec2(sdPlane(point), MATERIAL_FLOOR);
	vec3 architecturalPoint = point;
	if (stage >= 6.0) {
		architecturalPoint = foldArchitecturalSpace(point);
	} else {
		architecturalPoint.z += 4.5;
	}
	result = nearer(result, mapBay(architecturalPoint, stage >= 8.0 ? 1.0 : 0.0));

	if (stage >= 6.0) {
		float orb = sdSphere(point, ORB_POSITION, 0.62);
		result = nearer(result, vec2(orb, MATERIAL_ORB));
	}

	if (stage >= 8.0) {
		float leftAisleSeam = sdRoundedBox(
			point - vec3(-1.28, 0.025, -12.8),
			vec3(0.035, 0.025, 11.8),
			0.012
		);
		float rightAisleSeam = sdRoundedBox(
			point - vec3(1.28, 0.025, -12.8),
			vec3(0.035, 0.025, 11.8),
			0.012
		);
		result = nearer(result, vec2(leftAisleSeam, MATERIAL_CYAN));
		result = nearer(result, vec2(rightAisleSeam, MATERIAL_AMBER));
	}

	return result;
}

// @excerpt camera-rays:start
void makeCameraRay(vec2 screen, out vec3 rayOrigin, out vec3 rayDirection) {
	float yaw = clamp(u_camera.x, -0.7, 0.7);
	float pitch = clamp(u_camera.y, -0.3, 0.25);
	vec3 forward = normalize(vec3(sin(yaw) * cos(pitch), sin(pitch), -cos(yaw) * cos(pitch)));
	vec3 right = normalize(cross(forward, vec3(0.0, 1.0, 0.0)));
	vec3 up = normalize(cross(right, forward));
	rayOrigin = vec3(0.0, 1.55, 5.6);
	rayDirection = normalize(
		forward * clamp(u_focalLength, 1.0, 2.4) + right * screen.x + up * screen.y
	);
}
// @excerpt camera-rays:end

float distanceAwareEpsilon(float distanceTravelled) {
#if RM_FRAGMENT_HIGHP == 1
	return 0.0018 * (1.0 + 0.065 * distanceTravelled);
#else
	// The larger fallback tolerates mediump's coarser spacing in the far bays.
	return 0.006 * (1.0 + 0.03 * distanceTravelled);
#endif
}

// @excerpt walking-loop:start
vec4 marchScene(vec3 rayOrigin, vec3 rayDirection) {
	float distanceTravelled = NEAR_CLIP;
	float material = -1.0;
	float normalizedSteps = 1.0;
	float glowAccumulator = 0.0;

	for (int stepIndex = 0; stepIndex < RM_MAIN_STEPS; stepIndex++) {
		vec3 samplePoint = rayOrigin + rayDirection * distanceTravelled;
		vec2 sceneSample = mapScene(samplePoint);
		float epsilon = distanceAwareEpsilon(distanceTravelled);

		if (
			currentStage() >= 8.0 &&
			sceneSample.y > MATERIAL_STONE + 0.1 &&
			sceneSample.y < MATERIAL_ORB - 0.1
		) {
			float nearbyGlow = max(0.0, 0.055 - abs(sceneSample.x)) * 0.045;
			glowAccumulator = min(0.16, glowAccumulator + nearbyGlow);
		}

		if (sceneSample.x < epsilon) {
			material = sceneSample.y;
			normalizedSteps = float(stepIndex + 1) / float(RM_MAIN_STEPS);
			break;
		}

		distanceTravelled += max(sceneSample.x * SAFETY_FACTOR, MINIMUM_STEP);
		if (distanceTravelled > FAR_CLIP) {
			distanceTravelled = FAR_CLIP + 1.0;
			normalizedSteps = float(stepIndex + 1) / float(RM_MAIN_STEPS);
			break;
		}
	}

	return vec4(distanceTravelled, material, normalizedSteps, glowAccumulator);
}
// @excerpt walking-loop:end

// @excerpt surface-direction:start
vec3 estimateNormal(vec3 point, float distanceTravelled) {
	float epsilon = max(0.0015, distanceAwareEpsilon(distanceTravelled) * 0.72);
	vec2 offset = vec2(epsilon, -epsilon);
	return normalize(
		offset.xyy * mapScene(point + offset.xyy).x +
		offset.yyx * mapScene(point + offset.yyx).x +
		offset.yxy * mapScene(point + offset.yxy).x +
		offset.xxx * mapScene(point + offset.xxx).x
	);
}
// @excerpt surface-direction:end

vec3 materialColour(float material) {
	vec3 coolStone = mix(vec3(0.035, 0.065, 0.11), vec3(0.07, 0.12, 0.17), step(0.5, u_palette));
	vec3 warmStone = mix(vec3(0.055, 0.07, 0.09), vec3(0.1, 0.075, 0.055), step(1.5, u_palette));
	if (material < 1.5) return vec3(0.018, 0.027, 0.043);
	if (material < 2.5) return mix(coolStone, warmStone, step(1.5, u_palette));
	if (material < 3.5) return vec3(0.02, 0.72, 1.15);
	if (material < 4.5) return vec3(1.18, 0.48, 0.12);
	return vec3(0.0025, 0.003, 0.005);
}

#if RM_ENABLE_AO == 1
float ambientOcclusion(vec3 point, vec3 normal) {
	float occlusion = 0.0;
	float weight = 1.0;
	for (int sampleIndex = 0; sampleIndex < RM_AO_SAMPLES; sampleIndex++) {
		float sampleDistance = 0.075 + float(sampleIndex) * 0.095;
		float sceneDistance = mapScene(point + normal * sampleDistance).x;
		occlusion += max(0.0, sampleDistance - sceneDistance) * weight;
		weight *= 0.62;
	}
	return clamp(1.0 - occlusion * 2.15, 0.32, 1.0);
}
#endif

#if RM_ENABLE_SHADOWS == 1
float softShadow(vec3 rayOrigin, vec3 rayDirection, float maximumDistance) {
	float visibility = 1.0;
	float distanceTravelled = 0.035;
	for (int stepIndex = 0; stepIndex < RM_SHADOW_STEPS; stepIndex++) {
		float sceneDistance = mapScene(rayOrigin + rayDirection * distanceTravelled).x;
		visibility = min(visibility, 11.0 * sceneDistance / max(distanceTravelled, 0.02));
		distanceTravelled += clamp(sceneDistance * SAFETY_FACTOR, 0.025, 0.55);
		if (sceneDistance < 0.0025 || distanceTravelled > maximumDistance) break;
	}
	return clamp(visibility, 0.18, 1.0);
}
#endif

// @excerpt believable-light:start
vec3 lightSurface(
	vec3 point,
	vec3 normal,
	vec3 viewDirection,
	float material,
	float stage
) {
	vec3 base = materialColour(material);
	vec3 lightDirection = normalize(vec3(-0.42, 0.78, 0.32));
	float hemisphere = 0.22 + 0.25 * (normal.y * 0.5 + 0.5);
	float diffuse = max(dot(normal, lightDirection), 0.0);
	vec3 reflectedLight = reflect(-lightDirection, normal);
	float floorMask = 1.0 - step(1.5, material);
	float specularPower = mix(34.0, 68.0, floorMask);
	float specular = pow(max(dot(reflectedLight, viewDirection), 0.0), specularPower);
	float fresnel = pow(1.0 - max(dot(normal, viewDirection), 0.0), 5.0);

	float ao = 1.0;
	float shadow = 1.0;
	if (stage >= 7.0) {
#if RM_ENABLE_AO == 1
		ao = ambientOcclusion(point, normal);
#endif
#if RM_ENABLE_SHADOWS == 1
		shadow = softShadow(point + normal * 0.012, lightDirection, 9.0);
#endif
	}

	vec3 colour = base * hemisphere;
	colour += base * diffuse * shadow * 0.9;
	if (stage >= 7.0) {
		colour += vec3(0.72, 0.86, 1.0) * specular * mix(0.12, 0.32, floorMask) * shadow;
		colour += vec3(0.04, 0.11, 0.18) * fresnel * mix(0.18, 0.42, floorMask);
	}
	return colour * ao;
}
// @excerpt believable-light:end

vec3 proceduralBackground(vec3 rayDirection) {
	float horizon = pow(max(0.0, 1.0 - abs(rayDirection.y + 0.03)), 7.0);
	float upper = clamp(rayDirection.y * 0.5 + 0.5, 0.0, 1.0);
	return vec3(0.0015, 0.0035, 0.009) + vec3(0.002, 0.009, 0.021) * upper +
		vec3(0.0, 0.007, 0.018) * horizon;
}

vec3 marchCostColour(float normalizedSteps, float hitMask) {
	float cost = clamp(normalizedSteps, 0.0, 1.0);
	vec3 lowCost = vec3(0.02, 0.19, 0.28);
	vec3 highCost = vec3(1.0, 0.34, 0.08);
	vec3 colour = mix(lowCost, highCost, smoothstep(0.08, 0.92, cost));
	// Luminance also rises with cost, so the view remains legible without colour.
	colour *= 0.28 + cost * 0.82;
	return mix(colour * 0.3, colour, hitMask);
}

vec3 distanceBandView(vec2 screen) {
	vec3 crossSectionPoint = vec3(screen.x * 3.8, screen.y * 2.7 + 2.0, -7.0);
	float distanceBound = mapScene(crossSectionPoint).x;
	float band = 0.5 + 0.5 * cos(distanceBound * 18.0);
	float zeroContour = 1.0 - smoothstep(0.0, 0.035, abs(distanceBound));
	vec3 outsideColour = vec3(0.025, 0.2, 0.29);
	vec3 insideColour = vec3(0.42, 0.12, 0.035);
	vec3 signColour = mix(insideColour, outsideColour, step(0.0, distanceBound));
	return signColour * (0.35 + band * 0.65) + zeroContour * vec3(0.95);
}

float stableDither(vec2 pixelCoordinate) {
	vec3 seed = fract(vec3(pixelCoordinate.xyx) * 0.1031);
	seed += dot(seed, seed.yzx + 33.33);
	return fract((seed.x + seed.y) * seed.z) - 0.5;
}

vec3 toneMapAndEncode(vec3 linearColour) {
	vec3 mapped = linearColour / (vec3(1.0) + max(linearColour, vec3(0.0)));
	return pow(max(mapped, vec3(0.0)), vec3(1.0 / 2.2));
}

// @excerpt lose-horizon:start
vec3 finishCathedral(
	vec3 linearColour,
	vec3 point,
	vec3 normal,
	vec3 viewDirection,
	float material,
	float distanceTravelled,
	float pathGlow,
	vec3 background
) {
	vec3 cyanEmission = vec3(0.0, 0.72, 1.32);
	vec3 amberEmission = vec3(1.35, 0.46, 0.08);
	float seamBreath = 0.94 + 0.06 * sin(u_time * 0.45);
	if (material > 2.5 && material < 3.5) {
		linearColour += cyanEmission * 1.45 * seamBreath;
	}
	if (material > 3.5 && material < 4.5) {
		linearColour += amberEmission * 1.35 * seamBreath;
	}

	float pulseDistance = length(point - ORB_POSITION);
	float pulseOffset = (pulseDistance - max(u_pulseRadius, 0.0)) / 0.085;
	float pulseBand = exp(-pulseOffset * pulseOffset) * clamp(u_pulseStrength, 0.0, 1.0);
	float pulseColourMix = 0.5 + 0.5 * sin(point.x * 2.35 + point.z * 0.62);
	vec3 pulseColour = mix(cyanEmission, amberEmission, pulseColourMix * 0.78);
	linearColour += pulseColour * pulseBand * (0.72 + 0.28 * max(dot(normal, viewDirection), 0.0));

	if (material > 4.5) {
		float orbRim = pow(1.0 - max(dot(normal, viewDirection), 0.0), 3.0);
		linearColour += mix(cyanEmission, amberEmission, 0.52) * orbRim * 0.22;
	}

	linearColour += mix(cyanEmission, amberEmission, 0.5) * pathGlow;
	float fogAmount = 1.0 -
		exp(-clamp(u_fogAmount, 0.0, 1.2) * distanceTravelled * 0.095);
	return mix(linearColour, background, clamp(fogAmount, 0.0, 0.985));
}
// @excerpt lose-horizon:end

void main() {
	vec2 resolution = max(u_resolution, vec2(1.0));
	vec2 screen = (2.0 * gl_FragCoord.xy - resolution) / resolution.y;
	vec3 rayOrigin;
	vec3 rayDirection;
	makeCameraRay(screen, rayOrigin, rayDirection);
	float stage = currentStage();

	if (u_debug > 2.5) {
		vec3 debugColour = distanceBandView(screen);
		gl_FragColor = vec4(clamp(debugColour, 0.0, 1.0), 1.0);
		return;
	}

	if (stage < 1.5) {
		vec3 rayColour = 0.5 + 0.5 * rayDirection;
		gl_FragColor = vec4(rayColour, 1.0);
		return;
	}

	vec4 marchResult = marchScene(rayOrigin, rayDirection);
	float hitMask = step(marchResult.x, FAR_CLIP);
	vec3 background = proceduralBackground(rayDirection);

	float beautyView = 1.0 - step(0.5, u_debug);
	if (
		(beautyView > 0.5 && stage > 2.5 && stage < 3.5) ||
		(u_debug > 0.5 && u_debug < 1.5)
	) {
		gl_FragColor = vec4(marchCostColour(marchResult.z, hitMask), 1.0);
		return;
	}

	if (hitMask < 0.5) {
		gl_FragColor = vec4(toneMapAndEncode(background), 1.0);
		return;
	}

	if (beautyView > 0.5 && stage < 2.5) {
		vec3 silhouette = vec3(0.08, 0.68, 0.82);
		gl_FragColor = vec4(silhouette, 1.0);
		return;
	}

	vec3 hitPoint = rayOrigin + rayDirection * marchResult.x;
	vec3 normal = estimateNormal(hitPoint, marchResult.x);

	if (
		(beautyView > 0.5 && stage > 3.5 && stage < 4.5) ||
		(u_debug > 1.5 && u_debug < 2.5)
	) {
		gl_FragColor = vec4(normal * 0.5 + 0.5, 1.0);
		return;
	}

	vec3 viewDirection = normalize(-rayDirection);
	vec3 linearColour = lightSurface(
		hitPoint,
		normal,
		viewDirection,
		marchResult.y,
		stage
	);

	if (stage >= 8.0) {
		linearColour = finishCathedral(
			linearColour,
			hitPoint,
			normal,
			viewDirection,
			marchResult.y,
			marchResult.x,
			marchResult.w,
			background
		);
	} else if (stage >= 6.0) {
		float teachingFog = 1.0 - exp(-marchResult.x * 0.025);
		linearColour = mix(linearColour, background, teachingFog * 0.65);
	}

	vec3 encodedColour = toneMapAndEncode(linearColour);
	if (stage >= 8.0) encodedColour += stableDither(gl_FragCoord.xy) / 255.0;
	gl_FragColor = vec4(clamp(encodedColour, 0.0, 1.0), 1.0);
}
