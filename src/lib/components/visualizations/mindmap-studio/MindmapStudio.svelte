<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import SourcePanel from './SourcePanel.svelte';
	import Inspector from './Inspector.svelte';
	import MindMapCanvas from './MindMapCanvas.svelte';
	import KnowledgeGraph from './KnowledgeGraph.svelte';
	import { createExampleProject } from '$lib/visualizations/mindmap-studio/example';
	import {
		createBlankProject,
		validateProject,
		addNode,
		deleteNode,
		moveNode
	} from '$lib/visualizations/mindmap-studio/model';
	import { createAnalysisPrompt } from '$lib/visualizations/mindmap-studio/analysis';
	import {
		exportProject,
		exportMarkdown,
		exportMermaidMindmap,
		exportMermaidGraph,
		createPublicSnapshot
	} from '$lib/visualizations/mindmap-studio/exports';
	import {
		saveProject,
		loadProject,
		clearProject
	} from '$lib/visualizations/mindmap-studio/storage';
	import type {
		StudioProject,
		StudioSource,
		StudioNode,
		StudioEdge,
		Evidence
	} from '$lib/visualizations/mindmap-studio/types';
	import './studio.css';

	let project = $state.raw<StudioProject>(createExampleProject());
	let view = $state<'mindmap' | 'graph' | 'outline' | 'analysis'>('mindmap');
	let ready = $state(false);
	let showSources = $state(false);
	let showInspector = $state(false);
	let selectedId = $state<string | null>(null);
	let selectedEdge = $state<string | null>(null);
	let search = $state('');
	let readonly = $state(false);
	let history = $state.raw<StudioProject[]>([]);
	let future = $state.raw<StudioProject[]>([]);
	let message = $state('');
	let error = $state('');
	let busy = $state(false);
	let progress = $state('');
	let saved = $state('Example · ready to explore');
	let aiAvailable = $state(false);
	let availability = $state('Checking AI availability…');
	let command = $state<{
		type: 'fit' | 'zoom-in' | 'zoom-out' | 'export-png' | 'export-svg';
		serial: number;
	}>({ type: 'fit', serial: 0 });
	let evidence = $state<Evidence | null>(null);
	let importInput: HTMLInputElement;
	let studio: HTMLElement;
	let saveTimer: ReturnType<typeof setTimeout> | undefined;
	let worker: Worker | undefined;
	let controller: AbortController | undefined;
	let runId = 0;
	let destroyed = false;
	let saveEnabled = false;
	let saveQueue = Promise.resolve();
	const selected = $derived(project.nodes.find((node) => node.id === selectedId) ?? null);
	const edge = $derived(project.edges.find((item) => item.id === selectedEdge) ?? null);
	const matches = $derived(
		search.trim()
			? project.nodes
					.filter((node) =>
						`${node.label} ${node.description}`.toLowerCase().includes(search.toLowerCase())
					)
					.slice(0, 20)
			: []
	);
	const evidenceSource = $derived(
		evidence ? project.sources.find((source) => source.id === evidence?.sourceId) : null
	);
	const root = $derived(project.nodes.find((node) => node.id === project.rootId));
	const branches = $derived(project.nodes.filter((node) => node.parentId === project.rootId));
	const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
	function openDialog(element: HTMLDialogElement) {
		element.showModal();
		return {
			destroy() {
				element.close();
			}
		};
	}

	function announce(text: string) {
		message = text;
		error = '';
	}
	function fail(text: string) {
		error = text;
		message = '';
	}
	function queueSave(next: StudioProject) {
		if (!saveEnabled || destroyed) return;
		clearTimeout(saveTimer);
		saved = 'Saving on this device…';
		saveTimer = setTimeout(() => {
			saveQueue = saveQueue
				.then(() => saveProject(next))
				.then(() => {
					if (!destroyed) saved = 'Saved on this device';
				})
				.catch(() => {
					if (!destroyed) {
						saved = 'Could not save';
						fail(
							'Browser storage is unavailable or full. Download the project JSON to keep your work.'
						);
					}
				});
		}, 500);
	}
	function change(next: StudioProject, remember = true) {
		if (busy) cancel();
		try {
			const valid = validateProject({ ...clone(next), updatedAt: new Date().toISOString() });
			if (remember) {
				history = [...history.slice(-29), project];
				future = [];
			}
			project = valid;
			saveEnabled = true;
			queueSave(valid);
		} catch (cause) {
			fail(cause instanceof Error ? cause.message : 'That change could not be saved.');
		}
	}
	function undo() {
		if (!history.length || busy) return;
		const previous = history.at(-1)!;
		future = [project, ...future.slice(0, 29)];
		history = history.slice(0, -1);
		change(previous, false);
		announce('Previous revision restored.');
	}
	function redo() {
		if (!future.length || busy) return;
		const next = future[0];
		history = [...history, project];
		future = future.slice(1);
		change(next, false);
	}
	function select(id: string) {
		selectedId = id;
		selectedEdge = null;
		showInspector = true;
	}
	function selectEdge(id: string) {
		selectedEdge = id;
		selectedId = null;
		showInspector = true;
	}
	function newProject(example = false) {
		cancel();
		change(example ? createExampleProject() : createBlankProject());
		selectedId = null;
		selectedEdge = null;
		showInspector = false;
		showSources = !example;
		search = '';
		readonly = false;
		announce(
			example
				? 'Example loaded. Your previous map is available in Undo.'
				: 'A fresh canvas. Add a source or begin with an idea.'
		);
	}
	function updateNode(patch: Partial<StudioNode>) {
		if (!selected) return;
		change({
			...project,
			nodes: project.nodes.map((node) => (node.id === selected.id ? { ...node, ...patch } : node))
		});
	}
	function addChild() {
		try {
			const parent = selectedId || project.rootId;
			const next = addNode(project, parent, 'New idea');
			change(next);
			select(next.nodes.at(-1)!.id);
		} catch (cause) {
			fail(cause instanceof Error ? cause.message : 'Could not add an idea.');
		}
	}
	function removeNode() {
		if (!selectedId || selectedId === project.rootId) return;
		change(deleteNode(project, selectedId));
		selectedId = null;
		showInspector = false;
		announce('Branch removed. Undo is available.');
	}
	function updateEdge(next: StudioEdge | null, id?: string) {
		change({
			...project,
			edges: next
				? [...project.edges.filter((item) => item.id !== next.id), next]
				: project.edges.filter((item) => item.id !== id)
		});
		if (!next) selectedEdge = null;
	}
	function act(type: typeof command.type) {
		command = { type, serial: command.serial + 1 };
	}
	function download(contents: string, name: string, type = 'text/plain;charset=utf-8') {
		const url = URL.createObjectURL(new Blob([contents], { type }));
		const a = document.createElement('a');
		a.href = url;
		a.download = name;
		a.click();
		setTimeout(() => URL.revokeObjectURL(url), 1000);
	}
	function exportFile(kind: string) {
		try {
			const name =
				project.title
					.toLowerCase()
					.replace(/[^a-z0-9]+/g, '-')
					.replace(/^-|-$/g, '') || 'mindmap';
			if (kind === 'json')
				download(exportProject(project), `${name}.mindmap.json`, 'application/json');
			if (kind === 'markdown') download(exportMarkdown(project), `${name}.md`, 'text/markdown');
			if (kind === 'mermaid')
				download(
					view === 'graph' ? exportMermaidGraph(project) : exportMermaidMindmap(project),
					`${name}.mmd`
				);
			if (kind === 'publish') {
				const snapshot = createPublicSnapshot(project);
				download(JSON.stringify(snapshot, null, 2), `${name}.public.json`, 'application/json');
				announce(
					'Public snapshot downloaded. Review its text before adding it to a blog post; private sources and notes are removed.'
				);
			}
			if (kind === 'png' || kind === 'svg') {
				if (view !== 'mindmap' && view !== 'graph') {
					fail('Open the mind map or knowledge graph to export its image.');
					return;
				}
				act(kind === 'png' ? 'export-png' : 'export-svg');
			}
		} catch (cause) {
			fail(cause instanceof Error ? cause.message : 'Export failed.');
		}
	}
	async function importFile(event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		try {
			if (file.size > 2 * 1024 * 1024) throw new Error('Project files must be smaller than 2 MB.');
			const imported = validateProject(JSON.parse(await file.text()));
			cancel();
			change(imported);
			selectedId = null;
			selectedEdge = null;
			readonly = false;
			announce('Project restored, including its sources and connections.');
		} catch (cause) {
			fail(cause instanceof Error ? cause.message : 'Could not import this project.');
		} finally {
			input.value = '';
		}
	}
	async function copyPrompt(
		sources: StudioSource[],
		focus: string,
		depth: 'overview' | 'detailed' | 'research'
	) {
		const prompt = createAnalysisPrompt(sources, focus, depth);
		try {
			await navigator.clipboard.writeText(prompt);
			announce('Research prompt copied. Import its project JSON result to explore it here.');
		} catch {
			download(prompt, 'mindmap-research-prompt.txt');
			announce('Research prompt downloaded.');
		}
	}
	function cancel() {
		runId++;
		controller?.abort();
		worker?.terminate();
		controller = undefined;
		worker = undefined;
		if (busy) announce('Analysis cancelled. Your previous map is intact.');
		busy = false;
	}
	async function analyse(
		sources: StudioSource[],
		focus: string,
		depth: 'overview' | 'detailed' | 'research',
		mode: 'local' | 'ai',
		consent: boolean
	) {
		cancel();
		const id = runId;
		busy = true;
		error = '';
		message = '';
		progress =
			mode === 'ai'
				? 'Reading sources · extracting ideas and their evidence'
				: 'Arranging source passages into a local outline';
		controller = new AbortController();
		const timeout = setTimeout(
			() => {
				if (id === runId) {
					cancel();
					fail(
						'Analysis reached its time limit. Your existing map is safe; try a smaller selection.'
					);
				}
			},
			mode === 'ai' ? 65_000 : 12_000
		);
		try {
			let next: StudioProject;
			if (mode === 'ai') {
				if (!consent)
					throw new Error('Consent is required before sending your sources for analysis.');
				const response = await fetch('/api/mindmap-studio', {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ sources, focus, depth, consent }),
					signal: controller.signal
				});
				const data = await response.json();
				if (!response.ok)
					throw new Error(
						typeof data.error === 'string'
							? data.error
							: data.message ||
									data.error?.message ||
									'AI analysis is unavailable. Your previous map is safe.'
					);
				next = validateProject(data.project);
			} else {
				next = await new Promise<StudioProject>((resolve, reject) => {
					worker = new Worker(
						new URL('../../../visualizations/mindmap-studio/analysis.worker.ts', import.meta.url),
						{ type: 'module' }
					);
					worker.onmessage = (event) => {
						try {
							if (event.data.error) reject(new Error(event.data.error));
							else resolve(validateProject(event.data.project));
						} catch (cause) {
							reject(cause);
						}
					};
					worker.onerror = () =>
						reject(new Error('The outline worker could not finish. Try a shorter source.'));
					controller?.signal.addEventListener(
						'abort',
						() => reject(new DOMException('Analysis cancelled', 'AbortError')),
						{ once: true }
					);
					worker.postMessage(clone({ sources, focus, depth }));
				});
			}
			if (id !== runId || destroyed) return;
			change(next);
			selectedId = null;
			selectedEdge = null;
			showSources = false;
			showInspector = false;
			view = 'mindmap';
			readonly = false;
			search = '';
			announce(
				`${mode === 'ai' ? 'Analysis' : 'Local outline'} ready: ${next.nodes.length} ideas, ${next.edges.length} connections. Select an idea to inspect its evidence.`
			);
		} catch (cause) {
			if (id === runId && !destroyed)
				fail(cause instanceof Error ? cause.message : 'Analysis could not finish.');
		} finally {
			clearTimeout(timeout);
			if (id === runId) {
				busy = false;
				worker?.terminate();
				worker = undefined;
			}
		}
	}
	async function fullscreen() {
		try {
			if (document.fullscreenElement) await document.exitFullscreen();
			else if (studio.requestFullscreen) await studio.requestFullscreen();
			else studio.scrollIntoView({ block: 'start' });
		} catch {
			announce('Use your browser’s full-screen controls for a larger canvas.');
		}
	}
	async function forget() {
		clearTimeout(saveTimer);
		saveEnabled = false;
		try {
			await saveQueue;
			await clearProject();
			saved = 'Local save removed';
			announce(
				'Saved data removed from this browser. The open map remains in memory until you leave or edit it.'
			);
		} catch {
			fail('The browser could not remove its saved data. Try closing other tabs and retrying.');
		}
	}
	onMount(() => {
		ready = true;
		const keyboardHistory = (event: KeyboardEvent) => {
			const target = event.target as HTMLElement | null;
			if (
				!target ||
				!studio.contains(target) ||
				target.closest('input,textarea,[contenteditable="true"]') ||
				readonly ||
				busy ||
				(!event.ctrlKey && !event.metaKey) ||
				event.altKey
			)
				return;
			if (event.key.toLowerCase() === 'z') {
				event.preventDefault();
				if (event.shiftKey) redo();
				else undo();
			} else if (event.key.toLowerCase() === 'y') {
				event.preventDefault();
				redo();
			}
		};
		document.addEventListener('keydown', keyboardHistory, true);
		const syncTheme = () => {
			project = {
				...project,
				theme: document.documentElement.dataset.theme === 'night' ? 'night' : 'paper'
			};
		};
		syncTheme();
		const themeObserver = new MutationObserver(syncTheme);
		themeObserver.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ['data-theme']
		});
		void loadProject()
			.then((restored) => {
				if (restored && !saveEnabled && !destroyed) {
					project = restored;
					saved = 'Restored from this device';
				}
			})
			.catch(() => {
				saved = 'Device storage unavailable';
			});
		const probe = new AbortController();
		const deadline = setTimeout(() => probe.abort(), 12_000);
		void fetch('/api/mindmap-studio', { signal: probe.signal })
			.then((response) => response.json())
			.then((data) => {
				if (!destroyed) {
					aiAvailable = data.available === true;
					availability =
						data.reason ||
						(aiAvailable
							? 'Free AI analysis is available, subject to shared usage limits.'
							: 'AI is currently unavailable. Local outline and prompt export remain available.');
				}
			})
			.catch(() => {
				availability =
					'AI availability could not be checked. Local outline and prompt export remain available.';
			})
			.finally(() => clearTimeout(deadline));
		return () => {
			probe.abort();
			themeObserver.disconnect();
			document.removeEventListener('keydown', keyboardHistory, true);
		};
	});
	onDestroy(() => {
		destroyed = true;
		controller?.abort();
		worker?.terminate();
		clearTimeout(saveTimer);
		if (saveEnabled) {
			const latest = project;
			saveQueue = saveQueue.then(() => saveProject(latest)).catch(() => undefined);
		}
	});
