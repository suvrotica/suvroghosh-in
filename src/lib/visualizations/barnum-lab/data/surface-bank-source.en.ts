/**
 * Build-time source for the committed v2 sentence bank.
 *
 * These predicates are never imported by the browser and are never joined during a session.
 * `scripts/generate-barnum-surface-bank.ts` materializes two reviewed ordinary forms and four
 * reviewed rainbow forms as complete sentences in `surface-sentences.en.generated.ts`. The
 * runtime sampler reads only that committed bank; it never joins these predicates itself.
 */

export interface SurfaceFamilySource {
	id: string;
	pole: string;
	mechanism:
		| 'broad-common-experience'
		| 'flattering-ambiguity'
		| 'guarded-vulnerability'
		| 'redeemable-flaw'
		| 'unused-potential';
	predicate: string;
	breadth: 'broad' | 'medium';
	valence: 'positive' | 'mixed' | 'neutral';
}

export interface RainbowFamilySource {
	id: string;
	pole: string;
	firstPredicate: string;
	secondPredicate: string;
}

export interface SurfaceAxisSource {
	axis:
		| 'autonomy-approval'
		| 'company-solitude'
		| 'deliberation-spontaneity'
		| 'stability-change'
		| 'reserve-openness'
		| 'structure-flexibility'
		| 'confidence-doubt'
		| 'patience-urgency'
		| 'caution-experimentation'
		| 'directness-diplomacy'
		| 'expression-restraint'
		| 'curiosity-focus'
		| 'idealism-practicality'
		| 'independence-collaboration'
		| 'ambition-contentment'
		| 'optimism-realism'
		| 'persistence-rest'
		| 'belonging-individuality';
	families: readonly SurfaceFamilySource[];
	rainbow: RainbowFamilySource;
}

