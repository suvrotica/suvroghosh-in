import { afterEach, describe, expect, it, vi } from 'vitest';
import { MissingAudio } from './audio';
import { buildExperiment, DEFAULT_SETTINGS } from './model';

function fakeAudio() {
	const oscillators: {
		type: string;
		frequency: { value: number };
		connect: ReturnType<typeof vi.fn>;
		disconnect: ReturnType<typeof vi.fn>;
		start: ReturnType<typeof vi.fn>;
		stop: ReturnType<typeof vi.fn>;
		onended: null | (() => void);
	}[] = [];
	const gains: {
		gain: {
			value: number;
			setValueAtTime: ReturnType<typeof vi.fn>;
			linearRampToValueAtTime: ReturnType<typeof vi.fn>;
			exponentialRampToValueAtTime: ReturnType<typeof vi.fn>;
			setTargetAtTime: ReturnType<typeof vi.fn>;
			cancelScheduledValues: ReturnType<typeof vi.fn>;
		};
		connect: ReturnType<typeof vi.fn>;
		disconnect: ReturnType<typeof vi.fn>;
	}[] = [];
	const context = {
		state: 'running',
		currentTime: 1,
		destination: {},
		resume: vi.fn(async () => {}),
		suspend: vi.fn(async () => {}),
		close: vi.fn(async () => {}),
		createGain: vi.fn(() => {
			const gain = {
				gain: {
					value: 0,
					setValueAtTime: vi.fn(),
					linearRampToValueAtTime: vi.fn(),
					exponentialRampToValueAtTime: vi.fn(),
					setTargetAtTime: vi.fn(),
					cancelScheduledValues: vi.fn()
				},
				connect: vi.fn(),
				disconnect: vi.fn()
			};
			gains.push(gain);
			return gain;
		}),
		createOscillator: vi.fn(() => {
			const oscillator = {
				type: '',
				frequency: { value: 0 },
				connect: vi.fn(),
				disconnect: vi.fn(),
				start: vi.fn(),
				stop: vi.fn(),
				onended: null
			};
			oscillators.push(oscillator);
			return oscillator;
		})
	};
	vi.stubGlobal('AudioContext', function () {
		return context;
	});
	return { context, oscillators, gains };
}

afterEach(() => vi.unstubAllGlobals());

describe('missing-data local score', () => {
	it('requires explicit enable and bounds the played sample to eight stable, restrained voices', async () => {
		const fake = fakeAudio();
		const audio = new MissingAudio();
		const experiment = buildExperiment({ ...DEFAULT_SETTINGS, rate: 0, view: 'time' });
		audio.playRow(experiment, 0, false);
		expect(fake.oscillators).toHaveLength(0);
		await audio.enable();
		audio.playRow(experiment, 0, false);
		expect(fake.oscillators).toHaveLength(8);
		const frequencies = fake.oscillators.map((oscillator) => oscillator.frequency.value);
		expect(Math.max(...frequencies)).toBeLessThanOrEqual(880);
		expect(fake.oscillators.every((oscillator) => oscillator.type === 'triangle')).toBe(true);
		audio.playRow(experiment, 1, false);
		expect(fake.oscillators.slice(8).map((oscillator) => oscillator.frequency.value)).toEqual(
			frequencies
		);
		audio.suspend();
		expect(fake.context.suspend).toHaveBeenCalledOnce();
		audio.dispose();
		expect(fake.context.close).toHaveBeenCalledOnce();
	});

	it('makes a real zero audible, missing values silent, and filled values explicitly opt-in', async () => {
		const fake = fakeAudio();
		const audio = new MissingAudio();
		const experiment = buildExperiment(DEFAULT_SETTINGS);
		experiment.observed.mask.fill(1, 0, experiment.data.cols);
		experiment.observed.values.fill(Number.NaN, 0, experiment.data.cols);
		experiment.completion.values.fill(Number.NaN, 0, experiment.data.cols);
		await audio.enable();
		audio.playRow(experiment, 0, false);
		expect(fake.oscillators).toHaveLength(0);
		experiment.observed.mask[0] = 0;
		experiment.observed.values[0] = 0;
		audio.playRow(experiment, 0, false);
		expect(fake.oscillators).toHaveLength(1);
		expect(fake.gains[1].gain.linearRampToValueAtTime.mock.calls[0][0]).toBeGreaterThan(0);
		experiment.observed.mask[0] = 1;
		experiment.completion.values[0] = 50;
		audio.playRow(experiment, 0, false);
		expect(fake.oscillators).toHaveLength(1);
		audio.playRow(experiment, 0, true);
		expect(fake.oscillators).toHaveLength(2);
		expect(fake.oscillators[1].type).toBe('sine');
		audio.dispose();
	});
});
