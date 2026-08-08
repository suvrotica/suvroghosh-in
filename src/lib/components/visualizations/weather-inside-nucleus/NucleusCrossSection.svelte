<script lang="ts">
	import type { InterventionId } from '$lib/visualizations/weather-inside-nucleus/experience';
	import type { NucleusView } from '$lib/visualizations/weather-inside-nucleus/url-state';
	import type { TraceView } from './ui-types';

	type Props = {
		trace: TraceView | null;
		currentTime?: number;
		semanticView?: NucleusView;
		interactiveTargets?: boolean;
		selectedIntervention?: InterventionId | null;
		onselect?: (intervention: InterventionId) => void;
	};

	let {
		trace,
		currentTime = 0,
		semanticView = 'cell',
		interactiveTargets = false,
		selectedIntervention = null,
		onselect
	}: Props = $props();

	let sampleIndex = $derived(
		trace && trace.times.length > 1
			? Math.max(
					0,
					Math.min(
						trace.times.length - 1,
						Math.round((currentTime / trace.duration) * (trace.times.length - 1))
					)
				)
			: 0
	);
	let downstream = $derived(trace?.downstreamActivity[sampleIndex] ?? 0);
	let nuclear = $derived(trace?.nuclearActivity[sampleIndex] ?? 0);
	let occupancy = $derived(trace?.occupancy[sampleIndex] ?? 0);
	let contactNear = $derived(Boolean(trace?.contactState[sampleIndex]));
	let contactPropensity = $derived(trace?.contactPropensity[sampleIndex] ?? 0.2);
	let promoterOn = $derived(Boolean(trace?.promoterState[sampleIndex]));
	let transcriptCount = $derived(trace?.rnaCount[sampleIndex] ?? 0);
	let initiatedSoFar = $derived(
		trace ? trace.initiationTimes.filter((time) => time <= currentTime).length : 0
	);
	let enhancerX = $derived(contactNear ? 612 : 520);
	let sceneViewBox = $derived(
		semanticView === 'cell'
			? '0 0 900 480'
			: semanticView === 'nucleus'
				? '355 35 545 445'
				: semanticView === 'territory'
					? '410 65 475 400'
					: '470 165 375 235'
	);
	let sceneDescription = $derived(
		`At model minute ${currentTime.toFixed(1)}, downstream activity is ${downstream.toFixed(2)}, nuclear activity is ${nuclear.toFixed(2)}, occupancy propensity is ${occupancy.toFixed(2)}, the modeled contact state is ${contactNear ? 'near' : 'far'}, the promoter is ${promoterOn ? 'ON' : 'OFF'}, and ${initiatedSoFar} initiation events have occurred. Contact propensity is ${contactPropensity.toFixed(2)}; it is not a measured distance.`
	);
</script>

<div
	class="cross-section"
	data-testid="nucleus-cross-section"
	data-contact={contactNear ? 'near' : 'far'}
	data-promoter={promoterOn ? 'on' : 'off'}
