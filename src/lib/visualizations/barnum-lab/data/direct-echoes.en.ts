import { makeSurfaceText, surfaceWordCount } from '../core/surface-text';
import type { ContentAxis, SurfaceSentence } from '../core/types';
import type { SelfReportQuestionId } from '../core/question-types';

interface EchoSource {
	questionId: SelfReportQuestionId;
	optionId: string;
	text: string;
	axis: ContentAxis;
	pole: string;
}

const SOURCES: readonly EchoSource[] = [
	{
		questionId: 'planning_style',
		optionId: 'detailed-plan',
		text: 'You prefer a detailed plan before you begin.',
		axis: 'structure-flexibility',
		pole: 'structure'
	},
	{
		questionId: 'planning_style',
		optionId: 'loose-plan',
		text: 'You like a plan with room to change it.',
		axis: 'structure-flexibility',
		pole: 'balanced'
	},
	{
		questionId: 'planning_style',
		optionId: 'improvise',
		text: 'You prefer to begin and adjust as you go.',
		axis: 'structure-flexibility',
		pole: 'flexibility'
	},
	{
		questionId: 'planning_style',
		optionId: 'depends',
		text: 'How tightly you plan depends on the situation.',
		axis: 'structure-flexibility',
		pole: 'balanced'
	},
	{
		questionId: 'decision_pace',
		optionId: 'usually-deliberate',
		text: 'You prefer to think before deciding.',
		axis: 'deliberation-spontaneity',
		pole: 'deliberation'
	},
	{
		questionId: 'decision_pace',
		optionId: 'usually-quick',
		text: 'You usually make decisions quickly.',
		axis: 'deliberation-spontaneity',
		pole: 'spontaneity'
	},
	{
		questionId: 'decision_pace',
		optionId: 'depends-on-stakes',
		text: 'How quickly you decide depends on the stakes.',
		axis: 'deliberation-spontaneity',
		pole: 'balanced'
	},
	{
		questionId: 'novelty_preference',
		optionId: 'familiar-things',
		text: 'You feel more comfortable with things you already know.',
		axis: 'stability-change',
		pole: 'stability'
	},
	{
		questionId: 'novelty_preference',
		optionId: 'new-things',
		text: 'You feel more comfortable trying something new.',
		axis: 'stability-change',
		pole: 'change'
	},
	{
		questionId: 'novelty_preference',
		optionId: 'mixture',
		text: 'You like a mix of familiar experiences and new ones.',
		axis: 'stability-change',
		pole: 'balanced'
	},
	{
		questionId: 'social_recovery',
		optionId: 'time-alone',
		text: 'You recharge best when you get some time alone.',
		axis: 'company-solitude',
		pole: 'solitude'
	},
	{
		questionId: 'social_recovery',
		optionId: 'one-to-one',
		text: 'You recharge best with one other person.',
		axis: 'company-solitude',
		pole: 'company'
	},
	{
		questionId: 'social_recovery',
		optionId: 'small-group',
		text: 'You recharge best with a small group.',
		axis: 'company-solitude',
		pole: 'company'
	},
	{
		questionId: 'social_recovery',
		optionId: 'varies',
		text: 'The way you recharge changes with the situation.',
		axis: 'company-solitude',
		pole: 'balanced'
	},
	{
		questionId: 'focus_style',
		optionId: 'one-at-a-time',
		text: 'You focus best when you stay with one thing.',
		axis: 'curiosity-focus',
		pole: 'focus'
	},
	{
		questionId: 'focus_style',
		optionId: 'several-threads',
		text: 'You prefer keeping several threads moving at once.',
		axis: 'curiosity-focus',
		pole: 'curiosity'
	},
	{
		questionId: 'focus_style',
		optionId: 'varies',
		text: 'Your preferred way to focus changes with the task.',
		axis: 'curiosity-focus',
		pole: 'balanced'
	},
	{
		questionId: 'feedback_preference',
		optionId: 'direct',
		text: 'You prefer feedback that gets straight to the point.',
		axis: 'directness-diplomacy',
		pole: 'directness'
	},
	{
		questionId: 'feedback_preference',
		optionId: 'gentle',
		text: 'You prefer feedback delivered in a gentle way.',
		axis: 'directness-diplomacy',
		pole: 'diplomacy'
	},
	{
		questionId: 'feedback_preference',
		optionId: 'with-context',
		text: 'You prefer feedback that includes context.',
		axis: 'directness-diplomacy',
		pole: 'diplomacy'
	},
	{
		questionId: 'feedback_preference',
		optionId: 'depends',
		text: 'The feedback style you prefer depends on the situation.',
		axis: 'directness-diplomacy',
		pole: 'balanced'
	},
	{
		questionId: 'time_horizon',
		optionId: 'today',
		text: 'The time frame you find most useful is today.',
		axis: 'deliberation-spontaneity',
		pole: 'short-horizon'
	},
	{
		questionId: 'time_horizon',
		optionId: 'this-week',
		text: 'The time frame you find most useful is this week.',
		axis: 'deliberation-spontaneity',
		pole: 'short-horizon'
	},
	{
		questionId: 'time_horizon',
		optionId: 'this-month',
		text: 'The time frame you find most useful is this month.',
		axis: 'deliberation-spontaneity',
		pole: 'medium-horizon'
	},
	{
		questionId: 'time_horizon',
		optionId: 'longer',
		text: 'The time frame you find most useful is longer term.',
		axis: 'deliberation-spontaneity',
		pole: 'long-horizon'
	},
	{
		questionId: 'time_horizon',
		optionId: 'varies',
		text: 'The time frame you find useful changes with the situation.',
		axis: 'deliberation-spontaneity',
		pole: 'balanced'
	},
	{
		questionId: 'pace',
		optionId: 'steady',
		text: 'You prefer working at a steady pace.',
		axis: 'patience-urgency',
		pole: 'patience'
	},
	{
		questionId: 'pace',
		optionId: 'bursts',
		text: 'You prefer working in bursts of energy.',
		axis: 'patience-urgency',
		pole: 'urgency'
	},
	{
		questionId: 'pace',
		optionId: 'varies',
		text: 'Your preferred pace changes with the task.',
		axis: 'patience-urgency',
		pole: 'balanced'
	}
];

export const DIRECT_ECHO_SENTENCES_EN: readonly SurfaceSentence[] = Object.freeze(
	SOURCES.map((source) => ({
		id: `echo.${source.questionId}.${source.optionId}`,
		channel: 'direct-echo' as const,
		text: makeSurfaceText(source.text),
		mechanism: 'direct-echo' as const,
		semanticFamilyId: `echo.${source.questionId}.${source.optionId}`,
		axis: source.axis,
		pole: source.pole,
		breadth: 'medium' as const,
		valence: 'neutral' as const,
		reviewStatus: 'surface-approved-v2' as const,
		wordCount: surfaceWordCount(source.text),
		opener: 'you' as const,
		claimBasis: {
			kind: 'direct-echo' as const,
			questionId: source.questionId,
			optionId: source.optionId
		}
	}))
);

export const DIRECT_ECHO_SENTENCE_COUNT = DIRECT_ECHO_SENTENCES_EN.length;

export function directEchoFor(
	questionId: SelfReportQuestionId,
	optionId: string
): SurfaceSentence | undefined {
	return DIRECT_ECHO_SENTENCES_EN.find(
		(sentence) =>
			sentence.claimBasis.kind === 'direct-echo' &&
			sentence.claimBasis.questionId === questionId &&
			sentence.claimBasis.optionId === optionId
	);
}
