import { z } from 'zod';
import { getUmlDiagramMeta } from '$lib/visualizations/post-to-uml/catalog';
import { checkPlantUmlSecurity } from '$lib/visualizations/post-to-uml/plantuml/security';
import { contentRevision } from '$lib/visualizations/post-to-uml/authoring';
import {
	resolveRequestedDiagramTypes,
	slugifyTitle
} from '$lib/visualizations/post-to-uml/generator';
import {
	ALL_UML_DIAGRAM_TYPES,
	type SharedUmlModel,
	type UmlDiagramRecord,
	type UmlDiagramType,
	type UmlGenerationRequest,
	type UmlGenerationResponse
} from '$lib/visualizations/post-to-uml/types';
import { UmlServiceFailure } from './failure';

export const aiDiagramSchema = z.strictObject({
	type: z.enum(ALL_UML_DIAGRAM_TYPES),
	generationStatus: z.enum(['generated', 'needs_more_info', 'not_applicable']),
	statusReason: z.string().max(500),
	title: z.string().min(3).max(160),
	explanation: z.string().min(8).max(500),
	sourceCode: z.string().max(16_000),
	caption: z.string().max(1_000),
	altText: z.string().max(500),
	isConceptual: z.boolean(),
	assumptions: z.array(z.string().min(1).max(240)).max(8),
	missingInformation: z.array(z.string().min(1).max(240)).max(8),
	supportingReferences: z
		.array(
			z.strictObject({
				paragraphIndex: z.number().int().min(1).max(40_000),
				quote: z.string().min(1).max(500),
				elementLabel: z.string().min(1).max(160)
			})
		)
		.max(24)
});

export const aiWireSchema = z.strictObject({
	recommendedTypes: z.array(z.enum(ALL_UML_DIAGRAM_TYPES)).max(3),
	recommendationRationale: z.string().min(10).max(800),
	diagrams: z.array(aiDiagramSchema).max(14)
});

// Parse entries separately so one invalid figure never destroys valid siblings.
const envelopeSchema = aiWireSchema.extend({ diagrams: z.array(z.unknown()).max(14) });

function failedDiagram(type: UmlDiagramType, reason: string): UmlDiagramRecord {
	const meta = getUmlDiagramMeta(type);
	return {
		id: `uml-${type}`,
		type,
		family: meta.family,
		subfamily: meta.subfamily,
		title: meta.label,
		explanation: meta.readerValue,
		sourceLanguage: 'plantuml',
		sourceCode: '',
		caption: '',
		altText: '',
		isConceptual: false,
		supportingReferences: [],
		assumptions: [],
		missingInformation: [],
		notationLimitations: [...meta.notationLimitations],
		generationStatus: 'failed',
		statusReason: reason,
		validationStatus: 'invalid',
		renderStatus: 'not_rendered',
		repairAttempts: 0,
		provenance: 'ai'
	};
}

