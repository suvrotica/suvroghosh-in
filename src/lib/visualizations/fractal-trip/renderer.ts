import { cameraBasis, minimumSpan, paletteRGB, scenePreset, type FractalState } from './model';
import { FRACTAL_VERTEX, PLANAR_FRAGMENT, SPATIAL_FRAGMENT } from './shaders';

export interface FractalRenderStatus {
	quality: string;
	fps: number;
	frameTimeMs?: number;
	resolution?: string;
	steps?: number;
	iterations?: number;
	refinement?: string;
	precision: string;
	error?: string;
}

export interface FractalRendererCallbacks {
	onStatus?: (status: FractalRenderStatus) => void;
}

export interface FractalRenderer {
	update: (state: FractalState, interactive?: boolean) => void;
	setVisible: (visible: boolean) => void;
	capture: (width: number, height: number) => Promise<Blob>;
	destroy: () => void;
}

type Program = { program: WebGLProgram; uniforms: Map<string, WebGLUniformLocation | null> };
type Tier = 'saver' | 'balanced' | 'high';

const FAMILY_IDS: Record<FractalState['family'], number> = {
	mandelbrot: 0,
	julia: 1,
	'burning-ship': 2,
	tricorn: 3,
	newton: 4,
	mandelbulb: 5,
	mandelbox: 6
};

const PROFILES = {
	saver: {
		planarPixels: 450_000,
		spatialPixels: 240_000,
		planarIterations: 160,
		spatialIterations: 13,
		steps: 72,
		aoSamples: 2,
		shadowSteps: 0,
		refinementSamples: 4,
		dpr: 1
	},
	balanced: {
		planarPixels: 1_000_000,
		spatialPixels: 520_000,
		planarIterations: 320,
		spatialIterations: 15,
		steps: 96,
		aoSamples: 4,
		shadowSteps: 8,
		refinementSamples: 6,
		dpr: 1.25
	},
	high: {
		planarPixels: 2_000_000,
		spatialPixels: 920_000,
		planarIterations: 512,
		spatialIterations: 18,
		steps: 128,
		aoSamples: 5,
		shadowSteps: 14,
		refinementSamples: 8,
		dpr: 1.5
	}
} as const;

function halton(index: number, base: number): number {
	let result = 0;
	let f = 1 / base;
	let i = index;
	while (i > 0) {
		result += f * (i % base);
		i = Math.floor(i / base);
		f /= base;
	}
	return result;
}

const HALTON_JITTER: readonly (readonly [number, number])[] = Array.from({ length: 16 }, (_, i) =>
	i === 0
		? ([0, 0] as const)
		: ([(halton(i, 2) - 0.5) * 0.85, (halton(i, 3) - 0.5) * 0.85] as const)
);

function stateSignature(s: FractalState): string {
	return [
		s.family,
		s.sceneId ?? '',
		s.power,
		s.seedRe.toFixed(6),
		s.seedIm.toFixed(6),
		s.seedZ.toFixed(6),
		s.bulbJulia ? 1 : 0,
		s.foldScale.toFixed(5),
		s.foldLimit.toFixed(5),
		s.minRadius.toFixed(5),
		s.palette,
		s.relief.toFixed(4),
		s.roughness.toFixed(4),
		s.glow.toFixed(4),
		s.lightAngle.toFixed(4),
		s.quality,
		s.centerRe.toFixed(8),
		s.centerIm.toFixed(8),
		s.span.toExponential(6),
		s.rotation.toFixed(5),
		s.yaw.toFixed(5),
		s.pitch.toFixed(5),
		s.roll.toFixed(5),
		s.fov.toFixed(3),
		s.distance.toFixed(5),
		s.cameraPos[0].toFixed(5),
		s.cameraPos[1].toFixed(5),
		s.cameraPos[2].toFixed(5),
		s.roots.map((r) => `${r.re.toFixed(4)},${r.im.toFixed(4)}`).join(';')
	].join('|');
}

