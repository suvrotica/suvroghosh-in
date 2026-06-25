import { siteUrl } from '$lib/components/seo/SEO';
import { slugifyCategory } from '$lib/content/categories';

export const prerender = true;

export async function GET() {
	const modules = import.meta.glob('/src/lib/posts/*.md', { eager: true });

	const posts = Object.entries(modules)
		.map(([path, file]: any) => {
			const metadata = file.metadata;
			if (!metadata || metadata.published === false || !metadata.category) return null;

			const slug = path.split('/').pop()?.slice(0, -3).toLowerCase();
			const category = slugifyCategory(metadata.category);

			return {
				url: siteUrl + '/blog/' + category + '/' + slug,
				lastMod: metadata.dateModified || metadata.date
			};
		})
		.filter(Boolean);

	const pages = [
		{ url: siteUrl + '/', lastMod: new Date().toISOString() },
		{ url: siteUrl + '/resume', lastMod: new Date().toISOString() },
		{ url: siteUrl + '/consulting', lastMod: new Date().toISOString() },
		{ url: siteUrl + '/healthcare-it-gulf', lastMod: new Date().toISOString() },
		{ url: siteUrl + '/writing', lastMod: new Date().toISOString() },
		{ url: siteUrl + '/blog', lastMod: new Date().toISOString() },
		{ url: siteUrl + '/contact', lastMod: new Date().toISOString() }
	];

	const xml =
		'<?xml version=""1.0"" encoding=""UTF-8""?>\n<urlset xmlns=""http://www.sitemaps.org/schemas/sitemap/0.9"">\n' +
		[...pages, ...posts]
			.map(
				(page: any) =>
					'  <url>\n    <loc>' +
					page.url +
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
