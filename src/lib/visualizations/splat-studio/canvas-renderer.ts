import { generateSplats, PALETTES, type SplatGeometry, type SplatSettings } from './model';
import type { SplatCallbacks } from './renderer';

type Quality = 'low' | 'medium' | 'high';
type RGB = [number, number, number];
const TAU = Math.PI * 2;
const COLORS = 48;
const QUALITY = { low: 1100, medium: 2000, high: 2300 };
const BACKGROUNDS = { midnight: '#05070e', ink: '#020305', plum: '#100817' };
const GEOMETRY_KEYS: (keyof SplatSettings)[] = [
	'preset',
	'seed',
	'density',
	'scale',
	'twist',
	'curl',
	'spread',
	'hollow',
	'symmetry'
];
const SPRITE_KEYS: (keyof SplatSettings)[] = [
	'palette',
	'hue',
	'saturation',
	'style',
	'softness',
	'bloom',
	'glow'
];
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/** CPU projection of the same seeded 3D geometry, for devices without WebGL 2.
 * Bounded sprite drawing preserves editing/export without requiring GPU access.
 */
export class CanvasSplatRenderer {
	private readonly context: CanvasRenderingContext2D;
	private readonly motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
	private readonly resizeObserver?: ResizeObserver;
	private readonly intersectionObserver?: IntersectionObserver;
	private settings: SplatSettings;
	private geometry: SplatGeometry;
	private tier: Quality;
	private sprites: HTMLCanvasElement[] = [];
	private sparks: HTMLCanvasElement[] = [];
	private frame = 0;
	private disposed = false;
	private failed = false;
	private ready = false;
	private intersecting = true;
	private _playing = true;
	private time = 0;
	private lastFrame = 0;
	private statsTime = 0;
	private statsFrames = 0;
	private slowWindows = 0;
	private width = 1;
	private height = 1;
	private dpr = 1;
	private yaw = 0;
	private pitch = 0.035;
	private spin = 0;
	private distance: number;
	private idleUntil = 0;
	private pointer: [number, number] = [10000, 10000];
	private pointers = new Map<number, [number, number]>();
	private readonly originalTouchAction: string;

	constructor(
		private readonly canvas: HTMLCanvasElement,
		settings: SplatSettings,
		private readonly callbacks: SplatCallbacks = {}
	) {
		const context = canvas.getContext('2d', { alpha: false });
		if (!context)
			throw new Error('This browser could not start its canvas. Please reload the studio.');
		this.context = context;
		this.settings = { ...settings };
		this.distance = settings.distance;
		this.tier = this.initialTier(settings.quality);
		this.geometry = generateSplats(settings, this.targetCount());
		this._playing =
			!this.motionQuery.matches && document.documentElement.dataset.motion !== 'still';
		this.originalTouchAction = canvas.style.touchAction;
		try {
			this.buildSprites();
			canvas.style.touchAction = 'none';
			canvas.addEventListener('pointerdown', this.onPointerDown);
			canvas.addEventListener('pointermove', this.onPointerMove);
			canvas.addEventListener('pointerup', this.onPointerUp);
			canvas.addEventListener('pointercancel', this.onPointerUp);
			canvas.addEventListener('lostpointercapture', this.onPointerUp);
			canvas.addEventListener('pointerleave', this.onPointerLeave);
			canvas.addEventListener('wheel', this.onWheel, { passive: false });
			canvas.addEventListener('keydown', this.onKeyDown);
			document.addEventListener('visibilitychange', this.onVisibility);
			this.motionQuery.addEventListener('change', this.onMotionChange);
			this.resizeObserver = new ResizeObserver(this.resize);
			this.resizeObserver.observe(canvas);
			this.intersectionObserver = new IntersectionObserver((entries) => {
				this.intersecting = entries[0]?.isIntersecting ?? true;
				if (this.intersecting) this.requestFrame();
				else this.stopFrame();
			});
			this.intersectionObserver.observe(canvas);
			this.resize();
			this.reportStats(0);
		} catch (error) {
			// A caller cannot dispose an instance whose constructor threw.
			this.dispose();
			throw error;
		}
	}

