import { describe, expect, it, vi } from 'vitest';
import { evaluateStageEligibility, type StageEligibilityInput } from './eligibility';

const eligibleDesktop: StageEligibilityInput = { width: 1_440, height: 900 };

function decide(input: StageEligibilityInput, available = true) {
	const probe = vi.fn(() => available);
	return { result: evaluateStageEligibility(input, probe), probe };
}

describe('Weather Inside the Nucleus stage eligibility', () => {
	it.each([
		[360, 800],
		[390, 844],
		[412, 915],
		[430, 932],
		[820, 1_180],
		[844, 390]
	])('keeps the %d x %d viewport static without probing WebGL', (width, height) => {
		const { result, probe } = decide({ width, height });
		expect(result.mode).toBe('static-viewport');
		expect(probe).not.toHaveBeenCalled();
	});

	it('is SSR-safe when viewport dimensions are unavailable', () => {
		const { result, probe } = decide({});
		expect(result.mode).toBe('static-viewport');
		expect(probe).not.toHaveBeenCalled();
	});

	it('keeps save-data sessions static without an explicit override', () => {
		const { result, probe } = decide({ ...eligibleDesktop, saveData: true });
		expect(result.mode).toBe('static-save-data');
		expect(probe).not.toHaveBeenCalled();
	});

	it('never lets the save-data override bypass viewport requirements', () => {
		const { result, probe } = decide({
			width: 844,
			height: 390,
			saveData: true,
			explicitSaveDataOverride: true
		});
		expect(result.mode).toBe('static-viewport');
		expect(probe).not.toHaveBeenCalled();
	});

	it('allows an explicit save-data override only on a fully eligible large screen', () => {
		const { result, probe } = decide({
			...eligibleDesktop,
			saveData: true,
			explicitSaveDataOverride: true
		});
		expect(result.mode).toBe('eligible');
		expect(probe).toHaveBeenCalledOnce();
	});

	it('routes reduced-motion and Still preferences to manual stills without WebGL', () => {
		for (const preference of [
			{ prefersReducedMotion: true },
			{ stillSetting: true }
		] satisfies StageEligibilityInput[]) {
			const { result, probe } = decide({ ...eligibleDesktop, ...preference });
			expect(result.mode).toBe('reduced-stills');
			expect(probe).not.toHaveBeenCalled();
		}
	});

	it('keeps a session with a prior stage failure static without probing again', () => {
		const { result, probe } = decide({ ...eligibleDesktop, sessionFailure: true });
		expect(result.mode).toBe('static-failure');
		expect(probe).not.toHaveBeenCalled();
	});

	it('probes exactly once for an ordinary eligible desktop', () => {
		const { result, probe } = decide(eligibleDesktop);
		expect(result.mode).toBe('eligible');
		expect(probe).toHaveBeenCalledOnce();
	});

	it('turns unavailable or throwing WebGL probes into a static failure', () => {
		const unavailable = decide(eligibleDesktop, false);
		expect(unavailable.result.mode).toBe('static-failure');
		expect(unavailable.probe).toHaveBeenCalledOnce();

		const throwingProbe = vi.fn(() => {
			throw new Error('context creation failed');
		});
		expect(evaluateStageEligibility(eligibleDesktop, throwingProbe).mode).toBe('static-failure');
		expect(throwingProbe).toHaveBeenCalledOnce();
	});
});
