import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));
const reviewSetPath = fileURLToPath(
	new URL('../src/lib/visualizations/barnum-lab/data/editorial-review-set.v2.json', import.meta.url)
);
const approvalManifestPath = fileURLToPath(
	new URL(
		'../src/lib/visualizations/barnum-lab/data/editorial-review-manifest.v2.json',
		import.meta.url
	)
);
const checkOnly = process.argv.includes('--check');
const vite = await createServer({
	root: repositoryRoot,
	appType: 'custom',
	logLevel: 'error',
	server: { middlewareMode: true, hmr: false }
});

function sha256(value) {
	return createHash('sha256').update(value, 'utf8').digest('hex');
}

function pretty(value) {
	return JSON.stringify(value, null, '\t') + '\n';
}

function pendingAttestations() {
	return [
		{
			reviewer: null,
			method: null,
			status: 'pending',
			reviewedSha256: null,
			passCount: null,
			rejectCount: null,
			borderlineCount: null,
			notes: null
		},
		{
			reviewer: null,
			method: null,
			status: 'pending',
			reviewedSha256: null,
			passCount: null,
			rejectCount: null,
			borderlineCount: null,
			notes: null
		}
	];
}

function validAttestation(value, reviewSha256, lineCount) {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
	const allowed = new Set([
		'reviewer',
		'method',
		'status',
		'reviewedSha256',
		'passCount',
		'rejectCount',
		'borderlineCount',
		'notes'
	]);
	if (Object.keys(value).some((key) => !allowed.has(key))) return false;
	if (value.status === 'pending') {
		return (
			value.reviewer === null &&
			value.method === null &&
			value.reviewedSha256 === null &&
			value.passCount === null &&
			value.rejectCount === null &&
			value.borderlineCount === null &&
			value.notes === null
		);
	}
	if (value.status !== 'approved' && value.status !== 'rejected') return false;
	if (typeof value.reviewer !== 'string' || value.reviewer.trim() === '') return false;
	if (
		value.method !== 'independent-agent silent read-aloud simulation' &&
		value.method !== 'human read-aloud review'
	) {
		return false;
	}
	if (value.reviewedSha256 !== reviewSha256) return false;
	const counts = [value.passCount, value.rejectCount, value.borderlineCount];
	if (counts.some((count) => !Number.isInteger(count) || count < 0)) return false;
	if (counts.reduce((total, count) => total + count, 0) !== lineCount) return false;
	if (value.status === 'approved' && value.rejectCount !== 0) return false;
	return value.notes === null || typeof value.notes === 'string';
}

function attestationsForSnapshot(reviewSha256, lineCount) {
	if (!existsSync(approvalManifestPath)) return pendingAttestations();
	let current;
	try {
		current = JSON.parse(readFileSync(approvalManifestPath, 'utf8'));
	} catch {
		throw new Error('The Barnum editorial approval manifest is not valid JSON.');
	}
	if (current.reviewSetSha256 !== reviewSha256) return pendingAttestations();
	if (
		!Array.isArray(current.reviewerAttestations) ||
		current.reviewerAttestations.length !== 2 ||
		!current.reviewerAttestations.every((entry) => validAttestation(entry, reviewSha256, lineCount))
	) {
		throw new Error('The Barnum reviewer attestations do not match the v2 attestation schema.');
	}
	return current.reviewerAttestations;
}

function selectAcrossAxes(lines, count, usedTexts) {
	const byAxis = new Map();
	for (const line of [...lines].sort((left, right) => left.id.localeCompare(right.id))) {
		const bucket = byAxis.get(line.axis) ?? [];
		bucket.push(line);
		byAxis.set(line.axis, bucket);
	}
	const axes = [...byAxis.keys()].sort();
	const selected = [];
	for (let offset = 0; selected.length < count; offset += 1) {
		let added = false;
		for (const axis of axes) {
			const candidate = byAxis.get(axis)?.[offset];
			if (!candidate || usedTexts.has(candidate.text)) continue;
			selected.push(candidate);
			usedTexts.add(candidate.text);
			added = true;
			if (selected.length === count) break;
		}
		if (!added) break;
	}
	return selected;
}

