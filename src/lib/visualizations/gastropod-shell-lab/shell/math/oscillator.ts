export interface ReducedOscillatorParameters {
	naturalFrequency: number;
	dampingRatio: number;
	forcing: (age: number) => number;
	initialPosition?: number;
	initialVelocity?: number;
}

export interface OscillatorSample {
	age: number;
	position: number;
	velocity: number;
}

/** Deterministic RK4 integration of q'' + 2 ζω₀ q' + ω₀²q = F(τ). */
export function integrateReducedOscillator(
	parameters: ReducedOscillatorParameters,
	sampleCount: number
): OscillatorSample[] {
	if (!Number.isInteger(sampleCount) || sampleCount < 2) {
		throw new RangeError('Oscillator history needs at least two samples.');
	}
	const frequency = Math.max(0, parameters.naturalFrequency);
	const damping = Math.max(0, parameters.dampingRatio);
	const step = 1 / (sampleCount - 1);
	let position = parameters.initialPosition ?? 0;
	let velocity = parameters.initialVelocity ?? 0;
	const acceleration = (age: number, q: number, qVelocity: number): number =>
		parameters.forcing(age) - 2 * damping * frequency * qVelocity - frequency * frequency * q;
	const output: OscillatorSample[] = [{ age: 0, position, velocity }];
	for (let index = 1; index < sampleCount; index += 1) {
		const age = (index - 1) * step;
		const k1Q = velocity;
		const k1V = acceleration(age, position, velocity);
		const k2Q = velocity + (step * k1V) / 2;
		const k2V = acceleration(
			age + step / 2,
			position + (step * k1Q) / 2,
			velocity + (step * k1V) / 2
		);
		const k3Q = velocity + (step * k2V) / 2;
		const k3V = acceleration(
			age + step / 2,
			position + (step * k2Q) / 2,
			velocity + (step * k2V) / 2
		);
		const k4Q = velocity + step * k3V;
		const k4V = acceleration(age + step, position + step * k3Q, velocity + step * k3V);
		position += (step / 6) * (k1Q + 2 * k2Q + 2 * k3Q + k4Q);
		velocity += (step / 6) * (k1V + 2 * k2V + 2 * k3V + k4V);
		if (!Number.isFinite(position) || !Number.isFinite(velocity)) {
			throw new Error(`Reduced oscillator became non-finite at sample ${index}.`);
		}
		output.push({ age: index / (sampleCount - 1), position, velocity });
	}
	return output;
}
