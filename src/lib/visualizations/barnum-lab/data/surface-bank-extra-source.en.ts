import type { ContentAxis, Mechanism } from '../core/types';

export interface ExtraSurfaceFamilySource {
	id: string;
	pole: string;
	predicate: string;
	mechanism: Extract<
		Mechanism,
		| 'broad-common-experience'
		| 'flattering-ambiguity'
		| 'guarded-vulnerability'
		| 'redeemable-flaw'
		| 'unused-potential'
	>;
}

type GroupedExtras = Readonly<Record<ContentAxis, readonly ExtraSurfaceFamilySource[]>>;

const family = (
	mechanism: ExtraSurfaceFamilySource['mechanism'],
	id: string,
	pole: string,
	predicate: string
): ExtraSurfaceFamilySource => ({ mechanism, id, pole, predicate });

const broad = (id: string, pole: string, predicate: string) =>
	family('broad-common-experience', id, pole, predicate);
const flattering = (id: string, pole: string, predicate: string) =>
	family('flattering-ambiguity', id, pole, predicate);
const guarded = (id: string, pole: string, predicate: string) =>
	family('guarded-vulnerability', id, pole, predicate);
const redeemable = (id: string, pole: string, predicate: string) =>
	family('redeemable-flaw', id, pole, predicate);
const unused = (id: string, pole: string, predicate: string) =>
	family('unused-potential', id, pole, predicate);

