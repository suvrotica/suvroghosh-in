import type { Clocks } from '../engine/types.ts';

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const MINUTE_MS = 60_000;

export function formatPatientElapsed(milliseconds: number): string {
	const safe = Math.max(0, Math.round(milliseconds));
	const days = Math.floor(safe / DAY_MS);
	const hours = Math.floor((safe % DAY_MS) / HOUR_MS);
	const minutes = Math.floor((safe % HOUR_MS) / MINUTE_MS);
	if (days > 0) return `${days}d ${hours}h ${minutes}m`;
	if (hours > 0) return `${hours}h ${minutes}m`;
	return `${minutes}m`;
}

export function formatHumanWork(seconds: number): string {
	const safe = Math.max(0, Math.round(seconds));
	const hours = Math.floor(safe / 3_600);
	const minutes = Math.floor((safe % 3_600) / 60);
	const remainder = safe % 60;
	if (hours > 0) return `${hours}h ${minutes}m`;
	if (minutes > 0) return `${minutes}m ${remainder}s`;
	return `${remainder}s`;
}

export function formatMachineProcessing(milliseconds: number): string {
	const safe = Math.max(0, Math.round(milliseconds));
	if (safe < 1_000) return `${safe}ms`;
	const seconds = safe / 1_000;
	return `${Number.isInteger(seconds) ? seconds : seconds.toFixed(2)}s`;
}

export function formatRelativeTime(milliseconds: number): string {
	const safe = Math.max(0, Math.round(milliseconds));
	const day = Math.floor(safe / DAY_MS);
	const minutesIntoDay = Math.floor((safe % DAY_MS) / MINUTE_MS);
	const hours = Math.floor(minutesIntoDay / 60);
	const minutes = minutesIntoDay % 60;
	if (hours === 0 && minutes === 0) return `Day ${day}`;
	return `Day ${day}, ${hours}h ${minutes}m`;
}

export function formatClocks(clocks: Clocks): Readonly<{
	patientElapsed: string;
	activeHumanWork: string;
	automatedProcessing: string;
}> {
	return {
		patientElapsed: formatPatientElapsed(clocks.patientElapsedMs),
		activeHumanWork: formatHumanWork(clocks.activeHumanWorkSeconds),
		automatedProcessing: formatMachineProcessing(clocks.automatedProcessingMs)
	};
}
