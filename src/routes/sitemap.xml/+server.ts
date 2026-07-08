import { siteUrl } from '$lib/components/seo/SEO';
import { slugifyCategory } from '$lib/content/categories';
import {
	isIndexablePost,
	postPath,
	validatePublishedPostMetadata,
	type BlogPostMetadata
} from '$lib/content/posts';

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
	const modules = import.meta.glob<{ metadata: BlogPostMetadata }>('/src/lib/posts/*.md', {
		eager: true
	});
	const categoryLastMod = new Map<string, string>();

	const posts = Object.entries(modules)
		.map(([path, file]) => {
			const metadata = file.metadata;
			const slug = path.split('/').pop()?.slice(0, -3);
			if (!slug || !isIndexablePost(metadata, slug) || !metadata.category) return null;
			validatePublishedPostMetadata(metadata, `${slug}.md`);
			const category = slugifyCategory(metadata.category);
			const lastMod = metadata.dateModified || metadata.date;
			const previous = categoryLastMod.get(category);
			if (!previous || new Date(lastMod).getTime() > new Date(previous).getTime()) {
				categoryLastMod.set(category, lastMod);
			}

			return {
				url: siteUrl + postPath({ category: metadata.category, slug }),
				lastMod
			};
		})
		.filter(Boolean);

	const categories = Array.from(categoryLastMod.entries()).map(([category, lastMod]) => ({
		url: siteUrl + '/blog/' + category,
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
	const urls = [...pages, ...categories, ...posts].filter(
		(page): page is { url: string; lastMod: string } => Boolean(page)
	);

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
