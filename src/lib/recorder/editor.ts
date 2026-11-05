import { dbToLinear, enhanceAudioBuffer, linearToDb } from './dsp';
import {
	createDefaultEditRecipe,
	type EditRecipe,
	type EditSegment,
	type SilenceInterval,
	type SilenceReductionSettings,
	type WaveformSummary
} from './types';

function cloneSegments(segments: EditSegment[]): EditSegment[] {
	return segments.map((s) => ({ ...s }));
}

function snapshotRecipe(recipe: EditRecipe, label: string): string {
	return JSON.stringify({
		label,
		trimStartSec: recipe.trimStartSec,
		trimEndSec: recipe.trimEndSec,
		segments: recipe.segments,
		fadeInSec: recipe.fadeInSec,
		fadeOutSec: recipe.fadeOutSec,
		clipGainDb: recipe.clipGainDb,
		loopSelection: recipe.loopSelection,
		selectionStartSec: recipe.selectionStartSec,
		selectionEndSec: recipe.selectionEndSec,
		silenceReduction: recipe.silenceReduction,
		enhancement: recipe.enhancement
	});
}

function restoreRecipeFromSnapshot(current: EditRecipe, serialized: string): EditRecipe {
	const parsed = JSON.parse(serialized);
	return {
		...current,
		trimStartSec: parsed.trimStartSec,
		trimEndSec: parsed.trimEndSec,
		segments: cloneSegments(parsed.segments ?? []),
		fadeInSec: parsed.fadeInSec ?? 0,
		fadeOutSec: parsed.fadeOutSec ?? 0,
		clipGainDb: parsed.clipGainDb ?? 0,
		loopSelection: Boolean(parsed.loopSelection),
		selectionStartSec: parsed.selectionStartSec ?? null,
		selectionEndSec: parsed.selectionEndSec ?? null,
		silenceReduction: { ...parsed.silenceReduction },
		enhancement: { ...parsed.enhancement }
	};
}

export function pushRecipeHistory(recipe: EditRecipe, actionLabel = 'Edit'): EditRecipe {
	const snap = snapshotRecipe(recipe, actionLabel);
	const undoStack = [...recipe.undoStack.slice(-29), snap];
	return {
		...recipe,
		segments: cloneSegments(recipe.segments),
		silenceReduction: {
			...recipe.silenceReduction,
			detectedIntervals: [...recipe.silenceReduction.detectedIntervals]
		},
		enhancement: { ...recipe.enhancement },
		undoStack,
		redoStack: []
	};
}

export function undoRecipe(recipe: EditRecipe): EditRecipe {
	if (recipe.undoStack.length === 0) return recipe;
	const undoStack = [...recipe.undoStack];
	const previousSnap = undoStack.pop()!;
	const currentSnap = snapshotRecipe(recipe, 'Redo');
	const restored = restoreRecipeFromSnapshot(recipe, previousSnap);
	return {
		...restored,
		undoStack,
		redoStack: [...recipe.redoStack, currentSnap]
	};
}

export function redoRecipe(recipe: EditRecipe): EditRecipe {
	if (recipe.redoStack.length === 0) return recipe;
	const redoStack = [...recipe.redoStack];
	const nextSnap = redoStack.pop()!;
	const currentSnap = snapshotRecipe(recipe, 'Undo');
	const restored = restoreRecipeFromSnapshot(recipe, nextSnap);
	return {
		...restored,
		undoStack: [...recipe.undoStack, currentSnap],
		redoStack
	};
}

export function resetRecipeToOriginal(
	originalDurationSec: number,
	currentRecipe?: EditRecipe
): EditRecipe {
	const fresh = createDefaultEditRecipe(
		originalDurationSec,
		currentRecipe?.enhancement.mode ?? 'speech'
	);
	if (currentRecipe) {
		const snap = snapshotRecipe(currentRecipe, 'Reset to original');
		fresh.undoStack = [...currentRecipe.undoStack.slice(-29), snap];
	}
	return fresh;
}

/**
 * Updates trim start and end points safely while keeping segments synchronized.
 */
