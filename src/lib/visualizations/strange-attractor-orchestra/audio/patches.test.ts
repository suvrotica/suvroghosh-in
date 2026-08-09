import { describe, expect, it } from 'vitest';
import { SOUND_WORLD_IDS, type SonicEvent } from './contracts';
import { AUDIO_OBSERVATION_TRANSITION_SECONDS, buildVoicePlan } from './mapping';
import { SOUND_WORLD_PATCHES } from './patches';
import { AUDIO_MAX_FREQUENCY_HZ, AUDIO_MAX_PAN, patchIsSafe } from './safety';

const event: SonicEvent = {
	id: 'crossing-17',
	time: 4.25,
	kind: 'lobe-crossing',
	intensity: 0.72,
	region: 'right-lobe',
	height: 0.82,
	curvature: 0.31,
	stretching: 0.68,
	recurrence: 0.46,
	density: 0.63,
	noise: 0.55
};

describe('sound-world patch contract', () => {
	it('publishes exactly four safe patches over the same score vocabulary', () => {
		expect(Object.keys(SOUND_WORLD_PATCHES).sort()).toEqual([...SOUND_WORLD_IDS].sort());
		for (const id of SOUND_WORLD_IDS) {
			const patch = SOUND_WORLD_PATCHES[id];
			expect(patch.id).toBe(id);
			expect(patchIsSafe(patch)).toBe(true);
			expect(patch.modalRatios).toHaveLength(patch.modalGains.length);
			expect(patch.effectDelaySeconds).toBeGreaterThanOrEqual(0.04);
			expect(patch.effectFeedback).toBeLessThanOrEqual(0.28);
			expect(patch.effectWetGain).toBeLessThanOrEqual(0.18);
		}
		expect(
			new Set(SOUND_WORLD_IDS.map((id) => SOUND_WORLD_PATCHES[id].effectDelaySeconds)).size
		).toBe(SOUND_WORLD_IDS.length);
	});

	it('maps measured stretching to filter brightness and curvature to a bounded shorter attack', () => {
		const patch = SOUND_WORLD_PATCHES.magnetic;
		const baseline = buildVoicePlan(
			{ ...event, id: 'feature-bridge', curvature: 0, stretching: 0 },
			patch,
			'feature-seed',
			3
		);
		const stretched = buildVoicePlan(
			{ ...event, id: 'feature-bridge', curvature: 0, stretching: 1 },
			patch,
			'feature-seed',
			3
		);
		const folded = buildVoicePlan(
			{ ...event, id: 'feature-bridge', curvature: 1, stretching: 0 },
			patch,
			'feature-seed',
			3
		);

		expect(stretched.modalFrequenciesHz[0]).toBeGreaterThan(baseline.modalFrequenciesHz[0]);
		expect(folded.attackSeconds).toBeLessThan(baseline.attackSeconds);
		expect(folded.attackSeconds).toBeGreaterThanOrEqual(0.004);
		expect(baseline.scoreTime).toBe(stretched.scoreTime);
		expect(baseline.durationSeconds).toBe(stretched.durationSeconds);
	});

	it('auditions Raw, Weather and Braided without changing structural score properties', () => {
		const patch = SOUND_WORLD_PATCHES.glass;
		const braided = buildVoicePlan(event, patch, 'view-seed', 9, 'braided');
		const raw = buildVoicePlan(event, patch, 'view-seed', 9, 'raw');
		const weather = buildVoicePlan(event, patch, 'view-seed', 9, 'noise');

		for (const plan of [raw, weather]) {
			expect(plan.id).toBe(braided.id);
			expect(plan.kind).toBe(braided.kind);
			expect(plan.scoreTime).toBe(braided.scoreTime);
			expect(plan.durationSeconds).toBe(braided.durationSeconds);
		}
		expect(raw.pan).not.toBe(braided.pan);
		expect(raw.noiseGain).toBeLessThan(braided.noiseGain);
		expect(weather.noiseGain).toBeGreaterThan(braided.noiseGain);
		expect(weather.oscillatorGain).toBeLessThan(braided.oscillatorGain);
		expect(AUDIO_OBSERVATION_TRANSITION_SECONDS).toBeGreaterThanOrEqual(0.004);
		expect(AUDIO_OBSERVATION_TRANSITION_SECONDS).toBeLessThanOrEqual(0.25);
	});

	it('maps one causal event deterministically while changing only its orchestration', () => {
		const plans = SOUND_WORLD_IDS.map((id) =>
			buildVoicePlan(event, SOUND_WORLD_PATCHES[id], 'langford-1847', 17)
		);
		for (const [index, plan] of plans.entries()) {
			expect(plan).toEqual(
				buildVoicePlan(event, SOUND_WORLD_PATCHES[SOUND_WORLD_IDS[index]], 'langford-1847', 17)
			);
			expect(plan.id).toBe('crossing-17');
			expect(plan.kind).toBe('lobe-crossing');
			expect(plan.scoreTime).toBe(4.25);
			expect(Math.abs(plan.pan)).toBeLessThanOrEqual(AUDIO_MAX_PAN);
			expect(
				plan.modalFrequenciesHz.every((frequency) => frequency <= AUDIO_MAX_FREQUENCY_HZ)
			).toBe(true);
		}
		expect(new Set(plans.map((plan) => plan.baseFrequencyHz)).size).toBeGreaterThan(1);
	});

	it('accepts the canonical core score vocabulary without an adapter', () => {
		const coreEvent: SonicEvent = {
			id: 'v1:lorenz:240:recurrence',
			simulationStep: 240,
			simulationTime: 3.75,
			time: 1.5,
			type: 'recurrence',
			pitchHz: 329.63,
			velocity01: 0.64,
			duration: 0.82,
			pan: -0.3,
			sourceFeature: 'recurrence01',
			explanation: 'Near recurrence → an earlier motif returns'
		};
		const plan = buildVoicePlan(coreEvent, SOUND_WORLD_PATCHES.glass, 'seed', 4);
		expect(plan).toMatchObject({
			kind: 'recurrence',
			baseFrequencyHz: 329.63,
			pan: -0.3
		});
		expect(plan.intensity).toBeGreaterThan(0.3);
	});
});
