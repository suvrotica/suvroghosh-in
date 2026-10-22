/**
 * Transient moonlight and pigment, drawn above the cached pond. These marks consume
 * frozen sounded pitches and expression; they never sample or alter musical state.
 */
export const MAX_POND_MARKS = 48;
export const POND_FADE_MS = 2800;
export const POND_SETTLE_MS = 3800;

export interface PondEffectsOptions {
	palette: readonly string[];
	/** Actual key centre relative to this canvas; offscreen fractions are permitted. */
	position: (pitch: number) => number;
	/** Actual keybed top relative to this canvas. */
	baseline?: number;
	still?: boolean;
	visible?: boolean;
}

interface PondMark {
	id: string;
	pitch: number;
	velocity: number;
	started: number;
	released?: number;
	phase: number;
	previous?: string;
}

/** Injectable animation clock keeps lifetime tests independent of a browser. */
export interface PondEffectsClock {
	now(): number;
	request(callback: FrameRequestCallback): number;
	cancel(id: number): void;
	density(): number;
}

function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}

/** Local, deterministic decorative jitter; deliberately independent of the model. */
function phaseFor(id: string, pitch: number): number {
	let hash = pitch * 2654435761;
	for (let i = 0; i < id.length; i++) hash = Math.imul(hash ^ id.charCodeAt(i), 16777619);
	return (hash >>> 0) / 4294967296;
}

