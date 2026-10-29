import { createBlankProject, validateProject } from './model';
import type { Evidence, StudioNode, StudioProject } from './types';

const branches = [
	{
		id: 'notice',
		label: 'Begin with curiosity',
		color: '#AD6853',
		statement:
			'A useful inquiry starts with a question specific enough to investigate and open enough to change.',
		ideas: [
			[
				'Ask a useful question',
				'A useful question names what is uncertain instead of disguising a preferred answer as a question.'
			],
			[
				'Name your purpose',
				'The purpose of an inquiry might be to understand, compare, explain, decide or design.'
			],
			[
				'Set the boundary',
				'A boundary names the time, place, people and material that an inquiry will cover.'
			],
			[
				'Notice surprises',
				'An observation that does not fit an expectation can become the beginning of a new question.'
			],
			[
				'Keep an open notebook',
				'A notebook can preserve initial questions so that later answers do not erase how the inquiry began.'
			]
		],
		detail: [
			'Make uncertainty visible',
			'Writing “I do not know yet” keeps an unanswered question distinct from a confident conclusion.'
		]
	},
	{
		id: 'gather',
		label: 'Gather with care',
		color: '#588478',
		statement:
			'Gathering material includes recording where it came from, what it covers and what it leaves out.',
		ideas: [
			[
				'Preserve the source',
				'Keep a source passage in its original form so that a later interpretation can be checked against it.'
			],
			[
				'Record the location',
				'A page, paragraph or timestamp makes a claim easier to find in the original material.'
			],
			[
				'Distinguish voices',
				'Separate what a source author says from what a quoted speaker or later reader says.'
			],
			[
				'Mark missing context',
				'An excerpt may omit qualifications that appear elsewhere, so its boundary belongs beside its analysis.'
			],
			[
				'Keep contradictions',
				'Sources that disagree should retain their separate claims and attribution until the disagreement is examined.'
			]
		],
		detail: [
			'A quotation is an anchor',
			'A quotation shows what a source says; it does not by itself establish that the statement is true.'
		]
	},
	{
		id: 'organise',
		label: 'Give ideas a shape',
		color: '#6C7FA2',
		statement:
			'A mind map arranges ideas into a readable hierarchy while a knowledge graph records relationships across that hierarchy.',
		ideas: [
			[
				'Find the central question',
				'The root of a map should give the reader a clear account of the inquiry being explored.'
			],
			[
				'Name the main themes',
				'Major branches should reflect the material rather than a template imposed on every source.'
			],
			[
				'Define concepts in context',
				'A definition should explain how a term is being used in this particular material.'
			],
			[
				'Connect across branches',
				'A cross-link can show that an idea in one branch supports, challenges or depends on an idea elsewhere.'
			],
			[
				'Preserve different meanings',
				'Two passages using the same word can express different concepts and should not be merged merely because their labels match.'
			]
		],
		detail: [
			'Maps are interpretations',
			'Grouping an idea under a heading is an editorial choice, even when the idea itself is directly quoted.'
		]
	},
	{
		id: 'test',
		label: 'Examine the argument',
		color: '#9A7C4B',
		statement:
			'Examining an argument means separating its claims, evidence, assumptions and possible objections.',
		ideas: [
			['Find the claim', 'A claim is a statement the source asks its reader to accept.'],
			[
				'Inspect the support',
				'Support may include observations, measurements, examples, testimony or reasoning; these play different roles.'
			],
			[
				'Surface assumptions',
				'An assumption connects steps in an argument without always being stated directly.'
			],
			[
				'Consider another reading',
				'An alternative interpretation can expose an ambiguity without proving the original interpretation wrong.'
			],
			[
				'Respect causal limits',
				'An association between two observations does not by itself identify a causal mechanism.'
			]
		],
		detail: [
			'Ask what would change your mind',
			'A claim becomes easier to examine when the reader can name evidence that would count against it.'
		]
	},
	{
		id: 'share',
		label: 'Make understanding useful',
		color: '#94718B',
		statement:
			'An explanation becomes useful when another person can follow its structure and inspect its support.',
		ideas: [
			[
				'Explain in plain language',
				'Clear language lets a reader spend attention on the idea instead of decoding unnecessary jargon.'
			],
			[
				'Teach the connections',
				'A teaching outline should show why ideas connect as well as what each idea means.'
			],
			[
				'Make a concrete example',
				'An example can illustrate an idea, while its limits prevent the example from standing in for every case.'
			],
			[
				'Turn questions into practice',
				'A study question can ask a learner to compare, explain or apply an idea rather than only repeat a label.'
			],
			[
				'Keep evidence within reach',
				'A reader should be able to move from a compact map label to its explanation and source passage.'
			]
		],
		detail: [
			'Offer more than one view',
			'A text outline and a visual map can describe the same structure for readers with different needs.'
		]
	},
	{
		id: 'revise',
		label: 'Leave room to revise',
		color: '#638A96',
		statement:
			'A knowledge map remains useful when it records uncertainty and can change as new material arrives.',
		ideas: [
			[
				'Label interpretations',
				'An inferred connection should identify the passages and reasoning that motivated it.'
			],
			[
				'Separate possibilities',
				'A speculative possibility belongs in an exploratory layer, apart from what the source explicitly states.'
			],
			[
				'Keep open questions',
				'An unresolved question can identify a productive next step without pretending that the source supplied an answer.'
			],
			[
				'Review a changed source',
				'When the source changes, check the interpretations and quotations that depended on its earlier wording.'
			],
			[
				'Save an editable version',
				'An editable version preserves the structure needed to revise a map beyond its exported picture.'
			]
		],
		detail: [
			'Learning is revisable',
			'A revision should make clear what changed and why, so that a polished map does not hide its uncertainty.'
		]
	}
] as const;

