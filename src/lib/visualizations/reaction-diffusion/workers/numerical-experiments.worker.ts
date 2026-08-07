/// <reference lib="webworker" />

import { runNumericalComparison, type NumericalExperimentKind } from '../numerical-experiments';
import type { GrayScottSetup } from '../types';
import type { NumericalExperimentWorkerResponse } from './numerical-client';

type RunRequest = {
	type: 'RUN';
	generation: number;
	setup: GrayScottSetup;
	kind: NumericalExperimentKind;
};

const scope = self as DedicatedWorkerGlobalScope;

scope.addEventListener('message', (event: MessageEvent<RunRequest>) => {
	const request = event.data;
	if (!isRunRequest(request)) {
		post({ type: 'ERROR', generation: 0, message: 'Malformed numerical-comparison request.' });
		return;
	}
	try {
		post({
			type: 'RESULT',
			generation: request.generation,
			result: runNumericalComparison(request.setup, request.kind)
		});
	} catch (error) {
		post({
			type: 'ERROR',
			generation: request.generation,
			message: error instanceof Error ? error.message : 'The numerical comparison failed.'
		});
	}
});

function post(response: NumericalExperimentWorkerResponse) {
	scope.postMessage(response);
}

function isRunRequest(value: unknown): value is RunRequest {
	if (!value || typeof value !== 'object') return false;
	const candidate = value as Partial<RunRequest>;
	return (
		candidate.type === 'RUN' &&
		Number.isSafeInteger(candidate.generation) &&
		Number(candidate.generation) > 0 &&
		Boolean(candidate.setup) &&
		(candidate.kind === 'timestep' ||
			candidate.kind === 'resolution' ||
			candidate.kind === 'integrator' ||
			candidate.kind === 'unsafe')
	);
}
