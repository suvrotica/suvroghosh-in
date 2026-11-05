import { describe, expect, it } from 'vitest';
import {
	analyzeAudioBuffer,
	enhanceAudioBuffer,
	extractRepresentativePreview
} from './dsp';
import {
	applySilenceShorteningToRecipe,
	applyTrimToRecipe,
	buildWaveformSummary,
	cutTimelineSelection,
	detectSilenceIntervals,
	getEditedTimelineDurationSec,
	joinRecordingToRecipe,
	redoRecipe,
	renderEditedAudio,
	resetRecipeToOriginal,
	splitTimelineAt,
	undoRecipe
} from './editor';
import {
	estimateExportSizeBytes,
	exportRecordingMedia
} from './mp4-encoder';
import { inspectMediaContainer } from './mp4-parser';
import {
	buildCalibratedBarkGruWeightsBuffer,
	downloadAndCacheNeuralModel,
	parseBarkGruWeights,
	removeCachedNeuralModel
} from './neural-weights';
import {
	commitCompletedRecording,
	computeSha256Hex,
	exportProjectBackupZip,
	findRecoverableSessions,
	importProjectBackupZip,
	permanentlyDeleteRecording,
	recoverInterruptedSession,
	restoreDeletedRecording,
	saveSessionJournal,
	softDeleteRecording,
	updateRecordingMetadata,
	verifyOriginalIntegrity,
	writeRecordingChunk
} from './storage';
import {
	synthesizeMusicRehearsalSample,
	synthesizeSpeechBesideRunningFan
} from './demo-samples';
import {
	createDefaultEditRecipe,
	createDefaultEnhancementSettings,
	EXPORT_PRESETS
} from './types';

describe('Recorder — Acoustic Analysis, DSP & Local Neural Speech Enhancement', () => {
	it('detects 50 Hz mains hum, fan rumble, and noise floor in the worked example and improves sound without mutating original', () => {
		const sample = synthesizeSpeechBesideRunningFan({ durationSec: 6.0, sampleRate: 48000 });
		const originalCopy = new Float32Array(sample.channelData[0]);

		const initial = analyzeAudioBuffer(sample.channelData, sample.sampleRate);
		expect(initial.durationSec).toBeCloseTo(6.0, 1);
		expect(initial.humFrequencyHz).toBe(50);
		expect(initial.noiseFloorDbfs).toBeGreaterThan(-65);

		// Run automatic sound improvement with local neural engine + spectral DSP
		const settings = {
			...createDefaultEnhancementSettings('speech'),
			enabled: true,
			amount: 72,
			engine: 'neural' as const,
			humRemoval: true,
			echoReduction: true,
			deClick: true,
			clipRepair: true
		};

		const result = enhanceAudioBuffer(sample.channelData, sample.sampleRate, settings);

		// 1. Original array must be bit-for-bit untouched
		expect(sample.channelData[0]).toEqual(originalCopy);

		// 2. Peak ceiling must be strictly protected (<= -0.95 dBFS, 0 clipped samples)
		expect(result.analysis.after.peakDbfs).toBeLessThanOrEqual(-0.95);
		expect(result.analysis.after.clippedSamples).toBe(0);

		// 3. 50 Hz mains hum must be removed or reduced below detection threshold
		expect(result.analysis.after.humFrequencyHz).toBeNull();

		// 4. Plain-English change notes and matched-loudness gain must be populated
		expect(result.analysis.changeNotes.length).toBeGreaterThanOrEqual(2);
		expect(result.analysis.summary.length).toBeGreaterThan(15);
		expect(Number.isFinite(result.matchedLoudnessGainDb)).toBe(true);
		expect(result.matchedLoudnessGainLinear).toBeGreaterThan(0);
	});

	it('preserves stereo imaging and musical dynamics in Music mode', () => {
		const music = synthesizeMusicRehearsalSample(48000, 3.0);
		const settings = {
			...createDefaultEnhancementSettings('music'),
			enabled: true,
			amount: 55
		};
		const res = enhanceAudioBuffer(music.channelData, music.sampleRate, settings);
		expect(res.enhancedChannels.length).toBe(2);
		expect(res.enhancedChannels[0].length).toBe(music.channelData[0].length);
		expect(res.analysis.after.clippedSamples).toBe(0);
	});

	it('extracts a 10-second representative preview from a longer recording', () => {
		const longSample = synthesizeSpeechBesideRunningFan({ durationSec: 16.0, sampleRate: 16000 });
		const preview = extractRepresentativePreview(longSample.channelData, 16000, 10);
		expect(preview.previewChannels[0].length).toBe(16000 * 10);
		expect(preview.endSec - preview.startSec).toBeCloseTo(10, 1);
	});

	it('builds, parses, caches, and removes the 144 KB Bark-GRU neural speech model', async () => {
		const buf = buildCalibratedBarkGruWeightsBuffer();
		expect(buf.byteLength).toBe(147_456);
		const parsed = parseBarkGruWeights(buf);
		expect(parsed.bandImportance.length).toBe(24);

		const status = await downloadAndCacheNeuralModel();
		expect(status.state).toBe('ready');
		expect(status.cachedBytes).toBe(147_456);

		const removed = await removeCachedNeuralModel();
		expect(removed.state).toBe('not-downloaded');
		expect(removed.cachedBytes).toBe(0);
	});
});

