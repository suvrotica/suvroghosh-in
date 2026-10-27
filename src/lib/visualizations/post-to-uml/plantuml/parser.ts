import type { UmlDiagramType } from '../types';
import { checkPlantUmlSecurity, type PlantUmlSecurityViolation } from './security';

export interface PlantUmlSyntaxError {
	line: number;
	message: string;
	snippet: string;
}

export interface ParsedUmlNode {
	id: string;
	label: string;
	kind:
		| 'class'
		| 'interface'
		| 'object'
		| 'package'
		| 'component'
		| 'portin'
		| 'portout'
		| 'node'
		| 'device'
		| 'database'
		| 'cloud'
		| 'executionEnvironment'
		| 'artifact'
		| 'actor'
		| 'usecase'
		| 'state'
		| 'participant'
		| 'agent'
		| 'rectangle'
		| 'robust'
		| 'concise';
	stereotype?: string;
	parentId?: string;
	attributes: string[];
	operations: string[];
	slots: { key: string; value: string }[];
	descriptionLines: string[];
}

export interface ParsedUmlRelation {
	from: string;
	to: string;
	arrow: string;
	kind:
		| 'inheritance'
		| 'realization'
		| 'composition'
		| 'aggregation'
		| 'dependency'
		| 'association'
		| 'extension'
		| 'lollipop'
		| 'socket'
		| 'sync-message'
		| 'return-message'
		| 'link';
	label: string;
	stereotype?: string;
	fromMultiplicity?: string;
	toMultiplicity?: string;
	fragmentLabel?: string;
}

export interface ParsedActivityNode {
	id: string;
	kind: 'start' | 'stop' | 'action' | 'decision' | 'fork' | 'ref-frame';
	label: string;
	partition?: string;
	stereotype?: string;
	yesLabel?: string;
	noLabel?: string;
	yesActions: string[];
	noActions: string[];
	forkBranches: string[][];
	subLines: string[];
}

export interface ParsedTimingTrack {
	id: string;
	label: string;
	kind: 'robust' | 'concise';
	states: string[];
	events: { tick: string; tickNumber: number; state: string; comment?: string }[];
}

export interface ParsedTimingConstraint {
	participantId?: string;
	fromTick: string;
	toTick: string;
	label: string;
}

export interface ParsedUmlNote {
	id: string;
	targetId?: string;
	text: string;
}

export interface ParsedPlantUmlDocument {
	valid: boolean;
	inferredType: UmlDiagramType;
	title?: string;
	caption?: string;
	nodes: ParsedUmlNode[];
	relations: ParsedUmlRelation[];
	activityNodes: ParsedActivityNode[];
	timingTracks: ParsedTimingTrack[];
	timingTicks: string[];
	timingConstraints: ParsedTimingConstraint[];
	notes: ParsedUmlNote[];
	errors: PlantUmlSyntaxError[];
	securityViolations: PlantUmlSecurityViolation[];
}

function cleanQuotes(raw: string): string {
	const trimmed = raw.trim();
	if (
		(trimmed.startsWith('"') && trimmed.endsWith('"')) ||
		(trimmed.startsWith("'") && trimmed.endsWith("'"))
	) {
		return trimmed.slice(1, -1).trim();
	}
	return trimmed;
}

function normalizeId(raw: string): string {
	const cleaned = cleanQuotes(raw)
		.replace(/^:+|:+$/g, '')
		.replace(/^\(+|\)+$/g, '')
		.replace(/^\[+|\]+$/g, '')
		.trim();
	return cleaned || 'Element';
}

function classifyArrow(arrow: string, label: string): ParsedUmlRelation['kind'] {
	const lowerLabel = label.toLowerCase();
	if (lowerLabel.includes('<<extension>>') || lowerLabel.includes('«extension»')) {
		return 'extension';
	}
	if (arrow.includes('--()') || arrow.includes('-()') || arrow.includes('()--')) {
		return 'lollipop';
	}
	if (arrow.includes('..(') || arrow.includes('-(') || arrow.includes(')--')) {
		return 'socket';
	}
	if (arrow.includes('..|>') || arrow.includes('<|..')) {
		return 'realization';
	}
	if (arrow.includes('--|>') || arrow.includes('<|--') || arrow.includes('-up-|>')) {
		return 'inheritance';
	}
	if (arrow.includes('*--') || arrow.includes('--*')) {
		return 'composition';
	}
	if (arrow.includes('o--') || arrow.includes('--o')) {
		return 'aggregation';
	}
	if (arrow.includes('..>') || arrow.includes('<..')) {
		return 'dependency';
	}
	if (arrow.includes('-->') && !arrow.includes('--->')) {
		return 'return-message';
	}
	if (arrow.includes('->')) {
		return 'sync-message';
	}
	if (arrow === '--' || arrow === '-') {
		return 'link';
	}
	return 'association';
}

