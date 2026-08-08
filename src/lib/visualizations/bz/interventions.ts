import { BZ_MAX_INTERVENTIONS } from './constants';
import { assertValidBZFieldState } from './initial-conditions';
import { approximateHomogenization } from './metrics';
import { recoveredStateForSetup } from './reactions';
import { assertValidBZSetup } from './validation';
import type {
	BZFieldState,
	BZIntervention,
	BZSetup,
	InterventionApplyResult,
	ProbeReading,
	ReactionPair,
	RestoreIntervention
} from './types';
import { BZ_SCHEMA_VERSION } from './types';

const INTERVENTION_KINDS = new Set<BZIntervention['kind']>([
	'excite',
	'inhibit',
	'cut',
	'pacemaker',
	'obstacle',
	'restore',
	'mix',
	'probe'
]);

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function finite(value: number, name: string): void {
	if (!Number.isFinite(value)) throw new RangeError(`${name} must be finite.`);
}

function validatePoint(point: readonly [number, number], name: string): void {
	if (!Array.isArray(point) || point.length !== 2) {
		throw new TypeError(`${name} must contain two coordinates.`);
	}
	finite(point[0], `${name} x`);
	finite(point[1], `${name} y`);
	if (point[0] < 0 || point[0] > 1 || point[1] < 0 || point[1] > 1) {
		throw new RangeError(`${name} must lie in normalized [0, 1]² coordinates.`);
	}
}

function validateRadius(radius: number, name: string): void {
	finite(radius, name);
	if (radius < 0 || radius > 1) throw new RangeError(`${name} lies outside [0, 1].`);
}

export function assertValidBZIntervention(event: Readonly<BZIntervention>): void {
	if (!isRecord(event)) throw new TypeError('Intervention must be an object.');
	if (event.schemaVersion !== BZ_SCHEMA_VERSION) {
		throw new RangeError('Intervention schema version is unsupported.');
	}
	if (!Number.isSafeInteger(event.sequence) || event.sequence < 0) {
		throw new RangeError('Intervention sequence must be a non-negative safe integer.');
	}
	if (!Number.isSafeInteger(event.step) || event.step < 0) {
		throw new RangeError('Intervention step must be a non-negative safe integer.');
	}
	if (!INTERVENTION_KINDS.has(event.kind)) throw new RangeError('Intervention kind is unknown.');
	switch (event.kind) {
		case 'excite':
		case 'inhibit':
			validatePoint(event.center, 'Intervention center');
			validateRadius(event.radius, 'Intervention radius');
			finite(event.amount, 'Intervention amount');
			if (event.amount < 0 || event.amount > 100) {
				throw new RangeError('Intervention amount lies outside [0, 100].');
			}
			break;
		case 'cut':
			validatePoint(event.from, 'Cut start');
			validatePoint(event.to, 'Cut end');
			validateRadius(event.width, 'Cut width');
			finite(event.targetU, 'Cut target U');
			finite(event.targetV, 'Cut target V');
			finite(event.strength, 'Cut strength');
			if (
				Math.abs(event.targetU) > 10_000 ||
				Math.abs(event.targetV) > 10_000 ||
				event.strength < 0 ||
				event.strength > 1
			) {
				throw new RangeError('Cut targets or strength lie outside supported bounds.');
			}
			break;
		case 'pacemaker':
			validatePoint(event.center, 'Pacemaker center');
			validateRadius(event.radius, 'Pacemaker radius');
			finite(event.amount, 'Pacemaker amount');
			if (event.amount < 0 || event.amount > 100) {
				throw new RangeError('Pacemaker amount lies outside [0, 100].');
			}
			if (!Number.isSafeInteger(event.periodSteps) || event.periodSteps < 1) {
				throw new RangeError('Pacemaker period must be a positive number of steps.');
			}
			if (!Number.isSafeInteger(event.endStep) || event.endStep < event.step) {
				throw new RangeError('Pacemaker end step must not precede its start.');
			}
			break;
		case 'obstacle':
			validatePoint(event.from, 'Obstacle start');
			validatePoint(event.to, 'Obstacle end');
			validateRadius(event.radius, 'Obstacle radius');
			break;
		case 'restore':
			validatePoint(event.from, 'Restore start');
			validatePoint(event.to, 'Restore end');
			validateRadius(event.radius, 'Restore radius');
			if (event.initialization !== 'recovered' && event.initialization !== 'neighbor-mean') {
				throw new RangeError('Restore initialization rule is unknown.');
			}
			break;
		case 'mix':
			finite(event.fraction, 'Mix fraction');
			if (event.fraction < 0 || event.fraction > 1) {
				throw new RangeError('Mix fraction lies outside [0, 1].');
			}
			break;
		case 'probe':
			validatePoint(event.point, 'Probe point');
			break;
	}
}

