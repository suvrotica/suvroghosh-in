<script lang="ts">
	import { onMount, tick } from 'svelte';
	import Specimen from './Specimen.svelte';
	import PunctuationPulse from './PunctuationPulse.svelte';
	import AnalysisWorker from '$lib/visualizations/anatomy-of-an-essay/analysis.worker?worker';
	import { specimens } from '$lib/visualizations/anatomy-of-an-essay/generated/catalog';
	import { exportPortrait } from '$lib/visualizations/anatomy-of-an-essay/export';
	import {
		ANATOMY_LAYERS,
		MAX_INPUT_LENGTH,
		LONG_SENTENCE_WORDS,
		type AnatomyLayer,
		type EssayDocument,
		type EssaySentence
	} from '$lib/visualizations/anatomy-of-an-essay/types';

	let document = $state<EssayDocument | null>(null);
	let other = $state<EssayDocument | null>(null);
	let selectedId = $state(specimens[0]?.id ?? '');
	let otherId = $state(specimens[1]?.id ?? '');
	let mode = $state<'read' | 'compare'>('read');
	let layers = $state<AnatomyLayer[]>([...ANATOMY_LAYERS]);
	let activeParagraph = $state('');
	let selectedSentence = $state('');
	let previewSentence = $state<string | null>(null);
	let otherSelected = $state('');
	let otherWord = $state('');
	let selectedWord = $state('');
	let dissected = $state(false);
	let normalized = $state(false);
	let playing = $state(true);
	let expanded = $state(false);
	let loading = $state(true);
	let otherLoading = $state(false);
	let error = $state('');
	let comparisonError = $state('');
	let notice = $state('');
	let reader = $state<HTMLDivElement>();
	let localOpen = $state(false);
	let localTitle = $state('');
	let localText = $state('');
	let analysing = $state(false);
	let exporting = $state(false);
	let localError = $state('');
	let localDocument = $state<EssayDocument | null>(null);
	let worker: Worker | null = null;
	let primaryController: AbortController | null = null;
	let comparisonController: AbortController | null = null;
	const cache = new Map<string, EssayDocument>();
	let disposed = false;
	let reducedMotion = false;

	const layerCopy: Record<AnatomyLayer, { name: string; meaning: string; mark: string }> = {
		organs: {
			name: 'Organs',
			meaning: 'Paragraphs · size follows word count (bounded)',
			mark: '◒'
		},
		ribs: { name: 'Ribs', meaning: 'Sentences · length follows word count', mark: '⌒' },
		vessels: { name: 'Vessels', meaning: 'Branching · estimated nesting', mark: '⑂' },
		neurons: {
			name: 'Neural knots',
			meaning: 'Recurring words · frequency & occurrence',
			mark: '✳'
		},
		citations: { name: 'Bones', meaning: 'Explicit citations · source attachments', mark: '╂' },
		coils: {
			name: 'Coils',
			meaning: `Long sentences · more than ${LONG_SENTENCE_WORDS} words`,
			mark: '∿'
		}
	};
	const sentences = $derived(
		document?.paragraphs.flatMap((paragraph) => paragraph.sentences) ?? []
	);
	const inspected = $derived(
		sentences.find((sentence) => sentence.id === (previewSentence || selectedSentence))
	);
	const cluster = $derived(document?.clusters.find((item) => item.word === selectedWord));
	const otherSentence = $derived(
		other?.paragraphs
			.flatMap((paragraph) => paragraph.sentences)
			.find((sentence) => sentence.id === otherSelected)
	);
	const otherCluster = $derived(other?.clusters.find((item) => item.word === otherWord));
	const currentParagraph = $derived(
		document?.paragraphs.find((paragraph) => paragraph.id === activeParagraph)
	);
	const displaySentence = $derived(inspected ?? currentParagraph?.sentences[0]);
	const pulseSymbols = $derived((displaySentence?.punctuation ?? []).slice(0, 30));
	const comparisonObservations = $derived.by(() => {
		if (!document || !other) return [];
		const a = document.measurements,
			b = other.measurements;
		return [
			`B has ${b.paragraphs} paragraph chambers; A has ${a.paragraphs}.`,
			`The longest sentence is ${a.longestSentence} words in A and ${b.longestSentence} in B.`,
			`A has ${a.longSentences} long-sentence coils; B has ${b.longSentences}.`
		];
	});

	async function fetchDocument(id: string, signal: AbortSignal): Promise<EssayDocument> {
		if (id === 'local-specimen' && localDocument) return localDocument;
		if (cache.has(id)) return cache.get(id)!;
		const entry = specimens.find((item) => item.id === id);
		if (!entry) throw new Error('Choose a specimen from the cabinet.');
		const response = await fetch(entry.modelUrl, { signal });
		if (!response.ok) throw new Error('This specimen could not be opened. Try again.');
		const model = (await response.json()) as EssayDocument;
		if (
			model.schemaVersion !== 1 ||
			model.id !== entry.id ||
			!Array.isArray(model.paragraphs) ||
			model.paragraphs.length > 2000 ||
			!model.measurements ||
			!Array.isArray(model.clusters)
		)
			throw new Error('This specimen uses an unsupported format.');
		cache.set(id, model);
		return model;
	}
	async function loadPrimary(id: string) {
		primaryController?.abort();
		const controller = new AbortController();
		primaryController = controller;
		selectedId = id;
		document = null;
		loading = true;
		error = '';
		selectedSentence = '';
		previewSentence = null;
		selectedWord = '';
		try {
			const next = await fetchDocument(id, controller.signal);
			if (disposed || controller.signal.aborted) return;
			document = next;
			activeParagraph = next.paragraphs[0]?.id ?? '';
		} catch (cause) {
			if (!controller.signal.aborted && !disposed)
				error = cause instanceof Error ? cause.message : 'Unable to load this specimen.';
		} finally {
			if (!controller.signal.aborted && !disposed) loading = false;
		}
	}
	async function loadComparison(id: string) {
		comparisonController?.abort();
		const controller = new AbortController();
		comparisonController = controller;
		otherId = id;
		other = null;
		otherLoading = true;
		comparisonError = '';
		otherSelected = '';
		otherWord = '';
		try {
			const next = await fetchDocument(id, controller.signal);
			if (!disposed && !controller.signal.aborted) other = next;
		} catch (cause) {
			if (!controller.signal.aborted && !disposed)
				comparisonError = cause instanceof Error ? cause.message : 'Unable to load comparison.';
		} finally {
			if (!controller.signal.aborted && !disposed) otherLoading = false;
		}
	}
	function changeMode(next: 'read' | 'compare') {
		mode = next;
		if (next === 'read') normalized = false;
		if (next === 'compare' && !other && !otherLoading) void loadComparison(otherId);
	}
	function toggleLayer(layer: AnatomyLayer) {
		layers = layers.includes(layer) ? layers.filter((item) => item !== layer) : [...layers, layer];
	}
	async function selectSentence(id: string, jump = true) {
		const sentence = sentences.find((item) => item.id === id);
		if (!sentence) return;
		selectedSentence = id;
		activeParagraph = sentence.paragraphId;
		previewSentence = null;
		selectedWord = '';
		if (jump && mode === 'read') {
			await tick();
			reader
				?.querySelector<HTMLElement>(`[data-source-sentence="${id}"]`)
				?.scrollIntoView({ behavior: reducedMotion ? 'instant' : 'smooth', block: 'center' });
		}
	}
	function clearSelection() {
		selectedSentence = '';
		previewSentence = null;
		selectedWord = '';
		otherSelected = '';
		otherWord = '';
	}
	function inspectWord(word: string) {
		selectedWord = word;
		selectedSentence = '';
		previewSentence = null;
	}
	function analyseLocal() {
		localError = '';
		if (!localText.trim()) {
			localError = 'Paste some text to grow a specimen.';
			return;
		}
		if (localText.length > MAX_INPUT_LENGTH) {
			localError = `Use at most ${MAX_INPUT_LENGTH.toLocaleString()} characters.`;
			return;
		}
		worker?.terminate();
		analysing = true;
		try {
			worker = new AnalysisWorker();
			worker.onmessage = (event: MessageEvent<{ document?: EssayDocument; error?: string }>) => {
				analysing = false;
				worker?.terminate();
				worker = null;
				if (event.data.error || !event.data.document) {
					localError = event.data.error ?? 'Could not analyse this text.';
					return;
				}
				localDocument = event.data.document;
				cache.delete('local-specimen');
				void loadPrimary('local-specimen');
				localOpen = false;
				mode = 'read';
				notice = 'Your specimen has grown. Your text stays in this browser tab.';
			};
			worker.onerror = () => {
				analysing = false;
				localError = 'Analysis could not finish. Try a shorter passage.';
				worker?.terminate();
				worker = null;
			};
			worker.postMessage({ text: localText, title: localTitle.trim().slice(0, 120) });
		} catch {
			analysing = false;
			localError = 'This browser could not start local analysis.';
		}
	}
	async function download(format: 'svg' | 'png' | 'social') {
		if (!document || exporting) return;
		exporting = true;
		notice = '';
		try {
			await exportPortrait(document, format);
			notice = 'Your portrait is ready.';
		} catch {
			notice = 'The export could not finish. Try SVG or reload the atlas.';
		} finally {
			if (!disposed) exporting = false;
		}
	}
	function onKey(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			clearSelection();
			localOpen = false;
		}
	}
	onMount(() => {
		const media = window.matchMedia('(prefers-reduced-motion: reduce)');
		const update = () => {
			reducedMotion = media.matches;
			if (media.matches) playing = false;
		};
		update();
		media.addEventListener('change', update);
		void loadPrimary(selectedId);
		return () => {
			disposed = true;
			primaryController?.abort();
			comparisonController?.abort();
			worker?.terminate();
			media.removeEventListener('change', update);
		};
	});
	$effect(() => {
		if (!reader || !document || mode !== 'read') return;
		const observer = new IntersectionObserver(
			(entries) => {
				if (selectedSentence || selectedWord) return;
				const visible = entries
					.filter((entry) => entry.isIntersecting)
					.sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
				const id = (visible[0]?.target as HTMLElement | undefined)?.dataset.paragraph;
				if (id) activeParagraph = id;
			},
			{ rootMargin: '-24% 0px -52% 0px', threshold: 0 }
		);
		reader.querySelectorAll('[data-paragraph]').forEach((element) => observer.observe(element));
		return () => observer.disconnect();
	});
