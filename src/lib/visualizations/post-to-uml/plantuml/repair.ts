import type { UmlDiagramType, UmlValidationStatus } from '../types';
import { parsePlantUml, type ParsedPlantUmlDocument } from './parser';
import { checkPlantUmlSecurity } from './security';

export interface PlantUmlRepairOutcome {
	sourceCode: string;
	parsed: ParsedPlantUmlDocument;
	validationStatus: UmlValidationStatus;
	repairAttempts: number;
	repairLog: string[];
}

export const MAX_SYNTAX_REPAIR_ATTEMPTS = 2;

function applySingleRepairPass(
	source: string,
	diagramType: UmlDiagramType,
	_pass: number
): { source: string; fixes: string[] } {
	const fixes: string[] = [];
	let lines = source.split(/\r?\n/);

	// 1. Strip surrounding or embedded Markdown code fences
	const hadFences = lines.some((line) => line.trim().startsWith('```'));
	if (hadFences) {
		lines = lines.filter((line) => !line.trim().startsWith('```'));
		fixes.push('Stripped Markdown code fences (```).');
	}

	// 2. Ensure @startuml at the beginning and @enduml at the end
	const nonEmpty = lines.map((l) => l.trim()).filter((l) => l.length > 0 && !l.startsWith("'"));
	if (nonEmpty.length === 0 || !/^@startuml\b/i.test(nonEmpty[0])) {
		lines.unshift('@startuml');
		fixes.push('Added missing opening @startuml directive.');
	}
	const updatedNonEmpty = lines
		.map((l) => l.trim())
		.filter((l) => l.length > 0 && !l.startsWith("'"));
	if (
		updatedNonEmpty.length === 0 ||
		!/^@enduml\b/i.test(updatedNonEmpty[updatedNonEmpty.length - 1])
	) {
		lines.push('@enduml');
		fixes.push('Added missing closing @enduml directive.');
	}

	// 3. Fix unbalanced quotation marks on single lines and common arrow/activity typos
	let openBraces = 0;
	let openNotes = 0;
	let openIfs = 0;
	let openForks = 0;
	let openFragments = 0;

	const repairedLines: string[] = [];
	for (let i = 0; i < lines.length; i += 1) {
		let line = lines[i];
		const trimmed = line.trim();

		if (/^@enduml\b/i.test(trimmed)) {
			// Before closing @enduml, close any unclosed blocks on pass >= 1
			while (openNotes > 0) {
				repairedLines.push('end note');
				openNotes -= 1;
				fixes.push('Closed unclosed multi-line note block before @enduml.');
			}
			while (openForks > 0) {
				repairedLines.push('end fork');
				openForks -= 1;
				fixes.push('Closed unclosed fork block before @enduml.');
			}
			while (openIfs > 0) {
				repairedLines.push('endif');
				openIfs -= 1;
				fixes.push('Closed unclosed if block before @enduml.');
			}
			while (openFragments > 0) {
				repairedLines.push('end');
				openFragments -= 1;
				fixes.push('Closed unclosed sequence fragment before @enduml.');
			}
			while (openBraces > 0) {
				repairedLines.push('}');
				openBraces -= 1;
				fixes.push('Closed unclosed brace block "}" before @enduml.');
			}
			repairedLines.push(line);
			continue;
		}

		// Fix odd number of quotes on a line
		const quoteMatches = trimmed.match(/(?<!\\)"/g) ?? [];
		if (quoteMatches.length % 2 !== 0) {
			line = `${line}"`;
			fixes.push(`Closed unbalanced quotation mark on line ${i + 1}.`);
		}

		// Fix activity actions missing trailing semicolon `:Action` -> `:Action;`
		if (
			(diagramType === 'activity' || diagramType === 'interaction-overview') &&
			/^:[^:;]+$/.test(line.trim())
		) {
			line = `${line.trim()};`;
			fixes.push(`Added missing trailing semicolon to activity action on line ${i + 1}.`);
		}

		const t = line.trim();
		if (t.endsWith('{')) {
			openBraces += 1;
		} else if (t === '}') {
			if (openBraces > 0) {
				openBraces -= 1;
			} else {
				fixes.push(`Removed stray closing brace "}" on line ${i + 1}.`);
				continue;
			}
		}

		if (/^note\b/i.test(t) && !t.includes(':') && !/^note\s+"[^"]+"\s+as\b/i.test(t)) {
			openNotes += 1;
		} else if (/^end\s*note\b/i.test(t) && openNotes > 0) {
			openNotes -= 1;
		}

		if (/^if\s*\(/i.test(t)) {
			openIfs += 1;
		} else if (/^endif$/i.test(t) && openIfs > 0) {
			openIfs -= 1;
		}

		if (/^fork$/i.test(t)) {
			openForks += 1;
		} else if (/^end\s+(?:fork|merge)$/i.test(t) && openForks > 0) {
			openForks -= 1;
		}

		if (/^(alt|opt|loop|par|group|critical|break)\b/i.test(t)) {
			openFragments += 1;
		} else if (/^end$/i.test(t) && openFragments > 0) {
			openFragments -= 1;
		}

		repairedLines.push(line);
	}

	return {
		source: repairedLines.join('\n'),
		fixes
	};
}

export function validateAndRepairPlantUml(
	rawSource: string,
	diagramType: UmlDiagramType,
	maxAttempts: number = MAX_SYNTAX_REPAIR_ATTEMPTS
): PlantUmlRepairOutcome {
	const securityCheck = checkPlantUmlSecurity(rawSource);
	if (!securityCheck.safe) {
		const parsed = parsePlantUml(rawSource, diagramType);
		return {
			sourceCode: rawSource,
			parsed,
			validationStatus: 'invalid',
			repairAttempts: 0,
			repairLog: []
		};
	}

	const initialParsed = parsePlantUml(rawSource, diagramType);
	if (initialParsed.valid) {
		return {
			sourceCode: rawSource.trim(),
			parsed: initialParsed,
			validationStatus: 'valid',
			repairAttempts: 0,
			repairLog: []
		};
	}

	let currentSource = rawSource;
	let currentParsed = initialParsed;
	let attempts = 0;
	const repairLog: string[] = [];

	const boundedMax = Math.max(0, Math.min(maxAttempts, MAX_SYNTAX_REPAIR_ATTEMPTS));
	for (let pass = 1; pass <= boundedMax; pass += 1) {
		attempts = pass;
		const repaired = applySingleRepairPass(currentSource, diagramType, pass);
		currentSource = repaired.source;
		repairLog.push(...repaired.fixes);
		currentParsed = parsePlantUml(currentSource, diagramType);
		if (currentParsed.valid) {
			return {
				sourceCode: currentSource.trim(),
				parsed: currentParsed,
				validationStatus: 'repaired',
				repairAttempts: attempts,
				repairLog
			};
		}
	}

	return {
		sourceCode: currentSource.trim(),
		parsed: currentParsed,
		validationStatus: 'invalid',
		repairAttempts: attempts,
		repairLog
	};
}