export function parsePlantUml(
	source: string,
	expectedType: UmlDiagramType = 'class'
): ParsedPlantUmlDocument {
	const security = checkPlantUmlSecurity(source);
	const errors: PlantUmlSyntaxError[] = [];

	if (!security.safe) {
		for (const violation of security.violations) {
			errors.push({
				line: violation.line,
				message: violation.message,
				snippet: violation.snippet
			});
		}
	}

	const rawLines = (source ?? '').split(/\r?\n/);
	let title: string | undefined;
	let caption: string | undefined;
	const nodesMap = new Map<string, ParsedUmlNode>();
	const relations: ParsedUmlRelation[] = [];
	const activityNodes: ParsedActivityNode[] = [];
	const timingTracksMap = new Map<string, ParsedTimingTrack>();
	const timingTicksSet = new Set<string>();
	const timingConstraints: ParsedTimingConstraint[] = [];
	const notes: ParsedUmlNote[] = [];

	// Check for unstripped markdown fences
	for (let i = 0; i < rawLines.length; i += 1) {
		const t = rawLines[i].trim();
		if (t.startsWith('```')) {
			errors.push({
				line: i + 1,
				message:
					'Markdown code fence (```) found inside PlantUML source; source must contain raw PlantUML only.',
				snippet: t
			});
		}
	}

	const nonEmptyLines = rawLines
		.map((text, idx) => ({ text: text.trim(), line: idx + 1 }))
		.filter((item) => item.text.length > 0 && !item.text.startsWith("'"));

	if (nonEmptyLines.length === 0) {
		errors.push({
			line: 1,
			message: 'PlantUML source is empty. Expected @startuml ... @enduml.',
			snippet: ''
		});
		return {
			valid: false,
			inferredType: expectedType,
			nodes: [],
			relations: [],
			activityNodes: [],
			timingTracks: [],
			timingTicks: [],
			timingConstraints: [],
			notes: [],
			errors,
			securityViolations: security.violations
		};
	}

	const firstLine = nonEmptyLines[0];
	const lastLine = nonEmptyLines[nonEmptyLines.length - 1];

	if (!/^@startuml\b/i.test(firstLine.text)) {
		errors.push({
			line: firstLine.line,
			message: 'Missing opening @startuml directive at the start of the diagram.',
			snippet: firstLine.text
		});
	}
	if (!/^@enduml\b/i.test(lastLine.text)) {
		errors.push({
			line: lastLine.line,
			message: 'Missing closing @enduml directive at the end of the diagram.',
			snippet: lastLine.text
		});
	}

	const ensureNode = (
		idRaw: string,
		labelRaw?: string,
		kind: ParsedUmlNode['kind'] = 'class',
		stereotype?: string,
		parentId?: string
	): ParsedUmlNode => {
		const id = normalizeId(idRaw);
		const existing = nodesMap.get(id);
		if (existing) {
			if (labelRaw && existing.label === existing.id) {
				existing.label = cleanQuotes(labelRaw);
			}
			if (stereotype && !existing.stereotype) {
				existing.stereotype = stereotype;
			}
			if (parentId && !existing.parentId) {
				existing.parentId = parentId;
			}
			if (existing.kind === 'class' && kind !== 'class') {
				existing.kind = kind;
			}
			return existing;
		}
		const created: ParsedUmlNode = {
			id,
			label: labelRaw ? cleanQuotes(labelRaw) : id,
			kind,
			stereotype,
			parentId,
			attributes: [],
			operations: [],
			slots: [],
			descriptionLines: []
		};
		nodesMap.set(id, created);
		return created;
	};

	const containerStack: {
		id: string;
		kind: 'node' | 'skinparam' | 'note' | 'fragment' | 'partition';
		label?: string;
	}[] = [];
	let currentTimingTick = '0';
	let inMultiLineComment = false;
	let currentPartition: string | undefined;
	let activeDecision: ParsedActivityNode | null = null;
	let activeDecisionBranch: 'yes' | 'no' = 'yes';
	let activeFork: ParsedActivityNode | null = null;
	let activeRefFrame: ParsedActivityNode | null = null;
	let activeMultiLineNote: { targetId?: string; lines: string[]; startLine: number } | null = null;
	let currentFragmentLabel: string | undefined;

	for (let i = 0; i < rawLines.length; i += 1) {
		const lineNum = i + 1;
		const raw = rawLines[i];
		const trimmed = raw.trim();

		if (!trimmed || trimmed.startsWith("'")) continue;

		if (inMultiLineComment) {
			if (trimmed.includes("'/")) {
				inMultiLineComment = false;
			}
			continue;
		}
		if (trimmed.startsWith("/'")) {
			if (!trimmed.includes("'/")) {
				inMultiLineComment = true;
			}
			continue;
		}

		// Check unbalanced quotes on single line (except multi-line constructs)
		const doubleQuoteCount = (trimmed.match(/(?<!\\)"/g) ?? []).length;
		if (doubleQuoteCount % 2 !== 0 && !activeMultiLineNote) {
			errors.push({
				line: lineNum,
				message: 'Unclosed quotation mark (") on line.',
				snippet: trimmed
			});
			continue;
		}

		if (activeMultiLineNote) {
			if (/^end\s*note\b/i.test(trimmed)) {
				notes.push({
					id: `note-${notes.length + 1}`,
					targetId: activeMultiLineNote.targetId,
					text: activeMultiLineNote.lines.join(' ')
				});
				activeMultiLineNote = null;
			} else {
				activeMultiLineNote.lines.push(trimmed);
			}
			continue;
		}

		if (/^@startuml\b/i.test(trimmed) || /^@enduml\b/i.test(trimmed)) {
			continue;
		}

		// Directives & settings
		if (
			/^(skinparam|hide|show|scale|left to right direction|top to bottom direction|autonumber|together)\b/i.test(
				trimmed
			)
		) {
			if (trimmed.endsWith('{')) {
				containerStack.push({ id: '__skinparam__', kind: 'skinparam' });
			}
			continue;
		}

		if (
			containerStack.length > 0 &&
			containerStack[containerStack.length - 1].kind === 'skinparam'
		) {
			if (trimmed === '}') {
				containerStack.pop();
			}
			continue;
		}

		const titleMatch = trimmed.match(/^title\s+(.+)$/i);
		if (titleMatch) {
			title = cleanQuotes(titleMatch[1]);
			continue;
		}

		const captionMatch = trimmed.match(/^(?:caption|footer|header)\s+(.+)$/i);
		if (captionMatch) {
			caption = cleanQuotes(captionMatch[1]);
			continue;
		}

		// Closing brace
		if (trimmed === '}') {
			if (activeRefFrame) {
				activeRefFrame = null;
			}
			if (containerStack.length === 0) {
				errors.push({
					line: lineNum,
					message: 'Unexpected closing brace "}" without matching opening block.',
					snippet: trimmed
				});
			} else {
				const popped = containerStack.pop();
				if (popped?.kind === 'partition') {
					currentPartition = undefined;
				}
			}
			continue;
		}

		// Notes
		const singleNoteMatch = trimmed.match(
			/^note\s+(?:(left|right|top|bottom)(?:\s+of\s+([^\s:]+))?|over\s+([^:]+)|"([^"]+)"\s+as\s+([^\s]+))\s*(?::\s*(.+))?$/i
		);
		if (singleNoteMatch) {
			const targetRaw = singleNoteMatch[2] || singleNoteMatch[3];
			const inlineQuote = singleNoteMatch[4];
			const body = singleNoteMatch[6];
			if (inlineQuote) {
				notes.push({
					id: singleNoteMatch[5] || `note-${notes.length + 1}`,
					text: cleanQuotes(inlineQuote)
				});
			} else if (body) {
				notes.push({
					id: `note-${notes.length + 1}`,
					targetId: targetRaw ? normalizeId(targetRaw.split(',')[0]) : undefined,
					text: cleanQuotes(body)
				});
			} else {
				activeMultiLineNote = {
					targetId: targetRaw ? normalizeId(targetRaw.split(',')[0]) : undefined,
					lines: [],
					startLine: lineNum
				};
			}
			continue;
		}

		if (/^note\s+as\s+([^\s]+)$/i.test(trimmed)) {
			activeMultiLineNote = {
				lines: [],
				startLine: lineNum
			};
			continue;
		}

		// Sequence fragments & activations
		if (/^(activate|deactivate|destroy|return)\b/i.test(trimmed)) {
			continue;
		}
		if (/^==\s*.+\s*==$/.test(trimmed)) {
			continue;
		}
		const fragmentStartMatch = trimmed.match(/^(alt|opt|loop|par|group|critical|break)\b\s*(.*)$/i);
		if (fragmentStartMatch) {
			currentFragmentLabel = `${fragmentStartMatch[1].toUpperCase()}: ${fragmentStartMatch[2].trim()}`;
			containerStack.push({ id: '__fragment__', kind: 'fragment', label: currentFragmentLabel });
			continue;
		}
		if (/^else\b/i.test(trimmed) && containerStack.some((c) => c.kind === 'fragment')) {
			const elseText = trimmed.replace(/^else\b\s*/i, '').trim();
			currentFragmentLabel = elseText ? `ELSE: ${elseText}` : 'ELSE';
			continue;
		}
		if (/^end$/i.test(trimmed)) {
			if (containerStack.some((c) => c.kind === 'fragment')) {
				while (containerStack.length > 0) {
					const top = containerStack.pop();
					if (top?.kind === 'fragment') break;
				}
				currentFragmentLabel = undefined;
			} else {
				activityNodes.push({
					id: `act-${activityNodes.length + 1}`,
					kind: 'stop',
					label: 'End',
					yesActions: [],
					noActions: [],
					forkBranches: [],
					subLines: []
				});
			}
			continue;
		}

		// Timing diagram declarations & statements
		const timingDeclMatch = trimmed.match(
			/^(robust|concise)\s+"([^"]+)"\s+as\s+([A-Za-z0-9_.-]+)$/i
		);
		if (timingDeclMatch) {
			const kind = timingDeclMatch[1].toLowerCase() as 'robust' | 'concise';
			const label = timingDeclMatch[2];
			const id = timingDeclMatch[3];
			timingTracksMap.set(id, {
				id,
				label,
				kind,
				states: [],
				events: []
			});
			ensureNode(id, label, kind);
			continue;
		}

		const tickMatch = trimmed.match(/^@([0-9A-Za-z_.:+-]+)(?:\s+as\s+:[A-Za-z0-9_]+)?$/);
		if (tickMatch) {
			currentTimingTick = tickMatch[1];
			timingTicksSet.add(currentTimingTick);
			continue;
		}

		const timingStateMatch = trimmed.match(
			/^([A-Za-z0-9_.-]+)\s+is\s+([^\s:]+|"[^"]+")(?:\s*:\s*(.+))?$/i
		);
		if (
			timingStateMatch &&
			(timingTracksMap.has(timingStateMatch[1]) || expectedType === 'timing')
		) {
			const trackId = timingStateMatch[1];
			const stateName = cleanQuotes(timingStateMatch[2]);
			const comment = timingStateMatch[3]?.trim();
			let track = timingTracksMap.get(trackId);
			if (!track) {
				track = {
					id: trackId,
					label: trackId,
					kind: 'robust',
					states: [],
					events: []
				};
				timingTracksMap.set(trackId, track);
			}
			if (!track.states.includes(stateName)) {
				track.states.push(stateName);
			}
			timingTicksSet.add(currentTimingTick);
			const numericTick = Number.parseFloat(currentTimingTick.replace(/[^0-9.]/g, '')) || 0;
			track.events.push({
				tick: currentTimingTick,
				tickNumber: numericTick,
				state: stateName,
				comment
			});
			continue;
		}

		const timingConstraintMatch = trimmed.match(
			/^(?:([A-Za-z0-9_.-]+))?@([0-9A-Za-z_.:+-]+)\s*<->\s*@([0-9A-Za-z_.:+-]+)\s*:\s*(.+)$/
		);
		if (timingConstraintMatch) {
			timingConstraints.push({
				participantId: timingConstraintMatch[1] || undefined,
				fromTick: timingConstraintMatch[2],
				toTick: timingConstraintMatch[3],
				label: cleanQuotes(timingConstraintMatch[4])
			});
			continue;
		}

		// Activity diagram constructs
		const swimlaneMatch = trimmed.match(/^\|([^|]+)\|$/);
		if (swimlaneMatch) {
			currentPartition = swimlaneMatch[1].trim();
			continue;
		}

		const partitionMatch = trimmed.match(
			/^partition\s+(?:"([^"]+)"|([^\s{]+))(?:\s*<<([^>]+)>>)?\s*\{?$/i
		);
		if (partitionMatch) {
			const partLabel = cleanQuotes(partitionMatch[1] || partitionMatch[2]);
			const stereo = partitionMatch[3]?.trim();
			currentPartition = partLabel;
			if (trimmed.endsWith('{')) {
				containerStack.push({ id: partLabel, kind: 'partition', label: partLabel });
			}
			if (
				expectedType === 'interaction-overview' ||
				/^ref\b|^sd\b/i.test(partLabel) ||
				stereo === 'ref' ||
				stereo === 'sd'
			) {
				const frameNode: ParsedActivityNode = {
					id: `ref-${activityNodes.length + 1}`,
					kind: 'ref-frame',
					label: partLabel,
					partition: currentPartition,
					stereotype: stereo || (/^sd\b/i.test(partLabel) ? 'sd' : 'ref'),
					yesActions: [],
					noActions: [],
					forkBranches: [],
					subLines: []
				};
				activityNodes.push(frameNode);
				activeRefFrame = frameNode;
			}
			continue;
		}

		if (/^start$/i.test(trimmed)) {
			activityNodes.push({
				id: `act-${activityNodes.length + 1}`,
				kind: 'start',
				label: 'Start',
				partition: currentPartition,
				yesActions: [],
				noActions: [],
				forkBranches: [],
				subLines: []
			});
			continue;
		}

		if (/^stop$/i.test(trimmed)) {
			activityNodes.push({
				id: `act-${activityNodes.length + 1}`,
				kind: 'stop',
				label: 'Stop',
				partition: currentPartition,
				yesActions: [],
				noActions: [],
				forkBranches: [],
				subLines: []
			});
			continue;
		}

		const ifMatch = trimmed.match(/^if\s*\(([^)]+)\)\s*then\s*(?:\(([^)]*)\))?$/i);
		if (ifMatch) {
			activeDecision = {
				id: `dec-${activityNodes.length + 1}`,
				kind: 'decision',
				label: ifMatch[1].trim(),
				partition: currentPartition,
				yesLabel: ifMatch[2]?.trim() || 'yes',
				noLabel: 'no',
				yesActions: [],
				noActions: [],
				forkBranches: [],
				subLines: []
			};
			activeDecisionBranch = 'yes';
			activityNodes.push(activeDecision);
			continue;
		}

		const elseMatch = trimmed.match(/^(?:else|elseif\s*\([^)]*\)\s*then)\s*(?:\(([^)]*)\))?$/i);
		if (elseMatch && activeDecision) {
			activeDecisionBranch = 'no';
			if (elseMatch[1]) {
				activeDecision.noLabel = elseMatch[1].trim();
			}
			continue;
		}

		if (/^endif$/i.test(trimmed)) {
			activeDecision = null;
			continue;
		}

		if (/^fork$/i.test(trimmed)) {
			activeFork = {
				id: `fork-${activityNodes.length + 1}`,
				kind: 'fork',
				label: 'Concurrent execution',
				partition: currentPartition,
				yesActions: [],
				noActions: [],
				forkBranches: [[]],
				subLines: []
			};
			activityNodes.push(activeFork);
			continue;
		}

		if (/^fork\s+again$/i.test(trimmed) && activeFork) {
			activeFork.forkBranches.push([]);
			continue;
		}

		if (/^end\s+(?:fork|merge)$/i.test(trimmed)) {
			activeFork = null;
			continue;
		}

		const actionMatch = trimmed.match(/^:(.+);$/);
		if (actionMatch) {
			const actionLabel = actionMatch[1].trim();
			if (activeRefFrame) {
				activeRefFrame.subLines.push(actionLabel);
			} else if (activeFork && activeFork.forkBranches.length > 0) {
				activeFork.forkBranches[activeFork.forkBranches.length - 1].push(actionLabel);
			} else if (activeDecision) {
				if (activeDecisionBranch === 'yes') {
					activeDecision.yesActions.push(actionLabel);
				} else {
					activeDecision.noActions.push(actionLabel);
				}
			} else {
				activityNodes.push({
					id: `act-${activityNodes.length + 1}`,
					kind: /^ref\s*:|^sd\s*:/i.test(actionLabel) ? 'ref-frame' : 'action',
					label: actionLabel,
					partition: currentPartition,
					yesActions: [],
					noActions: [],
					forkBranches: [],
					subLines: []
				});
			}
			continue;
		}

		// Ports (composite structure)
		const portMatch = trimmed.match(
			/^(portin|portout|port)\s+(?:"([^"]+)"\s+as\s+([A-Za-z0-9_.-]+)|"([^"]+)"|([A-Za-z0-9_.-]+))(?:\s*<<([^>]+)>>)?$/i
		);
		if (portMatch) {
			const kind = portMatch[1].toLowerCase() === 'portout' ? 'portout' : 'portin';
			const label = portMatch[2] || portMatch[4] || portMatch[5];
			const id = portMatch[3] || portMatch[5] || portMatch[4];
			const stereo = portMatch[6]?.trim();
			const parentContainer = [...containerStack].reverse().find((c) => c.kind === 'node');
			ensureNode(id, label, kind, stereo, parentContainer?.id);
			continue;
		}

		// Classifier / Package / Node / Actor / State / Participant declarations
		const declMatch = trimmed.match(
			/^(?:abstract\s+)?(class|interface|enum|object|package|namespace|component|node|device|database|cloud|executionEnvironment|frame|folder|rectangle|artifact|actor|usecase|state|participant|boundary|control|entity|agent)\s+(?:"([^"]+)"\s+as\s+([A-Za-z0-9_.-]+)|([A-Za-z0-9_.-]+)\s+as\s+"([^"]+)"|"([^"]+)"|([A-Za-z0-9_.:-]+))(?:\s*<<([^>]+)>>)?(?:\s*:\s*(.+))?\s*(\{)?$/i
		);
		if (declMatch) {
			const rawKind = declMatch[1].toLowerCase();
			const label =
				declMatch[2] || declMatch[5] || declMatch[6] || declMatch[7] || declMatch[4] || 'Element';
			const id =
				declMatch[3] || declMatch[4] || declMatch[7] || declMatch[6] || declMatch[2] || 'Element';
			const stereo = declMatch[8]?.trim();
			const inlineDesc = declMatch[9]?.trim();
			const opensBlock = Boolean(declMatch[10]);

			let mappedKind: ParsedUmlNode['kind'] = 'class';
			if (rawKind === 'interface') mappedKind = 'interface';
			else if (rawKind === 'object') mappedKind = 'object';
			else if (
				rawKind === 'package' ||
				rawKind === 'namespace' ||
				rawKind === 'folder' ||
				rawKind === 'frame'
			)
				mappedKind = 'package';
			else if (rawKind === 'component') mappedKind = 'component';
			else if (rawKind === 'node') mappedKind = 'node';
			else if (rawKind === 'device') mappedKind = 'device';
			else if (rawKind === 'database') mappedKind = 'database';
			else if (rawKind === 'cloud') mappedKind = 'cloud';
			else if (rawKind === 'executionenvironment') mappedKind = 'executionEnvironment';
			else if (rawKind === 'rectangle') mappedKind = 'rectangle';
			else if (rawKind === 'artifact') mappedKind = 'artifact';
			else if (rawKind === 'actor') mappedKind = 'actor';
			else if (rawKind === 'usecase') mappedKind = 'usecase';
			else if (rawKind === 'state') mappedKind = 'state';
			else if (rawKind === 'agent') mappedKind = 'agent';
			else if (
				rawKind === 'participant' ||
				rawKind === 'boundary' ||
				rawKind === 'control' ||
				rawKind === 'entity'
			) {
				mappedKind = 'participant';
			}

			const parentContainer = [...containerStack].reverse().find((c) => c.kind === 'node');
			const node = ensureNode(id, label, mappedKind, stereo, parentContainer?.id);
			if (inlineDesc) {
				node.descriptionLines.push(inlineDesc);
			}
			if (opensBlock) {
				containerStack.push({ id: node.id, kind: 'node' });
			}
			continue;
		}

		// Bracketed component [Component] or interface () "Interface" or usecase (Use Case) or :Actor:
		const shorthandCompMatch = trimmed.match(
			/^(?:\[([^\]]+)\]|\(\)\s*"([^"]+)"|\(\)\s*([A-Za-z0-9_.-]+)|\(([^)]+)\)|:([^:]+):)(?:\s+as\s+([A-Za-z0-9_.-]+))?(?:\s*<<([^>]+)>>)?\s*(\{)?$/
		);
		if (
			shorthandCompMatch &&
			!trimmed.includes('--') &&
			!trimmed.includes('..') &&
			!trimmed.includes('->')
		) {
			const compLabel = shorthandCompMatch[1];
			const ifaceLabel = shorthandCompMatch[2] || shorthandCompMatch[3];
			const ucLabel = shorthandCompMatch[4];
			const actorLabel = shorthandCompMatch[5];
			const alias = shorthandCompMatch[6];
			const stereo = shorthandCompMatch[7]?.trim();
			const opensBlock = Boolean(shorthandCompMatch[8]);

			const label = compLabel || ifaceLabel || ucLabel || actorLabel || 'Element';
			const id = alias || label;
			const kind: ParsedUmlNode['kind'] = compLabel
				? 'component'
				: ifaceLabel
					? 'interface'
					: ucLabel
						? 'usecase'
						: 'actor';
			const parentContainer = [...containerStack].reverse().find((c) => c.kind === 'node');
			const node = ensureNode(id, label, kind, stereo, parentContainer?.id);
			if (opensBlock) {
				containerStack.push({ id: node.id, kind: 'node' });
			}
			continue;
		}

		// Relationships, Transitions, Links, and Sequence Messages
		const relMatch = trimmed.match(
			/^(\[\*\]|\[[^\]]+\]|\([^)]+\)|:[^:]+:|"[^"]+"|[A-Za-z0-9_.:-]+)(?:\s+"([^"]+)")?\s+([<|o*().>-]+(?:up|down|left|right|u|d|l|r)?[<|o*().>-]+|--|\.\.)\s+(?:"([^"]+)"\s+)?(\[\*\]|\[[^\]]+\]|\([^)]+\)|:[^:]+:|"[^"]+"|[A-Za-z0-9_.:-]+)(?:\s*:\s*(.+))?$/i
		);
		if (relMatch) {
			const rawFrom = relMatch[1];
			const fromMult = relMatch[2]?.trim();
			const arrow = relMatch[3].trim();
			const toMult = relMatch[4]?.trim();
			const rawTo = relMatch[5];
			const rawLabel = relMatch[6]?.trim() ?? '';

			if (activeRefFrame) {
				activeRefFrame.subLines.push(
					`${cleanQuotes(rawFrom)} -> ${cleanQuotes(rawTo)}: ${rawLabel}`
				);
				continue;
			}

			const fromId = rawFrom === '[*]' ? '[*]' : normalizeId(rawFrom);
			const toId = rawTo === '[*]' ? '[*]' : normalizeId(rawTo);

			const parentContainer = [...containerStack].reverse().find((c) => c.kind === 'node');

			if (fromId !== '[*]' && !nodesMap.has(fromId)) {
				const inferredKind: ParsedUmlNode['kind'] = rawFrom.startsWith('[')
					? 'component'
					: rawFrom.startsWith('(')
						? 'usecase'
						: rawFrom.startsWith(':')
							? 'actor'
							: expectedType === 'state-machine'
								? 'state'
								: expectedType === 'sequence'
									? 'participant'
									: expectedType === 'communication'
										? 'agent'
										: 'class';
				ensureNode(fromId, rawFrom, inferredKind, undefined, parentContainer?.id);
			}
			if (toId !== '[*]' && !nodesMap.has(toId)) {
				const inferredKind: ParsedUmlNode['kind'] = rawTo.startsWith('[')
					? 'component'
					: rawTo.startsWith('(')
						? 'usecase'
						: rawTo.startsWith(':')
							? 'actor'
							: arrow.includes('()')
								? 'interface'
								: expectedType === 'state-machine'
									? 'state'
									: expectedType === 'sequence'
										? 'participant'
										: expectedType === 'communication'
											? 'agent'
											: 'class';
				ensureNode(toId, rawTo, inferredKind, undefined, parentContainer?.id);
			}

			const stereoInLabel = rawLabel.match(/<<([^>]+)>>|«([^»]+)»/);
			const cleanLabel = rawLabel.replace(/<<[^>]+>>|«[^»]+»/g, '').trim();

			relations.push({
				from: fromId,
				to: toId,
				arrow,
				kind: classifyArrow(arrow, rawLabel),
				label: cleanLabel,
				stereotype: stereoInLabel ? (stereoInLabel[1] || stereoInLabel[2]).trim() : undefined,
				fromMultiplicity: fromMult,
				toMultiplicity: toMult,
				fragmentLabel: currentFragmentLabel
			});
			continue;
		}

		// External member or state/object slot assignment: `NodeId : member`
		const externalMemberMatch = trimmed.match(/^([A-Za-z0-9_.-]+)\s*:\s*(.+)$/);
		if (externalMemberMatch) {
			const targetId = externalMemberMatch[1];
			const memberText = externalMemberMatch[2].trim();
			const node = ensureNode(
				targetId,
				targetId,
				expectedType === 'state-machine' ? 'state' : expectedType === 'object' ? 'object' : 'class'
			);
			const eqIdx = memberText.indexOf('=');
			if (node.kind === 'object' && eqIdx > 0) {
				node.slots.push({
					key: memberText.slice(0, eqIdx).trim(),
					value: cleanQuotes(memberText.slice(eqIdx + 1).trim())
				});
			} else if (node.kind === 'state') {
				node.descriptionLines.push(memberText);
			} else if (memberText.includes('(') && memberText.includes(')')) {
				node.operations.push(memberText);
			} else {
				node.attributes.push(memberText);
			}
			continue;
		}

		// Inside a class/object/state/package block
		const activeContainer = [...containerStack].reverse().find((c) => c.kind === 'node');
		if (activeContainer) {
			const owner = nodesMap.get(activeContainer.id);
			if (owner) {
				if (/^(--|==|\.\.|__)/.test(trimmed)) {
					continue;
				}
				const slotMatch = trimmed.match(/^([A-Za-z0-9_.\s-]+)\s*=\s*(.+)$/);
				if (slotMatch && (owner.kind === 'object' || expectedType === 'object')) {
					owner.slots.push({
						key: slotMatch[1].trim(),
						value: cleanQuotes(slotMatch[2].trim())
					});
					continue;
				}
				if (/^[+#~-]?\s*[A-Za-z0-9_].*\(.*\)/.test(trimmed) || trimmed.endsWith('()')) {
					owner.operations.push(trimmed);
					continue;
				}
				if (
					/^[+#~-]?\s*[A-Za-z0-9_[\]\s]+(?:\s*:\s*.+)?$/.test(trimmed) ||
					trimmed.startsWith('{')
				) {
					owner.attributes.push(trimmed);
					continue;
				}
			}
		}

		// Unrecognized syntax line
		errors.push({
			line: lineNum,
			message: `Unrecognized or malformed PlantUML statement: "${trimmed.slice(0, 72)}"`,
			snippet: trimmed
		});
	}

	if (activeMultiLineNote) {
		errors.push({
			line: activeMultiLineNote.startLine,
			message: 'Unclosed multi-line note block (missing "end note").',
			snippet: 'note ...'
		});
	}

	const unclosedContainers = containerStack.filter(
		(c) => c.kind === 'node' || c.kind === 'partition'
	);
	if (unclosedContainers.length > 0) {
		errors.push({
			line: rawLines.length,
			message: `Unclosed block for "${unclosedContainers[unclosedContainers.length - 1].id}" (missing closing "}").`,
			snippet: '}'
		});
	}

	const hasAnyContent =
		nodesMap.size > 0 ||
		relations.length > 0 ||
		activityNodes.length > 0 ||
		timingTracksMap.size > 0;

	if (!hasAnyContent && errors.length === 0) {
		errors.push({
			line: 1,
			message:
				'Diagram contains no renderable UML elements, relationships, actions, or timing tracks.',
			snippet: ''
		});
	}

	// Infer diagram type if needed
	let inferredType: UmlDiagramType = expectedType;
	if (timingTracksMap.size > 0) {
		inferredType = 'timing';
	} else if (activityNodes.some((n) => n.kind === 'ref-frame')) {
		inferredType = 'interaction-overview';
	} else if (activityNodes.length > 0) {
		inferredType = 'activity';
	}

	return {
		valid: errors.length === 0 && security.safe && hasAnyContent,
		inferredType,
		title,
		caption,
		nodes: [...nodesMap.values()],
		relations,
		activityNodes,
		timingTracks: [...timingTracksMap.values()],
		timingTicks: [...timingTicksSet.values()],
		timingConstraints,
		notes,
		errors,
		securityViolations: security.violations
	};
}
