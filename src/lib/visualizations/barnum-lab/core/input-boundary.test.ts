import { describe, expect, it } from 'vitest';
import {
	createDefaultDisplayProfile,
	isValidAnswerState,
	isValidOption,
	setAnswer,
	toGenerationProfile
} from './input-boundary';

describe('semantic input boundary', () => {
	it('starts with the five labelled, unconfirmed demo defaults', () => {
		expect(createDefaultDisplayProfile()).toEqual({
			country: { optionId: 'india', origin: 'demo-default' },
			city_context: { optionId: 'kolkata', origin: 'demo-default' },
			language: { optionId: 'bengali-english', origin: 'demo-default' },
			age_band: { optionId: 'prefer-not-to-say', origin: 'demo-default' },
			gender: { optionId: 'prefer-not-to-say', origin: 'demo-default' }
		});
	});

	it('allows only safe self-reports to cross into generation', () => {
		let display = createDefaultDisplayProfile();
		display = setAnswer(display, 'age_band', '35-44')!;
		display = setAnswer(display, 'gender', 'woman')!;
		display = setAnswer(display, 'preferred_shape', 'circle')!;
		display = setAnswer(display, 'planning_style', 'loose-plan')!;
		const generation = toGenerationProfile(display, '0123456789abcdef');
		expect(generation).toEqual({
			sessionSeed: '0123456789abcdef',
			selfReports: { planning_style: 'loose-plan' }
		});
		expect(JSON.stringify(generation)).not.toMatch(
			/india|kolkata|woman|circle|bengali|prefer-not-to-say/i
		);
	});

	it('rejects invalid question/option pairs and malformed answer objects', () => {
		expect(isValidOption('country', 'loose-plan')).toBe(false);
		expect(
			isValidAnswerState({ country: { optionId: 'loose-plan', origin: 'user-selected' } })
		).toBe(false);
		expect(
			isValidAnswerState({
				country: { optionId: 'india', origin: 'user-selected', use: 'direct-echo' }
			})
		).toBe(false);
	});

	it('clears the incompatible Kolkata default when country changes', () => {
		const changed = setAnswer(createDefaultDisplayProfile(), 'country', 'elsewhere')!;
		expect(changed.country).toEqual({ optionId: 'elsewhere', origin: 'user-selected' });
		expect(changed.city_context).toBeUndefined();
	});
});
