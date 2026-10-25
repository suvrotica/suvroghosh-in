import {
	MAX_CODE_POINTS,
	MAX_NODES,
	MAX_RELATIONS,
	type Evidence,
	type NodeKind,
	type OntologyNode,
	type OntologyRelation,
	type PromptOntology,
	type Provenance,
	type Attribute
} from './types';
import { validateOntology } from './validation';
import { prepareSemanticInput, SEMANTIC_EXCERPT_CODE_POINTS } from './compression';

/** A deterministic rules-based reader, deliberately not a general semantic model. */
export function analyzePrompt(text: string): PromptOntology {
	let budget = SEMANTIC_EXCERPT_CODE_POINTS;
	while (true) {
		const prepared = prepareSemanticInput(text, budget);
		const fragments = prepared.fragments;
		const compact = fragments ? fragments.map((fragment) => fragment.text).join('\n') : text;
		let result: PromptOntology;
		try {
			result = analyzeLocalText(compact);
		} catch (cause) {
			const message = cause instanceof Error ? cause.message : '';
			if (
				budget > 128 &&
				(/This prompt needs more than|too many unresolved details/.test(message) ||
					/Invalid Prompt Atlas session: Too big: expected array/.test(message))
			) {
				budget = Math.max(128, Math.floor(budget / 2));
				continue;
			}
			throw cause;
		}
		if (!fragments) return result;
		let position = 0;
		const mappings = fragments.map((fragment) => {
			const mapping = {
				...fragment,
				compactStart: position,
				compactEnd: position + fragment.text.length
			};
			position += fragment.text.length + 1;
			return mapping;
		});
		function remap(items: Evidence[]): Evidence[] {
			const mapped = items.flatMap((span) =>
				mappings.flatMap((fragment) => {
					const start = Math.max(span.start, fragment.compactStart);
					const end = Math.min(span.end, fragment.compactEnd);
					if (start >= end) return [];
					const originalStart = fragment.start + start - fragment.compactStart;
					const originalEnd = fragment.start + end - fragment.compactStart;
					return [
						{
							start: originalStart,
							end: originalEnd,
							quote: text.slice(originalStart, originalEnd)
						}
					];
				})
			);
			return mapped.length > 16 ? [...mapped.slice(0, 8), ...mapped.slice(-8)] : mapped;
		}
		result.source = { text, revision: `text-${hash(text)}` };
		result.compression = prepared.compression;
		for (const item of [
			...result.nodes,
			...result.relations,
			...result.issues,
			...result.nodes.flatMap((node) => node.attributes)
		])
			item.evidence = remap(item.evidence);
		for (const relation of result.relations) {
			const from = result.nodes.find((node) => node.id === relation.from)?.evidence[0];
			const to = result.nodes.find((node) => node.id === relation.to)?.evidence[0];
			if (
				from &&
				to &&
				mappings.find(
					(fragment) =>
						fragment.start <= from.start && from.start < fragment.start + fragment.text.length
				)?.id !==
					mappings.find(
						(fragment) =>
							fragment.start <= to.start && to.start < fragment.start + fragment.text.length
					)?.id
			) {
				relation.provenance = 'inferred';
				relation.rationale =
					'This connection crosses compressed excerpts. Intervening source text may change its meaning; confirm it.';
			}
		}
		result.issues.push({
			id: 'issue-compression-coverage',
			kind: 'limit',
			description: `Extractive compression inspected ${prepared.compression.analysedCodePoints.toLocaleString('en')} of ${prepared.compression.originalCodePoints.toLocaleString('en')} code points across ${fragments.length} exact excerpts. ${prepared.compression.omittedCodePoints.toLocaleString('en')} code points were omitted, including ${prepared.compression.duplicateCodePoints.toLocaleString('en')} detected repeats. This map has partial coverage; the complete original remains in the editor.`,
			evidence: []
		});
		return validateOntology(result);
	}
}