export const SURFACE_AXIS_SOURCES_EN: readonly SurfaceAxisSource[] = [
	{
		axis: 'autonomy-approval',
		families: [
			{
				id: 'own-choice',
				pole: 'autonomy',
				mechanism: 'broad-common-experience',
				predicate: 'like making the final choice yourself',
				breadth: 'broad',
				valence: 'neutral'
			},
			{
				id: 'trusted-advice',
				pole: 'balanced',
				mechanism: 'broad-common-experience',
				predicate: 'listen to advice without giving up your own view',
				breadth: 'broad',
				valence: 'neutral'
			},
			{
				id: 'private-judgment',
				pole: 'autonomy',
				mechanism: 'flattering-ambiguity',
				predicate: 'know your own mind better than people first realize',
				breadth: 'medium',
				valence: 'positive'
			},
			{
				id: 'lost-control',
				pole: 'autonomy',
				mechanism: 'guarded-vulnerability',
				predicate: 'feel uneasy when others decide too much for you',
				breadth: 'broad',
				valence: 'mixed'
			},
			{
				id: 'careful-advice',
				pole: 'approval',
				mechanism: 'redeemable-flaw',
				predicate: 'question advice because you want the choice to be right',
				breadth: 'broad',
				valence: 'mixed'
			},
			{
				id: 'hidden-confidence',
				pole: 'autonomy',
				mechanism: 'unused-potential',
				predicate: 'have more confidence in your judgment than you show',
				breadth: 'medium',
				valence: 'positive'
			}
		],
		rainbow: {
			id: 'advice-and-agency',
			pole: 'balanced',
			firstPredicate: 'welcome useful advice',
			secondPredicate: 'want the final choice to feel like yours'
		}
	},
	{
		axis: 'company-solitude',
		families: [
			{
				id: 'easy-company',
				pole: 'company',
				mechanism: 'broad-common-experience',
				predicate: 'enjoy company that lets you relax',
				breadth: 'broad',
				valence: 'positive'
			},
			{
				id: 'social-quiet',
				pole: 'solitude',
				mechanism: 'broad-common-experience',
				predicate: 'need quiet after a busy social day',
				breadth: 'broad',
				valence: 'neutral'
			},
			{
				id: 'welcoming-presence',
				pole: 'company',
				mechanism: 'flattering-ambiguity',
				predicate: 'help the right group feel easy and welcoming',
				breadth: 'medium',
				valence: 'positive'
			},
			{
				id: 'feeling-left-out',
				pole: 'company',
				mechanism: 'guarded-vulnerability',
				predicate: 'feel left out more deeply than you show',
				breadth: 'broad',
				valence: 'mixed'
			},
			{
				id: 'leaving-early',
				pole: 'solitude',
				mechanism: 'redeemable-flaw',
				predicate: 'leave some gatherings early because you know your limits',
				breadth: 'broad',
				valence: 'mixed'
			},
			{
				id: 'hidden-warmth',
				pole: 'company',
				mechanism: 'unused-potential',
				predicate: 'show more warmth after you get to know someone',
				breadth: 'medium',
				valence: 'positive'
			}
		],
		rainbow: {
			id: 'company-and-quiet',
			pole: 'balanced',
			firstPredicate: 'enjoy good company',
			secondPredicate: 'need time alone afterward'
		}
	},
	{
		axis: 'deliberation-spontaneity',
		families: [
			{
				id: 'important-choices',
				pole: 'deliberation',
				mechanism: 'broad-common-experience',
				predicate: 'think important choices through before acting',
				breadth: 'broad',
				valence: 'neutral'
			},
			{
				id: 'reversible-choice',
				pole: 'spontaneity',
				mechanism: 'broad-common-experience',
				predicate: 'decide faster when a choice feels easy to undo',
				breadth: 'broad',
				valence: 'neutral'
			},
			{
				id: 'useful-details',
				pole: 'deliberation',
				mechanism: 'flattering-ambiguity',
				predicate: 'see useful details that rushed people miss',
				breadth: 'medium',
				valence: 'positive'
			},
			{
				id: 'wrong-choice',
				pole: 'deliberation',
				mechanism: 'guarded-vulnerability',
				predicate: 'worry about making the wrong choice',
				breadth: 'broad',
				valence: 'mixed'
			},
			{
				id: 'taking-longer',
				pole: 'deliberation',
				mechanism: 'redeemable-flaw',
				predicate: 'take longer because you care about getting things right',
				breadth: 'broad',
				valence: 'mixed'
			},
			{
				id: 'strong-instincts',
				pole: 'spontaneity',
				mechanism: 'unused-potential',
				predicate: 'have stronger instincts than you give yourself credit for',
				breadth: 'medium',
				valence: 'positive'
			}
		],
		rainbow: {
			id: 'thought-and-instinct',
			pole: 'balanced',
			firstPredicate: 'think choices through',
			secondPredicate: 'trust an immediate impression'
		}
	},
	{
		axis: 'stability-change',
		families: [
			{
				id: 'dependable-day',
				pole: 'stability',
				mechanism: 'broad-common-experience',
				predicate: 'like a few dependable parts in your day',
				breadth: 'broad',
				valence: 'neutral'
			},
			{
				id: 'fresh-routine',
				pole: 'change',
				mechanism: 'broad-common-experience',
				predicate: 'feel refreshed when an old routine changes',
				breadth: 'broad',
				valence: 'positive'
			},
			{
				id: 'steady-habits',
				pole: 'stability',
				mechanism: 'flattering-ambiguity',
				predicate: 'create steady habits that other people quietly rely on',
				breadth: 'medium',
				valence: 'positive'
			},
			{
				id: 'same-day',
				pole: 'change',
				mechanism: 'guarded-vulnerability',
				predicate: 'feel restless when every day starts looking the same',
				breadth: 'broad',
				valence: 'mixed'
			},
			{
				id: 'change-course',
				pole: 'change',
				mechanism: 'redeemable-flaw',
				predicate: 'change course after a routine stops helping',
				breadth: 'broad',
				valence: 'mixed'
			},
			{
				id: 'room-for-adventure',
				pole: 'change',
				mechanism: 'unused-potential',
				predicate: 'have more room for adventure than your schedule suggests',
				breadth: 'medium',
				valence: 'positive'
			}
		],
		rainbow: {
			id: 'roots-and-change',
			pole: 'balanced',
			firstPredicate: 'value a steady base',
			secondPredicate: 'need enough change to stay interested'
		}
	},
	{
		axis: 'reserve-openness',
		families: [
			{
				id: 'read-the-room',
				pole: 'reserve',
				mechanism: 'broad-common-experience',
				predicate: 'wait to understand the mood before saying much',
				breadth: 'broad',
				valence: 'neutral'
			},
			{
				id: 'earned-trust',
				pole: 'openness',
				mechanism: 'broad-common-experience',
				predicate: 'share more of yourself with people who earn your trust',
				breadth: 'broad',
				valence: 'positive'
			},
			{
				id: 'right-silence',
				pole: 'reserve',
				mechanism: 'flattering-ambiguity',
				predicate: 'understand the value of saying less at the right moment',
				breadth: 'medium',
				valence: 'positive'
			},
			{
				id: 'misread-honesty',
				pole: 'openness',
				mechanism: 'guarded-vulnerability',
				predicate: 'worry that honesty will be taken the wrong way',
				breadth: 'broad',
				valence: 'mixed'
			},
			{
				id: 'hold-reaction',
				pole: 'reserve',
				mechanism: 'redeemable-flaw',
				predicate: 'hold back a first reaction because you care how it lands',
				breadth: 'broad',
				valence: 'mixed'
			},
			{
				id: 'bolder-voice',
				pole: 'openness',
				mechanism: 'unused-potential',
				predicate: 'speak more openly after you get to know someone',
				breadth: 'medium',
				valence: 'positive'
			}
		],
		rainbow: {
			id: 'private-and-open',
			pole: 'balanced',
			firstPredicate: 'keep some thoughts private',
			secondPredicate: 'open up with the right people'
		}
	},
	{
		axis: 'structure-flexibility',
		families: [
			{
				id: 'loose-plan',
				pole: 'balanced',
				mechanism: 'broad-common-experience',
				predicate: 'like a plan that leaves room to adjust',
				breadth: 'broad',
				valence: 'neutral'
			},
			{
				id: 'next-step',
				pole: 'structure',
				mechanism: 'broad-common-experience',
				predicate: 'prefer knowing the next step before you begin',
				breadth: 'broad',
				valence: 'neutral'
			},
			{
				id: 'bring-order',
				pole: 'structure',
				mechanism: 'flattering-ambiguity',
				predicate: 'bring order to messy situations without making a fuss',
				breadth: 'medium',
				valence: 'positive'
			},
			{
				id: 'sudden-change',
				pole: 'structure',
				mechanism: 'guarded-vulnerability',
				predicate: 'feel thrown off when plans change without warning',
				breadth: 'broad',
				valence: 'mixed'
			},
			{
				id: 'working-plan',
				pole: 'flexibility',
				mechanism: 'redeemable-flaw',
				predicate: 'change a plan because you care about what works',
				breadth: 'broad',
				valence: 'mixed'
			},
			{
				id: 'improvising',
				pole: 'flexibility',
				mechanism: 'unused-potential',
				predicate: 'improvise well when a plan changes',
				breadth: 'medium',
				valence: 'positive'
			}
		],
		rainbow: {
			id: 'plan-and-room',
			pole: 'balanced',
			firstPredicate: 'like having a plan',
			secondPredicate: 'want room to change it'
		}
	},
	{
		axis: 'confidence-doubt',
		families: [
			{
				id: 'checked-details',
				pole: 'confidence',
				mechanism: 'broad-common-experience',
				predicate: 'trust yourself once you have checked the details',
				breadth: 'broad',
				valence: 'positive'
			},
			{
				id: 'rethink-choice',
				pole: 'doubt',
				mechanism: 'broad-common-experience',
				predicate: 'rethink choices that felt clear the day before',
				breadth: 'broad',
				valence: 'neutral'
			},
			{
				id: 'recover-confidence',
				pole: 'confidence',
				mechanism: 'flattering-ambiguity',
				predicate: 'regain confidence after making a mistake',
				breadth: 'medium',
				valence: 'positive'
			},
			{
				id: 'remember-criticism',
				pole: 'doubt',
				mechanism: 'guarded-vulnerability',
				predicate: 'remember criticism longer than praise',
				breadth: 'broad',
				valence: 'mixed'
			},
			{
				id: 'double-check',
				pole: 'doubt',
				mechanism: 'redeemable-flaw',
				predicate: 'double check yourself because you care about being fair',
				breadth: 'broad',
				valence: 'mixed'
			},
			{
				id: 'unused-courage',
				pole: 'confidence',
				mechanism: 'unused-potential',
				predicate: 'have more courage than you use on an ordinary day',
				breadth: 'medium',
				valence: 'positive'
			}
		],
		rainbow: {
			id: 'sure-and-unsure',
			pole: 'balanced',
			firstPredicate: 'feel sure of a choice',
			secondPredicate: 'wonder later if you got it wrong'
		}
	},
	{
		axis: 'patience-urgency',
		families: [
			{
				id: 'patient-reason',
				pole: 'patience',
				mechanism: 'broad-common-experience',
				predicate: 'wait calmly when the reason makes sense',
				breadth: 'broad',
				valence: 'neutral'
			},
			{
				id: 'pointless-delay',
				pole: 'urgency',
				mechanism: 'broad-common-experience',
				predicate: 'move quickly when delay seems pointless',
				breadth: 'broad',
				valence: 'neutral'
			},
			{
				id: 'steady-longer',
				pole: 'patience',
				mechanism: 'flattering-ambiguity',
				predicate: 'stay steady longer than most people expect',
				breadth: 'medium',
				valence: 'positive'
			},
			{
				id: 'lost-patience',
				pole: 'urgency',
				mechanism: 'guarded-vulnerability',
				predicate: 'lose patience with delays that have no clear purpose',
				breadth: 'broad',
				valence: 'mixed'
			},
			{
				id: 'push-progress',
				pole: 'urgency',
				mechanism: 'redeemable-flaw',
				predicate: 'push for progress because standing still bothers you',
				breadth: 'broad',
				valence: 'mixed'
			},
			{
				id: 'hidden-patience',
				pole: 'patience',
				mechanism: 'unused-potential',
				predicate: 'have more patience than difficult moments let you show',
				breadth: 'medium',
				valence: 'positive'
			}
		],
		rainbow: {
			id: 'patient-and-ready',
			pole: 'balanced',
			firstPredicate: 'wait when the reason is clear',
			secondPredicate: 'hurry when delay adds nothing'
		}
	},
	{
		axis: 'caution-experimentation',
		families: [
			{
				id: 'know-risk',
				pole: 'caution',
				mechanism: 'broad-common-experience',
				predicate: 'like knowing the risks before trying something new',
				breadth: 'broad',
				valence: 'neutral'
			},
			{
				id: 'small-test',
				pole: 'experimentation',
				mechanism: 'broad-common-experience',
				predicate: 'enjoy testing a fresh idea on a small scale',
				breadth: 'broad',
				valence: 'positive'
			},
			{
				id: 'spot-risks',
				pole: 'caution',
				mechanism: 'flattering-ambiguity',
				predicate: 'spot risks that other people overlook',
				breadth: 'medium',
				valence: 'positive'
			},
			{
				id: 'choice-nerves',
				pole: 'caution',
				mechanism: 'guarded-vulnerability',
				predicate: 'feel nervous before choices that matter to you',
				breadth: 'broad',
				valence: 'mixed'
			},
			{
				id: 'start-carefully',
				pole: 'caution',
				mechanism: 'redeemable-flaw',
				predicate: 'start carefully because you want the result to last',
				breadth: 'broad',
				valence: 'mixed'
			},
			{
				id: 'adventurous-side',
				pole: 'experimentation',
				mechanism: 'unused-potential',
				predicate: 'have a more adventurous side than your routines reveal',
				breadth: 'medium',
				valence: 'positive'
			}
		],
		rainbow: {
			id: 'risk-and-novelty',
			pole: 'balanced',
			firstPredicate: 'want to know the risks',
			secondPredicate: 'enjoy trying a fresh approach'
		}
	},
	{
		axis: 'directness-diplomacy',
		families: [
			{
				id: 'straight-answer',
				pole: 'directness',
				mechanism: 'broad-common-experience',
				predicate: 'prefer honest answers that get to the point',
				breadth: 'broad',
				valence: 'neutral'
			},
			{
				id: 'careful-feedback',
				pole: 'diplomacy',
				mechanism: 'broad-common-experience',
				predicate: 'choose your words carefully before giving hard feedback',
				breadth: 'broad',
				valence: 'neutral'
			},
			{
				id: 'gentle-truth',
				pole: 'diplomacy',
				mechanism: 'flattering-ambiguity',
				predicate: 'make difficult truths easier for people to hear',
				breadth: 'medium',
				valence: 'positive'
			},
			{
				id: 'sharp-reply',
				pole: 'directness',
				mechanism: 'guarded-vulnerability',
				predicate: 'worry that a sharp reply will do lasting harm',
				breadth: 'broad',
				valence: 'mixed'
			},
			{
				id: 'hold-bluntness',
				pole: 'diplomacy',
				mechanism: 'redeemable-flaw',
				predicate: 'hold back a blunt answer because fairness is important to you',
				breadth: 'broad',
				valence: 'mixed'
			},
			{
				id: 'clearer-voice',
				pole: 'directness',
				mechanism: 'unused-potential',
				predicate: 'speak more clearly than you expect in tense moments',
				breadth: 'medium',
				valence: 'positive'
			}
		],
		rainbow: {
			id: 'honesty-and-care',
			pole: 'balanced',
			firstPredicate: 'want honest answers',
			secondPredicate: 'take care with harsh words'
		}
	},
	{
		axis: 'expression-restraint',
		families: [
			{
				id: 'actions-over-words',
				pole: 'restraint',
				mechanism: 'broad-common-experience',
				predicate: 'show your feelings more through actions than words',
				breadth: 'broad',
				valence: 'neutral'
			},
			{
				id: 'safe-speaking',
				pole: 'expression',
				mechanism: 'broad-common-experience',
				predicate: 'speak freely once you feel understood',
				breadth: 'broad',
				valence: 'positive'
			},
			{
				id: 'notice-feelings',
				pole: 'expression',
				mechanism: 'flattering-ambiguity',
				predicate: "notice small shifts in a conversation's mood",
				breadth: 'medium',
				valence: 'positive'
			},
			{
				id: 'hidden-hurt',
				pole: 'restraint',
				mechanism: 'guarded-vulnerability',
				predicate: 'hide hurt feelings longer than people realize',
				breadth: 'broad',
				valence: 'mixed'
			},
			{
				id: 'protective-silence',
				pole: 'restraint',
				mechanism: 'redeemable-flaw',
				predicate: 'stay quiet because you do not want to make things worse',
				breadth: 'broad',
				valence: 'mixed'
			},
			{
				id: 'more-to-say',
				pole: 'expression',
				mechanism: 'unused-potential',
				predicate: 'have more to say than you reveal at first',
				breadth: 'medium',
				valence: 'positive'
			}
		],
		rainbow: {
			id: 'quiet-and-open',
			pole: 'balanced',
			firstPredicate: 'hold some feelings back',
			secondPredicate: 'speak freely with trusted people'
		}
	},
	{
		axis: 'curiosity-focus',
		families: [
			{
				id: 'pulling-question',
				pole: 'curiosity',
				mechanism: 'broad-common-experience',
				predicate: 'follow questions that keep pulling at your attention',
				breadth: 'broad',
				valence: 'positive'
			},
			{
				id: 'finish-first',
				pole: 'focus',
				mechanism: 'broad-common-experience',
				predicate: 'prefer finishing one thing before starting another',
				breadth: 'broad',
				valence: 'neutral'
			},
			{
				id: 'link-ideas',
				pole: 'curiosity',
				mechanism: 'flattering-ambiguity',
				predicate: 'find links between ideas that others keep separate',
				breadth: 'medium',
				valence: 'positive'
			},
			{
				id: 'empty-task',
				pole: 'curiosity',
				mechanism: 'guarded-vulnerability',
				predicate: 'lose focus when a task feels empty or repetitive',
				breadth: 'broad',
				valence: 'mixed'
			},
			{
				id: 'chase-details',
				pole: 'focus',
				mechanism: 'redeemable-flaw',
				predicate: 'chase details because you want the whole picture to make sense',
				breadth: 'broad',
				valence: 'mixed'
			},
			{
				id: 'unexplored-interests',
				pole: 'curiosity',
				mechanism: 'unused-potential',
				predicate: 'have interests you have not given enough time to explore',
				breadth: 'medium',
				valence: 'positive'
			}
		],
		rainbow: {
			id: 'questions-and-focus',
			pole: 'balanced',
			firstPredicate: 'explore several ideas',
			secondPredicate: 'focus deeply once one stands out'
		}
	},
	{
		axis: 'idealism-practicality',
		families: [
			{
				id: 'fair-system',
				pole: 'idealism',
				mechanism: 'broad-common-experience',
				predicate: 'care about how things should work for everyone',
				breadth: 'broad',
				valence: 'positive'
			},
			{
				id: 'useful-step',
				pole: 'practicality',
				mechanism: 'broad-common-experience',
				predicate: 'look for a useful next step when ideas feel too large',
				breadth: 'broad',
				valence: 'neutral'
			},
			{
				id: 'inner-compass',
				pole: 'idealism',
				mechanism: 'flattering-ambiguity',
				predicate: 'keep a strong sense of what feels right',
				breadth: 'medium',
				valence: 'positive'
			},
			{
				id: 'fallen-hopes',
				pole: 'idealism',
				mechanism: 'guarded-vulnerability',
				predicate: 'feel disappointed when reality falls short of your hopes',
				breadth: 'broad',
				valence: 'mixed'
			},
			{
				id: 'useful-compromise',
				pole: 'practicality',
				mechanism: 'redeemable-flaw',
				predicate: 'make compromises because you still want real progress',
				breadth: 'broad',
				valence: 'mixed'
			},
			{
				id: 'fair-chance',
				pole: 'idealism',
				mechanism: 'unused-potential',
				predicate: 'have ideas that deserve a fair chance',
				breadth: 'medium',
				valence: 'positive'
			}
		],
		rainbow: {
			id: 'hope-and-action',
			pole: 'balanced',
			firstPredicate: 'care about the ideal',
			secondPredicate: 'look for a practical next step'
		}
	},
	{
		axis: 'independence-collaboration',
		families: [
			{
				id: 'work-alone',
				pole: 'independence',
				mechanism: 'broad-common-experience',
				predicate: 'work well alone when you know what needs doing',
				breadth: 'broad',
				valence: 'positive'
			},
			{
				id: 'shared-effort',
				pole: 'collaboration',
				mechanism: 'broad-common-experience',
				predicate: 'enjoy building something with people who share the effort',
				breadth: 'broad',
				valence: 'positive'
			},
			{
				id: 'group-balance',
				pole: 'collaboration',
				mechanism: 'flattering-ambiguity',
				predicate: 'bring useful balance to a group without seeking attention',
				breadth: 'medium',
				valence: 'positive'
			},
			{
				id: 'uneven-work',
				pole: 'collaboration',
				mechanism: 'guarded-vulnerability',
				predicate: 'feel frustrated when others do not carry their share',
				breadth: 'broad',
				valence: 'mixed'
			},
			{
				id: 'take-over',
				pole: 'independence',
				mechanism: 'redeemable-flaw',
				predicate: 'take over a task because you want the group to succeed',
				breadth: 'broad',
				valence: 'mixed'
			},
			{
				id: 'quiet-leadership',
				pole: 'independence',
				mechanism: 'unused-potential',
				predicate: 'have more leadership in you than your role asks for',
				breadth: 'medium',
				valence: 'positive'
			}
		],
		rainbow: {
			id: 'alone-and-together',
			pole: 'balanced',
			firstPredicate: 'work well on your own',
			secondPredicate: 'value a team that shares the load'
		}
	},
	{
		axis: 'ambition-contentment',
		families: [
			{
				id: 'meaningful-effort',
				pole: 'ambition',
				mechanism: 'broad-common-experience',
				predicate: 'want your effort to lead somewhere meaningful',
				breadth: 'broad',
				valence: 'positive'
			},
			{
				id: 'small-wins',
				pole: 'contentment',
				mechanism: 'broad-common-experience',
				predicate: 'appreciate small wins that make an ordinary day better',
				breadth: 'broad',
				valence: 'positive'
			},
			{
				id: 'quiet-standards',
				pole: 'ambition',
				mechanism: 'flattering-ambiguity',
				predicate: 'set standards that quietly lift the people around you',
				breadth: 'medium',
				valence: 'positive'
			},
			{
				id: 'feeling-behind',
				pole: 'ambition',
				mechanism: 'guarded-vulnerability',
				predicate: 'feel behind even after making real progress',
				breadth: 'broad',
				valence: 'mixed'
			},
			{
				id: 'raising-bar',
				pole: 'ambition',
				mechanism: 'redeemable-flaw',
				predicate: 'keep raising the bar because you care about your work',
				breadth: 'broad',
				valence: 'mixed'
			},
			{
				id: 'unspoken-goals',
				pole: 'ambition',
				mechanism: 'unused-potential',
				predicate: 'have goals you have not fully admitted to yourself',
				breadth: 'medium',
				valence: 'positive'
			}
		],
		rainbow: {
			id: 'drive-and-enough',
			pole: 'balanced',
			firstPredicate: 'want to keep growing',
			secondPredicate: 'value what you already have'
		}
	},
	{
		axis: 'optimism-realism',
		families: [
			{
				id: 'hope-and-risk',
				pole: 'balanced',
				mechanism: 'broad-common-experience',
				predicate: 'hope for a good result while watching the risks',
				breadth: 'broad',
				valence: 'positive'
			},
			{
				id: 'prepare-problems',
				pole: 'realism',
				mechanism: 'broad-common-experience',
				predicate: 'prepare for problems without expecting the worst',
				breadth: 'broad',
				valence: 'neutral'
			},
			{
				id: 'way-forward',
				pole: 'optimism',
				mechanism: 'flattering-ambiguity',
				predicate: 'help people see a way forward during uncertain moments',
				breadth: 'medium',
				valence: 'positive'
			},
			{
				id: 'setbacks-together',
				pole: 'optimism',
				mechanism: 'guarded-vulnerability',
				predicate: 'lose hope briefly when setbacks arrive together',
				breadth: 'broad',
				valence: 'mixed'
			},
			{
				id: 'question-good-news',
				pole: 'realism',
				mechanism: 'redeemable-flaw',
				predicate: 'question good news because you want it to be real',
				breadth: 'broad',
				valence: 'mixed'
			},
			{
				id: 'hidden-hope',
				pole: 'optimism',
				mechanism: 'unused-potential',
				predicate: 'have more hope than your cautious side reveals',
				breadth: 'medium',
				valence: 'positive'
			}
		],
		rainbow: {
			id: 'hope-and-caution',
			pole: 'balanced',
			firstPredicate: 'hope things work out',
			secondPredicate: 'prepare for what could go wrong'
		}
	},
	{
		axis: 'persistence-rest',
		families: [
			{
				id: 'worthwhile-goal',
				pole: 'persistence',
				mechanism: 'broad-common-experience',
				predicate: 'keep going when the goal still feels worth it',
				breadth: 'broad',
				valence: 'positive'
			},
			{
				id: 'useful-break',
				pole: 'rest',
				mechanism: 'broad-common-experience',
				predicate: 'know when a short break will help you return stronger',
				breadth: 'broad',
				valence: 'positive'
			},
			{
				id: 'finish-hard-work',
				pole: 'persistence',
				mechanism: 'flattering-ambiguity',
				predicate: 'stay with difficult work until it is finished',
				breadth: 'medium',
				valence: 'positive'
			},
			{
				id: 'guilty-rest',
				pole: 'persistence',
				mechanism: 'guarded-vulnerability',
				predicate: 'feel guilty about resting with work unfinished',
				breadth: 'broad',
				valence: 'mixed'
			},
			{
				id: 'quality-break',
				pole: 'rest',
				mechanism: 'redeemable-flaw',
				predicate: 'step away because you want to protect the quality of your work',
				breadth: 'broad',
				valence: 'mixed'
			},
			{
				id: 'unused-endurance',
				pole: 'persistence',
				mechanism: 'unused-potential',
				predicate: 'have more endurance than an easy day asks of you',
				breadth: 'medium',
				valence: 'positive'
			}
		],
		rainbow: {
			id: 'effort-and-rest',
			pole: 'balanced',
			firstPredicate: 'push through a hard stretch',
			secondPredicate: 'take a break before your focus fades'
		}
	},
	{
		axis: 'belonging-individuality',
		families: [
			{
				id: 'belong-and-self',
				pole: 'balanced',
				mechanism: 'broad-common-experience',
				predicate: 'enjoy belonging without losing your own point of view',
				breadth: 'broad',
				valence: 'positive'
			},
			{
				id: 'private-part',
				pole: 'individuality',
				mechanism: 'broad-common-experience',
				predicate: 'keep a part of yourself separate from every group',
				breadth: 'broad',
				valence: 'neutral'
			},
			{
				id: 'include-others',
				pole: 'belonging',
				mechanism: 'flattering-ambiguity',
				predicate: 'make people feel included without demanding much attention',
				breadth: 'medium',
				valence: 'positive'
			},
			{
				id: 'group-overlook',
				pole: 'belonging',
				mechanism: 'guarded-vulnerability',
				predicate: 'feel unseen when a group overlooks your point of view',
				breadth: 'broad',
				valence: 'mixed'
			},
			{
				id: 'protect-values',
				pole: 'individuality',
				mechanism: 'redeemable-flaw',
				predicate: 'stand apart because fitting in should not cost your values',
				breadth: 'broad',
				valence: 'mixed'
			},
			{
				id: 'future-home',
				pole: 'belonging',
				mechanism: 'unused-potential',
				predicate: 'feel more at home when a group shares your values',
				breadth: 'medium',
				valence: 'positive'
			}
		],
		rainbow: {
			id: 'belong-and-stand-out',
			pole: 'balanced',
			firstPredicate: 'like feeling part of a group',
			secondPredicate: 'keep your own point of view'
		}
	}
] as const;
