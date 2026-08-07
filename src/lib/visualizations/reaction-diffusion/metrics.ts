import { gridSpacing } from './constants';
import { computeGrayScottRhsInto } from './engine';
import { assertValidFieldState } from './initial';
import { assertValidSetup } from './setup';
import { fivePointLaplacianAt, fivePointLaplacianAtUnchecked, sampleNeighbors } from './stencil';
import type {
	ChemicalBudget,
	FieldMetrics,
	FieldState,
	GrayScottSetup,
	LocalTermLedger
} from './types';

interface BudgetRates {
	meanU: number;
	meanV: number;
	autocatalysisU: number;
	feedU: number;
	diffusionU: number;
	autocatalysisV: number;
	feedRemovalV: number;
	killV: number;
	diffusionV: number;
}

export function calculateFieldMetrics(state: Readonly<FieldState>): FieldMetrics {
	assertValidFieldState(state);
	let activeCells = 0;
	let sumU = 0;
	let sumV = 0;
	let sumV2 = 0;
	let sumReaction = 0;
	let minimumU = Number.POSITIVE_INFINITY;
	let maximumU = Number.NEGATIVE_INFINITY;
	let minimumV = Number.POSITIVE_INFINITY;
	let maximumV = Number.NEGATIVE_INFINITY;
	for (let index = 0; index < state.u.length; index += 1) {
		if (!state.mask[index]) continue;
		const u = state.u[index];
		const v = state.v[index];
		if (!Number.isFinite(u) || !Number.isFinite(v))
			throw new RangeError('Metrics require finite fields.');
		activeCells += 1;
		sumU += u;
		sumV += v;
		sumV2 += v * v;
		sumReaction += u * v * v;
		minimumU = Math.min(minimumU, u);
		maximumU = Math.max(maximumU, u);
		minimumV = Math.min(minimumV, v);
		maximumV = Math.max(maximumV, v);
	}
	if (activeCells === 0) throw new RangeError('Metrics need at least one active cell.');
	const meanU = sumU / activeCells;
	const meanV = sumV / activeCells;
	return {
		meanU,
		meanV,
		varianceV: Math.max(0, sumV2 / activeCells - meanV * meanV),
		meanReactionRate: sumReaction / activeCells,
		minimumU,
		maximumU,
		minimumV,
		maximumV,
		activeCells
	};
}

export function calculateLocalTermLedger(
	state: Readonly<FieldState>,
	setup: Readonly<GrayScottSetup>,
	row: number,
	column: number
): LocalTermLedger {
	assertValidFieldState(state);
	assertValidSetup(setup);
	if (!Number.isInteger(row) || !Number.isInteger(column))
		throw new RangeError('Cell coordinates must be integers.');
	const index = row * state.size + column;
	if (row < 0 || row >= state.size || column < 0 || column >= state.size || !state.mask[index]) {
		throw new RangeError('The requested microscope cell is not active.');
	}
	const u = state.u[index];
	const v = state.v[index];
	const neighbours = sampleNeighbors(state, row, column, setup.boundary);
	const spacing = gridSpacing(setup);
	const laplacianU = fivePointLaplacianAt(
		state.u,
		state.mask,
		state.size,
		row,
		column,
		setup.boundary,
		spacing,
		1
	);
	const laplacianV = fivePointLaplacianAt(
		state.v,
		state.mask,
		state.size,
		row,
		column,
		setup.boundary,
		spacing,
		0
	);
	const reaction = u * v * v;
	const diffusionU = setup.diffusionU * laplacianU;
	const reactionU = -reaction;
	const feedU = setup.feed * (1 - u);
	const diffusionV = setup.diffusionV * laplacianV;
	const reactionV = reaction;
	const feedRemovalV = -setup.feed * v;
	const killV = -setup.kill * v;
	return {
		row,
		column,
		u,
		v,
		...neighbours,
		laplacianU,
		laplacianV,
		diffusionU,
		reactionU,
		feedU,
		derivativeU: diffusionU + reactionU + feedU,
		diffusionV,
		reactionV,
		feedRemovalV,
		killV,
		derivativeV: diffusionV + reactionV + feedRemovalV + killV
	};
}