export function compareBZInterventions(
	a: Readonly<BZIntervention>,
	b: Readonly<BZIntervention>
): number {
	return a.step - b.step || a.sequence - b.sequence;
}

function cloneIntervention(event: Readonly<BZIntervention>): BZIntervention {
	switch (event.kind) {
		case 'excite':
		case 'inhibit':
		case 'pacemaker':
			return { ...event, center: [event.center[0], event.center[1]] };
		case 'cut':
		case 'obstacle':
		case 'restore':
			return {
				...event,
				from: [event.from[0], event.from[1]],
				to: [event.to[0], event.to[1]]
			};
		case 'probe':
			return { ...event, point: [event.point[0], event.point[1]] };
		case 'mix':
			return { ...event };
	}
}

export function orderedBZInterventions(
	events: readonly Readonly<BZIntervention>[]
): BZIntervention[] {
	if (events.length > BZ_MAX_INTERVENTIONS) throw new RangeError('Intervention log is too long.');
	const sequences = new Set<number>();
	const copy = events.map((event) => {
		assertValidBZIntervention(event);
		if (sequences.has(event.sequence)) {
			throw new RangeError('Intervention sequence numbers must be unique.');
		}
		sequences.add(event.sequence);
		return cloneIntervention(event);
	});
	return copy.sort(compareBZInterventions);
}

function distanceToSegment(
	x: number,
	y: number,
	from: readonly [number, number],
	to: readonly [number, number]
): number {
	const dx = to[0] - from[0];
	const dy = to[1] - from[1];
	const lengthSquared = dx * dx + dy * dy;
	if (lengthSquared === 0) return Math.hypot(x - from[0], y - from[1]);
	const position = Math.max(
		0,
		Math.min(1, ((x - from[0]) * dx + (y - from[1]) * dy) / lengthSquared)
	);
	return Math.hypot(x - (from[0] + position * dx), y - (from[1] + position * dy));
}

function radialWeight(
	x: number,
	y: number,
	center: readonly [number, number],
	radius: number,
	cellWidth: number
): number {
	const distance = Math.hypot(x - center[0], y - center[1]);
	if (radius === 0) return distance <= cellWidth * Math.SQRT1_2 ? 1 : 0;
	return distance < radius ? 1 - distance / radius : 0;
}

function cellPoint(row: number, column: number, size: number): readonly [number, number] {
	return [(column + 0.5) / size, (row + 0.5) / size];
}

function probeState(state: Readonly<BZFieldState>, point: readonly [number, number]): ProbeReading {
	const column = Math.min(state.size - 1, Math.floor(point[0] * state.size));
	const row = Math.min(state.size - 1, Math.floor(point[1] * state.size));
	const index = row * state.size + column;
	const active = Boolean(state.mask[index]);
	return {
		row,
		column,
		index,
		active,
		u: active ? state.u[index] : null,
		v: active ? state.v[index] : null
	};
}

function restoreValue(
	state: Readonly<BZFieldState>,
	setup: Readonly<BZSetup>,
	row: number,
	column: number,
	rule: RestoreIntervention['initialization'],
	fallback: ReactionPair
): ReactionPair {
	if (rule === 'recovered') return fallback;
	let sumU = 0;
	let sumV = 0;
	let count = 0;
	for (const [rowOffset, columnOffset] of [
		[-1, 0],
		[1, 0],
		[0, -1],
		[0, 1]
	] as const) {
		let nextRow = row + rowOffset;
		let nextColumn = column + columnOffset;
		if (nextRow < 0 || nextRow >= state.size || nextColumn < 0 || nextColumn >= state.size) {
			if (setup.boundary === 'no-flux') continue;
			nextRow = (nextRow + state.size) % state.size;
			nextColumn = (nextColumn + state.size) % state.size;
		}
		const nextIndex = nextRow * state.size + nextColumn;
		if (!state.mask[nextIndex]) continue;
		sumU += state.u[nextIndex];
		sumV += state.v[nextIndex];
		count += 1;
	}
	return count > 0 ? { u: sumU / count, v: sumV / count } : fallback;
}

