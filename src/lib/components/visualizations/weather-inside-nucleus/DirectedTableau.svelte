<script lang="ts">
	import type { SimulationResult } from '$lib/visualizations/weather-inside-nucleus/model';
	import type { NucleusDirectedBeat } from '$lib/visualizations/weather-inside-nucleus/render/types';
	import type { CompactMatchedEnsembleResult } from '$lib/visualizations/weather-inside-nucleus/worker/protocol';

	type Props = {
		beat: NucleusDirectedBeat;
		progress?: number;
		filmTime?: number;
		modelTime?: number | null;
		modelBoundary?: 'at' | 'before' | 'after';
		trace?: SimulationResult | null;
		ensemble?: CompactMatchedEnsembleResult | null;
		highContrast?: boolean;
		reducedMotion?: boolean;
	};

	let {
		beat,
		progress = 1,
		filmTime = 0,
		modelTime = null,
		modelBoundary = 'at',
		trace = null,
		ensemble = null,
		highContrast = false,
		reducedMotion = false
	}: Props = $props();

	const HISTORY_INDICES = [...Array(48).keys()];

	function clamp(value: number): number {
		return Math.max(0, Math.min(1, value));
	}

	function smooth(value: number): number {
		const next = clamp(value);
		return next * next * (3 - 2 * next);
	}

	function boundaryTime(time: number, boundary: 'at' | 'before' | 'after'): number {
		if (boundary === 'before') return time - 1e-7;
		if (boundary === 'after') return time + 1e-7;
		return time;
	}

	function exactContactNear(result: SimulationResult | null, time: number | null): boolean {
		if (!result || time === null) return beat === 'silent';
		const sampledTime = boundaryTime(time, modelBoundary);
		let near = result.timeline.contactState[0] > 0;
		for (const transition of result.contactTransitionTimes) {
			if (transition > sampledTime) break;
			near = !near;
		}
		return near;
	}

	function exactPromoterOn(result: SimulationResult | null, time: number | null): boolean {
		if (!result || time === null) return false;
		const sampledTime = boundaryTime(time, modelBoundary);
		for (let index = 0; index < result.burstStartTimes.length; index += 1) {
			const start = result.burstStartTimes[index];
			const end = result.burstEndTimes[index] ?? Number.POSITIVE_INFINITY;
			if (sampledTime >= start && sampledTime < end) return true;
		}
		return false;
	}

	let p = $derived(reducedMotion ? 1 : clamp(progress));
	let contactNear = $derived(exactContactNear(trace, modelTime));
	let displayContactNear = $derived((beat === 'silent' || beat === 'burst') && contactNear);
	let promoterOn = $derived(exactPromoterOn(trace, modelTime));
	let initiationTimes = $derived(
		trace && modelTime !== null
			? Array.from(trace.initiationTimes).filter((time) => time <= modelTime + 1e-9)
			: []
	);
	let eventPulse = $derived.by(() => {
		if (!trace || modelTime === null) return 0;
		let intensity = 0;
		for (const time of trace.initiationTimes) {
			const age = modelTime - time;
			if (age >= 0 && age <= 0.28) intensity = Math.max(intensity, 1 - age / 0.28);
		}
		return intensity;
	});
	let relayPhase = $derived(smooth((p - 0.35) / 0.22));
	let nuclearPhase = $derived(smooth((p - 0.35) / 0.18));
	let apertureClosed = $derived(beat === 'scale-cut' && p >= 0.07 && p < 0.35);
	let locusVisible = $derived(beat !== 'scale-cut' || p >= 0.35);
	let showBaseline = $derived(beat === 'probability' && p >= 2.1 / 16);
	let showIntervention = $derived(beat === 'probability' && p >= 6.5 / 16);
</script>

<div
	class:high-contrast={highContrast}
	class="directed-tableau"
	data-testid="weather-directed-tableau"
	data-directed-beat={beat}
	data-model-time={modelTime === null ? 'none' : modelTime.toFixed(6)}
	data-film-time-ms={filmTime.toFixed(0)}
	data-model-boundary={modelBoundary}
	data-contact-state={contactNear ? 'near' : 'far'}
	data-promoter-state={promoterOn ? 'on' : 'off'}
	data-initiation-count={initiationTimes.length}
