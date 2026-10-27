<script lang="ts">
	import { onMount, onDestroy, tick } from 'svelte';
	import { resolve } from '$app/paths';
	import AtlasMap from './AtlasMap.svelte';
	import { EXAMPLES } from '$lib/visualizations/knowledge-gap-atlas/examples';
	import {
		DEFAULT_SETTINGS,
		type AtlasProject,
		type AnalysisResult,
		type SourceRecord,
		type AtlasProgress,
		type WorkerResponse,
		type ImportSource,
		type CorpusRole,
		type EvidenceRef,
		type Finding,
		type AnalysisSettings
	} from '$lib/visualizations/knowledge-gap-atlas/types';
	import {
		createProject,
		listProjects,
		getProject,
		saveProject,
		deleteProject,
		listSources,
		addSources,
		removeSource,
		readEvidence,
		readSourcePage,
		storageError
	} from '$lib/visualizations/knowledge-gap-atlas/storage';
	import {
		exportProject,
		importProject,
		exportReport,
		exportTables
	} from '$lib/visualizations/knowledge-gap-atlas/exports';
	import { PALETTE } from '$lib/visualizations/knowledge-gap-atlas/layout';
	import './knowledge-gap-atlas.css';

	type View = 'map' | 'findings' | 'concepts' | 'compare' | 'sources' | 'research';
	let project = $state<AtlasProject | null>(null);
	let projects = $state<AtlasProject[]>([]);
	let result = $state.raw<AnalysisResult | null>(null);
	let sources = $state<SourceRecord[]>([]);
	let ready = $state(false);
	let busy = $state(false);
	let error = $state('');
	let notice = $state('');
	let progress = $state<AtlasProgress | null>(null);
	let view = $state<View>('map');
	let paste = $state('');
	let sourceName = $state('');
	let role = $state<CorpusRole>('target');
	let showInput = $state(false);
	let showSettings = $state(false);
	let showExport = $state(false);
	let showProjects = $state(false);
	let includeSources = $state(false);
	let dark = $state(false);
	let search = $state('');
	let density = $state(140);
	let topic = $state<number | null>(null);
	let selected = $state('');
	let selectedFinding = $state<Finding | null>(null);
	let edgeLabel = $state('');
	let evidence = $state<
		{
			text: string;
			start: number;
			end: number;
			sourceName: string;
			ref: EvidenceRef;
			clipped?: boolean;
		}[]
	>([]);
	let evidenceLoading = $state(false);
	let evidenceError = $state('');
	let evidenceGeneration = 0;
	let settings = $state<AnalysisSettings>(structuredClone(DEFAULT_SETTINGS));
	let committedSettings: AnalysisSettings = structuredClone(DEFAULT_SETTINGS);
	let excludedText = $state('');
	let aliasFrom = $state('');
	let aliasTo = $state('');
	let history = $state<AnalysisSettings[]>([]);
	let future = $state<AnalysisSettings[]>([]);
	let sourcePage = $state<{ text: string; totalChars: number; start: number } | null>(null);
	let sourceId = $state('');
	let sourceGeneration = 0;
	let questionText = $state('');
	let conceptPage = $state(0);
	let findingFilter = $state('all');
	let sourceFilter = $state('');
	let previous = $state<{ words: number; concepts: number; findings: number } | null>(null);
	let appElement: HTMLElement;
	let fileInput: HTMLInputElement;
	let projectInput: HTMLInputElement;
	let mapComponent:
		| { exportSvg: () => void; exportPng: () => void; reset: () => void }
		| undefined = $state();
	let worker: Worker | undefined;
	let jobId = '';
	let aborter: AbortController | undefined;
	let alive = true;
	let cancellationTimer: ReturnType<typeof setTimeout> | undefined;
	const format = (n: number) => n.toLocaleString();
	const bytes = (n: number) =>
		n < 1024
			? `${n} B`
			: n < 1024 * 1024
				? `${(n / 1024).toFixed(1)} KB`
				: `${(n / 1024 / 1024).toFixed(1)} MB`;
	const findingNames: Record<string, string> = {
		gap: 'Connection to investigate',
		bridge: 'Existing bridge',
		fragile: 'Fragile connection',
		peripheral: 'Peripheral idea',
		coverage: 'Coverage opportunity',
		concentration: 'Narrow source base'
	};
	const selectedConcept = $derived(result?.concepts.find((n) => n.id === selected));
	const filteredConcepts = $derived(
		(result?.concepts ?? []).filter(
			(n) =>
				(topic === null || n.community === topic) &&
				(!sourceFilter || n.sources[sourceFilter]) &&
				(!search || n.label.toLocaleLowerCase().includes(search.toLocaleLowerCase()))
		)
	);
	const findings = $derived(
		(result?.findings ?? []).filter(
			(f) =>
				!project?.dismissed.includes(f.id) && (findingFilter === 'all' || f.kind === findingFilter)
		)
	);
	const neighbouring = $derived(
		selected && result
			? result.edges
					.filter((e) => e.source === selected || e.target === selected)
					.sort((a, b) => b.count - a.count)
					.slice(0, 12)
			: []
	);
	const targetWords = $derived(
		sources.filter((s) => s.role === 'target').reduce((n, s) => n + s.words, 0)
	);
	const referenceWords = $derived(
		sources.filter((s) => s.role === 'reference').reduce((n, s) => n + s.words, 0)
	);
	const comparison = $derived(
		(result?.concepts ?? [])
			.filter((n) => n.referenceCount > 0)
			.map((n) => ({
				...n,
				targetRate: (n.targetCount / Math.max(1, targetWords)) * 1000,
				referenceRate: (n.referenceCount / Math.max(1, referenceWords)) * 1000
			}))
			.sort((a, b) => b.referenceRate - b.targetRate - (a.referenceRate - a.targetRate))
			.slice(0, 80)
	);
	const inspectorOpen = $derived(Boolean(selected || selectedFinding || edgeLabel));
	const completedWords = $derived(sources.reduce((n, s) => n + s.words, 0));
	const firstLead = $derived(
		result?.findings.find((f) => (referenceWords ? f.kind === 'coverage' : f.kind === 'gap')) ??
			result?.findings[0]
	);
	const duplicateSources = $derived(
		sources.filter(
			(s, i) =>
				s.hash &&
				sources.some(
					(other, j) =>
						j < i && other.hash === s.hash && other.chars === s.chars && other.role === s.role
				)
		)
	);
	const totalChars = $derived(sources.reduce((n, s) => n + s.chars, 0));
	const sourceReady = $derived(sources.length > 0 && sources.every((s) => s.status === 'complete'));
	const settingsDiffer = $derived(
		result !== null && JSON.stringify(result.settings) !== JSON.stringify(settings)
	);

	async function refreshProjects() {
		projects = await listProjects();
	}
	async function persist() {
		if (!project) return;
		project.settings = structuredClone(committedSettings);
		project.result = result ?? undefined;
		await saveProject($state.snapshot(project));
		await refreshProjects();
	}
	function flash(text: string) {
		notice = text;
	}
	async function safely(action: () => Promise<unknown>) {
		error = '';
		try {
			await action();
		} catch (e) {
			error = storageError(e);
		}
	}
	function closeInspector() {
		selected = '';
		selectedFinding = null;
		edgeLabel = '';
		evidence = [];
		evidenceGeneration++;
	}
	async function loadEvidence(refs: EvidenceRef[]) {
		if (!project) return;
		const token = ++evidenceGeneration;
		evidenceLoading = true;
		evidenceError = '';
		evidence = [];
		const bySource: Record<string, EvidenceRef[]> = Object.create(null);
		for (const ref of refs) (bySource[ref.sourceId] ??= []).push(ref);
		const diverse: EvidenceRef[] = [];
		for (let i = 0; diverse.length < Math.min(6, refs.length); i++) {
			for (const sourceRefs of Object.values(bySource))
				if (sourceRefs[i] && diverse.length < 6) diverse.push(sourceRefs[i]);
		}
		try {
			const found = await Promise.all(
				diverse.map(async (ref) => ({ ...(await readEvidence(project!.id, ref, 160)), ref }))
			);
			if (token === evidenceGeneration) evidence = found;
		} catch (e) {
			if (token === evidenceGeneration) evidenceError = storageError(e);
		} finally {
			if (token === evidenceGeneration) evidenceLoading = false;
		}
	}
	function inspectConcept(id: string) {
		selected = id;
		selectedFinding = null;
		edgeLabel = '';
		const node = result?.concepts.find((n) => n.id === id);
		if (node) void loadEvidence(node.evidence);
	}
	function inspectFinding(f: Finding) {
		selected = '';
		selectedFinding = f;
		edgeLabel = '';
		void loadEvidence(f.evidence);
	}
	async function openProject(id: string) {
		if (busy) return;
		busy = true;
		try {
			await safely(async () => {
				const [found, savedSources] = await Promise.all([getProject(id), listSources(id)]);
				if (!found) throw new Error('This saved atlas is unavailable.');
				if (!alive) return;
				project = found;
				settings = structuredClone(found.settings);
				committedSettings = structuredClone(found.settings);
				excludedText = settings.excluded.join(', ');
				result = found.result ?? null;
				sources = savedSources;
				showProjects = false;
				showInput = !result;
				closeInspector();
				topic = null;
				search = '';
				sourceFilter = '';
				findingFilter = 'all';
				conceptPage = 0;
				history = [];
				future = [];
				sourceId = '';
				sourcePage = null;
				previous = null;
				view = 'map';
			});
		} finally {
			busy = false;
		}
	}
	async function newProject(name = 'Untitled atlas') {
		project = await createProject(name);
		sources = [];
		result = null;
		settings = structuredClone(DEFAULT_SETTINGS);
		committedSettings = structuredClone(DEFAULT_SETTINGS);
		excludedText = '';
		topic = null;
		search = '';
		sourceFilter = '';
		findingFilter = 'all';
		conceptPage = 0;
		closeInspector();
		history = [];
		future = [];
		previous = null;
		sourcePage = null;
		sourceId = '';
		await refreshProjects();
	}
	function startAnalysis() {
		if (!project || busy || !alive) return;
		if (!validateSettings(settings)) return;
		clearCancellation();
		error = '';
		busy = true;
		progress = {
			phase: 'Preparing your atlas',
			bytes: 0,
			totalBytes: sources.reduce((n, s) => n + s.bytes, 0),
			words: 0
		};
		closeInspector();
		if (result)
			previous = {
				words: result.words,
				concepts: result.concepts.length,
				findings: result.findings.length
			};
		worker?.terminate();
		jobId = crypto.randomUUID();
		const activeJobId = jobId;
		worker = new Worker(
			new URL('../../../visualizations/knowledge-gap-atlas/atlas.worker.ts', import.meta.url),
			{ type: 'module' }
		);
		worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
			const message = event.data;
			if (!alive || message.jobId !== jobId) return;
			if (message.type === 'progress') progress = message.progress;
			if (message.type === 'complete') {
				if (cancellationTimer) clearTimeout(cancellationTimer);
				result = message.result;
				settings = structuredClone(message.result.settings);
				committedSettings = structuredClone(message.result.settings);
				excludedText = settings.excluded.join(', ');
				sources = message.result.sources;
				busy = false;
				progress = null;
				showInput = false;
				showSettings = false;
				view = 'map';
				topic = null;
				search = '';
				void safely(persist);
				flash('Your complete text has been indexed. Select a topic or follow a finding.');
				worker?.terminate();
				worker = undefined;
				void tick().then(() => appElement?.scrollIntoView({ block: 'start', behavior: 'instant' }));
			}
			if (message.type === 'error') {
				clearCancellation();
				busy = false;
				progress = null;
				error = message.message;
				worker?.terminate();
				worker = undefined;
				void listSources(project!.id).then((s) => (sources = s));
			}
			if (message.type === 'cancelled') {
				if (cancellationTimer) clearTimeout(cancellationTimer);
				busy = false;
				progress = null;
				flash('Analysis paused. Your saved checkpoint is ready to resume.');
				worker?.terminate();
				worker = undefined;
				void listSources(project!.id).then((s) => (sources = s));
			}
		};
		worker.onerror = () => {
			if (!alive || activeJobId !== jobId) return;
			clearCancellation();
			busy = false;
			progress = null;
			error =
				'The analysis worker stopped. Your sources and last committed checkpoint remain saved. Close other memory-heavy tabs and resume.';
			worker?.terminate();
			worker = undefined;
		};
		worker.postMessage({
			type: 'analyse',
			jobId,
			projectId: project.id,
			settings: $state.snapshot(settings)
		});
	}
	async function addAndAnalyse(inputs: ImportSource[], freshName?: string) {
		if (busy || !inputs.length) return;
		clearCancellation();
		busy = true;
		error = '';
		try {
			if (freshName || !project)
				await newProject(freshName || sourceName.trim() || 'My knowledge atlas');
			if (!alive) return;
			result = null;
			project!.result = undefined;
			aborter = new AbortController();
			await addSources(project!.id, inputs, (p) => (progress = p), aborter.signal);
			sources = await listSources(project!.id);
			busy = false;
			progress = null;
			paste = '';
			sourceName = '';
			result = null;
			startAnalysis();
		} catch (e) {
			clearCancellation();
			busy = false;
			progress = null;
			error = storageError(e);
			if (project) sources = await listSources(project.id);
		} finally {
			aborter = undefined;
		}
	}
	function buildPaste() {
		if (paste.trim())
			void addAndAnalyse([
				{ name: sourceName.trim() || `Text ${sources.length + 1}`, role, text: paste }
			]);
		else if (sources.length) startAnalysis();
	}
	function chooseFiles(event: Event) {
		const files = Array.from((event.target as HTMLInputElement).files ?? []);
		if (files.length) void addAndAnalyse(files.map((file) => ({ name: file.name, role, file })));
		(event.target as HTMLInputElement).value = '';
	}
	function cancel() {
		aborter?.abort();
		worker?.postMessage({ type: 'cancel', jobId });
		cancellationTimer = setTimeout(() => {
			if (busy) {
				worker?.terminate();
				worker = undefined;
				jobId = '';
				busy = false;
				progress = null;
				flash('Paused. Resume from the last saved analysis checkpoint.');
			}
		}, 1200);
	}
	function clearCancellation() {
		if (cancellationTimer) clearTimeout(cancellationTimer);
		cancellationTimer = undefined;
	}
	async function saveQuestion(text: string, refs: EvidenceRef[] = [], findingId?: string) {
		if (!project || !text.trim()) return;
		project.questions.push({
			id: crypto.randomUUID(),
			text: text.trim(),
			note: '',
			status: 'investigate',
			evidence: refs,
			findingId
		});
		questionText = '';
		await safely(persist);
		flash('Question saved to your research plan.');
	}
	async function dismissFinding(f: Finding) {
		if (!project) return;
		project.dismissed.push(f.id);
		closeInspector();
		await safely(persist);
	}
	async function togglePin(id: string) {
		if (!project) return;
		project.pins = project.pins.includes(id)
			? project.pins.filter((p) => p !== id)
			: [...project.pins, id];
		await safely(persist);
	}
	function changeSettings(next: AnalysisSettings) {
		if (!validateSettings(next)) return false;
		history.push(structuredClone(committedSettings));
		future = [];
		settings = structuredClone(next);
		committedSettings = structuredClone(next);
		excludedText = settings.excluded.join(', ');
		return true;
	}
	function validateSettings(candidate: AnalysisSettings): boolean {
		if (!Number.isSafeInteger(candidate.window) || candidate.window < 2 || candidate.window > 20) {
			error = 'Choose a whole-number word window from 2 to 20.';
			return false;
		}
		if (!Number.isSafeInteger(candidate.minCount) || candidate.minCount < 1) {
			error = 'Minimum occurrences must be a whole number of at least 1.';
			return false;
		}
		if (
			!Number.isFinite(candidate.resolution) ||
			candidate.resolution < 0.2 ||
			candidate.resolution > 4
		) {
			error = 'Choose a topic resolution from 0.2 to 4.';
			return false;
		}
		return true;
	}
	function applySettings() {
		if (
			!changeSettings({
				...$state.snapshot(settings),
				excluded: excludedText
					.split(',')
					.map((x) => x.trim().toLowerCase())
					.filter(Boolean)
			})
		)
			return;
		void safely(async () => {
			await persist();
			startAnalysis();
		});
	}
	function excludeConcept(id: string) {
		if (!changeSettings({ ...$state.snapshot(settings), excluded: [...settings.excluded, id] }))
			return;
		void safely(async () => {
			await persist();
			startAnalysis();
		});
	}
	function addAlias() {
		const from = aliasFrom.trim().toLowerCase(),
			to = aliasTo.trim().toLowerCase();
		if (!from || !to || from === to || ['__proto__', 'constructor', 'prototype'].includes(from))
			return;
		if (
			!changeSettings({
				...$state.snapshot(settings),
				aliases: { ...settings.aliases, [from]: to }
			})
		)
			return;
		aliasFrom = '';
		aliasTo = '';
		void safely(async () => {
			await persist();
			startAnalysis();
		});
	}
	function undoSettings(redo = false) {
		const from = redo ? future : history,
			to = redo ? history : future;
		const last = from.pop();
		if (!last) return;
		to.push(structuredClone(committedSettings));
		const restored = $state.snapshot(last);
		settings = structuredClone(restored);
		committedSettings = restored;
		excludedText = settings.excluded.join(', ');
		void safely(async () => {
			await persist();
			startAnalysis();
		});
	}
	async function showSource(id: string, start = 0) {
		if (!project) return;
		const projectId = project.id;
		const generation = ++sourceGeneration;
		sourceId = id;
		view = 'sources';
		await safely(async () => {
			const page = await readSourcePage(projectId, id, start, 5000);
			if (alive && project?.id === projectId && sourceId === id && generation === sourceGeneration)
				sourcePage = page;
		});
	}
	async function deleteSource(id: string) {
		if (!project || busy) return;
		await safely(async () => {
			await removeSource(project!.id, id);
			sources = await listSources(project!.id);
			result = null;
			project!.result = undefined;
			sourcePage = null;
			sourceId = '';
			closeInspector();
			showInput = true;
			await refreshProjects();
			flash('Source removed. Rebuild the map to update all findings.');
		});
	}
	async function runExport(kind: 'project' | 'report' | 'tables' | 'svg' | 'png') {
		await safely(async () => {
			await persist();
			if (!project) return;
			if (kind === 'project') {
				const out = await exportProject(project.id, includeSources);
				flash(
					out.streamed
						? 'Project saved.'
						: `Project downloaded${out.parts > 1 ? ` in ${out.parts} parts. Keep all parts together` : ''}.`
				);
			} else if (kind === 'report') await exportReport($state.snapshot(project), includeSources);
			else if (kind === 'tables' && result) exportTables(result);
			else if (kind === 'svg') mapComponent?.exportSvg();
			else if (kind === 'png') mapComponent?.exportPng();
		});
	}
	async function restoreProject(event: Event) {
		if (busy) return;
		const files = Array.from((event.target as HTMLInputElement).files ?? []);
		if (!files.length) return;
		busy = true;
		await safely(async () => {
			const imported = await importProject(files);
			await refreshProjects();
			busy = false;
			await openProject(imported.id);
			flash('Atlas imported. Your research plan and analysis are ready.');
		});
		busy = false;
		(event.target as HTMLInputElement).value = '';
	}
	function switchView(next: View) {
		view = next;
		conceptPage = 0;
	}
	onMount(() => {
		ready = true;
		void safely(refreshProjects);
	});
	onDestroy(() => {
		alive = false;
		evidenceGeneration++;
		sourceGeneration++;
		aborter?.abort();
		worker?.terminate();
		if (cancellationTimer) clearTimeout(cancellationTimer);
	});