export function applyBZIntervention(
	state: BZFieldState,
	setup: Readonly<BZSetup>,
	event: Readonly<BZIntervention>
): InterventionApplyResult {
	assertValidBZFieldState(state);
	assertValidBZSetup(setup);
	assertValidBZIntervention(event);
	if (state.size !== setup.gridSize) throw new RangeError('Field and setup grid sizes differ.');
	if (event.kind === 'probe') {
		return { mutated: false, affectedCells: 0, probe: probeState(state, event.point) };
	}
	if (event.kind === 'mix') {
		const reading = approximateHomogenization(state, event.fraction);
		return {
			mutated: event.fraction > 0 && (reading.before.varianceU > 0 || reading.before.varianceV > 0),
			affectedCells: reading.before.activeCells,
			probe: null
		};
	}
	const cellWidth = 1 / state.size;
	let affectedCells = 0;
	if (event.kind === 'restore') {
		const recovered = recoveredStateForSetup(setup);
		const restored: Array<{ index: number; value: ReactionPair }> = [];
		for (let row = 0; row < state.size; row += 1) {
			for (let column = 0; column < state.size; column += 1) {
				const index = row * state.size + column;
				if (!state.domainMask[index] || state.mask[index]) continue;
				const point = cellPoint(row, column, state.size);
				if (distanceToSegment(point[0], point[1], event.from, event.to) > event.radius) continue;
				restored.push({
					index,
					value: restoreValue(state, setup, row, column, event.initialization, recovered)
				});
			}
		}
		for (const entry of restored) {
			state.u[entry.index] = entry.value.u;
			state.v[entry.index] = entry.value.v;
			state.mask[entry.index] = 1;
		}
		return { mutated: restored.length > 0, affectedCells: restored.length, probe: null };
	}
	for (let row = 0; row < state.size; row += 1) {
		for (let column = 0; column < state.size; column += 1) {
			const index = row * state.size + column;
			const point = cellPoint(row, column, state.size);
			if (event.kind === 'obstacle') {
				if (
					state.mask[index] &&
					distanceToSegment(point[0], point[1], event.from, event.to) <= event.radius
				) {
					state.mask[index] = 0;
					affectedCells += 1;
				}
				continue;
			}
			if (!state.mask[index]) continue;
			if (event.kind === 'cut') {
				if (distanceToSegment(point[0], point[1], event.from, event.to) <= event.width) {
					state.u[index] += (event.targetU - state.u[index]) * event.strength;
					state.v[index] += (event.targetV - state.v[index]) * event.strength;
					affectedCells += 1;
				}
				continue;
			}
			const weight = radialWeight(point[0], point[1], event.center, event.radius, cellWidth);
			if (weight <= 0) continue;
			if (event.kind === 'excite' || event.kind === 'pacemaker') {
				state.u[index] += event.amount * weight;
			} else {
				state.u[index] -= event.amount * weight * 0.5;
				state.v[index] += event.amount * weight;
			}
			affectedCells += 1;
		}
	}
	return { mutated: affectedCells > 0, affectedCells, probe: null };
}

export function interventionAppliesAtStep(event: Readonly<BZIntervention>, step: number): boolean {
	if (!Number.isSafeInteger(step) || step < 0) throw new RangeError('Current step is invalid.');
	if (event.kind !== 'pacemaker') return event.step === step;
	return (
		step >= event.step && step <= event.endStep && (step - event.step) % event.periodSteps === 0
	);
}

export function applyInterventionsAtStep(
	state: BZFieldState,
	setup: Readonly<BZSetup>,
	events: readonly Readonly<BZIntervention>[],
	step: number
): readonly InterventionApplyResult[] {
	const results: InterventionApplyResult[] = [];
	for (const event of events) {
		assertValidBZIntervention(event);
		if (interventionAppliesAtStep(event, step)) {
			results.push(applyBZIntervention(state, setup, event));
		}
	}
	return results;
}

export function serializeBZInterventions(events: readonly Readonly<BZIntervention>[]): string {
	return JSON.stringify(orderedBZInterventions(events));
}

export function parseBZInterventions(text: string): BZIntervention[] {
	if (text.length > 1_000_000) throw new RangeError('Intervention document is too large.');
	const parsed: unknown = JSON.parse(text);
	if (!Array.isArray(parsed)) throw new TypeError('Intervention document must contain an array.');
	const events = parsed.map((entry) => {
		if (!isRecord(entry) || typeof entry.kind !== 'string') {
			throw new TypeError('Intervention document contains an invalid event.');
		}
		return entry as unknown as BZIntervention;
	});
	return orderedBZInterventions(events);
}
