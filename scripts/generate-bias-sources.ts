import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

type BiasRecord = { canonicalSources?: string[] };
type RelationRecord = { sourceIds?: string[] };

type CrossrefAuthor = {
	family?: string;
	given?: string;
	literal?: string;
};

type CrossrefMessage = {
	DOI?: string;
	author?: CrossrefAuthor[];
	title?: string[];
	'container-title'?: string[];
	publisher?: string;
	type?: string;
	issued?: { 'date-parts'?: number[][] };
	'published-print'?: { 'date-parts'?: number[][] };
	'published-online'?: { 'date-parts'?: number[][] };
};

type SourceKind =
	| 'original study'
	| 'meta-analysis'
	| 'review'
	| 'book chapter'
	| 'journal article';

type SourceRecord = {
	id: string;
	url: string;
	doi: string;
	authors: string;
	year: number;
	title: string;
	venue: string;
	kind: SourceKind;
};

const root = fileURLToPath(new URL('../', import.meta.url));
const dataDirectory = new URL('../src/lib/data/bias-archipelago/', import.meta.url);
const registryUrl = new URL('sources.json', dataDirectory);
const refresh = process.argv.includes('--refresh');
const check = process.argv.includes('--check') || !refresh;

function clean(value: string | undefined) {
	return (value ?? '')
		.replace(/<[^>]*>/g, '')
		.replace(/&amp;/g, '&')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&(?:rsquo|#8217);/g, '’')
		.replace(/&(?:lsquo|#8216);/g, '‘')
		.replace(/&(?:rdquo|#8221);/g, '”')
		.replace(/&(?:ldquo|#8220);/g, '“')
		.replace(/\s+/g, ' ')
		.trim();
}

function normalizeDoi(source: string) {
	const match = source.match(/^https?:\/\/(?:dx\.)?doi\.org\/(.+)$/i);
	if (!match) throw new Error(`Bias source is not a DOI URL: ${source}`);
	return decodeURIComponent(match[1]).toLowerCase();
}

function authorLabel(authors: CrossrefAuthor[] | undefined) {
	const names = (authors ?? [])
		.map((author) => clean(author.family || author.literal || author.given))
		.filter(Boolean);
	if (!names.length) return 'Unknown author';
	if (names.length === 1) return names[0];
	if (names.length === 2) return `${names[0]} & ${names[1]}`;
	return `${names[0]} et al.`;
}

function publicationYear(message: CrossrefMessage) {
	for (const date of [message['published-print'], message['published-online'], message.issued]) {
		const year = date?.['date-parts']?.[0]?.[0];
		if (Number.isInteger(year)) return year as number;
	}
	return 0;
}

function sourceKind(message: CrossrefMessage, title: string): SourceKind {
	const normalized = title.toLowerCase();
	if (/meta[- ]anal(?:ysis|yses|ytic)/.test(normalized)) return 'meta-analysis';
	if (
		/systematic review|literature review|review of|a review|review and synthesis/.test(normalized)
	) {
		return 'review';
	}
	if (message.type === 'book-chapter' || message.type === 'proceedings-article') {
		return 'book chapter';
	}
	if (
		/experiment|experimental|evidence|test of|testing|demonstration|assessment/.test(normalized)
	) {
		return 'original study';
	}
	return 'journal article';
}

async function referencedSources() {
	const [biasText, relationText] = await Promise.all([
		readFile(new URL('biases.json', dataDirectory), 'utf8'),
		readFile(new URL('relations.json', dataDirectory), 'utf8')
	]);
	const biases = JSON.parse(biasText) as BiasRecord[];
	const relations = JSON.parse(relationText) as RelationRecord[];
	return [
		...new Set([
			...biases.flatMap((bias) => bias.canonicalSources ?? []),
			...relations.flatMap((relation) => relation.sourceIds ?? [])
		])
	].sort((a, b) => normalizeDoi(a).localeCompare(normalizeDoi(b)));
}

async function fetchCrossref(source: string): Promise<SourceRecord> {
	const doi = normalizeDoi(source);
	const endpoint = `https://api.crossref.org/works/${encodeURIComponent(doi)}`;
	let response: Response | undefined;
	for (let attempt = 0; attempt < 4; attempt += 1) {
		try {
			response = await fetch(endpoint, {
				headers: {
					Accept: 'application/json',
					'User-Agent': 'BiasArchipelagoSourceGenerator/1.0 (https://www.suvroghosh.in)'
				}
			});
		} catch (error) {
			if (attempt === 3) throw error;
			await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
			continue;
		}
		if (response.ok) break;
		if (response.status !== 429 && response.status < 500) break;
		await new Promise((resolve) => setTimeout(resolve, 300 * 2 ** attempt));
	}
	if (!response?.ok) throw new Error(`Crossref ${response?.status ?? 'network error'} for ${doi}`);
	const payload = (await response.json()) as { message: CrossrefMessage };
	const message = payload.message;
	const title = clean(message.title?.[0]);
	const year = publicationYear(message);
	const venue = clean(message['container-title']?.[0] || message.publisher);
	if (!title || !year || !venue) throw new Error(`Incomplete Crossref metadata for ${doi}`);
	return {
		id: doi,
		// Preserve the DOI used by the atlas. Crossref occasionally returns an
		// equivalent JSTOR DOI for an older publisher DOI.
		url: source,
		doi,
		authors: authorLabel(message.author),
		year,
		title,
		venue,
		kind: sourceKind(message, title)
	};
}

async function mapConcurrent<T, U>(items: T[], concurrency: number, task: (item: T) => Promise<U>) {
	const results = new Array<U>(items.length);
	let next = 0;
	async function worker() {
		while (next < items.length) {
			const index = next++;
			results[index] = await task(items[index]);
		}
	}
	await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
	return results;
}

function validate(sources: string[], registry: SourceRecord[]) {
	const expected = new Set(sources.map(normalizeDoi));
	const observed = new Set<string>();
	const errors: string[] = [];
	for (const record of registry) {
		if (observed.has(record.id)) errors.push(`Duplicate registry id: ${record.id}`);
		observed.add(record.id);
		if (record.id !== normalizeDoi(record.url) || record.id !== record.doi.toLowerCase()) {
			errors.push(`Mismatched identifiers for ${record.id}`);
		}
		if (!record.authors || !record.year || !record.title || !record.venue || !record.kind) {
			errors.push(`Incomplete registry record: ${record.id}`);
		}
	}
	for (const doi of expected)
		if (!observed.has(doi)) errors.push(`Missing registry record: ${doi}`);
	for (const doi of observed)
		if (!expected.has(doi)) errors.push(`Unreferenced registry record: ${doi}`);
	if (errors.length) throw new Error(errors.join('\n'));
	console.log(
		`Bias source registry valid: ${registry.length} records cover ${sources.length} references.`
	);
}

const sources = await referencedSources();
if (refresh) {
	console.log(`Refreshing ${sources.length} bias-source records from Crossref…`);
	const registry = await mapConcurrent(sources, 3, fetchCrossref);
	registry.sort((a, b) => a.id.localeCompare(b.id));
	validate(sources, registry);
	await writeFile(registryUrl, `${JSON.stringify(registry, null, '\t')}\n`, 'utf8');
	console.log(
		`Wrote ${registry.length} records to ${fileURLToPath(registryUrl).replace(root, '')}.`
	);
} else if (check) {
	const registry = JSON.parse(await readFile(registryUrl, 'utf8')) as SourceRecord[];
	validate(sources, registry);
}
