import { error } from '@sveltejs/kit';
import { requireNotesOwner } from '$lib/server/notes/auth';
import { getAnalyticsReport } from '$lib/server/analytics/repository';
import { createLocalAdmission } from '$lib/server/http/local-admission';
import type { PageServerLoad } from './$types';

// This bounds concurrent owner queries per server instance. The repository also
// bounds the date range, dimension counts, database work and request duration.
const admitReport = createLocalAdmission({
	attempts: 10,
	globalAttempts: 20,
	windowMs: 60_000,
	concurrency: 3,
	maxKeys: 8
});

export const load: PageServerLoad = async (event) => {
	// Page loads run independently of parent loads during client navigation.
	const owner = await requireNotesOwner(event, true);
	const admission = admitReport(owner.id);
	if (!admission.allowed) throw error(429, 'Please wait a moment before refreshing this report.');
	try {
		const requested = event.url.searchParams.get('period');
		const period = ['today', '7d', '30d', '90d', 'custom'].includes(requested ?? '')
			? requested!
			: '30d';
		return { report: await getAnalyticsReport(event.url.searchParams), period };
	} finally {
		admission.release();
	}
};
