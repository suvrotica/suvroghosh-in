import type {
	CrosswordEntry,
	CrosswordPuzzle,
	PuzzleCell,
	PuzzleTutorialStep
} from '$lib/games/crossword/types';
import { healthcareItConcepts } from './concepts';
import type { AuthoredPlacement } from './model';
import { HEALTHCARE_IT_PACK_ID, HEALTHCARE_IT_REVIEWED_AT } from './model';

type PuzzleDraft = Omit<
	CrosswordPuzzle,
	'packId' | 'cells' | 'entries' | 'reviewedAt' | 'tutorial'
> & {
	placements: AuthoredPlacement[];
	tutorial?: (puzzleId: string) => PuzzleTutorialStep[];
};

const placement = (
	conceptId: string,
	row: number,
	column: number,
	direction: AuthoredPlacement['direction'],
	clue?: string
): AuthoredPlacement => ({ conceptId, row, column, direction, ...(clue ? { clue } : {}) });

function entryId(puzzleId: string, item: AuthoredPlacement): string {
	return `${puzzleId}-${item.conceptId}-${item.direction}`;
}

function hydratePuzzle(draft: PuzzleDraft): CrosswordPuzzle {
	const entries: CrosswordEntry[] = draft.placements.map((item) => {
		const concept = healthcareItConcepts[item.conceptId];
		if (!concept) throw new Error(`Unknown healthcare IT concept: ${item.conceptId}`);
		return {
			id: entryId(draft.id, item),
			conceptId: concept.id,
			answer: concept.answer,
			...(concept.displayAnswer ? { displayAnswer: concept.displayAnswer } : {}),
			direction: item.direction,
			row: item.row,
			column: item.column,
			clue: item.clue ?? concept.clue,
			hints: concept.hints.map((hint) => ({
				...hint,
				...(hint.revealPositions ? { revealPositions: [...hint.revealPositions] } : {})
			})),
			learning: {
				...concept.learning,
				related: concept.learning.related ? [...concept.learning.related] : [],
				sources: concept.learning.sources.map((source) => ({ ...source }))
			},
			tags: [...concept.tags]
		};
	});

	const open = new Set<string>();
	const letters = new Map<string, string>();
	for (const entry of entries) {
		for (let index = 0; index < entry.answer.length; index += 1) {
			const row = entry.row + (entry.direction === 'down' ? index : 0);
			const column = entry.column + (entry.direction === 'across' ? index : 0);
			if (row < 0 || column < 0 || row >= draft.height || column >= draft.width) {
				throw new Error(`${entry.id} runs outside ${draft.width}x${draft.height}`);
			}
			const key = `${row},${column}`;
			const existing = letters.get(key);
			if (existing && existing !== entry.answer[index]) {
				throw new Error(`${entry.id} conflicts at ${key}: ${existing}/${entry.answer[index]}`);
			}
			open.add(key);
			letters.set(key, entry.answer[index]);
		}
	}

	const cells: PuzzleCell[] = [];
	for (let row = 0; row < draft.height; row += 1) {
		for (let column = 0; column < draft.width; column += 1) {
			cells.push({ row, column, kind: open.has(`${row},${column}`) ? 'open' : 'block' });
		}
	}

	return {
		id: draft.id,
		packId: HEALTHCARE_IT_PACK_ID,
		title: draft.title,
		...(draft.subtitle ? { subtitle: draft.subtitle } : {}),
		topicIds: [...draft.topicIds],
		level: draft.level,
		sessionFormat: draft.sessionFormat,
		estimatedMinutes: draft.estimatedMinutes,
		width: draft.width,
		height: draft.height,
		cells,
		entries,
		...(draft.completionNote ? { completionNote: draft.completionNote } : {}),
		reviewedAt: HEALTHCARE_IT_REVIEWED_AT,
		...(draft.tutorial ? { tutorial: draft.tutorial(draft.id) } : {})
	};
}

