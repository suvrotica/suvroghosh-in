<script lang="ts">
	import { onMount } from 'svelte';
	import UmlFigure from '$lib/components/blog/UmlFigure.svelte';
	import {
		getDiagramTypesForFilter,
		getUmlDiagramMeta,
		UML_DIAGRAM_LIST,
		UML_FAMILY_GROUPS
	} from '$lib/visualizations/post-to-uml/catalog';
	import {
		CURATED_UML_SAMPLES,
		type UmlSampleArticle
	} from '$lib/visualizations/post-to-uml/examples';
	import {
		buildDiagramSectionBlogEmbed,
		buildExportZipBytes,
		buildFullPostWithUmlMarkdown,
		buildSingleDiagramBlogEmbed,
		getDiagramAssetPaths
	} from '$lib/visualizations/post-to-uml/export';
	import {
		generateSingleDiagramRecord,
		generateUmlDiagramsFromText,
		slugifyTitle,
		updateDiagramFromManualEdit
	} from '$lib/visualizations/post-to-uml/generator';
	import { renderSafeMarkdownPreview } from '$lib/visualizations/post-to-uml/markdown-preview';
	import { highlightPlantUmlSource } from '$lib/visualizations/post-to-uml/plantuml/highlight';
	import {
		ALL_UML_DIAGRAM_TYPES,
		type UmlAiAvailability,
		type UmlAnalysisEngine,
		type UmlBlogPostOption,
		type UmlDetailLevel,
		type UmlDiagramRecord,
		type UmlDiagramType,
		type UmlFamilyFilter,
		type UmlGenerationMode,
		type UmlGenerationResponse
	} from '$lib/visualizations/post-to-uml/types';

	const initialSample = CURATED_UML_SAMPLES[0];

	let articleTitle = $state<string>(initialSample.title);
	let articleSlug = $state<string>(initialSample.slug);
	let inputText = $state<string>(initialSample.markdown);
	let generationMode = $state<UmlGenerationMode>('recommended');
	let familyFilter = $state<UmlFamilyFilter>('all');
	let selectedTypes = $state<UmlDiagramType[]>(['class', 'activity', 'sequence']);
	let detailLevel = $state<UmlDetailLevel>('simple');
	let allowAssumptions = $state<boolean>(false);
	let analysisEngine = $state<UmlAnalysisEngine>('local');
	let aiConsent = $state<boolean>(false);

	let aiAvailability = $state<UmlAiAvailability>({
		available: false,
		provider: 'Vercel AI Gateway',
		model: 'nvidia/nemotron-3.5-lightning-free',
		reason:
			'Local deterministic text-to-UML engine is active by default. Checking server AI configuration…',
		configurationSteps: [
			'Set UML_AI_ENABLED="true" in .env.',
			'Set UML_AI_MODEL="nvidia/nemotron-3.5-lightning-free" (or preferred gateway model).',
			'Provide AI_GATEWAY_API_KEY or deploy with Vercel OIDC.',
			'Set UML_RATE_LIMIT_SALT to at least 32 random characters.'
		]
	});

	let blogPostOptions = $state<UmlBlogPostOption[]>([]);
	let selectedBlogSlug = $state<string>('');
	let isLoadingPost = $state<boolean>(false);
	let postLoadMessage = $state<string>('');

	let isGenerating = $state<boolean>(false);
	let statusBanner = $state<string>('');
	let errorBanner = $state<string>('');
	let activeAbortController: AbortController | null = null;

	// Run initial deterministic generation so the tool opens with live working diagrams
	const initialRun = generateUmlDiagramsFromText(
		{
			text: initialSample.markdown,
			title: initialSample.title,
			mode: 'recommended',
			selectedTypes: ['class', 'activity', 'sequence'],
			detailLevel: 'simple',
			allowAssumptions: false,
			engine: 'local',
			postSlug: initialSample.slug
		},
		'local',
		'Local Deterministic UML Analyzer'
	);

	let currentResult = $state<UmlGenerationResponse>(initialRun);
	let diagrams = $state<UmlDiagramRecord[]>(initialRun.diagrams);

	// Per-card UI state
	let activeCardTab = $state<Record<string, 'preview' | 'source' | 'evidence' | 'legend'>>({});
	let cardZoom = $state<Record<string, number>>({});
	let copiedFeedback = $state<Record<string, string>>({});
	let fullscreenDiagram = $state<UmlDiagramRecord | null>(null);
	let fullscreenDialogEl = $state<HTMLDialogElement | null>(null);

	const visibleTypeCatalog = $derived(
		getDiagramTypesForFilter(familyFilter).map((t) => getUmlDiagramMeta(t))
	);

	const inputStats = $derived.by(() => {
		const trimmed = inputText.trim();
		const chars = inputText.length;
		const words = trimmed ? trimmed.split(/\s+/).length : 0;
		const paragraphs = trimmed ? trimmed.split(/\n\s*\n/).filter(Boolean).length : 0;
		return { chars, words, paragraphs };
	});

	const safeArticleHtml = $derived(renderSafeMarkdownPreview(inputText));
	const renderedDiagrams = $derived(
		diagrams.filter((d) => d.generationStatus === 'generated' && Boolean(d.svg || d.lastValidSvg))
	);
	const effectiveSlug = $derived(
		slugifyTitle(articleSlug || articleTitle || currentResult.title || 'article-uml')
	);
	const sectionBlogEmbedCode = $derived(buildDiagramSectionBlogEmbed(diagrams, effectiveSlug));

	onMount(async () => {
		try {
			const res = await fetch('/api/uml');
			if (res.ok) {
				const data = (await res.json()) as {
					ai?: UmlAiAvailability;
					posts?: UmlBlogPostOption[];
				};
				if (data.ai) {
					aiAvailability = data.ai;
				}
				if (Array.isArray(data.posts)) {
					blogPostOptions = data.posts;
				}
			}
		} catch {
			// Offline or static preview: keep local mode active
		}
	});

	function getTab(diagramId: string): 'preview' | 'source' | 'evidence' | 'legend' {
		return activeCardTab[diagramId] ?? 'preview';
	}

	function setTab(diagramId: string, tab: 'preview' | 'source' | 'evidence' | 'legend') {
		activeCardTab = { ...activeCardTab, [diagramId]: tab };
	}

	function getZoom(diagramId: string): number {
		return cardZoom[diagramId] ?? 100;
	}

	function adjustZoom(diagramId: string, delta: number) {
		const next = Math.min(200, Math.max(50, getZoom(diagramId) + delta));
		cardZoom = { ...cardZoom, [diagramId]: next };
	}

	function resetZoom(diagramId: string) {
		cardZoom = { ...cardZoom, [diagramId]: 100 };
	}

	function flashCopied(key: string, label: string) {
		copiedFeedback = { ...copiedFeedback, [key]: label };
		setTimeout(() => {
			const copy = { ...copiedFeedback };
			delete copy[key];
			copiedFeedback = copy;
		}, 1800);
	}

	function toggleDiagramType(type: UmlDiagramType) {
		if (selectedTypes.includes(type)) {
			if (selectedTypes.length > 1) {
				selectedTypes = selectedTypes.filter((t) => t !== type);
			}
		} else {
			selectedTypes = [...selectedTypes, type];
		}
		if (generationMode !== 'selected') {
			generationMode = 'selected';
		}
	}

	function selectFamilyGroup(filter: UmlFamilyFilter) {
		familyFilter = filter;
		const groupTypes = [...getDiagramTypesForFilter(filter)];
		selectedTypes = groupTypes;
		if (filter === 'all') {
			generationMode = 'all14';
		} else {
			generationMode = 'selected';
		}
	}

	function loadCuratedSample(sample: UmlSampleArticle) {
		articleTitle = sample.title;
		articleSlug = sample.slug;
		inputText = sample.markdown;
		selectedBlogSlug = '';
		postLoadMessage = `Loaded curated sample: "${sample.title}"`;
		runGeneration();
	}

	async function loadSelectedBlogPost() {
		if (!selectedBlogSlug) return;
		isLoadingPost = true;
		postLoadMessage = '';
		errorBanner = '';
		try {
			const res = await fetch(`/api/uml?post=${encodeURIComponent(selectedBlogSlug)}`);
			if (!res.ok) {
				const err = (await res.json().catch(() => ({}))) as { error?: string };
				throw new Error(err.error || `Could not load blog post "${selectedBlogSlug}".`);
			}
			const data = (await res.json()) as {
				post: {
					slug: string;
					title: string;
					markdown: string;
					date: string;
					categoryLabel: string;
				};
			};
			articleTitle = data.post.title;
			articleSlug = data.post.slug;
			inputText = data.post.markdown;
			postLoadMessage = `Loaded published post "${data.post.title}" (${data.post.categoryLabel} · ${data.post.date}).`;
			await runGeneration();
		} catch (err) {
			errorBanner = err instanceof Error ? err.message : 'Failed to load blog post.';
		} finally {
			isLoadingPost = false;
		}
	}

	function cancelGeneration() {
		if (activeAbortController) {
			activeAbortController.abort();
			activeAbortController = null;
		}
		isGenerating = false;
		statusBanner = 'Generation cancelled.';
	}

	async function runGeneration() {
		errorBanner = '';
		statusBanner = '';

		if (!inputText.trim()) {
			errorBanner = 'Paste article text or load a blog post before generating UML diagrams.';
			return;
		}

		if (generationMode === 'selected' && selectedTypes.length === 0) {
			errorBanner = 'Select at least one UML diagram type or switch to Recommended mode.';
			return;
		}

		if (activeAbortController) {
			activeAbortController.abort();
		}
		const controller = new AbortController();
		activeAbortController = controller;
		isGenerating = true;

		try {
			if (analysisEngine === 'ai') {
				if (!aiAvailability.available) {
					errorBanner = aiAvailability.reason;
					isGenerating = false;
					return;
				}
				if (!aiConsent) {
					errorBanner =
						'Confirm external AI provider transmission before running AI mode, or use the Local deterministic model.';
					isGenerating = false;
					return;
				}

				statusBanner = `Requesting UML analysis from ${aiAvailability.provider} (${aiAvailability.model})…`;
				const res = await fetch('/api/uml', {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					signal: controller.signal,
					body: JSON.stringify({
						text: inputText,
						title: articleTitle || undefined,
						mode: generationMode,
						selectedTypes,
						detailLevel,
						allowAssumptions,
						engine: 'ai',
						postSlug: effectiveSlug,
						consent: true
					})
				});

				const payload = (await res.json()) as {
					result?: UmlGenerationResponse;
					error?: string;
				};
				if (!res.ok || !payload.result) {
					throw new Error(payload.error || 'AI UML generation failed.');
				}
				currentResult = payload.result;
				diagrams = payload.result.diagrams;
				statusBanner = `Generated ${payload.result.diagrams.length} UML view(s) via ${payload.result.modelLabel}.`;
			} else {
				statusBanner = 'Interpreting article, validating PlantUML source, and rendering SVG…';
				const localRes = generateUmlDiagramsFromText(
					{
						text: inputText,
						title: articleTitle || undefined,
						mode: generationMode,
						selectedTypes,
						detailLevel,
						allowAssumptions,
						engine: 'local',
						postSlug: effectiveSlug
					},
					'local',
					'Local Deterministic UML Analyzer'
				);
				currentResult = localRes;
				diagrams = localRes.diagrams;
				const renderedCount = localRes.diagrams.filter((d) => d.renderStatus === 'rendered').length;
				const skippedCount = localRes.diagrams.filter(
					(d) => d.generationStatus === 'needs_more_info' || d.generationStatus === 'not_applicable'
				).length;
				statusBanner = `Completed: ${renderedCount} rendered diagram(s)${
					skippedCount > 0
						? `, ${skippedCount} reported as Needs More Information / Not Applicable`
						: ''
				}.`;
			}
		} catch (err) {
			if (err instanceof DOMException && err.name === 'AbortError') {
				statusBanner = 'Generation cancelled.';
			} else {
				errorBanner =
					err instanceof Error ? err.message : 'Unexpected error during UML generation.';
			}
		} finally {
			if (activeAbortController === controller) {
				activeAbortController = null;
			}
			isGenerating = false;
		}
	}

	function handleSourceCodeEdit(diagramId: string, newCode: string) {
		diagrams = diagrams.map((d) =>
			d.id === diagramId ? updateDiagramFromManualEdit(d, newCode) : d
		);
	}

	function regenerateSingleDiagram(type: UmlDiagramType) {
		const refreshed = generateSingleDiagramRecord(type, currentResult.sharedModel, {
			detailLevel,
			allowAssumptions,
			provenance: 'local'
		});
		diagrams = diagrams.map((d) => (d.type === type ? refreshed : d));
		statusBanner = `Regenerated ${getUmlDiagramMeta(type).label} from shared article model.`;
	}

	async function copyText(key: string, text: string, label: string) {
		if (!text || typeof navigator === 'undefined' || !navigator.clipboard) return;
		await navigator.clipboard.writeText(text);
		flashCopied(key, label);
	}

	function downloadTextFile(
		filename: string,
		content: string,
		mimeType = 'text/plain;charset=utf-8'
	) {
		if (typeof document === 'undefined') return;
		const blob = new Blob([content], { type: mimeType });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = filename;
		a.click();
		URL.revokeObjectURL(url);
	}

	function downloadDiagramPuml(diagram: UmlDiagramRecord) {
		const paths = getDiagramAssetPaths(effectiveSlug, diagram.type);
		const filename =
			paths.pumlPublicPath.split('/').pop() || `${effectiveSlug}-${diagram.type}.puml`;
		downloadTextFile(filename, `${diagram.sourceCode.trim()}\n`);
	}

	function downloadDiagramSvg(diagram: UmlDiagramRecord) {
		const svgContent = diagram.svg || diagram.lastValidSvg;
		if (!svgContent) return;
		const paths = getDiagramAssetPaths(effectiveSlug, diagram.type);
		const filename = paths.svgPublicPath.split('/').pop() || `${effectiveSlug}-${diagram.type}.svg`;
		downloadTextFile(filename, svgContent, 'image/svg+xml;charset=utf-8');
	}

	async function downloadDiagramPng(diagram: UmlDiagramRecord) {
		const svgContent = diagram.svg || diagram.lastValidSvg;
		if (!svgContent || typeof document === 'undefined') return;
		const paths = getDiagramAssetPaths(effectiveSlug, diagram.type);

		const svgBlob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
		const url = URL.createObjectURL(svgBlob);
		const img = new Image();
		img.decoding = 'async';

		await new Promise<void>((resolve, reject) => {
			img.onload = () => resolve();
			img.onerror = () => reject(new Error('Could not rasterize SVG to PNG.'));
			img.src = url;
		}).finally(() => {
			URL.revokeObjectURL(url);
		});

		const scale = 2;
		const width = (img.naturalWidth || 760) * scale;
		const height = (img.naturalHeight || 480) * scale;
		const canvas = document.createElement('canvas');
		canvas.width = width;
		canvas.height = height;
		const ctx = canvas.getContext('2d');
		if (!ctx) return;

		ctx.fillStyle = '#fcfbf8';
		ctx.fillRect(0, 0, width, height);
		ctx.drawImage(img, 0, 0, width, height);

		canvas.toBlob((pngBlob) => {
			if (!pngBlob) return;
			const pngUrl = URL.createObjectURL(pngBlob);
			const a = document.createElement('a');
			a.href = pngUrl;
			a.download = paths.pngFilename;
			a.click();
			URL.revokeObjectURL(pngUrl);
		}, 'image/png');
	}

	function downloadFullZipBundle() {
		const zipBytes = buildExportZipBytes({
			postSlug: effectiveSlug,
			title: articleTitle || currentResult.title,
			originalText: inputText,
			diagrams
		});
		const safeBytes = new Uint8Array(zipBytes.byteLength);
		safeBytes.set(zipBytes);
		const blob = new Blob([safeBytes], { type: 'application/zip' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `${effectiveSlug}-uml-bundle.zip`;
		a.click();
		URL.revokeObjectURL(url);
	}

	function openFullscreen(diagram: UmlDiagramRecord) {
		fullscreenDiagram = diagram;
		if (fullscreenDialogEl && !fullscreenDialogEl.open) {
			fullscreenDialogEl.showModal();
		}
	}

	function closeFullscreen() {
		if (fullscreenDialogEl?.open) {
			fullscreenDialogEl.close();
		}
		fullscreenDiagram = null;
	}
</script>

<section class="uml-studio" aria-label="Post to UML — Draw in UML from text provided">
	<!-- Top Hero & Workflow Bar -->
	<header class="uml-studio-header">
		<div class="uml-studio-kicker">
			<span class="uml-pill-accent">Viz Tool · Post to UML</span>
			<span class="uml-pill-muted"
				>14 UML 2.5 Diagram Types · PlantUML Source · Deterministic SVG/PNG</span
			>
		</div>
		<h1 class="uml-studio-heading">Post to UML: Draw in UML from Any Text or Article</h1>
		<p class="uml-studio-sub">
			Paste any article or load an existing post from <code>suvroghosh.in</code>, select UML diagram
			families or let Recommended mode pick the smallest high-signal set, edit the generated
			PlantUML code live, and export the article followed by its rendered UML figures and captions.
		</p>
	</header>

	<!-- Step 1: Input & Existing Blog Post Loader -->
	<div class="uml-panel">
		<div class="uml-panel-header">
			<h3>1. Source Text or Existing Blog Post</h3>
			<div class="uml-sample-bar" aria-label="Curated sample articles">
				<span class="uml-sample-label">Samples:</span>
				{#each CURATED_UML_SAMPLES as sample (sample.id)}
					<button
						type="button"
						class="uml-chip-btn"
						class:active={articleSlug === sample.slug}
						onclick={() => loadCuratedSample(sample)}
					>
						{sample.category}
					</button>
				{/each}
			</div>
		</div>

		<!-- Existing Blog Post Loader Row -->
		<div class="uml-loader-row">
			<label class="uml-field-grow">
				<span class="uml-label">Load an existing published post from suvroghosh.in</span>
				<select
					class="uml-select"
					bind:value={selectedBlogSlug}
					aria-label="Select a published blog post to load"
				>
					<option value="">— Choose a published post ({blogPostOptions.length} indexed) —</option>
					{#each blogPostOptions as post (post.slug)}
						<option value={post.slug}>
							[{post.categoryLabel}] {post.title} ({post.date})
						</option>
					{/each}
				</select>
			</label>
			<button
				type="button"
				class="uml-btn uml-btn-secondary"
				disabled={!selectedBlogSlug || isLoadingPost}
				onclick={loadSelectedBlogPost}
			>
				{isLoadingPost ? 'Loading…' : 'Load Post Text'}
			</button>
		</div>

		{#if postLoadMessage}
			<p class="uml-info-note" role="status">{postLoadMessage}</p>
		{/if}

		<div class="uml-title-row">
			<label class="uml-field-grow">
				<span class="uml-label">Article / Document Title (optional)</span>
				<input
					type="text"
					class="uml-input"
					placeholder="e.g., How a Rural Immunization Record Crosses a National Health Exchange"
					bind:value={articleTitle}
				/>
			</label>
			<label class="uml-field-slug">
				<span class="uml-label">Export Asset Slug</span>
				<input type="text" class="uml-input" placeholder="article-uml" bind:value={articleSlug} />
			</label>
		</div>

		<label class="uml-textarea-wrap">
			<div class="uml-textarea-meta">
				<span class="uml-label">Paste Plain Text or Markdown</span>
				<span class="uml-counter">
					{inputStats.words.toLocaleString()} words · {inputStats.chars.toLocaleString()} chars ·
					{inputStats.paragraphs} paragraph(s)
				</span>
			</div>
			<textarea
				class="uml-textarea"
				rows="10"
				placeholder="Paste blog post prose, system notes, scientific workflows, or policy analyses here…"
				bind:value={inputText}
			></textarea>
		</label>
	</div>

	<!-- Step 2: Generation Mode, UML Family Filters, and Presentation Settings -->
	<div class="uml-panel">
		<div class="uml-panel-header">
			<h3>2. Diagram Selection &amp; Faithfulness Controls</h3>
			<span class="uml-subtitle-note">
				Structural, Behavioral, and Interaction act as family filters/selectors across the 14
				concrete UML types.
			</span>
		</div>

		<!-- Generation Mode Selector -->
		<div class="uml-controls-grid">
			<fieldset class="uml-fieldset">
				<legend class="uml-label">Generation Mode</legend>
				<div class="uml-segmented">
					<button
						type="button"
						class="uml-seg-btn"
						class:active={generationMode === 'recommended'}
						onclick={() => (generationMode = 'recommended')}
					>
						<strong>Recommended (1–3)</strong>
						<span>Smallest useful set with rationale</span>
					</button>
					<button
						type="button"
						class="uml-seg-btn"
						class:active={generationMode === 'selected'}
						onclick={() => (generationMode = 'selected')}
					>
						<strong>Selected types ({selectedTypes.length})</strong>
						<span>Generate explicitly chosen types</span>
					</button>
					<button
						type="button"
						class="uml-seg-btn"
						class:active={generationMode === 'all14'}
						onclick={() => {
							generationMode = 'all14';
							selectedTypes = [...ALL_UML_DIAGRAM_TYPES];
						}}
					>
						<strong>All 14 types</strong>
						<span>Evaluate all 14 &amp; report missing evidence</span>
					</button>
				</div>
			</fieldset>

			<fieldset class="uml-fieldset">
				<legend class="uml-label">Presentation &amp; Assumptions</legend>
				<div class="uml-options-stack">
					<div class="uml-inline-radios" role="radiogroup" aria-label="Presentation detail level">
						<label class="uml-radio-pill" class:active={detailLevel === 'simple'}>
							<input
								type="radio"
								name="uml-detail"
								value="simple"
								checked={detailLevel === 'simple'}
								onchange={() => (detailLevel = 'simple')}
							/>
							Simple (compact)
						</label>
						<label class="uml-radio-pill" class:active={detailLevel === 'detailed'}>
							<input
								type="radio"
								name="uml-detail"
								value="detailed"
								checked={detailLevel === 'detailed'}
								onchange={() => (detailLevel = 'detailed')}
							/>
							Detailed (attributes, guards, lanes)
						</label>
					</div>

					<label class="uml-checkbox-row">
						<input type="checkbox" bind:checked={allowAssumptions} />
						<span>
							<strong>Allow illustrative assumptions</strong> — synthesize clearly labeled illustrative
							slots, nodes, or relative time ticks when the article omits them (never presented as measured
							facts).
						</span>
					</label>
				</div>
			</fieldset>
		</div>

		<!-- UML Family Filter Tabs -->
		<div class="uml-family-tabs" role="tablist" aria-label="UML Diagram Families">
			{#each UML_FAMILY_GROUPS as group (group.id)}
				<div class="uml-family-tab-card" class:active={familyFilter === group.id}>
					<button
						type="button"
						role="tab"
						aria-selected={familyFilter === group.id}
						class="uml-family-tab-btn"
						onclick={() => (familyFilter = group.id)}
					>
						<strong>{group.label}</strong>
						<span>{group.description}</span>
					</button>
					<button
						type="button"
						class="uml-family-select-btn"
						onclick={() => selectFamilyGroup(group.id)}
					>
						Select all {group.types.length}
					</button>
				</div>
			{/each}
		</div>

		<!-- 14 Concrete Diagram Checkboxes -->
		<div class="uml-type-grid" role="group" aria-label="Concrete UML diagram types">
			{#each visibleTypeCatalog as meta (meta.type)}
				{@const isChecked =
					generationMode === 'all14'
						? true
						: generationMode === 'recommended'
							? currentResult.recommendation.recommendedTypes.includes(meta.type)
							: selectedTypes.includes(meta.type)}
				<label class="uml-type-card" class:checked={isChecked}>
					<div class="uml-type-card-top">
						<input
							type="checkbox"
							checked={isChecked}
							onchange={() => toggleDiagramType(meta.type)}
						/>
						<span class="uml-type-num">#{meta.number}</span>
						<strong class="uml-type-title">{meta.label}</strong>
						<span class="uml-badge-mini">{meta.familyBadge}</span>
					</div>
					<p class="uml-type-desc">{meta.summary}</p>
				</label>
			{/each}
		</div>

		<!-- Engine Selector & Action Bar -->
		<div class="uml-action-bar">
			<div class="uml-engine-box">
				<span class="uml-label">Analysis Engine:</span>
				<label class="uml-radio-pill" class:active={analysisEngine === 'local'}>
					<input
						type="radio"
						name="uml-engine"
						value="local"
						checked={analysisEngine === 'local'}
						onchange={() => (analysisEngine = 'local')}
					/>
					Local Deterministic (Offline-safe)
				</label>
				<label class="uml-radio-pill" class:active={analysisEngine === 'ai'}>
					<input
						type="radio"
						name="uml-engine"
						value="ai"
						checked={analysisEngine === 'ai'}
						onchange={() => (analysisEngine = 'ai')}
					/>
					AI Provider ({aiAvailability.available ? 'Ready' : 'Config required'})
				</label>
			</div>

			<div class="uml-cta-buttons">
				<button
					type="button"
					class="uml-btn uml-btn-primary"
					disabled={isGenerating}
					onclick={runGeneration}
				>
					{isGenerating ? 'Generating…' : 'Generate UML Diagrams'}
				</button>
				<button
					type="button"
					class="uml-btn uml-btn-secondary"
					disabled={!isGenerating}
					onclick={cancelGeneration}
				>
					Cancel
				</button>
				<button
					type="button"
					class="uml-btn uml-btn-secondary"
					disabled={isGenerating}
					onclick={runGeneration}
				>
					Regenerate All
				</button>
			</div>
		</div>

		{#if analysisEngine === 'ai'}
			<div class="uml-ai-notice" role="region" aria-label="AI Provider Configuration and Consent">
				<p>
					<strong>{aiAvailability.provider} ({aiAvailability.model}):</strong>
					{aiAvailability.reason}
				</p>
				{#if aiAvailability.available}
					<label class="uml-checkbox-row">
						<input type="checkbox" bind:checked={aiConsent} />
						<span>
							I consent to sending the pasted article text to the configured server AI gateway for
							UML extraction.
						</span>
					</label>
				{:else}
					<details class="uml-config-details">
						<summary>How to enable AI provider text-to-UML generation</summary>
						<ol>
							{#each aiAvailability.configurationSteps as step (step)}
								<li><code>{step}</code></li>
							{/each}
						</ol>
					</details>
				{/if}
			</div>
		{/if}

		{#if statusBanner}
			<p class="uml-status-banner" role="status">{statusBanner}</p>
		{/if}
		{#if errorBanner}
			<p class="uml-error-banner" role="alert">{errorBanner}</p>
		{/if}
		{#each currentResult.warnings as warning (warning)}
			<p class="uml-warning-banner" role="note">{warning}</p>
		{/each}
	</div>

	<!-- Shared Model & Recommendation Summary Banner -->
	<div class="uml-summary-strip">
		<div class="uml-summary-main">
			<span class="uml-badge-domain">
				{currentResult.sharedModel.isConceptualModel
					? `Conceptual UML Model (${currentResult.sharedModel.domainKind})`
					: 'Software Architecture Model'}
			</span>
			<p class="uml-summary-text">
				<strong
					>Shared Terminology ({currentResult.sharedModel.entities.length} core concepts):</strong
				>
				{currentResult.sharedModel.terminology.join(' · ')}
			</p>
			{#if generationMode === 'recommended'}
				<p class="uml-summary-rationale">
					<strong
						>Why these {currentResult.recommendation.recommendedTypes.length} diagrams were recommended:</strong
					>
					{currentResult.recommendation.rationale}
				</p>
			{/if}
		</div>

		<details class="uml-matrix-disclosure">
			<summary>Inspect Shared Internal Model &amp; 14-Type Renderer Capability Matrix</summary>
			<div class="uml-matrix-grid">
				<div>
					<h4>Shared Internal Model Entities</h4>
					<ul class="uml-compact-list">
						{#each currentResult.sharedModel.entities as ent (ent.id)}
							<li>
								<strong>{ent.name}</strong> (<code>{ent.id}</code>, «{ent.stereotype}», ¶{ent.paragraphIndex})
							</li>
						{/each}
					</ul>
					<p class="uml-meta-note">{currentResult.sharedModel.conceptualRationale}</p>
				</div>
				<div>
					<h4>PlantUML Deterministic Renderer Capability Matrix</h4>
					<div class="uml-table-scroll">
						<table class="uml-cap-table">
							<thead>
								<tr>
									<th>#</th>
									<th>Diagram Type</th>
									<th>Family</th>
									<th>Support</th>
									<th>Notation &amp; Verification Notes</th>
								</tr>
							</thead>
							<tbody>
								{#each UML_DIAGRAM_LIST as item (item.type)}
									<tr>
										<td>{item.number}</td>
										<td><strong>{item.shortLabel}</strong></td>
										<td>{item.familyBadge}</td>
										<td>
											<span
												class="uml-support-pill"
												class:composed={item.rendererSupport === 'composed'}
											>
												{item.rendererSupport === 'native' ? 'Native' : 'Composed'}
											</span>
										</td>
										<td>{item.rendererNotes}</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				</div>
			</div>
		</details>
	</div>

	<!-- Step 3: Generated Diagram Authoring Cards -->
	<section class="uml-cards-section" aria-label="Generated UML Diagrams">
		<div class="uml-section-title-row">
			<h3>3. Diagram Authoring Workspace ({diagrams.length} evaluated)</h3>
			<span class="uml-subtitle-note">
				Edit PlantUML in the Source tab to update any diagram immediately without another AI call.
			</span>
		</div>

		<div class="uml-cards-stack">
			{#each diagrams as diagram (diagram.id)}
				{@const meta = getUmlDiagramMeta(diagram.type)}
				{@const currentTab = getTab(diagram.id)}
				{@const zoom = getZoom(diagram.id)}
				{@const highlightedLines = highlightPlantUmlSource(diagram.sourceCode)}

				<article class="uml-card" data-diagram-type={diagram.type}>
					<header class="uml-card-header">
						<div class="uml-card-title-group">
							<div class="uml-card-badges">
								<span class="uml-badge-num">#{meta.number}</span>
								<span class="uml-badge-family">{meta.familyBadge}</span>
								<span class="uml-badge-type">{meta.label}</span>
								{#if diagram.isConceptual}
									<span class="uml-badge-conceptual">Conceptual Model</span>
								{/if}
								<span class="uml-badge-prov">
									{diagram.provenance === 'ai'
										? 'AI Provider'
										: diagram.provenance === 'edited'
											? 'Edited PlantUML'
											: 'Local Deterministic'}
								</span>
							</div>
							<h4 class="uml-card-title">{diagram.title}</h4>
							<p class="uml-card-explanation">{diagram.explanation}</p>
						</div>

						<div class="uml-card-status-group">
							<span
								class="uml-status-pill"
								class:ok={diagram.generationStatus === 'generated' &&
									diagram.renderStatus === 'rendered'}
								class:warn={diagram.generationStatus === 'needs_more_info' ||
									diagram.generationStatus === 'not_applicable'}
								class:err={diagram.renderStatus === 'error' ||
									diagram.generationStatus === 'failed'}
							>
								{#if diagram.generationStatus === 'needs_more_info'}
									Needs more information
								{:else if diagram.generationStatus === 'not_applicable'}
									Not applicable
								{:else if diagram.renderStatus === 'error'}
									Syntax / Render error
								{:else if diagram.validationStatus === 'repaired'}
									Rendered (auto-repaired)
								{:else}
									Rendered SVG
								{/if}
							</span>

							<button
								type="button"
								class="uml-btn-xs"
								onclick={() => regenerateSingleDiagram(diagram.type)}
							>
								Regenerate this diagram
							</button>
						</div>
					</header>

					{#if diagram.generationStatus === 'needs_more_info' || diagram.generationStatus === 'not_applicable'}
						<div class="uml-missing-box" role="note">
							<p class="uml-missing-reason">
								<strong>Why {meta.label} was not forced:</strong>
								{diagram.statusReason}
							</p>
							{#if diagram.missingInformation.length > 0}
								<ul class="uml-missing-list">
									{#each diagram.missingInformation as info (info)}
										<li>{info}</li>
									{/each}
								</ul>
							{/if}
							<p class="uml-missing-disambig">
								<em>UML distinction:</em>
								{meta.disambiguationNote}
							</p>
						</div>
					{:else}
						<!-- Card Navigation Tabs & Actions -->
						<div class="uml-card-toolbar">
							<div class="uml-card-tabs" role="tablist" aria-label="{meta.label} view tabs">
								<button
									type="button"
									role="tab"
									aria-selected={currentTab === 'preview'}
									class="uml-tab-btn"
									class:active={currentTab === 'preview'}
									onclick={() => setTab(diagram.id, 'preview')}
								>
									Preview
								</button>
								<button
									type="button"
									role="tab"
									aria-selected={currentTab === 'source'}
									class="uml-tab-btn"
									class:active={currentTab === 'source'}
									onclick={() => setTab(diagram.id, 'source')}
								>
									Source (.puml)
								</button>
								<button
									type="button"
									role="tab"
									aria-selected={currentTab === 'evidence'}
									class="uml-tab-btn"
									class:active={currentTab === 'evidence'}
									onclick={() => setTab(diagram.id, 'evidence')}
								>
									Evidence &amp; Notes ({diagram.supportingReferences.length})
								</button>
								<button
									type="button"
									role="tab"
									aria-selected={currentTab === 'legend'}
									class="uml-tab-btn"
									class:active={currentTab === 'legend'}
									onclick={() => setTab(diagram.id, 'legend')}
								>
									UML Legend
								</button>
							</div>

							<div class="uml-card-actions">
								<button
									type="button"
									class="uml-btn-xs"
									onclick={() => copyText(`${diagram.id}-puml`, diagram.sourceCode, 'Copied .puml')}
								>
									{copiedFeedback[`${diagram.id}-puml`] || 'Copy .puml'}
								</button>
								<button
									type="button"
									class="uml-btn-xs"
									onclick={() => downloadDiagramPuml(diagram)}
								>
									Download .puml
								</button>
								<button
									type="button"
									class="uml-btn-xs"
									onclick={() => downloadDiagramSvg(diagram)}
								>
									Download SVG
								</button>
								<button
									type="button"
									class="uml-btn-xs"
									onclick={() => downloadDiagramPng(diagram)}
								>
									Download PNG
								</button>
								<button
									type="button"
									class="uml-btn-xs"
									onclick={() =>
										copyText(
											`${diagram.id}-embed`,
											buildSingleDiagramBlogEmbed(diagram, effectiveSlug),
											'Copied embed'
										)}
								>
									{copiedFeedback[`${diagram.id}-embed`] || 'Copy blog embed'}
								</button>
							</div>
						</div>

						{#if diagram.renderStatus === 'error' && diagram.renderError}
							<div class="uml-render-error-banner" role="alert">
								<strong>PlantUML Validation Error:</strong>
								{diagram.renderError}
								{#if diagram.lastValidSvg}
									<span>
										— Retaining your editable code in the Source tab and marking the preview below
										as the <strong>last successful version</strong>.
									</span>
								{/if}
							</div>
						{/if}

						{#if currentTab === 'preview'}
							<div class="uml-preview-controls">
								<div class="uml-zoom-controls">
									<button
										type="button"
										class="uml-btn-xs"
										aria-label="Zoom out"
										onclick={() => adjustZoom(diagram.id, -15)}
									>
										−
									</button>
									<span class="uml-zoom-readout">{zoom}%</span>
									<button
										type="button"
										class="uml-btn-xs"
										aria-label="Zoom in"
										onclick={() => adjustZoom(diagram.id, 15)}
									>
										+
									</button>
									<button type="button" class="uml-btn-xs" onclick={() => resetZoom(diagram.id)}>
										Fit to view
									</button>
									<button type="button" class="uml-btn-xs" onclick={() => openFullscreen(diagram)}>
										Fullscreen
									</button>
								</div>
								{#if diagram.renderStatus === 'error' && diagram.lastValidSvg}
									<span class="uml-stale-badge">Showing last valid version before syntax error</span
									>
								{/if}
							</div>

							<div class="uml-svg-viewport" class:stale={diagram.renderStatus === 'error'}>
								{#if diagram.svg || diagram.lastValidSvg}
									<div
										class="uml-svg-scaler"
										style="transform: scale({zoom / 100}); transform-origin: top center;"
									>
										<!-- eslint-disable-next-line svelte/no-at-html-tags -->
										{@html diagram.svg || diagram.lastValidSvg}
									</div>
								{:else}
									<p class="uml-empty-render">
										No valid SVG available yet. Fix syntax in the Source tab.
									</p>
								{/if}
							</div>

							<footer class="uml-card-caption-bar">
								<p><strong>Published Caption:</strong> {diagram.caption}</p>
								{#if diagram.assumptions.length > 0}
									<p class="uml-assumption-line">
										<strong>Explicit Illustrative Assumptions:</strong>
										{diagram.assumptions.join(' ')}
									</p>
								{/if}
								{#if diagram.notationLimitations.length > 0}
									<p class="uml-limitation-line">
										<strong>Renderer Notation Note:</strong>
										{diagram.notationLimitations.join(' ')}
									</p>
								{/if}
							</footer>
						{:else if currentTab === 'source'}
							<div class="uml-editor-grid">
								<label class="uml-editor-pane">
									<span class="uml-label">
										Editable PlantUML Source (updates preview live without AI calls)
									</span>
									<textarea
										class="uml-code-textarea"
										rows="14"
										spellcheck="false"
										value={diagram.sourceCode}
										oninput={(e) =>
											handleSourceCodeEdit(
												diagram.id,
												(e.currentTarget as HTMLTextAreaElement).value
											)}
									></textarea>
								</label>

								<div class="uml-highlight-pane" aria-label="Syntax-highlighted PlantUML view">
									<span class="uml-label">Syntax Highlighted View</span>
									<div class="uml-highlight-box">
										{#each highlightedLines as line (line.lineNumber)}
											<div class="uml-hl-line" class:err-line={line.hasError}>
												<span class="uml-hl-num">{line.lineNumber}</span>
												<!-- eslint-disable-next-line svelte/no-at-html-tags -->
												<span class="uml-hl-code">{@html line.html}</span>
											</div>
										{/each}
									</div>
								</div>
							</div>
						{:else if currentTab === 'evidence'}
							<div class="uml-evidence-pane">
								<h5>Supporting Source Passages from Article</h5>
								{#if diagram.supportingReferences.length > 0}
									<ul class="uml-evidence-list">
										{#each diagram.supportingReferences as ref (ref.id)}
											<li>
												<span class="uml-ref-badge">Paragraph {ref.paragraphIndex}</span>
												<strong>{ref.elementLabel}:</strong>
												<blockquote>“{ref.quote}”</blockquote>
											</li>
										{/each}
									</ul>
								{:else}
									<p>Derived from the shared article model.</p>
								{/if}

								{#if diagram.assumptions.length > 0}
									<h5>Explicit Illustrative Assumptions</h5>
									<ul class="uml-compact-list">
										{#each diagram.assumptions as assumption (assumption)}
											<li>{assumption}</li>
										{/each}
									</ul>
								{/if}

								{#if diagram.notationLimitations.length > 0}
									<h5>Renderer Notation &amp; Approximation Notes</h5>
									<ul class="uml-compact-list">
										{#each diagram.notationLimitations as lim (lim)}
											<li>{lim}</li>
										{/each}
									</ul>
								{/if}
							</div>
						{:else if currentTab === 'legend'}
							<div class="uml-legend-pane">
								<p class="uml-legend-intro">
									<strong>{meta.label} ({meta.familyBadge}):</strong>
									{meta.disambiguationNote}
								</p>
								<div class="uml-legend-grid">
									{#each meta.legend as sym (sym.label)}
										<div class="uml-legend-item">
											<code class="uml-legend-symbol">{sym.symbol}</code>
											<div>
												<strong>{sym.label}</strong>
												<p>{sym.meaning}</p>
											</div>
										</div>
									{/each}
								</div>
							</div>
						{/if}
					{/if}
				</article>
			{/each}
		</div>
	</section>

	<!-- Step 4: Reader-Facing Article Preview & Blog Export -->
	<section class="uml-article-preview-section" aria-label="Article Preview and Blog Export">
		<div class="uml-panel-header">
			<div>
				<h3>4. Reader-Facing Article Preview &amp; Blog Export</h3>
				<p class="uml-subtitle-note">
					Strict reader order: <strong
						>Original article text → rendered UML figure → explanatory caption</strong
					>. Editable source stays in the authoring tabs above and is offered as an optional
					disclosure below.
				</p>
			</div>

			<div class="uml-export-buttons">
				<button
					type="button"
					class="uml-btn uml-btn-secondary"
					onclick={() => copyText('section-embed', sectionBlogEmbedCode, 'Copied mdsvex embed!')}
				>
					{copiedFeedback['section-embed'] || 'Copy Blog Embed (mdsvex)'}
				</button>
				<button
					type="button"
					class="uml-btn uml-btn-secondary"
					onclick={() =>
						downloadTextFile(
							`${effectiveSlug}-with-uml.md`,
							buildFullPostWithUmlMarkdown(inputText, diagrams, effectiveSlug),
							'text/markdown;charset=utf-8'
						)}
				>
					Download Post + UML (.md)
				</button>
				<button type="button" class="uml-btn uml-btn-primary" onclick={downloadFullZipBundle}>
					Export Asset &amp; Embed Bundle (.zip)
				</button>
			</div>
		</div>

		<div class="uml-reader-preview-frame">
			<!-- 1. Original Article Text First -->
			<article class="uml-reader-prose">
				{#if articleTitle}
					<h2 class="uml-reader-title">{articleTitle}</h2>
				{/if}
				<!-- eslint-disable-next-line svelte/no-at-html-tags -->
				{@html safeArticleHtml}
			</article>

			<hr class="uml-reader-divider" />

			<!-- 2. Rendered UML Figures + 3. Explanatory Captions After the Article -->
			<section class="uml-reader-figures" aria-label="Appended UML Diagram Section">
				<h3 class="uml-reader-section-heading">Architectural &amp; Conceptual UML Diagrams</h3>
				{#if renderedDiagrams.length === 0}
					<p class="uml-preview-empty">
						No rendered UML diagrams to append yet. Generate or select supported diagram types
						above.
					</p>
				{:else}
					{#each renderedDiagrams as d (d.id)}
						{@const meta = getUmlDiagramMeta(d.type)}
						<UmlFigure
							src=""
							sourceHref=""
							diagramType={d.type}
							family={meta.familyBadge}
							title={d.title}
							alt={d.altText || d.title}
							caption={d.caption || d.explanation}
							conceptual={d.isConceptual}
							assumptions={d.assumptions.join(' ')}
							notationNote={d.notationLimitations[0] || ''}
							sourceCode={d.lastValidSourceCode || d.sourceCode}
						/>
					{/each}
				{/if}
			</section>
		</div>

		<details class="uml-embed-code-disclosure">
			<summary>Inspect generated mdsvex blog embed snippet &amp; repository asset paths</summary>
			<p class="uml-meta-note">
				Unpack the exported <code>.zip</code> into the repository root so static SVG files land in
				<code>static/images/uml/{effectiveSlug}/</code> and PlantUML sources land in
				<code>static/uml/{effectiveSlug}/</code>, then paste the snippet below at the end of
				<code>src/lib/posts/{effectiveSlug}.md</code>:
			</p>
			<pre class="uml-embed-pre"><code>{sectionBlogEmbedCode}</code></pre>
		</details>
	</section>

	<!-- Fullscreen Modal Dialog -->
	<dialog
		bind:this={fullscreenDialogEl}
		class="uml-fullscreen-dialog"
		onclose={() => (fullscreenDiagram = null)}
	>
		{#if fullscreenDiagram}
			<div class="uml-fullscreen-inner">
				<header class="uml-fullscreen-bar">
					<div>
						<strong>{fullscreenDiagram.title}</strong>
						<span>({getUmlDiagramMeta(fullscreenDiagram.type).label})</span>
					</div>
					<button type="button" class="uml-btn uml-btn-secondary" onclick={closeFullscreen}>
						Close Fullscreen
					</button>
				</header>
				<div class="uml-fullscreen-body">
					<!-- eslint-disable-next-line svelte/no-at-html-tags -->
					{@html fullscreenDiagram.svg || fullscreenDiagram.lastValidSvg || ''}
				</div>
				<p class="uml-fullscreen-caption">{fullscreenDiagram.caption}</p>
			</div>
		{/if}
	</dialog>
</section>

<style>
	.uml-studio {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
		margin: 1rem 0 2.5rem;
		color: var(--color-text, #0f172a);
	}

	:global(.dark) .uml-studio {
		color: #f1f5f9;
	}

	.uml-studio-header {
		padding: 1.25rem 1.5rem;
		border-radius: 0.85rem;
		border: 1px solid rgba(148, 163, 184, 0.35);
		background: linear-gradient(135deg, rgba(248, 250, 252, 0.96), rgba(241, 245, 249, 0.88));
	}

	:global(.dark) .uml-studio-header {
		background: linear-gradient(135deg, rgba(15, 23, 42, 0.95), rgba(30, 41, 59, 0.9));
		border-color: rgba(148, 163, 184, 0.22);
	}

	.uml-studio-kicker {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-bottom: 0.6rem;
	}

	.uml-pill-accent {
		font-size: 0.75rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		padding: 0.2rem 0.65rem;
		border-radius: 999px;
		background: #1d4ed8;
		color: #ffffff;
	}

	.uml-pill-muted {
		font-size: 0.75rem;
		font-weight: 600;
		padding: 0.2rem 0.65rem;
		border-radius: 999px;
		background: rgba(148, 163, 184, 0.2);
	}

	.uml-studio-heading {
		margin: 0 0 0.45rem;
		font-size: 1.55rem;
		line-height: 1.25;
	}

	.uml-studio-sub {
		margin: 0;
		font-size: 0.95rem;
		line-height: 1.55;
		opacity: 0.9;
	}

	.uml-panel {
		padding: 1.25rem 1.4rem;
		border-radius: 0.85rem;
		border: 1px solid rgba(148, 163, 184, 0.35);
		background: var(--color-surface, #ffffff);
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	:global(.dark) .uml-panel {
		background: #0f172a;
		border-color: rgba(148, 163, 184, 0.22);
	}

	.uml-panel-header {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
	}

	.uml-panel-header h3 {
		margin: 0;
		font-size: 1.12rem;
	}

	.uml-sample-bar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.4rem;
	}

	.uml-sample-label {
		font-size: 0.8rem;
		font-weight: 600;
		opacity: 0.8;
	}

	.uml-chip-btn {
		font-size: 0.78rem;
		font-weight: 600;
		padding: 0.3rem 0.7rem;
		border-radius: 999px;
		border: 1px solid rgba(100, 116, 139, 0.4);
		background: transparent;
		color: inherit;
		cursor: pointer;
	}

	.uml-chip-btn.active {
		background: #1d4ed8;
		color: #ffffff;
		border-color: #1d4ed8;
	}

	.uml-loader-row,
	.uml-title-row {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		gap: 0.75rem;
	}

	.uml-field-grow {
		flex: 1 1 280px;
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}

	.uml-field-slug {
		flex: 0 1 220px;
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}

	.uml-label {
		font-size: 0.82rem;
		font-weight: 700;
	}

	.uml-input,
	.uml-select,
	.uml-textarea {
		width: 100%;
		padding: 0.55rem 0.75rem;
		border-radius: 0.5rem;
		border: 1px solid rgba(100, 116, 139, 0.45);
		background: rgba(248, 250, 252, 0.9);
		color: inherit;
		font-size: 0.9rem;
		font-family: inherit;
	}

	:global(.dark) .uml-input,
	:global(.dark) .uml-select,
	:global(.dark) .uml-textarea {
		background: #1e293b;
		border-color: rgba(148, 163, 184, 0.3);
		color: #f8fafc;
	}

	.uml-textarea-wrap {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}

	.uml-textarea-meta {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 0.5rem;
	}

	.uml-counter {
		font-size: 0.78rem;
		opacity: 0.75;
	}

	.uml-textarea {
		line-height: 1.55;
		resize: vertical;
	}

	.uml-controls-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(290px, 1fr));
		gap: 1rem;
	}

	.uml-fieldset {
		border: 1px solid rgba(148, 163, 184, 0.3);
		border-radius: 0.65rem;
		padding: 0.75rem 0.9rem;
		margin: 0;
	}

	.uml-segmented {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
		gap: 0.5rem;
	}

	.uml-seg-btn {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.15rem;
		padding: 0.55rem 0.7rem;
		border-radius: 0.5rem;
		border: 1px solid rgba(100, 116, 139, 0.35);
		background: transparent;
		color: inherit;
		text-align: left;
		cursor: pointer;
		font-size: 0.82rem;
	}

	.uml-seg-btn span {
		font-size: 0.73rem;
		opacity: 0.8;
	}

	.uml-seg-btn.active {
		border-color: #1d4ed8;
		background: rgba(29, 78, 216, 0.1);
	}

	.uml-options-stack {
		display: flex;
		flex-direction: column;
		gap: 0.65rem;
	}

	.uml-inline-radios {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.uml-radio-pill {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		font-size: 0.82rem;
		font-weight: 600;
		padding: 0.35rem 0.7rem;
		border-radius: 999px;
		border: 1px solid rgba(100, 116, 139, 0.4);
		cursor: pointer;
	}

	.uml-radio-pill.active {
		border-color: #1d4ed8;
		background: rgba(29, 78, 216, 0.12);
	}

	.uml-checkbox-row {
		display: flex;
		align-items: flex-start;
		gap: 0.5rem;
		font-size: 0.83rem;
		line-height: 1.45;
		cursor: pointer;
	}

	.uml-family-tabs {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
		gap: 0.6rem;
	}

	.uml-family-tab-card {
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		gap: 0.4rem;
		padding: 0.65rem 0.8rem;
		border-radius: 0.6rem;
		border: 1px solid rgba(148, 163, 184, 0.35);
	}

	.uml-family-tab-card.active {
		border-color: #1d4ed8;
		background: rgba(29, 78, 216, 0.08);
	}

	.uml-family-tab-btn {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.2rem;
		background: transparent;
		border: none;
		padding: 0;
		color: inherit;
		text-align: left;
		cursor: pointer;
		font-size: 0.85rem;
	}

	.uml-family-tab-btn span {
		font-size: 0.74rem;
		opacity: 0.82;
		line-height: 1.35;
	}

	.uml-family-select-btn {
		align-self: flex-start;
		font-size: 0.72rem;
		font-weight: 700;
		padding: 0.2rem 0.55rem;
		border-radius: 0.35rem;
		border: 1px solid rgba(100, 116, 139, 0.4);
		background: transparent;
		color: inherit;
		cursor: pointer;
	}

	.uml-type-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
		gap: 0.6rem;
	}

	.uml-type-card {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		padding: 0.65rem 0.75rem;
		border-radius: 0.55rem;
		border: 1px solid rgba(148, 163, 184, 0.32);
		cursor: pointer;
		font-size: 0.82rem;
	}

	.uml-type-card.checked {
		border-color: #1d4ed8;
		background: rgba(29, 78, 216, 0.07);
	}

	.uml-type-card-top {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		flex-wrap: wrap;
	}

	.uml-type-num {
		font-size: 0.72rem;
		font-weight: 700;
		opacity: 0.7;
	}

	.uml-type-title {
		font-size: 0.85rem;
	}

	.uml-badge-mini {
		margin-left: auto;
		font-size: 0.66rem;
		font-weight: 600;
		padding: 0.1rem 0.4rem;
		border-radius: 999px;
		background: rgba(148, 163, 184, 0.22);
	}

	.uml-type-desc {
		margin: 0;
		font-size: 0.75rem;
		line-height: 1.38;
		opacity: 0.85;
	}

	.uml-action-bar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.85rem;
		padding-top: 0.5rem;
		border-top: 1px solid rgba(148, 163, 184, 0.25);
	}

	.uml-engine-box,
	.uml-cta-buttons,
	.uml-export-buttons {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
	}

	.uml-btn {
		font-size: 0.86rem;
		font-weight: 700;
		padding: 0.55rem 1rem;
		border-radius: 0.5rem;
		cursor: pointer;
		border: 1px solid transparent;
	}

	.uml-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.uml-btn-primary {
		background: #1d4ed8;
		color: #ffffff;
	}

	.uml-btn-secondary {
		background: transparent;
		border-color: rgba(100, 116, 139, 0.45);
		color: inherit;
	}

	.uml-btn-xs {
		font-size: 0.75rem;
		font-weight: 600;
		padding: 0.28rem 0.6rem;
		border-radius: 0.375rem;
		border: 1px solid rgba(100, 116, 139, 0.4);
		background: transparent;
		color: inherit;
		cursor: pointer;
	}

	.uml-ai-notice,
	.uml-info-note,
	.uml-status-banner,
	.uml-warning-banner {
		padding: 0.65rem 0.85rem;
		border-radius: 0.5rem;
		font-size: 0.84rem;
		background: rgba(59, 130, 246, 0.1);
		border: 1px solid rgba(59, 130, 246, 0.3);
		margin: 0;
	}

	.uml-error-banner,
	.uml-render-error-banner {
		padding: 0.65rem 0.85rem;
		border-radius: 0.5rem;
		font-size: 0.84rem;
		background: rgba(239, 68, 68, 0.12);
		border: 1px solid rgba(239, 68, 68, 0.4);
		color: #b91c1c;
		margin: 0;
	}

	:global(.dark) .uml-error-banner,
	:global(.dark) .uml-render-error-banner {
		color: #fca5a5;
	}

	.uml-summary-strip {
		padding: 1rem 1.25rem;
		border-radius: 0.75rem;
		border: 1px solid rgba(148, 163, 184, 0.35);
		background: rgba(248, 250, 252, 0.8);
		display: flex;
		flex-direction: column;
		gap: 0.65rem;
	}

	:global(.dark) .uml-summary-strip {
		background: rgba(15, 23, 42, 0.8);
	}

	.uml-summary-text,
	.uml-summary-rationale {
		margin: 0.3rem 0 0;
		font-size: 0.86rem;
		line-height: 1.5;
	}

	.uml-badge-domain {
		display: inline-block;
		font-size: 0.74rem;
		font-weight: 700;
		padding: 0.18rem 0.55rem;
		border-radius: 999px;
		background: #fef3c7;
		color: #92400e;
	}

	.uml-matrix-disclosure summary {
		cursor: pointer;
		font-size: 0.84rem;
		font-weight: 700;
	}

	.uml-matrix-grid {
		display: grid;
		grid-template-columns: 1fr;
		gap: 1rem;
		margin-top: 0.75rem;
	}

	.uml-table-scroll {
		overflow-x: auto;
	}

	.uml-cap-table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.78rem;
	}

	.uml-cap-table th,
	.uml-cap-table td {
		padding: 0.4rem 0.55rem;
		border-bottom: 1px solid rgba(148, 163, 184, 0.25);
		text-align: left;
	}

	.uml-support-pill {
		display: inline-block;
		padding: 0.1rem 0.45rem;
		border-radius: 999px;
		font-weight: 700;
		font-size: 0.7rem;
		background: #dcfce7;
		color: #166534;
	}

	.uml-support-pill.composed {
		background: #dbeafe;
		color: #1e40af;
	}

	.uml-cards-section {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.uml-section-title-row {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		align-items: baseline;
		gap: 0.5rem;
	}

	.uml-section-title-row h3 {
		margin: 0;
	}

	.uml-subtitle-note {
		font-size: 0.82rem;
		opacity: 0.8;
		margin: 0;
	}

	.uml-cards-stack {
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
	}

	.uml-card {
		border-radius: 0.85rem;
		border: 1px solid rgba(148, 163, 184, 0.38);
		background: var(--color-surface, #ffffff);
		overflow: hidden;
	}

	:global(.dark) .uml-card {
		background: #0f172a;
		border-color: rgba(148, 163, 184, 0.24);
	}

	.uml-card-header {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		align-items: flex-start;
		gap: 0.75rem;
		padding: 1rem 1.2rem;
		border-bottom: 1px solid rgba(148, 163, 184, 0.25);
		background: rgba(248, 250, 252, 0.7);
	}

	:global(.dark) .uml-card-header {
		background: rgba(30, 41, 59, 0.55);
	}

	.uml-card-badges {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
		margin-bottom: 0.35rem;
	}

	.uml-badge-num,
	.uml-badge-family,
	.uml-badge-type,
	.uml-badge-conceptual,
	.uml-badge-prov {
		font-size: 0.7rem;
		font-weight: 700;
		padding: 0.14rem 0.5rem;
		border-radius: 999px;
	}

	.uml-badge-num {
		background: #0f172a;
		color: #ffffff;
	}

	.uml-badge-family {
		background: #e2e8f0;
		color: #1e293b;
	}

	.uml-badge-type {
		background: #dbeafe;
		color: #1e40af;
	}

	.uml-badge-conceptual {
		background: #fef3c7;
		color: #92400e;
	}

	.uml-badge-prov {
		background: rgba(148, 163, 184, 0.22);
	}

	.uml-card-title {
		margin: 0 0 0.25rem;
		font-size: 1.05rem;
	}

	.uml-card-explanation {
		margin: 0;
		font-size: 0.85rem;
		opacity: 0.88;
	}

	.uml-card-status-group {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
	}

	.uml-status-pill {
		font-size: 0.74rem;
		font-weight: 700;
		padding: 0.2rem 0.6rem;
		border-radius: 999px;
	}

	.uml-status-pill.ok {
		background: #dcfce7;
		color: #166534;
	}

	.uml-status-pill.warn {
		background: #fef3c7;
		color: #92400e;
	}

	.uml-status-pill.err {
		background: #fee2e2;
		color: #991b1b;
	}

	.uml-missing-box {
		padding: 1rem 1.25rem;
		background: rgba(254, 243, 199, 0.22);
		font-size: 0.88rem;
		line-height: 1.5;
	}

	.uml-missing-reason {
		margin: 0 0 0.5rem;
	}

	.uml-missing-list {
		margin: 0 0 0.5rem 1.2rem;
	}

	.uml-missing-disambig {
		margin: 0;
		font-size: 0.82rem;
		opacity: 0.85;
	}

	.uml-card-toolbar {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		align-items: center;
		gap: 0.6rem;
		padding: 0.55rem 1rem;
		border-bottom: 1px solid rgba(148, 163, 184, 0.25);
	}

	.uml-card-tabs,
	.uml-card-actions,
	.uml-zoom-controls {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.35rem;
	}

	.uml-tab-btn {
		font-size: 0.8rem;
		font-weight: 700;
		padding: 0.35rem 0.7rem;
		border-radius: 0.4rem;
		border: none;
		background: transparent;
		color: inherit;
		cursor: pointer;
	}

	.uml-tab-btn.active {
		background: #1d4ed8;
		color: #ffffff;
	}

	.uml-preview-controls {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		align-items: center;
		padding: 0.5rem 1rem;
		border-bottom: 1px solid rgba(148, 163, 184, 0.18);
		font-size: 0.78rem;
	}

	.uml-zoom-readout {
		font-weight: 700;
		min-width: 3rem;
		text-align: center;
	}

	.uml-stale-badge {
		font-weight: 700;
		color: #b45309;
	}

	.uml-svg-viewport {
		padding: 1rem;
		overflow: auto;
		display: flex;
		justify-content: center;
		background: #fcfbf8;
		min-height: 240px;
	}

	:global(.dark) .uml-svg-viewport {
		background: #0b1120;
	}

	.uml-svg-viewport.stale {
		outline: 2px dashed #f59e0b;
		outline-offset: -4px;
	}

	.uml-svg-scaler :global(svg) {
		max-width: 100%;
		height: auto;
		display: block;
	}

	.uml-card-caption-bar {
		padding: 0.75rem 1.15rem;
		border-top: 1px solid rgba(148, 163, 184, 0.25);
		font-size: 0.84rem;
		line-height: 1.5;
	}

	.uml-card-caption-bar p {
		margin: 0.2rem 0;
	}

	.uml-editor-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
		gap: 0.85rem;
		padding: 1rem;
	}

	.uml-editor-pane,
	.uml-highlight-pane {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}

	.uml-code-textarea {
		width: 100%;
		font-family: 'JetBrains Mono', 'Fira Code', monospace;
		font-size: 0.8rem;
		line-height: 1.5;
		padding: 0.75rem;
		border-radius: 0.5rem;
		border: 1px solid rgba(100, 116, 139, 0.45);
		background: #0f172a;
		color: #f8fafc;
		resize: vertical;
	}

	.uml-highlight-box {
		padding: 0.65rem 0.75rem;
		border-radius: 0.5rem;
		background: #0f172a;
		color: #e2e8f0;
		font-family: 'JetBrains Mono', 'Fira Code', monospace;
		font-size: 0.78rem;
		line-height: 1.5;
		overflow-x: auto;
		max-height: 340px;
	}

	.uml-hl-line {
		display: flex;
		gap: 0.75rem;
		white-space: pre;
	}

	.uml-hl-line.err-line {
		background: rgba(239, 68, 68, 0.28);
	}

	.uml-hl-num {
		opacity: 0.45;
		user-select: none;
		min-width: 1.8rem;
		text-align: right;
	}

	.uml-highlight-box :global(.puml-tok-directive) {
		color: #38bdf8;
		font-weight: 700;
	}
	.uml-highlight-box :global(.puml-tok-kw) {
		color: #c084fc;
		font-weight: 600;
	}
	.uml-highlight-box :global(.puml-tok-stereo) {
		color: #fbbf24;
	}
	.uml-highlight-box :global(.puml-tok-string) {
		color: #4ade80;
	}
	.uml-highlight-box :global(.puml-tok-comment) {
		color: #94a3b8;
		font-style: italic;
	}

	.uml-evidence-pane,
	.uml-legend-pane {
		padding: 1rem 1.2rem;
		font-size: 0.85rem;
	}

	.uml-evidence-pane h5 {
		margin: 0.5rem 0;
		font-size: 0.9rem;
	}

	.uml-evidence-list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.65rem;
	}

	.uml-evidence-list blockquote {
		margin: 0.25rem 0 0;
		padding-left: 0.75rem;
		border-left: 3px solid #1d4ed8;
		opacity: 0.9;
	}

	.uml-ref-badge {
		font-size: 0.72rem;
		font-weight: 700;
		padding: 0.1rem 0.45rem;
		border-radius: 0.3rem;
		background: #dbeafe;
		color: #1e40af;
		margin-right: 0.4rem;
	}

	.uml-legend-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
		gap: 0.75rem;
		margin-top: 0.75rem;
	}

	.uml-legend-item {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		padding: 0.65rem;
		border-radius: 0.5rem;
		border: 1px solid rgba(148, 163, 184, 0.28);
	}

	.uml-legend-item p {
		margin: 0.15rem 0 0;
		font-size: 0.78rem;
		opacity: 0.85;
	}

	.uml-legend-symbol {
		font-weight: 700;
		font-size: 0.8rem;
	}

	.uml-article-preview-section {
		padding: 1.35rem 1.5rem;
		border-radius: 0.85rem;
		border: 1px solid rgba(148, 163, 184, 0.38);
		background: var(--color-surface, #ffffff);
		display: flex;
		flex-direction: column;
		gap: 1.15rem;
	}

	:global(.dark) .uml-article-preview-section {
		background: #0f172a;
	}

	.uml-reader-preview-frame {
		padding: 1.5rem;
		border-radius: 0.75rem;
		border: 1px solid rgba(148, 163, 184, 0.28);
		background: rgba(252, 251, 248, 0.85);
	}

	:global(.dark) .uml-reader-preview-frame {
		background: rgba(15, 23, 42, 0.65);
	}

	.uml-reader-prose {
		line-height: 1.7;
		font-size: 0.96rem;
	}

	.uml-reader-title {
		margin-top: 0;
	}

	.uml-reader-divider {
		margin: 2rem 0;
		border: none;
		border-top: 1px solid rgba(148, 163, 184, 0.35);
	}

	.uml-embed-pre {
		padding: 0.85rem;
		border-radius: 0.5rem;
		background: #0f172a;
		color: #e2e8f0;
		font-size: 0.78rem;
		overflow-x: auto;
	}

	.uml-fullscreen-dialog {
		width: min(94vw, 1200px);
		max-height: 90vh;
		border-radius: 0.85rem;
		border: 1px solid rgba(148, 163, 184, 0.4);
		padding: 1.25rem;
		background: #fcfbf8;
		color: #0f172a;
	}

	.uml-fullscreen-bar {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 1rem;
		margin-bottom: 1rem;
	}

	.uml-fullscreen-body {
		overflow: auto;
		display: flex;
		justify-content: center;
	}
</style>
