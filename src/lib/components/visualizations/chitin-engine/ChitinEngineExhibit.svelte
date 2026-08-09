<script lang="ts">
	import { onMount, tick } from 'svelte';
	import ComparisonPlate from './ComparisonPlate.svelte';
	import CreatureControls from './CreatureControls.svelte';
	import CreatureViewport from './CreatureViewport.svelte';
	import KeyboardHelp from './KeyboardHelp.svelte';
	import MutationComparison from './MutationComparison.svelte';
	import SpecimenArchive from './SpecimenArchive.svelte';
	import SpecimenReadout from './SpecimenReadout.svelte';
	import {
		clearArchive,
		createArchiveRecord,
		loadArchive,
		removeArchiveRecord,
		saveArchive,
		upsertArchiveRecord
	} from '$lib/visualizations/chitin-engine/archive';
	import { crossoverGenomes } from '$lib/visualizations/chitin-engine/crossover';
	import {
		composeContactSheet,
		createExportFilename,
		downloadBlob,
		downloadCanvasPng,
		downloadGenomeJson,
		type ExportScale
	} from '$lib/visualizations/chitin-engine/export';
	import { renderFallbackFrame } from '$lib/visualizations/chitin-engine/fallback-renderer';
	import {
		DEFAULT_EXHIBIT_STATE,
		normalizeExhibitState,
		normalizeGenome,
		parseGenomeJson
	} from '$lib/visualizations/chitin-engine/genome';
	import { DEFAULT_MUTATION_LOCKS, mutateGenome } from '$lib/visualizations/chitin-engine/mutation';
	import { buildCreaturePhenotype } from '$lib/visualizations/chitin-engine/phenotype-builder';
	import { createCreaturePose } from '$lib/visualizations/chitin-engine/pose';
	import {
		CREATURE_PRESETS,
		getCreaturePreset,
		getPalette,
		getWorldPreset
	} from '$lib/visualizations/chitin-engine/presets';
	import { generateFriendlySeed } from '$lib/visualizations/chitin-engine/seed';
	import {
		parseChitinUrlState,
		writeChitinStateToUrl
	} from '$lib/visualizations/chitin-engine/url-state';
	import type {
		ArchiveRecord,
		CreatureGenome,
		ExhibitState,
		GenomeGroup,
		MutationLocks,
		ViewMode,
		WorldId
	} from '$lib/visualizations/chitin-engine/types';
	import type {
		ChitinEngineStatus,
		ChitinRendererKind
	} from '$lib/visualizations/chitin-engine/engine';

	type ViewportHandle = {
		focusCanvas: () => void;
		getCanvasElement: () => HTMLCanvasElement | undefined;
		getRendererKind: () => ChitinRendererKind | undefined;
		exportStill: (options: {
			width: number;
			height: number;
			scale: ExportScale;
			transparent?: boolean;
			includeLabel?: boolean;
		}) => Promise<Blob>;
	};

	type HistoryEntry = Readonly<{
		state: ExhibitState;
		label: string;
	}>;

	const VIEW_MODES: readonly ViewMode[] = [
		'specimen',
		'anatomy',
		'gait',
		'surface',
		'silhouette',
		'fluorescence',
		'depth'
	];

	let exhibitRoot: HTMLElement;
	let viewport: ViewportHandle | undefined;
	let exhibitState = $state<ExhibitState>(snapshot(DEFAULT_EXHIBIT_STATE));
	let seedDraft = $state(DEFAULT_EXHIBIT_STATE.genome.seed);
	let mutationStrength = $state(0.28);
	let mutationLocks = $state<MutationLocks>({ ...DEFAULT_MUTATION_LOCKS });
	let mutationIndex = $state(0);
	let crossoverIndex = $state(0);
	let historyEntries = $state<HistoryEntry[]>([
		{ state: snapshot(DEFAULT_EXHIBIT_STATE), label: 'Initial specimen' }
	]);
	let historyIndex = $state(0);
	let comparisonParent = $state<CreatureGenome | undefined>();
	let changedGroups = $state<readonly string[]>([]);
	let comparing = $state(false);
	let selectedSegment = $state(0);
	let archiveRecords = $state<ArchiveRecord[]>([]);
	let parentA = $state<string | undefined>();
	let parentB = $state<string | undefined>();
	let rendererStatus = $state<ChitinEngineStatus>('loading');
	let rendererKind = $state<ChitinRendererKind>('canvas2d');
	let rendererMessage = $state('Preparing the specimen chamber.');
	let liveMessage = $state('The Chitin Engine is ready for inspection.');
	let threatActive = $state(false);
	let startleSerial = $state(0);
	let singleStepSerial = $state(0);
	let posterMode = $state(false);
	let mounted = false;
	let urlTimer: ReturnType<typeof setTimeout> | undefined;
	let focusAfterFullscreen: HTMLElement | undefined;

	let phenotype = $derived(buildCreaturePhenotype(exhibitState.genome));
	let world = $derived(getWorldPreset(exhibitState.genome.world));
	let canUndo = $derived(historyIndex > 0);
	let canRedo = $derived(historyIndex < historyEntries.length - 1);
	let accent = $derived(cssColour(getPalette(exhibitState.genome.palette).emission));

	function snapshot(input: ExhibitState): ExhibitState {
		return normalizeExhibitState({ ...input, genome: { ...input.genome } });
	}

	function cssColour(colour: readonly [number, number, number]): string {
		const divisor = Math.max(...colour) > 1 ? 255 : 1;
		return `rgb(${colour.map((channel) => Math.round((channel / divisor) * 255)).join(' ')})`;
	}

	function sameState(left: ExhibitState, right: ExhibitState): boolean {
		return JSON.stringify(left) === JSON.stringify(right);
	}

	function announce(message: string) {
		liveMessage = message;
	}

	function scheduleUrlWrite() {
		if (!mounted || typeof window === 'undefined') return;
		if (urlTimer) clearTimeout(urlTimer);
		urlTimer = setTimeout(() => {
			const url = writeChitinStateToUrl(window.location.href, exhibitState);
			window.history.replaceState(window.history.state, '', url);
		}, 90);
	}

	function commitHistory(next: ExhibitState, label: string) {
		const current = historyEntries[historyIndex]?.state;
		if (current && sameState(current, next)) return;
		historyEntries = [
			...historyEntries.slice(0, historyIndex + 1),
			{ state: snapshot(next), label }
		].slice(-40);
		historyIndex = historyEntries.length - 1;
	}

	function applyState(nextInput: ExhibitState, commit: boolean, label: string, syncUrl = true) {
		const next = snapshot(nextInput);
		exhibitState = next;
		seedDraft = next.genome.seed;
		if (commit) commitHistory(next, label);
		if (syncUrl) scheduleUrlWrite();
	}

	function applyGenomePatch(patch: Partial<CreatureGenome>, commit = false) {
		const genome = normalizeGenome({ ...exhibitState.genome, ...patch }, exhibitState.genome);
		applyState(
			{ ...exhibitState, genome },
			commit,
			commit ? 'Edited procedural genome' : 'Previewed procedural genome'
		);
	}

	function applyDisplayPatch(patch: Partial<ExhibitState>, commit = false) {
		applyState(
			{ ...exhibitState, ...patch, genome: exhibitState.genome },
			commit,
			commit ? 'Edited chamber state' : 'Previewed chamber state'
		);
	}

	function choosePreset(id: CreatureGenome['preset']) {
		const preset = getCreaturePreset(id);
		comparisonParent = exhibitState.genome;
		changedGroups = [];
		applyState({ ...exhibitState, genome: preset.genome }, true, `Loaded ${preset.name}`);
		selectedSegment = 0;
		announce(`${preset.name} loaded from its exact curated genome.`);
	}

	function chooseWorld(id: WorldId) {
		applyGenomePatch({ world: id }, true);
		announce(`${getWorldPreset(id).name} applied as a speculative visual heuristic.`);
	}

	function hatch() {
		try {
			const seed = generateFriendlySeed();
			comparisonParent = exhibitState.genome;
			changedGroups = [];
			applyGenomePatch({ seed, preset: 'unfiled-specimen' }, true);
			selectedSegment = 0;
			startleSerial += 1;
			announce(`Hatched deterministic specimen ${seed}.`);
		} catch (error) {
			announce(error instanceof Error ? error.message : 'A new seed could not be generated.');
		}
	}

	function hatchSeed() {
		applyGenomePatch({ seed: seedDraft, preset: 'unfiled-specimen' }, true);
		selectedSegment = 0;
		startleSerial += 1;
		announce(`Rebuilt the chamber from seed ${exhibitState.genome.seed}.`);
	}

	function mutate() {
		const parent = exhibitState.genome;
		mutationIndex += 1;
		const result = mutateGenome(parent, mutationIndex, mutationStrength, mutationLocks);
		comparisonParent = parent;
		changedGroups = result.changedGroups;
		applyState({ ...exhibitState, genome: result.genome }, true, `Mutation ${mutationIndex}`);
		startleSerial += 1;
		announce(
			result.changedGroups.length > 0
				? `Mutation ${mutationIndex} changed ${result.changedGroups.join(', ')}.`
				: 'Every mutable group is locked; the specimen was unchanged.'
		);
	}

	function setMutationLock(group: GenomeGroup, value: boolean) {
		mutationLocks = { ...mutationLocks, [group]: value };
	}

	function undo() {
		if (!canUndo) return;
		historyIndex -= 1;
		const entry = historyEntries[historyIndex];
		applyState(entry.state, false, entry.label);
		announce(`Undo: ${entry.label}.`);
	}

	function redo() {
		if (!canRedo) return;
		historyIndex += 1;
		const entry = historyEntries[historyIndex];
		applyState(entry.state, false, entry.label);
		announce(`Redo: ${entry.label}.`);
	}

	function resetPreset() {
		choosePreset(exhibitState.genome.preset);
		exhibitState = snapshot({
			...DEFAULT_EXHIBIT_STATE,
			genome: getCreaturePreset(exhibitState.genome.preset).genome
		});
		commitHistory(exhibitState, 'Reset exact preset');
		scheduleUrlWrite();
		announce('Restored the exact curated genome and chamber defaults.');
	}

	function rendererChanged(
		status: ChitinEngineStatus,
		message: string,
		renderer: ChitinRendererKind
	) {
		rendererStatus = status;
		rendererMessage = message;
		rendererKind = renderer;
		if (status === 'fallback' || status === 'context-lost' || status === 'error') announce(message);
	}

	async function exportPng(scale: ExportScale) {
		try {
			announce(`Rendering a ${scale}× PNG. Larger exports may be safely reduced to fit memory.`);
			const canvas = viewport?.getCanvasElement();
			const bounds = canvas?.getBoundingClientRect();
			const blob = await viewport?.exportStill({
				width: Math.max(1, Math.round(bounds?.width ?? 1200)),
				height: Math.max(1, Math.round(bounds?.height ?? 750)),
				scale,
				includeLabel: true
			});
			if (!blob) throw new Error('The specimen renderer is not ready.');
			downloadBlob(
				blob,
				createExportFilename(phenotype.informalName, exhibitState.genome.seed, 'png')
			);
			announce(`${scale}× specimen PNG downloaded.`);
		} catch (error) {
			announce(error instanceof Error ? error.message : 'PNG export failed.');
		}
	}

	function exportGenome(genome = exhibitState.genome, name = phenotype.informalName) {
		try {
			downloadGenomeJson(genome, { name, seed: genome.seed });
			announce('Versioned genome JSON downloaded.');
		} catch (error) {
			announce(error instanceof Error ? error.message : 'Genome export failed.');
		}
	}

	async function importGenome(file: File) {
		try {
			const result = parseGenomeJson(await file.text());
			comparisonParent = exhibitState.genome;
			changedGroups = [];
			applyState({ ...exhibitState, genome: result.genome }, true, 'Imported genome');
			announce(
				result.issues.length > 0
					? `Genome imported with ${result.issues.length} bounded repair${result.issues.length === 1 ? '' : 's'}.`
					: 'Genome imported and validated.'
			);
		} catch (error) {
			announce(error instanceof Error ? error.message : 'Genome import failed.');
		}
	}

	async function copyLink() {
		try {
			const url = writeChitinStateToUrl(window.location.href, exhibitState);
			url.searchParams.delete('ce_poster');
			await navigator.clipboard.writeText(url.toString());
			announce('A versioned link to this exact specimen and chamber state was copied.');
		} catch {
			announce('Clipboard access was denied; the current address still contains the share state.');
		}
	}

	async function toggleFullscreen() {
		try {
			if (document.fullscreenElement) {
				await document.exitFullscreen();
				return;
			}
			focusAfterFullscreen = document.activeElement as HTMLElement | undefined;
			await exhibitRoot.requestFullscreen();
			await tick();
			viewport?.focusCanvas();
		} catch {
			announce('Fullscreen is unavailable in this browser or embedding context.');
		}
	}

	function storage(): Storage | undefined {
		try {
			return window.localStorage;
		} catch {
			return undefined;
		}
	}

	function savePinned() {
		const record = createArchiveRecord(
			exhibitState.genome,
			phenotype.informalName,
			new Date().toISOString()
		);
		const target = storage();
		if (!target) {
			archiveRecords = [record, ...archiveRecords].slice(0, 12);
			announce('Pinned for this session; persistent browser storage is unavailable.');
			return;
		}
		const result = upsertArchiveRecord(target, record);
		archiveRecords = result.ok
			? [...result.records]
			: [record, ...archiveRecords.filter((item) => item.id !== record.id)].slice(0, 12);
		announce(
			result.ok
				? 'Specimen pinned in this browser.'
				: (result.issues.at(-1) ?? 'Archive write failed.')
		);
	}

	function openRecord(record: ArchiveRecord) {
		comparisonParent = exhibitState.genome;
		applyState({ ...exhibitState, genome: record.genome }, true, `Opened ${record.label}`);
		announce(`${record.label} restored from the local catalogue.`);
	}

	function deleteRecord(id: string) {
		const target = storage();
		if (target) {
			const result = removeArchiveRecord(target, id);
			archiveRecords = result.ok
				? [...result.records]
				: archiveRecords.filter((item) => item.id !== id);
		} else archiveRecords = archiveRecords.filter((item) => item.id !== id);
		if (parentA === id) parentA = undefined;
		if (parentB === id) parentB = undefined;
		announce('Specimen removed from the local catalogue.');
	}

	function renameRecord(id: string, label: string) {
		archiveRecords = archiveRecords.map((record) =>
			record.id === id
				? { ...record, label: label.trim().slice(0, 48) || 'Unlabelled specimen' }
				: record
		);
		const target = storage();
		if (target) saveArchive(target, archiveRecords);
	}

	function clearRecords() {
		const target = storage();
		if (target) clearArchive(target);
		archiveRecords = [];
		parentA = undefined;
		parentB = undefined;
		announce('The local specimen catalogue was cleared.');
	}

	function chooseParent(slot: 'A' | 'B', id: string) {
		if (slot === 'A') parentA = parentA === id ? undefined : id;
		else parentB = parentB === id ? undefined : id;
	}

	function spliceParents() {
		const first = archiveRecords.find((record) => record.id === parentA);
		const second = archiveRecords.find((record) => record.id === parentB);
		if (!first || !second) return;
		crossoverIndex += 1;
		const child = crossoverGenomes(first.genome, second.genome, crossoverIndex);
		comparisonParent = first.genome;
		changedGroups = Object.entries(child.sourceByGroup)
			.filter(([, source]) => source === 'b')
			.map(([group]) => group);
		applyState({ ...exhibitState, genome: child.genome }, true, `Crossover ${crossoverIndex}`);
		comparing = true;
		announce(
			`Spliced whole parameter blocks from ${first.label} and ${second.label}; ${child.repairs.length} compatibility repairs applied.`
		);
	}

	async function exportContactSheet() {
		const curated = CREATURE_PRESETS.filter((preset) => preset.id !== 'unfiled-specimen').map(
			(preset) => ({ genome: preset.genome, label: preset.name })
		);
		const supplied = archiveRecords.map((record) => ({
			genome: record.genome,
			label: record.label
		}));
		if (!supplied.some((item) => item.genome.seed === exhibitState.genome.seed)) {
			supplied.unshift({ genome: exhibitState.genome, label: phenotype.informalName });
		}
		const targetCount = supplied.length <= 4 ? 4 : supplied.length <= 6 ? 6 : 9;
		for (const candidate of curated) {
			if (supplied.length >= targetCount) break;
			if (!supplied.some((item) => item.genome.seed === candidate.genome.seed))
				supplied.push(candidate);
		}
		const tiles = supplied.slice(0, targetCount).map((item) => ({
			value: item.genome,
			name: item.label,
			seed: item.genome.seed,
			world: getWorldPreset(item.genome.world).name
		}));

		let sheet: Awaited<ReturnType<typeof composeContactSheet<CreatureGenome>>> | undefined;
		try {
			announce(`Composing a ${targetCount}-specimen contact sheet.`);
			sheet = await composeContactSheet({
				tiles,
				scale: 1,
				renderTile: (context, tile, frame) => {
					const canvas = document.createElement('canvas');
					canvas.width = frame.width;
					canvas.height = frame.height;
					const tileContext = canvas.getContext('2d');
					if (!tileContext) throw new Error('Canvas2D is unavailable for the contact sheet.');
					const tilePhenotype = buildCreaturePhenotype(tile.value);
					const tilePose = createCreaturePose(tilePhenotype, { paused: true, genomeTime: 1.84 });
					const tileState = normalizeExhibitState({ genome: tile.value, paused: true });
					renderFallbackFrame(tileContext, tilePhenotype, tilePose, tileState, {
						palette: getPalette(tilePhenotype.genome.palette),
						width: frame.width,
						height: frame.height,
						pixelRatio: 1,
						includeLabel: false,
						includeOverlays: false,
						exportSafe: true,
						time: 1.84
					});
					context.drawImage(canvas, frame.x, frame.y, frame.width, frame.height);
					canvas.width = 1;
					canvas.height = 1;
				}
			});
			await downloadCanvasPng(sheet.canvas, 'chitin-engine-specimen-contact-sheet.png');
			announce(`${targetCount}-specimen contact sheet downloaded.`);
		} catch (error) {
			announce(error instanceof Error ? error.message : 'Contact-sheet export failed.');
		} finally {
			sheet?.release();
		}
	}

	function handleKeydown(event: KeyboardEvent) {
		const target = event.target;
		if (
			target instanceof HTMLInputElement ||
			target instanceof HTMLSelectElement ||
			target instanceof HTMLTextAreaElement ||
			(target instanceof HTMLElement && target.isContentEditable)
		)
			return;
		const key = event.key.toLowerCase();
		if (key === 'escape' && comparing) {
			comparing = false;
			return;
		}
		if (
			![
				' ',
				'h',
				'm',
				't',
				's',
				'a',
				'g',
				'f',
				'p',
				'l',
				'r',
				'0',
				'arrowleft',
				'arrowright'
			].includes(key)
		)
			return;
		event.preventDefault();
		if (key === ' ') applyDisplayPatch({ paused: !exhibitState.paused }, true);
		else if (key === 'h') hatch();
		else if (key === 'm') mutate();
		else if (key === 't') threatActive = !threatActive;
		else if (key === 's') applyDisplayPatch({ view: 'specimen' }, true);
		else if (key === 'a') applyDisplayPatch({ view: 'anatomy' }, true);
		else if (key === 'g') applyDisplayPatch({ view: 'gait' }, true);
		else if (key === 'f') void toggleFullscreen();
		else if (key === 'p') void exportPng(1);
		else if (key === 'l') void copyLink();
		else if (key === 'r') resetPreset();
		else if (key === '0') applyDisplayPatch({ cameraYaw: 0, cameraPitch: 0, cameraRoll: 0 }, true);
		else if (key === 'arrowleft') selectedSegment = Math.max(0, selectedSegment - 1);
		else if (key === 'arrowright')
			selectedSegment = Math.min(phenotype.plates.length - 1, selectedSegment + 1);
	}

	onMount(() => {
		mounted = true;
		const parameters = new URLSearchParams(window.location.search);
		posterMode = parameters.get('ce_poster') === '1';
		if (parameters.has('ce_v')) {
			const parsed = parseChitinUrlState(window.location.href, DEFAULT_EXHIBIT_STATE);
			exhibitState = snapshot({ ...parsed.state, paused: posterMode || parsed.state.paused });
			seedDraft = exhibitState.genome.seed;
			historyEntries = [{ state: snapshot(exhibitState), label: 'Shared URL state' }];
			historyIndex = 0;
			if (parsed.issues.length > 0) announce(parsed.issues.join(' '));
		} else if (posterMode) {
			exhibitState = snapshot({ ...exhibitState, paused: true });
		}

		const loaded = loadArchive(storage());
		archiveRecords = [...loaded.records];
		if (loaded.issues.length > 0) announce(loaded.issues.join(' '));

		const fullscreenChanged = () => {
			if (!document.fullscreenElement && focusAfterFullscreen) {
				focusAfterFullscreen.focus({ preventScroll: true });
				focusAfterFullscreen = undefined;
			}
		};
		document.addEventListener('fullscreenchange', fullscreenChanged);
		return () => {
			mounted = false;
			if (urlTimer) clearTimeout(urlTimer);
			document.removeEventListener('fullscreenchange', fullscreenChanged);
		};
	});

	$effect(() => {
		if (selectedSegment >= phenotype.plates.length) {
			selectedSegment = Math.max(0, phenotype.plates.length - 1);
		}
	});
