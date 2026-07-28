import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';

import { stringify as stringifyYaml } from 'yaml';

import {
	ComicToolError,
	auditLettering,
	assemblePages,
	compileEpisode,
	exportWeb,
	generateContactSheet,
	generateCulturalReview,
	generateDirectorReport,
	generatePrompts,
	loadEpisodeSources,
	planPanelLettering,
	readStructuredFile,
	renderPageSvg,
	revisePrompt,
	scaffoldLetteringGeometry,
	scaffoldEpisode,
	validateEpisode
} from './comics/lib.mjs';

const NEGATIVE_GUIDANCE = [
	'embedded dialogue or lettering',
	'speech balloons',
	'watermarks',
	'signatures',
	'copyrighted logos',
	'extra limbs'
];
const execFileAsync = promisify(execFile);

function hash(bytes) {
	return crypto.createHash('sha256').update(bytes).digest('hex');
}

async function writeJson(filename, value) {
	await fs.mkdir(path.dirname(filename), { recursive: true });
	await fs.writeFile(filename, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeYaml(filename, value) {
	await fs.mkdir(path.dirname(filename), { recursive: true });
	await fs.writeFile(filename, stringifyYaml(value, { lineWidth: 100 }));
}

function fixturePanel(page, panel, art = undefined) {
	const id = `p${String(page).padStart(2, '0')}-${String(panel).padStart(2, '0')}`;
	const hasDialogue = panel === 1;
	return {
		id,
		panel,
		size: panel === 1 ? 'wide' : panel === 4 ? 'half-page' : 'medium',
		aspectRatio: panel === 4 ? '3:2' : '4:3',
		camera: panel === 1 ? 'Eye-level establishing view' : `Readable medium view ${panel}`,
		location: 'junction-square',
		time: 'morning',
		characters: hasDialogue
			? [
					{
						id: 'ila-dastidar',
						position: 'foreground-left',
						emotion: 'wary',
						pose: 'Holds the red ledger under her left arm',
						facing: 'right'
					}
				]
			: [],
		props: hasDialogue ? ['red-ledger'] : [],
		foreground: `Foreground production detail for panel ${panel}`,
		middleGround: `Middle-ground action plane for panel ${panel}`,
		background: `Background architecture for panel ${panel}`,
		action: hasDialogue
			? 'Ila checks the ledger while a crooked direction board points both ways.'
			: `A municipal process visibly changes state in beat ${panel}.`,
		dialogue: hasDialogue
			? [
					{
						id: `${id}-d01`,
						speaker: 'ila-dastidar',
						text: `Mind the ledger on page ${page}.`,
						style: 'speech',
						readingOrder: 1,
						balloon: {
							x: 0.06,
							y: 0.05,
							width: 0.36,
							height: 0.18,
							z: 10,
							tailTarget: { x: 0.25, y: 0.72 },
							tailDirection: 'down',
							fontScale: 1,
							manualBreaks: [`Mind the ledger`, `on page ${page}.`]
						}
					}
				]
			: [],
		...(panel === 2
			? {
					soundEffects: [
						{
							text: 'KRRNK',
							description: 'A metal municipal gate judders halfway open.',
							position: { x: 0.72, y: 0.35, z: 8 }
						}
					]
				}
			: {}),
		...(panel === 1 ? { visualJoke: 'The direction board disagrees with its own arrow.' } : {}),
		continuity: ['The red ledger and direction board remain in their established state.'],
		prompt: {
			lighting: 'Warm humid morning light',
			palette: 'Faded vermilion, tram green, and monsoon grey',
			composition: 'Clear left-to-right action with uncluttered silhouettes',
			balloonSafeAreas: ['Upper-left reserve from x 0.05–0.42 and y 0.04–0.25'],
			negative: NEGATIVE_GUIDANCE
		},
		accessibility: {
			alt: `Page ${page}, panel ${panel}: a clear municipal action beat in Junction Square.`,
			description: `In Junction Square on a humid morning, panel ${panel} shows a readable municipal action, the characters’ expressions, and the crooked-board visual joke without relying on generated words.`
		},
		art: art ?? {
			status: 'missing',
			revision: 0,
			source: null,
			final: null,
			width: null,
			height: null
		}
	};
}

function fixturePage(page, firstPanelArt) {
	return {
		page,
		title: `Fixture page ${page}`,
		purpose: `Change the fixture situation in a unique way on page ${page}.`,
		location: 'junction-square',
		time: 'morning',
		layout: 'One wide lead panel followed by two medium beats and a half-page closer.',
		panelCount: 4,
		dialogueGoal: 'Use one short exchange, then let action carry the page.',
		pageTurn: `A new procedural consequence waits after page ${page}.`,
		visualMotif: 'Contradictory arrows and repaired paper records',
		continuity: [`Page ${page} preserves the ledger, board, light, and established positions.`],
		panels: [1, 2, 3, 4].map((panel) =>
			fixturePanel(page, panel, panel === 1 ? firstPanelArt : undefined)
		)
	};
}

async function makeFixture({ rasterArt = false } = {}) {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), 'comic-toolchain-'));
	const seriesDirectory = path.join(root, 'src', 'lib', 'comics', 'fixture-town');
	const episodeDirectory = path.join(seriesDirectory, 'episodes', '001-fixture-album');
	const metadata = {
		id: '001',
		slug: 'fixture-album',
		seriesId: 'fixture-town',
		seriesSlug: 'fixture-town',
		title: 'Fixture Album',
		subtitle: 'A deterministic test production',
		description: 'A small local fixture used to prove the reusable comic data tools.',
		category: 'Comic',
		tags: ['Comic', 'Satire'],
		date: '2026-07-26',
		dateModified: '2026-07-26',
		published: false,
		productionPreview: true,
		storyPageCount: 2,
		readingDirection: 'ltr',
		language: 'en',
		contentGuidance: ['Technological satire'],
		credits: [{ role: 'Test author', name: 'Fixture Runner' }],
		canonicalPath: '/blog/comic/fixture-town/fixture-album',
		transcriptPath: '/blog/comic/fixture-town/fixture-album#transcript',
		printPath: '/downloads/comics/fixture-town/001-fixture-album.pdf',
		cover: null,
		coverAlt: 'A contextual placeholder cover for the deterministic fixture album.'
	};
	await writeYaml(path.join(episodeDirectory, 'episode.yaml'), metadata);
	await writeYaml(path.join(episodeDirectory, 'cover.yaml'), {
		episodeId: '001',
		status: 'artwork-pending',
		provenance: {
			sourceType: null,
			provider: null,
			promptRevision: 1,
			sourcePath: null,
			sourceSha256: null,
			rightsNotes: null,
			humanApproval: {
				status: 'pending',
				approvedBy: null,
				approvedAt: null
			}
		}
	});
	await writeJson(path.join(seriesDirectory, 'data', 'characters.json'), {
		characters: [
			{
				id: 'ila-dastidar',
				name: 'Ila Dastidar',
				continuity: 'Red ledger under the left arm; ink-blue sari and charcoal overshirt.'
			}
		]
	});
	await writeJson(path.join(seriesDirectory, 'data', 'locations.json'), {
		locations: [
			{
				id: 'junction-square',
				name: 'Junction Square',
				continuity: 'Fictional square with contradictory direction boards.'
			}
		]
	});
	await writeJson(path.join(seriesDirectory, 'data', 'props.json'), {
		items: [
			{
				id: 'red-ledger',
				name: 'Red municipal ledger',
				continuity: 'Worn matte cover and repaired spine.'
			}
		]
	});
	await writeYaml(path.join(episodeDirectory, 'script', 'exceptions.yaml'), {
		panelCounts: {}
	});

	let firstPanelArt;
	let rasterFile;
	if (rasterArt) {
		rasterFile = path.join(episodeDirectory, 'panels', 'raw', 'p01-01.png');
		await fs.mkdir(path.dirname(rasterFile), { recursive: true });
		const { default: sharp } = await import('sharp');
		await sharp({
			create: {
				width: 96,
				height: 72,
				channels: 4,
				background: { r: 122, g: 72, b: 43, alpha: 1 }
			}
		})
			.png()
			.toFile(rasterFile);
		firstPanelArt = {
			status: 'draft',
			revision: 1,
			source: 'panels/raw/p01-01.png',
			final: null,
			width: 96,
			height: 72
		};
	}

	for (const page of [1, 2]) {
		await writeYaml(
			path.join(episodeDirectory, 'script', 'pages', `page-${String(page).padStart(3, '0')}.yaml`),
			fixturePage(page, page === 1 ? firstPanelArt : undefined)
		);
	}
	return { root, seriesDirectory, episodeDirectory, rasterFile };
}