/** The server verifies schema/evidence/security; only the real browser engine may mark a render valid. */
export function normalizeUmlAiOutput(
	raw: unknown,
	request: UmlGenerationRequest,
	model: SharedUmlModel,
	modelLabel: string
): UmlGenerationResponse {
	const parsed = envelopeSchema.safeParse(raw);
	if (!parsed.success) {
		throw new UmlServiceFailure(
			'invalid_ai_response',
			'The AI provider returned an invalid response structure. No result was substituted.',
			502
		);
	}
	const output = parsed.data;
	const inputRevision = contentRevision(request.text);
	const recommendedTypes = [...new Set(output.recommendedTypes)];
	const types = resolveRequestedDiagramTypes(request.mode, request.selectedTypes, {
		recommendedTypes,
		rationale: output.recommendationRationale
	});
	const warnings: string[] = [];
	const grouped = new Map<UmlDiagramType, unknown[]>();
	for (const entry of output.diagrams) {
		const type = entry && typeof entry === 'object' && 'type' in entry ? entry.type : undefined;
		if (!ALL_UML_DIAGRAM_TYPES.includes(type as UmlDiagramType)) {
			warnings.push('The provider returned an unknown diagram type; that entry was rejected.');
			continue;
		}
		const items = grouped.get(type as UmlDiagramType) ?? [];
		items.push(entry);
		grouped.set(type as UmlDiagramType, items);
	}
	const diagrams = types.map((type): UmlDiagramRecord => {
		const entries = grouped.get(type) ?? [];
		if (entries.length !== 1)
			return failedDiagram(
				type,
				entries.length
					? 'The provider returned duplicate evaluations for this type. Regenerate this diagram.'
					: 'The provider omitted this requested type. No local result has been substituted.'
			);
		const candidate = aiDiagramSchema.safeParse(entries[0]);
		if (!candidate.success)
			return failedDiagram(
				type,
				'The provider returned malformed metadata or source for this diagram.'
			);
		const entry = candidate.data;
		if (!request.allowAssumptions && entry.assumptions.length) {
			return failedDiagram(
				type,
				'The provider introduced illustrative assumptions while that setting was disabled.'
			);
		}
		if (
			entry.supportingReferences.some(
				(ref) =>
					!model.paragraphs.some(
						(paragraph) =>
							paragraph.index === ref.paragraphIndex && paragraph.text.includes(ref.quote)
					)
			)
		)
			return failedDiagram(
				type,
				'A supporting quotation does not occur in its cited article paragraph.'
			);
		const generated = entry.generationStatus === 'generated';
		if (
			generated &&
			(!entry.supportingReferences.length || !entry.caption.trim() || !entry.altText.trim())
		) {
			return failedDiagram(
				type,
				'Generated figures require article evidence, a caption, and alternative text.'
			);
		}
		if (!generated && !entry.statusReason.trim()) {
			return failedDiagram(
				type,
				'The provider did not explain why this type needs information or is not applicable.'
			);
		}
		const sourceCode = generated ? entry.sourceCode.trim() : '';
		if (
			generated &&
			(!/^@startuml(?:\s|$)/.test(sourceCode) ||
				!/@enduml\s*$/.test(sourceCode) ||
				/```/.test(sourceCode))
		) {
			return failedDiagram(
				type,
				'The provider did not return a complete standalone PlantUML document.'
			);
		}
		const security = generated ? checkPlantUmlSecurity(sourceCode) : null;
		if (security && !security.safe) {
			return failedDiagram(
				type,
				`Diagram source was rejected by the rendering security policy: ${security.violations[0]?.message ?? 'unsafe source'}`
			);
		}
		const meta = getUmlDiagramMeta(type);
		let caption = generated ? entry.caption : '';
		if (generated && entry.isConceptual && !/conceptual model/i.test(caption))
			caption += ' Conceptual model.';
		const missingAssumptions = entry.assumptions.filter(
			(assumption) => !caption.includes(assumption)
		);
		if (generated && missingAssumptions.length)
			caption += ` Illustrative assumptions: ${missingAssumptions.join('; ')}`;
		return {
			id: `uml-${type}`,
			type,
			family: meta.family,
			subfamily: meta.subfamily,
			title: entry.title,
			explanation: entry.explanation,
			sourceLanguage: 'plantuml',
			sourceCode,
			caption,
			altText: generated ? entry.altText : '',
			isConceptual: entry.isConceptual,
			supportingReferences: entry.supportingReferences.map((ref, index) => ({
				...ref,
				id: `uml-${type}-ref-${index + 1}`,
				inputRevision
			})),
			assumptions: entry.assumptions,
			missingInformation: entry.missingInformation,
			notationLimitations: [...meta.notationLimitations],
			generationStatus: entry.generationStatus,
			statusReason: entry.statusReason,
			validationStatus: 'skipped',
			renderStatus: 'not_rendered',
			repairAttempts: 0,
			provenance: 'ai',
			sourceRevision: contentRevision(sourceCode)
		};
	});
	return {
		id: `uml-ai-${crypto.randomUUID()}`,
		inputRevision,
		title: model.title,
		slug: slugifyTitle(request.postSlug || model.title),
		createdAt: new Date().toISOString(),
		engine: 'ai',
		modelLabel,
		mode: request.mode,
		detailLevel: request.detailLevel,
		allowAssumptions: request.allowAssumptions,
		sharedModel: model,
		recommendation: { recommendedTypes, rationale: output.recommendationRationale },
		diagrams,
		warnings
	};
}