export function createPondEffects(
	canvas: HTMLCanvasElement,
	initial: PondEffectsOptions,
	clock: PondEffectsClock = {
		now: () => performance.now(),
		request: (callback) => window.requestAnimationFrame(callback),
		cancel: (id) => window.cancelAnimationFrame(id),
		density: () => window.devicePixelRatio || 1
	}
) {
	const context = canvas.getContext('2d');
	if (!context) throw new Error('Canvas effects unavailable');
	const ctx = context;
	let options = { baseline: 0.8, still: false, visible: true, ...initial };
	let marks: PondMark[] = [];
	let width = 1;
	let height = 1;
	let density = 1;
	let frame: number | undefined;
	let disposed = false;

	function diagnostics(): void {
		canvas.dataset.effectsRunning = String(frame !== undefined);
		canvas.dataset.effectsCount = String(marks.length);
		canvas.dataset.effectsHeld = String(marks.filter((mark) => mark.released === undefined).length);
	}

	function prune(now: number): void {
		marks = marks.filter(
			(mark) => mark.released === undefined || now - mark.released < POND_FADE_MS
		);
	}

	function clear(): void {
		ctx.clearRect(0, 0, width, height);
	}

	function draw(now: number): void {
		clear();
		if (!options.visible || disposed) return;
		const baseline = clamp(options.baseline, 0.1, 1) * height;
		const byId = new Map(marks.map((mark) => [mark.id, mark]));
		ctx.save();
		ctx.globalCompositeOperation = 'screen';
		for (const mark of marks) {
			const position = options.position(mark.pitch);
			if (!Number.isFinite(position) || position < -0.2 || position > 1.2) continue;
			const x = position * width;
			const age = Math.max(0, now - mark.started);
			const held = mark.released === undefined;
			const releaseAge = held ? 0 : Math.max(0, now - mark.released!);
			const fade = held ? 1 : Math.max(0, 1 - releaseAge / POND_FADE_MS);
			const strength = (0.22 + mark.velocity * 0.78) * fade;
			const register = clamp((mark.pitch - 21) / 87, 0, 1);
			const y = baseline - 12 - mark.phase * 15;
			const colour =
				options.palette[(mark.pitch + Math.floor(mark.phase * 5)) % options.palette.length] ||
				'#a5cfc7';
			const duration = Math.max(0, (mark.released ?? now) - mark.started);
			const rise = options.still
				? Math.min(height * 0.23, 48)
				: Math.min(height * 0.43, 22 + Math.min(duration, POND_SETTLE_MS) * 0.085);
			const drift = options.still ? 0 : releaseAge * 0.009;
			const top = y - rise - drift;
			const bend = (mark.phase - 0.5) * Math.min(60, width * 0.07);
			const brushWidth = 2.5 + mark.velocity * 8;
			const paint = ctx.createLinearGradient(x, y, x, top);
			paint.addColorStop(0, '#d7e4cf00');
			paint.addColorStop(0.38, colour);
			paint.addColorStop(1, '#e5c79a');
			ctx.globalAlpha = strength * 0.39;
			ctx.fillStyle = paint;
			ctx.beginPath();
			ctx.moveTo(x - brushWidth, y);
			ctx.bezierCurveTo(
				x - brushWidth - bend,
				y - rise * 0.4,
				x + bend - brushWidth * 0.4,
				top + rise * 0.22,
				x + bend,
				top
			);
			ctx.bezierCurveTo(
				x + bend + brushWidth * 0.7,
				top + rise * 0.2,
				x + brushWidth - bend,
				y - rise * 0.38,
				x + brushWidth,
				y
			);
			ctx.fill();
			ctx.strokeStyle = '#f1dfb9';
			ctx.lineWidth = 0.8;
			ctx.globalAlpha = strength * 0.39;
			ctx.beginPath();
			ctx.moveTo(x, y - 7);
			ctx.bezierCurveTo(x - bend, y - rise * 0.3, x + bend, top + rise * 0.22, x + bend, top);
			ctx.stroke();

			// Close notes in time join into a bounded brush gesture for glissandi.
			const previous = mark.previous ? byId.get(mark.previous) : undefined;
			if (previous) {
				const previousX = options.position(previous.pitch) * width;
				if (Number.isFinite(previousX)) {
					ctx.strokeStyle = colour;
					ctx.globalAlpha = strength * 0.22;
					ctx.lineWidth = 1.5 + mark.velocity * 3;
					ctx.beginPath();
					ctx.moveTo(previousX, y - 17);
					ctx.quadraticCurveTo((previousX + x) * 0.5, y - 48, x, y - 17);
					ctx.stroke();
				}
			}

			// Bass blooms widen slowly; treble rings are smaller, finer and quicker.
			const bloomRadius = 18 + (1 - register) * 24 + mark.velocity * 15;
			const attack = options.still ? 0.5 : Math.max(0, 1 - age / 1900);
			ctx.save();
			ctx.translate(x, y);
			ctx.scale(1.7, 0.55);
			const bloom = ctx.createRadialGradient(0, 0, 0, 0, 0, bloomRadius);
			bloom.addColorStop(0, '#f6e4bc');
			bloom.addColorStop(0.24, '#d4e7d1');
			bloom.addColorStop(1, '#96bcb800');
			ctx.globalAlpha = strength * (0.12 + attack * 0.5);
			ctx.fillStyle = bloom;
			ctx.fillRect(-bloomRadius, -bloomRadius, bloomRadius * 2, bloomRadius * 2);
			ctx.restore();

			for (let ring = 0; ring < 3; ring++) {
				const elapsed = options.still ? 500 + ring * 290 : age - ring * 280;
				const lifetime = 1750 + (1 - register) * 1450;
				if (elapsed < 0 || elapsed > lifetime) continue;
				const progress = elapsed / lifetime;
				const radius = 5 + progress * (35 + (1 - register) * 82);
				ctx.globalAlpha = strength * (1 - progress) * 0.43;
				ctx.strokeStyle = ring === 1 ? colour : '#f1ddb3';
				ctx.lineWidth = 0.55 + (1 - register) * 0.8;
				ctx.beginPath();
				ctx.ellipse(x, y + ring * 2, radius, radius * 0.22, -0.04, 0, Math.PI * 2);
				ctx.stroke();
			}

			// Stable reflection outlives the attack while a key or pedal owns the voice.
			ctx.globalAlpha = strength * 0.36;
			ctx.fillStyle = '#f2dbae';
			for (let i = 0; i < 5; i++) {
				const spread = (1 + i) * (1.2 + mark.velocity);
				ctx.fillRect(x - spread + Math.sin(i * 2 + mark.phase * 6), y + 7 + i * 4, spread * 2, 1);
			}
		}
		ctx.restore();
	}

	function moving(now: number): boolean {
		return marks.some((mark) =>
			mark.released === undefined
				? now - mark.started < POND_SETTLE_MS
				: now - mark.released < POND_FADE_MS
		);
	}

	function cancel(): void {
		if (frame !== undefined) clock.cancel(frame);
		frame = undefined;
	}

	function schedule(now: number): void {
		if (!disposed && options.visible && !options.still && moving(now) && frame === undefined) {
			frame = clock.request(tick);
		}
		diagnostics();
	}

	function tick(now: number): void {
		frame = undefined;
		if (disposed) return;
		prune(now);
		draw(now);
		schedule(now);
	}

	function refresh(): void {
		if (disposed) return;
		const now = clock.now();
		prune(now);
		cancel();
		draw(now);
		schedule(now);
	}

	function resize(): void {
		if (disposed) return;
		const rect = canvas.getBoundingClientRect();
		width = Math.max(1, rect.width);
		height = Math.max(1, rect.height);
		density = clamp(clock.density(), 1, 1.5);
		canvas.width = Math.round(width * density);
		canvas.height = Math.round(height * density);
		ctx.setTransform(density, 0, 0, density, 0, 0);
		refresh();
	}

	resize();
	return {
		noteOn(id: string, pitch: number, velocity: number): void {
			if (
				disposed ||
				!Number.isInteger(pitch) ||
				pitch < 21 ||
				pitch > 108 ||
				!Number.isFinite(velocity)
			)
				return;
			const now = clock.now();
			prune(now);
			const previous = marks.at(-1);
			marks = marks.filter((mark) => mark.id !== id);
			marks.push({
				id,
				pitch,
				velocity: clamp(velocity, 0, 1),
				started: now,
				phase: phaseFor(id, pitch),
				previous:
					previous && previous.id !== id && now - previous.started < 240 ? previous.id : undefined
			});
			if (marks.length > MAX_POND_MARKS) marks.splice(0, marks.length - MAX_POND_MARKS);
			refresh();
		},
		/** Call when the audible voice releases, including pedal-up for sustained voices. */
		noteOff(id: string): void {
			const mark = marks.find((entry) => entry.id === id);
			if (mark && mark.released === undefined) mark.released = clock.now();
			refresh();
		},
		/** Stop/preset/disposal paths clear reflection ownership and all decorative history. */
		releaseAll(): void {
			marks = [];
			refresh();
		},
		configure(next: Partial<PondEffectsOptions>): void {
			options = { ...options, ...next };
			refresh();
		},
		resize,
		snapshot() {
			return {
				marks: marks.map((mark) => ({ ...mark })),
				framePending: frame !== undefined,
				still: options.still,
				visible: options.visible,
				density
			};
		},
		dispose(): void {
			cancel();
			disposed = true;
			marks = [];
			clear();
			diagnostics();
		}
	};
}

export type PondEffects = ReturnType<typeof createPondEffects>;
