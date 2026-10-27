import type {
	SharedUmlActivityStep,
	SharedUmlActor,
	SharedUmlComponent,
	SharedUmlCompositeStructure,
	SharedUmlDeploymentNode,
	SharedUmlEntity,
	SharedUmlInstance,
	SharedUmlInstanceLink,
	SharedUmlInteractionNode,
	SharedUmlMessage,
	SharedUmlModel,
	SharedUmlPackage,
	SharedUmlProfileStereotype,
	SharedUmlRelationship,
	SharedUmlState,
	SharedUmlTimingTrack,
	SharedUmlTransition,
	SharedUmlUseCase,
	UmlDomainKind,
	UmlParagraphSpan
} from './types';

export const MAX_INPUT_CODE_POINTS = 120_000;
const SECTIONED_ANALYSIS_THRESHOLD = 5_500;

const STOPWORDS = new Set([
	'The',
	'This',
	'That',
	'These',
	'Those',
	'Their',
	'There',
	'Where',
	'When',
	'While',
	'Which',
	'What',
	'Who',
	'Whom',
	'Whose',
	'Why',
	'How',
	'From',
	'Into',
	'Onto',
	'Upon',
	'With',
	'Within',
	'Without',
	'Between',
	'Among',
	'Through',
	'During',
	'Before',
	'After',
	'Above',
	'Below',
	'Under',
	'Over',
	'Again',
	'Further',
	'Then',
	'Once',
	'Here',
	'Both',
	'Each',
	'Few',
	'More',
	'Most',
	'Other',
	'Some',
	'Such',
	'Only',
	'Own',
	'Same',
	'Than',
	'Too',
	'Very',
	'Can',
	'Will',
	'Just',
	'Should',
	'Now',
	'Also',
	'However',
	'Therefore',
	'Moreover',
	'Furthermore',
	'Instead',
	'Although',
	'Because',
	'Since',
	'Unless',
	'Until',
	'Whether',
	'Every',
	'Many',
	'Much',
	'Several',
	'First',
	'Second',
	'Third',
	'Finally',
	'Next',
	'Last',
	'For',
	'And',
	'Nor',
	'But',
	'Yet',
	'So',
	'In',
	'On',
	'At',
	'To',
	'By',
	'Of',
	'As',
	'If',
	'It',
	'Its',
	'We',
	'Our',
	'You',
	'Your',
	'They',
	'Them',
	'He',
	'She',
	'His',
	'Her',
	'One',
	'Two',
	'Three',
	'Four',
	'Five',
	'Ignore',
	'Previous',
	'Instructions',
	'System',
	'Prompt'
]);

function stripMarkdownFormatting(text: string): string {
	return text
		.replace(/```[\s\S]*?```/g, ' ')
		.replace(/`([^`]+)`/g, '$1')
		.replace(/!\[[^\]]*\]\([^)]*\)/g, '')
		.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
		.replace(/[*_~>#]+/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

function toIdentifier(label: string): string {
	const cleaned = label
		.replace(/[^A-Za-z0-9\s_-]/g, ' ')
		.trim()
		.split(/\s+/)
		.filter(Boolean)
		.slice(0, 4)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join('');
	return cleaned || 'Concept';
}

function excerptQuote(text: string, maxLen = 155): string {
	const clean = stripMarkdownFormatting(text);
	if (clean.length <= maxLen) return clean;
	return `${clean.slice(0, maxLen - 1).trim()}…`;
}

export function segmentParagraphs(rawText: string): {
	inferredTitle: string;
	paragraphs: UmlParagraphSpan[];
} {
	const normalized = (rawText ?? '').replace(/\r\n/g, '\n');
	const lines = normalized.split('\n');
	const paragraphs: UmlParagraphSpan[] = [];

	let currentHeading = 'Overview';
	let inferredTitle = '';
	let buffer: string[] = [];
	let bufferStart = 0;
	let cursor = 0;
	let inFence = false;

	const flushBuffer = (endOffset: number) => {
		const joined = buffer.join('\n').trim();
		buffer = [];
		if (!joined) return;
		const clean = stripMarkdownFormatting(joined);
		if (clean.length < 12) return;
		const index = paragraphs.length + 1;
		paragraphs.push({
			id: `p-${index}`,
			index,
			heading: currentHeading,
			text: clean,
			start: bufferStart,
			end: endOffset
		});
	};

	for (const line of lines) {
		const lineLen = line.length + 1;
		const trimmed = line.trim();

		if (trimmed.startsWith('```')) {
			inFence = !inFence;
			cursor += lineLen;
			continue;
		}
		if (inFence) {
			cursor += lineLen;
			continue;
		}

		const headingMatch = trimmed.match(/^(#{1,4})\s+(.+)$/);
		if (headingMatch) {
			flushBuffer(cursor);
			const headingText = stripMarkdownFormatting(headingMatch[2]);
			if (!inferredTitle && headingMatch[1].length <= 2) {
				inferredTitle = headingText;
			}
			currentHeading = headingText || currentHeading;
			cursor += lineLen;
			continue;
		}

		if (!trimmed) {
			flushBuffer(cursor);
			cursor += lineLen;
			continue;
		}

		if (buffer.length === 0) {
			bufferStart = cursor;
		}
		buffer.push(trimmed);
		cursor += lineLen;
	}
	flushBuffer(cursor);

	if (paragraphs.length === 0 && normalized.trim().length > 0) {
		const fallback = stripMarkdownFormatting(normalized);
		paragraphs.push({
			id: 'p-1',
			index: 1,
			heading: 'Input Text',
			text: fallback || normalized.trim(),
			start: 0,
			end: normalized.length
		});
	}

	if (!inferredTitle && paragraphs.length > 0) {
		const firstSentence = paragraphs[0].text.split(/(?<=[.!?])\s+/)[0] ?? paragraphs[0].text;
		inferredTitle = firstSentence.slice(0, 64).replace(/[.!?]+$/, '');
	}

	return {
		inferredTitle: inferredTitle || 'Article UML Model',
		paragraphs
	};
}

