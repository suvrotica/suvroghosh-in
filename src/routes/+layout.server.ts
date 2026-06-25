import type { ServerLoad } from '@sveltejs/kit';
import { siteSEO, websiteSchema } from '$lib/components/seo/SEO';

export const load: ServerLoad = async () => {
	return {
		seo: siteSEO,
		schema: websiteSchema
	};
};
