import { siteUrl, siteTitle, siteDescription } from '$lib/components/seo/SEO';
import { slugifyCategory } from '$lib/content/categories';

export const prerender = true;

export async function GET() {
	const modules = import.meta.glob('/src/lib/posts/*.md', { eager: true });

	const posts = Object.entries(modules)
		.map(([path, file]: any) => {
			const metadata = file.metadata;
			if (!metadata || metadata.published === false || !metadata.title) return null;

			const slug = path.split('/').pop()?.slice(0, -3).toLowerCase();
			const category = slugifyCategory(metadata.category || 'uncategorized');

			return {
				title: metadata.title,
				description: metadata.description || '',
				date: metadata.date,
				link: `${siteUrl}/blog/${category}/${slug}`,
				guid: `${siteUrl}/blog/${category}/${slug}`,
				category: metadata.category || 'uncategorized'
			};
		})
		.filter(Boolean)
		.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())
		.slice(0, 25);

	const items = posts
		.map(
			(post: any) => `
		<item>
			<title><![CDATA[${post.title}]]></title>
			<link>${post.link}</link>
			<guid isPermaLink="true">${post.guid}</guid>
			<pubDate>${new Date(post.date).toUTCString()}</pubDate>
			<category><![CDATA[${post.category}]]></category>
			<description><![CDATA[${post.description}]]></description>
		</item>`
		)
		.join('\n');

	const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
	<channel>
		<title><![CDATA[${siteTitle}]]></title>
		<link>${siteUrl}</link>
		<description><![CDATA[${siteDescription}]]></description>
		<language>en</language>
		<lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
		<atom:link href="${siteUrl}/rss.xml" rel="self" type="application/rss+xml" />
${items}
	</channel>
</rss>`;

	return new Response(xml, {
		headers: {
			'Content-Type': 'application/rss+xml; charset=utf-8',
			'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400'
		}
	});
}