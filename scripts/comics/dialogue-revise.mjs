#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';

import { parseDocument } from 'yaml';

import {
	ComicToolError,
	loadEpisodeSources,
	parseCliArgs,
	readStructuredFile,
	writeFileIfChanged
} from './lib.mjs';
import { episodeCliOptions, outputPath, printHelp, runCli } from './_cli.mjs';

function nonEmpty(value) {
	return typeof value === 'string' && value.trim() === value && value.length > 0;
}

function compactWhitespace(value) {
	return String(value).replace(/\s+/g, ' ').trim();
}

function relativeManifestPath(options, sources) {
	const requested = options.manifest;
	return requested
		? path.resolve(options.root ?? process.cwd(), requested)
		: path.join(sources.episodeDirectory, 'script', 'dialogue-revisions.yaml');
}

function validateManifest(value, filename) {
	const errors = [];
	if (value?.format !== 'suvroghosh-comic-dialogue-revisions') {
		errors.push(`format must be "suvroghosh-comic-dialogue-revisions".`);
	}
	if (value?.formatVersion !== 1) errors.push('formatVersion must be 1.');
	if (!Array.isArray(value?.revisions)) errors.push('revisions must be an array.');
	const seen = new Set();
	for (const [index, revision] of (value?.revisions ?? []).entries()) {
		const label = `revisions[${index}]`;
		if (!nonEmpty(revision?.dialogueId)) errors.push(`${label}.dialogueId must be non-empty.`);
		if (seen.has(revision?.dialogueId)) {
			errors.push(`${label}.dialogueId duplicates "${revision.dialogueId}".`);
		}
		seen.add(revision?.dialogueId);
		if (!nonEmpty(revision?.before)) errors.push(`${label}.before must be non-empty.`);
		if (!nonEmpty(revision?.after)) errors.push(`${label}.after must be non-empty.`);
		if (revision?.before === revision?.after) errors.push(`${label} does not revise the line.`);
		if (!nonEmpty(revision?.reason)) errors.push(`${label}.reason must be non-empty.`);
		if (!['accepted', 'proposed'].includes(revision?.status)) {
			errors.push(`${label}.status must be accepted or proposed.`);
		}
		if (revision?.manualBreaks !== undefined) {
			if (
				!Array.isArray(revision.manualBreaks) ||
				revision.manualBreaks.length === 0 ||
				revision.manualBreaks.some((line) => !nonEmpty(line))
			) {
				errors.push(`${label}.manualBreaks must be a non-empty array of non-empty lines.`);
			} else if (
				compactWhitespace(revision.manualBreaks.join(' ')) !==
				compactWhitespace(revision.after)
			) {
				errors.push(`${label}.manualBreaks must reproduce the revised text exactly.`);
			}
		}
	}
	if (errors.length > 0) {
		throw new ComicToolError(`Invalid dialogue revision manifest ${filename}.`, errors);
	}
}

function dialogueIndex(sources) {
	const index = new Map();
	for (const [pageIndex, page] of sources.pages.entries()) {
		for (const [panelIndex, panel] of page.panels.entries()) {
			for (const [dialogueIndexValue, dialogue] of (panel.dialogue ?? []).entries()) {
				if (index.has(dialogue.id)) {
					throw new ComicToolError(`Duplicate canonical dialogue id "${dialogue.id}".`);
				}
				index.set(dialogue.id, {
					page,
					pageIndex,
					panel,
					panelIndex,
					dialogue,
					dialogueIndex: dialogueIndexValue,
					pageSource: sources.pageSources[pageIndex]
				});
			}
		}
	}
	return index;
}

function revisionReport(sources, manifestFile, records, changedFiles) {
	const accepted = records.filter((record) => record.status === 'applied');
	const alreadyCurrent = records.filter((record) => record.status === 'already-current');
	const proposed = records.filter((record) => record.status === 'proposed');
	const lines = [
		'# Dialogue revision application',
		'',
		`- Episode: ${sources.metadata.id} — ${sources.metadata.title}`,
		`- Manifest: \`${path.relative(sources.episodeDirectory, manifestFile).replaceAll('\\', '/')}\``,
		`- Accepted revisions applied: ${accepted.length}`,
		`- Accepted revisions already current: ${alreadyCurrent.length}`,
		`- Proposed revisions left untouched: ${proposed.length}`,
		`- Canonical page files changed: ${changedFiles.length}`,
		'',
		'Clean art is unaffected. Dialogue and lettering approval remain separate publication gates.',
		''
	];
	for (const record of records) {
		lines.push(
			`- **${record.dialogueId}** — ${record.status}; ${record.reason}`
		);
	}
	return `${lines.join('\n')}\n`;
}

