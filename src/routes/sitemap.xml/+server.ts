import { siteUrl } from '$lib/components/seo/SEO';
import { postPath } from '$lib/content/posts';
import { topicPath } from '$lib/content/topics';
import {
	getCuratedReadingPaths,
	getPublishedArchiveMonths,
	getPublishedPosts,
	getPublishedTopics
} from '$lib/server/content/posts';

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
	const publishedPosts = getPublishedPosts();

	const posts = publishedPosts.map((post) => {
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
	const blogLastMod = posts.reduce(
		(latest, post) => (post.lastMod > latest ? post.lastMod : latest),
		'1970-01-01'
	);

	const categories = Array.from(categoryLastMod.entries()).map(([category, lastMod]) => ({
		url: siteUrl + '/blog/' + category,
		lastMod
	}));
	const years = Array.from(yearLastMod.entries()).map(([year, lastMod]) => ({
		url: siteUrl + '/blog/archive/' + year,
		lastMod
	}));
	const months = getPublishedArchiveMonths().map((month) => ({
		url: `${siteUrl}/blog/archive/${month.year}/${month.month}`,
		lastMod: month.lastModified
	}));
	const publishedTopics = getPublishedTopics();
	const topics = publishedTopics.map((topic) => ({
		url: siteUrl + topicPath(topic.slug),
		lastMod: topic.lastModified
	}));
	const topicIndexLastMod = publishedTopics.reduce(
		(latest, topic) =>
			new Date(topic.lastModified).getTime() > new Date(latest).getTime()
				? topic.lastModified
				: latest,
		'1970-01-01'
	);
	const startHereLastMod = getCuratedReadingPaths()
		.flatMap((path) => path.posts)
		.reduce((latest, post) => {
			const lastModified = post.dateModified ?? post.date;
			return new Date(lastModified).getTime() > new Date(latest).getTime() ? lastModified : latest;
		}, '1970-01-01');

	const pages = [
		{ url: siteUrl + '/', lastMod: blogLastMod },
		{ url: siteUrl + '/start-here', lastMod: startHereLastMod },
		{ url: siteUrl + '/resume', lastMod: '2026-06-26' },
		{ url: siteUrl + '/projects', lastMod: '2026-07-18' },
		{ url: siteUrl + '/consulting', lastMod: '2026-06-26' },
		{ url: siteUrl + '/healthcare-it-gulf', lastMod: '2026-06-26' },
		{ url: siteUrl + '/writing', lastMod: blogLastMod },
		{ url: siteUrl + '/images', lastMod: '2026-07-20' },
		{ url: siteUrl + '/images/sketches', lastMod: '2026-07-24' },
		{ url: siteUrl + '/blog', lastMod: blogLastMod },
		{ url: siteUrl + '/blog/topics', lastMod: topicIndexLastMod },
		{ url: siteUrl + '/contact', lastMod: '2026-06-26' }
	];
	const urls = [...pages, ...years, ...months, ...topics, ...categories, ...posts];

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