function detectDomainAndConceptualStatus(text: string): {
	domainKind: UmlDomainKind;
	isConceptualModel: boolean;
	conceptualRationale: string;
} {
	const lower = text.toLowerCase();
	const softwareSignals = (
		lower.match(
			/\b(api|class|interface|service|database|endpoint|microservice|schema|payload|fhir|http|mtls|gateway|queue|component|repository|server|token|json|sql)\b/g
		) ?? []
	).length;
	const scientificSignals = (
		lower.match(
			/\b(hypothesis|cell|molecule|species|experiment|quantum|neuron|protein|clinical|vaccine|dose|immunization|epidemiology|symptom|patient)\b/g
		) ?? []
	).length;
	const orgSignals = (
		lower.match(
			/\b(ministry|department|committee|policy|governance|payer|insurer|hospital|clinic|agency|board|regulation|audit|compliance)\b/g
		) ?? []
	).length;
	const processSignals = (
		lower.match(
			/\b(workflow|step|stage|phase|review|approval|prior authorization|submission|triage|handoff|escalation)\b/g
		) ?? []
	).length;

	if (softwareSignals >= 6 && softwareSignals > orgSignals) {
		return {
			domainKind: 'software',
			isConceptualModel: false,
			conceptualRationale:
				'The source text explicitly describes software services, protocols, or data structures.'
		};
	}
	if (scientificSignals >= 4 && scientificSignals >= orgSignals) {
		return {
			domainKind: 'scientific',
			isConceptualModel: true,
			conceptualRationale:
				'Conceptual UML model representing scientific or clinical domain concepts and mechanisms rather than software classes.'
		};
	}
	if (orgSignals >= 4) {
		return {
			domainKind: 'organizational',
			isConceptualModel: true,
			conceptualRationale:
				'Conceptual UML model representing organizational actors, institutions, policies, and handoffs.'
		};
	}
	if (processSignals >= 3) {
		return {
			domainKind: 'process',
			isConceptualModel: true,
			conceptualRationale:
				'Conceptual UML model capturing a domain workflow and its participating concepts.'
		};
	}
	return {
		domainKind: 'conceptual',
		isConceptualModel: true,
		conceptualRationale:
			'Conceptual UML model distilled from the prose entities, relationships, and events in the article.'
	};
}

