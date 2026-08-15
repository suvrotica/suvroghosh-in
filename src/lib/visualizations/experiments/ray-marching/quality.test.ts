import { describe, expect, it } from 'vitest';
import {
	AUTO_QUALITY_COOLDOWN_MS,
	AUTO_QUALITY_LONG_FRAME_MS,
	AUTO_QUALITY_POOR_WINDOW_MS,
	AUTO_QUALITY_WARMUP_MS,
	RAY_MARCHING_QUALITY_PROFILES,
	buildFragmentSource,
	chooseInitialRayMarchingQuality,
	createRayMarchingQualityMonitor,
	nextLowerRayMarchingQuality,
	observeRayMarchingQualityFrame,
	resolveRayMarchingFramebufferSize,
	type RayMarchingQualityHints,
	type RayMarchingQualityMonitor
} from './quality';

const ordinaryHints: RayMarchingQualityHints = {
	width: 1_440,
	height: 900,
	devicePixelRatio: 2,
	hardwareConcurrency: 8,
	deviceMemory: 8,
	coarsePointer: false,
	saveData: false
};

function feedFrames(
	state: RayMarchingQualityMonitor,
	options: { durationMs: number; frameMs: number; startMs?: number }
): { state: RayMarchingQualityMonitor; nowMs: number } {
	let nowMs = options.startMs ?? state.lastObservationMs ?? 0;
	let elapsed = 0;
	while (elapsed < options.durationMs) {
		nowMs += options.frameMs;
		elapsed += Math.min(options.frameMs, 50);
		state = observeRayMarchingQualityFrame(state, {
			nowMs,
			frameMs: options.frameMs
		}).state;
	}
	return { state, nowMs };
}

