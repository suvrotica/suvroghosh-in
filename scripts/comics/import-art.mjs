#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';

import sharp from 'sharp';

import {
	COMIC_PANEL_STATUSES,
	ComicToolError,
	parseCliArgs,
	readStructuredFile,
	resolveEpisodeContext,
	sha256,
	writeFileIfChanged
} from './lib.mjs';
import { episodeCliOptions, printHelp, runCli } from './_cli.mjs';

const RASTER_PATTERN = /^(p(\d{2})-(\d{2}))__r(\d+)\.(avif|jpe?g|png|tiff?|webp)$/i;
const IMPORTABLE_STATUSES = new Set(['needs-review', 'approved', 'final']);

function toPosix(value) {
	return value.split(path.sep).join('/');
}

function parsePages(value) {
	if (value === undefined) return null;
	const pages = String(value)
		.split(',')
		.map((part) => Number(part.trim()));
	if (pages.length === 0 || pages.some((page) => !Number.isInteger(page) || page <= 0)) {
		throw new ComicToolError('--pages must be a comma-separated list of positive integers.');
	}
	return new Set(pages);
}

async function walk(directory) {
	const files = [];
	let entries;
	try {
		entries = await fs.readdir(directory, { withFileTypes: true });
	} catch (error) {
		if (error?.code === 'ENOENT') return files;
		throw error;
	}
	for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name, 'en'))) {
		const filename = path.join(directory, entry.name);
		if (entry.isDirectory()) files.push(...(await walk(filename)));
		if (entry.isFile()) files.push(filename);
	}
	return files;
}

async function selectPanelSources(rawDirectory, selectedPages) {
	const selected = new Map();
	for (const filename of await walk(rawDirectory)) {
		const match = RASTER_PATTERN.exec(path.basename(filename));
		if (!match) continue;
		const [, panelId, pageText, panelText, revisionText, extension] = match;
		const page = Number(pageText);
		if (selectedPages && !selectedPages.has(page)) continue;
		const candidate = {
			filename,
			panelId: panelId.toLocaleLowerCase('en'),
			page,
			panel: Number(panelText),
			revision: Number(revisionText),
			extension: extension.toLocaleLowerCase('en').replace('jpeg', 'jpg').replace('tiff', 'tif')
		};
		const existing = selected.get(candidate.panelId);
		if (
			!existing ||
			candidate.revision > existing.revision ||
			(candidate.revision === existing.revision &&
				candidate.filename.localeCompare(existing.filename, 'en') > 0)
		) {
			selected.set(candidate.panelId, candidate);
		}
	}
	return [...selected.values()].sort(
		(left, right) => left.page - right.page || left.panel - right.panel
	);
}

async function copyApproved(source, destination) {
	const sourceBytes = await fs.readFile(source);
	let destinationBytes;
	try {
		destinationBytes = await fs.readFile(destination);
	} catch (error) {
		if (error?.code !== 'ENOENT') throw error;
	}
	if (destinationBytes) {
		if (sha256(destinationBytes) !== sha256(sourceBytes)) {
			throw new ComicToolError(`Refusing to overwrite a different approved asset: ${destination}`);
		}
		return false;
	}
	await fs.mkdir(path.dirname(destination), { recursive: true });
	await fs.copyFile(source, destination);
	return true;
}

function replacePanelArt(source, panelId, artLine) {
	const marker = `  - id: ${panelId}`;
	const start = source.indexOf(marker);
	if (start < 0) {
		throw new ComicToolError(`Panel ${panelId} was not found in its canonical page source.`);
	}
	const next = source.indexOf('\n  - id: ', start + marker.length);
	const end = next < 0 ? source.length : next;
	const segment = source.slice(start, end);
	const artMatch = /^    art:.*$/m.exec(segment);
	if (!artMatch) {
		throw new ComicToolError(`Panel ${panelId} has no art record to update safely.`);
	}
	const artStart = artMatch.index;
	const afterArtStart = artStart + artMatch[0].length;
	const nextPanelField = /^    [A-Za-z][A-Za-z0-9]*:/m.exec(segment.slice(afterArtStart));
	const artEnd = nextPanelField
		? afterArtStart + nextPanelField.index
		: segment.length - (segment.endsWith('\n') ? 1 : 0);
	const updatedSegment = `${segment.slice(0, artStart)}${artLine}${segment.slice(artEnd)}`;
	return `${source.slice(0, start)}${updatedSegment}${source.slice(end)}`;
}

function renderArtLine({ status, revision, source, final, width, height, anchor }) {
	const fields = [
		`status: ${status}`,
		`revision: ${revision}`,
		`source: ${source}`,
		`final: ${final ?? 'null'}`,
		`width: ${width}`,
		`height: ${height}`,
		...(anchor ? [`anchor: ${anchor}`] : [])
	];
	return `    art: { ${fields.join(', ')} }`;
}