export function extractSharedUmlModel(
	rawText: string,
	options?: { title?: string; allowAssumptions?: boolean }
): SharedUmlModel {
	const boundedText = (rawText ?? '').slice(0, MAX_INPUT_CODE_POINTS);
	const { inferredTitle, paragraphs } = segmentParagraphs(boundedText);
	const title = options?.title?.trim() || inferredTitle || 'Article UML Model';
	const allowAssumptions = Boolean(options?.allowAssumptions);

	const totalCharacters = boundedText.length;
	const totalWords = boundedText.trim() ? boundedText.trim().split(/\s+/).length : 0;
	const uniqueHeadings = [...new Set(paragraphs.map((p) => p.heading || 'Overview'))];
	const sectionedAnalysis =
		totalCharacters >= SECTIONED_ANALYSIS_THRESHOLD || uniqueHeadings.length > 2;

	const { domainKind, isConceptualModel, conceptualRationale } =
		detectDomainAndConceptualStatus(boundedText);

	// 1. Extract domain concepts / entities across all paragraphs with frequency + first appearance
	const conceptMap = new Map<
		string,
		{
			name: string;
			count: number;
			paragraphIndex: number;
			quote: string;
			heading: string;
			attributes: Set<string>;
			operations: Set<string>;
		}
	>();

	const registerConcept = (rawName: string, p: UmlParagraphSpan, attr?: string, op?: string) => {
		const cleaned = rawName
			.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, '')
			.replace(/\s+/g, ' ')
			.trim();
		if (cleaned.length < 3 || cleaned.length > 42) return;
		const words = cleaned.split(' ');
		if (words.length > 4) return;
		if (words.every((w) => STOPWORDS.has(w))) return;
		if (STOPWORDS.has(cleaned)) return;

		const key = cleaned.toLowerCase();
		const existing = conceptMap.get(key);
		if (existing) {
			existing.count += 1;
			if (attr && existing.attributes.size < 4) existing.attributes.add(attr);
			if (op && existing.operations.size < 4) existing.operations.add(op);
			return;
		}
		conceptMap.set(key, {
			name: cleaned,
			count: 1,
			paragraphIndex: p.index,
			quote: excerptQuote(p.text),
			heading: p.heading || 'Core Domain',
			attributes: new Set(attr ? [attr] : []),
			operations: new Set(op ? [op] : [])
		});
	};

	for (const p of paragraphs) {
		// Proper noun / Title Case multi-word phrases
		const properMatches = p.text.matchAll(
			/\b([A-Z][a-zA-Z0-9-]{2,}(?:\s+(?:of|for|in|and|&)?\s*[A-Z][a-zA-Z0-9-]{2,}){0,2})\b/g
		);
		for (const m of properMatches) {
			const candidate = m[1].trim();
			if (!STOPWORDS.has(candidate)) {
				registerConcept(candidate, p);
			}
		}

		// Technical / domain noun phrases around key verbs
		const svMatches = p.text.matchAll(
			/\b(?:the|a|an|each|every)\s+([a-z][a-z0-9-]{2,}(?:\s+[a-z][a-z0-9-]{2,}){0,2})\s+(validates|routes|stores|submits|verifies|generates|evaluates|approves|denies|queries|transforms|captures|monitors|publishes|enforces|triggers|receives|sends|links|contains|requires|provides)\s+([a-zA-Z0-9\s-]{3,32})/gi
		);
		for (const m of svMatches) {
			const subj = m[1]
				.split(/\s+/)
				.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
				.join(' ');
			const verb = m[2].toLowerCase();
			const objRaw = m[3].replace(/\b(the|a|an|its|their|to|from|in|on|with)\b/gi, '').trim();
			const obj = objRaw
				.split(/\s+/)
				.slice(0, 3)
				.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
				.join(' ');
			registerConcept(subj, p, undefined, `${verb}${toIdentifier(obj)}()`);
			if (obj.length >= 3) {
				registerConcept(obj, p, `status : String`);
			}
		}
	}

	// Ensure at least 4 meaningful concepts even for short lowercase prose
	if (conceptMap.size < 4) {
		for (const p of paragraphs) {
			const words = p.text
				.replace(/[^a-zA-Z0-9\s-]/g, ' ')
				.split(/\s+/)
				.filter((w) => w.length >= 5 && !STOPWORDS.has(w.charAt(0).toUpperCase() + w.slice(1)));
			for (const w of words.slice(0, 8)) {
				const titled = w.charAt(0).toUpperCase() + w.slice(1);
				registerConcept(titled, p);
				if (conceptMap.size >= 6) break;
			}
		}
	}

	const sortedConcepts = [...conceptMap.values()]
		.sort((a, b) => b.count - a.count || a.paragraphIndex - b.paragraphIndex)
		.slice(0, 8);

	const entities: SharedUmlEntity[] = sortedConcepts.map((c, idx) => {
		const id = toIdentifier(c.name) || `Entity${idx + 1}`;
		const stereotype = isConceptualModel
			? idx === 0
				? 'conceptual subject'
				: 'domain concept'
			: idx === 0
				? 'service'
				: 'entity';

		const defaultAttrs =
			c.attributes.size > 0
				? [...c.attributes]
				: [`+name : "${c.name}"`, `+context : "${c.heading.slice(0, 22)}"`];
		const defaultOps =
			c.operations.size > 0 ? [...c.operations] : [`+evaluate${id.slice(0, 14)}()`];

		return {
			id,
			name: c.name,
			stereotype,
			attributes: defaultAttrs,
			operations: defaultOps,
			packageGroup: c.heading || 'Core Domain',
			paragraphIndex: c.paragraphIndex,
			quote: c.quote
		};
	});

	if (entities.length === 0) {
		entities.push(
			{
				id: 'SubjectSystem',
				name: title.slice(0, 28),
				stereotype: isConceptualModel ? 'conceptual subject' : 'system',
				attributes: ['+title : String', '+scope : Domain'],
				operations: ['+processInput()'],
				packageGroup: 'Core Domain',
				paragraphIndex: 1,
				quote: excerptQuote(boundedText)
			},
			{
				id: 'DomainOutcome',
				name: 'Domain Outcome',
				stereotype: 'domain concept',
				attributes: ['+status : Verified'],
				operations: ['+recordResult()'],
				packageGroup: 'Core Domain',
				paragraphIndex: 1,
				quote: excerptQuote(boundedText)
			}
		);
	}

	// 2. Extract Relationships between entities
	const relationships: SharedUmlRelationship[] = [];
	for (let i = 0; i < entities.length - 1; i += 1) {
		const fromEnt = entities[i];
		const toEnt = entities[i + 1];
		// Find paragraph mentioning both if possible
		const sharedPara =
			paragraphs.find(
				(p) =>
					p.text.toLowerCase().includes(fromEnt.name.toLowerCase()) &&
					p.text.toLowerCase().includes(toEnt.name.toLowerCase())
			) ??
			paragraphs[Math.min(paragraphs.length - 1, fromEnt.paragraphIndex - 1)] ??
			paragraphs[0];

		let label = 'interacts with';
		let kind: SharedUmlRelationship['kind'] = 'association';
		const lowerPara = sharedPara?.text.toLowerCase() ?? '';
		if (/\b(contains|comprises|consists of|owns)\b/.test(lowerPara)) {
			kind = 'composition';
			label = 'comprises';
		} else if (/\b(aggregates|groups|includes|bundles)\b/.test(lowerPara)) {
			kind = 'aggregation';
			label = 'aggregates';
		} else if (/\b(extends|is a kind of|specializes)\b/.test(lowerPara)) {
			kind = 'inheritance';
			label = 'specializes';
		} else if (/\b(depends on|requires|queries|invokes|uses)\b/.test(lowerPara)) {
			kind = 'dependency';
			label = 'depends on';
		} else {
			const verbMatch = sharedPara?.text.match(
				/\b(routes|validates|verifies|submits|transforms|triggers|governs|evaluates|links|produces|audits)\b/i
			);
			if (verbMatch) {
				label = verbMatch[1].toLowerCase();
			}
		}

		relationships.push({
			id: `rel-${i + 1}`,
			from: fromEnt.id,
			to: toEnt.id,
			kind,
			label,
			fromMultiplicity: kind === 'composition' ? '1' : undefined,
			toMultiplicity: kind === 'composition' ? '1..*' : undefined,
			paragraphIndex: sharedPara?.index ?? 1,
			quote: sharedPara ? excerptQuote(sharedPara.text) : fromEnt.quote
		});
	}

	// 3. Detect concrete instances (Object diagram)
	const instances: SharedUmlInstance[] = [];
	const instanceLinks: SharedUmlInstanceLink[] = [];
	let hasExplicitInstances = false;

	for (const p of paragraphs) {
		const codeOrIdMatches = p.text.match(
			/\b([A-Z]{2,6}-\d{2,6}|\d+(?:\.\d+)?\s*(?:ms|s|seconds|minutes|hours|days|years|%|mg|doses|patients|requests|clinics)|"[^"]{3,28}")\b/g
		);
		if (codeOrIdMatches && codeOrIdMatches.length > 0 && instances.length < 4) {
			hasExplicitInstances = true;
			const targetEntity = entities[instances.length % entities.length];
			const instId = `inst_${targetEntity.id.toLowerCase().slice(0, 10)}_${instances.length + 1}`;
			instances.push({
				id: instId,
				instanceName: instId,
				classifierName: targetEntity.name,
				slots: codeOrIdMatches.slice(0, 3).map((val, vIdx) => ({
					key: vIdx === 0 ? 'observedValue' : `evidenceSlot${vIdx + 1}`,
					value: val.replace(/^"|"$/g, '')
				})),
				paragraphIndex: p.index,
				quote: excerptQuote(p.text)
			});
		}
	}

	if (!hasExplicitInstances && allowAssumptions) {
		entities.slice(0, 3).forEach((ent, idx) => {
			const instId = `sample_${ent.id.toLowerCase().slice(0, 10)}_${idx + 1}`;
			instances.push({
				id: instId,
				instanceName: instId,
				classifierName: ent.name,
				slots: [
					{ key: 'state', value: 'IllustrativeSample' },
					{ key: 'sourceParagraph', value: `Paragraph ${ent.paragraphIndex}` }
				],
				paragraphIndex: ent.paragraphIndex,
				quote: ent.quote,
				isAssumption: true
			});
		});
	}

	for (let i = 0; i < instances.length - 1; i += 1) {
		instanceLinks.push({
			fromInstance: instances[i].id,
			toInstance: instances[i + 1].id,
			label: relationships[i]?.label || 'linkedInScenario'
		});
	}

	// 4. Packages
	const packagesMap = new Map<string, SharedUmlPackage>();
	for (const ent of entities) {
		const groupName = ent.packageGroup || 'Core Domain';
		const pkgId = toIdentifier(groupName);
		const existing = packagesMap.get(pkgId);
		if (existing) {
			existing.members.push(ent.name);
		} else {
			packagesMap.set(pkgId, {
				id: pkgId,
				name: groupName,
				stereotype: isConceptualModel ? 'domain' : 'package',
				members: [ent.name],
				dependsOn: [],
				paragraphIndex: ent.paragraphIndex,
				quote: ent.quote
			});
		}
	}
	if (packagesMap.size < 2 && entities.length >= 2) {
		const half = Math.ceil(entities.length / 2);
		packagesMap.clear();
		packagesMap.set('PrimaryDomain', {
			id: 'PrimaryDomain',
			name: 'Primary Subject Domain',
			stereotype: isConceptualModel ? 'domain' : 'package',
			members: entities.slice(0, half).map((e) => e.name),
			dependsOn: ['CollaboratingDomain'],
			paragraphIndex: entities[0].paragraphIndex,
			quote: entities[0].quote
		});
		packagesMap.set('CollaboratingDomain', {
			id: 'CollaboratingDomain',
			name: 'Outcome & Governance Domain',
			stereotype: isConceptualModel ? 'domain' : 'package',
			members: entities.slice(half).map((e) => e.name),
			dependsOn: [],
			paragraphIndex: entities[half].paragraphIndex,
			quote: entities[half].quote
		});
	}
	const packages = [...packagesMap.values()];
	for (let i = 0; i < packages.length - 1; i += 1) {
		if (!packages[i].dependsOn.includes(packages[i + 1].id)) {
			packages[i].dependsOn.push(packages[i + 1].id);
		}
	}

	// 5. Components
	const components: SharedUmlComponent[] = entities.slice(0, 4).map((ent, idx, arr) => ({
		id: ent.id,
		name: ent.name,
		stereotype: isConceptualModel ? 'functional role' : 'component',
		providedInterfaces: [`${ent.id}Contract`],
		requiredInterfaces: idx < arr.length - 1 ? [`${arr[idx + 1].id}Contract`] : [],
		dependsOn: idx < arr.length - 1 ? [arr[idx + 1].id] : [],
		paragraphIndex: ent.paragraphIndex,
		quote: ent.quote
	}));

	// 6. Composite Structure
	const hasExplicitCompositeParts =
		entities.length >= 3 ||
		/\b(internal|subsystem|layer|mediator|pipeline|engine|boundary|port|module|architecture)\b/i.test(
			boundedText
		);
	let compositeStructure: SharedUmlCompositeStructure | null = null;
	if (hasExplicitCompositeParts || allowAssumptions) {
		const rootEnt = entities[0];
		const childParts = entities.slice(1, 5);
		compositeStructure = {
			classifierName: rootEnt.name,
			stereotype: isConceptualModel ? 'conceptual composite' : 'composite',
			ports: [
				{ id: 'inputPort', name: 'inputPort', direction: 'in', protocol: 'SourceInput' },
				{ id: 'outputPort', name: 'outputPort', direction: 'out', protocol: 'VerifiedOutput' }
			],
			parts: childParts.map((part, pIdx) => ({
				id: `part_${part.id}`,
				name: `role${pIdx + 1}`,
				roleType: part.name,
				multiplicity: '1'
			})),
			connectors: childParts.map((part, pIdx) => ({
				from: pIdx === 0 ? 'inputPort' : `part_${childParts[pIdx - 1].id}`,
				to: `part_${part.id}`,
				label: relationships[pIdx]?.label || 'forwards to',
				kind: pIdx === 0 ? 'delegation' : 'assembly'
			})),
			paragraphIndex: rootEnt.paragraphIndex,
			quote: rootEnt.quote,
			isAssumption: !hasExplicitCompositeParts && allowAssumptions
		};
		if (compositeStructure.parts.length > 0) {
			const lastPart = compositeStructure.parts[compositeStructure.parts.length - 1];
			compositeStructure.connectors.push({
				from: lastPart.id,
				to: 'outputPort',
				label: 'emits outcome',
				kind: 'delegation'
			});
		}
	}

	// 7. Deployment Nodes
	const deploymentNodes: SharedUmlDeploymentNode[] = [];
	const deploymentRegex =
		/\b(server|clinic|hospital|tablet|browser|device|cloud|database|registry|gateway|workstation|node|cluster|ministry|laboratory|edge)\b/gi;
	let hasExplicitDeployment = false;

	for (const p of paragraphs) {
		const matches = [...p.text.matchAll(deploymentRegex)];
		for (const m of matches) {
			const term = m[1];
			const nodeName = `${term.charAt(0).toUpperCase()}${term.slice(1).toLowerCase()}Environment`;
			const nodeId = toIdentifier(nodeName);
			if (!deploymentNodes.some((n) => n.id === nodeId) && deploymentNodes.length < 4) {
				hasExplicitDeployment = true;
				const lower = term.toLowerCase();
				const nodeKind: SharedUmlDeploymentNode['nodeKind'] =
					lower === 'database' || lower === 'registry'
						? 'database'
						: lower === 'tablet' ||
							  lower === 'device' ||
							  lower === 'browser' ||
							  lower === 'workstation'
							? 'device'
							: lower === 'cloud'
								? 'cloud'
								: 'node';
				deploymentNodes.push({
					id: nodeId,
					name: nodeName,
					nodeKind,
					artifacts: [entities[deploymentNodes.length % entities.length]?.name || 'DomainArtifact'],
					connections: [],
					paragraphIndex: p.index,
					quote: excerptQuote(p.text)
				});
			}
		}
	}

	if (deploymentNodes.length === 1) {
		deploymentNodes.push({
			id: 'TargetExchangeNode',
			name: `${entities[Math.min(1, entities.length - 1)].name} Host`,
			nodeKind: 'executionEnvironment',
			artifacts: [entities[Math.min(1, entities.length - 1)].name],
			connections: [],
			paragraphIndex: entities[Math.min(1, entities.length - 1)].paragraphIndex,
			quote: entities[Math.min(1, entities.length - 1)].quote
		});
	}

	if (!hasExplicitDeployment && allowAssumptions) {
		entities.slice(0, 2).forEach((ent, idx) => {
			deploymentNodes.push({
				id: `AssumedNode_${ent.id}`,
				name: `${ent.name} Environment (Illustrative)`,
				nodeKind: idx === 0 ? 'device' : 'executionEnvironment',
				artifacts: [`${ent.id}.artifact`],
				connections: [],
				paragraphIndex: ent.paragraphIndex,
				quote: ent.quote,
				isAssumption: true
			});
		});
	}

	for (let i = 0; i < deploymentNodes.length - 1; i += 1) {
		deploymentNodes[i].connections.push({
			targetNode: deploymentNodes[i + 1].id,
			protocol: isConceptualModel ? 'channel' : 'HTTPS'
		});
	}

	// 8. Profile Stereotypes
	const profileStereotypes: SharedUmlProfileStereotype[] = entities.slice(0, 3).map((ent, idx) => ({
		id: `Stereo_${ent.id}`,
		stereotypeName: ent.id,
		metaclass: idx === 0 ? 'Class' : idx === 1 ? 'Component' : 'Action',
		taggedValues: [
			`sourceParagraph : Integer = ${ent.paragraphIndex}`,
			`domainKind : String = '${domainKind}'`
		],
		constraint: `Elements stereotyped «${ent.id}» preserve terminology from '${ent.name}'.`,
		paragraphIndex: ent.paragraphIndex,
		quote: ent.quote
	}));

	// 9. Actors & Use Cases
	const actors: SharedUmlActor[] = [];
	const actorRegex =
		/\b(clinician|nurse|doctor|physician|patient|reader|author|user|operator|reviewer|auditor|regulator|payer|hospital|citizen|researcher|engineer|architect|student|administrator)\b/gi;
	for (const p of paragraphs) {
		for (const m of p.text.matchAll(actorRegex)) {
			const roleName = `${m[1].charAt(0).toUpperCase()}${m[1].slice(1).toLowerCase()}`;
			const id = toIdentifier(roleName);
			if (!actors.some((a) => a.id === id) && actors.length < 3) {
				actors.push({
					id,
					name: roleName,
					role: 'External Actor',
					paragraphIndex: p.index,
					quote: excerptQuote(p.text)
				});
			}
		}
	}
	if (actors.length === 0) {
		actors.push({
			id: toIdentifier(entities[0].name),
			name: entities[0].name,
			role: 'Primary Initiator',
			paragraphIndex: entities[0].paragraphIndex,
			quote: entities[0].quote
		});
	}

	const useCases: SharedUmlUseCase[] = [];
	for (const p of paragraphs.slice(0, 5)) {
		const firstClause = p.text.split(/[,.;!?]/)[0]?.trim() ?? p.text;
		const ucName = firstClause.length > 44 ? `${firstClause.slice(0, 41).trim()}…` : firstClause;
		if (ucName.length >= 8 && useCases.length < 4) {
			useCases.push({
				id: `UC${useCases.length + 1}`,
				name: ucName,
				actorIds: [actors[useCases.length % actors.length].id],
				includes: [],
				paragraphIndex: p.index,
				quote: excerptQuote(p.text)
			});
		}
	}
	if (useCases.length >= 2) {
		useCases[0].includes.push(useCases[1].id);
	}

	// 10. Activities
	const activities: SharedUmlActivityStep[] = [];
	for (const p of paragraphs.slice(0, 6)) {
		const sentences = p.text
			.split(/(?<=[.!?])\s+/)
			.map((s) => s.trim())
			.filter((s) => s.length >= 14);
		for (const s of sentences.slice(0, 2)) {
			if (activities.length >= 6) break;
			const isDecision = /\b(if|whether|when|unless|either|otherwise|in case)\b/i.test(s);
			const isParallel =
				/\b(simultaneously|in parallel|concurrently|at the same time|both)\b/i.test(s);
			const cleanStep = s.replace(/[.!?]+$/, '').slice(0, 54);
			if (isDecision) {
				activities.push({
					id: `step-${activities.length + 1}`,
					label: `${cleanStep.slice(0, 36)}?`,
					lane: p.heading,
					kind: 'decision',
					branchYes: 'Proceed validated flow',
					branchNo: 'Handle exception / fallback',
					paragraphIndex: p.index,
					quote: excerptQuote(s)
				});
			} else if (isParallel) {
				activities.push({
					id: `step-${activities.length + 1}`,
					label: cleanStep,
					lane: p.heading,
					kind: 'fork',
					parallelActions: [
						`Execute ${entities[0]?.name || 'Primary'} track`,
						`Record ${entities[1]?.name || 'Secondary'} state`
					],
					paragraphIndex: p.index,
					quote: excerptQuote(s)
				});
			} else {
				activities.push({
					id: `step-${activities.length + 1}`,
					label: cleanStep,
					lane: p.heading,
					kind: 'action',
					paragraphIndex: p.index,
					quote: excerptQuote(s)
				});
			}
		}
	}

	// 11. States & Transitions
	const states: SharedUmlState[] = [];
	const transitions: SharedUmlTransition[] = [];
	const stateKeywords =
		/\b(draft|queued|pending|submitted|validated|verified|approved|denied|rejected|quarantined|active|idle|completed|published|archived|initialized|failed|resolved)\b/gi;
	for (const p of paragraphs) {
		for (const m of p.text.matchAll(stateKeywords)) {
			const stName = `${m[1].charAt(0).toUpperCase()}${m[1].slice(1).toLowerCase()}`;
			const stId = toIdentifier(stName);
			if (!states.some((s) => s.id === stId) && states.length < 5) {
				states.push({
					id: stId,
					name: stName,
					entryAction: `record ${stName.toLowerCase()} status`,
					paragraphIndex: p.index,
					quote: excerptQuote(p.text)
				});
			}
		}
	}

	const hasExplicitStates = states.length >= 2 || paragraphs.length >= 2;
	if (states.length < 2) {
		paragraphs.slice(0, 3).forEach((p, idx) => {
			const label = p.heading && p.heading !== 'Overview' ? p.heading : `Phase ${idx + 1}`;
			const id = toIdentifier(label) || `State${idx + 1}`;
			if (!states.some((s) => s.id === id)) {
				states.push({
					id,
					name: label.slice(0, 26),
					entryAction: p.text.slice(0, 34),
					paragraphIndex: p.index,
					quote: excerptQuote(p.text)
				});
			}
		});
	}

	for (let i = 0; i < states.length - 1; i += 1) {
		transitions.push({
			fromState: states[i].id,
			toState: states[i + 1].id,
			trigger: relationships[i]?.label || `completeStage${i + 1}`,
			guard: i === 0 ? 'criteriaMet' : undefined,
			effect: 'advanceLifecycle',
			paragraphIndex: states[i + 1].paragraphIndex,
			quote: states[i + 1].quote
		});
	}

	// 12. Messages & Interaction Nodes
	const messages: SharedUmlMessage[] = [];
	const hasExplicitInteractions = entities.length >= 2;
	for (let i = 0; i < Math.min(4, relationships.length); i += 1) {
		const rel = relationships[i];
		messages.push({
			order: `${i + 1}`,
			from: rel.from,
			to: rel.to,
			message: `${rel.label}()`,
			kind: 'sync',
			paragraphIndex: rel.paragraphIndex,
			quote: rel.quote
		});
		messages.push({
			order: `${i + 1}.1`,
			from: rel.to,
			to: rel.from,
			message: `ack_${rel.label.replace(/\s+/g, '_')}()`,
			kind: 'return',
			paragraphIndex: rel.paragraphIndex,
			quote: rel.quote
		});
	}

	const interactionNodes: SharedUmlInteractionNode[] = paragraphs.slice(0, 3).map((p, idx) => {
		const pA = entities[idx % entities.length]?.id || 'ParticipantA';
		const pB = entities[(idx + 1) % entities.length]?.id || 'ParticipantB';
		return {
			id: `io-${idx + 1}`,
			refName:
				p.heading && p.heading !== 'Overview'
					? toIdentifier(p.heading)
					: `InteractionPhase${idx + 1}`,
			summary: `${pA} -> ${pB} : ${relationships[idx % relationships.length]?.label || 'exchange'}`,
			participants: [pA, pB],
			paragraphIndex: p.index,
			quote: excerptQuote(p.text)
		};
	});

	// 13. Timing Tracks (Strictly check for actual temporal durations/timestamps/deadlines!)
	const timingRegex =
		/\b(\d+(?:\.\d+)?)\s*(ms|milliseconds?|s|sec|seconds?|m|min|minutes?|h|hr|hours?|days?|weeks?|months?|years?)\b|\b(19\d\d|20\d\d)\b/gi;
	const foundTimeTokens: { value: string; paragraphIndex: number; quote: string }[] = [];
	for (const p of paragraphs) {
		for (const m of p.text.matchAll(timingRegex)) {
			foundTimeTokens.push({
				value: m[0].trim(),
				paragraphIndex: p.index,
				quote: excerptQuote(p.text)
			});
		}
	}

	const hasExplicitTiming = foundTimeTokens.length >= 1;
	const timingTracks: SharedUmlTimingTrack[] = [];

	if (hasExplicitTiming) {
		const p1 = entities[0];
		const p2 = entities[1] ?? entities[0];
		const stNames = states.slice(0, 3).map((s) => s.id);
		const ticks = ['0', ...foundTimeTokens.slice(0, 3).map((t, idx) => `${(idx + 1) * 10}`)];
		timingTracks.push(
			{
				participant: p1.id,
				kind: 'robust',
				states: stNames.length >= 2 ? stNames : ['Idle', 'Active', 'Verified'],
				events: ticks.map((t, idx) => ({
					tick: t,
					state: (stNames.length >= 2 ? stNames : ['Idle', 'Active', 'Verified'])[
						idx % Math.max(2, stNames.length)
					]
				})),
				constraints: [
					{
						fromTick: ticks[0],
						toTick: ticks[ticks.length - 1],
						label: `{observed window: ${foundTimeTokens[0].value}}`
					}
				],
				paragraphIndex: foundTimeTokens[0].paragraphIndex,
				quote: foundTimeTokens[0].quote
			},
			{
				participant: p2.id,
				kind: 'concise',
				states: ['Waiting', 'Processing', 'Complete'],
				events: ticks.map((t, idx) => ({
					tick: t,
					state: ['Waiting', 'Processing', 'Complete'][idx % 3]
				})),
				constraints: [],
				paragraphIndex: foundTimeTokens[0].paragraphIndex,
				quote: foundTimeTokens[0].quote
			}
		);
	} else if (allowAssumptions) {
		const p1 = entities[0];
		timingTracks.push({
			participant: p1.id,
			kind: 'robust',
			states: ['Initial', 'InProgress', 'Completed'],
			events: [
				{ tick: '0', state: 'Initial' },
				{ tick: '10', state: 'InProgress' },
				{ tick: '20', state: 'Completed' }
			],
			constraints: [
				{
					fromTick: '0',
					toTick: '20',
					label: '{illustrative sequence ticks @0..@20 (not measured)}'
				}
			],
			paragraphIndex: p1.paragraphIndex,
			quote: p1.quote,
			isAssumption: true
		});
	}

	return {
		title,
		domainKind,
		isConceptualModel,
		conceptualRationale,
		totalCharacters,
		totalWords,
		sectionedAnalysis,
		sectionCount: uniqueHeadings.length,
		paragraphs,
		terminology: entities.map((e) => e.name),
		entities,
		relationships,
		instances,
		instanceLinks,
		packages,
		components,
		compositeStructure,
		deploymentNodes,
		profileStereotypes,
		systemBoundaryName: title,
		actors,
		useCases,
		activities,
		states,
		transitions,
		messages,
		interactionNodes,
		timingTracks,
		hasExplicitInstances,
		hasExplicitDeployment,
		hasExplicitTiming,
		hasExplicitCompositeParts,
		hasExplicitStates,
		hasExplicitInteractions
	};
}
