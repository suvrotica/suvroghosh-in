/**
 * @deprecated Historical v1 audit fixture only. These fragments are not surface-approved and no
 * v2 compiler, manifest, sampler, feedback path, or browser barrel imports this file.
 */
import type { BarnumTechnique, BreadthBand, ContentAxis, CorpusFragment } from '../core/types';
import type { SelfReportQuestionId } from '../core/question-types';

interface AuthoredPoleSet {
	pole: string;
	independent: readonly string[];
	contrast: readonly string[];
	subordinate: readonly string[];
}

interface AuthoredAxisSet {
	axis: ContentAxis;
	a: AuthoredPoleSet;
	b: AuthoredPoleSet;
}

/*
 * Every entry below is a complete, editorially reviewed clause. The compiler adds stable
 * metadata only; it never constructs personality prose from adjective or phrase lists.
 */
const AXIS_CLAUSES: readonly AuthoredAxisSet[] = [
	{
		axis: 'autonomy-approval',
		a: {
			pole: 'autonomy',
			independent: [
				'you prefer deciding for yourself once you understand the choices',
				'you feel most at ease when the final call remains yours',
				'you value having room to choose your own route',
				'you resist letting other people set every term',
				'you often form a private view before joining a consensus',
				'you like advice to remain advice rather than become an instruction',
				'you can follow a shared plan without surrendering your judgment',
				'you notice quickly when a choice no longer feels like your own'
			],
			contrast: [
				'you still want the final choice to belong to you',
				'you can defend a course that makes sense to you',
				'you often need some room to do things in your own way',
				'you tend to keep a portion of the decision for yourself'
			],
			subordinate: [
				'although you listen to advice, you prefer to make up your own mind',
				'although other views can help, you do not want them to replace your judgment',
				'while you can cooperate readily, you still value a private margin of choice',
				'while agreement can be useful, you are not always guided by it'
			]
		},
		b: {
			pole: 'approval',
			independent: [
				'you sometimes look for reassurance when a choice feels personally important',
				'you care about how your decisions land with people whose views matter to you',
				'you can adjust your approach after noticing a trusted person’s reaction',
				'you may revisit a choice after hearing a response you did not expect',
				'you appreciate a sign that you have understood what others need',
				'you sometimes test an idea aloud before fully committing to it',
				'you can feel steadier when someone you respect sees the sense in your plan',
				'you tend to notice whether your contribution has been received well'
			],
			contrast: [
				'you also appreciate knowing that a trusted person understands your choice',
				'you can be steadied by reassurance when the stakes feel personal',
				'you sometimes check the room before pressing ahead',
				'you may soften a decision when an important response gives you pause'
			],
			subordinate: [
				'although you often choose independently, reassurance can still matter',
				'although you know your own reasons, you sometimes want them recognised',
				'while you do not need universal agreement, a trusted response can carry weight',
				'while approval is not everything, its absence can still make you reconsider'
			]
		}
	},
	{
		axis: 'company-solitude',
		a: {
			pole: 'company',
			independent: [
				'you can become more animated when the company feels easy',
				'you enjoy sharing an experience when the group asks little performance of you',
				'you often find that a good conversation changes the texture of a day',
				'you can draw energy from being among people who let you settle in',
				'you appreciate company that leaves room for pauses',
				'you sometimes understand an idea better by talking it through',
				'you can feel lighter after an unforced exchange with someone familiar',
				'you enjoy being included when the invitation feels genuine'
			],
			contrast: [
				'you can also welcome company when the setting feels right',
				'you often enjoy an exchange that does not demand a performance',
				'you may become sociable once the atmosphere feels comfortable',
				'you can value the lift that comes from a well-matched group'
			],
			subordinate: [
				'although you do not seek every gathering, good company can draw you in',
				'although crowds are not always appealing, the right conversation can be',
				'while you protect your own time, you can enjoy sharing it freely',
				'while company can be tiring, it can also restore you in the right form'
			]
		},
		b: {
			pole: 'solitude',
			independent: [
				'you sometimes want a stretch of time in which nobody asks anything of you',
				'you can recover clarity by stepping away from conversation',
				'you value moments when you can follow a thought without interruption',
				'you may need quiet after a day of responding to other people',
				'you appreciate having a corner of time that belongs only to you',
				'you can enjoy company and still feel relief when you are alone again',
				'you sometimes postpone messages simply to regain mental space',
				'you tend to notice when social noise has crowded out your own thoughts'
			],
			contrast: [
				'you still need periods in which no response is expected',
				'you can also feel restored by being left to your own thoughts',
				'you sometimes prefer quiet to even pleasant conversation',
				'you may withdraw for a while without rejecting anyone'
			],
			subordinate: [
				'although you can enjoy people, you sometimes need complete quiet',
				'although connection matters, uninterrupted time has its own value',
				'while you can be present with others, solitude may be how you reset',
				'while you welcome some invitations, you are relieved to decline others'
			]
		}
	},
	{
		axis: 'deliberation-spontaneity',
		a: {
			pole: 'deliberation',
			independent: [
				'you prefer to think important choices through',
				'you often want enough information to see what a decision commits you to',
				'you can pause over a choice that other people make quickly',
				'you tend to examine the consequences before closing an option',
				'you sometimes delay an answer until its shape feels clearer',
				'you appreciate decisions that survive a second look',
				'you often separate the urgent part of a choice from the important part',
				'you may rehearse two or three outcomes before acting'
			],
			contrast: [
				'you still prefer to understand a choice before making it',
				'you can slow down when the consequences deserve attention',
				'you often leave room for a second look before committing',
				'you tend to test an immediate answer against what matters later'
			],
			subordinate: [
				'although a quick answer can be tempting, you often inspect it once more',
				'although delay has costs, you dislike committing without enough context',
				'while some choices are simple, important ones can occupy you for a while',
				'while you can decide promptly, you prefer not to confuse speed with clarity'
			]
		},
		b: {
			pole: 'spontaneity',
			independent: [
				'you can act quickly when the moment demands it',
				'you sometimes trust the first workable direction and adjust later',
				'you can enjoy making a small choice without turning it into a project',
				'you may commit before every detail is settled when momentum matters',
				'you sometimes discover what you think by beginning',
				'you can make a rapid choice when the alternatives feel reversible',
				'you occasionally prefer a live response to a perfectly prepared one',
				'you know that waiting for complete certainty can cost an opportunity'
			],
			contrast: [
				'you can also move quickly when delay would add little',
				'you sometimes let the next step reveal what planning cannot',
				'you may choose momentum over another round of consideration',
				'you can trust an immediate judgment in familiar territory'
			],
			subordinate: [
				'although you often think ahead, you can improvise when plans stop helping',
				'although certainty is useful, you do not always wait for all of it',
				'while reflection matters, some moments call for a clean decision',
				'while you can hesitate, you can also surprise yourself with speed'
			]
		}
	},
	{
		axis: 'stability-change',
		a: {
			pole: 'stability',
			independent: [
				'you appreciate knowing which parts of a day will stay dependable',
				'you can find comfort in a rhythm that has proved useful',
				'you prefer some familiar anchors when several things are changing',
				'you often protect routines that quietly make life easier',
				'you notice the value of consistency most when it disappears',
				'you tend to keep arrangements that continue to work',
				'you like changes to leave at least one reliable point intact',
				'you can be patient with repetition when it serves a clear purpose'
			],
			contrast: [
				'you still value a few things remaining dependable',
				'you can return gladly to routines that earn their place',
				'you often keep a stable base beneath your experiments',
				'you tend to preserve what works while other pieces move'
			],
			subordinate: [
				'although novelty can appeal, you appreciate a dependable starting point',
				'although routines can become dull, some of them free your attention',
				'while change has its uses, constancy can make it manageable',
				'while you can adapt, you do not discard every familiar method'
			]
		},
		b: {
			pole: 'change',
			independent: [
				'you can become restless when a useful routine turns into mere repetition',
				'you sometimes need a fresh angle to recover your attention',
				'you enjoy noticing that an old arrangement can be improved',
				'you may change a habit once it starts feeling automatic rather than useful',
				'you can welcome a new route even when the old one still works',
				'you sometimes rearrange small things simply to see them differently',
				'you tend to notice opportunities that become visible after a change',
				'you can feel renewed when a familiar pattern is interrupted'
			],
			contrast: [
				'you also need enough change to keep a routine alive',
				'you can abandon a familiar method when it has gone stale',
				'you sometimes prefer a fresh attempt to polishing the old one',
				'you may welcome disruption when it opens a better arrangement'
			],
			subordinate: [
				'although stability can reassure you, sameness can eventually feel narrow',
				'although you value what works, you are willing to revise it',
				'while routines help, you sometimes need to break their spell',
				'while the familiar has advantages, a new approach can wake your interest'
			]
		}
	},
	{
		axis: 'reserve-openness',
		a: {
			pole: 'reserve',
			independent: [
				'you do not reveal every opinion as soon as it forms',
				'you often wait to understand the tone before saying much',
				'you prefer some thoughts to remain private until they are ready',
				'you can listen for a while before deciding what belongs in the conversation',
				'you sometimes keep a reaction to yourself until its importance is clear',
				'you choose carefully which parts of your experience to share',
				'you can be warm without becoming immediately transparent',
				'you tend to trust gradually rather than all at once'
			],
			contrast: [
				'you still keep some thoughts behind a deliberate boundary',
				'you can hold back until the setting has earned candour',
				'you often reveal yourself in layers rather than in one rush',
				'you may leave an opinion unspoken while you study the room'
			],
			subordinate: [
				'although you can be candid, you do not offer every detail immediately',
				'although openness matters, privacy matters too',
				'while you may speak freely with some people, you remain measured with others',
				'while silence is not agreement, you sometimes let it stand for a while'
			]
		},
		b: {
			pole: 'openness',
			independent: [
				'you can speak plainly once a conversation feels trustworthy',
				'you appreciate exchanges in which people say what they actually mean',
				'you sometimes share a half-formed thought to make the discussion more honest',
				'you can become surprisingly candid when the atmosphere is unforced',
				'you value the relief of not having to edit every sentence',
				'you may volunteer an observation when it could clear the air',
				'you can let enthusiasm show when something genuinely interests you',
				'you tend to respond to openness with more openness'
			],
			contrast: [
				'you can also be direct when the setting feels safe',
				'you sometimes prefer an honest exchange to a polished one',
				'you may reveal more once another person speaks plainly',
				'you can set reserve aside when clarity would help'
			],
			subordinate: [
				'although you begin cautiously, trust can make you candid',
				'although privacy is important, so is being understood',
				'while you do not share indiscriminately, you value real openness',
				'while you can be reserved, a sincere question may draw out a full answer'
			]
		}
	},
	{
		axis: 'structure-flexibility',
		a: {
			pole: 'structure',
			independent: [
				'you like knowing what the next few steps are meant to accomplish',
				'you can work more easily when expectations have a clear shape',
				'you often create a small order before beginning a complicated task',
				'you appreciate a plan that makes progress visible',
				'you tend to give loose work a few useful boundaries',
				'you can relax into a task once its main constraints are named',
				'you often keep track of details that would otherwise drift',
				'you value systems that reduce the need to decide the same thing twice'
			],
			contrast: [
				'you still benefit from a clear outline of what matters',
				'you can impose useful order when a task becomes scattered',
				'you often want the main pieces named before moving quickly',
				'you tend to build a framework before filling every gap'
			],
			subordinate: [
				'although plans can change, you like having one to revise',
				'although improvisation can help, structure gives it direction',
				'while you tolerate uncertainty, named priorities make it easier',
				'while details may shift, you prefer the purpose to remain clear'
			]
		},
		b: {
			pole: 'flexibility',
			independent: [
				'you like having enough room to change course when new information arrives',
				'you can work around a plan without feeling bound to every line of it',
				'you often adjust the order of tasks to suit the moment',
				'you prefer guidelines that leave space for judgment',
				'you can tolerate an unfinished map if the next step is visible',
				'you sometimes improve a plan by departing from it',
				'you may hold several workable routes open before committing',
				'you tend to treat a schedule as a tool rather than a command'
			],
			contrast: [
				'you also want permission to revise the arrangement',
				'you can loosen a plan when circumstances make it clumsy',
				'you sometimes choose responsiveness over tidy procedure',
				'you may leave useful space for the unexpected'
			],
			subordinate: [
				'although structure helps, you resist treating it as immovable',
				'although a plan can guide you, conditions still get a vote',
				'while you value clarity, you also value room to adapt',
				'while schedules can focus you, they do not always deserve obedience'
			]
		}
	},
	{
		axis: 'confidence-doubt',
		a: {
			pole: 'confidence',
			independent: [
				'you can sound certain when you have tested an idea for yourself',
				'you often trust your footing in situations you understand well',
				'you can carry a decision calmly once its reasons are clear',
				'you tend to become decisive after uncertainty has done its work',
				'you may be more self-assured than you appear in familiar territory',
				'you can proceed without repeated reassurance when the path makes sense',
				'you often know when further checking would add little',
				'you can hold a position steadily without needing to dominate the room'
			],
			contrast: [
				'you can still act with confidence once the evidence feels sufficient',
				'you often find a firm footing after an uncertain beginning',
				'you may become decisive when a question enters familiar ground',
				'you can trust conclusions that have survived your own scrutiny'
			],
			subordinate: [
				'although you consider alternatives, you can eventually choose with conviction',
				'although you sometimes hesitate, uncertainty does not always stop you',
				'while you notice risks, you can still back a considered decision',
				'while you are not certain about everything, some judgments feel solid'
			]
		},
		b: {
			pole: 'doubt',
			independent: [
				'you sometimes revisit a decision even after appearing settled about it',
				'you can wonder whether an apparently good answer has hidden costs',
				'you may question yourself more in private than other people realise',
				'you often notice the exception after stating the rule',
				'you can hold a choice and a reservation about it at the same time',
				'you sometimes imagine a better response after the moment has passed',
				'you may check a conclusion again when it matters to someone else',
				'you tend to leave a small opening for the possibility that you missed something'
			],
			contrast: [
				'you still carry private doubts after making a confident choice',
				'you can question a conclusion without abandoning it',
				'you sometimes notice uncertainty only after you have acted',
				'you may keep one reservation even when the decision stands'
			],
			subordinate: [
				'although you can appear sure, a private question may remain',
				'although a decision is made, you sometimes replay its alternatives',
				'while confidence helps you move, doubt keeps inspecting the route',
				'while you can defend a choice, you may still see its weak point'
			]
		}
	},
	{
		axis: 'patience-urgency',
		a: {
			pole: 'patience',
			independent: [
				'you can wait when you believe the delay has a purpose',
				'you often give a process time before deciding that it has failed',
				'you can tolerate slow progress if its direction remains visible',
				'you prefer not to force an answer that is still taking shape',
				'you sometimes let a situation settle before responding',
				'you can repeat a modest effort without demanding immediate proof',
				'you tend to distinguish a pause from a dead end',
				'you appreciate results that have been allowed to mature'
			],
			contrast: [
				'you still know when waiting is part of the work',
				'you can give a promising process another round',
				'you often allow important things more time than minor ones',
				'you may hold back until the moment for action is clearer'
			],
			subordinate: [
				'although delay can frustrate you, you can endure it for a reason',
				'although progress may be quiet, you do not always abandon it',
				'while you want movement, you understand that some steps cannot be rushed',
				'while patience has limits, yours can extend when the aim matters'
			]
		},
		b: {
			pole: 'urgency',
			independent: [
				'you become impatient when waiting seems to add no value',
				'you can feel an urge to move once the next step is obvious',
				'you dislike seeing a simple decision trapped in unnecessary delay',
				'you sometimes begin before the surrounding discussion has caught up',
				'you notice quickly when a process is circling rather than advancing',
				'you can press for closure when uncertainty has become repetitive',
				'you often prefer a workable answer now to a perfect one much later',
				'you may take initiative simply to end a period of drift'
			],
			contrast: [
				'you also know when delay has stopped being useful',
				'you can push for movement once the obstacle looks artificial',
				'you sometimes trade polish for timely progress',
				'you may act to prevent a discussion from becoming another postponement'
			],
			subordinate: [
				'although you can wait, pointless delay quickly wears on you',
				'although caution has value, endless preparation does not',
				'while you respect a process, you want it to lead somewhere',
				'while patience serves some tasks, others improve through prompt action'
			]
		}
	},
	{
		axis: 'caution-experimentation',
		a: {
			pole: 'caution',
			independent: [
				'you prefer to understand the downside before testing an unfamiliar option',
				'you often look for a reversible first step',
				'you can be curious without ignoring what a change might disturb',
				'you tend to inspect unfamiliar promises before relying on them',
				'you appreciate experiments that keep the consequences contained',
				'you sometimes watch how a new approach behaves before adopting it',
				'you value an exit route when the outcome is uncertain',
				'you can decline novelty when its cost is needlessly high'
			],
			contrast: [
				'you still want unfamiliar choices to have a manageable downside',
				'you can test a new route while keeping a safe return',
				'you often separate harmless curiosity from expensive risk',
				'you may wait for a small proof before expanding an experiment'
			],
			subordinate: [
				'although novelty attracts you, you notice what it could unsettle',
				'although an experiment may appeal, you prefer its risks to be bounded',
				'while you can try new things, you rarely need to gamble everything',
				'while caution can slow you, it also keeps a trial informative'
			]
		},
		b: {
			pole: 'experimentation',
			independent: [
				'you sometimes learn faster by trying a small version than by discussing it',
				'you can enjoy testing an unfamiliar method without needing to adopt it',
				'you often discover useful preferences through comparison',
				'you may change one variable simply to see what it alters',
				'you appreciate trials that turn an abstract possibility into evidence',
				'you can treat a modest failure as information rather than a verdict',
				'you sometimes choose the less familiar route because it teaches you more',
				'you tend to ask what would happen if one assumption changed'
			],
			contrast: [
				'you also like to test an idea in the world',
				'you can become adventurous when the experiment is reversible',
				'you sometimes prefer a small trial to another prediction',
				'you may welcome an unfamiliar method as a source of comparison'
			],
			subordinate: [
				'although caution matters, a contained experiment can be more useful',
				'although you assess the risk, you do not always let it end the inquiry',
				'while familiar methods reassure, a trial can reveal what they hide',
				'while you avoid reckless changes, you can still be playfully experimental'
			]
		}
	},
	{
		axis: 'directness-diplomacy',
		a: {
			pole: 'directness',
			independent: [
				'you appreciate language that makes the main point easy to find',
				'you often prefer a clear answer to an elaborate hint',
				'you can say what needs attention when vagueness would prolong it',
				'you tend to respect a disagreement that names itself',
				'you sometimes shorten a conversation by stating the practical issue',
				'you value requests that do not make the listener decode them',
				'you can become blunt when repeated softening obscures the message',
				'you often feel relief when an unspoken question is finally asked'
			],
			contrast: [
				'you still want the central point stated plainly',
				'you can choose clarity when hints have stopped working',
				'you often prefer an honest no to an ambiguous maybe',
				'you may name the awkward issue to let the conversation move'
			],
			subordinate: [
				'although tact matters, you do not want it to erase the message',
				'although words need care, clarity remains part of that care',
				'while you can soften a point, you prefer not to disguise it',
				'while harmony has value, unresolved ambiguity can have a cost'
			]
		},
		b: {
			pole: 'diplomacy',
			independent: [
				'you often consider how a true point can be said without needless abrasion',
				'you can delay a blunt response until you find a fairer form',
				'you sometimes leave room for another person to keep their dignity',
				'you notice when timing matters as much as wording',
				'you can phrase a disagreement so that discussion remains possible',
				'you prefer correction that does not turn into humiliation',
				'you may approach a difficult point indirectly when directness would close the door',
				'you often weigh whether being right now is worth losing cooperation later'
			],
			contrast: [
				'you also adjust the delivery to protect the conversation',
				'you can make a hard point without making it harsher than necessary',
				'you sometimes choose timing over immediate candour',
				'you may soften an edge while preserving the substance'
			],
			subordinate: [
				'although clarity matters, you consider what the listener can receive',
				'although you dislike evasion, you can value a tactful approach',
				'while the point should survive, its sharpest edge need not',
				'while honesty guides you, timing can change how useful it is'
			]
		}
	},
	{
		axis: 'expression-restraint',
		a: {
			pole: 'expression',
			independent: [
				'you can become visibly enthusiastic when an idea catches you',
				'you sometimes use tone and gesture to carry what words alone would flatten',
				'you enjoy giving a strong reaction room to be seen',
				'you can make an ordinary account lively when you care about it',
				'you often communicate energy before you have arranged every detail',
				'you may laugh or exclaim before deciding how composed to appear',
				'you appreciate people who let interest show',
				'you can make your response unmistakable in the right company'
			],
			contrast: [
				'you can also let enthusiasm become plainly visible',
				'you sometimes prefer a lively response to a carefully neutral one',
				'you may express more through tone than through explanation',
				'you can fill a familiar room with your reaction'
			],
			subordinate: [
				'although you can be measured, excitement sometimes outruns the filter',
				'although composure has uses, you enjoy an unguarded reaction',
				'while you do not perform every feeling, some are easy to see',
				'while words may be careful, your energy can still reveal interest'
			]
		},
		b: {
			pole: 'restraint',
			independent: [
				'you can feel something strongly without displaying its full force',
				'you often choose a measured response when the atmosphere is already charged',
				'you may wait for a private moment before showing disappointment',
				'you can keep excitement contained until the setting feels right',
				'you sometimes protect a new idea by speaking about it quietly',
				'you tend to edit an immediate reaction before giving it an audience',
				'you can remain outwardly calm while deciding what matters',
				'you appreciate the freedom not to make every feeling public'
			],
			contrast: [
				'you still keep some reactions deliberately contained',
				'you can choose composure even when the feeling is vivid',
				'you sometimes let a pause speak before offering your response',
				'you may reserve the strongest version of a reaction for yourself'
			],
			subordinate: [
				'although you feel deeply enough, you do not display everything',
				'although expression can connect people, restraint can protect the moment',
				'while enthusiasm may be present, you sometimes keep it quiet',
				'while you can be animated, you can also become carefully composed'
			]
		}
	},
	{
		axis: 'curiosity-focus',
		a: {
			pole: 'curiosity',
			independent: [
				'you often notice a side question while pursuing the main one',
				'you can become absorbed in understanding how an unfamiliar thing works',
				'you sometimes follow a connection simply because it is surprising',
				'you enjoy discovering that a simple question has several layers',
				'you tend to keep one or two unanswered questions nearby',
				'you can lose track of time while comparing explanations',
				'you often look beyond the first account when a detail does not fit',
				'you appreciate conversations that open a door you did not expect'
			],
			contrast: [
				'you can also follow a promising question beyond the original task',
				'you sometimes let an interesting detail redirect your attention',
				'you may explore a connection before knowing whether it will be useful',
				'you can enjoy inquiry without demanding an immediate result'
			],
			subordinate: [
				'although focus matters, a good side question can pull you away',
				'although not every curiosity is useful, some become unexpectedly valuable',
				'while you can stay on task, unanswered details continue to tug',
				'while you value conclusions, you also enjoy the route toward them'
			]
		},
		b: {
			pole: 'focus',
			independent: [
				'you can set interesting side questions aside when the main task needs depth',
				'you often work best when attention has one clear centre',
				'you appreciate a boundary that keeps a promising project from scattering',
				'you tend to return to the central question after a useful detour',
				'you can ignore novelty when it competes with a chosen priority',
				'you sometimes narrow the field simply to finish something well',
				'you value concentration that produces a complete piece of work',
				'you can keep a long thread intact through minor interruptions'
			],
			contrast: [
				'you still know when a question deserves sustained attention',
				'you can close the extra tabs when depth matters more than range',
				'you often return wandering attention to one chosen point',
				'you may protect a task from possibilities that arrive too early'
			],
			subordinate: [
				'although many things interest you, one of them can take precedence',
				'although detours can teach you, you know when to return',
				'while curiosity expands the field, focus helps you cross it',
				'while alternatives remain visible, you can commit attention to one'
			]
		}
	},
	{
		axis: 'idealism-practicality',
		a: {
			pole: 'idealism',
			independent: [
				'you sometimes compare what exists with what it could become',
				'you can be moved by an idea before its practical route is obvious',
				'you often notice when a convenient solution falls short of its stated purpose',
				'you value aims that reach beyond the easiest available result',
				'you can keep an ambitious standard in view while progress is incomplete',
				'you sometimes defend a possibility that others dismiss too quickly',
				'you tend to ask whether a compromise has surrendered the central point',
				'you appreciate work that tries to make its values visible'
			],
			contrast: [
				'you still keep a picture of the better outcome in view',
				'you can resist settling merely because an alternative is difficult',
				'you often ask what the solution ought to preserve',
				'you may hold the original purpose against an expedient shortcut'
			],
			subordinate: [
				'although practical limits are real, you do not let them define every aim',
				'although progress requires compromise, some principles remain central',
				'while the ideal may be distant, it can still guide the next step',
				'while you accept imperfect results, you notice what they leave undone'
			]
		},
		b: {
			pole: 'practicality',
			independent: [
				'you often ask what can actually be done with the time available',
				'you can value an imperfect solution that genuinely works',
				'you tend to break a large intention into a manageable next move',
				'you notice when an attractive idea lacks a usable path',
				'you sometimes trade elegance for a result people can apply',
				'you appreciate plans that name their constraints',
				'you can revise an ambition without abandoning its purpose',
				'you often measure a proposal by what it changes in practice'
			],
			contrast: [
				'you also want an idea to survive contact with ordinary constraints',
				'you can accept a partial improvement that is available now',
				'you sometimes choose the usable version over the perfect one',
				'you may narrow an aim so that it can become an action'
			],
			subordinate: [
				'although the ideal matters, you want a workable route toward it',
				'although compromise can disappoint, it can also create movement',
				'while a vision sets direction, practical steps carry it',
				'while you admire bold ideas, you notice whether they can be used'
			]
		}
	},
	{
		axis: 'independence-collaboration',
		a: {
			pole: 'independence',
			independent: [
				'you can make progress alone without needing constant confirmation',
				'you often prefer to shape an early draft before inviting opinions',
				'you value stretches of work in which your concentration sets the pace',
				'you can take responsibility for a task without distributing every decision',
				'you sometimes solve a problem faster after stepping away from the group',
				'you appreciate being trusted with a complete piece of work',
				'you tend to bring a formed contribution rather than only a reaction',
				'you can maintain direction when other people are temporarily unavailable'
			],
			contrast: [
				'you still need room to work through some parts alone',
				'you can carry a task independently once its purpose is clear',
				'you often prefer to arrive with your own considered contribution',
				'you may separate from the discussion to recover a clean line of thought'
			],
			subordinate: [
				'although teamwork can help, some progress requires uninterrupted autonomy',
				'although input has value, you like to test your own judgment too',
				'while shared work can be rich, you do not need company for every step',
				'while you participate readily, you also value clear individual ownership'
			]
		},
		b: {
			pole: 'collaboration',
			independent: [
				'you can improve an idea by letting another person challenge its weak point',
				'you often notice possibilities that appear only in conversation',
				'you appreciate work in which different strengths are genuinely combined',
				'you can change your approach when a collaborator supplies a better route',
				'you tend to contribute more freely when the exchange feels reciprocal',
				'you sometimes find momentum through a shared deadline',
				'you value collaborators who make disagreement informative',
				'you can enjoy building something that no one person would have made alone'
			],
			contrast: [
				'you also recognise when another perspective improves the work',
				'you can share control when the exchange adds real value',
				'you sometimes reach a better answer through constructive friction',
				'you may welcome a partner who sees the gap you missed'
			],
			subordinate: [
				'although you can work alone, collaboration can reveal blind spots',
				'although ownership matters, a shared result can exceed separate efforts',
				'while you protect concentration, good exchange can sharpen it',
				'while independence is useful, you do not mistake it for isolation'
			]
		}
	},
	{
		axis: 'ambition-contentment',
		a: {
			pole: 'ambition',
			independent: [
				'you can see a next level even after something has gone reasonably well',
				'you often set a private standard beyond what is formally required',
				'you sometimes turn satisfaction into a question about what comes next',
				'you tend to notice unused room in a project that already works',
				'you can be energised by a goal that asks you to stretch',
				'you appreciate progress that opens a more demanding possibility',
				'you may keep improving a piece after others would call it finished',
				'you often want effort to lead somewhere larger than maintenance'
			],
			contrast: [
				'you still feel the pull of what could be improved next',
				'you can turn a good result into a platform for another attempt',
				'you often keep a more demanding standard in reserve',
				'you may enjoy arrival briefly before noticing the next horizon'
			],
			subordinate: [
				'although you can appreciate progress, it often creates another aim',
				'although enough is sometimes enough, you do not always stop there',
				'while achievement satisfies you, possibility can quickly reappear',
				'while you value completion, you also see what remains expandable'
			]
		},
		b: {
			pole: 'contentment',
			independent: [
				'you can recognise when further improvement would add little',
				'you sometimes prefer enjoying a result to immediately enlarging the goal',
				'you value periods in which nothing needs to become more impressive',
				'you can let a completed task remain complete',
				'you appreciate ordinary satisfactions that do not announce themselves as achievements',
				'you tend to notice when striving has stopped serving the original purpose',
				'you can choose enough over an endless sequence of upgrades',
				'you sometimes protect a good arrangement from unnecessary ambition'
			],
			contrast: [
				'you also know the quiet value of leaving something as it is',
				'you can decide that a result has earned its rest',
				'you sometimes prefer satisfaction to another round of optimisation',
				'you may keep a modest pleasure free from larger goals'
			],
			subordinate: [
				'although improvement appeals, you can recognise a genuine enough',
				'although ambition creates movement, rest can preserve its meaning',
				'while another goal is available, you do not always have to take it',
				'while progress matters, enjoyment does not need to justify itself'
			]
		}
	},
	{
		axis: 'optimism-realism',
		a: {
			pole: 'optimism',
			independent: [
				'you can often imagine a useful outcome before the route is complete',
				'you tend to look for the part of a setback that remains workable',
				'you sometimes give a promising attempt more room than the evidence strictly demands',
				'you appreciate people who make possibility easier to see',
				'you can recover momentum by naming what has not been lost',
				'you often notice small signs that an effort is beginning to move',
				'you may choose hope as a practical way to continue',
				'you can hold an encouraging interpretation without calling it certain'
			],
			contrast: [
				'you still look for the opening that remains',
				'you can keep possibility alive while the outcome is unsettled',
				'you often find a workable next step inside a disappointing result',
				'you may lend a new attempt a little more hope than proof'
			],
			subordinate: [
				'although difficulties are visible, so are the remaining options',
				'although an outcome is uncertain, you can act as if improvement is possible',
				'while disappointment registers, it does not always close the future',
				'while you know hope is not evidence, it can still support effort'
			]
		},
		b: {
			pole: 'realism',
			independent: [
				'you prefer encouragement that does not conceal the difficult part',
				'you often ask what evidence would change an attractive forecast',
				'you can accept an unwelcome constraint once it is clearly established',
				'you tend to distinguish a possible outcome from a likely one',
				'you sometimes lower an expectation to protect the quality of a decision',
				'you appreciate plans that include what may go wrong',
				'you can remain hopeful without treating hope as a guarantee',
				'you often notice when enthusiasm has outrun the available facts'
			],
			contrast: [
				'you also want optimism to remain answerable to evidence',
				'you can name the obstacle without abandoning the aim',
				'you sometimes prefer a sober estimate to a comforting one',
				'you may reduce an expectation while preserving the effort'
			],
			subordinate: [
				'although hope matters, you do not want it to blur the facts',
				'although a positive outcome is possible, you still examine the odds',
				'while encouragement can help, accuracy has its own kindness',
				'while you look for openings, you also count the barriers'
			]
		}
	},
	{
		axis: 'persistence-rest',
		a: {
			pole: 'persistence',
			independent: [
				'you can return to a difficult task after the first enthusiasm has faded',
				'you often make progress through several ordinary attempts',
				'you tend to keep a promise to yourself longer than the mood that created it',
				'you can tolerate an imperfect middle when the aim still matters',
				'you sometimes find a second route after the obvious one fails',
				'you appreciate effort that continues without needing to look dramatic',
				'you can resume work after interruption rather than declaring the thread lost',
				'you often distinguish temporary frustration from a reason to stop'
			],
			contrast: [
				'you still know how to return after a discouraging pause',
				'you can continue once the first burst of motivation is gone',
				'you often give meaningful work another honest attempt',
				'you may change the method while keeping the purpose'
			],
			subordinate: [
				'although progress can be uneven, you can keep the thread alive',
				'although frustration interrupts you, it does not always end the effort',
				'while persistence is rarely glamorous, you know its quiet force',
				'while a route may fail, the larger aim can remain'
			]
		},
		b: {
			pole: 'rest',
			independent: [
				'you can recognise when continued effort is producing only noise',
				'you sometimes need distance before a stubborn problem becomes legible',
				'you value pauses that restore judgment rather than merely postpone work',
				'you can stop for the day without deciding that the whole effort has failed',
				'you tend to work better after giving attention a genuine break',
				'you sometimes protect tomorrow’s effort by ending today’s attempt',
				'you appreciate rest that does not have to be earned by exhaustion',
				'you can set a problem down and return with a less cramped view'
			],
			contrast: [
				'you also know when stepping away is the useful move',
				'you can pause without surrendering the larger aim',
				'you sometimes regain persistence by allowing real rest',
				'you may stop pushing when force has replaced thought'
			],
			subordinate: [
				'although you can persist, you know that effort has a texture',
				'although stopping can look like retreat, it may restore perspective',
				'while the goal remains, the present attempt can end',
				'while discipline matters, recovery can be part of it'
			]
		}
	},
	{
		axis: 'belonging-individuality',
		a: {
			pole: 'belonging',
			independent: [
				'you appreciate settings in which your presence is expected rather than merely allowed',
				'you can feel steadier when a group has made room for your contribution',
				'you often notice small signs that say whether you belong',
				'you value shared references that make explanation unnecessary',
				'you sometimes work harder for a group whose purpose feels real',
				'you can enjoy the ease of being known in a familiar circle',
				'you tend to remember invitations that felt genuinely inclusive',
				'you appreciate participating without having to prove your place each time'
			],
			contrast: [
				'you still value the ease of a place where you belong',
				'you can be drawn toward groups that make participation feel natural',
				'you often appreciate a shared language of experience',
				'you may care more about inclusion than you usually announce'
			],
			subordinate: [
				'although you keep your individuality, belonging can still matter deeply',
				'although groups can constrain, the right one can also support',
				'while you do not fit every circle, some forms of membership feel sustaining',
				'while independence has appeal, welcome has its own quiet force'
			]
		},
		b: {
			pole: 'individuality',
			independent: [
				'you do not want belonging to require erasing your differences',
				'you often keep a private angle even within a close consensus',
				'you can enjoy a group without adopting every one of its habits',
				'you value being recognised as a person rather than only as a member',
				'you sometimes step outside a shared pattern to see it more clearly',
				'you can remain loyal while questioning how things are usually done',
				'you tend to protect interests that are yours alone',
				'you appreciate relationships that leave room for separate tastes'
			],
			contrast: [
				'you also protect the parts of yourself that do not match the group',
				'you can belong without wanting to become interchangeable',
				'you sometimes keep a distinct view inside a shared project',
				'you may resist a group expectation that has lost its purpose'
			],
			subordinate: [
				'although belonging matters, sameness is not its price',
				'although you participate, you retain a perspective of your own',
				'while shared identity can comfort, individuality keeps it honest',
				'while you value connection, you do not want it to flatten difference'
			]
		}
	}
];