const drafts: PuzzleDraft[] = [
	{
		id: 'first-crossing',
		title: 'First Crossing',
		subtitle: 'A guided six-answer tour of clues, crossings, hints and teaching cards.',
		topicIds: ['mixed-systems', 'interoperability-hie', 'clinical-terminology'],
		level: 'refresh',
		sessionFormat: 'tutorial',
		estimatedMinutes: 4,
		width: 8,
		height: 8,
		placements: [
			placement('resource', 4, 0, 'across'),
			placement('audit', 3, 4, 'down'),
			placement('mapping', 6, 0, 'across'),
			placement('loinc', 0, 6, 'down'),
			placement('fhir', 1, 0, 'down'),
			placement('profile', 0, 1, 'across')
		],
		completionNote:
			'You crossed models, terminology and accountability. Nothing caught fire, including the standard.',
		tutorial: (puzzleId) => [
			{
				id: 'select',
				title: 'Choose a clue',
				text: 'Select a numbered cell or clue. A crossing cell belongs to both an Across and a Down answer.',
				cell: { row: 4, column: 1 },
				entryId: `${puzzleId}-resource-across`
			},
			{
				id: 'type',
				title: 'Let crossings help',
				text: 'Type letters to advance. Correct crossings supply useful evidence for the other direction.',
				entryId: `${puzzleId}-resource-across`
			},
			{
				id: 'hint',
				title: 'Hints teach in stages',
				text: 'Ask for a nudge whenever you want. Later steps explain, contrast, reveal a useful letter and finally show and teach.',
				entryId: `${puzzleId}-loinc-down`
			},
			{
				id: 'learn',
				title: 'Keep the thread',
				text: 'A completed answer unlocks a short teaching card without interrupting the grid.',
				entryId: `${puzzleId}-profile-across`
			}
		]
	},
	{
		id: 'clinical-traffic',
		title: 'Clinical Traffic',
		subtitle: 'Records, movement, orders and help at the point of care.',
		topicIds: ['ehr-clinical-systems'],
		level: 'refresh',
		sessionFormat: 'quick',
		estimatedMinutes: 5,
		width: 5,
		height: 9,
		placements: [
			placement('cpoe', 6, 1, 'across'),
			placement('emr', 6, 4, 'down'),
			placement('cds', 6, 1, 'down'),
			placement('adt', 7, 0, 'across'),
			placement('workflow', 0, 3, 'down'),
			placement('ehr', 2, 1, 'across')
		],
		completionNote:
			'The electronic chart is only one actor. The work still moves through people, messages and decisions.'
	},
	{
		id: 'terminology-passports',
		title: 'Terminology Passports',
		subtitle: 'Which vocabulary does what, and why mappings need adult supervision.',
		topicIds: ['clinical-terminology'],
		level: 'refresh',
		sessionFormat: 'quick',
		estimatedMinutes: 6,
		width: 9,
		height: 10,
		placements: [
			placement('valueset', 4, 1, 'across'),
			placement('mapping', 3, 2, 'down'),
			placement('rxnorm', 8, 0, 'across'),
			placement('snomedct', 0, 7, 'down'),
			placement('icd', 6, 6, 'across'),
			placement('loinc', 1, 4, 'across')
		],
		completionNote:
			'The vocabularies now have separate passports. The border officials remain the mappings and value sets.'
	},
	{
		id: 'research-table',
		title: 'From Protocol to Table',
		subtitle: 'A compact research-data chain from collection to review.',
		topicIds: ['clinical-research-data'],
		level: 'refresh',
		sessionFormat: 'quick',
		estimatedMinutes: 6,
		width: 5,
		height: 12,
		placements: [
			placement('traceability', 0, 2, 'down'),
			placement('sdtm', 10, 0, 'across'),
			placement('edc', 3, 0, 'across'),
			placement('cdisc', 7, 0, 'across'),
			placement('protocol', 2, 4, 'down'),
			placement('ecrf', 1, 0, 'across')
		],
		completionNote:
			'The final table now has an ancestry, which is more than can be said for many “final_v7” files.'
	},
	{
		id: 'pipeline-midnight',
		title: 'The Midnight Pipeline',
		subtitle: 'Old storage, relational destinations and the transformations between them.',
		topicIds: ['data-engineering-modernization'],
		level: 'working',
		sessionFormat: 'coffee',
		estimatedMinutes: 9,
		width: 7,
		height: 14,
		placements: [
			placement('deduplication', 1, 2, 'down'),
			placement('sql', 6, 0, 'across'),
			placement('mumps', 2, 0, 'down'),
			placement('etl', 2, 2, 'across'),
			placement('lineage', 13, 0, 'across'),
			placement('relational', 0, 4, 'down')
		],
		completionNote:
			'The pipeline ran, the duplicates were questioned, and the legacy system remains older than several committee members.'
	},
	{
		id: 'denominator-located',
		title: 'Denominator Located',
		subtitle: 'How a plausible dashboard earns the right to be believed.',
		topicIds: ['analytics-statistics-reporting'],
		level: 'working',
		sessionFormat: 'coffee',
		estimatedMinutes: 10,
		width: 9,
		height: 16,
		placements: [
			placement('reproducibility', 1, 7, 'down'),
			placement('measure', 2, 1, 'across'),
			placement('cohort', 14, 2, 'across'),
			placement('missingness', 0, 4, 'down'),
			placement('denominator', 1, 2, 'down'),
			placement('dimension', 5, 0, 'across')
		],
		completionNote:
			'The metric has a population, an absence policy and a reproducible route to the boardroom.'
	},
	{
		id: 'doors-and-keys',
		title: 'Doors, Keys and Receipts',
		subtitle: 'Identity, permission, protection and evidence after the fact.',
		topicIds: ['security-privacy-governance'],
		level: 'working',
		sessionFormat: 'coffee',
		estimatedMinutes: 10,
		width: 10,
		height: 14,
		placements: [
			placement('leastprivilege', 0, 9, 'down'),
			placement('consent', 4, 3, 'across'),
			placement('audittrail', 0, 0, 'across'),
			placement('encryption', 2, 3, 'down'),
			placement('authorization', 0, 0, 'down'),
			placement('authentication', 0, 7, 'down')
		],
		completionNote:
			'The door checked identity, policy limited the room, and the trail remembered the visit.'
	},
	{
		id: 'hie-borders',
		title: 'Borders of the HIE',
		subtitle: 'Architecture at the seams: identity, destinations, vocabulary and trust.',
		topicIds: ['interoperability-hie'],
		level: 'architect',
		sessionFormat: 'coffee',
		estimatedMinutes: 12,
		width: 10,
		height: 21,
		placements: [
			placement('terminologyservice', 3, 7, 'down'),
			placement('routing', 18, 3, 'across'),
			placement('patientmatching', 4, 9, 'down'),
			placement('provenance', 8, 0, 'across'),
			placement('providerdirectory', 1, 1, 'down'),
			placement('interfaceengine', 0, 4, 'down')
		],
		completionNote:
			'The messages crossed the border with an identity, a destination, a vocabulary and an origin story.'
	},
	{
		id: 'modernization-cutover',
		title: 'Cutover Without Clairvoyance',
		subtitle: 'A modernization round about evidence, reversibility and changed data.',
		topicIds: ['data-engineering-modernization'],
		level: 'architect',
		sessionFormat: 'coffee',
		estimatedMinutes: 12,
		width: 10,
		height: 17,
		placements: [
			placement('reconciliation', 3, 0, 'down'),
			placement('cutover', 8, 0, 'across'),
			placement('rollback', 8, 6, 'down'),
			placement('incrementalload', 0, 2, 'down'),
			placement('observability', 3, 4, 'down'),
			placement('migration', 0, 1, 'across')
		],
		completionNote:
			'The switch had checkpoints, comparison and a route home. Optimism was present but not used as a control.'
	},
	{
		id: 'ai-in-the-workflow',
		title: 'AI in the Workflow',
		subtitle: 'Data shape, evaluation, changing populations and the right to disagree.',
		topicIds: ['ai-readiness-modernization'],
		level: 'architect',
		sessionFormat: 'coffee',
		estimatedMinutes: 12,
		width: 12,
		height: 12,
		placements: [
			placement('unstructured', 5, 0, 'across'),
			placement('dataleakage', 0, 10, 'down'),
			placement('drift', 4, 4, 'down'),
			placement('humanreview', 1, 1, 'down'),
			placement('evaluation', 1, 8, 'down'),
			placement('structured', 1, 6, 'down')
		],
		completionNote:
			'The model met a workflow, a changing population and a human permitted to say no.'
	},
	{
		id: 'record-crosses-enterprise',
		title: 'A Record Crosses the Enterprise',
		subtitle:
			'Eighteen connected concepts from clinical capture and exchange to governed analytics and human-reviewed AI.',
		topicIds: [
			'mixed-systems',
			'ehr-clinical-systems',
			'interoperability-hie',
			'clinical-terminology',
			'data-engineering-modernization',
			'analytics-statistics-reporting',
			'security-privacy-governance',
			'ai-readiness-modernization'
		],
		level: 'architect',
		sessionFormat: 'deep',
		estimatedMinutes: 25,
		width: 22,
		height: 26,
		placements: [
			placement(
				'etl',
				8,
				14,
				'across',
				'A legacy source cannot be queried in place. Which sequence moves and reshapes its data before loading it downstream?'
			),
			placement(
				'loinc',
				9,
				2,
				'across',
				'Two hospitals send glucose under local names. Which standard identifier belongs on the observation before aggregation?'
			),
			placement(
				'valueset',
				2,
				4,
				'across',
				'A profile permits only a governed subset of codes. Which artifact states that membership without inventing a new terminology?'
			),
			placement(
				'adt',
				9,
				8,
				'across',
				'Bed movement must reach orders, results and the HIE as events. Which message family usually starts the administrative ripple?'
			),
			placement(
				'lineage',
				2,
				14,
				'down',
				'A denominator changes after one transformation deploys. Which evidence traces the metric back through jobs and source fields?'
			),
			placement(
				'humanreview',
				11,
				0,
				'across',
				'A model flags a dangerous case but lacks context. Which workflow lets a qualified person inspect evidence, disagree and remain accountable?'
			),
			placement(
				'encryption',
				18,
				11,
				'across',
				'A stolen backup should not read like an unusually boring chart. Which control protects its contents without deciding who may fetch it?'
			),
			placement(
				'terminologyservice',
				8,
				15,
				'down',
				'Many apps need the same code validation and expansion rules. Which shared service keeps that governance from becoming copy-and-paste folklore?'
			),
			placement(
				'deduplication',
				1,
				8,
				'down',
				'An interface retries after a timeout and the warehouse sees twins. Which process identifies repeated events without assuming similar patients are identical?'
			),
			placement(
				'consent',
				13,
				6,
				'across',
				'An exchange permission varies by purpose, scope and withdrawal. Which governed choice cannot safely become one permanent yes-or-no flag?'
			),
			placement(
				'patientmatching',
				0,
				0,
				'down',
				'Two sources disagree on demographics. Which identity process weighs evidence without pretending its score is the person?'
			),
			placement(
				'workflow',
				15,
				10,
				'across',
				'A technically accurate alert arrives after the prescribing decision. Which surrounding sequence—not model accuracy—has failed?'
			),
			placement(
				'interfaceengine',
				25,
				7,
				'across',
				'HL7 v2, routing, transforms and monitoring meet at which integration component, whose existence does not settle clinical meaning?'
			),
			placement(
				'authorization',
				2,
				20,
				'down',
				'Authentication proved who signed in. Which policy decision determines whether that identity may read this record for this purpose?'
			),
			placement(
				'denominator',
				5,
				12,
				'down',
				'A dashboard rate improves when excluded patients vanish. Which population definition must be inspected before anyone applauds?'
			),
			placement(
				'validation',
				2,
				4,
				'down',
				'Counts reconcile and syntax passes, yet clinical meaning may still be wrong. Which documented assessment tests fitness for intended use?'
			),
			placement(
				'provenance',
				20,
				11,
				'across',
				'A value remains plausible after three transformations. Which evidence distinguishes measured, copied, inferred and corrected origins?'
			),
			placement(
				'evaluation',
				6,
				12,
				'across',
				'A model scores well at one hospital. Which process must still examine calibration, subgroups, workflow fit and another setting?'
			)
		],
		completionNote:
			'The record kept its identity, meaning, lineage, permissions and denominator. The model was permitted an opinion, not the last word.'
	},
	{
		id: 'systems-handoffs',
		title: 'Systems Handoffs',
		subtitle: 'A mixed refresher in which each answer must survive the next system.',
		topicIds: [
			'mixed-systems',
			'interoperability-hie',
			'clinical-terminology',
			'data-engineering-modernization',
			'security-privacy-governance'
		],
		level: 'adaptive',
		sessionFormat: 'review',
		estimatedMinutes: 7,
		width: 6,
		height: 9,
		placements: [
			placement(
				'rxnorm',
				7,
				0,
				'across',
				'A normalized drug identity crosses the interface; which vocabulary keeps the name from changing costume?'
			),
			placement(
				'loinc',
				4,
				2,
				'down',
				'A laboratory observation needs a standard identifier before aggregation. Which terminology supplies it?'
			),
			placement(
				'etl',
				4,
				0,
				'across',
				'The warehouse sequence that transforms before loading—three letters, several opportunities for lineage.'
			),
			placement(
				'audit',
				0,
				1,
				'down',
				'When access is questioned later, which record family supplies the event evidence?'
			),
			placement(
				'fhir',
				4,
				4,
				'down',
				'Resources, profiles and web exchange patterns point to which standard family?'
			),
			placement(
				'adt',
				2,
				0,
				'across',
				'Which message family supplies the encounter movement that downstream systems need first?'
			)
		],
		completionNote:
			'Six concepts crossed systems without losing their jobs. Put heavily hinted ones back into the review queue.'
	},
	{
		id: 'consequences-round',
		title: 'The Consequences Round',
		subtitle: 'A mixed architecture review: what breaks when a concept is omitted?',
		topicIds: [
			'mixed-systems',
			'interoperability-hie',
			'clinical-terminology',
			'analytics-statistics-reporting',
			'security-privacy-governance',
			'ai-readiness-modernization'
		],
		level: 'adaptive',
		sessionFormat: 'review',
		estimatedMinutes: 8,
		width: 11,
		height: 10,
		placements: [
			placement(
				'denominator',
				3,
				0,
				'across',
				'Omit this population definition and a rate can improve merely by changing who counted.'
			),
			placement(
				'valueset',
				2,
				7,
				'down',
				'Omit this governed code selection and every locally valid concept may volunteer for the field.'
			),
			placement(
				'validation',
				0,
				5,
				'down',
				'Omit this evidence and “the job completed” becomes the migration acceptance criterion.'
			),
			placement(
				'lineage',
				0,
				1,
				'down',
				'Omit this route map and downstream impact analysis becomes organizational folklore.'
			),
			placement(
				'consent',
				2,
				3,
				'down',
				'Flatten this governed choice to one permanent flag and purpose, scope and withdrawal disappear.'
			),
			placement(
				'profile',
				2,
				10,
				'down',
				'Omit these constraints and two perfectly valid resources can remain practically incompatible.'
			)
		],
		completionNote:
			'The omitted concepts have filed their consequences. The dashboard will hear from the denominator shortly.'
	}
];

export const healthcareItPuzzles: CrosswordPuzzle[] = drafts.map(hydratePuzzle);
