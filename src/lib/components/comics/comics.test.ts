import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import type {
	ComicBalloonTailRoute,
	ComicDialogue,
	ComicEpisode,
	ComicPage,
	ComicPanel
} from '$lib/comics/schema';
import ComicPanelComponent from './ComicPanel.svelte';
import ComicReader from './ComicReader.svelte';
import ComicTextOverlayComponent from './ComicTextOverlay.svelte';
import ComicTranscript from './ComicTranscript.svelte';
import SpeechBalloon from './SpeechBalloon.svelte';

function tailRoute(overrides: Partial<ComicBalloonTailRoute> = {}): ComicBalloonTailRoute {
	return {
		start: { x: 0.29, y: 0.06 },
		control: { x: 0.29, y: 0.35 },
		end: { x: 0.82, y: 0.74 },
		side: 'up',
		safe: true,
		...overrides
	};
}

function dialogue(
	id: string,
	text: string,
	readingOrder: number,
	overrides: Partial<ComicDialogue> = {}
): ComicDialogue {
	return {
		id,
		speaker: 'ila-dastidar',
		text,
		style: 'speech',
		readingOrder,
		balloon: {
			x: 0.08,
			y: 0.06,
			width: 0.43,
			height: 0.16,
			z: 10,
			tailDirection: 'down'
		},
		...overrides
	};
}

function panel(id: string, panelNumber: number, action: string): ComicPanel {
	return {
		id,
		panel: panelNumber,
		size: 'medium',
		aspectRatio: '4:3',
		camera: 'Eye-level medium shot',
		location: 'junction-square',
		time: 'late morning',
		characters: [
			{
				id: 'ila-dastidar',
				position: 'centre',
				emotion: 'alert',
				pose: 'Holding the ledger',
				facing: 'right'
			}
		],
		props: ['municipal-red-ledger'],
		foreground: 'Ledger',
		middleGround: 'Ila',
		background: 'Square',
		action,
		dialogue: [
			dialogue(`${id}-d02`, 'Second in source, second in reading order.', 2, {
				narrationOrder: 3
			}),
			dialogue(`${id}-d01`, 'First in reading order.', 1, { narrationOrder: 1 })
		],
		soundEffects: [
			{
				text: 'KLIK',
				description: 'A relay settles.',
				narrationOrder: 2,
				position: { x: 0.66, y: 0.29, z: 8 }
			}
		],
		visualJoke: 'The arrow points into the support.',
		continuity: ['Ledger stays under Ila’s left arm.'],
		prompt: {
			lighting: 'Warm daylight',
			palette: 'Municipal red and faded blue',
			composition: 'Ila centre with clear upper edge',
			balloonSafeAreas: ['upper edge'],
			negative: ['embedded lettering']
		},
		accessibility: {
			alt: 'Ila stands in Junction Square with her ledger.',
			description: 'Ila holds the red municipal ledger while a relay clicks behind her.'
		},
		art: { status: 'missing', revision: 0, source: null, final: null }
	};
}

function page(pageNumber: number, action: string): ComicPage {
	const pagePanel = panel(`p${String(pageNumber).padStart(2, '0')}-01`, 1, action);
	pagePanel.accessibility.description = `${action} Accessible description.`;
	return {
		page: pageNumber,
		title: `Page ${pageNumber}`,
		purpose: 'Advance the test fixture.',
		location: 'junction-square',
		time: 'late morning',
		layout: 'One medium panel',
		panelCount: 1,
		dialogueGoal: 'Keep reading order explicit.',
		pageTurn: 'Turn to the next fixture.',
		visualMotif: 'Arrows and ledgers',
		continuity: ['The ledger remains visible.'],
		panels: [pagePanel]
	};
}

function episode(): ComicEpisode {
	return {
		metadata: {
			id: '001',
			slug: 'the-efficiency-inspector',
			seriesId: 'the-last-analog-town',
			seriesSlug: 'the-last-analog-town',
			title: 'The Efficiency Inspector',
			subtitle: 'The first Golmohar Junction adventure',
			description: 'A production test episode.',
			category: 'Comic',
			tags: ['Comic'],
			date: '2026-07-26',
			dateModified: '2026-07-26',
			published: false,
			productionPreview: true,
			storyPageCount: 2,
			readingDirection: 'ltr',
			language: 'en',
			contentGuidance: ['Mild comic peril'],
			credits: [{ role: 'Created by', name: 'Suvro Ghosh' }],
			canonicalPath: '/blog/comic/the-last-analog-town/the-efficiency-inspector',
			transcriptPath: '/blog/comic/the-last-analog-town/the-efficiency-inspector#transcript',
			printPath:
				'/downloads/comics/the-last-analog-town/001-the-efficiency-inspector-production-edition.pdf',
			cover: null,
			coverAlt: 'The cast meets in fictional Golmohar Junction.'
		},
		pages: [page(1, 'Only the current page action is rendered.'), page(2, 'Deferred page action.')]
	};
}

