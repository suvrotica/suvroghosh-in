import type { BarnumTechnique, FrameConstraint, FramePart, SentenceFrame } from '../core/types';

const slot = (
	name: string,
	fragmentKind: 'clause' | 'lead' | 'bridge' | 'tail',
	options: Pick<Extract<FramePart, { kind: 'slot' }>, 'role' | 'relation'> = {}
): FramePart => ({ kind: 'slot', name, fragmentKind, ...options });

const literal = (text: string): FramePart => ({ kind: 'literal', text });

const generic = (
	id: string,
	technique: BarnumTechnique,
	parts: readonly FramePart[],
	constraints: readonly FrameConstraint[] = [
		{ op: 'claim-basis-allowed' },
		{ op: 'not-incompatible' }
	]
): SentenceFrame => ({
	id,
	locale: 'en',
	technique,
	claimBasis: 'unsupported-generic',
	parts,
	constraints
});

const echo = (id: string, parts: readonly FramePart[]): SentenceFrame => ({
	id,
	locale: 'en',
	technique: 'direct-answer-echo',
	claimBasis: 'direct-echo',
	parts,
	constraints: [{ op: 'claim-basis-allowed' }, { op: 'not-incompatible' }]
});

const independent = () => slot('a', 'clause', { role: 'independent' });
const lead = () => slot('lead', 'lead');
const tail = () => slot('tail', 'tail', { role: 'neutral-tail' });
const echoClause = () => slot('echo', 'clause', { role: 'echo-independent' });

const RAINBOW_CONSTRAINTS: readonly FrameConstraint[] = [
	{ op: 'same-axis', left: 'a', right: 'b' },
	{ op: 'opposite-poles', left: 'a', right: 'b' },
	{ op: 'different-semantic-key', left: 'a', right: 'b' },
	{ op: 'claim-basis-allowed' },
	{ op: 'not-incompatible' }
];

const TAIL_CONSTRAINTS: readonly FrameConstraint[] = [
	{ op: 'different-semantic-key', left: 'a', right: 'tail' },
	{ op: 'claim-basis-allowed' },
	{ op: 'not-incompatible' }
];

