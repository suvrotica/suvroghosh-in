<script lang="ts">
	import { resolve } from '$app/paths';
	import { exploreTopicMap } from '$lib/attachments/topic-map-exploration';
	import { buildTopicMapModel } from '$lib/topics/topic-map';
	import type { TopicHeadquartersSummary } from '$lib/topics/types';

	let { topics }: { topics: readonly TopicHeadquartersSummary[] } = $props();

	const model = $derived(buildTopicMapModel(topics));
	const nodesBySlug = $derived(new Map(model.nodes.map((node) => [node.slug, node])));

	function nodeDescription(slug: string) {
		const node = nodesBySlug.get(slug);
		if (!node) return '';

		const relationshipCount = node.relatedNodeSlugs.length;
		const relationshipLabels = node.relatedNodeSlugs
			.map((relatedSlug) => nodesBySlug.get(relatedSlug)?.label)
			.filter((label): label is string => Boolean(label));
		const relationshipDescription =
			relationshipLabels.length > 0 ? ` Connected to ${relationshipLabels.join(', ')}.` : '';
		return `${node.title}, ${node.resourceCount} ${
			node.resourceCount === 1 ? 'resource' : 'resources'
		}, ${node.groupLabel}. ${relationshipCount} ${
			relationshipCount === 1 ? 'direct connection' : 'direct connections'
		}.${relationshipDescription}`;
	}
</script>

