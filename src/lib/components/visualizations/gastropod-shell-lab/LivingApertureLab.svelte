<script lang="ts">
	import { onMount } from 'svelte';
	import './living-aperture-lab.css';
	import {
		classifyShellRecipe,
		createDefaultRecipe,
		patchShellRecipe,
		SeededRandom,
		type GrowthLaw,
		type ShellRecipe
	} from '$lib/visualizations/gastropod-shell-lab/shell/model';
	import {
		getPresetById,
		type ShellPreset
	} from '$lib/visualizations/gastropod-shell-lab/shell/presets';
	import {
		decodeRecipeFromUrlState,
		deserializeShellRecipe
	} from '$lib/visualizations/gastropod-shell-lab/shell/serialization';
	import { TransactionHistory } from '$lib/visualizations/gastropod-shell-lab/state/history-state.svelte';
	import {
		PreferencesState,
		type OverlayPreferences
	} from '$lib/visualizations/gastropod-shell-lab/state/preferences-state.svelte';
	import { TimelineState } from '$lib/visualizations/gastropod-shell-lab/state/timeline-state.svelte';
	import type { ShellGenerationResult } from '$lib/visualizations/gastropod-shell-lab/shell/engine';
	import type {
		ViewportPerformance,
		CameraCommand,
		ViewportExportCommand
	} from './Viewport3D.svelte';
	import Viewport3D from './Viewport3D.svelte';
	import ViewToolbar from './ViewToolbar.svelte';
	import PresetBrowser from './PresetBrowser.svelte';
	import QuickSculpt, { type LockGroup } from './QuickSculpt.svelte';
	import ParameterInspector from './ParameterInspector.svelte';
	import GrowthTimeline from './GrowthTimeline.svelte';
	import ShellTextDescription from './ShellTextDescription.svelte';
	import Morphospace from './Morphospace.svelte';
	import ComparePanel from './ComparePanel.svelte';
	import ExportDialog from './ExportDialog.svelte';
	import ShareDialog from './ShareDialog.svelte';
	import GuidedInvestigation from './GuidedInvestigation.svelte';

	const labId = $props.id();
	const viewportId = `${labId}-viewport`;
	const specimenTitleId = `${labId}-specimen-title`;
	const AUTOSAVE_KEY = 'living-aperture:autosave:v2';
	const defaultRecipe = createDefaultRecipe();
	const history = new TransactionHistory<ShellRecipe>(defaultRecipe, 64);
	const preferences = new PreferencesState();
	const timeline = new TimelineState();

	let recipe = $derived(history.current);
	let labRoot: HTMLDivElement;
	let result = $state<ShellGenerationResult>();
	let rejectedResult = $state<ShellGenerationResult>();
	let performance = $state<ViewportPerformance>();
	let viewportStatus = $state<'preparing' | 'ready' | 'recovering' | 'fallback' | 'error'>(
		'preparing'
	);
	let statusMessage = $state('Depositing the default aperture history.');
	let announcement = $state('');
	let currentPresetId = $state<string | undefined>(defaultRecipe.ancestry?.presetId);
	let presetsCollapsed = $state(false);
	let rightPanel = $state<'quick' | 'advanced'>('quick');
	let mobileSheetOpen = $state(false);
	let compareOpen = $state(false);
	let compareRecipe = $state<ShellRecipe>();
	let exportOpen = $state(false);
	let shareOpen = $state(false);
	let guideOpen = $state(false);
	let descriptionOpen = $state(false);
	let morphospaceOpen = $state(false);
	let importInput = $state<HTMLInputElement>();
	let cameraCommand = $state<CameraCommand>();
	let exportCommand = $state<ViewportExportCommand>();
	let commandId = 0;
	let exportId = 0;
	let locks = $state<Record<LockGroup, boolean>>({
		coiling: false,
		aperture: false,
		ornament: false,
		handedness: false
	});
	let diagnosticsExpanded = $state(false);

	const likelyIntersection = $derived(
		!rejectedResult &&
			(Boolean(result?.diagnostics.intersectionEstimate.likely) ||
				Boolean(
					result?.diagnostics.warnings.some(
						(warning) =>
							warning.toLowerCase().includes('intersection') ||
							warning.toLowerCase().includes('overlap')
					)
				))
	);
	const overlapScanIncomplete = $derived(
		!rejectedResult &&
			Boolean(result?.diagnostics.intersectionEstimate.truncated) &&
			!likelyIntersection
	);
	const geometryValid = $derived(
		!rejectedResult && (result?.diagnostics.valid ?? viewportStatus !== 'error')
	);
	const currentWarnings = $derived(
		rejectedResult
			? [...rejectedResult.diagnostics.errors, ...rejectedResult.diagnostics.warnings]
			: (result?.diagnostics.warnings ?? [])
	);
	const recipeClassification = $derived(classifyShellRecipe(recipe));
	const classificationLabel = $derived(recipeClassification.label);
	const triangleCount = $derived(performance?.triangleCount ?? 0);

	type TimelineEventKind = 'rib' | 'varix' | 'spine' | 'hierarchy';
	type OrnamentWithTimelineOnset = 'ribs' | 'varices' | 'spines' | 'hierarchy';
	const timelineSources: Array<{
		key: OrnamentWithTimelineOnset;
		label: string;
		kind: TimelineEventKind;
	}> = [
		{ key: 'ribs', label: 'Rib onset-law change', kind: 'rib' },
		{ key: 'varices', label: 'Varix onset-law change', kind: 'varix' },
		{ key: 'spines', label: 'Spine onset-law change', kind: 'spine' },
		{ key: 'hierarchy', label: 'Hierarchy onset-law change', kind: 'hierarchy' }
	];

	function discreteOnsetAges(law: GrowthLaw): number[] {
		switch (law.type) {
			case 'step':
				return [
					...new Set(
						law.episodes
							.filter((episode) => episode.value !== law.base)
							.map((episode) => episode.start)
					)
				];
			case 'keyframes':
				return law.points
					.slice(1)
					.filter((point, index) => point.value !== law.points[index].value)
					.map((point) => point.age);
			default:
				// Constant and continuously varying laws have no honest discrete onset marker.
				return [];
		}
	}

	const timelineEvents = $derived.by(() =>
		timelineSources
			.flatMap((source) => {
				const module = recipe.ornament[source.key];
				if (!module.enabled) return [];
				return discreteOnsetAges(module.onset).map((age) => ({
					age,
					label: source.label,
					kind: source.kind
				}));
			})
			.sort((left, right) => left.age - right.age)
	);

	function announce(message: string): void {
		announcement = '';
		setTimeout(() => (announcement = message), 20);
	}

	function beginEdit(): void {
		history.begin();
	}
	function previewEdit(mutator: (draft: ShellRecipe) => void): void {
		history.preview((draft) => {
			mutator(draft);
			if (draft.ancestry) draft.ancestry.modified = true;
		});
	}
	function commitEdit(): void {
		history.commit();
		currentPresetId = history.current.ancestry?.modified
			? undefined
			: history.current.ancestry?.presetId;
		persistRecipe();
	}

	function normalizeRecipeForControls(next: ShellRecipe): ShellRecipe {
		if (!next.ornament.buckling.enabled || next.ornament.buckling.mode !== 0) return next;
		const normalized = structuredClone(next);
		// Mode zero already produces no displacement in the engine. Represent that
		// geometry-preserving state consistently as a disabled UI module.
		normalized.ornament.buckling.enabled = false;
		return normalized;
	}

	function replaceRecipe(next: ShellRecipe, message?: string): void {
		const normalized = normalizeRecipeForControls(next);
		history.replace(normalized);
		currentPresetId = normalized.ancestry?.presetId;
		timeline.pause();
		timeline.age = 1;
		persistRecipe();
		if (message) announce(message);
	}

	function persistRecipe(): void {
		if (typeof localStorage === 'undefined') return;
		localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(history.current));
	}

	function selectPreset(preset: ShellPreset): void {
		replaceRecipe(
			structuredClone(preset.recipe),
			`${preset.title} selected. ${preset.morphologicalNote} ${preset.scientificNote}`
		);
		cameraCommand = {
			id: ++commandId,
			action:
				preset.cameraHint.view === 'top'
					? 'top'
					: preset.cameraHint.view === 'side'
						? 'side'
						: preset.cameraHint.view === 'apex'
							? 'apex'
							: 'aperture'
		};
	}

	function undo(): void {
		if (history.undo()) {
			persistRecipe();
			announce('Undid the last committed shell edit.');
		}
	}
	function redo(): void {
		if (history.redo()) {
			persistRecipe();
			announce('Redid the shell edit.');
		}
	}

	function resetRecipe(): void {
		const preset = currentPresetId ? getPresetById(currentPresetId) : undefined;
		replaceRecipe(
			preset ? structuredClone(preset.recipe) : createDefaultRecipe(),
			'Shell reset to its current starting recipe.'
		);
	}

	function duplicateRecipe(): void {
		const copy = patchShellRecipe(recipe, {
			name: `${recipe.name} copy`,
			seed: (recipe.seed + 1) >>> 0,
			ancestry: recipe.ancestry ? { ...recipe.ancestry, modified: true } : undefined
		});
		replaceRecipe(copy, 'Duplicated the recipe with a new deterministic seed.');
	}

	function surprise(): void {
		const random = new SeededRandom((recipe.seed + 0x9e3779b9) >>> 0);
		beginEdit();
		previewEdit((draft) => {
			draft.seed = random.nextUint32();
			draft.name = 'Seeded surprise';
			if (!locks.coiling) {
				draft.coiling.turns = Number(random.range(3, 8.5).toFixed(3));
				if (draft.engine === 'analytic') {
					draft.coiling.whorlExpansion = Number(
						random.range(1.08, preferences.unsafeRange ? 8 : 4.8).toFixed(4)
					);
					draft.coiling.axial.coneSpireRatio = Number(
						random
							.range(preferences.unsafeRange ? -1 : 0, preferences.unsafeRange ? 4.5 : 2.2)
							.toFixed(4)
					);
					draft.coiling.axial.mode =
						Math.abs(draft.coiling.axial.coneSpireRatio) < 0.05 ? 'planispiral' : 'cone-similar';
				}
			}
			if (!locks.aperture) {
				draft.aperture.scale = Number(
					random.range(0.16, preferences.unsafeRange ? 1.6 : 0.9).toFixed(4)
				);
				draft.aperture.aspectRatio = Number(random.range(0.55, 2.4).toFixed(4));
				draft.aperture.profile = random.choice([
					'circle',
					'ellipse',
					'superellipse',
					'lobed'
				] as const);
				draft.aperture.lobeAmplitude =
					draft.aperture.profile === 'lobed' ? Number(random.range(0.04, 0.2).toFixed(4)) : 0;
			}
			if (!locks.ornament) {
				const level = random.integer(0, preferences.unsafeRange ? 5 : 4);
				draft.ornament.ribs.enabled = level >= 1;
				draft.ornament.ribs.amplitude = level >= 1 ? random.range(0.025, 0.12) : 0;
				draft.ornament.varices.enabled = level >= 2;
				draft.ornament.varices.amplitude = level >= 2 ? random.range(0.12, 0.36) : 0;
				draft.ornament.spines.enabled = level >= 3;
				draft.ornament.spines.length =
					level >= 3 ? random.range(0.2, preferences.unsafeRange ? 1.6 : 0.72) : 0;
				draft.ornament.spines.countAroundAperture = random.integer(2, 9);
				draft.ornament.hierarchy.enabled = level >= 4;
				draft.ornament.hierarchy.depth = level >= 4 ? random.integer(2, 6) : 0;
			}
			if (!locks.handedness) draft.coiling.handedness = random.chance() ? 1 : -1;
			draft.ancestry = undefined;
		});
		commitEdit();
		announce(
			`Seeded surprise generated. Seed ${history.current.seed}. Locked groups were preserved.`
		);
	}

	function command(action: CameraCommand['action']): void {
		cameraCommand = { id: ++commandId, action };
	}
	function requestExport(commandValue: Omit<ViewportExportCommand, 'id'>): void {
		exportCommand = { id: ++exportId, ...commandValue };
		announce(`${commandValue.type.toUpperCase()} export started.`);
	}

	function toggleOverlay(name: keyof OverlayPreferences): void {
		preferences.toggleOverlay(name);
	}
	function saveAccessPreferences(): void {
		preferences.save();
	}

	async function importRecipeFile(event: Event): Promise<void> {
		const file = (event.currentTarget as HTMLInputElement).files?.[0];
		if (!file) return;
		try {
			const imported = deserializeShellRecipe(await file.text());
			replaceRecipe(imported, `Imported ${imported.name}.`);
		} catch (error) {
			announce(`Recipe import failed: ${error instanceof Error ? error.message : 'invalid file'}`);
		}
		(event.currentTarget as HTMLInputElement).value = '';
	}

	function rename(): void {
		const next = window.prompt('Name this shell recipe', recipe.name)?.trim();
		if (!next || next === recipe.name) return;
		beginEdit();
		previewEdit((draft) => (draft.name = next.slice(0, 120)));
		commitEdit();
		announce(`Recipe renamed ${next}.`);
	}

	function keyHandler(event: KeyboardEvent): void {
		const target = event.target as HTMLElement | null;
		if (target?.matches('input, textarea, select, button, a, [contenteditable="true"]')) return;
		if (event.key === ' ') {
			event.preventDefault();
			timeline.toggle();
			announce(timeline.playing ? 'Growth playback started.' : 'Growth playback paused.');
		} else if (event.key === 'ArrowLeft') {
			event.preventDefault();
			timeline.step(-1, result?.history.ringCount);
		} else if (event.key === 'ArrowRight') {
			event.preventDefault();
			timeline.step(1, result?.history.ringCount);
		} else if (event.key.toLowerCase() === 'r') {
			event.preventDefault();
			command('reset');
		} else if (event.key.toLowerCase() === 'f') {
			event.preventDefault();
			command('frame');
		} else if (event.key === '1') command('aperture');
		else if (event.key === '2') command('apex');
		else if (event.key === '3') command('side');
		else if (event.key === '4') command('top');
	}

	onMount(() => {
		preferences.load();
		labRoot.addEventListener('keydown', keyHandler);
		let loaded = false;
		try {
			const pageUrl = new URL(window.location.href);
			const state =
				pageUrl.searchParams.get('shell') ??
				new URLSearchParams(pageUrl.hash.slice(1)).get('shell');
			if (state) {
				const decoded = decodeRecipeFromUrlState(state);
				history.replace(normalizeRecipeForControls(decoded), false);
				loaded = true;
				announce('Loaded a deterministic shell recipe from the URL.');
			}
		} catch (error) {
			announce(
				`URL recipe could not be loaded: ${error instanceof Error ? error.message : 'invalid state'}`
			);
		}
		if (!loaded) {
			try {
				const saved = localStorage.getItem(AUTOSAVE_KEY);
				if (saved) {
					history.replace(normalizeRecipeForControls(deserializeShellRecipe(saved)), false);
					announce('Restored the locally autosaved shell.');
				}
			} catch {
				localStorage.removeItem(AUTOSAVE_KEY);
			}
		}
		return () => {
			labRoot.removeEventListener('keydown', keyHandler);
			timeline.destroy();
		};
	});
