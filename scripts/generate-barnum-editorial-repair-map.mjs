import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));
const outputPath = fileURLToPath(
	new URL('../src/lib/visualizations/barnum-lab/data/editorial-repair-map.v2.json', import.meta.url)
);
const reviewSetPath = fileURLToPath(
	new URL('../src/lib/visualizations/barnum-lab/data/editorial-review-set.v2.json', import.meta.url)
);
const vite = await createServer({
	root: repositoryRoot,
	appType: 'custom',
	logLevel: 'error',
	server: { middlewareMode: true, hmr: false }
});

const ordinaryChanges = {
	'company-solitude.easy-conversation': [
		'enjoy conversations that do not demand a performance',
		'enjoy conversations that let you relax and be yourself'
	],
	'company-solitude.hidden-warmth': [
		'have a warmer social side than new people first see',
		'show more warmth after you get to know someone'
	],
	'autonomy-approval.crowded-view': [
		'hold a clear private view even in a crowded room',
		'keep your own view when people around you disagree'
	],
	'deliberation-spontaneity.faster-judgment': [
		'have faster judgment than your careful side admits',
		'decide faster than you expect in familiar situations'
	],
	'deliberation-spontaneity.enough-information': [
		'make strong decisions once enough information is clear',
		'make confident decisions once you have enough information'
	],
	'stability-change.disrupted-flexibility': [
		'have more flexibility than a disrupted day suggests',
		'adapt better than you expect when plans suddenly change'
	],
	'reserve-openness.careless-reply': [
		'feel exposed when a personal remark gets little care',
		'feel exposed when a personal comment gets a cold response'
	],
	'reserve-openness.clear-opinion': [
		'keep opinions private because you want them to be clear',
		'hold back an opinion until you find clear words for it'
	],
	'structure-flexibility.extra-details': [
		'prepare extra details because surprises bother you',
		'make backup plans because unexpected changes bother you'
	],
	'confidence-doubt.embarrassment-recovery': [
		'recover from embarrassment sooner than people see',
		'recover well after an embarrassing moment'
	],
	'confidence-doubt.pressure-voice': [
		'have a steadier voice than you use under pressure',
		'speak more steadily than you expect under pressure'
	],
	'patience-urgency.hard-day-calm': [
		'have more calm than a hard day lets you find',
		'stay calmer than you expect on difficult days'
	],
	'patience-urgency.careful-result': [
		'slow down because you want to avoid a careless result',
		'slow down because you want to avoid a careless mistake'
	],
	'caution-experimentation.protect-effort': [
		'ask cautious questions because you want to protect the effort',
		'ask many questions because you want the work to go well'
	],
	'caution-experimentation.slow-test': [
		'test slowly because you care about what is at risk',
		'test a new idea carefully because mistakes are hard to undo'
	],
	'directness-diplomacy.clear-meaning': [
		'say what you mean once the words are clear',
		'choose clear words before speaking'
	],
	'directness-diplomacy.blunt-clarity': [
		'speak bluntly because confusion feels unfair',
		'speak too sharply when you want a clear answer'
	],
	'idealism-practicality.lasting-answer': [
		'criticize an easy answer because you want something that lasts',
		'question a simple answer because you want one that holds up'
	],
	'ambition-contentment.quality-by-example': [
		'raise the quality of shared work through example',
		'help improve shared work by doing your part well'
	],
	'persistence-rest.future-stamina': [
		'have stamina for a project you have not started',
		'keep going longer than you expect once a task matters to you'
	],
	'belonging-individuality.different-groups': [
		'move between groups without feeling the same in each',
		'show different sides of yourself across social groups'
	],
	'belonging-individuality.belong-without-copying': [
		'help people belong without asking them to copy you',
		'help new people feel welcome in a group'
	],
	'belonging-individuality.difference-risk': [
		'worry that showing a difference will risk acceptance',
		'worry that being different makes it harder to fit in'
	],
	'belonging-individuality.future-community': [
		'have communities where a different side of you would thrive',
		'feel at home in groups that welcome different viewpoints'
	],
	'expression-restraint.notice-feelings': [
		'notice feelings that other people miss in a conversation',
		"notice small shifts in a conversation's mood"
	],
	'directness-diplomacy.clearer-voice': [
		'have a clearer voice than you use in tense moments',
		'speak more clearly than you expect in tense moments'
	],
	'reserve-openness.bolder-voice': [
		'have a bolder voice than new people expect',
		'speak more openly after you get to know someone'
	],
	'structure-flexibility.improvising': [
		'have more talent for improvising than you realize',
		'improvise well when a plan changes'
	],
	'confidence-doubt.recover-confidence': [
		'recover your confidence faster than people notice',
		'regain confidence after making a mistake'
	],
	'persistence-rest.finish-hard-work': [
		'finish difficult work that other people leave halfway',
		'stay with difficult work until it is finished'
	],
	'belonging-individuality.future-home': [
		'picture a place where you would feel more at home',
		'feel more at home when a group shares your values'
	],
	'confidence-doubt.certain-voices': [
		'question yourself when important people sound certain',
		'question yourself when someone else sounds completely certain'
	],
	'confidence-doubt.recent-doubts': [
		'trust yourself more than your recent doubts suggest',
		'trust your judgment when you have enough information'
	],
	'expression-restraint.actions-say-more': [
		'use actions when words feel too small',
		'use actions when words do not say enough'
	],
	'expression-restraint.early-nerves': [
		'express yourself better than early nerves suggest',
		'speak more freely after getting comfortable with someone'
	],
	'curiosity-focus.deeper-focus': [
		'concentrate more deeply than daily interruptions allow',
		'focus more deeply when interruptions ease'
	],
	'idealism-practicality.human-and-practical': [
		'see human concerns and practical needs in a problem',
		'see both the human and practical sides of a problem'
	],
	'independence-collaboration.confused-roles': [
		'keep a group moving when roles become confused',
		'keep a group moving when the next steps are unclear'
	],
	'independence-collaboration.natural-lead': [
		'lead more naturally than formal titles suggest',
		'take the lead when a group needs direction'
	],
	'ambition-contentment.hard-task-done': [
		'feel satisfied when a hard task finally works',
		'feel satisfied after completing a difficult task'
	]
};

