import type { SimulationHistoryPoint, SimulationSnapshot } from './types';

function csvCell(value: string | number | null): string {
	if (value === null) return '';
	const text = typeof value === 'number' ? (Number.isFinite(value) ? value.toString() : '') : value;
	return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function historyRow(
	point: SimulationHistoryPoint,
	previous: SimulationHistoryPoint | null
): readonly (string | number | null)[] {
	const transitionOrigin = previous && previous.iteration === point.iteration - 1 ? previous : null;
	return [
		point.iteration,
		point.gradientEvaluations,
		point.iteration > 0 ? point.iteration - 1 : null,
		transitionOrigin?.theta[0] ?? null,
		transitionOrigin?.theta[1] ?? null,
		transitionOrigin?.loss ?? null,
		point.theta[0],
		point.theta[1],
		point.loss,
		point.gradient?.[0] ?? null,
		point.gradient?.[1] ?? null,
		point.fullGradient?.[0] ?? null,
		point.fullGradient?.[1] ?? null,
		point.update?.[0] ?? null,
		point.update?.[1] ?? null,
		point.gradientNorm,
		point.stepNorm,
		point.batchIndices?.join('|') ?? null,
		point.terminalEvaluation?.gradient[0] ?? null,
		point.terminalEvaluation?.gradient[1] ?? null,
		point.terminalEvaluation?.fullGradient[0] ?? null,
		point.terminalEvaluation?.fullGradient[1] ?? null,
		point.terminalEvaluation?.gradientNorm ?? null,
		point.terminalEvaluation?.fullGradientNorm ?? null,
		point.terminalEvaluation?.batchIndices?.join('|') ?? null
	];
}

export function simulationToCsv(snapshot: SimulationSnapshot): string {
	const header = [
		'destination_iteration',
		'cumulative_gradient_evaluations_at_record',
		'transition_from_iteration',
		'origin_parameter_1',
		'origin_parameter_2',
		'origin_raw_loss',
		'destination_parameter_1',
		'destination_parameter_2',
		'destination_raw_loss',
		'active_gradient_at_origin_1',
		'active_gradient_at_origin_2',
		'full_gradient_at_origin_1',
		'full_gradient_at_origin_2',
		'update_from_origin_1',
		'update_from_origin_2',
		'active_gradient_norm_at_origin',
		'update_norm',
		'batch_indices_for_transition',
		'terminal_active_gradient_1',
		'terminal_active_gradient_2',
		'terminal_full_gradient_1',
		'terminal_full_gradient_2',
		'terminal_active_gradient_norm',
		'terminal_full_gradient_norm',
		'terminal_batch_indices',
		'experiment_metadata',
		'run_status'
	];
	const rows = snapshot.history.map((point, index) => {
		const row = historyRow(point, index > 0 ? snapshot.history[index - 1] : null);
		return [
			...row,
			`landscape=${snapshot.landscapeId}; optimizer=${snapshot.optimizer.id}; learning_rate=${snapshot.optimizer.learningRate}; gradient_mode=${snapshot.gradientMode.kind}; seed=${snapshot.seed}`,
			index === snapshot.history.length - 1 ? snapshot.status : ''
		];
	});
	return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

export type SimulationSummary = {
	readonly schema: 'suvroghosh.gradient-descent.run';
	readonly version: 1;
	readonly landscape: SimulationSnapshot['landscapeId'];
	readonly optimizer: SimulationSnapshot['optimizer'];
	readonly gradientMode: SimulationSnapshot['gradientMode'];
	readonly seed: string;
	readonly start: SimulationSnapshot['start'];
	readonly status: SimulationSnapshot['status'];
	readonly statusMessage: string;
	readonly iterations: number;
	readonly gradientEvaluations: number;
	readonly finalTheta: SimulationSnapshot['theta'];
	readonly finalLoss: number;
	readonly minimumLoss: number;
	readonly maximumLoss: number;
	readonly history: readonly SimulationHistoryPoint[];
};

export function createSimulationSummary(snapshot: SimulationSnapshot): SimulationSummary {
	const losses = snapshot.history.map((point) => point.loss);
	return {
		schema: 'suvroghosh.gradient-descent.run',
		version: 1,
		landscape: snapshot.landscapeId,
		optimizer: snapshot.optimizer,
		gradientMode: snapshot.gradientMode,
		seed: snapshot.seed,
		start: snapshot.start,
		status: snapshot.status,
		statusMessage: snapshot.statusMessage,
		iterations: snapshot.iteration,
		gradientEvaluations: snapshot.gradientEvaluations,
		finalTheta: snapshot.theta,
		finalLoss: snapshot.loss,
		minimumLoss: Math.min(...losses),
		maximumLoss: Math.max(...losses),
		history: snapshot.history
	};
}

export function simulationSummaryJson(snapshot: SimulationSnapshot, indentation = 2): string {
	if (!Number.isSafeInteger(indentation) || indentation < 0 || indentation > 10) {
		throw new RangeError('JSON indentation must be an integer between 0 and 10.');
	}
	return JSON.stringify(createSimulationSummary(snapshot), null, indentation);
}

export function safeExportStem(snapshot: SimulationSnapshot): string {
	const seed = snapshot.seed
		.toLocaleLowerCase('en')
		.replace(/[^a-z0-9-]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 48);
	return `gradient-descent-${snapshot.landscapeId}-${snapshot.optimizer.id}-${seed || 'run'}`;
}