function analyzeLocalText(text: string): PromptOntology {
	if (Array.from(text).length > MAX_CODE_POINTS)
		throw new Error(
			`This prompt exceeds the ${MAX_CODE_POINTS.toLocaleString('en')} code-point analysis limit. The text has not been shortened.`
		);
	const result: PromptOntology = {
		schemaVersion: 1,
		source: { text, revision: `text-${hash(text)}` },
		mode: 'local',
		language: !text.trim()
			? 'unknown'
			: /[\u0400-\u04ff\u0900-\u09ff\u4e00-\u9fff]/u.test(text)
				? 'mixed'
				: 'en',
		nodes: [],
		relations: [],
		issues: []
	};
	const keys = new Map<string, OntologyNode>();
	const issueKeys = new Set<string>();
	const source = (start: number, end: number): Evidence[] => [
		{ start, end, quote: text.slice(start, end) }
	];
	const whole = text ? source(0, text.length) : [];

	function issue(
		kind: PromptOntology['issues'][number]['kind'],
		description: string,
		evidence: Evidence[],
		alternatives?: string[]
	) {
		if (issueKeys.has(description)) return;
		issueKeys.add(description);
		if (result.issues.length >= 200)
			throw new Error(
				'The prompt produced too many unresolved details. Please analyse a smaller section; nothing has been discarded.'
			);
		result.issues.push({
			id: `issue-${hash(description)}`,
			kind,
			description,
			evidence,
			...(alternatives ? { alternatives } : {})
		});
	}
	function node(
		label: string,
		kind: NodeKind,
		evidence: Evidence[],
		provenance: Provenance = 'explicit',
		rationale?: string
	): OntologyNode {
		const clean = label.replace(/^[\s,.:;]+|[\s,.;:]+$/g, '').trim() || label;
		const entityKind = ['actor', 'object', 'concept', 'table', 'system'].includes(kind);
		const key = `${entityKind ? 'entity' : kind}:${normalise(clean)}`;
		const previous = keys.get(key);
		if (previous) {
			for (const span of evidence)
				if (
					previous.evidence.length < 16 &&
					!previous.evidence.some((item) => item.start === span.start && item.end === span.end)
				)
					previous.evidence.push(span);
			if (
				kind === 'table' ||
				kind === 'system' ||
				(kind === 'actor' && previous.kind === 'concept')
			)
				previous.kind = kind;
			return previous;
		}
		if (result.nodes.length >= MAX_NODES)
			throw new Error(
				`This prompt needs more than ${MAX_NODES} nodes. Please analyse a smaller section; nothing has been discarded.`
			);
		const shortened = clean.length > 500;
		const item: OntologyNode = {
			id: `node-${hash(key)}`,
			label: shortened ? `${clean.slice(0, 499)}…` : clean,
			kind,
			layer: ['task', 'audience', 'output', 'constraint', 'example'].includes(kind)
				? 'instruction'
				: 'subject',
			provenance,
			evidence,
			attributes: [],
			...(shortened
				? {
						rationale:
							'Label shortened for display. The source evidence retains the complete clause.'
					}
				: rationale
					? { rationale }
					: {})
		};
		keys.set(key, item);
		result.nodes.push(item);
		return item;
	}
	function edge(
		from: OntologyNode,
		to: OntologyNode,
		label: string,
		kind: OntologyRelation['kind'],
		evidence: Evidence[],
		extra: Partial<OntologyRelation> = {}
	) {
		const key = `${from.id}-${kind}-${to.id}-${label}`;
		if (result.relations.some((item) => item.id === `edge-${hash(key)}`)) return;
		if (result.relations.length >= MAX_RELATIONS)
			throw new Error(
				`This prompt needs more than ${MAX_RELATIONS} relationships. Please analyse a smaller section; nothing has been discarded.`
			);
		result.relations.push({
			id: `edge-${hash(key)}`,
			from: from.id,
			to: to.id,
			label: label.slice(0, 2000),
			kind,
			provenance: 'explicit',
			evidence,
			...extra
		});
	}
	function entity(label: string, evidence: Evidence[], kind: NodeKind = 'object') {
		return node(
			label
				.replace(/^(?:the|a|an|each|every)\s+/i, '')
				.replace(/\s+(?:system)\s*$/i, kind === 'system' ? ' system' : ''),
			kind,
			evidence
		);
	}

	if (!text.trim()) return validateOntology(result);
	const database = /\b(PostgreSQL|Postgres|MySQL|SQLite|SQL Server|MariaDB|Oracle)\b/i.exec(text);
	if (database) result.databaseTarget = database[1];
	const clauses = Array.from(text.matchAll(/[^\S\r\n]*[^;\n]+?(?:[.!?;](?=\s|$)|\n|$)/g))
		.map((match) => {
			const leading = match[0].search(/\S/);
			const start = (match.index ?? 0) + Math.max(0, leading);
			const end = (match.index ?? 0) + match[0].trimEnd().length;
			return {
				value: text
					.slice(start, end)
					.replace(/[.;!?]$/, '')
					.trimEnd(),
				evidence: source(start, end),
				start,
				end
			};
		})
		.filter((clause) => clause.value);
	let lastAction: OntologyNode | undefined;
	let lastUnconditional: OntologyNode | undefined;
	let activeSystem: OntologyNode | undefined;
	const stepActions: OntologyNode[] = [];

	for (const clause of clauses) {
		const evidence = clause.evidence;
		const raw = clause.value;
		const value = raw
			.replace(/^\s*(?:\d+[.)]\s*|[-*]\s*)/, '')
			.replace(/^(?:then|next|afterwards|finally)\s*[,;:]?\s*/i, '')
			.replace(/^(?:PostgreSQL|Postgres|MySQL|SQLite|SQL Server|MariaDB|Oracle)\s*:\s*/i, '');
		let handled = false;
		const state =
			/^(.+?)\s*(?:→|->|\bbecomes\b|\btransitions to\b|\bchanges to\b)\s*(.+?)(?:\s+on\s+(.+))?$/i.exec(
				value
			);
		if (state && state[1].length < 100 && state[2].length < 100) {
			const before = node(state[1], 'state', evidence);
			const after = node(state[2], 'state', evidence);
			edge(before, after, state[3] || 'transition; trigger unspecified', 'transition', evidence);
			handled = true;
		}

		// Columns are interpreted only from explicit schema vocabulary and types.
		const fields = /^(.+?)\s+(?:has|have|contains|with)\s+(.+)$/i.exec(value);
		if (
			!handled &&
			fields &&
			/\b(?:uuid|text|varchar|integer|bigint|boolean|timestamp|primary key|foreign key|references)\b/i.test(
				fields[2]
			)
		) {
			const table = entity(fields[1], evidence, 'table');
			const parts = fields[2].split(/,\s*|\s+and\s+/i);
			for (const rawPart of parts) {
				const part = rawPart.replace(/^and\s+/i, '');
				const type =
					/\b(uuid|text|varchar(?:\(\d+\))?|char(?:\(\d+\))?|integer|int|bigint|smallint|boolean|bool|timestamp(?:tz)?|date|jsonb?|decimal(?:\([\d, ]+\))?|numeric(?:\([\d, ]+\))?|float|double)\b/i.exec(
						part
					);
				const reference = /\breferences\s+([\w]+(?:\.[\w]+|\([\w]+\))?)/i.exec(part);
				const name = part
					.replace(/\breferences\s+.+$/i, '')
					.replace(/\b(?:primary key|foreign key|not null|unique|nullable|column)\b/gi, '')
					.replace(type?.[0] ?? /$^/, '')
					.replace(/[:`"']/g, '')
					.trim();
				if (!name || !/^[\w][\w ]{0,99}$/.test(name)) {
					issue(
						'missing-detail',
						`Could not reliably identify a column in “${part.slice(0, 100)}”.`,
						evidence
					);
					continue;
				}
				const attr: Attribute = {
					name,
					provenance: 'explicit',
					evidence,
					...(type ? { dataType: type[0] } : {}),
					...(/primary key/i.test(part) ? { primaryKey: true } : {}),
					...(/\bunique\b/i.test(part) ? { unique: true } : {}),
					...(reference ? { foreignKey: reference[1].replace(/\((\w+)\)/, '.$1') } : {})
				};
				if (
					!table.attributes.some((existing) => existing.name.toLowerCase() === name.toLowerCase())
				)
					table.attributes.push(attr);
			}
			handled = true;
		}

		const inheritance =
			/^(?:class\s+)?([\w ]+?)\s+(?:extends|inherits from|is a subclass of)\s+(?:class\s+)?([\w ]+)$/i.exec(
				value
			);
		if (!handled && inheritance) {
			const child = entity(inheritance[1], evidence);
			const parent = entity(inheritance[2], evidence);
			edge(child, parent, 'inherits from', 'inheritance', evidence);
			handled = true;
		}

		const systemMatch = /\b(?:in|using|within)\s+(?:the\s+)?([\w -]{1,60}?\s+system)\b/i.exec(
			value
		);
		if (systemMatch) activeSystem = entity(systemMatch[1], evidence, 'system');
		const usecase =
			/^(?:(?:in|using|within)\s+(?:the\s+)?[\w -]+?\s+system,?\s*)?(?:a|an|the)?\s*([\w -]{1,60}?)\s+can\s+(.+?)(?:\s+(?:in|using|within)\s+(?:the\s+)?[\w -]+?\s+system)?$/i.exec(
				value
			);
		if (!handled && usecase && activeSystem && !/^(?:own|have|contain)\b/i.test(usecase[2])) {
			const actor = entity(usecase[1], evidence, 'actor');
			const action = node(usecase[2], 'action', evidence);
			edge(actor, action, 'can', 'association', evidence);
			edge(activeSystem, action, 'includes', 'contains', evidence);
			handled = true;
		}

		const message =
			/^(.+?)\s+(sends?|replies?|responds?|returns?|tells?|asks?|requests?)\s+(.+?)\s+to\s+(.+)$/i.exec(
				value
			);
		if (!handled && message && message[1].length < 80 && message[4].length < 80) {
			const sender = entity(message[1], evidence, 'actor');
			const receiver = entity(message[4], evidence, 'actor');
			const orderExplicit = /^(?:then|next|afterwards|finally|\d+[.)])\b/i.test(raw);
			edge(
				sender,
				receiver,
				`${message[2]} ${message[3]}`,
				'message',
				evidence,
				orderExplicit || result.relations.filter((rel) => rel.kind === 'message').length === 0
					? {}
					: {
							provenance: 'inferred',
							rationale: 'Message order follows the supplied sentence order and needs confirmation.'
						}
			);
			const action = node(value, 'action', evidence);
			if (lastAction && orderExplicit) edge(lastAction, action, 'then', 'dependency', evidence);
			lastAction = action;
			lastUnconditional = action;
			handled = true;
		}

		const ownership =
			/^(?:each\s+|every\s+)?(.+?)\s+(?:can\s+)?(owns?|has|have|contains?|belongs? to)\s+(.+)$/i.exec(
				value
			);
		if (!handled && ownership) {
			if (/^(?:no|zero)\b/i.test(ownership[3])) {
				node(value, 'concept', evidence);
				issue(
					'ambiguity',
					'A zero or negative ownership statement is preserved literally. Confirm its scope before building an entity relationship.',
					evidence
				);
				handled = true;
			}
		}
		if (!handled && ownership) {
			const left = entity(
				ownership[1],
				evidence,
				/\busers?|customers?|members?|owners?\b/i.test(ownership[1]) ? 'actor' : 'object'
			);
			const tail = ownership[3];
			const owner = /^(?:exactly\s+)?one\s+owner$/i.test(tail);
			const previousOwner = result.relations.find(
				(rel) => rel.kind === 'owns' && rel.to === left.id
			);
			if (owner && previousOwner) {
				previousOwner.cardinality = 'one owner per item; many owned items (minimum unspecified)';
				if (previousOwner.evidence.length < 16) previousOwner.evidence.push(...evidence);
			} else if (
				/^(?:a\s+)?(?:title|name|description|email|id|identifier|price|status|age|address)(?:\s|,|$)/i.test(
					tail
				) &&
				/\b(?:has|have)\b/i.test(ownership[2])
			) {
				for (const attributeName of tail.split(/,\s*|\s+and\s+/i)) {
					const name = attributeName.replace(/^(?:a|an|the)\s+/i, '').trim();
					if (name && name.length < 100 && !left.attributes.some((attr) => attr.name === name))
						left.attributes.push({ name, provenance: 'explicit', evidence });
				}
			} else {
				const quantity =
					/^(many|one|several|multiple|zero or more|one or more|exactly one|\d+)\s+/i.exec(tail);
				const right = entity(tail.replace(quantity?.[0] ?? /$^/, ''), evidence);
				edge(
					left,
					right,
					ownership[2].toLowerCase(),
					/^own/i.test(ownership[2])
						? 'owns'
						: /contain/i.test(ownership[2])
							? 'contains'
							: 'association',
					evidence,
					quantity
						? {
								cardinality: /many|several|multiple/i.test(quantity[1])
									? 'many (minimum unspecified)'
									: quantity[1]
							}
						: {}
				);
			}
			handled = true;
		}

		const instruction =
			/^(?:please\s+)?(write|create|build|design|draft|explain|summarise|summarize|analyse|analyze|compare|translate|generate|describe|list|plan|make)\b/i.exec(
				value
			);
		const constraint =
			/^(?:use|keep|avoid|include|exclude|do not|don't|never|always|end with|start with|ensure|limit|make it)\b/i.test(
				value
			) ||
			/\b(?:exactly|no more than|at most|at least|under|over)\s+\d+\s+(?:words?|characters?|sentences?|paragraphs?)\b/i.test(
				value
			);
		if (!handled && (instruction || constraint)) {
			const task = node(value, constraint ? 'constraint' : 'task', evidence);
			const output =
				/\b(story|report|essay|poem|table|JSON|CSV|list|summary|email|diagram|mind map|application|app|website|code|script)\b/i.exec(
					value
				);
			if (output && !constraint)
				edge(task, node(output[1], 'output', evidence), 'requests', 'contains', evidence);
			if (output && !constraint) {
				const beforeOutput = value.slice(0, output.index);
				for (const style of beforeOutput.matchAll(
					/\b(kind|warm|gentle|humorous|formal|concise|detailed|simple|friendly|academic|technical|surreal)\b/gi
				)) {
					if (
						/\b(?:not|never|without|no)\s*$/i.test(beforeOutput.slice(0, style.index)) ||
						/^\s+of\b/i.test(value.slice(style.index! + style[0].length))
					)
						continue;
					const start = text.indexOf(style[0], clause.start + style.index!);
					const styleEvidence = source(start, start + style[0].length);
					edge(
						task,
						node(style[0], 'constraint', styleEvidence),
						'style',
						'contains',
						styleEvidence
					);
				}
			}
			const audience = /\bfor\s+(.+?)(?=\s+(?:about|with|using|in a|that)\b|$)/i.exec(value);
			if (audience && !constraint)
				edge(task, node(audience[1], 'audience', evidence), 'for', 'association', evidence);
			const topic = /\babout\s+(.+?)(?=\s+for\b|$)/i.exec(value);
			if (topic)
				edge(
					task,
					node(topic[1].replace(/^(?:a|an|the)\s+/i, ''), 'concept', evidence),
					'about',
					'association',
					evidence
				);
			handled = true;
		}

		// Small, explicit subject–verb rules; unknown material remains a source-backed concept.
		const conditional = /^if\s+(.+?),\s*(.+)$/i.exec(value);
		const actionValue = conditional?.[2] ?? value;
		const actionMatch =
			/^(?:the\s+)?([\w -]{1,65}?)\s+(submits?|validates?|ships?|notifies?|approves?|rejects?|reviews?|publishes?|archives?|checks?|creates?|updates?|deletes?|reads?|writes?|opens?|closes?|waits?|manages?|invoices?|visits?|pays?|processes?|receives?|lends?|renews?)\b\s*(.*)$/i.exec(
				actionValue
			);
		if (!handled && actionMatch) {
			const actorLabel = actionMatch[1].replace(/^(?:a|an|the)\s+/i, '');
			const actor = entity(
				actorLabel,
				evidence,
				/service|system|server|warehouse|application|shop|bank/i.test(actorLabel)
					? 'system'
					: 'actor'
			);
			const action = node(actionValue, 'action', evidence);
			edge(actor, action, 'performs', 'association', evidence);
			if (actionMatch[3])
				edge(action, entity(actionMatch[3], evidence), actionMatch[2], 'association', evidence);
			if (conditional) {
				const condition = node(conditional[1], 'concept', evidence);
				edge(condition, action, `if ${conditional[1]}`, 'condition', evidence, {
					guard: conditional[1]
				});
				if (lastUnconditional)
					edge(lastUnconditional, action, `if ${conditional[1]}`, 'condition', evidence, {
						guard: conditional[1]
					});
				if (
					!/^(?:approved|declined|rejected|accepted|valid|invalid|successful|failed)\b/i.test(
						conditional[1]
					)
				)
					issue(
						'missing-detail',
						`The condition “${conditional[1].slice(0, 80)}” has no machine-checkable definition.`,
						evidence
					);
			} else {
				const ordered = /^(?:then|next|afterwards|finally)\b/i.test(raw) || /^\d+[.)]/.test(raw);
				if (lastAction && ordered) edge(lastAction, action, 'then', 'dependency', evidence);
				lastUnconditional = action;
			}
			lastAction = action;
			stepActions.push(action);
			handled = true;
			if (
				/moon|tuesday|dream|shadow|silence/i.test(actorLabel) &&
				/invoice|pay|manage/i.test(actionMatch[2])
			) {
				issue(
					'ambiguity',
					'This unusual relationship may be metaphorical. The local reader preserves its wording without treating it as a real system requirement.',
					evidence,
					['Keep the literal wording', 'Interpret as a metaphor']
				);
			}
		}

		if (!handled) {
			const quoted = /^(?:"[^"\n]+"|'[^'\n]+')$/.test(value);
			node(value, quoted ? 'example' : 'concept', evidence);
			issue(
				'unsupported',
				'Some text is preserved as a concept because the local rules do not establish a more specific structure.',
				evidence
			);
		}

		if (
			/\b(?:she|he|they|it|her|him|their)\b/i.test(value) &&
			/\b(?:Alice|Beth|[A-Z][a-z]+\s+(?:tells|asks))\b/.test(value)
		) {
			issue(
				'ambiguity',
				'A pronoun could refer to more than one entity. Confirm its referent before relying on a detailed model.',
				evidence,
				['First named entity', 'Second named entity', 'Someone else']
			);
		}
		if (/\b(?:not|never|without|except|unless|don't|do not|no(?! more than))\b/i.test(value)) {
			issue(
				'ambiguity',
				'Negation or an exception is present. Its exact wording is preserved; confirm its scope in the interpretation.',
				evidence
			);
		}
	}

	// A stated foreign key is also a domain relationship. Resolve it after the
	// entire prompt has been read, so forward references work in every view.
	for (const table of result.nodes.filter((item) => item.kind === 'table')) {
		for (const attribute of table.attributes) {
			if (!attribute.foreignKey) continue;
			const targetName = attribute.foreignKey.split('.')[0].replace(/["`]/g, '');
			const target = result.nodes.find(
				(candidate) =>
					candidate.kind === 'table' && normalise(candidate.label) === normalise(targetName)
			);
			if (!target) continue;
			edge(
				table,
				target,
				`${attribute.name} → ${attribute.foreignKey}`,
				'association',
				attribute.evidence,
				{ provenance: attribute.provenance }
			);
		}
	}

	const exact = Array.from(text.matchAll(/\bexactly\s+(\d{1,9})\s+words?\b/gi));
	const maximum = Array.from(
		text.matchAll(/\b(?:no more than|at most|under|less than)\s+(\d{1,9})\s+words?\b/gi)
	).filter((match) => !/\bno\s+$/i.test(text.slice(0, match.index)));
	const minimum = Array.from(
		text.matchAll(/\b(?:at least|no fewer than|more than|over)\s+(\d{1,9})\s+words?\b/gi)
	).filter((match) => !/\bno\s+$/i.test(text.slice(0, match.index)));
	for (const requested of exact)
		for (const limit of maximum) {
			const upper = Number(limit[1]) - (/^(?:under|less than)/i.test(limit[0]) ? 1 : 0);
			if (Number(requested[1]) > upper)
				issue('contradiction', `Exactly ${requested[1]} words conflicts with “${limit[0]}”.`, [
					...source(requested.index!, requested.index! + requested[0].length),
					...source(limit.index!, limit.index! + limit[0].length)
				]);
		}
	for (const lower of minimum)
		for (const upper of maximum) {
			const min = Number(lower[1]) + (/^(?:over|more than)/i.test(lower[0]) ? 1 : 0);
			const max = Number(upper[1]) - (/^(?:under|less than)/i.test(upper[0]) ? 1 : 0);
			if (min > max)
				issue('contradiction', `“${lower[0]}” conflicts with “${upper[0]}”.`, [
					...source(lower.index!, lower.index! + lower[0].length),
					...source(upper.index!, upper.index! + upper[0].length)
				]);
		}
	for (const requested of exact)
		for (const lower of minimum) {
			const min = Number(lower[1]) + (/^(?:over|more than)/i.test(lower[0]) ? 1 : 0);
			if (Number(requested[1]) < min)
				issue('contradiction', `Exactly ${requested[1]} words conflicts with “${lower[0]}”.`, [
					...source(requested.index!, requested.index! + requested[0].length),
					...source(lower.index!, lower.index! + lower[0].length)
				]);
		}
	const positive = clauses
		.map((clause) => ({
			clause,
			match: /^(?:always\s+)?(?:include|use|allow|enable|show)\s+(.+)$/i.exec(clause.value)
		}))
		.filter((item) => item.match);
	const negative = clauses
		.map((clause) => ({
			clause,
			match: /^(?:do not|don't|never)\s+(?:include|use|allow|enable|show)\s+(.+)$/i.exec(
				clause.value
			)
		}))
		.filter((item) => item.match);
	for (const yes of positive)
		for (const no of negative) {
			if (normalise(yes.match![1]) === normalise(no.match![1]))
				issue(
					'contradiction',
					`Opposing instructions refer to “${yes.match![1].slice(0, 120)}”. Check whether they have different scopes.`,
					[...yes.clause.evidence, ...no.clause.evidence]
				);
		}
	const differentExacts = new Set(exact.map((match) => match[1]));
	if (differentExacts.size > 1)
		issue(
			'contradiction',
			'The prompt specifies different exact word counts. Check whether they apply to different outputs.',
			whole
		);
	if (result.language === 'mixed')
		issue(
			'unsupported',
			'The local reader is designed for English. Other scripts are preserved, but their meaning may not be extracted.',
			whole
		);
	if (result.nodes.some((item) => item.kind === 'table') && !result.databaseTarget)
		issue(
			'missing-detail',
			'A physical database view requires a database target such as PostgreSQL or SQLite.',
			whole
		);
	if (
		result.nodes.some(
			(item) => item.kind === 'table' && item.attributes.some((attr) => !attr.dataType)
		)
	)
		issue(
			'missing-detail',
			'Some columns have no explicit data type. Those types remain unspecified.',
			whole
		);
	if (
		result.relations.some((item) => item.kind === 'condition') &&
		!/\b(?:else|otherwise|declined|rejected|failed)\b/i.test(text)
	)
		issue('missing-detail', 'The alternative outcome of a condition is not specified.', whole);
	if (
		stepActions.length > 1 &&
		!result.relations.some((item) => item.kind === 'dependency' || item.kind === 'condition')
	)
		issue(
			'missing-detail',
			'Several actions are named, but their execution order is not explicit. Sentence order alone is not treated as a dependency.',
			whole
		);
	if (
		/\b(?:class|entity)\s+[A-Za-z]/i.test(text) &&
		!result.nodes.some((item) => item.kind === 'object' || item.kind === 'table')
	)
		issue(
			'missing-detail',
			'Class structure needs entities, supported attributes, or explicit inheritance.',
			whole
		);
	return validateOntology(result);
}

function normalise(value: string) {
	return value
		.toLowerCase()
		.replace(/^(?:the|a|an|each|every)\s+/i, '')
		.replace(/\s+/g, ' ')
		.replace(/(?<!s)s$/, '')
		.trim();
}

/** Small stable content hash; this is an identifier, not a security primitive. */
function hash(value: string) {
	let result = 2166136261;
	for (let index = 0; index < value.length; index++)
		result = Math.imul(result ^ value.charCodeAt(index), 16777619);
	return (result >>> 0).toString(36);
}
