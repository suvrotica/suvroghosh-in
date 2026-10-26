// These billboards carry a three-dimensional centre and tangent. Motion and
// colour stay on the GPU; only a change to the authored form rebuilds buffers.
export const splatVertexShader = /* glsl */ `
attribute vec3 iCenter;
attribute vec3 iPrevious;
attribute vec3 iTangent;
attribute float iCoordinate;
attribute float iRandom;
uniform float uTime;
uniform float uTransition;
uniform float uSize;
uniform float uFlow;
uniform float uTurbulence;
uniform float uBreathing;
uniform float uElongation;
uniform float uOrientation;
uniform float uStyle;
uniform float uPointerEnabled;
uniform vec2 uPointer;
varying vec2 vUv;
varying float vCoordinate;
varying float vRandom;
varying float vDepth;
varying float vFlow;
varying float vHighlight;

void main() {
  float r = iRandom;
  vec3 centre = mix(iPrevious, iCenter, smoothstep(0.0, 1.0, uTransition));
  float phase = r * 6.2831853;
  vec3 wave = vec3(
    sin(centre.y * 1.7 + uTime * 0.34 + phase),
    cos(centre.z * 1.8 + uTime * 0.29 + phase),
    sin(centre.x * 1.5 - uTime * 0.23 + phase)
  );
  float breathe = 1.0 + sin(uTime * 0.68) * uBreathing * 0.1;
  centre = centre * breathe + wave * (0.025 + uTurbulence * 0.11) * uFlow;
  centre += iTangent * sin(uTime * 0.36 + phase) * uFlow * 0.09;
  vec4 viewCentre = modelViewMatrix * vec4(centre, 1.0);
  vec3 viewTangent = normalize(mat3(modelViewMatrix) * iTangent);
  vec2 axis = normalize(viewTangent.xy + vec2(0.0001));
  float angle = phase * uOrientation;
  axis = mat2(cos(angle), -sin(angle), sin(angle), cos(angle)) * axis;
  vec2 perpendicular = vec2(-axis.y, axis.x);
  float major = 1.0;
  float minor = 1.0;
  float radius = (0.011 + pow(r, 2.5) * 0.026) * uSize;
  if (uStyle > 0.5 && uStyle < 1.5) {
    major = uElongation;
    minor = 0.65;
  } else if (uStyle > 1.5 && uStyle < 2.5) {
    major = 1.0 + uElongation * 0.27;
    // Surface foreshortening is tied to the local radial normal.
    vec3 n = normalize(mat3(modelViewMatrix) * normalize(centre + vec3(0.0001)));
    minor = 0.18 + abs(n.z) * 0.75;
    radius *= 1.35;
  } else if (uStyle > 2.5 && uStyle < 3.5) {
    major = 1.0 + uElongation * 0.48;
    minor = 0.6;
    radius *= 1.65;
  } else if (uStyle > 3.5 && uStyle < 4.5) {
    radius *= 0.48;
  } else if (uStyle > 4.5) {
    if (r < 0.76) {
      major = 1.0 + uElongation * 0.65;
      minor = 0.65;
      radius *= 0.85;
    } else {
      radius *= 0.38;
    }
  }
  // Nearby splats respond in view space; moving the camera keeps this intuitive.
  vec2 projected = viewCentre.xy / max(-viewCentre.z, 0.1);
  vec2 toPointer = projected - uPointer;
  float influence = exp(-dot(toPointer, toPointer) * 13.0) * uPointerEnabled;
  viewCentre.xy += toPointer * influence * 0.3;
  viewCentre.xy += (axis * position.x * major + perpendicular * position.y * minor) * radius;
  gl_Position = projectionMatrix * viewCentre;
  vUv = uv * 2.0 - 1.0;
  vCoordinate = iCoordinate;
  vRandom = r;
  vDepth = -viewCentre.z;
  vFlow = length(wave) * 0.45;
  vHighlight = influence;
}
`;

export const splatFragmentShader = /* glsl */ `
uniform vec3 uPalette[5];
uniform float uOpacity;
uniform float uSoftness;
uniform float uGlow;
uniform float uStyle;
uniform float uHue;
uniform float uSaturation;
uniform float uGradient;
uniform float uColorBy;
varying vec2 vUv;
varying float vCoordinate;
varying float vRandom;
varying float vDepth;
varying float vFlow;
varying float vHighlight;

vec3 palette(float t) {
  float c = clamp(t, 0.0, 0.9999) * 4.0;
  if (c < 1.0) return mix(uPalette[0], uPalette[1], c);
  if (c < 2.0) return mix(uPalette[1], uPalette[2], c - 1.0);
  if (c < 3.0) return mix(uPalette[2], uPalette[3], c - 2.0);
  return mix(uPalette[3], uPalette[4], c - 3.0);
}

vec3 rotateHue(vec3 color, float angle) {
  vec3 k = vec3(0.57735027);
  return max(vec3(0.0), color * cos(angle) + cross(k, color) * sin(angle)
    + k * dot(k, color) * (1.0 - cos(angle)));
}

void main() {
  float d = dot(vUv, vUv);
  if (d > 1.0) discard;
  float hardness = mix(13.0, 3.7, uSoftness);
  float alpha = exp(-d * hardness) * (1.0 - smoothstep(0.72, 1.0, d));
  float energy = 0.37;
  if (uStyle > 1.5 && uStyle < 2.5) {
    alpha = (1.0 - smoothstep(0.62, 1.0, d)) * (0.65 + 0.35 * (1.0 - d));
    energy = 0.12;
  } else if (uStyle > 2.5 && uStyle < 3.5) {
    float grain = 0.72 + 0.28 * sin(vUv.x * 43.0 + vRandom * 61.0) * sin(vUv.y * 29.0);
    alpha = exp(-d * 2.8) * grain * (1.0 - smoothstep(0.62, 1.0, d));
    energy = 0.15;
  } else if (uStyle > 3.5 && uStyle < 4.5) {
    alpha = exp(-d * 15.0) + exp(-d * 3.4) * 0.22;
    energy = 1.8;
  } else if (uStyle > 4.5 && vRandom >= 0.76) {
    alpha = exp(-d * 17.0) + exp(-d * 3.5) * 0.18;
    energy = 2.1;
  }
  float t = vCoordinate;
  if (uColorBy > 0.5 && uColorBy < 1.5) t = clamp((vDepth - 3.0) / 6.0, 0.0, 1.0);
  if (uColorBy > 1.5) t = fract(vFlow + vCoordinate * 0.45);
  t = clamp((t - 0.5) * uGradient + 0.5, 0.0, 1.0);
  vec3 color = rotateHue(palette(t), uHue);
  float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
  color = max(vec3(0.0), mix(vec3(luma), color, uSaturation));
  // Additive emission is order-independent. Depth attenuation and low per-mark
  // energy retain the structure instead of turning intersections solid white.
  float depthFade = clamp(1.65 - vDepth * 0.105, 0.35, 1.2);
  float brightness = energy * (0.65 + uGlow * 0.65) * depthFade;
  brightness *= 0.65 + vRandom * 0.65;
  color *= brightness * (1.0 + vHighlight * 0.55);
  gl_FragColor = vec4(color, alpha * uOpacity);
}
`;
