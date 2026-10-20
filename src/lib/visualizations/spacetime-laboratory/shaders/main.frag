// Spacetime laboratory: per-model null-ray propagation.
//
// Schwarzschild/RN use the static metric's null-geodesic equations. Kerr and
// weak-field views use labelled bending approximations; cosmology and wave
// scenes are teaching diagrams. This does not solve the Einstein field equation.

float equatorialGrid(vec3 ro, vec3 rd);

float coordinateGridAt(vec3 p) {
	float r = length(p.xz);
	if (r > 40.0) return 0.0;
	vec2 g = abs(fract(p.xz * 0.5) - 0.5);
	float line = 1.0 - smoothstep(0.0, 0.035, min(g.x, g.y));
	float ring = 1.0 - smoothstep(0.0, 0.06, abs(fract(r * 0.5) - 0.5) / 0.5 * r * 0.5);
	return max(line, ring * 0.3) * exp(-r * 0.06) * 0.5;
}

struct RayHit {
	vec3 color;
	float escape;   // 1 = ray escapes, 0 = captured or numerically unresolved
	float shift;    // log-frequency shift: positive blue, negative red
	float minR;     // closest approach, in scene units
	float diskHit;  // 0/1
	vec3 diskColor;
	vec3 skyDirection;
	float skyShift;
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
	if (u_beaming > 0.5 && spin > 0.001) beam *= 1.0 + spin * doppler * 1.2;

	float edge = smoothstep(inner, inner + 0.35, r) * (1.0 - smoothstep(outer - 2.0, outer, r));
	vec3 color = base * streak * edge * (0.22 + 0.36 * temp);
	color = applyShift(color, gravShift + (u_beaming > 0.5 ? doppler * 0.8 : 0.0));
	return color * beam;
}

// Static Schwarzschild/RN null geodesics in areal-radius Cartesian coordinates.
// In each ray's orbital plane, rdot² = E² - f(r)L²/r² and phidot = L/r²,
// hence p'' = (-3 M L²/r⁵ + 2 Q² L²/r⁶) p. M=1 here.
// The initial direction is measured in a STATIC observer's orthonormal frame.
// Kerr and the magnified weak field remain explicitly illustrative models.
float staticMetric(float r, float q) {
	return 1.0 - 2.0 / r + q * q / (r * r);
}

vec3 staticRayAcceleration(vec3 p, float angularMomentumSquared, float chargeSquared) {
	float r2 = max(dot(p, p), 1e-6);
	float r = sqrt(r2);
	return angularMomentumSquared * (-3.0 + 2.0 * chargeSquared / r) * p / (r2 * r2 * r);
}

void staticRayStep(inout vec3 p, inout vec3 v, float dt, float l2, float q2) {
	// Fourth-order Runge–Kutta. Velocity is affine, not artificially normalized.
	vec3 a1 = staticRayAcceleration(p, l2, q2);
	vec3 v2 = v + 0.5 * dt * a1;
	vec3 a2 = staticRayAcceleration(p + 0.5 * dt * v, l2, q2);
	vec3 v3 = v + 0.5 * dt * a2;
	vec3 a3 = staticRayAcceleration(p + 0.5 * dt * v2, l2, q2);
	vec3 v4 = v + dt * a3;
	vec3 a4 = staticRayAcceleration(p + dt * v3, l2, q2);
	p += dt * (v + 2.0 * v2 + 2.0 * v3 + v4) / 6.0;
	v += dt * (a1 + 2.0 * a2 + 2.0 * a3 + a4) / 6.0;
}

