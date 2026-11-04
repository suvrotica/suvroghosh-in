/** Bounded, feature-owned shaders. The planar relief is shading, not 3D geometry. */
export const FRACTAL_VERTEX = `#version 300 es
precision highp float;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
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
uniform vec3 u_camera;
uniform int u_steps;
uniform bool u_shadows;

// Both are bounded distance ESTIMATORS. Neither is advertised as an exact signed distance.
vec2 field(vec3 point) {
  vec3 z = point;
  float derivative = 1.0;
  float orbit = 1e5;
  float radius = 0.0;
  if (u_family == 5) {
    vec3 c = u_bulbJulia ? u_seed3 : point;
    float power = float(u_power);
    for (int i = 0; i < 12; i++) {
      if (i >= u_iterations) break;
      radius = length(z);
      orbit = min(orbit, length(z.xy));
      if (radius > 8.0) break;
      float safeRadius = max(radius, 0.000001);
      float theta = acos(clamp(z.z / safeRadius, -1.0, 1.0));
      float phi = atan(z.y, z.x);
      float rp = pow(safeRadius, power - 1.0);
      derivative = rp * power * derivative + (u_bulbJulia ? 0.0 : 1.0);
      float zr = rp * safeRadius;
      theta *= power; phi *= power;
      z = zr * vec3(sin(theta) * cos(phi), sin(theta) * sin(phi), cos(theta)) + c;
    }
    radius = max(length(z), 0.000001);
    float distance = 0.5 * log(radius) * radius / max(derivative, 0.000001);
    return vec2(max(distance, 0.0), orbit);
  }
  float minRadiusSquared = u_minRadius * u_minRadius;
  for (int i = 0; i < 12; i++) {
    if (i >= u_iterations) break;
    z = clamp(z, -u_foldLimit, u_foldLimit) * 2.0 - z;
    float radiusSquared = dot(z,z);
    float factor = radiusSquared < minRadiusSquared ? 1.0 / minRadiusSquared :
      (radiusSquared < 1.0 ? 1.0 / max(radiusSquared, 0.000001) : 1.0);
    z *= factor;
    derivative *= factor;
    z = z * u_foldScale + point;
    derivative = derivative * abs(u_foldScale) + 1.0;
    // Keep the colour trap in orbit space. Dividing it by the DE derivative
    // collapses nearly every surface point to one colour after many folds.
    orbit = min(orbit, length(z));
  }
  return vec2(length(z) / abs(derivative), orbit);
}

vec3 normalAt(vec3 position, float epsilon) {
  vec2 k = vec2(1.0, -1.0);
  return normalize(k.xyy * field(position + k.xyy * epsilon).x +
    k.yyx * field(position + k.yyx * epsilon).x +
    k.yxy * field(position + k.yxy * epsilon).x +
    k.xxx * field(position + k.xxx * epsilon).x);
}

void main() {
  vec2 screen = (2.0 * gl_FragCoord.xy - u_resolution) / u_resolution.y;
  float yaw = u_camera.x, pitch = u_camera.y;
  vec3 origin = u_camera.z * vec3(cos(pitch)*sin(yaw), sin(pitch), cos(pitch)*cos(yaw));
  vec3 forward = normalize(-origin);
  vec3 right = normalize(cross(forward, vec3(0.0,1.0,0.0)));
  vec3 up = cross(right, forward);
  vec3 direction = normalize(forward * 1.9 + right * screen.x + up * screen.y);
  vec3 light = normalize(vec3(cos(u_lightAngle) * 0.8, 0.6 + 0.3*sin(u_lightAngle), 1.1));
  float travel = 0.0;
  float epsilon = 0.0005;
  vec2 sampleValue = vec2(0.0);
  vec3 position = origin;
  float hit = 0.0;
  int stepCount = 0;
  for (int i = 0; i < 112; i++) {
    if (i >= u_steps) break;
    position = origin + direction * travel;
    sampleValue = field(position);
    epsilon = max(0.00015, travel * 1.05 / u_resolution.y);
    if (sampleValue.x < epsilon) { hit = 1.0; stepCount = i; break; }
    travel += max(sampleValue.x * 0.68, epsilon * 0.35);
    if (travel > 18.0) break;
  }
  vec3 colour = vec3(0.0025, 0.004, 0.009);
  float atmosphere = exp(-dot(screen,screen) * 0.8);
  colour += pow(palette(0.55),vec3(2.2)) * atmosphere * 0.018;
  if (hit > 0.5) {
    vec3 normal = normalAt(position, max(epsilon * 1.1, 0.0002));
    if (any(isnan(normal)) || any(isinf(normal))) normal = -direction;
    float facing = max(dot(normal, -direction), 0.0);
    float diffuse = max(dot(normal,light), 0.0);
    float shadow = 1.0;
    if (u_shadows && diffuse > 0.03) {
      float st = epsilon * 7.0;
      for (int i = 0; i < 12; i++) {
        float distance = field(position + normal*epsilon*4.0 + light*st).x;
        shadow = min(shadow, 12.0 * distance / max(st,0.001));
        st += clamp(distance, 0.015, 0.25);
        if (shadow < 0.1 || st > 1.5) break;
      }
    }
    shadow = clamp(shadow, 0.16, 1.0);
    float orbitColour = log(1.0 + max(sampleValue.y,0.0)*9.0) * 0.28;
    float surfaceBands = sin(log(1.0 + max(sampleValue.y,0.0)*24.0) * 18.0);
    vec3 base = pow(palette(orbitColour + 0.1 + (1.0-facing)*0.24), vec3(2.2));
    float fresnel = pow(1.0-facing, 3.0);
    vec3 halfway = normalize(light-direction);
    float specular = pow(max(dot(normal,halfway),0.0), mix(110.0,7.0,u_roughness));
    float occlusion = clamp(1.0 - float(stepCount) / float(u_steps) * 0.48, 0.4, 1.0);
    float texture = 1.0 + surfaceBands * 0.12 * u_relief;
    colour = base * texture * (0.19 + 1.1*diffuse*shadow) * occlusion;
    colour += mix(vec3(0.9),base,0.45) * specular * shadow * (0.55 - u_roughness*0.26);
    colour += pow(palette(orbitColour+0.4),vec3(2.2))*fresnel*(0.25+u_glow*0.65);
    colour += base * pow(0.5+0.5*surfaceBands,12.0) * u_glow * 0.19;
    colour = mix(colour, vec3(0.005,0.008,0.018), 1.0-exp(-travel*0.018));
  }
  float vignette = 1.0 - 0.18*smoothstep(0.5,1.8,length(screen));
  outColour = vec4(clamp(displayColour(colour*vignette)+(grain(gl_FragCoord.xy)-0.5)/350.0,0.0,1.0),1.0);
}`;
