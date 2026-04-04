import { siteUrl } from '$lib/components/seo/SEO';

export const prerender = true;

export async function GET() {
	// 1. Get all posts
	const modules = import.meta.glob('/src/lib/posts/*.md', { eager: true });
	const posts = Object.entries(modules).map(([path, file]: any) => {
		const slug = path.split('/').pop()?.slice(0, -3).toLowerCase();
        const metadata = file.metadata;

        // CRITICAL FIX: Skip files without metadata or category to prevent build crash
        if (!metadata || !metadata.category || metadata.published === false) {
            return null;
        }

		return {
			url: `${siteUrl}/blog/${metadata.category.toLowerCase()}/${slug}`,
			lastMod: metadata.date ? new Date(metadata.date).toISOString() : new Date().toISOString()
		};
	})
    .filter((post) => post !== null); // Filter out the nulls from above

    // 2. Define static pages
    const pages = [
        { url: `${siteUrl}/`, changeFreq: 'daily', priority: 1.0 },
        { url: `${siteUrl}/resume`, changeFreq: 'monthly', priority: 0.9 },
        { url: `${siteUrl}/blog`, changeFreq: 'daily', priority: 0.9 },
    ];

	const xml = `<?xml version="1.0" encoding="UTF-8" ?>
    <urlset
        xmlns="https://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="https://www.w3.org/1999/xhtml"
        xmlns:mobile="https://www.google.com/schemas/sitemap-mobile/1.0"
        xmlns:news="https://www.google.com/schemas/sitemap-news/0.9"
        xmlns:image="https://www.google.com/schemas/sitemap-image/1.1"
        xmlns:video="https://www.google.com/schemas/sitemap-video/1.1"
    >
        ${pages.map(page => `
            <url>
                <loc>${page.url}</loc>
                <changefreq>${page.changeFreq}</changefreq>
                <priority>${page.priority}</priority>
            </url>
        `).join('')}
        ${posts.map(post => `
            <url>
                <loc>${post?.url}</loc>
                <lastmod>${post?.lastMod}</lastmod>
                <changefreq>monthly</changefreq>
                <priority>0.7</priority>
            </url>
        `).join('')}
    </urlset>`;

	return new Response(xml, {
		headers: {
			'Content-Type': 'application/xml',
            'Cache-Control': 'max-age=0, s-maxage=3600'
		}
	});
}