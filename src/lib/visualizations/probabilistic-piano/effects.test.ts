import { describe, expect, it, vi } from 'vitest';
import {
	createPondEffects,
	MAX_POND_MARKS,
	POND_FADE_MS,
	POND_SETTLE_MS,
	type PondEffectsOptions
} from './effects';

function fixture(options: Partial<PondEffectsOptions> = {}) {
	let now = 0;
	let nextFrame = 1;
	const pending = new Map<number, FrameRequestCallback>();
	const context = {
		clearRect: vi.fn(),
		save: vi.fn(),
		restore: vi.fn(),
		setTransform: vi.fn(),
		beginPath: vi.fn(),
		moveTo: vi.fn(),
		bezierCurveTo: vi.fn(),
		fill: vi.fn(),
		stroke: vi.fn(),
		quadraticCurveTo: vi.fn(),
		ellipse: vi.fn(),
		fillRect: vi.fn(),
		translate: vi.fn(),
		scale: vi.fn(),
		createLinearGradient: () => ({ addColorStop: vi.fn() }),
		createRadialGradient: () => ({ addColorStop: vi.fn() })
	};
	const canvas = {
		width: 0,
		height: 0,
		dataset: {} as Record<string, string>,
		getContext: () => context,
		getBoundingClientRect: () => ({ width: 1000, height: 600 })
	};
	const controller = createPondEffects(
		canvas as unknown as HTMLCanvasElement,
		{
			palette: ['#a2cfc1', '#cda6ba'],
			position: (pitch) => (pitch - 21) / 87,
			...options
		},
		{
			now: () => now,
			request: (callback) => {
				const id = nextFrame++;
				pending.set(id, callback);
				return id;
			},
			cancel: (id) => {
				pending.delete(id);
			},
			density: () => 3
		}
	);
	return {
		controller,
		canvas,
		context,
		pending,
		advance(milliseconds: number) {
			now += milliseconds;
			const callbacks = [...pending.values()];
			pending.clear();
			callbacks.forEach((callback) => callback(now));
		}
	};
}

describe('bounded moonlight and pigment lifecycle', () => {
	it('does no idle work, caps density, and settles a held voice without losing its reflection', () => {
		const { controller, canvas, pending, advance } = fixture();
		expect(pending.size).toBe(0);
		expect(canvas.width).toBe(1500);
		expect(canvas.height).toBe(900);
		controller.noteOn('touch:1', 60, 0.7);
		expect(pending.size).toBe(1);
		expect(canvas.dataset.effectsRunning).toBe('true');
		expect(canvas.dataset.effectsHeld).toBe('1');
		advance(POND_SETTLE_MS);
		expect(pending.size).toBe(0);
		expect(canvas.dataset.effectsRunning).toBe('false');
		expect(controller.snapshot().marks).toHaveLength(1);
		controller.noteOff('touch:1');
		expect(pending.size).toBe(1);
		expect(canvas.dataset.effectsHeld).toBe('0');
		advance(POND_FADE_MS);
		expect(controller.snapshot().marks).toHaveLength(0);
		expect(pending.size).toBe(0);
		expect(canvas.dataset.effectsCount).toBe('0');
	});

	it('preserves independent same-pitch durations and idempotent releases for sustained ownership', () => {
		const { controller, advance } = fixture();
		controller.noteOn('pointer:1:voice:1', 60, 0.35);
		advance(220);
		controller.noteOn('pointer:1:voice:2', 60, 0.95);
		advance(800);
		controller.noteOff('pointer:1:voice:1');
		advance(200);
		controller.noteOff('pointer:1:voice:1');
		const [first, second] = controller.snapshot().marks;
		expect(first.released).toBe(1020);
		expect(second.released).toBeUndefined();
		expect(second.started).toBe(220);
		expect(first.velocity).toBe(0.35);
		expect(second.velocity).toBe(0.95);
	});

	it('draws stable note marks in Still mode without scheduling motion', () => {
		const { controller, pending, context, canvas } = fixture({ still: true });
		controller.noteOn('still', 21, 0.8);
		expect(context.ellipse).toHaveBeenCalled();
		expect(pending.size).toBe(0);
		expect(canvas.dataset.effectsHeld).toBe('1');
		controller.noteOff('still');
		expect(pending.size).toBe(0);
		controller.configure({ still: false });
		expect(pending.size).toBe(1);
		controller.configure({ still: true });
		expect(pending.size).toBe(0);
	});

	it('suspends while hidden and resumes only live effects using current geometry', () => {
		let offset = 0.4;
		const { controller, context, pending, advance } = fixture({
			position: () => offset,
			baseline: 0.6
		});
		controller.noteOn('geometry', 108, 0.6);
		expect(context.ellipse.mock.calls.at(-1)?.[0]).toBe(400);
		expect(context.ellipse.mock.calls.at(-1)?.[1]).toBeLessThan(360);
		controller.configure({ visible: false });
		expect(pending.size).toBe(0);
		advance(1000);
		offset = 0.7;
		controller.configure({ visible: true });
		expect(context.ellipse.mock.calls.at(-1)?.[0]).toBe(700);
		expect(pending.size).toBe(1);
		controller.configure({ visible: false });
		controller.noteOff('geometry');
		advance(POND_FADE_MS + 1);
		controller.configure({ visible: true });
		expect(controller.snapshot().marks).toHaveLength(0);
		expect(pending.size).toBe(0);
	});

	it('bounds dense histories and decorative randomness without accepting invalid events', () => {
		const { controller, pending, canvas } = fixture();
		for (let i = 0; i < 120; i++) controller.noteOn(`dense:${i}`, 21 + (i % 88), 0.6);
		expect(controller.snapshot().marks).toHaveLength(MAX_POND_MARKS);
		expect(pending.size).toBe(1);
		controller.noteOn('invalid-low', 20, 0.6);
		controller.noteOn('invalid-high', 109, 0.6);
		controller.noteOn('invalid-velocity', 60, Number.NaN);
		expect(controller.snapshot().marks).toHaveLength(MAX_POND_MARKS);
		const phase = controller.snapshot().marks.at(-1)?.phase;
		controller.releaseAll();
		expect(canvas.dataset.effectsCount).toBe('0');
		expect(pending.size).toBe(0);
		controller.noteOn('dense:119', 21 + (119 % 88), 0.6);
		expect(controller.snapshot().marks[0].phase).toBe(phase);
		controller.dispose();
		controller.noteOn('after-dispose', 60, 0.7);
		expect(canvas.dataset.effectsCount).toBe('0');
		expect(pending.size).toBe(0);
	});
});
