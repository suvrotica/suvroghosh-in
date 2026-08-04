import { MODEL_VERSION } from './config';
import type { LightningFlash, SerializableAtlasState } from './types';

export type StormReplayExport = {
	schemaVersion: 1;
	modelVersion: string;
	exportedAt: string;
	configuration: SerializableAtlasState;
	strike: LightningFlash;
	disclaimer: string;
};

export function createReplayExport(
	state: SerializableAtlasState,
	flash: LightningFlash,
	exportedAt = new Date().toISOString()
): StormReplayExport {
	const causalState = flash.modelState;
	const configuration: SerializableAtlasState = {
		...causalState,
		stormPosition: { ...causalState.stormPosition },
		storm: { ...causalState.storm },
		environment: {
			...causalState.environment,
			rainIntensity: state.environment.rainIntensity,
			visibility: state.environment.visibility,
			timeOfDay: state.environment.timeOfDay
		},
		observer: { ...causalState.observer },
		placedFeatures: causalState.placedFeatures.map((feature) => ({ ...feature })),
		mode: state.mode,
		displayMode: state.displayMode,
		cameraPreset: state.cameraPreset,
		quality: state.quality,
		visibleLayers: [...state.visibleLayers],
		flashSafe: state.flashSafe,
		selectedStrikeIndex: flash.strikeIndex
	};
	return {
		schemaVersion: 1,
		modelVersion: MODEL_VERSION,
		exportedAt,
		configuration,
		strike: flash,
		disclaimer:
			'Physically inspired procedural model. Simulated values are not observations, forecasts, safety distances, or engineering calculations.'
	};
}

export function replayJson(state: SerializableAtlasState, flash: LightningFlash): string {
	return JSON.stringify(createReplayExport(state, flash), null, 2);
}

function csvCell(value: string | number | undefined): string {
	const text = value === undefined ? '' : String(value);
	return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function strikeLogCsv(flashes: readonly LightningFlash[]): string {
	const headers = [
		'simulated_strike_index',
		'seed',
		'simulated_flash_type',
		'simulated_strike_scale',
		'simulated_attachment',
		'simulated_attachment_kind',
		'simulated_relative_intensity',
		'simulated_channel_length_m',
		'simulated_branch_count',
		'simulated_observer_distance_m',
		'simulated_thunder_delay_s',
		'simulated_channel_hash'
	];
	const rows = flashes.map((flash) => [
		flash.strikeIndex,
		flash.seed,
		flash.type,
		flash.strikeScale,
		flash.attachment?.label,
		flash.attachment?.kind,
		flash.relativeIntensity.toFixed(3),
		flash.channelLengthMetres.toFixed(1),
		flash.branchCount,
		flash.observerDistanceMetres.toFixed(1),
		flash.thunderDelaySeconds.toFixed(2),
		flash.channelHash
	]);
	return [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
}

export function safeFilename(value: string): string {
	return (
		value
			.toLocaleLowerCase('en')
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-+|-+$/g, '')
			.slice(0, 72) || 'lightning-atlas'
	);
}
