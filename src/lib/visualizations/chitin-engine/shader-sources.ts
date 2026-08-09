/**
 * Raw WebGL2 shader sources for the Chitin Engine.
 *
 * Creature geometry is never evaluated by a full-screen primitive loop. Plates
 * and limb bones are expanded from a four-vertex unit quad and clipped by an
 * object-local implicit field. The only full-surface draw is the single,
 * deliberately inexpensive chamber background pass.
 */

export const UNIT_QUAD_VERTEX_COUNT = 4;

export const CHAMBER_VERTEX_SHADER = `#version 300 es
precision highp float;

layout(location = 0) in vec2 aCorner;

out vec2 vUv;

void main() {
  vUv = aCorner * 0.5 + 0.5;
  gl_Position = vec4(aCorner, 0.999, 1.0);
}
`;

export const CHAMBER_FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 vUv;

uniform vec3 uBackground;
uniform vec3 uChamber;
uniform vec2 uViewport;
uniform float uTime;
uniform float uScanner;

out vec4 outColor;

void main() {
  vec2 centred = vUv - 0.5;
  centred.x *= uViewport.x / max(uViewport.y, 1.0);
  float vignette = 1.0 - smoothstep(0.15, 0.82, length(centred));
  float containment = 1.0 - smoothstep(0.47, 0.52, abs(vUv.y - 0.5));
  float gridX = 1.0 - smoothstep(0.0, 0.012, abs(fract(vUv.x * 12.0) - 0.5));
  float gridY = 1.0 - smoothstep(0.0, 0.012, abs(fract(vUv.y * 7.0) - 0.5));
  float grid = max(gridX, gridY) * 0.018;
  float scanY = fract(uTime * 0.035 + 0.17);
  float scan = exp(-abs(vUv.y - scanY) * 210.0) * uScanner * 0.055;
  vec3 colour = mix(uBackground, uChamber, 0.32 + vignette * 0.26);
  colour += (grid * containment + scan) * mix(uChamber, vec3(0.72, 0.88, 0.84), 0.32);
  outColor = vec4(colour, 1.0);
}
`;

export const PLATE_VERTEX_SHADER = `#version 300 es
precision highp float;

layout(location = 0) in vec2 aCorner;
layout(location = 1) in vec4 aCentreExtent;
layout(location = 2) in vec4 aShape;
layout(location = 3) in vec4 aSurface;
layout(location = 4) in vec4 aMaterial;
layout(location = 5) in vec4 aMetadata;

uniform vec4 uProjection;
uniform vec4 uCamera;

out vec2 vLocal;
out vec4 vShape;
out vec4 vSurface;
out vec4 vMaterial;
out vec4 vMetadata;
out float vDepth;

vec2 rotate2d(vec2 point, float angle) {
  float c = cos(angle);
  float s = sin(angle);
  return mat2(c, -s, s, c) * point;
}

vec2 projectWorld(vec2 world, float depth) {
  vec2 point = rotate2d(world - uProjection.xy, uCamera.z);
  point.x *= cos(uCamera.x);
  point.y *= cos(uCamera.y);
  point += vec2(depth * sin(uCamera.x), depth * sin(uCamera.y)) * 0.22;
  return point * uProjection.zw;
}

