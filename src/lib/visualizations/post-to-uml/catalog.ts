import {
	ALL_UML_DIAGRAM_TYPES,
	BEHAVIORAL_DIAGRAM_TYPES,
	INTERACTION_DIAGRAM_TYPES,
	STRUCTURAL_DIAGRAM_TYPES,
	type UmlDiagramType,
	type UmlDiagramTypeMeta,
	type UmlFamilyFilter
} from './types';

export interface UmlFamilyGroupDescriptor {
	id: UmlFamilyFilter;
	label: string;
	description: string;
	types: readonly UmlDiagramType[];
}

export const UML_FAMILY_GROUPS: readonly UmlFamilyGroupDescriptor[] = [
	{
		id: 'all',
		label: 'All 14 UML types',
		description: 'Every concrete UML 2.5 diagram type across Structural and Behavioral families.',
		types: ALL_UML_DIAGRAM_TYPES
	},
	{
		id: 'structural',
		label: 'Structural diagram (7)',
		description:
			'Static anatomy: classes, object instances, packages, components, internal composite parts, deployment nodes, and UML profile extensions.',
		types: STRUCTURAL_DIAGRAM_TYPES
	},
	{
		id: 'behavioral',
		label: 'Behavioral diagram (7)',
		description:
			'Dynamic behavior: actor use cases, activity workflows, state machines, and the four interaction diagrams.',
		types: BEHAVIORAL_DIAGRAM_TYPES
	},
	{
		id: 'interaction',
		label: 'Interaction diagram (4 · within Behavioral)',
		description:
			'Message exchange, participant links, control flow between interactions, and state/value changes along a time axis.',
		types: INTERACTION_DIAGRAM_TYPES
	}
] as const;