async function fixtureSources(fixture) {
	return loadEpisodeSources({
		root: fixture.root,
		episodeDirectory: fixture.episodeDirectory
	});
}

function removeFixtureAfter(testContext, fixture) {
	testContext.after(async () => {
		await fs.rm(fixture.root, { recursive: true, force: true });
	});
}

test('compile, prompts, and validation are deterministic and runtime-schema compatible', async (t) => {
	const fixture = await makeFixture();
	removeFixtureAfter(t, fixture);
	const sources = await fixtureSources(fixture);

	const firstCompile = await compileEpisode({ sources });
	const firstPrompts = await generatePrompts({ sources });
	const compiledBytes = await fs.readFile(firstCompile.compiledPath);
	const transcriptBytes = await fs.readFile(firstCompile.transcriptPath);
	const promptManifestBytes = await fs.readFile(firstPrompts.manifestPath);
	const firstHashes = [hash(compiledBytes), hash(transcriptBytes), hash(promptManifestBytes)];

	const validation = await validateEpisode({ sources });
	assert.equal(validation.valid, true, validation.issues.map((issue) => issue.message).join('\n'));
	assert.equal(validation.summary.pages, 2);
	assert.equal(validation.summary.panels, 8);
	assert.equal(firstCompile.compiled.metadata.category, 'Comic');
	assert.equal(firstCompile.compiled.pages[0].panels[3].size, 'half-page');
	assert.deepEqual(firstCompile.compiled.pages[0].panels[0].dialogue[0].balloon.tailTarget, {
		x: 0.25,
		y: 0.72
	});
	assert.equal(
		firstCompile.compiled.pages[0].panels[1].soundEffects[0].description,
		'A metal municipal gate judders halfway open.'
	);
	assert.equal(
		typeof firstCompile.compiled.pages[0].panels[0].prompt.balloonSafeAreas[0],
		'string'
	);

	const secondCompile = await compileEpisode({ sources });
	const secondPrompts = await generatePrompts({ sources });
	assert.deepEqual(secondCompile.changed, []);
	assert.deepEqual(secondPrompts.changed, []);
	assert.deepEqual(
		[
			hash(await fs.readFile(secondCompile.compiledPath)),
			hash(await fs.readFile(secondCompile.transcriptPath)),
			hash(await fs.readFile(secondPrompts.manifestPath))
		],
		firstHashes
	);
	await writeYaml(path.join(fixture.episodeDirectory, 'script', 'exceptions.yaml'), {
		panelCounts: { 1: 'Digest fixture only.' }
	});
	assert.notEqual((await fixtureSources(fixture)).sourceDigest, sources.sourceDigest);
});