const rainbowChanges = {
	'deliberation-spontaneity.thought-and-instinct': [
		['think choices through', 'trust your first feeling in the moment'],
		['think choices through', 'trust an immediate impression']
	],
	'persistence-rest.effort-and-rest': [
		['push through a hard stretch', 'rest before your effort turns stale'],
		['push through a hard stretch', 'take a break before your focus fades']
	],
	'curiosity-focus.questions-and-focus': [
		['follow several questions', 'focus deeply once one takes hold'],
		['explore several ideas', 'focus deeply once one stands out']
	]
};

const echoChanges = {
	'echo.planning_style.depends': 'You choose how much to plan from the situation.',
	'echo.decision_pace.usually-quick': 'You usually decide quickly and handle details afterward.',
	'echo.decision_pace.depends-on-stakes': 'You decide more carefully when the stakes are high.',
	'echo.feedback_preference.gentle': 'You prefer feedback that is gentle and thoughtful.',
	'echo.feedback_preference.with-context':
		'You prefer feedback that explains the reasons behind it.',
	'echo.time_horizon.today': "You find today's next step most useful right now.",
	'echo.time_horizon.this-week': "You find this week's plan most useful right now.",
	'echo.time_horizon.this-month': "You find this month's direction most useful right now.",
	'echo.time_horizon.longer': 'You find a longer view most useful right now.'
};

const previousOrdinaryChanges = {
	'company-solitude.easy-conversation': ordinaryChanges['company-solitude.easy-conversation'],
	'company-solitude.hidden-warmth': ordinaryChanges['company-solitude.hidden-warmth'],
	'reserve-openness.careless-reply': [
		'feel exposed when someone treats a personal remark carelessly',
		'feel exposed when a personal comment gets a cold response'
	],
	'patience-urgency.careful-result': ordinaryChanges['patience-urgency.careful-result']
};

const previousEchoChanges = {
	'echo.decision_pace.depends-on-stakes': 'Your decision speed depends on the stakes.',
	'echo.time_horizon.today': "You find today's next step most useful right now.",
	'echo.time_horizon.this-week': "You find this week's plan most useful right now.",
	'echo.time_horizon.this-month': 'You find this month the most useful time horizon right now.',
	'echo.time_horizon.longer': 'You find a longer time horizon most useful right now.'
};

function pretty(value) {
	return JSON.stringify(value, null, '\t') + '\n';
}