const COMMON_EXPERIENCE_CLAUSES = [
	// Attention and memory
	'you sometimes remember the detail you needed shortly after the moment for using it has passed',
	'you can overlook something familiar when your attention is fixed elsewhere',
	'you occasionally reread a line because your thoughts continued without the words',
	'you may remember the shape of an idea before remembering its exact wording',
	'you sometimes notice a background sound only after it stops',
	'you can lose a small object in a place that seemed too obvious to check',
	'you occasionally begin one task and remember another on the way',
	'you may recognise a face before you can place the setting',
	'you sometimes retain an awkward remark longer than several ordinary ones',
	'you can forget a minor intention when the context that created it disappears',
	// Decisions and revision
	'you sometimes feel relief after making a choice even before knowing its outcome',
	'you can see advantages in an option after deciding against it',
	'you occasionally postpone a small decision because none of the alternatives matters enough',
	'you may defend a choice in public and inspect it again in private',
	'you sometimes prefer a reversible decision when information is incomplete',
	'you can regret the timing of a choice without regretting the choice itself',
	'you occasionally change your mind after trying to explain the old position',
	'you may want certainty most when the situation provides the least',
	'you sometimes confuse familiarity with inevitability until another option appears',
	'you can be satisfied with a decision and still imagine a different route',
	// Conversation and interpretation
	'you sometimes think of the clearest reply after a conversation has ended',
	'you can read more than one meaning into a brief message',
	'you occasionally adjust a story after seeing which part interests the listener',
	'you may understand a pause differently depending on who makes it',
	'you sometimes notice your own tone only after hearing the response',
	'you can enjoy a conversation that wanders before reaching its point',
	'you occasionally let a minor misunderstanding pass because correcting it would be heavier',
	'you may use a familiar phrase differently from the person hearing it',
	'you sometimes hear criticism inside a question that was meant neutrally',
	'you can recognise warmth in an exchange that would look ordinary from outside',
	// Effort and motivation
	'you sometimes find beginning harder than continuing',
	'you can make useful progress without feeling especially motivated',
	'you occasionally avoid a brief task because it has acquired too much anticipation',
	'you may work with unusual speed once a deadline becomes concrete',
	'you sometimes spend more energy preparing to focus than the first step requires',
	'you can care about an outcome and still resist the work that leads to it',
	'you occasionally discover motivation only after making visible progress',
	'you may prefer a modest completed version to an ambitious permanent draft',
	'you sometimes continue from momentum after the original reason has faded',
	'you can mistake a need for a break for a loss of interest',
	// Routines and change
	'you sometimes rely on a routine without noticing how much it carries',
	'you can enjoy a change and still miss the predictability it replaced',
	'you occasionally keep an inefficient habit because it removes a decision',
	'you may welcome variety in one part of life and resist it in another',
	'you sometimes change a small arrangement to make a larger task feel newly possible',
	'you can return to an old method after testing a newer one',
	'you occasionally need repetition before an unfamiliar process feels simple',
	'you may become attached to a temporary arrangement that quietly worked',
	'you sometimes want novelty until it requires giving up a comfortable detail',
	'you can appreciate consistency more after a period of interruption',
	// Expectations and comparison
	'you sometimes judge an outcome against the picture you formed beforehand',
	'you can feel disappointed by a good result that arrived in an unexpected form',
	'you occasionally compare your private uncertainty with another person’s polished surface',
	'you may notice what is missing before noticing what improved',
	'you sometimes raise a standard after meeting the earlier one',
	'you can value praise and still question whether it describes the real work',
	'you occasionally measure progress by distance remaining rather than distance travelled',
	'you may find an ordinary result impressive after learning what it required',
	'you sometimes expect ease from something that looks easy when finished',
	'you can be surprised when a long-awaited event feels briefly ordinary',
	// Time and hindsight
	'you sometimes underestimate how long a familiar task will take',
	'you can remember a waiting period as shorter once its outcome is known',
	'you occasionally give tomorrow more available attention than tomorrow will actually have',
	'you may feel that a recent month moved both quickly and slowly',
	'you sometimes view an old decision more simply than it felt at the time',
	'you can recognise a turning point only after several later events',
	'you occasionally delay a pleasant plan because arranging it feels like work',
	'you may overestimate how clearly your present mood predicts next week',
	'you sometimes experience the same interval differently depending on what fills it',
	'you can make the past look orderly by forgetting the abandoned branches',
	// Preferences and context
	'you sometimes want different things from the same activity on different days',
	'you can prefer a lively setting for one purpose and a quiet one for another',
	'you occasionally discover that a strong preference was partly a matter of convenience',
	'you may enjoy choosing when the options are meaningful and tire when they are trivial',
	'you sometimes like an idea more before it becomes an obligation',
	'you can appreciate simplicity without wanting every experience simplified',
	'you occasionally value privacy more when it has been interrupted',
	'you may tolerate inconvenience when it gives you a sense of control',
	'you sometimes seek advice while already leaning toward an answer',
	'you can want both recognition and freedom from attention',
	// Learning and explanation
	'you sometimes understand a subject differently after trying to explain it',
	'you can follow an example before you can state the general rule',
	'you occasionally mistake recognition for complete understanding',
	'you may learn a method more firmly after seeing where it fails',
	'you sometimes ask a basic question only after the advanced discussion has begun',
	'you can notice a gap in your knowledge precisely because the rest has become clearer',
	'you occasionally remember an explanation through its image rather than its terms',
	'you may prefer instructions after an unsuccessful first attempt',
	'you sometimes need two descriptions of the same idea before one settles',
	'you can become more curious after discovering that an assumption was wrong',
	// Everyday emotional weather
	'you sometimes carry a minor irritation longer than its cause deserves',
	'you can be pleased by a small event that would sound unimportant in a summary',
	'you occasionally feel more capable after one uncomplicated success',
	'you may become less certain of a problem after a proper rest',
	'you sometimes anticipate an uncomfortable moment more intensely than you experience it',
	'you can feel gratitude and annoyance toward the same situation',
	'you occasionally need time before knowing what your first reaction meant',
	'you may find a familiar task soothing when the rest of the day feels scattered',
	'you sometimes want acknowledgment more than advice',
	'you can laugh at an inconvenience after its practical demand has ended'
] as const;

