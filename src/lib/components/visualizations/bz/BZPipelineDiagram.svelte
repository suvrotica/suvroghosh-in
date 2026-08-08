<figure class="bz-pipeline" aria-labelledby="bz-pipeline-title">
	<svg
		viewBox="0 0 1040 330"
		role="img"
		aria-labelledby="bz-pipeline-title bz-pipeline-description"
	>
		<title id="bz-pipeline-title">One fixed Heun step on the graphics processor</title>
		<desc id="bz-pipeline-description">
			The current floating-point texture enters a predictor fragment-shader pass, the predictor
			texture and original texture enter a correction pass, the next texture becomes current by
			swapping references, and a separate display shader maps state to colour.
		</desc>
		<defs>
			<marker
				id="pipeline-arrow"
				viewBox="0 0 10 10"
				refX="8"
				refY="5"
				markerWidth="7"
				markerHeight="7"
				orient="auto-start-reverse"
			>
				<path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
			</marker>
			<linearGradient id="texture-fill" x1="0" x2="1" y1="0" y2="1">
				<stop offset="0" stop-color="#173d4b" />
				<stop offset="1" stop-color="#241d47" />
			</linearGradient>
		</defs>

		<rect x="18" y="36" width="1004" height="244" rx="28" fill="#071015" stroke="#526b76" />

		{#each [{ x: 48, title: 'current texture', note: 'u · v · mask', type: 'texture' }, { x: 242, title: 'predictor pass', note: 'k₁ = F(Xₙ)', type: 'pass' }, { x: 436, title: 'predictor texture', note: 'Xₙ + Δt k₁', type: 'texture' }, { x: 630, title: 'correction pass', note: '½(k₁ + k₂)', type: 'pass' }, { x: 824, title: 'next texture', note: 'Xₙ₊₁', type: 'texture' }] as node, index (node.title)}
			<g transform={`translate(${node.x} 84)`}>
				<rect
					width="150"
					height="112"
					rx="17"
					fill={node.type === 'texture' ? 'url(#texture-fill)' : '#302522'}
					stroke={node.type === 'texture' ? '#6de6ef' : '#f5c66a'}
					stroke-width="2"
				/>
				{#if node.type === 'texture'}
					<g opacity="0.38" stroke="#d7fbff">
						<path d="M15 32 H135 M15 54 H135 M15 76 H135" />
						<path d="M38 15 V91 M66 15 V91 M94 15 V91 M122 15 V91" />
					</g>
				{:else}
					<path d="M28 27 H122 L108 58 L122 88 H28 L42 58 Z" fill="#f5c66a" opacity="0.16" />
				{/if}
				<text x="75" y="132" text-anchor="middle" fill="#eef8fb" font-size="15" font-weight="700"
					>{node.title}</text
				>
				<text x="75" y="153" text-anchor="middle" fill="#abc0c9" font-size="13">{node.note}</text>
			</g>
			{#if index < 4}
				<path
					d={`M${node.x + 154} 140 H${node.x + 186}`}
					stroke="#f5c66a"
					stroke-width="3"
					marker-end="url(#pipeline-arrow)"
				/>
			{/if}
		{/each}

		<path
			d="M899 224 C899 268 123 268 123 215"
			fill="none"
			stroke="#9a76d7"
			stroke-width="3"
			marker-end="url(#pipeline-arrow)"
		/>
		<text x="511" y="264" text-anchor="middle" fill="#c9b8ed" font-size="14" font-weight="700"
			>swap references; no numerical resampling</text
		>

		<path
			d="M899 84 C899 48 944 48 944 69"
			fill="none"
			stroke="#6de6ef"
			stroke-width="3"
			marker-end="url(#pipeline-arrow)"
		/>
		<rect x="885" y="14" width="122" height="44" rx="12" fill="#10303b" stroke="#6de6ef" />
		<text x="946" y="34" text-anchor="middle" fill="#e8fbff" font-size="13" font-weight="700"
			>display shader</text
		>
		<text x="946" y="50" text-anchor="middle" fill="#b6dfe7" font-size="11">colour only</text>
	</svg>
	<figcaption>
		The graphics processor advances a floating-point field; it is not merely painting a stored
		picture. The display pass is deliberately separate, so changing palette cannot change the
		chemistry.
	</figcaption>
</figure>

<style>
	.bz-pipeline {
		width: min(100%, 65rem);
		margin: 2.25rem auto;
		color: var(--text-color, #1f2933);
	}

	svg {
		display: block;
		width: 100%;
		height: auto;
		border-radius: 1rem;
		background: #071015;
		box-shadow: 0 1.25rem 3rem rgb(2 8 12 / 22%);
	}

	figcaption {
		margin-top: 0.8rem;
		font-size: 0.92rem;
		line-height: 1.55;
		color: var(--muted-foreground, #5f6b73);
	}

	:global(html[data-theme='high-contrast']) svg {
		outline: 2px solid currentColor;
		box-shadow: none;
	}

	@media (max-width: 42rem) {
		.bz-pipeline {
			width: 100%;
			overflow-x: auto;
		}

		svg {
			min-width: 52rem;
		}
	}

	@media (forced-colors: active) {
		svg {
			border: 2px solid CanvasText;
		}
	}
</style>
