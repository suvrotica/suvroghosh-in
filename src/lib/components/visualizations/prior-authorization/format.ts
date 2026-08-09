const MINUTES_PER_DAY = 24 * 60;

export function formatPatientElapsed(totalMinutes: number): string {
	const safeMinutes = Math.max(0, Math.round(totalMinutes));
	const days = Math.floor(safeMinutes / MINUTES_PER_DAY);
	const hours = Math.floor((safeMinutes % MINUTES_PER_DAY) / 60);
	const minutes = safeMinutes % 60;
	const parts: string[] = [];
	if (days) parts.push(`${days} ${days === 1 ? 'day' : 'days'}`);
	if (hours) parts.push(`${hours} ${hours === 1 ? 'hour' : 'hours'}`);
	if (minutes || parts.length === 0) parts.push(`${minutes} min`);
	return parts.join(' ');
}

export function formatHumanWork(totalSeconds: number): string {
	const safeSeconds = Math.max(0, Math.round(totalSeconds));
	const hours = Math.floor(safeSeconds / 3600);
	const minutes = Math.floor((safeSeconds % 3600) / 60);
	const seconds = safeSeconds % 60;
	if (hours) return `${hours} h ${minutes} min`;
	if (minutes) return `${minutes} min${seconds ? ` ${seconds} s` : ''}`;
	return `${seconds} s`;
}

export function formatMachineTime(totalMilliseconds: number): string {
	const safeMilliseconds = Math.max(0, Math.round(totalMilliseconds));
	if (safeMilliseconds < 1000) return `${safeMilliseconds} ms`;
	const seconds = safeMilliseconds / 1000;
	if (seconds < 60) return `${seconds.toFixed(seconds >= 10 ? 1 : 2).replace(/\.0+$/, '')} s`;
	const minutes = Math.floor(seconds / 60);
	const remainder = Math.round(seconds % 60);
	return `${minutes} min ${remainder} s`;
}

export function formatDayMinute(totalMinutes: number): string {
	const safeMinutes = Math.max(0, Math.round(totalMinutes));
	const day = Math.floor(safeMinutes / MINUTES_PER_DAY);
	const hour = Math.floor((safeMinutes % MINUTES_PER_DAY) / 60);
	const minute = safeMinutes % 60;
	if (hour === 0 && minute === 0) return `Day ${day}`;
	return `Day ${day}, ${hour}:${String(minute).padStart(2, '0')}`;
}

export function sentenceCase(value: string): string {
	const normalized = value.replaceAll('-', ' ').replaceAll('_', ' ');
	return normalized ? normalized[0].toUpperCase() + normalized.slice(1) : '';
}
