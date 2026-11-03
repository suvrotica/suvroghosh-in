import { existsSync, readFileSync, statSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { sketchManifest } from '$lib/generated/sketch-manifest';

const report = JSON.parse(
	readFileSync(resolve(process.cwd(), 'scripts/sketch-import-report.json'), 'utf8')
) as {
	applied: boolean;
	baselineExistingSources: string[];
	summary: {
		inputFiles: number;
		canonicalArtworks: number;
		baselineExistingArtworks: number;
		unreviewedPerceptualCandidates: number;
	};
	inputs: Array<{ filename: string; canonicalSource: string }>;
	publicMasters: Array<{
		filename: string;
		pixelSha256: string;
		embeddedMetadata: string[];
		trailingBytes: number;
	}>;
};
const sourceFilename = (src: string) =>
	basename(decodeURIComponent(new URL(src, 'https://suvroghosh.in').pathname));

describe('published sketch collection', () => {
	it('includes each canonical work once and accounts for every audited input', () => {
		expect(report.applied).toBe(true);
		expect(sketchManifest).toHaveLength(report.summary.canonicalArtworks);
		expect(report.inputs).toHaveLength(report.summary.inputFiles);
		expect(report.baselineExistingSources).toHaveLength(report.summary.baselineExistingArtworks);
		expect(new Set(sketchManifest.map((artwork) => artwork.slug)).size).toBe(sketchManifest.length);
		const sources = new Set(sketchManifest.map((artwork) => sourceFilename(artwork.source.src)));
		expect(sources.size).toBe(sketchManifest.length);
		expect(sources).toEqual(new Set(report.publicMasters.map((master) => master.filename)));
		for (const input of report.inputs) {
			expect(
				sources.has(input.canonicalSource),
				`${input.filename} needs a published canonical work`
			).toBe(true);
		}
		for (const source of report.baselineExistingSources) {
			expect(sources.has(source), `Existing artwork ${source} must remain available`).toBe(true);
		}
		expect(new Set(report.publicMasters.map((master) => master.pixelSha256)).size).toBe(
			report.publicMasters.length
		);
		expect(report.summary.unreviewedPerceptualCandidates).toBe(0);
	});

	it('preserves authored descriptions while allowing explicitly unfinished new catalogue entries', () => {
		const baseline = new Set(report.baselineExistingSources);
		for (const artwork of sketchManifest) {
			expect(artwork.title.trim().length).toBeGreaterThan(0);
			if (baseline.has(sourceFilename(artwork.source.src))) {
				expect(artwork.needsMetadata, `${artwork.slug} had an authored description`).toBe(false);
				expect(artwork.description.trim().length).toBeGreaterThan(0);
			}
			if (!artwork.needsMetadata) {
				expect(artwork.description.trim().length).toBeGreaterThan(0);
				expect(artwork.alt.trim().length).toBeGreaterThan(0);
			}
		}
	});

	it('provides stable unique ordering and complete versioned public assets', () => {
		expect(new Set(sketchManifest.map((artwork) => artwork.galleryOrder)).size).toBe(
			sketchManifest.length
		);
		for (const artwork of sketchManifest) {
			expect(Number.isSafeInteger(artwork.galleryOrder)).toBe(true);
			expect(artwork.galleryOrder).toBeGreaterThanOrEqual(0);
			expect(Object.keys(artwork.variants).sort()).toEqual([
				'detail',
				'museum',
				'preview',
				'thumbnail'
			]);
			for (const asset of [artwork.source, ...Object.values(artwork.variants)]) {
				const url = new URL(asset.src, 'https://suvroghosh.in');
				expect(url.searchParams.get('v')).toMatch(/^[a-f0-9]{16}$/);
				const path = resolve(process.cwd(), 'static', decodeURIComponent(url.pathname.slice(1)));
				expect(existsSync(path), `${asset.src} should exist`).toBe(true);
				expect(statSync(path).size, `${asset.src} should match its byte count`).toBe(asset.bytes);
				expect(asset.width).toBeGreaterThan(0);
				expect(asset.height).toBeGreaterThan(0);
			}
		}
	});
});