test('mixed narration order interleaves sound and dialogue without replacing dialogue reading order', async (t) => {
	const fixture = await makeFixture();
	removeFixtureAfter(t, fixture);
	const sources = await fixtureSources(fixture);
	const panel = sources.pages[0].panels[0];
	const firstDialogue = panel.dialogue[0];
	firstDialogue.narrationOrder = 1;
	panel.dialogue.push({
		...firstDialogue,
		id: 'p01-01-d02',
		text: 'Second response after the relay.',
		readingOrder: 2,
		narrationOrder: 3,
		balloon: {
			...firstDialogue.balloon,
			x: 0.56,
			manualBreaks: ['Second response', 'after the relay.']
		}
	});
	panel.soundEffects = [
		{
			text: 'KLIK',
			description: 'A relay settles between the two spoken lines.',
			narrationOrder: 2,
			position: { x: 0.49, y: 0.35, z: 8 }
		}
	];

	const validationOptions = {
		sources,
		requireTranscript: false,
		checkCompiled: false,
		requirePromptsForArt: false,
		reportMissingPromptManifest: false
	};
	const validResult = await validateEpisode(validationOptions);
	assert.equal(
		validResult.valid,
		true,
		validResult.issues.map((issue) => issue.message).join('\n')
	);

	const compiled = await compileEpisode({ sources });
	const firstIndex = compiled.transcript.indexOf('Mind the ledger on page 1.');
	const soundIndex = compiled.transcript.indexOf('**Sound:** KLIK');
	const secondIndex = compiled.transcript.indexOf('Second response after the relay.');
	assert.ok(firstIndex >= 0);
	assert.ok(soundIndex > firstIndex);
	assert.ok(secondIndex > soundIndex);
	assert.deepEqual(
		compiled.compiled.pages[0].panels[0].dialogue.map((entry) => entry.readingOrder),
		[1, 2]
	);

	panel.soundEffects[0].narrationOrder = 1;
	const duplicateResult = await validateEpisode(validationOptions);
	assert.ok(
		duplicateResult.errors.some((issue) => issue.code === 'narration-order'),
		'expected duplicate mixed narration order to fail'
	);

	panel.soundEffects[0].narrationOrder = 4;
	const gapResult = await validateEpisode(validationOptions);
	assert.ok(
		gapResult.errors.some((issue) => issue.code === 'narration-order'),
		'expected gapped mixed narration order to fail'
	);
});

