import {
	AVOGADRO_CONSTANT_PER_MOL,
	DEFAULT_DELTA_G_ATP_KJ_PER_MOL,
	DELTA_G_ATP_RANGE_KJ_PER_MOL,
	FARADAY_CONSTANT_C_PER_MOL,
	HH_ENERGY_CAVEAT,
	REDUCED_MODEL_ENERGY_REASON,
	SODIUM_IONS_PER_ATP
} from './constants';
import type { HodgkinHuxleyEnergyEstimate, ModelId, UnavailableBiologicalEnergy } from './types';
import { nanoCoulombsToCoulombs } from './units';

export function inwardSodiumCurrentUaPerCm2(sodiumCurrentUaPerCm2: number): number {
	if (!Number.isFinite(sodiumCurrentUaPerCm2)) {
		throw new RangeError('Sodium current must be finite.');
	}
	return Math.max(-sodiumCurrentUaPerCm2, 0);
}

/**
 * Outward-positive current in µA/cm² integrated over milliseconds yields nC/cm².
 */
export function integrateInwardSodiumStep(
	previousSodiumCurrentUaPerCm2: number,
	nextSodiumCurrentUaPerCm2: number,
	dtMs: number
): number {
	if (!Number.isFinite(dtMs) || dtMs <= 0) throw new RangeError('Energy step must be positive.');
	return (
		((inwardSodiumCurrentUaPerCm2(previousSodiumCurrentUaPerCm2) +
			inwardSodiumCurrentUaPerCm2(nextSodiumCurrentUaPerCm2)) /
			2) *
		dtMs
	);
}

export function integrateInwardSodiumTrace(
	sodiumCurrentUaPerCm2: ArrayLike<number>,
	dtMs: number
): number {
	if (sodiumCurrentUaPerCm2.length < 2) return 0;
	let charge = 0;
	for (let index = 1; index < sodiumCurrentUaPerCm2.length; index += 1) {
		charge += integrateInwardSodiumStep(
			sodiumCurrentUaPerCm2[index - 1],
			sodiumCurrentUaPerCm2[index],
			dtMs
		);
	}
	return charge;
}

export function calculateHodgkinHuxleyEnergyEstimate(
	rawInwardSodiumChargeNcPerCm2: number,
	baselineInwardSodiumChargeNcPerCm2: number,
	assumedDeltaGAtpKjPerMol = DEFAULT_DELTA_G_ATP_KJ_PER_MOL
): HodgkinHuxleyEnergyEstimate {
	if (
		!Number.isFinite(rawInwardSodiumChargeNcPerCm2) ||
		rawInwardSodiumChargeNcPerCm2 < 0 ||
		!Number.isFinite(baselineInwardSodiumChargeNcPerCm2) ||
		baselineInwardSodiumChargeNcPerCm2 < 0
	) {
		throw new RangeError('Sodium charge estimates must be finite and nonnegative.');
	}
	if (
		!Number.isFinite(assumedDeltaGAtpKjPerMol) ||
		assumedDeltaGAtpKjPerMol < DELTA_G_ATP_RANGE_KJ_PER_MOL[0] ||
		assumedDeltaGAtpKjPerMol > DELTA_G_ATP_RANGE_KJ_PER_MOL[1]
	) {
		throw new RangeError('Assumed ATP free energy must be within [45, 60] kJ/mol.');
	}
	const excessInwardSodiumChargeNcPerCm2 = Math.max(
		rawInwardSodiumChargeNcPerCm2 - baselineInwardSodiumChargeNcPerCm2,
		0
	);
	const atpEquivalentMolesPerCm2 =
		nanoCoulombsToCoulombs(excessInwardSodiumChargeNcPerCm2) /
		(SODIUM_IONS_PER_ATP * FARADAY_CONSTANT_C_PER_MOL);
	const atpEquivalentMoleculesPerCm2 = atpEquivalentMolesPerCm2 * AVOGADRO_CONSTANT_PER_MOL;
	return {
		available: true,
		rawInwardSodiumChargeNcPerCm2,
		baselineInwardSodiumChargeNcPerCm2,
		excessInwardSodiumChargeNcPerCm2,
		atpEquivalentMolesPerCm2,
		atpEquivalentMoleculesPerCm2,
		assumedDeltaGAtpKjPerMol,
		chemicalWorkJoulesPerCm2: atpEquivalentMolesPerCm2 * assumedDeltaGAtpKjPerMol * 1_000,
		caveat: HH_ENERGY_CAVEAT
	};
}

export function unavailableBiologicalEnergy(
	modelId: Exclude<ModelId, 'hodgkin-huxley'>
): UnavailableBiologicalEnergy {
	void modelId;
	return { available: false, reason: REDUCED_MODEL_ENERGY_REASON };
}