</script>

<svelte:window onkeydown={handleKeydown} />

<section
	bind:this={exhibitRoot}
	class:poster-mode={posterMode}
	class="chitin-foundry article-breakout not-prose"
	style={`--chitin-accent: ${accent}`}
	aria-labelledby="chitin-engine-title"
	data-testid="chitin-engine"
>
	<p class="sr-only" id="chitin-access-description">
		Interactive procedural creature viewer. The current specimen is {phenotype.informalName}, seed
		{exhibitState.genome.seed}, with {phenotype.plates.length} armour plates and
		{phenotype.limbs.length} articulated appendages. Drag the chamber to tilt the view, select a plate
		to inspect it, or use the labelled controls and keyboard help. The specimen report below provides
		a text equivalent of the generated anatomy.
	</p>

	<header class="foundry-header">
		<div class="title-lockup">
			<p class="kicker"><span>Archive CE-01</span> / Browser specimen foundry</p>
			<h1 id="chitin-engine-title">
				<span>The Chitin Engine</span>
				<small>A Xenobiological Creature Foundry</small>
			</h1>
			<p class="foundry-deck">
				Assemble, inspect, mutate, and catalogue an impossible arthropod—repeatably.
			</p>
			<p class="foundry-meta post-date modified">
				Published <time datetime="2026-08-09">9 August 2026</time>
				<span aria-hidden="true">·</span>
				Updated <time datetime="2026-08-09">9 August 2026</time>
				<span aria-hidden="true">·</span>
				18 min read
			</p>
		</div>
		<div class="truth-key" aria-label="Fiction and mechanism labels">
			<span class="fiction">Archive fiction</span>
			<span class="mechanism">Actual mechanism</span>
		</div>
	</header>

	<div class="action-bar" aria-label="Primary foundry controls">
		<div class="seed-entry">
			<label for="chitin-seed">Deterministic seed</label>
			<div>
				<input id="chitin-seed" bind:value={seedDraft} maxlength="64" spellcheck="false" />
				<button type="button" onclick={hatchSeed}>Rebuild</button>
			</div>
		</div>
		<div class="primary-actions">
			<button type="button" class="acid" onclick={hatch} data-testid="chitin-hatch"
				>Hatch specimen <kbd>H</kbd></button
			>
			<button type="button" onclick={mutate} data-testid="chitin-mutate">Mutate <kbd>M</kbd></button
			>
			<button
				type="button"
				aria-pressed={exhibitState.paused}
				onclick={() => applyDisplayPatch({ paused: !exhibitState.paused }, true)}
				>{exhibitState.paused ? 'Wake' : 'Pause'} <kbd>Space</kbd></button
			>
			<button
				type="button"
				class:active={threatActive}
				aria-pressed={threatActive}
				onclick={() => (threatActive = !threatActive)}>Threat <kbd>T</kbd></button
			>
		</div>
		<div class="utility-actions">
			<button type="button" onclick={savePinned}>Pin</button>
			<button type="button" onclick={copyLink}>Copy link</button>
			<details class="export-menu">
				<summary>Export</summary>
				<div>
					<button type="button" onclick={() => exportPng(1)}>PNG 1×</button>
					<button type="button" onclick={() => exportPng(2)}>PNG 2×</button>
					<button type="button" onclick={() => exportPng(4)}>PNG 4×</button>
					<button type="button" onclick={() => exportGenome()}>Genome JSON</button>
				</div>
			</details>
			<button type="button" onclick={toggleFullscreen}>Fullscreen</button>
		</div>
	</div>

	<div class="foundry-grid">
		<main class="chamber-column">
			<div class="chamber-shell">
				<div class="chamber-index left" aria-hidden="true">{phenotype.archiveDesignation}</div>
				<div class="chamber-index right" aria-hidden="true">{world.name}</div>
				<CreatureViewport
					bind:this={viewport}
					state={exhibitState}
					descriptionId="chitin-access-description"
					{selectedSegment}
					reducedMotion={exhibitState.paused}
					{posterMode}
					{threatActive}
					{startleSerial}
					{singleStepSerial}
					onStatus={rendererChanged}
					onSelection={(segment) => (selectedSegment = segment)}
					onCameraChange={(camera) => applyDisplayPatch(camera)}
				/>
				<div class="reticle" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
			</div>

			<div class="view-strip" aria-label="Diagnostic rendering views">
				{#each VIEW_MODES as view (view)}
					<button
						type="button"
						class:active={exhibitState.view === view}
						aria-pressed={exhibitState.view === view}
						onclick={() => applyDisplayPatch({ view }, true)}>{view}</button
					>
				{/each}
			</div>

			<div class="instrument-line">
				<span class:warning={rendererStatus !== 'ready'}
					><i></i>{rendererKind} / {rendererStatus}</span
				>
				<span>{phenotype.plates.length} plates</span>
				<span>{phenotype.limbs.length} appendages</span>
				<span>{exhibitState.quality} quality</span>
				<span>{exhibitState.paused ? 'clock held' : 'gait clock live'}</span>
			</div>

			{#if comparing && comparisonParent}
				<MutationComparison
					parent={comparisonParent}
					child={exhibitState.genome}
					{changedGroups}
					onClose={() => (comparing = false)}
				/>
			{/if}

			<SpecimenReadout {phenotype} state={exhibitState} {selectedSegment} />
		</main>

		<aside class="controls-column" aria-label="Creature foundry controls">
			<div class="dock-heading">
				<div><span>Control dock</span><strong>{phenotype.informalName}</strong></div>
				<code>{exhibitState.genome.seed}</code>
			</div>
			<CreatureControls
				state={exhibitState}
				{mutationStrength}
				locks={mutationLocks}
				{canUndo}
				{canRedo}
				{comparing}
				onPreset={choosePreset}
				onWorld={chooseWorld}
				onGenomePatch={applyGenomePatch}
				onStatePatch={applyDisplayPatch}
				onMutationStrength={(value) => (mutationStrength = value)}
				onLock={setMutationLock}
				onMutate={mutate}
				onUndo={undo}
				onRedo={redo}
				onCompare={() => (comparing = !comparing)}
				onSingleStep={() => (singleStepSerial += 1)}
				onExportGenome={() => exportGenome()}
				onImportGenome={importGenome}
				onReset={resetPreset}
			/>
			<KeyboardHelp />
		</aside>
	</div>

	<section class="looking-at" aria-labelledby="looking-at-heading">
		<div class="section-label">
			<span>Interpretation layer</span>
			<h3 id="looking-at-heading">What you are looking at</h3>
		</div>
		<div class="mechanism-cards">
			<article>
				<span>01 / structure</span>
				<h4>A graph before a picture</h4>
				<p>
					A validated connected graph assigns every plate, eye, wing, and limb to a legal socket
					before drawing begins.
				</p>
			</article>
			<article>
				<span>02 / surface</span>
				<h4>Fields, not shell biology</h4>
				<p>
					Superellipse contours and object-local Worley cells shade armour. They are graphics
					functions, not models of chitin growth.
				</p>
			</article>
			<article>
				<span>03 / motion</span>
				<h4>Targets before knees</h4>
				<p>
					A gait clock chooses planted and swinging foot targets; bounded FABRIK places fixed-length
					joint chains around them.
				</p>
			</article>
		</div>
	</section>

	<ComparisonPlate genome={phenotype.baseGenome} onUseWorld={chooseWorld} />

	<SpecimenArchive
		records={archiveRecords}
		{parentA}
		{parentB}
		onOpen={openRecord}
		onDelete={deleteRecord}
		onRename={renameRecord}
		onParent={chooseParent}
		onExport={(record) => exportGenome(record.genome, record.label)}
		onClear={clearRecords}
		onSplice={spliceParents}
		onContactSheet={exportContactSheet}
	/>

	<footer class="foundry-footer">
		<div>
			<span>Speculative world heuristic</span><strong>{world.name}</strong>
			<p>{world.mechanism}</p>
		</div>
		<div>
			<span>Renderer notice</span><strong>{rendererMessage}</strong>
			<p>
				WebGL2 and Canvas2D consume the same deterministic phenotype and pose; diagnostic styling
				may differ.
			</p>
		</div>
	</footer>

	<div class="live-region" aria-live="polite" aria-atomic="true">{liveMessage}</div>
</section>

<style>
	:global(.chitin-foundry *) {
		box-sizing: border-box;
	}
	.chitin-foundry {
		position: relative;
		width: min(96vw, 98rem);
		margin: 1.25rem auto clamp(3rem, 7vw, 6rem);
		padding: clamp(0.75rem, 2vw, 1.35rem);
		overflow: clip;
		border: 1px solid rgb(180 140 220 / 18%);
		border-radius: 1.5rem;
		background:
			linear-gradient(rgb(255 255 255 / 1.8%) 1px, transparent 1px),
			linear-gradient(90deg, rgb(255 255 255 / 1.8%) 1px, transparent 1px),
			radial-gradient(
				circle at 48% 11%,
				color-mix(in srgb, var(--chitin-accent) 12%, transparent),
				transparent 34%
			),
			#04050d;
		background-size:
			42px 42px,
			42px 42px,
			auto,
			auto;
		box-shadow: 0 2.5rem 7rem rgb(0 0 0 / 42%);
		color: #d9dbe5;
		font-family: var(--font-sans, system-ui, sans-serif);
		isolation: isolate;
		transform: translateX(-50%);
	}

	.chitin-foundry::before {
		position: absolute;
		inset: 0;
		z-index: -1;
		background: linear-gradient(
			110deg,
			transparent 22%,
			rgb(161 93 214 / 3.5%) 50%,
			transparent 78%
		);
		content: '';
		pointer-events: none;
	}

	.foundry-header,
	.action-bar,
	.foundry-grid,
	.looking-at,
	.foundry-footer {
		position: relative;
		z-index: 1;
	}

	.foundry-header {
		display: flex;
		align-items: end;
		justify-content: space-between;
		gap: 1.5rem;
		padding: clamp(0.55rem, 1.5vw, 1.1rem) clamp(0.35rem, 1vw, 0.8rem) 1.2rem;
	}
	.title-lockup h1,
	.title-lockup p,
	.kicker {
		margin: 0;
	}
	.kicker {
		color: #878a9d;
		font: 700 0.63rem/1.4 var(--font-mono, monospace);
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}
	.kicker span {
		color: var(--chitin-accent);
	}
	.title-lockup h1 {
		margin-top: 0.35rem;
		color: #f8f7fb;
		font: 760 clamp(2.15rem, 5vw, 5rem)/0.92 var(--font-sans, system-ui, sans-serif);
		letter-spacing: -0.065em;
	}
	.title-lockup h1 span,
	.title-lockup h1 small {
		display: block;
	}
	.title-lockup h1 small {
		margin-top: 0.45rem;
		color: #bca4cf;
		font: 700 clamp(0.64rem, 1.2vw, 0.86rem)/1.2 var(--font-mono, monospace);
		letter-spacing: 0.13em;
		text-transform: uppercase;
	}
	.foundry-deck {
		max-width: 49rem;
		margin-top: 0.75rem;
		color: #a7a9b8;
		font-size: clamp(0.86rem, 1.4vw, 1.05rem);
	}
	.foundry-meta {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem 0.55rem;
		margin-top: 0.55rem;
		color: #7f8192;
		font: 650 0.65rem/1.45 var(--font-mono, monospace);
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}
	.truth-key {
		display: grid;
		gap: 0.4rem;
		flex: 0 0 auto;
	}
	.truth-key span {
		padding: 0.38rem 0.55rem;
		border: 1px solid currentColor;
		border-radius: 99rem;
		font: 700 0.58rem/1.1 var(--font-mono, monospace);
		letter-spacing: 0.1em;
		text-align: center;
		text-transform: uppercase;
	}
	.truth-key .fiction {
		color: #c29ada;
	}
	.truth-key .mechanism {
		color: var(--chitin-accent);
	}

	.action-bar {
		z-index: 20;
		display: grid;
		grid-template-columns: minmax(14rem, 0.72fr) minmax(23rem, 1.45fr) auto;
		gap: 0.7rem;
		align-items: end;
		padding: 0.75rem;
		border: 1px solid rgb(255 255 255 / 8%);
		border-radius: 0.95rem;
		background: rgb(3 4 11 / 90%);
		box-shadow: 0 1rem 3rem rgb(0 0 0 / 28%);
	}
	.seed-entry {
		display: grid;
		gap: 0.32rem;
	}
	.seed-entry label {
		color: #898c9e;
		font: 700 0.58rem/1.2 var(--font-mono, monospace);
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}
	.seed-entry > div,
	.primary-actions,
	.utility-actions {
		display: flex;
		gap: 0.45rem;
		align-items: center;
		flex-wrap: wrap;
	}
	.seed-entry input {
		min-width: 0;
		width: 100%;
		min-height: 2.75rem;
		padding: 0.55rem 0.7rem;
		border: 1px solid rgb(255 255 255 / 14%);
		border-radius: 0.5rem;
		background: #0a0b16;
		color: #dfffaa;
		font: 0.75rem/1.2 var(--font-mono, monospace);
	}
	.seed-entry > div {
		flex-wrap: nowrap;
	}
	.seed-entry > div input {
		flex: 1;
	}
	.action-bar button,
	.export-menu summary {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-height: 2.75rem;
		padding: 0.54rem 0.72rem;
		border: 1px solid rgb(255 255 255 / 13%);
		border-radius: 0.5rem;
		background: rgb(255 255 255 / 4%);
		color: #e7e8ef;
		cursor: pointer;
		font: 650 0.7rem/1.2 var(--font-sans, system-ui, sans-serif);
		white-space: nowrap;
	}
	.action-bar button:hover,
	.export-menu summary:hover {
		border-color: color-mix(in srgb, var(--chitin-accent) 54%, transparent);
	}
	.action-bar button.acid {
		border-color: color-mix(in srgb, var(--chitin-accent) 58%, transparent);
		background: color-mix(in srgb, var(--chitin-accent) 12%, transparent);
		color: #ebffd0;
	}
	.action-bar button.active {
		border-color: #d2a2ff;
		background: rgb(178 100 244 / 13%);
	}
	kbd {
		margin-left: 0.35rem;
		color: #85889c;
		font: 0.56rem/1 var(--font-mono, monospace);
	}
	.utility-actions {
		justify-content: end;
	}
	.export-menu {
		position: relative;
		z-index: 21;
	}
	.export-menu summary {
		list-style: none;
	}
	.export-menu summary::-webkit-details-marker {
		display: none;
	}
	.export-menu > div {
		position: absolute;
		z-index: 12;
		top: calc(100% + 0.45rem);
		right: 0;
		display: grid;
		min-width: 9.5rem;
		gap: 0.35rem;
		padding: 0.45rem;
		border: 1px solid rgb(255 255 255 / 12%);
		border-radius: 0.65rem;
		background: #090a15;
		box-shadow: 0 1rem 2rem rgb(0 0 0 / 45%);
	}

	.foundry-grid {
		display: grid;
		grid-template-columns: minmax(0, 1.68fr) minmax(20rem, 0.72fr);
		gap: 0.9rem;
		margin-top: 0.9rem;
	}
	.chamber-column,
	.controls-column {
		min-width: 0;
	}
	.chamber-column {
		display: grid;
		gap: 0.72rem;
	}
	.controls-column {
		align-self: start;
		max-height: min(83rem, calc(100vh - 2rem));
		padding: 0.7rem;
		overflow: auto;
		border: 1px solid rgb(255 255 255 / 8%);
		border-radius: 1rem;
		background: rgb(5 6 14 / 84%);
		scrollbar-color: rgb(153 104 190 / 45%) transparent;
	}
	.dock-heading {
		display: flex;
		justify-content: space-between;
		gap: 0.8rem;
		align-items: start;
		padding: 0.35rem 0.3rem 0.85rem;
	}
	.dock-heading div {
		display: grid;
		gap: 0.2rem;
	}
	.dock-heading span {
		color: #85889b;
		font: 700 0.57rem/1.2 var(--font-mono, monospace);
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}
	.dock-heading strong {
		color: #f0f1f7;
		font-size: 0.86rem;
	}
	.dock-heading code {
		color: var(--chitin-accent);
		font: 0.66rem/1.4 var(--font-mono, monospace);
	}

	.chamber-shell {
		position: relative;
		aspect-ratio: 16 / 10;
		min-height: 33rem;
		overflow: hidden;
		border: 1px solid rgb(174 112 218 / 22%);
		border-radius: 1.2rem;
		background: #050510;
		box-shadow:
			inset 0 0 6rem rgb(117 63 158 / 10%),
			0 1.4rem 4rem rgb(0 0 0 / 34%);
	}
	.chamber-shell::after {
		position: absolute;
		inset: 0.7rem;
		border: 1px solid rgb(255 255 255 / 5%);
		border-radius: 1rem;
		content: '';
		pointer-events: none;
	}
	.chamber-index {
		position: absolute;
		z-index: 4;
		top: 1.3rem;
		color: rgb(218 219 230 / 52%);
		font: 700 0.58rem/1.2 var(--font-mono, monospace);
		letter-spacing: 0.12em;
		text-transform: uppercase;
		pointer-events: none;
	}
	.chamber-index.left {
		left: 1.5rem;
	}
	.chamber-index.right {
		right: 1.5rem;
		text-align: right;
	}
	.reticle {
		position: absolute;
		z-index: 3;
		inset: 0;
		pointer-events: none;
	}
	.reticle i {
		position: absolute;
		width: 1.5rem;
		height: 1.5rem;
		border-color: color-mix(in srgb, var(--chitin-accent) 34%, transparent);
		border-style: solid;
	}
	.reticle i:nth-child(1) {
		top: 1.4rem;
		left: 1.4rem;
		border-width: 1px 0 0 1px;
	}
	.reticle i:nth-child(2) {
		top: 1.4rem;
		right: 1.4rem;
		border-width: 1px 1px 0 0;
	}
	.reticle i:nth-child(3) {
		right: 1.4rem;
		bottom: 1.4rem;
		border-width: 0 1px 1px 0;
	}
	.reticle i:nth-child(4) {
		bottom: 1.4rem;
		left: 1.4rem;
		border-width: 0 0 1px 1px;
	}

	.view-strip {
		display: grid;
		grid-template-columns: repeat(7, minmax(0, 1fr));
		gap: 0.35rem;
	}
	.view-strip button {
		min-height: 2.75rem;
		padding: 0.45rem 0.35rem;
		border: 1px solid rgb(255 255 255 / 9%);
		border-radius: 0.45rem;
		background: rgb(255 255 255 / 3%);
		color: #8f92a4;
		cursor: pointer;
		font: 700 0.57rem/1.2 var(--font-mono, monospace);
		letter-spacing: 0.07em;
		text-transform: uppercase;
	}
	.view-strip button.active {
		border-color: color-mix(in srgb, var(--chitin-accent) 52%, transparent);
		background: color-mix(in srgb, var(--chitin-accent) 9%, transparent);
		color: #efffd5;
	}
	.instrument-line {
		display: flex;
		flex-wrap: wrap;
		gap: 0.65rem 1.2rem;
		padding: 0.58rem 0.78rem;
		border: 1px solid rgb(255 255 255 / 7%);
		border-radius: 0.55rem;
		background: rgb(3 4 10 / 78%);
		color: #85889a;
		font: 0.59rem/1.3 var(--font-mono, monospace);
		letter-spacing: 0.07em;
		text-transform: uppercase;
	}
	.instrument-line span:first-child {
		color: #b9e886;
	}
	.instrument-line span.warning {
		color: #ffb1bf;
	}
	.instrument-line i {
		display: inline-block;
		width: 0.42rem;
		height: 0.42rem;
		margin-right: 0.4rem;
		border-radius: 50%;
		background: currentColor;
		box-shadow: 0 0 0.65rem currentColor;
	}

	.looking-at {
		display: grid;
		grid-template-columns: minmax(11rem, 0.35fr) 1fr;
		gap: 1rem;
		margin-block: 1rem;
		padding: clamp(1rem, 2vw, 1.4rem);
		border: 1px solid rgb(255 255 255 / 8%);
		border-radius: 1rem;
		background: rgb(6 7 16 / 78%);
	}
	.section-label span,
	.section-label h3,
	.mechanism-cards span,
	.mechanism-cards h4,
	.mechanism-cards p {
		margin: 0;
	}
	.section-label span,
	.mechanism-cards span {
		color: #9d76b9;
		font: 700 0.58rem/1.2 var(--font-mono, monospace);
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}
	.section-label h3 {
		margin-top: 0.35rem;
		color: white;
		font-size: clamp(1.05rem, 2vw, 1.45rem);
	}
	.mechanism-cards {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 0.7rem;
	}
	.mechanism-cards article {
		padding: 0.75rem;
		border-left: 1px solid color-mix(in srgb, var(--chitin-accent) 24%, transparent);
	}
	.mechanism-cards h4 {
		margin-top: 0.35rem;
		color: #eef0f5;
		font-size: 0.86rem;
	}
	.mechanism-cards p {
		margin-top: 0.42rem;
		color: #979aaa;
		font-size: 0.72rem;
		line-height: 1.55;
	}

	.foundry-footer {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.7rem;
		margin-top: 1rem;
	}
	.foundry-footer > div {
		padding: 0.9rem;
		border: 1px solid rgb(255 255 255 / 8%);
		border-radius: 0.75rem;
		background: rgb(4 5 12 / 72%);
	}
	.foundry-footer span,
	.foundry-footer strong,
	.foundry-footer p {
		display: block;
		margin: 0;
	}
	.foundry-footer span {
		color: #9674ae;
		font: 700 0.57rem/1.2 var(--font-mono, monospace);
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}
	.foundry-footer strong {
		margin-top: 0.32rem;
		color: #eef0f5;
		font-size: 0.78rem;
	}
	.foundry-footer p {
		margin-top: 0.35rem;
		color: #9396a6;
		font-size: 0.7rem;
		line-height: 1.5;
	}

	.live-region,
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}

	.chitin-foundry:fullscreen {
		left: 0;
		width: 100vw;
		height: 100vh;
		margin: 0;
		border: 0;
		border-radius: 0;
		overflow: auto;
		transform: none;
	}
	.chitin-foundry:fullscreen .chamber-shell {
		min-height: min(70vh, 54rem);
	}
	.poster-mode .action-bar,
	.poster-mode .controls-column,
	.poster-mode .view-strip,
	.poster-mode .instrument-line,
	.poster-mode .looking-at,
	.poster-mode :global(.comparison),
	.poster-mode :global(.archive),
	.poster-mode .foundry-footer {
		display: none;
	}
	.poster-mode {
		left: 0;
		width: 1200px;
		height: 630px;
		margin: 0;
		padding: 30px;
		border: 0;
		border-radius: 0;
		transform: none;
	}
	.poster-mode .foundry-header {
		padding: 2px 8px 16px;
	}
	.poster-mode .foundry-grid {
		grid-template-columns: 1fr;
		margin: 0;
	}
	.poster-mode .chamber-shell {
		height: 470px;
		min-height: 0;
		aspect-ratio: auto;
	}
	.poster-mode :global(.readout) {
		display: none;
	}

	@media (max-width: 76rem) {
		.action-bar {
			grid-template-columns: minmax(15rem, 0.7fr) 1fr;
		}
		.utility-actions {
			grid-column: 1 / -1;
			justify-content: start;
		}
		.foundry-grid {
			grid-template-columns: minmax(0, 1fr) minmax(19rem, 0.58fr);
		}
		.chamber-shell {
			min-height: 28rem;
		}
	}

	@media (max-width: 59rem) {
		.foundry-grid {
			grid-template-columns: 1fr;
		}
		.controls-column {
			max-height: none;
			overflow: visible;
		}
		.chamber-shell {
			min-height: 31rem;
		}
		.looking-at {
			grid-template-columns: 1fr;
		}
	}

	@media (max-width: 42rem) {
		.chitin-foundry {
			width: min(100%, calc(100vw - 0.7rem));
			margin-top: 0.5rem;
			padding: 0.55rem;
			border-radius: 1rem;
		}
		.foundry-header {
			align-items: start;
		}
		.truth-key {
			display: none;
		}
		.title-lockup h1 {
			font-size: clamp(2rem, 14vw, 3.7rem);
		}
		.action-bar {
			grid-template-columns: 1fr;
		}
		.utility-actions {
			grid-column: auto;
		}
		.primary-actions,
		.utility-actions {
			display: grid;
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
		.primary-actions button,
		.utility-actions > button,
		.export-menu,
		.export-menu summary {
			width: 100%;
		}
		.chamber-shell {
			width: 100%;
			min-height: 0;
			aspect-ratio: 4 / 5;
		}
		.chamber-index.right {
			display: none;
		}
		.view-strip {
			grid-template-columns: repeat(4, minmax(0, 1fr));
		}
		.mechanism-cards,
		.foundry-footer {
			grid-template-columns: 1fr;
		}
		.instrument-line {
			gap: 0.55rem 0.8rem;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.chitin-foundry::before {
			display: none;
		}
	}

	@media (forced-colors: active) {
		.chitin-foundry,
		.action-bar,
		.controls-column,
		.chamber-shell,
		.view-strip button,
		.looking-at,
		.foundry-footer > div {
			border-color: CanvasText;
			background: Canvas;
			color: CanvasText;
		}
		.title-lockup h1,
		.section-label h3,
		.mechanism-cards h4 {
			color: CanvasText;
		}
		.action-bar button,
		.export-menu summary {
			border-color: ButtonText;
			color: ButtonText;
		}
	}
</style>