/** Twelve additional plain substantive claims per axis; all forms are materialized at build time. */
export const EXTRA_SURFACE_FAMILIES_EN: GroupedExtras = {
	'autonomy-approval': [
		broad('room-to-decide', 'autonomy', 'prefer support that leaves you room to decide'),
		broad('trusted-check', 'approval', 'check your choices against the views of people you trust'),
		broad('truly-yours', 'autonomy', 'feel better when an important decision is truly yours'),
		broad('limited-agreement', 'approval', 'value agreement without needing it from everyone'),
		flattering('crowded-view', 'autonomy', 'keep your own view when people around you disagree'),
		flattering(
			'advice-without-control',
			'balanced',
			'give advice without trying to control the final decision'
		),
		guarded(
			'disagreement-doubt',
			'approval',
			'second guess yourself after someone important disagrees'
		),
		guarded(
			'reasons-brushed-aside',
			'autonomy',
			'feel overlooked when your reasons are brushed aside'
		),
		redeemable(
			'firm-choice',
			'autonomy',
			'defend your choices firmly because independence matters to you'
		),
		redeemable(
			'reassurance-impact',
			'approval',
			'seek reassurance because you care how your decisions affect others'
		),
		unused(
			'unexpected-decisions',
			'autonomy',
			'have decisions in you that other people would not expect'
		),
		unused(
			'trust-judgment',
			'autonomy',
			'trust your judgment more after you stop trying to please everyone'
		)
	],
	'company-solitude': [
		broad('easy-conversation', 'company', 'enjoy conversations that let you relax and be yourself'),
		broad('small-circle', 'company', 'keep a small circle of people who know you well'),
		broad('room-making-people', 'company', 'feel energized by people who make room for you'),
		broad('quiet-after-full-day', 'solitude', 'look forward to quiet after a full day'),
		flattering('easy-one-to-one', 'company', 'make one to one conversations feel easy'),
		flattering('notice-left-out', 'company', 'notice when someone in a group is left out'),
		guarded(
			'available-too-long',
			'solitude',
			'feel drained after being available to others for too long'
		),
		guarded('silence-personal', 'company', 'take silence personally when you already feel unsure'),
		redeemable(
			'decline-to-recharge',
			'solitude',
			'decline some plans because you know you need to recharge'
		),
		redeemable(
			'familiar-group',
			'company',
			'stay near familiar people because new groups take energy'
		),
		unused(
			'social-confidence',
			'company',
			'have social confidence that appears in the right setting'
		),
		unused('room-warmth', 'company', 'bring more warmth to a room than you notice')
	],
	'deliberation-spontaneity': [
		broad(
			'compare-options',
			'deliberation',
			'compare a few options before making an important choice'
		),
		broad('new-detail', 'deliberation', 'change your mind when a new detail changes the choice'),
		broad('low-stakes-speed', 'spontaneity', 'make quick choices when the stakes feel low'),
		broad('return-unsolved', 'deliberation', 'return to decisions that still feel unfinished'),
		flattering(
			'hidden-consequences',
			'deliberation',
			'spot consequences that other people overlook'
		),
		flattering('enough-thinking', 'balanced', 'know when more thought will not help'),
		guarded('replay-decision', 'doubt', 'replay decisions after you have already made them'),
		guarded(
			'quick-answer-pressure',
			'deliberation',
			'feel pressured when someone demands a quick answer'
		),
		redeemable(
			'more-questions',
			'deliberation',
			'ask more questions because you want to avoid a mistake'
		),
		redeemable(
			'serious-promise',
			'deliberation',
			'delay commitment because you take promises seriously'
		),
		unused(
			'faster-judgment',
			'spontaneity',
			'decide faster than you expect in familiar situations'
		),
		unused(
			'enough-information',
			'deliberation',
			'make confident decisions once you have enough information'
		)
	],
	'stability-change': [
		broad('effort-saving-routine', 'stability', 'keep routines that save you effort'),
		broad('useful-change', 'change', 'welcome change that fixes a real problem'),
		broad('familiar-return', 'stability', 'return gladly to places that feel familiar'),
		broad('small-rearrangement', 'change', 'rearrange small things for a fresh start'),
		flattering('shared-rhythm', 'stability', 'create a dependable rhythm for people around you'),
		flattering('improve-routine', 'balanced', 'improve routines without losing what already works'),
		guarded('too-much-change', 'stability', 'feel unsettled when too many things change at once'),
		guarded('same-week', 'change', 'get bored when every week starts looking the same'),
		redeemable(
			'resist-sudden-change',
			'stability',
			'resist sudden changes because you need time to adjust'
		),
		redeemable('attention-reset', 'change', 'break a routine because your attention needs a reset'),
		unused(
			'disrupted-flexibility',
			'change',
			'adapt better than you expect when plans suddenly change'
		),
		unused('steadier-habits', 'stability', 'build steadier habits than you have tried before')
	],
	'reserve-openness': [
		broad('private-thoughts', 'reserve', 'choose carefully who hears your private thoughts'),
		broad('safe-conversation', 'openness', 'speak more when a conversation feels safe'),
		broad('listen-first', 'reserve', 'listen for a while before joining a new group'),
		broad('honest-boundary', 'balanced', 'prefer honesty without sharing everything at once'),
		flattering('tone-first', 'reserve', 'read the tone before choosing your words'),
		flattering('heard-with-silence', 'reserve', 'make other people feel heard without saying much'),
		guarded('opened-too-soon', 'openness', 'regret opening up too quickly'),
		guarded(
			'careless-reply',
			'openness',
			'feel exposed when a personal comment gets a cold response'
		),
		redeemable(
			'clear-opinion',
			'reserve',
			'hold back an opinion until you find clear words for it'
		),
		redeemable('gradual-trust', 'reserve', 'take time to trust because closeness matters to you'),
		unused(
			'useful-honesty',
			'openness',
			'have honest thoughts that would strengthen a conversation'
		),
		unused('easier-speaking', 'openness', 'speak with more ease than first impressions suggest')
	],
	'structure-flexibility': [
		broad('competing-list', 'structure', 'make lists when many small tasks compete'),
		broad('open-space', 'flexibility', 'leave space in a plan for better ideas'),
		broad('rough-plan', 'structure', 'settle faster after forming a rough plan'),
		broad('better-option', 'flexibility', 'enjoy changing plans when a better option appears'),
		flattering('vague-next-step', 'structure', 'turn a vague task into a useful next step'),
		flattering(
			'detail-and-goal',
			'balanced',
			'track important details without losing the main goal'
		),
		guarded('unclear-expectations', 'structure', 'feel tense when expectations remain unclear'),
		guarded('rigid-plan', 'flexibility', 'lose momentum when a plan becomes too rigid'),
		redeemable(
			'extra-details',
			'structure',
			'make backup plans because unexpected changes bother you'
		),
		redeemable(
			'results-over-routine',
			'flexibility',
			'change methods because results matter more than routine'
		),
		unused('planning-skill', 'structure', 'have stronger planning skills than you use each day'),
		unused(
			'unexpected-change',
			'flexibility',
			'handle unexpected changes better than you first expect'
		)
	],
	'confidence-doubt': [
		broad('prepared-confidence', 'confidence', 'feel confident after enough preparation'),
		broad('later-doubts', 'doubt', 'notice doubts after making a choice'),
		broad('known-subject', 'confidence', 'speak firmly about things you know well'),
		broad('second-opinion', 'doubt', 'look for a second opinion when the stakes are high'),
		flattering('embarrassment-recovery', 'confidence', 'recover well after an embarrassing moment'),
		flattering(
			'steady-others',
			'confidence',
			'offer calm when other people start doubting themselves'
		),
		guarded('small-criticism', 'doubt', 'feel shaken by criticism even when it seems small'),
		guarded(
			'certain-voices',
			'doubt',
			'question yourself when someone else sounds completely certain'
		),
		redeemable(
			'reliable-check',
			'doubt',
			'check your work twice because you want others to rely on it'
		),
		redeemable('correct-pause', 'doubt', 'hesitate to speak because you care about being correct'),
		unused('pressure-voice', 'confidence', 'speak more steadily than you expect under pressure'),
		unused('recent-doubts', 'confidence', 'trust your judgment when you have enough information')
	],
	'patience-urgency': [
		broad('reason-for-wait', 'patience', 'wait better when you know what the delay is for'),
		broad('clear-decision', 'urgency', 'act quickly once the decision is clear'),
		broad('time-to-explain', 'patience', 'give people time to explain themselves'),
		broad('waiting-limit', 'urgency', 'notice when waiting stops being useful'),
		flattering('calm-amid-rush', 'patience', 'stay calm while other people rush'),
		flattering('demanding-pace', 'patience', 'keep steady when the pace becomes demanding'),
		guarded('unexplained-delay', 'urgency', 'feel irritated by delays that no one explains'),
		guarded('patience-limit', 'urgency', 'lose patience after holding it in for a long time'),
		redeemable('move-work', 'urgency', 'push other people because you want the work to move'),
		redeemable(
			'careful-result',
			'patience',
			'slow down because you want to avoid a careless mistake'
		),
		unused('hard-day-calm', 'patience', 'stay calmer than you expect on difficult days'),
		unused('purposeful-pace', 'urgency', 'move with more purpose than busy moments reveal')
	],
	'caution-experimentation': [
		broad('downside-first', 'caution', 'look at the downside before choosing a new route'),
		broad('small-trial', 'experimentation', 'try a new idea after a small test'),
		broad('way-back', 'caution', 'prefer changes that leave you a way back'),
		broad('low-risk-surprise', 'experimentation', 'enjoy a surprise when the risk feels low'),
		flattering('early-trouble', 'caution', 'see trouble before it becomes obvious'),
		flattering('safe-exploration', 'experimentation', 'find safe ways to explore new ideas'),
		guarded('worst-result', 'caution', 'imagine the worst result before an important choice'),
		guarded('no-backup', 'caution', 'feel uneasy when there is no backup plan'),
		redeemable(
			'protect-effort',
			'caution',
			'ask many questions because you want the work to go well'
		),
		redeemable(
			'slow-test',
			'caution',
			'test a new idea carefully because mistakes are hard to undo'
		),
		unused('braver-side', 'experimentation', 'have a braver side than your habits show'),
		unused(
			'sensible-risk',
			'experimentation',
			'take sensible risks when an opportunity feels worth it'
		)
	],
	'directness-diplomacy': [
		broad('clear-meaning', 'directness', 'choose clear words before speaking'),
		broad('exposed-feedback', 'diplomacy', 'soften feedback when a person already feels exposed'),
		broad('plain-answer', 'directness', 'value a plain answer over a clever one'),
		broad('honest-not-cruel', 'balanced', 'notice the difference between honesty and cruelty'),
		flattering('clear-and-kind', 'diplomacy', 'find words that are both clear and kind'),
		flattering('face-problem', 'diplomacy', 'help people face a problem without feeling attacked'),
		guarded('angry-words', 'directness', 'replay sharp things you said in anger'),
		guarded('harsh-reply', 'directness', 'feel hurt when an honest question gets a harsh reply'),
		redeemable('blunt-clarity', 'directness', 'speak too sharply when you want a clear answer'),
		redeemable(
			'relationship-pause',
			'diplomacy',
			'pause to reply because the relationship matters'
		),
		unused('helpful-truth', 'directness', 'have hard truths that would help if said well'),
		unused('direct-talk', 'directness', 'handle direct conversation better than you expect')
	],
	'expression-restraint': [
		broad('actions-say-more', 'restraint', 'use actions when words do not say enough'),
		broad('familiar-stories', 'expression', 'tell stories more easily with people you know well'),
		broad('private-feelings', 'restraint', 'keep your strongest feelings out of public view'),
		broad('expressive-face', 'expression', 'let your face show more than your words say'),
		flattering(
			'unspoken-feeling',
			'expression',
			'notice the unspoken feeling behind an ordinary remark'
		),
		flattering(
			'room-to-speak',
			'restraint',
			'give people room to speak without filling the silence'
		),
		guarded('unnamed-feelings', 'expression', 'wish others noticed feelings you did not name'),
		guarded('quiet-misread', 'restraint', 'feel misunderstood when quiet is mistaken for distance'),
		redeemable(
			'calm-reaction',
			'restraint',
			'hide a reaction because you want to keep the moment calm'
		),
		redeemable('careful-feeling', 'expression', 'speak carefully because feelings matter to you'),
		unused('playful-side', 'expression', 'have a playful side that needs safer company'),
		unused('early-nerves', 'expression', 'speak more freely after getting comfortable with someone')
	],
	'curiosity-focus': [
		broad('linked-ideas', 'curiosity', 'move between ideas when one leads to another'),
		broad('held-attention', 'focus', 'settle into deep focus when a subject holds your attention'),
		broad('saved-questions', 'curiosity', 'save questions that you want to explore later'),
		broad('learning-for-itself', 'curiosity', 'enjoy learning without needing a practical reason'),
		flattering('unrelated-links', 'curiosity', 'notice links between topics that seem unrelated'),
		flattering('opening-question', 'curiosity', 'ask questions that open useful new angles'),
		guarded('simple-answer', 'curiosity', 'lose interest once an answer feels too simple'),
		guarded('too-many-ideas', 'curiosity', 'feel scattered when too many ideas arrive together'),
		redeemable(
			'side-question',
			'curiosity',
			'follow a side question to see whether it changes the main answer'
		),
		redeemable(
			'unfinished-focus',
			'focus',
			'focus narrowly because unfinished work stays in your mind'
		),
		unused('growing-interest', 'curiosity', 'have interests that would grow with more time'),
		unused('deeper-focus', 'focus', 'focus more deeply when interruptions ease')
	],
	'idealism-practicality': [
		broad('fair-rules', 'idealism', 'care whether the rules feel fair'),
		broad('real-solution', 'practicality', 'look for solutions that work in real life'),
		broad('useful-tradeoff', 'balanced', 'keep your ideals while making practical tradeoffs'),
		broad('imperfect-progress', 'practicality', 'value progress even when it is imperfect'),
		flattering(
			'human-and-practical',
			'balanced',
			'see both the human and practical sides of a problem'
		),
		flattering('purpose-in-routine', 'idealism', 'keep the purpose in view during routine work'),
		guarded('careless-idea', 'idealism', 'feel discouraged when a good idea is handled carelessly'),
		guarded(
			'personal-unfairness',
			'idealism',
			'take unfairness personally even when you cannot change it'
		),
		redeemable(
			'lasting-answer',
			'idealism',
			'question a simple answer because you want one that holds up'
		),
		redeemable(
			'partial-progress',
			'practicality',
			'accept a compromise because partial progress still helps'
		),
		unused('waiting-idea', 'idealism', 'have useful ideas waiting for the right place'),
		unused(
			'ideals-to-action',
			'practicality',
			'turn more ideals into action than you currently realize'
		)
	],
	'independence-collaboration': [
		broad('own-a-task', 'independence', 'enjoy owning a task from start to finish'),
		broad('shared-time', 'collaboration', 'ask for help when shared work saves time'),
		broad('clear-role', 'collaboration', 'prefer a clear role in a group'),
		broad('progress-alone', 'independence', 'make progress alone before seeking feedback'),
		flattering('team-without-credit', 'collaboration', 'support a team without needing the credit'),
		flattering(
			'confused-roles',
			'collaboration',
			'keep a group moving when the next steps are unclear'
		),
		guarded(
			'heavy-dependence',
			'independence',
			'feel burdened when others depend too heavily on you'
		),
		guarded(
			'lost-contribution',
			'collaboration',
			'feel ignored when your contribution disappears into the group'
		),
		redeemable(
			'fear-of-stall',
			'independence',
			'take control because you fear the work will stall'
		),
		redeemable(
			'awkward-help',
			'independence',
			'stay independent because asking for help feels awkward'
		),
		unused('team-voice', 'collaboration', 'have a stronger team voice than you use'),
		unused('natural-lead', 'independence', 'take the lead when a group needs direction')
	],
	'ambition-contentment': [
		broad('clear-purpose', 'ambition', 'want your efforts to have a clear purpose'),
		broad('modest-goal', 'contentment', 'enjoy completing a modest goal well'),
		broad('private-standard', 'ambition', 'compare your progress with a private standard'),
		broad('hard-task-done', 'contentment', 'feel satisfied after completing a difficult task'),
		flattering(
			'quality-by-example',
			'ambition',
			'help improve shared work by doing your part well'
		),
		flattering('better-result', 'ambition', 'notice ways to make a good result better'),
		guarded('goal-restlessness', 'ambition', 'feel restless soon after reaching a goal'),
		guarded('remaining-work', 'ambition', 'dismiss your own progress when more remains'),
		redeemable('unfinished-hours', 'ambition', 'work too long because unfinished tasks bother you'),
		redeemable(
			'high-expectation',
			'ambition',
			'expect a lot from yourself because you care about the result'
		),
		unused('larger-goals', 'ambition', 'have bigger goals than your daily routine reveals'),
		unused('measure-less', 'ambition', 'achieve more when you stop measuring every step')
	],
	'optimism-realism': [
		broad('hopeful-plan', 'optimism', 'look for the hopeful part of a realistic plan'),
		broad('setbacks-and-outcome', 'realism', 'expect setbacks without giving up on the outcome'),
		broad('bad-day-passes', 'optimism', 'believe that a bad day will not last forever'),
		broad('unused-backup', 'realism', 'prepare a backup and hope it stays unused'),
		flattering('useful-hope', 'optimism', 'help others find useful hope during uncertainty'),
		flattering('honest-warning', 'balanced', 'balance encouragement with an honest warning'),
		guarded('small-problems', 'optimism', 'feel discouraged when several small problems pile up'),
		guarded('details-first', 'realism', 'doubt good news until the details hold together'),
		redeemable('trouble-ready', 'realism', 'prepare for trouble because surprises unsettle you'),
		redeemable('hopeful-hold', 'optimism', 'hold onto hope because giving up feels too final'),
		unused('setback-resilience', 'optimism', 'have more resilience than a recent setback suggests'),
		unused('shared-hope', 'optimism', 'bring more hope to other people than you notice')
	],
	'persistence-rest': [
		broad('return-after-break', 'persistence', 'return to a goal after taking a break'),
		broad('effort-limit', 'rest', 'stop when more effort no longer helps'),
		broad('clear-beginning', 'persistence', 'work steadily once the beginning is clear'),
		broad('rest-before-challenge', 'rest', 'protect your rest before a new challenge'),
		flattering(
			'quiet-finisher',
			'persistence',
			'finish difficult jobs without making a show of it'
		),
		flattering(
			'useful-persistence',
			'balanced',
			'know the difference between persistence and wasted effort'
		),
		guarded('rest-guilt', 'persistence', 'feel guilty while resting with work unfinished'),
		guarded('invested-effort', 'persistence', 'struggle to stop after investing a lot of effort'),
		redeemable('promise-kept', 'persistence', 'keep trying because a promise matters to you'),
		redeemable(
			'clearer-return',
			'rest',
			'take a break because you want to return with a clearer mind'
		),
		unused(
			'future-stamina',
			'persistence',
			'keep going longer than you expect once a task matters to you'
		),
		unused(
			'recover-momentum',
			'persistence',
			'recover momentum faster than a setback makes you think'
		)
	],
	'belonging-individuality': [
		broad('room-for-difference', 'belonging', 'value groups that leave room for differences'),
		broad('separate-tastes', 'individuality', 'keep your own tastes when close friends disagree'),
		broad('familiar-ritual', 'belonging', 'enjoy familiar rituals with people you care about'),
		broad(
			'different-groups',
			'individuality',
			'show different sides of yourself across social groups'
		),
		flattering('unwelcomed-person', 'belonging', 'notice who has not been welcomed'),
		flattering('belong-without-copying', 'belonging', 'help new people feel welcome in a group'),
		guarded('busy-loneliness', 'belonging', 'feel lonely even in a busy room'),
		guarded(
			'difference-risk',
			'individuality',
			'worry that being different makes it harder to fit in'
		),
		redeemable(
			'values-over-approval',
			'individuality',
			'step outside a group because values matter more than approval'
		),
		redeemable(
			'adapt-for-connection',
			'belonging',
			'adapt to fit in because connection matters to you'
		),
		unused(
			'future-community',
			'belonging',
			'feel at home in groups that welcome different viewpoints'
		),
		unused('unexpected-home', 'belonging', 'feel more at home than you expect in the right group')
	]
};

for (const [axis, families] of Object.entries(EXTRA_SURFACE_FAMILIES_EN)) {
	if (families.length !== 12)
		throw new Error(`${axis} must contain exactly twelve extra families.`);
}