<section class="living-topic-map" data-living-topic-map aria-labelledby="living-topic-map-heading">
	<div class="living-topic-map__introduction">
		<p class="living-topic-map__eyebrow">The living archive</p>
		<h2 id="living-topic-map-heading">Explore the topic territories</h2>
		<p>
			Follow a headquarters or trace one of its direct editorial connections. The complete grouped
			directory remains below this map.
		</p>
	</div>

	<nav
		class="living-topic-map__desktop"
		data-topic-map-mode="desktop"
		aria-label="Explore Topic Headquarters as connected territories"
		{@attach exploreTopicMap}
	>
		<svg
			viewBox={`0 0 ${model.width} ${model.height}`}
			width={model.width}
			height={model.height}
			role="group"
			aria-labelledby="living-topic-map-title living-topic-map-description"
			preserveAspectRatio="xMidYMid meet"
		>
			<title id="living-topic-map-title">Topic Headquarters map</title>
			<desc id="living-topic-map-description">
				{model.nodes.length} linked Topic Headquarters grouped into {model.territories.length}
				editorial territories. Each topic is a normal link; focus or hover emphasises its direct relationships.
			</desc>

			<g class="living-topic-map__territories" aria-hidden="true">
				{#each model.territories as territory (territory.id)}
					<g data-topic-territory={territory.id}>
						<rect
							class="living-topic-map__territory-frame"
							x={territory.x}
							y={territory.y}
							width={territory.width}
							height={territory.height}
							rx="24"
						/>
						<text
							class="living-topic-map__territory-label"
							x={territory.x + 18}
							y={territory.y + 31}
						>
							{territory.label}
						</text>
					</g>
				{/each}
			</g>

			<g class="living-topic-map__connections" aria-hidden="true">
				{#each model.edges as edge, index (edge.id)}
					<path
						class:living-topic-map__edge--principal={edge.principal}
						class:living-topic-map__edge--one-way={!edge.reciprocal}
						class="living-topic-map__edge"
						data-topic-edge={edge.id}
						data-source={edge.sourceSlug}
						data-target={edge.targetSlug}
						data-state="idle"
						data-principal-route={edge.principal ? '' : undefined}
						d={edge.path}
						pathLength="1"
						style={`--topic-route-index: ${index}`}
					/>
				{/each}
			</g>

			<g class="living-topic-map__nodes">
				{#each model.nodes as node (node.slug)}
					<a
						href={resolve('/topics/[slug]', { slug: node.slug })}
						aria-label={nodeDescription(node.slug)}
						data-topic-node={node.slug}
						data-state="idle"
						data-importance={node.importance}
					>
						<rect
							class="living-topic-map__node-halo"
							x={node.x - node.width / 2 - 5}
							y={node.y - node.height / 2 - 5}
							width={node.width + 10}
							height={node.height + 10}
							rx="18"
							aria-hidden="true"
						/>
						<rect
							class="living-topic-map__node-frame"
							x={node.x - node.width / 2}
							y={node.y - node.height / 2}
							width={node.width}
							height={node.height}
							rx="14"
						/>
						<text
							class="living-topic-map__node-label"
							x={node.x}
							y={node.y - (node.labelLines.length === 1 ? 4 : 11)}
							text-anchor="middle"
						>
							{#each node.labelLines as line, lineIndex (`${node.slug}-${lineIndex}`)}
								<tspan x={node.x} dy={lineIndex === 0 ? 0 : 16}>{line}</tspan>
							{/each}
						</text>
						<text
							class="living-topic-map__node-count"
							x={node.x}
							y={node.y + (node.labelLines.length === 1 ? 19 : 24)}
							text-anchor="middle"
						>
							{node.resourceCount}
							{node.resourceCount === 1 ? 'resource' : 'resources'}
						</text>
					</a>
				{/each}
			</g>
		</svg>
	</nav>

	<nav
		class="living-topic-map__mobile"
		data-topic-map-mode="mobile"
		aria-label="Explore Topic Headquarters as a metro map"
	>
		<ol class="living-topic-map__metro-territories">
			{#each model.territories as territory (territory.id)}
				<li data-topic-territory={territory.id}>
					<h3>{territory.label}</h3>
					<ol class="living-topic-map__metro-stops">
						{#each territory.nodeSlugs as slug, stopIndex (slug)}
							{@const node = nodesBySlug.get(slug)}
							{#if node}
								<li style={`--topic-stop-step: ${stopIndex % 2}`}>
									<a
										href={resolve('/topics/[slug]', { slug: node.slug })}
										data-topic-map-stop={node.slug}
									>
										<span>{node.label}</span>
										<small>
											{node.resourceCount}
											{node.resourceCount === 1 ? 'resource' : 'resources'}
										</small>
									</a>
								</li>
							{/if}
						{/each}
					</ol>
				</li>
			{/each}
		</ol>
	</nav>
</section>

<style>
	.living-topic-map {
		position: relative;
		isolation: isolate;
		margin-block: 0 3rem;
		border: 1px solid var(--rule);
		border-radius: 1.25rem;
		background:
			linear-gradient(
				135deg,
				color-mix(in oklab, var(--paper-raised) 98%, transparent),
				color-mix(in oklab, var(--paper-soft) 84%, transparent)
			),
			var(--paper-raised);
		box-shadow: var(--shadow-overlay);
		overflow: clip;
	}

	.living-topic-map__introduction {
		max-width: 48rem;
		padding: clamp(1.25rem, 3vw, 2.25rem) clamp(1.25rem, 3.5vw, 2.75rem) 0;
	}

	.living-topic-map__eyebrow {
		margin: 0 0 0.45rem;
		color: var(--ink-faint);
		font-size: 0.75rem;
		font-weight: 700;
		letter-spacing: 0.16em;
		text-transform: uppercase;
	}

	.living-topic-map h2 {
		margin: 0;
		color: var(--ink);
		font-size: clamp(1.5rem, 3vw, 2rem);
		font-weight: 750;
		letter-spacing: -0.025em;
		line-height: 1.15;
	}

	.living-topic-map__introduction > p:last-child {
		margin: 0.75rem 0 0;
		color: var(--ink-muted);
		font-family: ui-serif, Georgia, Cambria, 'Times New Roman', Times, serif;
		font-size: 1rem;
		line-height: 1.65;
		text-align: left;
	}

	.living-topic-map__desktop {
		display: none;
		padding: 1rem clamp(1rem, 3vw, 2.5rem) 2.25rem;
	}

	.living-topic-map__desktop svg {
		display: block;
		width: 100%;
		max-width: 60rem;
		height: auto;
		margin-inline: auto;
		overflow: visible;
	}

	.living-topic-map__territory-frame {
		fill: color-mix(in oklab, var(--paper-soft) 74%, transparent);
		stroke: color-mix(in oklab, var(--rule) 78%, transparent);
		stroke-width: 1.25;
	}

	.living-topic-map__territory-label {
		fill: var(--ink-faint);
		font-family: ui-sans-serif, system-ui, sans-serif;
		font-size: 14px;
		font-weight: 750;
		letter-spacing: 0.035em;
	}

	.living-topic-map__edge {
		fill: none;
		stroke: color-mix(in oklab, var(--accent) 48%, var(--rule));
		stroke-linecap: round;
		stroke-width: 1.9;
		opacity: 0.54;
		pointer-events: none;
		transition:
			stroke-width var(--motion-fast) var(--ease-out-quart),
			opacity var(--motion-fast) var(--ease-out-quart);
	}

	.living-topic-map__edge--principal {
		stroke-width: 2.5;
		opacity: 0.72;
	}

	.living-topic-map__edge--one-way {
		stroke-dasharray: 0.045 0.025;
	}

	:global(.living-topic-map__edge[data-state='active']) {
		stroke: var(--accent);
		stroke-width: 4;
		opacity: 1;
	}

	:global(.living-topic-map__edge[data-state='muted']) {
		opacity: 0.14;
	}

	.living-topic-map__nodes a {
		color: var(--ink);
		cursor: pointer;
		text-decoration: none;
	}

	.living-topic-map__node-halo {
		fill: none;
		stroke: color-mix(in oklab, var(--accent) 42%, transparent);
		stroke-width: 1.5;
		opacity: 0;
		pointer-events: none;
		transition: opacity var(--motion-fast) var(--ease-out-quart);
	}

	.living-topic-map__nodes a[data-importance='major'] .living-topic-map__node-halo {
		opacity: 0.8;
	}

	.living-topic-map__nodes a[data-importance='standard'] .living-topic-map__node-halo {
		opacity: 0.35;
	}

	.living-topic-map__node-frame {
		fill: color-mix(in oklab, var(--paper-raised) 96%, transparent);
		stroke: var(--control-border);
		stroke-width: 1.75;
		transition:
			fill var(--motion-fast) var(--ease-out-quart),
			stroke-width var(--motion-fast) var(--ease-out-quart);
	}

	.living-topic-map__node-label,
	.living-topic-map__node-count {
		fill: var(--ink);
		font-family: ui-sans-serif, system-ui, sans-serif;
		pointer-events: none;
	}

	.living-topic-map__node-label {
		font-size: 14px;
		font-weight: 750;
	}

	.living-topic-map__node-count {
		fill: var(--ink-muted);
		font-size: 10.5px;
		font-weight: 650;
		letter-spacing: 0.02em;
	}

	.living-topic-map__nodes a:is(:hover, :focus-visible) .living-topic-map__node-frame,
	:global(a[data-topic-node][data-state='active']) .living-topic-map__node-frame {
		fill: color-mix(in oklab, var(--paper-raised) 82%, var(--accent));
		stroke: var(--focus);
		stroke-width: 4;
	}

	.living-topic-map__nodes a:is(:hover, :focus-visible) .living-topic-map__node-label,
	:global(a[data-topic-node][data-state='active']) .living-topic-map__node-label {
		font-weight: 850;
		text-decoration: underline;
	}

	:global(a[data-topic-node][data-state='related']) .living-topic-map__node-frame {
		stroke: var(--accent);
		stroke-width: 3;
	}

	:global(a[data-topic-node][data-state='muted']) .living-topic-map__node-frame {
		opacity: 0.62;
	}

	:global(a[data-topic-node][data-state='muted'])
		:is(.living-topic-map__node-label, .living-topic-map__node-count) {
		opacity: 0.72;
	}

	.living-topic-map__mobile {
		padding: 1.25rem;
	}

	.living-topic-map__metro-territories,
	.living-topic-map__metro-stops {
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.living-topic-map__metro-territories {
		display: grid;
		gap: 1.35rem;
	}

	.living-topic-map__metro-territories > li {
		position: relative;
		padding-left: 1.55rem;
	}

	.living-topic-map__metro-territories > li::before {
		position: absolute;
		inset: 0.35rem auto -1.7rem 0.35rem;
		width: 2px;
		background: color-mix(in oklab, var(--accent) 58%, var(--rule));
		content: '';
	}

	.living-topic-map__metro-territories > li:last-child::before {
		bottom: 1rem;
	}

	.living-topic-map__metro-territories h3 {
		position: relative;
		margin: 0 0 0.55rem;
		color: var(--ink-muted);
		font-size: 0.76rem;
		font-weight: 750;
		letter-spacing: 0.075em;
		line-height: 1.4;
		text-transform: uppercase;
	}

	.living-topic-map__metro-territories h3::before {
		position: absolute;
		top: 0.2rem;
		left: -1.55rem;
		width: 0.8rem;
		height: 0.8rem;
		border: 2px solid var(--accent);
		border-radius: 50%;
		background: var(--paper-raised);
		content: '';
	}

	.living-topic-map__metro-stops {
		display: grid;
		gap: 0.45rem;
	}

	.living-topic-map__metro-stops li {
		margin-left: calc(var(--topic-stop-step) * 0.75rem);
	}

	.living-topic-map__metro-stops a {
		display: flex;
		min-height: 44px;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		border: 1px solid var(--rule);
		border-radius: 0.7rem;
		background: color-mix(in oklab, var(--paper-raised) 94%, transparent);
		padding: 0.65rem 0.8rem;
		color: var(--ink);
		font-size: 0.92rem;
		font-weight: 750;
		line-height: 1.3;
		text-decoration: none;
	}

	.living-topic-map__metro-stops a:is(:hover, :focus-visible) {
		border-color: var(--focus);
		outline: 2px solid var(--focus);
		outline-offset: 2px;
		text-decoration: underline;
	}

	.living-topic-map__metro-stops small {
		flex: none;
		color: var(--ink-muted);
		font-size: 0.72rem;
		font-weight: 650;
		white-space: nowrap;
	}

	@media (min-width: 50rem) {
		.living-topic-map__desktop {
			display: block;
		}

		.living-topic-map__mobile {
			display: none;
		}
	}

	@media (scripting: enabled) and (prefers-reduced-motion: no-preference) {
		:global(html:not([data-motion='still'])) .living-topic-map__edge--principal {
			stroke-dasharray: 1;
			animation: living-topic-route-draw 720ms var(--ease-out-quart);
			animation-delay: calc(var(--topic-route-index) * 30ms);
			animation-iteration-count: 1;
		}
	}

	:global(html[data-motion='still']) .living-topic-map__edge,
	:global(html[data-motion='still']) .living-topic-map__node-frame,
	:global(html[data-motion='still']) .living-topic-map__node-halo {
		transition: none;
	}

	:global(html[data-theme='high-contrast']) .living-topic-map {
		border-width: 2px;
		background: var(--paper);
		box-shadow: none;
	}

	:global(html[data-theme='high-contrast']) .living-topic-map__territory-frame {
		fill: none;
		stroke-width: 2;
	}

	:global(html[data-theme='high-contrast']) .living-topic-map__edge {
		stroke: var(--ink);
		opacity: 0.48;
	}

	:global(html[data-theme='high-contrast']) .living-topic-map__node-frame,
	:global(html[data-theme='high-contrast']) .living-topic-map__metro-stops a {
		fill: var(--paper);
		border-width: 2px;
		stroke: var(--ink);
		stroke-width: 2;
	}

	@media (forced-colors: active) {
		.living-topic-map {
			border: 2px solid CanvasText;
			background: Canvas;
			box-shadow: none;
			forced-color-adjust: auto;
		}

		.living-topic-map__territory-frame,
		.living-topic-map__edge,
		.living-topic-map__node-halo {
			display: none;
		}

		.living-topic-map__territory-label,
		.living-topic-map__node-label,
		.living-topic-map__node-count {
			fill: CanvasText;
			opacity: 1;
		}

		.living-topic-map__node-frame {
			fill: Canvas;
			stroke: LinkText;
			stroke-width: 2;
		}

		.living-topic-map__nodes a:is(:hover, :focus-visible) .living-topic-map__node-frame {
			stroke: Highlight;
			stroke-width: 5;
		}

		.living-topic-map__metro-stops a {
			border: 2px solid LinkText;
			background: Canvas;
			color: LinkText;
		}
	}

	@media print {
		.living-topic-map {
			display: none !important;
		}
	}

	@keyframes living-topic-route-draw {
		from {
			stroke-dashoffset: 1;
		}

		to {
			stroke-dashoffset: 0;
		}
	}
</style>