</script>

<section
	class:night={dark}
	class="kga"
	data-testid="atlas-app"
	bind:this={appElement}
	aria-label="Knowledge Gap Atlas"
>
	<h1 class="sr-only">Knowledge Gap Atlas</h1>
	<div class="kga-masthead">
		<a href={resolve('/blog/visualizations')} class="kga-brand"
			><span class="kga-brand-mark">✳</span><span>KNOWLEDGE<br /><b>GAP ATLAS</b></span></a
		><span class="kga-edition">A FIELD GUIDE TO YOUR IDEAS <i>№ 01</i></span>
		<div class="kga-mast-actions">
			<span class="kga-private"><span class="kga-live-dot"></span> ON YOUR DEVICE</span><button
				class="kga-icon"
				aria-label={dark ? 'Use paper theme' : 'Use night theme'}
				onclick={() => (dark = !dark)}>{dark ? '☀' : '◐'}</button
			><button disabled={!ready || busy} onclick={() => (showProjects = !showProjects)}
				>My atlases <span>{projects.length}</span></button
			>
		</div>
	</div>
	{#if showProjects}
		<div class="kga-projects">
			<div class="kga-section-heading">
				<div>
					<span class="kga-eyebrow">YOUR LOCAL LIBRARY</span>
					<h3>Pick up a thread.</h3>
				</div>
				<button onclick={() => (showProjects = false)} aria-label="Close saved atlases">×</button>
			</div>
			{#if !projects.length}<p>
					Your atlases will be saved in this browser. Export a backup to keep them elsewhere.
				</p>{/if}
			<div class="kga-project-list">
				{#each projects as saved (saved.id)}<div>
						<button disabled={busy} onclick={() => openProject(saved.id)}
							><b>{saved.name}</b><small
								>{saved.result
									? `${format(saved.result.words)} words · ${saved.result.topics.length} topics`
									: 'Ready to continue'}</small
							></button
						><button
							class="kga-icon"
							disabled={busy}
							aria-label={`Delete ${saved.name}`}
							onclick={() =>
								safely(async () => {
									if (busy) return;
									if (confirm(`Delete “${saved.name}” and its locally stored sources?`)) {
										await deleteProject(saved.id);
										if (project?.id === saved.id) {
											project = null;
											result = null;
											sources = [];
										}
										await refreshProjects();
									}
								})}>×</button
						>
					</div>{/each}
			</div>
			<div class="kga-button-row">
				<button
					disabled={busy}
					onclick={() => {
						if (busy) return;
						project = null;
						result = null;
						sources = [];
						showProjects = false;
						showInput = true;
						closeInspector();
					}}>+ New atlas</button
				><button
					disabled={busy}
					onclick={() => {
						if (!busy) projectInput.click();
					}}>Import a saved atlas</button
				>
			</div>
		</div>
	{/if}
	<input
		class="kga-hidden-input"
		type="file"
		accept=".txt,.md,.markdown,text/plain,text/markdown"
		disabled={busy}
		multiple
		bind:this={fileInput}
		onchange={chooseFiles}
		aria-label="Add text files"
	/>
	<input
		class="kga-hidden-input"
		data-testid="atlas-project-import"
		type="file"
		accept=".ndjson,.jsonl,.json"
		disabled={busy}
		multiple
		bind:this={projectInput}
		onchange={restoreProject}
		aria-label="Import saved atlas files"
	/>
	{#if !result}
		<header class="kga-hero">
			<div>
				<div class="kga-eyebrow"><span class="kga-tiny-rule"></span> READ BETWEEN YOUR IDEAS</div>
				<h2>Find the thread.<br /><em>See what’s missing.</em></h2>
				<p>
					Turn a wall of text into a landscape of ideas. Explore the connections, follow the
					evidence, and find your next good question.
				</p>
				<div class="kga-hero-actions">
					<button
						class="kga-primary"
						disabled={!ready || busy}
						onclick={() => {
							showInput = true;
							setTimeout(() => document.getElementById('kga-text')?.focus(), 0);
						}}>Map your material <span>↗</span></button
					><button
						class="kga-text-button"
						disabled={!ready || busy}
						onclick={() => addAndAnalyse(EXAMPLES[0].sources, EXAMPLES[0].title)}
						>Explore an example →</button
					>
				</div>
				<div class="kga-promises">
					<span>No sign-up</span><span>No AI APIs</span><span>No word quota</span>
				</div>
			</div>
			<div class="kga-hero-art" aria-hidden="true">
				<svg viewBox="0 0 540 370"
					><defs
						><pattern id="kga-hero-grid" width="20" height="20" patternUnits="userSpaceOnUse"
							><circle cx="2" cy="2" r=".65" fill="currentColor" opacity=".18" /></pattern
						></defs
					><rect width="540" height="370" fill="url(#kga-hero-grid)" />
					{#each [0, 1, 2, 3] as i (i)}<ellipse
							cx="156"
							cy="133"
							rx={68 + i * 11}
							ry={50 + i * 10}
							fill="none"
							stroke="#438477"
							opacity=".2"
							transform="rotate(-20 156 133)"
						/><ellipse
							cx="388"
							cy="141"
							rx={55 + i * 10}
							ry={67 + i * 10}
							fill="none"
							stroke="#a07a3b"
							opacity=".19"
							transform="rotate(18 388 141)"
						/><ellipse
							cx="289"
							cy="287"
							rx={76 + i * 10}
							ry={41 + i * 10}
							fill="none"
							stroke="#737ca5"
							opacity=".2"
						/>{/each}
					<g stroke="#377f72" opacity=".35" fill="none"
						><path
							d="M111 111L163 139L192 97L201 160L136 174L111 111L192 97M163 139L136 174M163 139L201 160"
						/><path
							d="M350 104L406 122L386 176L432 191L420 80L350 104L386 176M406 122L432 191"
							stroke="#ac7c3a"
						/><path
							d="M231 286L277 261L303 308L349 282L277 261M231 286L303 308"
							stroke="#6b76a2"
						/></g
					>
					<path d="M201 160Q250 170 277 261" fill="none" stroke="#748477" opacity=".35" /><path
						d="M192 97Q283 21 350 104"
						fill="none"
						stroke="#ae6949"
						stroke-width="1.5"
						stroke-dasharray="5 6"
					/>
					{#each [[111, 111, 5], [163, 139, 11], [192, 97, 7], [201, 160, 6], [136, 174, 4]] as n (n[0])}<circle
							cx={n[0]}
							cy={n[1]}
							r={n[2]}
							fill="#367d6f"
						/>{/each}{#each [[350, 104, 7], [406, 122, 10], [386, 176, 6], [432, 191, 4], [420, 80, 4]] as n (n[0])}<circle
							cx={n[0]}
							cy={n[1]}
							r={n[2]}
							fill="#ae7c38"
						/>{/each}{#each [[231, 286, 5], [277, 261, 9], [303, 308, 6], [349, 282, 5]] as n (n[0])}<circle
							cx={n[0]}
							cy={n[1]}
							r={n[2]}
							fill="#7480a4"
						/>{/each}
					<g class="kga-art-label"
						><text x="105" y="54">THE THINGS YOU KNOW</text><text x="319" y="43"
							>THE NEXT QUESTION</text
						><text x="201" y="353">A CONNECTION WORTH EXPLORING</text></g
					><rect x="233" y="54" width="70" height="31" rx="15" class="kga-art-tag" /><text
						x="268"
						y="74"
						text-anchor="middle"
						class="kga-art-question">what if?</text
					><circle cx="163" cy="139" r="17" fill="none" stroke="#367d6f" opacity=".5" /></svg
				><span class="kga-art-footer">A new perspective starts with a better question.</span>
			</div>
		</header>
		{#if !showInput && !busy}<div class="kga-examples">
				<div class="kga-examples-label">
					<span class="kga-eyebrow">TAKE A FIELD TRIP</span><span
						>Three ways to find your bearings.</span
					>
				</div>
				{#each EXAMPLES as example, i (example.id)}<button
						data-testid={`atlas-example-${example.id}`}
						disabled={!ready || busy}
						onclick={() => addAndAnalyse(example.sources, example.title)}
						><span class="kga-example-no">0{i + 1} <span>↗</span></span><b>{example.title}</b><small
							>{example.description}</small
						></button
					>{/each}
			</div>{/if}
	{/if}
	{#if result}
		<div class="kga-result-heading">
			<div>
				<span class="kga-eyebrow">YOUR MATERIAL, SEEN DIFFERENTLY</span><input
					class="kga-project-name"
					aria-label="Atlas name"
					title={project!.name}
					bind:value={project!.name}
					onblur={() => safely(persist)}
				/>
			</div>
			<div class="kga-button-row">
				<button disabled={busy} onclick={() => (showInput = !showInput)}>+ Add material</button
				><button data-testid="atlas-export" onclick={() => (showExport = !showExport)}
					>Export ↗</button
				>
			</div>
		</div>
		<div class="kga-metrics">
			<div><b>{format(result.words)}</b><span>words indexed</span></div>
			<div><b>{format(result.concepts.length)}</b><span>concepts connected</span></div>
			<div><b>{format(result.topics.length)}</b><span>topic communities</span></div>
			<div><b>{format(findings.length)}</b><span>leads to explore</span></div>
			<div class="kga-coverage-stamp">
				<span class="kga-live-dot"></span><strong>Full input indexed</strong><small
					>{format(totalChars)} source characters · {sources.length} sources</small
				>
			</div>
		</div>
	{/if}
	{#if showInput && !busy}
		<div class="kga-input-panel">
			<div class="kga-input-intro">
				<span class="kga-eyebrow">BRING YOUR OWN MATERIAL</span>
				<h3>What are you<br />thinking about?</h3>
				<p>
					An essay. A book’s worth of notes. A collection of research. Start with the text you want
					to understand.
				</p>
				<button onclick={() => fileInput.click()} disabled={!ready}
					>↑ Add TXT / Markdown files</button
				><small
					>Files are read in chunks. No imposed word, token, or file-count quota. Capacity depends
					on this device.</small
				>
			</div>
			<div class="kga-input-fields">
				<div class="kga-input-meta">
					<label
						>Source name<input
							placeholder="e.g. My research notes"
							bind:value={sourceName}
						/></label
					><label
						>Use this as<select bind:value={role}
							><option value="target">Material to explore</option><option value="reference"
								>Reference to compare against</option
							></select
						></label
					>
				</div>
				<label for="kga-text" class="kga-sr-only">Your source text</label><textarea
					id="kga-text"
					data-testid="atlas-paste"
					bind:value={paste}
					placeholder="Paste your text here. Every word will be processed."
					rows="8"
				></textarea>
				<div class="kga-input-bottom">
					<span
						>{paste
							? `${format(paste.length)} characters`
							: 'Your text stays on this device.'}</span
					><button
						class="kga-primary"
						data-testid="atlas-build"
						disabled={!ready || (!paste.trim() && !sources.length)}
						onclick={buildPaste}
						>{sources.length && !paste.trim() ? 'Build / resume atlas' : 'Build my atlas'}
						<span>↗</span></button
					>
				</div>
			</div>
		</div>
	{/if}
	{#if sources.length && !result && !busy}
		<div class="kga-pending-sources">
			<div class="kga-section-heading">
				<span class="kga-eyebrow">SAVED SOURCE QUEUE</span><button
					onclick={() => {
						includeSources = true;
						void runExport('project');
					}}>Back up sources ↗</button
				>
			</div>
			{#each sources as source (source.id)}<div>
					<span
						><b>{source.name}</b><small
							>{source.status} · {format(source.chars)} stored characters{source.error
								? ` · ${source.error}`
								: ''}</small
						></span
					><button
						aria-label={`Remove source ${source.name}`}
						onclick={() => deleteSource(source.id)}>Remove</button
					>
				</div>{/each}
			<p>
				Interrupted file imports must be removed and reselected. Paused analysis resumes from its
				saved checkpoint.
			</p>
		</div>
	{/if}
	{#if duplicateSources.length}<div class="kga-message">
			<span
				>Possible repeated sources: {duplicateSources.map((s) => s.name).join(', ')}. They are
				counted separately. Review Sources to remove duplicates if that is not intentional.</span
			>
		</div>{/if}
	{#if busy && progress}<div class="kga-processing" role="status" data-testid="atlas-progress">
			<div class="kga-processing-symbol">✳</div>
			<div>
				<b>{progress.phase}</b>
				<p>
					{progress.sourceName ?? 'Finding the structure in your material'} · {format(
						progress.words
					)} words processed
				</p>
				<progress max={Math.max(1, progress.totalBytes)} value={progress.bytes}></progress><small
					>{bytes(progress.bytes)} / {bytes(progress.totalBytes)} · complete input, no excerpt selection</small
				>
			</div>
			<button onclick={cancel}>Pause</button>
		</div>{/if}
	{#if error}<div class="kga-message kga-error" role="alert">
			<span>{error}</span><button onclick={() => (error = '')} aria-label="Dismiss error">×</button>
		</div>{/if}
	{#if settingsDiffer && !busy}<div class="kga-message" role="status">
			<span
				>The map and findings show the previous completed analysis. Rebuild to apply the changed
				settings.</span
			>
			<button onclick={applySettings}>Rebuild analysis</button>
		</div>{/if}
	{#if notice}<div class="kga-message" role="status">
			<span>{notice}</span><button onclick={() => (notice = '')} aria-label="Dismiss notification"
				>×</button
			>
		</div>{/if}
	{#if showExport && result}<div class="kga-export-panel">
			<div>
				<span class="kga-eyebrow">TAKE YOUR THINKING WITH YOU</span>
				<h3>A map is a beginning.</h3>
				<label class="kga-checkbox"
					><input type="checkbox" bind:checked={includeSources} /> Include original source text / excerpts</label
				><small
					>Sources may contain private material. Project files can be imported here later.</small
				>
			</div>
			<div class="kga-export-options">
				<button onclick={() => runExport('report')}
					><b>Research report</b><span>Questions & evidence · Markdown ↗</span></button
				><button onclick={() => runExport('project')}
					><b>Complete project</b><span>Portable backup · NDJSON ↗</span></button
				><button onclick={() => runExport('tables')}
					><b>Concepts & connections</b><span>Work with the numbers · CSV ↗</span></button
				><button disabled={view !== 'map'} onclick={() => runExport('svg')}
					><b>Vector map</b><span>Print or edit · SVG ↗</span></button
				><button disabled={view !== 'map'} onclick={() => runExport('png')}
					><b>Map image</b><span>Share your perspective · PNG ↗</span></button
				>
			</div>
		</div>{/if}
	{#if result}
		<div class="kga-workspace">
			<nav class="kga-view-tabs" aria-label="Atlas views">
				{#each [{ id: 'map', label: 'The map', icon: '◎' }, { id: 'findings', label: 'Discoveries', icon: '✧' }, { id: 'concepts', label: 'Concepts', icon: '≡' }, { id: 'compare', label: 'Compare', icon: '⇄' }, { id: 'sources', label: 'Sources', icon: '▤' }, { id: 'research', label: 'Research plan', icon: '↗' }] as tab (tab.id)}<button
						data-testid={`atlas-view-${tab.id}`}
						aria-current={view === tab.id ? 'page' : undefined}
						class:active={view === tab.id}
						onclick={() => switchView(tab.id as View)}
						><span>{tab.icon}</span
						>{tab.label}{#if tab.id === 'research' && project?.questions.length}<i
								>{project.questions.length}</i
							>{/if}</button
					>{/each}<button
					class="kga-settings-tab"
					aria-expanded={showSettings}
					onclick={() => (showSettings = !showSettings)}>⚙ <span>Settings</span></button
				>
			</nav>
			{#if showSettings}<div class="kga-settings">
					<div class="kga-section-heading">
						<div>
							<span class="kga-eyebrow">CHANGE THE LENS</span>
							<h3>Make the analysis yours.</h3>
						</div>
						<button onclick={() => (showSettings = false)} aria-label="Close settings">×</button>
					</div>
					<div class="kga-settings-grid">
						<label
							>Word window<input
								type="number"
								min="2"
								max="20"
								step="1"
								bind:value={settings.window}
								disabled={busy}
							/><small>Connections within a sentence, up to this many words apart.</small></label
						><label
							>Minimum occurrences<input
								type="number"
								min="1"
								step="1"
								bind:value={settings.minCount}
								disabled={busy}
							/><small>All source text stays indexed. This selects the analytical graph.</small
							></label
						><label
							>Topic resolution<input
								type="number"
								min=".2"
								max="4"
								step=".1"
								bind:value={settings.resolution}
								disabled={busy}
							/><small>Higher values generally distinguish more communities.</small></label
						><label
							>Exclude terms<input
								bind:value={excludedText}
								disabled={busy}
								placeholder="term, another term"
							/><small>Comma-separated. Changes are reversible.</small></label
						>
					</div>
					<div class="kga-button-row">
						<button class="kga-primary" disabled={busy} onclick={applySettings}
							>Rebuild with these settings ↗</button
						><button disabled={!history.length || busy} onclick={() => undoSettings()}
							>Undo analysis edit</button
						><button disabled={!future.length || busy} onclick={() => undoSettings(true)}
							>Redo</button
						>
					</div>
					<details>
						<summary>Merge vocabulary you know means the same thing</summary>
						<p>Aliases are your editorial decisions. The app does not infer synonyms.</p>
						<div class="kga-button-row">
							<input
								aria-label="Alias term"
								bind:value={aliasFrom}
								disabled={busy}
								placeholder="e.g. urban trees"
							/><span>→</span><input
								aria-label="Canonical term"
								bind:value={aliasTo}
								disabled={busy}
								placeholder="e.g. street trees"
							/><button onclick={addAlias} disabled={busy || !aliasFrom.trim() || !aliasTo.trim()}
								>Merge & rebuild</button
							>
						</div>
						{#each Object.entries(settings.aliases) as [from, to] (from)}<button
								class="kga-chip"
								disabled={busy}
								onclick={() => {
									const next = { ...settings.aliases };
									delete next[from];
									if (!changeSettings({ ...$state.snapshot(settings), aliases: next })) return;
									void safely(async () => {
										await persist();
										startAnalysis();
									});
								}}>{from} → {to} ×</button
							>{/each}
					</details>
				</div>{/if}
			<div class="kga-workspace-body" class:with-inspector={inspectorOpen}>
				{#if view === 'map' || view === 'concepts'}<aside class="kga-topic-rail">
						<div class="kga-rail-title">
							<span class="kga-eyebrow">TOPIC ISLANDS</span><span>{result.topics.length}</span>
						</div>
						<button
							class:active={topic === null}
							class="kga-all-topics"
							onclick={() => {
								topic = null;
								conceptPage = 0;
								mapComponent?.reset();
							}}>All topics <span>↗</span></button
						>
						<div class="kga-topic-list">
							{#each result.topics as t (t.id)}<button
									class:active={topic === t.id}
									onclick={() => {
										topic = topic === t.id ? null : t.id;
										conceptPage = 0;
										mapComponent?.reset();
									}}
									><i style:background={PALETTE[t.id % PALETTE.length]}></i><span
										><b>{project?.topicNames[t.id] || t.label}</b><small
											>{t.terms.length} concepts</small
										></span
									><span>↗</span></button
								>{/each}
						</div>
						<div class="kga-rail-note">
							<span>READING THE LANDSCAPE</span>
							<p>
								Colours group related ideas. Bigger dots mark more distinctive concepts. Lines
								connect words observed together.
							</p>
							<p>A position on the map is a reading aid, not a measure of truth.</p>
						</div>
					</aside>{/if}
				<main class="kga-main-view">
					{#if view === 'map'}<div class="kga-map-toolbar">
							<label class="kga-search"
								><span>⌕</span><input
									aria-label="Find a concept"
									placeholder="Find an idea…"
									bind:value={search}
								/></label
							><label class="kga-density"
								>Detail<select bind:value={density}
									><option value={70}>Quiet · 70</option><option value={140}>Balanced · 140</option
									><option value={300}>Detailed · 300</option><option value={700}>Deep · 700</option
									><option value={result.concepts.length}>All concepts</option></select
								></label
							>
						</div>
						<AtlasMap
							bind:this={mapComponent}
							{result}
							{selected}
							focused={selectedFinding?.concepts ?? []}
							{topic}
							{density}
							{search}
							pins={project?.pins ?? []}
							{dark}
							onselect={inspectConcept}
						/>{#if search}<div class="kga-search-matches">
								{#each filteredConcepts.slice(0, 12) as n (n.id)}<button
										onclick={() => inspectConcept(n.id)}>{n.label} ↗</button
									>{/each}{#if !filteredConcepts.length}<span
										>No matching concept. Try a shorter word or change the support threshold.</span
									>{/if}
							</div>{/if}
						{#if firstLead}<div class="kga-first-lead">
								<span class="kga-eyebrow">START WITH A QUESTION</span><button
									onclick={() => inspectFinding(firstLead)}
									><span>{firstLead.question}</span><b>Follow this lead ↗</b></button
								>
							</div>{/if}
					{:else if view === 'concepts'}<div class="kga-view-heading">
							<span class="kga-eyebrow">THE VOCABULARY OF YOUR MATERIAL</span>
							<h3>Ideas you can put your finger on.</h3>
							<p>
								A keyboard-accessible companion to the map. Select any concept to inspect its source
								evidence.
							</p>
						</div>
						<div class="kga-filter-row">
							<input
								aria-label="Search concepts"
								placeholder="Search concepts…"
								bind:value={search}
								oninput={() => (conceptPage = 0)}
							/><select
								aria-label="Filter concepts by source"
								bind:value={sourceFilter}
								onchange={() => (conceptPage = 0)}
								><option value="">All sources</option>{#each sources as source (source.id)}<option
										value={source.id}>{source.name}</option
									>{/each}</select
							>
						</div>
						<div class="kga-table-wrap">
							<table>
								<thead
									><tr><th>Concept</th><th>Occurrences</th><th>Sources</th><th>Connections</th></tr
									></thead
								><tbody
									>{#each filteredConcepts.slice(conceptPage * 40, (conceptPage + 1) * 40) as n (n.id)}<tr
											class:chosen={selected === n.id}
											><td
												><button onclick={() => inspectConcept(n.id)}
													><i
														class="kga-topic-dot"
														style:background={PALETTE[n.community % PALETTE.length]}
													></i>{n.label}</button
												></td
											><td>{format(n.count)}</td><td>{Object.keys(n.sources).length}</td><td
												>{n.degree}</td
											></tr
										>{/each}</tbody
								>
							</table>
						</div>
						<div class="kga-pagination">
							<button disabled={conceptPage === 0} onclick={() => conceptPage--}>← Previous</button
							><span>{format(filteredConcepts.length)} concepts · page {conceptPage + 1}</span
							><button
								disabled={(conceptPage + 1) * 40 >= filteredConcepts.length}
								onclick={() => conceptPage++}>Next →</button
							>
						</div>
					{:else if view === 'findings'}<div class="kga-view-heading">
							<span class="kga-eyebrow">FOLLOW THE INTERESTING EDGES</span>
							<h3>Your next good question<br />might be hiding here.</h3>
							<p>
								Evidence-linked leads, ranked by transparent heuristics. A starting point for
								investigation—not a verdict on your knowledge.
							</p>
						</div>
						<div class="kga-finding-filters">
							{#each ['all', 'gap', 'bridge', 'fragile', 'coverage', 'concentration', 'peripheral'] as kind (kind)}<button
									class:active={findingFilter === kind}
									onclick={() => (findingFilter = kind)}
									>{kind === 'all' ? 'All discoveries' : findingNames[kind]}</button
								>{/each}
						</div>
						<div class="kga-findings" data-testid="atlas-findings">
							{#each findings.slice(0, 80) as f, i (f.id)}<button
									class="kga-finding-card"
									class:chosen={selectedFinding?.id === f.id}
									onclick={() => inspectFinding(f)}
									><span class="kga-finding-number">{String(i + 1).padStart(2, '0')}</span>
									<div>
										<span class="kga-eyebrow">{findingNames[f.kind]}</span>
										<h4>{f.title}</h4>
										<p>{f.question}</p>
										<span class="kga-finding-footer"
											>{f.evidence.length} representative passages
											<b>Follow the evidence ↗</b></span
										>
									</div></button
								>{/each}{#if !findings.length}<div class="kga-empty">
									<h4>No supported findings in this view.</h4>
									<p>
										That is a valid result. Add more varied material, compare a reference, or adjust
										the analysis settings. The app will not invent a gap to fill the screen.
									</p>
								</div>{/if}
						</div>
						{#if project?.dismissed.length}<button
								class="kga-text-button"
								onclick={() => {
									project!.dismissed = [];
									void safely(persist);
								}}>Restore {project.dismissed.length} dismissed findings</button
							>{/if}
					{:else if view === 'compare'}<div class="kga-view-heading">
							<span class="kga-eyebrow">PUT TWO BODIES OF KNOWLEDGE SIDE BY SIDE</span>
							<h3>What does the reference<br />make you notice?</h3>
							<p>
								Compare your material with a reference you choose. Frequencies are normalised per
								1,000 words, so a longer document does not automatically win.
							</p>
						</div>
						{#if !referenceWords || !targetWords}<div class="kga-empty">
								<span class="kga-empty-symbol">⇄</span>
								<h4>Give your atlas a second perspective.</h4>
								<p>
									Add reference material—a reading list, background notes or a stronger draft—to see
									which concepts have lighter coverage.
								</p>
								<button
									class="kga-primary"
									onclick={() => {
										role = 'reference';
										showInput = true;
									}}>+ Add a reference</button
								>
							</div>{:else}<div class="kga-compare-key">
								<span
									><i style:background="#28786f"></i>Your material · {format(targetWords)} words</span
								><span
									><i style:background="#b66042"></i>Reference · {format(referenceWords)} words</span
								>
							</div>
							<div class="kga-comparison">
								{#each comparison as n (n.id)}<button onclick={() => inspectConcept(n.id)}
										><b>{n.label}</b>
										<div class="kga-comparison-bars">
											<span
												style:width={`${Math.max(1, (n.targetRate / Math.max(n.referenceRate, n.targetRate, 1)) * 100)}%`}
												><i>{n.targetRate.toFixed(1)}</i></span
											><span
												style:width={`${Math.max(1, (n.referenceRate / Math.max(n.referenceRate, n.targetRate, 1)) * 100)}%`}
												><i>{n.referenceRate.toFixed(1)}</i></span
											>
										</div>
										<small
											>{n.targetCount === 0
												? 'Not found in target'
												: n.targetRate < n.referenceRate
													? 'Lighter in target'
													: 'Present in target'}</small
										></button
									>{/each}
							</div>{/if}
						<details class="kga-method-note">
							<summary>Source-by-topic matrix</summary>
							<div class="kga-table-wrap">
								<table>
									<thead
										><tr
											><th>Topic / source</th>{#each sources as s (s.id)}<th>{s.name}</th
												>{/each}</tr
										></thead
									><tbody
										>{#each result.topics as t (t.id)}<tr
												><th>{t.label}</th>{#each sources as s (s.id)}<td
														style:background={`color-mix(in srgb, ${PALETTE[t.id % PALETTE.length]} ${Math.min(35, ((t.sources[s.id] ?? 0) / Math.max(1, t.count)) * 100)}%, transparent)`}
														>{format(t.sources[s.id] ?? 0)}</td
													>{/each}</tr
											>{/each}</tbody
									>
								</table>
							</div>
							<p>
								Cells count eligible concept occurrences, including phrases. They are not unique
								word totals.
							</p>
						</details>
					{:else if view === 'sources'}<div class="kga-view-heading">
							<span class="kga-eyebrow">THE GROUND BENEATH THE MAP</span>
							<h3>Every idea starts somewhere.</h3>
							<p>
								Your original text, unchanged and stored in this browser. Nothing is uploaded to an
								analysis service.
							</p>
						</div>
						<div class="kga-sources" data-testid="atlas-sources">
							{#each sources as s (s.id)}<div class:chosen={sourceId === s.id}>
									<button onclick={() => showSource(s.id)}
										><span class="kga-source-icon">▤</span><span
											><b>{s.name}</b><small
												>{s.role === 'reference' ? 'Reference' : 'Your material'} · {format(
													s.words
												)} words · {format(s.chars)} characters · {s.status}</small
											></span
										><span>↗</span></button
									><button
										aria-label={`Remove source ${s.name}`}
										class="kga-icon"
										disabled={busy}
										onclick={() => deleteSource(s.id)}>×</button
									>
								</div>{/each}
						</div>
						{#if sourcePage}<div class="kga-source-reader">
								<div class="kga-section-heading">
									<b>{sources.find((s) => s.id === sourceId)?.name}</b><small
										>Characters {format(sourcePage.start + 1)}–{format(
											sourcePage.start + sourcePage.text.length
										)} of {format(sourcePage.totalChars)}</small
									>
								</div>
								<pre>{sourcePage.text}</pre>
								<div class="kga-pagination">
									<button
										disabled={!sourcePage.start}
										onclick={() => showSource(sourceId, Math.max(0, sourcePage!.start - 5000))}
										>← Previous passage</button
									><button
										disabled={sourcePage.start + sourcePage.text.length >= sourcePage.totalChars}
										onclick={() => showSource(sourceId, sourcePage!.start + 5000)}
										>Next passage →</button
									>
								</div>
							</div>{/if}
					{:else if view === 'research'}<div class="kga-view-heading">
							<span class="kga-eyebrow">FROM A MAP TO A WAY FORWARD</span>
							<h3>Make something of<br />what you found.</h3>
							<p>
								Collect questions, preserve their evidence, and add your own thinking. Your research
								plan is saved with this atlas.
							</p>
						</div>
						<div class="kga-question-compose">
							<label for="kga-question" class="kga-sr-only">New research question</label><textarea
								id="kga-question"
								bind:value={questionText}
								placeholder="What do you want to investigate?"
								rows="2"
							></textarea><button
								class="kga-primary"
								disabled={!questionText.trim()}
								onclick={() => saveQuestion(questionText)}>Add question ↗</button
							>
						</div>
						<div class="kga-research" data-testid="atlas-research">
							{#each project?.questions ?? [] as q, i (q.id)}<article
									class:addressed={q.status === 'addressed'}
								>
									<div class="kga-question-top">
										<span>{String(i + 1).padStart(2, '0')}</span><input
											aria-label={`Research question ${i + 1}`}
											bind:value={q.text}
											onblur={() => safely(persist)}
										/><select
											aria-label={`Status for question ${i + 1}`}
											bind:value={q.status}
											onchange={() => safely(persist)}
											><option value="investigate">To investigate</option><option value="addressed"
												>Addressed</option
											><option value="dismissed">Set aside</option></select
										>
									</div>
									<textarea
										aria-label={`Notes for question ${i + 1}`}
										bind:value={q.note}
										onblur={() => safely(persist)}
										placeholder="Your notes, next steps, or what changed your mind…"
										rows="2"
									></textarea>
									<div class="kga-question-bottom">
										<button
											disabled={!q.evidence.length}
											onclick={() => {
												selected = '';
												selectedFinding = null;
												edgeLabel = q.text;
												void loadEvidence(q.evidence);
											}}>Inspect evidence ({q.evidence.length}) ↗</button
										>
										<div>
											<button
												aria-label={`Move question ${i + 1} up`}
												disabled={!i}
												onclick={() => {
													const qs = project!.questions;
													[qs[i - 1], qs[i]] = [qs[i], qs[i - 1]];
													void safely(persist);
												}}>↑</button
											><button
												aria-label={`Remove question ${i + 1}`}
												onclick={() => {
													project!.questions = project!.questions.filter((x) => x.id !== q.id);
													void safely(persist);
												}}>×</button
											>
										</div>
									</div>
								</article>{/each}{#if !project?.questions.length}<div class="kga-empty">
									<span class="kga-empty-symbol">↗</span>
									<h4>Give curiosity a place to go.</h4>
									<p>Save a question from Discoveries, or write one of your own above.</p>
									<button onclick={() => (view = 'findings')}>Explore discoveries →</button>
								</div>{/if}
						</div>
					{/if}
				</main>
				{#if inspectorOpen}<aside
						class="kga-inspector"
						data-testid="atlas-evidence"
						aria-label="Evidence inspector"
					>
						<div class="kga-inspector-top">
							<span class="kga-eyebrow">FOLLOW THE EVIDENCE</span><button
								aria-label="Close evidence inspector"
								onclick={closeInspector}>×</button
							>
						</div>
						{#if selectedConcept}<span class="kga-inspector-kind"
								><i
									class="kga-topic-dot"
									style:background={PALETTE[selectedConcept.community % PALETTE.length]}
								></i>
								{selectedConcept.phrase ? 'Repeated phrase' : 'Concept'}</span
							>
							<h3>{selectedConcept.label}</h3>
							<div class="kga-concept-stats">
								<div><b>{format(selectedConcept.count)}</b><span>occurrences</span></div>
								<div><b>{Object.keys(selectedConcept.sources).length}</b><span>sources</span></div>
								<div><b>{selectedConcept.degree}</b><span>neighbours</span></div>
							</div>
							<div class="kga-button-row">
								<button onclick={() => togglePin(selectedConcept.id)}
									>{project?.pins.includes(selectedConcept.id)
										? '★ Pinned'
										: '☆ Pin concept'}</button
								><button disabled={busy} onclick={() => excludeConcept(selectedConcept.id)}
									>Exclude</button
								>
							</div>
						{:else if selectedFinding}<span class="kga-inspector-kind"
								>{findingNames[selectedFinding.kind]}</span
							>
							<h3>{selectedFinding.title}</h3>
							<p>{selectedFinding.explanation}</p>
							<div class="kga-factor-bars">
								{#each [{ label: 'Relevance', value: selectedFinding.factors.relevance }, { label: 'Connection / coverage deficit', value: selectedFinding.factors.deficit }, { label: 'Evidence support', value: selectedFinding.factors.support }] as factor (factor.label)}<div
									>
										<span>{factor.label}</span><i
											><b style:width={`${Math.max(0, Math.min(1, factor.value)) * 100}%`}></b></i
										>
									</div>{/each}<small>Heuristic ranking factors. Not probabilities.</small>
							</div>
							<div class="kga-investigation">
								<span class="kga-eyebrow">A QUESTION TO TAKE WITH YOU</span>
								<p>{selectedFinding.question}</p>
								<button
									class="kga-primary"
									data-testid="atlas-question-save"
									onclick={() =>
										saveQuestion(
											selectedFinding!.question,
											selectedFinding!.evidence,
											selectedFinding!.id
										)}>Save question ↗</button
								>
							</div>
							<details class="kga-caveat">
								<summary>Another way to read this</summary>
								<p>{selectedFinding.caveat}</p>
							</details>
							<div class="kga-button-row">
								<button
									onclick={() => {
										view = 'map';
										topic = null;
									}}>See on the map</button
								><button onclick={() => dismissFinding(selectedFinding!)}>Set aside</button>
							</div>
						{:else}<h3>{edgeLabel}</h3>{/if}
						<div class="kga-evidence-heading">
							<span class="kga-eyebrow">IN THE ORIGINAL WORDS</span><small
								>Representative locations · all occurrences counted</small
							>
						</div>
						{#if evidenceLoading}<p role="status">
								Opening source passages…
							</p>{/if}{#if evidenceError}<p class="kga-inline-error">{evidenceError}</p>{/if}
						{#each evidence as entry (entry.ref.sourceId + ':' + entry.ref.start + ':' + entry.ref.end)}<blockquote
								class="kga-evidence"
							>
								<div>
									<span>▤ {entry.sourceName}</span><button
										aria-label={`Open source ${entry.sourceName}`}
										onclick={() =>
											showSource(entry.ref.sourceId, Math.max(0, entry.ref.start - 160))}>↗</button
									>
								</div>
								<p>
									{entry.text.slice(0, entry.start)}<mark
										>{entry.text.slice(entry.start, entry.end)}</mark
									>{entry.text.slice(entry.end)}
								</p>
								<small>Source offsets {entry.ref.start}–{entry.ref.end}</small>
								{#if entry.clipped}<small
										>Excerpt shortened for display. Open the source to continue reading the complete
										passage.</small
									>{/if}
							</blockquote>{/each}
						{#if selectedConcept && neighbouring.length}<div class="kga-evidence-heading">
								<span class="kga-eyebrow">OBSERVED CONNECTIONS</span>
							</div>
							<div class="kga-neighbours">
								{#each neighbouring as edge (edge.id)}{@const neighbour = result.concepts.find(
										(n) => n.id === (edge.source === selected ? edge.target : edge.source)
									)}<button
										onclick={() => {
											edgeLabel = `${selectedConcept.label} ↔ ${neighbour?.label ?? ''}`;
											selected = '';
											void loadEvidence(edge.evidence);
										}}>{neighbour?.label} <small>{edge.count} windows ↗</small></button
									>{/each}
							</div>{/if}
					</aside>{/if}
			</div>
			<div class="kga-status-strip">
				<span
					><span class="kga-live-dot"></span>
					{sourceReady ? 'Full input indexed' : 'Saved analysis'} · {format(completedWords)} words · No
					AI service</span
				><span
					>Saved on this device{previous
						? ` · ${result.words - previous.words >= 0 ? '+' : ''}${format(result.words - previous.words)} words since previous analysis`
						: ''}</span
				>
			</div>
		</div>
		<details class="kga-methodology">
			<summary
				><span>HOW THIS MAP WAS MADE</span><span>Transparent methods. Useful limits. +</span
				></summary
			>
			<div>
				<p>{result.scope}</p>
				<p>
					Connections mean that terms appeared near each other, within sentence boundaries. They do
					not establish causality, agreement, correctness, or a reader’s knowledge. Communities use
					a seeded network clustering algorithm. Research questions use templates, not a language
					model.
				</p>
				<p>
					Every source character is retained. Stopwords, minimum support, and your exclusions shape
					the analytical graph; the map’s detail control only changes what is drawn. Sources are
					stored locally, not in a permanent or encrypted vault. Export a backup before clearing
					browser data.
				</p>
				<p>
					Input has no imposed word or token quota. Available memory and storage determine practical
					capacity. The complete graph currently needs memory proportional to its vocabulary and
					associations. Resource failures preserve saved source chunks and analysis checkpoints.
				</p>
			</div>
		</details>
	{/if}
	<footer class="kga-footer">
		<span>✳ KNOWLEDGE GAP ATLAS</span>
		<p>More perspective. Better questions.</p>
		<a href={resolve('/blog/visualizations')}>An experiment by Suvro Ghosh ↗</a>
	</footer>
</section>