function axisFragments(): CorpusFragment[] {
	const fragments: CorpusFragment[] = [];
	for (const set of AXIS_CLAUSES) {
		for (const side of ['a', 'b'] as const) {
			const poleSet = set[side];
			for (const [index, text] of poleSet.independent.entries()) {
				fragments.push({
					id:
						'axis.' +
						set.axis +
						'.' +
						poleSet.pole +
						'.independent.' +
						String(index + 1).padStart(2, '0'),
					kind: 'clause',
					locale: 'en',
					role: 'independent',
					text,
					axis: set.axis,
					pole: poleSet.pole,
					semanticKey: set.axis + '.' + poleSet.pole + '.independent.' + (index + 1),
					techniques: ['broad-common-experience'],
					breadth: index < 4 ? 'broad' : 'moderate',
					claimBasis: { kind: 'unsupported-generic' },
					register: 'plain',
					reviewStatus: 'approved-v1'
				});
			}
			for (const [index, text] of poleSet.contrast.entries()) {
				fragments.push({
					id:
						'axis.' +
						set.axis +
						'.' +
						poleSet.pole +
						'.contrast.' +
						String(index + 1).padStart(2, '0'),
					kind: 'clause',
					locale: 'en',
					role: 'contrast-independent',
					text,
					axis: set.axis,
					pole: poleSet.pole,
					semanticKey: set.axis + '.' + poleSet.pole + '.contrast.' + (index + 1),
					techniques: ['rainbow-pair', 'exception-clause'],
					breadth: 'very-broad',
					claimBasis: { kind: 'unsupported-generic' },
					register: 'plain',
					reviewStatus: 'approved-v1'
				});
			}
			for (const [index, text] of poleSet.subordinate.entries()) {
				fragments.push({
					id:
						'axis.' +
						set.axis +
						'.' +
						poleSet.pole +
						'.subordinate.' +
						String(index + 1).padStart(2, '0'),
					kind: 'clause',
					locale: 'en',
					role: index % 2 === 0 ? 'although-subordinate' : 'while-subordinate',
					text,
					axis: set.axis,
					pole: poleSet.pole,
					semanticKey: set.axis + '.' + poleSet.pole + '.subordinate.' + (index + 1),
					techniques: ['rainbow-pair', 'exception-clause'],
					breadth: 'very-broad',
					claimBasis: { kind: 'unsupported-generic' },
					register: 'plain',
					reviewStatus: 'approved-v1'
				});
			}
		}
	}
	return fragments;
}

