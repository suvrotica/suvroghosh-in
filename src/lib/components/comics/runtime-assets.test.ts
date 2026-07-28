import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ComicEpisode, ComicPanel } from '$lib/comics/schema';
import {
	comicEpisodeWithRuntimeAssets,
	type ComicWebRuntimeMap
} from '$lib/server/comics/runtime-assets';

const SOURCE_DIGEST = 'c'.repeat(64);

function tinyWebp(label: string) {
	const payload = Buffer.from(label, 'utf8');
	const bytes = Buffer.alloc(12 + payload.length);
	bytes.write('RIFF', 0, 'ascii');
	bytes.writeUInt32LE(bytes.length - 8, 4);
	bytes.write('WEBP', 8, 'ascii');
	payload.copy(bytes, 12);
	return bytes;
}

function sha256(value: Buffer) {
	return crypto.createHash('sha256').update(value).digest('hex');
}

function panel(id: string, panelNumber: number): ComicPanel {
	return {
		id,
		panel: panelNumber,
		size: 'medium',
		aspectRatio: '4:3',
		camera: 'Eye-level test view',
		location: 'junction-square',
		time: 'morning',
		characters: [],
		props: [],
		foreground: 'Foreground',
		middleGround: 'Middle ground',
		background: 'Background',
		action: 'A runtime asset is checked.',
		dialogue: [],
		continuity: ['Asset identity remains stable.'],
		prompt: {
			lighting: 'Daylight',
			palette: 'Cream and blue',
			composition: 'Centred',
			balloonSafeAreas: [],
			negative: []
		},
		accessibility: {
			alt: `${id} test panel.`,
			description: `${id} verifies a promoted runtime image.`
		},
		art: {
			status: 'final',
			revision: 1,
			source: `panels/raw/${id}.png`,
			final: `panels/approved/${id}.png`
		}
	};
}

function episode(): ComicEpisode {
	return {
		sourceDigest: SOURCE_DIGEST,
		metadata: {
			id: '001',
			slug: 'fixture-album',
			seriesId: 'fixture-town',
			seriesSlug: 'fixture-town',
			title: 'Fixture Album',
			subtitle: 'Runtime mapping test',
			description: 'A runtime mapping fixture.',
			category: 'Comic',
			tags: ['Comic'],
			date: '2026-07-28',
			dateModified: '2026-07-28',
			published: false,
			productionPreview: true,
			storyPageCount: 1,
			readingDirection: 'ltr',
			language: 'en',
			contentGuidance: [],
			credits: [{ role: 'Test', name: 'Fixture' }],
			canonicalPath: '/blog/comic/fixture-town/fixture-album',
			transcriptPath: '/blog/comic/fixture-town/fixture-album#transcript',
			printPath: '/downloads/comics/fixture.pdf',
			cover: null,
			coverAlt: 'Fixture cover.'
		},
		pages: [
			{
				page: 1,
				title: 'Fixture page',
				purpose: 'Verify runtime images.',
				location: 'junction-square',
				time: 'morning',
				layout: 'Two panels',
				panelCount: 2,
				dialogueGoal: 'None',
				pageTurn: 'None',
				visualMotif: 'Hashes',
				continuity: ['Both panels remain present.'],
				panels: [panel('p01-01', 1), panel('p01-02', 2)]
			}
		]
	};
}

describe('comic runtime web assets', () => {
	it('uses only a current fully verified map and otherwise exposes honest placeholders', async () => {
		const staticRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'comic-runtime-assets-'));
		try {
			const compiled = episode();
			const withoutMap = comicEpisodeWithRuntimeAssets(compiled, null, {
				staticRoot,
				expectedPanelCount: 2
			});
			expect(withoutMap.pages[0].panels.map((entry) => entry.art.final)).toEqual([null, null]);
			expect(withoutMap.pages[0].panels.map((entry) => entry.art.source)).toEqual([null, null]);
			expect(compiled.pages[0].panels[0].art.final).toBe('panels/approved/p01-01.png');

			const panels: Record<string, string> = {};
			for (const panelId of ['p01-01', 'p01-02']) {
				const bytes = tinyWebp(panelId);
				const hash = sha256(bytes);
				const url = `/images/comics/fixture-town/fixture-album/${panelId}-${hash}.webp`;
				const filename = path.resolve(staticRoot, ...url.slice(1).split('/'));
				await fs.mkdir(path.dirname(filename), { recursive: true });
				await fs.writeFile(filename, bytes);
				panels[panelId] = url;
			}
			const runtimeMap: ComicWebRuntimeMap = {
				format: 'suvroghosh-comic-web-runtime-map',
				formatVersion: 1,
				seriesSlug: 'fixture-town',
				episodeId: '001',
				episodeSlug: 'fixture-album',
				sourceDigest: SOURCE_DIGEST,
				panels
			};
			const mapped = comicEpisodeWithRuntimeAssets(compiled, runtimeMap, {
				staticRoot,
				expectedPanelCount: 2
			});
			expect(mapped.pages[0].panels.map((entry) => entry.art.final)).toEqual([
				panels['p01-01'],
				panels['p01-02']
			]);

			const stale = comicEpisodeWithRuntimeAssets(
				compiled,
				{ ...runtimeMap, sourceDigest: 'd'.repeat(64) },
				{ staticRoot, expectedPanelCount: 2 }
			);
			expect(stale.pages[0].panels.map((entry) => entry.art.final)).toEqual([null, null]);

			const corruptFile = path.resolve(staticRoot, ...panels['p01-02'].slice(1).split('/'));
			await fs.writeFile(corruptFile, tinyWebp('corrupt'));
			const corrupt = comicEpisodeWithRuntimeAssets(compiled, runtimeMap, {
				staticRoot,
				expectedPanelCount: 2
			});
			expect(corrupt.pages[0].panels.map((entry) => entry.art.final)).toEqual([null, null]);
		} finally {
			await fs.rm(staticRoot, { recursive: true, force: true });
		}
	});
});
