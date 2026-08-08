<figure class="bz-diagram" aria-labelledby="bz-spiral-diagram-title">
	<svg
		viewBox="0 0 960 360"
		role="img"
		aria-labelledby="bz-spiral-diagram-title bz-spiral-diagram-description"
	>
		<title id="bz-spiral-diagram-title">How a broken excitation front curls into a spiral</title>
		<desc id="bz-spiral-diagram-description">
			Four schematic stages show a cyan excited front, its violet refractory wake, a free end, and
			the end curling around a recovered core. This is an explanatory diagram, not simulation data.
		</desc>
		<defs>
			<marker
				id="bz-arrow"
				viewBox="0 0 10 10"
				refX="8"
				refY="5"
				markerWidth="7"
				markerHeight="7"
				orient="auto-start-reverse"
			>
				<path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
			</marker>
			<linearGradient id="bz-panel" x1="0" x2="0" y1="0" y2="1">
				<stop offset="0" stop-color="#101d24" />
				<stop offset="1" stop-color="#071015" />
			</linearGradient>
		</defs>

		{#each [0, 1, 2, 3] as stage (stage)}
			<g transform={`translate(${18 + stage * 236} 28)`}>
				<rect width="214" height="252" rx="22" fill="url(#bz-panel)" stroke="#4c626d" />
				<circle cx="107" cy="126" r="93" fill="#0a151b" stroke="#78909b" stroke-width="2" />
				<text x="18" y="236" fill="#dceaf0" font-size="15" font-weight="700">
					{stage === 0
						? '1 · complete front'
						: stage === 1
							? '2 · make a cut'
							: stage === 2
								? '3 · free end turns'
								: '4 · rotating core'}
				</text>

				{#if stage === 0}
					<path
						d="M42 112 Q107 76 172 112"
						fill="none"
						stroke="#6de6ef"
						stroke-width="12"
						stroke-linecap="round"
					/>
					<path
						d="M48 135 Q107 102 166 135"
						fill="none"
						stroke="#9a76d7"
						stroke-width="18"
						stroke-linecap="round"
						opacity="0.72"
					/>
				{:else if stage === 1}
					<path
						d="M42 112 Q76 92 98 91"
						fill="none"
						stroke="#6de6ef"
						stroke-width="12"
						stroke-linecap="round"
					/>
					<path
						d="M126 92 Q145 96 172 112"
						fill="none"
						stroke="#6de6ef"
						stroke-width="12"
						stroke-linecap="round"
					/>
					<path
						d="M48 135 Q76 118 96 116"
						fill="none"
						stroke="#9a76d7"
						stroke-width="18"
						stroke-linecap="round"
						opacity="0.72"
					/>
					<path
						d="M128 116 Q148 120 166 135"
						fill="none"
						stroke="#9a76d7"
						stroke-width="18"
						stroke-linecap="round"
						opacity="0.72"
					/>
					<path d="M111 61 V139" stroke="#f5c66a" stroke-width="3" stroke-dasharray="6 6" />
					<text x="118" y="68" fill="#f5c66a" font-size="12">cut</text>
				{:else if stage === 2}
					<path
						d="M43 128 Q73 98 102 101 Q130 104 137 128 Q143 149 126 160"
						fill="none"
						stroke="#6de6ef"
						stroke-width="12"
						stroke-linecap="round"
					/>
					<path
						d="M48 151 Q78 122 99 126 Q116 128 117 143"
						fill="none"
						stroke="#9a76d7"
						stroke-width="18"
						stroke-linecap="round"
						opacity="0.72"
					/>
					<circle cx="127" cy="160" r="7" fill="#f5c66a" stroke="#fff4c7" stroke-width="2" />
					<text x="137" y="176" fill="#f5c66a" font-size="12">free end</text>
				{:else}
					<path
						d="M43 142 C49 88 124 74 159 108 C192 140 164 194 119 189 C84 185 72 146 91 125 C106 108 134 112 140 132"
						fill="none"
						stroke="#6de6ef"
						stroke-width="11"
						stroke-linecap="round"
					/>
					<path
						d="M54 162 C73 116 124 105 150 128 C169 146 151 177 123 170 C105 166 101 146 111 136"
						fill="none"
						stroke="#9a76d7"
						stroke-width="17"
						stroke-linecap="round"
						opacity="0.72"
					/>
					<circle cx="111" cy="136" r="7" fill="#f5c66a" stroke="#fff4c7" stroke-width="2" />
					<path
						d="M119 91 A51 51 0 0 1 163 141"
						fill="none"
						stroke="#f5c66a"
						stroke-width="3"
						marker-end="url(#bz-arrow)"
					/>
				{/if}
			</g>
		{/each}

		<g transform="translate(30 319)">
			<line x1="0" x2="28" stroke="#6de6ef" stroke-width="9" stroke-linecap="round" />
			<text x="38" y="5" fill="currentColor" font-size="14">excited front</text>
			<line
				x1="164"
				x2="192"
				stroke="#9a76d7"
				stroke-width="13"
				stroke-linecap="round"
				opacity="0.76"
			/>
			<text x="202" y="5" fill="currentColor" font-size="14">refractory wake</text>
			<circle cx="374" cy="0" r="6" fill="#f5c66a" />
			<text x="388" y="5" fill="currentColor" font-size="14">estimated free end / core</text>
		</g>
	</svg>
	<figcaption>
		A wave end does not rotate because the picture is twisted. Diffusion excites recovered medium
		beside the end while the refractory wake blocks the route behind it, so the advancing front
		continually bends around a core.
	</figcaption>
</figure>

<style>
	.bz-diagram {
		width: min(100%, 62rem);
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
		.bz-diagram {
			width: 100%;
			overflow-x: auto;
		}

		svg {
			min-width: 48rem;
		}
	}

	@media (forced-colors: active) {
		svg {
			border: 2px solid CanvasText;
		}
	}
</style>
