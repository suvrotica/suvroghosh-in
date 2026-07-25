const GRID_TOLERANCE = 1e-9;

export function clamp(value: number, minimum: number, maximum: number): number {
	return Math.min(maximum, Math.max(minimum, value));
}

export function assertFinite(value: number, label: string): number {
	if (!Number.isFinite(value)) throw new RangeError(`${label} must be finite.`);
	return value;
}

export function simulationStepCount(durationMs: number, dtMs: number): number {
	assertFinite(durationMs, 'Experiment duration');
	assertFinite(dtMs, 'Time step');
	if (durationMs <= 0) throw new RangeError('Experiment duration must be greater than zero.');
	if (dtMs <= 0) throw new RangeError('Time step must be greater than zero.');
	const exact = durationMs / dtMs;
	const rounded = Math.round(exact);
	if (Math.abs(exact - rounded) > GRID_TOLERANCE * Math.max(1, exact)) {
		throw new RangeError('Experiment duration must contain an integer number of fixed time steps.');
	}
	return rounded;
}

export function millisecondsToGridIndex(timeMs: number, dtMs: number): number {
	assertFinite(timeMs, 'Time');
	assertFinite(dtMs, 'Time step');
	const exact = timeMs / dtMs;
	const rounded = Math.round(exact);
	if (Math.abs(exact - rounded) > GRID_TOLERANCE * Math.max(1, Math.abs(exact))) {
		throw new RangeError(`${timeMs} ms does not fall on the ${dtMs} ms simulation grid.`);
	}
	return rounded;
}

export function displaySampleStride(dtMs: number, intervalMs: number): number {
	const stride = simulationStepCount(intervalMs, dtMs);
	return Math.max(1, stride);
}

export function picoampFromNanoSiemensMillivolts(conductanceNs: number, voltageMv: number): number {
	return conductanceNs * voltageMv;
}

export function nanoCoulombsToCoulombs(chargeNc: number): number {
	return chargeNc * 1e-9;
}