await runCli(async () => {
	const options = parseCliArgs();
	if (
		printHelp(
			options,
			`Usage: node scripts/comics/dialogue-revise.mjs [--root PATH] [--series SLUG]
       [--episode ID|SLUG] [--episode-dir PATH] [--manifest PATH] [--output PATH]
       [--dry-run]

Apply an auditable dialogue-revision manifest to canonical panel scripts. Each accepted revision
must name the exact previous line, the replacement, and an editorial reason. Reruns are idempotent;
source drift stops the command instead of guessing. Proposed entries are reported but not applied.`
		)
	) {
		return;
	}

	const episodeOptions = episodeCliOptions(options);
	const sources = await loadEpisodeSources(episodeOptions);
	const manifestFile = relativeManifestPath(options, sources);
	const manifest = (await readStructuredFile(manifestFile)).value;
	validateManifest(manifest, manifestFile);
	const byDialogue = dialogueIndex(sources);
	const revisionsByPage = new Map();
	const records = [];

	for (const revision of manifest.revisions) {
		const target = byDialogue.get(revision.dialogueId);
		if (!target) {
			throw new ComicToolError(
				`Dialogue revision "${revision.dialogueId}" has no canonical dialogue record.`
			);
		}
		if (target.dialogue.text !== revision.before && target.dialogue.text !== revision.after) {
			throw new ComicToolError(
				`Dialogue revision "${revision.dialogueId}" drifted: canonical text is neither before nor after.`
			);
		}
		const status =
			revision.status === 'proposed'
				? 'proposed'
				: target.dialogue.text === revision.after
					? 'already-current'
					: 'applied';
		records.push({
			dialogueId: revision.dialogueId,
			reason: revision.reason,
			status
		});
		if (revision.status !== 'accepted') continue;
		const pageRevisions = revisionsByPage.get(target.pageSource.filename) ?? [];
		pageRevisions.push({ revision, target });
		revisionsByPage.set(target.pageSource.filename, pageRevisions);
	}

	const changedFiles = [];
	for (const [filename, revisions] of revisionsByPage) {
		const source = await fs.readFile(filename, 'utf8');
		const document = parseDocument(source, { prettyErrors: true, strict: true });
		if (document.errors.length > 0) {
			throw new ComicToolError(
				`Cannot revise malformed canonical page ${filename}: ${document.errors[0].message}`
			);
		}
		for (const { revision, target } of revisions) {
			const base = ['panels', target.panelIndex, 'dialogue', target.dialogueIndex];
			const textNode = document.getIn([...base, 'text'], true);
			if (!textNode || typeof textNode !== 'object' || !Object.hasOwn(textNode, 'value')) {
				throw new ComicToolError(
					`Dialogue "${revision.dialogueId}" does not have a mutable YAML text scalar.`
				);
			}
			textNode.value = revision.after;
			if (revision.manualBreaks) {
				document.setIn([...base, 'balloon', 'manualBreaks'], revision.manualBreaks);
			} else {
				document.deleteIn([...base, 'balloon', 'manualBreaks']);
			}
		}
		if (!options['dry-run'] && (await writeFileIfChanged(filename, String(document)))) {
			changedFiles.push(filename);
		}
	}

	const report = revisionReport(sources, manifestFile, records, changedFiles);
	const reportPath =
		outputPath(options) ??
		path.join(
			sources.episodeDirectory,
			'reports',
			`dialogue-revisions-${path.basename(manifestFile, path.extname(manifestFile))}.md`
		);
	if (!options['dry-run']) await writeFileIfChanged(reportPath, report);
	process.stdout.write(
		`Dialogue revisions: ${records.filter((record) => record.status === 'applied').length} applied, ${records.filter((record) => record.status === 'already-current').length} already current, ${records.filter((record) => record.status === 'proposed').length} proposed.\nCanonical page files changed: ${changedFiles.length}\n${options['dry-run'] ? 'Dry run; no files written.' : `Report: ${reportPath}`}\n`
	);
});