test('collision-aware lettering moves balloons off faces and routes tails to the authored speaker', async (t) => {
	const fixture = await makeFixture();
	removeFixtureAfter(t, fixture);
	const originalSources = await fixtureSources(fixture);
	const originalAudit = auditLettering(originalSources, { requireApproved: true });
	assert.equal(originalAudit.summary.missingGeometry, 2);
	assert.equal(originalAudit.ready, false);

	const scaffold = await scaffoldLetteringGeometry(originalSources);
	assert.equal(scaffold.panelCount, 2);
	assert.equal(scaffold.changed, true);

	const geometryFile = path.join(fixture.episodeDirectory, 'lettering', 'geometry.yaml');
	const geometry = {
		format: 'suvroghosh-comic-lettering-geometry',
		formatVersion: 1,
		panels: Object.fromEntries(
			['p01-01', 'p02-01'].map((panelId) => [
				panelId,
				{
					status: 'approved',
					speakerAnchors: {
						'ila-dastidar': { x: 0.17, y: 0.15 }
					},
					protectedZones: [
						{
							id: `${panelId}-ila-face`,
							kind: 'face',
							characterId: 'ila-dastidar',
							x: 0.08,
							y: 0.04,
							width: 0.2,
							height: 0.22,
							padding: 0.008,
							protect: 'both'
						}
					]
				}
			])
		)
	};
	await writeYaml(geometryFile, geometry);
	const sources = await fixtureSources(fixture);
	assert.equal(sources.sourceDigest, originalSources.sourceDigest);
	assert.notEqual(sources.letteringDigest, originalSources.letteringDigest);

	const panel = sources.pages[0].panels[0];
	const plan = planPanelLettering(sources, panel);
	assert.deepEqual(plan.issues, []);
	assert.equal(plan.geometryStatus, 'approved');
	assert.equal(plan.entries[0].automatic, true);
	assert.equal(plan.entries[0].tailRoute.safe, true);
	assert.notDeepEqual(plan.entries[0].balloon, {
		x: panel.dialogue[0].balloon.x,
		y: panel.dialogue[0].balloon.y,
		width: panel.dialogue[0].balloon.width,
		height: panel.dialogue[0].balloon.height
	});
	const face = geometry.panels['p01-01'].protectedZones[0];
	const moved = plan.entries[0].balloon;
	assert.ok(
		moved.x + moved.width <= face.x ||
			face.x + face.width <= moved.x ||
			moved.y + moved.height <= face.y ||
			face.y + face.height <= moved.y
	);
	const endpoint = plan.entries[0].tailRoute.end;
	assert.ok(
		endpoint.x <= face.x ||
			endpoint.x >= face.x + face.width ||
			endpoint.y <= face.y ||
			endpoint.y >= face.y + face.height
	);

	const audit = auditLettering(sources, { requireApproved: true });
	assert.equal(audit.ready, true, JSON.stringify(audit, null, 2));
	const svg = renderPageSvg(
		sources,
		sources.pages[0],
		path.join(fixture.episodeDirectory, 'pages', 'working', 'page-001.svg')
	);
	assert.match(svg, /class="comic-balloon-tail"/);
	assert.match(svg, /data-speaker-id="ila-dastidar"/);
	assert.match(svg, /data-route-safe="true"/);
	assert.match(svg, / Q /);
	assert.match(svg, /data-auto-layout="true"/);
});

test('later speech tails route around earlier balloons', async (t) => {
	const fixture = await makeFixture();
	removeFixtureAfter(t, fixture);
	const sources = await fixtureSources(fixture);
	const panel = sources.pages[0].panels[0];
	panel.dialogue[0].balloon = {
		...panel.dialogue[0].balloon,
		x: 0.32,
		y: 0.34,
		width: 0.32,
		height: 0.16
	};
	panel.dialogue.push({
		...panel.dialogue[0],
		id: 'p01-01-d02',
		text: 'The second reply must route around the first.',
		readingOrder: 2,
		balloon: {
			...panel.dialogue[0].balloon,
			x: 0.64,
			y: 0.05,
			width: 0.32,
			height: 0.16,
			manualBreaks: ['The second reply must', 'route around the first.']
		}
	});
	sources.letteringGeometry = {
		format: 'suvroghosh-comic-lettering-geometry',
		formatVersion: 1,
		panels: {
			'p01-01': {
				status: 'approved',
				speakerAnchors: {
					'ila-dastidar': { x: 0.15, y: 0.77 }
				},
				protectedZones: [
					{
						id: 'p01-01-ila-face',
						kind: 'face',
						characterId: 'ila-dastidar',
						x: 0.07,
						y: 0.68,
						width: 0.18,
						height: 0.2,
						padding: 0.008,
						protect: 'both'
					}
				]
			}
		}
	};

	const plan = planPanelLettering(sources, panel, {
		placement: { panel, x: 0, y: 0, width: 800, height: 600 }
	});
	assert.deepEqual(plan.issues, []);
	assert.equal(plan.entries.length, 2);
	const earlier = plan.entries[0].balloon;
	const route = plan.entries[1].tailRoute;
	assert.equal(route.safe, true);
	for (let index = 1; index < 24; index += 1) {
		const progress = index / 24;
		const inverse = 1 - progress;
		const point = {
			x:
				inverse * inverse * route.start.x +
				2 * inverse * progress * route.control.x +
				progress * progress * route.end.x,
			y:
				inverse * inverse * route.start.y +
				2 * inverse * progress * route.control.y +
				progress * progress * route.end.y
		};
		assert.ok(
			point.x <= earlier.x - 0.006 ||
				point.x >= earlier.x + earlier.width + 0.006 ||
				point.y <= earlier.y - 0.006 ||
				point.y >= earlier.y + earlier.height + 0.006,
			`later tail entered the earlier balloon at sample ${index}`
		);
	}
});