RayHit traceBlackHole(vec3 ro, vec3 rd, float spin, float charge, bool weakMode) {
	RayHit hit;
	hit.color = vec3(0.0);
	hit.escape = 0.0;
	hit.shift = 0.0;
	hit.minR = length(ro);
	hit.diskHit = 0.0;
	hit.diskColor = vec3(0.0);
	hit.skyDirection = rd;
	hit.skyShift = 0.0;

	float strength = weakMode ? u_weakMu * u_weakEx : 1.0;
	if (weakMode && strength < 1e-7) {
		hit.escape = 1.0;
		if (overlayEnabled(1.0) > 0.5) hit.color += vec3(0.10, 0.22, 0.30) * equatorialGrid(ro, rd);
		return hit;
	}
	bool exactStatic = !weakMode && spin < 0.001;
	// Super-extremal RN is not rendered as a fictitious extremal black hole.
	if (charge > 1.0) return hit;
	float rPlus = 1.0 + sqrt(max(0.0, 1.0 - charge * charge - spin * spin));
	float observerR = length(ro);
	float observerF = staticMetric(observerR, charge);
	if (!weakMode && observerR <= rPlus * 1.0001) return hit;
	vec3 radial = ro / observerR;
	vec3 v = rd;
	if (exactStatic) {
		float component = dot(rd, radial);
		v = rd + (sqrt(max(observerF, 1e-7)) - 1.0) * component * radial;
	}
	float l2 = dot(cross(ro, v), cross(ro, v));
	float q2 = charge * charge;

	// Classify static capture from the exact effective-potential maximum, even
	// if a near-critical ray uses the whole numerical budget. Budget exhaustion
	// must never turn an inward radial ray into a false view of the sky.
	bool staticCaptured = false;
	if (exactStatic) {
		float rPhoton = 0.5 * (3.0 + sqrt(9.0 - 8.0 * q2));
		float bCriticalSquared = rPhoton * rPhoton / staticMetric(rPhoton, charge);
		float bSquared = l2 / max(observerF, 1e-7);
		bool inward = dot(v, ro) < 0.0;
		staticCaptured = observerR >= rPhoton
			? (inward && bSquared < bCriticalSquared)
			: (inward || bSquared > bCriticalSquared);
	}

	vec3 p = ro;
	bool captured = false;
	bool escaped = false;
	vec3 diskAccum = vec3(0.0);
	float diskShiftAccum = 0.0;
	float diskWeight = 0.0;
	float gridAccum = 0.0;
	float farR = max(100.0, observerR * 3.0);
	float accuracy = 0.14 * sqrt(56.0 / float(max(u_steps, 56)));
	// Radial steps grow far from the lens, so the farthest observer still reaches
	// the lens at Low quality. A small reserve resolves additional lensed images.
	int budget = min(512, max(u_steps, 56) + 80);
	for (int i = 0; i < budget && i < 512; i++) {
		float r = length(p);
		hit.minR = min(hit.minR, r);
		if (!weakMode && r <= rPlus * 1.0001) { captured = true; break; }
		if (r > farR && dot(p, v) > 0.0) { escaped = true; break; }

		float dt = accuracy * max(r, 0.5) / max(length(v), 0.15);
		vec3 pn = p;
		vec3 vn = v;
		if (exactStatic) {
			staticRayStep(pn, vn, dt, l2, q2);
		} else {
			// Weak-field bending has the GR 4M/b far-field limit; its softened
			// central core and the Kerr swirl are visual approximations.
			float softR = weakMode ? max(r, 0.55) : max(r, rPlus);
			vec3 accel = -strength * u_rs * p / (softR * softR * softR);
			if (spin > 0.001) accel += cross(vec3(0.0, 1.0, 0.0), p) * spin * u_rs * 0.9 / (softR * softR * softR);
			vn = normalize(v + accel * dt);
			pn = p + vn * dt;
		}
		if (any(isnan(pn)) || any(isinf(pn)) || any(isnan(vn)) || any(isinf(vn))) break;

		// Locate disk-plane crossings along the step instead of hoping a sample
		// lands in its thin Gaussian profile. The disk remains an emission model.
		float dy = pn.y - p.y;
		bool crosses = abs(dy) > 1e-6 && p.y * pn.y <= 0.0;
		vec3 sampleP = crosses ? mix(p, pn, clamp(-p.y / dy, 0.0, 1.0)) : p;
		if (crosses && overlayEnabled(1.0) > 0.5 && (weakMode || length(sampleP) > rPlus)) {
			gridAccum = max(gridAccum, coordinateGridAt(sampleP));
		}
		if (!weakMode) {
			float diskR = length(sampleP.xz);
			float proximity = crosses ? 1.0 : exp(-p.y * p.y * 60.0) * min(dt * length(v), 0.4);
			if (diskR > max(u_disk.x, rPlus) && diskR < u_disk.y && proximity > 0.02) {
				float emitF = staticMetric(diskR, charge);
				float gravShift = exactStatic ? 0.5 * log(max(emitF, 1e-6) / max(observerF, 1e-6)) : -1.0 / diskR;
				diskAccum += diskEmission(sampleP, normalize(v), gravShift, spin) * proximity * 0.7;
				diskShiftAccum += gravShift * proximity;
				diskWeight += proximity;
				hit.diskHit = 1.0;
			}
		}
		p = pn;
		v = vn;
	}

	if (exactStatic) captured = staticCaptured;
	hit.escape = !captured && (escaped || exactStatic) ? 1.0 : 0.0;
	// A photon received from a static sky at infinity is blueshifted for the
	// static observer: nu_obs/nu_infinity = 1/sqrt(f_observer).
	hit.shift = exactStatic ? -0.5 * log(max(observerF, 1e-6)) : 0.0;
	hit.diskColor = diskAccum;
	hit.skyDirection = normalize(v);
	hit.skyShift = hit.shift;
	if (diskWeight > 0.0) hit.shift = diskShiftAccum / diskWeight;
	hit.color += vec3(0.10, 0.22, 0.30) * gridAccum;
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
	return coordinateGridAt(p);
}

