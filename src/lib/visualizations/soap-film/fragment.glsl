precision highp float;

uniform vec2 u_resolution;
uniform sampler2D u_colour;
uniform vec2 u_lutSize;
uniform vec2 u_lutBounds;
uniform float u_thickness;
uniform float u_angle;
uniform float u_flowing;
uniform float u_time;

const float PI = 3.141592653589793;

// This is an authored, smooth thickness field, not a fluid solver. Rotating
// coordinate patches create broad curls without adding a second colour model.
vec2 rotatePoint(vec2 p, float angle) {
  float c = cos(angle);
  float s = sin(angle);
  return mat2(c, -s, s, c) * p;
}

vec2 curlAround(vec2 p, vec2 centre, float strength) {
  vec2 q = p - centre;
  float falloff = exp(-dot(q, q) * 4.0);
  return centre + rotatePoint(q, strength * falloff);
}

float curledBands(vec2 p, float t) {
  vec2 q = p;
  q = curlAround(q, vec2(-0.34 + 0.08 * sin(t * 0.7), 0.15), 3.6 + 0.4 * sin(t));
  q = curlAround(q, vec2(0.34, -0.29 + 0.07 * cos(t * 0.8)), -4.1 + 0.5 * sin(t * 0.8));
  q = curlAround(q, vec2(0.20, 0.62), 2.2);
  float bands = sin(6.8 * q.y + 1.7 * sin(q.x * 3.8 + t) + t * 0.45);
  float broad = sin(3.2 * q.x - 2.7 * q.y - t * 0.4);
  return 0.28 * bands + 0.13 * broad;
}

float thicknessField(vec2 p, float time) {
  float t = time * 0.12;
  // Sampling this odd field at world-space sphere.xy gives zero surface mean
  // over the whole sphere: each point has an equal-area antipodal counterpart.
  // The slider is the whole bubble's mean, not the visible hemisphere's mean.
  // The coefficient bounds avoid clipping.
  // The upper region is thinner, as in a draining vertical film.
  float variation = -0.53 * p.y + 0.5 * (curledBands(p, t) - curledBands(-p, t));
  float amplitude = min(u_thickness - 8.0, 1200.0 - u_thickness) * 0.88;
  return clamp(u_thickness + amplitude * variation, 0.0, 1200.0);
}

vec3 filmColour(float thickness, float angle) {
  vec2 fraction = clamp(vec2(thickness, angle) / u_lutBounds, 0.0, 1.0);
  // Lookup values are samples at the endpoints, not pixel edges.
  vec2 uv = (fraction * (u_lutSize - 1.0) + 0.5) / u_lutSize;
  vec3 encoded = texture2D(u_colour, uv).rgb;
  // The byte LUT uses sRGB encoding to retain precision in dark reflections.
  return mix(encoded / 12.92, pow((encoded + 0.055) / 1.055, vec3(2.4)),
    step(vec3(0.04045), encoded));
}

vec3 linearToSrgb(vec3 value) {
  value = max(value, vec3(0.0));
  return mix(12.92 * value, 1.055 * pow(value, vec3(1.0 / 2.4)) - 0.055,
    step(vec3(0.0031308), value));
}

vec3 enhanceDisplayChroma(vec3 value) {
  // Display-only enhancement requested for the artwork. Start from the optical
  // colour and extend its RGB chroma direction; cap the extension at the gamut
  // boundary instead of clipping negative channels or choosing another palette.
  float luminance = dot(value, vec3(0.2126, 0.7152, 0.0722));
  vec3 chroma = value - vec3(luminance);
  float minimum = min(min(chroma.r, chroma.g), chroma.b);
  float saturation = 1.65;
  if (minimum < -0.000001) saturation = min(saturation, luminance / -minimum);
  return vec3(luminance) + chroma * saturation;
}

vec3 orbitToWorld(vec3 direction, float orbit) {
  float c = cos(orbit);
  float s = sin(orbit);
  return vec3(c * direction.x + s * direction.z, direction.y,
    -s * direction.x + c * direction.z);
}

void main() {
  vec2 screen = (2.0 * gl_FragCoord.xy - u_resolution) / u_resolution.y;
  float aspect = u_resolution.x / u_resolution.y;
  float radius = min(0.81, aspect * 0.82);
  float orbit = radians(u_angle);
  vec2 p = screen / radius;
  float r = length(p);
  float pixel = 2.0 / (u_resolution.y * radius);

  // Near-black sRGB #020304. No ambient wash or glow outside the film.
  vec3 background = vec3(2.0, 3.0, 4.0) / (255.0 * 12.92);

  // Orthographic ray/sphere intersection. A sphere keeps a circular silhouette
  // at every orbit angle. This approximates reflection from its nearest wall;
  // it does not trace refraction, the far wall, or internal ray bounces.
  vec3 normal = vec3(p, sqrt(max(0.0, 1.0 - dot(p, p))));
  vec3 worldPosition = orbitToWorld(normal, orbit);
  float thickness = mix(u_thickness, thicknessField(worldPosition.xy, u_time), u_flowing);
  // A uniform sphere's local optical incidence is independent of camera orbit.
  // The final sub-pixel grazing rim is bounded by the LUT's supported angle.
  float incidence = min(degrees(acos(clamp(normal.z, 0.0, 1.0))), u_lutBounds.y);
  vec3 reflected = filmColour(thickness, incidence);
  // Fixed bright illumination and explicitly disclosed display saturation.
  // Neither changes the optical thickness, angle or wavelength calculation.
  vec3 displayedReflection = enhanceDisplayChroma(reflected);
  // A white studio environment, evaluated using the actual spherical reflected
  // ray. The fixed-world lights slide naturally over the bubble during orbit.
  // They change brightness only; the optical lookup supplies every film hue.
  vec3 reflectedRay = reflect(vec3(0.0, 0.0, -1.0), normal);
  vec3 worldReflection = orbitToWorld(reflectedRay, orbit);
  float key = max(dot(worldReflection, normalize(vec3(-0.42, 0.62, 0.66))), 0.0);
  float fill = max(dot(worldReflection, normalize(vec3(0.76, -0.12, 0.64))), 0.0);
  float illumination = 0.86 + 0.14 * pow(key, 4.0) + 1.2 * pow(key, 100.0) + 0.35 * pow(fill, 60.0);
  float reflectedLuminance = dot(reflected, vec3(0.2126, 0.7152, 0.0722));
  vec3 film = background * (1.0 - clamp(reflectedLuminance, 0.0, 1.0)) + displayedReflection * (8.0 * illumination);

  // The bright rim comes from the film's grazing-angle reflectance, not a wire
  // loop or a separately painted outline. No glow is added outside the sphere.
  float membrane = 1.0 - smoothstep(1.0 - pixel, 1.0 + pixel, r);
  vec3 colour = mix(background, film, membrane);
  // Keep luminous colours below display white by scaling every channel equally.
  // Values below the shoulder stay bright; higher peaks approach 1 without
  // independently clipping channels and flattening the spectral colour bands.
  float peak = max(max(colour.r, colour.g), colour.b);
  colour /= 1.0 + max(0.0, peak - 0.90);
  gl_FragColor = vec4(clamp(linearToSrgb(colour), 0.0, 1.0), 1.0);
}
