import { validateOntology } from './validation';
import type { Evidence, PromptOntology, Provenance } from './types';

type GraphRecord = Record<string, unknown>;

/** A deterministic JSON-LD graph of the validated interpretation. The atlas
 * vocabulary describes recorded relations; it does not invent domain predicates. */
export async function createKnowledgeGraph(
	input: PromptOntology,
	includeSource = false
): Promise<GraphRecord> {
	const ontology = validateOntology(input);
	const digest = await crypto.subtle.digest(
		'SHA-256',
		new TextEncoder().encode(ontology.source.text)
	);
	const sourceHash = Array.from(new Uint8Array(digest), (byte) =>
		byte.toString(16).padStart(2, '0')
	).join('');
	const base = `urn:prompt-atlas:sha256:${sourceHash}`;
	const id = (category: string, value: string) =>
		`${base}:${category}:${encodeURIComponent(value)}`;
	const provenance = (claim: {
		provenance: Provenance;
		evidence: Evidence[];
		rationale?: string;
	}) => ({
		provenance: claim.provenance,
		...(claim.rationale ? { rationale: claim.rationale } : {}),
		...(includeSource ? { evidence: claim.evidence } : {})
	});
	const graph: GraphRecord[] = [
		{
			'@id': base,
			'@type': 'schema:Dataset',
			name: 'Prompt Atlas knowledge graph',
			analysisMode: ontology.mode,
			ontologySchemaVersion: ontology.schemaVersion,
			sourceIncluded: includeSource,
			...(ontology.analysisMetadata ? { analysisMetadata: ontology.analysisMetadata } : {}),
			...(ontology.compression ? { compression: ontology.compression } : {}),
			...(includeSource
				? { sourceText: ontology.source.text, sourceRevision: ontology.source.revision }
				: {}),
			nodes: ontology.nodes.map((node) => ({ '@id': id('node', node.id) })),
			relations: ontology.relations.map((relation) => ({ '@id': id('relation', relation.id) })),
			issues: ontology.issues.map((issue) => ({ '@id': id('issue', issue.id) }))
		},
		...ontology.nodes.map(
			(node): GraphRecord => ({
				'@id': id('node', node.id),
				'@type': 'schema:Thing',
				name: node.label,
				kind: node.kind,
				layer: node.layer,
				...provenance(node),
				attributes: node.attributes.map((attribute, index) => ({
					'@id': id('attribute', `${node.id}-${index}`)
				}))
			})
		),
		...ontology.nodes.flatMap((node) =>
			node.attributes.map(
				(attribute, index): GraphRecord => ({
					'@id': id('attribute', `${node.id}-${index}`),
					'@type': 'schema:PropertyValue',
					name: attribute.name,
					...(attribute.value !== undefined ? { value: attribute.value } : {}),
					...(attribute.dataType ? { dataType: attribute.dataType } : {}),
					...(attribute.primaryKey !== undefined ? { primaryKey: attribute.primaryKey } : {}),
					...(attribute.unique !== undefined ? { unique: attribute.unique } : {}),
					...(attribute.foreignKey ? { foreignKey: attribute.foreignKey } : {}),
					...provenance(attribute)
				})
			)
		),
		...ontology.relations.map(
			(relation): GraphRecord => ({
				'@id': id('relation', relation.id),
				'@type': 'atlas:Relation',
				name: relation.label,
				kind: relation.kind,
				from: { '@id': id('node', relation.from) },
				to: { '@id': id('node', relation.to) },
				...(relation.guard ? { guard: relation.guard } : {}),
				...(relation.cardinality ? { cardinality: relation.cardinality } : {}),
				...provenance(relation)
			})
		),
		...ontology.issues.map(
			(issue): GraphRecord => ({
				'@id': id('issue', issue.id),
				'@type': 'atlas:Issue',
				kind: issue.kind,
				description: issue.description,
				resolved: issue.resolved ?? false,
				...(issue.alternatives ? { alternatives: issue.alternatives } : {}),
				...(includeSource ? { evidence: issue.evidence } : {})
			})
		)
	];
	return {
		'@context': {
			schema: 'https://schema.org/',
			atlas: 'urn:prompt-atlas:v1:',
			name: 'schema:name',
			description: 'schema:description',
			value: 'schema:value',
			kind: 'atlas:kind',
			layer: 'atlas:layer',
			from: { '@id': 'atlas:from', '@type': '@id' },
			to: { '@id': 'atlas:to', '@type': '@id' },
			nodes: { '@id': 'atlas:nodes', '@type': '@id', '@container': '@set' },
			relations: { '@id': 'atlas:relations', '@type': '@id', '@container': '@set' },
			attributes: { '@id': 'atlas:attributes', '@type': '@id', '@container': '@set' },
			issues: { '@id': 'atlas:issues', '@type': '@id', '@container': '@set' },
			analysisMode: 'atlas:analysisMode',
			ontologySchemaVersion: 'atlas:ontologySchemaVersion',
			sourceIncluded: 'atlas:sourceIncluded',
			sourceText: 'atlas:sourceText',
			sourceRevision: 'atlas:sourceRevision',
			provenance: 'atlas:provenance',
			rationale: 'atlas:rationale',
			guard: 'atlas:guard',
			cardinality: 'atlas:cardinality',
			dataType: 'atlas:dataType',
			primaryKey: 'atlas:primaryKey',
			unique: 'atlas:unique',
			foreignKey: 'atlas:foreignKey',
			resolved: 'atlas:resolved',
			alternatives: { '@id': 'atlas:alternatives', '@container': '@set' },
			evidence: { '@id': 'atlas:evidence', '@type': '@json' },
			analysisMetadata: { '@id': 'atlas:analysisMetadata', '@type': '@json' },
			compression: { '@id': 'atlas:compression', '@type': '@json' }
		},
		'@graph': graph
	};
}