// ---------------------------------------------------------------------------
// Per-model ray evaluation.
// ---------------------------------------------------------------------------

vec3 traceModel(int mode, vec3 ro, vec3 rd, out float shiftOut, out vec3 skyDirection, out float skyShift, out float skyVisible) {
	shiftOut = 0.0;
	skyDirection = rd;
	skyShift = 0.0;
	skyVisible = 1.0;

	// 0: Minkowski — straight lines, honest sky.
	if (mode == 0) {
		vec3 c = vec3(0.0);
		if (overlayEnabled(1.0) > 0.5) c += vec3(0.10, 0.22, 0.30) * equatorialGrid(ro, rd);
		return c;
	}

	// One shared call site prevents ANGLE/D3D from duplicating the complete
	// geodesic march for every compact-object mode during native compilation.
	if (mode >= 1 && mode <= 4) {
		float spin = mode == 3 ? u_spin : 0.0;
		float charge = mode == 4 ? u_charge : 0.0;
		RayHit h = traceBlackHole(ro, rd, spin, charge, mode == 1);
		shiftOut = h.shift;
		skyDirection = h.skyDirection;
		skyShift = h.skyShift;
		skyVisible = h.escape;
		float rScreen = length(cross(rd, normalize(-ro))) * length(ro);
		if (mode == 2) {
			if (overlayEnabled(4.0) > 0.5 && abs(rScreen - 2.0) < 0.06 && h.escape < 0.5)
				h.color += vec3(0.25, 0.5, 0.9);
			if (overlayEnabled(8.0) > 0.5 && abs(rScreen - 3.0) < 0.08)
				h.color += vec3(0.2, 0.8, 0.6) * 0.7;
			if (overlayEnabled(16.0) > 0.5 && abs(rScreen - 6.0) < 0.1)
				h.color += vec3(0.9, 0.6, 0.2) * 0.55;
		} else if (mode == 3) {
			float rPlus = 1.0 + sqrt(max(0.0, 1.0 - spin * spin));
			if (overlayEnabled(4.0) > 0.5 && abs(rScreen - rPlus) < 0.06)
				h.color += vec3(0.25, 0.5, 0.9);
			if (overlayEnabled(32.0) > 0.5 && abs(rScreen - 2.0) < 0.08)
				h.color += vec3(0.7, 0.4, 0.9) * 0.65;
		} else if (mode == 4 && charge <= 1.0) {
			float rPlus = 1.0 + sqrt(max(0.0, 1.0 - charge * charge));
			float rPhoton = 0.5 * (3.0 + sqrt(9.0 - 8.0 * charge * charge));
			if (overlayEnabled(4.0) > 0.5 && abs(rScreen - rPlus) < 0.06)
				h.color += vec3(0.25, 0.5, 0.9);
			if (overlayEnabled(8.0) > 0.5 && abs(rScreen - rPhoton) < 0.08)
				h.color += vec3(0.2, 0.8, 0.6) * 0.7;
		}
		return h.color;
	}

	// 5: FLRW — expanding grid of galaxies. Light from a galaxy at comoving
	// distance is redshifted by 1 + z = a_now / a_emit.
	if (mode == 5) {
		float a = max(u_flrwA, 0.0001);
		float ratio = a / max(u_flrwEmitA, 0.0001);
		// A labelled comparison with one reference epoch. RGB tint is illustrative;
		// no distance-dependent emission times or galaxy light cone are traced.
		float shift = -log(max(ratio, 1e-6));
		skyShift = shift;
		vec3 c = vec3(0.0);
		// Comoving coordinate mesh recedes with the Hubble flow.
		if (overlayEnabled(1.0) > 0.5) {
			vec3 drift = rd;
			float scale = u_flrwView > 0.5 ? 1.0 / a : 1.0;
			float lat = asin(clamp(drift.y, -1.0, 1.0));
			float lon = atan(drift.z, drift.x);
			vec2 grid = vec2(lon * 4.0 / PI, lat * 4.0 / PI) * scale;
			vec2 cell = abs(fract(grid) - 0.5);
			float line = 1.0 - smoothstep(0.0, 0.05, min(cell.x, cell.y));
			c += vec3(0.12, 0.25, 0.3) * line * 0.5;
		}
		shiftOut = shift;
		return c;
	}

	// 6: de Sitter — accelerated expansion, cosmological horizon shell.
	if (mode == 6) {
		float h0 = max(u_lambda, 0.0);
		if (h0 < 1e-6) {
			vec3 flatColor = vec3(0.0);
			if (overlayEnabled(1.0) > 0.5) flatColor += vec3(0.10, 0.22, 0.30) * equatorialGrid(ro, rd);
			return flatColor;
		}
		float horizon = 1.0 / h0; // c/H, normalized
		// Outward recession velocity grows with distance; shift increases.
		float zApprox = 0.6 * h0 * 2.0;
		skyShift = -zApprox;
		vec3 c = vec3(0.0);
		if (overlayEnabled(1.0) > 0.5) {
			float lat = asin(clamp(rd.y, -1.0, 1.0));
			float lon = atan(rd.z, rd.x);
			vec2 grid = vec2(lon * 4.0 / PI, lat * 4.0 / PI) * (1.0 + 0.6 * u_lambda * u_time * 0.1);
			vec2 cell = abs(fract(grid) - 0.5);
			float line = 1.0 - smoothstep(0.0, 0.05, min(cell.x, cell.y));
			c += vec3(0.15, 0.2, 0.35) * line * 0.5;
		}
		// Schematic distance guide, not an optical image of the observer-centred
		// cosmological horizon. Map c/H to a finite display radius monotonically.
		if (overlayEnabled(4.0) > 0.5) {
			vec2 ndc = (2.0 * gl_FragCoord.xy - u_resolution) / min(u_resolution.x, u_resolution.y);
			float displayRadius = horizon / (horizon + 4.0);
			float rim = 1.0 - smoothstep(0.0, 0.012, abs(length(ndc) - displayRadius));
			c += vec3(0.15, 0.35, 0.65) * rim;
		}
		shiftOut = -zApprox;
		return c;
	}

	// 7: anti-de Sitter — light bends back toward the centre (confinement
	// metaphor): rays oscillate rather than escape cleanly. Visualized as an
	// inward "refocusing" of the sky plus a repeating grid echo.
	if (mode == 7) {
		// Curvature magnitude scales as 1/L². This remains a static refocusing
		// sketch rather than a propagation/reflection calculation at the AdS boundary.
		float focus = 0.12 / max(u_adsl * u_adsl, 0.01);
		vec3 bent = normalize(rd + focus * 0.25 * vec3(rd.x, -rd.y * 0.2, rd.z));
		skyDirection = normalize(mix(rd, bent, 0.8));
		vec3 c = vec3(0.0);
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
		shiftOut = 0.0;
		return c;
	}

	// 8: Gravitational wave — the screen grid itself is strained. Plus and
	// cross polarizations applied as a time-dependent metric perturbation to
	// the ray direction.
	if (mode == 8) {
		float phase = 2.0 * PI * u_gwFreq * u_time + u_gwPhase;
		float amp = clamp(u_gwAmp, 0.0, 0.5);
		if (u_gwChirp > 0.5) {
			// Inspiral chirp: frequency and amplitude sweep upward over ~6 s.
			float cycleTime = mod(u_time, 6.0);
			float tc = cycleTime / 6.0;
			phase = 2.0 * PI * u_gwFreq * (cycleTime + 2.0 * tc * tc * cycleTime) + u_gwPhase;
			amp *= smoothstep(0.0, 0.75, tc) * (1.0 - smoothstep(0.9, 1.0, tc));
		}
		// Metric strain changes test-mass separations by h/2 at first order.
		float h = 0.5 * amp * cos(phase);
		const mat2 rotate45 = mat2(0.70710678, -0.70710678, 0.70710678, 0.70710678);
		const mat2 rotateBack = mat2(0.70710678, 0.70710678, -0.70710678, 0.70710678);
		vec3 bent = rd;
		if (u_gwPol < 0.5) {
			bent = normalize(vec3(rd.x * (1.0 + h), rd.y * (1.0 - h), rd.z));
		} else {
			vec2 rp = rotate45 * rd.xy;
			rp = vec2(rp.x * (1.0 + h), rp.y * (1.0 - h));
			bent = normalize(vec3(rotateBack * rp, rd.z));
		}
		skyDirection = bent;
		vec3 c = vec3(0.0);

		// Test-particle ring: a circle in the plane of the screen stretched by h.
		if (u_gwRing > 0.5) {
			vec2 ndc = (2.0 * gl_FragCoord.xy - u_resolution) / min(u_resolution.x, u_resolution.y);
			vec2 ringNdc = u_gwPol < 0.5 ? vec2(ndc.x / (1.0 + h), ndc.y / (1.0 - h))
			                            : rotate45 * ndc;
			if (u_gwPol >= 0.5) ringNdc = vec2(ringNdc.x / (1.0 + h), ringNdc.y / (1.0 - h));
			float ringR = length(ringNdc);
			float ringLine = 1.0 - smoothstep(0.0, 0.012, abs(ringR - 0.55));
			c += vec3(0.3, 0.85, 0.7) * ringLine * 0.8;
		}
		// Interferometer arms: cross hairs whose lengths oscillate oppositely.
		if (u_gwArms > 0.5) {
			vec2 ndc = (2.0 * gl_FragCoord.xy - u_resolution) / min(u_resolution.x, u_resolution.y);
			// Fixed screen-aligned detector arms have no first-order length
			// response to a pure cross wave at normal incidence.
			float armStrain = u_gwPol < 0.5 ? h : 0.0;
			float armX = (1.0 - smoothstep(0.0, 0.012, abs(ndc.y))) * step(abs(ndc.x), 0.75 * (1.0 + armStrain));
			float armY = (1.0 - smoothstep(0.0, 0.012, abs(ndc.x))) * step(abs(ndc.y), 0.75 * (1.0 - armStrain));
			c += vec3(0.9, 0.55, 0.2) * max(armX, armY) * 0.55;
		}
		shiftOut = 0.0;
		return c;
	}

	skyVisible = 0.0;
	return vec3(1.0, 0.0, 1.0); // invalid state fallback
}

