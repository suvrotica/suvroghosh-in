import Graph from 'graphology';
import louvain from 'graphology-communities-louvain';
import { ANALYSIS_REVISION } from './types';
import type {
	AnalysisDelta,
	AnalysisResult,
	AnalysisSettings,
	Association,
	Concept,
	EdgeAggregate,
	EvidenceRef,
	Finding,
	SourceRecord,
	TermAggregate,
	Topic
} from './types';

/** Counts are exact; these are representative locations, not the whole occurrence index. */
export const EVIDENCE_SAMPLES = 6;
const WORD = /[\p{L}\p{M}\p{N}]/u;
const LETTER = /\p{L}/u;
const SENTENCE_END = /[.!?।॥\n\r\u2028\u2029]/u;
const CONNECTOR = /['’\-‐]/u;
const STOP = new Set(
	`a an and are as at be been being but by can could did do does doing done down each either else enough even ever every few for from further get gets getting got had has have having he her here hers herself him himself his how i if in into is it its itself just least less like made make makes making many may me might mine more most much must my myself neither no nor not now of off on once one only or other our ours ourselves out over own rather really same say says said see seen she should since so some such than that the their theirs them themselves then there these they thing things this those though through thus to too under until up upon us use used uses using very via was we were what whatever when where whether which while who whom whose why will with within without would yes yet you your yours yourself yourselves also about above across after again against all almost along already always among another any anyone anything around away because become becomes before behind below beside between both cannot during example including indeed instead however perhaps still therefore together two three four five first second new well well-known want wants need needs possible important different particular generally often usually especially including include includes included following follows consider considered shown show shows much many several somehow somewhat potentially broadly essentially actually describes describe described discussion discussions discuss discussed material materials article articles text texts says named called how's it's don't doesn't didn't isn't aren't wasn't weren't won't can't couldn't shouldn't wouldn't i'm i've we're they're you'll that's there's let's`.split(
		/\s+/
	)
);
const BENGALI_STOP =
	'এবং বা যে এই ওই সেই একটি এক ও এর তার তাদের তিনি তারা আমি আমরা তুমি আপনি হয় হয়ে ছিল আছে হবে থেকে জন্য সঙ্গে মধ্যে উপর কি কী না কিন্তু যদি তবে আরও খুব তাই সব করে করা করার যখন যেখানে যেমন তেমন এতে সেটা এটি এইসব'.split(
		' '
	);
for (const term of BENGALI_STOP) STOP.add(term);
for (const term of 'available provide provides provided providing ensure ensures ensured implement implements implemented implementing prefer prefers preferred require requires required inspect preserve preserves preserved allow allows allowed allowing enable enables enabled appropriate necessary expected actual exactly respective respectively based given specified specify specified following existing create creates created creating add adds added adding avoid avoidable keep keeps kept let lets support supports supported supporting take takes taken taking look looks looking please must shall also however therefore otherwise whenever wherever whichever neither themselves itself ourselves yourself yourselves'.split(
	' '
))
	STOP.add(term);
for (const term of 'person persons people someone somebody something anyone anybody anything everyone everybody everything nobody nothing'.split(
	' '
))
	STOP.add(term);
// Projection-only: changing the lexer stoplist would invalidate saved aggregates.
const GRAMMATICAL_CONNECTORS = new Set(
	'unless although whereas albeit despite whereby hence herein therein thereof thereto thereafter nevertheless nonetheless whichever whenever wherever otherwise'.split(
		' '
	)
);
// These modifiers can be useful inside phrases but are unhelpful as standalone topics.
const PHRASE_MODIFIERS = new Set(
	'public oral healthy damaged accessible reliable careful shared fair clear safe older younger young long short large small exact original private local remote generic arbitrary explicit implicit meaningful useful better best practical successful different particular actual repeated selected supplied complete whole full specific common general additional subsequent previous certain various corresponding relevant potential bad good valid invalid present absent similar'.split(
		' '
	)
);
// Rhetorical/administrative vocabulary needs stronger standalone support. Useful
// phrases such as "medical advice" and "map projection" keep the normal threshold.
const GENERIC_STANDALONE = new Set(
	'help problem problems issue issues recommendation recommendations advice approach approaches aspect aspects case cases point points reason reasons way ways example examples detail details kind kinds type types situation situations circumstance circumstances matter matters question questions answer answers map maps programme program programmes programs connect connects'.split(
		' '
	)
);

function isGenericTerm(term: TermAggregate): boolean {
	return !term.phrase && GENERIC_STANDALONE.has(term.id);
}

// Document-navigation and citation scaffolding remains searchable, but should not
// outrank the subject or be advertised as a useful intellectual bridge.
const DOCUMENT_SCAFFOLD = new Set(
	'section sections chapter chapters appendix appendices annex annexes figure figures table tables page pages paragraph paragraphs contents bibliography footnote footnotes acknowledgement acknowledgements copyright edition editions editors edited doi isbn issn vol ibid www org com net edu gov info html htm pdf txt'.split(
		' '
	)
);
// Coverage can otherwise mistake a source's format for a missing subject. These
// terms remain available everywhere; only title-corroborated comparison priority
// is reduced. Compounds containing subject words (e.g. "interview technique")
// retain their normal specificity.
const SOURCE_FORMAT_WORDS = new Set(
	'interview review meeting note minute brief report summary transcript practice example sample reference'.split(
		' '
	)
);
function formatWord(word: string): string {
	return word === 'summaries' ? 'summary' : word.replace(/(?<!s)s$/u, '');
}
const PHRASE_PREDICATES = new Set(
	'contains indicates defines identifies specifies determines represents describes allows requires means occurs appears uses receives sends returns consists applies depends refers begins ends causes leads helps performs considers includes provides excludes explains defined received sent indicated identified determined represented described permitted considered listed noted mentioned'.split(
		' '
	)
);
// These words qualify a topic but rarely identify its subject on their own.
// Preserve them in the graph and preserve compounds such as "personal information".
const GENERIC_HEADS = new Set(
	'information consideration considerations description descriptions definition definitions behaviour behavior characteristic characteristics property properties part parts value values rule rules element elements name names unit units scheme schemes'.split(
		' '
	)
);
function isScaffold(term: TermAggregate): boolean {
	return !term.phrase && DOCUMENT_SCAFFOLD.has(term.id);
}
function looksAdverb(word: string): boolean {
	return word.length >= 7 && /(?:ally|ively|ously|ingly|ably|ibly|edly|ently|antly)$/u.test(word);
}
function isFragmentPhrase(term: TermAggregate): boolean {
	return (
		term.phrase &&
		(PHRASE_PREDICATES.has(term.id.split(' ').at(-1)!) ||
			PHRASE_MODIFIERS.has(term.id.split(' ').at(-1)!) ||
			looksAdverb(term.id.split(' ')[0]))
	);
}
function isSyntaxTerm(term: TermAggregate): boolean {
	return (
		!term.phrase &&
		(PHRASE_PREDICATES.has(term.id) ||
			[
				'failed',
				'fails',
				'occurred',
				'generated',
				'generates',
				'matches',
				'moved',
				'obtained',
				'assigned'
			].includes(term.id) ||
			looksAdverb(term.id))
	);
}
function isUsefulAnchor(term: TermAggregate): boolean {
	const parts = term.id.split(' ');
	const uninformativeHead = parts.every(
		(part) => GENERIC_HEADS.has(part) || PHRASE_MODIFIERS.has(part)
	);
	return (
		!isGenericTerm(term) &&
		!isScaffold(term) &&
		!isFragmentPhrase(term) &&
		!isSyntaxTerm(term) &&
		!uninformativeHead
	);
}
function canonicalIdentity(id: string): string {
	return id.replace(/([\p{L}\p{N}])'s(?=\s|$)/gu, '$1');
}
function looksEncodedLiteral(id: string): boolean {
	return /^(?:0x[\da-f]+|x[\da-f]{2,}|\d+[a-f][\da-f]*|\d+[a-z]{3,})$/iu.test(id);
}

/** A conservative grammatical projection; original indexed words and offsets stay unchanged. */
function canonicalAggregates(terms: TermAggregate[], edges: EdgeAggregate[], aliases: Set<string>) {
	const identity = (id: string) => (aliases.has(id) ? id : canonicalIdentity(id));
	const mergedTerms = new Map<string, TermAggregate>();
	for (const term of terms) {
		const id = identity(term.id);
		const item = id === term.id ? term : { ...term, id, label: canonicalIdentity(term.label) };
		const previous = mergedTerms.get(id);
		mergedTerms.set(id, previous ? mergeAggregates(previous, item) : item);
	}
	const mergedEdges = new Map<string, EdgeAggregate>();
	for (const edge of edges) {
		const a = identity(edge.source);
		const b = identity(edge.target);
		if (a === b) continue;
		const [source, target] = a < b ? [a, b] : [b, a];
		const id = JSON.stringify([source, target]);
		const item = { ...edge, id, source, target };
		const previous = mergedEdges.get(id);
		mergedEdges.set(id, previous ? mergeAggregates(previous, item) : item);
	}
	return { terms: [...mergedTerms.values()], edges: [...mergedEdges.values()] };
}

/** A lower bound on separate supporting windows, using the retained evidence samples. */
function separateEvidenceWindows(evidence: EvidenceRef[]): number {
	const ordered = [...evidence].sort(
		(a, b) => a.sourceId.localeCompare(b.sourceId) || a.start - b.start || a.end - b.end
	);
	let count = 0;
	let sourceId = '';
	let end = -1;
	for (const ref of ordered) {
		if (ref.sourceId !== sourceId || ref.start > end) {
			count++;
			sourceId = ref.sourceId;
			end = ref.end;
		} else end = Math.max(end, ref.end);
	}
	return count;
}

type WindowTerm = { key: string; label: string; start: number; end: number; index: number };
export type ExtractorSnapshot = {
	version: 1;
	sourceId: string;
	offset: number;
	highSurrogate: string;
	wordIndex: number;
	buffer: string;
	prefix: string;
	tokenStart: number;
	tokenEnd: number;
	tokenLength: number;
	hashA: number;
	hashB: number;
	hasLetter: boolean;
	window: WindowTerm[];
	previous: WindowTerm | null;
};

export function normalizeTerm(value: string): string {
	return value
		.normalize('NFC')
		.toLowerCase()
		.replaceAll('’', "'")
		.replace(/^['’\-‐]+|['’\-‐]+$/gu, '')
		.trim();
}

/** Stateful, bounded lexer. A token's full spelling is never needed in memory above 256 units. */
export class StreamingExtractor {
	private state: ExtractorSnapshot;
	private excluded: Set<string>;
	private windowSize: number;
	constructor(
		private sourceId: string,
		private settings: AnalysisSettings
	) {
		this.excluded = new Set(settings.excluded.map(normalizeTerm));
		this.windowSize = Math.max(1, Math.round(settings.window));
		this.state = {
			version: 1,
			sourceId,
			offset: 0,
			highSurrogate: '',
			wordIndex: 0,
			buffer: '',
			prefix: '',
			tokenStart: -1,
			tokenEnd: 0,
			tokenLength: 0,
			hashA: 2166136261,
			hashB: 5381,
			hasLetter: false,
			window: [],
			previous: null
		};
	}

	snapshot(): ExtractorSnapshot {
		return structuredClone(this.state);
	}

	restore(snapshot: ExtractorSnapshot): void {
		if (
			snapshot.version !== 1 ||
			snapshot.sourceId !== this.sourceId ||
			!Number.isSafeInteger(snapshot.offset) ||
			snapshot.offset < 0
		) {
			throw new Error('The extraction checkpoint does not match this source.');
		}
		this.state = structuredClone(snapshot);
	}

	push(text: string, final = false): AnalysisDelta {
		const terms = new Map<string, TermAggregate>();
		const edges = new Map<string, EdgeAggregate>();
		let words = 0;
		const addTerm = (id: string, label: string, ref: EvidenceRef, phrase: boolean) => {
			if (this.excluded.has(id)) return false;
			let item = terms.get(id);
			if (!item) {
				item = { id, label, count: 0, sources: {}, evidence: [], phrase };
				terms.set(id, item);
			}
			item.count++;
			item.sources[this.sourceId] = (item.sources[this.sourceId] || 0) + 1;
			if (item.evidence.length < EVIDENCE_SAMPLES) item.evidence.push(ref);
			return true;
		};
		const addEdge = (a: string, b: string, ref: EvidenceRef) => {
			if (a === b) return;
			const [source, target] = a < b ? [a, b] : [b, a];
			const id = JSON.stringify([source, target]);
			let item = edges.get(id);
			if (!item) {
				item = { id, source, target, count: 0, sources: {}, evidence: [] };
				edges.set(id, item);
			}
			item.count++;
			item.sources[this.sourceId] = (item.sources[this.sourceId] || 0) + 1;
			if (item.evidence.length < EVIDENCE_SAMPLES) item.evidence.push(ref);
		};
		const finish = () => {
			const s = this.state;
			if (s.tokenStart < 0) return;
			const raw =
				s.tokenLength <= 256
					? normalizeTerm(s.buffer)
					: `long:${s.hashA >>> 0}:${s.hashB >>> 0}:${s.tokenLength}`;
			const label = s.tokenLength <= 256 ? raw : `${normalizeTerm(s.prefix)}…`;
			const key = Object.hasOwn(this.settings.aliases, raw)
				? normalizeTerm(this.settings.aliases[raw])
				: raw;
			const display = key === raw ? label : key;
			const index = ++s.wordIndex;
			words++;
			s.window = s.window.filter((term) => index - term.index <= this.windowSize);
			const valid = s.hasLetter && key.length > 1 && !STOP.has(key) && !this.excluded.has(key);
			if (valid) {
				const ref = { sourceId: this.sourceId, start: s.tokenStart, end: s.tokenEnd };
				addTerm(key, display, ref, false);
				for (const previous of s.window)
					addEdge(previous.key, key, { ...ref, start: previous.start });
				if (
					s.previous &&
					s.previous.index === index - 1 &&
					s.previous.key !== key &&
					!key.startsWith('long:') &&
					!s.previous.key.startsWith('long:')
				) {
					const phrase = `${s.previous.key} ${key}`;
					const phraseKey = Object.hasOwn(this.settings.aliases, phrase)
						? normalizeTerm(this.settings.aliases[phrase])
						: phrase;
					const phraseRef = { ...ref, start: s.previous.start };
					if (
						phraseKey &&
						phraseKey !== key &&
						phraseKey !== s.previous.key &&
						addTerm(phraseKey, phraseKey, phraseRef, true)
					) {
						addEdge(phraseKey, s.previous.key, phraseRef);
						addEdge(phraseKey, key, phraseRef);
					}
				}
				const entry = { key, label: display, start: s.tokenStart, end: s.tokenEnd, index };
				s.window.push(entry);
				s.previous = entry;
			} else s.previous = null;
			s.buffer = '';
			s.prefix = '';
			s.tokenStart = -1;
			s.tokenLength = 0;
			s.hashA = 2166136261;
			s.hashB = 5381;
			s.hasLetter = false;
		};

		const s = this.state;
		let input = s.highSurrogate + text;
		const base = s.offset - s.highSurrogate.length;
		s.offset += text.length;
		s.highSurrogate = '';
		if (!final && input.length && /[\uD800-\uDBFF]/.test(input.at(-1)!)) {
			s.highSurrogate = input.at(-1)!;
			input = input.slice(0, -1);
		}
		let cursor = base;
		for (const character of input) {
			if (WORD.test(character) || (CONNECTOR.test(character) && s.tokenStart >= 0)) {
				if (s.tokenStart < 0) s.tokenStart = cursor;
				s.tokenEnd = cursor + character.length;
				s.tokenLength += character.length;
				if (s.tokenLength <= 256) s.buffer += character;
				if (s.prefix.length < 80) s.prefix += character;
				s.hasLetter ||= LETTER.test(character);
				for (const code of character.toLowerCase()) {
					const point = code.codePointAt(0)!;
					s.hashA = Math.imul(s.hashA ^ point, 16777619);
					s.hashB = (Math.imul(s.hashB, 33) ^ point) | 0;
				}
			} else {
				finish();
				if (SENTENCE_END.test(character)) {
					s.window = [];
					s.previous = null;
				} else if (!/\s/u.test(character)) s.previous = null;
			}
			cursor += character.length;
		}
		if (final) finish();
		return { terms: [...terms.values()], edges: [...edges.values()], words };
	}
}

export function mergeEvidence(
	a: EvidenceRef[],
	b: EvidenceRef[],
	limit = EVIDENCE_SAMPLES
): EvidenceRef[] {
	const perSource = mergeSourceEvidence(a, b, limit);
	const groups = new Map<string, EvidenceRef[]>();
	for (const ref of perSource) {
		const group = groups.get(ref.sourceId) || [];
		group.push(ref);
		groups.set(ref.sourceId, group);
	}
	const result: EvidenceRef[] = [];
	for (let i = 0; result.length < limit; i++) {
		let added = false;
		for (const group of groups.values()) {
			if (group[i]) {
				result.push(group[i]);
				added = true;
			}
			if (result.length >= limit) break;
		}
		if (!added) break;
	}
	return result;
}

/** Retain evidence for each source, so later reference documents cannot lose all their spans. */
export function mergeSourceEvidence(
	a: EvidenceRef[],
	b: EvidenceRef[],
	perSource = EVIDENCE_SAMPLES
): EvidenceRef[] {
	const grouped = new Map<string, Map<string, EvidenceRef>>();
	for (const ref of [...a, ...b]) {
		const group = grouped.get(ref.sourceId) || new Map<string, EvidenceRef>();
		group.set(`${ref.start}:${ref.end}`, ref);
		grouped.set(ref.sourceId, group);
	}
	return [...grouped.entries()]
		.sort(([a], [b]) => a.localeCompare(b))
		.flatMap(([, group]) =>
			[...group.values()].sort((a, b) => a.start - b.start || a.end - b.end).slice(0, perSource)
		);
}

/** Used by deterministic fixtures and small callers; the worker uses disk-backed merges. */
export function mergeAggregates<T extends TermAggregate | EdgeAggregate>(
	existing: T | undefined,
	delta: T
): T {
	if (!existing) return structuredClone(delta);
	const sources = { ...existing.sources };
	for (const [id, count] of Object.entries(delta.sources)) sources[id] = (sources[id] || 0) + count;
	return {
		...existing,
		count: existing.count + delta.count,
		sources,
		evidence: mergeSourceEvidence(existing.evidence, delta.evidence)
	};
}

function random(seed: number): () => number {
	let state = seed >>> 0;
	return () => {
		state += 0x6d2b79f5;
		let t = Math.imul(state ^ (state >>> 15), 1 | state);
		t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

const clamp = (n: number) => Math.max(0, Math.min(1, n));
const supportFor = (n: number) => n / (n + 4);
// Only a ranking redundancy check, never a concept merge or a semantic claim.
function labelRoots(label: string): Set<string> {
	return new Set(
		label
			.split(/[^\p{L}\p{M}\p{N}]+/u)
			.filter(Boolean)
			.map((word) =>
				word.length > 3 && word.endsWith('s') && !/(ss|us|is)$/u.test(word)
					? word.slice(0, -1)
					: word
			)
	);
}
function refs(items: { evidence: EvidenceRef[] }[]): EvidenceRef[] {
	return items.reduce((result, item) => mergeEvidence(result, item.evidence), [] as EvidenceRef[]);
}
function finding(input: Omit<Finding, 'priority'>): Finding {
	const f = input.factors;
	return {
		...input,
		priority: Math.round(100 * clamp(f.relevance) * clamp(f.deficit) * clamp(f.support))
	};
}

/** Exact iterative Tarjan branches distinguish a substantial split from a dangling fragment. */
function articulationPoints(
	adjacency: Map<string, Set<string>>
): Map<string, { branches: number[]; componentSize: number }> {
	const discovery = new Map<string, number>();
	const low = new Map<string, number>();
	const parent = new Map<string, string>();
	const subtree = new Map<string, number>();
	const separated = new Map<string, number[]>();
	const result = new Map<string, { branches: number[]; componentSize: number }>();
	let time = 0;
	for (const root of adjacency.keys()) {
		if (discovery.has(root)) continue;
		discovery.set(root, ++time);
		low.set(root, time);
		subtree.set(root, 1);
		const component = [root];
		const stack: { id: string; iterator: IterableIterator<string> }[] = [
			{ id: root, iterator: adjacency.get(root)!.values() }
		];
		while (stack.length) {
			const frame = stack[stack.length - 1];
			const next = frame.iterator.next();
			if (!next.done) {
				const neighbour = next.value;
				if (!discovery.has(neighbour)) {
					parent.set(neighbour, frame.id);
					discovery.set(neighbour, ++time);
					low.set(neighbour, time);
					subtree.set(neighbour, 1);
					component.push(neighbour);
					stack.push({ id: neighbour, iterator: adjacency.get(neighbour)!.values() });
				} else if (parent.get(frame.id) !== neighbour) {
					low.set(frame.id, Math.min(low.get(frame.id)!, discovery.get(neighbour)!));
				}
			} else {
				stack.pop();
				const p = parent.get(frame.id);
				if (p !== undefined) {
					low.set(p, Math.min(low.get(p)!, low.get(frame.id)!));
					subtree.set(p, subtree.get(p)! + subtree.get(frame.id)!);
					if (low.get(frame.id)! >= discovery.get(p)!) {
						const branches = separated.get(p) || [];
						branches.push(subtree.get(frame.id)!);
						separated.set(p, branches);
					}
				}
			}
		}
		for (const id of component) {
			const branches = separated.get(id) || [];
			const rest = component.length - 1 - branches.reduce((sum, size) => sum + size, 0);
			if (rest > 0) branches.push(rest);
			if (branches.length > 1)
				result.set(id, {
					branches: branches.sort((a, b) => b - a),
					componentSize: component.length
				});
		}
	}
	return result;
}

export function analyseAggregates(
	terms: TermAggregate[],
	rawEdges: EdgeAggregate[],
	sources: SourceRecord[],
	settings: AnalysisSettings
): AnalysisResult {
	const aliasTargets = new Set(Object.values(settings.aliases).map(normalizeTerm));
	const excluded = new Set(
		settings.excluded.map((value) => {
			const normalized = normalizeTerm(value);
			return aliasTargets.has(normalized) ? normalized : canonicalIdentity(normalized);
		})
	);
	const sourceMap = new Map(sources.map((source) => [source.id, source]));
	const sourceCount = Math.max(1, sources.length);
	const minCount = Math.max(1, settings.minCount);
	const projected = canonicalAggregates(terms, rawEdges, aliasTargets);
	const rawDegree = new Map<string, number>();
	for (const edge of projected.edges) {
		rawDegree.set(edge.source, (rawDegree.get(edge.source) || 0) + 1);
		rawDegree.set(edge.target, (rawDegree.get(edge.target) || 0) + 1);
	}
	const eligible = projected.terms
		.filter(
			(term) =>
				term.count >= minCount &&
				!excluded.has(term.id) &&
				!STOP.has(term.id) &&
				!GRAMMATICAL_CONNECTORS.has(term.id) &&
				(!term.phrase ||
					!term.id.split(' ').some((part) => STOP.has(part) || GRAMMATICAL_CONNECTORS.has(part))) &&
				(term.phrase || !PHRASE_MODIFIERS.has(term.id)) &&
				(!looksEncodedLiteral(term.id) || (rawDegree.get(term.id) || 0) > 1) &&
				(!isGenericTerm(term) ||
					term.count >= Math.max(4, minCount) ||
					Object.hasOwn(settings.aliases, term.id)) &&
				(!term.phrase ||
					!term.id
						.split(' ')
						.every((part) => GENERIC_STANDALONE.has(part) || PHRASE_MODIFIERS.has(part)))
		)
		.sort((a, b) => a.id.localeCompare(b.id, 'en'));
	const conceptMap = new Map<string, Concept>();
	for (const term of eligible) {
		let targetCount = 0;
		let referenceCount = 0;
		for (const [id, count] of Object.entries(term.sources)) {
			if (sourceMap.get(id)?.role === 'reference') referenceCount += count;
			else targetCount += count;
		}
		const specificity = 1 + Math.log((1 + sourceCount) / (1 + Object.keys(term.sources).length));
		conceptMap.set(term.id, {
			...term,
			score:
				Math.log1p(term.count) *
				specificity *
				(term.phrase ? 1.12 : 1) *
				(isGenericTerm(term) ? 0.3 : 1) *
				(isScaffold(term) ? 0.04 : 1) *
				(isFragmentPhrase(term) || isSyntaxTerm(term) ? 0.15 : 1),
			degree: 0,
			community: 0,
			targetCount,
			referenceCount
		});
	}
	const edges: Association[] = [];
	const graph = new Graph({ type: 'undirected', multi: false, allowSelfLoops: false });
	const adjacency = new Map<string, Set<string>>();
	for (const id of conceptMap.keys()) {
		graph.addNode(id);
		adjacency.set(id, new Set());
	}
	for (const edge of projected.edges.sort((a, b) => a.id.localeCompare(b.id, 'en'))) {
		const a = conceptMap.get(edge.source);
		const b = conceptMap.get(edge.target);
		if (!a || !b || a.id === b.id || !Number.isFinite(edge.count) || edge.count <= 0) continue;
		const weight =
			Math.min(1, edge.count / Math.sqrt(a.count * b.count)) *
			(isScaffold(a) || isScaffold(b) ? 0.05 : 1) *
			(isSyntaxTerm(a) || isSyntaxTerm(b) ? 0.3 : 1);
		edges.push({ ...edge, weight });
		if (!graph.hasEdge(a.id, b.id)) graph.addEdge(a.id, b.id, { weight });
		adjacency.get(a.id)!.add(b.id);
		adjacency.get(b.id)!.add(a.id);
	}
	const preliminary: Record<string, number> = graph.size
		? louvain(graph, {
				getEdgeWeight: 'weight',
				resolution: Math.max(0.1, settings.resolution),
				rng: random(settings.seed)
			})
		: Object.fromEntries([...conceptMap.keys()].map((id, index) => [id, index]));

	// Louvain can return disconnected groups. Split each into its connected components.
	const visited = new Set<string>();
	const groups: Concept[][] = [];
	for (const first of conceptMap.keys()) {
		if (visited.has(first)) continue;
		const group: Concept[] = [];
		const queue = [first];
		visited.add(first);
		for (let i = 0; i < queue.length; i++) {
			const id = queue[i];
			const concept = conceptMap.get(id)!;
			concept.degree = adjacency.get(id)!.size;
			group.push(concept);
			for (const neighbour of adjacency.get(id)!) {
				if (!visited.has(neighbour) && preliminary[neighbour] === preliminary[first]) {
					visited.add(neighbour);
					queue.push(neighbour);
				}
			}
		}
		groups.push(group);
	}
	groups.sort(
		(a, b) =>
			b.reduce((sum, x) => sum + x.score, 0) - a.reduce((sum, x) => sum + x.score, 0) ||
			a[0].id.localeCompare(b[0].id)
	);
	const topics: Topic[] = groups.map((group, id) => {
		group.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
		for (const concept of group) concept.community = id;
		const topicSources: Record<string, number> = {};
		for (const concept of group)
			for (const [sourceId, count] of Object.entries(concept.sources))
				topicSources[sourceId] = (topicSources[sourceId] || 0) + count;
		const specific = group.filter(isUsefulAnchor);
		const labelPool = specific.length ? specific : group;
		const phrases = labelPool.filter(
			(concept) => concept.phrase && concept.score >= labelPool[0].score * 0.4
		);
		phrases.sort(
			(a, b) =>
				Math.log1p(b.count) * Math.sqrt(Object.keys(b.sources).length) -
					Math.log1p(a.count) * Math.sqrt(Object.keys(a.sources).length) ||
				b.score - a.score ||
				a.id.localeCompare(b.id)
		);
		const primary = phrases[0] || labelPool[0];
		const second = group.find(
			(concept) =>
				concept.id !== primary.id &&
				!primary.id.split(' ').includes(concept.id) &&
				!concept.phrase &&
				!isGenericTerm(concept)
		);
		const label = group.every(isScaffold)
			? 'Document references'
			: primary.phrase || !second
				? primary.label
				: `${primary.label} & ${second.label}`;
		return {
			id,
			label,
			terms: group.map((concept) => concept.id),
			count: group.reduce((n, c) => n + c.count, 0),
			sources: topicSources,
			targetCount: group.reduce((n, c) => n + c.targetCount, 0),
			referenceCount: group.reduce((n, c) => n + c.referenceCount, 0)
		};
	});
	const concepts = [...conceptMap.values()].sort(
		(a, b) => b.score - a.score || a.id.localeCompare(b.id)
	);
	const maxScore = concepts.reduce((maximum, concept) => Math.max(maximum, concept.score), 1);
	for (const concept of concepts) concept.score /= maxScore;

	const findings: Finding[] = [];
	const strengths = new Map<number, number>();
	const incident = new Map<string, Association[]>();
	const anchors = new Map<number, Set<string>>();
	for (const topic of topics) {
		const roots = labelRoots(topic.label);
		const representatives = topic.terms.map((id) => conceptMap.get(id)!).filter(isUsefulAnchor);
		const ids = representatives
			.filter((c) => c.id === topic.label || [...labelRoots(c.id)].some((root) => roots.has(root)))
			.map((c) => c.id);
		anchors.set(topic.id, new Set(ids));
	}
	const cross = new Map<string, { a: number; b: number; weight: number; edges: Association[] }>();
	for (const edge of edges) {
		const a = conceptMap.get(edge.source)!;
		const b = conceptMap.get(edge.target)!;
		for (const id of [edge.source, edge.target]) {
			const list = incident.get(id) || [];
			list.push(edge);
			incident.set(id, list);
		}
		strengths.set(a.community, (strengths.get(a.community) || 0) + edge.weight);
		strengths.set(b.community, (strengths.get(b.community) || 0) + edge.weight);
		if (a.community === b.community) continue;
		const [ca, cb] =
			a.community < b.community ? [a.community, b.community] : [b.community, a.community];
		const key = `${ca}:${cb}`;
		const entry = cross.get(key) || { a: ca, b: cb, weight: 0, edges: [] };
		entry.weight += edge.weight;
		entry.edges.push(edge);
		cross.set(key, entry);
	}
	for (const pair of cross.values()) {
		const a = topics[pair.a];
		const b = topics[pair.b];
		if (a.terms.length < 3 || b.terms.length < 3 || Math.min(a.count, b.count) < 8) continue;
		const representativeEdges = pair.edges.filter(
			(edge) =>
				edge.count >= 2 &&
				![...labelRoots(edge.source)].some((root) => labelRoots(edge.target).has(root)) &&
				((anchors.get(a.id)!.has(edge.source) && anchors.get(b.id)!.has(edge.target)) ||
					(anchors.get(a.id)!.has(edge.target) && anchors.get(b.id)!.has(edge.source)))
		);
		if (!representativeEdges.length) continue;
		const count = representativeEdges.reduce((sum, edge) => sum + edge.count, 0);
		const supportingWindows = separateEvidenceWindows(
			representativeEdges.flatMap((edge) => edge.evidence)
		);
		// A relationship with several separately located examples is already evidenced;
		// a large graph's small normalized density does not turn it into a missing link.
		if (count >= 12 && supportingWindows >= 6) continue;
		const connection =
			pair.weight / Math.sqrt((strengths.get(a.id) || 1) * (strengths.get(b.id) || 1));
		const structuralDeficit = 1 - clamp(connection * 6);
		if (structuralDeficit < 0.3) continue;
		const deficit =
			structuralDeficit / Math.sqrt(1 + count / 12) / Math.sqrt(Math.max(1, supportingWindows));
		const sourceIds = new Set(representativeEdges.flatMap((edge) => Object.keys(edge.sources)));
		const rootsA = labelRoots(a.label);
		const rootsB = labelRoots(b.label);
		const sharedWords = [...rootsA].filter((word) => rootsB.has(word)).length;
		const distinctness = 1 - sharedWords / Math.max(1, Math.min(rootsA.size, rootsB.size));
		const selected = representativeEdges.sort(
			(x, y) => y.weight - x.weight || y.count - x.count || x.id.localeCompare(y.id)
		);
		const witness = selected[0];
		const witnessA = conceptMap.get(witness.source)!;
		const witnessB = conceptMap.get(witness.target)!;
		const relevance =
			distinctness *
			clamp(
				0.35 + 0.45 * Math.min(1, witness.weight * 2) + Math.min(0.2, (sourceIds.size - 1) * 0.1)
			);
		const support =
			supportFor(Math.min(a.count, b.count)) * clamp(Math.min(a.terms.length, b.terms.length) / 6);
		findings.push(
			finding({
				id: `gap:${a.id}:${b.id}`,
				kind: 'gap',
				title: `${witnessA.label} ↔ ${witnessB.label}`,
				explanation: `The representative concepts “${witnessA.label}” and “${witnessB.label}” co-occur ${witness.count} time(s). The excerpts below contain that specific observed pair. Across representative concepts, ${count} pair occurrences and at least ${supportingWindows} separate sampled windows connect these topics. Their overall cross-link weight is ${(connection * 100).toFixed(1)}% of the geometric mean of their total connection weights. Existing support lowers this investigation’s priority rather than being mistaken for an absence.${sharedWords ? ' Shared label wording further reduces priority.' : ''}`,
				question: `What do the passages connecting ${witnessA.label} and ${witnessB.label} explain, and what would you still need to investigate?`,
				concepts: [witness.source, witness.target],
				topics: [a.id, b.id],
				evidence: mergeEvidence([], witness.evidence),
				factors: { relevance, deficit, support },
				caveat:
					'A sparse connection is a structural observation, not proof that a connection is missing. Topic boundaries, wording and the selected word window can change this ranking.'
			})
		);
	}
	const articulation = articulationPoints(adjacency);
	for (const concept of concepts) {
		const neighbours = [...adjacency.get(concept.id)!];
		const otherTopics = new Set(neighbours.map((id) => conceptMap.get(id)!.community));
		otherTopics.add(concept.community);
		const crossEvidence = (incident.get(concept.id) || []).filter((edge) => {
			const other = conceptMap.get(edge.source === concept.id ? edge.target : edge.source)!;
			return edge.count >= 2 && other.community !== concept.community && isUsefulAnchor(other);
		});
		const supportedTopics = new Set(
			crossEvidence.map(
				(edge) => conceptMap.get(edge.source === concept.id ? edge.target : edge.source)!.community
			)
		);
		supportedTopics.add(concept.community);
		const corpusWideHub = topics.length >= 12 && otherTopics.size / topics.length >= 0.5;
		const abbreviationFragment = /^[a-z]{1,2}$|^[b-df-hj-np-tv-z]{2,5}$/u.test(concept.id);
		if (
			!concept.phrase &&
			isUsefulAnchor(concept) &&
			anchors.get(concept.community)!.has(concept.id) &&
			!abbreviationFragment &&
			!corpusWideHub &&
			supportedTopics.size >= 3 &&
			concept.count >= 4 &&
			concept.score >= 0.3 &&
			neighbours.length >= 4
		) {
			const hubPenalty =
				1 / (1 + (Math.log1p(concept.degree) * otherTopics.size) / Math.max(1, topics.length));
			findings.push(
				finding({
					id: `bridge:${concept.id}`,
					kind: 'bridge',
					title: `${concept.label} connects ${supportedTopics.size} topics`,
					explanation: `This concept has repeated co-occurrence links across ${supportedTopics.size} topic communities. The excerpts show those cross-topic pairs. Its ${concept.degree} total neighbours are not all treated as meaningful bridges; corpus-wide hubs and one-off links receive less priority. Inspect whether the same meaning is doing the connecting.`,
					question: `How does ${concept.label} connect these topics, and is it used consistently?`,
					concepts: [concept.id],
					topics: [...supportedTopics],
					evidence: refs(crossEvidence.sort((a, b) => b.weight - a.weight)),
					factors: {
						relevance: clamp(supportedTopics.size / 5) * hubPenalty,
						deficit: 1,
						support: supportFor(concept.count)
					},
					caveat:
						'A word used in several contexts may be a useful bridge or may carry different meanings. Co-occurrence does not resolve that ambiguity.'
				})
			);
		}
		const split = articulation.get(concept.id);
		const substantialBranchSize = split
			? Math.max(2, Math.ceil(split.componentSize * 0.01))
			: Infinity;
		const substantialBranches =
			split?.branches.filter((size) => size >= substantialBranchSize) || [];
		if (
			!concept.phrase &&
			isUsefulAnchor(concept) &&
			substantialBranches.length >= 2 &&
			concept.count >= 2
		) {
			findings.push(
				finding({
					id: `fragile:${concept.id}`,
					kind: 'fragile',
					title: `A connection depends on ${concept.label}`,
					explanation: `Removing this concept splits its ${split!.componentSize}-concept component into branches of ${split!.branches.join(', ')} concepts. At least two branches contain ${substantialBranchSize} or more concepts, so this is more than a dangling one-term fragment. It is an articulation point under the current extraction settings.`,
					question: `What other evidence could connect the ideas currently linked through ${concept.label}?`,
					concepts: [concept.id],
					topics: [...otherTopics],
					evidence: mergeEvidence([], concept.evidence),
					factors: {
						relevance: 0.85,
						deficit: clamp((2 * substantialBranches[1]) / Math.max(1, split!.componentSize - 1)),
						support: supportFor(concept.count)
					},
					caveat:
						'Graph fragility is sensitive to concept filtering and does not establish a weakness in the real-world subject.'
				})
			);
		}
		if (!concept.phrase && isUsefulAnchor(concept) && concept.degree <= 2 && concept.count >= 3) {
			findings.push(
				finding({
					id: `peripheral:${concept.id}`,
					kind: 'peripheral',
					title: `${concept.label} sits at the edge`,
					explanation: `This concept occurs ${concept.count} times in ${Object.keys(concept.sources).length} source(s), but has only ${concept.degree} eligible neighbours in the analysed graph.`,
					question: `Does ${concept.label} need to connect to the main argument, or is it deliberately separate?`,
					concepts: [concept.id],
					topics: [concept.community],
					evidence: mergeEvidence([], concept.evidence),
					factors: {
						relevance: concept.degree ? 0.55 : 0.2,
						deficit: 1 - concept.degree / 4,
						support: supportFor(concept.count)
					},
					caveat:
						'Peripheral concepts can be intentional details. Rare vocabulary and the minimum-support threshold can also produce isolation.'
				})
			);
		}
	}
	const targetWords = sources
		.filter((source) => source.role === 'target')
		.reduce((sum, source) => sum + source.words, 0);
	const referenceWords = sources
		.filter((source) => source.role === 'reference')
		.reduce((sum, source) => sum + source.words, 0);
	if (targetWords > 0 && referenceWords > 0) {
		const sourceTitleWords = new Map(
			sources
				.filter((source) => source.role === 'reference')
				.map((source) => [
					source.id,
					new Set((source.name.toLocaleLowerCase().match(/[\p{L}\p{M}]+/gu) || []).map(formatWord))
				])
		);
		for (const concept of concepts) {
			if (concept.referenceCount < Math.max(2, minCount) || !isUsefulAnchor(concept)) continue;
			const targetRate = concept.targetCount / targetWords;
			const referenceRate = concept.referenceCount / referenceWords;
			const deficit = clamp(1 - targetRate / referenceRate);
			if (deficit < 0.6) continue;
			const parts = concept.id.split(' ').map(formatWord);
			const formatOccurrences = parts.every((part) => SOURCE_FORMAT_WORDS.has(part))
				? Object.entries(concept.sources).reduce(
						(sum, [id, count]) =>
							sum + (parts.some((part) => sourceTitleWords.get(id)?.has(part)) ? count : 0),
						0
					)
				: 0;
			const formatShare = formatOccurrences / concept.referenceCount;
			const specificity = concept.phrase ? 1 : 0.6;
			findings.push(
				finding({
					id: `coverage:${concept.id}`,
					kind: 'coverage',
					title: `${concept.label}: lighter coverage in the target`,
					explanation: `${concept.label} appears ${concept.referenceCount} times in the reference (${(referenceRate * 1000).toFixed(1)} per 1,000 words) and ${concept.targetCount} times in the target (${(targetRate * 1000).toFixed(1)} per 1,000 words). ${concept.targetCount ? 'Its normalized frequency is lower in the target.' : 'It was not found in the target under the current extraction settings.'}`,
					question: `Should the target address ${concept.label}, as the supplied reference does?`,
					concepts: [concept.id],
					topics: [concept.community],
					evidence: mergeEvidence(
						[],
						concept.evidence.filter((ref) => sourceMap.get(ref.sourceId)?.role === 'reference')
					),
					factors: {
						relevance: (0.8 + 0.2 * concept.score) * specificity * (1 - 0.65 * formatShare),
						deficit,
						support: supportFor(concept.referenceCount)
					},
					caveat:
						'This is lexical coverage relative to the chosen reference, not an objective syllabus. Recurring phrases rank above individual words; document-format labels matching source names receive lower priority. Synonyms, document purpose, and repeated passages may explain the difference.'
				})
			);
		}
	}
	if (sources.length >= 3) {
		for (const topic of topics) {
			const distribution = Object.entries(topic.sources).sort((a, b) => b[1] - a[1]);
			if (!distribution.length || topic.terms.length < 3 || topic.count < 12) continue;
			const [sourceId, count] = distribution[0];
			const concentration = count / topic.count;
			if (concentration < 0.85) continue;
			findings.push(
				finding({
					id: `concentration:${topic.id}`,
					kind: 'concentration',
					title: `${topic.label} relies on one source`,
					explanation: `${Math.round(concentration * 100)}% of the eligible concept occurrences in this topic come from “${sourceMap.get(sourceId)?.name || 'one source'}”. This measures source concentration, not source credibility.`,
					question: `Would another source change or strengthen the treatment of ${topic.label}?`,
					concepts: topic.terms.slice(0, 5),
					topics: [topic.id],
					evidence: refs(topic.terms.map((id) => conceptMap.get(id)!)),
					factors: { relevance: 0.65, deficit: concentration, support: supportFor(topic.count) },
					caveat:
						'A specialised source may properly dominate a topic. This app does not judge the quality or independence of sources.'
				})
			);
		}
	}
	findings.sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
	return {
		version: 1,
		analysisRevision: ANALYSIS_REVISION,
		concepts,
		edges,
		topics,
		findings,
		settings: structuredClone(settings),
		words: sources.reduce((sum, source) => sum + source.words, 0),
		totalTerms: terms.length,
		totalEdges: rawEdges.length,
		analysedAt: new Date().toISOString(),
		sources,
		scope: `All processed source words contribute to exact aggregates. The analysed graph contains ${concepts.length.toLocaleString()} concepts occurring at least ${minCount} time(s), after stopword, standalone-modifier and user exclusions, and ${edges.length.toLocaleString()} associations between them. Generic standalone discourse terms require at least ${Math.max(4, minCount)} occurrences and receive lower salience; informative recurring phrases remain eligible at the normal threshold. Document-navigation, citation and common address fragments are downweighted; isolated encoded literals are excluded from the graph. English possessives are combined only in this analytical projection, with original indexed words and source offsets preserved. ${terms.length.toLocaleString()} extracted concepts and ${rawEdges.length.toLocaleString()} associations are retained in the project index. Communities use seeded Louvain with disconnected-group repair. Topic labels favour recurring phrases over predicate fragments. Gap suggestions require an observed pair of representative topic terms; their excerpts show that exact pair, and existing support reduces priority. Fragility requires at least two substantial branches after removal. The index retains up to ${EVIDENCE_SAMPLES} representative locations per source; findings show a diverse selection and counts include every occurrence. English and a small Bengali stoplist are used without synonym inference. Tokens above 256 UTF-16 units use hashed identities and abbreviated labels; their original source text remains intact.`
	};
}
