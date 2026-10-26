export type Mode = 'life' | 'ant' | 'diffusion' | 'walk';
export type Tool = 'pan' | 'paint' | 'erase' | 'stamp' | 'obstacle';
export interface Camera {
	x: number;
	y: number;
	zoom: number;
}
export interface Metric {
	label: string;
	value: number;
	unit?: string;
}

export const MODES = [
	{
		id: 'life',
		name: 'Game of Life',
		short: 'Life',
		index: '01',
		category: 'Cellular automata',
		rule: 'B3 / S23',
		heading: 'A world made of neighbours.',
		notice:
			'No cell knows the pattern. Each one counts its eight neighbours, then lives or dies. Find something that survives, oscillates, or travels.',
		chart: 'Living cells',
		unit: 'cells',
		rate: 12,
		presets: [
			['soup', 'Random garden'],
			['gun', 'Glider gun'],
			['glider', 'Travelling glider'],
			['pulsar', 'Pulsar'],
			['blinker', 'Blinker']
		]
	},
	{
		id: 'ant',
		name: 'Langton’s Ant',
		short: 'Ant',
		index: '02',
		category: 'Deterministic emergence',
		rule: 'TURN · FLIP · MOVE',
		heading: 'One rule. A very long story.',
		notice:
			'White: turn right. Black: turn left. Flip the square and move. The classic empty-grid ant eventually builds a repeating highway. This preset starts at step 11,000.',
		chart: 'Distinct cells visited',
		unit: 'cells',
		rate: 200,
		presets: [
			['highway', 'Reveal the highway'],
			['classic', 'The first step'],
			['mosaic', 'A different beginning']
		]
	},
	{
		id: 'diffusion',
		name: 'Diffusion',
		short: 'Diffusion',
		index: '03',
		category: 'Transport & mixing',
		rule: 'HIGH → LOW',
		heading: 'Watch a difference disappear.',
		notice:
			'Deposit a little dye and watch concentration even out. Walls reflect the flow. Without a source, the total dye stays constant while concentration variance falls.',
		chart: 'Concentration variance',
		unit: 'variance',
		rate: 24,
		presets: [
			['drop', 'A single drop'],
			['twin', 'Two drops'],
			['band', 'A concentration band']
		]
	},
	{
		id: 'walk',
		name: 'Random Walk',
		short: 'Walk',
		index: '04',
		category: 'Probability in motion',
		rule: 'N · E · S · W',
		heading: 'Chance leaves a signature.',
		notice:
			'Every walker chooses a direction independently. Individual paths wander; the ensemble spreads. The measured mean squared displacement fluctuates around the reference E[r²] = steps.',
		chart: 'Mean squared displacement',
		unit: 'cells²',
		rate: 24,
		presets: [
			['ensemble', 'An ensemble of walkers'],
			['single', 'Follow a single walker'],
			['bloom', 'A cloud of 600']
		]
	}
] as const;

export const SPEEDS = [0.25, 0.5, 1, 2, 4, 8, 16];

/** A display-independent clock. Excess catch-up is dropped, never queued forever. */
export class FixedClock {
	private accumulated = 0;
	clear() {
		this.accumulated = 0;
	}
	advance(milliseconds: number, stepsPerSecond: number, budget: number): number {
		if (!Number.isFinite(milliseconds) || milliseconds <= 0 || stepsPerSecond <= 0) return 0;
		this.accumulated += (Math.min(milliseconds, 100) * stepsPerSecond) / 1000;
		const due = Math.floor(this.accumulated + 1e-9);
		const steps = Math.min(due, budget);
		this.accumulated = Math.max(0, this.accumulated - due);
		return steps;
	}
}

export function cellSize(width: number, height: number, camera: Camera): number {
	return Math.min(width / 120, height / 84) * camera.zoom;
}

export function screenToWorld(x: number, y: number, width: number, height: number, camera: Camera) {
	const scale = cellSize(width, height, camera);
	return { x: (x - width / 2) / scale + camera.x, y: (y - height / 2) / scale + camera.y };
}

/** Zoom around a point without moving the world coordinate under the pointer. */
export function zoomAt(
	camera: Camera,
	factor: number,
	x: number,
	y: number,
	width: number,
	height: number
): Camera {
	const before = screenToWorld(x, y, width, height, camera);
	const next = { ...camera, zoom: Math.min(18, Math.max(0.15, camera.zoom * factor)) };
	const after = screenToWorld(x, y, width, height, next);
	next.x += before.x - after.x;
	next.y += before.y - after.y;
	return next;
}

export function formatNumber(value: number): string {
	if (!Number.isFinite(value)) return '—';
	return new Intl.NumberFormat('en-GB', {
		maximumFractionDigits: Number.isInteger(value) ? 0 : value < 1 ? 4 : 1
	}).format(value);
}