test('lettering geometry follows the final preserveAspectRatio crop', async (t) => {
	const fixture = await makeFixture();
	removeFixtureAfter(t, fixture);
	const geometryFile = path.join(fixture.episodeDirectory, 'lettering', 'geometry.yaml');
	await writeYaml(geometryFile, {
		format: 'suvroghosh-comic-lettering-geometry',
		formatVersion: 1,
		panels: {
			'p01-01': {
				status: 'approved',
				speakerAnchors: {
					'ila-dastidar': { x: 0.17, y: 0.42 }
				},
				protectedZones: [
					{
						id: 'p01-01-ila-face',
						kind: 'face',
						characterId: 'ila-dastidar',
						x: 0.08,
						y: 0.3,
						width: 0.2,
						height: 0.22,
						padding: 0.008,
						protect: 'both'
					}
				]
			}
		}
	});
	const sources = await fixtureSources(fixture);
	const panel = sources.pages[0].panels[0];
	panel.art = { ...panel.art, width: 1200, height: 900 };
	const plan = planPanelLettering(sources, panel, {
		placement: { panel, x: 0, y: 0, width: 800, height: 400 }
	});
	assert.deepEqual(plan.issues, []);

	// A 4:3 source sliced into a 2:1 viewport is cropped equally at top and bottom.
	const transformedFace = { x: 0.08, y: 0.2, width: 0.2, height: 0.33 };
	const moved = plan.entries[0].balloon;
	assert.ok(
		moved.x + moved.width <= transformedFace.x ||
			transformedFace.x + transformedFace.width <= moved.x ||
			moved.y + moved.height <= transformedFace.y ||
			transformedFace.y + transformedFace.height <= moved.y
	);
	const endpoint = plan.entries[0].tailRoute.end;
	assert.ok(
		endpoint.x <= transformedFace.x ||
			endpoint.x >= transformedFace.x + transformedFace.width ||
			endpoint.y <= transformedFace.y ||
			endpoint.y >= transformedFace.y + transformedFace.height
	);
	const gapFromFacePixels = Math.hypot(
		Math.max(
			transformedFace.x - endpoint.x,
			0,
			endpoint.x - (transformedFace.x + transformedFace.width)
		) * 800,
		Math.max(
			transformedFace.y - endpoint.y,
			0,
			endpoint.y - (transformedFace.y + transformedFace.height)
		) * 400
	);
	assert.ok(
		gapFromFacePixels >= 11.5,
		`expected the tail tip to stop in visible clear air, got ${gapFromFacePixels.toFixed(2)}px`
	);
});

test('stale prompts are detected but deterministic prompt regeneration is not deadlocked', async (t) => {
	const fixture = await makeFixture();
	removeFixtureAfter(t, fixture);
	let sources = await fixtureSources(fixture);
	await compileEpisode({ sources });
	await generatePrompts({ sources });

	const pageFile = path.join(fixture.episodeDirectory, 'script', 'pages', 'page-001.yaml');
	const page = (await readStructuredFile(pageFile)).value;
	page.panels[0].action =
		'Ila checks the amended ledger while a crooked direction board points both ways.';
	await writeYaml(pageFile, page);
	sources = await fixtureSources(fixture);
	const stale = await validateEpisode({
		sources,
		requireTranscript: false,
		checkCompiled: false
	});
	const staleCodes = new Set(stale.errors.map((issue) => issue.code));
	assert.ok(staleCodes.has('prompt-manifest-stale'));
	assert.ok(staleCodes.has('prompt-content-stale'));

	await compileEpisode({ sources });
	await generatePrompts({ sources });
	const refreshed = await validateEpisode({ sources });
	assert.equal(refreshed.valid, true, refreshed.issues.map((issue) => issue.message).join('\n'));
});