describe('Recorder — Non-Destructive Editor & Silence Shortening', () => {
	it('supports trim, cut, split, join, previewable silence shortening, undo, redo, and reset without altering original audio', () => {
		const sample = synthesizeSpeechBesideRunningFan({ durationSec: 12.0, sampleRate: 24000 });
		const origDigestBefore = Array.from(sample.channelData[0].slice(0, 128));

		let recipe = createDefaultEditRecipe(12.0, 'speech');
		expect(getEditedTimelineDurationSec(recipe)).toBeCloseTo(12.0, 2);

		// 1. Trim beginning (1.4s) and end (10.6s)
		recipe = applyTrimToRecipe(recipe, 1.4, 10.6, 12.0);
		expect(recipe.trimStartSec).toBe(1.4);
		expect(recipe.trimEndSec).toBe(10.6);
		expect(getEditedTimelineDurationSec(recipe)).toBeCloseTo(9.2, 2);

		// 2. Split at 4.0s into the trimmed timeline
		recipe = splitTimelineAt(recipe, 4.0);
		expect(recipe.segments.length).toBe(2);

		// 3. Cut a 1.0s selection [2.0s .. 3.0s]
		recipe = cutTimelineSelection(recipe, 2.0, 3.0);
		expect(getEditedTimelineDurationSec(recipe)).toBeCloseTo(8.2, 2);

		// 4. Join a secondary 3.5s clip
		recipe = joinRecordingToRecipe(recipe, 'rec_second_clip', 3.5);
		expect(getEditedTimelineDurationSec(recipe)).toBeCloseTo(11.7, 2);

		// 5. Undo and Redo
		recipe = undoRecipe(recipe);
		expect(getEditedTimelineDurationSec(recipe)).toBeCloseTo(8.2, 2);
		recipe = redoRecipe(recipe);
		expect(getEditedTimelineDurationSec(recipe)).toBeCloseTo(11.7, 2);

		// 6. Reset to original
		recipe = resetRecipeToOriginal(12.0, recipe);
		expect(getEditedTimelineDurationSec(recipe)).toBeCloseTo(12.0, 2);

		// 7. Explicit silence detection & shortening preview
		const silentCh = new Float32Array(24000 * 6);
		// Active bursts at 0..1s, silence at 1..4s, active at 4..6s
		for (let i = 0; i < 24000; i++) silentCh[i] = 0.25 * Math.sin(i * 0.1);
		for (let i = 24000 * 4; i < 24000 * 6; i++) silentCh[i] = 0.25 * Math.sin(i * 0.1);

		const silencePreview = detectSilenceIntervals([silentCh], 24000, {
			thresholdDbfs: -42,
			minSilenceMs: 500,
			keepPauseMs: 250
		});
		expect(silencePreview.intervals.length).toBe(1);
		expect(silencePreview.totalSavedSec).toBeGreaterThan(2.5);

		let silenceRecipe = createDefaultEditRecipe(6.0, 'speech');
		silenceRecipe = applySilenceShorteningToRecipe(silenceRecipe, silencePreview.intervals);
		expect(getEditedTimelineDurationSec(silenceRecipe)).toBeLessThan(3.5);

		// 8. Render edited audio and confirm original sample buffer was never mutated
		const rendered = renderEditedAudio({
			originalChannels: sample.channelData,
			sampleRate: sample.sampleRate,
			recipe: applyTrimToRecipe(createDefaultEditRecipe(12.0, 'speech'), 1.4, 10.6, 12.0),
			includeEnhancement: false
		});
		expect(rendered.durationSec).toBeCloseTo(9.2, 1);
		expect(Array.from(sample.channelData[0].slice(0, 128))).toEqual(origDigestBefore);
	});
});