void main() {
  float bound = 1.08 + min(abs(aShape.w), 0.24);
  vLocal = aCorner * bound;
  vec2 localWorld = vLocal * max(aCentreExtent.zw, vec2(0.0001));
  vec2 world = aCentreExtent.xy + rotate2d(localWorld, aShape.x);
  vShape = aShape;
  vSurface = aSurface;
  vMaterial = aMaterial;
  vMetadata = aMetadata;
  vDepth = aShape.y;
  float layeredDepth = aShape.y + aMaterial.w * 0.001;
  gl_Position = vec4(projectWorld(world, aShape.y), clamp(-layeredDepth * uCamera.w, -0.95, 0.95), 1.0);
}
`;

export const PLATE_FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 vLocal;
in vec4 vShape;
in vec4 vSurface;
in vec4 vMaterial;
in vec4 vMetadata;
in float vDepth;

uniform vec3 uShellA;
uniform vec3 uShellB;
uniform vec3 uMembrane;
uniform vec3 uEmissionColour;
uniform vec3 uCorrosionColour;
uniform vec4 uSurfaceControls;
uniform vec4 uEmissionControls;
uniform vec4 uEffects;
uniform vec2 uViewport;
uniform int uViewMode;
uniform int uMaterialIndex;
uniform int uSelectedSegment;

out vec4 outColor;

vec2 hash22(vec2 value, float seed) {
  vec2 q = vec2(
    dot(value, vec2(127.1, 311.7)),
    dot(value, vec2(269.5, 183.3))
  );
  return fract(sin(q + seed * vec2(0.017, 0.031)) * 43758.5453123);
}

// Object-local, fixed-cost 3x3 Worley search. Returns F1 and F2-F1.
vec2 worleyF1Gap(vec2 point, float seed) {
  vec2 cell = floor(point);
  vec2 local = fract(point);
  float f1 = 8.0;
  float f2 = 8.0;
  for (int y = -1; y <= 1; ++y) {
    for (int x = -1; x <= 1; ++x) {
      vec2 neighbour = vec2(float(x), float(y));
      vec2 feature = neighbour + hash22(cell + neighbour, seed) - local;
      float distanceSquared = dot(feature, feature);
      if (distanceSquared < f1) {
        f2 = f1;
        f1 = distanceSquared;
      } else if (distanceSquared < f2) {
        f2 = distanceSquared;
      }
    }
  }
  f1 = sqrt(f1);
  f2 = sqrt(f2);
  return vec2(f1, max(0.0, f2 - f1));
}

float superellipseField(vec2 point, float exponent, float lobes, float amplitude, float seed) {
  float angle = atan(point.y, point.x);
  float phase = seed * 6.28318530718;
  float modulation = 1.0 + clamp(amplitude, -0.24, 0.24) * cos(max(1.0, lobes) * angle + phase);
  vec2 q = point / max(modulation, 0.68);
  float power = clamp(exponent, 0.72, 8.0);
  return pow(pow(abs(q.x), power) + pow(abs(q.y), power), 1.0 / power) - 1.0;
}

vec3 anatomyColour(float region) {
  float band = mod(region, 4.0);
  if (band < 0.5) return vec3(0.24, 0.72, 0.76);
  if (band < 1.5) return vec3(0.72, 0.62, 0.22);
  if (band < 2.5) return vec3(0.73, 0.31, 0.36);
  return vec3(0.48, 0.42, 0.75);
}

void main() {
  float field = superellipseField(vLocal, vShape.z, vSurface.x, vShape.w, vSurface.z);
  float antialias = max(fwidth(field), 0.0008);
  float opacity = 1.0 - smoothstep(-antialias, antialias, field);
  if (opacity <= 0.001) discard;

  float rim = 1.0 - smoothstep(0.018, 0.13, abs(field));
  float ridgeWidth = mix(0.34, 0.055, clamp(vSurface.y, 0.0, 1.0));
  float dorsalRidge = exp(-abs(vLocal.y) / max(ridgeWidth, 0.025)) * clamp(vSurface.y, 0.0, 1.0);
  float cellScale = mix(2.5, 18.0, clamp(uSurfaceControls.x, 0.0, 1.0));
  vec2 cell = worleyF1Gap(vLocal * vec2(cellScale, cellScale * 0.82), vSurface.z);
  float seam = 1.0 - smoothstep(0.025, 0.115, cell.y);
  float pit = 1.0 - smoothstep(0.03, 0.16, cell.x);
  float textureAmount = clamp(uSurfaceControls.y, 0.0, 1.0);
  float damage = clamp(vSurface.w, 0.0, 1.0);
  float corrosion = clamp(uSurfaceControls.z * (0.25 + damage * 0.75), 0.0, 1.0);
  float material = vMaterial.x >= 0.0 ? vMaterial.x : float(uMaterialIndex);
  float iridescence = clamp(uEffects.x, 0.0, 1.0);
  float iridescentShift = 0.5 + 0.5 * cos(vLocal.x * 5.0 - vLocal.y * 3.0 + material * 0.71);
  vec3 colour = mix(uShellA, uShellB, 0.24 + 0.46 * iridescentShift * iridescence);
  colour = mix(colour, uMembrane, clamp(vMetadata.w, 0.0, 1.0) * 0.68);
  colour *= 0.78 + dorsalRidge * 0.34 + rim * 0.22;
  colour *= 1.0 - seam * textureAmount * 0.24;
  colour = mix(colour, uCorrosionColour, corrosion * (pit * 0.4 + damage * 0.22));

  float selected = max(
    vMetadata.y,
    int(vMetadata.x + 0.5) == uSelectedSegment ? 1.0 : 0.0
  );
  float scanY = fract(uEffects.w * 0.08 + 0.15);
  float scan = exp(-abs(gl_FragCoord.y / max(uViewport.y, 1.0) - scanY) * 180.0)
    * clamp(uEmissionControls.z, 0.0, 1.0);
  float emissionMask = seam * uEmissionControls.x + dorsalRidge * vMaterial.z;
  emissionMask += scan + selected * rim * 0.42;

  if (uViewMode == 1) {
    colour = anatomyColour(vMetadata.z);
    colour = mix(colour, vec3(1.0), selected * 0.34 + rim * 0.12);
  } else if (uViewMode == 2) {
    colour = mix(vec3(dot(colour, vec3(0.299, 0.587, 0.114))), colour, 0.24);
    emissionMask += selected * 0.6;
  } else if (uViewMode == 3) {
    colour = mix(uShellA, uShellB, smoothstep(0.03, 0.19, cell.y));
    colour = mix(colour, uCorrosionColour, pit * corrosion);
    emissionMask += seam * 0.38;
  } else if (uViewMode == 4) {
    colour = vec3(0.015, 0.018, 0.021);
    emissionMask = rim * 0.05;
  } else if (uViewMode == 5) {
    colour = mix(vec3(0.006, 0.012, 0.017), uEmissionColour, clamp(emissionMask + pit * uSurfaceControls.w, 0.0, 1.0));
    emissionMask += seam * uSurfaceControls.w;
  } else if (uViewMode == 6) {
    float depthValue = clamp(vDepth * 0.35 + 0.5, 0.0, 1.0);
    colour = vec3(depthValue);
    emissionMask = selected * 0.25;
  }

  colour += uEmissionColour * emissionMask * (0.34 + uEmissionControls.w * 0.42);
  float grain = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233)) + vSurface.z) * 43758.5453) - 0.5;
  colour += grain * clamp(uEffects.y, 0.0, 1.0) * 0.018;
  outColor = vec4(max(colour, vec3(0.0)), opacity * clamp(vMaterial.y, 0.0, 1.0));
}
`;