export const FRAMES_EN: readonly SentenceFrame[] = Object.freeze([
	// Eight independent-clause frames.
	generic('plain.single.01', 'broad-common-experience', [independent(), literal('.')]),
	generic('plain.single.02', 'modal-hedge', [literal('Often, '), independent(), literal('.')]),
	generic('plain.single.03', 'temporal-elasticity', [
		literal('At times, '),
		independent(),
		literal('.')
	]),
	generic('plain.single.04', 'exception-clause', [
		literal('Without this being constant, '),
		independent(),
		literal('.')
	]),
	generic('plain.single.05', 'broad-common-experience', [
		literal('In ordinary situations, '),
		independent(),
		literal('.')
	]),
	generic('plain.single.06', 'modal-hedge', [
		literal('It may be that '),
		independent(),
		literal('.')
	]),
	generic('plain.single.07', 'temporal-elasticity', [
		literal('From time to time, '),
		independent(),
		literal('.')
	]),
	generic('plain.single.08', 'broad-common-experience', [
		literal('One ordinary pattern is that '),
		independent(),
		literal('.')
	]),

	// Six variable-lead frames.
	generic('lead.single.01', 'temporal-elasticity', [
		lead(),
		literal(', '),
		independent(),
		literal('.')
	]),
	generic('lead.single.02', 'modal-hedge', [lead(), literal(': '), independent(), literal('.')]),
	generic('lead.single.03', 'broad-common-experience', [
		lead(),
		literal(', it can be true that '),
		independent(),
		literal('.')
	]),
	generic('lead.single.04', 'temporal-elasticity', [
		lead(),
		literal(', the pattern may be that '),
		independent(),
		literal('.')
	]),
	generic('lead.single.05', 'exception-clause', [
		lead(),
		literal(', one side of the description is that '),
		independent(),
		literal('.')
	]),
	generic('lead.single.06', 'broad-common-experience', [
		lead(),
		literal(' — '),
		independent(),
		literal('.')
	]),

	// Ten explicit opposite-pole frames.
	generic(
		'rainbow.pair.01',
		'rainbow-pair',
		[
			independent(),
			literal(', '),
			slot('bridge', 'bridge', { relation: 'contrast' }),
			literal(' '),
			slot('b', 'clause', { role: 'contrast-independent' }),
			literal('.')
		],
		RAINBOW_CONSTRAINTS
	),
	generic(
		'rainbow.pair.02',
		'rainbow-pair',
		[
			literal('It can be true that '),
			independent(),
			literal(', '),
			slot('bridge', 'bridge', { relation: 'contrast' }),
			literal(' '),
			slot('b', 'clause', { role: 'contrast-independent' }),
			literal('.')
		],
		RAINBOW_CONSTRAINTS
	),
	generic(
		'rainbow.pair.03',
		'rainbow-pair',
		[
			lead(),
			literal(', '),
			independent(),
			literal(', '),
			slot('bridge', 'bridge', { relation: 'contrast' }),
			literal(' '),
			slot('b', 'clause', { role: 'contrast-independent' }),
			literal('.')
		],
		RAINBOW_CONSTRAINTS
	),
	generic(
		'rainbow.pair.04',
		'rainbow-pair',
		[
			literal('Sometimes '),
			independent(),
			literal('; '),
			slot('bridge', 'bridge', { relation: 'contrast' }),
			literal(' '),
			slot('b', 'clause', { role: 'contrast-independent' }),
			literal('.')
		],
		RAINBOW_CONSTRAINTS
	),
	generic(
		'rainbow.pair.05',
		'rainbow-pair',
		[
			independent(),
			literal(' — '),
			slot('bridge', 'bridge', { relation: 'contrast' }),
			literal(' '),
			slot('b', 'clause', { role: 'contrast-independent' }),
			literal('.')
		],
		RAINBOW_CONSTRAINTS
	),
	generic(
		'rainbow.pair.06',
		'rainbow-pair',
		[
			literal('One side is that '),
			independent(),
			literal('; another is that '),
			slot('b', 'clause', { role: 'contrast-independent' }),
			literal('.')
		],
		RAINBOW_CONSTRAINTS
	),
	generic(
		'rainbow.pair.07',
		'rainbow-pair',
		[
			lead(),
			literal(': '),
			independent(),
			literal('; '),
			slot('bridge', 'bridge', { relation: 'contrast' }),
			literal(' '),
			slot('b', 'clause', { role: 'contrast-independent' }),
			literal('.')
		],
		RAINBOW_CONSTRAINTS
	),
	generic(
		'rainbow.pair.08',
		'rainbow-pair',
		[
			literal('Depending on the moment, '),
			independent(),
			literal(', '),
			slot('bridge', 'bridge', { relation: 'contrast' }),
			literal(' '),
			slot('b', 'clause', { role: 'contrast-independent' }),
			literal('.')
		],
		RAINBOW_CONSTRAINTS
	),
	generic(
		'rainbow.pair.09',
		'rainbow-pair',
		[
			independent(),
			literal('. In another setting, '),
			slot('b', 'clause', { role: 'contrast-independent' }),
			literal('.')
		],
		RAINBOW_CONSTRAINTS
	),
	generic(
		'rainbow.pair.10',
		'rainbow-pair',
		[
			literal('The description can stretch from “'),
			independent(),
			literal('” to “'),
			slot('b', 'clause', { role: 'contrast-independent' }),
			literal('”.')
		],
		RAINBOW_CONSTRAINTS
	),

	// Six authored subordinate-clause frames.
	generic('subordinate.01', 'exception-clause', [
		slot('a', 'clause', { role: 'although-subordinate' }),
		literal('.')
	]),
	generic('subordinate.02', 'exception-clause', [
		slot('a', 'clause', { role: 'while-subordinate' }),
		literal('.')
	]),
	generic('subordinate.03', 'temporal-elasticity', [
		lead(),
		literal(': '),
		slot('a', 'clause', { role: 'although-subordinate' }),
		literal('.')
	]),
	generic('subordinate.04', 'modal-hedge', [
		literal('A qualified version is that '),
		slot('a', 'clause', { role: 'while-subordinate' }),
		literal('.')
	]),
	generic('subordinate.05', 'rainbow-pair', [
		literal('The sentence can cover both sides: '),
		slot('a', 'clause', { role: 'although-subordinate' }),
		literal('.')
	]),
	generic('subordinate.06', 'rainbow-pair', [
		literal('With an exception built in, '),
		slot('a', 'clause', { role: 'while-subordinate' }),
		literal('.')
	]),

	// Eight clause-plus-tail frames.
	generic(
		'tail.qualified.01',
		'exception-clause',
		[independent(), literal('; '), tail(), literal('.')],
		TAIL_CONSTRAINTS
	),
	generic(
		'tail.qualified.02',
		'modal-hedge',
		[independent(), literal(', and '), tail(), literal('.')],
		TAIL_CONSTRAINTS
	),
	generic(
		'tail.qualified.03',
		'temporal-elasticity',
		[lead(), literal(', '), independent(), literal('; '), tail(), literal('.')],
		TAIL_CONSTRAINTS
	),
	generic(
		'tail.qualified.04',
		'exception-clause',
		[independent(), literal(' — '), tail(), literal('.')],
		TAIL_CONSTRAINTS
	),
	generic(
		'tail.qualified.05',
		'broad-common-experience',
		[literal('It can be true that '), independent(), literal('; '), tail(), literal('.')],
		TAIL_CONSTRAINTS
	),
	generic(
		'tail.qualified.06',
		'modal-hedge',
		[independent(), literal('. In that wording, '), tail(), literal('.')],
		TAIL_CONSTRAINTS
	),
	generic(
		'tail.qualified.07',
		'exception-clause',
		[
			literal('One broad reading is that '),
			independent(),
			literal(', because '),
			tail(),
			literal('.')
		],
		TAIL_CONSTRAINTS
	),
	generic(
		'tail.qualified.08',
		'broad-common-experience',
		[lead(), literal(': '), independent(), literal(' — and '), tail(), literal('.')],
		TAIL_CONSTRAINTS
	),

	// Six separate, explicitly attributable echo frames.
	echo('echo.direct.01', [echoClause(), literal('.')]),
	echo('echo.direct.02', [literal('From your answer, '), echoClause(), literal('.')]),
	echo('echo.direct.03', [literal('You already reported that '), echoClause(), literal('.')]),
	echo('echo.direct.04', [literal('Using only that selection: '), echoClause(), literal('.')]),
	echo('echo.direct.05', [literal('One restatement is that '), echoClause(), literal('.')]),
	echo('echo.direct.06', [
		literal('The answer permits this paraphrase: '),
		echoClause(),
		literal('.')
	]),

	// Four frames keep qualification and addition bridges live and inspectable.
	generic('bridge.qualification.01', 'exception-clause', [
		independent(),
		literal(', '),
		slot('bridge', 'bridge', { relation: 'qualification' }),
		literal('.')
	]),
	generic('bridge.qualification.02', 'modal-hedge', [
		lead(),
		literal(', '),
		independent(),
		literal(', '),
		slot('bridge', 'bridge', { relation: 'qualification' }),
		literal('.')
	]),
	generic(
		'bridge.addition.01',
		'broad-common-experience',
		[
			independent(),
			literal(', '),
			slot('bridge', 'bridge', { relation: 'addition' }),
			literal(' '),
			slot('b', 'clause', { role: 'independent' }),
			literal('.')
		],
		[
			{ op: 'different-semantic-key', left: 'a', right: 'b' },
			{ op: 'claim-basis-allowed' },
			{ op: 'not-incompatible' }
		]
	),
	generic(
		'bridge.addition.02',
		'broad-common-experience',
		[
			lead(),
			literal(': '),
			independent(),
			literal('; '),
			slot('bridge', 'bridge', { relation: 'addition' }),
			literal(' '),
			slot('b', 'clause', { role: 'independent' }),
			literal('.')
		],
		[
			{ op: 'different-semantic-key', left: 'a', right: 'b' },
			{ op: 'claim-basis-allowed' },
			{ op: 'not-incompatible' }
		]
	)
]);

export const CORPUS_FRAME_COUNT = FRAMES_EN.length;