describe('Recorder — Genuine MP4, M4A, Video-MP4, and WAV Container Verification', () => {
	const testAudio = synthesizeSpeechBesideRunningFan({ durationSec: 1.5, sampleRate: 48000 });
	const wf = buildWaveformSummary(testAudio.channelData, testAudio.sampleRate, 120);

	it('exports genuine ISO BMFF .mp4 audio across all 4 AAC bitrate presets and passes container inspection', async () => {
		for (const presetId of Object.keys(EXPORT_PRESETS) as (keyof typeof EXPORT_PRESETS)[]) {
			const result = await exportRecordingMedia({
				title: `Fan Speech ${presetId}`,
				mode: 'speech',
				format: 'mp4-audio',
				presetId,
				channelData: testAudio.channelData,
				sampleRate: testAudio.sampleRate,
				waveformPeaks: wf.peaks
			});

			expect(result.filename.endsWith('.mp4')).toBe(true);
			expect(result.inspection.valid).toBe(true);
			expect(result.inspection.container).toBe('mp4');
			expect(result.inspection.hasAudio).toBe(true);
			expect(result.inspection.hasVideo).toBe(false);
			expect(result.inspection.audioCodec).toBe('mp4a.40.2');
			expect(result.inspection.topLevelBoxes).toContain('ftyp');
			expect(result.inspection.topLevelBoxes).toContain('moov');
			expect(result.inspection.topLevelBoxes).toContain('mdat');
			expect(result.inspection.sampleCount).toBeGreaterThan(0);
		}
	});

	it('exports genuine .m4a audio with M4A major brand', async () => {
		const result = await exportRecordingMedia({
			title: 'Interview Note',
			mode: 'speech',
			format: 'm4a-audio',
			presetId: 'standard-speech',
			channelData: testAudio.channelData,
			sampleRate: testAudio.sampleRate,
			waveformPeaks: wf.peaks
		});

		expect(result.filename).toBe('interview-note.m4a');
		expect(result.inspection.valid).toBe(true);
		expect(result.inspection.container).toBe('m4a');
		expect(result.inspection.majorBrand).toBe('M4A ');
		expect(result.inspection.audioCodec).toBe('mp4a.40.2');
	});

	it('exports genuine .mp4 video with H.264 title card track (avc1) + AAC audio track (mp4a)', async () => {
		const result = await exportRecordingMedia({
			title: 'Calcutta Field Note',
			mode: 'speech',
			format: 'mp4-video',
			presetId: 'standard-speech',
			channelData: testAudio.channelData,
			sampleRate: testAudio.sampleRate,
			waveformPeaks: wf.peaks
		});

		expect(result.filename).toBe('calcutta-field-note.mp4');
		expect(result.mimeType).toBe('video/mp4');
		expect(result.inspection.valid).toBe(true);
		expect(result.inspection.hasAudio).toBe(true);
		expect(result.inspection.hasVideo).toBe(true);
		expect(result.inspection.audioCodec).toBe('mp4a.40.2');
		expect(result.inspection.videoCodec).toBe('avc1.42c01e');
	});

	it('rejects renamed WebM or Ogg files masquerading as MP4', () => {
		const fakeWebm = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x01, 0x02, 0x03, 0x04, 0, 0, 0, 0]);
		const webmCheck = inspectMediaContainer(fakeWebm);
		expect(webmCheck.valid).toBe(false);
		expect(webmCheck.container).toBe('webm');
		expect(webmCheck.errors[0]).toMatch(/WebM/i);

		const fakeOgg = new Uint8Array([
			0x4f, 0x67, 0x67, 0x53, 0x00, 0x02, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
		]);
		const oggCheck = inspectMediaContainer(fakeOgg);
		expect(oggCheck.valid).toBe(false);
		expect(oggCheck.container).toBe('ogg');
		expect(oggCheck.errors[0]).toMatch(/Ogg/i);
	});

	it('estimates 10-minute speech MP4 sizes accurately (~4.8 MB for 64 kbps, ~7.2 MB for 96 kbps)', () => {
		const bytes64 = estimateExportSizeBytes(600, 'mp4-audio', 'compact-speech', 48000);
		const bytes96 = estimateExportSizeBytes(600, 'mp4-audio', 'standard-speech', 48000);
		expect(bytes64 / (1024 * 1024)).toBeGreaterThan(4.4);
		expect(bytes64 / (1024 * 1024)).toBeLessThan(5.3);
		expect(bytes96 / (1024 * 1024)).toBeGreaterThan(6.8);
		expect(bytes96 / (1024 * 1024)).toBeLessThan(7.8);
	});
});

