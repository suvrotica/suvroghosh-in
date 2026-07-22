import { env } from '$env/dynamic/private';
import { error, type RequestHandler } from '@sveltejs/kit';

export const prerender = false;

const keyPattern = /^[A-Za-z0-9-]{8,128}$/;

export const GET: RequestHandler = ({ params }) => {
	const configuredKey = env.INDEXNOW_KEY?.trim();
	if (!configuredKey || !keyPattern.test(configuredKey) || params.indexnowKey !== configuredKey) {
		error(404, 'Not found');
	}

	return new Response(configuredKey, {
		headers: {
			'cache-control': 'no-store',
			'content-type': 'text/plain; charset=utf-8',
			'x-content-type-options': 'nosniff',
			'x-robots-tag': 'noindex'
		}
	});
};