</script>

<svelte:window onkeydown={onKey} />

<div class="ea-runtime" data-ready={!!document}>
	<div class="ea-toolbar">
		<div class="ea-mode" role="group" aria-label="Atlas view">
			<button
				class:active={mode === 'read'}
				aria-pressed={mode === 'read'}
				onclick={() => changeMode('read')}>Read a body</button
			>
			<button
				class:active={mode === 'compare'}
				aria-pressed={mode === 'compare'}
				onclick={() => changeMode('compare')}>Compare two</button
			>
		</div>
		<button class="ea-grow" aria-expanded={localOpen} onclick={() => (localOpen = !localOpen)}
			><span aria-hidden="true">✳</span> Grow a specimen</button
		>
	</div>
	{#if localOpen}
		<form
			class="ea-local"
			onsubmit={(event) => {
				event.preventDefault();
				analyseLocal();
			}}
		>
			<div class="ea-section-label">YOUR WORDS, A NEW BODY</div>
			<label for="ea-local-title">Specimen title <span>(optional)</span></label>
			<input
				id="ea-local-title"
				bind:value={localTitle}
				maxlength="120"
				placeholder="A thought with a name"
			/>
			<label for="ea-local-text">Paste plain text</label>
			<textarea
				id="ea-local-text"
				bind:value={localText}
				rows="7"
				placeholder="Begin with a paragraph. Or bring the whole essay."
				aria-describedby="ea-local-help"
			></textarea>
			<div class="ea-local-footer">
				<p id="ea-local-help">
					{localText.length.toLocaleString()} / {MAX_INPUT_LENGTH.toLocaleString()} characters · Analysed
					on this device. Your text stays in this tab.
				</p>
				<button class="ea-primary" type="submit" disabled={analysing}
					>{analysing ? 'Growing…' : 'Grow this specimen ↗'}</button
				>
			</div>
			{#if analysing}<button
					type="button"
					onclick={() => {
						worker?.terminate();
						worker = null;
						analysing = false;
					}}>Cancel analysis</button
				>{/if}
			{#if localError}<p class="ea-error" role="alert">{localError}</p>{/if}
		</form>
	{/if}
	<div class="ea-selection-row">
		<label
			><span class="ea-section-label"
				>{mode === 'compare' ? 'SPECIMEN A' : 'FROM THE COLLECTION'}</span
			><select
				aria-label="Choose an essay"
				value={selectedId}
				onchange={(event) => void loadPrimary(event.currentTarget.value)}
				>{#each specimens as entry}<option value={entry.id}>{entry.label} — {entry.title}</option
					>{/each}{#if localDocument}<option value="local-specimen"
						>Your text — {localDocument.title}</option
					>{/if}</select
			></label
		>
		{#if mode === 'compare'}<label
				><span class="ea-section-label">SPECIMEN B</span><select
					aria-label="Choose comparison essay"
					value={otherId}
					onchange={(event) => void loadComparison(event.currentTarget.value)}
					>{#each specimens as entry}<option value={entry.id}>{entry.label} — {entry.title}</option
						>{/each}{#if localDocument}<option value="local-specimen"
							>Your text — {localDocument.title}</option
						>{/if}</select
				></label
			>{:else}<a class="ea-method-link" href="#ea-methodology">How a text becomes a body ↗</a>{/if}
	</div>
	{#if error}<p class="ea-error" role="alert">
			{error} <button onclick={() => void loadPrimary(selectedId)}>Try again</button>
		</p>{/if}
	{#if notice}<p class="ea-notice" role="status">{notice}</p>{/if}
	{#if loading}<div class="ea-wait" role="status">Preparing the anatomy…</div>{/if}
	{#if document && !loading}
		<div class="ea-view-controls">
			<div>
				<button
					class:active={dissected}
					aria-pressed={dissected}
					onclick={() => (dissected = !dissected)}
					>{dissected ? 'Reassemble' : 'Dissect'}
					<span aria-hidden="true">{dissected ? '⊙' : '⊕'}</span></button
				><button aria-pressed={playing} onclick={() => (playing = !playing)}
					>{playing ? 'Pause pulse' : 'Play pulse'}</button
				><button
					onclick={() => {
						dissected = false;
						normalized = false;
						layers = [...ANATOMY_LAYERS];
						clearSelection();
					}}>Reset view</button
				>
			</div>
			{#if mode === 'compare'}<label class="ea-normalize"
					><input type="checkbox" bind:checked={normalized} /> Normalize body size</label
				>{:else}<button
					class="ea-mobile-expand"
					aria-expanded={expanded}
					onclick={() => (expanded = !expanded)}
					>{expanded ? 'Compact specimen' : 'Expand specimen'}</button
				>{/if}
		</div>
		<div class="ea-workspace" class:ea-comparing={mode === 'compare'} class:ea-expanded={expanded}>
			<div class="ea-specimen-column">
				<div class="ea-sticky">
					<div class="ea-specimen-meta">
						<span>{mode === 'compare' ? 'A / ' : ''}LIVING SPECIMEN</span><span
							>{document.measurements.words.toLocaleString()} WORDS · {document.measurements
								.paragraphs} ORGANS</span
						>
					</div>
					<Specimen
						{document}
						{activeParagraph}
						selectedSentence={previewSentence || selectedSentence}
						{layers}
						{dissected}
						{normalized}
						{playing}
						onselect={(id) => void selectSentence(id)}
						onpreview={(id) => (previewSentence = id)}
						oncluster={inspectWord}
					/>
					<div class="ea-figure-caption">
						<span>Reading order runs along the spine.</span><span
							>Tap a structure to find its words ↗</span
						>
					</div>
					<div class="ea-pulse">
						<span class="ea-section-label">PUNCTUATION TRACE</span>
						<div
							class="ea-pulse-track"
							aria-label={pulseSymbols.length
								? `Punctuation in selected sentence: ${pulseSymbols.join(' ')}`
								: 'This sentence has no measured punctuation'}
						>
							{#each pulseSymbols as symbol}<span>{symbol}</span
								>{/each}{#if !pulseSymbols.length}<span>—</span>{/if}
						</div>
						<div class="ea-pulse-canvas"><PunctuationPulse symbols={pulseSymbols} {playing} /></div>
						<span class="ea-pulse-note"
							>Each mark is an event. Timing is interpretive.{displaySentence &&
							displaySentence.punctuation.length > 30
								? ' First 30 events shown.'
								: ''}</span
						>
					</div>
					{#if mode === 'read'}
						<div class="ea-inspector" aria-live="polite">
							{#if cluster}<span class="ea-section-label">NEURAL KNOT / RECURRENCE</span>
								<h3>“{cluster.word}” <span>× {cluster.count}</span></h3>
								<p>The same word, recurring through this body.</p>
								<div class="ea-occurrences">
									{#each cluster.occurrences.slice(0, 16) as occurrence, index}<button
											onclick={() => void selectSentence(occurrence.sentenceId)}
											>Occurrence {index + 1} ↗</button
										>{/each}
								</div>
								{#if cluster.count > 16}<p>The first 16 occurrences are listed here.</p>{/if}
							{:else if displaySentence}<span class="ea-section-label"
									>{selectedSentence
										? 'PINNED PASSAGE'
										: previewSentence
											? 'UNDER THE LENS'
											: 'CURRENT PASSAGE'}</span
								>
								<div
									class="ea-inspector-quote"
									tabindex="0"
									role="textbox"
									aria-readonly="true"
									aria-multiline="true"
									aria-label="Selected source passage"
								>
									“{displaySentence.text}”
								</div>
								<div class="ea-inspector-stats">
									<span>{displaySentence.wordCount} words</span><span
										>{displaySentence.nesting === null
											? 'Nesting unavailable'
											: `${displaySentence.nesting} estimated nesting`}</span
									>{#if displaySentence.wordCount > LONG_SENTENCE_WORDS}<span
											>Long-sentence coil</span
										>{/if}
								</div>
								{#each document.citations.filter((citation) => citation.sentenceId === displaySentence.id) as citation}<p
										class="ea-citation"
									>
										<strong>Citation {citation.label}</strong> · {citation.target}
									</p>{/each}{/if}
							{#if selectedSentence || selectedWord}<button
									class="ea-resume"
									onclick={clearSelection}>Resume reading ↗ <kbd>Esc</kbd></button
								>{/if}
						</div>
					{:else if cluster}<div class="ea-inspector">
							<span class="ea-section-label">A / RECURRENT WORD</span>
							<h3>“{cluster.word}” × {cluster.count}</h3>
							<div class="ea-occurrences">
								{#each cluster.occurrences.slice(0, 16) as occurrence, index}<button
										onclick={() => void selectSentence(occurrence.sentenceId, false)}
										>Occurrence {index + 1} ↗</button
									>{/each}
							</div>
						</div>
					{:else if inspected}<div class="ea-inspector">
							<span class="ea-section-label"
								>A / SELECTED PASSAGE · {inspected.wordCount} WORDS</span
							>
							<div
								class="ea-inspector-quote"
								tabindex="0"
								role="textbox"
								aria-readonly="true"
								aria-multiline="true"
								aria-label="Selected source passage"
							>
								“{inspected.text}”
							</div>
						</div>{/if}
					<details class="ea-word-index">
						<summary>Recurring words · {document.clusters.length} neural knots</summary>
						<div>
							{#each document.clusters as word}<button
									aria-pressed={selectedWord === word.word}
									onclick={() => inspectWord(word.word)}>“{word.word}” × {word.count}</button
								>{/each}{#if !document.clusters.length}<p>
									No repeated words pass the recurrence filter.
								</p>{/if}
						</div>
					</details>
				</div>
			</div>
			{#if mode === 'read'}
				<div class="ea-reader" bind:this={reader}>
					<div class="ea-section-label">THE TEXT / FOLLOW THE LIVING BODY</div>
					<h2>{document.title}</h2>
					<div class="ea-reader-byline">
						{document.author}{#if document.canonicalUrl}<a href={document.canonicalUrl}
								>Original essay ↗</a
							>{/if}
					</div>
					<p class="ea-reading-hint">
						Scroll to wake each organ. Select a sentence to hold it under the lens.
					</p>
					<div
						class="ea-reading-text"
						role="group"
						aria-label="Essay text; select sentences with the anatomy index below"
					>
						{#each document.paragraphs as paragraph, paragraphIndex}
							{#if paragraph.heading && paragraph.heading !== document.paragraphs[paragraphIndex - 1]?.heading}<h3
								>
									{paragraph.heading}
								</h3>{/if}
							<div
								class="ea-paragraph"
								class:ea-paragraph-active={activeParagraph === paragraph.id}
								data-paragraph={paragraph.id}
							>
								<span class="ea-paragraph-number" aria-hidden="true"
									>{String(paragraph.index + 1).padStart(2, '0')}</span
								>
								<p class:ea-blockquote={paragraph.kind === 'quote'}>
									{#each paragraph.sentences as sentence, index}{#if index > 0}{paragraph.text.slice(
												paragraph.sentences[index - 1].end,
												sentence.start
											)}{:else}{paragraph.text.slice(0, sentence.start)}{/if}<span
											role="button"
											tabindex="-1"
											aria-label={`Inspect sentence: ${sentence.text}`}
											onclick={() => void selectSentence(sentence.id, false)}
											onkeydown={(event) => {
												if (event.key === 'Enter' || event.key === ' ') {
													event.preventDefault();
													void selectSentence(sentence.id, false);
												}
											}}
											data-source-sentence={sentence.id}
											class:ea-sentence-selected={selectedSentence === sentence.id}
											class:ea-sentence-preview={previewSentence === sentence.id}
											>{sentence.text}</span
										>{/each}{paragraph.text.slice(paragraph.sentences.at(-1)?.end ?? 0)}
								</p>
							</div>
						{/each}
					</div>
					<details class="ea-index">
						<summary>Text anatomy index · {sentences.length} sentences</summary>
						<p>
							Jump to any passage. Arrow keys on the specimen move between sentences; Enter selects.
						</p>
						<label
							>Find a sentence<select
								aria-label="Sentence anatomy index"
								value={selectedSentence}
								onchange={(event) => void selectSentence(event.currentTarget.value)}
								><option value="">Choose a sentence</option
								>{#each sentences as sentence, index}<option value={sentence.id}
										>{index + 1}. {sentence.text.slice(0, 95)}{sentence.text.length > 95
											? '…'
											: ''}</option
									>{/each}</select
							></label
						>
					</details>
				</div>
			{:else}
				<div class="ea-specimen-column ea-second">
					{#if comparisonError}<p class="ea-error" role="alert">
							{comparisonError}
							<button onclick={() => void loadComparison(otherId)}>Try again</button>
						</p>{/if}
					{#if otherLoading}<div class="ea-wait" role="status">
							Preparing the second anatomy…
						</div>{:else if other}<div class="ea-specimen-meta">
							<span>B / LIVING SPECIMEN</span><span
								>{other.measurements.words.toLocaleString()} WORDS · {other.measurements.paragraphs} ORGANS</span
							>
						</div>
						<Specimen
							document={other}
							selectedSentence={otherSelected}
							{layers}
							{dissected}
							{normalized}
							{playing}
							onselect={(id) => {
								otherSelected = id;
								otherWord = '';
							}}
							oncluster={(word) => {
								otherWord = word;
								otherSelected = '';
							}}
						/>
						<div class="ea-figure-caption"><span>{other.title}</span></div>
						{#if otherCluster}<div class="ea-inspector">
								<span class="ea-section-label">B / RECURRENT WORD</span>
								<h3>“{otherCluster.word}” × {otherCluster.count}</h3>
								<div class="ea-occurrences">
									{#each otherCluster.occurrences.slice(0, 16) as occurrence, index}<button
											onclick={() => {
												otherSelected = occurrence.sentenceId;
												otherWord = '';
											}}>Occurrence {index + 1} ↗</button
										>{/each}
								</div>
							</div>
						{:else if otherSentence}<div class="ea-inspector">
								<span class="ea-section-label"
									>B / SELECTED PASSAGE · {otherSentence.wordCount} WORDS</span
								>
								<div
									class="ea-inspector-quote"
									tabindex="0"
									role="textbox"
									aria-readonly="true"
									aria-multiline="true"
									aria-label="Selected source passage"
								>
									“{otherSentence.text}”
								</div>
							</div>{/if}
						<details class="ea-word-index">
							<summary>Recurring words · {other.clusters.length} neural knots</summary>
							<div>
								{#each other.clusters as word}<button
										aria-pressed={otherWord === word.word}
										onclick={() => {
											otherWord = word.word;
											otherSelected = '';
										}}>“{word.word}” × {word.count}</button
									>{/each}{#if !other.clusters.length}<p>
										No repeated words pass the recurrence filter.
									</p>{/if}
							</div>
						</details>{/if}
				</div>
			{/if}
		</div>
		{#if mode === 'compare' && other && !otherLoading}
			<div class="ea-comparison-report">
				<div>
					<span class="ea-section-label">TWO WAYS TO HAVE A BODY</span>
					<h2>The difference<br />is in the writing.</h2>
					<p>
						{normalized
							? 'Normalized view: bodies are fitted to compare proportions. Apparent body size does not encode total length.'
							: 'Shared scales: rib length, chamber size and coil thresholds use the same rules for both texts. Dense bodies are compressed at documented bounds.'}
					</p>
					{#each comparisonObservations as observation}<p class="ea-observation">
							{observation}
						</p>{/each}
				</div>
				<table>
					<caption>Measured structures, A and B</caption><thead
						><tr><th scope="col">Measurement</th><th scope="col">A</th><th scope="col">B</th></tr
						></thead
					><tbody
						><tr
							><th scope="row">Words</th><td>{document.measurements.words}</td><td
								>{other.measurements.words}</td
							></tr
						><tr
							><th scope="row">Paragraphs</th><td>{document.measurements.paragraphs}</td><td
								>{other.measurements.paragraphs}</td
							></tr
						><tr
							><th scope="row">Median sentence · words</th><td
								>{document.measurements.medianSentence}</td
							><td>{other.measurements.medianSentence}</td></tr
						><tr
							><th scope="row">Longest sentence · words</th><td
								>{document.measurements.longestSentence}</td
							><td>{other.measurements.longestSentence}</td></tr
						><tr
							><th scope="row">Sentence variation · σ words</th><td
								>{document.measurements.sentenceVariation.toFixed(1)}</td
							><td>{other.measurements.sentenceVariation.toFixed(1)}</td></tr
						><tr
							><th scope="row">Estimated nesting · max</th><td
								>{document.measurements.estimatedNesting ?? '—'}</td
							><td>{other.measurements.estimatedNesting ?? '—'}</td></tr
						><tr
							><th scope="row">Citation attachments</th><td>{document.measurements.citations}</td
							><td>{other.measurements.citations}</td></tr
						></tbody
					>
				</table>
			</div>
		{/if}
		<div class="ea-layers">
			<div class="ea-section-label">THE ANATOMICAL KEY <span>SHOW / HIDE A SYSTEM</span></div>
			<div class="ea-layer-grid">
				{#each ANATOMY_LAYERS as layer}<button
						aria-pressed={layers.includes(layer)}
						class:ea-layer-hidden={!layers.includes(layer)}
						onclick={() => toggleLayer(layer)}
						><span class="ea-layer-mark" aria-hidden="true">{layerCopy[layer].mark}</span><span
							><strong>{layerCopy[layer].name}</strong><small>{layerCopy[layer].meaning}</small
							></span
						><span class="ea-layer-check" aria-hidden="true"
							>{layers.includes(layer) ? '●' : '○'}</span
						></button
					>{/each}
			</div>
			{#if document.omittedClusters}<p class="ea-cluster-note">
					The eight most frequent recurring words are shown; {document.omittedClusters} additional recurring
					words are omitted from the drawing.
				</p>{/if}
		</div>
		<div class="ea-export">
			<div>
				<span class="ea-section-label">A PORTRAIT OF YOUR PROSE</span>
				<h2>Every body leaves an impression.</h2>
				<p>Take the complete anatomy with you. Exports use a still, assembled pose.</p>
			</div>
			<div class="ea-export-actions">
				<button disabled={exporting} onclick={() => void download('svg')}>Download SVG ↗</button
				><button disabled={exporting} onclick={() => void download('png')}
					>High-resolution PNG ↗</button
				><button disabled={exporting} onclick={() => void download('social')}
					>Social portrait · 1200 × 630 ↗</button
				>
			</div>
		</div>
		{#if document.warnings.length}<details class="ea-model-notes">
				<summary>Specimen notes · {document.warnings.length}</summary
				>{#each document.warnings as warning}<p>{warning}</p>{/each}
			</details>{/if}
	{/if}
	<details class="ea-methodology" id="ea-methodology">
		<summary>Inside the method <span>MEASUREMENTS, METAPHORS & LIMITS</span></summary>
		<div>
			<p>
				The body encodes structural features of the prose. Paragraph size and rib length use bounded
				scales; long sentences have more than {LONG_SENTENCE_WORDS} words. The spine indicates reading
				order. Citation bones appear only for explicit references or footnotes.
			</p>
			<p>
				Estimated nesting uses punctuation, parentheses and a documented English connective
				heuristic. It is an approximation, unavailable for unsupported language patterns. Neural
				knots are repeated normalized words after stop-word filtering, with at most eight displayed
				clusters. They show recurrence rather than semantic similarity.
			</p>
			<p>
				The pulse follows punctuation events with interpretive timing. Play and pause control
				motion; reduced-motion preferences are respected. Every selected structure links to real
				words. The feature documentation below explains input handling, scale compression and
				portrait provenance.
			</p>
			<p>
				Private text is analysed in a disposable local worker. Closing or navigating away discards
				it. Public samples are loaded individually from generated files.
			</p>
		</div>
	</details>
</div>
