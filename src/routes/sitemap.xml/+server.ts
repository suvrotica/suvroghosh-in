import { siteUrl } from '$lib/components/seo/SEO';
import { postPath } from '$lib/content/posts';
import { getPublishedPosts } from '$lib/server/content/posts';

export const prerender = true;

function escapeXml(value: string) {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&apos;');
}

export async function GET() {
	const categoryLastMod = new Map<string, string>();
	const yearLastMod = new Map<string, string>();

	const posts = getPublishedPosts().map((post) => {
		const category = post.categorySlug ?? 'uncategorized';
		const year = /^\d{4}/.exec(post.date)?.[0];
		const lastMod = post.dateModified ?? post.date;
		const previous = categoryLastMod.get(category);
		if (!previous || new Date(lastMod).getTime() > new Date(previous).getTime()) {
			categoryLastMod.set(category, lastMod);
		}
		if (year) {
			const previousYear = yearLastMod.get(year);
			if (!previousYear || new Date(lastMod).getTime() > new Date(previousYear).getTime()) {
				yearLastMod.set(year, lastMod);
			}
		}

		return {
			url: siteUrl + postPath(post),
			lastMod
		};
	});

	const categories = Array.from(categoryLastMod.entries()).map(([category, lastMod]) => ({
		url: siteUrl + '/blog/' + category,
		lastMod
	}));
	const years = Array.from(yearLastMod.entries()).map(([year, lastMod]) => ({
		url: siteUrl + '/blog/archive/' + year,
		lastMod
	}));

	const pages = [
		{ url: siteUrl + '/', lastMod: '2026-06-26' },
		{ url: siteUrl + '/resume', lastMod: '2026-06-26' },
		{ url: siteUrl + '/consulting', lastMod: '2026-06-26' },
		{ url: siteUrl + '/healthcare-it-gulf', lastMod: '2026-06-26' },
		{ url: siteUrl + '/writing', lastMod: '2026-06-26' },
		{ url: siteUrl + '/blog', lastMod: '2026-06-26' },
		{ url: siteUrl + '/contact', lastMod: '2026-06-26' }
	];
	const urls = [...pages, ...years, ...categories, ...posts];

	const xml =
		'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
		urls
			.map(
				(page) =>
					'  <url>\n    <loc>' +
					escapeXml(page.url) +
					'</loc>\n    ' +
					(page.lastMod ? '<lastmod>' + new Date(page.lastMod).toISOString() + '</lastmod>' : '') +
					'\n  </url>'
			)
			.join('\n') +
		'\n</urlset>';

	return new Response(xml, {
		headers: {
			'Content-Type': 'application/xml; charset=utf-8',
			'Cache-Control': 'max-age=0, s-maxage=3600'
		}
	});
}
