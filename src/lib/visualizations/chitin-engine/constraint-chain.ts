import type { ConstraintChainState, Vec2 } from './types';

const EPSILON = 1e-7;
const MIN_LINK_LENGTH = 1e-4;
const MAX_LINK_LENGTH = 100_000;
const MAX_LINKS = 128;
const MAX_COORDINATE = 1_000_000;

export type ConstraintChainCreateOptions = Readonly<{
	direction?: Vec2;
	initialCurve?: number;
}>;

export type ConstraintChainStepOptions = Readonly<{
	deltaTime: number;
	maxDeltaTime?: number;
	acceleration?: Vec2;
	damping?: number;
	iterations?: number;
	maxVelocity?: number;
}>;

export type ConstraintChainStepResult = Readonly<{
	state: ConstraintChainState;
	deltaTime: number;
	iterations: number;
	maxLengthError: number;
}>;

function clamp(value: number, minimum: number, maximum: number): number {
	return Math.min(maximum, Math.max(minimum, value));
}

function finite(value: unknown, fallback: number): number {
	return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function coordinate(value: unknown, fallback: number): number {
	return clamp(finite(value, fallback), -MAX_COORDINATE, MAX_COORDINATE);
}

function boundedInteger(
	value: unknown,
	fallback: number,
	minimum: number,
	maximum: number
): number {
	return clamp(Math.round(finite(value, fallback)), minimum, maximum);
}

function unitDirection(value: Vec2 | undefined): Vec2 {
	const x = finite(value?.x, 1);
	const y = finite(value?.y, 0);
	const length = Math.hypot(x, y);
	return length > EPSILON ? { x: x / length, y: y / length } : { x: 1, y: 0 };
}

function sanitizedLengths(values: readonly number[]): number[] {
	return values
		.slice(0, MAX_LINKS)
		.map((value) => clamp(Math.abs(finite(value, 1)), MIN_LINK_LENGTH, MAX_LINK_LENGTH));
}

export function createConstraintChain(
	rootInput: Vec2,
	linkLengths: readonly number[],
	options: ConstraintChainCreateOptions = {}
): ConstraintChainState {
	const lengths = sanitizedLengths(linkLengths);
	const count = lengths.length + 1;
	const positions = new Float32Array(count * 2);
	const previous = new Float32Array(count * 2);
	const direction = unitDirection(options.direction);
	const normal = { x: -direction.y, y: direction.x };
	const curve = clamp(finite(options.initialCurve, 0), -1, 1);
	const root = {
		x: coordinate(rootInput.x, 0),
		y: coordinate(rootInput.y, 0)
	};
	positions[0] = previous[0] = root.x;
	positions[1] = previous[1] = root.y;

	let x = root.x;
	let y = root.y;
	for (let index = 0; index < lengths.length; index += 1) {
		const fraction = lengths.length <= 1 ? 0 : index / (lengths.length - 1);
		const angle = curve * (fraction - 0.5) * 0.8;
		const tangentX = direction.x * Math.cos(angle) + normal.x * Math.sin(angle);
		const tangentY = direction.y * Math.cos(angle) + normal.y * Math.sin(angle);
		x += tangentX * lengths[index];
		y += tangentY * lengths[index];
		positions[(index + 1) * 2] = previous[(index + 1) * 2] = coordinate(x, root.x);
		positions[(index + 1) * 2 + 1] = previous[(index + 1) * 2 + 1] = coordinate(y, root.y);
	}

	return {
		positions,
		previous,
		lengths: Float32Array.from(lengths),
		count
	};
}

export function cloneConstraintChain(state: ConstraintChainState): ConstraintChainState {
	return {
		positions: state.positions.slice(),
		previous: state.previous.slice(),
		lengths: state.lengths.slice(),
		count: state.count
	};
}

function assertStateShape(state: ConstraintChainState): void {
	if (
		!Number.isSafeInteger(state.count) ||
		state.count < 1 ||
		state.count > MAX_LINKS + 1 ||
		state.positions.length !== state.count * 2 ||
		state.previous.length !== state.count * 2 ||
		state.lengths.length !== state.count - 1
	) {
		throw new RangeError('Constraint-chain typed arrays do not match their declared node count.');
	}
}

function pinRoot(state: ConstraintChainState, root: Vec2, includePrevious: boolean): void {
	state.positions[0] = coordinate(root.x, state.positions[0]);
	state.positions[1] = coordinate(root.y, state.positions[1]);
	if (includePrevious) {
		state.previous[0] = state.positions[0];
		state.previous[1] = state.positions[1];
	}
}

function repairFiniteState(state: ConstraintChainState): void {
	for (let index = 0; index < state.count; index += 1) {
		const offset = index * 2;
		const fallbackX = index === 0 ? 0 : state.positions[offset - 2];
		const fallbackY = index === 0 ? 0 : state.positions[offset - 1];
		state.positions[offset] = coordinate(state.positions[offset], fallbackX);
		state.positions[offset + 1] = coordinate(state.positions[offset + 1], fallbackY);
		state.previous[offset] = coordinate(state.previous[offset], state.positions[offset]);
		state.previous[offset + 1] = coordinate(
			state.previous[offset + 1],
			state.positions[offset + 1]
		);
	}
	for (let index = 0; index < state.lengths.length; index += 1) {
		state.lengths[index] = clamp(
			Math.abs(finite(state.lengths[index], 1)),
			MIN_LINK_LENGTH,
			MAX_LINK_LENGTH
		);
	}
}

function solveDistanceConstraints(
	state: ConstraintChainState,
	root: Vec2,
	iterations: number
): void {
	for (let iteration = 0; iteration < iterations; iteration += 1) {
		pinRoot(state, root, false);
		for (let link = 0; link < state.lengths.length; link += 1) {
			const parentOffset = link * 2;
			const childOffset = parentOffset + 2;
			let dx = state.positions[childOffset] - state.positions[parentOffset];
			let dy = state.positions[childOffset + 1] - state.positions[parentOffset + 1];
			let actual = Math.hypot(dx, dy);
			const expected = state.lengths[link];

			if (!Number.isFinite(actual) || actual <= EPSILON) {
				const angle = (link + 1) * 2.399963229728653;
				dx = Math.cos(angle) * expected;
				dy = Math.sin(angle) * expected;
				state.positions[childOffset] = state.positions[parentOffset] + dx;
				state.positions[childOffset + 1] = state.positions[parentOffset + 1] + dy;
				actual = expected;
			}

			const difference = (actual - expected) / actual;
			if (link === 0) {
				state.positions[childOffset] -= dx * difference;
				state.positions[childOffset + 1] -= dy * difference;
			} else {
				const correctionX = dx * difference * 0.5;
				const correctionY = dy * difference * 0.5;
				state.positions[parentOffset] += correctionX;
				state.positions[parentOffset + 1] += correctionY;
				state.positions[childOffset] -= correctionX;
				state.positions[childOffset + 1] -= correctionY;
			}
		}
	}
	pinRoot(state, root, false);
}

export function constraintChainMaxLengthError(state: ConstraintChainState): number {
	assertStateShape(state);
	let maximum = 0;
	for (let link = 0; link < state.lengths.length; link += 1) {
		const offset = link * 2;
		const actual = Math.hypot(
			state.positions[offset + 2] - state.positions[offset],
			state.positions[offset + 3] - state.positions[offset + 1]
		);
		maximum = Math.max(maximum, Math.abs(actual - state.lengths[link]));
	}
	return maximum;
}

/**
 * Advances the chain in place. Delta time and relaxation work are capped so a
 * restored hidden tab cannot launch an antenna across the specimen chamber.
 */
export function stepConstraintChain(
	state: ConstraintChainState,
	rootInput: Vec2,
	options: ConstraintChainStepOptions
): ConstraintChainStepResult {
	assertStateShape(state);
	repairFiniteState(state);
	const root = {
		x: coordinate(rootInput.x, state.positions[0]),
		y: coordinate(rootInput.y, state.positions[1])
	};
	const maxDeltaTime = clamp(Math.abs(finite(options.maxDeltaTime, 1 / 30)), 1 / 1_000, 0.1);
	const deltaTime = clamp(Math.abs(finite(options.deltaTime, 0)), 0, maxDeltaTime);
	const iterations = boundedInteger(options.iterations, 8, 1, 32);
	const damping = clamp(finite(options.damping, 0.965), 0, 1);
	const acceleration = {
		x: clamp(finite(options.acceleration?.x, 0), -10_000, 10_000),
		y: clamp(finite(options.acceleration?.y, 0), -10_000, 10_000)
	};
	const maxVelocity = clamp(Math.abs(finite(options.maxVelocity, 100)), 0.01, 100_000);
	const maximumDisplacement = maxVelocity * Math.max(deltaTime, 1 / 1_000);

	pinRoot(state, root, true);
	for (let index = 1; index < state.count; index += 1) {
		const offset = index * 2;
		const currentX = state.positions[offset];
		const currentY = state.positions[offset + 1];
		let displacementX = (currentX - state.previous[offset]) * damping;
		let displacementY = (currentY - state.previous[offset + 1]) * damping;
		const displacement = Math.hypot(displacementX, displacementY);
		if (displacement > maximumDisplacement && displacement > EPSILON) {
			const scale = maximumDisplacement / displacement;
			displacementX *= scale;
			displacementY *= scale;
		}
		state.previous[offset] = currentX;
		state.previous[offset + 1] = currentY;
		state.positions[offset] = coordinate(
			currentX + displacementX + acceleration.x * deltaTime * deltaTime,
			currentX
		);
		state.positions[offset + 1] = coordinate(
			currentY + displacementY + acceleration.y * deltaTime * deltaTime,
			currentY
		);
	}

	solveDistanceConstraints(state, root, iterations);
	pinRoot(state, root, true);
	return {
		state,
		deltaTime,
		iterations,
		maxLengthError: constraintChainMaxLengthError(state)
	};
}