try {
	const { SURFACE_SENTENCES_EN, FEEDBACK_SENTENCES_EN, SURFACE_SENTENCE_BANK_SHA256 } =
		await vite.ssrLoadModule(
			'/src/lib/visualizations/barnum-lab/data/surface-sentences.en.generated.ts'
		);
	const { DIRECT_ECHO_SENTENCES_EN } = await vite.ssrLoadModule(
		'/src/lib/visualizations/barnum-lab/data/direct-echoes.en.ts'
	);
	const { CORPUS_VERSION, ENGINE_VERSION } = await vite.ssrLoadModule(
		'/src/lib/visualizations/barnum-lab/core/version.ts'
	);
	const changes = [];
	const incrementalChanges = [];
	for (const line of [...SURFACE_SENTENCES_EN, ...FEEDBACK_SENTENCES_EN]) {
		const ordinary = ordinaryChanges[line.semanticFamilyId];
		const rainbow = rainbowChanges[line.semanticFamilyId];
		let oldText;
		if (ordinary) oldText = line.text.replace(ordinary[1], ordinary[0]);
		if (rainbow) {
			oldText = line.text
				.replace(rainbow[1][0], rainbow[0][0])
				.replace(rainbow[1][1], rainbow[0][1]);
		}
		if (!oldText) continue;
		if (oldText === line.text) throw new Error(`Could not reconstruct old text for ${line.id}.`);
		changes.push({
			id: line.id,
			channel: line.channel,
			semanticFamilyId: line.semanticFamilyId,
			oldText,
			newText: line.text
		});
		const incremental = previousOrdinaryChanges[line.semanticFamilyId];
		if (incremental) {
			const previousText = line.text.replace(incremental[1], incremental[0]);
			if (previousText === line.text) {
				throw new Error(`Could not reconstruct previous text for ${line.id}.`);
			}
			incrementalChanges.push({
				id: line.id,
				channel: line.channel,
				semanticFamilyId: line.semanticFamilyId,
				oldText: previousText,
				newText: line.text
			});
		}
	}
	for (const line of DIRECT_ECHO_SENTENCES_EN) {
		const oldText = echoChanges[line.id];
		if (!oldText) continue;
		changes.push({
			id: line.id,
			channel: line.channel,
			semanticFamilyId: line.semanticFamilyId,
			oldText,
			newText: line.text
		});
		const previousText = previousEchoChanges[line.id];
		if (previousText) {
			incrementalChanges.push({
				id: line.id,
				channel: line.channel,
				semanticFamilyId: line.semanticFamilyId,
				oldText: previousText,
				newText: line.text
			});
		}
	}
	changes.sort((left, right) => left.id.localeCompare(right.id));
	incrementalChanges.sort((left, right) => left.id.localeCompare(right.id));
	const reviewBytes = readFileSync(reviewSetPath, 'utf8').replace(/\r\n/g, '\n');
	const artifact = {
		schemaVersion: 'barnum-editorial-repair-map-v2',
		corpusVersion: CORPUS_VERSION,
		engineVersion: ENGINE_VERSION,
		fromReviewSetSha256: '7763bf28c39fddf280a97ef38c7f72f7dacccc5453de2dc6d7ae9e16637b6455',
		toReviewSetSha256: createHash('sha256').update(reviewBytes, 'utf8').digest('hex'),
		toSurfaceSentenceBankSha256: SURFACE_SENTENCE_BANK_SHA256,
		changedSemanticFamilyCount:
			Object.keys(ordinaryChanges).length + Object.keys(rainbowChanges).length,
		changedCompleteLineCount: changes.length,
		changes,
		incrementalFromReviewSetSha256:
			'6aba956ee5345b00f1fc7dede7752ef2b7943634333c5b039936231097553f32',
		incrementalChangedCompleteLineCount: incrementalChanges.length,
		incrementalChanges
	};
	const bytes = pretty(artifact);
	if (process.argv.includes('--check')) {
		if (
			!existsSync(outputPath) ||
			readFileSync(outputPath, 'utf8').replace(/\r\n/g, '\n') !== bytes
		) {
			throw new Error('The Barnum editorial repair map is stale.');
		}
		console.log(`Barnum editorial repair map is current (${changes.length} complete lines).`);
	} else {
		writeFileSync(outputPath, bytes, 'utf8');
		console.log(`Wrote ${changes.length} exact old-to-new Barnum line mappings to ${outputPath}.`);
	}
} finally {
	await vite.close();
}
