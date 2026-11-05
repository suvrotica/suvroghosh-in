/** Bounded, feature-owned shaders. The planar relief is shading, not 3D geometry. */
export const FRACTAL_VERTEX = `#version 300 es
precision highp float;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

export const PRESENT_FRAGMENT = `#version 300 es
precision highp float;
out vec4 outColour;
uniform sampler2D u_tex;
void main() {
  outColour = vec4(texelFetch(u_tex, ivec2(gl_FragCoord.xy), 0).rgb, 1.0);
}`;

const COMMON = `
precision highp float;
precision highp int;
out vec4 outColour;
uniform vec2 u_resolution;
uniform vec3 u_palette[5];
uniform float u_relief;
uniform float u_roughness;
uniform float u_glow;
uniform float u_lightAngle;
uniform int u_family;
uniform int u_power;
uniform int u_iterations;
const float PI = 3.141592653589793;
vec3 palette(float position) {
  float t = fract(position) * 5.0;
  int i = int(floor(t));
  int j = (i + 1) % 5;
  return mix(u_palette[i], u_palette[j], smoothstep(0.0, 1.0, fract(t)));
}
vec3 filmic(vec3 c) {
  c = max(c, vec3(0.0));
  return clamp((c * (2.51 * c + 0.03)) / (c * (2.43 * c + 0.59) + 0.14), 0.0, 1.0);
}
vec3 displayColour(vec3 linearColour) {
  return pow(filmic(linearColour), vec3(1.0 / 2.2));
}
float grain(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
vec2 cmul(vec2 a, vec2 b) { return vec2(a.x*b.x-a.y*b.y, a.x*b.y+a.y*b.x); }
vec2 cpow(vec2 z, int power) {
  vec2 value = z;
  for (int j = 1; j < 10; j++) {
    if (j >= power) break;
    value = cmul(value, z);
  }
  return value;
}
`;

export const PLANAR_FRAGMENT = `#version 300 es
${COMMON}
uniform vec2 u_center;
uniform float u_span;
uniform float u_rotation;
uniform vec2 u_seed;
uniform vec2 u_roots[6];
uniform int u_rootCount;
uniform float u_relaxation;

void main() {
  vec2 screen = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float ca = cos(u_rotation), sa = sin(u_rotation);
  vec2 coordinate = u_center + mat2(ca, sa, -sa, ca) * screen * u_span;
  vec2 z = u_family == 1 || u_family == 4 ? coordinate : vec2(0.0);
  vec2 c = u_family == 1 ? u_seed : coordinate;
  float smoothCount = 0.0;
  float trap = 1e5;
  float rootIndex = 0.0;
  float converged = 0.0;
  float escaped = 0.0;
  float norm = 0.0;
  if (u_family == 4) {
    // Product-rule evaluation avoids coefficient expansion and keeps dragged roots stable.
    for (int n = 0; n < 96; n++) {
      vec2 value = vec2(1.0, 0.0), derivative = vec2(0.0);
      float nearest = 1e10;
      for (int j = 0; j < 6; j++) {
        if (j >= u_rootCount) break;
        vec2 delta = z - u_roots[j];
        float distanceSquared = dot(delta, delta);
        if (distanceSquared < nearest) { nearest = distanceSquared; rootIndex = float(j); }
        derivative = cmul(derivative, delta) + value;
        value = cmul(value, delta);
      }
      smoothCount = float(n);
      if (nearest < 0.00000005) { converged = 1.0; break; }
      float divisor = dot(derivative, derivative);
      if (divisor < 1e-18 || dot(z,z) > 1e12) break;
      z -= u_relaxation * cmul(value, vec2(derivative.x, -derivative.y)) / divisor;
      trap = min(trap, abs(length(z) - 0.7));
    }
  } else {
    int power = u_power;
    for (int n = 0; n < 512; n++) {
      if (n >= u_iterations) break;
      if (u_family == 2) z = abs(z);
      if (u_family == 3) z.y = -z.y;
      z = cpow(z, power) + c;
      norm = dot(z,z);
      trap = min(trap, min(abs(z.x), abs(z.y)));
      smoothCount = float(n);
      if (norm > 256.0) {
        escaped = 1.0;
        smoothCount = float(n) + 1.0 - log(max(log(sqrt(norm)), 0.00001)) / log(float(power));
        break;
      }
    }
  }

  bool newton = u_family == 4;
  float field = log(1.0 + max(smoothCount, 0.0));
  float bands = sin(field * 10.5);
  float layer = newton ? smoothCount * 0.13 : field * 1.5;
  vec2 slope = vec2(dFdx(layer), dFdy(layer));
  // Screen-space gradients create raised-looking relief while preserving the 2D equation.
  slope = clamp(slope * 6.0 * u_relief, vec2(-2.5), vec2(2.5));
  vec3 normal = normalize(vec3(-slope, 1.0));
  vec3 light = normalize(vec3(cos(u_lightAngle) * 0.65, sin(u_lightAngle) * 0.65, 0.72));
  float diffuse = max(dot(normal, light), 0.0);
  vec3 halfway = normalize(light + vec3(0.0, 0.0, 1.0));
  float highlight = pow(max(dot(normal, halfway), 0.0), mix(100.0, 9.0, u_roughness));
  float position = newton ? rootIndex / float(u_rootCount) + smoothCount * 0.012 : field * 0.31 + 0.06;
  vec3 base = pow(palette(position), vec3(2.2));
  float ribbon = pow(0.5 + 0.5 * bands, 14.0);
  float fineLines = 0.5 + 0.5 * cos(smoothCount * 1.35);
  vec3 colour = base * (0.28 + 0.95 * diffuse) * (0.73 + 0.27 * fineLines);
  colour += (0.12 + 0.23 * u_relief) * highlight * mix(vec3(0.7), base, 0.45);
  colour += base * ribbon * u_glow * 0.6;
  colour += pow(palette(position + 0.16), vec3(2.2)) * exp(-max(trap,0.0)*20.0) * u_glow * 0.12;
  float valid = newton ? converged : escaped;
  vec3 inside = vec3(0.003, 0.0045, 0.008) + pow(palette(0.6),vec3(2.2)) * 0.006;
  colour = mix(inside, colour, valid);
  float vignette = 1.0 - 0.13 * smoothstep(0.3, 1.2, length(screen));
  outColour = vec4(clamp(displayColour(colour * vignette) + (grain(gl_FragCoord.xy)-0.5)/350.0, 0.0, 1.0), 1.0);
}`;

export const SPATIAL_FRAGMENT = `#version 300 es
${COMMON}
uniform vec3 u_seed3;
uniform bool u_bulbJulia;
uniform float u_foldScale;
uniform float u_foldLimit;
uniform float u_minRadius;
uniform vec3 u_camPos;
uniform vec3 u_camForward;
uniform vec3 u_camRight;
uniform vec3 u_camUp;
uniform float u_fovScale;
uniform vec2 u_jitter;
uniform float u_haze;
uniform int u_steps;
uniform int u_aoSamples;
uniform int u_shadowSteps;
uniform sampler2D u_prevFrame;
uniform float u_blendFactor;

// Bounded distance estimators with dual structural orbit traps (x = DE, y = primary trap, z = secondary trap).
vec3 field(vec3 point) {
  vec3 z = point;
  float derivative = 1.0;
  float orbitPrimary = 1e5;
  float orbitSecondary = 1e5;
  float radius = 0.0;
  if (u_family == 5) {
    vec3 c = u_bulbJulia ? u_seed3 : point;
    float power = float(u_power);
    for (int i = 0; i < 18; i++) {
      if (i >= u_iterations) break;
      radius = length(z);
      orbitPrimary = min(orbitPrimary, length(z.xy));
      orbitSecondary = min(orbitSecondary, abs(z.z) * 0.72 + 0.28 * abs(radius - 0.95));
      if (radius > 8.0) break;
      float safeRadius = max(radius, 0.000001);
      float theta = acos(clamp(z.z / safeRadius, -1.0, 1.0));
      float phi = atan(z.y, z.x);
      float rp = pow(safeRadius, power - 1.0);
      derivative = rp * power * derivative + (u_bulbJulia ? 0.0 : 1.0);
      float zr = rp * safeRadius;
      theta *= power;
      phi *= power;
      z = zr * vec3(sin(theta) * cos(phi), sin(theta) * sin(phi), cos(theta)) + c;
    }
    radius = max(length(z), 0.000001);
    float distance = 0.5 * log(radius) * radius / max(derivative, 0.000001);
    return vec3(max(distance, 0.0), orbitPrimary, orbitSecondary);
  }
  float minRadiusSquared = u_minRadius * u_minRadius;
  for (int i = 0; i < 18; i++) {
    if (i >= u_iterations) break;
    z = clamp(z, -u_foldLimit, u_foldLimit) * 2.0 - z;
    float radiusSquared = dot(z, z);
    float factor = radiusSquared < minRadiusSquared ? 1.0 / minRadiusSquared :
      (radiusSquared < 1.0 ? 1.0 / max(radiusSquared, 0.000001) : 1.0);
    z *= factor;
    derivative *= factor;
    z = z * u_foldScale + point;
    derivative = derivative * abs(u_foldScale) + 1.0;
    orbitPrimary = min(orbitPrimary, length(z));
    orbitSecondary = min(orbitSecondary, max(abs(z.x), max(abs(z.y), abs(z.z))));
  }
  return vec3(length(z) / max(abs(derivative), 0.000001), orbitPrimary, orbitSecondary);
}

vec3 normalAt(vec3 position, float epsilon) {
  vec2 k = vec2(1.0, -1.0);
  return normalize(
    k.xyy * field(position + k.xyy * epsilon).x +
    k.yyx * field(position + k.yyx * epsilon).x +
    k.yxy * field(position + k.yxy * epsilon).x +
    k.xxx * field(position + k.xxx * epsilon).x
  );
}

float computeAO(vec3 pos, vec3 normal, float baseEps, int samples) {
  if (samples <= 0) return 1.0;
  float occ = 0.0;
  float weight = 1.0;
  float scale = max(baseEps * 5.5, 0.0035);
  for (int i = 1; i <= 5; i++) {
    if (i > samples) break;
    float sampleDist = scale * float(i * i) * 0.58;
    float de = field(pos + normal * sampleDist).x;
    occ += clamp((sampleDist - de) / max(sampleDist, 0.0001), 0.0, 1.0) * weight;
    weight *= 0.62;
  }
  return clamp(1.0 - occ * 0.36, 0.32, 1.0);
}

void main() {
  vec2 fragCoord = gl_FragCoord.xy + u_jitter;
  vec2 screen = (2.0 * fragCoord - u_resolution) / max(u_resolution.y, 1.0);
  vec3 origin = u_camPos;
  vec3 direction = normalize(u_camForward * u_fovScale + u_camRight * screen.x + u_camUp * screen.y);

  // Grazing key light and fill light anchored to both world angle and camera frame so recesses remain readable.
  vec3 worldLight = normalize(vec3(cos(u_lightAngle) * 0.85, 0.58 + 0.32 * sin(u_lightAngle), sin(u_lightAngle) * 0.75 + 0.45));
  vec3 camKey = normalize(u_camRight * cos(u_lightAngle) * 0.72 + u_camUp * (0.52 + 0.28 * sin(u_lightAngle)) - direction * 0.68);
  vec3 light = normalize(mix(camKey, worldLight, 0.35));
  vec3 fillDir = normalize(-u_camRight * 0.55 + u_camUp * 0.6 - direction * 0.55);

  float pixelRadius = 1.0 / max(u_resolution.y * u_fovScale, 1.0);
  float travel = 0.0;
  float epsilon = 0.0004;
  vec3 sampleValue = vec3(0.0);
  vec3 position = origin;
  float hit = 0.0;
  int stepCount = 0;

  for (int i = 0; i < 144; i++) {
    if (i >= u_steps) break;
    position = origin + direction * travel;
    sampleValue = field(position);
    if (isnan(sampleValue.x) || isinf(sampleValue.x)) break;
    epsilon = clamp(travel * pixelRadius * 0.82, 0.00007, 0.0032);
    if (sampleValue.x < epsilon) {
      hit = 1.0;
      stepCount = i;
      break;
    }
    travel += max(sampleValue.x * 0.66, epsilon * 0.32);
    if (travel > 16.0) break;
  }

  vec3 horizonTint = pow(palette(0.18), vec3(2.2)) * 0.025 + pow(palette(0.58), vec3(2.2)) * 0.018;
  float skyGlow = exp(-dot(screen, screen) * 0.65);
  float sunAlign = pow(max(dot(direction, light), 0.0), 6.0);
  vec3 bgColour = vec3(0.005, 0.008, 0.015) + horizonTint * (0.55 + 0.9 * skyGlow) + pow(palette(0.82), vec3(2.2)) * sunAlign * 0.035;
  vec3 colour = bgColour;

  if (hit > 0.5) {
    float normalEps = max(epsilon * 1.25, 0.00009);
    vec3 normal = normalAt(position, normalEps);
    if (any(isnan(normal)) || any(isinf(normal))) normal = -direction;

    float facing = max(dot(normal, -direction), 0.0);
    float keyDiffuse = max(dot(normal, light), 0.0);
    float fillDiffuse = max(dot(normal, fillDir), 0.0);

    float shadow = 1.0;
    if (u_shadowSteps > 0 && keyDiffuse > 0.02) {
      float st = normalEps * 5.5;
      for (int i = 0; i < 14; i++) {
        if (i >= u_shadowSteps) break;
        float distance = field(position + normal * normalEps * 3.5 + light * st).x;
        if (isnan(distance) || isinf(distance)) break;
        shadow = min(shadow, 11.0 * distance / max(st, 0.001));
        st += clamp(distance * 0.8, 0.012, 0.22);
        if (shadow < 0.26 || st > 1.8) break;
      }
    }
    shadow = clamp(shadow, 0.28, 1.0);

    float sampledAO = computeAO(position, normal, normalEps, u_aoSamples);
    float stepAO = clamp(1.0 - float(stepCount) / float(max(u_steps, 1)) * 0.34, 0.56, 1.0);
    float occlusion = sampledAO * stepAO;

    float primaryTrap = log(1.0 + max(sampleValue.y, 0.0) * 8.5) * 0.34;
    float secondaryTrap = log(1.0 + max(sampleValue.z, 0.0) * 5.0) * 0.21;
    float orbitPhase = primaryTrap + secondaryTrap + (1.0 - facing) * 0.18;
    float surfaceBands = sin(log(1.0 + max(sampleValue.y, 0.0) * 22.0) * 15.0);
    float fineStrata = cos(log(1.0 + max(sampleValue.z, 0.0) * 16.0) * 10.0);

    float p0 = 0.36 + 0.54 * (0.5 - 0.5 * cos(orbitPhase * 2.0 * PI));
    float p1 = 0.24 + 0.60 * (0.5 - 0.5 * cos((orbitPhase + 0.28) * 2.0 * PI));
    float p2 = 0.46 + 0.46 * (0.5 - 0.5 * cos((orbitPhase + 0.46) * 2.0 * PI));
    vec3 base = pow(palette(p0), vec3(2.2));
    vec3 midTone = pow(palette(p1), vec3(2.2));
    vec3 highlightTint = pow(palette(p2), vec3(2.2));

    float textureMod = 1.0 + (surfaceBands * 0.13 + fineStrata * 0.06) * u_relief;
    vec3 surfaceAlbedo = mix(midTone * 0.72, base * 1.35, clamp(0.15 + 0.85 * sampledAO, 0.0, 1.0)) * textureMod;

    float lighting = (0.30 + 0.42 * fillDiffuse + 0.22 * facing) * occlusion + 1.65 * keyDiffuse * shadow * mix(0.48, 1.0, occlusion);
    colour = surfaceAlbedo * lighting;

    vec3 halfway = normalize(light - direction);
    float specPower = mix(96.0, 8.0, u_roughness);
    float specular = pow(max(dot(normal, halfway), 0.0), specPower);
    float fresnel = pow(1.0 - facing, 2.6);

    colour += mix(vec3(0.96, 0.91, 0.85), highlightTint, 0.42) * specular * shadow * (0.72 - u_roughness * 0.28) * occlusion;
    colour += highlightTint * fresnel * (0.28 + u_glow * 0.68) * mix(0.45, 1.0, occlusion);
    colour += base * pow(0.5 + 0.5 * surfaceBands, 12.0) * u_glow * 0.2 * occlusion;

    // Subtle distance haze establishes scale between foreground ridges and deep background passages.
    float hazeFactor = 1.0 - exp(-max(travel - 0.22, 0.0) * max(u_haze, 0.005));
    vec3 hazeColour = bgColour + horizonTint * 0.85;
    colour = mix(colour, hazeColour, clamp(hazeFactor, 0.0, 0.75));
  }

  float vignette = 1.0 - 0.15 * smoothstep(0.52, 1.8, length(screen));
  vec3 finalColour = clamp(
    displayColour(colour * vignette) + (grain(gl_FragCoord.xy + u_jitter * 19.0) - 0.5) / 350.0,
    0.0,
    1.0
  );

  if (u_blendFactor > 0.0) {
    vec3 previous = texelFetch(u_prevFrame, ivec2(gl_FragCoord.xy), 0).rgb;
    finalColour = mix(finalColour, previous, clamp(u_blendFactor, 0.0, 0.95));
  }
  outColour = vec4(finalColour, 1.0);
}`;
