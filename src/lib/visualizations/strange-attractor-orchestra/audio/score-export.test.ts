import { describe, expect, it } from 'vitest';
import type { SonicEvent } from './contracts';
import { exportOrchestraScoreJson } from './score-export';

const events: readonly SonicEvent[] = [
	{
		id: 'later',
		simulationStep: 240,
		simulationTime: 12.5,
		time: 2,
		type: 'recurrence',
		pitchHz: 330,
		velocity01: 0.6,
		stretching: 0.73,
		duration: 0.8,
		pan: -0.2,
		sourceFeature: 'recurrence01',
		explanation: 'Near recurrence → an earlier motif returns',
		metadata: { z: 1, nested: { b: true, a: false }, a: 'first' }
	},
	{ id: 'earlier', time: 1, kind: 'sharp-fold', pan: 0.2 }
];

describe('deterministic score JSON export', () => {
	it('sorts events and metadata keys without embedding wall-clock state', async () => {
		const first = exportOrchestraScoreJson({
			events,
			seed: 'test-seed',
			soundWorld: 'radio',
			filenameStem: 'My Capture'
		});
		const second = exportOrchestraScoreJson({
			events,
			seed: 'test-seed',
			soundWorld: 'radio',
			filenameStem: 'My Capture'
		});
		expect(first.json).toBe(second.json);
		expect(first.filename).toBe('my-capture.score.json');
		expect(first.document.events.map((event) => event.id)).toEqual(['earlier', 'later']);
		expect(first.document.events[1]).toMatchObject({
			type: 'recurrence',
			simulationStep: 240,
			pitchHz: 330,
			velocity01: 0.6,
			stretching: 0.73,
			sourceFeature: 'recurrence01'
		});
		expect(first.json).not.toMatch(/created|timestamp|date/iu);
		expect(await first.blob.text()).toBe(first.json);
	});
});