try {
	const { createDefaultDisplayProfile, toGenerationProfile } = await vite.ssrLoadModule(
		'/src/lib/visualizations/barnum-lab/core/input-boundary.ts'
	);
	const { generateReading } = await vite.ssrLoadModule(
		'/src/lib/visualizations/barnum-lab/core/select-reading.ts'
	);
	const { SURFACE_SENTENCES_EN, FEEDBACK_SENTENCES_EN, SURFACE_SENTENCE_BANK_SHA256 } =
		await vite.ssrLoadModule(
			'/src/lib/visualizations/barnum-lab/data/surface-sentences.en.generated.ts'
		);
	const { DIRECT_ECHO_SENTENCES_EN } = await vite.ssrLoadModule(
		'/src/lib/visualizations/barnum-lab/data/direct-echoes.en.ts'
	);
	const { CORPUS_MANIFEST_HASH } = await vite.ssrLoadModule(
		'/src/lib/visualizations/barnum-lab/data/corpus-manifest.ts'
	);
	const { CORPUS_VERSION, ENGINE_VERSION } = await vite.ssrLoadModule(
		'/src/lib/visualizations/barnum-lab/core/version.ts'
	);
	const { READABILITY_TARGETS, surfaceReadability } = await vite.ssrLoadModule(
		'/src/lib/visualizations/barnum-lab/core/surface-audit.ts'
	);

	const firstOccurrenceById = new Map();
	for (let index = 0; index < 1_000; index += 1) {
		const seed = index.toString(16).padStart(16, '0');
		const profile = toGenerationProfile(createDefaultDisplayProfile(), seed);
		const deck = generateReading(profile, {
			count: 7,
			seedKey: 'editorial-review-representative-v2'
		});
		for (const statement of deck) {
			const sentenceId = statement.trace.fragmentIds[0];
			if (!firstOccurrenceById.has(sentenceId)) {
				firstOccurrenceById.set(sentenceId, {
					seed,
					slotId: statement.slotId
				});
			}
		}
	}

	const sampledGeneric = SURFACE_SENTENCES_EN.filter((line) => firstOccurrenceById.has(line.id));
	const genericMechanisms = [...new Set(sampledGeneric.map((line) => line.mechanism))].sort();
	const usedTexts = new Set();
	const selected = [];
	for (const mechanism of genericMechanisms) {
		const mechanismLines = sampledGeneric.filter((line) => line.mechanism === mechanism);
		selected.push(...selectAcrossAxes(mechanismLines, 28, usedTexts));
	}
	selected.push(...selectAcrossAxes(FEEDBACK_SENTENCES_EN, 28, usedTexts));
	selected.push(
		...selectAcrossAxes(DIRECT_ECHO_SENTENCES_EN, DIRECT_ECHO_SENTENCES_EN.length, usedTexts)
	);

	if (
		selected.length < 200 ||
		new Set(selected.map((line) => line.text)).size !== selected.length
	) {
		throw new Error(
			`Editorial export must contain at least 200 unique complete lines; selected ${selected.length}.`
		);
	}

	const entries = selected.map((line, index) => {
		const occurrence = firstOccurrenceById.get(line.id);
		return {
			reviewIndex: index + 1,
			id: line.id,
			text: line.text,
			channel: line.channel,
			mechanism: line.mechanism,
			semanticFamilyId: line.semanticFamilyId,
			axis: line.axis,
			pole: line.pole,
			wordCount: line.wordCount,
			sourceSeed: occurrence?.seed ?? null,
			sourceSlotId: occurrence?.slotId ?? null
		};
	});
	const reviewSet = {
		schemaVersion: 'barnum-editorial-review-v2',
		corpusVersion: CORPUS_VERSION,
		engineVersion: ENGINE_VERSION,
		corpusManifestHash: CORPUS_MANIFEST_HASH,
		surfaceSentenceBankSha256: SURFACE_SENTENCE_BANK_SHA256,
		selection: {
			representativeSessionCount: 1_000,
			genericLinesPerMechanism: 28,
			feedbackLineCount: entries.filter((entry) => entry.channel === 'feedback-reading').length,
			directEchoLineCount: entries.filter((entry) => entry.channel === 'direct-echo').length,
			lineCount: entries.length,
			uniqueTextCount: new Set(entries.map((entry) => entry.text)).size,
			mechanisms: [...new Set(entries.map((entry) => entry.mechanism))].sort(),
			sourceSeedCount: new Set(
				entries.flatMap((entry) => (entry.sourceSeed === null ? [] : [entry.sourceSeed]))
			).size
		},
		entries
	};
	const reviewBytes = pretty(reviewSet);
	const reviewSha256 = sha256(reviewBytes);
	const allSurface = [
		...SURFACE_SENTENCES_EN,
		...FEEDBACK_SENTENCES_EN,
		...DIRECT_ECHO_SENTENCES_EN
	];
	const readabilityExceptions = allSurface.flatMap((line) => {
		const score = surfaceReadability(line.text);
		return score.passesTargets
			? []
			: [
					{
						id: line.id,
						fleschReadingEase: score.fleschReadingEase,
						fleschKincaidGrade: score.fleschKincaidGrade
					}
				];
	});
	const approvalManifest = {
		schemaVersion: 'barnum-editorial-approval-v2',
		corpusVersion: CORPUS_VERSION,
		engineVersion: ENGINE_VERSION,
		corpusManifestHash: CORPUS_MANIFEST_HASH,
		reviewSetFile: 'editorial-review-set.v2.json',
		reviewSetSha256: reviewSha256,
		lineCount: entries.length,
		criteria: [
			'Could an ordinary person say this without rehearsing it?',
			'Is the meaning clear after hearing it once?',
			'Does it contain one idea or one clean tension?',
			'Is it safe and low stakes?',
			'Is it broad without becoming nonsense?',
			'Does it avoid claiming knowledge the system does not have?'
		],
		automatedChecks: {
			completeRenderedLines: true,
			uniqueText: true,
			minimumLineCount: true,
			mechanismAndSeedProvenanceIncluded: true
		},
		readabilityReview: {
			policy:
				'Editorial targets are reported per line and are not hidden by the SurfaceText brand.',
			targets: READABILITY_TARGETS,
			corpusLineCount: allSurface.length,
			exceptionCount: readabilityExceptions.length,
			exceptions: readabilityExceptions
		},
		reviewerAttestations: attestationsForSnapshot(reviewSha256, entries.length)
	};
	const manifestBytes = pretty(approvalManifest);

	if (checkOnly) {
		const stale = [
			[reviewSetPath, reviewBytes],
			[approvalManifestPath, manifestBytes]
		].filter(
			([path, expected]) =>
				!existsSync(path) || readFileSync(path, 'utf8').replace(/\r\n/g, '\n') !== expected
		);
		if (stale.length > 0) {
			console.error('Barnum editorial review artifacts are stale. Regenerate the fixed snapshot.');
			process.exitCode = 1;
		} else {
			console.log(`Barnum editorial review snapshot is current (${reviewSha256}).`);
		}
	} else {
		writeFileSync(reviewSetPath, reviewBytes, 'utf8');
		writeFileSync(approvalManifestPath, manifestBytes, 'utf8');
		console.log(
			`Wrote ${entries.length} unique Barnum review lines (${reviewSha256}) to ${reviewSetPath}.`
		);
	}
} finally {
	await vite.close();
}