function commonExperienceFragments(): CorpusFragment[] {
	return COMMON_EXPERIENCE_CLAUSES.map((text, index) => {
		const techniques: readonly BarnumTechnique[] =
			index % 10 === 0
				? ['broad-common-experience', 'temporal-elasticity']
				: index % 7 === 0
					? ['broad-common-experience', 'modal-hedge']
					: ['broad-common-experience'];
		return {
			id: 'common.experience.' + String(index + 1).padStart(3, '0'),
			kind: 'clause',
			locale: 'en',
			role: 'independent',
			text,
			semanticKey: 'common.experience.' + (index + 1),
			techniques,
			breadth: index % 3 === 0 ? 'very-broad' : 'broad',
			claimBasis: { kind: 'unsupported-generic' },
			register: 'plain',
			reviewStatus: 'approved-v1'
		};
	});
}

const SPECIAL_CLAUSE_FAMILIES = [
	{
		id: 'guarded-vulnerability',
		technique: 'guarded-vulnerability',
		breadth: 'broad',
		texts: [
			'you can be more affected by a careless remark than you prefer to show',
			'you sometimes protect an uncertain idea until it has enough shape to face criticism',
			'you may appear composed while quietly wondering whether you missed the point',
			'you can take a dismissal personally even when you understand its practical reason',
			'you sometimes need longer than expected to let go of a minor embarrassment',
			'you may hide hesitation behind a brisk first response',
			'you can feel overlooked in a room without wanting to compete for attention',
			'you sometimes avoid asking for reassurance because needing it feels too revealing',
			'you may become cautious after an effort receives less response than you hoped',
			'you can notice rejection in an ambiguity that might have another explanation',
			'you sometimes keep disappointment private until it has lost its sharpest edge',
			'you may want encouragement while doubting praise that arrives too easily',
			'you can become self-conscious when an ordinary mistake receives unusual attention',
			'you sometimes withdraw from a discussion before your uncertainty becomes visible',
			'you may remember a moment of exclusion after the group has forgotten it',
			'you can want your effort recognised without wanting to ask for recognition',
			'you sometimes treat a delayed response as meaningful before more context arrives',
			'you may feel exposed when a new ability is judged before it has developed'
		]
	},
	{
		id: 'mild-flaw',
		technique: 'broad-common-experience',
		breadth: 'moderate',
		texts: [
			'you sometimes postpone a simple task until it becomes needlessly prominent',
			'you can spend too long improving a detail that few people will notice',
			'you occasionally agree to something before checking how it fits the rest of your time',
			'you may interrupt your own concentration to resolve a smaller irritation',
			'you sometimes defend an old plan for a little while after seeing its weakness',
			'you can become impatient with an explanation you think you already understand',
			'you occasionally avoid a useful conversation because choosing the right moment feels difficult',
			'you may keep too many options open and make the final choice heavier',
			'you sometimes let a temporary mood colour a judgment about the whole day',
			'you can mistake extra preparation for progress when beginning feels uncertain',
			'you occasionally repeat a point after it has already been understood',
			'you may focus on the awkward part of an otherwise successful exchange',
			'you sometimes take on a small obligation and resent the space it occupies',
			'you can be slower to revise your view when the correction arrives harshly',
			'you occasionally wait for ideal conditions that the task does not require',
			'you may answer the easiest part of a question before facing its centre',
			'you sometimes expect other people to notice a need you have not stated',
			'you can keep working from habit after attention has stopped being useful'
		]
	},
	{
		id: 'unused-potential',
		technique: 'unused-potential',
		breadth: 'very-broad',
		texts: [
			'you have interests that receive less time than their importance to you would suggest',
			'you can imagine a more developed version of a skill you use only occasionally',
			'you sometimes recognise abilities in yourself that the present setting does not call for',
			'you may have useful ideas that remain private because the right opening has not appeared',
			'you can see room to become more fluent in something you already partly understand',
			'you sometimes suspect that a different routine would reveal another side of your attention',
			'you may be capable of more patience in a setting that gives it a clearer purpose',
			'you can imagine contributing differently if the role allowed another kind of initiative',
			'you sometimes keep a promising interest at the edge of a crowded schedule',
			'you may have a stronger voice on a subject than your recent opportunities reveal',
			'you can sense that an unfinished project contains a version worth completing',
			'you sometimes notice a capacity only after someone asks for it unexpectedly',
			'you may be more adaptable than a stable routine gives you occasion to show',
			'you can picture using an ordinary strength in a less familiar context',
			'you sometimes leave a good question unexplored because more immediate tasks win',
			'you may have developed judgments that you rarely need to explain aloud',
			'you can see possibilities in your own work that are not visible in its current form',
			'you sometimes feel that an interest has been waiting for a more hospitable season'
		]
	},
	{
		id: 'flattering-ambiguity',
		technique: 'flattering-ambiguity',
		breadth: 'very-broad',
		texts: [
			'you can recognise more complexity in a situation than a quick summary captures',
			'you often notice a distinction that matters even when it is difficult to explain briefly',
			'you can be generous about an error without pretending that it had no consequence',
			'you sometimes combine a practical response with a wider view of what is at stake',
			'you can listen carefully while retaining a judgment of your own',
			'you often understand why two reasonable people might choose differently',
			'you can change your mind without treating the earlier view as foolish',
			'you sometimes find a quieter solution after the obvious choices have been exhausted',
			'you can take an idea seriously without accepting every claim made for it',
			'you often appreciate nuance while still wanting a usable conclusion',
			'you can remain courteous without becoming entirely predictable',
			'you sometimes see the strength in an argument you ultimately reject',
			'you can hold a demanding standard without applying it identically in every context',
			'you often notice when a simple rule needs a carefully chosen exception',
			'you can value another perspective without borrowing it wholesale',
			'you sometimes make room for uncertainty without letting it erase the decision',
			'you can be both observant and selective about what deserves a response',
			'you often prefer an honest complication to a convenient false certainty'
		]
	}
] as const satisfies readonly {
	id: string;
	technique: BarnumTechnique;
	breadth: BreadthBand;
	texts: readonly string[];
}[];