export const CAPSULE_VERTEX_SHADER = `#version 300 es
precision highp float;

layout(location = 0) in vec2 aCorner;
layout(location = 1) in vec4 aEndpoints;
layout(location = 2) in vec4 aGeometry;
layout(location = 3) in vec4 aMaterial;
layout(location = 4) in vec4 aMetadata;

uniform vec4 uProjection;
uniform vec4 uCamera;

out vec2 vWorld;
out vec4 vEndpoints;
out vec4 vGeometry;
out vec4 vMaterial;
out vec4 vMetadata;
out float vDepth;

vec2 rotate2d(vec2 point, float angle) {
  float c = cos(angle);
  float s = sin(angle);
  return mat2(c, -s, s, c) * point;
}

vec2 projectWorld(vec2 world, float depth) {
  vec2 point = rotate2d(world - uProjection.xy, uCamera.z);
  point.x *= cos(uCamera.x);
  point.y *= cos(uCamera.y);
  point += vec2(depth * sin(uCamera.x), depth * sin(uCamera.y)) * 0.22;
  return point * uProjection.zw;
}

void main() {
  vec2 a = aEndpoints.xy;
  vec2 b = aEndpoints.zw;
  vec2 delta = b - a;
  float lengthAB = max(length(delta), 0.0001);
  vec2 axis = delta / lengthAB;
  vec2 normal = vec2(-axis.y, axis.x);
  float radius = max(aGeometry.x, aGeometry.y) + max(aGeometry.w, 0.0);
  float axialExtent = lengthAB * 0.5 + radius * 1.08;
  float lateralExtent = radius * 1.08;
  vec2 centre = (a + b) * 0.5;
  vWorld = centre + axis * aCorner.x * axialExtent + normal * aCorner.y * lateralExtent;
  vEndpoints = aEndpoints;
  vGeometry = aGeometry;
  vMaterial = aMaterial;
  vMetadata = aMetadata;
  vDepth = aGeometry.z;
  float layeredDepth = aGeometry.z + aMetadata.x * 0.001;
  gl_Position = vec4(projectWorld(vWorld, aGeometry.z), clamp(-layeredDepth * uCamera.w, -0.95, 0.95), 1.0);
}
`;

