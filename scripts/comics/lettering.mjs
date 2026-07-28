#!/usr/bin/env node

import path from 'node:path';

import {
	auditLettering,
	formatLetteringAudit,
	loadEpisodeSources,
	parseCliArgs,
	scaffoldLetteringGeometry,
	writeFileIfChanged
} from './lib.mjs';
import { episodeCliOptions, outputPath, printHelp, runCli } from './_cli.mjs';

await runCli(async () => {
	const options = parseCliArgs();
	if (
		printHelp(
			options,
			`Usage: node scripts/comics/lettering.mjs [--root PATH] [--series SLUG] [--episode ID|SLUG]
       [--episode-dir PATH] [--init] [--force] [--strict] [--output PATH] [--no-report]

Scaffold or audit deterministic comic-lettering geometry. The audit checks speaker anchors,
face/body/prop exclusion zones, balloon collisions, curved tail routes, and human approval state.

--init     Add needs-review records for every dialogue panel without overwriting reviewed records.
--force    With --init, replace an invalid existing geometry file before scaffolding.
--strict   Require every dialogue panel geometry record to have status: approved.`
		)
	) {
		return;
	}

	const episodeOptions = episodeCliOptions(options);
	let sources = await loadEpisodeSources(episodeOptions);
	if (options.init) {
		const scaffold = await scaffoldLetteringGeometry(sources, {
			force: options.force === true
		});
		process.stdout.write(
			`Lettering geometry: ${scaffold.file}\nDialogue panels scaffolded: ${scaffold.panelCount}\nChanged: ${scaffold.changed ? 1 : 0} file(s)\n`
		);
		sources = await loadEpisodeSources(episodeOptions);
	}

	const audit = auditLettering(sources, { requireApproved: options.strict === true });
	if (!options['no-report']) {
		const reportPath =
			outputPath(options) ?? path.join(sources.episodeDirectory, 'reports', 'lettering.md');
		await writeFileIfChanged(reportPath, formatLetteringAudit(audit));
		process.stdout.write(`Report: ${reportPath}\n`);
	}
	process.stdout.write(
		`Lettering ready: ${audit.ready ? 'yes' : 'no'}\nMissing geometry: ${audit.summary.missingGeometry}\nAwaiting approval: ${audit.summary.unapprovedGeometry}\nStructure issues: ${audit.summary.structureIssues}\nCollision or routing issues: ${audit.summary.layoutIssues}\n`
	);
	if (!options.init && !audit.ready) process.exitCode = 1;
});