	get playing() {
		return this._playing;
	}
	get diagnostics() {
		return {
			count: this.geometry.randoms.length,
			quality: `canvas-${this.tier}`,
			playing: this._playing,
			time: this.time,
			frameScheduled: this.frame !== 0,
			geometries: 1,
			textures: 0,
			programs: 0
		};
	}
	private initialTier(quality: SplatSettings['quality']): Quality {
		return quality === 'auto' ? (window.innerWidth < 700 ? 'low' : 'medium') : quality;
	}
	private targetCount() {
		return Math.min(3500, Math.round(QUALITY[this.tier] * this.settings.density));
	}
	private reportStats(fps: number) {
		this.callbacks.onStats?.({
			fps,
			count: this.geometry.randoms.length,
			quality: `canvas-${this.tier}`
		});
	}

	private paletteColors(): RGB[] {
		const palette = (PALETTES.find((item) => item.id === this.settings.palette) ?? PALETTES[0])
			.colors;
		const stops = palette.map((hex) =>
			[1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16))
		);
		const angle = (this.settings.hue * Math.PI) / 180;
		const c = Math.cos(angle),
			s = Math.sin(angle),
			k = 1 / Math.sqrt(3);
		return Array.from({ length: COLORS }, (_, index) => {
			const position = (index / (COLORS - 1)) * 4;
			const start = Math.min(3, Math.floor(position)),
				mix = position - start;
			const rgb = stops[start].map(
				(value, channel) => value * (1 - mix) + stops[start + 1][channel] * mix
			);
			const dot = ((rgb[0] + rgb[1] + rgb[2]) / 3) * (1 - c);
			const rotated = rgb.map((value, channel) =>
				Math.max(0, value * c + (rgb[(channel + 2) % 3] - rgb[(channel + 1) % 3]) * k * s + dot)
			);
			const luma = rotated[0] * 0.2126 + rotated[1] * 0.7152 + rotated[2] * 0.0722;
			return rotated.map((value) =>
				Math.round(clamp(luma + (value - luma) * this.settings.saturation, 0, 255))
			) as RGB;
		});
	}
	private buildSprites() {
		const colors = this.paletteColors();
		this.sprites = colors.map((color) => this.sprite(color, false));
		this.sparks = colors.map((color) => this.sprite(color, true));
	}
	private sprite(color: RGB, spark: boolean): HTMLCanvasElement {
		const sprite = document.createElement('canvas');
		sprite.width = sprite.height = 48;
		const ctx = sprite.getContext('2d');
		if (!ctx) throw new Error('The browser could not prepare the artwork canvas.');
		const rgb = color.join(',');
		const style = this.settings.style;
		const gradient = ctx.createRadialGradient(24, 24, 0, 24, 24, 24);
		gradient.addColorStop(0, `rgba(${rgb},1)`);
		if (spark) {
			gradient.addColorStop(0.16, `rgba(${rgb},0.95)`);
			gradient.addColorStop(0.32, `rgba(${rgb},0.25)`);
		} else if (style === 'surfel') {
			gradient.addColorStop(0.68, `rgba(${rgb},0.8)`);
			gradient.addColorStop(0.85, `rgba(${rgb},0.15)`);
		} else {
			const width = style === 'ink' ? 0.58 : 0.15 + this.settings.softness * 0.32;
			gradient.addColorStop(width, `rgba(${rgb},0.48)`);
		}
		gradient.addColorStop(
			0.92,
			`rgba(${rgb},${0.015 + this.settings.bloom * 0.035 + this.settings.glow * 0.015})`
		);
		gradient.addColorStop(1, `rgba(${rgb},0)`);
		ctx.fillStyle = gradient;
		ctx.fillRect(0, 0, 48, 48);
		if (style === 'ink' && !spark) {
			// Fixed grain keeps paused drawings and exports reproducible.
			ctx.globalCompositeOperation = 'destination-out';
			ctx.fillStyle = 'rgba(0,0,0,0.22)';
			for (let y = 0; y < 48; y += 4) for (let x = y % 3; x < 48; x += 5) ctx.fillRect(x, y, 2, 2);
		}
		return sprite;
	}

	update(settings: SplatSettings) {
		if (this.disposed) return;
		const geometryChanged = GEOMETRY_KEYS.some((key) => settings[key] !== this.settings[key]);
		const spritesChanged = SPRITE_KEYS.some((key) => settings[key] !== this.settings[key]);
		const qualityChanged = settings.quality !== this.settings.quality;
		if (settings.distance !== this.settings.distance) this.distance = settings.distance;
		this.settings = { ...settings };
		if (qualityChanged) {
			this.tier = this.initialTier(settings.quality);
			this.slowWindows = 0;
		}
		if (geometryChanged || qualityChanged) {
			this.geometry = generateSplats(settings, this.targetCount());
			this.reportStats(0);
		}
		if (spritesChanged) this.buildSprites();
		this.requestFrame();
	}
	setPlaying(playing: boolean) {
		this._playing = playing;
		this.lastFrame = this.statsTime = this.statsFrames = 0;
		this.requestFrame();
	}
	resetCamera() {
		this.yaw = this.spin = 0;
		this.pitch = 0.035;
		this.distance = this.settings.distance;
		this.requestFrame();
	}
	async exportPNG(): Promise<Blob> {
		if (this.disposed || this.failed) throw new Error('The artwork canvas is unavailable.');
		this.draw();
		return new Promise((resolve, reject) =>
			this.canvas.toBlob(
				(blob) => (blob ? resolve(blob) : reject(new Error('The PNG could not be created.'))),
				'image/png'
			)
		);
	}

	private readonly resize = () => {
		if (this.disposed) return;
		const rect = this.canvas.getBoundingClientRect();
		this.width = Math.max(1, Math.round(rect.width));
		this.height = Math.max(1, Math.round(rect.height));
		this.dpr = Math.min(window.devicePixelRatio || 1, 1.25);
		// Assigning even the same canvas size clears its bitmap. ResizeObserver's
		// initial delivery must not erase a ready, paused frame unnecessarily.
		const pixelWidth = Math.round(this.width * this.dpr);
		const pixelHeight = Math.round(this.height * this.dpr);
		if (this.canvas.width !== pixelWidth) this.canvas.width = pixelWidth;
		if (this.canvas.height !== pixelHeight) this.canvas.height = pixelHeight;
		this.requestFrame();
	};
	private draw() {
		const ctx = this.context,
			s = this.settings,
			g = this.geometry;
		ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
		ctx.globalAlpha = 1;
		ctx.globalCompositeOperation = 'source-over';
		ctx.fillStyle = BACKGROUNDS[s.background];
		ctx.fillRect(0, 0, this.width, this.height);
		ctx.globalCompositeOperation = 'lighter';
		const yaw = this.yaw + this.spin,
			cy = Math.cos(yaw),
			sy = Math.sin(yaw);
		const cp = Math.cos(this.pitch),
			sp = Math.sin(this.pitch);
		const focal = Math.min(
			this.height / (2 * Math.tan((17 * Math.PI) / 180)),
			this.width / (2 * Math.tan((17.5 * Math.PI) / 180))
		);
		const breathe = 1 + Math.sin(this.time * 0.68) * s.breathing * 0.1;
		for (let i = 0; i < g.randoms.length; i++) {
			const r = g.randoms[i],
				phase = r * TAU,
				j = i * 3;
			const wx = Math.sin(g.positions[j + 1] * 1.7 + this.time * 0.34 + phase);
			const wy = Math.cos(g.positions[j + 2] * 1.8 + this.time * 0.29 + phase);
			const wz = Math.sin(g.positions[j] * 1.5 - this.time * 0.23 + phase);
			const wave = (0.025 + s.turbulence * 0.11) * s.flow;
			const along = Math.sin(this.time * 0.36 + phase) * s.flow * 0.09;
			const x = g.positions[j] * breathe + wx * wave + g.tangents[j] * along;
			const y = g.positions[j + 1] * breathe + wy * wave + g.tangents[j + 1] * along;
			const z = g.positions[j + 2] * breathe + wz * wave + g.tangents[j + 2] * along;
			const vx = x * cy + z * sy,
				vz = z * cy - x * sy;
			const vy = y * cp - vz * sp,
				depth = this.distance - (vz * cp + y * sp);
			if (depth < 0.2) continue;
			const projection = focal / depth;
			let px = this.width / 2 + vx * projection,
				py = this.height / 2 - vy * projection;
			let influence = 0;
			if (s.pointer) {
				const dx = px - this.pointer[0],
					dy = py - this.pointer[1];
				influence = Math.exp(-(dx * dx + dy * dy) / 18000);
				px += dx * influence * 0.15;
				py += dy * influence * 0.15;
			}
			let coordinate = g.coordinates[i];
			if (s.colorBy === 'depth') coordinate = clamp((depth - 3) / 6, 0, 1);
			if (s.colorBy === 'flow')
				coordinate = (Math.hypot(wx, wy, wz) * 0.45 + coordinate * 0.45) % 1;
			const color = Math.round(clamp((coordinate - 0.5) * s.gradient + 0.5, 0, 1) * (COLORS - 1));
			const spark = s.style === 'spark' || (s.style === 'hybrid' && r >= 0.76);
			// Wider marks compensate for the intentionally smaller CPU point budget.
			let radius = (0.018 + Math.pow(r, 2.5) * 0.034) * s.size * projection * 2.2;
			let major = 1,
				minor = 1;
			if (s.style === 'anisotropic') {
				major = s.elongation;
				minor = 0.65;
			}
			if (s.style === 'surfel') {
				major = 1 + s.elongation * 0.27;
				minor = 0.25 + (Math.abs(vz) / Math.max(0.1, Math.hypot(x, y, z))) * 0.65;
			}
			if (s.style === 'ink') {
				major = 1 + s.elongation * 0.48;
				minor = 0.6;
				radius *= 1.2;
			}
			if (s.style === 'hybrid' && !spark) {
				major = 1 + s.elongation * 0.65;
				minor = 0.65;
			}
			if (spark) radius *= 0.55;
			radius *= 1 + s.bloom * 0.25;
			const tx = g.tangents[j] * cy + g.tangents[j + 2] * sy;
			const tz = g.tangents[j + 2] * cy - g.tangents[j] * sy;
			const ty = g.tangents[j + 1] * cp - tz * sp;
			const angle =
				spark || s.style === 'gaussian' ? 0 : Math.atan2(-ty, tx) + phase * s.orientation;
			const cos = Math.cos(angle),
				sin = Math.sin(angle);
			ctx.setTransform(
				this.dpr * cos,
				this.dpr * sin,
				-this.dpr * sin,
				this.dpr * cos,
				px * this.dpr,
				py * this.dpr
			);
			ctx.globalAlpha = clamp(
				s.opacity *
					s.exposure *
					(spark ? 0.9 : 0.45) *
					(0.7 + s.glow * 0.5) *
					clamp(1.65 - depth * 0.105, 0.35, 1.2) *
					(0.65 + r * 0.65) *
					(1 + influence * 0.4),
				0,
				1
			);
			ctx.drawImage(
				(spark ? this.sparks : this.sprites)[color],
				-radius * major,
				-radius * minor,
				radius * major * 2,
				radius * minor * 2
			);
		}
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		ctx.globalAlpha = 1;
	}

	private readonly onPointerDown = (event: PointerEvent) => {
		if (event.button !== 0) return;
		this.canvas.focus({ preventScroll: true });
		this.pointers.set(event.pointerId, [event.clientX, event.clientY]);
		this.canvas.setPointerCapture(event.pointerId);
	};
	private readonly onPointerMove = (event: PointerEvent) => {
		const rect = this.canvas.getBoundingClientRect();
		this.pointer = [event.clientX - rect.left, event.clientY - rect.top];
		const previous = this.pointers.get(event.pointerId);
		if (previous) {
			const other = [...this.pointers.entries()].find(([id]) => id !== event.pointerId)?.[1];
			if (other) {
				const before = Math.hypot(previous[0] - other[0], previous[1] - other[1]);
				const after = Math.hypot(event.clientX - other[0], event.clientY - other[1]);
				if (before > 1 && after > 1)
					this.distance = clamp((this.distance * before) / after, 3.5, 14);
			} else {
				this.yaw += (event.clientX - previous[0]) * 0.006;
				this.pitch = clamp(this.pitch + (event.clientY - previous[1]) * 0.006, -1.5, 1.5);
			}
			this.pointers.set(event.pointerId, [event.clientX, event.clientY]);
			this.idleUntil = performance.now() + 1800;
		}
		if (previous || this.settings.pointer) this.requestFrame();
	};
	private readonly onPointerUp = (event: PointerEvent) => {
		this.pointers.delete(event.pointerId);
		if (this.canvas.hasPointerCapture(event.pointerId))
			this.canvas.releasePointerCapture(event.pointerId);
		this.idleUntil = performance.now() + 1800;
	};
	private readonly onPointerLeave = () => {
		this.pointer = [10000, 10000];
		if (this.settings.pointer) this.requestFrame();
	};
	private readonly onWheel = (event: WheelEvent) => {
		event.preventDefault();
		const delta =
			event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? this.height : 1);
		this.distance = clamp(this.distance * Math.exp(clamp(delta * 0.001, -0.5, 0.5)), 3.5, 14);
		this.requestFrame();
	};
	private readonly onKeyDown = (event: KeyboardEvent) => {
		if (event.altKey || event.ctrlKey || event.metaKey) return;
		if (
			!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '=', '-', '_', 'Home'].includes(
				event.key
			)
		)
			return;
		event.preventDefault();
		if (event.key === 'Home') {
			this.resetCamera();
			return;
		}
		const step = event.shiftKey ? 0.18 : 0.09;
		if (event.key === 'ArrowLeft') this.yaw -= step;
		if (event.key === 'ArrowRight') this.yaw += step;
		if (event.key === 'ArrowUp') this.pitch = clamp(this.pitch - step, -1.5, 1.5);
		if (event.key === 'ArrowDown') this.pitch = clamp(this.pitch + step, -1.5, 1.5);
		if (['+', '='].includes(event.key)) this.distance = clamp(this.distance * 0.91, 3.5, 14);
		if (['-', '_'].includes(event.key)) this.distance = clamp(this.distance * 1.1, 3.5, 14);
		this.idleUntil = performance.now() + 1800;
		this.requestFrame();
	};
	private readonly onVisibility = () => {
		if (document.hidden) this.stopFrame();
		else this.requestFrame();
	};
	private readonly onMotionChange = () => {
		if (this.motionQuery.matches) this.setPlaying(false);
	};
	private requestFrame() {
		if (!this.frame && !this.disposed && !this.failed && !document.hidden && this.intersecting)
			this.frame = requestAnimationFrame(this.tick);
	}
	private stopFrame() {
		cancelAnimationFrame(this.frame);
		this.frame = this.lastFrame = this.statsTime = this.statsFrames = 0;
	}
	private readonly tick = (now: number) => {
		this.frame = 0;
		if (this.disposed || this.failed || document.hidden || !this.intersecting) return;
		// Limit continuous animation to 30fps; editing a paused scene still renders immediately.
		if (this._playing && this.lastFrame && now - this.lastFrame < 30) {
			this.requestFrame();
			return;
		}
		const dt = this.lastFrame ? Math.min((now - this.lastFrame) / 1000, 0.1) : 0;
		this.lastFrame = now;
		if (this._playing) {
			this.time += dt * this.settings.speed;
			if (!this.pointers.size && now > this.idleUntil) this.spin += dt * this.settings.rotation;
		}
		try {
			this.draw();
			if (!this.ready) {
				this.ready = true;
				this.callbacks.onReady?.();
			}
		} catch (error) {
			this.failed = true;
			this.stopFrame();
			this.callbacks.onError?.(
				error instanceof Error ? error.message : 'The artwork could not be drawn.'
			);
			return;
		}
		if (this._playing) {
			if (!this.statsTime) this.statsTime = now;
			this.statsFrames++;
			if (now - this.statsTime >= 2000) {
				const fps = Math.round((this.statsFrames * 1000) / (now - this.statsTime));
				this.reportStats(fps);
				this.slowWindows = fps < 20 ? this.slowWindows + 1 : 0;
				if (this.settings.quality === 'auto' && this.tier !== 'low' && this.slowWindows >= 2) {
					this.tier = 'low';
					this.geometry = generateSplats(this.settings, this.targetCount());
					this.reportStats(fps);
				}
				this.statsTime = now;
				this.statsFrames = 0;
			}
			this.requestFrame();
		}
	};

	dispose() {
		if (this.disposed) return;
		this.disposed = true;
		this.stopFrame();
		this.resizeObserver?.disconnect();
		this.intersectionObserver?.disconnect();
		this.canvas.removeEventListener('pointerdown', this.onPointerDown);
		this.canvas.removeEventListener('pointermove', this.onPointerMove);
		this.canvas.removeEventListener('pointerup', this.onPointerUp);
		this.canvas.removeEventListener('pointercancel', this.onPointerUp);
		this.canvas.removeEventListener('lostpointercapture', this.onPointerUp);
		this.canvas.removeEventListener('pointerleave', this.onPointerLeave);
		this.canvas.removeEventListener('wheel', this.onWheel);
		this.canvas.removeEventListener('keydown', this.onKeyDown);
		document.removeEventListener('visibilitychange', this.onVisibility);
		this.motionQuery.removeEventListener('change', this.onMotionChange);
		for (const id of this.pointers.keys())
			if (this.canvas.hasPointerCapture(id)) this.canvas.releasePointerCapture(id);
		this.pointers.clear();
		this.sprites = this.sparks = [];
		this.canvas.style.touchAction = this.originalTouchAction;
	}
}
