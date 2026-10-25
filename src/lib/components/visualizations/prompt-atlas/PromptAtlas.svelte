<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { resolve } from '$app/paths';
	import AtlasDiagram from './AtlasDiagram.svelte';
	import { countText } from '$lib/visualizations/prompt-atlas/statistics';
	import { examples } from '$lib/visualizations/prompt-atlas/examples';
	import { rankModels } from '$lib/visualizations/prompt-atlas/models';
	import { projectOntology } from '$lib/visualizations/prompt-atlas/projection';
	import { exportDiagramSvg, exportMarkdown } from '$lib/visualizations/prompt-atlas/export';
	import { createKnowledgeGraph } from '$lib/visualizations/prompt-atlas/knowledge-graph';
	import { validateOntology } from '$lib/visualizations/prompt-atlas/validation';
	import {
		ANALYSIS_MODE,
		SEMANTIC_CONFIG_TIMEOUT_MS,
		SEMANTIC_TIMEOUT_MS,
		UNAVAILABLE_SEMANTIC_CONFIG,
		SemanticAnalysisError,
		analyzeSemantically,
		fetchSemanticConfig,
		type AnalysisMode,
		type SemanticConfig
	} from '$lib/visualizations/prompt-atlas/provider';
	import {
		createSession,
		createReport,
		parseSession,
		SESSION_STORAGE_KEY,
		MAX_SESSION_BYTES
	} from '$lib/visualizations/prompt-atlas/session';
	import {
		MAX_CODE_POINTS,
		type ModelId,
		type NodeKind,
		type PromptOntology,
		type Provenance,
		type RelationKind
	} from '$lib/visualizations/prompt-atlas/types';
	import './prompt-atlas.css';

	let text = $state('');
	let ontology = $state<PromptOntology | null>(null);
	let selectedModel = $state<ModelId>('mindmap');
	let selectedId = $state('');
	let collapsed = $state(new Set<string>());
	let busy = $state(false);
	let analysisMode = $state<AnalysisMode>('local');
	let aiConsent = $state(false);
	let semanticConfig = $state<SemanticConfig>({ ...UNAVAILABLE_SEMANTIC_CONFIG });
	let configLoading = $state(false);
	let semanticFailure = $state(false);
	let error = $state('');
	let notice = $state('');
	let saved = $state(false);
	let includeSource = $state(false);
	let nodeSearch = $state('');
	let newLabel = $state('');
	let newKind = $state<NodeKind>('concept');
	let newFrom = $state('');
	let newTo = $state('');
	let newRelation = $state('relates to');
	let newRelationKind = $state<RelationKind>('association');
	let editor: HTMLTextAreaElement;
	let importInput: HTMLInputElement;
	let worker: Worker | undefined;
	let semanticController: AbortController | undefined;
	let configController: AbortController | undefined;
	let configDeadline: ReturnType<typeof setTimeout> | undefined;
	let destroyed = false;
	let deadline: ReturnType<typeof setTimeout> | undefined;
	let generation = 0;
	let graphExportRevision = 0;
	const kinds: NodeKind[] = [
		'task',
		'audience',
		'output',
		'constraint',
		'example',
		'actor',
		'object',
		'concept',
		'system',
		'action',
		'state',
		'table'
	];
	const instructionKinds: NodeKind[] = ['task', 'audience', 'output', 'constraint', 'example'];
	const relationKinds: RelationKind[] = [
		'association',
		'dependency',
		'transition',
		'message',
		'owns',
		'inheritance',
		'contains',
		'condition'
	];
	let statistics = $derived(countText(text));
	let stale = $derived(ontology !== null && ontology.source.text !== text);
	let fits = $derived(ontology ? rankModels(ontology) : []);
	let currentFit = $derived(fits.find((fit) => fit.id === selectedModel));
	let effectiveModel = $derived(currentFit?.eligible ? selectedModel : ('mindmap' as ModelId));
	let diagram = $derived(ontology ? projectOntology(ontology, effectiveModel, collapsed) : null);
	let selectedNode = $derived(ontology?.nodes.find((node) => node.id === selectedId));
	let selectedEdge = $derived(ontology?.relations.find((edge) => edge.id === selectedId));
	let selected = $derived(selectedNode ?? selectedEdge);
	let visibleNodes = $derived(
		ontology?.nodes.filter((node) =>
			node.label.toLocaleLowerCase('en').includes(nodeSearch.toLocaleLowerCase('en'))
		) ?? []
	);
	let unresolved = $derived(ontology?.issues.filter((issue) => !issue.resolved) ?? []);
	let canAnalyze = $derived(
		!busy &&
			Boolean(text.trim()) &&
			statistics.codePoints <= MAX_CODE_POINTS &&
			(analysisMode === 'local' || (semanticConfig.available && aiConsent))
	);
	let actualMode = $derived(ontology?.mode === 'semantic' ? 'AI · semantic' : ANALYSIS_MODE.label);

	onMount(() => {
		try {
			saved = localStorage.getItem(SESSION_STORAGE_KEY) !== null;
		} catch {
			/* Storage is optional. */
		}
		void checkAvailability();
	});
	onDestroy(() => {
		destroyed = true;
		generation += 1;
		stopWorker();
		configController?.abort();
		clearTimeout(configDeadline);
	});

	async function checkAvailability() {
		aiConsent = false;
		configController?.abort();
		clearTimeout(configDeadline);
		const controller = new AbortController();
		configController = controller;
		configLoading = true;
		configDeadline = setTimeout(() => controller.abort(), SEMANTIC_CONFIG_TIMEOUT_MS);
		try {
			const config = await fetchSemanticConfig(controller.signal);
			if (!destroyed && configController === controller) semanticConfig = config;
		} catch (cause) {
			if (!destroyed && configController === controller) {
				semanticConfig = {
					...UNAVAILABLE_SEMANTIC_CONFIG,
					reason: controller.signal.aborted
						? 'AI availability did not respond in time. Local analysis is ready to use.'
						: cause instanceof Error
							? cause.message
							: 'AI availability could not be checked.'
				};
			}
		} finally {
			if (!destroyed && configController === controller) {
				clearTimeout(configDeadline);
				configController = undefined;
				configLoading = false;
			}
		}
	}

	function changeMode(mode: AnalysisMode) {
		if (busy) cancel();
		analysisMode = mode;
		aiConsent = false;
		semanticFailure = false;
		error = '';
		notice = '';
	}

	function stopWorker() {
		worker?.terminate();
		worker = undefined;
		semanticController?.abort();
		semanticController = undefined;
		clearTimeout(deadline);
		deadline = undefined;
	}
	function cancel() {
		generation += 1;
		stopWorker();
		busy = false;
		aiConsent = false;
		notice = 'Analysis cancelled. Your text is still here.';
	}
	function edited() {
		generation += 1;
		if (busy) cancel();
		error = '';
		notice = '';
		aiConsent = false;
		semanticFailure = false;
	}
	function clear() {
		cancel();
		text = '';
		ontology = null;
		resetInspection();
		error = '';
		notice = '';
		semanticFailure = false;
		selectedModel = 'mindmap';
		editor?.focus();
	}
	function resetInspection() {
		selectedId = '';
		nodeSearch = '';
		collapsed = new Set();
		newLabel = '';
		newKind = 'concept';
		newFrom = '';
		newTo = '';
		newRelation = 'relates to';
		newRelationKind = 'association';
	}
	function analyze() {
		if (!canAnalyze) return;
		if (analysisMode === 'semantic') {
			void analyzeRemote();
			return;
		}
		stopWorker();
		const run = ++generation;
		const source = text;
		busy = true;
		error = '';
		notice = '';
		try {
			worker = new Worker(
				new URL('../../../visualizations/prompt-atlas/analysis.worker.ts', import.meta.url),
				{ type: 'module' }
			);
			worker.onmessage = (event: MessageEvent<{ ontology?: unknown; error?: string }>) => {
				if (generation !== run || source !== text) return;
				try {
					if (event.data.error) throw new Error(event.data.error);
					const result = validateOntology(event.data.ontology);
					if (result.source.text !== source)
						throw new Error('The analysis no longer matches this prompt. Try again.');
					if (result.mode !== 'local')
						throw new Error('The local reader returned an unexpected analysis mode.');
					ontology = result;
					resetInspection();
					selectedModel = 'mindmap';
					notice = `Analysis ready: ${result.nodes.length} items and ${result.relations.length} relationships. Review the interpretation below.`;
				} catch (cause) {
					error = cause instanceof Error ? cause.message : 'Analysis could not finish.';
				} finally {
					stopWorker();
					busy = false;
				}
			};
			worker.onerror = () => {
				if (generation === run) {
					error = 'Local analysis could not start. Reload the page and try again.';
					stopWorker();
					busy = false;
				}
			};
			deadline = setTimeout(() => {
				if (generation === run) {
					cancel();
					error = 'Analysis took too long. Try a smaller prompt.';
				}
			}, 10_000);
			worker.postMessage({ text: source });
		} catch {
			stopWorker();
			busy = false;
			error = 'This browser could not start the local analysis worker. Try a current browser.';
		}
	}
	async function analyzeRemote() {
		if (!aiConsent || !semanticConfig.available || !text.trim()) return;
		stopWorker();
		const run = ++generation;
		const source = text;
		const controller = new AbortController();
		const expectedProvider = semanticConfig.provider;
		const expectedModel = semanticConfig.model;
		semanticController = controller;
		aiConsent = false;
		busy = true;
		error = '';
		notice = '';
		semanticFailure = false;
		deadline = setTimeout(() => {
			if (generation !== run) return;
			cancel();
			error =
				'AI analysis reached its 65-second deadline. No result was applied. You can choose local analysis instead.';
			semanticFailure = true;
		}, SEMANTIC_TIMEOUT_MS);
		try {
			const result = await analyzeSemantically(source, controller.signal);
			if (generation !== run || source !== text || destroyed) return;
			if (
				result.analysisMetadata?.provider !== expectedProvider ||
				result.analysisMetadata?.model !== expectedModel
			)
				throw new Error(
					'The AI provider or model changed from the one you approved. The result was not applied; check AI availability before trying again.'
				);
			ontology = result;
			resetInspection();
			selectedModel = 'mindmap';
			notice = `Analysis ready: ${result.nodes.length} items and ${result.relations.length} relationships. AI interpretation; follow its evidence and review inferences.`;
		} catch (cause) {
			if (generation !== run || controller.signal.aborted || destroyed) return;
			error = cause instanceof Error ? cause.message : 'AI analysis could not finish.';
			if (cause instanceof SemanticAnalysisError && cause.retryAfterSeconds) {
				error += ` Wait at least ${cause.retryAfterSeconds} seconds before another AI request.`;
			}
			semanticFailure = true;
		} finally {
			if (generation === run && !destroyed) {
				stopWorker();
				busy = false;
			}
		}
	}
	function localFallback() {
		changeMode('local');
		analyze();
	}
	function loadExample(id: string) {
		const example = examples.find((item) => item.id === id);
		if (!example) return;
		cancel();
		text = example.text;
		ontology = null;
		resetInspection();
		notice = '';
		error = '';
		semanticFailure = false;
		if (analysisMode === 'semantic') {
			notice =
				'Example loaded. Review this prompt, then give consent and choose Analyze to send it for AI analysis.';
		} else analyze();
	}
	function select(id: string) {
		selectedId = id;
		const item =
			ontology?.nodes.find((node) => node.id === id) ??
			ontology?.relations.find((edge) => edge.id === id);
		const evidence = item?.evidence[0];
		if (evidence && !stale) {
			editor?.focus({ preventScroll: true });
			editor?.setSelectionRange(evidence.start, evidence.end);
		}
	}
	function collapse(id: string) {
		const next = new Set(collapsed);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		collapsed = next;
	}
	function updateNode(field: 'label' | 'kind', value: string) {
		if (!ontology || !selectedNode || stale) return;
		const next = structuredClone($state.snapshot(ontology));
		const node = next.nodes.find((item) => item.id === selectedId)!;
		if (field === 'label') {
			if (!value.trim()) return;
			node.label = value.trim();
		} else {
			node.kind = value as NodeKind;
			node.layer = instructionKinds.includes(node.kind) ? 'instruction' : 'subject';
		}
		node.provenance = 'user-confirmed';
		apply(next);
	}
	function updateRelation(
		field: 'label' | 'kind' | 'from' | 'to' | 'guard' | 'cardinality',
		value: string
	) {
		if (!ontology || !selectedEdge || stale) return;
		const next = structuredClone($state.snapshot(ontology));
		const edge = next.relations.find((item) => item.id === selectedId)!;
		if (field === 'kind') edge.kind = value as RelationKind;
		else edge[field] = value.trim();
		edge.provenance = 'user-confirmed';
		apply(next);
	}
	function apply(next: PromptOntology) {
		try {
			const validated = validateOntology(next);
			const wasBusy = busy;
			if (wasBusy) cancel();
			generation += 1;
			ontology = validated;
			error = '';
			notice = wasBusy
				? 'Interpretation updated. The pending analysis was cancelled to keep your correction.'
				: 'Interpretation updated. All views use this correction.';
		} catch (cause) {
			error = cause instanceof Error ? cause.message : 'The correction is invalid.';
		}
	}
	function confirm() {
		if (!ontology || !selected || stale) return;
		const next = structuredClone($state.snapshot(ontology));
		const item =
			next.nodes.find((node) => node.id === selectedId) ??
			next.relations.find((edge) => edge.id === selectedId);
		if (item) item.provenance = 'user-confirmed';
		apply(next);
	}
	function remove() {
		if (!ontology || !selected || stale) return;
		const next = structuredClone($state.snapshot(ontology));
		next.nodes = next.nodes.filter((node) => node.id !== selectedId);
		next.relations = next.relations.filter(
			(edge) => edge.id !== selectedId && edge.from !== selectedId && edge.to !== selectedId
		);
		selectedId = '';
		apply(next);
	}
	function addNode() {
		if (!ontology || !newLabel.trim() || stale) return;
		const next = structuredClone($state.snapshot(ontology));
		const id = `user-${crypto.randomUUID()}`;
		next.nodes.push({
			id,
			label: newLabel.trim(),
			kind: newKind,
			layer: instructionKinds.includes(newKind) ? 'instruction' : 'subject',
			provenance: 'user-confirmed',
			evidence: [],
			attributes: []
		});
		apply(next);
		selectedId = id;
		newLabel = '';
	}
	function addRelation() {
		if (!ontology || !newFrom || !newTo || !newRelation.trim() || stale) return;
		const next = structuredClone($state.snapshot(ontology));
		next.relations.push({
			id: `user-${crypto.randomUUID()}`,
			from: newFrom,
			to: newTo,
			label: newRelation.trim(),
			kind: newRelationKind,
			provenance: 'user-confirmed',
			evidence: []
		});
		apply(next);
	}
	function attribute(
		index: number,
		field: 'name' | 'value' | 'dataType' | 'foreignKey' | 'primaryKey' | 'unique',
		value: string | boolean
	) {
		if (!ontology || !selectedNode || stale) return;
		const next = structuredClone($state.snapshot(ontology));
		const item = next.nodes.find((node) => node.id === selectedId)!.attributes[index];
		if (field === 'primaryKey' || field === 'unique') item[field] = Boolean(value);
		else item[field] = String(value);
		item.provenance = 'user-confirmed';
		apply(next);
	}
	function addAttribute() {
		if (!ontology || !selectedNode || stale) return;
		const next = structuredClone($state.snapshot(ontology));
		next.nodes
			.find((node) => node.id === selectedId)!
			.attributes.push({ name: 'new_attribute', provenance: 'user-confirmed', evidence: [] });
		apply(next);
	}
	function removeAttribute(index: number) {
		if (!ontology || !selectedNode || stale) return;
		const next = structuredClone($state.snapshot(ontology));
		next.nodes.find((node) => node.id === selectedId)!.attributes.splice(index, 1);
		apply(next);
	}
	function download(
		content: string,
		extension: string,
		mime: string,
		model: ModelId = effectiveModel
	) {
		const url = URL.createObjectURL(new Blob([content], { type: mime }));
		const link = document.createElement('a');
		link.href = url;
		link.download = `prompt-atlas-${model}.${extension}`;
		link.click();
		setTimeout(() => URL.revokeObjectURL(url), 1000);
	}
	function exportJson() {
		if (!ontology || stale) return;
		try {
			download(
				JSON.stringify(
					includeSource
						? createSession($state.snapshot(ontology), effectiveModel)
						: createReport($state.snapshot(ontology), effectiveModel),
					null,
					2
				),
				'json',
				'application/json'
			);
			error = '';
		} catch (cause) {
			error = cause instanceof Error ? cause.message : 'This session could not be exported.';
		}
	}
	async function exportGraph() {
		if (!ontology || stale) return;
		const revision = ++graphExportRevision;
		const sourceOntology = ontology;
		const sourceGeneration = generation;
		const sourceChoice = includeSource;
		const model = effectiveModel;
		const chosenModel = selectedModel;
		const snapshot = $state.snapshot(ontology);
		const current = () =>
			!destroyed &&
			revision === graphExportRevision &&
			sourceOntology === ontology &&
			sourceGeneration === generation &&
			sourceChoice === includeSource &&
			model === effectiveModel &&
			chosenModel === selectedModel &&
			!stale;
		try {
			const graph = await createKnowledgeGraph(snapshot, sourceChoice);
			if (!current()) return;
			download(JSON.stringify(graph, null, 2), 'jsonld', 'application/ld+json', model);
			error = '';
		} catch (cause) {
			if (current())
				error =
					cause instanceof Error ? cause.message : 'The knowledge graph could not be exported.';
		}
	}
	function save() {
		if (!ontology || stale) return;
		try {
			localStorage.setItem(
				SESSION_STORAGE_KEY,
				JSON.stringify(createSession($state.snapshot(ontology), effectiveModel))
			);
			saved = true;
			notice =
				'Session saved on this device, including the original prompt. Use Forget saved session to delete it.';
			error = '';
		} catch (cause) {
			error =
				cause instanceof Error
					? cause.message
					: 'This browser could not save the session. You can export your work instead.';
		}
	}
	function restoreSession(session: ReturnType<typeof parseSession>) {
		cancel();
		text = session.ontology.source.text;
		ontology = session.ontology;
		selectedModel = session.model;
		resetInspection();
		error = '';
		notice = 'Session restored. Your corrections are included.';
	}
	function restore() {
		try {
			const value = localStorage.getItem(SESSION_STORAGE_KEY);
			if (!value) throw new Error('No saved session was found.');
			restoreSession(parseSession(value));
		} catch (cause) {
			error = cause instanceof Error ? cause.message : 'The saved session could not be restored.';
		}
	}
	function forget() {
		try {
			localStorage.removeItem(SESSION_STORAGE_KEY);
			saved = false;
			notice = 'Saved session deleted from this device.';
		} catch {
			error = 'This browser could not delete the saved session.';
		}
	}
	async function importSession(event: Event) {
		const file = (event.target as HTMLInputElement).files?.[0];
		if (!file) return;
		const importedRevision = ++generation;
		stopWorker();
		busy = false;
		try {
			if (file.size > MAX_SESSION_BYTES) throw new Error('Choose a session smaller than 2 MiB.');
			const contents = await file.text();
			if (generation !== importedRevision) return;
			restoreSession(parseSession(contents));
		} catch (cause) {
			error = cause instanceof Error ? cause.message : 'The session file could not be read.';
		} finally {
			importInput.value = '';
		}
	}
	function provenanceLabel(value: Provenance) {
		return value === 'user-confirmed'
			? 'Confirmed by you'
			: value === 'inferred'
				? 'Inferred · review'
				: 'Explicit in text';
	}
