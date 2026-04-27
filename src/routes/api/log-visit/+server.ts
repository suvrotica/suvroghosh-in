import { json, type RequestHandler } from '@sveltejs/kit';

export const POST: RequestHandler = async ({ request, getClientAddress }) => {
	const payload = await request.json().catch(() => null);

	console.log({
		...payload,
		ip: getClientAddress(),
		at: new Date().toISOString()
	});

	// Connect to Postgres down the line when ready for first-party analytics
	return json({ ok: true });
};