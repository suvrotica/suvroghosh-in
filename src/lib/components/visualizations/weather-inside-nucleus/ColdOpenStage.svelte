<script lang="ts">
	type Props = {
		progress?: number;
		highContrast?: boolean;
		reducedMotion?: boolean;
	};

	let { progress = 0, highContrast = false, reducedMotion = false }: Props = $props();

	function clamp(value: number): number {
		return Math.max(0, Math.min(1, value));
	}

	function ease(value: number): number {
		const next = clamp(value);
		return next * next * (3 - 2 * next);
	}

	let p = $derived(reducedMotion ? 1 : clamp(progress));
	let establish = $derived(ease(p / (0.7 / 3)));
	let dock = $derived(ease((p - 0.7 / 3) / ((1.65 - 0.7) / 3)));
	let consequence = $derived(ease((p - 1.65 / 3) / ((3 - 1.65) / 3)));
	let ligandX = $derived(208 + dock * 168);
	let ligandY = $derived(280 - Math.sin(dock * Math.PI) * 18);
	let push = $derived(1 + establish * 0.02);
</script>

<div
	class:high-contrast={highContrast}
	class="cold-open"
	data-testid="weather-cold-open"
	data-cold-open-progress={p.toFixed(4)}
>
	<svg viewBox="0 0 1440 780" aria-hidden="true" preserveAspectRatio="xMidYMid slice">
		<defs>
			<radialGradient id="cold-bg" cx="78%" cy="45%" r="88%">
				<stop offset="0" stop-color="#17182d" />
				<stop offset="0.48" stop-color="#090b18" />
				<stop offset="1" stop-color="#03050b" />
			</radialGradient>
			<linearGradient id="cold-membrane" x1="0" y1="0" x2="1" y2="0">
				<stop offset="0" stop-color="#617089" stop-opacity="0.05" />
				<stop offset="0.48" stop-color="#cad4df" stop-opacity="0.74" />
				<stop offset="1" stop-color="#6d7992" stop-opacity="0.08" />
			</linearGradient>
			<radialGradient id="cold-local" cx="50%" cy="50%" r="50%">
				<stop offset="0" stop-color="#ffd58a" stop-opacity="0.72" />
				<stop offset="0.35" stop-color="#efaa58" stop-opacity="0.24" />
				<stop offset="1" stop-color="#efaa58" stop-opacity="0" />
			</radialGradient>
			<filter id="cold-glow" x="-120%" y="-120%" width="340%" height="340%">
				<feGaussianBlur stdDeviation="12" result="blur" />
				<feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
			</filter>
			<filter id="cold-soft" x="-80%" y="-80%" width="260%" height="260%">
				<feGaussianBlur stdDeviation="28" />
			</filter>
			<pattern id="cold-grain" width="28" height="28" patternUnits="userSpaceOnUse">
				<circle cx="4" cy="7" r="1" fill="#d6dded" fill-opacity="0.08" />
				<circle cx="20" cy="18" r="0.8" fill="#a9b6cc" fill-opacity="0.06" />
			</pattern>
		</defs>

		<rect width="1440" height="780" fill="url(#cold-bg)" />
		<g style={`transform:scale(${push});transform-origin:430px 390px`}>
			<!-- A distant nucleus is atmosphere only: no interior, locus, or labels. -->
			<ellipse
				cx="1172"
				cy="402"
				rx="330"
				ry="286"
				fill="#7774a6"
				fill-opacity="0.025"
				stroke="#b0abd3"
				stroke-opacity="0.055"
				stroke-width="3"
			/>

			<!-- Extracellular space remains left of this curved bilayer. -->
			<path
				d="M332 -50 C430 115 474 286 458 436 C448 555 398 674 300 836 L-80 836 L-80 -50 Z"
				fill="#142033"
				fill-opacity="0.2"
			/>
			<path
				d="M344 -38 C437 126 477 292 462 438 C450 558 402 674 310 826"
				fill="none"
				stroke="url(#cold-membrane)"
				stroke-width="18"
			/>
			<path
				d="M365 -40 C456 125 494 294 480 442 C467 562 420 679 329 834"
				fill="none"
				stroke="#78869d"
				stroke-opacity="0.32"
				stroke-width="5"
			/>
			<path
				d="M342 -38 C435 126 475 292 460 438 C448 558 400 674 308 826"
				fill="none"
				stroke="url(#cold-grain)"
				stroke-width="15"
			/>

			<!-- One schematic ligand, always on the extracellular side. -->
			<g transform={`translate(${ligandX} ${ligandY})`} filter="url(#cold-glow)">
				<circle r="48" fill="#94edff" fill-opacity={0.035 + establish * 0.06} />
				<path
					d="M-25 -7 L-8 -28 L19 -22 L29 3 L12 27 L-18 23 L-31 5 Z"
					fill="#d9f8ff"
					stroke="#8ce8f7"
					stroke-width="4"
				/>
				<circle r="34" fill="none" stroke="#9cefff" stroke-opacity="0.28" />
			</g>

			<!-- A single receptor pair spans the membrane; the ligand never passes through it. -->
			<g class="receptor" filter="url(#cold-glow)">
				<path
					d="M397 294 C408 270 425 253 446 247 M397 294 C414 314 430 329 448 337"
					fill="none"
					stroke="#f4c878"
					stroke-width="13"
					stroke-linecap="round"
				/>
				<path
					d="M449 248 C468 275 475 307 470 341 M450 337 C472 359 482 385 478 416"
					fill="none"
					stroke="#efb85d"
					stroke-width="13"
					stroke-linecap="round"
				/>
				<path
					d="M392 291 L372 272 M400 286 L400 257"
					stroke="#ffe1a0"
					stroke-width="7"
					stroke-linecap="round"
				/>
				<circle cx="479" cy="394" r="8" fill="#ffe29c" fill-opacity={0.18 + dock * 0.82} />
				<circle cx="487" cy="416" r="7" fill="#ffe29c" fill-opacity={0.14 + dock * 0.72} />
			</g>

			<!-- The first consequence is a local state region, not a traveling object. -->
			<g opacity={consequence}>
				<ellipse
					cx="570"
					cy="414"
					rx="112"
					ry="90"
					fill="url(#cold-local)"
					filter="url(#cold-soft)"
				/>
				<path
					d="M524 386 C552 368 590 373 609 401 C625 426 614 456 587 467 C553 481 517 458 512 428 C509 411 514 397 524 386 Z"
					fill="#b97c38"
					fill-opacity="0.16"
					stroke="#ffd58a"
					stroke-opacity="0.58"
					stroke-width="3"
				/>
			</g>
		</g>

		<g class="micro-labels">
			<text x="76" y="704">OUTSIDE THE CELL</text>
			<text x="504" y="704">CELL INTERIOR</text>
			<text x={ligandX - 40} y={ligandY - 70} opacity={establish}>outside signal · EGF</text>
			<text x="500" y="270" opacity={dock}>surface receptor · EGFR</text>
			<text x="610" y="500" opacity={consequence}>first local response</text>
		</g>
	</svg>
</div>

<style>
	.cold-open,
	svg {
		display: block;
		width: 100%;
		height: 100%;
		min-height: inherit;
		background: #03050b;
	}

	.micro-labels {
		fill: #c7cbd7;
		font:
			700 14px/1 var(--font-mono, 'Courier Prime'),
			ui-monospace,
			monospace;
		letter-spacing: 0.1em;
	}

	.micro-labels text:nth-child(n + 3) {
		fill: #fff0ca;
		font-size: 13px;
		letter-spacing: 0.04em;
	}

	.high-contrast svg {
		filter: saturate(0.25) contrast(1.32) brightness(1.16);
	}

	@media (forced-colors: active) {
		.cold-open {
			background: Canvas;
			forced-color-adjust: none;
		}

		svg {
			filter: grayscale(1) contrast(1.5);
		}
	}
</style>
