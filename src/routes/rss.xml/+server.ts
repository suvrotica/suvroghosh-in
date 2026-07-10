import { siteUrl, siteTitle, siteDescription } from '$lib/components/seo/SEO';
import { postPath } from '$lib/content/posts';
import { getPublishedPosts } from '$lib/server/content/posts';

export const prerender = true;

export async function GET() {
	const posts = getPublishedPosts()
		.map((post) => {
			const link = siteUrl + postPath(post);
			return {
				title: post.title,
				description: post.description,
				date: post.date,
				link,
				guid: link,
				category: post.category
			};
		})
		.slice(0, 25);

	const items = posts
		.map(
			(post) => `
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