</script>

<section class="prompt-atlas not-prose" aria-labelledby="atlas-title" data-testid="prompt-atlas">
	<header class="atlas-masthead">
		<div class="atlas-topline">
			<span class="atlas-edition">FIELD TOOLS / 001</span>
			<nav aria-label="Tool collections">
				<a href={resolve('/blog/visualizations')}>Viz</a><span aria-hidden="true"> / </span><a
					href={resolve('/blog/apps')}>Apps</a
				>
			</nav>
			<span class="atlas-private"
				><span aria-hidden="true">●</span>
				{analysisMode === 'local' ? 'Runs in your browser' : 'AI only with your consent'}</span
			>
		</div>
		<div class="atlas-heading">
			<div>
				<p class="atlas-kicker">A FIELD GUIDE TO YOUR OWN INSTRUCTIONS</p>
				<h1 id="atlas-title">Prompt <em>Atlas</em><span aria-hidden="true">↗</span></h1>
				<p class="atlas-intro">Put your words on the map.</p>
			</div>
			<div class="atlas-heading-note">
				<span aria-hidden="true">&#123; &#125;</span>
				<p>
					Find the people, things, actions<br />and rules inside a prompt.<br /><strong
						>One interpretation. Many views.</strong
					>
				</p>
			</div>
		</div>
		<div class="atlas-process" aria-label="How it works">
			<span><b>01</b> Put words in</span><span aria-hidden="true">→</span><span
				><b>02</b> Inspect the meaning</span
			><span aria-hidden="true">→</span><span><b>03</b> Choose a view</span>
		</div>
	</header>

	<div class="atlas-workspace">
		<section class="atlas-editor-panel" aria-labelledby="editor-heading">
			<div class="atlas-panel-heading">
				<h2 id="editor-heading"><span>01</span> Your prompt</h2>
				<span class="atlas-mode"
					>{analysisMode === 'local' ? ANALYSIS_MODE.label : 'AI · free credits only'}</span
				>
			</div>
			<fieldset class="atlas-methods">
				<legend>Analysis method</legend>
				<label class="atlas-method-option">
					<input
						type="radio"
						name="atlas-analysis-mode"
						value="local"
						checked={analysisMode === 'local'}
						onchange={() => changeMode('local')}
					/>
					<span
						><strong>Local analysis</strong><small>Rules-based · text stays in your browser</small
						></span
					>
				</label>
				<label class="atlas-method-option">
					<input
						type="radio"
						name="atlas-analysis-mode"
						value="semantic"
						checked={analysisMode === 'semantic'}
						onchange={() => changeMode('semantic')}
					/>
					<span
						><strong>AI semantic analysis</strong><small>Free credits only · explicit request</small
						></span
					>
				</label>
			</fieldset>
			{#if analysisMode === 'semantic'}
				<div
					class="atlas-ai-disclosure"
					aria-labelledby="atlas-ai-heading"
					data-testid="semantic-options"
				>
					<h3 id="atlas-ai-heading">Inspect meaning with AI</h3>
					<p>
						Your original prompt goes to this site's server. The server sends the whole text when
						short, or selected exact source excerpts when long, through Vercel AI Gateway to the
						displayed model provider. Character counts, diagrams and corrections stay local. Review
						AI interpretations against their evidence.
					</p>
					{#if semanticConfig.model?.startsWith('nvidia/')}<p class="atlas-provider-retention">
							NVIDIA may retain prompts and responses for model improvement. Keep sensitive or
							confidential information out of AI requests.
						</p>{/if}
					<dl>
						<div>
							<dt>Gateway</dt>
							<dd>{semanticConfig.provider}</dd>
						</div>
						<div>
							<dt>Model / provider</dt>
							<dd>{semanticConfig.model ?? 'Not configured'}</dd>
						</div>
						<div>
							<dt>Spending policy</dt>
							<dd>Free credits only. Requests stop when unavailable; no paid fallback.</dd>
						</div>
					</dl>
					<p class="atlas-ai-availability" role="status">
						{configLoading
							? 'Checking AI availability…'
							: semanticConfig.available
								? 'AI is available within the configured free-credit limits.'
								: (semanticConfig.reason ?? 'AI is unavailable. Local analysis remains ready.')}
					</p>
					<button type="button" onclick={() => checkAvailability()} disabled={configLoading || busy}
						>Check AI availability</button
					>
					<label class="atlas-check atlas-ai-consent"
						><input
							type="checkbox"
							bind:checked={aiConsent}
							disabled={!semanticConfig.available || busy || !text.trim()}
						/> Send this prompt to the displayed AI provider for this analysis</label
					>
					<p class="atlas-ai-consent-note">
						Consent applies once to the current text. Selecting AI, typing and changing views do not
						send your prompt.
					</p>
					<button
						type="button"
						onclick={localFallback}
						disabled={busy || !text.trim() || statistics.codePoints > MAX_CODE_POINTS}
						>Analyze locally instead</button
					>
				</div>
			{/if}
			<label class="atlas-editor-label" for="atlas-prompt">English prompt text</label>
			<textarea
				id="atlas-prompt"
				bind:this={editor}
				bind:value={text}
				oninput={edited}
				placeholder="Paste a prompt, a tangled idea, a workflow, or an unlikely sentence…"
				spellcheck="false"
				aria-describedby="atlas-input-help atlas-limit"
				rows="9"
			></textarea>
			<div class="atlas-count">
				<div>
					<output data-testid="character-count"
						>{statistics.characters.toLocaleString('en-GB')}</output
					><span>Characters including spaces</span>
				</div>
				<span class="atlas-count-mark" aria-hidden="true">Aa</span>
			</div>
			<details class="atlas-stats">
				<summary>More text statistics</summary>
				<dl>
					<div>
						<dt>Without whitespace</dt>
						<dd>{statistics.withoutWhitespace}</dd>
					</div>
					<div>
						<dt>Words</dt>
						<dd>{statistics.words}</dd>
					</div>
					<div>
						<dt>Lines</dt>
						<dd>{statistics.lines}</dd>
					</div>
					<div>
						<dt>Unicode code points</dt>
						<dd>{statistics.codePoints}</dd>
					</div>
					<div>
						<dt>UTF-16 units</dt>
						<dd>{statistics.codeUnits}</dd>
					</div>
					<div>
						<dt>UTF-8 bytes</dt>
						<dd>{statistics.bytes}</dd>
					</div>
				</dl>
				<p>
					Characters count visible grapheme clusters, including spaces and line breaks. Words use
					word segmentation. These are text measures; they are not token counts.
				</p>
			</details>
			<p
				id="atlas-limit"
				class:atlas-danger={statistics.codePoints > MAX_CODE_POINTS}
				class="atlas-input-help"
			>
				{statistics.codePoints > MAX_CODE_POINTS
					? `Analysis limit reached. This prompt exceeds the ${MAX_CODE_POINTS.toLocaleString('en-GB')}-code-point source budget.`
					: `Up to ${MAX_CODE_POINTS.toLocaleString('en-GB')} Unicode code points. Long AI requests may use a compressed reading; your full source and character count are preserved.`}
			</p>
			<div class="atlas-actions">
				<button class="atlas-primary" onclick={analyze} disabled={!canAnalyze}
					>{busy ? 'Inspecting…' : 'Analyze prompt'}<span aria-hidden="true">↗</span></button
				>{#if busy}<button onclick={cancel}>Cancel</button>{:else}<button
						onclick={clear}
						disabled={!text && !ontology}>Clear</button
					>{/if}
			</div>
			<p id="atlas-input-help" class="atlas-privacy">
				{#if analysisMode === 'local'}{ANALYSIS_MODE.description} AI semantic analysis is optional and
					uses a separate consent step.{:else}AI analysis runs only after you consent and choose
					Analyze. Free credits are the only allowed funding; an unavailable request has no
					automatic fallback.{/if}
			</p>
			<noscript><p>Enable JavaScript to count and inspect prompts locally.</p></noscript>
			<div class="atlas-examples">
				<h3>Start with a specimen</h3>
				<div>
					{#each examples as example}<button onclick={() => loadExample(example.id)} disabled={busy}
							>{example.label}<span aria-hidden="true">↗</span></button
						>{/each}
				</div>
			</div>
			<div class="atlas-session-actions">
				<button onclick={() => importInput?.click()}>Import session</button>{#if saved}<button
						onclick={restore}>Restore saved</button
					><button onclick={forget}>Forget saved session</button>{/if}<input
					class="atlas-visually-hidden"
					type="file"
					accept=".json,application/json"
					bind:this={importInput}
					onchange={importSession}
					aria-label="Import Prompt Atlas session"
				/>
			</div>
		</section>

		<section class="atlas-map-panel" aria-labelledby="map-heading">
			<div class="atlas-panel-heading">
				<h2 id="map-heading"><span>02</span> The map</h2>
				{#if ontology}<span class="atlas-item-count"
						>{ontology.nodes.length} items / {ontology.relations.length} links</span
					>{:else}<span class="atlas-item-count">Waiting for words</span>{/if}
			</div>
			{#if error}<p class="atlas-alert atlas-error" role="alert">{error}</p>{/if}
			{#if semanticFailure}<p class="atlas-ai-failure-note">
					AI stopped without switching providers or analysis methods. Use “Analyze locally instead”
					to keep working in your browser, or give consent again for a later AI request.
				</p>{/if}
			{#if notice}<p class="atlas-notice" role="status">{notice}</p>{/if}
			{#if stale}<p class="atlas-alert" role="status">
					<strong>Your prompt has changed.</strong> Analyze again to update this map. Corrections and
					exports are paused while it is out of date.
				</p>{/if}
			{#if ontology && diagram}
				<p class="atlas-result-mode" data-testid="analysis-provenance">
					<strong>Current interpretation: {actualMode}</strong>
					{#if ontology.analysisMetadata}<span
							>{ontology.analysisMetadata.provider} · {ontology.analysisMetadata.model}</span
						>{/if}
					<span
						>{ontology.mode === 'semantic'
							? 'AI can misinterpret unfamiliar language. Inferences need review; diagrams reuse this result without another request.'
							: 'Local rules identify supported patterns. Review unusual or ambiguous wording.'}</span
					>
				</p>
				{#if ontology.compression?.applied}
					<section
						class="atlas-source-coverage"
						aria-labelledby="atlas-coverage-heading"
						data-testid="source-coverage"
					>
						<h3 id="atlas-coverage-heading">Compressed reading · source coverage</h3>
						<p>
							Analysed {ontology.compression.analysedCodePoints.toLocaleString('en-GB')} of {ontology.compression.originalCodePoints.toLocaleString(
								'en-GB'
							)} source code points directly ({Math.round(
								(ontology.compression.analysedCodePoints /
									Math.max(1, ontology.compression.originalCodePoints)) *
									100
							)}%) across {ontology.compression.fragmentCount} source excerpts.
						</p>
						<p>
							{ontology.compression.duplicateCodePoints.toLocaleString('en-GB')} repeated code points
							deduplicated · {ontology.compression.omittedCodePoints.toLocaleString('en-GB')} code points
							omitted. The full original prompt and its character count are preserved.
						</p>
						{#if ontology.compression.omittedCodePoints > 0}<p>
								This is a partial reading. Unselected wording can contain constraints or
								relationships that the graph misses. Review the source and the interpretation.
							</p>{/if}
					</section>
				{/if}
				<div class="atlas-view-choice">
					<label for="atlas-model">View this prompt as</label><select
						id="atlas-model"
						bind:value={selectedModel}
						disabled={stale}
						>{#each fits as fit}<option value={fit.id} disabled={!fit.eligible}
								>{fit.label}{fit.eligible ? '' : ' · needs more detail'}</option
							>{/each}</select
					>
				</div>
				<p class="atlas-fit-reason">
					{currentFit?.eligible
						? currentFit.reason
						: 'This interpretation no longer supports that view. Showing the mind map.'}
				</p>
				<div class="atlas-diagram-wrap" class:atlas-stale={stale}>
					<AtlasDiagram {diagram} {selectedId} onselect={select} oncollapse={collapse} />
				</div>
				<div class="atlas-legend" aria-label="Provenance legend">
					<span><i class="explicit"></i> Explicit</span><span
						><i class="inferred"></i> Inferred · review</span
					><span><i class="confirmed"></i> Confirmed by you</span>
				</div>
				{#if diagram.notes.length}<ul class="atlas-projection-notes">
						{#each diagram.notes as note}<li>{note}</li>{/each}
					</ul>{/if}
				<details class="atlas-models">
					<summary>Which models fit, and why?</summary>
					<p>
						Fit scores describe structural suitability. They are not probabilities of correctness.
						Abstraction level and diagram family are separate.
					</p>
					<div>
						{#each fits as fit}<button
								disabled={!fit.eligible || stale}
								aria-pressed={selectedModel === fit.id}
								onclick={() => (selectedModel = fit.id)}
								><span class="atlas-fit-top"
									><strong>{fit.label}</strong><span
										>{fit.eligible ? `${fit.score} / 100 fit` : 'Needs detail'}</span
									></span
								><small>{fit.family} · {fit.level}</small><span>{fit.reason}</span></button
							>{/each}
					</div>
				</details>
			{:else}
				<div class="atlas-empty">
					<svg viewBox="0 0 520 310" role="img" aria-labelledby="atlas-empty-title"
						><title id="atlas-empty-title">A map awaiting your prompt</title><g
							fill="none"
							stroke="currentColor"
							><path
								d="M260 154H120V65H55M120 154V245H55M260 154H392V78H465M392 154V240H465"
							/><circle cx="260" cy="154" r="47" /><circle cx="55" cy="65" r="8" /><circle
								cx="55"
								cy="245"
								r="8"
							/><circle cx="465" cy="78" r="8" /><circle cx="465" cy="240" r="8" /><path
								d="M244 154h32M260 138v32"
							/></g
						><text x="55" y="43">CONTEXT</text><text x="55" y="277">CONSTRAINTS</text><text
							x="445"
							y="56">ACTIONS</text
						><text x="445" y="273">ENTITIES</text></svg
					>
					<h3>Your words have a structure.</h3>
					<p>
						Paste a prompt or choose a specimen.<br />We’ll lay out what is there, and flag what
						needs a closer look.
					</p>
					<span class="atlas-empty-foot">NO SIGN-IN · LOCAL BY DEFAULT · AI REQUIRES CONSENT</span>
				</div>
			{/if}
		</section>
	</div>

	{#if ontology}
		<section class="atlas-inspection" aria-labelledby="inspect-heading">
			<div class="atlas-section-heading">
				<div>
					<p class="atlas-kicker">READ THE MAP, THEN CORRECT IT</p>
					<h2 id="inspect-heading">03 / The interpretation</h2>
				</div>
				<p>
					The ontology is the list of things and relationships found in your words. Every view
					starts here.
				</p>
			</div>
			{#if unresolved.length}<div class="atlas-issues">
					<h3>
						{unresolved.length}
						{unresolved.length === 1 ? 'question to inspect' : 'questions to inspect'}
					</h3>
					{#each unresolved as issue}<div class="atlas-issue">
							<span class="atlas-issue-kind">{issue.kind}</span>
							<p>{issue.description}</p>
							{#if issue.alternatives?.length}<p>
									Possible readings: {issue.alternatives.join(' / ')}
								</p>{/if}{#each issue.evidence as evidence}<button
									class="atlas-quote"
									disabled={stale}
									onclick={() => {
										editor?.focus();
										editor?.setSelectionRange(evidence.start, evidence.end);
									}}>“{evidence.quote}”</button
								>{/each}<label class="atlas-check"
								><input
									type="checkbox"
									disabled={stale}
									onchange={() => {
										if (ontology) {
											const next = structuredClone($state.snapshot(ontology));
											next.issues.find((item) => item.id === issue.id)!.resolved = true;
											apply(next);
										}
									}}
								/> I have reviewed this</label
							>
						</div>{/each}
				</div>{/if}
			<div class="atlas-inspector-grid">
				<section class="atlas-item-list" aria-labelledby="items-heading">
					<h3 id="items-heading">Items found</h3>
					<label class="atlas-visually-hidden" for="atlas-node-search">Search items</label><input
						id="atlas-node-search"
						type="search"
						bind:value={nodeSearch}
						placeholder="Find an item…"
					/>
					<div class="atlas-scroll-list">
						{#each visibleNodes as node}<button
								class:atlas-selected={selectedId === node.id}
								onclick={() => select(node.id)}
								><span class="atlas-kind">{node.kind} / {node.layer}</span><strong
									>{node.label}</strong
								><span class="atlas-provenance" data-status={node.provenance}
									>{provenanceLabel(node.provenance)}</span
								></button
							>{/each}{#if !visibleNodes.length}<p>No matching items.</p>{/if}
					</div>
					<details>
						<summary>Relationships ({ontology.relations.length})</summary
						>{#each ontology.relations as edge}<button
								class="atlas-edge-item"
								class:atlas-selected={selectedId === edge.id}
								onclick={() => select(edge.id)}
								>{ontology.nodes.find((node) => node.id === edge.from)?.label} → {ontology.nodes.find(
									(node) => node.id === edge.to
								)?.label}<small>{edge.label} · {provenanceLabel(edge.provenance)}</small></button
							>{/each}
					</details>
				</section>
				<section class="atlas-detail" aria-labelledby="detail-heading">
					<h3 id="detail-heading">Evidence & corrections</h3>
					{#if selected}<p class="atlas-provenance" data-status={selected.provenance}>
							{provenanceLabel(selected.provenance)}
						</p>
						{#each selected.evidence as evidence}<blockquote>
								<mark>{evidence.quote}</mark><small
									>Source positions {evidence.start}–{evidence.end} (UTF-16)</small
								>
							</blockquote>{/each}{#if selected.rationale}<p>
								{selected.rationale}
							</p>{/if}{#if selected.provenance === 'user-confirmed' && !selected.evidence.length}<p
							>
								You supplied this detail. It has no quoted source passage.
							</p>{/if}
						{#if selectedNode}<label
								>Label<input
									value={selectedNode.label}
									maxlength="500"
									disabled={stale}
									onchange={(event) => updateNode('label', event.currentTarget.value)}
								/></label
							><label
								>Item type<select
									value={selectedNode.kind}
									disabled={stale}
									onchange={(event) => updateNode('kind', event.currentTarget.value)}
									>{#each kinds as kind}<option value={kind}>{kind}</option>{/each}</select
								></label
							>{#each selectedNode.attributes as item, index}<fieldset class="atlas-attribute">
									<legend>Attribute {index + 1}</legend>
									<p class="atlas-provenance" data-status={item.provenance}>
										{provenanceLabel(item.provenance)}
									</p>
									<label
										>Name<input
											value={item.name}
											disabled={stale}
											onchange={(event) => attribute(index, 'name', event.currentTarget.value)}
										/></label
									><label
										>Value<input
											value={item.value ?? ''}
											disabled={stale}
											onchange={(event) => attribute(index, 'value', event.currentTarget.value)}
										/></label
									><label
										>Data type<input
											value={item.dataType ?? ''}
											disabled={stale}
											onchange={(event) => attribute(index, 'dataType', event.currentTarget.value)}
										/></label
									><label
										>Foreign key reference<input
											value={item.foreignKey ?? ''}
											disabled={stale}
											placeholder="e.g. users.id"
											onchange={(event) =>
												attribute(index, 'foreignKey', event.currentTarget.value)}
										/></label
									><label class="atlas-check"
										><input
											type="checkbox"
											checked={item.primaryKey ?? false}
											disabled={stale}
											onchange={(event) =>
												attribute(index, 'primaryKey', event.currentTarget.checked)}
										/> Primary key</label
									><label class="atlas-check"
										><input
											type="checkbox"
											checked={item.unique ?? false}
											disabled={stale}
											onchange={(event) => attribute(index, 'unique', event.currentTarget.checked)}
										/> Unique</label
									>
									<button disabled={stale} onclick={() => removeAttribute(index)}
										>Remove attribute</button
									>
								</fieldset>{/each}<button disabled={stale} onclick={addAttribute}
								>Add attribute</button
							>
						{:else if selectedEdge}<label
								>Relationship label<input
									value={selectedEdge.label}
									maxlength="500"
									disabled={stale}
									onchange={(event) => updateRelation('label', event.currentTarget.value)}
								/></label
							><label
								>Relationship type<select
									value={selectedEdge.kind}
									disabled={stale}
									onchange={(event) => updateRelation('kind', event.currentTarget.value)}
									>{#each relationKinds as kind}<option value={kind}>{kind}</option>{/each}</select
								></label
							><label
								>From<select
									value={selectedEdge.from}
									disabled={stale}
									onchange={(event) => updateRelation('from', event.currentTarget.value)}
									>{#each ontology.nodes as node}<option value={node.id}>{node.label}</option
										>{/each}</select
								></label
							><label
								>To<select
									value={selectedEdge.to}
									disabled={stale}
									onchange={(event) => updateRelation('to', event.currentTarget.value)}
									>{#each ontology.nodes as node}<option value={node.id}>{node.label}</option
										>{/each}</select
								></label
							><label
								>Condition / guard<input
									value={selectedEdge.guard ?? ''}
									disabled={stale}
									onchange={(event) => updateRelation('guard', event.currentTarget.value)}
								/></label
							><label
								>Cardinality<input
									value={selectedEdge.cardinality ?? ''}
									disabled={stale}
									onchange={(event) => updateRelation('cardinality', event.currentTarget.value)}
								/></label
							>{/if}
						<div class="atlas-actions">
							<button disabled={stale} onclick={confirm}>Confirm interpretation</button><button
								disabled={stale}
								onclick={remove}>Remove item</button
							>
						</div>
					{:else}<div class="atlas-inspector-empty">
							<span aria-hidden="true">⌖</span>
							<p>
								Select a diagram item or an entry in the list to inspect its source and correct the
								interpretation.
							</p>
						</div>{/if}
				</section>
				<section class="atlas-add-detail" aria-labelledby="add-heading">
					<h3 id="add-heading">Supply missing details</h3>
					<p>Details you add are labelled as confirmed by you.</p>
					<form
						onsubmit={(event) => {
							event.preventDefault();
							addNode();
						}}
					>
						<label
							>New item<input
								bind:value={newLabel}
								maxlength="500"
								placeholder="e.g. Library system"
								disabled={stale}
							/></label
						><label
							>Item type<select bind:value={newKind} disabled={stale}
								>{#each kinds as kind}<option value={kind}>{kind}</option>{/each}</select
							></label
						><button type="submit" disabled={stale || !newLabel.trim()}>Add item</button>
					</form>
					<details>
						<summary>Connect two items</summary>
						<form
							onsubmit={(event) => {
								event.preventDefault();
								addRelation();
							}}
						>
							<label
								>From<select bind:value={newFrom} disabled={stale}
									><option value="">Choose an item</option>{#each ontology.nodes as node}<option
											value={node.id}>{node.label}</option
										>{/each}</select
								></label
							><label
								>To<select bind:value={newTo} disabled={stale}
									><option value="">Choose an item</option>{#each ontology.nodes as node}<option
											value={node.id}>{node.label}</option
										>{/each}</select
								></label
							><label
								>Relationship<input
									bind:value={newRelation}
									maxlength="500"
									disabled={stale}
								/></label
							><label
								>Type<select bind:value={newRelationKind} disabled={stale}
									>{#each relationKinds as kind}<option value={kind}>{kind}</option>{/each}</select
								></label
							><button type="submit" disabled={stale || !newFrom || !newTo || !newRelation.trim()}
								>Add relationship</button
							>
						</form>
					</details>
					<label
						>Database target<input
							value={ontology.databaseTarget ?? ''}
							placeholder="Only if specified, e.g. PostgreSQL"
							disabled={stale}
							onchange={(event) => {
								if (ontology)
									apply({
										...$state.snapshot(ontology),
										databaseTarget: event.currentTarget.value.trim() || undefined
									});
							}}
						/></label
					>
				</section>
			</div>
		</section>
		<section class="atlas-export" aria-labelledby="export-heading">
			<div>
				<p class="atlas-kicker">TAKE THE MAP WITH YOU</p>
				<h2 id="export-heading">Keep your work.</h2>
				<p>Exports contain your extracted text and corrections. Choose what you share.</p>
			</div>
			<div class="atlas-export-controls">
				<div class="atlas-actions">
					<button
						disabled={stale || !diagram}
						onclick={() => diagram && download(exportDiagramSvg(diagram), 'svg', 'image/svg+xml')}
						>Export SVG ↗</button
					><button
						disabled={stale}
						onclick={() =>
							ontology &&
							download(
								exportMarkdown($state.snapshot(ontology), effectiveModel),
								'md',
								'text/markdown'
							)}>Export Markdown ↗</button
					><button disabled={stale} onclick={exportJson}
						>{includeSource ? 'Export JSON session' : 'Export JSON report'} ↗</button
					>
					<button disabled={stale} onclick={exportGraph}>Export graph JSON-LD ↗</button>
				</div>
				<label class="atlas-check"
					><input type="checkbox" bind:checked={includeSource} /> Include original prompt and evidence
					in JSON exports</label
				>
				<p>
					Source-included JSON sessions can be restored. JSON-LD shares the knowledge graph; every
					export still contains extracted content.
				</p>
				<div class="atlas-actions">
					<button disabled={stale} onclick={save}>Save session on this device</button
					>{#if saved}<button onclick={forget}>Forget saved session</button>{/if}
				</div>
				<p>
					Saving on this device includes the original prompt. Storage is used only when you choose
					Save.
				</p>
			</div>
		</section>
	{/if}
	<footer class="atlas-footnote">
		<span>PROMPT ATLAS / SUVRO GHOSH</span>
		<p>Structure is an interpretation. Follow the evidence.</p>
		<a href={resolve('/blog/apps')}>More field tools ↗</a>
	</footer>
</section>
