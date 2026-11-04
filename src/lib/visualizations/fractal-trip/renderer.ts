import { minimumSpan, paletteRGB, type FractalState } from './model';
import { FRACTAL_VERTEX, PLANAR_FRAGMENT, SPATIAL_FRAGMENT } from './shaders';

export interface FractalRenderStatus {
	quality: string;
	fps: number;
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
	saver: { planarPixels: 450_000, spatialPixels: 220_000, iterations: 160, steps: 64, dpr: 1 },
	balanced: {
		planarPixels: 1_000_000,
		spatialPixels: 500_000,
		iterations: 320,
		steps: 88,
		dpr: 1.25
	},
	high: { planarPixels: 2_000_000, spatialPixels: 900_000, iterations: 512, steps: 112, dpr: 1.5 }
} as const;

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
 * this controller owns only GPU resources, drawing budgets, resizing and capture.
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
	let adaptiveScale = 1;
	let adaptCooldown = 0;
	let lastQuality = '';
	let errorMessage: string | undefined;
	const constrained =
		window.matchMedia('(pointer: coarse)').matches ||
		(typeof navigator.hardwareConcurrency === 'number' && navigator.hardwareConcurrency <= 4);
	let maximumDimension = 4096;

	function initialize() {
		maximumDimension = Math.min(4096, Number(gl.getParameter(gl.MAX_RENDERBUFFER_SIZE)) || 4096);
		vertexArray = gl.createVertexArray();
		if (!vertexArray) throw new Error('The browser could not allocate the drawing surface.');
		gl.bindVertexArray(vertexArray);
		gl.disable(gl.DEPTH_TEST);
		gl.disable(gl.BLEND);
		planar = createProgram(gl, PLANAR_FRAGMENT);
		errorMessage = undefined;
	}

	function isSpatial(snapshot: FractalState) {
		return snapshot.family === 'mandelbulb' || snapshot.family === 'mandelbox';
	}

	function tier(snapshot: FractalState): Tier {
		return snapshot.quality === 'high'
			? 'high'
			: snapshot.quality === 'saver' || constrained
				? 'saver'
				: 'balanced';
	}

	function report(force = false) {
		if (!state || destroyed) return;
		const now = performance.now();
		const selectedTier = tier(state);
		const quality = `${selectedTier === 'balanced' ? 'Balanced' : selectedTier === 'high' ? 'High' : 'Saver'}${adaptiveScale < 0.95 ? ' · adapted' : ''}`;
		if (!force && now - lastStatusTime < 700 && quality === lastQuality) return;
		lastQuality = quality;
		lastStatusTime = now;
		const ceiling = state.span <= minimumSpan(state, canvas.height) * 1.02;
		callbacks.onStatus?.({
			quality,
			fps:
				observedFrames > 2 && lastFrameTime && now - lastFrameTime < 250
					? Math.min(120, Math.round(1000 / averageFrameTime))
					: 0,
			precision: isSpatial(state)
				? 'Bounded 3D detail'
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
		// A single settled 2D render samples a denser grid; the browser downsamples it.
		// Continuous animation retains its ordinary budget and one fractal evaluation per pixel.
		const settleScale = settled && !isSpatial(snapshot) ? 1.35 : 1;
		const budget = Math.min(
			3_000_000,
			(isSpatial(snapshot) ? profile.spatialPixels : profile.planarPixels) *
				(snapshot.quality === 'auto' ? adaptiveScale : 1) *
				(interactive ? 0.72 : 1) *
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

	function render(snapshot: FractalState, width: number, height: number, exportFrame = false) {
		const threeDimensional = isSpatial(snapshot);
		if (threeDimensional && !spatial) {
			spatial = createProgram(gl, SPATIAL_FRAGMENT);
			lastFrameTime = 0; // compilation is not a representative animation frame
		}
		const program = threeDimensional ? spatial : planar;
		if (!program) return;
		if (canvas.width !== width || canvas.height !== height) {
			canvas.width = width;
			canvas.height = height;
			lastFrameTime = 0;
		}
		gl.viewport(0, 0, width, height);
		gl.bindVertexArray(vertexArray);
		gl.useProgram(program.program);
		const scalar = (name: string, value: number) => gl.uniform1f(location(program, name), value);
		const integer = (name: string, value: number) => gl.uniform1i(location(program, name), value);
		const pair = (name: string, a: number, b: number) =>
			gl.uniform2f(location(program, name), a, b);
		const profile = PROFILES[exportFrame ? 'high' : tier(snapshot)];
		pair('u_resolution', width, height);
		integer('u_family', FAMILY_IDS[snapshot.family]);
		integer('u_power', Math.round(snapshot.power));
		integer(
			'u_iterations',
			threeDimensional
				? 12
				: Math.round(profile.iterations * (interactive && !exportFrame ? 0.8 : 1))
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
			gl.uniform3f(location(program, 'u_seed3'), snapshot.seedRe, snapshot.seedIm, snapshot.seedZ);
			integer('u_bulbJulia', snapshot.bulbJulia ? 1 : 0);
			scalar('u_foldScale', snapshot.foldScale);
			scalar('u_foldLimit', snapshot.foldLimit);
			scalar('u_minRadius', snapshot.minRadius);
			gl.uniform3f(location(program, 'u_camera'), snapshot.yaw, snapshot.pitch, snapshot.distance);
			integer('u_steps', profile.steps);
			integer('u_shadows', exportFrame || tier(snapshot) === 'high' ? 1 : 0);
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
		}
		gl.drawArrays(gl.TRIANGLES, 0, 3);
	}

	function draw(time: number) {
		frame = 0;
		if (destroyed || contextLost || capturing || !visible || document.hidden || !state) return;
		try {
			const size = dimensions(state);
			render(state, size.width, size.height);
			const interval = time - lastFrameTime;
			if (lastFrameTime > 0 && interval > 0 && interval < 180) {
				observedFrames += 1;
				averageFrameTime = averageFrameTime * 0.88 + interval * 0.12;
				if (state.quality === 'auto' && time > adaptCooldown) {
					badFrameTime = averageFrameTime > 34 ? badFrameTime + Math.min(interval, 60) : 0;
					if (badFrameTime > 1400 && adaptiveScale > 0.42) {
						adaptiveScale = Math.max(0.42, adaptiveScale * 0.76);
						badFrameTime = 0;
						adaptCooldown = time + 6000;
					}
				}
			} else {
				badFrameTime = 0;
			}
			lastFrameTime = time;
			errorMessage = undefined;
			report();
			if (idleStatusTimer) clearTimeout(idleStatusTimer);
			idleStatusTimer = setTimeout(() => report(true), 300);
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
		else schedule();
	}

	function lost(event: Event) {
		event.preventDefault();
		contextLost = true;
		suspend();
		planar = null;
		spatial = null;
		vertexArray = null;
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
	const observer = new ResizeObserver(schedule);
	observer.observe(canvas);

	return {
		update(snapshot, directManipulation = false) {
			if (destroyed) return;
			if (snapshot.family !== state?.family || snapshot.quality !== state?.quality) {
				adaptiveScale = 1;
				badFrameTime = 0;
				lastFrameTime = 0;
			}
			state = snapshot;
			interactive = directManipulation;
			settled = false;
			if (settleTimer) clearTimeout(settleTimer);
			if (idleStatusTimer) clearTimeout(idleStatusTimer);
			settleTimer = setTimeout(() => {
				interactive = false;
				settled = true;
				schedule();
			}, 220);
			schedule();
		},
		setVisible(nextVisible) {
			visible = nextVisible;
			if (visible) schedule();
			else suspend();
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
				// Preserve this viewport near the precision ceiling. A larger PNG must not
				// silently zoom out or invent finer mathematical samples than the GPU can hold.
				const magnitude = Math.max(1, Math.abs(state.centerRe), Math.abs(state.centerIm));
				const safeHeight = isSpatial(state)
					? height
					: Math.max(1, Math.min(height, Math.floor(state.span / (4 * 2 ** -23 * magnitude))));
				const safeWidth = Math.max(1, Math.round((width * safeHeight) / height));
				render(state, safeWidth, safeHeight, true);
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