function specialFragments(): CorpusFragment[] {
	return SPECIAL_CLAUSE_FAMILIES.flatMap((family) =>
		family.texts.map(
			(text, index): CorpusFragment => ({
				id: 'special.' + family.id + '.' + String(index + 1).padStart(2, '0'),
				kind: 'clause',
				locale: 'en',
				role: 'independent',
				text,
				semanticKey: 'special.' + family.id + '.' + (index + 1),
				techniques: [family.technique],
				breadth: family.breadth,
				claimBasis: { kind: 'unsupported-generic' },
				register: index % 6 === 0 ? 'slightly-literary' : 'plain',
				reviewStatus: 'approved-v1'
			})
		)
	);
}

interface EchoPack {
	questionId: SelfReportQuestionId;
	optionId: string;
	texts: readonly [string, string, string, string];
}

const DIRECT_ECHO_PACKS: readonly EchoPack[] = [
	{
		questionId: 'planning_style',
		optionId: 'detailed-plan',
		texts: [
			'you prefer working from a detailed plan',
			'you like the intended steps to be set out in detail',
			'you tend to choose a detailed plan over a loose outline',
			'you are more comfortable when a plan includes the details'
		]
	},
	{
		questionId: 'planning_style',
		optionId: 'loose-plan',
		texts: [
			'you like having a direction while keeping room to change course',
			'you prefer a loose plan that leaves space to adjust',
			'you tend to work from an outline rather than a fixed script',
			'you want a plan, but not one that settles every step'
		]
	},
	{
		questionId: 'planning_style',
		optionId: 'improvise',
		texts: [
			'you prefer to improvise as the situation develops',
			'you would rather respond in the moment than follow a detailed plan',
			'you tend to work out the route while moving',
			'you usually favour improvisation over advance structure'
		]
	},
	{
		questionId: 'planning_style',
		optionId: 'depends',
		texts: [
			'your preferred amount of planning depends on the situation',
			'you choose between planning and improvising according to context',
			'you do not use the same planning style for every task',
			'you vary how tightly you plan'
		]
	},
	{
		questionId: 'decision_pace',
		optionId: 'usually-deliberate',
		texts: [
			'you usually make decisions deliberately',
			'you tend to take time over a decision',
			'you generally prefer a considered choice to a quick one',
			'your usual decision pace is deliberate'
		]
	},
	{
		questionId: 'decision_pace',
		optionId: 'usually-quick',
		texts: [
			'you usually make decisions quickly',
			'you tend to reach a choice without a long delay',
			'you generally prefer a prompt decision',
			'your usual decision pace is quick'
		]
	},
	{
		questionId: 'decision_pace',
		optionId: 'depends-on-stakes',
		texts: [
			'the pace of your decisions depends on the stakes',
			'you decide more or less quickly according to what is at stake',
			'you vary your decision pace with the importance of the choice',
			'how fast you decide changes when the stakes change'
		]
	},
	{
		questionId: 'novelty_preference',
		optionId: 'familiar-things',
		texts: [
			'you generally prefer familiar things',
			'you tend to choose what is familiar over what is new',
			'familiar options usually feel more comfortable to you',
			'you usually lean toward things you already know'
		]
	},
	{
		questionId: 'novelty_preference',
		optionId: 'new-things',
		texts: [
			'you generally prefer new things',
			'you tend to choose novelty over familiarity',
			'new options usually appeal to you more than familiar ones',
			'you usually lean toward trying something new'
		]
	},
	{
		questionId: 'novelty_preference',
		optionId: 'mixture',
		texts: [
			'you prefer a mixture of familiar and new things',
			'you like combining some novelty with some familiarity',
			'you do not consistently choose either the familiar or the new',
			'your preference includes both known and unfamiliar options'
		]
	},
	{
		questionId: 'social_recovery',
		optionId: 'time-alone',
		texts: [
			'time alone is usually what helps you recover your energy',
			'you generally restore your energy by being alone',
			'you tend to recover best with time to yourself',
			'being by yourself is your usual way to recharge'
		]
	},
	{
		questionId: 'social_recovery',
		optionId: 'one-to-one',
		texts: [
			'one-to-one company is usually what helps you recover your energy',
			'you generally restore your energy with one other person',
			'you tend to recover best in one-to-one company',
			'time with one person is your usual way to recharge'
		]
	},
	{
		questionId: 'social_recovery',
		optionId: 'small-group',
		texts: [
			'a small group is usually what helps you recover your energy',
			'you generally restore your energy in a small group',
			'you tend to recover best with a few people',
			'small-group company is your usual way to recharge'
		]
	},
	{
		questionId: 'social_recovery',
		optionId: 'varies',
		texts: [
			'what helps you recover your energy varies',
			'you do not rely on one social setting to recover',
			'your preferred way to recharge changes with the situation',
			'you vary between different ways of restoring your energy'
		]
	},
	{
		questionId: 'focus_style',
		optionId: 'one-at-a-time',
		texts: [
			'you prefer to focus on one thing at a time',
			'you generally choose a single thread of attention',
			'one task at a time is your preferred focus style',
			'you tend to concentrate on one thing before moving to another'
		]
	},
	{
		questionId: 'focus_style',
		optionId: 'several-threads',
		texts: [
			'you prefer to keep several threads going',
			'you generally divide attention across more than one thread',
			'working with several threads is your preferred focus style',
			'you tend to move among multiple things in progress'
		]
	},
	{
		questionId: 'focus_style',
		optionId: 'varies',
		texts: [
			'your preferred focus style varies',
			'you switch between one thread and several according to the task',
			'you do not always focus in the same way',
			'how you prefer to direct attention changes with context'
		]
	},
	{
		questionId: 'feedback_preference',
		optionId: 'direct',
		texts: [
			'you prefer feedback to be direct',
			'you generally want feedback stated plainly',
			'direct wording is your preferred form of feedback',
			'you tend to choose clear, unsoftened feedback'
		]
	},
	{
		questionId: 'feedback_preference',
		optionId: 'gentle',
		texts: [
			'you prefer feedback to be gentle',
			'you generally want feedback delivered softly',
			'gentle wording is your preferred form of feedback',
			'you tend to choose considerate, softened feedback'
		]
	},
	{
		questionId: 'feedback_preference',
		optionId: 'with-context',
		texts: [
			'you prefer feedback to come with context',
			'you generally want the reasons around feedback included',
			'context is part of the feedback format you prefer',
			'you tend to value feedback that explains its setting'
		]
	},
	{
		questionId: 'feedback_preference',
		optionId: 'depends',
		texts: [
			'the kind of feedback you prefer depends on the situation',
			'you vary your feedback preference with context',
			'you do not want every kind of feedback delivered in the same way',
			'your preferred feedback style changes according to the circumstances'
		]
	},
	{
		questionId: 'time_horizon',
		optionId: 'today',
		texts: [
			'today is the time horizon you find most useful right now',
			'you currently prefer to focus on today',
			'your useful planning horizon at the moment is this day',
			'you want the present day to frame what comes next'
		]
	},
	{
		questionId: 'time_horizon',
		optionId: 'this-week',
		texts: [
			'this week is the time horizon you find most useful right now',
			'you currently prefer to focus on the week ahead',
			'your useful planning horizon at the moment is this week',
			'you want the current week to frame what comes next'
		]
	},
	{
		questionId: 'time_horizon',
		optionId: 'this-month',
		texts: [
			'this month is the time horizon you find most useful right now',
			'you currently prefer to focus on the month ahead',
			'your useful planning horizon at the moment is this month',
			'you want the current month to frame what comes next'
		]
	},
	{
		questionId: 'time_horizon',
		optionId: 'longer',
		texts: [
			'a longer span is the time horizon you find most useful right now',
			'you currently prefer to focus beyond this month',
			'your useful planning horizon at the moment is relatively long',
			'you want a longer period to frame what comes next'
		]
	},
	{
		questionId: 'time_horizon',
		optionId: 'varies',
		texts: [
			'the time horizon you find most useful varies',
			'you shift between short and long horizons according to context',
			'you do not rely on one planning horizon all the time',
			'how far ahead you prefer to look changes with the situation'
		]
	},
	{
		questionId: 'pace',
		optionId: 'steady',
		texts: [
			'your usual pace is steady',
			'you generally prefer to work at a consistent pace',
			'steady progress is the pace you recognise most',
			'you tend to maintain an even rhythm'
		]
	},
	{
		questionId: 'pace',
		optionId: 'bursts',
		texts: [
			'your usual pace comes in bursts',
			'you generally work in periods of concentrated activity',
			'bursts of progress are the pace you recognise most',
			'you tend to alternate strong spurts with quieter intervals'
		]
	},
	{
		questionId: 'pace',
		optionId: 'varies',
		texts: [
			'your usual pace varies',
			'you change pace according to the situation',
			'you do not rely on one consistent working rhythm',
			'the pace you prefer shifts with context'
		]
	}
];