await runCli(async () => {
	const options = parseCliArgs();
	if (
		printHelp(
			options,
			`Usage: node scripts/comics/import-art.mjs [--root PATH] [--series SLUG]
       [--episode ID|SLUG] [--episode-dir PATH] [--pages 1,2]
       [--status needs-review|approved|final] [--raw-dir PATH] [--approved-dir PATH]
       [--dry-run]

Import the highest rN panel file found for each panel under panels/raw, verify its raster
dimensions, copy approved/final selections non-destructively, and update only canonical art lines.`
		)
	) {
		return;
	}

	const status = String(options.status ?? 'approved').toLocaleLowerCase('en');
	if (!IMPORTABLE_STATUSES.has(status) || !COMIC_PANEL_STATUSES.includes(status)) {
		throw new ComicToolError('--status must be one of needs-review, approved, or final.');
	}
	const selectedPages = parsePages(options.pages);
	const context = await resolveEpisodeContext(episodeCliOptions(options));
	const rawDirectory = path.resolve(
		context.episodeDirectory,
		options['raw-dir'] ?? path.join('panels', 'raw')
	);
	const approvedDirectory = path.resolve(
		context.episodeDirectory,
		options['approved-dir'] ?? path.join('panels', 'approved')
	);
	const candidates = await selectPanelSources(rawDirectory, selectedPages);
	if (candidates.length === 0) {
		throw new ComicToolError(
			`No panel art matching ${RASTER_PATTERN} found under ${rawDirectory}.`
		);
	}

	const pages = new Map();
	const results = [];
	for (const candidate of candidates) {
		const pageFile = path.join(
			context.pagesDirectory,
			`page-${String(candidate.page).padStart(3, '0')}.yaml`
		);
		if (!pages.has(candidate.page)) {
			const parsed = await readStructuredFile(pageFile);
			pages.set(candidate.page, {
				filename: pageFile,
				value: parsed.value,
				source: parsed.source
			});
		}
		const pageRecord = pages.get(candidate.page);
		const panel = pageRecord.value?.panels?.find((entry) => entry?.id === candidate.panelId);
		if (!panel || Number(panel.panel) !== candidate.panel) {
			throw new ComicToolError(
				`Raw asset ${candidate.filename} does not match a canonical panel coordinate.`
			);
		}
		if (Number(panel.art?.revision ?? 0) > candidate.revision && options.replace !== true) {
			throw new ComicToolError(
				`Panel ${candidate.panelId} already has revision ${panel.art.revision}; refusing older r${candidate.revision}.`
			);
		}

		const metadata = await sharp(candidate.filename, {
			animated: false,
			failOn: 'error'
		}).metadata();
		if (!metadata.width || !metadata.height) {
			throw new ComicToolError(`Could not read raster dimensions from ${candidate.filename}.`);
		}
		const sourcePath = toPosix(path.relative(context.episodeDirectory, candidate.filename));
		let finalPath = null;
		let copied = false;
		if (status === 'approved' || status === 'final') {
			const approvedFile = path.join(
				approvedDirectory,
				`page-${String(candidate.page).padStart(3, '0')}`,
				`${candidate.panelId}__r${candidate.revision}.${candidate.extension}`
			);
			finalPath = toPosix(path.relative(context.episodeDirectory, approvedFile));
			if (!options['dry-run']) {
				copied = await copyApproved(candidate.filename, approvedFile);
			}
		}
		const art = {
			status,
			revision: candidate.revision,
			source: sourcePath,
			final: finalPath,
			width: metadata.width,
			height: metadata.height,
			anchor: panel.art?.anchor
		};
		pageRecord.source = replacePanelArt(pageRecord.source, candidate.panelId, renderArtLine(art));
		results.push({
			panelId: candidate.panelId,
			page: candidate.page,
			panel: candidate.panel,
			status,
			revision: candidate.revision,
			source: sourcePath,
			final: finalPath,
			width: metadata.width,
			height: metadata.height,
			sha256: sha256(await fs.readFile(candidate.filename)),
			copied
		});
	}

	let changedPages = 0;
	if (!options['dry-run']) {
		for (const page of [...pages.values()].sort((left, right) =>
			left.filename.localeCompare(right.filename, 'en')
		)) {
			if (await writeFileIfChanged(page.filename, page.source)) changedPages += 1;
		}
	}
	process.stdout.write(
		`Imported ${results.length} panel asset(s) as ${status} across ${pages.size} page(s).\n` +
			`Changed canonical page files: ${options['dry-run'] ? 0 : changedPages}.\n` +
			`${options['dry-run'] ? 'Dry run; no files copied or changed.' : `Copied ${results.filter((entry) => entry.copied).length} approved asset(s).`}\n`
	);
});
