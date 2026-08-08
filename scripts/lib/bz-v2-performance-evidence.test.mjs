import assert from 'node:assert/strict';
import test from 'node:test';
import { validateBZV2PerformanceEvidence } from './bz-v2-performance-evidence.mjs';

const expected = Object.freeze({
	engineVersion: 'bz-heun-five-point-v2',
	displayVersion: 'bz-display-linear-light-v2'
});

function evidence() {
	return {
		schemaVersion: 1,
		kind: 'bz-v2-browser-performance',
		engineVersion: expected.engineVersion,
		displayVersion: expected.displayVersion,
		measuredAt: '2026-08-08T12:00:00.000Z',
		reports: [
			{
				browser: 'Chromium test fixture',
				gpu: 'WebGL test fixture',
				stateGrid: 256,
				displayResolution: '1024×768 CSS pixels',
				durationSeconds: 30,
				medianFps: 59.5,
				medianStepsPerSecond: 180,
				telemetryHz: 3.3,
				fullStateReadbacks: 0,
				scientificTextureBytes: 2_097_152,
				displayTextureBytes: 4_194_304,
				notes: 'Measured fixture; not publication evidence.'
			}
		]
	};
}

test('accepts and normalises an exact measured browser performance envelope', () => {
	const parsed = validateBZV2PerformanceEvidence(evidence(), expected);
	assert.equal(parsed.measuredAt, '2026-08-08T12:00:00.000Z');
	assert.deepEqual(parsed.reports, evidence().reports);
});

test('rejects missing, extra, stale, short or non-finite performance evidence', () => {
	const extraField = evidence();
	extraField.reports[0].invented = true;
	assert.throws(
		() => validateBZV2PerformanceEvidence(extraField, expected),
		/keys differ from the versioned contract/iu
	);

	const missingField = evidence();
	delete missingField.reports[0].medianFps;
	assert.throws(
		() => validateBZV2PerformanceEvidence(missingField, expected),
		/keys differ from the versioned contract/iu
	);

	const staleEngine = evidence();
	staleEngine.engineVersion = 'stale-engine';
	assert.throws(
		() => validateBZV2PerformanceEvidence(staleEngine, expected),
		/engine version differs/iu
	);

	const tooShort = evidence();
	tooShort.reports[0].durationSeconds = 29.999;
	assert.throws(() => validateBZV2PerformanceEvidence(tooShort, expected), /duration/iu);

	const nonFinite = evidence();
	nonFinite.reports[0].medianFps = Number.NaN;
	assert.throws(() => validateBZV2PerformanceEvidence(nonFinite, expected), /median FPS/iu);
});

test('rejects duplicate runtime reports', () => {
	const duplicate = evidence();
	duplicate.reports.push({ ...duplicate.reports[0] });
	assert.throws(() => validateBZV2PerformanceEvidence(duplicate, expected), /duplicates/iu);
});
