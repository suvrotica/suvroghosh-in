<script lang="ts">
	import { ingestText } from '$lib/visualizations/mindmap-studio/ingestion';
	import { readPdf } from '$lib/visualizations/mindmap-studio/pdf';
	import type { StudioSource } from '$lib/visualizations/mindmap-studio/types';
	let {
		sources = [],
		onanalyse,
		onclose,
		onprompt,
		busy = false,
		availability = 'Checking AI availability…',
		aiAvailable = false,
		oncancel
	}: {
		sources?: StudioSource[];
		onanalyse: (
			sources: StudioSource[],
			focus: string,
			depth: 'overview' | 'detailed' | 'research',
			mode: 'local' | 'ai',
			consent: boolean
		) => void;
		onclose: () => void;
		onprompt: (
			sources: StudioSource[],
			focus: string,
			depth: 'overview' | 'detailed' | 'research'
		) => void;
		busy?: boolean;
		availability?: string;
		aiAvailable?: boolean;
		oncancel: () => void;
	} = $props();
	let staged = $state<StudioSource[]>([]);
	let text = $state('');
	let title = $state('');
	let url = $state('');
	let kind = $state<StudioSource['kind']>('text');
	let focus = $state('');
	let depth = $state<'overview' | 'detailed' | 'research'>('detailed');
	let mode = $state<'local' | 'ai'>('local');
	let consent = $state(false);
	let error = $state('');
	let reading = $state(false);
	let firstPage = $state(1);
	let lastPage = $state(20);
	let fileInput: HTMLInputElement;
	let timeStart = $state('');
	let timeEnd = $state('');
	$effect(() => {
		const revision = JSON.stringify([
			text,
			title,
			url,
			kind,
			staged,
			focus,
			depth,
			mode,
			timeStart,
			timeEnd
		]);
		if (revision) consent = false;
	});

	function seconds(value: string) {
		const values = value.replace(',', '.').split(':').map(Number);
		if (values.some((part) => !Number.isFinite(part) || part < 0) || values.length > 3) return NaN;
		return values.reduce((total, part) => total * 60 + part, 0);
	}
	function selectedText() {
		if (kind !== 'transcript' || (!timeStart && !timeEnd)) return text;
		const from = timeStart ? seconds(timeStart) : 0;
		const to = timeEnd ? seconds(timeEnd) : Infinity;
		if (!Number.isFinite(from) || Number.isNaN(to) || to <= from)
			throw new Error('Enter a valid timestamp range, such as 15:00 to 32:00.');
		const cuePattern =
			/((?:\d{1,2}:)?\d{2}:\d{2}[.,]\d{3})\s*-->\s*((?:\d{1,2}:)?\d{2}:\d{2}[.,]\d{3})[^\n]*\n([\s\S]*?)(?=\n\s*\n|$)/g;
		const matches = [...text.matchAll(cuePattern)];
		if (!matches.length)
			throw new Error(
				'Timestamp selection needs SRT or VTT cues. Otherwise paste only the passage you want to analyse.'
			);
		const selected = matches
			.filter((match) => seconds(match[1]) >= from && seconds(match[2]) <= to)
			.map((match) => match[0]);
		if (!selected.length) throw new Error('No complete caption cues fall within that range.');
		return selected.join('\n\n');
	}
	function pendingSource() {
		if (!text.trim()) {
			if (url.trim())
				throw new Error(
					'The link is a reference. Add its transcript or article text so there is material to analyse.'
				);
			return null;
		}
		const source = ingestText(
			selectedText(),
			title.trim() || `Source ${staged.length + 1}`,
			kind,
			url.trim() || undefined
		);
		if (kind === 'transcript' && (timeStart || timeEnd))
			source.scope = `Complete cues within ${timeStart || 'start'}–${timeEnd || 'end'}`;
		return source;
	}
	function collect() {
		const pending = pendingSource();
		const result = pending ? [...staged, pending] : staged;
		if (!result.length) throw new Error('Paste some source text or choose a file first.');
		if (result.length > 8 || result.reduce((sum, source) => sum + source.text.length, 0) > 200_000)
			throw new Error('Use up to 8 sources and 200,000 characters in one project.');
		return result;
	}
	function add() {
		try {
			const source = pendingSource();
			if (!source) throw new Error('Add source text first.');
			collect();
			staged = [...staged, source];
			text = '';
			title = '';
			url = '';
			error = '';
		} catch (cause) {
			error = cause instanceof Error ? cause.message : 'Could not add source.';
		}
	}
	async function readFile(event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		reading = true;
		error = '';
		try {
			if (file.size > 10 * 1024 * 1024) throw new Error('Choose a file smaller than 10 MB.');
			const extension = file.name.toLowerCase().split('.').pop();
			if (!['pdf', 'txt', 'md', 'srt', 'vtt'].includes(extension || ''))
				throw new Error('Choose a TXT, Markdown, SRT, VTT or PDF file.');
			const nextTitle = file.name.replace(/\.[^.]+$/, '');
			let nextText: string;
			let nextKind: StudioSource['kind'];
			if (extension === 'pdf') {
				nextKind = 'pdf';
				nextText = await readPdf(file, firstPage, lastPage);
			} else {
				nextKind = ['srt', 'vtt'].includes(extension || '') ? 'transcript' : 'text';
				nextText = await file.text();
			}
			if (nextText.length > 100_000) {
				throw new Error('This file exceeds 100,000 characters. Paste a shorter excerpt.');
			}
			title = nextTitle;
			text = nextText;
			kind = nextKind;
			url = '';
			timeStart = '';
			timeEnd = '';
		} catch (cause) {
			error = cause instanceof Error ? cause.message : 'Could not read this file.';
		} finally {
			reading = false;
			input.value = '';
		}
	}
	function run(copy = false) {
		try {
			const input = collect();
			error = '';
			if (copy) onprompt(input, focus, depth);
			else {
				onanalyse(input, focus, depth, mode, consent);
				consent = false;
			}
		} catch (cause) {
			error = cause instanceof Error ? cause.message : 'Check the source input.';
		}
	}