>
	{#if beat === 'probability'}
		<div class="ensemble-field" aria-hidden="true">
			<div class="ensemble-head">
				<span>48 fixed random streams · diamond = ≥1 promoter-ON interval</span>
				<strong>{showIntervention ? 'usual | increased contact' : 'usual setting'}</strong>
			</div>
			<div class="history-grid">
				{#each HISTORY_INDICES as index (index)}
					{@const baselineBurstCount = ensemble?.baseline.burstCounts[index] ?? 0}
					{@const interventionBurstCount = ensemble?.intervention.burstCounts[index] ?? 0}
					<div class="history-tile" data-seed={ensemble?.seeds[index] ?? index}>
						<div
							class:burst={baselineBurstCount > 0}
							class:revealed={showBaseline}
							class="history-line baseline"
							data-burst-count={baselineBurstCount}
						>
							<span></span><i class="outcome-mark"></i>
						</div>
						<div
							class:burst={interventionBurstCount > 0}
							class:revealed={showIntervention}
							class="history-line intervention"
							data-burst-count={interventionBurstCount}
						>
							<span></span><i class="outcome-mark"></i>
						</div>
					</div>
				{/each}
			</div>
			<div class="ensemble-counts">
				<p class:revealed={showBaseline}>
					usual · <strong>{ensemble?.baseline.summary.burstingRunCount ?? '—'}/48</strong> burst
				</p>
				<p class:revealed={showIntervention}>
					increased contact · <strong
						>{ensemble?.intervention.summary.burstingRunCount ?? '—'}/48</strong
					>
					burst
				</p>
			</div>
		</div>
	{:else}
		<svg viewBox="0 0 1440 780" aria-hidden="true" preserveAspectRatio="xMidYMid slice">
			<defs>
				<radialGradient id="dt-bg" cx="72%" cy="44%" r="86%">
					<stop offset="0" stop-color="#1b1c37" />
					<stop offset="0.52" stop-color="#090b19" />
					<stop offset="1" stop-color="#03050c" />
				</radialGradient>
				<radialGradient id="dt-nucleus" cx="38%" cy="38%" r="72%">
					<stop offset="0" stop-color="#595585" stop-opacity="0.35" />
					<stop offset="0.7" stop-color="#17172e" stop-opacity="0.82" />
					<stop offset="1" stop-color="#070912" stop-opacity="0.97" />
				</radialGradient>
				<radialGradient id="dt-activity">
					<stop offset="0" stop-color="#ffd58a" stop-opacity="0.85" />
					<stop offset="0.34" stop-color="#d69148" stop-opacity="0.25" />
					<stop offset="1" stop-color="#d69148" stop-opacity="0" />
				</radialGradient>
				<radialGradient id="dt-nuclear-activity">
					<stop offset="0" stop-color="#f3efff" stop-opacity="0.86" />
					<stop offset="0.34" stop-color="#a89adf" stop-opacity="0.24" />
					<stop offset="1" stop-color="#a89adf" stop-opacity="0" />
				</radialGradient>
				<linearGradient id="dt-membrane" x1="0" x2="1">
					<stop offset="0" stop-color="#5e6d85" stop-opacity="0.08" />
					<stop offset="0.5" stop-color="#ced7e2" stop-opacity="0.78" />
					<stop offset="1" stop-color="#6e7b92" stop-opacity="0.08" />
				</linearGradient>
				<pattern
					id="dt-off"
					width="12"
					height="12"
					patternUnits="userSpaceOnUse"
					patternTransform="rotate(45)"
				>
					<rect width="4" height="12" fill="#ffd166" fill-opacity="0.23" />
				</pattern>
				<pattern id="dt-territory" width="26" height="26" patternUnits="userSpaceOnUse">
					<circle cx="5" cy="7" r="1.4" fill="#d3ccef" fill-opacity="0.14" />
					<circle cx="19" cy="18" r="1" fill="#a79fcd" fill-opacity="0.1" />
				</pattern>
				<filter id="dt-glow" x="-100%" y="-100%" width="300%" height="300%">
					<feGaussianBlur stdDeviation="11" result="b" />
					<feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
				</filter>
				<filter id="dt-soft" x="-80%" y="-80%" width="260%" height="260%">
					<feGaussianBlur stdDeviation="32" />
				</filter>
			</defs>

			<rect width="1440" height="780" fill="url(#dt-bg)" />

			{#if beat === 'boundary' || beat === 'relay'}
				<path
					d="M310 -40 C434 115 472 290 448 442 C428 570 377 677 290 828"
					fill="none"
					stroke="url(#dt-membrane)"
					stroke-width="20"
				/>
				<path
					d="M334 -45 C454 118 491 293 468 448 C448 575 398 684 312 838"
					fill="none"
					stroke="#748299"
					stroke-opacity="0.34"
					stroke-width="5"
				/>
				<g opacity={beat === 'boundary' ? 1 : 0.3} filter="url(#dt-glow)">
					<path
						d="M350 274 L372 247 L405 255 L418 286 L397 316 L363 311 L343 291 Z"
						fill="#d9f8ff"
						stroke="#8deafa"
						stroke-width="5"
					/>
					<path
						d="M414 290 C431 258 449 244 473 238 M416 292 C439 322 455 337 479 351"
						fill="none"
						stroke="#f4c878"
						stroke-width="14"
						stroke-linecap="round"
					/>
					<path
						d="M476 240 C499 275 505 316 494 355 M479 350 C506 378 518 410 509 445"
						fill="none"
						stroke="#efb85d"
						stroke-width="14"
						stroke-linecap="round"
					/>
					<circle cx="512" cy="418" r="8" fill="#ffe29c" />
				</g>

				{#if beat === 'boundary'}
					<ellipse
						cx="626"
						cy="422"
						rx="136"
						ry="104"
						fill="url(#dt-activity)"
						opacity="0.4"
						filter="url(#dt-soft)"
					/>
					<text x="105" y="695" class="space-label">OUTSIDE THE CELL</text>
					<text x="530" y="695" class="space-label">CELL INTERIOR</text>
					<text x="274" y="207" class="direct-label cyan">outside signal · EGF</text>
					<text x="502" y="278" class="direct-label amber">surface receptor · EGFR</text>
				{:else}
					<ellipse
						cx="1190"
						cy="414"
						rx="360"
						ry="316"
						fill="url(#dt-nucleus)"
						stroke="#a9a4d0"
						stroke-opacity="0.52"
						stroke-width="4"
					/>
					{#each [610, 758, 908] as x, index (x)}
						{@const local = smooth((relayPhase - index * 0.28) / 0.36)}
						<g opacity={0.16 + local * 0.84}>
							<ellipse
								cx={x}
								cy={410 + index * 18}
								rx="94"
								ry="74"
								fill="url(#dt-activity)"
								filter="url(#dt-soft)"
							/>
							<path
								d={`M${x - 32} ${390 + index * 18} C${x - 8} ${371 + index * 18} ${x + 27} ${382 + index * 18} ${x + 38} ${410 + index * 18} C${x + 46} ${435 + index * 18} ${x + 22} ${456 + index * 18} ${x - 8} ${450 + index * 18} C${x - 37} ${444 + index * 18} ${x - 49} ${411 + index * 18} ${x - 32} ${390 + index * 18} Z`}
								fill="#c38643"
								fill-opacity="0.15"
								stroke="#ffd58a"
								stroke-opacity="0.55"
								stroke-width="3"
							/>
						</g>
					{/each}
					<text x="620" y="285" class="direct-label amber"
						>compressed intracellular activity proxy</text
					>
					<text x="620" y="315" class="secondary-label"
						>fixed local regions · many steps omitted</text
					>
				{/if}
			{:else if beat === 'nuclear'}
				<ellipse
					cx="910"
					cy="402"
					rx="545"
					ry="438"
					fill="url(#dt-nucleus)"
					stroke="#aaa6d4"
					stroke-opacity="0.58"
					stroke-width="5"
				/>
				<ellipse
					cx="910"
					cy="402"
					rx="525"
					ry="418"
					fill="none"
					stroke="#75719c"
					stroke-opacity="0.32"
					stroke-width="3"
					stroke-dasharray="3 16"
				/>
				<ellipse
					cx="340"
					cy="415"
					rx="180"
					ry="135"
					fill="url(#dt-activity)"
					opacity={0.45 + nuclearPhase * 0.35}
					filter="url(#dt-soft)"
				/>
				<ellipse
					cx="626"
					cy="410"
					rx="220"
					ry="170"
					fill="url(#dt-nuclear-activity)"
					opacity={nuclearPhase}
					filter="url(#dt-soft)"
				/>
				<path
					d="M385 -20 C438 144 445 298 420 446 C402 561 367 665 314 802"
					fill="none"
					stroke="#b7b2d8"
					stroke-opacity="0.55"
					stroke-width="8"
				/>
				<text x="120" y="244" class="direct-label amber">inside-cell activity</text>
				<text x="600" y="242" class="direct-label violet"
					>nuclear activity proxy · many pathways omitted</text
				>
				<text x="922" y="690" class="secondary-label">NUCLEUS · COMPARTMENT CONTAINING DNA</text>
			{:else if beat === 'scale-cut' && !locusVisible}
				<ellipse
					cx="850"
					cy="394"
					rx="480"
					ry="386"
					fill="url(#dt-nucleus)"
					stroke="#aaa6d4"
					stroke-opacity="0.46"
					stroke-width="5"
				/>
			{:else}
				<!-- One immutable locus plate for the scale reveal, independent histories, silence, and burst. -->
				<path
					d="M48 187 C252 34 479 84 590 231 C701 378 899 371 1048 208 C1152 94 1297 82 1448 162 L1448 -20 L48 -20 Z"
					fill="url(#dt-territory)"
					stroke="#7f79a6"
					stroke-opacity="0.17"
					stroke-width="3"
				/>
				<path
					d="M-42 545 C123 401 292 553 429 446 C561 342 710 527 849 416 C985 307 1141 468 1482 310"
					fill="none"
					stroke="#aaa6c0"
					stroke-opacity="0.64"
					stroke-width="18"
					stroke-linecap="round"
				/>
				<path
					d="M-42 545 C123 401 292 553 429 446 C561 342 710 527 849 416 C985 307 1141 468 1482 310"
					fill="none"
					stroke="#24253b"
					stroke-opacity="0.86"
					stroke-width="4"
					stroke-dasharray="5 18"
				/>

				{#if beat === 'scale-cut'}
					<g transform="translate(780 420)" filter="url(#dt-glow)">
						<circle r="54" fill="#2a2a48" stroke="#e3dcff" stroke-width="6" />
						<circle r="14" fill="#f4edff" />
					</g>
					<text x="1060" y="692" class="secondary-label">LOCUS · ONE MODELED DNA REGION</text>
				{:else}
					<g transform={`translate(${displayContactNear ? 525 : 430} 441)`} filter="url(#dt-glow)">
						<path d="M0 -66 L-54 36 L54 36 Z" fill="#63dce8" stroke="#d8fbff" stroke-width="5" />
						<path d="M0 -38 L-23 16 L23 16 Z" fill="#13343b" />
					</g>
					<g transform="translate(780 420)" filter="url(#dt-glow)">
						{#if beat === 'histories'}
							<circle r="67" fill="#171827" stroke="#ffb36a" stroke-width="12" />
							<circle r="23" fill="#090a15" stroke="#ffe0a0" stroke-width="4" />
						{:else if promoterOn}
							<circle r="67" fill="#5b2c19" stroke="#ffb36a" stroke-width="15" />
							<circle r="25" fill="#ffe0a0" />
						{:else}
							<rect
								x="-66"
								y="-66"
								width="132"
								height="132"
								rx="27"
								fill="url(#dt-off)"
								stroke="#ffb36a"
								stroke-width="15"
							/>
							<circle r="23" fill="#090a15" stroke="#ffe0a0" stroke-width="5" />
						{/if}
					</g>

					<!-- Propensity is a constant envelope; the realized near state has its own bracket. -->
					<path
						d="M500 434 Q645 313 722 395"
						fill="none"
						stroke="#8ee9ee"
						stroke-opacity="0.22"
						stroke-width="42"
						stroke-linecap="round"
					/>
					<path
						d="M500 434 Q645 313 722 395"
						fill="none"
						stroke="#c5c0e1"
						stroke-opacity="0.52"
						stroke-width="5"
						stroke-dasharray="5 19"
						stroke-linecap="round"
					/>
					{#if displayContactNear}
						<path d="M590 344 v-22 h122 v22" fill="none" stroke="#f7f4ff" stroke-width="4" />
						<text x="650" y="305" class="near-label">REALIZED NEAR STATE</text>
					{/if}

					<text x={displayContactNear ? 453 : 353} y="545" class="direct-label cyan"
						>enhancer · control region</text
					>
					<text x="730" y="540" class="direct-label amber">
						{beat === 'histories'
							? 'promoter · modeled gene start'
							: `promoter · model ${promoterOn ? 'ON' : 'OFF'}`}
					</text>
					<text x="930" y="378" class="direct-label">modeled gene</text>
					<text x="545" y="254" class="secondary-label">contact propensity · 0.20</text>

					{#if beat === 'histories'}
						<g class="history-indicators">
							<rect
								x="90"
								y="90"
								width="280"
								height="94"
								rx="18"
								fill="#0a0c17"
								stroke="#efb85d"
								stroke-opacity="0.48"
							/>
							<path d="M122 139 H332" stroke="#efb85d" stroke-width="5" stroke-dasharray="18 14" />
							<text x="122" y="126">SIGNAL / OCCUPANCY HISTORY</text>
							<rect
								x="1070"
								y="610"
								width="280"
								height="94"
								rx="18"
								fill="#0a0c17"
								stroke="#8ee9ee"
								stroke-opacity="0.48"
							/>
							<path
								d="M1102 660 C1150 626 1192 686 1238 651 C1277 621 1308 644 1324 670"
								fill="none"
								stroke="#8ee9ee"
								stroke-width="5"
							/>
							<text x="1102" y="646">GEOMETRY HISTORY</text>
						</g>
					{/if}

					{#if beat === 'silent' || beat === 'burst'}
						<g class="trace-band">
							<rect
								x="148"
								y="614"
								width="910"
								height="112"
								rx="20"
								fill="#050711"
								fill-opacity="0.9"
								stroke="#76788d"
								stroke-opacity="0.45"
							/>
							<path d="M196 684 H1014" stroke="#77798d" stroke-width="3" />
							<text x="196" y="650">ONE HISTORY · MODEL TIME</text>
							{#each initiationTimes as time (time)}
								{@const tickX = 196 + ((time - 24.65) / (27.6782023014 - 24.65)) * 818}
								<path d={`M${tickX} 684 v-34`} stroke="#fff3d0" stroke-width="5" />
								<circle cx={tickX} cy="645" r="5" fill="#fff7e5" />
							{/each}
						</g>
					{/if}

					{#if beat === 'burst' && eventPulse > 0}
						<g transform="translate(780 420)" opacity={eventPulse} filter="url(#dt-glow)">
							<circle
								r={38 + eventPulse * 35}
								fill="#fff5dc"
								fill-opacity={0.16 + eventPulse * 0.35}
							/>
							<circle r={9 + eventPulse * 8} fill="#fffdf5" />
						</g>
					{/if}
				{/if}
			{/if}

			{#if apertureClosed}
				<g class="aperture">
					<path d="M0 0 H1440 L1020 300 H420 Z" fill="#010208" />
					<path d="M0 780 H1440 L1020 480 H420 Z" fill="#010208" />
					<path d="M0 0 V780 L470 520 V260 Z" fill="#010208" />
					<path d="M1440 0 V780 L970 520 V260 Z" fill="#010208" />
				</g>
			{/if}
		</svg>
	{/if}
</div>

<style>
	.directed-tableau,
	svg,
	.ensemble-field {
		display: block;
		width: 100%;
		height: 100%;
		min-height: inherit;
		background: #03050c;
	}

	.space-label,
	.secondary-label,
	.near-label,
	.history-indicators text,
	.trace-band text {
		fill: #b6b9c7;
		font:
			700 14px/1 var(--font-mono, 'Courier Prime'),
			ui-monospace,
			monospace;
		letter-spacing: 0.1em;
	}

	.direct-label {
		fill: #e7e7ee;
		font: 700 16px/1 var(--font-sans, sans-serif);
		letter-spacing: 0.015em;
		paint-order: stroke;
		stroke: #04050c;
		stroke-width: 6px;
	}

	.direct-label.cyan {
		fill: #9ef2f5;
	}

	.direct-label.amber {
		fill: #ffe0a0;
	}

	.direct-label.violet {
		fill: #e7e1ff;
	}

	.near-label {
		fill: #f7f4ff;
		font-size: 12px;
		text-anchor: middle;
	}

	.history-indicators text,
	.trace-band text {
		fill: #c5c7d2;
		font-size: 12px;
		letter-spacing: 0.08em;
	}

	.ensemble-field {
		box-sizing: border-box;
		display: grid;
		grid-template-rows: auto minmax(0, 1fr) auto;
		gap: 1rem;
		padding: clamp(1.2rem, 3vw, 2.6rem);
		background: radial-gradient(circle at 50% 42%, rgb(62 60 105 / 28%), transparent 56%), #03050c;
	}

	.ensemble-head,
	.ensemble-counts {
		display: flex;
		align-items: end;
		justify-content: space-between;
		gap: 1rem;
	}

	.ensemble-head span,
	.ensemble-head strong {
		font-family: var(--font-sans, sans-serif);
	}

	.ensemble-head span {
		color: #a9acba;
		font-size: 0.72rem;
		font-weight: 750;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}

	.ensemble-head strong {
		color: #f9f1dc;
		font-size: clamp(1rem, 2vw, 1.5rem);
	}

	.history-grid {
		display: grid;
		grid-template-columns: repeat(8, minmax(0, 1fr));
		grid-template-rows: repeat(6, minmax(0, 1fr));
		gap: clamp(0.35rem, 0.8vw, 0.8rem);
		min-height: 0;
	}

	.history-tile {
		display: grid;
		grid-template-rows: 1fr 1fr;
		gap: 0.2rem;
		min-width: 0;
		border: 1px solid rgb(176 179 204 / 18%);
		border-radius: 0.45rem;
		background: rgb(9 11 24 / 72%);
		padding: clamp(0.22rem, 0.5vw, 0.45rem);
	}

	.history-line {
		position: relative;
		display: flex;
		align-items: center;
		opacity: 0.08;
		transition: opacity 220ms ease;
	}

	.history-line.revealed {
		opacity: 1;
	}

	.history-line span {
		display: block;
		width: 100%;
		height: 2px;
		background: #6e7184;
	}

	.history-line .outcome-mark {
		position: absolute;
		display: none;
		right: 42%;
		width: 0.46rem;
		height: 0.46rem;
		background: #fff5d8;
		transform: rotate(45deg);
	}

	.history-line.burst .outcome-mark {
		display: block;
	}

	.history-line.baseline.burst span {
		background: #8ceafa;
	}

	.history-line.intervention.burst span,
	.history-line.intervention .outcome-mark {
		background: #ffd58a;
	}

	.ensemble-counts p {
		margin: 0;
		color: #b2b4c1;
		font: 0.8rem/1.3 var(--font-sans, sans-serif);
		opacity: 0.18;
	}

	.ensemble-counts p.revealed {
		opacity: 1;
	}

	.ensemble-counts strong {
		color: #fff4d6;
		font-size: 1.15em;
	}

	.high-contrast svg,
	.high-contrast .ensemble-field {
		filter: saturate(0.3) contrast(1.28) brightness(1.16);
	}

	@media (prefers-reduced-motion: reduce) {
		.history-line {
			transition: none;
		}
	}

	@media (forced-colors: active) {
		.directed-tableau,
		svg,
		.ensemble-field,
		.history-tile {
			border-color: CanvasText;
			background: Canvas;
			color: CanvasText;
			filter: grayscale(1) contrast(1.5);
		}
	}
</style>
