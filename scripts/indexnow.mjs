import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const SITE_URL = 'https://www.suvroghosh.in';
export const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow';
export const MAX_URLS_PER_REQUEST = 10_000;
export const INDEXNOW_KEY_PATTERN = /^[A-Za-z0-9-]{8,128}$/;

export function getIndexNowKey(environment = process.env) {
	const key = String(environment.INDEXNOW_KEY ?? '').trim();
	if (!INDEXNOW_KEY_PATTERN.test(key)) {
		throw new Error(
			'INDEXNOW_KEY must be an 8–128 character value containing only letters, numbers, or dashes.'
		);
	}
	return key;
}

function decodeXml(value) {
	return value
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&apos;/g, "'");
}

export function urlsFromSitemap(xml) {
	return sitemapEntries(xml).map(({ url }) => url);
}

export function sitemapEntries(xml) {
	const entries = Array.from(xml.matchAll(/<url\b[^>]*>([\s\S]*?)<\/url>/gi), ([, block]) => {
		const location = block.match(/<loc>([\s\S]*?)<\/loc>/i);
		const lastModified = block.match(/<lastmod>([\s\S]*?)<\/lastmod>/i);
		return {
			url: location ? decodeXml(location[1].trim()) : '',
			lastModified: lastModified ? decodeXml(lastModified[1].trim()) : ''
		};
	}).filter(({ url }) => url);

	const urls = validateUrls(entries.map(({ url }) => url));
	const entryByUrl = new Map(entries.map((entry) => [entry.url, entry]));
	return urls.map((url) => entryByUrl.get(url));
}

export function changedUrlsFromSitemaps(currentXml, previousXml = '') {
	const currentEntries = sitemapEntries(currentXml);
	if (!previousXml.trim()) return currentEntries.map(({ url }) => url);

	const previousEntries = sitemapEntries(previousXml);
	const currentByUrl = new Map(currentEntries.map((entry) => [entry.url, entry.lastModified]));
	const previousByUrl = new Map(previousEntries.map((entry) => [entry.url, entry.lastModified]));
	const changed = currentEntries
		.filter(
			(entry) =>
				!previousByUrl.has(entry.url) || previousByUrl.get(entry.url) !== entry.lastModified
		)
		.map(({ url }) => url);
	const deleted = previousEntries.filter(({ url }) => !currentByUrl.has(url)).map(({ url }) => url);

	return changed.length || deleted.length ? validateUrls([...changed, ...deleted]) : [];
}

export function validateUrls(values) {
	const urls = [...new Set(values.map((value) => String(value).trim()).filter(Boolean))];
	if (urls.length === 0) throw new Error('No URLs were supplied for IndexNow submission.');
	if (urls.length > MAX_URLS_PER_REQUEST) {
		throw new Error(
			`IndexNow accepts at most ${MAX_URLS_PER_REQUEST} URLs per request; received ${urls.length}.`
		);
	}

	for (const value of urls) {
		let url;
		try {
			url = new URL(value);
		} catch {
			throw new Error(`IndexNow URL is invalid: ${value}`);
		}
		if (url.origin !== SITE_URL) {
			throw new Error(`Refusing to submit a URL outside ${SITE_URL}: ${value}`);
		}
		if (url.username || url.password || url.hash) {
			throw new Error(`IndexNow URL must not contain credentials or a fragment: ${value}`);
		}
	}

	return urls;
}

export function createPayload(urls, key = getIndexNowKey()) {
	return {
		host: new URL(SITE_URL).host,
		key,
		keyLocation: `${SITE_URL}/${key}.txt`,
		urlList: validateUrls(urls)
	};
}