test('signage placements compile into one deterministic lettering manifest and every edition', async (t) => {
	const fixture = await makeFixture();
	removeFixtureAfter(t, fixture);
	await writeYaml(path.join(fixture.seriesDirectory, 'data', 'signage.yaml'), {
		entries: [
			{
				id: 'sign-fixture-rule',
				locationId: 'junction-square',
				english: 'HUMAN OVERRIDES ARE LOGGED AND REVIEWED.',
				bengali: 'মানবীয় সিদ্ধান্ত নথিভুক্ত ও পর্যালোচিত হয়।',
				translationState: 'needs-human-review',
				reviewer: null,
				reviewedAt: null,
				publicationAllowed: false,
				placements: [
					{
						panelId: 'p01-01',
						x: 0.08,
						y: 0.12,
						width: 0.46,
						height: 0.12,
						kind: 'rule-strip',
						textVariant: 'english'
					}
				]
			}
		]
	});
	const sources = await fixtureSources(fixture);
	const compiled = await compileEpisode({ sources });
	await generatePrompts({ sources });
	const validation = await validateEpisode({ sources });
	assert.equal(validation.valid, true, validation.issues.map((issue) => issue.message).join('\n'));
	assert.equal(compiled.compiled.lettering.entryCount, 1);
	assert.equal(compiled.compiled.pages[0].panels[0].overlays[0].signId, 'sign-fixture-rule');
	assert.equal(
		compiled.compiled.pages[0].panels[0].overlays[0].text,
		'HUMAN OVERRIDES ARE LOGGED AND REVIEWED.'
	);
	assert.match(compiled.transcript, /Visible text \(rule-strip\)/);
	const lettering = JSON.parse(await fs.readFile(compiled.letteringManifestPath, 'utf8'));
	assert.deepEqual(lettering, compiled.compiled.lettering);

	const assembled = await assemblePages({ sources });
	const svg = await fs.readFile(path.join(assembled.outputDirectory, 'page-001.svg'), 'utf8');
	assert.match(svg, /data-sign-id="sign-fixture-rule"/);
	assert.deepEqual(assembled.manifest.entries[0].letteringIds, ['sign-fixture-rule--p01-01--01']);

	const cultural = await generateCulturalReview({ sources });
	assert.equal(cultural.findings.filter((finding) => finding.code === 'signage-review').length, 1);
});

test('validation rejects authoring shapes that diverge from the runtime schema', async (t) => {
	const fixture = await makeFixture();
	removeFixtureAfter(t, fixture);
	const sources = await fixtureSources(fixture);
	const panel = sources.pages[0].panels[0];
	panel.size = 'inset';
	panel.prompt.balloonSafeAreas = [{ x: 0.05, y: 0.05, width: 0.3, height: 0.2, z: 2 }];
	panel.dialogue[0].balloon.tailTarget = 'ila-dastidar';
	panel.dialogue[0].balloon.tailDirection = 'down-left';
	panel.dialogue[0].balloon.manualBreaks = false;
	sources.pages[0].panels[1].soundEffects = ['KRRNK'];

	const result = await validateEpisode({
		sources,
		requireTranscript: false,
		checkCompiled: false,
		requirePromptsForArt: false,
		reportMissingPromptManifest: false
	});
	const codes = new Set(result.errors.map((issue) => issue.code));
	assert.equal(result.valid, false);
	for (const code of [
		'panel-size',
		'panel-prompt',
		'balloon-tail',
		'balloon-tail-direction',
		'balloon-breaks',
		'sound-effect'
	]) {
		assert.ok(codes.has(code), `expected validation code ${code}`);
	}
});

test('reports, contact sheet, and SVG assembly use contextual placeholders', async (t) => {
	const fixture = await makeFixture();
	removeFixtureAfter(t, fixture);
	const sources = await fixtureSources(fixture);
	const sourcePage = path.join(fixture.episodeDirectory, 'script', 'pages', 'page-001.yaml');
	const sourceHash = hash(await fs.readFile(sourcePage));

	const director = await generateDirectorReport({ sources });
	const cultural = await generateCulturalReview({ sources });
	const contact = await generateContactSheet({ sources });
	sources.pages[0].panels[0].dialogue[0].balloon.width = 0.12;
	sources.pages[0].panels[0].dialogue[0].balloon.manualBreaks = [
		sources.pages[0].panels[0].dialogue[0].text
	];
	const assembled = await assemblePages({ sources });
	assert.match(director.report, /Deterministic comic director report/);
	assert.match(cultural.report, /Required human checklist/);
	assert.match(contact.html, /production contact sheet/i);
	assert.match(contact.html, /p01-01 · missing/);
	const pageSvg = await fs.readFile(path.join(assembled.outputDirectory, 'page-001.svg'), 'utf8');
	assert.match(pageSvg, /CONTEXTUAL PRODUCTION PLACEHOLDER/);
	assert.doesNotMatch(pageSvg, />Mind the ledger on page 1\.</);
	assert.match(pageSvg, /data-auto-sized="true"/);
	assert.match(pageSvg, />Mind the ledger on</);
	assert.match(pageSvg, />page 1\.</);
	assert.equal(hash(await fs.readFile(sourcePage)), sourceHash);
	assert.deepEqual((await assemblePages({ sources })).changed, []);
});

