// Procedural celestial background. Deterministic from u_seed so that split-screen
// comparisons always look at the same universe.

vec3 skyColor(vec3 dir, float shift, float timeT) {
	vec3 d = normalize(dir);
	vec3 color = vec3(0.0);

	// --- cosmic microwave background mode: faint mottled glow --------------
	if (u_cmb > 0.5) {
		float n = fbm(d * 6.0 + u_seed * 0.01);
		float m = fbm(d * 13.0 - u_seed * 0.01);
		vec3 cmb = mix(vec3(0.05, 0.07, 0.13), vec3(0.35, 0.18, 0.1), smoothstep(0.35, 0.75, n));
		cmb += 0.08 * vec3(0.9, 0.6, 0.3) * smoothstep(0.55, 0.8, m);
		return applyShift(cmb, shift);
	}

	// --- deep-space base ---------------------------------------------------
	color = vec3(0.004, 0.005, 0.012);

	// --- Milky-Way-like density band ---------------------------------------
	if (u_milkyway > 0.5) {
		vec3 bandNormal = normalize(vec3(0.35, 0.9, 0.25));
		float bandDist = abs(dot(d, bandNormal));
		float band = exp(-bandDist * bandDist * 9.0);
		float clouds = fbm(d * 3.5 + vec3(0.0, u_seed * 0.001, 0.0));
		float darkLanes = fbm(d * 7.0 + vec3(4.2, 1.3, 2.9));
		vec3 bandColor = mix(vec3(0.09, 0.10, 0.16), vec3(0.32, 0.26, 0.22), clouds);
		bandColor *= 0.35 + 0.65 * smoothstep(0.2, 0.6, darkLanes);
		color += band * bandColor * 0.85;
	}

	// --- stars: sparse hashed point sources, varied temperature -------------
	// Only a small fraction of cells host a star, so the field reads as distinct
	// points rather than a uniform carpet. Density scales with u_starDensity.
	for (int shell = 0; shell < 2; shell++) {
		float scale = 26.0 + float(shell) * 34.0;
		vec3 cell = floor(d * scale);
		vec3 jitter = hash33(cell + u_seed * 0.013 + float(shell) * 7.7);
		float occupancy = hash11(dot(cell, vec3(3.1, 5.7, 9.3)) + u_seed * 0.7 + float(shell));
		// Sparse: keep only the brightest-occupied cells.
		if (occupancy < 0.78 - 0.2 * clamp(u_starDensity, 0.0, 2.0) * 0.5) continue;
		vec3 starPos = normalize((cell + 0.2 + 0.6 * jitter) / scale);
		float dist = length(d - starPos);
		float mag = pow(hash11(dot(cell, vec3(1.0, 57.0, 113.0)) + u_seed), 3.0);
		float radius = (0.0011 + 0.0009 * mag) * (1.0 + 0.3 * float(shell));
		float core = smoothstep(radius, 0.0, dist);
		float glow = smoothstep(radius * 2.2, 0.0, dist) * 0.18;
		float temp = hash11(dot(cell, vec3(4.0, 8.0, 2.0)) + 0.31 * u_seed);
		float twinkle = u_reduced > 0.5 ? 1.0 : 0.88 + 0.12 * sin(timeT * (0.8 + temp * 2.0) + temp * 40.0);
		color += blackbody(temp) * (core + glow) * (0.5 + 1.6 * mag) * twinkle;
	}

	// --- sparse galaxies: soft elliptical smudges ---------------------------
	if (u_galaxies > 0.5) {
		float gscale = 7.0;
		vec3 cell = floor(d * gscale);
		vec3 jitter = hash33(cell + u_seed * 0.007 + 3.1);
		if (jitter.x > 0.62) {
			vec3 gpos = normalize((cell + 0.2 + 0.6 * jitter) / gscale);
			float dist = length(d - gpos);
			float size = 0.006 + 0.014 * jitter.y;
			float angle = jitter.z * PI;
			vec3 tangent = normalize(cross(gpos, vec3(0.0, 1.0, 0.0)));
			vec3 bitangent = cross(gpos, tangent);
			vec2 local = vec2(dot(d - gpos, tangent), dot(d - gpos, bitangent));
			local = mat2(cos(angle), -sin(angle), sin(angle), cos(angle)) * local;
			local.y *= 2.6; // flattened disc
			float body = exp(-dot(local, local) / (size * size));
			float coreG = exp(-dot(local, local) / (size * size * 0.12));
			vec3 gcolor = mix(vec3(0.75, 0.72, 0.68), vec3(0.6, 0.68, 0.9), jitter.z);
			color += gcolor * (body * 0.5 + coreG * 0.8) * (0.4 + 0.6 * jitter.y);
		}
	}

	return applyShift(color, shift);
}
