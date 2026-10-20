import assert from 'node:assert/strict';
import test from 'node:test';
import { categoryLabel, categoryParents, categoryTrail } from '../src/lib/content/categories.ts';

test('Limerick belongs to Poetry while parent archives do not become children', () => {
	assert.deepEqual(categoryTrail(' Limerick '), ['poetry', 'limerick']);
	assert.deepEqual(categoryTrail('Poetry'), ['poetry']);
	assert.equal(categoryTrail('limerick').includes('poetry'), true);
	assert.equal(categoryTrail('poetry').includes('limerick'), false);
	assert.equal(categoryLabel('poetry'), 'Poetry');
	assert.equal(categoryLabel('limerick'), 'Limerick');
});

test('existing categories retain independent archives', () => {
	assert.deepEqual(categoryTrail('Healthcare IT'), ['healthcare-it']);
	assert.equal(categoryTrail('raw').includes('poetry'), false);
});

test('all configured hierarchies are acyclic and normalize to their leaf', () => {
	for (const leaf of Object.keys(categoryParents)) {
		const trail = categoryTrail(leaf);
		assert.equal(trail.at(-1), leaf);
		assert.equal(new Set(trail).size, trail.length);
	}
});