describe('Comic components', () => {
	it('converts normalised balloon and sound-effect coordinates into percentages', () => {
		const balloon = render(SpeechBalloon, {
			props: { dialogue: dialogue('p01-01-d01', 'Positioned line.', 1) }
		}).body;
		expect(balloon).toContain('--balloon-x:8%');
		expect(balloon).toContain('--balloon-width:43%');

		const renderedPanel = render(ComicPanelComponent, {
			props: { panel: panel('p01-01', 1, 'A contextual fallback action.'), pageNumber: 1 }
		}).body;
		expect(renderedPanel).toContain('left:66%');
		expect(renderedPanel).toContain('top:29%');

		const overlay = render(ComicTextOverlayComponent, {
			props: {
				overlay: {
					id: 'sign-rule--p01-01--01',
					signId: 'sign-rule',
					panelId: 'p01-01',
					placementIndex: 1,
					kind: 'rule-strip',
					textVariant: 'english',
					text: 'UNKNOWN IS NOT FALSE.',
					language: 'en',
					x: 0.08,
					y: 0.12,
					width: 0.46,
					height: 0.12,
					z: 8,
					reviewRequired: false,
					reviewState: 'not-required',
					publicationAllowed: true
				}
			}
		}).body;
		expect(overlay).toContain('--overlay-x:8%');
		expect(overlay).toContain('--overlay-width:46%');
		expect(overlay).toContain('data-sign-id="sign-rule"');
	});

	it('renders an audited routed tail to the exact normalised endpoint', () => {
		const body = render(SpeechBalloon, {
			props: {
				dialogue: dialogue('p01-01-d01', 'Routed line.', 1, {
					balloon: {
						x: 0.08,
						y: 0.06,
						width: 0.43,
						height: 0.16,
						z: 10,
						tailDirection: 'up',
						tailRoute: tailRoute()
					}
				})
			}
		}).body;
		expect(body).toContain('class="comic-balloon__tail-route');
		expect(body).toContain('style="z-index:10"');
		expect(body).toContain('data-tail-control-x="0.29"');
		expect(body).toContain('data-tail-control-y="0.35"');
		expect(body).toContain('data-tail-end-x="0.82"');
		expect(body).toContain('data-tail-end-y="0.74"');
		expect(body).toContain('d="M 0.282 0.06 Q 0.29 0.35 0.82 0.74 Q 0.29 0.35 0.298 0.06 Z"');
		expect(body).toContain('comic-balloon--no-tail');
	});

	it('suppresses the earlier routed tail when compiled dialogue continues with the same speaker', () => {
		const sameSpeakerPanel = panel('p01-01', 1, 'A same-speaker continuation.');
		const firstDialogue = sameSpeakerPanel.dialogue.find((entry) => entry.readingOrder === 1)!;
		const finalDialogue = sameSpeakerPanel.dialogue.find((entry) => entry.readingOrder === 2)!;
		firstDialogue.balloon.tailRoute = tailRoute({ end: { x: 0.24, y: 0.72 } });
		firstDialogue.balloon.tailDirection = 'none';
		finalDialogue.balloon.tailRoute = tailRoute();
		finalDialogue.balloon.tailDirection = 'up';

		const body = render(ComicPanelComponent, {
			props: { panel: sameSpeakerPanel, pageNumber: 1 }
		}).body;
		expect(body.match(/data-routed-tail=/g)).toHaveLength(1);
		expect(body).not.toContain('data-routed-tail="p01-01-d01"');
		expect(body).toContain('data-routed-tail="p01-01-d02"');
		expect(body).toMatch(
			/class="[^"]*comic-balloon--no-tail[^"]*"[^>]*data-dialogue-id="p01-01-d01"/
		);
	});

	it('preserves explicit balloon line breaks without changing dialogue text', () => {
		const body = render(SpeechBalloon, {
			props: {
				dialogue: dialogue('p01-01-d01', 'First line Second line', 1, {
					balloon: {
						x: 0.08,
						y: 0.06,
						width: 0.43,
						height: 0.16,
						z: 10,
						tailDirection: 'down',
						manualBreaks: ['First line', 'Second line']
					}
				})
			}
		}).body;
		const firstLine = body.indexOf('First line');
		const breakElement = body.indexOf('<br/>', firstLine);
		const secondLine = body.indexOf('Second line', breakElement);
		expect(firstLine).toBeGreaterThanOrEqual(0);
		expect(breakElement).toBeGreaterThan(firstLine);
		expect(secondLine).toBeGreaterThan(breakElement);
	});

	it('renders contextual missing-art state and dialogue in authored reading order', () => {
		const body = render(ComicPanelComponent, {
			props: { panel: panel('p01-01', 1, 'A contextual fallback action.'), pageNumber: 1 }
		}).body;
		expect(body).toContain('p01-01');
		expect(body).toContain('missing');
		expect(body).toContain('Eye-level medium shot');
		expect(body).toContain('A contextual fallback action.');
		expect(body.indexOf('First in reading order.')).toBeLessThan(
			body.indexOf('Second in source, second in reading order.')
		);
	});

	it('renders only the active story page in the reader while keeping navigation available', () => {
		const body = render(ComicReader, { props: { episode: episode() } }).body;
		expect(body).toContain('Only the current page action is rendered.');
		expect(body).not.toContain('Deferred page action.');
		expect(body).toContain('aria-label="Go to story page 2: Page 2"');
		expect(body).toContain('aria-label="Comic reader controls"');
	});

	it('renders the complete transcript once in canonical page and panel order', () => {
		const body = render(ComicTranscript, { props: { episode: episode() } }).body;
		expect(body.indexOf('Page 1: Page 1')).toBeLessThan(body.indexOf('Page 2: Page 2'));
		expect(body).toContain('Only the current page action is rendered.');
		expect(body).toContain('Deferred page action.');
		expect(body).toContain('Sound:');
		const firstDialogue = body.indexOf('First in reading order.');
		const sound = body.indexOf('<strong>Sound:</strong> KLIK');
		const secondDialogue = body.indexOf('Second in source, second in reading order.');
		expect(firstDialogue).toBeGreaterThanOrEqual(0);
		expect(sound).toBeGreaterThan(firstDialogue);
		expect(secondDialogue).toBeGreaterThan(sound);
	});
});
