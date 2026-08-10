import { describe, expect, it } from 'vitest';
import { QualityManager, qualityProfile, type QualityHints } from './QualityManager';

const desktop: QualityHints = {
	width: 1_440,
	height: 900,
	devicePixelRatio: 2,
	hardwareConcurrency: 12,
	deviceMemoryGb: 16,
	mobile: false
};

const mobile: QualityHints = {
	width: 844,
	height: 390,
	devicePixelRatio: 3,
	hardwareConcurrency: 6,
	deviceMemoryGb: 6,
	mobile: true
};

function runUntilChange(
	manager: QualityManager,
	frameMs: number,
	limit = 100
): ReturnType<QualityManager['update']> {
	for (let index = 0; index < limit; index += 1) {
		const change = manager.update({ frameMs, deltaSeconds: 0.02 });
		if (change) return change;
	}
	return null;
}

describe('Kagojer Dana quality budgets', () => {
	it('caps desktop and landscape-mobile production budgets', () => {
		const desktopHigh = qualityProfile('high', desktop);
		expect(desktopHigh.pixelRatio).toBe(1.5);
		expect(desktopHigh.drawCallBudget).toBeLessThanOrEqual(150);
		expect(desktopHigh.triangleBudget).toBeLessThanOrEqual(600_000);
		expect(desktopHigh.positionalAudioVoices).toBeLessThanOrEqual(8);

		const mobileHigh = qualityProfile('high', mobile);
		expect(mobileHigh.pixelRatio).toBe(1.25);
		expect(mobileHigh.drawCallBudget).toBeLessThanOrEqual(90);
		expect(mobileHigh.triangleBudget).toBeLessThanOrEqual(220_000);
		expect(mobileHigh.positionalAudioVoices).toBeLessThanOrEqual(4);
	});

	it('degrades resolution twice before reducing world detail', () => {
		const manager = new QualityManager('auto', desktop, {
			pressureHoldSeconds: 0.12,
			recoveryHoldSeconds: 0.4
		});
		const initial = manager.getProfile();
		const first = runUntilChange(manager, 27);
		expect(first?.profile.resolutionScale).toBe(0.86);
		expect(first?.profile.distantCrowdDensity).toBe(initial.distantCrowdDensity);

		const second = runUntilChange(manager, 27);
		expect(second?.profile.resolutionScale).toBe(0.72);
		expect(second?.profile.distantCrowdDensity).toBe(initial.distantCrowdDensity);

		const third = runUntilChange(manager, 27);
		expect(third?.profile.distantCrowdDensity).toBe(0);
	});

	it('uses asymmetric hysteresis and leaves explicit modes alone', () => {
		const auto = new QualityManager('auto', desktop, {
			pressureHoldSeconds: 0.2,
			recoveryHoldSeconds: 0.5
		});
		for (let index = 0; index < 30; index += 1) {
			auto.update({ frameMs: index % 2 === 0 ? 20 : 13, deltaSeconds: 0.02 });
		}
		expect(auto.autoDegradationStage).toBe(0);

		const explicit = new QualityManager('high', desktop, { pressureHoldSeconds: 0.05 });
		for (let index = 0; index < 100; index += 1) explicit.update({ frameMs: 50 });
		expect(explicit.getProfile().effectiveTier).toBe('high');
		expect(explicit.autoDegradationStage).toBe(0);
	});
});
