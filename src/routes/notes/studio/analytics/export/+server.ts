import { isHttpError } from '@sveltejs/kit';
import { requireNotesOwner } from '$lib/server/notes/auth';
import { getAnalyticsReport } from '$lib/server/analytics/repository';
import { createLocalAdmission } from '$lib/server/http/local-admission';
import { analyticsCsv } from './csv';
import type { RequestHandler } from './$types';

const privateHeaders = {
	'cache-control': 'private, no-cache, no-store, must-revalidate, max-age=0',
	'x-robots-tag': 'noindex, nofollow, noarchive',
	'x-content-type-options': 'nosniff'
};

const admitExport = createLocalAdmission({
	attempts: 10,
	globalAttempts: 20,
	windowMs: 60_000,
	concurrency: 2,
	maxKeys: 8
});

export const GET: RequestHandler = async (event) => {
	try {
		// Endpoints do not inherit page/layout authentication.
		const owner = await requireNotesOwner(event);
		const admission = admitExport(owner.id);
		if (!admission.allowed) {
			return new Response('Please wait before exporting another report.', {
				status: 429,
				headers: { ...privateHeaders, 'retry-after': String(admission.retryAfterSeconds) }
			});
		}
		try {
			const report = await getAnalyticsReport(event.url.searchParams);
			if (!report.configured || report.error) {
				return new Response('The analytics report is temporarily unavailable.', {
					status: 503,
					headers: privateHeaders
				});
			}
			return new Response(analyticsCsv(report), {
				headers: {
					...privateHeaders,
					'content-type': 'text/csv; charset=utf-8',
					'content-disposition': `attachment; filename="fieldbook-${report.from}-${report.to}.csv"`
				}
			});
		} finally {
			admission.release();
		}
	} catch (cause) {
		const status = isHttpError(cause) ? cause.status : 503;
		return new Response(
			status === 401
				? 'Sign in is required.'
				: status === 404
					? 'Not found.'
					: 'Report unavailable.',
			{ status, headers: privateHeaders }
		);
	}
};
