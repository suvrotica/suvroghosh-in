import { siteUrl, siteTitle, siteDescription } from '$lib/components/seo/SEO';
import { postPath, validatePublishedPostMetadata, type BlogPostMetadata } from '$lib/content/posts';

type RssPost = {
	title: string;
	description: string;
	date: string;
	link: string;
	guid: string;
	category: string;
};

export const prerender = true;

export async function GET() {
	const modules = import.meta.glob<{ metadata: BlogPostMetadata }>('/src/lib/posts/*.md', {
		eager: true
	});

	const posts = Object.entries(modules)
		.map(([path, file]) => {
			const metadata = file.metadata;
			if (!metadata || metadata.published === false || !metadata.title) return null;

			const slug = path.split('/').pop()?.slice(0, -3);
			if (!slug) return null;
			validatePublishedPostMetadata(metadata, `${slug}.md`);
			const link = siteUrl + postPath({ category: metadata.category || 'uncategorized', slug });

			return {
				title: metadata.title,
				description: metadata.description || '',
				date: metadata.date,
				link,
				guid: link,
				category: metadata.category || 'uncategorized'
			};
		})
		.filter((post): post is RssPost => Boolean(post))
		.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
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
