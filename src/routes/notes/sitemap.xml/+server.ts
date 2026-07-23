import type { RequestHandler } from './$types';
import { listPublishedNotes } from '$lib/server/notes/repository';
import { siteUrl } from '$lib/components/seo/SEO';

function escapeXml(value: string) {
	return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

export const GET: RequestHandler = async () => {
	const { notes } = await listPublishedNotes('', 1, 1_000);
	const urls = notes
		.map(
			(note) => `<url>
	<loc>${escapeXml(`${siteUrl}/notes/${note.slug}`)}</loc>
	<lastmod>${escapeXml(note.publishedAt ?? note.updatedAt)}</lastmod>
</url>`
		)
		.join('\n');
	return new Response(
		`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`,
		{
			headers: {
				'content-type': 'application/xml; charset=utf-8',
				'cache-control': 'public, max-age=300, s-maxage=900'
			}
		}
	);
};