function compile(gl: WebGL2RenderingContext, type: number, source: string) {
	const shader = gl.createShader(type);
	if (!shader) throw new Error('The browser could not allocate a fractal shader.');
	gl.shaderSource(shader, source);
	gl.compileShader(shader);
	if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
		const reason = gl.getShaderInfoLog(shader)?.trim().slice(0, 500);
		gl.deleteShader(shader);
		throw new Error(`The fractal shader could not compile.${reason ? ` ${reason}` : ''}`);
	}
	return shader;
}

function createProgram(gl: WebGL2RenderingContext, source: string): Program {
	let vertex: WebGLShader | null = null;
	let fragment: WebGLShader | null = null;
	let program: WebGLProgram | null = null;
	try {
		vertex = compile(gl, gl.VERTEX_SHADER, FRACTAL_VERTEX);
		fragment = compile(gl, gl.FRAGMENT_SHADER, source);
		program = gl.createProgram();
		if (!program) throw new Error('The browser could not allocate the fractal program.');
		gl.attachShader(program, vertex);
		gl.attachShader(program, fragment);
		gl.linkProgram(program);
		if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
			throw new Error(
				gl.getProgramInfoLog(program)?.slice(0, 500) || 'The fractal program did not link.'
			);
		}
		return { program, uniforms: new Map() };
	} catch (error) {
		if (program) gl.deleteProgram(program);
		throw error;
	} finally {
		if (vertex) gl.deleteShader(vertex);
		if (fragment) gl.deleteShader(fragment);
	}
}

/**
 * One demand-rendered canvas. The UI owns animation/navigation and supplies snapshots;
 * this controller owns only GPU resources, drawing budgets, progressive refinement, resizing and capture.
 */
