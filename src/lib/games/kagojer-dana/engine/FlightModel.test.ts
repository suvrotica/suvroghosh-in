import { Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import type { FlightControlInput } from '../types';
import { FIXED_STEP_SECONDS } from './FixedStep';
import { FlightModel, createPlaneState, mechanicalEnergy } from './FlightModel';

const STILL_AIR = new Vector3();
const HANDS_OFF: FlightControlInput = { pitch: 0, roll: 0 };

function run(
	model: FlightModel,
	seconds: number,
	input: (time: number) => FlightControlInput = () => HANDS_OFF,
	wind: (time: number) => Vector3 = () => STILL_AIR
): { energies: number[]; stalled: boolean[] } {
	const steps = Math.round(seconds / FIXED_STEP_SECONDS);
	const energies: number[] = [];
	const stalled: boolean[] = [];
	for (let index = 1; index <= steps; index += 1) {
		const time = index * FIXED_STEP_SECONDS;
		const telemetry = model.step(input(time), wind(time), FIXED_STEP_SECONDS, time);
		energies.push(telemetry.mechanicalEnergy);
		stalled.push(telemetry.stalled);
	}
	return { energies, stalled };
}

describe('FlightModel', () => {
	it('launches near 9.5 m/s and settles into an unpowered still-air glide', () => {
		const model = new FlightModel({
			state: createPlaneState({ position: new Vector3(0, 180, 0) })
		});
		const start = model.state.position.clone();
		expect(model.state.groundVelocity.length()).toBeCloseTo(9.5, 10);

		run(model, 12);
		const horizontalDistance = Math.hypot(
			model.state.position.x - start.x,
			model.state.position.z - start.z
		);
		const heightLost = start.y - model.state.position.y;
		const averageSink = heightLost / 12;
		const glideRatio = horizontalDistance / heightLost;

		expect(averageSink).toBeGreaterThan(0.7);
		expect(averageSink).toBeLessThan(1.35);
		expect(glideRatio).toBeGreaterThan(6.5);
		expect(glideRatio).toBeLessThan(10.5);
		expect(model.telemetry.airspeed).toBeGreaterThan(7);
		expect(model.telemetry.airspeed).toBeLessThan(11);
	});

	it('loses mechanical energy in still air with no hidden thrust or hard speed clamp', () => {
		const model = new FlightModel({
			state: createPlaneState({ position: new Vector3(0, 160, 0) })
		});
		const initialEnergy = mechanicalEnergy(model.state, model.tuning);
		const { energies } = run(model, 10);
		const largestGain = Math.max(...energies) - initialEnergy;

		expect(energies.at(-1)).toBeLessThan(initialEnergy - 0.8);
		expect(largestGain).toBeLessThan(0.005);
	});

	it('trades altitude for speed in a dive without an arcade speed clamp', () => {
		const model = new FlightModel({
			state: createPlaneState({ position: new Vector3(0, 220, 0) })
		});
		const initialSpeed = model.state.groundVelocity.length();
		const initialHeight = model.state.position.y;
		run(model, 4, () => ({ pitch: -1, roll: 0 }));

		expect(model.telemetry.airspeed).toBeGreaterThan(initialSpeed + 7);
		expect(model.telemetry.airspeed).toBeLessThan(25);
		expect(model.state.position.y).toBeLessThan(initialHeight - 20);
	});

	it('produces a weak-control stall and recovers by dropping the nose', () => {
		const state = createPlaneState({
			position: new Vector3(0, 150, 0),
			launchSpeed: 4.8
		});
		const model = new FlightModel({ state });
		const result = run(model, 8);
		const firstStall = result.stalled.indexOf(true);
		const recoveredAfter = result.stalled.slice(firstStall + 1).includes(false);

		expect(firstStall).toBeGreaterThanOrEqual(0);
		expect(recoveredAfter).toBe(true);
		expect(model.telemetry.stalled).toBe(false);
		expect(model.telemetry.airspeed).toBeGreaterThan(model.tuning.recoverySpeed);
		expect(Math.abs(model.state.angularVelocity.z)).toBeLessThan(1.5);
	});

	it('uses apparent airspeed and lets a crosswind alter the ground track', () => {
		const still = new FlightModel({
			state: createPlaneState({ position: new Vector3(0, 140, 0) })
		});
		const crosswind = new FlightModel({
			state: createPlaneState({ position: new Vector3(0, 140, 0) })
		});
		const wind = new Vector3(4, 0, 0);
		crosswind.step(HANDS_OFF, wind, FIXED_STEP_SECONDS, FIXED_STEP_SECONDS);
		expect(crosswind.telemetry.airspeed).toBeGreaterThan(still.telemetry.airspeed + 0.5);
		run(still, 5);
		run(
			crosswind,
			5,
			() => HANDS_OFF,
			() => wind
		);

		expect(crosswind.state.position.x).toBeGreaterThan(still.state.position.x + 4);
		expect(crosswind.telemetry.wind.toArray()).toEqual([4, 0, 0]);
	});

	it('borrows rising air to climb but receives no supernatural lift control', () => {
		const still = new FlightModel({ state: createPlaneState({ position: new Vector3(0, 90, 0) }) });
		const thermal = new FlightModel({
			state: createPlaneState({ position: new Vector3(0, 90, 0) })
		});
		const risingAir = new Vector3(0, 4.2, 0);
		run(still, 6);
		run(
			thermal,
			6,
			() => HANDS_OFF,
			() => risingAir
		);

		expect(thermal.state.position.y).toBeGreaterThan(still.state.position.y + 14);
		expect(thermal.state.position.y).toBeGreaterThan(90);
	});

	it('cannot manufacture energy by repeatedly pitching', () => {
		const model = new FlightModel({
			state: createPlaneState({ position: new Vector3(0, 220, 0) })
		});
		const initialEnergy = mechanicalEnergy(model.state, model.tuning);
		const { energies } = run(model, 18, (time) => ({
			pitch: Math.sin(time * Math.PI * 0.8) >= 0 ? 1 : -1,
			roll: 0
		}));

		expect(energies.at(-1)).toBeLessThan(initialEnergy - 1);
		expect(Math.max(...energies)).toBeLessThan(initialEnergy + 0.01);
	});

	it('turns through banked lift and interpolates render state without mutation', () => {
		const model = new FlightModel({
			state: createPlaneState({ position: new Vector3(0, 120, 0) })
		});
		run(model, 2.5, () => ({ pitch: 0, roll: 0.65 }));
		const current = model.state.position.clone();
		const interpolated = model.getInterpolatedState(0.5);

		expect(Math.abs(model.state.position.x)).toBeGreaterThan(0.5);
		expect(interpolated.position.distanceTo(model.previousState.position)).toBeGreaterThan(0);
		expect(interpolated.position.distanceTo(model.state.position)).toBeGreaterThan(0);
		expect(model.state.position.toArray()).toEqual(current.toArray());
	});

	it('documents +Z model-forward through the initial orientation contract', () => {
		const orientation = new Quaternion();
		const state = createPlaneState({ orientation, launchSpeed: 10 });
		expect(state.groundVelocity.z).toBeGreaterThan(9.9);
		expect(state.position.y).toBe(60);
	});
});
