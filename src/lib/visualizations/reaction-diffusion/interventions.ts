import { MAX_INTERVENTIONS } from './constants';
import { REACTION_DIFFUSION_SCHEMA_VERSION } from './types';
import type { BrushShape, BrushTarget, BrushTool, FieldState, Intervention } from './types';

const BRUSH_TOOLS = new Set<BrushTool>([
	'add-v',
	'add-u',
	'mixed-pulse',
	'restore-feed',
	'paint-obstacle',
	'erase-obstacle'
]);
const BRUSH_SHAPES = new Set<BrushShape>(['soft-disk', 'hard-disk', 'ring', 'line']);
const BRUSH_TARGETS = new Set<BrushTarget>(['both', 'a', 'b']);

function finite(value: number, name: string): void {
	if (!Number.isFinite(value)) throw new RangeError(`${name} must be finite.`);
}

export function assertValidIntervention(event: Readonly<Intervention>): void {
	if (event.schemaVersion !== REACTION_DIFFUSION_SCHEMA_VERSION) {
		throw new RangeError('Unsupported intervention schema version.');
	}
	if (!Number.isSafeInteger(event.sequence) || event.sequence < 0) {
		throw new RangeError('Intervention sequence must be a non-negative safe integer.');
	}
	if (!Number.isSafeInteger(event.step) || event.step < 0) {
		throw new RangeError('Intervention step must be a non-negative safe integer.');
	}
	for (const [name, point] of [
		['from', event.from],
		['to', event.to]
	] as const) {
		if (!Array.isArray(point) || point.length !== 2) {
			throw new TypeError(`${name} must be a two-coordinate point.`);
		}
		finite(point[0], `${name}.x`);
		finite(point[1], `${name}.y`);
		if (point[0] < 0 || point[0] > 1 || point[1] < 0 || point[1] > 1) {
			throw new RangeError(`${name} must lie inside normalized domain coordinates.`);
		}
	}
	finite(event.radius, 'Intervention radius');
	if (event.radius < 0 || event.radius > 2) throw new RangeError('Intervention radius is invalid.');
	if (event.kind === 'brush') {
		if (!BRUSH_TOOLS.has(event.tool)) throw new RangeError('Brush tool is not recognised.');
		if (!BRUSH_SHAPES.has(event.shape)) throw new RangeError('Brush shape is not recognised.');
		if (!BRUSH_TARGETS.has(event.target)) throw new RangeError('Brush target is not recognised.');
		finite(event.strength, 'Intervention strength');
		finite(event.falloff, 'Intervention falloff');
		if (Math.abs(event.strength) > 100 || event.falloff < 0 || event.falloff > 8) {
			throw new RangeError('Brush strength or falloff lies outside the supported range.');
		}
	} else if (event.kind === 'mask') {
		if (typeof event.active !== 'boolean') throw new TypeError('Mask activity must be boolean.');
	} else throw new RangeError('Intervention kind is not recognised.');
}

export function compareInterventions(a: Readonly<Intervention>, b: Readonly<Intervention>): number {
	return a.step - b.step || a.sequence - b.sequence;
}

export function orderedInterventions(events: readonly Readonly<Intervention>[]): Intervention[] {
	if (events.length > MAX_INTERVENTIONS) throw new RangeError('Intervention log is too long.');
	const sequences = new Set<number>();
	const copy = events.map((event) => {
		assertValidIntervention(event);
		if (sequences.has(event.sequence))
			throw new RangeError('Intervention sequence numbers must be unique.');
		sequences.add(event.sequence);
		return {
			...event,
			from: [event.from[0], event.from[1]],
			to: [event.to[0], event.to[1]]
		} as Intervention;
	});
	return copy.sort(compareInterventions);
}

export function shouldApplyIntervention(
	event: Readonly<Intervention>,
	target: BrushTarget
): boolean {
	if (event.kind === 'mask') return true;
	return event.target === 'both' || target === 'both' || event.target === target;
}