export function createFractalRenderer(
	canvas: HTMLCanvasElement,
	callbacks: FractalRendererCallbacks = {}
): FractalRenderer {
	if (new URLSearchParams(window.location.search).get('webgl') === 'off') {
		throw new Error('WebGL is disabled for this visit. The still preview remains available.');
	}
	const context = canvas.getContext('webgl2', {
		alpha: false,
		antialias: false,
		depth: false,
		stencil: false,
		premultipliedAlpha: false,
		preserveDrawingBuffer: false,
		powerPreference: 'default'
	});
	if (!context) throw new Error('WebGL 2 is unavailable. The still preview remains available.');
	const gl = context;
	let planar: Program | null = null;
	let spatial: Program | null = null;
	let vertexArray: WebGLVertexArrayObject | null = null;
	let accumTexture: WebGLTexture | null = null;
	let accumFramebuffer: WebGLFramebuffer | null = null;
	let accumWidth = 0;
	let accumHeight = 0;
	let accumulationSupported = true;
	let refinementSample = 0;
	let lastSignature = '';
	let state: FractalState | null = null;
	let visible = true;
	let destroyed = false;
	let contextLost = false;
	let capturing = false;
	let interactive = false;
	let settled = false;
	let frame = 0;
	let settleTimer: ReturnType<typeof setTimeout> | undefined;
	let idleStatusTimer: ReturnType<typeof setTimeout> | undefined;
	let lastFrameTime = 0;
	let lastStatusTime = 0;
	let averageFrameTime = 16.7;
	let observedFrames = 0;
	let badFrameTime = 0;
	let goodFrameTime = 0;
	let adaptiveScale = 1;
	let adaptCooldown = 0;
	let lastQuality = '';
	let lastRenderedWidth = 0;
	let lastRenderedHeight = 0;
	let errorMessage: string | undefined;
	const constrained =
		window.matchMedia('(pointer: coarse)').matches ||
		(typeof navigator.hardwareConcurrency === 'number' && navigator.hardwareConcurrency <= 4);
	let maximumDimension = 4096;

	function cleanupAccumulation() {
		if (accumFramebuffer) gl.deleteFramebuffer(accumFramebuffer);
		if (accumTexture) gl.deleteTexture(accumTexture);
		accumFramebuffer = null;
		accumTexture = null;
		accumWidth = 0;
		accumHeight = 0;
		refinementSample = 0;
	}

	function ensureAccumulationBuffer(width: number, height: number): boolean {
		if (!accumulationSupported) return false;
		if (accumTexture && accumFramebuffer && accumWidth === width && accumHeight === height) {
			return true;
		}
		cleanupAccumulation();
		try {
			const tex = gl.createTexture();
			const fbo = gl.createFramebuffer();
			if (!tex || !fbo) {
				if (tex) gl.deleteTexture(tex);
				if (fbo) gl.deleteFramebuffer(fbo);
				accumulationSupported = false;
				return false;
			}
			gl.bindTexture(gl.TEXTURE_2D, tex);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
			gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

			gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
			gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
			const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
			gl.bindFramebuffer(gl.FRAMEBUFFER, null);
			if (status !== gl.FRAMEBUFFER_COMPLETE) {
				gl.deleteFramebuffer(fbo);
				gl.deleteTexture(tex);
				accumulationSupported = false;
				return false;
			}
			// Re-specify as RGB8 so copyTexSubImage2D is valid from both RGB8 (alpha:false) and RGBA8 backbuffers.
			gl.bindTexture(gl.TEXTURE_2D, tex);
			gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB8, width, height, 0, gl.RGB, gl.UNSIGNED_BYTE, null);
			accumTexture = tex;
			accumFramebuffer = fbo;
			accumWidth = width;
			accumHeight = height;
			return true;
		} catch {
			cleanupAccumulation();
			accumulationSupported = false;
			return false;
		}
	}

	function initialize() {
		maximumDimension = Math.min(4096, Number(gl.getParameter(gl.MAX_RENDERBUFFER_SIZE)) || 4096);
		vertexArray = gl.createVertexArray();
		if (!vertexArray) throw new Error('The browser could not allocate the drawing surface.');
		gl.bindVertexArray(vertexArray);
		gl.disable(gl.DEPTH_TEST);
		gl.disable(gl.BLEND);
		planar = createProgram(gl, PLANAR_FRAGMENT);
		accumulationSupported = true;
		refinementSample = 0;
		errorMessage = undefined;
	}

	function isSpatial(snapshot: FractalState) {
		return snapshot.family === 'mandelbulb' || snapshot.family === 'mandelbox';
	}

	function tier(snapshot: FractalState): Tier {
		if (snapshot.quality === 'high') return 'high';
		if (snapshot.quality === 'saver') return 'saver';
		if (snapshot.quality === 'balanced') return 'balanced';
		return constrained ? 'saver' : 'balanced';
	}

	function report(force = false) {
		if (!state || destroyed) return;
		const now = performance.now();
		const selectedTier = tier(state);
		const profile = PROFILES[selectedTier];
		const quality = `${selectedTier === 'balanced' ? 'Balanced' : selectedTier === 'high' ? 'High' : 'Saver'}${adaptiveScale < 0.95 ? ' · adapted' : ''}`;
		if (!force && now - lastStatusTime < 600 && quality === lastQuality) return;
		lastQuality = quality;
		lastStatusTime = now;
		const ceiling = state.span <= minimumSpan(state, canvas.height) * 1.02;
		const threeD = isSpatial(state);
		const maxSamples = accumulationSupported ? profile.refinementSamples : 1;
		callbacks.onStatus?.({
			quality,
			fps:
				observedFrames > 2 && lastFrameTime && now - lastFrameTime < 250
					? Math.min(120, Math.round(1000 / averageFrameTime))
					: 0,
			frameTimeMs: Math.round(averageFrameTime * 10) / 10,
			resolution:
				lastRenderedWidth && lastRenderedHeight
					? `${lastRenderedWidth}×${lastRenderedHeight}`
					: undefined,
			steps: threeD ? profile.steps : undefined,
			iterations: threeD ? profile.spatialIterations : profile.planarIterations,
			refinement: threeD
				? interactive
					? 'Live motion'
					: `${Math.min(refinementSample, maxSamples)}/${maxSamples} samples`
				: 'Single-pass 2D',
			precision: threeD
				? refinementSample >= maxSamples && !interactive
					? 'Refined 3D detail'
					: 'Bounded 3D detail'
				: ceiling
					? 'Zoom limit reached'
					: 'Bounded GPU precision',
			...(errorMessage ? { error: errorMessage } : {})
		});
	}

	function location(program: Program, name: string) {
		if (!program.uniforms.has(name))
			program.uniforms.set(name, gl.getUniformLocation(program.program, name));
		return program.uniforms.get(name) ?? null;
	}

	function dimensions(snapshot: FractalState) {
		const bounds = canvas.getBoundingClientRect();
		const cssWidth = Math.max(1, bounds.width || canvas.clientWidth || 960);
		const cssHeight = Math.max(1, bounds.height || canvas.clientHeight || 600);
		const profile = PROFILES[tier(snapshot)];
		const settleScale = settled && !isSpatial(snapshot) ? 1.35 : 1;
		const budget = Math.min(
			3_000_000,
			(isSpatial(snapshot) ? profile.spatialPixels : profile.planarPixels) *
				(snapshot.quality === 'auto' ? adaptiveScale : 1) *
				(interactive ? 0.78 : 1) *
				settleScale *
				settleScale
		);
		const magnitude = Math.max(1, Math.abs(snapshot.centerRe), Math.abs(snapshot.centerIm));
		const precisionRatio = isSpatial(snapshot)
			? Infinity
			: Math.max(1, Math.floor(snapshot.span / (4 * 2 ** -23 * magnitude))) / cssHeight;
		const ratio = Math.min(
			(window.devicePixelRatio || 1) * settleScale,
			Math.min(2, profile.dpr * settleScale),
			Math.sqrt(budget / (cssWidth * cssHeight)),
			maximumDimension / Math.max(cssWidth, cssHeight),
			precisionRatio
		);
		return {
			width: Math.max(1, Math.floor(cssWidth * ratio)),
			height: Math.max(1, Math.floor(cssHeight * ratio))
		};
	}

	function render(
		snapshot: FractalState,
		width: number,
		height: number,
		exportFrame = false,
		sampleIdx = 0
	) {
		const threeDimensional = isSpatial(snapshot);
		if (threeDimensional && !spatial) {
			spatial = createProgram(gl, SPATIAL_FRAGMENT);
			lastFrameTime = 0;
		}
		const program = threeDimensional ? spatial : planar;
		if (!program) return;
		if (canvas.width !== width || canvas.height !== height) {
			canvas.width = width;
			canvas.height = height;
			lastFrameTime = 0;
			refinementSample = 0;
		}
		lastRenderedWidth = width;
		lastRenderedHeight = height;

		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		gl.viewport(0, 0, width, height);
		gl.bindVertexArray(vertexArray);
		gl.useProgram(program.program);
		const scalar = (name: string, value: number) => gl.uniform1f(location(program, name), value);
		const integer = (name: string, value: number) => gl.uniform1i(location(program, name), value);
		const pair = (name: string, a: number, b: number) =>
			gl.uniform2f(location(program, name), a, b);
		const profile = PROFILES[exportFrame ? 'high' : tier(snapshot)];
		const preset = threeDimensional && snapshot.sceneId ? scenePreset(snapshot.sceneId) : null;

		pair('u_resolution', width, height);
		integer('u_family', FAMILY_IDS[snapshot.family]);
		integer('u_power', Math.round(snapshot.power));
		integer(
			'u_iterations',
			threeDimensional
				? preset
					? Math.max(
							preset.qualityLimits.minIterations,
							Math.min(preset.qualityLimits.maxIterations, profile.spatialIterations)
						)
					: profile.spatialIterations
				: Math.round(profile.planarIterations * (interactive && !exportFrame ? 0.8 : 1))
		);
		scalar('u_relief', snapshot.relief);
		scalar('u_roughness', snapshot.roughness);
		scalar('u_glow', snapshot.glow);
		scalar('u_lightAngle', snapshot.lightAngle);
		gl.uniform3fv(
			location(program, 'u_palette[0]'),
			new Float32Array(paletteRGB(snapshot.palette).flat())
		);
		if (threeDimensional) {
			const basis = cameraBasis(snapshot);
			const canAccumulate =
				(!interactive || exportFrame) && ensureAccumulationBuffer(width, height);
			const jitter = canAccumulate
				? HALTON_JITTER[sampleIdx % HALTON_JITTER.length]
				: ([0, 0] as const);
			const blendFactor = canAccumulate && sampleIdx > 0 ? sampleIdx / (sampleIdx + 1) : 0;

			gl.uniform3f(location(program, 'u_seed3'), snapshot.seedRe, snapshot.seedIm, snapshot.seedZ);
			integer('u_bulbJulia', snapshot.bulbJulia ? 1 : 0);
			scalar('u_foldScale', snapshot.foldScale);
			scalar('u_foldLimit', snapshot.foldLimit);
			scalar('u_minRadius', snapshot.minRadius);
			gl.uniform3f(
				location(program, 'u_camPos'),
				basis.position[0],
				basis.position[1],
				basis.position[2]
			);
			gl.uniform3f(
				location(program, 'u_camForward'),
				basis.forward[0],
				basis.forward[1],
				basis.forward[2]
			);
			gl.uniform3f(location(program, 'u_camRight'), basis.right[0], basis.right[1], basis.right[2]);
			gl.uniform3f(location(program, 'u_camUp'), basis.up[0], basis.up[1], basis.up[2]);
			scalar('u_fovScale', basis.fovScale);
			pair('u_jitter', jitter[0], jitter[1]);
			scalar('u_haze', preset ? preset.lighting.haze : 0.02);
			integer(
				'u_steps',
				preset
					? Math.max(
							preset.qualityLimits.minSteps,
							Math.min(preset.qualityLimits.maxSteps, profile.steps)
						)
					: profile.steps
			);
			integer('u_aoSamples', profile.aoSamples);
			integer('u_shadowSteps', exportFrame ? 14 : profile.shadowSteps);
			scalar('u_blendFactor', blendFactor);
			gl.activeTexture(gl.TEXTURE0);
			gl.bindTexture(gl.TEXTURE_2D, accumTexture);
			integer('u_prevFrame', 0);

			gl.drawArrays(gl.TRIANGLES, 0, 3);

			if (canAccumulate && accumTexture) {
				gl.bindTexture(gl.TEXTURE_2D, accumTexture);
				if (sampleIdx === 0) {
					while (gl.getError() !== gl.NO_ERROR) {
						/* drain any prior error before capability check */
					}
				}
				gl.copyTexSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 0, 0, width, height);
				if (sampleIdx === 0 && gl.getError() !== gl.NO_ERROR) {
					accumulationSupported = false;
				}
			}
		} else {
			pair('u_center', snapshot.centerRe, snapshot.centerIm);
			scalar('u_span', Math.max(minimumSpan(snapshot, height), snapshot.span));
			scalar('u_rotation', snapshot.rotation);
			pair('u_seed', snapshot.seedRe, snapshot.seedIm);
			scalar('u_relaxation', snapshot.relaxation);
			integer('u_rootCount', snapshot.roots.length);
			const roots = new Float32Array(12);
			snapshot.roots.slice(0, 6).forEach((root, index) => {
				roots[index * 2] = root.re;
				roots[index * 2 + 1] = root.im;
			});
			gl.uniform2fv(location(program, 'u_roots[0]'), roots);
			gl.drawArrays(gl.TRIANGLES, 0, 3);
		}
	}

	function draw(time: number) {
		frame = 0;
		if (destroyed || contextLost || capturing || !visible || document.hidden || !state) return;
		try {
			const size = dimensions(state);
			const threeD = isSpatial(state);
			const profile = PROFILES[tier(state)];
			const maxSamples =
				threeD && !interactive && accumulationSupported ? profile.refinementSamples : 1;

			render(state, size.width, size.height, false, refinementSample);
			if (threeD && !interactive) {
				refinementSample = Math.min(maxSamples, refinementSample + 1);
			} else {
				refinementSample = 1;
			}

			const interval = time - lastFrameTime;
			if (lastFrameTime > 0 && interval > 0 && interval < 180) {
				observedFrames += 1;
				averageFrameTime = averageFrameTime * 0.88 + interval * 0.12;
				if (state.quality === 'auto' && time > adaptCooldown) {
					if (averageFrameTime > 33) {
						badFrameTime += Math.min(interval, 60);
						goodFrameTime = 0;
						if (badFrameTime > 1200 && adaptiveScale > 0.45) {
							adaptiveScale = Math.max(0.45, adaptiveScale * 0.78);
							badFrameTime = 0;
							adaptCooldown = time + 5000;
						}
					} else if (averageFrameTime < 19 && adaptiveScale < 1.0) {
						goodFrameTime += Math.min(interval, 60);
						badFrameTime = 0;
						if (goodFrameTime > 2400) {
							adaptiveScale = Math.min(1.0, adaptiveScale * 1.15);
							goodFrameTime = 0;
							adaptCooldown = time + 5000;
						}
					} else {
						badFrameTime = Math.max(0, badFrameTime - interval * 0.5);
						goodFrameTime = Math.max(0, goodFrameTime - interval * 0.5);
					}
				}
			} else {
				badFrameTime = 0;
				goodFrameTime = 0;
			}
			lastFrameTime = time;
			errorMessage = undefined;
			report();
			if (idleStatusTimer) clearTimeout(idleStatusTimer);
			idleStatusTimer = setTimeout(() => report(true), 260);

			if (threeD && !interactive && refinementSample < maxSamples) {
				schedule();
			}
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : 'The fractal could not be drawn.';
			report(true);
		}
	}

	function schedule() {
		if (!frame && visible && !destroyed && !contextLost && !capturing && !document.hidden) {
			frame = requestAnimationFrame(draw);
		}
	}

	function suspend() {
		if (frame) cancelAnimationFrame(frame);
		frame = 0;
		lastFrameTime = 0;
		observedFrames = 0;
	}

	function activity() {
		if (document.hidden) suspend();
		else {
			refinementSample = 0;
			schedule();
		}
	}

	function lost(event: Event) {
		event.preventDefault();
		contextLost = true;
		suspend();
		planar = null;
		spatial = null;
		vertexArray = null;
		accumTexture = null;
		accumFramebuffer = null;
		accumWidth = 0;
		accumHeight = 0;
		errorMessage = 'Graphics paused. Your settings are kept while the browser restores the canvas.';
		report(true);
	}

	function restored() {
		if (destroyed) return;
		contextLost = false;
		try {
			initialize();
			report(true);
			schedule();
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : 'Graphics could not be restored.';
			report(true);
		}
	}

	try {
		initialize();
	} catch (error) {
		if (vertexArray) gl.deleteVertexArray(vertexArray);
		gl.getExtension('WEBGL_lose_context')?.loseContext();
		throw error;
	}
	canvas.addEventListener('webglcontextlost', lost);
	canvas.addEventListener('webglcontextrestored', restored);
	document.addEventListener('visibilitychange', activity);
	const observer = new ResizeObserver(() => {
		refinementSample = 0;
		schedule();
	});
	observer.observe(canvas);

	return {
		update(snapshot, directManipulation = false) {
			if (destroyed) return;
			if (snapshot.family !== state?.family || snapshot.quality !== state?.quality) {
				adaptiveScale = 1;
				badFrameTime = 0;
				goodFrameTime = 0;
				lastFrameTime = 0;
			}
			const nextSignature = stateSignature(snapshot);
			if (nextSignature !== lastSignature || directManipulation) {
				refinementSample = 0;
				lastSignature = nextSignature;
			}
			state = snapshot;
			interactive = directManipulation;
			settled = !directManipulation;
			if (settleTimer) clearTimeout(settleTimer);
			if (idleStatusTimer) clearTimeout(idleStatusTimer);
			if (directManipulation) {
				settleTimer = setTimeout(() => {
					interactive = false;
					settled = true;
					refinementSample = 0;
					schedule();
				}, 200);
			}
			schedule();
		},
		setVisible(nextVisible) {
			visible = nextVisible;
			if (visible) {
				refinementSample = 0;
				schedule();
			} else suspend();
		},
		async capture(requestedWidth, requestedHeight) {
			if (!state || destroyed || contextLost || capturing) {
				throw new Error('Wait for the current scene before saving an image.');
			}
			const width = Math.max(
				1,
				Math.min(
					maximumDimension,
					2048,
					Math.round(Number.isFinite(requestedWidth) ? requestedWidth : 1600)
				)
			);
			const height = Math.max(
				1,
				Math.min(
					maximumDimension,
					2048,
					Math.round(Number.isFinite(requestedHeight) ? requestedHeight : 1000)
				)
			);
			if (width * height > 3_000_000)
				throw new Error('Choose an export smaller than three million pixels.');
			capturing = true;
			suspend();
			try {
				const magnitude = Math.max(1, Math.abs(state.centerRe), Math.abs(state.centerIm));
				const safeHeight = isSpatial(state)
					? height
					: Math.max(1, Math.min(height, Math.floor(state.span / (4 * 2 ** -23 * magnitude))));
				const safeWidth = Math.max(1, Math.round((width * safeHeight) / height));
				if (isSpatial(state)) {
					for (let s = 0; s < 4; s++) {
						render(state, safeWidth, safeHeight, true, s);
					}
				} else {
					render(state, safeWidth, safeHeight, true, 0);
				}
				let exportCanvas = canvas;
				if (safeHeight < height) {
					exportCanvas = document.createElement('canvas');
					exportCanvas.width = width;
					exportCanvas.height = height;
					const context2d = exportCanvas.getContext('2d');
					if (!context2d) throw new Error('The browser could not prepare the image.');
					context2d.drawImage(canvas, 0, 0, width, height);
				}
				return await new Promise<Blob>((resolve, reject) => {
					exportCanvas.toBlob(
						(blob) =>
							blob ? resolve(blob) : reject(new Error('The browser could not save this image.')),
						'image/png'
					);
				});
			} finally {
				capturing = false;
				refinementSample = 0;
				schedule();
			}
		},
		destroy() {
			if (destroyed) return;
			destroyed = true;
			suspend();
			if (settleTimer) clearTimeout(settleTimer);
			if (idleStatusTimer) clearTimeout(idleStatusTimer);
			observer.disconnect();
			canvas.removeEventListener('webglcontextlost', lost);
			canvas.removeEventListener('webglcontextrestored', restored);
			document.removeEventListener('visibilitychange', activity);
			if (!contextLost) {
				cleanupAccumulation();
				if (planar) gl.deleteProgram(planar.program);
				if (spatial) gl.deleteProgram(spatial.program);
				if (vertexArray) gl.deleteVertexArray(vertexArray);
				gl.getExtension('WEBGL_lose_context')?.loseContext();
			}
			planar = null;
			spatial = null;
			state = null;
		}
	};
}