export function applyTrimToRecipe(
	recipe: EditRecipe,
	trimStartSec: number,
	trimEndSec: number,
	maxDurationSec: number
): EditRecipe {
	const safeStart = Math.max(0, Math.min(trimStartSec, maxDurationSec - 0.05));
	const safeEnd = Math.max(safeStart + 0.05, Math.min(trimEndSec, maxDurationSec));
	const next = pushRecipeHistory(recipe, 'Trim');

	next.trimStartSec = Number(safeStart.toFixed(3));
	next.trimEndSec = Number(safeEnd.toFixed(3));

	// If single default segment, update its bounds directly; if multi-segment, clip primary segments to trim window
	if (next.segments.length === 1 && !next.segments[0].sourceRecordingId) {
		next.segments[0] = {
			...next.segments[0],
			sourceStartSec: next.trimStartSec,
			sourceEndSec: next.trimEndSec
		};
	} else {
		const clipped: EditSegment[] = [];
		for (const seg of next.segments) {
			if (seg.sourceRecordingId) {
				clipped.push({ ...seg });
				continue;
			}
			const s = Math.max(next.trimStartSec, seg.sourceStartSec);
			const e = Math.min(next.trimEndSec, seg.sourceEndSec);
			if (e - s >= 0.02) {
				clipped.push({ ...seg, sourceStartSec: Number(s.toFixed(3)), sourceEndSec: Number(e.toFixed(3)) });
			}
		}
		if (clipped.length > 0) {
			next.segments = clipped;
		}
	}

	return next;
}

/**
 * Computes total timeline duration of the active recipe segments.
 */
export function getEditedTimelineDurationSec(recipe: EditRecipe): number {
	let total = 0;
	for (const seg of recipe.segments) {
		total += Math.max(0, seg.sourceEndSec - seg.sourceStartSec);
	}
	return Number(total.toFixed(3));
}

/**
 * Cuts a selected timeline range [cutStartSec, cutEndSec] from the non-destructive segment list.
 */
export function cutTimelineSelection(
	recipe: EditRecipe,
	cutStartSec: number,
	cutEndSec: number
): EditRecipe {
	const start = Math.max(0, Math.min(cutStartSec, cutEndSec));
	const end = Math.max(start, Math.max(cutStartSec, cutEndSec));
	if (end - start < 0.03) return recipe;

	const next = pushRecipeHistory(recipe, 'Cut selection');
	const newSegments: EditSegment[] = [];
	let cursor = 0;

	for (const seg of next.segments) {
		const segDur = Math.max(0, seg.sourceEndSec - seg.sourceStartSec);
		const segTimelineStart = cursor;
		const segTimelineEnd = cursor + segDur;
		cursor = segTimelineEnd;

		// Disjoint from cut region
		if (segTimelineEnd <= start || segTimelineStart >= end) {
			newSegments.push({ ...seg });
			continue;
		}

		// Left portion before cut
		if (start > segTimelineStart + 0.02) {
			const leftDur = start - segTimelineStart;
			newSegments.push({
				...seg,
				id: `${seg.id}-L`,
				sourceEndSec: Number((seg.sourceStartSec + leftDur).toFixed(3))
			});
		}

		// Right portion after cut
		if (end < segTimelineEnd - 0.02) {
			const rightOffset = end - segTimelineStart;
			newSegments.push({
				...seg,
				id: `${seg.id}-R`,
				sourceStartSec: Number((seg.sourceStartSec + rightOffset).toFixed(3))
			});
		}
	}

	if (newSegments.length > 0) {
		next.segments = newSegments;
		next.selectionStartSec = null;
		next.selectionEndSec = null;
	}
	return next;
}

/**
 * Splits the segment under `splitTimelineSec` into two independent segments.
 */
export function splitTimelineAt(recipe: EditRecipe, splitTimelineSec: number): EditRecipe {
	const totalDur = getEditedTimelineDurationSec(recipe);
	if (splitTimelineSec <= 0.03 || splitTimelineSec >= totalDur - 0.03) {
		return recipe;
	}

	const next = pushRecipeHistory(recipe, 'Split clip');
	const newSegments: EditSegment[] = [];
	let cursor = 0;

	for (const seg of next.segments) {
		const segDur = Math.max(0, seg.sourceEndSec - seg.sourceStartSec);
		const segStart = cursor;
		const segEnd = cursor + segDur;
		cursor = segEnd;

		if (splitTimelineSec > segStart + 0.02 && splitTimelineSec < segEnd - 0.02) {
			const offset = splitTimelineSec - segStart;
			const midSourceSec = Number((seg.sourceStartSec + offset).toFixed(3));
			newSegments.push({
				...seg,
				id: `${seg.id}-a`,
				sourceEndSec: midSourceSec
			});
			newSegments.push({
				...seg,
				id: `${seg.id}-b`,
				sourceStartSec: midSourceSec
			});
		} else {
			newSegments.push({ ...seg });
		}
	}

	next.segments = newSegments;
	return next;
}