</script>

<div
	bind:this={labRoot}
	class="living-aperture-lab shell-lab article-breakout not-prose"
	data-lab-theme={preferences.theme}
	data-lab-contrast={preferences.highContrast ? 'high' : 'normal'}
	role="region"
	aria-label="The Living Aperture shell laboratory"
>
	<a class="skip-link" href={`#${viewportId}`}>Skip to shell viewport</a>
	<header class="topbar">
		<div class="brand">
			<span class="brand-mark" aria-hidden="true">◒</span>
			<div>
				<h1 class="brand-title">The Living Aperture</h1>
				<span>A mathematical gastropod shell laboratory</span>
				<p class="brand-meta post-date modified">
					Published <time datetime="2026-08-12">12 August 2026</time>
					<span aria-hidden="true">·</span>
					Updated <time datetime="2026-08-12">12 August 2026</time>
				</p>
			</div>
		</div>
		<button
			class="recipe-name"
			type="button"
			onclick={rename}
			aria-label={`Rename recipe ${recipe.name}`}
			><span>{recipe.name}</span><small class="number">seed {recipe.seed}</small></button
		>
		<nav aria-label="Recipe and laboratory actions">
			<button
				class="icon-button"
				type="button"
				aria-label="Undo"
				disabled={!history.canUndo}
				onclick={undo}>↶</button
			>
			<button
				class="icon-button"
				type="button"
				aria-label="Redo"
				disabled={!history.canRedo}
				onclick={redo}>↷</button
			>
			<button class="tool-button desktop-action" type="button" onclick={resetRecipe}>Reset</button>
			<button class="tool-button desktop-action" type="button" onclick={duplicateRecipe}
				>Duplicate</button
			>
			<button
				class="tool-button compare-action"
				type="button"
				aria-pressed={compareOpen}
				onclick={() => (compareOpen = !compareOpen)}>Compare</button
			>
			<button class="tool-button share-action" type="button" onclick={() => (shareOpen = true)}
				>Save / share</button
			>
			<button class="primary-button" type="button" onclick={() => (exportOpen = true)}
				>Export</button
			>
			<button
				class="icon-button"
				type="button"
				aria-label="Open guided investigations"
				onclick={() => (guideOpen = true)}>?</button
			>
		</nav>
		<div class="status-cluster" aria-label="Performance and validity">
			<button
				class="status-button"
				type="button"
				aria-expanded={diagnosticsExpanded}
				onclick={() => (diagnosticsExpanded = !diagnosticsExpanded)}
			>
				<span
					class:warning={!geometryValid || likelyIntersection}
					class:error={!geometryValid}
					class="status-dot"
				></span>
				<span
					>{geometryValid
						? likelyIntersection
							? 'check form'
							: 'valid geometry'
						: 'geometry error'}</span
				>
				<small class="number"
					>{triangleCount ? `${Math.round(triangleCount / 1000)}k Δ` : 'building'}</small
				>
			</button>
		</div>
	</header>

	{#if diagnosticsExpanded}
		<div class="diagnostics-popover" role="status">
			<div>
				<span class:warning={likelyIntersection} class="status-dot"></span><strong
					>{likelyIntersection
						? 'Conservative nonlocal overlap risk'
						: overlapScanIncomplete
							? 'Bounded overlap scan incomplete'
							: 'No nonlocal overlap risk reported'}</strong
				>
			</div>
			<div>
				<span class:warning={!geometryValid} class="status-dot"></span><strong
					>{geometryValid ? 'Finite geometry' : 'Undefined geometry'}</strong
				>
			</div>
			<div><span class="status-dot"></span><strong>{classificationLabel}</strong></div>
			<div>
				<span class:warning={!result?.mesh.topology.manifold} class="status-dot"></span><strong
					>{!geometryValid && result
						? 'Last valid visual surface retained'
						: result?.mesh.topology.manifold
							? `Manifold visual surface · ${result.mesh.topology.boundaryLoopCount} open boundary`
							: 'Open visual surface · not a printable solid'}</strong
				>
			</div>
			{#if statusMessage}<p>{statusMessage}</p>{/if}
			{#if currentWarnings.length}<ul>
					{#each currentWarnings.slice(0, 4) as warning, index (index)}<li>{warning}</li>{/each}
				</ul>{/if}
		</div>
	{/if}

	<div
		class:presets-collapsed={presetsCollapsed}
		class="workbench"
		role="group"
		aria-label="Shell laboratory workbench"
	>
		<div class="presets">
			<PresetBrowser
				{currentPresetId}
				collapsed={presetsCollapsed}
				oncollapsedchange={(value) => (presetsCollapsed = value)}
				onselect={selectPreset}
			/>
		</div>
		<section id={viewportId} class="specimen" aria-labelledby={specimenTitleId}>
			<div class="specimen-copy">
				<p id={specimenTitleId} class="display">A shell is a history of openings.</p>
				<span>Every bright rim becomes a permanent part of the surface.</span>
			</div>
			<ViewToolbar
				{preferences}
				oncamera={command}
				ontoggleoverlay={toggleOverlay}
				onprojection={(mode) => {
					preferences.projection = mode;
					preferences.save();
				}}
				onsurfacemode={(mode) => {
					preferences.surfaceMode = mode;
					preferences.save();
				}}
				onquality={(value) => {
					preferences.quality = value;
					preferences.save();
				}}
				onaccesschange={saveAccessPreferences}
			/>
			<Viewport3D
				{recipe}
				age={timeline.age}
				quality={preferences.quality}
				projection={preferences.projection}
				surfaceMode={preferences.surfaceMode}
				overlays={preferences.overlays}
				{compareRecipe}
				{cameraCommand}
				{exportCommand}
				onresult={(value) => {
					result = value;
					rejectedResult = undefined;
				}}
				oninvalid={(value) => (rejectedResult = value)}
				onperformance={(value) => (performance = value)}
				onstatus={(status, message) => {
					viewportStatus = status;
					if (message) statusMessage = message;
				}}
				onexportcomplete={(event) =>
					announce(
						event.ok
							? `${event.type.toUpperCase()} export completed.`
							: `${event.type.toUpperCase()} export failed: ${event.error}`
					)}
			/>
			<div class="viewport-badges" aria-label="Model classification">
				<span class="badge cyan"
					>{recipe.engine === 'analytic'
						? 'Model A · analytic sculptor'
						: 'Model B · living aperture'}</span
				>
				<span class="badge">{classificationLabel}</span>
				<span class:danger={likelyIntersection} class="badge"
					>{likelyIntersection
						? 'conservative overlap risk'
						: overlapScanIncomplete
							? 'bounded overlap scan · incomplete'
							: 'no nonlocal overlap reported'}</span
				>
			</div>
			<div class="chirality-widget" title="Coordinate orientation">
				<span class="axis z">z</span><span class="axis x">x</span><span class="axis y">y</span
				><strong
					>{recipe.engine === 'analytic' && recipe.coiling.axial.mode === 'planispiral'
						? recipe.coiling.handedness === 1
							? 'CW view'
							: 'CCW view'
						: recipe.coiling.handedness === 1
							? 'χ +1'
							: 'χ −1'}</strong
				>
			</div>
			<ComparePanel
				open={compareOpen}
				current={recipe}
				{compareRecipe}
				onchange={(value) => (compareRecipe = value)}
				onclose={() => (compareOpen = false)}
			/>
		</section>

		<aside class:sheet-open={mobileSheetOpen} class="inspector-column" aria-label="Shell controls">
			<button
				class="sheet-handle"
				type="button"
				aria-expanded={mobileSheetOpen}
				onclick={() => (mobileSheetOpen = !mobileSheetOpen)}
				><span></span><strong
					>{rightPanel === 'quick' ? 'Quick Sculpt' : 'Advanced inspector'}</strong
				><small>{mobileSheetOpen ? 'Collapse' : 'Open controls'}</small></button
			>
			<div class="mode-tabs" role="tablist" aria-label="Control mode">
				<button
					type="button"
					role="tab"
					aria-selected={rightPanel === 'quick'}
					onclick={() => (rightPanel = 'quick')}>Quick Sculpt</button
				><button
					type="button"
					role="tab"
					aria-selected={rightPanel === 'advanced'}
					onclick={() => (rightPanel = 'advanced')}>Advanced</button
				>
			</div>
			<div class="inspector-scroll">
				{#if rightPanel === 'quick'}
					<QuickSculpt
						{recipe}
						unsafeRange={preferences.unsafeRange}
						{locks}
						onunsafechange={(value) => (preferences.unsafeRange = value)}
						onlockchange={(group, value) => (locks = { ...locks, [group]: value })}
						onbegin={beginEdit}
						onpreview={previewEdit}
						oncommit={commitEdit}
						onsurprise={surprise}
					/>
				{:else}
					<ParameterInspector
						{recipe}
						onbegin={beginEdit}
						onpreview={previewEdit}
						oncommit={commitEdit}
					/>
				{/if}
				<div class="inspector-tools">
					<button
						class="tool-button"
						type="button"
						aria-pressed={morphospaceOpen}
						onclick={() => (morphospaceOpen = !morphospaceOpen)}>Morphospace</button
					><button
						class="tool-button"
						type="button"
						onclick={() => (descriptionOpen = !descriptionOpen)}>Text & parameters</button
					><button class="tool-button" type="button" onclick={() => importInput?.click()}
						>Import recipe</button
					>
				</div>
				{#if morphospaceOpen}<Morphospace
						{recipe}
						onbegin={beginEdit}
						onpreview={previewEdit}
						oncommit={commitEdit}
					/>{/if}
				{#if descriptionOpen}<ShellTextDescription
						{recipe}
						age={timeline.age}
						diagnostics={{
							valid: geometryValid,
							selfIntersectionLikely: likelyIntersection,
							intersectionScanIncomplete: overlapScanIncomplete,
							triangleCount,
							warnings: currentWarnings
						}}
						compact
					/>{/if}
			</div>
		</aside>

		<div class="timeline-row">
			<GrowthTimeline
				age={timeline.age}
				engine={recipe.engine}
				playing={timeline.playing}
				loop={timeline.loop}
				speed={timeline.speed}
				ringCount={result?.history.ringCount ?? performance?.resolution.growthRings ?? 320}
				turns={recipe.coiling.turns}
				events={timelineEvents}
				onagechange={(value) => timeline.setAge(value)}
				ontoggle={() => timeline.toggle()}
				onstep={(direction) => timeline.step(direction, result?.history.ringCount)}
				onrestart={(play) => timeline.restart(play)}
				onloopchange={(value) => (timeline.loop = value)}
				onspeedchange={(value) => (timeline.speed = value)}
			/>
		</div>
	</div>

	<section class="below-workbench" aria-label="Accessible laboratory explanation">
		<ShellTextDescription
			{recipe}
			age={timeline.age}
			diagnostics={{
				valid: geometryValid,
				selfIntersectionLikely: likelyIntersection,
				intersectionScanIncomplete: overlapScanIncomplete,
				triangleCount,
				warnings: currentWarnings
			}}
		/>
		<div class="science-caveat">
			<p class="panel-title">Scientific boundary</p>
			<p>
				This procedural laboratory describes geometry and kinematic aperture accretion. Its
				oscillator, mismatch, stiffness, buckling and finite hierarchy controls are reduced
				mechanism-inspired models or proxies. Named presets are morphological archetypes, not fitted
				specimen reconstructions. Nautilus and ammonites are correctly separated as cephalopods.
			</p>
			<a href="#scientific-scope">Read equations, assumptions and primary sources</a>
		</div>
	</section>

	<input
		bind:this={importInput}
		class="sr-only"
		type="file"
		aria-label="Import shell recipe file"
		accept=".json,.shell.json,application/json"
		onchange={importRecipeFile}
	/>
	<div class="sr-only" aria-live="polite" aria-atomic="true">{announcement}</div>

	<ExportDialog
		open={exportOpen}
		{recipe}
		{result}
		{geometryValid}
		diagnosticMessages={currentWarnings}
		onclose={() => (exportOpen = false)}
		onviewportexport={requestExport}
	/>
	<ShareDialog
		open={shareOpen}
		{recipe}
		onclose={() => (shareOpen = false)}
		onannounce={announce}
	/>
	{#if guideOpen}
		<GuidedInvestigation
			open
			{recipe}
			onapply={(value) => replaceRecipe(value)}
			onclose={() => (guideOpen = false)}
		/>
	{/if}
</div>

<style>
	.shell-lab {
		position: relative;
		left: calc(50% + var(--article-breakout-offset, 0rem));
		width: min(98rem, calc(100vw - 1rem));
		min-height: 100vh;
		margin: 1rem 0 3rem;
		transform: translateX(-50%);
		overflow: clip;
		border: 1px solid var(--line);
		border-radius: 16px;
		background: var(--bg);
		color: var(--text);
		font-family: Inter, ui-sans-serif, system-ui, sans-serif;
		isolation: isolate;
	}
	.skip-link {
		position: fixed;
		z-index: 100;
		top: 0.5rem;
		left: 0.5rem;
		padding: 0.55rem 0.7rem;
		transform: translateY(-150%);
		border-radius: 6px;
		background: var(--amber);
		color: #16110a;
		font-weight: 700;
	}
	.skip-link:focus {
		transform: none;
	}
	.topbar {
		position: relative;
		z-index: 20;
		display: grid;
		grid-template-columns: auto minmax(120px, 1fr) auto auto;
		align-items: center;
		gap: 0.75rem;
		min-height: 56px;
		padding: 0.45rem 0.7rem;
		border-bottom: 1px solid var(--line);
		background: var(--bg-raised);
	}
	.brand {
		display: flex;
		align-items: center;
		gap: 0.55rem;
		min-width: 0;
	}
	.brand-mark {
		display: grid;
		place-items: center;
		width: 32px;
		height: 32px;
		border: 1px solid var(--amber-soft);
		border-radius: 50%;
		color: var(--amber);
	}
	.brand-title {
		margin: 0;
		font:
			1rem/1.05 Georgia,
			serif;
		white-space: nowrap;
	}
	.brand span:not(.brand-mark) {
		display: block;
		margin-top: 0.14rem;
		font-size: 0.5rem;
		color: var(--muted);
		white-space: nowrap;
	}
	.brand-meta {
		margin: 0.12rem 0 0;
		font-size: 0.48rem;
		line-height: 1.2;
		color: var(--faint);
		white-space: nowrap;
	}
	.recipe-name {
		min-width: 0;
		max-width: 260px;
		padding: 0.3rem 0.5rem;
		border: 0;
		border-left: 1px solid var(--line);
		background: transparent;
		text-align: left;
	}
	.recipe-name span,
	.recipe-name small {
		display: block;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.recipe-name span {
		font-size: 0.68rem;
		font-weight: 650;
	}
	.recipe-name small {
		margin-top: 0.16rem;
		font-size: 0.5rem;
		color: var(--muted);
	}
	.topbar nav {
		display: flex;
		gap: 0.35rem;
	}
	.status-button {
		display: grid;
		grid-template-columns: auto 1fr;
		align-items: center;
		gap: 0.2rem 0.42rem;
		min-height: 38px;
		padding: 0.35rem 0.55rem;
		border: 1px solid var(--line);
		border-radius: 8px;
		background: var(--panel);
		text-align: left;
	}
	.status-button > span:not(.status-dot) {
		font-size: 0.58rem;
	}
	.status-button small {
		grid-column: 2;
		font-size: 0.5rem;
		color: var(--muted);
	}
	.diagnostics-popover {
		position: absolute;
		z-index: 40;
		top: 52px;
		right: 0.7rem;
		width: min(330px, calc(100vw - 1.4rem));
		padding: 0.7rem;
		border: 1px solid var(--line-bright);
		border-radius: 10px;
		background: var(--panel);
		box-shadow: var(--shadow);
	}
	.diagnostics-popover > div {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		min-height: 28px;
		font-size: 0.62rem;
	}
	.diagnostics-popover ul {
		margin: 0.5rem 0 0;
		padding: 0.55rem 0.55rem 0.55rem 1.5rem;
		border-top: 1px solid var(--line);
		font-size: 0.58rem;
		line-height: 1.5;
		color: var(--muted);
	}
	.workbench {
		display: grid;
		grid-template-columns: 264px minmax(360px, 1fr) 360px;
		grid-template-rows: minmax(540px, calc(100dvh - 136px)) auto;
		min-height: calc(100vh - 56px);
	}
	.workbench.presets-collapsed {
		grid-template-columns: 44px minmax(360px, 1fr) 360px;
	}
	.presets {
		grid-column: 1;
		grid-row: 1;
		min-width: 0;
		min-height: 0;
	}
	.specimen {
		position: relative;
		grid-column: 2;
		grid-row: 1;
		min-width: 0;
		min-height: 480px;
		overflow: hidden;
	}
	.specimen-copy {
		position: absolute;
		z-index: 5;
		top: 0.85rem;
		left: 1rem;
		pointer-events: none;
	}
	.specimen-copy p {
		margin: 0;
		font-size: clamp(1.2rem, 2vw, 1.75rem);
		color: var(--text);
		text-shadow: 0 2px 18px var(--bg);
	}
	.specimen-copy span {
		display: block;
		margin-top: 0.24rem;
		font-size: 0.62rem;
		color: var(--muted);
	}
	.viewport-badges {
		position: absolute;
		z-index: 5;
		right: 1rem;
		bottom: 0.85rem;
		display: flex;
		justify-content: flex-end;
		gap: 0.4rem;
		flex-wrap: wrap;
		pointer-events: none;
	}
	.chirality-widget {
		position: absolute;
		z-index: 5;
		left: 1rem;
		bottom: 0.85rem;
		width: 52px;
		height: 52px;
		border: 1px solid var(--line);
		border-radius: 50%;
		background: color-mix(in srgb, var(--panel) 80%, transparent);
		font:
			0.48rem 'IBM Plex Mono',
			monospace;
		color: var(--muted);
		pointer-events: none;
	}
	.chirality-widget .axis {
		position: absolute;
		color: var(--cyan);
	}
	.chirality-widget .z {
		top: 4px;
		left: 24px;
	}
	.chirality-widget .x {
		right: 5px;
		bottom: 15px;
		color: var(--amber);
	}
	.chirality-widget .y {
		left: 5px;
		bottom: 15px;
		color: #a98bd6;
	}
	.chirality-widget::before,
	.chirality-widget::after {
		content: '';
		position: absolute;
		left: 25px;
		top: 10px;
		width: 1px;
		height: 25px;
		background: var(--line-bright);
		transform-origin: bottom;
	}
	.chirality-widget::after {
		transform: rotate(60deg);
	}
	.chirality-widget strong {
		position: absolute;
		left: 50%;
		bottom: -14px;
		transform: translateX(-50%);
		white-space: nowrap;
		font-weight: 500;
	}
	.inspector-column {
		grid-column: 3;
		grid-row: 1;
		display: flex;
		flex-direction: column;
		min-width: 0;
		min-height: 0;
		border-left: 1px solid var(--line);
		background: var(--bg-raised);
	}
	.sheet-handle {
		display: none;
	}
	.mode-tabs {
		display: grid;
		grid-template-columns: 1fr 1fr;
		min-height: 43px;
		border-bottom: 1px solid var(--line);
	}
	.mode-tabs button {
		border: 0;
		border-bottom: 2px solid transparent;
		background: transparent;
		font-size: 0.62rem;
		font-weight: 680;
		color: var(--muted);
	}
	.mode-tabs button[aria-selected='true'] {
		border-bottom-color: var(--amber);
		color: var(--amber);
	}
	.inspector-scroll {
		min-height: 0;
		overflow-y: auto;
	}
	.inspector-tools {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 0.4rem;
		padding: 0.65rem;
		border-top: 1px solid var(--line);
	}
	.inspector-tools .tool-button {
		padding-inline: 0.25rem;
		font-size: 0.56rem;
	}
	.timeline-row {
		grid-column: 1 / -1;
		grid-row: 2;
	}
	.below-workbench {
		display: grid;
		grid-template-columns: minmax(0, 1.4fr) minmax(300px, 0.6fr);
		gap: 1rem;
		max-width: 1300px;
		margin: 0 auto;
		padding: 1.2rem;
	}
	.science-caveat {
		padding: 1rem;
		border: 1px solid var(--line);
		border-radius: var(--radius);
		background: var(--panel);
	}
	.science-caveat p:not(.panel-title) {
		margin: 0.55rem 0;
		font-size: 0.68rem;
		line-height: 1.6;
		color: var(--muted);
	}
	.science-caveat a {
		font-size: 0.65rem;
	}
	@media (max-width: 1180px) {
		.workbench,
		.workbench.presets-collapsed {
			grid-template-columns: 224px minmax(320px, 1fr) 320px;
		}
		.desktop-action {
			display: none;
		}
		.recipe-name {
			max-width: 170px;
		}
	}
	@media (max-width: 900px) {
		.topbar {
			grid-template-columns: 1fr auto;
			gap: 0.35rem;
		}
		.brand span:not(.brand-mark),
		.brand-meta,
		.recipe-name,
		.status-cluster,
		.desktop-action {
			display: none;
		}
		.topbar nav {
			grid-column: 2;
			grid-row: 1;
		}
		.topbar nav .tool-button {
			width: 44px;
			padding: 0;
			font-size: 0.52rem;
		}
		.topbar nav .compare-action,
		.topbar nav .share-action {
			font-size: 0;
		}
		.topbar nav .compare-action::before {
			content: 'A/B';
			font-size: 0.58rem;
		}
		.topbar nav .share-action::before {
			content: 'Share';
			font-size: 0.52rem;
		}
		.workbench,
		.workbench.presets-collapsed {
			display: flex;
			flex-direction: column;
			min-height: 0;
		}
		.presets {
			order: 2;
		}
		.specimen {
			order: 1;
			height: 54dvh;
			min-height: 390px;
		}
		.timeline-row {
			order: 3;
		}
		.inspector-column {
			position: relative;
			order: 4;
			max-height: 72px;
			border-left: 0;
			border-top: 1px solid var(--line);
			overflow: hidden;
			transition: max-height 180ms ease;
		}
		.inspector-column.sheet-open {
			max-height: none;
		}
		.sheet-handle {
			display: grid;
			grid-template-columns: 28px 1fr auto;
			align-items: center;
			gap: 0.55rem;
			min-height: 70px;
			padding: 0.5rem 0.8rem;
			border: 0;
			background: var(--bg-raised);
			text-align: left;
		}
		.sheet-handle > span {
			display: block;
			width: 28px;
			height: 4px;
			border-radius: 99px;
			background: var(--line-bright);
		}
		.sheet-handle strong {
			font-size: 0.75rem;
		}
		.sheet-handle small {
			font-size: 0.58rem;
			color: var(--muted);
		}
		.mode-tabs,
		.inspector-scroll {
			display: none;
		}
		.sheet-open .mode-tabs {
			display: grid;
			position: sticky;
			top: 0;
			z-index: 4;
			background: var(--bg-raised);
		}
		.sheet-open .inspector-scroll {
			display: block;
			overflow: visible;
		}
		.viewport-badges {
			left: 0.65rem;
			right: 0.65rem;
			bottom: 0.6rem;
			justify-content: center;
		}
		.viewport-badges .badge:nth-child(2) {
			display: none;
		}
		.chirality-widget {
			bottom: 3.4rem;
		}
		.below-workbench {
			grid-template-columns: 1fr;
			padding: 0;
			gap: 0;
		}
		.science-caveat {
			border-radius: 0;
			border-right: 0;
			border-left: 0;
		}
	}
	@media (max-width: 560px) {
		.topbar {
			min-height: 52px;
			padding: 0.25rem 0.45rem;
		}
		.brand-title {
			font-size: 0.9rem;
		}
		.brand-mark {
			width: 30px;
			height: 30px;
		}
		.topbar nav {
			gap: 0.22rem;
		}
		.topbar nav .tool-button:nth-of-type(3),
		.topbar nav .tool-button:nth-of-type(4) {
			display: none;
		}
		.specimen {
			height: 52dvh;
			min-height: 340px;
		}
		.specimen-copy {
			top: 0.6rem;
			left: 0.65rem;
		}
		.specimen-copy span {
			max-width: 210px;
		}
		.viewport-badges .badge {
			font-size: 0.52rem;
		}
	}
	@media print {
		.topbar,
		.presets,
		.inspector-column,
		.timeline-row,
		.viewport-badges,
		.chirality-widget {
			display: none !important;
		}
		.workbench {
			display: block;
		}
		.specimen {
			height: 540px;
		}
		.below-workbench {
			display: block;
		}
	}
</style>