export const CAPSULE_FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 vWorld;
in vec4 vEndpoints;
in vec4 vGeometry;
in vec4 vMaterial;
in vec4 vMetadata;
in float vDepth;

uniform vec3 uShellA;
uniform vec3 uShellB;
uniform vec3 uEmissionColour;
uniform vec4 uEmissionControls;
uniform vec4 uEffects;
uniform vec2 uViewport;
uniform int uViewMode;
uniform int uMaterialIndex;

out vec4 outColor;

void main() {
  vec2 a = vEndpoints.xy;
  vec2 b = vEndpoints.zw;
  vec2 segment = b - a;
  float denominator = max(dot(segment, segment), 0.0000001);
  float h = clamp(dot(vWorld - a, segment) / denominator, 0.0, 1.0);
  vec2 closest = a + segment * h;
  float radius = mix(max(vGeometry.x, 0.0001), max(vGeometry.y, 0.0001), h);
  float capsule = length(vWorld - closest) - radius;
  float jointAmount = max(vGeometry.w, 0.0);
  float jointA = length(vWorld - a) - (vGeometry.x + jointAmount);
  float jointB = length(vWorld - b) - (vGeometry.y + jointAmount);
  float field = min(capsule, min(jointA, jointB));
  float antialias = max(fwidth(field), 0.0005);
  float opacity = 1.0 - smoothstep(-antialias, antialias, field);
  if (opacity <= 0.001) discard;

  float rim = 1.0 - smoothstep(antialias, antialias * 5.0 + 0.001, abs(field));
  float longitudinal = 0.5 + 0.5 * cos(h * 12.56637 + vMaterial.y * 6.28318);
  float material = vMaterial.x >= 0.0 ? vMaterial.x : float(uMaterialIndex);
  vec3 colour = mix(uShellA, uShellB, 0.22 + longitudinal * 0.28 + fract(material * 0.17) * 0.08);
  colour *= 0.72 + rim * 0.28 + smoothstep(0.0, 1.0, h) * 0.08;
  float emission = vMaterial.w;

  if (uViewMode == 1) {
    float kind = mod(vMetadata.y, 4.0);
    colour = kind < 0.5 ? vec3(0.27, 0.69, 0.75)
      : kind < 1.5 ? vec3(0.75, 0.48, 0.25)
      : kind < 2.5 ? vec3(0.55, 0.38, 0.72)
      : vec3(0.48, 0.68, 0.34);
  } else if (uViewMode == 2) {
    float planted = clamp(vMetadata.w, 0.0, 1.0);
    float phasePulse = 0.5 + 0.5 * cos(vMetadata.z * 6.2831853);
    colour = mix(vec3(0.18, 0.25, 0.27), vec3(0.42, 0.88, 0.68), planted);
    emission += mix(phasePulse * 0.2, 0.62, planted);
  } else if (uViewMode == 3) {
    colour = mix(uShellA, uShellB, step(0.5, longitudinal));
  } else if (uViewMode == 4) {
    colour = vec3(0.012, 0.015, 0.018);
    emission = 0.0;
  } else if (uViewMode == 5) {
    colour = mix(vec3(0.006, 0.012, 0.017), uEmissionColour, clamp(emission + rim * 0.2, 0.0, 1.0));
  } else if (uViewMode == 6) {
    colour = vec3(clamp(vDepth * 0.35 + 0.5, 0.0, 1.0));
    emission = 0.0;
  }

  float scanY = fract(uEffects.w * 0.08 + 0.15);
  float scan = exp(-abs(gl_FragCoord.y / max(uViewport.y, 1.0) - scanY) * 180.0)
    * clamp(uEmissionControls.z, 0.0, 1.0);
  colour += uEmissionColour * (emission + scan) * (0.28 + uEmissionControls.w * 0.36);
  outColor = vec4(max(colour, vec3(0.0)), opacity * clamp(vMaterial.z, 0.0, 1.0));
}
`;

export const CHITIN_SHADER_SOURCES = Object.freeze({
	chamber: Object.freeze({ vertex: CHAMBER_VERTEX_SHADER, fragment: CHAMBER_FRAGMENT_SHADER }),
	plates: Object.freeze({ vertex: PLATE_VERTEX_SHADER, fragment: PLATE_FRAGMENT_SHADER }),
	capsules: Object.freeze({ vertex: CAPSULE_VERTEX_SHADER, fragment: CAPSULE_FRAGMENT_SHADER })
});