/**
 * Appends a compatible recording segment to the current recipe (non-destructive join).
 */
export function joinRecordingToRecipe(
	recipe: EditRecipe,
	joinedRecordingId: string,
	joinedDurationSec: number,
	gainDb = 0
): EditRecipe {
	if (joinedDurationSec <= 0.02) return recipe;
	const next = pushRecipeHistory(recipe, 'Join recording');
	next.segments.push({
		id: `seg-join-${Date.now()}-${next.segments.length}`,
		sourceRecordingId: joinedRecordingId,
		sourceStartSec: 0,
		sourceEndSec: Number(joinedDurationSec.toFixed(3)),
		gainDb
	});
	return next;
}

/**
 * Detects long silent pauses in the audio buffer and returns a preview of what silence shortening
 * will change, without altering the audio until the user explicitly applies it.
 */
export function detectSilenceIntervals(
	channelData: Float32Array[],
	sampleRate: number,
	settings: Pick<
		SilenceReductionSettings,
		'thresholdDbfs' | 'minSilenceMs' | 'keepPauseMs'
	>,
	activeWindow?: { startSec: number; endSec: number }
): {
	intervals: SilenceInterval[];
	totalSavedSec: number;
} {
	const ch0 = channelData[0] ?? new Float32Array(0);
	const numSamples = ch0.length;
	if (numSamples === 0 || sampleRate <= 0) {
		return { intervals: [], totalSavedSec: 0 };
	}

	const startSample = activeWindow
		? Math.max(0, Math.floor(activeWindow.startSec * sampleRate))
		: 0;
	const endSample = activeWindow
		? Math.min(numSamples, Math.ceil(activeWindow.endSec * sampleRate))
		: numSamples;

	const frameSamples = Math.max(64, Math.round(sampleRate * 0.025)); // 25 ms analysis step
	const thresholdLinear = dbToLinear(settings.thresholdDbfs);
	const minSilenceSec = Math.max(0.15, settings.minSilenceMs / 1000);
	const keepPauseSec = Math.max(0.05, settings.keepPauseMs / 1000);

	const intervals: SilenceInterval[] = [];
	let currentSilenceStart: number | null = null;

	for (let s = startSample; s < endSample; s += frameSamples) {
		const frameEnd = Math.min(endSample, s + frameSamples);
		const len = frameEnd - s;
		let sumSq = 0;
		for (let c = 0; c < channelData.length; c++) {
			const ch = channelData[c];
			for (let i = s; i < frameEnd; i++) {
				const v = ch[i];
				sumSq += v * v;
			}
		}
		const rms = Math.sqrt(sumSq / (len * channelData.length));
		const isSilent = rms < thresholdLinear;

		if (isSilent) {
			if (currentSilenceStart === null) {
				currentSilenceStart = s / sampleRate;
			}
		} else if (currentSilenceStart !== null) {
			const silenceEnd = s / sampleRate;
			const originalDurationSec = silenceEnd - currentSilenceStart;
			if (originalDurationSec >= minSilenceSec) {
				const shortenedDurationSec = Math.min(originalDurationSec, keepPauseSec);
				intervals.push({
					startSec: Number(currentSilenceStart.toFixed(3)),
					endSec: Number(silenceEnd.toFixed(3)),
					originalDurationSec: Number(originalDurationSec.toFixed(3)),
					shortenedDurationSec: Number(shortenedDurationSec.toFixed(3))
				});
			}
			currentSilenceStart = null;
		}
	}

	if (currentSilenceStart !== null) {
		const silenceEnd = endSample / sampleRate;
		const originalDurationSec = silenceEnd - currentSilenceStart;
		if (originalDurationSec >= minSilenceSec) {
			const shortenedDurationSec = Math.min(originalDurationSec, keepPauseSec);
			intervals.push({
				startSec: Number(currentSilenceStart.toFixed(3)),
				endSec: Number(silenceEnd.toFixed(3)),
				originalDurationSec: Number(originalDurationSec.toFixed(3)),
				shortenedDurationSec: Number(shortenedDurationSec.toFixed(3))
			});
		}
	}

	const totalSavedSec = Number(
		intervals
			.reduce((sum, item) => sum + Math.max(0, item.originalDurationSec - item.shortenedDurationSec), 0)
			.toFixed(2)
	);

	return { intervals, totalSavedSec };
}

