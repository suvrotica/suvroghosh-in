import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { EnquiryStore } from '../src/lib/server/enquiry-demo/store.ts';

const path = resolve(process.env.ENQUIRY_DEMO_DB || '.data/enquiry-demo/enquiries.sqlite');
const store = new EnquiryStore(path);
const worker = `local-worker-${randomUUID()}`;
const once = process.argv.includes('--once');

if (process.argv.includes('--crash-after-claim')) {
	const job = store.claim(worker);
	console.log(
		job
			? `Stopped after claiming ${job.ref}. Restart and wait for its one-minute lease, then its retry delay.`
			: 'No waiting acknowledgement to claim.'
	);
	store.close();
	process.exit(0);
}

console.log('Demonstration worker: local message previews only. No real emails are sent.');
let stopped = false;
process.on('SIGINT', () => {
	stopped = true;
});
process.on('SIGTERM', () => {
	stopped = true;
});
do {
	try {
		const result = store.tick(worker);
		if (once || result.processed || result.reminders || result.recovered)
			console.log(JSON.stringify(result));
	} catch {
		console.error(
			'The local worker could not complete this pass. Saved enquiries remain in the database; it will try again.'
		);
		if (once) process.exitCode = 1;
	}
	if (!once && !stopped) await new Promise((resolve) => setTimeout(resolve, 1000));
} while (!once && !stopped);
store.close();
