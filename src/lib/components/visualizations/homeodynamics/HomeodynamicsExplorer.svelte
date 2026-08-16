<script lang="ts">
	import { onMount } from 'svelte';
	import EcosystemLab from './EcosystemLab.svelte';
	import FeedbackLab from './FeedbackLab.svelte';
	import TimeMicroscope from './TimeMicroscope.svelte';
	import './homeodynamics.css';

	let paused = $state(false);
	let ready = $state(false);

	onMount(() => {
		ready = true;
	});
</script>

<figure
	class="homeodynamics-explorer article-breakout not-prose"
	data-testid="homeodynamics-explorer"
	data-all-paused={paused}
	data-ready={ready}
	lang="en-GB"
>
	<header class="explorer-header">
		<div>
			<p class="explorer-eyebrow">An evidence-labelled time microscope</p>
			<h2>Living stability has a shape in time</h2>
			<p class="explorer-deck">
				Change the window, disturb a feedback loop, then intervene in a coupled ecosystem. The same
				instrument keeps measurements, reported ranges, mathematical models and disputed inferences
				visibly distinct.
			</p>
		</div>
		<button
			type="button"
			class="pause-all"
			aria-pressed={paused}
			onclick={() => (paused = !paused)}
			data-tts-exclude
		>
			{paused ? 'Resume permitted motion' : 'Pause all motion'}
		</button>
	</header>

	<nav class="explorer-index" aria-label="Explorer sections" data-tts-exclude>
		<a href="#time-microscope-title"><span>01</span> Time microscope</a>
		<a href="#feedback-lab-title"><span>02</span> Feedback lab</a>
		<a href="#ecosystem-lab-title"><span>03</span> Ecosystem lab</a>
	</nav>

	<div class="definition-strip" aria-label="Dynamic-systems vocabulary">
		<div><strong>Fixed point</strong><span>return towards one state</span></div>
		<div><strong>Limit cycle</strong><span>return towards one periodic orbit</span></div>
		<div><strong>Oscillation</strong><span>a pattern; mechanism still to be established</span></div>
	</div>

	<TimeMicroscope />
	<FeedbackLab {paused} />
	<EcosystemLab {paused} />

	<footer class="explorer-guardrail">
		<strong>Interpretive guardrail</strong>
		<p>
			Snapshots and reference ranges remain useful. Rhythmicity is not synonymous with health:
			arrhythmias, seizures, tremor and endocrine dysregulation are dynamic too. This instrument
			adds time to the picture; it does not turn every clinical observation into an oscillator.
		</p>
	</footer>

	<noscript>
		<p class="noscript-note">
			JavaScript is disabled. The article, evidence classifications, equations and source links
			remain available; interactive traces require JavaScript.
		</p>
	</noscript>
	<figcaption>
		Original deterministic SVG instrument. No paper figure is copied and no data are fetched in the
		reader’s browser.
	</figcaption>
</figure>