/**
 * Explicitly applies the previewed silence shortening intervals to the recipe segments.
 */
export function applySilenceShorteningToRecipe(
	recipe: EditRecipe,
	intervals: SilenceInterval[]
): EditRecipe {
	if (intervals.length === 0) return recipe;
	const next = pushRecipeHistory(recipe, 'Shorten silences');
	next.silenceReduction = {
		...next.silenceReduction,
		enabled: true,
		previewed: true,
		detectedIntervals: [...intervals]
	};

	const updatedSegments: EditSegment[] = [];
	for (const seg of next.segments) {
		if (seg.sourceRecordingId) {
			updatedSegments.push({ ...seg });
			continue;
		}
		let cursor = seg.sourceStartSec;
		const segEnd = seg.sourceEndSec;

		for (const iv of intervals) {
			if (iv.endSec <= cursor || iv.startSec >= segEnd) continue;
			const keepHalf = iv.shortenedDurationSec * 0.5;
			const cutStart = Math.max(cursor, iv.startSec + keepHalf);
			const cutEnd = Math.min(segEnd, iv.endSec - keepHalf);
			if (cutEnd <= cutStart + 0.01) continue;

			if (cutStart > cursor + 0.01) {
				updatedSegments.push({
					...seg,
					id: `${seg.id}-pre-${iv.startSec}`,
					sourceStartSec: Number(cursor.toFixed(3)),
					sourceEndSec: Number(cutStart.toFixed(3))
				});
			}
			cursor = cutEnd;
		}

		if (segEnd > cursor + 0.01) {
			updatedSegments.push({
				...seg,
				id: `${seg.id}-tail-${cursor}`,
				sourceStartSec: Number(cursor.toFixed(3)),
				sourceEndSec: Number(segEnd.toFixed(3))
			});
		}
	}

	if (updatedSegments.length > 0) {
		next.segments = updatedSegments;
	}

	return next;
}

/**
 * Renders the non-destructive `EditRecipe` from the immutable original channel data
 * (plus any joined secondary recording buffers) and optionally applies sound enhancement.
 */
export function renderEditedAudio(options: {
	originalChannels: Float32Array[];
	sampleRate: number;
	recipe: EditRecipe;
	secondaryRecordings?: Map<string, Float32Array[]>;
	includeEnhancement?: boolean;
	onProgress?: (fraction: number) => void;
	shouldCancel?: () => boolean;
}): {
	renderedChannels: Float32Array[];
	sampleRate: number;
	durationSec: number;
} {
	const {
		originalChannels,
		sampleRate,
		recipe,
		secondaryRecordings,
		includeEnhancement = true
	} = options;
	const numChannels = Math.max(1, originalChannels.length);

	// 1. Assemble non-destructive segments with 4 ms crossfades at segment boundaries
	const segmentChunks: Float32Array[][] = [];
	let totalSamples = 0;

	for (const seg of recipe.segments) {
		const srcChannels = seg.sourceRecordingId
			? (secondaryRecordings?.get(seg.sourceRecordingId) ?? originalChannels)
			: originalChannels;
		const srcLen = srcChannels[0]?.length ?? 0;
		const startSample = Math.max(0, Math.min(srcLen, Math.floor(seg.sourceStartSec * sampleRate)));
		const endSample = Math.max(
			startSample,
			Math.min(srcLen, Math.ceil(seg.sourceEndSec * sampleRate))
		);
		const segLen = endSample - startSample;
		if (segLen <= 0) continue;

		const segGain = dbToLinear(seg.gainDb);
		const chunk: Float32Array[] = [];
		for (let c = 0; c < numChannels; c++) {
			const srcCh = srcChannels[Math.min(c, srcChannels.length - 1)] ?? new Float32Array(0);
			const slice = new Float32Array(segLen);
			for (let i = 0; i < segLen; i++) {
				slice[i] = (srcCh[startSample + i] ?? 0) * segGain;
			}
			// 3 ms click-free micro-fade at splice edges
			const edgeSamples = Math.min(Math.floor(segLen / 4), Math.round(sampleRate * 0.003));
			for (let i = 0; i < edgeSamples; i++) {
				const w = (i + 1) / (edgeSamples + 1);
				slice[i] *= w;
				slice[segLen - 1 - i] *= w;
			}
			chunk.push(slice);
		}

		segmentChunks.push(chunk);
		totalSamples += segLen;
	}

	const assembled: Float32Array[] = Array.from(
		{ length: numChannels },
		() => new Float32Array(totalSamples)
	);

	let offset = 0;
	for (const chunk of segmentChunks) {
		const len = chunk[0]?.length ?? 0;
		for (let c = 0; c < numChannels; c++) {
			assembled[c].set(chunk[c], offset);
		}
		offset += len;
	}

	// 2. Apply automatic sound improvement if enabled
	let outputChannels = assembled;
	if (includeEnhancement && recipe.enhancement.enabled && recipe.enhancement.amount > 0) {
		const enhanced = enhanceAudioBuffer(assembled, sampleRate, recipe.enhancement, {
			onProgress: options.onProgress,
			shouldCancel: options.shouldCancel
		});
		outputChannels = enhanced.enhancedChannels;
	}

	// 3. Apply clip gain, fade-in, and fade-out
	const clipGainLinear = dbToLinear(recipe.clipGainDb);
	const fadeInSamples = Math.min(
		totalSamples,
		Math.max(0, Math.round(recipe.fadeInSec * sampleRate))
	);
	const fadeOutSamples = Math.min(
		totalSamples,
		Math.max(0, Math.round(recipe.fadeOutSec * sampleRate))
	);

	for (let c = 0; c < numChannels; c++) {
		const ch = outputChannels[c];
		if (Math.abs(recipe.clipGainDb) > 0.01) {
			for (let i = 0; i < totalSamples; i++) {
				ch[i] = Math.max(-0.99, Math.min(0.99, ch[i] * clipGainLinear));
			}
		}
		if (fadeInSamples > 0) {
			for (let i = 0; i < fadeInSamples; i++) {
				const t = i / fadeInSamples;
				// Equal-power / smooth cosine fade-in
				ch[i] *= 0.5 * (1 - Math.cos(Math.PI * t));
			}
		}
		if (fadeOutSamples > 0) {
			for (let i = 0; i < fadeOutSamples; i++) {
				const idx = totalSamples - 1 - i;
				if (idx >= 0) {
					const t = i / fadeOutSamples;
					ch[idx] *= 0.5 * (1 - Math.cos(Math.PI * t));
				}
			}
		}
	}

	return {
		renderedChannels: outputChannels,
		sampleRate,
		durationSec: sampleRate > 0 ? Number((totalSamples / sampleRate).toFixed(3)) : 0
	};
}

