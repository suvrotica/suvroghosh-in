import { randomUUID } from 'node:crypto';
import { publicWorkspaces } from './public-runtime';

/** Every claim and completion is durably saved separately, so an interrupted
 * function leaves a lease that a later hosted worker can recover. No transport exists. */
export async function publicWorkerPass(hash: string, requireStaff = false, signal?: AbortSignal) {
	const workspaces = publicWorkspaces(signal);
	const access = { requireStaff };
	const { result: maintenance } = await workspaces.run(
		hash,
		(store) => store.maintenanceOnly(),
		access
	);
	let processed = 0;
	const started = Date.now();
	for (let index = 0; index < 3 && Date.now() - started < 15_000; index++) {
		const { result: claim } = await workspaces.run(
			hash,
			(store) => store.claim(`hosted-${randomUUID()}`),
			access
		);
		if (!claim) break;
		const { result: completed } = await workspaces.run(
			hash,
			(store) => store.complete(claim),
			access
		);
		if (completed) processed++;
	}
	return { processed, ...maintenance };
}