test('published metadata cannot bypass rights, release, public-asset, and named-human gates', async (t) => {
	const fixture = await makeFixture();
	removeFixtureAfter(t, fixture);
	const sources = await fixtureSources(fixture);
	sources.metadata.published = true;
	sources.metadata.productionPreview = false;
	for (const page of sources.pages) {
		for (const panel of page.panels) {
			panel.art = {
				status: 'final',
				revision: 1,
				source: null,
				final: 'panels/approved/non-public.png',
				width: 1200,
				height: 900
			};
		}
	}
	const result = await validateEpisode({
		sources,
		requireTranscript: false,
		checkCompiled: false,
		checkPromptManifest: false
	});
	const codes = new Set(result.errors.map((issue) => issue.code));
	for (const code of [
		'publication-front-matter',
		'publication-public-art',
		'publication-cover',
		'publication-print'
	]) {
		assert.ok(codes.has(code), `expected publication gate ${code}`);
	}
});

test('new-episode scaffold is Comic-category, 62-page by default, and refuses overwrite', async (t) => {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), 'comic-scaffold-'));
	t.after(async () => {
		await fs.rm(root, { recursive: true, force: true });
	});
	const result = await scaffoldEpisode({
		root,
		series: 'fixture-series',
		title: 'Second Municipal Morning',
		id: '002',
		date: '2026-07-26'
	});
	const parsed = await readStructuredFile(path.join(result.episodeDirectory, 'episode.yaml'));
	assert.equal(parsed.value.category, 'Comic');
	assert.equal(parsed.value.storyPageCount, 62);
	assert.equal(parsed.value.published, false);
	assert.equal(parsed.value.productionPreview, true);
	assert.equal(
		await fs
			.stat(path.join(result.episodeDirectory, 'panels', 'rejected'))
			.then((entry) => entry.isDirectory()),
		true
	);
	assert.equal(
		(await readStructuredFile(path.join(result.episodeDirectory, 'cover.yaml'))).value.status,
		'artwork-pending'
	);
	await assert.rejects(
		scaffoldEpisode({
			root,
			series: 'fixture-series',
			title: 'Second Municipal Morning',
			id: '002',
			date: '2026-07-26'
		}),
		ComicToolError
	);
});

test('provenance ledger covers every panel and preserves human rights fields', async (t) => {
	const fixture = await makeFixture();
	removeFixtureAfter(t, fixture);
	const command = path.join(process.cwd(), 'scripts', 'comics', 'provenance.mjs');
	const args = ['--root', fixture.root, '--episode-dir', fixture.episodeDirectory];
	await execFileAsync(process.execPath, [command, ...args]);
	const provenanceFile = path.join(fixture.episodeDirectory, 'provenance.json');
	const first = JSON.parse(await fs.readFile(provenanceFile, 'utf8'));
	assert.equal(first.counts.cover, 1);
	assert.equal(first.counts.panels, 8);
	assert.equal(first.panels[0].panelId, 'p01-01');
	assert.equal(first.panels[0].promptFile, 'prompts/page-001/panel-001.txt');
	assert.equal(first.publicationReady, false);

	first.panels[0].creator = 'Fixture Artist';
	first.panels[0].licenseOrOwnershipNote = 'Owned fixture artwork.';
	await writeJson(provenanceFile, first);
	await execFileAsync(process.execPath, [command, ...args]);
	const secondBytes = await fs.readFile(provenanceFile);
	const second = JSON.parse(secondBytes);
	assert.equal(second.panels[0].creator, 'Fixture Artist');
	assert.equal(second.panels[0].licenseOrOwnershipNote, 'Owned fixture artwork.');
	await execFileAsync(process.execPath, [command, ...args]);
	assert.equal(hash(await fs.readFile(provenanceFile)), hash(secondBytes));
});