/**
 * Builds a compact, high-detail waveform summary (peaks + RMS per bucket) in bounded memory.
 */
export function buildWaveformSummary(
	channelData: Float32Array[],
	sampleRate: number,
	bucketCount = 480
): WaveformSummary {
	const ch0 = channelData[0] ?? new Float32Array(0);
	const numSamples = ch0.length;
	const safeBuckets = Math.max(32, Math.min(2048, bucketCount));

	if (numSamples === 0 || sampleRate <= 0) {
		return {
			bucketCount: safeBuckets,
			peaks: new Array(safeBuckets).fill(0),
			rms: new Array(safeBuckets).fill(0),
			peakDbfs: -96,
			rmsDbfs: -96
		};
	}

	const peaks = new Array<number>(safeBuckets).fill(0);
	const rms = new Array<number>(safeBuckets).fill(0);
	let globalPeak = 0;
	let globalSq = 0;
	const numChannels = channelData.length;

	for (let b = 0; b < safeBuckets; b++) {
		const start = Math.floor((b * numSamples) / safeBuckets);
		const end = Math.max(start + 1, Math.floor(((b + 1) * numSamples) / safeBuckets));
		let bPeak = 0;
		let bSq = 0;
		let count = 0;

		for (let c = 0; c < numChannels; c++) {
			const ch = channelData[c];
			for (let i = start; i < end && i < numSamples; i++) {
				const v = Math.abs(ch[i]);
				if (v > bPeak) bPeak = v;
				if (v > globalPeak) globalPeak = v;
				bSq += v * v;
				count++;
			}
		}

		peaks[b] = Number(Math.min(1, bPeak).toFixed(4));
		rms[b] = Number(Math.min(1, count > 0 ? Math.sqrt(bSq / count) : 0).toFixed(4));
		globalSq += bSq;
	}

	const totalCount = Math.max(1, numSamples * numChannels);
	return {
		bucketCount: safeBuckets,
		peaks,
		rms,
		peakDbfs: Number(Math.max(-96, linearToDb(globalPeak)).toFixed(2)),
		rmsDbfs: Number(Math.max(-96, linearToDb(Math.sqrt(globalSq / totalCount))).toFixed(2))
	};
}
