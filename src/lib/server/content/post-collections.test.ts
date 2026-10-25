import { describe, expect, it } from 'vitest';
import {
	postInCollection,
	postPath,
	validatePublishedPostMetadata,
	type BlogPostMetadata
} from '$lib/content/posts';

const post: BlogPostMetadata = {
	title: 'Prompt Atlas',
	description: 'Inspect a prompt.',
	date: '2026-10-25',
	category: 'Visualizations',
	collections: ['apps'],
	tags: ['Prompt Analysis'],
	published: true
};

describe('additional post collections', () => {
	it('adds discovery membership without changing the canonical category path', () => {
		expect(postInCollection(post, 'apps')).toBe(true);
		expect(postPath({ ...post, slug: 'prompt-atlas' })).toBe('/blog/visualizations/prompt-atlas');
		expect(() => validatePublishedPostMetadata(post)).not.toThrow();
	});
	it('leaves existing metadata valid and outside the apps collection', () => {
		const ordinary = { ...post, collections: undefined };
		expect(postInCollection(ordinary, 'apps')).toBe(false);
		expect(() => validatePublishedPostMetadata(ordinary)).not.toThrow();
	});
	it.each([
		{ collections: ['apps', 'apps'] },
		{ collections: ['unknown'] },
		{ collections: 'apps' },
		{ collections: null }
	])('rejects invalid collection metadata: %j', ({ collections }) => {
		expect(() =>
			validatePublishedPostMetadata({ ...post, collections } as BlogPostMetadata)
		).toThrow('invalid collections');
	});
});
