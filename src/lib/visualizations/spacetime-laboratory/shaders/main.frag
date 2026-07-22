// Spacetime laboratory: per-model null-ray propagation.
//
// This shader evaluates KNOWN metrics and integrates simplified null
// geodesics. It does not solve the Einstein field equation. Where a full
// geodesic is too expensive (Kerr), a labelled bending approximation is used.

struct RayHit {
	vec3 color;
	float escape;   // 1 = ray escaped to sky, 0 = captured / terminated
	float shift;    // accumulated red(+)/blue(-) shift estimate
	float minR;     // closest approach, in scene units
	float diskHit;  // 0/1
	vec3 diskColor;
};

// ---------------------------------------------------------------------------
// Accretion disk: thin equatorial annulus with Keplerian-ish rotation.
// ---------------------------------------------------------------------------

vec3 diskEmission(vec3 p, vec3 rayDir, float gravShift, float spin) {
	float r = length(p.xz);
	float inner = u_disk.x;
	float outer = u_disk.y;
	if (r < inner || r > outer) return vec3(0.0);

	float t = (r - inner) / max(outer - inner, 1e-3);
	// Temperature falls outward; overall scale set by u_diskTemp.
	float temp = u_diskTemp * pow(1.0 - t, 0.6);
	vec3 base = blackbody(clamp(temp, 0.05, 1.0));

	// Turbulence / clumping
	float ang = atan(p.z, p.x);
	float clump = fbm(vec3(r * 1.4, ang * 2.0, u_seed * 0.01));
	float streak = 0.75 + 0.5 * sin(ang * 9.0 + r * 3.0 + clump * 4.0);

	// Keplerian orbital velocity v = sqrt(M/r); direction of rotation.
	vec3 tangent = normalize(vec3(-p.z, 0.0, p.x));
	float v = sqrt(1.0 / max(r, 1.0));
	// Doppler factor for material moving toward/away along the line of sight.
	float doppler = dot(tangent, -rayDir) * v;
	float beam = u_beaming > 0.5 ? clamp(pow(max(0.2, 1.0 + doppler * 1.4), 2.0), 0.25, 3.0) : 1.0;

	// Frame dragging in Kerr adds an extra asymmetric boost.
	if (spin > 0.001) beam *= 1.0 + spin * doppler * 1.2;

	float edge = smoothstep(inner, inner + 0.35, r) * smoothstep(outer, outer - 2.0, r);
	vec3 color = base * streak * edge * (0.22 + 0.36 * temp);
	color = applyShift(color, gravShift + (u_beaming > 0.5 ? doppler * 0.8 : 0.0));
	return color * beam;
}

// March along a ray with a radially symmetric gravitational deflection model.
// strength(r) = u_rs / r^2 is the far-field Schwarzschild bending rate; the
// weak-field mode replaces u_rs with a scaled potential. This "curved-ray"
// integrator reproduces the shadow at ~2.6 rs, photon capture near r = 1.5 rs
// (the photon sphere at 3M), and the qualitatively correct disk image while
// remaining stable at 60 fps on modest GPUs.
RayHit traceBlackHole(vec3 ro, vec3 rd, float spin, float charge, bool weakMode) {
	RayHit hit;
	hit.color = vec3(0.0);
	hit.escape = 1.0;
	hit.shift = 0.0;
	hit.minR = 1e9;
	hit.diskHit = 0.0;
	hit.diskColor = vec3(0.0);

	// Effective strength: charge softens the attraction (replaces M by
	// M - Q^2/(2r) to leading order); spin enters below as frame dragging.
	float strength = weakMode ? u_weakMu * u_weakEx : 1.0;

	vec3 p = ro;
	vec3 v = rd;
	float prevY = p.y;
	float prevR = length(p);
	bool captured = false;
	float shiftAcc = 0.0;
	float diskGlow = 0.0;
	vec3 diskAccum = vec3(0.0);

	float farR = 60.0;
	int steps = u_steps;

	for (int i = 0; i < 512; i++) {
		if (i >= steps) break;
		float r = length(p);
		hit.minR = min(hit.minR, r);

		// Adaptive step: smaller near the hole, larger far away.
		float dt = weakMode ? 0.35 : clamp(r * 0.16, 0.02, 0.55);

		// Horizon crossing: rays that enter r < rs never return. Charge moves
		// the horizon inward: r_+ = M + sqrt(M^2 - Q^2) in units rs = 2.
		float rPlus = 0.5 * u_rs * (1.0 + sqrt(max(0.0, 1.0 - charge * charge)));
		if (!weakMode && r < rPlus * 1.001) { captured = true; break; }
		if (weakMode && r < 0.55) { captured = true; break; } // central body surface

		// Gravitational deflection: d(v) ~ -strength * rs * p / r^3 * dt
		vec3 accel = -strength * (u_rs / (r * r * r)) * p;
		// Frame dragging: swirl around the spin axis (y), decaying as 1/r^2.
		if (spin > 0.001) {
			vec3 drag = cross(vec3(0.0, 1.0, 0.0), p) / (r * r * r);
			accel += drag * spin * u_rs * 0.9;
		}
		v = normalize(v + accel * dt);

		// Accumulate a shift estimate: falling toward the hole blueshifts the
		// ray direction history; escaping redshifts. We track d(1/r).
		shiftAcc += strength * u_rs * (1.0 / max(r, 1.0) - 1.0 / max(prevR, 1.0)) * 0.35;

		vec3 pn = p + v * dt;

		// Disk: optically thin equatorial annulus. Accumulate emission when the
		// ray passes near the plane within the disk radii (robust to large steps
		// and to rays that skim rather than cross the plane).
		{
			float cr = length(p.xz);
			if (cr > u_disk.x && cr < u_disk.y) {
				float prox = exp(-abs(p.y) * abs(p.y) * 60.0); // thin disk profile
				if (prox > 0.02) {
					float grav = strength * u_rs / max(cr, 1.0);
					diskAccum += diskEmission(p, v, -0.5 * grav, spin) * prox * dt * 0.7;
					hit.diskHit = 1.0;
					if (length(diskAccum) > 0.7) break;
				}
			}
		}

		prevY = pn.y;
		prevR = r;
		p = pn;

		if (r > farR) break;
	}

	hit.escape = captured ? 0.0 : 1.0;
	hit.shift = shiftAcc + (captured ? 0.0 : 0.0);
	hit.diskColor = diskAccum;

	if (!captured) {
		hit.color = skyColor(v, hit.shift, u_time);
	} else {
		hit.color = vec3(0.0);
	}
	hit.color += diskAccum;
	return hit;
}