describe('Recorder — Incremental Persistence, Original Integrity & Crash Recovery', () => {
	it('verifies immutable original SHA-256 across edits, recovers interrupted sessions, and round-trips .zip project backups', async () => {
		const rawBytes = new Uint8Array([82, 73, 70, 70, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
		const expectedSha = await computeSha256Hex(rawBytes);

		const committed = await commitCompletedRecording({
			metadata: {
				id: 'rec_integrity_test_1',
				title: 'Original Integrity Test',
				notes: 'Initial note',
				tags: ['speech'],
				favourite: false,
				mode: 'speech',
				createdAt: Date.now(),
				updatedAt: Date.now(),
				deletedAt: null,
				durationSec: 4.0,
				capturedMs: 4000,
				pausedMs: 0,
				interruptionCount: 0,
				interruptionGapMs: 0,
				sampleRate: 48000,
				channels: 1,
				originalMimeType: 'audio/wav',
				originalExtension: 'wav',
				originalByteLength: rawBytes.byteLength,
				chunkCount: 1,
				committedChunkCount: 1,
				recoveredFromCrash: false,
				lastRecoverableSec: 4.0,
				bookmarks: [],
				waveform: {
					bucketCount: 32,
					peaks: new Array(32).fill(0.4),
					rms: new Array(32).fill(0.2),
					peakDbfs: -6,
					rmsDbfs: -14
				},
				analysis: null,
				recipe: createDefaultEditRecipe(4.0, 'speech')
			},
			originalBytes: rawBytes,
			pcmChannels: [new Float32Array(1024)]
		});

		expect(committed.status).toBe('saved');
		expect(committed.originalSha256).toBe(expectedSha);

		// Modify recipe and metadata; verify original bytes on storage remain identical
		await updateRecordingMetadata({
			...committed,
			title: 'Edited Title',
			recipe: applyTrimToRecipe(committed.recipe, 0.5, 3.2, 4.0)
		});

		const check = await verifyOriginalIntegrity('rec_integrity_test_1');
		expect(check.valid).toBe(true);
		expect(check.actualSha256).toBe(expectedSha);

		// Export and re-import project backup .zip
		const backup = await exportProjectBackupZip('rec_integrity_test_1');
		expect(backup.filename).toContain('edited-title-project-backup.zip');
		const restored = await importProjectBackupZip(backup.zipBytes);
		expect(restored.originalSha256).toBe(expectedSha);

		// Soft delete, undo, and permanent delete
		await softDeleteRecording('rec_integrity_test_1');
		await restoreDeletedRecording('rec_integrity_test_1');
		await permanentlyDeleteRecording('rec_integrity_test_1');
		await permanentlyDeleteRecording(restored.id);

		// Simulate interrupted recording session with 2 committed chunks
		const sessionId = 'sess_crash_test_1';
		const recordingId = 'rec_crash_test_1';
		await saveSessionJournal({
			sessionId,
			recordingId,
			tabId: 'crashed_tab_id',
			title: 'Interrupted Interview',
			mode: 'speech',
			startedAt: Date.now() - 15000,
			lastHeartbeatAt: Date.now() - 10000,
			capturedDurationMs: 3000,
			pausedDurationMs: 0,
			interruptionCount: 1,
			interruptionGapMs: 120,
			sampleRate: 48000,
			channels: 1,
			mimeType: 'audio/wav',
			chunkCount: 2,
			committedChunkCount: 2,
			status: 'interrupted',
			gapEvents: [{ timestampMs: Date.now() - 10000, durationMs: 120, reason: 'Tab crash' }]
		});

		await writeRecordingChunk({
			sessionId,
			recordingId,
			index: 0,
			bytes: new Uint8Array([1, 2, 3, 4]),
			mimeType: 'audio/wav',
			capturedDurationMs: 1500
		});
		await writeRecordingChunk({
			sessionId,
			recordingId,
			index: 1,
			bytes: new Uint8Array([5, 6, 7, 8]),
			mimeType: 'audio/wav',
			capturedDurationMs: 1500
		});

		const recoverable = await findRecoverableSessions('current_active_tab');
		expect(recoverable.some((r) => r.journal.sessionId === sessionId)).toBe(true);

		const recoveredMeta = await recoverInterruptedSession(sessionId);
		expect(recoveredMeta).not.toBeNull();
		expect(recoveredMeta?.recoveredFromCrash).toBe(true);
		expect(recoveredMeta?.durationSec).toBeCloseTo(3.0, 1);

		if (recoveredMeta) {
			await permanentlyDeleteRecording(recoveredMeta.id);
		}
	});
});
