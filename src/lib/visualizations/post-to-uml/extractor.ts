import type { SharedUmlEntity, SharedUmlModel, UmlParagraphSpan } from './types';

export const MAX_INPUT_CODE_POINTS = 120_000;
const MAX_CONCEPTS = 40;
const STOPWORDS = new Set(
	'The This That These Those Their There Where When While Which What Who Why How From Into With Without Between During Before After Then Once Here Each More Most Other Some Only Same Than Very Can Will Should Also However Therefore Instead Although Because Since Unless Until Whether Every Many First Second Third Finally Next Last For And But Yet In On At To By Of As If It Its We Our You Your They Them He She His Her One Two Three Ignore Previous Instructions System Prompt Within Otherwise Rather'
		.toLowerCase()
		.split(' ')
);

function plain(text: string): string {
	return text
		.replace(/`([^`]+)`/g, '$1')
		.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
		.replace(/[*_~>#]/g, '')
		.replace(/\s+/g, ' ')
		.trim();
}

function identifier(text: string): string {
	return text.replace(/[^A-Za-z0-9_]/g, '') || 'Concept';
}

function escaped(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasUnresolvedQualification(text: string): boolean {
	return /\b(?:not|never|cannot|could|might|may|hypothetical|suppose|assume|if|unless)\b|n['’]t\b/i.test(
		text
	);
}

/** Evidence is an exact substring, not a shortened/rewritten quotation. */
function evidence(p: UmlParagraphSpan) {
	return { paragraphIndex: p.index, quote: p.text };
}

/** Offsets refer to the original input, including CRLF and Unicode code units. */
export function segmentParagraphs(rawText: string): {
	inferredTitle: string;
	paragraphs: UmlParagraphSpan[];
} {
	const paragraphs: UmlParagraphSpan[] = [];
	let heading = 'Overview';
	let title = '';
	let start: number | undefined;
	let fence: string | undefined;
	const flush = (end: number) => {
		if (start === undefined) return;
		const raw = rawText.slice(start, end);
		const text = raw.trim();
		if (text) {
			const offset = start + raw.indexOf(text);
			paragraphs.push({
				id: `p-${paragraphs.length + 1}`,
				index: paragraphs.length + 1,
				heading,
				text,
				start: offset,
				end: offset + text.length
			});
		}
		start = undefined;
	};
	for (const match of rawText.matchAll(/[^\r\n]+(?:\r\n|\n|\r|$)|(?:\r\n|\n|\r)/g)) {
		const line = match[0].replace(/[\r\n]+$/, '');
		const trimmed = line.trim();
		const offset = match.index ?? 0;
		const fenceMatch = trimmed.match(/^(`{3,}|~{3,})/);
		if (fenceMatch) {
			if (!fence) {
				flush(offset);
				start = offset;
				fence = fenceMatch[1][0];
			} else if (fenceMatch[1][0] === fence) {
				flush(offset + match[0].length);
				fence = undefined;
			}
			continue;
		}
		if (fence) continue;
		const headingMatch = trimmed.match(/^#{1,6}\s+(.+)$/);
		if (headingMatch) {
			flush(offset);
			heading = plain(headingMatch[1]);
			if (!title) title = heading;
		} else if (!trimmed) flush(offset);
		else if (start === undefined) start = offset;
	}
	flush(rawText.length);
	return {
		inferredTitle:
			title ||
			plain(paragraphs[0]?.text ?? '')
				.split(/[.!?]/)[0]
				.slice(0, 100) ||
			'Article UML Model',
		paragraphs
	};
}

/**
 * Conservative, offline heuristics. These recognize explicit surface patterns;
 * they do not claim semantic understanding or fill gaps with a canned topology.
 * AI generation can interpret broader prose through the separate provider path.
 */
