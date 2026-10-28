<script lang="ts">
	interface Props {
		src?: string;
		sourceHref?: string;
		diagramType?: string;
		family?: string;
		title?: string;
		alt: string;
		caption: string;
		conceptual?: boolean;
		assumptions?: string;
		notationNote?: string;
		sourceCode?: string;
	}

	let {
		src = '',
		sourceHref = '',
		diagramType = 'class',
		family = 'Structural',
		title = 'UML Diagram',
		alt,
		caption,
		conceptual = false,
		assumptions = '',
		notationNote = '',
		sourceCode = ''
	}: Props = $props();

	let imageLoadFailed = $state(false);
	let copiedSource = $state(false);

	$effect(() => {
		void src;
		imageLoadFailed = false;
	});

	async function copyPlantUml() {
		if (!sourceCode || typeof navigator === 'undefined' || !navigator.clipboard) return;
		await navigator.clipboard.writeText(sourceCode);
		copiedSource = true;
		setTimeout(() => {
			copiedSource = false;
		}, 1800);
	}

	function downloadPlantUml() {
		if (!sourceCode || typeof document === 'undefined') return;
		const blob = new Blob([sourceCode], { type: 'text/plain;charset=utf-8' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'diagram'}.puml`;
		a.click();
		URL.revokeObjectURL(url);
	}
</script>

<figure class="uml-blog-figure" aria-label={title}>
	<div class="uml-blog-header">
		<div class="uml-blog-badges">
			<span class="uml-badge uml-badge-family">{family}</span>
			<span class="uml-badge uml-badge-type">{diagramType}</span>
			{#if conceptual}
				<span class="uml-badge uml-badge-conceptual">Conceptual Model</span>
			{/if}
		</div>
		{#if title}
			<strong class="uml-blog-title">{title}</strong>
		{/if}
	</div>

	<div class="uml-blog-canvas">
		{#if src && !imageLoadFailed}
			<img
				{src}
				{alt}
				loading="lazy"
				decoding="async"
				class="uml-blog-img"
				onerror={() => {
					imageLoadFailed = true;
				}}
			/>
		{:else}
			<div class="uml-blog-missing" role="note">
				<p class="uml-missing-title">Diagram asset unavailable ({title})</p>
				<p class="uml-missing-alt">{alt}</p>
			</div>
		{/if}
	</div>

	<figcaption class="uml-blog-caption">
		<p class="uml-caption-main">{caption}</p>
		{#if assumptions}
			<p class="uml-caption-meta">
				<strong>Illustrative assumptions:</strong>
				{assumptions}
			</p>
		{/if}
		{#if notationNote}
			<p class="uml-caption-meta">
				<strong>Notation note:</strong>
				{notationNote}
			</p>
		{/if}

		{#if sourceCode || sourceHref}
			<details class="uml-source-disclosure">
				<summary>Inspect or download PlantUML source (.puml)</summary>
				<div class="uml-source-actions">
					{#if sourceCode}
						<button type="button" class="uml-btn-sm" onclick={copyPlantUml}>
							{copiedSource ? 'Copied .puml' : 'Copy PlantUML'}
						</button>
						<button type="button" class="uml-btn-sm" onclick={downloadPlantUml}>
							Download .puml
						</button>
					{/if}
					{#if sourceHref}
						<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
						<a href={sourceHref} download class="uml-btn-sm">Saved .puml file</a>
					{/if}
				</div>
				{#if sourceCode}
					<pre class="uml-source-pre"><code>{sourceCode}</code></pre>
				{/if}
			</details>
		{/if}
	</figcaption>
</figure>

<style>
	.uml-blog-figure {
		margin: 2rem 0;
		border: 1px solid var(--color-border, rgba(148, 163, 184, 0.35));
		border-radius: 0.75rem;
		background: var(--color-surface, #fcfbf8);
		overflow: hidden;
	}

	:global(.dark) .uml-blog-figure {
		background: #111827;
		border-color: rgba(148, 163, 184, 0.22);
	}

	.uml-blog-header {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem 1rem;
		padding: 0.75rem 1rem;
		border-bottom: 1px solid rgba(148, 163, 184, 0.25);
		background: rgba(241, 245, 249, 0.65);
	}

	:global(.dark) .uml-blog-header {
		background: rgba(30, 41, 59, 0.65);
	}

	.uml-blog-badges {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
	}

	.uml-badge {
		font-size: 0.72rem;
		font-weight: 600;
		padding: 0.15rem 0.5rem;
		border-radius: 999px;
		text-transform: uppercase;
		letter-spacing: 0.03em;
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

	.uml-blog-title {
		font-size: 0.92rem;
		color: inherit;
	}

	.uml-blog-canvas {
		padding: 1rem;
		overflow-x: auto;
		display: flex;
		justify-content: center;
		background: #fcfbf8;
	}

	:global(.dark) .uml-blog-canvas {
		background: #0f172a;
	}

	.uml-blog-img {
		max-width: 100%;
		height: auto;
		display: block;
	}

	.uml-blog-missing {
		padding: 1.25rem;
		border: 1px dashed rgba(148, 163, 184, 0.5);
		border-radius: 0.5rem;
		text-align: left;
		width: 100%;
	}

	.uml-missing-title {
		font-weight: 600;
		margin: 0 0 0.35rem;
	}

	.uml-missing-alt {
		margin: 0;
		font-size: 0.9rem;
		opacity: 0.85;
	}

	.uml-blog-caption {
		padding: 0.85rem 1rem;
		border-top: 1px solid rgba(148, 163, 184, 0.25);
		font-size: 0.88rem;
		line-height: 1.55;
	}

	.uml-caption-main {
		margin: 0;
	}

	.uml-caption-meta {
		margin: 0.4rem 0 0;
		font-size: 0.82rem;
		opacity: 0.88;
	}

	.uml-source-disclosure {
		margin-top: 0.65rem;
		font-size: 0.82rem;
	}

	.uml-source-disclosure summary {
		cursor: pointer;
		font-weight: 600;
		user-select: none;
	}

	.uml-source-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin: 0.5rem 0;
	}

	.uml-btn-sm {
		font-size: 0.76rem;
		font-weight: 600;
		padding: 0.25rem 0.65rem;
		border-radius: 0.375rem;
		border: 1px solid rgba(100, 116, 139, 0.4);
		background: transparent;
		color: inherit;
		cursor: pointer;
		text-decoration: none;
	}

	.uml-source-pre {
		margin: 0.5rem 0 0;
		padding: 0.75rem;
		border-radius: 0.5rem;
		background: #0f172a;
		color: #e2e8f0;
		overflow-x: auto;
		font-size: 0.78rem;
		line-height: 1.45;
	}
</style>
