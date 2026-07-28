#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';

import {
	loadEpisodeSources,
	parseCliArgs,
	readStructuredFile,
	sha256,
	stableJson,
	writeFileIfChanged
} from './lib.mjs';
import { episodeCliOptions, outputPath, printHelp, runCli } from './_cli.mjs';

function blankRightsRecord(existing = {}) {
	return {
		creator: existing.creator ?? null,
		generationMethod: existing.generationMethod ?? null,
		provider: existing.provider ?? null,
		sourceReferenceImages: existing.sourceReferenceImages ?? [],
		licenseOrOwnershipNote: existing.licenseOrOwnershipNote ?? null,
		humanEdits: existing.humanEdits ?? [],
		approvalBy: existing.approvalBy ?? null,
		approvalDate: existing.approvalDate ?? null,
		depictsRealPerson: existing.depictsRealPerson ?? false,
		thirdPartyAssets: existing.thirdPartyAssets ?? []
	};
}

async function digestAsset(sources, value) {
	if (!value) return null;
	const filename = value.startsWith('/')
		? path.join(sources.root, 'static', value.replace(/^[/\\]+/, ''))
		: path.join(sources.episodeDirectory, value);
	try {
		return sha256(await fs.readFile(filename));
	} catch (error) {
		if (error?.code === 'ENOENT') return null;
		throw error;
	}
}

await runCli(async () => {
	const options = parseCliArgs();
	if (
		printHelp(
			options,
			`Usage: node scripts/comics/provenance.mjs [--root PATH] [--series SLUG]
       [--episode ID|SLUG] [--episode-dir PATH] [--output PATH]

Create or refresh the complete cover/panel rights and provenance ledger while preserving
human-authored rights, edit, reference, and approval fields.`
		)
	) {
		return;
	}

	const sources = await loadEpisodeSources(episodeCliOptions(options));
	const filename = outputPath(options) ?? path.join(sources.episodeDirectory, 'provenance.json');
	let existing = {};
	try {
		existing = JSON.parse(await fs.readFile(filename, 'utf8'));
	} catch (error) {
		if (error?.code !== 'ENOENT') throw error;
	}
	const existingPanels = new Map((existing.panels ?? []).map((entry) => [entry.panelId, entry]));
	const coverFile = path.join(sources.episodeDirectory, 'cover.yaml');
	const coverSource = (await readStructuredFile(coverFile)).value;
	const existingCover = existing.cover ?? {};
	const selectedCoverFinalPath =
		coverSource.provenance?.finalPath ?? existingCover.finalPath ?? null;
	const cover = {
		id: 'cover',
		status: coverSource.status ?? 'artwork-pending',
		revision: coverSource.provenance?.promptRevision ?? 0,
		sourcePath: coverSource.provenance?.sourcePath ?? existingCover.sourcePath ?? null,
		finalPath: selectedCoverFinalPath,
		sourceSha256:
			coverSource.provenance?.sourceSha256 ??
			(await digestAsset(sources, coverSource.provenance?.sourcePath ?? existingCover.sourcePath)),
		finalSha256: await digestAsset(sources, selectedCoverFinalPath),
		promptFile: 'cover.yaml#artPrompt',
		rightsReady: false,
		...blankRightsRecord({
			...existingCover,
			creator: coverSource.provenance?.creator ?? existingCover.creator,
			provider: coverSource.provenance?.provider ?? existingCover.provider,
			generationMethod: coverSource.provenance?.sourceType ?? existingCover.generationMethod,
			sourceReferenceImages:
				coverSource.provenance?.sourceReferenceImages ?? existingCover.sourceReferenceImages,
			humanEdits: coverSource.provenance?.humanEdits ?? existingCover.humanEdits,
			licenseOrOwnershipNote:
				coverSource.provenance?.rightsNotes ?? existingCover.licenseOrOwnershipNote,
			approvalBy: coverSource.provenance?.humanApproval?.approvedBy ?? existingCover.approvalBy,
			approvalDate: coverSource.provenance?.humanApproval?.approvedAt ?? existingCover.approvalDate
		})
	};
	cover.rightsReady = Boolean(
		cover.status === 'final' &&
		cover.finalPath &&
		typeof cover.finalSha256 === 'string' &&
		/^[a-f0-9]{64}$/.test(cover.finalSha256) &&
		cover.creator &&
		cover.generationMethod &&
		cover.licenseOrOwnershipNote &&
		cover.approvalBy &&
		cover.approvalDate
	);

	const panels = [];
	for (const page of [...sources.pages].sort((left, right) => left.page - right.page)) {
		for (const panel of [...page.panels].sort((left, right) => left.panel - right.panel)) {
			const previous = existingPanels.get(panel.id) ?? {};
			const entry = {
				panelId: panel.id,
				page: page.page,
				panel: panel.panel,
				status: panel.art.status,
				revision: panel.art.revision,
				sourcePath: panel.art.source ?? null,
				finalPath: panel.art.final ?? null,
				sourceSha256: await digestAsset(sources, panel.art.source),
				finalSha256: await digestAsset(sources, panel.art.final),
				promptFile: `prompts/page-${String(page.page).padStart(3, '0')}/panel-${String(
					panel.panel
				).padStart(3, '0')}.txt`,
				rightsReady: false,
				...blankRightsRecord(previous)
			};
			entry.rightsReady = Boolean(
				entry.status === 'final' &&
				entry.finalPath &&
				entry.creator &&
				entry.generationMethod &&
				entry.licenseOrOwnershipNote &&
				entry.approvalBy &&
				entry.approvalDate
			);
			panels.push(entry);
		}
	}

	const manifest = {
		format: 'suvroghosh-comic-provenance',
		formatVersion: 1,
		seriesSlug: sources.metadata.seriesSlug,
		episodeId: sources.metadata.id,
		episodeSlug: sources.metadata.slug,
		sourceDigest: sources.sourceDigest,
		publicationReady: cover.rightsReady && panels.every((panel) => panel.rightsReady),
		counts: {
			cover: 1,
			panels: panels.length,
			finalPanels: panels.filter((panel) => panel.status === 'final').length,
			rightsReadyPanels: panels.filter((panel) => panel.rightsReady).length
		},
		cover,
		panels
	};
	const changed = await writeFileIfChanged(filename, stableJson(manifest));
	process.stdout.write(
		`Provenance ledger: ${filename}\nPanels: ${panels.length}; publication ready: ${manifest.publicationReady}\nChanged: ${changed ? 1 : 0} file(s)\n`
	);
});
