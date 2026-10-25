import { describe, expect, it } from 'vitest';
import { postPath } from '$lib/content/posts';
import { comicCatalog, comicPath } from '$lib/content/comics';
import { getPublishedPosts } from '$lib/server/content/posts';
import { eligibleAnalyticsPath } from './paths';

describe('analytics registered public content paths', () => {
	it('accepts published canonical content and finite public shell pages', () => {
		expect(eligibleAnalyticsPath('/writing?query=discard#fragment')).toBe('/writing');
		expect(eligibleAnalyticsPath('/')).toBe('/');
		expect(eligibleAnalyticsPath('/blog/games')).toBe('/blog/games');
		const post = getPublishedPosts()[0];
		expect(post).toBeTruthy();
		expect(eligibleAnalyticsPath(postPath(post))).toBe(postPath(post));
	});
	it('accepts the comics gallery and only registered comic details, without measuring downloads', () => {
		expect(eligibleAnalyticsPath('/comics?source=navigation')).toBe('/comics');
		expect(comicCatalog.length).toBeGreaterThan(0);
		for (const comic of comicCatalog) {
			expect(eligibleAnalyticsPath(comicPath(comic))).toBe(comicPath(comic));
			expect(eligibleAnalyticsPath(comic.pdf.href)).toBeNull();
			expect(eligibleAnalyticsPath(comic.frontCover.src)).toBeNull();
			expect(eligibleAnalyticsPath(`${comicPath(comic)}/private`)).toBeNull();
		}
		expect(eligibleAnalyticsPath('/comics/unregistered-comic')).toBeNull();
		expect(eligibleAnalyticsPath('/comics/studio')).toBeNull();
	});
	it('rejects arbitrary slugs, private routes, files and unregistered notebook URLs', () => {
		for (const path of [
			'/api/analytics/pageview',
			'/notes/studio/analytics',
			'/notes/sign-in',
			'/notes/arbitrary-note',
			'/random-referrer-identifier',
			'/blog/arbitrary/secret',
			'/notebooks/private.html',
			'/rss.xml',
			'/sitemap.xml'
		])
			expect(eligibleAnalyticsPath(path)).toBeNull();
	});
});
