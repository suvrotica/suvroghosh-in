/// <reference lib="webworker" />

import { CityWorkerHandler } from './handler';
import { isCityWorkerRequest, type CityWorkerResponse } from './protocol';

const scope = self as unknown as DedicatedWorkerGlobalScope;
const handler = new CityWorkerHandler();

scope.addEventListener('message', (event: MessageEvent<unknown>) => {
	if (!isCityWorkerRequest(event.data)) {
		const error: CityWorkerResponse = {
			protocolVersion: 1,
			requestId: 0,
			jobId: 0,
			type: 'ERROR',
			message: 'The city Worker received a malformed request.'
		};
		scope.postMessage(error);
		return;
	}
	const response = handler.handle(event.data, (progress) => scope.postMessage(progress));
	scope.postMessage(response);
	if (response.type === 'DISPOSED') scope.close();
});
