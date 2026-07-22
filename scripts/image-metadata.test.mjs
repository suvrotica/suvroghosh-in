import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getImageDimensions } from '../src/lib/server/image-metadata.ts';

test('returns exact dimensions for manifest-backed public image paths', () => {
	assert.deepEqual(getImageDimensions('/thumbnail/Compress_20260722_083743_3384.jpg'), {
		width: 1448,
		height: 1086
	});
	assert.deepEqual(getImageDimensions('/images/monte-carlo-laboratory.svg'), {
		width: 1200,
		height: 630
	});
});

test('normalizes query strings and safe percent encoding', () => {
	assert.deepEqual(getImageDimensions('/images/p0.jpeg?version=2#preview'), {
		width: 1068,
		height: 1600
	});
});

test('returns undefined for absent, external, and unknown paths', () => {
	assert.equal(getImageDimensions(), undefined);
	assert.equal(getImageDimensions('https://www.suvroghosh.in/images/p0.jpeg'), undefined);
	assert.equal(getImageDimensions('//example.com/images/p0.jpeg'), undefined);
	assert.equal(getImageDimensions('/images/not-present.jpg'), undefined);
});