function directEchoFragments(): CorpusFragment[] {
	return DIRECT_ECHO_PACKS.flatMap((pack) =>
		pack.texts.map(
			(text, index): CorpusFragment => ({
				id:
					'echo.' +
					pack.questionId +
					'.' +
					pack.optionId +
					'.' +
					String(index + 1).padStart(2, '0'),
				kind: 'clause',
				locale: 'en',
				role: 'echo-independent',
				text,
				semanticKey: 'echo.' + pack.questionId + '.' + pack.optionId + '.' + (index + 1),
				techniques: ['direct-answer-echo'],
				breadth: 'moderate',
				claimBasis: {
					kind: 'direct-echo',
					questionId: pack.questionId,
					optionId: pack.optionId
				},
				register: 'plain',
				reviewStatus: 'approved-v1'
			})
		)
	);
}

const LEAD_TEXTS = [
	'In some situations',
	'At first',
	'Quite often',
	'From time to time',
	'When the setting feels right',
	'In familiar territory',
	'When a choice matters',
	'Under ordinary pressure',
	'On a quieter day',
	'When expectations are unclear',
	'After some thought',
	'Without always announcing it',
	'More than you may show',
	'In the right company',
	'When there is room to choose',
	'Once you understand the context',
	'When attention is stretched',
	'At particular moments',
	'In a new setting',
	'When a pattern has settled',
	'Before committing fully',
	'After the immediate reaction',
	'When the consequences feel real',
	'In matters you care about',
	'Even on an ordinary day',
	'When there is no simple rule',
	'As circumstances change',
	'When a task becomes absorbing',
	'In ways that are easy to miss',
	'Depending on what the moment asks'
] as const;

