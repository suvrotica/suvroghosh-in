import type { UmlDiagramRecord } from './types';

export function renderedFixture(): UmlDiagramRecord {
	const sourceCode = '@startuml\nclass Patient\n@enduml';
	const svg =
		'<svg xmlns="http://www.w3.org/2000/svg" width="200" height="80"><text x="10" y="30">Patient</text></svg>';
	return {
		id: 'uml-class',
		type: 'class',
		family: 'structural',
		title: 'Patient',
		explanation: 'The named entity.',
		sourceLanguage: 'plantuml',
		sourceCode,
		caption: 'A patient entity.',
		altText: 'A box labelled Patient.',
		isConceptual: true,
		supportingReferences: [],
		assumptions: [],
		missingInformation: [],
		notationLimitations: [],
		generationStatus: 'generated',
		validationStatus: 'valid',
		renderStatus: 'rendered',
		repairAttempts: 0,
		svg,
		lastValidSvg: svg,
		lastValidSourceCode: sourceCode,
		provenance: 'example'
	};
}