function parseArguments(argv) {
	const options = {
		dryRun: false,
		sitemap: '',
		sitemapFile: '',
		previousSitemapFile: '',
		saveSitemapFile: '',
		urls: []
	};

	for (let index = 0; index < argv.length; index += 1) {
		const argument = argv[index];
		if (argument === '--dry-run') {
			options.dryRun = true;
		} else if (argument === '--sitemap') {
			options.sitemap = argv[++index] ?? '';
		} else if (argument === '--sitemap-file') {
			options.sitemapFile = argv[++index] ?? '';
		} else if (argument === '--previous-sitemap-file') {
			options.previousSitemapFile = argv[++index] ?? '';
		} else if (argument === '--save-sitemap-file') {
			options.saveSitemapFile = argv[++index] ?? '';
		} else if (argument === '--url') {
			options.urls.push(argv[++index] ?? '');
		} else {
			throw new Error(`Unknown IndexNow option: ${argument}`);
		}
	}

	if (!options.sitemap && !options.sitemapFile && options.urls.length === 0) {
		options.sitemap = `${SITE_URL}/sitemap.xml`;
	}
	return options;
}

async function readPreviousSitemap(filename) {
	if (!filename) return '';
	try {
		return await fs.readFile(path.resolve(filename), 'utf8');
	} catch (error) {
		if (error?.code === 'ENOENT') return '';
		throw error;
	}
}

async function saveSitemap(filename, xml) {
	if (!filename || !xml) return;
	const outputPath = path.resolve(filename);
	await fs.mkdir(path.dirname(outputPath), { recursive: true });
	await fs.writeFile(outputPath, xml, 'utf8');
}

async function readSitemap(options, fetchImpl) {
	if (options.sitemapFile) {
		const sitemapPath = path.resolve(options.sitemapFile);
		return fs.readFile(sitemapPath, 'utf8');
	}
	if (!options.sitemap) return '';

	const sitemapUrl = new URL(options.sitemap);
	if (sitemapUrl.origin !== SITE_URL) {
		throw new Error(`Refusing to read a sitemap outside ${SITE_URL}: ${sitemapUrl}`);
	}
	const response = await fetchImpl(sitemapUrl, {
		headers: { accept: 'application/xml, text/xml;q=0.9' }
	});
	if (!response.ok) {
		throw new Error(`Could not fetch ${sitemapUrl}: HTTP ${response.status}.`);
	}
	return response.text();
}

export async function runIndexNow(argv, { fetchImpl = fetch, environment = process.env } = {}) {
	const options = parseArguments(argv);
	const sitemapXml = await readSitemap(options, fetchImpl);
	const previousSitemapXml = await readPreviousSitemap(options.previousSitemapFile);
	const sitemapUrls = sitemapXml
		? options.previousSitemapFile
			? changedUrlsFromSitemaps(sitemapXml, previousSitemapXml)
			: urlsFromSitemap(sitemapXml)
		: [];
	const urlCandidates = [...sitemapUrls, ...options.urls];
	const urls = urlCandidates.length ? validateUrls(urlCandidates) : [];

	if (urls.length === 0) {
		if (!options.dryRun) await saveSitemap(options.saveSitemapFile, sitemapXml);
		return { dryRun: options.dryRun, skipped: true, payload: null, status: null };
	}

	const payload = createPayload(urls, getIndexNowKey(environment));

	if (options.dryRun) {
		return { dryRun: true, skipped: false, payload, status: null };
	}

	const response = await fetchImpl(INDEXNOW_ENDPOINT, {
		method: 'POST',
		headers: {
			accept: 'application/json, text/plain;q=0.9',
			'content-type': 'application/json; charset=utf-8'
		},
		body: JSON.stringify(payload)
	});
	if (!response.ok) {
		const details = (await response.text()).trim();
		throw new Error(
			`IndexNow rejected ${urls.length} URL(s): HTTP ${response.status}${details ? ` (${details})` : ''}.`
		);
	}

	await saveSitemap(options.saveSitemapFile, sitemapXml);
	return { dryRun: false, skipped: false, payload, status: response.status };
}

async function main() {
	const result = await runIndexNow(process.argv.slice(2));
	if (result.skipped) {
		console.log('IndexNow: sitemap is unchanged; no URLs submitted.');
		return;
	}
	if (result.dryRun) {
		console.log(`IndexNow dry run: validated ${result.payload.urlList.length} canonical URL(s).`);
		return;
	}
	console.log(
		`IndexNow: submitted ${result.payload.urlList.length} canonical URL(s); HTTP ${result.status}.`
	);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	main().catch((error) => {
		console.error(error instanceof Error ? error.message : error);
		process.exitCode = 1;
	});
}