const BRIDGE_DEFINITIONS = [
	{ text: 'yet', relation: 'contrast' },
	{ text: 'but at other times', relation: 'contrast' },
	{ text: 'even so', relation: 'contrast' },
	{ text: 'while in another setting', relation: 'contrast' },
	{ text: 'although the balance can turn', relation: 'contrast' },
	{ text: 'and still', relation: 'contrast' },
	{ text: 'without preventing moments when', relation: 'contrast' },
	{ text: 'though this can coexist with times when', relation: 'contrast' },
	{ text: 'depending on the setting', relation: 'qualification' },
	{ text: 'especially when the stakes feel personal', relation: 'qualification' },
	{ text: 'provided the purpose remains clear', relation: 'qualification' },
	{ text: 'when the circumstances support it', relation: 'qualification' },
	{ text: 'at least in familiar situations', relation: 'qualification' },
	{ text: 'within limits that make sense to you', relation: 'qualification' },
	{ text: 'more readily on some days than others', relation: 'qualification' },
	{ text: 'particularly after you have had time to adjust', relation: 'qualification' },
	{ text: 'and', relation: 'addition' },
	{ text: 'as well as noticing that', relation: 'addition' },
	{ text: 'while also finding that', relation: 'addition' },
	{ text: 'alongside moments when', relation: 'addition' },
	{ text: 'with the additional sense that', relation: 'addition' },
	{ text: 'and you may also find that', relation: 'addition' },
	{ text: 'at the same time', relation: 'addition' },
	{ text: 'together with the fact that', relation: 'addition' }
] as const;