export function extractSharedUmlModel(
	rawText: string,
	options?: { title?: string; allowAssumptions?: boolean }
): SharedUmlModel {
	if (Array.from(rawText ?? '').length > MAX_INPUT_CODE_POINTS) {
		throw new Error(
			`Article exceeds the ${MAX_INPUT_CODE_POINTS.toLocaleString()} character limit. Shorten it explicitly; no text was truncated.`
		);
	}
	const { inferredTitle, paragraphs } = segmentParagraphs(rawText ?? '');
	// Preserve code blocks as numbered source material for provider evidence, but
	// do not pretend the local prose-pattern extractor interprets source code.
	const proseParagraphs = paragraphs.filter((p) => !/^(?:`{3,}|~{3,})/.test(p.text));
	const title = plain(options?.title?.trim() || inferredTitle).slice(0, 180);
	const headings = [...new Set(paragraphs.map((p) => p.heading || 'Overview'))];
	const model: SharedUmlModel = {
		title,
		domainKind: 'conceptual',
		isConceptualModel: true,
		conceptualRationale:
			'Local heuristic interpretation of explicitly named concepts and statements; this does not establish an implemented software architecture.',
		totalCharacters: Array.from(rawText ?? '').length,
		totalWords: rawText.trim() ? rawText.trim().split(/\s+/).length : 0,
		sectionedAnalysis: false,
		sectionCount: headings.length,
		paragraphs,
		terminology: [],
		entities: [],
		relationships: [],
		instances: [],
		instanceLinks: [],
		packages: [],
		components: [],
		compositeStructure: null,
		deploymentNodes: [],
		profileStereotypes: [],
		systemBoundaryName: title,
		actors: [],
		useCases: [],
		activities: [],
		states: [],
		transitions: [],
		messages: [],
		interactionNodes: [],
		timingTracks: [],
		hasExplicitInstances: false,
		hasExplicitDeployment: false,
		hasExplicitTiming: false,
		hasExplicitCompositeParts: false,
		hasExplicitStates: false,
		hasExplicitInteractions: false
	};
	const explicitMessageOrder: boolean[] = [];
	const register = (name: string, p: UmlParagraphSpan): SharedUmlEntity | undefined => {
		name = name.replace(/^(?:the|a|an)\s+/i, '').trim();
		if (
			name.length < 2 ||
			name.length > 70 ||
			/^[A-Z]+(?:-[A-Z]+)*-\d/.test(name) ||
			STOPWORDS.has(name.toLowerCase()) ||
			!/^[\p{L}\p{N}][\p{L}\p{N} _-]*$/u.test(name)
		)
			return undefined;
		const existing = model.entities.find((e) => e.name.toLowerCase() === name.toLowerCase());
		if (existing) return existing;
		if (model.entities.length >= MAX_CONCEPTS) return undefined;
		const baseId = identifier(name);
		const id = model.entities.some((e) => e.id === baseId)
			? `${baseId}_${model.entities.length + 1}`
			: baseId;
		const entity = {
			id,
			name,
			stereotype: 'concept',
			attributes: [],
			operations: [],
			packageGroup: p.heading || 'Overview',
			...evidence(p)
		};
		model.entities.push(entity);
		return entity;
	};

	for (const p of proseParagraphs) {
		const text = plain(p.text);
		for (const match of text.matchAll(
			/\b[A-Z][A-Za-z0-9_-]{2,}(?:\s+[A-Z][A-Za-z0-9_-]{2,}){0,2}\b/g
		)) {
			const words = match[0].split(' ').filter((word) => !STOPWORDS.has(word.toLowerCase()));
			if (words.length) register(words.join(' '), p);
		}
		// Explicit lowercase subjects are useful; do not promote arbitrary long words into entities.
		for (const match of text.matchAll(
			/\b(?:the|a|an)\s+([a-z][a-z0-9_-]+)\s+(?:contains|uses|queries|stores|requires|depends on)\s+(?:the|a|an)?\s*([a-z][a-z0-9_-]+)\b/gi
		)) {
			register(match[1], p);
			register(match[2], p);
		}
	}

	// Relationships require a direct, affirmative statement between the named endpoints.
	// "contains" alone does not justify UML lifecycle ownership or multiplicity.
	const verbs =
		'depends on|is a kind of|contains|uses|queries|stores|requires|validates|submits|produces|extends|links to|communicates with';
	for (const p of proseParagraphs) {
		for (const sentence of plain(p.text).split(/(?<=[.!?])\s+/)) {
			if (hasUnresolvedQualification(sentence)) continue;
			const present = model.entities.filter((entity) =>
				sentence.toLowerCase().includes(entity.name.toLowerCase())
			);
			for (const from of present)
				for (const to of present) {
					if (from.id === to.id) continue;
					const match = sentence.match(
						new RegExp(
							`\\b${escaped(from.name)}\\s+(${verbs})\\s+(?:the\\s+|a\\s+|an\\s+)?${escaped(to.name)}\\b`,
							'i'
						)
					);
					if (
						!match ||
						model.relationships.some(
							(r) => r.from === from.id && r.to === to.id && r.label === match[1].toLowerCase()
						)
					)
						continue;
					const label = match[1].toLowerCase();
					model.relationships.push({
						id: `rel-${model.relationships.length + 1}`,
						from: from.id,
						to: to.id,
						kind:
							label === 'depends on' || label === 'uses' || label === 'requires'
								? 'dependency'
								: label === 'is a kind of'
									? 'inheritance'
									: 'association',
						label,
						...evidence(p)
					});
				}
		}
	}

	for (const p of proseParagraphs) {
		const text = plain(p.text);
		// Explicit instance/classifier binding; numeric values alone are not instances.
		for (const match of text.matchAll(
			/\b([A-Za-z][A-Za-z0-9_-]*)\s+is an instance of\s+([A-Za-z][A-Za-z0-9_-]*)\b/g
		)) {
			if (hasUnresolvedQualification(text)) continue;
			const entity = register(match[2], p);
			if (!entity) continue;
			model.instances.push({
				id: `inst_${identifier(match[1])}`,
				instanceName: match[1],
				classifierName: entity.name,
				slots: [],
				...evidence(p)
			});
		}
		// Actual deployment assertions; mentions of clinics or databases alone do not establish hosting.
		for (const match of text.matchAll(
			/\b([A-Za-z][A-Za-z0-9_-]*)\s+(?:is\s+)?(?:deployed on|hosted in|hosted on|runs on)\s+(?:the\s+)?([A-Za-z][A-Za-z0-9_-]*)\b/g
		)) {
			if (hasUnresolvedQualification(text)) continue;
			const id = `node_${identifier(match[2])}`;
			const existing = model.deploymentNodes.find((n) => n.id === id);
			if (existing) existing.artifacts.push(match[1]);
			else
				model.deploymentNodes.push({
					id,
					name: match[2],
					nodeKind: 'node',
					artifacts: [match[1]],
					connections: [],
					...evidence(p)
				});
		}
		for (const match of text.matchAll(
			/\bstereotype\s+([A-Za-z][A-Za-z0-9_-]*)\s+extends\s+(?:the\s+)?(?:UML\s+)?(?:metaclass\s+)?(Class|Component|Action|State|Package|Node|Artifact|Operation)\b/g
		)) {
			if (hasUnresolvedQualification(text)) continue;
			model.profileStereotypes.push({
				id: `Stereo_${identifier(match[1])}`,
				stereotypeName: match[1],
				metaclass: match[2] as SharedUmlModel['profileStereotypes'][number]['metaclass'],
				taggedValues: [],
				...evidence(p)
			});
		}
		for (const match of text.matchAll(
			/\b([A-Za-z][A-Za-z0-9_-]*)\s+(?:transitions|moves|changes) from\s+([A-Za-z][A-Za-z0-9_-]*)\s+to\s+([A-Za-z][A-Za-z0-9_-]*)\b/g
		)) {
			if (hasUnresolvedQualification(text)) continue;
			for (const name of [match[2], match[3]]) {
				const id = `${identifier(match[1])}_${identifier(name)}`;
				if (!model.states.some((s) => s.id === id))
					model.states.push({ id, name: `${match[1]}: ${name}`, ...evidence(p) });
			}
			model.transitions.push({
				fromState: `${identifier(match[1])}_${identifier(match[2])}`,
				toState: `${identifier(match[1])}_${identifier(match[3])}`,
				trigger: '',
				...evidence(p)
			});
		}
		// Explicit actor capabilities, with no invented includes/extends relations.
		for (const match of text.matchAll(/\b([A-Z][A-Za-z0-9_-]*)\s+can\s+([a-z][^.!?]{3,100})/g)) {
			if (hasUnresolvedQualification(text)) continue;
			const actor = register(match[1], p);
			if (!actor) continue;
			if (!model.actors.some((a) => a.id === actor.id))
				model.actors.push({
					id: actor.id,
					name: actor.name,
					role: 'Explicit source role',
					...evidence(p)
				});
			model.useCases.push({
				id: `UC${model.useCases.length + 1}`,
				name: match[2].trim(),
				actorIds: [actor.id],
				includes: [],
				...evidence(p)
			});
		}
		// Only explicitly numbered or sequenced steps establish a local activity flow.
		for (const match of p.text.matchAll(
			/(?:^|\n|(?<=[.!?])\s+)(?:\d+[.)]\s+|(?:First|Then|Next|Finally)[,:]?\s+)([^\n.!?]{4,180})/g
		)) {
			const label = plain(match[1]);
			if (/\b(?:if|otherwise|unless|parallel|simultaneously|loop|repeat)\b/i.test(label)) continue;
			model.activities.push({
				id: `step-${model.activities.length + 1}`,
				label,
				kind: 'action',
				...evidence(p)
			});
		}
		// Message order is accepted only when explicit; a lone exchange needs no invented chronology.
		for (const match of text.matchAll(
			/\b([A-Z][A-Za-z0-9_-]*)\s+(?:(asynchronously|synchronously)\s+)?sends\s+([A-Za-z][A-Za-z0-9_ -]{0,50}?)\s+to\s+([A-Z][A-Za-z0-9_-]*)\b/g
		)) {
			if (hasUnresolvedQualification(text)) continue;
			const from = register(match[1], p);
			const to = register(match[4], p);
			if (from && to) {
				const prefix = text.slice(0, match.index).split(/[.!?]/).pop() || '';
				explicitMessageOrder.push(
					/\b(?:first|then|next|finally|afterwards|subsequently)\b/i.test(prefix)
				);
				model.messages.push({
					order: String(model.messages.length + 1),
					from: from.id,
					to: to.id,
					message: match[3],
					kind:
						match[2] === 'asynchronously'
							? 'async'
							: match[2] === 'synchronously'
								? 'sync'
								: 'unspecified',
					...evidence(p)
				});
			}
		}
		// Exact timed state observations. All ticks use seconds, preserving numeric scale.
		for (const match of text.matchAll(
			/\bAt\s+(\d+(?:\.\d+)?)\s*(milliseconds?|ms|seconds?|s|minutes?|hours?),?\s+([A-Za-z][A-Za-z0-9_-]*)\s+is\s+([A-Za-z][A-Za-z0-9_-]*)\b/g
		)) {
			if (hasUnresolvedQualification(text)) continue;
			const entity = register(match[3], p);
			if (!entity) continue;
			const unit = match[2].toLowerCase();
			const multiplier =
				unit.startsWith('millisecond') || unit === 'ms'
					? 0.001
					: unit.startsWith('minute')
						? 60
						: unit.startsWith('hour')
							? 3600
							: 1;
			const seconds = Number(match[1]) * multiplier;
			if (!Number.isFinite(seconds) || seconds > 1e12) continue;
			const tick = String(seconds);
			let track = model.timingTracks.find((t) => t.participant === entity.id);
			if (!track) {
				track = {
					participant: entity.id,
					kind: 'robust',
					states: [],
					events: [],
					constraints: [],
					...evidence(p)
				};
				model.timingTracks.push(track);
			}
			if (!track.states.includes(match[4])) track.states.push(match[4]);
			track.events.push({ tick, state: match[4] });
		}
	}

	for (const instance of model.instances) {
		for (const p of proseParagraphs) {
			const pattern = new RegExp(
				`\\b${escaped(instance.instanceName)}\\.([A-Za-z][A-Za-z0-9_]*)\\s*=\\s*("[^"\\n]+"|[A-Za-z0-9_-]+)`,
				'g'
			);
			for (const match of plain(p.text).matchAll(pattern))
				instance.slots.push({ key: match[1], value: match[2].replace(/^"|"$/g, '') });
		}
	}

	// Headings are an explicit editorial grouping, not a claimed software package dependency.
	for (const heading of headings.filter((h) => h !== 'Overview')) {
		const members = model.entities.filter((e) => e.packageGroup === heading);
		if (members.length)
			model.packages.push({
				id: `Package${model.packages.length + 1}`,
				name: heading,
				stereotype: 'article section',
				members: members.map((e) => e.name),
				dependsOn: [],
				paragraphIndex: members[0].paragraphIndex,
				quote: members[0].quote
			});
	}
	for (const entity of model.entities) {
		const p = paragraphs.find((item) => item.index === entity.paragraphIndex)!;
		if (
			new RegExp(
				`\\b(?:component|service|application|module)\\s+${escaped(entity.name)}\\b|\\b${escaped(entity.name)}\\s+(?:component|service|application|module)\\b`,
				'i'
			).test(plain(p.text))
		) {
			model.components.push({
				id: entity.id,
				name: entity.name,
				stereotype: 'component',
				providedInterfaces: [],
				requiredInterfaces: [],
				dependsOn: model.relationships
					.filter((r) => r.from === entity.id && r.kind === 'dependency')
					.map((r) => r.to),
				...evidence(p)
			});
		}
	}
	if (model.messages.length > 1 && explicitMessageOrder.slice(1).some((ordered) => !ordered))
		model.messages = [];
	model.timingTracks = model.timingTracks.filter(
		(track) =>
			track.events.length >= 2 && new Set(track.events.map((event) => event.tick)).size >= 2
	);
	for (const track of model.timingTracks)
		track.events.sort((a, b) => Number(a.tick) - Number(b.tick));
	model.hasExplicitInstances = model.instances.length > 0;
	model.hasExplicitDeployment = model.deploymentNodes.length > 0;
	model.hasExplicitTiming = model.timingTracks.length > 0;
	model.hasExplicitStates = model.transitions.length > 0;
	model.hasExplicitInteractions = model.messages.length > 0;

	if (options?.allowAssumptions && model.entities.length) {
		if (!model.hasExplicitInstances)
			model.instances = model.entities.slice(0, 3).map((entity, index) => ({
				id: `example_${entity.id}`,
				instanceName: `example${index + 1}`,
				classifierName: entity.name,
				slots: [{ key: 'state', value: 'Illustrative' }],
				paragraphIndex: entity.paragraphIndex,
				quote: entity.quote,
				isAssumption: true
			}));
		if (!model.hasExplicitTiming) {
			const entity = model.entities[0];
			model.timingTracks.push({
				participant: entity.id,
				kind: 'robust',
				states: ['Initial', 'InProgress', 'Completed'],
				events: [
					{ tick: '0', state: 'Initial' },
					{ tick: '10', state: 'InProgress' },
					{ tick: '20', state: 'Completed' }
				],
				constraints: [],
				paragraphIndex: entity.paragraphIndex,
				quote: entity.quote,
				isAssumption: true
			});
		}
	}
	model.terminology = model.entities.map((e) => e.name);
	return model;
}