</script>

<section class="source-panel" aria-label="Source workspace">
	<div class="panel-heading">
		<div>
			<span class="eyebrow">01 / THE MATERIAL</span>
			<h3>Start with the source.</h3>
		</div>
		<button class="icon-button" onclick={onclose} aria-label="Close source workspace">×</button>
	</div>
	<p class="quiet">
		Paste the passage you want to understand. Keep its evidence close as the map takes shape.
	</p>
	<div class="source-file-row">
		<button onclick={() => fileInput.click()} disabled={reading || busy}
			>{reading ? 'Reading file…' : '↑ Open a text or PDF file'}</button
		><input
			bind:this={fileInput}
			type="file"
			accept=".txt,.md,.srt,.vtt,.pdf"
			onchange={readFile}
			hidden
		/>
	</div>
	<details class="pdf-range">
		<summary>PDF page selection</summary>
		<div class="two-fields">
			<label>First page<input type="number" min="1" bind:value={firstPage} /></label><label
				>Last page<input
					type="number"
					min={firstPage}
					max={firstPage + 99}
					bind:value={lastPage}
				/></label
			>
		</div>
		<small
			>Set the physical page range before opening a PDF. Scanned pages need extracted text.</small
		>
	</details>
	<div class="two-fields">
		<label
			>Source title<input
				bind:value={title}
				maxlength="200"
				placeholder="An essay, lecture or question"
				disabled={busy}
			/></label
		><label
			>Source type<select bind:value={kind} disabled={busy}
				><option value="text">Text / article</option><option value="transcript">Transcript</option
				><option value="pdf">PDF excerpt</option><option value="url">Link + excerpt</option></select
			></label
		>
	</div>
	<label
		>Original link <span class="quiet">(optional)</span><input
			bind:value={url}
			type="url"
			placeholder="https://…"
			disabled={busy}
		/></label
	>
	{#if kind === 'url'}<p class="notice">
			Links are saved as references. Paste the actual article or transcript below; this app does not
			fetch or watch linked content.
		</p>{/if}
	<label
		>Text to analyse<textarea
			bind:value={text}
			rows="10"
			maxlength="100000"
			placeholder="Paste your source here. Paragraphs, headings and caption timestamps help preserve its structure."
			disabled={busy || reading}
		></textarea></label
	>
	<div class="field-footer">
		<span>{text.length.toLocaleString()} characters</span><button
			class="text-button"
			onclick={add}
			disabled={busy || !text.trim()}>+ Add another source</button
		>
	</div>
	{#if kind === 'transcript'}<div class="two-fields">
			<label>From timestamp<input bind:value={timeStart} placeholder="00:15:00" /></label><label
				>To timestamp<input bind:value={timeEnd} placeholder="00:32:00" /></label
			>
		</div>{/if}
	{#if staged.length}<ul class="source-list">
			{#each staged as source, index (source.id)}<li>
					<span
						>{index + 1}. {source.title}<small
							>{source.text.length.toLocaleString()} characters</small
						></span
					><button
						class="icon-button"
						onclick={() => (staged = staged.filter((item) => item.id !== source.id))}
						aria-label={`Remove ${source.title}`}
						disabled={busy}>×</button
					>
				</li>{/each}
		</ul>{/if}
	{#if sources.length && !staged.length}<button
			class="text-button"
			onclick={() => (staged = structuredClone(sources))}
			disabled={busy}>Use this map’s {sources.length === 1 ? 'source' : 'sources'}</button
		>{/if}
	<label
		>What would you like to understand?<input
			bind:value={focus}
			maxlength="1000"
			placeholder="e.g. Find the main argument and its assumptions"
			disabled={busy}
		/></label
	>
	<div class="two-fields">
		<label
			>Depth<select bind:value={depth} disabled={busy}
				><option value="overview">Overview</option><option value="detailed">Detailed</option><option
					value="research">Research</option
				></select
			></label
		><label
			>Analysis<select bind:value={mode} disabled={busy}
				><option value="local">Local outline</option><option value="ai"
					>AI · conceptual analysis</option
				></select
			></label
		>
	</div>
	{#if mode === 'local'}<p class="notice">
			Local mode arranges exact passages into a reading outline in your browser. Choose AI for
			conceptual interpretation, argument mapping and research analysis.
		</p>{:else}<p class="notice">{availability}</p>
		<label class="check-label"
			><input type="checkbox" bind:checked={consent} disabled={busy} />Send these sources through
			this site and Vercel AI Gateway to NVIDIA for this analysis. NVIDIA may retain the material
			for model improvement.</label
		>{/if}
	{#if error}<p class="error" role="alert">{error}</p>{/if}
	<div class="panel-actions">
		<button
			class="primary"
			onclick={() => run()}
			disabled={busy || reading || (mode === 'ai' && (!consent || !aiAvailable))}
			>{busy ? 'Analysing…' : mode === 'ai' ? 'Analyse & map →' : 'Create local outline →'}</button
		>{#if busy}<button onclick={oncancel}>Cancel</button>{/if}<button
			class="text-button"
			onclick={() => run(true)}
			disabled={busy}>Copy research prompt</button
		>
	</div>
	<p class="fine-print">
		New analysis creates a separate revision. Your current map stays in Undo. Up to 8 sources and
		200,000 characters.
	</p>
</section>