function distanceToSegment(
	x: number,
	y: number,
	ax: number,
	ay: number,
	bx: number,
	by: number
): number {
	const dx = bx - ax;
	const dy = by - ay;
	const lengthSquared = dx * dx + dy * dy;
	if (lengthSquared === 0) return Math.hypot(x - ax, y - ay);
	const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / lengthSquared));
	return Math.hypot(x - (ax + t * dx), y - (ay + t * dy));
}

function brushWeight(event: Readonly<Intervention>, x: number, y: number): number {
	const distance = distanceToSegment(x, y, event.from[0], event.from[1], event.to[0], event.to[1]);
	if (event.kind === 'mask') return distance <= event.radius ? 1 : 0;
	if (event.shape === 'ring') {
		const ringDistance = Math.abs(distance - event.radius * 0.72);
		const halfWidth = Math.max(event.radius * 0.28, 1e-12);
		return ringDistance < halfWidth
			? (1 - ringDistance / halfWidth) ** Math.max(1, event.falloff)
			: 0;
	}
	if (distance > event.radius) return 0;
	if (event.shape === 'hard-disk' || event.shape === 'line') return 1;
	if (event.radius === 0) return distance === 0 ? 1 : 0;
	return (1 - distance / event.radius) ** Math.max(0.25, event.falloff || 1);
}

/** Mutates field arrays deliberately; intervention values are never silently concentration-clamped. */
export function applyIntervention(
	state: FieldState,
	event: Readonly<Intervention>,
	target: BrushTarget = 'both'
): void {
	assertValidIntervention(event);
	if (!shouldApplyIntervention(event, target)) return;
	const size = state.size;
	for (let row = 0; row < size; row += 1) {
		const y = (row + 0.5) / size;
		for (let column = 0; column < size; column += 1) {
			const x = (column + 0.5) / size;
			const weight = brushWeight(event, x, y);
			if (weight <= 0) continue;
			const index = row * size + column;
			if (event.kind === 'mask') {
				state.mask[index] = event.active ? 1 : 0;
				state.u[index] = 1;
				state.v[index] = 0;
				continue;
			}
			if (event.tool === 'paint-obstacle' || event.tool === 'erase-obstacle') {
				state.mask[index] = event.tool === 'erase-obstacle' ? 1 : 0;
				state.u[index] = 1;
				state.v[index] = 0;
				continue;
			}
			if (!state.mask[index]) continue;
			const amount = event.strength * weight;
			switch (event.tool) {
				case 'add-v':
					// This finite intervention mirrors the one-for-one U → V conversion signs
					// in the Gray–Scott reaction term; it is intentionally not solver clamping.
					state.u[index] -= amount;
					state.v[index] += amount;
					break;
				case 'add-u':
					// Reverse transfer: adding feed species U dilutes/removes the same V amount.
					state.u[index] += amount;
					state.v[index] -= amount;
					break;
				case 'mixed-pulse':
					// A mixture injection is distinct from either one-for-one transfer.
					state.u[index] += amount / 2;
					state.v[index] += amount / 2;
					break;
				case 'restore-feed':
					state.u[index] += (1 - state.u[index]) * weight;
					state.v[index] += (0 - state.v[index]) * weight;
					break;
			}
		}
	}
}

export function serializeInterventions(events: readonly Readonly<Intervention>[]): string {
	return JSON.stringify(orderedInterventions(events));
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function parseInterventions(text: string): Intervention[] {
	if (text.length > 1_000_000) throw new RangeError('Intervention document is too large.');
	const value: unknown = JSON.parse(text);
	if (!Array.isArray(value)) throw new TypeError('Intervention document must contain an array.');
	const events = value.map((entry) => {
		if (!isRecord(entry) || (entry.kind !== 'brush' && entry.kind !== 'mask')) {
			throw new TypeError('Intervention document contains an invalid event.');
		}
		return entry as unknown as Intervention;
	});
	return orderedInterventions(events);
}