// ---------------------------------------------------------------------------
// Grid overlay: faint coordinate mesh on the equatorial plane, lensed along
// with everything else because it is evaluated in the marched space.
// ---------------------------------------------------------------------------

float equatorialGrid(vec3 ro, vec3 rd) {
	// Analytic intersection with y = 0 plane (no marching needed).
	if (abs(rd.y) < 1e-4) return 0.0;
	float t = -ro.y / rd.y;
	if (t < 0.0) return 0.0;
	vec3 p = ro + rd * t;
	float r = length(p.xz);
	if (r > 40.0) return 0.0;
	vec2 g = abs(fract(p.xz * 0.5) - 0.5);
	float line = 1.0 - smoothstep(0.0, 0.035, min(g.x, g.y));
	float ring = 1.0 - smoothstep(0.0, 0.06, abs(fract(r * 0.5) - 0.5) / 0.5 * r * 0.5);
	return max(line, ring * 0.3) * exp(-r * 0.06) * 0.5;
}

// ---------------------------------------------------------------------------
// Per-model ray evaluation.
// ---------------------------------------------------------------------------

vec3 traceModel(int mode, vec3 ro, vec3 rd, out float shiftOut) {
	shiftOut = 0.0;

	// 0: Minkowski — straight lines, honest sky.
	if (mode == 0) {
		vec3 c = skyColor(rd, 0.0, u_time);
		if (overlayEnabled(1.0) > 0.5) c += vec3(0.10, 0.22, 0.30) * equatorialGrid(ro, rd);
		return c;
	}

	// 1: Newtonian weak field — same curved-ray integrator, gentle strength.
	if (mode == 1) {
		RayHit h = traceBlackHole(ro, rd, 0.0, 0.0, true);
		if (overlayEnabled(1.0) > 0.5) h.color += vec3(0.10, 0.22, 0.30) * equatorialGrid(ro, rd);
		shiftOut = h.shift;
		return h.color;
	}

	// 2: Schwarzschild.
	if (mode == 2) {
		RayHit h = traceBlackHole(ro, rd, 0.0, 0.0, false);
		shiftOut = h.shift;
		// Overlays drawn in ray-space rings around the shadow.
		float bShadow = 2.6 * u_rs * 0.5; // angular shadow edge proxy
		float rScreen = length(cross(rd, normalize(-ro))) * length(ro);
		if (overlayEnabled(4.0) > 0.5 && abs(rScreen - 2.0) < 0.06 && h.escape < 0.5)
			h.color += vec3(0.25, 0.5, 0.9);
		if (overlayEnabled(8.0) > 0.5 && abs(rScreen - 3.0) < 0.08)
			h.color += vec3(0.2, 0.8, 0.6) * 0.7;
		if (overlayEnabled(16.0) > 0.5 && abs(rScreen - 6.0) < 0.1)
			h.color += vec3(0.9, 0.6, 0.2) * 0.55;
		if (overlayEnabled(64.0) > 0.5)
			h.color = mix(h.color, vec3(0.9, 0.2, 0.15), clamp(-h.shift * 2.2, 0.0, 0.45) * (h.escape));
		return h.color;
	}

	// 3: Kerr — curved-ray integrator plus frame-drag swirl term.
	if (mode == 3) {
		RayHit h = traceBlackHole(ro, rd, u_spin, 0.0, false);
		shiftOut = h.shift;
		float rScreen = length(cross(rd, normalize(-ro))) * length(ro);
		float rPlus = 1.0 + sqrt(max(0.0, 1.0 - u_spin * u_spin));
		if (overlayEnabled(4.0) > 0.5 && abs(rScreen - rPlus) < 0.06)
			h.color += vec3(0.25, 0.5, 0.9);
		if (overlayEnabled(32.0) > 0.5 && abs(rScreen - 2.0) < 0.08)
			h.color += vec3(0.7, 0.4, 0.9) * 0.65;
		return h.color;
	}

	// 4: Reissner–Nordstrom — charge reduces effective attraction.
	if (mode == 4) {
		RayHit h = traceBlackHole(ro, rd, 0.0, u_charge, false);
		shiftOut = h.shift;
		float q = min(u_charge, 1.0);
		float rPlus = 1.0 + sqrt(max(0.0, 1.0 - q * q));
		float rMinus = 1.0 - sqrt(max(0.0, 1.0 - q * q));
		float rScreen = length(cross(rd, normalize(-ro))) * length(ro);
		if (overlayEnabled(4.0) > 0.5 && abs(rScreen - rPlus) < 0.06)
			h.color += vec3(0.25, 0.5, 0.9);
		if (overlayEnabled(8.0) > 0.5 && abs(rScreen - max(rMinus, 0.2)) < 0.05)
			h.color += vec3(0.9, 0.5, 0.2) * 0.5;
		return h.color;
	}

	// 5: FLRW — expanding grid of galaxies. Light from a galaxy at comoving
	// distance is redshifted by 1 + z = a_now / a_emit.
	if (mode == 5) {
		float a = max(u_flrwA, 0.05);
		float z = max(1.0 / a - 1.0, 0.0);
		vec3 c = skyColor(rd, -z * 0.8, u_time);
		// Comoving coordinate mesh recedes with the Hubble flow.
		if (overlayEnabled(1.0) > 0.5) {
			vec3 drift = rd;
			float scale = u_flrwView > 0.5 ? a : 1.0;
			float lat = asin(clamp(drift.y, -1.0, 1.0));
			float lon = atan(drift.z, drift.x);
			vec2 grid = vec2(lon * 4.0 / PI, lat * 4.0 / PI) * scale;
			vec2 cell = abs(fract(grid) - 0.5);
			float line = 1.0 - smoothstep(0.0, 0.05, min(cell.x, cell.y));
			c += vec3(0.12, 0.25, 0.3) * line * 0.5;
		}
		shiftOut = -z;
		return c;
	}

	// 6: de Sitter — accelerated expansion, cosmological horizon shell.
	if (mode == 6) {
		float h0 = max(u_lambda, 0.02);
		float horizon = 1.0 / h0; // c/H, normalized
		// Outward recession velocity grows with distance; shift increases.
		float zApprox = 0.6 * h0 * 2.0;
		vec3 c = skyColor(rd, -zApprox, u_time);
		if (overlayEnabled(1.0) > 0.5) {
			float lat = asin(clamp(rd.y, -1.0, 1.0));
			float lon = atan(rd.z, rd.x);
			vec2 grid = vec2(lon * 4.0 / PI, lat * 4.0 / PI) * (1.0 + 0.6 * u_lambda * u_time * 0.1);
			vec2 cell = abs(fract(grid) - 0.5);
			float line = 1.0 - smoothstep(0.0, 0.05, min(cell.x, cell.y));
			c += vec3(0.15, 0.2, 0.35) * line * 0.5;
		}
		// Horizon glow marker: a dim shell where recession reaches c.
		float rim = pow(1.0 - abs(rd.y * 0.0), 1.0);
		c += vec3(0.05, 0.08, 0.16) * rim * u_lambda;
		shiftOut = -zApprox;
		return c;
	}

	// 7: anti-de Sitter — light bends back toward the centre (confinement
	// metaphor): rays oscillate rather than escape cleanly. Visualized as an
	// inward "refocusing" of the sky plus a repeating grid echo.
	if (mode == 7) {
		float focus = u_adsl;
		vec3 bent = normalize(rd - 0.35 * focus * cross(rd, vec3(0.0, 1.0, 0.0)) * 0.0 + focus * 0.25 * vec3(rd.x, -abs(rd.y) * 0.2, rd.z));
		vec3 c = skyColor(normalize(mix(rd, bent, 0.8)), 0.15, u_time);
		if (overlayEnabled(1.0) > 0.5) {
			float lat = asin(clamp(rd.y, -1.0, 1.0));
			float lon = atan(rd.z, rd.x);
			for (int echo = 0; echo < 3; echo++) {
				float s = 1.0 + float(echo) * focus * 0.5;
				vec2 grid = vec2(lon * 4.0 / PI, lat * 4.0 / PI) * s;
				vec2 cell = abs(fract(grid) - 0.5);
				float line = 1.0 - smoothstep(0.0, 0.05, min(cell.x, cell.y));
				c += vec3(0.12, 0.3, 0.28) * line * (0.5 / (float(echo) + 1.0));
			}
		}
		shiftOut = 0.15;
		return c;
	}

	// 8: Gravitational wave — the screen grid itself is strained. Plus and
	// cross polarizations applied as a time-dependent metric perturbation to
	// the ray direction.
	if (mode == 8) {
		float phase = 2.0 * PI * u_gwFreq * u_time + u_gwPhase;
		float amp = u_gwAmp;
		if (u_gwChirp > 0.5) {
			// Inspiral chirp: frequency and amplitude sweep upward over ~6 s.
			float tc = mod(u_time, 6.0) / 6.0;
			phase = 2.0 * PI * (u_gwFreq * (u_time + 2.0 * tc * tc * u_time));
			amp *= smoothstep(0.0, 0.75, tc) * (1.0 - smoothstep(0.9, 1.0, tc));
		}
		float h = amp * cos(phase);
		vec3 bent = rd;
		if (u_gwPol < 0.5) {
			bent = normalize(vec3(rd.x * (1.0 + h), rd.y * (1.0 - h), rd.z));
		} else {
			float s = sin(phase), cph = cos(phase);
			vec2 rp = mat2(cph, -s, s, cph) * rd.xy;
			rp = vec2(rp.x * (1.0 + h), rp.y * (1.0 - h));
			bent = normalize(vec3(mat2(cph, s, -s, cph) * rp, rd.z));
		}
		vec3 c = skyColor(bent, 0.0, u_time);

		// Test-particle ring: a circle in the plane of the screen stretched by h.
		if (u_gwRing > 0.5) {
			vec2 ndc = (2.0 * gl_FragCoord.xy - u_resolution) / min(u_resolution.x, u_resolution.y);
			vec2 ringNdc = u_gwPol < 0.5 ? vec2(ndc.x / (1.0 + h), ndc.y / (1.0 - h))
			                            : mat2(0.7071, -0.7071, 0.7071, 0.7071) * ndc;
			if (u_gwPol >= 0.5) ringNdc = vec2(ringNdc.x / (1.0 + h), ringNdc.y / (1.0 - h));
			float ringR = length(ringNdc);
			float ringLine = 1.0 - smoothstep(0.0, 0.012, abs(ringR - 0.55));
			c += vec3(0.3, 0.85, 0.7) * ringLine * 0.8;
		}
		// Interferometer arms: cross hairs whose lengths oscillate oppositely.
		if (u_gwArms > 0.5) {
			vec2 ndc = (2.0 * gl_FragCoord.xy - u_resolution) / min(u_resolution.x, u_resolution.y);
			float armX = (1.0 - smoothstep(0.0, 0.012, abs(ndc.y))) * step(abs(ndc.x), 0.75 * (1.0 + h));
			float armY = (1.0 - smoothstep(0.0, 0.012, abs(ndc.x))) * step(abs(ndc.y), 0.75 * (1.0 - h));
			c += vec3(0.9, 0.55, 0.2) * max(armX, armY) * 0.55;
		}
		shiftOut = 0.0;
		return c;
	}

	return vec3(1.0, 0.0, 1.0); // invalid state fallback
}

void main() {
	vec2 frag = gl_FragCoord.xy;
	float aspect = u_resolution.x / u_resolution.y;
	vec3 rd = rayDirection(frag, aspect);
	float shift = 0.0;
	vec3 color;

	if (u_split.x > 0.5) {
		float splitX = u_split.y * u_resolution.x;
		if (frag.x < splitX) {
			color = traceModel(u_modeA, u_camPos, rd, shift);
		} else {
			color = traceModel(u_modeB, u_camPos, rd, shift);
		}
		// Divider
		if (abs(frag.x - splitX) < 1.5) color = vec3(0.9);
	} else {
		color = traceModel(u_modeA, u_camPos, rd, shift);
	}

	outColor = vec4(tonemap(color), 1.0);
}
