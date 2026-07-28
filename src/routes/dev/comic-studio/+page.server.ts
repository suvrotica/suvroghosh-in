import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getComicEpisode } from '$lib/server/comics/catalog';

export const prerender = false;

export const load: PageServerLoad = () => {
	if (!dev) error(404, 'Not found');
	const episode = getComicEpisode();
	const statuses = new Map<string, number>();
	for (const page of episode.pages) {
		for (const panel of page.panels) {
			statuses.set(panel.art.status, (statuses.get(panel.art.status) ?? 0) + 1);
		}
	}
	return {
		metadata: episode.metadata,
		pages: episode.pages.map((page) => ({
			page: page.page,
			title: page.title,
			purpose: page.purpose,
			panelCount: page.panels.length,
			statuses: page.panels.reduce<Record<string, number>>((counts, panel) => {
				counts[panel.art.status] = (counts[panel.art.status] ?? 0) + 1;
				return counts;
			}, {})
		})),
		statuses: Object.fromEntries(statuses)
	};
};
