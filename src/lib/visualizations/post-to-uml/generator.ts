import { getUmlDiagramMeta } from './catalog';
import { extractSharedUmlModel } from './extractor';
import { renderPlantUmlToSvg } from './plantuml/renderer';
import { validateAndRepairPlantUml } from './plantuml/repair';
import {
	ALL_UML_DIAGRAM_TYPES,
	type SharedUmlModel,
	type UmlDetailLevel,
	type UmlDiagramRecord,
	type UmlDiagramType,
	type UmlGenerationMode,
	type UmlGenerationRequest,
	type UmlGenerationResponse,
	type UmlProvenance,
	type UmlRecommendationSummary,
	type UmlSupportingReference
} from './types';

export function slugifyTitle(raw: string): string {
	const slug = (raw ?? '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 48);
	return slug || 'article-uml';
}

export function selectRecommendedDiagramTypes(model: SharedUmlModel): UmlRecommendationSummary {
	const chosen: UmlDiagramType[] = [];
	const reasons: string[] = [];

	// Recommendations reflect available evidence, never a quota of pictures to fill.
	if (model.entities.length >= 2) {
		chosen.push('class');
		reasons.push(
			`Class Diagram maps the ${model.entities.length} recurring ${model.isConceptualModel ? 'conceptual entities' : 'domain classifiers'} (${model.entities
				.slice(0, 3)
				.map((e) => e.name)
				.join(
					', '
				)})${model.relationships.length ? ' and explicitly stated relationships' : '; no relationships were inferred from co-occurrence'}.`
		);
	}

	// Add the strongest behavioral view
	if (
		model.activities.some((a) => a.kind === 'decision' || a.kind === 'fork') ||
		model.activities.length >= 3
	) {
		chosen.push('activity');
		reasons.push(
			'Activity Diagram captures the procedural workflow, conditional branches, and causal progression in the prose.'
		);
	} else if (
		model.messages.length >= 2 &&
		model.messages.every((message) => message.kind !== 'unspecified')
	) {
		chosen.push('sequence');
		reasons.push(
			'Sequence Diagram traces the chronological order of interactions between the main participants.'
		);
	}

	// Add a 3rd high-signal diagram if warranted by evidence
	if (model.hasExplicitTiming && chosen.length < 3) {
		chosen.push('timing');
		reasons.push(
			'Timing Diagram plots the explicit time windows and state transitions mentioned in the text.'
		);
	} else if (model.hasExplicitDeployment && chosen.length < 3) {
		chosen.push('deployment');
		reasons.push(
			'Deployment Diagram shows the runtime environments and deployed artifacts explicitly referenced in the article.'
		);
	} else if (model.transitions.length > 0 && chosen.length < 3) {
		chosen.push('state-machine');
		reasons.push(
			'State Machine Diagram highlights the discrete lifecycle statuses and transition triggers.'
		);
	} else if (
		!chosen.includes('sequence') &&
		model.messages.length > 0 &&
		model.messages.every((message) => message.kind !== 'unspecified') &&
		chosen.length < 3
	) {
		chosen.push('sequence');
		reasons.push(
			'Sequence Diagram complements the structural model by ordering message handoffs across lifelines.'
		);
	} else if (model.messages.length > 0 && chosen.length < 3) {
		chosen.push('communication');
		reasons.push(
			'Communication Diagram preserves explicit message directions and order without inventing synchronous or asynchronous delivery.'
		);
	}

	return {
		recommendedTypes: chosen.slice(0, 3),
		rationale:
			reasons.join(' ') ||
			'The local heuristic found no sufficiently explicit concepts or flow. Add named entities and direct relationships, use manual source, or use the configured AI provider for broader prose interpretation.'
	};
}

function buildSupportingRefs(
	items: { paragraphIndex: number; quote: string; label: string }[]
): UmlSupportingReference[] {
	const seen = new Set<string>();
	const refs: UmlSupportingReference[] = [];
	for (const item of items) {
		const key = `${item.paragraphIndex}:${item.label}`;
		if (seen.has(key)) continue;
		seen.add(key);
		refs.push({
			id: `ref-${refs.length + 1}`,
			paragraphIndex: item.paragraphIndex,
			quote: item.quote,
			elementLabel: item.label
		});
	}
	return refs;
}

function synthesizePlantUmlForType(
	type: UmlDiagramType,
	model: SharedUmlModel,
	detailLevel: UmlDetailLevel,
	allowAssumptions: boolean
): {
	status: 'generated' | 'needs_more_info' | 'not_applicable';
	statusReason?: string;
	missingInformation: string[];
	assumptions: string[];
	title: string;
	explanation: string;
	caption: string;
	altText: string;
	sourceCode: string;
	supportingReferences: UmlSupportingReference[];
} {
	const meta = getUmlDiagramMeta(type);
	const isDetailed = detailLevel === 'detailed';
	const maxItems = isDetailed ? 6 : 3;
	const conceptualPrefix = model.isConceptualModel ? 'Conceptual ' : '';
	const conceptualCaptionNote = model.isConceptualModel
		? ' Modeled as a conceptual UML view of the article’s domain concepts rather than an implemented software codebase.'
		: '';
	const missingByType: Partial<Record<UmlDiagramType, string>> = {
		class:
			model.entities.length === 0
				? 'The local heuristic found no explicitly named concepts. Provide named entities or use the AI provider for broader prose interpretation.'
				: undefined,
		object:
			model.instances.length === 0
				? 'A concrete instance and its classifier or an explicit snapshot are needed; isolated numbers do not establish an instance.'
				: undefined,
		package:
			model.packages.length === 0
				? 'Provide explicit groupings or article section headings; package dependencies cannot be inferred from paragraph order.'
				: undefined,
		component:
			model.components.length === 0
				? 'Provide explicitly named components, services, or modules. Interfaces and dependencies will not be invented.'
				: undefined,
		'use-case':
			model.useCases.length === 0
				? 'Provide named actors and their explicit goals or capabilities, for example: Reader can download a report.'
				: undefined,
		activity:
			model.activities.length < 2
				? 'Provide at least two explicitly ordered actions. Paragraph order alone does not establish workflow control flow.'
				: undefined,
		'state-machine':
			model.transitions.length === 0
				? 'Provide explicit transitions between named states; mentions of status words alone do not establish a lifecycle.'
				: undefined,
		sequence:
			model.messages.length === 0
				? 'Provide sender, recipient, and message content, with explicit ordering for multiple exchanges.'
				: model.messages.some((message) => message.kind === 'unspecified')
					? 'The message direction is explicit, but synchronous versus asynchronous delivery is unspecified. Use a Communication view or specify delivery semantics; the local generator will not invent sequence arrowheads.'
					: undefined,
		communication:
			model.messages.length === 0
				? 'Provide explicit participant exchanges and their message order; co-occurring concepts are not communication links.'
				: undefined,
		profile:
			model.profileStereotypes.length === 0
				? 'Provide UML stereotypes and the metaclasses they extend. An ordinary domain article does not define a UML profile.'
				: undefined,
		'interaction-overview':
			model.interactionNodes.length === 0
				? 'Provide named interactions and the control flow connecting them. The local heuristic does not interpret arbitrary paragraphs as interactions.'
				: undefined
	};
	const missing = missingByType[type];
	if (missing)
		return {
			status: 'needs_more_info',
			statusReason: missing,
			missingInformation: [missing],
			assumptions: [],
			title: `${model.title}: ${meta.label}`,
			explanation: meta.readerValue,
			caption: '',
			altText: '',
			sourceCode: '',
			supportingReferences: []
		};

	switch (type) {
		case 'class': {
			const ents = model.entities.slice(0, maxItems);
			const entIds = new Set(ents.map((e) => e.id));
			const rels = model.relationships.filter((r) => entIds.has(r.from) && entIds.has(r.to));
			const lines: string[] = [
				'@startuml',
				`title ${model.title} — ${conceptualPrefix}Class Model`
			];
			for (const ent of ents) {
				lines.push(`class "${ent.name}" as ${ent.id} <<${ent.stereotype}>> {`);
				for (const attr of ent.attributes.slice(0, isDetailed ? 3 : 1)) {
					lines.push(`  ${attr}`);
				}
				for (const op of ent.operations.slice(0, isDetailed ? 2 : 1)) {
					lines.push(`  ${op}`);
				}
				lines.push('}');
			}
			for (const rel of rels) {
				const arrow =
					rel.kind === 'inheritance'
						? '--|>'
						: rel.kind === 'composition'
							? '*--'
							: rel.kind === 'aggregation'
								? 'o--'
								: rel.kind === 'dependency'
									? '..>'
									: '-->';
				const fromMult = rel.fromMultiplicity ? ` "${rel.fromMultiplicity}"` : '';
				const toMult = rel.toMultiplicity ? ` "${rel.toMultiplicity}"` : '';
				lines.push(`${rel.from}${fromMult} ${arrow}${toMult} ${rel.to} : ${rel.label}`);
			}
			lines.push('@enduml');

			return {
				status: 'generated',
				missingInformation: [],
				assumptions: [],
				title: `${model.title}: ${conceptualPrefix}Class Diagram`,
				explanation: `Maps the core ${model.isConceptualModel ? 'conceptual entities' : 'classifiers'} (${ents.map((e) => e.name).join(', ')}) and how they relate in the article.`,
				caption: `Figure (${meta.label}): ${ents.map((e) => e.name).join(', ')}.${rels.length ? ' Arrows show explicit source relationships.' : ' No relationships are inferred between these concepts.'}${conceptualCaptionNote}`,
				altText: `UML Class diagram showing ${ents.map((e) => e.name).join(', ')}${rels.length ? ' and explicitly stated relationships' : ' as separate concepts'}.`,
				sourceCode: lines.join('\n'),
				supportingReferences: buildSupportingRefs([
					...ents.map((e) => ({
						paragraphIndex: e.paragraphIndex,
						quote: e.quote,
						label: e.name
					})),
					...rels.map((r) => ({
						paragraphIndex: r.paragraphIndex,
						quote: r.quote,
						label: `${r.from} ${r.label} ${r.to}`
					}))
				])
			};
		}

		case 'object': {
			if (!model.hasExplicitInstances && !allowAssumptions) {
				return {
					status: 'needs_more_info',
					statusReason:
						'The article defines general concepts and relationships but does not provide concrete point-in-time instance values, named sample records, or snapshot metrics.',
					missingInformation: [
						'Named instance examples (e.g., specific case IDs, concrete record values, or a point-in-time scenario snapshot).',
						'Enable "Allow illustrative assumptions" if you want an illustrative instance snapshot synthesized from the class model.'
					],
					assumptions: [],
					title: `${model.title}: Object Snapshot`,
					explanation: meta.readerValue,
					caption: '',
					altText: '',
					sourceCode: '',
					supportingReferences: []
				};
			}

			const insts = model.instances.slice(0, maxItems);
			const assumptions = insts.some((i) => i.isAssumption)
				? [
						'Instance identifiers and slot values are illustrative examples synthesized from the article’s concepts (not measured or quoted records).'
					]
				: [];

			const lines: string[] = [
				'@startuml',
				`title ${model.title} — ${assumptions.length ? 'Illustrative ' : ''}Object Snapshot`
			];
			for (const inst of insts) {
				lines.push(`object "${inst.instanceName} : ${inst.classifierName}" as ${inst.id} {`);
				for (const slot of inst.slots.slice(0, isDetailed ? 3 : 2)) {
					lines.push(`  ${slot.key} = "${slot.value}"`);
				}
				lines.push('}');
			}
			for (const link of model.instanceLinks.slice(0, maxItems)) {
				if (
					insts.some((i) => i.id === link.fromInstance) &&
					insts.some((i) => i.id === link.toInstance)
				) {
					lines.push(`${link.fromInstance} --> ${link.toInstance} : ${link.label}`);
				}
			}
			lines.push('@enduml');

			const assumptionCaption =
				assumptions.length > 0
					? ' Note: Slot values shown are illustrative assumptions, not measured facts.'
					: '';

			return {
				status: 'generated',
				missingInformation: [],
				assumptions,
				title: `${model.title}: Point-in-Time Object Diagram`,
				explanation:
					'Displays concrete instance specifications with underlined headers and attribute slot values at a specific scenario moment.',
				caption: `Figure (${meta.label}): Point-in-time instance snapshot for ${insts.map((i) => i.classifierName).join(', ')}.${conceptualCaptionNote}${assumptionCaption}`,
				altText: `UML Object diagram showing instances ${insts.map((i) => i.instanceName).join(', ')} and their slot values.`,
				sourceCode: lines.join('\n'),
				supportingReferences: buildSupportingRefs([
					...insts.map((i) => ({
						paragraphIndex: i.paragraphIndex,
						quote: i.quote,
						label: `${i.instanceName} : ${i.classifierName}`
					})),
					...model.paragraphs
						.filter((p) => insts.some((instance) => p.text.includes(`${instance.instanceName}.`)))
						.map((p) => ({
							paragraphIndex: p.index,
							quote: p.text,
							label: 'Explicit instance slot values'
						}))
				])
			};
		}

		case 'package': {
			const pkgs = model.packages.slice(0, maxItems);
			const lines: string[] = [
				'@startuml',
				`title ${model.title} — ${conceptualPrefix}Package Grouping`
			];
			for (const pkg of pkgs) {
				lines.push(`package "${pkg.name}" as ${pkg.id} <<${pkg.stereotype || 'domain'}>> {`);
				for (const member of pkg.members.slice(0, isDetailed ? 4 : 2)) {
					const mId = member.replace(/[^A-Za-z0-9_]/g, '') || 'Member';
					lines.push(`  class "${member}" as ${pkg.id}_${mId}`);
				}
				lines.push('}');
			}
			for (const pkg of pkgs) {
				for (const dep of pkg.dependsOn) {
					if (pkgs.some((p) => p.id === dep)) {
						lines.push(`${pkg.id} ..> ${dep} : <<use>>`);
					}
				}
			}
			lines.push('@enduml');

			return {
				status: 'generated',
				missingInformation: [],
				assumptions: [],
				title: `${model.title}: ${conceptualPrefix}Package Diagram`,
				explanation:
					'Groups concepts by explicit article section headings; this editorial organization does not establish software package boundaries or dependencies.',
				caption: `Figure (${meta.label}): Editorial grouping by article sections ${pkgs.map((p) => p.name).join(' and ')}. No software package dependency is inferred.${conceptualCaptionNote}`,
				altText: `UML Package diagram grouping concepts into ${pkgs.map((p) => p.name).join(', ')}.`,
				sourceCode: lines.join('\n'),
				supportingReferences: buildSupportingRefs(
					pkgs.map((p) => ({
						paragraphIndex: p.paragraphIndex,
						quote: p.quote,
						label: p.name
					}))
				)
			};
		}

		case 'component': {
			const comps = model.components.slice(0, maxItems);
			const lines: string[] = [
				'@startuml',
				`title ${model.title} — ${conceptualPrefix}Component & Interface View`
			];
			for (const comp of comps) {
				lines.push(`component "${comp.name}" as ${comp.id} <<${comp.stereotype || 'component'}>>`);
				for (const iface of comp.providedInterfaces.slice(0, 1)) {
					lines.push(`() "${iface}" as ${iface}`);
					lines.push(`${comp.id} -- ${iface} : provides`);
				}
			}
			for (const comp of comps) {
				for (const dependency of comp.dependsOn) {
					if (comps.some((candidate) => candidate.id === dependency))
						lines.push(`${comp.id} ..> ${dependency} : depends on`);
				}
				for (const req of comp.requiredInterfaces.slice(0, 1)) {
					lines.push(`${comp.id} ..> ${req} : <<use>>`);
				}
			}
			lines.push('@enduml');

			return {
				status: 'generated',
				missingInformation: [],
				assumptions: [],
				title: `${model.title}: ${conceptualPrefix}Component Diagram`,
				explanation:
					'Shows explicitly named components and any source-supported dependencies or interfaces.',
				caption: `Figure (${meta.label}): Explicit components ${comps.map((c) => c.name).join(', ')}. Interfaces are shown only when specified.${conceptualCaptionNote}`,
				altText: `UML Component diagram showing ${comps.map((c) => c.name).join(', ')}.`,
				sourceCode: lines.join('\n'),
				supportingReferences: buildSupportingRefs(
					comps.map((c) => ({
						paragraphIndex: c.paragraphIndex,
						quote: c.quote,
						label: c.name
					}))
				)
			};
		}

		case 'composite-structure': {
			if (!model.compositeStructure) {
				return {
					status: 'needs_more_info',
					statusReason:
						'The text does not describe an enclosing system or classifier with internal collaborating parts, roles, or boundary ports.',
					missingInformation: [
						'An enclosing system or concept containing distinct internal parts/roles and boundary interaction points.'
					],
					assumptions: [],
					title: `${model.title}: Composite Structure`,
					explanation: meta.readerValue,
					caption: '',
					altText: '',
					sourceCode: '',
					supportingReferences: []
				};
			}

			const cs = model.compositeStructure;
			const parts = cs.parts.slice(0, isDetailed ? 4 : 2);
			const partIds = new Set(parts.map((p) => p.id));
			const assumptions = cs.isAssumption
				? [
						'Boundary ports and internal role multiplicities are illustrative decomposition assumptions derived from the primary entities.'
					]
				: [];

			const lines: string[] = [
				'@startuml',
				`title ${cs.classifierName} — Internal Composite Structure`,
				`component "${cs.classifierName}" as EnclosingClassifier <<${cs.stereotype}>> {`
			];
			for (const port of cs.ports) {
				const kw = port.direction === 'out' ? 'portout' : 'portin';
				lines.push(`  ${kw} "${port.name}" as ${port.id}`);
			}
			for (const part of parts) {
				lines.push(
					`  component "${part.name} : ${part.roleType} [${part.multiplicity}]" as ${part.id} <<part>>`
				);
			}
			lines.push('}');
			for (const conn of cs.connectors) {
				const fromOk = cs.ports.some((port) => port.id === conn.from) || partIds.has(conn.from);
				const toOk = cs.ports.some((port) => port.id === conn.to) || partIds.has(conn.to);
				if (fromOk && toOk) {
					lines.push(`${conn.from} --> ${conn.to} : <<${conn.kind}>> ${conn.label}`);
				}
			}
			lines.push('@enduml');

			return {
				status: 'generated',
				missingInformation: [],
				assumptions,
				title: `${cs.classifierName}: Composite Structure Diagram`,
				explanation: `Decomposes ${cs.classifierName} into its internal role-bound parts (${parts.map((p) => p.roleType).join(', ')}), boundary ports, and internal connectors.`,
				caption: `Figure (${meta.label}): Internal composite structure of ${cs.classifierName} showing boundary ports and collaborating part roles.${conceptualCaptionNote} (Rendered using composed PlantUML port/part notation.)${assumptions.length ? ` Assumptions: ${assumptions.join(' ')}` : ''}`,
				altText: `UML Composite Structure diagram of ${cs.classifierName} with boundary ports and internal parts ${parts.map((p) => p.roleType).join(', ')}.`,
				sourceCode: lines.join('\n'),
				supportingReferences: buildSupportingRefs([
					{
						paragraphIndex: cs.paragraphIndex,
						quote: cs.quote,
						label: cs.classifierName
					}
				])
			};
		}

		case 'deployment': {
			if (!model.hasExplicitDeployment && !allowAssumptions) {
				return {
					status: 'not_applicable',
					statusReason:
						'The article does not mention physical or runtime execution nodes, devices, clinics, servers, databases, or deployed software/document artifacts.',
					missingInformation: [
						'Execution environments, physical sites/devices, or runtime nodes and the concrete artifacts deployed on them.',
						'Enable "Allow illustrative assumptions" only if you want a hypothetical runtime topology.'
					],
					assumptions: [],
					title: `${model.title}: Deployment Topology`,
					explanation: meta.readerValue,
					caption: '',
					altText: '',
					sourceCode: '',
					supportingReferences: []
				};
			}

			const nodes = model.deploymentNodes.slice(0, maxItems);
			const assumptions = nodes.some((n) => n.isAssumption)
				? [
						'Execution nodes and deployed artifact filenames are illustrative assumptions because the article does not specify physical hosting infrastructure.'
					]
				: [];

			const lines: string[] = [
				'@startuml',
				`title ${model.title} — ${assumptions.length ? 'Illustrative ' : ''}Deployment Topology`
			];
			for (const n of nodes) {
				const kw =
					n.nodeKind === 'database'
						? 'database'
						: n.nodeKind === 'device'
							? 'device'
							: n.nodeKind === 'cloud'
								? 'cloud'
								: 'node';
				lines.push(`${kw} "${n.name}" as ${n.id} <<${n.nodeKind}>> {`);
				for (const [aIdx, art] of n.artifacts.slice(0, 2).entries()) {
					lines.push(`  artifact "${art}" as ${n.id}_art${aIdx + 1}`);
				}
				lines.push('}');
			}
			for (const n of nodes) {
				for (const conn of n.connections) {
					if (nodes.some((target) => target.id === conn.targetNode)) {
						lines.push(`${n.id} --> ${conn.targetNode} : <<${conn.protocol}>>`);
					}
				}
			}
			lines.push('@enduml');

			return {
				status: 'generated',
				missingInformation: [],
				assumptions,
				title: `${model.title}: Deployment Diagram`,
				explanation:
					'Shows execution environments/nodes, the artifacts manifested within each node, and communication paths.',
				caption: `Figure (${meta.label}): Execution nodes (${nodes.map((n) => n.name).join(', ')}) and deployed artifacts.${
					assumptions.length ? ' Illustrative deployment assumptions are labeled.' : ''
				}`,
				altText: `UML Deployment diagram with 3D execution nodes ${nodes.map((n) => n.name).join(', ')} and deployed artifacts.`,
				sourceCode: lines.join('\n'),
				supportingReferences: buildSupportingRefs([
					...nodes.map((n) => ({
						paragraphIndex: n.paragraphIndex,
						quote: n.quote,
						label: n.name
					})),
					...model.paragraphs
						.filter((p) =>
							nodes.some(
								(node) =>
									p.text.includes(node.name) &&
									node.artifacts.some((artifact) => p.text.includes(artifact))
							)
						)
						.map((p) => ({
							paragraphIndex: p.index,
							quote: p.text,
							label: 'Deployment source statement'
						}))
				])
			};
		}

		case 'profile': {
			const stereos = model.profileStereotypes.slice(0, maxItems);
			const metaclasses = [...new Set(stereos.map((s) => s.metaclass))];
			const lines: string[] = [
				'@startuml',
				`title ${model.title} — UML Domain Profile`,
				`package "${slugifyTitle(model.title).replace(/-/g, '_')}_Profile" as DomainProfile <<profile>> {`
			];
			for (const mc of metaclasses) {
				lines.push(`  class "${mc}" as Meta_${mc} <<metaclass>>`);
			}
			for (const st of stereos) {
				lines.push(`  class "${st.stereotypeName}" as ${st.id} <<stereotype>> {`);
				for (const tag of st.taggedValues.slice(0, isDetailed ? 2 : 1)) {
					lines.push(`    +${tag}`);
				}
				lines.push('  }');
			}
			lines.push('}');
			for (const st of stereos) {
				lines.push(`${st.id} -up->> Meta_${st.metaclass} : <<extension>>`);
			}
			if (stereos[0]?.constraint) {
				lines.push(`note "${stereos[0].constraint.replace(/"/g, "'")}" as ProfileConstraint1`);
			}
			lines.push('@enduml');

			return {
				status: 'generated',
				missingInformation: [],
				assumptions: [],
				title: `${model.title}: UML Profile Diagram`,
				explanation:
					'Defines custom domain stereotypes, their tagged metadata values, and the standard UML metaclasses they extend.',
				caption: `Figure (${meta.label}): Metamodel profile extending UML metaclasses (${metaclasses.join(', ')}) with domain stereotypes (${stereos.map((s) => `«${s.stereotypeName}»`).join(', ')}).`,
				altText: `UML Profile diagram showing stereotypes ${stereos.map((s) => s.stereotypeName).join(', ')} extending UML metaclasses ${metaclasses.join(', ')}.`,
				sourceCode: lines.join('\n'),
				supportingReferences: buildSupportingRefs(
					stereos.map((s) => ({
						paragraphIndex: s.paragraphIndex,
						quote: s.quote,
						label: `«${s.stereotypeName}»`
					}))
				)
			};
		}

		case 'use-case': {
			const actors = model.actors.slice(0, 3);
			const ucs = model.useCases.slice(0, isDetailed ? 4 : 3);
			const lines: string[] = ['@startuml', `title ${model.title} — Actor Goals & Use Cases`];
			for (const actor of actors) {
				lines.push(`actor "${actor.name}" as ${actor.id}`);
			}
			lines.push(`rectangle "${model.systemBoundaryName.slice(0, 36)}" as SystemBoundary {`);
			for (const uc of ucs) {
				lines.push(`  usecase "${uc.name}" as ${uc.id}`);
			}
			lines.push('}');
			for (const uc of ucs) {
				for (const actorId of uc.actorIds) {
					if (actors.some((a) => a.id === actorId)) {
						lines.push(`${actorId} --> ${uc.id}`);
					}
				}
				for (const inc of uc.includes) {
					if (ucs.some((u) => u.id === inc)) {
						lines.push(`${uc.id} ..> ${inc} : <<include>>`);
					}
				}
			}
			lines.push('@enduml');

			return {
				status: 'generated',
				missingInformation: [],
				assumptions: [],
				title: `${model.title}: Use Case Diagram`,
				explanation:
					'Shows external actors, the goals they accomplish, and the boundary of the subject system.',
				caption: `Figure (${meta.label}): Actors (${actors.map((a) => a.name).join(', ')}) interacting with use cases inside the ${model.systemBoundaryName} boundary.${conceptualCaptionNote}`,
				altText: `UML Use Case diagram showing actors ${actors.map((a) => a.name).join(', ')} and ${ucs.length} use cases inside a system boundary.`,
				sourceCode: lines.join('\n'),
				supportingReferences: buildSupportingRefs(
					ucs.map((u) => ({
						paragraphIndex: u.paragraphIndex,
						quote: u.quote,
						label: u.name
					}))
				)
			};
		}

		case 'activity': {
			const steps = model.activities.slice(0, isDetailed ? 5 : 3);
			const lines: string[] = ['@startuml', `title ${model.title} — Activity Workflow`];
			let lastLane = isDetailed ? steps[0]?.lane || '' : '';
			if (lastLane) lines.push(`|${lastLane.slice(0, 24)}|`);
			lines.push('start');
			for (const step of steps) {
				if (isDetailed && step.lane && step.lane !== lastLane) {
					lines.push(`|${step.lane.slice(0, 24)}|`);
					lastLane = step.lane;
				}
				if (step.kind === 'decision') {
					lines.push(`if (${step.label}) then (yes)`);
					lines.push(`  :${step.branchYes || 'Continue validated path'};`);
					lines.push('else (no)');
					lines.push(`  :${step.branchNo || 'Record exception'};`);
					lines.push('endif');
				} else if (step.kind === 'fork') {
					const branches = step.parallelActions ?? ['Parallel Action 1', 'Parallel Action 2'];
					lines.push('fork');
					lines.push(`  :${branches[0]};`);
					lines.push('fork again');
					lines.push(`  :${branches[1] ?? 'Parallel Action 2'};`);
					lines.push('end fork');
				} else {
					lines.push(`:${step.label};`);
				}
			}
			lines.push('stop');
			lines.push('@enduml');

			return {
				status: 'generated',
				missingInformation: [],
				assumptions: [],
				title: `${model.title}: Activity Diagram`,
				explanation:
					'Traces the step-by-step procedural flow, conditional branches, and concurrent actions described in the text.',
				caption: `Figure (${meta.label}): Procedural workflow across ${steps.length} extracted stages.${conceptualCaptionNote}`,
				altText: `UML Activity diagram tracing ${steps.length} workflow steps from start to stop.`,
				sourceCode: lines.join('\n'),
				supportingReferences: buildSupportingRefs(
					steps.map((s) => ({
						paragraphIndex: s.paragraphIndex,
						quote: s.quote,
						label: s.label.slice(0, 36)
					}))
				)
			};
		}

		case 'state-machine': {
			const states = model.states.slice(0, maxItems);
			const lines: string[] = ['@startuml', `title ${model.title} — State Machine Lifecycle`];
			for (const st of states) {
				lines.push(`state "${st.name}" as ${st.id}`);
				if (st.entryAction) lines.push(`${st.id} : entry / ${st.entryAction}`);
			}
			for (const tr of model.transitions) {
				if (states.some((s) => s.id === tr.fromState) && states.some((s) => s.id === tr.toState)) {
					const guardPart = isDetailed && tr.guard ? ` [${tr.guard}]` : '';
					const effectPart = isDetailed && tr.effect ? ` / ${tr.effect}` : '';
					const label = `${tr.trigger}${guardPart}${effectPart}`;
					lines.push(`${tr.fromState} --> ${tr.toState}${label ? ` : ${label}` : ''}`);
				}
			}
			lines.push('@enduml');

			return {
				status: 'generated',
				missingInformation: [],
				assumptions: [],
				title: `${model.title}: State Machine Diagram`,
				explanation:
					'Models the discrete lifecycle states and the event transitions that move the subject from one state to the next.',
				caption: `Figure (${meta.label}): Source-supported transitions between ${states.map((s) => s.name).join(', ')}. Initial/final states, guards, and effects are omitted unless specified.${conceptualCaptionNote}`,
				altText: `UML State Machine diagram with states ${states.map((s) => s.name).join(', ')}.`,
				sourceCode: lines.join('\n'),
				supportingReferences: buildSupportingRefs(
					states.map((s) => ({
						paragraphIndex: s.paragraphIndex,
						quote: s.quote,
						label: s.name
					}))
				)
			};
		}

		case 'sequence': {
			const participantIds = new Set(
				model.messages.flatMap((message) => [message.from, message.to])
			);
			const ents = model.entities
				.filter((entity) => participantIds.has(entity.id))
				.slice(0, isDetailed ? 6 : 4);
			const entIds = new Set(ents.map((e) => e.id));
			const msgs = model.messages.filter((m) => entIds.has(m.from) && entIds.has(m.to));
			const lines: string[] = ['@startuml', `title ${model.title} — Interaction Sequence`];
			for (const ent of ents) {
				lines.push(`participant "${ent.name}" as ${ent.id}`);
			}
			for (const msg of msgs.slice(0, isDetailed ? 6 : 4)) {
				const arrow = msg.kind === 'return' ? '-->' : msg.kind === 'async' ? '->>' : '->';
				lines.push(`${msg.from} ${arrow} ${msg.to} : ${msg.message}`);
			}
			lines.push('@enduml');

			return {
				status: 'generated',
				missingInformation: [],
				assumptions: [],
				title: `${model.title}: Sequence Diagram`,
				explanation:
					'Shows explicit source messages across participant lifelines; no acknowledgement or reply is synthesized.',
				caption: `Figure (${meta.label}): Chronological message exchange between ${ents.map((e) => e.name).join(', ')}.${conceptualCaptionNote}`,
				altText: `UML Sequence diagram showing lifelines for ${ents.map((e) => e.name).join(', ')} and ordered messages.`,
				sourceCode: lines.join('\n'),
				supportingReferences: buildSupportingRefs(
					msgs.map((m) => ({
						paragraphIndex: m.paragraphIndex,
						quote: m.quote,
						label: `${m.from} -> ${m.to}: ${m.message}`
					}))
				)
			};
		}

		case 'communication': {
			const participantIds = new Set(
				model.messages.flatMap((message) => [message.from, message.to])
			);
			const ents = model.entities
				.filter((entity) => participantIds.has(entity.id))
				.slice(0, isDetailed ? 6 : 4);
			const entIds = new Set(ents.map((e) => e.id));
			const msgs = model.messages.filter((m) => entIds.has(m.from) && entIds.has(m.to));
			const lines: string[] = ['@startuml', `title ${model.title} — Communication Link Network`];
			for (const ent of ents) {
				lines.push(`agent ":${ent.name}" as ${ent.id}`);
			}
			msgs.slice(0, isDetailed ? 5 : 3).forEach((msg) => {
				lines.push(`${msg.from} --> ${msg.to} : ${msg.order}: ${msg.message}`);
			});
			lines.push('@enduml');

			return {
				status: 'generated',
				missingInformation: [],
				assumptions: [],
				title: `${model.title}: Communication Diagram`,
				explanation:
					'Shows the structural network of links connecting participants and indexes message flow using hierarchical sequence numbers (1:, 1.1:, 2:) rather than vertical lifelines.',
				caption: `Figure (${meta.label}): Participant link topology and numbered message exchange across ${ents.map((e) => e.name).join(', ')}.${conceptualCaptionNote}`,
				altText: `UML Communication diagram showing network links and numbered messages between ${ents.map((e) => e.name).join(', ')}.`,
				sourceCode: lines.join('\n'),
				supportingReferences: buildSupportingRefs(
					msgs.map((m) => ({
						paragraphIndex: m.paragraphIndex,
						quote: m.quote,
						label: `${m.order}: ${m.message}`
					}))
				)
			};
		}

		case 'interaction-overview': {
			const nodes = model.interactionNodes.slice(0, isDetailed ? 4 : 3);
			const lines: string[] = ['@startuml', `title ${model.title} — Interaction Overview`, 'start'];
			nodes.forEach((ioNode, idx) => {
				const tag = idx === 1 ? 'sd' : 'ref';
				lines.push(`partition "${tag}: ${ioNode.refName}" <<${tag}>> {`);
				lines.push(`  :${ioNode.summary};`);
				lines.push('}');
			});
			lines.push('stop');
			lines.push('@enduml');

			return {
				status: 'generated',
				missingInformation: [],
				assumptions: [],
				title: `${model.title}: Interaction Overview Diagram`,
				explanation: `Connects named multi-participant interactions (${nodes.map((n) => `ref ${n.refName}`).join(', ')}) inside a high-level control flow.`,
				caption: `Figure (${meta.label}): High-level control flow connecting named interaction frames (${nodes.map((n) => n.refName).join(' → ')}).${conceptualCaptionNote}`,
				altText: `UML Interaction Overview diagram chaining interaction frames ${nodes.map((n) => n.refName).join(', ')}.`,
				sourceCode: lines.join('\n'),
				supportingReferences: buildSupportingRefs(
					nodes.map((n) => ({
						paragraphIndex: n.paragraphIndex,
						quote: n.quote,
						label: `ref: ${n.refName}`
					}))
				)
			};
		}

		case 'timing': {
			if (!model.hasExplicitTiming && !allowAssumptions) {
				return {
					status: 'needs_more_info',
					statusReason:
						'The local heuristic needs explicit timed state observations for a participant, such as “At 0 seconds, Clock is Idle. At 5 seconds, Clock is Active.” Durations or dates alone do not establish a waveform.',
					missingInformation: [
						'Explicit durations (e.g., seconds, minutes, hours, years), deadlines, or timed state changes along a clock axis.',
						'Enable "Allow illustrative assumptions" if you want an illustrative relative-tick timeline (@0, @10, @20).'
					],
					assumptions: [],
					title: `${model.title}: Timing Diagram`,
					explanation: meta.readerValue,
					caption: '',
					altText: '',
					sourceCode: '',
					supportingReferences: []
				};
			}

			const tracks = model.timingTracks.slice(0, 2);
			const assumptions = tracks.some((t) => t.isAssumption)
				? [
						'Time ticks (@0, @10, @20) represent illustrative relative sequence steps, not measured durations or clock measurements.'
					]
				: [];

			const lines: string[] = [
				'@startuml',
				`title ${model.title} — ${assumptions.length ? 'Illustrative ' : ''}Timing Waveform`
			];
			for (const tr of tracks) {
				lines.push(`${tr.kind} "${tr.participant}" as ${tr.participant}`);
			}

			const allTicks = [...new Set(tracks.flatMap((t) => t.events.map((e) => e.tick)))].sort(
				(a, b) => Number(a) - Number(b)
			);
			for (const tick of allTicks) {
				lines.push(`@${tick}`);
				for (const tr of tracks) {
					const ev = tr.events.find((e) => e.tick === tick);
					if (ev) {
						lines.push(`${tr.participant} is ${ev.state}`);
					}
				}
			}

			for (const tr of tracks) {
				for (const c of tr.constraints) {
					lines.push(`${tr.participant}@${c.fromTick} <-> @${c.toTick} : ${c.label}`);
				}
			}
			lines.push('@enduml');

			const assumptionCaption =
				assumptions.length > 0
					? ' Note: Time ticks (@0..@20) are illustrative ordinal steps, not measured facts.'
					: ' Time axis values are seconds, converted from the explicit source observations.';

			return {
				status: 'generated',
				missingInformation: [],
				assumptions,
				title: `${model.title}: Timing Diagram`,
				explanation:
					'Plots state changes for participants along a horizontal time axis with duration bounds.',
				caption: `Figure (${meta.label}): State waveform timeline for ${tracks.map((t) => t.participant).join(', ')}.${conceptualCaptionNote}${assumptionCaption}`,
				altText: `UML Timing diagram plotting state changes along a horizontal time axis for ${tracks.map((t) => t.participant).join(', ')}.`,
				sourceCode: lines.join('\n'),
				supportingReferences: buildSupportingRefs([
					...tracks.map((t) => ({
						paragraphIndex: t.paragraphIndex,
						quote: t.quote,
						label: t.participant
					})),
					...model.paragraphs
						.filter(
							(p) =>
								tracks.some((track) => p.text.includes(track.participant)) &&
								/\bAt\s+\d/.test(p.text)
						)
						.map((p) => ({
							paragraphIndex: p.index,
							quote: p.text,
							label: 'Timed state observation'
						}))
				])
			};
		}
	}
}

export function generateSingleDiagramRecord(
	type: UmlDiagramType,
	model: SharedUmlModel,
	options: {
		detailLevel: UmlDetailLevel;
		allowAssumptions: boolean;
		provenance?: UmlProvenance;
		aiOverride?: Partial<{
			title: string;
			explanation: string;
			sourceCode: string;
			caption: string;
			altText: string;
			generationStatus: 'generated' | 'needs_more_info' | 'not_applicable';
			statusReason: string;
			assumptions: string[];
			missingInformation: string[];
			supportingReferences: UmlSupportingReference[];
		}>;
	}
): UmlDiagramRecord {
	const meta = getUmlDiagramMeta(type);
	const provenance = options.provenance ?? 'local';

	try {
		const synth = synthesizePlantUmlForType(
			type,
			model,
			options.detailLevel,
			options.allowAssumptions
		);

		const status = options.aiOverride?.generationStatus ?? synth.status;
		const statusReason = options.aiOverride?.statusReason ?? synth.statusReason;

		if (status === 'needs_more_info' || status === 'not_applicable') {
			return {
				id: `uml-${type}`,
				type,
				family: meta.family,
				subfamily: meta.subfamily,
				title: options.aiOverride?.title || synth.title,
				explanation: options.aiOverride?.explanation || synth.explanation,
				sourceLanguage: 'plantuml',
				sourceCode: '',
				caption: '',
				altText: '',
				isConceptual: model.isConceptualModel,
				supportingReferences:
					options.aiOverride?.supportingReferences ?? synth.supportingReferences,
				assumptions: options.aiOverride?.assumptions ?? synth.assumptions,
				missingInformation: options.aiOverride?.missingInformation ?? synth.missingInformation,
				notationLimitations: [...meta.notationLimitations],
				generationStatus: status,
				statusReason,
				validationStatus: 'skipped',
				renderStatus: 'not_rendered',
				repairAttempts: 0,
				provenance
			};
		}

		const candidateSource = options.aiOverride?.sourceCode?.trim() || synth.sourceCode;
		// The legacy parser recognizes only a subset of PlantUML. Never let its
		// repair heuristics delete valid official-engine syntax from generated code.
		// The authoring renderer validates the exact source with the official engine.
		const repairOutcome = validateAndRepairPlantUml(candidateSource, type, 0);
		const renderResult = renderPlantUmlToSvg(repairOutcome.sourceCode, type, {
			titleOverride: options.aiOverride?.title || synth.title,
			isConceptual: model.isConceptualModel
		});

		// If an AI-supplied source failed to render even after syntax repair, fall back to deterministic template only if AI source was invalid, or report render error clearly
		if (!renderResult.ok) {
			return {
				id: `uml-${type}`,
				type,
				family: meta.family,
				subfamily: meta.subfamily,
				title: options.aiOverride?.title || synth.title,
				explanation: options.aiOverride?.explanation || synth.explanation,
				sourceLanguage: 'plantuml',
				sourceCode: repairOutcome.sourceCode,
				caption: options.aiOverride?.caption || synth.caption,
				altText: options.aiOverride?.altText || synth.altText,
				isConceptual: model.isConceptualModel,
				supportingReferences:
					options.aiOverride?.supportingReferences ?? synth.supportingReferences,
				assumptions: options.aiOverride?.assumptions ?? synth.assumptions,
				missingInformation: options.aiOverride?.missingInformation ?? synth.missingInformation,
				notationLimitations: [...meta.notationLimitations],
				generationStatus: 'generated',
				validationStatus: 'invalid',
				renderStatus: 'error',
				renderError: renderResult.error,
				repairAttempts: repairOutcome.repairAttempts,
				provenance
			};
		}

		return {
			id: `uml-${type}`,
			type,
			family: meta.family,
			subfamily: meta.subfamily,
			title: options.aiOverride?.title || synth.title,
			explanation: options.aiOverride?.explanation || synth.explanation,
			sourceLanguage: 'plantuml',
			sourceCode: repairOutcome.sourceCode,
			caption: options.aiOverride?.caption || synth.caption,
			altText: options.aiOverride?.altText || synth.altText,
			isConceptual: model.isConceptualModel,
			supportingReferences: options.aiOverride?.supportingReferences ?? synth.supportingReferences,
			assumptions: options.aiOverride?.assumptions ?? synth.assumptions,
			missingInformation: options.aiOverride?.missingInformation ?? synth.missingInformation,
			notationLimitations: [...meta.notationLimitations],
			generationStatus: 'generated',
			validationStatus: repairOutcome.validationStatus,
			renderStatus: 'rendered',
			repairAttempts: repairOutcome.repairAttempts,
			svg: renderResult.svg,
			lastValidSvg: renderResult.svg,
			lastValidSourceCode: repairOutcome.sourceCode,
			provenance
		};
	} catch (error) {
		return {
			id: `uml-${type}`,
			type,
			family: meta.family,
			subfamily: meta.subfamily,
			title: `${model.title}: ${meta.label}`,
			explanation: meta.readerValue,
			sourceLanguage: 'plantuml',
			sourceCode: '',
			caption: '',
			altText: '',
			isConceptual: model.isConceptualModel,
			supportingReferences: [],
			assumptions: [],
			missingInformation: [],
			notationLimitations: [...meta.notationLimitations],
			generationStatus: 'failed',
			statusReason:
				error instanceof Error
					? `Generation failed for ${meta.label}: ${error.message}`
					: `Generation failed for ${meta.label}.`,
			validationStatus: 'invalid',
			renderStatus: 'error',
			renderError: error instanceof Error ? error.message : 'Unexpected generation error',
			repairAttempts: 0,
			provenance
		};
	}
}

export function resolveRequestedDiagramTypes(
	mode: UmlGenerationMode,
	selectedTypes: UmlDiagramType[] | undefined,
	recommendation: UmlRecommendationSummary
): UmlDiagramType[] {
	if (mode === 'all14') {
		return [...ALL_UML_DIAGRAM_TYPES];
	}
	if (mode === 'selected') {
		const validSelected = [...new Set(selectedTypes ?? [])].filter((t): t is UmlDiagramType =>
			ALL_UML_DIAGRAM_TYPES.includes(t)
		);
		if (!validSelected.length) throw new Error('Select at least one concrete UML diagram type.');
		return validSelected;
	}
	return recommendation.recommendedTypes;
}

export function generateUmlDiagramsFromText(
	request: UmlGenerationRequest,
	provenance: UmlProvenance = 'local',
	modelLabel = 'Local heuristic extraction (not AI)'
): UmlGenerationResponse {
	const sharedModel = extractSharedUmlModel(request.text, {
		title: request.title,
		allowAssumptions: request.allowAssumptions
	});
	const recommendation = selectRecommendedDiagramTypes(sharedModel);
	const targetTypes = resolveRequestedDiagramTypes(
		request.mode,
		request.selectedTypes,
		recommendation
	);

	const warnings: string[] = [
		'Local generation recognizes a limited set of explicit text patterns. It is heuristic extraction, not AI interpretation; review the evidence and use AI or manual source for broader prose.'
	];
	if (sharedModel.entities.length >= 40)
		warnings.push(
			'The local glossary reached its 40-concept limit. The article is preserved in full; split it explicitly for a broader model.'
		);
	if (sharedModel.entities.length > (request.detailLevel === 'detailed' ? 6 : 3))
		warnings.push(
			'Figures show a bounded subset of the shared model for readability. Detailed mode includes more concepts; omitted concepts remain in the shared model.'
		);

	const diagrams = targetTypes.map((type) =>
		generateSingleDiagramRecord(type, sharedModel, {
			detailLevel: request.detailLevel,
			allowAssumptions: request.allowAssumptions,
			provenance
		})
	);

	const slug = request.postSlug || slugifyTitle(sharedModel.title);

	return {
		id: `uml-run-${Date.now()}`,
		title: sharedModel.title,
		slug,
		createdAt: new Date().toISOString(),
		engine: request.engine ?? 'local',
		modelLabel,
		mode: request.mode,
		detailLevel: request.detailLevel,
		allowAssumptions: request.allowAssumptions,
		sharedModel,
		recommendation,
		diagrams,
		warnings
	};
}

export function updateDiagramFromManualEdit(
	record: UmlDiagramRecord,
	newSourceCode: string
): UmlDiagramRecord {
	const renderResult = renderPlantUmlToSvg(newSourceCode, record.type, {
		titleOverride: record.title,
		isConceptual: record.isConceptual
	});

	if (renderResult.ok && renderResult.svg) {
		return {
			...record,
			metadataReviewRequired: true,
			sourceCode: newSourceCode,
			validationStatus: 'valid',
			renderStatus: 'rendered',
			renderError: undefined,
			svg: renderResult.svg,
			lastValidSvg: renderResult.svg,
			lastValidSourceCode: newSourceCode,
			provenance: 'edited'
		};
	}

	return {
		...record,
		metadataReviewRequired: true,
		sourceCode: newSourceCode,
		validationStatus: 'invalid',
		renderStatus: 'error',
		renderError: renderResult.error || 'Syntax error in PlantUML source.',
		// Preserve lastValidSvg so the UI can show it clearly marked as the last successful version
		svg: undefined,
		lastValidSvg: record.lastValidSvg ?? record.svg,
		lastValidSourceCode: record.lastValidSourceCode ?? record.sourceCode,
		provenance: 'edited'
	};
}
