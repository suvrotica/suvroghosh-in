import { add3, clone3, multiplyAdd3, scale3, type Vec3 } from './vector';
import { orthonormalizeFrame, type LocalFrame } from './transported-frame';

export interface LocalFrameOdeState extends LocalFrame {
	center: Vec3;
	scale: number;
}

export interface LocalFrameOdeSample extends LocalFrameOdeState {
	age: number;
}

export type LocalFrameOdeLaw = (age: number, state: Readonly<LocalFrameOdeState>) => number;

export interface LocalFrameOdeLaws {
	speed: LocalFrameOdeLaw;
	growthRate: LocalFrameOdeLaw;
	curvature1: LocalFrameOdeLaw;
	curvature2: LocalFrameOdeLaw;
	twistRate: LocalFrameOdeLaw;
}

interface StateDerivative {
	center: Vec3;
	tangent: Vec3;
	e1: Vec3;
	e2: Vec3;
	scale: number;
}

function derivative(
	age: number,
	state: LocalFrameOdeState,
	laws: LocalFrameOdeLaws
): StateDerivative {
	const speed = laws.speed(age, state);
	const growth = laws.growthRate(age, state);
	const curvature1 = laws.curvature1(age, state);
	const curvature2 = laws.curvature2(age, state);
	const twist = laws.twistRate(age, state);
	if (![speed, growth, curvature1, curvature2, twist].every(Number.isFinite)) {
		throw new Error(`Non-finite local-frame ODE law at age ${age}.`);
	}
	return {
		center: scale3(state.tangent, speed),
		tangent: add3(scale3(state.e1, curvature1), scale3(state.e2, curvature2)),
		e1: add3(scale3(state.tangent, -curvature1), scale3(state.e2, twist)),
		e2: add3(scale3(state.tangent, -curvature2), scale3(state.e1, -twist)),
		scale: growth * state.scale
	};
}

function offsetState(
	state: LocalFrameOdeState,
	stateDerivative: StateDerivative,
	step: number
): LocalFrameOdeState {
	return {
		center: multiplyAdd3(state.center, stateDerivative.center, step),
		tangent: multiplyAdd3(state.tangent, stateDerivative.tangent, step),
		e1: multiplyAdd3(state.e1, stateDerivative.e1, step),
		e2: multiplyAdd3(state.e2, stateDerivative.e2, step),
		scale: state.scale + stateDerivative.scale * step
	};
}

function combineStep(
	state: LocalFrameOdeState,
	k1: StateDerivative,
	k2: StateDerivative,
	k3: StateDerivative,
	k4: StateDerivative,
	step: number
): LocalFrameOdeState {
	const combineVector = (base: Vec3, a: Vec3, b: Vec3, c: Vec3, d: Vec3): Vec3 => ({
		x: base.x + (step / 6) * (a.x + 2 * b.x + 2 * c.x + d.x),
		y: base.y + (step / 6) * (a.y + 2 * b.y + 2 * c.y + d.y),
		z: base.z + (step / 6) * (a.z + 2 * b.z + 2 * c.z + d.z)
	});
	const frame = orthonormalizeFrame({
		tangent: combineVector(state.tangent, k1.tangent, k2.tangent, k3.tangent, k4.tangent),
		e1: combineVector(state.e1, k1.e1, k2.e1, k3.e1, k4.e1),
		e2: combineVector(state.e2, k1.e2, k2.e2, k3.e2, k4.e2)
	});
	const nextScale = state.scale + (step / 6) * (k1.scale + 2 * k2.scale + 2 * k3.scale + k4.scale);
	return {
		center: combineVector(state.center, k1.center, k2.center, k3.center, k4.center),
		...frame,
		scale: Math.max(1e-12, nextScale)
	};
}

export function rk4LocalFrameStep(
	state: LocalFrameOdeState,
	age: number,
	step: number,
	laws: LocalFrameOdeLaws
): LocalFrameOdeState {
	if (!(step > 0) || !Number.isFinite(step))
		throw new RangeError('RK4 step must be finite and positive.');
	const k1 = derivative(age, state, laws);
	const k2State = offsetState(state, k1, step / 2);
	const k2 = derivative(age + step / 2, k2State, laws);
	const k3State = offsetState(state, k2, step / 2);
	const k3 = derivative(age + step / 2, k3State, laws);
	const k4State = offsetState(state, k3, step);
	const k4 = derivative(age + step, k4State, laws);
	return combineStep(state, k1, k2, k3, k4, step);
}

export function integrateLocalFrame(
	initialState: LocalFrameOdeState,
	laws: LocalFrameOdeLaws,
	sampleCount: number
): LocalFrameOdeSample[] {
	if (!Number.isInteger(sampleCount) || sampleCount < 2) {
		throw new RangeError('A local-frame history needs at least two samples.');
	}
	const initialFrame = orthonormalizeFrame(initialState);
	let state: LocalFrameOdeState = {
		center: clone3(initialState.center),
		...initialFrame,
		scale: Math.max(1e-12, initialState.scale)
	};
	const samples: LocalFrameOdeSample[] = [{ ...state, age: 0 }];
	const step = 1 / (sampleCount - 1);
	for (let index = 1; index < sampleCount; index += 1) {
		state = rk4LocalFrameStep(state, (index - 1) * step, step, laws);
		samples.push({
			center: clone3(state.center),
			tangent: clone3(state.tangent),
			e1: clone3(state.e1),
			e2: clone3(state.e2),
			scale: state.scale,
			age: index / (sampleCount - 1)
		});
	}
	return samples;
}

export function constantOdeLaw(value: number): LocalFrameOdeLaw {
	return () => value;
}
