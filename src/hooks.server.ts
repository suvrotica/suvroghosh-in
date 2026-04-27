import { redirect, type Handle } from '@sveltejs/kit';
import { slugifyCategory } from '$lib/content/categories';

export const handle: Handle = async ({ event, resolve }) => {
	const path = event.url.pathname;

	const match = path.match(/^\/blog\/([^/]+)(\/.*)?$/);
	if (match) {
		const rawCategory = decodeURIComponent(match[1]);
		const normalized = slugifyCategory(rawCategory);
		const rest = match[2] ?? '';

		if (rawCategory !== normalized) {
			throw redirect(301, `/blog/${normalized}${rest}`);
		}
	}

	return resolve(event);
};