// Shared declarations for the spacetime laboratory. Everything is in
// geometrized units G = c = 1 with the black hole mass M = 1, so the
// Schwarzschild radius r_s = 2M has length 2 in scene units.

precision highp float;
precision highp int;

out vec4 outColor;

uniform vec2 u_resolution;
uniform float u_time;
uniform vec2 u_split;          // x: compare enabled (0/1), y: divider position 0..1
uniform int u_modeA;           // spacetime model, left or full screen
uniform int u_modeB;           // spacetime model, right half of comparison
uniform vec3 u_camPos;
uniform vec3 u_camForward;
uniform vec3 u_camRight;
uniform vec3 u_camUp;
uniform float u_fovTan;        // tan(vertical fov / 2)
uniform int u_steps;
uniform float u_rs;            // Schwarzschild radius scale (2 in these units)
uniform float u_spin;          // Kerr a/M
uniform float u_charge;        // RN Q/M
uniform float u_weakMu;        // weak-field compactness GM/(rc^2)
uniform float u_weakEx;        // weak-field exaggeration factor
uniform float u_lambda;        // cosmological-constant mode strength (normalized H0)
uniform float u_adsl;          // anti-de-Sitter curvature scale (normalized)
uniform float u_flrwK;         // FLRW curvature -1, 0, +1
uniform float u_flrwA;         // FLRW scale factor a(t)
uniform float u_flrwH;         // FLRW H(t), normalized
uniform float u_flrwView;      // 0 comoving, 1 proper
uniform float u_gwAmp;
uniform float u_gwFreq;
uniform float u_gwPhase;
uniform float u_gwPol;         // 0 plus, 1 cross
uniform float u_gwChirp;       // 0/1
uniform float u_gwRing;        // 0/1 test-particle ring
uniform float u_gwArms;        // 0/1 interferometer arms
uniform vec2 u_disk;           // x: inner radius, y: outer radius
uniform float u_diskTemp;
uniform float u_beaming;       // 0/1 relativistic beaming on/off
uniform float u_overlayBits;   // bitfield: grid, photons, horizon, sphere, isco, ergo, redshift
uniform float u_starDensity;
uniform float u_galaxies;
uniform float u_milkyway;
uniform float u_cmb;
uniform float u_seed;
uniform float u_pixel;         // 1.0 / min(resolution)
uniform float u_speed;         // simulation speed multiplier
uniform float u_reduced;       // 1 when reduced-motion is requested

const float PI = 3.141592653589793;
const float INVALID_R = -1.0;

float overlayEnabled(float bit) {
	return mod(floor(u_overlayBits / bit), 2.0);
}

// ---- deterministic hash & value noise -----------------------------------

float hash11(float p) {
	p = fract(p * 0.1031);
	p *= p + 33.33;
	p *= p + p;
	return fract(p);
}

vec3 hash33(vec3 p) {
	p = fract(p * vec3(0.1031, 0.1030, 0.0973));
	p += dot(p, p.yxz + 33.33);
	return fract((p.xxy + p.yxx) * p.zyx);
}

float hash13(vec3 p) {
	p = fract(p * 0.1031);
	p += dot(p, p.zyx + 31.32);
	return fract((p.x + p.y) * p.z);
}

float vnoise(vec3 p) {
	vec3 i = floor(p);
	vec3 f = fract(p);
	f = f * f * (3.0 - 2.0 * f);
	float n000 = hash13(i);
	float n100 = hash13(i + vec3(1.0, 0.0, 0.0));
	float n010 = hash13(i + vec3(0.0, 1.0, 0.0));
	float n110 = hash13(i + vec3(1.0, 1.0, 0.0));
	float n001 = hash13(i + vec3(0.0, 0.0, 1.0));
	float n101 = hash13(i + vec3(1.0, 0.0, 1.0));
	float n011 = hash13(i + vec3(0.0, 1.0, 1.0));
	float n111 = hash13(i + vec3(1.0, 1.0, 1.0));
	return mix(
		mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y),
		mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y),
		f.z
	);
}

float fbm(vec3 p) {
	float total = 0.0;
	float amp = 0.5;
	for (int i = 0; i < 4; i++) {
		total += amp * vnoise(p);
		p = p * 2.03 + vec3(17.3, 9.1, 4.7);
		amp *= 0.5;
	}
	return total;
}

// ---- colour helpers ------------------------------------------------------

vec3 blackbody(float t) {
	// Rough stellar colour: cool red through yellow-white to blue-white.
	vec3 cool = vec3(1.0, 0.45, 0.25);
	vec3 mid = vec3(1.0, 0.9, 0.75);
	vec3 hot = vec3(0.7, 0.8, 1.0);
	return t < 0.5 ? mix(cool, mid, t * 2.0) : mix(mid, hot, (t - 0.5) * 2.0);
}

vec3 applyShift(vec3 color, float shift) {
	// shift > 0 blueshift/brighter, shift < 0 redshift/dimmer.
	float gain = exp(1.6 * shift);
	vec3 warm = vec3(1.0, 0.62, 0.4);
	vec3 cold = vec3(0.65, 0.8, 1.0);
	vec3 tint = shift >= 0.0 ? mix(vec3(1.0), cold, min(shift * 1.4, 0.8))
	                         : mix(vec3(1.0), warm, min(-shift * 1.4, 0.85));
	return color * tint * gain;
}

vec3 tonemap(vec3 color) {
	color = max(color, vec3(0.0));
	// ACES-ish
	return clamp((color * (2.51 * color + 0.03)) / (color * (2.43 * color + 0.59) + 0.14), 0.0, 1.0);
}

// ---- camera ---------------------------------------------------------------

vec3 rayDirection(vec2 fragCoord, float aspect) {
	vec2 ndc = (2.0 * fragCoord - u_resolution) / min(u_resolution.x, u_resolution.y);
	return normalize(u_camForward + u_fovTan * (ndc.x * u_camRight + ndc.y * u_camUp));
}