</script>

{#snippet outlineNode(node: StudioNode, depth = 0)}
	<li class="outline-node">
		<div class="outline-row" style={`--depth:${depth}`}>
			<button class:chosen={selectedId === node.id} onclick={() => select(node.id)}
				><span class="outline-dot" style={`background:${node.color || 'var(--ms-accent)'}`}
				></span><span>{node.label}</span><small>{node.status}</small></button
			>{#if !readonly && node.id !== project.rootId}<select
					aria-label={`Move ${node.label} under`}
					value={node.parentId || ''}
					onchange={(event) => {
						try {
							change(moveNode(project, node.id, event.currentTarget.value));
						} catch (cause) {
							fail(cause instanceof Error ? cause.message : 'Cannot move this branch.');
						}
					}}
					><option disabled value="">Move under…</option
					>{#each project.nodes.filter((item) => item.id !== node.id) as parent (parent.id)}<option
							value={parent.id}>{parent.label}</option
						>{/each}</select
				>{/if}
		</div>
		{#if project.nodes.some((item) => item.parentId === node.id)}<ul>
				{#each project.nodes.filter((item) => item.parentId === node.id) as child (child.id)}{@render outlineNode(
						child,
						depth + 1
					)}{/each}
			</ul>{/if}
	</li>
{/snippet}

<section
	class="mindmap-studio not-prose"
	bind:this={studio}
	data-studio-theme={project.theme}
	aria-label="Mindmap Studio"
	data-testid="mindmap-studio"
>
	<header class="studio-masthead">
		<div class="studio-wordmark">
			<svg viewBox="0 0 48 48" aria-hidden="true"
				><path
					d="M24 25C12 25 14 9 6 9M24 25C11 25 13 39 5 39M24 25C35 25 32 8 43 8M24 25C36 25 33 39 44 39"
				/><circle cx="24" cy="25" r="6" /><circle cx="6" cy="9" r="3" /><circle
					cx="5"
					cy="39"
					r="3"
				/><circle cx="43" cy="8" r="3" /><circle cx="44" cy="39" r="3" /></svg
			>
			<div>
				<span class="eyebrow">A FIELD GUIDE TO YOUR IDEAS</span>
				<h1>Mindmap <em>Studio.</em></h1>
			</div>
		</div>
		<div class="masthead-note">Read deeply.<br />See the connections.</div>
	</header>
	<div class="project-bar">
		<div class="project-name">
			<span class="live-dot"></span><label
				><span class="sr-only">Project title</span><input
					value={project.title}
					maxlength="200"
					{readonly}
					onchange={(event) =>
						change({ ...project, title: event.currentTarget.value.trim() || 'Untitled map' })}
				/></label
			><span class="save-status" aria-live="polite">{saved}</span>
		</div>
		<div class="project-actions">
			<button onclick={() => newProject(false)} disabled={busy}>+ New</button><button
				onclick={() => newProject(true)}
				disabled={busy}>Example</button
			><button onclick={() => importInput.click()} disabled={busy}>Import</button><input
				bind:this={importInput}
				type="file"
				accept=".json"
				hidden
				onchange={importFile}
			/>
			<details class="export-menu">
				<summary>Export ↗</summary>
				<div>
					<button onclick={() => exportFile('json')}>Editable project · JSON</button><button
						onclick={() => exportFile('png')}>Map image · PNG</button
					><button onclick={() => exportFile('svg')}>Vector image · SVG</button><button
						onclick={() => exportFile('markdown')}>Analysis & outline · Markdown</button
					><button onclick={() => exportFile('mermaid')}>Diagram source · Mermaid</button><button
						onclick={() => exportFile('publish')}>Public snapshot · JSON</button
					><button class="danger" onclick={() => void forget()}>Remove saved browser data</button>
				</div>
			</details>
		</div>
	</div>
	<div class="studio-toolbar">
		<div class="view-tabs" role="group" aria-label="Map views">
			{#each [['mindmap', 'Mind map'], ['graph', 'Knowledge graph'], ['outline', 'Outline'], ['analysis', 'Analysis']] as tab (tab[0])}<button
					aria-pressed={view === tab[0]}
					class:active={view === tab[0]}
					onclick={() => (view = tab[0] as typeof view)}>{tab[1]}</button
				>{/each}
		</div>
		<div class="toolbar-actions">
			<button class:active={showSources} onclick={() => (showSources = !showSources)}
				>Sources <span>{project.sources.length}</span></button
			><button
				onclick={undo}
				disabled={!history.length || busy || readonly}
				aria-label="Undo"
				title="Undo">↶</button
			><button
				onclick={redo}
				disabled={!future.length || busy || readonly}
				aria-label="Redo"
				title="Redo">↷</button
			><button
				onclick={() => {
					readonly = !readonly;
					announce(
						readonly ? 'Reader view. Editing controls are hidden.' : 'Editing your local copy.'
					);
				}}
				aria-pressed={readonly}>{readonly ? 'Read only' : 'Edit mode'}</button
			><button
				onclick={() => change({ ...project, theme: project.theme === 'paper' ? 'night' : 'paper' })}
				aria-label="Toggle canvas theme"
				title="Toggle canvas theme">◐</button
			><button onclick={fullscreen} aria-label="Full screen" title="Full screen">⛶</button>
		</div>
	</div>
	{#if error}<div class="studio-alert error" role="alert">
			<span>{error}</span><button
				class="icon-button"
				onclick={() => (error = '')}
				aria-label="Dismiss error">×</button
			>
		</div>{/if}
	{#if busy}<div class="processing" role="status">
			<span class="processing-dot"></span>{progress}<button onclick={cancel}>Cancel</button>
		</div>{/if}
	<div
		class="studio-workspace"
		class:with-sources={showSources}
		class:with-inspector={showInspector}
	>
		<div hidden={!showSources} class="source-panel-holder">
			<SourcePanel
				sources={project.sources}
				onanalyse={analyse}
				onclose={() => (showSources = false)}
				onprompt={copyPrompt}
				{busy}
				{availability}
				{aiAvailable}
				oncancel={cancel}
			/>
		</div>
		<div class="canvas-column">
			<div class="canvas-caption">
				<span class="eyebrow"
					>{view === 'graph'
						? '02 / BETWEEN THE IDEAS'
						: view === 'analysis'
							? '02 / THE READING'
							: '02 / THE BIG PICTURE'}</span
				>
				<div class="map-search">
					<label
						><span class="sr-only">Find an idea</span><input
							bind:value={search}
							placeholder="Find an idea…"
							type="search"
						/></label
					>{#if search}<div class="search-results">
							{#each matches as node (node.id)}<button
									onclick={() => {
										select(node.id);
										search = '';
									}}>{node.label}</button
								>{/each}{#if !matches.length}<span>No matching ideas</span>{/if}
						</div>{/if}
				</div>
			</div>
			{#if view === 'mindmap' || view === 'graph'}
				<div class="map-stage">
					{#if ready}{#if view === 'mindmap'}<MindMapCanvas
								{project}
								{selectedId}
								onselect={select}
								onchange={change}
								{readonly}
								{command}
								onerror={fail}
							/>{:else}<KnowledgeGraph
								{project}
								{selectedId}
								onselect={select}
								onedgeselect={selectEdge}
								{command}
								onerror={fail}
							/>{/if}{:else}<div class="canvas-loading">
							<span class="eyebrow">MINDMAP STUDIO</span>
							<h3>{root?.label}</h3>
							<p>Preparing your canvas…</p>
						</div>{/if}
					<div class="canvas-controls">
						{#if !readonly}<button onclick={addChild}>+ Idea</button>{/if}
					</div>
				</div>
			{:else if view === 'outline'}<div class="outline-view">
					<h3>{project.title}</h3>
					<p class="quiet">
						The same ideas, in reading order. Select an idea to inspect or edit it.
					</p>
					<ul class="outline-tree">
						{#if root}{@render outlineNode(root)}{/if}
					</ul>
				</div>
			{:else}<div class="analysis-view">
					<div class="analysis-intro">
						<span class="eyebrow">A READING COMPANION</span>
						<h3>{project.title}</h3>
						<p>
							{project.generation.mode === 'local'
								? 'An extractive reading outline. Interpretations require your review or a separate AI analysis.'
								: 'Read the argument, trace the support, and leave room for questions.'}
						</p>
					</div>
					{#each project.analysis as section (section.id)}<section>
							<h4>{section.title}</h4>
							<p class="preserve-lines">{section.body}</p>
						</section>{/each}
					<section>
						<h4>Concept inventory</h4>
						<div class="concept-inventory">
							{#each project.nodes.filter((node) => node.id !== project.rootId) as node (node.id)}<button
									onclick={() => select(node.id)}
									><strong>{node.label}</strong><span>{node.description}</span><small
										>{node.status} · {node.evidence.length} source {node.evidence.length === 1
											? 'passage'
											: 'passages'}</small
									></button
								>{/each}
						</div>
					</section>
					<section>
						<h4>Relationship triples</h4>
						{#each project.edges as item (item.id)}<button
								class="triple"
								onclick={() => selectEdge(item.id)}
								>{project.nodes.find((node) => node.id === item.from)?.label}<em>
									— {item.type.replaceAll('_', ' ')} →
								</em>{project.nodes.find((node) => node.id === item.to)?.label}</button
							>{/each}{#if !project.edges.length}<p class="quiet">
								No semantic relationships have been asserted. Add a reviewed connection or use
								conceptual analysis.
							</p>{/if}
					</section>
					<section>
						<h4>Study questions</h4>
						{#each branches.slice(0, 8) as branch (branch.id)}<details>
								<summary>How would you explain “{branch.label}”?</summary>
								<p>
									{branch.description ||
										'Return to the source and write your explanation in the idea’s notes.'}
								</p>
							</details>{/each}<small
							>Study prompts generated from the map’s themes; they are not source quotations.</small
						>
					</section>
				</div>{/if}
			<div class="canvas-legend">
				<span><i class="legend-solid"></i>Explicit</span><span
					><i class="legend-dashed"></i>Inferred</span
				><span><i class="legend-dotted"></i>Speculative</span><span class="canvas-hint"
					>{view === 'mindmap'
						? 'Select to inspect · drag to arrange · double-click to edit'
						: view === 'graph'
							? 'Select an idea or connection · drag the canvas to explore'
							: 'Every view shares the same source-linked model'}</span
				>
			</div>
		</div>
		{#if showInspector}<Inspector
				{project}
				node={selected}
				{edge}
				onnode={updateNode}
				onedge={updateEdge}
				ondelete={removeNode}
				onadd={addChild}
				onevidence={(item) => (evidence = item)}
				onclose={() => (showInspector = false)}
				{readonly}
			/>{/if}
	</div>
	<footer class="studio-footer">
		<div>
			<strong>{project.nodes.length}</strong> ideas <span>·</span>
			<strong>{project.edges.length}</strong>
			connections <span>·</span>
			{project.coverage.completed}/{project.coverage.total} source segments
		</div>
		<span class="mode-tag"
			>{project.generation.mode === 'example'
				? 'Curated example'
				: project.generation.mode === 'ai'
					? 'AI analysis · review the evidence'
					: project.generation.mode === 'local'
						? 'Local extractive outline'
						: 'Your working map'}</span
		>
	</footer>
	{#if project.coverage.limitations.length}<details class="coverage-note">
			<summary>Scope & limitations</summary>
			<ul>
				{#each project.coverage.limitations as limitation, limitationIndex (limitationIndex)}<li>
						{limitation}
					</li>{/each}
			</ul>
		</details>{/if}
	<p class="studio-message" role="status">
		{message ||
			'Your working copy stays in this browser. Export project JSON for a portable backup.'}
	</p>
	{#if evidence && evidenceSource}
		<dialog
			class="source-reader"
			use:openDialog
			aria-label="Source passage"
			onclose={() => (evidence = null)}
		>
			<div class="panel-heading">
				<div>
					<span class="eyebrow">BACK TO THE WORDS</span>
					<h3>{evidenceSource.title}</h3>
				</div>
				<button
					class="icon-button"
					onclick={() => (evidence = null)}
					aria-label="Close source passage">×</button
				>
			</div>
			<p class="quiet">
				{evidence.locator || `Characters ${evidence.start}–${evidence.end}`} · Exact passage in context
			</p>
			<p class="source-context">
				{evidenceSource.text.slice(Math.max(0, evidence.start - 700), evidence.start)}<mark
					>{evidenceSource.text.slice(evidence.start, evidence.end)}</mark
				>{evidenceSource.text.slice(evidence.end, evidence.end + 700)}
			</p>
			{#if evidenceSource.url}<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- Validated absolute HTTP(S) source URL. --><a
					href={evidenceSource.url}
					target="_blank"
					rel="noopener noreferrer">Open original source ↗</a
				>{/if}<button onclick={() => (evidence = null)}>Back to the map</button>
		</dialog>
	{/if}
</section>