function budgetRates(state: Readonly<FieldState>, setup: Readonly<GrayScottSetup>): BudgetRates {
	let activeCells = 0;
	let meanU = 0;
	let meanV = 0;
	let autocatalysisU = 0;
	let feedU = 0;
	let diffusionU = 0;
	let autocatalysisV = 0;
	let feedRemovalV = 0;
	let killV = 0;
	let diffusionV = 0;
	const spacing = gridSpacing(setup);
	for (let row = 0; row < state.size; row += 1) {
		for (let column = 0; column < state.size; column += 1) {
			const index = row * state.size + column;
			if (!state.mask[index]) continue;
			activeCells += 1;
			const u = state.u[index];
			const v = state.v[index];
			const reaction = u * v * v;
			meanU += u;
			meanV += v;
			autocatalysisU -= reaction;
			feedU += setup.feed * (1 - u);
			diffusionU +=
				setup.diffusionU *
				fivePointLaplacianAtUnchecked(
					state.u,
					state.mask,
					state.size,
					row,
					column,
					setup.boundary,
					spacing,
					1
				);
			autocatalysisV += reaction;
			feedRemovalV -= setup.feed * v;
			killV -= setup.kill * v;
			diffusionV +=
				setup.diffusionV *
				fivePointLaplacianAtUnchecked(
					state.v,
					state.mask,
					state.size,
					row,
					column,
					setup.boundary,
					spacing,
					0
				);
		}
	}
	if (activeCells === 0) throw new RangeError('Budget needs at least one active cell.');
	const inverse = 1 / activeCells;
	return {
		meanU: meanU * inverse,
		meanV: meanV * inverse,
		autocatalysisU: autocatalysisU * inverse,
		feedU: feedU * inverse,
		diffusionU: diffusionU * inverse,
		autocatalysisV: autocatalysisV * inverse,
		feedRemovalV: feedRemovalV * inverse,
		killV: killV * inverse,
		diffusionV: diffusionV * inverse
	};
}

export function calculateChemicalBudget(
	state: Readonly<FieldState>,
	setup: Readonly<GrayScottSetup>,
	after?: Readonly<FieldState>
): ChemicalBudget {
	assertValidFieldState(state);
	assertValidSetup(setup);
	const before = budgetRates(state, setup);
	let rates = before;
	if (after !== undefined && setup.integrator === 'heun') {
		assertValidFieldState(after);
		const derivativeU = new Float64Array(state.u.length);
		const derivativeV = new Float64Array(state.v.length);
		computeGrayScottRhsInto(state, setup, derivativeU, derivativeV);
		const predictor: FieldState = {
			size: state.size,
			u: new Float64Array(state.u.length),
			v: new Float64Array(state.v.length),
			mask: state.mask
		};
		for (let index = 0; index < state.u.length; index += 1) {
			predictor.u[index] = state.u[index] + setup.timestep * derivativeU[index];
			predictor.v[index] = state.v[index] + setup.timestep * derivativeV[index];
		}
		const final = budgetRates(predictor, setup);
		rates = {
			meanU: before.meanU,
			meanV: before.meanV,
			autocatalysisU: (before.autocatalysisU + final.autocatalysisU) / 2,
			feedU: (before.feedU + final.feedU) / 2,
			diffusionU: (before.diffusionU + final.diffusionU) / 2,
			autocatalysisV: (before.autocatalysisV + final.autocatalysisV) / 2,
			feedRemovalV: (before.feedRemovalV + final.feedRemovalV) / 2,
			killV: (before.killV + final.killV) / 2,
			diffusionV: (before.diffusionV + final.diffusionV) / 2
		};
	}
	const scale = setup.timestep;
	const autocatalysisU = rates.autocatalysisU * scale;
	const feedU = rates.feedU * scale;
	const diffusionU = rates.diffusionU * scale;
	const autocatalysisV = rates.autocatalysisV * scale;
	const feedRemovalV = rates.feedRemovalV * scale;
	const killV = rates.killV * scale;
	const diffusionV = rates.diffusionV * scale;
	const predictedChangeU = autocatalysisU + feedU + diffusionU;
	const predictedChangeV = autocatalysisV + feedRemovalV + killV + diffusionV;
	const afterMetrics = after === undefined ? null : calculateFieldMetrics(after);
	const measuredChangeU = afterMetrics === null ? null : afterMetrics.meanU - before.meanU;
	const measuredChangeV = afterMetrics === null ? null : afterMetrics.meanV - before.meanV;
	return {
		meanU: before.meanU,
		meanV: before.meanV,
		autocatalysisU,
		feedU,
		diffusionU,
		predictedChangeU,
		measuredChangeU,
		residualU: measuredChangeU === null ? null : measuredChangeU - predictedChangeU,
		autocatalysisV,
		feedRemovalV,
		killV,
		diffusionV,
		predictedChangeV,
		measuredChangeV,
		residualV: measuredChangeV === null ? null : measuredChangeV - predictedChangeV
	};
}