/** An original demonstration essay, not a claim to have analysed an external publication. */
export function createExampleProject(): StudioProject {
	const project = createBlankProject();
	project.id = 'example-how-ideas-become-knowledge';
	project.title = 'How ideas become knowledge';
	project.generation.mode = 'example';
	const introduction =
		'How ideas become knowledge\n\nThis original demonstration describes a careful reading practice: begin with a question, preserve the source, organise ideas, examine arguments, explain connections and revise interpretations.';
	const text = [
		introduction,
		...branches.map(
			(branch) =>
				`${branch.label}\n${branch.statement}\n\n${branch.ideas.map(([label, body]) => `${label}\n${body}`).join('\n\n')}\n\n${branch.detail[0]}\n${branch.detail[1]}`
		)
	].join('\n\n');
	project.sources = [
		{
			id: 'demo-essay',
			title: 'How ideas become knowledge — original demonstration',
			kind: 'text',
			text,
			scope:
				'A short teaching essay written for this demonstration. It is not a retrieved article or a research literature review.'
		}
	];
	const evidence = (quote: string): Evidence => {
		const start = text.indexOf(quote);
		if (start < 0) throw new Error('Example passage is missing.');
		const paragraph = text.slice(0, start).split(/\n\n/).length;
		return {
			sourceId: 'demo-essay',
			start,
			end: start + quote.length,
			quote,
			locator: `Paragraph ${paragraph}`
		};
	};
	const node = (
		id: string,
		parentId: string | null,
		label: string,
		description: string,
		color?: string
	): StudioNode => ({
		id,
		parentId,
		label,
		description,
		category: parentId === null ? 'topic' : parentId === 'root' ? 'theme' : 'concept',
		status: 'explicit',
		evidence: [evidence(description)],
		notes: '',
		reviewed: false,
		collapsed: false,
		...(color ? { color } : {})
	});
	project.nodes = [node('root', null, project.title, introduction.split('\n\n')[1])];
	for (const branch of branches) {
		project.nodes.push(node(branch.id, 'root', branch.label, branch.statement, branch.color));
		for (const [index, [label, description]] of branch.ideas.entries())
			project.nodes.push(node(`${branch.id}-${index + 1}`, branch.id, label, description));
		project.nodes.push(
			node(`${branch.id}-detail`, `${branch.id}-1`, branch.detail[0], branch.detail[1])
		);
	}
	const connections = [
		[
			'gather-1',
			'test-2',
			'supports',
			'Preserved passages let a reader inspect what is offered as support.'
		],
		[
			'gather-2',
			'share-5',
			'enables',
			'Recorded locations let a reader return from an explanation to its source.'
		],
		['organise-4', 'share-2', 'supports', 'Cross-links make connections available for teaching.'],
		[
			'test-3',
			'revise-1',
			'associated_with',
			'Recognising assumptions and labelling interpretation are complementary reading practices.'
		],
		[
			'gather-5',
			'test-4',
			'supports',
			'Preserving disagreement keeps alternative readings available for examination.'
		],
		[
			'notice-1',
			'revise-3',
			'associated_with',
			'An initial question and an unresolved question both make uncertainty visible.'
		],
		[
			'revise-5',
			'revise-4',
			'enables',
			'An editable map gives the reader a way to revise source-dependent interpretations.'
		],
		[
			'gather-detail',
			'test-5',
			'associated_with',
			'Both passages limit what can be concluded from an observation or quotation.'
		]
	];
	project.edges = connections.map(([from, to, type, rationale], index) => ({
		id: `connection-${index}`,
		from,
		to,
		type,
		status: 'inferred',
		evidence: [
			project.nodes.find((item) => item.id === from)!.evidence[0],
			project.nodes.find((item) => item.id === to)!.evidence[0]
		],
		rationale
	}));
	project.coverage = {
		total: 43,
		completed: 43,
		limitations: [
			'An authored demonstration of reading and mapping, not an AI analysis or a research literature review.',
			'Cross-links are illustrative interpretations of the two cited passages. Evidence of wording does not establish the truth of an assertion.'
		]
	};
	project.analysis = [
		{
			id: 'overview',
			title: 'The central idea',
			body: 'Understanding grows through a repeatable reading practice: ask, gather, organise, examine, explain and revise. The six branches are an editorial hierarchy over the original demonstration essay.'
		},
		{
			id: 'argument',
			title: 'Argument and evidence',
			body: 'The essay proposes practices for a careful reader. It does not supply experimental findings. Exact source anchors establish where each statement appears; they do not independently validate its recommendation.'
		},
		{
			id: 'relationships',
			title: 'Across the branches',
			body: 'The connections show how preserving source passages supports inspection, how locators enable source access, and how revision depends on an editable structure. These links are labelled as interpretations.'
		},
		{
			id: 'questions',
			title: 'Questions to take further',
			body: 'What would count as evidence against a preferred explanation? When does a hierarchy conceal disagreement? What should a map preserve when its source changes?'
		},
		{
			id: 'learning',
			title: 'A small teaching exercise',
			body: 'Choose one short paragraph. Identify a claim, locate its support, write one possible assumption, and connect it to another paragraph. Mark each connection as explicit, inferred or speculative.'
		}
	];
	return validateProject(project);
}
