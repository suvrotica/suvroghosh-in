import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { sketchManifest } from '$lib/generated/sketch-manifest';

describe('published sketch collection', () => {
	it('contains the complete 81-work collection with generated assets and finished metadata', () => {
		expect(sketchManifest).toHaveLength(81);
		expect(new Set(sketchManifest.map((artwork) => artwork.slug))).toHaveProperty('size', 81);
		expect(new Set(sketchManifest.map((artwork) => artwork.source.src))).toHaveProperty('size', 81);
		expect(sketchManifest.every((artwork) => !artwork.needsMetadata)).toBe(true);

		const variants = sketchManifest.flatMap((artwork) => Object.values(artwork.variants));
		expect(variants).toHaveLength(324);
		for (const variant of variants) {
			const assetPath = resolve(process.cwd(), 'static', decodeURIComponent(variant.src.slice(1)));
			expect(existsSync(assetPath), `${variant.src} should exist`).toBe(true);
		}
	});
});