const TAIL_TEXTS = [
	'the balance can change with the setting',
	'the same choice can feel different when the stakes change',
	'context often decides which side becomes visible',
	'this is not equally strong on every occasion',
	'the pattern can be easier to see in hindsight',
	'what feels natural can shift once expectations are clear',
	'the exception may be as memorable as the rule',
	'timing can alter which response seems most fitting',
	'the practical details can change the balance',
	'familiarity can make one response more likely than another',
	'a trusted setting may bring out a different emphasis',
	'the first reaction is not always the lasting one',
	'pressure can narrow choices that otherwise feel open',
	'more than one response can be genuine in different moments',
	'the surrounding demands can make the contrast look sharper',
	'the difference may depend on how reversible the choice feels',
	'small changes in wording can move the apparent emphasis',
	'an outside observer may notice only one side',
	'the quieter part of the pattern can remain private',
	'which side appears first may be a matter of circumstance',
	'the room available to respond can alter the outcome',
	'the immediate mood can briefly favour one direction',
	'neither side needs to describe every instance',
	'the most recent example may be unusually easy to recall',
	'the pattern becomes broad when exceptions remain available',
	'an ordinary counterexample can coexist with the general impression',
	'the claim leaves several kinds of evidence able to count',
	'the wording offers more than one route to agreement',
	'the condition carries much of the apparent precision',
	'a private example can make the sentence feel narrower than it is',
	'the statement does not specify when the change should occur',
	'the boundary remains open enough for several interpretations',
	'the contrast covers responses that are both commonplace',
	'the qualifier protects the sentence from a simple miss',
	'the claim can absorb a wide range of ordinary exceptions',
	'the description does not identify a comparison group',
	'the sentence sounds personal without naming a distinctive event',
	'the wording can feel exact while the test remains loose',
	'the claim asks memory to supply its strongest example',
	'the condition can be moved to fit a convenient occasion',
	'the statement names no frequency that could be checked',
	'the apparent insight rests on a broadly available experience',
	'the sentence provides no independent evidence about you',
	'the wording does not distinguish a tendency from a passing state',
	'the profile can preserve both the tendency and its exception',
	'the claim remains compatible with many different histories',
	'the sentence allows private context to do much of the work',
	'the same surface fit could arise for very different reasons',
	'the wording offers recognition without much individualising value',
	'the claim remains an editorial possibility rather than a measurement'
] as const;

function supportFragments(): CorpusFragment[] {
	const leads: CorpusFragment[] = LEAD_TEXTS.map((text, index) => ({
		id: 'lead.' + String(index + 1).padStart(2, '0'),
		kind: 'lead',
		locale: 'en',
		text,
		techniques: index % 3 === 0 ? ['temporal-elasticity'] : ['modal-hedge'],
		register: index % 8 === 0 ? 'slightly-literary' : 'plain',
		reviewStatus: 'approved-v1'
	}));
	const bridges: CorpusFragment[] = BRIDGE_DEFINITIONS.map((definition, index) => ({
		id: 'bridge.' + definition.relation + '.' + String(index + 1).padStart(2, '0'),
		kind: 'bridge',
		locale: 'en',
		text: definition.text,
		relation: definition.relation,
		techniques:
			definition.relation === 'contrast'
				? ['rainbow-pair']
				: definition.relation === 'qualification'
					? ['exception-clause']
					: ['broad-common-experience'],
		register: 'plain',
		reviewStatus: 'approved-v1'
	}));
	const tails: CorpusFragment[] = TAIL_TEXTS.map((text, index) => ({
		id: 'tail.' + String(index + 1).padStart(2, '0'),
		kind: 'tail',
		locale: 'en',
		role: 'neutral-tail',
		text,
		semanticKey: 'tail.qualifier.' + (index + 1),
		techniques:
			index < 20 ? ['temporal-elasticity'] : index < 40 ? ['exception-clause'] : ['modal-hedge'],
		breadth: index < 30 ? 'very-broad' : 'broad',
		claimBasis: { kind: 'unsupported-generic' },
		register: index % 11 === 0 ? 'slightly-literary' : 'plain',
		reviewStatus: 'approved-v1'
	}));
	return [...leads, ...bridges, ...tails];
}

export const FRAGMENTS_EN: readonly CorpusFragment[] = Object.freeze(
	[
		...axisFragments(),
		...commonExperienceFragments(),
		...specialFragments(),
		...directEchoFragments(),
		...supportFragments()
	].sort((left, right) => left.id.localeCompare(right.id))
);

export const CORPUS_FRAGMENT_COUNT = FRAGMENTS_EN.length;
