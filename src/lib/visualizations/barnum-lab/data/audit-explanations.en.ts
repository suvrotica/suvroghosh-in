import type { AuditExplanation } from '../core/types';

/** Backstage explanations. This module is intentionally absent from every surface compiler. */
export const AUDIT_EXPLANATIONS_EN: readonly AuditExplanation[] = Object.freeze([
	{
		id: 'audit.breadth.common-experience',
		channel: 'audit-only',
		explanation: 'Many people can recall an ordinary moment that matches this broad experience.',
		concepts: ['breadth']
	},
	{
		id: 'audit.breadth.private-example',
		channel: 'audit-only',
		explanation: 'A private example can make a broad line feel more specific than it is.',
		concepts: ['breadth']
	},
	{
		id: 'audit.breadth.no-frequency',
		channel: 'audit-only',
		explanation: 'The line gives no frequency or comparison group that could be checked.',
		concepts: ['breadth', 'falsifiability']
	},
	{
		id: 'audit.hedge.at-times',
		channel: 'audit-only',
		explanation: 'The softener leaves room for both matching and nonmatching occasions.',
		concepts: ['hedge', 'falsifiability']
	},
	{
		id: 'audit.hedge.condition',
		channel: 'audit-only',
		explanation: 'The condition lets memory supply a convenient setting in which the line fits.',
		concepts: ['hedge', 'breadth']
	},
	{
		id: 'audit.rainbow.two-poles',
		channel: 'audit-only',
		explanation:
			'Both sides are common and belong to one tension, so either side can invite recognition.',
		concepts: ['rainbow', 'breadth']
	},
	{
		id: 'audit.rainbow.context',
		channel: 'audit-only',
		explanation:
			'Different situations can bring out opposite sides without making either side distinctive.',
		concepts: ['rainbow']
	},
	{
		id: 'audit.echo.answer',
		channel: 'audit-only',
		explanation:
			'This line restates an answer the visitor supplied; it is not an independent discovery.',
		concepts: ['echo', 'falsifiability']
	},
	{
		id: 'audit.feedback.fit',
		channel: 'audit-only',
		explanation:
			'This nearby line was selected only because the visitor marked the original as a fit.',
		concepts: ['feedback']
	},
	{
		id: 'audit.feedback.partly',
		channel: 'audit-only',
		explanation: 'This same-family line adds one softener after the visitor chose a partial fit.',
		concepts: ['feedback', 'hedge']
	},
	{
		id: 'audit.feedback.miss',
		channel: 'audit-only',
		explanation: 'A miss remains a miss and did not supply evidence for an ordinary derivative.',
		concepts: ['feedback', 'falsifiability']
	},
	{
		id: 'audit.falsifiability.open-boundary',
		channel: 'audit-only',
		explanation: 'The boundary is open enough for several ordinary interpretations to count.',
		concepts: ['falsifiability', 'breadth']
	},
	{
		id: 'audit.falsifiability.memory',
		channel: 'audit-only',
		explanation: 'The wording invites memory to provide its strongest matching example.',
		concepts: ['falsifiability', 'breadth']
	},
	{
		id: 'audit.falsifiability.no-evidence',
		channel: 'audit-only',
		explanation:
			'Feeling familiar does not provide independent evidence that the profile knew the visitor.',
		concepts: ['falsifiability']
	}
]);

const BY_MECHANISM = Object.freeze({
	'broad-common-experience': 'audit.breadth.common-experience',
	'rainbow-pair': 'audit.rainbow.two-poles',
	'flattering-ambiguity': 'audit.breadth.private-example',
	'unused-potential': 'audit.breadth.private-example',
	'guarded-vulnerability': 'audit.hedge.condition',
	'redeemable-flaw': 'audit.hedge.condition',
	'conditional-escape': 'audit.hedge.at-times',
	'direct-echo': 'audit.echo.answer',
	'feedback-reinforcement': 'audit.feedback.fit',
	'feedback-qualification': 'audit.feedback.partly',
	'miss-recovery': 'audit.feedback.miss'
} as const);

export function auditExplanationForMechanism(
	mechanism: keyof typeof BY_MECHANISM
): AuditExplanation {
	return AUDIT_EXPLANATIONS_EN.find((item) => item.id === BY_MECHANISM[mechanism])!;
}