export const UML_DIAGRAM_CATALOG: Record<UmlDiagramType, UmlDiagramTypeMeta> = {
	class: {
		type: 'class',
		number: 1,
		label: 'Class Diagram',
		shortLabel: 'Class',
		family: 'structural',
		familyBadge: 'Structural',
		summary: 'Classes or conceptual entities, relevant properties, operations, and relationships.',
		readerValue:
			'Clarifies the core domain concepts or classifiers, their attributes, responsibilities, and structural relationships.',
		requiredEvidence: [
			'Named domain concepts, entities, or classes',
			'Relationships, properties, or responsibilities connecting those concepts'
		],
		disambiguationNote:
			'Represents general classifiers or conceptual domain entities—not point-in-time instances or runtime message order.',
		rendererSupport: 'native',
		rendererNotes:
			'PlantUML TeaVM 1.2026.9 / Smetana: class notation (`class`, stereotypes, attributes/operations compartments, `--|>`, `*--`, `o--`, `-->`, `..>`).',
		notationLimitations: [],
		legend: [
			{
				symbol: '[Class | attrs | ops]',
				label: 'Classifier box',
				meaning: 'Three-compartment box showing entity name/stereotype, attributes, and operations.'
			},
			{
				symbol: 'A *-- B / A o-- B',
				label: 'Composition / Aggregation',
				meaning:
					'Filled diamond shows strong lifecycle ownership; hollow diamond shows shared containment.'
			},
			{
				symbol: 'A --|> B',
				label: 'Generalization',
				meaning: 'Hollow triangle arrow pointing to the superclass or general concept.'
			},
			{
				symbol: 'A --> B',
				label: 'Directed Association',
				meaning: 'Structural link or conceptual reference between two classifiers.'
			}
		]
	},
	object: {
		type: 'object',
		number: 2,
		label: 'Object Diagram',
		shortLabel: 'Object',
		family: 'structural',
		familyBadge: 'Structural',
		summary: 'Particular instances, their values, and links at a particular point.',
		readerValue:
			'Shows a concrete snapshot of named instances and their slot values at a specific moment or example scenario.',
		requiredEvidence: [
			'Concrete examples, named instances, concrete records, or point-in-time attribute values'
		],
		disambiguationNote:
			'Shows specific instances (`instanceName : Classifier` underlined) with concrete slot values, not abstract class definitions.',
		rendererSupport: 'native',
		rendererNotes:
			'Native PlantUML `object "instance : Classifier" as id` notation with underlined instance headers, `slot = value` rows, and instance links.',
		notationLimitations: [],
		legend: [
			{
				symbol: '<u>inst : Class</u>',
				label: 'Instance specification',
				meaning: 'Underlined header naming a specific instance and the classifier it instantiates.'
			},
			{
				symbol: 'field = "value"',
				label: 'Slot value',
				meaning: 'Concrete value held by an attribute at the snapshot moment.'
			},
			{
				symbol: 'instA -- instB',
				label: 'Object link',
				meaning: 'An active instance-level connection (an instance of a class association).'
			}
		]
	},
	package: {
		type: 'package',
		number: 3,
		label: 'Package Diagram',
		shortLabel: 'Package',
		family: 'structural',
		familyBadge: 'Structural',
		summary: 'Packages, grouping, and dependencies.',
		readerValue:
			'Organizes concepts, modules, or thematic domains into high-level namespaces and exposes cross-group dependencies.',
		requiredEvidence: [
			'Logical groupings, subsystems, layers, domains, or thematic sections with inter-group relationships'
		],
		disambiguationNote:
			'Focuses on namespace grouping and `..>` dependency arrows between groups rather than low-level method signatures.',
		rendererSupport: 'native',
		rendererNotes:
			'Native PlantUML `package "Name" { ... }` tabbed folder notation with member classifiers and dashed dependency arrows (`..>`).',
		notationLimitations: [],
		legend: [
			{
				symbol: '[Tab] Package',
				label: 'Package folder',
				meaning: 'Tabbed container grouping related classifiers, modules, or conceptual domains.'
			},
			{
				symbol: 'PkgA ..> PkgB : «import/use»',
				label: 'Package dependency',
				meaning:
					'Dashed open arrow indicating that changes in the target package can affect the source.'
			}
		]
	},
	component: {
		type: 'component',
		number: 4,
		label: 'Component Diagram',
		shortLabel: 'Component',
		family: 'structural',
		familyBadge: 'Structural',
		summary: 'Components, interfaces, and dependencies.',
		readerValue:
			'Maps modular subsystems, the interfaces they provide or require, and how components wire together.',
		requiredEvidence: [
			'Modular subsystems, services, functional units, or conceptual roles that expose and consume interfaces/contracts'
		],
		disambiguationNote:
			'Emphasizes replaceable modular boundaries and provided/required interfaces (`() Interface`), distinct from physical hardware nodes.',
		rendererSupport: 'native',
		rendererNotes:
			'Native PlantUML `component` (`[Component]`) and `interface` (`() "Interface"`) notation with provided lollipop interfaces and explicit usage dependencies (`..>`). A dependency is not a required-interface socket.',
		notationLimitations: [],
		legend: [
			{
				symbol: '[Component ⧉]',
				label: 'Component',
				meaning: 'Encapsulated modular unit with a two-tab component glyph.'
			},
			{
				symbol: '──○ Interface',
				label: 'Provided interface (lollipop)',
				meaning: 'Contract or capability exposed by a component for others to use.'
			},
			{
				symbol: '┈┈( Interface',
				label: 'Required interface (socket)',
				meaning: 'Contract or capability that a component depends on to operate.'
			}
		]
	},
	'composite-structure': {
		type: 'composite-structure',
		number: 5,
		label: 'Composite Structure Diagram',
		shortLabel: 'Composite Structure',
		family: 'structural',
		familyBadge: 'Structural',
		summary: 'Internal parts, roles, ports, and connectors within a containing classifier.',
		readerValue:
			'Opens up a single enclosing system or classifier to show its internal parts, boundary ports, and internal wiring.',
		requiredEvidence: [
			'A containing system or classifier with internal collaborating parts/roles, boundary ports, or internal channels'
		],
		disambiguationNote:
			'Shows internal decomposition (`part : Role [multiplicity]`), boundary `portin`/`portout` squares, and delegation/assembly connectors inside one enclosing classifier.',
		rendererSupport: 'composed',
		rendererNotes:
			'Composed PlantUML enclosing `component`/`class` block using `portin`, `portout`, internal `[part : Role [mult]]` declarations, and labeled `«delegation»` / `«assembly»` connectors; rendered with UML 2.5 boundary port squares and internal role boxes.',
		notationLimitations: [
			'PlantUML models composite structures via composed nested component/port syntax (`portin`/`portout` + internal role rectangles); collaboration-use dashed ellipses are approximated as stereotyped internal part boxes.'
		],
		legend: [
			{
				symbol: '┌─■ port ─┐',
				label: 'Boundary port',
				meaning: 'Square interaction point mounted on the boundary of the containing classifier.'
			},
			{
				symbol: '[partName : RoleType [1]]',
				label: 'Internal part',
				meaning: 'A role-bound internal element owned by the enclosing classifier.'
			},
			{
				symbol: 'port ──> part («delegation»)',
				label: 'Delegation / Assembly connector',
				meaning: 'Internal channel forwarding boundary port traffic or linking two internal parts.'
			}
		]
	},
	deployment: {
		type: 'deployment',
		number: 6,
		label: 'Deployment Diagram',
		shortLabel: 'Deployment',
		family: 'structural',
		familyBadge: 'Structural',
		summary: 'Execution nodes, deployed artifacts, and their relationships.',
		readerValue:
			'Illustrates physical or runtime execution environments, where concrete artifacts live, and communication paths between nodes.',
		requiredEvidence: [
			'Runtime hosts, environments, servers, devices, clinics, institutions, or physical/cloud nodes and the artifacts or documents deployed on them'
		],
		disambiguationNote:
			'Maps execution nodes (3D boxes) and deployed artifacts (`artifact`), never invented cloud vendors unless stated in the text.',
		rendererSupport: 'native',
		rendererNotes:
			'Native PlantUML `node`, `device`, `database`, `cloud`, and `artifact` notation with 3D node frames and stereotyped communication paths.',
		notationLimitations: [],
		legend: [
			{
				symbol: '立方 Node / Device',
				label: 'Execution node (3D box)',
				meaning: 'Physical device, institution, or runtime execution environment.'
			},
			{
				symbol: '[📄 Artifact]',
				label: 'Deployed artifact',
				meaning: 'Executable bundle, record, schema, or document manifested inside a node.'
			},
			{
				symbol: 'NodeA ── NodeB : «protocol»',
				label: 'Communication path',
				meaning: 'Channel or transport link over which nodes exchange artifacts or messages.'
			}
		]
	},
	profile: {
		type: 'profile',
		number: 7,
		label: 'Profile Diagram',
		shortLabel: 'Profile',
		family: 'structural',
		familyBadge: 'Structural',
		summary: 'UML stereotypes, metaclasses, extension relationships, and relevant constraints.',
		readerValue:
			'Defines the domain-specific vocabulary extension: how custom stereotypes and tagged values extend standard UML metaclasses.',
		requiredEvidence: [
			'Domain classifications, specialized categories/roles, policy rules, or metadata tags that extend base concepts'
		],
		disambiguationNote:
			'A UML Profile diagram is a metamodel extension (`«profile»`, `«metaclass»`, `«stereotype»`, and filled-triangle extension arrows)—never a biographical or user profile.',
		rendererSupport: 'composed',
		rendererNotes:
			'Composed PlantUML `package "Name" <<profile>>` containing `class ... <<metaclass>>`, `class ... <<stereotype>>`, filled-triangle extension arrows (`-up->>` with `<<extension>>`), and constraint `note` blocks; rendered with UML 2.5 filled-triangle metaclass extension arrows.',
		notationLimitations: [
			'PlantUML uses stereotyped class declarations (`<<metaclass>>`, `<<stereotype>>`) inside a `<<profile>>` package; the verified `-up->>` relation draws a filled triangular arrow toward the metaclass.'
		],
		legend: [
			{
				symbol: '«metaclass» Class',
				label: 'UML Metaclass',
				meaning:
					'Standard UML metamodel element being extended (e.g., Class, Component, Action, State).'
			},
			{
				symbol: '«stereotype» DomainTag',
				label: 'Stereotype with tags',
				meaning: 'Domain-specific classification adding custom tagged values and semantics.'
			},
			{
				symbol: 'Stereotype ──▶ Metaclass',
				label: 'Extension relationship',
				meaning:
					'Solid line with a filled black arrowhead pointing from the stereotype to the metaclass it extends.'
			},
			{
				symbol: '{constraint}',
				label: 'Profile constraint',
				meaning: 'Rule or invariant governing elements marked with the stereotype.'
			}
		]
	},
	'use-case': {
		type: 'use-case',
		number: 8,
		label: 'Use Case Diagram',
		shortLabel: 'Use Case',
		family: 'behavioral',
		familyBadge: 'Behavioral',
		summary: 'Actors, goals, use cases, and the system boundary.',
		readerValue:
			'Shows who interacts with the system or subject, what goals they pursue, and where the system boundary lies.',
		requiredEvidence: [
			'Human, organizational, or external actors and the goals or actions they perform with the subject'
		],
		disambiguationNote:
			'Captures external actors and high-level goals inside a system boundary (`rectangle`), not internal step-by-step control flow.',
		rendererSupport: 'native',
		rendererNotes:
			'Native PlantUML `actor`, `rectangle "System Boundary"`, `(Use Case)` ovals, actor associations, and `<<include>>` / `<<extend>>` dashed arrows.',
		notationLimitations: [],
		legend: [
			{
				symbol: '웃 Actor',
				label: 'Actor',
				meaning: 'External person, organization, or system interacting with the subject.'
			},
			{
				symbol: '( Use Case )',
				label: 'Use case oval',
				meaning: 'A coherent goal or capability delivered inside the system boundary.'
			},
			{
				symbol: 'UC1 ..> UC2 : «include»',
				label: 'Include / Extend',
				meaning: 'Mandatory sub-goal (`«include»`) or conditional extension (`«extend»`).'
			}
		]
	},
	activity: {
		type: 'activity',
		number: 9,
		label: 'Activity Diagram',
		shortLabel: 'Activity',
		family: 'behavioral',
		familyBadge: 'Behavioral',
		summary: 'Actions, decisions, branches, loops, and parallel work.',
		readerValue:
			'Traces the step-by-step procedural flow, decision conditions, parallel forks, and outcomes described in the text.',
		requiredEvidence: [
			'Sequential steps, procedural actions, causal chains, conditional branches, or parallel workflows'
		],
		disambiguationNote:
			'Models procedural control/object flow (`start`, `:Action;`, `if/then/else`, `fork/end fork`, `stop`), distinct from state lifecycles.',
		rendererSupport: 'native',
		rendererNotes:
			'Native PlantUML modern activity syntax (`start`, `:Action;`, `if (...) then (...) else (...) endif`, `fork ... fork again ... end fork`, `stop`, and `partition` swimlanes).',
		notationLimitations: [],
		legend: [
			{
				symbol: '● ──> ( Action ) ──> ◉',
				label: 'Initial / Action / Final',
				meaning:
					'Filled circle starts the flow; rounded pill performs an action; bullseye ends the activity.'
			},
			{
				symbol: '◇ Decision / Merge',
				label: 'Decision diamond',
				meaning: 'Conditional branch guarded by `[yes]` / `[no]` predicates.'
			},
			{
				symbol: '▬▬▬ Fork / Join bar',
				label: 'Synchronization bar',
				meaning: 'Thick bar splitting work into concurrent branches or joining them back together.'
			}
		]
	},
	'state-machine': {
		type: 'state-machine',
		number: 10,
		label: 'State Machine Diagram',
		shortLabel: 'State Machine',
		family: 'behavioral',
		familyBadge: 'Behavioral',
		summary:
			'States and transitions, with triggers, guards, and effects where supported by the text.',
		readerValue:
			'Follows how a single entity, case, or system transitions through discrete lifecycle states in response to events.',
		requiredEvidence: [
			'Distinct lifecycle conditions, phases, statuses, or modes and the events/conditions that trigger transitions'
		],
		disambiguationNote:
			'Models discrete states in which an entity rests (`[*] --> StateA`) and event-driven transitions (`trigger [guard] / effect`), not general multi-actor task steps.',
		rendererSupport: 'native',
		rendererNotes:
			'Native PlantUML `[*]` initial/final pseudostates, `state "Name" as id : entry / do`, and `StateA --> StateB : trigger [guard] / effect` transitions.',
		notationLimitations: [],
		legend: [
			{
				symbol: '● ──> [ State ] ──> ◉',
				label: 'Pseudostates & State',
				meaning:
					'Initial dot enters the starting state; rounded box holds state invariants and entry/do activities.'
			},
			{
				symbol: 'S1 ──> S2 : trigger [guard] / effect',
				label: 'State transition',
				meaning: 'Event trigger, boolean guard condition in brackets, and resulting effect action.'
			}
		]
	},
	sequence: {
		type: 'sequence',
		number: 11,
		label: 'Sequence Diagram',
		shortLabel: 'Sequence',
		family: 'behavioral',
		subfamily: 'interaction',
		familyBadge: 'Behavioral · Interaction',
		summary: 'Participants and the order of messages between them.',
		readerValue:
			'Unfolds the chronological exchange of requests, handoffs, and replies across vertical participant lifelines.',
		requiredEvidence: [
			'Two or more interacting participants (actors, systems, or concepts) and an ordered exchange of messages or events'
		],
		disambiguationNote:
			'Arranges interactions chronologically from top to bottom along vertical dashed lifelines (`->`, `-->`, `alt`/`loop`).',
		rendererSupport: 'native',
		rendererNotes:
			'Native PlantUML `participant`/`actor` lifelines, synchronous (`->`) and reply (`-->`) arrows, activation bars, and `alt`/`loop`/`opt` interaction frames.',
		notationLimitations: [],
		legend: [
			{
				symbol: '[Participant] ¦',
				label: 'Lifeline',
				meaning:
					'Participant header with a vertical dashed line representing time progressing downward.'
			},
			{
				symbol: 'A ───▶ B : message()',
				label: 'Synchronous message',
				meaning: 'Request or signal sent from one lifeline to another.'
			},
			{
				symbol: 'B ┈┈┈> A : reply',
				label: 'Return / Reply message',
				meaning: 'Dashed arrow returning a result or acknowledgment.'
			}
		]
	},
	communication: {
		type: 'communication',
		number: 12,
		label: 'Communication Diagram',
		shortLabel: 'Communication',
		family: 'behavioral',
		subfamily: 'interaction',
		familyBadge: 'Behavioral · Interaction',
		summary: 'Participants, their links, and numbered messages.',
		readerValue:
			'Highlights the structural network of links between collaborating participants while indexing message order with hierarchical sequence numbers.',
		requiredEvidence: [
			'Collaborating participants, structural links between them, and ordered interactions that can be numbered (`1:`, `1.1:`, `2:`)'
		],
		disambiguationNote:
			'A communication diagram is NOT a renamed sequence diagram: it places participants in a structural network graph without vertical time lifelines and orders messages via sequence numbers (`1: msg`, `1.1: submsg`, `2: reply`) along the links.',
		rendererSupport: 'composed',
		rendererNotes:
			'Composed PlantUML participant network (`agent`/`rectangle` nodes with directional link arrows carrying hierarchical sequence numbers `1: ...`, `1.1: ...`, `2: ...`); rendered as a spatial communication network with link lines and directional message callouts.',
		notationLimitations: [
			'PlantUML does not have a separate `@startcommunication` keyword; communication diagrams use spatial object/agent links annotated with hierarchical UML sequence numbers (`1:`, `1.1:`, `2:`) and directional arrows.'
		],
		legend: [
			{
				symbol: '[ :Participant ] ─── [ :Partner ]',
				label: 'Participant link',
				meaning: 'Structural connection over which two participants can exchange messages.'
			},
			{
				symbol: '1: request() → / 1.1: check() →',
				label: 'Numbered message',
				meaning:
					'Hierarchical Dewey-decimal numbering showing call order and nested sub-calls without lifelines.'
			}
		]
	},
	'interaction-overview': {
		type: 'interaction-overview',
		number: 13,
		label: 'Interaction Overview Diagram',
		shortLabel: 'Interaction Overview',
		family: 'behavioral',
		subfamily: 'interaction',
		familyBadge: 'Behavioral · Interaction',
		summary: 'Control flow connecting named interactions or interaction uses.',
		readerValue:
			'Provides a bird’s-eye roadmap of how distinct multi-participant interaction scenarios (`ref` frames) chain, branch, and synchronize.',
		requiredEvidence: [
			'Multiple named interaction phases, episodes, or sub-protocols connected by high-level control flow or branching decisions'
		],
		disambiguationNote:
			'Must explicitly identify the named interactions (`ref` / `sd` interaction frames and their participating lifelines) being connected by activity control nodes.',
		rendererSupport: 'composed',
		rendererNotes:
			'Composed PlantUML activity control skeleton (`start`, `if/else`, `fork`, `stop`) connecting explicitly named interactions (`partition "ref: InteractionName" { :participants -> messages; }`).',
		notationLimitations: [
			'Composed notation: named activity partitions represent interaction uses. Their rectangular headers approximate UML ref/sd frame tabs; embedded actions describe the named interaction, not full nested sequence diagrams.'
		],
		legend: [
			{
				symbol: '┌ref─┐ InteractionName',
				label: 'Interaction Use (`ref`) frame',
				meaning: 'Named interaction use, represented here by a labelled activity partition.'
			},
			{
				symbol: '┌sd──┐ Inline Interaction',
				label: 'Inline interaction (`sd`) frame',
				meaning:
					'Frame showing participating lifelines and summary message exchange for that phase.'
			},
			{
				symbol: '● ──> [ref] ──> ◇ ──> ◉',
				label: 'Control flow between interactions',
				meaning:
					'Activity-style initial, decision, fork/join, and final nodes governing when each interaction runs.'
			}
		]
	},
	timing: {
		type: 'timing',
		number: 14,
		label: 'Timing Diagram',
		shortLabel: 'Timing',
		family: 'behavioral',
		subfamily: 'interaction',
		familyBadge: 'Behavioral · Interaction',
		summary: 'State or value changes along a time axis, with timing constraints where known.',
		readerValue:
			'Plots how participant states or values evolve across a horizontal time axis and highlights durations, deadlines, or latency windows.',
		requiredEvidence: [
			'Explicit durations, timestamps, deadlines, latency windows, or timed state/value changes along a clock axis'
		],
		disambiguationNote:
			'Requires a horizontal time axis (`@0`, `@10`, ...) and state/value waveforms (`robust`/`concise`). If an article describes event order without durations or time ticks, Timing must report "Needs more information" unless illustrative assumptions are explicitly enabled.',
		rendererSupport: 'native',
		rendererNotes:
			'Native PlantUML timing syntax (`robust "Participant" as P`, `concise "Signal" as S`, `@0`, `@10`, `P is State`, and `{t1..t2}` duration constraints).',
		notationLimitations: [],
		legend: [
			{
				symbol: '──┴───┴───┴──> Time',
				label: 'Horizontal time axis',
				meaning: 'Monotonic time ticks or clock intervals progressing from left to right.'
			},
			{
				symbol: '___/‾‾‾‾\\___',
				label: 'Robust state waveform',
				meaning: 'Step-line track showing discrete state transitions at specific time ticks.'
			},
			{
				symbol: '<── {d <= 15m} ──>',
				label: 'Timing / Duration constraint',
				meaning: 'Measured or specified duration bound between two timed events.'
			}
		]
	}
};

export const UML_DIAGRAM_LIST: readonly UmlDiagramTypeMeta[] = ALL_UML_DIAGRAM_TYPES.map(
	(type) => UML_DIAGRAM_CATALOG[type]
);

export function getUmlDiagramMeta(type: UmlDiagramType): UmlDiagramTypeMeta {
	return UML_DIAGRAM_CATALOG[type];
}

export function getDiagramTypesForFilter(filter: UmlFamilyFilter): readonly UmlDiagramType[] {
	switch (filter) {
		case 'structural':
			return STRUCTURAL_DIAGRAM_TYPES;
		case 'behavioral':
			return BEHAVIORAL_DIAGRAM_TYPES;
		case 'interaction':
			return INTERACTION_DIAGRAM_TYPES;
		case 'all':
		default:
			return ALL_UML_DIAGRAM_TYPES;
	}
}
