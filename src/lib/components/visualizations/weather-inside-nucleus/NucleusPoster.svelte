<script lang="ts">
	type PosterPhase = 'cell' | 'signal' | 'locus' | 'burst';
	type Props = {
		phase?: PosterPhase;
		decorative?: boolean;
		compact?: boolean;
	};

	let { phase = 'cell', decorative = false, compact = false }: Props = $props();

	let phaseIndex = $derived(['cell', 'signal', 'locus', 'burst'].indexOf(phase));
</script>

<svg
	class:compact
	class="nucleus-poster"
	viewBox="0 0 1200 630"
	role={decorative ? undefined : 'img'}
	aria-hidden={decorative ? 'true' : undefined}
	aria-labelledby={decorative ? undefined : 'wn-poster-title wn-poster-description'}
	preserveAspectRatio="xMidYMid slice"
>
	{#if !decorative}
		<title id="wn-poster-title"
			>Local activity changes precede a response at a synthetic locus inside a modeled nucleus</title
		>
		<desc id="wn-poster-description">
			An EGF ligand remains outside a cell membrane while separate cyan downstream-activity regions
			change before a response appears at a violet nucleus. Inside it, a triangular enhancer and
			ring-shaped promoter sometimes draw near; their dotted bridge means contact propensity, not a
			commanded physical link. Three warm marks show modeled transcription-initiation events.
		</desc>
	{/if}

	<defs>
		<radialGradient id="wn-bg" cx="68%" cy="42%" r="76%">
			<stop offset="0" stop-color="#151638" />
			<stop offset="0.52" stop-color="#080a1c" />
			<stop offset="1" stop-color="#04050e" />
		</radialGradient>
		<radialGradient id="wn-nucleus" cx="42%" cy="36%" r="70%">
			<stop offset="0" stop-color="#353263" stop-opacity="0.44" />
			<stop offset="0.65" stop-color="#15152f" stop-opacity="0.72" />
			<stop offset="1" stop-color="#080914" stop-opacity="0.92" />
		</radialGradient>
		<linearGradient id="wn-membrane" x1="0" x2="1">
			<stop offset="0" stop-color="#657390" stop-opacity="0.08" />
			<stop offset="0.5" stop-color="#b9c6dc" stop-opacity="0.72" />
			<stop offset="1" stop-color="#657390" stop-opacity="0.08" />
		</linearGradient>
		<linearGradient id="wn-signal" x1="0" x2="1">
			<stop offset="0" stop-color="#6ce5ff" stop-opacity="0.9" />
			<stop offset="1" stop-color="#6ce5ff" stop-opacity="0" />
		</linearGradient>
		<filter id="wn-soft-glow" x="-80%" y="-80%" width="260%" height="260%">
			<feGaussianBlur stdDeviation="9" result="blur" />
			<feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
		</filter>
		<filter id="wn-faint-glow" x="-80%" y="-80%" width="260%" height="260%">
			<feGaussianBlur stdDeviation="4" result="blur" />
			<feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
		</filter>
		<pattern id="wn-territory-pattern" width="18" height="18" patternUnits="userSpaceOnUse">
			<circle cx="4" cy="5" r="1.2" fill="#9d99c8" fill-opacity="0.22" />
			<circle cx="13" cy="12" r="0.8" fill="#9d99c8" fill-opacity="0.16" />
		</pattern>
	</defs>

	<rect width="1200" height="630" fill="url(#wn-bg)" />
	<path
		d="M0 535 C170 490 238 422 258 316 C280 202 235 102 118 42 L0 0 Z"
		fill="#18223a"
		fill-opacity="0.18"
		stroke="#7182a3"
		stroke-opacity="0.18"
		stroke-width="2"
	/>

	<!-- The ligand stays on the extracellular side of this double membrane. -->
	<path
		d="M257 20 C304 146 315 267 286 386 C271 449 241 507 196 575"
		fill="none"
		stroke="url(#wn-membrane)"
		stroke-width="8"
	/>
	<path
		d="M269 17 C316 146 327 269 298 389 C283 452 253 510 208 581"
		fill="none"
		stroke="#697a9a"
		stroke-opacity="0.28"
		stroke-width="3"
	/>
	<g class="ligand" filter="url(#wn-faint-glow)">
		<path
			d="M191 192 l16 -11 18 9 -4 19 -21 4 -13 -10 Z"
			fill="#d8f8ff"
			stroke="#6ce5ff"
			stroke-width="3"
		/>
		<circle cx="205" cy="197" r="30" fill="none" stroke="#6ce5ff" stroke-opacity="0.18" />
	</g>
	<g class="receptor">
		<path
			d="M244 205 C261 213 270 229 272 251"
			fill="none"
			stroke="#ffd166"
			stroke-width="8"
			stroke-linecap="round"
		/>
		<path
			d="M293 252 C306 270 316 288 320 308"
			fill="none"
			stroke="#ffd166"
			stroke-width="8"
			stroke-linecap="round"
		/>
		<path
			d="M249 207 l-13 -17 M255 210 l4 -23"
			stroke="#ffd166"
			stroke-width="5"
			stroke-linecap="round"
		/>
	</g>

	<g class:revealed={phaseIndex >= 1} class="signal-layer">
		<path
			d="M315 300 C406 280 451 324 530 306 C604 289 632 250 704 263"
			fill="none"
			stroke="#6ce5ff"
			stroke-opacity="0.16"
			stroke-width="34"
			stroke-linecap="round"
		/>
		<path
			d="M315 300 C406 280 451 324 530 306 C604 289 632 250 704 263"
			fill="none"
			stroke="url(#wn-signal)"
			stroke-width="7"
			stroke-linecap="round"
			stroke-dasharray="12 11"
		/>
		<path
			d="M679 254 l25 9 -20 17"
			fill="none"
			stroke="#6ce5ff"
			stroke-width="5"
			stroke-linejoin="round"
		/>
	</g>

	<g class:revealed={phaseIndex >= 2} class="nucleus-layer">
		<ellipse
			cx="852"
			cy="322"
			rx="300"
			ry="253"
			fill="url(#wn-nucleus)"
			stroke="#aca7de"
			stroke-opacity="0.68"
			stroke-width="3"
		/>
		<ellipse
			cx="852"
			cy="322"
			rx="286"
			ry="239"
			fill="none"
			stroke="#68658e"
			stroke-opacity="0.4"
			stroke-width="2"
			stroke-dasharray="2 10"
		/>

		<path
			d="M653 256 C684 160 793 118 873 161 C940 197 943 276 870 291 C788 307 722 277 653 256 Z"
			fill="#736d9e"
			fill-opacity="0.09"
			stroke="#8b85b3"
			stroke-opacity="0.2"
		/>
		<path
			d="M837 117 C957 92 1073 159 1085 265 C1094 352 1022 385 937 348 C866 317 822 237 837 117 Z"
			fill="url(#wn-territory-pattern)"
			stroke="#77729d"
			stroke-opacity="0.2"
		/>
		<path
			d="M642 348 C704 300 799 325 827 400 C857 482 755 547 674 492 C625 459 608 391 642 348 Z"
			fill="#4d6381"
			fill-opacity="0.09"
			stroke="#7487a3"
			stroke-opacity="0.2"
		/>

		<!-- Coarse chromatin geometry: a spline, never a decorative double helix. -->
		<path
			d="M682 385 C723 330 770 401 808 353 C846 306 888 389 928 341 C970 291 1018 362 1055 320"
			fill="none"
			stroke="#aaa6c6"
			stroke-opacity="0.54"
			stroke-width="7"
			stroke-linecap="round"
		/>
		<path
			d="M682 385 C723 330 770 401 808 353 C846 306 888 389 928 341 C970 291 1018 362 1055 320"
			fill="none"
			stroke="#1a1b34"
			stroke-opacity="0.72"
			stroke-width="2"
			stroke-dasharray="3 9"
		/>

		<g class="enhancer" filter="url(#wn-faint-glow)">
			<path d="M788 356 l-25 37 h50 Z" fill="#ed62d0" stroke="#ffd8f4" stroke-width="2.5" />
			<path d="M788 364 l-9 15 h18 Z" fill="#421f4b" />
		</g>
		<g class="promoter" filter="url(#wn-faint-glow)">
			<rect
				x="921"
				y="319"
				width="39"
				height="39"
				rx="7"
				fill="#241f2a"
				stroke="#ffd166"
				stroke-width="6"
			/>
			<circle cx="940.5" cy="338.5" r="5" fill="#ffd166" />
		</g>
		<path
			d="M815 373 Q865 315 915 337"
			fill="none"
			stroke="#c5a8f3"
			stroke-opacity="0.66"
			stroke-width="4"
			stroke-linecap="round"
			stroke-dasharray="3 12"
		/>
		<path
			d="M815 379 Q866 340 916 347"
			fill="none"
			stroke="#ed62d0"
			stroke-opacity="0.2"
			stroke-width="17"
			stroke-linecap="round"
		/>

		<g class:revealed={phaseIndex >= 3} class="rna-events" filter="url(#wn-soft-glow)">
			<circle cx="975" cy="309" r="7" fill="#f7fbff" />
			<rect
				x="987"
				y="330"
				width="12"
				height="12"
				rx="3"
				fill="#f7fbff"
				transform="rotate(18 993 336)"
			/>
			<circle cx="974" cy="366" r="5" fill="#f7fbff" />
		</g>
	</g>

	<g class="scale-copy" aria-hidden="true">
		<text x="38" y="585">EXTRACELLULAR</text>
		<text x="332" y="585">DOWNSTREAM ACTIVITY PROXY</text>
		<text x="820" y="585">SYNTHETIC LOCUS</text>
	</g>
</svg>

<style>
	.nucleus-poster {
		display: block;
		width: 100%;
		height: 100%;
		min-height: 24rem;
		background: #050712;
	}

	.nucleus-poster.compact {
		min-height: 15rem;
	}

	.signal-layer,
	.nucleus-layer,
	.rna-events {
		opacity: 0.16;
		transition: opacity 260ms ease;
	}

	.signal-layer.revealed,
	.nucleus-layer.revealed,
	.rna-events.revealed {
		opacity: 1;
	}

	.scale-copy {
		fill: #a9acc1;
		font:
			700 13px/1 'Courier Prime',
			ui-monospace,
			monospace;
		letter-spacing: 0.12em;
	}

	@media (max-width: 640px) {
		.nucleus-poster {
			min-height: 22rem;
		}

		.scale-copy text:nth-child(2) {
			display: none;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.signal-layer,
		.nucleus-layer,
		.rna-events {
			transition: none;
		}
	}

	@media (forced-colors: active) {
		.nucleus-poster {
			background: Canvas;
			filter: grayscale(1) contrast(1.35);
		}
	}
</style>
