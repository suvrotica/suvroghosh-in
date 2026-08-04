import type { BoundaryCondition, ParticleArrays, RectangleBounds } from './types';

export function validateRectangleBounds(bounds: RectangleBounds): void {
	if (
		!Number.isFinite(bounds.minX) ||
		!Number.isFinite(bounds.maxX) ||
		!Number.isFinite(bounds.minY) ||
		!Number.isFinite(bounds.maxY) ||
		bounds.maxX <= bounds.minX ||
		bounds.maxY <= bounds.minY
	) {
		throw new RangeError(
			'Boundary bounds must be finite rectangles with positive width and height.'
		);
	}
}

export function validateBoundaryCondition(boundary: BoundaryCondition): void {
	if (boundary.mode !== 'unbounded') validateRectangleBounds(boundary.bounds);
}

function positiveModulo(value: number, modulus: number): number {
	return ((value % modulus) + modulus) % modulus;
}

export interface ReflectedCoordinate {
	readonly value: number;
	/** Multiplier for a velocity or directed increment after the reflection. */
	readonly direction: 1 | -1;
}

/** Fold any finite coordinate through arbitrarily many wall crossings. */
export function reflectCoordinate(value: number, minimum: number, maximum: number): number {
	return reflectCoordinateWithDirection(value, minimum, maximum).value;
}

/** Reflect a coordinate and report whether an odd number of wall crossings reversed it. */
export function reflectCoordinateWithDirection(
	value: number,
	minimum: number,
	maximum: number
): ReflectedCoordinate {
	if (!Number.isFinite(value) || !Number.isFinite(minimum) || !Number.isFinite(maximum)) {
		throw new RangeError('Reflection requires finite coordinates and bounds.');
	}
	const width = maximum - minimum;
	if (width <= 0) throw new RangeError('Reflection bounds must have positive width.');
	const folded = positiveModulo(value - minimum, width * 2);
	return folded < width
		? { value: minimum + folded, direction: 1 }
		: { value: maximum - (folded - width), direction: -1 };
}

/** Wrap into the half-open interval [minimum, maximum). */
export function wrapCoordinate(value: number, minimum: number, maximum: number): number {
	if (!Number.isFinite(value) || !Number.isFinite(minimum) || !Number.isFinite(maximum)) {
		throw new RangeError('Wrapping requires finite coordinates and bounds.');
	}
	if (maximum <= minimum) throw new RangeError('Wrapping bounds must have positive width.');
	return minimum + positiveModulo(value - minimum, maximum - minimum);
}

function clamp(value: number, minimum: number, maximum: number): number {
	return Math.max(minimum, Math.min(maximum, value));
}

/**
 * Resolve one particle's display coordinates from its unwrapped coordinates.
 * The unwrapped arrays are deliberately never modified here.
 */
export function applyBoundaryToParticle(
	state: ParticleArrays,
	index: number,
	boundary: BoundaryCondition
): void {
	if (!Number.isSafeInteger(index) || index < 0 || index >= state.count) {
		throw new RangeError('Particle boundary index is outside the state arrays.');
	}
	const unwrappedX = state.unwrappedX[index];
	const unwrappedY = state.unwrappedY[index];
	if (!Number.isFinite(unwrappedX) || !Number.isFinite(unwrappedY)) {
		throw new RangeError('Particle coordinates must remain finite.');
	}

	if (boundary.mode === 'unbounded') {
		state.x[index] = unwrappedX;
		state.y[index] = unwrappedY;
		return;
	}

	const { minX, maxX, minY, maxY } = boundary.bounds;
	if (boundary.mode === 'reflecting') {
		state.x[index] = reflectCoordinate(unwrappedX, minX, maxX);
		state.y[index] = reflectCoordinate(unwrappedY, minY, maxY);
		return;
	}
	if (boundary.mode === 'periodic') {
		state.x[index] = wrapCoordinate(unwrappedX, minX, maxX);
		state.y[index] = wrapCoordinate(unwrappedY, minY, maxY);
		return;
	}

	const inside =
		unwrappedX >= minX && unwrappedX <= maxX && unwrappedY >= minY && unwrappedY <= maxY;
	state.x[index] = clamp(unwrappedX, minX, maxX);
	state.y[index] = clamp(unwrappedY, minY, maxY);
	if (!inside) state.alive[index] = 0;
}

export interface ParticleMoveResult {
	readonly reflectedX: 1 | -1;
	readonly reflectedY: 1 | -1;
	readonly absorbed: boolean;
}

/**
 * Advance a particle by a physical displacement. Periodic statistics retain the
 * unconstrained displacement, while reflecting dynamics continue from the
 * reflected display point instead of from a clamped or out-of-domain point.
 */
export function moveParticleBy(
	state: ParticleArrays,
	index: number,
	deltaX: number,
	deltaY: number,
	boundary: BoundaryCondition
): ParticleMoveResult {
	if (!Number.isSafeInteger(index) || index < 0 || index >= state.count) {
		throw new RangeError('Particle move index is outside the state arrays.');
	}
	if (!Number.isFinite(deltaX) || !Number.isFinite(deltaY)) {
		throw new RangeError('Particle displacements must remain finite.');
	}

	state.unwrappedX[index] += deltaX;
	state.unwrappedY[index] += deltaY;
	if (boundary.mode === 'unbounded') {
		state.x[index] += deltaX;
		state.y[index] += deltaY;
		return { reflectedX: 1, reflectedY: 1, absorbed: false };
	}

	const { minX, maxX, minY, maxY } = boundary.bounds;
	if (boundary.mode === 'periodic') {
		state.x[index] = wrapCoordinate(state.unwrappedX[index], minX, maxX);
		state.y[index] = wrapCoordinate(state.unwrappedY[index], minY, maxY);
		return { reflectedX: 1, reflectedY: 1, absorbed: false };
	}

	const proposedX = state.x[index] + deltaX;
	const proposedY = state.y[index] + deltaY;
	if (boundary.mode === 'reflecting') {
		const x = reflectCoordinateWithDirection(proposedX, minX, maxX);
		const y = reflectCoordinateWithDirection(proposedY, minY, maxY);
		state.x[index] = x.value;
		state.y[index] = y.value;
		return { reflectedX: x.direction, reflectedY: y.direction, absorbed: false };
	}

	const inside = proposedX >= minX && proposedX <= maxX && proposedY >= minY && proposedY <= maxY;
	state.x[index] = clamp(proposedX, minX, maxX);
	state.y[index] = clamp(proposedY, minY, maxY);
	if (!inside) state.alive[index] = 0;
	return { reflectedX: 1, reflectedY: 1, absorbed: !inside };
}