void main() {
	vec2 frag = gl_FragCoord.xy;
	float aspect = u_resolution.x / u_resolution.y;
	vec3 rd = rayDirection(frag, aspect);
	float shift = 0.0;
	float splitX = u_split.y * u_resolution.x;
	int activeMode = u_split.x > 0.5 && frag.x >= splitX ? u_modeB : u_modeA;
	// Likewise keep the complete model dispatcher at one call site.
	vec3 skyDirection;
	float skyShift;
	float skyVisible;
	vec3 color = traceModel(activeMode, u_camPos, rd, shift, skyDirection, skyShift, skyVisible);
	// Evaluate the expensive procedural sky once. Duplicating its FBM/noise
	// at each model branch makes native D3D11 shader linking pathological.
	if (skyVisible > 0.5) color += skyColor(skyDirection, skyShift, u_time);
	if (u_split.x > 0.5 && abs(frag.x - splitX) < 1.5) color = vec3(0.9);

	if (overlayEnabled(64.0) > 0.5) {
		vec3 shiftTint = shift >= 0.0 ? vec3(0.15, 0.4, 1.0) : vec3(1.0, 0.25, 0.1);
		color = mix(color, shiftTint, clamp(abs(shift) * 1.4, 0.0, 0.55));
	}
	if (any(isnan(color)) || any(isinf(color))) color = vec3(0.35, 0.0, 0.35);
	outColor = vec4(tonemap(color), 1.0);
}