test('cover provenance hashes the selected final path and requires that hash for rights readiness', async (t) => {
	const fixture = await makeFixture();
	removeFixtureAfter(t, fixture);
	const approvedDirectory = path.join(fixture.episodeDirectory, 'panels', 'approved');
	await fs.mkdir(approvedDirectory, { recursive: true });
	const currentCover = path.join(approvedDirectory, 'cover__lettered__r1.png');
	const obsoleteCover = path.join(approvedDirectory, 'cover__obsolete.png');
	const { default: sharp } = await import('sharp');
	await sharp({
		create: {
			width: 24,
			height: 32,
			channels: 4,
			background: { r: 142, g: 52, b: 45, alpha: 1 }
		}
	})
		.png()
		.toFile(currentCover);
	await sharp({
		create: {
			width: 24,
			height: 32,
			channels: 4,
			background: { r: 49, g: 95, b: 114, alpha: 1 }
		}
	})
		.png()
		.toFile(obsoleteCover);
	const coverSource = {
		episodeId: '001',
		status: 'final',
		provenance: {
			sourceType: 'original fixture generation',
			provider: 'fixture provider',
			creator: 'Fixture Artist',
			promptRevision: 1,
			sourcePath: null,
			finalPath: 'panels/approved/cover__lettered__r1.png',
			rightsNotes: 'Owned fixture artwork.',
			humanApproval: {
				status: 'approved',
				approvedBy: 'Fixture Editor',
				approvedAt: '2026-07-28'
			}
		}
	};
	await writeYaml(path.join(fixture.episodeDirectory, 'cover.yaml'), coverSource);
	const provenanceFile = path.join(fixture.episodeDirectory, 'provenance.json');
	await writeJson(provenanceFile, {
		cover: {
			finalPath: 'panels/approved/cover__obsolete.png',
			finalSha256: hash(await fs.readFile(obsoleteCover))
		},
		panels: []
	});

	const command = path.join(process.cwd(), 'scripts', 'comics', 'provenance.mjs');
	const args = ['--root', fixture.root, '--episode-dir', fixture.episodeDirectory];
	await execFileAsync(process.execPath, [command, ...args]);
	const current = JSON.parse(await fs.readFile(provenanceFile, 'utf8'));
	assert.equal(current.cover.finalPath, 'panels/approved/cover__lettered__r1.png');
	assert.equal(current.cover.finalSha256, hash(await fs.readFile(currentCover)));
	assert.notEqual(current.cover.finalSha256, hash(await fs.readFile(obsoleteCover)));
	assert.equal(current.cover.rightsReady, true);

	coverSource.provenance.finalPath = 'panels/approved/cover__missing.png';
	await writeYaml(path.join(fixture.episodeDirectory, 'cover.yaml'), coverSource);
	await execFileAsync(process.execPath, [command, ...args]);
	const missing = JSON.parse(await fs.readFile(provenanceFile, 'utf8'));
	assert.equal(missing.cover.finalSha256, null);
	assert.equal(missing.cover.rightsReady, false);
});

test('prompt revisions are immutable, versioned, and bounded', async (t) => {
	const fixture = await makeFixture();
	removeFixtureAfter(t, fixture);
	const sources = await fixtureSources(fixture);
	await generatePrompts({ sources });
	const first = await revisePrompt({
		sources,
		panel: 'p01-01',
		note: 'The ledger silhouette is unclear.',
		variants: 2
	});
	const second = await revisePrompt({
		sources,
		panel: 'p01-01',
		note: 'The balloon reserve crowds Ila’s head.',
		variants: 1
	});
	assert.equal(first.revision, 1);
	assert.equal(second.revision, 2);
	assert.equal(first.variants.length, 2);
	assert.match(first.variants[0].file, /p01-01\/v001\/variant-01\.txt$/);
	const manifest = JSON.parse(await fs.readFile(second.manifestPath, 'utf8'));
	assert.equal(manifest.revisions.length, 2);
	await assert.rejects(
		revisePrompt({
			sources,
			panel: 'p01-01',
			note: 'Unbounded request.',
			variants: 6
		}),
		/variants may not exceed 5/
	);
});

test('web export creates stable raster derivatives without altering source art', async (t) => {
	const fixture = await makeFixture({ rasterArt: true });
	removeFixtureAfter(t, fixture);
	const sources = await fixtureSources(fixture);
	const sourceBytes = await fs.readFile(fixture.rasterFile);
	const sourceHash = hash(sourceBytes);
	const result = await exportWeb({ sources, widths: [64] });
	const rasterEntry = result.manifest.entries.find((entry) => entry.panelId === 'p01-01');
	assert.equal(rasterEntry.assets.length, 2);
	assert.deepEqual(
		new Set(rasterEntry.assets.map((asset) => asset.format)),
		new Set(['webp', 'avif'])
	);
	assert.equal(result.manifest.entries.filter((entry) => entry.placeholder).length, 7);
	assert.equal(hash(await fs.readFile(fixture.rasterFile)), sourceHash);
	assert.deepEqual((await exportWeb({ sources, widths: [64] })).changed, []);
	await assert.rejects(
		exportWeb({
			sources,
			outputDirectory: path.join(fixture.root, 'static', 'comic-export'),
			widths: [64]
		}),
		/refuses to write directly into static/
	);
});