describe('ray-marching quality profiles', () => {
	it('publishes the fixed loop and framebuffer budgets', () => {
		expect(RAY_MARCHING_QUALITY_PROFILES.high).toMatchObject({
			mainSteps: 96,
			shadowSteps: 24,
			aoSamples: 5,
			maxFramebufferPixels: 1_350_000
		});
		expect(RAY_MARCHING_QUALITY_PROFILES.balanced).toMatchObject({
			mainSteps: 72,
			shadowSteps: 14,
			aoSamples: 4,
			maxFramebufferPixels: 720_000
		});
		expect(RAY_MARCHING_QUALITY_PROFILES.saver).toMatchObject({
			mainSteps: 48,
			shadowSteps: 0,
			aoSamples: 0,
			maxFramebufferPixels: 360_000
		});
	});

	it('expands the one shader template into compile-time tier variants', () => {
		const template = [
			'#define MAIN __MAIN_STEPS__',
			'#define SHADOW __SHADOW_STEPS__',
			'#define AO __AO_SAMPLES__',
			'#if __ENABLE_SHADOWS__',
			'#endif',
			'#if __ENABLE_AO__',
			'#endif'
		].join('\n');
		const high = buildFragmentSource(template, 'high');
		const saver = buildFragmentSource(template, 'saver');

		expect(high).toContain('#define MAIN 96');
		expect(high).toContain('#define SHADOW 24');
		expect(high).toContain('#define AO 5');
		expect(high.match(/#if 1/gu)).toHaveLength(2);
		expect(saver).toContain('#define MAIN 48');
		expect(saver).toContain('#define SHADOW 0');
		expect(saver).toContain('#define AO 0');
		expect(saver.match(/#if 0/gu)).toHaveLength(2);
		expect(saver).not.toMatch(/__[A-Z_]+__/u);
	});

	it.each([
		{ name: 'compact portrait', width: 320, height: 568, dpr: 3, tier: 'saver' as const },
		{ name: 'modern portrait', width: 390, height: 844, dpr: 3, tier: 'balanced' as const },
		{ name: 'phone landscape', width: 844, height: 390, dpr: 3, tier: 'balanced' as const },
		{ name: 'tablet portrait', width: 768, height: 1_024, dpr: 2, tier: 'balanced' as const },
		{ name: 'tablet landscape', width: 1_024, height: 768, dpr: 2, tier: 'high' as const },
		{ name: 'desktop', width: 1_440, height: 900, dpr: 2, tier: 'high' as const },
		{ name: 'fullscreen 4K', width: 3_840, height: 2_160, dpr: 2, tier: 'high' as const }
	])('keeps the $name backing buffer inside its tier budget', ({ width, height, dpr, tier }) => {
		const size = resolveRayMarchingFramebufferSize(width, height, dpr, tier);
		const profile = RAY_MARCHING_QUALITY_PROFILES[tier];
		expect(size.cssWidth).toBe(width);
		expect(size.cssHeight).toBe(height);
		expect(size.pixelCount).toBe(size.backingWidth * size.backingHeight);
		expect(size.pixelCount).toBeLessThanOrEqual(profile.maxFramebufferPixels);
		expect(size.pixelRatio).toBeLessThanOrEqual(profile.devicePixelRatioCap);
		expect(size.backingWidth / size.backingHeight).toBeCloseTo(width / height, 2);
	});

	it('sanitises invalid dimensions and density without allocating zero pixels', () => {
		expect(resolveRayMarchingFramebufferSize(Number.NaN, 0, Number.NaN, 'saver')).toMatchObject({
			cssWidth: 1,
			cssHeight: 1,
			backingWidth: 1,
			backingHeight: 1,
			pixelCount: 1
		});
	});
});

describe('ray-marching initial and adaptive quality', () => {
	it('starts Auto at Balanced ordinarily and never silently at High', () => {
		expect(chooseInitialRayMarchingQuality('auto', ordinaryHints)).toBe('balanced');
		expect(chooseInitialRayMarchingQuality('high', ordinaryHints)).toBe('high');
		expect(chooseInitialRayMarchingQuality('balanced', ordinaryHints)).toBe('balanced');
		expect(chooseInitialRayMarchingQuality('saver', ordinaryHints)).toBe('saver');
	});

	it.each([
		{ saveData: true },
		{ hardwareConcurrency: 4 },
		{ deviceMemory: 4 },
		{ width: 390, height: 844, coarsePointer: true }
	])('starts constrained Auto hints at Saver: %o', (patch) => {
		expect(chooseInitialRayMarchingQuality('auto', { ...ordinaryHints, ...patch })).toBe('saver');
	});

	it('requires warm-up plus roughly 2.4 seconds of persistent poor active frames', () => {
		let monitor = createRayMarchingQualityMonitor({ choice: 'auto', hints: ordinaryHints });
		let fed = feedFrames(monitor, { durationMs: AUTO_QUALITY_WARMUP_MS, frameMs: 30 });
		monitor = fed.state;
		expect(monitor.tier).toBe('balanced');
		expect(monitor.poorActiveMs).toBe(0);

		fed = feedFrames(monitor, {
			durationMs: AUTO_QUALITY_POOR_WINDOW_MS - 30,
			frameMs: 30,
			startMs: fed.nowMs
		});
		monitor = fed.state;
		expect(monitor.tier).toBe('balanced');

		const update = observeRayMarchingQualityFrame(monitor, {
			nowMs: fed.nowMs + 30,
			frameMs: 30
		});
		expect(update.downgradedFrom).toBe('balanced');
		expect(update.downgradedTo).toBe('saver');
		expect(update.state.downgradeCount).toBe(1);
	});

	it('breaks persistence on a healthy frame and ignores transition or long frames', () => {
		let monitor = createRayMarchingQualityMonitor({
			choice: 'auto',
			hints: ordinaryHints,
			initialTier: 'high'
		});
		const fed = feedFrames(monitor, {
			durationMs: AUTO_QUALITY_WARMUP_MS + 1_200,
			frameMs: 30
		});
		monitor = fed.state;
		expect(monitor.poorActiveMs).toBeGreaterThan(0);

		for (const phase of ['resume', 'compile', 'resize', 'hidden'] as const) {
			const update = observeRayMarchingQualityFrame(monitor, {
				nowMs: (monitor.lastObservationMs ?? 0) + 1,
				frameMs: 40,
				phase
			});
			expect(update.ignoredReason).toBe(phase);
			expect(update.state.poorActiveMs).toBe(0);
			monitor = update.state;
		}

		monitor = feedFrames(monitor, { durationMs: 600, frameMs: 30 }).state;
		const long = observeRayMarchingQualityFrame(monitor, {
			nowMs: (monitor.lastObservationMs ?? 0) + AUTO_QUALITY_LONG_FRAME_MS,
			frameMs: AUTO_QUALITY_LONG_FRAME_MS
		});
		expect(long.ignoredReason).toBe('long-frame');
		expect(long.state.poorActiveMs).toBe(0);

		monitor = feedFrames(long.state, { durationMs: 600, frameMs: 30 }).state;
		const healthy = observeRayMarchingQualityFrame(monitor, {
			nowMs: (monitor.lastObservationMs ?? 0) + 16,
			frameMs: 16
		});
		expect(healthy.state.poorActiveMs).toBe(0);
		expect(healthy.state.tier).toBe('high');
	});

	it('downgrades at most one tier per poor window and enforces its cooldown', () => {
		let monitor = createRayMarchingQualityMonitor({
			choice: 'auto',
			hints: ordinaryHints,
			initialTier: 'high'
		});
		let fed = feedFrames(monitor, {
			durationMs: AUTO_QUALITY_WARMUP_MS + AUTO_QUALITY_POOR_WINDOW_MS,
			frameMs: 30
		});
		monitor = fed.state;
		expect(monitor.tier).toBe('balanced');
		expect(monitor.downgradeCount).toBe(1);

		fed = feedFrames(monitor, {
			durationMs: AUTO_QUALITY_POOR_WINDOW_MS * 2,
			frameMs: 30,
			startMs: fed.nowMs
		});
		monitor = fed.state;
		expect(monitor.tier).toBe('balanced');
		expect(monitor.downgradeCount).toBe(1);

		const afterCooldown = monitor.cooldownUntilMs + 1;
		monitor = observeRayMarchingQualityFrame(monitor, {
			nowMs: afterCooldown,
			frameMs: 16,
			phase: 'resume'
		}).state;
		monitor = feedFrames(monitor, {
			durationMs: AUTO_QUALITY_POOR_WINDOW_MS,
			frameMs: 30,
			startMs: afterCooldown
		}).state;
		expect(monitor.tier).toBe('saver');
		expect(monitor.downgradeCount).toBe(2);
		expect(nextLowerRayMarchingQuality('saver')).toBe('saver');
		expect(monitor.cooldownUntilMs).toBeGreaterThan(afterCooldown + AUTO_QUALITY_COOLDOWN_MS);
	});

	it('never adapts an explicit visitor-selected tier', () => {
		let monitor = createRayMarchingQualityMonitor({ choice: 'high', hints: ordinaryHints });
		const update = observeRayMarchingQualityFrame(monitor, { nowMs: 30, frameMs: 30 });
		monitor = update.state;
		expect(update.ignoredReason).toBe('explicit-choice');
		expect(monitor.tier).toBe('high');
		expect(monitor.downgradeCount).toBe(0);
	});
});