>
	<svg
		viewBox={sceneViewBox}
		role="img"
		aria-labelledby="wn-cross-title wn-cross-description"
		preserveAspectRatio="xMidYMid meet"
	>
		<title id="wn-cross-title">Interactive two-dimensional nucleus cross-section</title>
		<desc id="wn-cross-description">{sceneDescription}</desc>
		<defs>
			<radialGradient id="wn-cross-nucleus" cx="44%" cy="36%" r="70%">
				<stop offset="0" stop-color="#343161" stop-opacity="0.62" />
				<stop offset="1" stop-color="#090a18" stop-opacity="0.94" />
			</radialGradient>
			<pattern id="wn-contact-hatch" width="9" height="9" patternUnits="userSpaceOnUse">
				<path d="M0 9 L9 0" stroke="#d5b8ff" stroke-opacity="0.32" />
			</pattern>
			<filter id="wn-cross-glow" x="-70%" y="-70%" width="240%" height="240%">
				<feGaussianBlur stdDeviation="5" result="blur" />
				<feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
			</filter>
		</defs>
		<rect width="900" height="480" fill="#050712" />
		<path
			d="M0 72 C145 104 155 368 0 411 Z"
			fill="#17223b"
			fill-opacity="0.48"
			stroke="#7180a0"
			stroke-opacity="0.38"
			stroke-width="2"
		/>
		<path
			d="M117 54 C175 156 174 322 111 429"
			fill="none"
			stroke="#a5b2c9"
			stroke-opacity="0.7"
			stroke-width="8"
		/>
		<path d="M130 49 C188 155 187 326 124 435" fill="none" stroke="#4c5a77" stroke-width="3" />
		<g class="ligand" filter="url(#wn-cross-glow)">
			<path
				d="M61 183 l18 -12 19 10 -5 20 -22 5 -14 -11 Z"
				fill="#d8f8ff"
				stroke="#6ce5ff"
				stroke-width="3"
			/>
		</g>
		<path
			d="M102 202 C126 211 137 232 137 255 M157 255 C169 270 176 286 181 305"
			fill="none"
			stroke="#ffd166"
			stroke-width="8"
			stroke-linecap="round"
		/>
		<g style={`opacity:${0.22 + downstream * 0.78}`}>
			<path
				d="M178 298 C260 270 300 324 384 297 C426 284 459 265 502 265"
				fill="none"
				stroke="#6ce5ff"
				stroke-opacity="0.13"
				stroke-width="30"
				stroke-linecap="round"
			/>
			<path
				d="M178 298 C260 270 300 324 384 297 C426 284 459 265 502 265"
				fill="none"
				stroke="#6ce5ff"
				stroke-width="6"
				stroke-linecap="round"
				stroke-dasharray="11 10"
			/>
		</g>
		<ellipse
			cx="630"
			cy="257"
			rx="251"
			ry="205"
			fill="url(#wn-cross-nucleus)"
			stroke="#aaa6db"
			stroke-opacity="0.74"
			stroke-width="3"
		/>
		<ellipse
			cx="630"
			cy="257"
			rx="237"
			ry="191"
			fill="none"
			stroke="#6e6994"
			stroke-opacity="0.46"
			stroke-dasharray="3 10"
		/>
		<path
			d="M438 228 C486 155 576 159 608 216 C638 271 556 302 489 273 C462 261 445 245 438 228 Z"
			fill="#7771a5"
			fill-opacity="0.12"
			stroke="#8c86b6"
			stroke-opacity="0.25"
		/>
		<path
			d="M605 101 C710 74 818 139 829 235 C836 309 773 340 695 309 C624 281 587 202 605 101 Z"
			fill="#5d608c"
			fill-opacity="0.1"
			stroke="#777aa5"
			stroke-opacity="0.23"
		/>
		<path
			d="M448 341 C500 295 578 320 601 376 C615 410 582 446 523 443 C465 440 422 378 448 341 Z"
			fill="#4f6787"
			fill-opacity="0.11"
			stroke="#7085a1"
			stroke-opacity="0.23"
		/>
		<path
			d={`M446 328 C500 276 ${enhancerX - 44} 344 ${enhancerX} 307 C674 258 704 336 751 287 C790 247 812 277 839 256`}
			fill="none"
			stroke="#aaa7c5"
			stroke-opacity="0.6"
			stroke-width="8"
			stroke-linecap="round"
		/>
		<path
			d={`M446 328 C500 276 ${enhancerX - 44} 344 ${enhancerX} 307 C674 258 704 336 751 287 C790 247 812 277 839 256`}
			fill="none"
			stroke="#17182e"
			stroke-width="2"
			stroke-dasharray="3 9"
		/>

		<g transform={`translate(${enhancerX} 307)`} filter="url(#wn-cross-glow)">
			<circle
				r={19 + occupancy * 17}
				fill="none"
				stroke="#ed62d0"
				stroke-opacity={0.18 + occupancy * 0.45}
				stroke-width="5"
				stroke-dasharray="4 7"
			/>
			<path d="M0 -22 l-25 39 h50 Z" fill="#ed62d0" stroke="#ffd8f4" stroke-width="2.5" />
		</g>
		<g transform="translate(706 292)" filter="url(#wn-cross-glow)">
			<rect
				x="-22"
				y="-22"
				width="44"
				height="44"
				rx="8"
				fill={promoterOn ? '#5b4619' : '#211e2b'}
				stroke="#ffd166"
				stroke-width="6"
			/>
			<circle r="6" fill="#ffd166" />
		</g>
		<path
			d={`M${enhancerX + 29} 300 Q${(enhancerX + 706) / 2} ${contactNear ? 246 : 217} 678 287`}
			fill="none"
			stroke="url(#wn-contact-hatch)"
			stroke-width={10 + contactPropensity * 12}
			stroke-opacity={0.25 + contactPropensity * 0.45}
			stroke-linecap="round"
		/>
		<path
			d={`M${enhancerX + 29} 300 Q${(enhancerX + 706) / 2} ${contactNear ? 246 : 217} 678 287`}
			fill="none"
			stroke="#d5b8ff"
			stroke-opacity={contactNear ? 0.8 : 0.36}
			stroke-width="3"
			stroke-dasharray={contactNear ? '8 6' : '2 12'}
			stroke-linecap="round"
		/>
		{#each Array.from({ length: Math.min(8, initiatedSoFar) }, (_, index) => index) as index (index)}
			<g
				transform={`translate(${746 + (index % 4) * 25} ${255 + Math.floor(index / 4) * 36})`}
				filter="url(#wn-cross-glow)"
			>
				{#if index % 2 === 0}<circle r="5" fill="#f7fbff" />{:else}<rect
						x="-5"
						y="-5"
						width="10"
						height="10"
						rx="2"
						fill="#f7fbff"
						transform="rotate(20)"
					/>{/if}
			</g>
		{/each}

		<g class="direct-labels">
			<text x="24" y="445">EGF stays outside</text>
			<text x="192" y="342">downstream activity proxy {downstream.toFixed(2)}</text>
			<text x={enhancerX - 38} y="366">enhancer · occupancy {occupancy.toFixed(2)}</text>
			<text x="674" y="352">promoter {promoterOn ? 'ON' : 'OFF'}</text>
			<text x="545" y="191"
				>{contactNear ? 'near state' : 'far state'} · propensity {contactPropensity.toFixed(
					2
				)}</text
			>
			<text x="679" y="412">modeled RNA {transcriptCount}</text>
		</g>
	</svg>

	{#if interactiveTargets && semanticView === 'cell'}
		<div class="scene-targets" aria-label="Scene intervention targets">
			<button
				class="target receptor-target"
				class:selected={selectedIntervention === 'blocked'}
				type="button"
				onclick={() => onselect?.('blocked')}
			>
				<span>1</span><strong>Block receptor</strong>
			</button>
			<button
				class="target signal-target"
				class:selected={selectedIntervention === 'lengthened'}
				type="button"
				onclick={() => onselect?.('lengthened')}
			>
				<span>2</span><strong>Lengthen signal</strong>
			</button>
			<button
				class="target binding-target"
				class:selected={selectedIntervention === 'mutated'}
				type="button"
				onclick={() => onselect?.('mutated')}
			>
				<span>3</span><strong>Weaken foothold</strong>
			</button>
			<button
				class="target contact-target"
				class:selected={selectedIntervention === 'contact'}
				type="button"
				onclick={() => onselect?.('contact')}
			>
				<span>4</span><strong>Change meetings</strong>
			</button>
		</div>
	{/if}

	<p class="scene-summary">{sceneDescription}</p>
</div>

<style>
	.cross-section {
		position: relative;
		width: 100%;
		height: 100%;
		min-height: 25rem;
		overflow: hidden;
		background: #050712;
		isolation: isolate;
	}

	svg {
		display: block;
		width: 100%;
		height: 100%;
		min-height: inherit;
	}

	.direct-labels text {
		fill: #d0d0df;
		paint-order: stroke;
		stroke: #050712;
		stroke-width: 5px;
		stroke-linejoin: round;
		font:
			700 12px/1 ui-monospace,
			monospace;
		letter-spacing: 0.02em;
	}

	.scene-targets {
		position: absolute;
		inset: 0;
		pointer-events: none;
	}

	.target {
		position: absolute;
		display: grid;
		min-width: 2.75rem;
		min-height: 2.75rem;
		place-items: center;
		border: 1px solid rgb(247 251 255 / 66%);
		border-radius: 999px;
		background: rgb(5 7 18 / 86%);
		padding: 0.3rem;
		color: #f7fbff;
		font: 750 0.72rem/1 var(--font-sans, sans-serif);
		cursor: pointer;
		pointer-events: auto;
		box-shadow: 0 0 0 6px rgb(108 229 255 / 8%);
	}

	.target strong {
		position: absolute;
		top: calc(100% + 0.35rem);
		left: 50%;
		width: max-content;
		max-width: 9rem;
		transform: translateX(-50%);
		border-radius: 0.25rem;
		background: rgb(5 7 18 / 91%);
		padding: 0.25rem 0.4rem;
		font-size: 0.62rem;
		line-height: 1.2;
	}

	.target:hover,
	.target.selected {
		border-color: #ffd166;
		background: #332a18;
	}

	.target:focus-visible {
		outline: 3px solid #f7fbff;
		outline-offset: 3px;
	}

	.receptor-target {
		left: 14%;
		top: 48%;
	}

	.signal-target {
		left: 33%;
		top: 57%;
	}

	.binding-target {
		left: 58%;
		top: 59%;
	}

	.contact-target {
		left: 70%;
		top: 40%;
	}

	.scene-summary {
		position: absolute;
		width: 1px;
		height: 1px;
		margin: -1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
	}

	@media (max-width: 640px) {
		.cross-section {
			min-height: 22rem;
		}

		.direct-labels text {
			font-size: 10px;
		}

		.target strong {
			display: none;
		}
	}

	@media (forced-colors: active) {
		.cross-section {
			border: 2px solid CanvasText;
			background: Canvas;
			filter: grayscale(1) contrast(1.4);
		}

		.target {
			border: 2px solid ButtonText;
			background: ButtonFace;
			color: ButtonText;
			forced-color-adjust: none;
		}
	}
</style>
