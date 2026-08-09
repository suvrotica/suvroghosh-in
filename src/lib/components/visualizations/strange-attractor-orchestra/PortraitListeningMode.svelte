<script lang="ts">
	import { onMount } from 'svelte';
	import { getAttractorDefinition } from '$lib/visualizations/strange-attractor-orchestra/model/registry';
	import type { OrchestraSnapshot } from '$lib/visualizations/strange-attractor-orchestra/types';
	import {
		DEFAULT_ORCHESTRA_SNAPSHOT,
		parseOrchestraUrlState,
		serializeOrchestraUrlState
	} from '$lib/visualizations/strange-attractor-orchestra/url-state';
	type Selection = { id: string; label: string };
	type Props = {
		reason?: 'portrait' | 'save-data' | 'loading' | 'failure';
		onplay?: (snapshot: OrchestraSnapshot) => void;
		playing?: boolean;
		loading?: boolean;
		status?: string;
	};

	let {
		reason = 'portrait',
		onplay = () => undefined,
		playing = false,
		loading = false,
		status = ''
	}: Props = $props();
	let attractorId = $state('langford');
	let soundWorld = $state('glass');
	let portraitSnapshot = $state<OrchestraSnapshot>({ ...DEFAULT_ORCHESTRA_SNAPSHOT });

	function restoreSelection(): void {
		const restored = parseOrchestraUrlState(window.location.href).state;
		portraitSnapshot = restored;
		attractorId = restored.attractorId;
		soundWorld = restored.soundWorld;
	}

	function syncSelection(nextAttractor = attractorId, nextWorld = soundWorld): void {
		attractorId = nextAttractor;
		soundWorld = nextWorld;
		const current = parseOrchestraUrlState(window.location.href, portraitSnapshot).state;
		const definition = getAttractorDefinition(attractorId as typeof current.attractorId);
		portraitSnapshot = {
			...current,
			attractorId: attractorId as typeof current.attractorId,
			soundWorld: soundWorld as typeof current.soundWorld,
			stableStepSize: definition.stepSize ?? 1
		};
		const params = serializeOrchestraUrlState(
			portraitSnapshot,
			new URLSearchParams(window.location.search)
		);
		const query = params.toString();
		window.history.replaceState(
			null,
			'',
			`${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`
		);
	}

	const attractors: readonly Selection[] = [
		{ id: 'langford', label: 'Langford torus-breakdown' },
		{ id: 'lorenz-63', label: 'Lorenz–63' },
		{ id: 'rossler', label: 'Rössler' },
		{ id: 'thomas', label: 'Thomas labyrinth' },
		{ id: 'sprott-b', label: 'Sprott B' },
		{ id: 'rucklidge', label: 'Rucklidge' },
		{ id: 'chua', label: 'Chua double scroll' },
		{ id: 'henon', label: 'Hénon map' },
		{ id: 'mackey-glass', label: 'Mackey–Glass delay system' },
		{ id: 'rabinovich-fabrikant', label: 'Rabinovich–Fabrikant' }
	];
	const worlds: readonly Selection[] = [
		{ id: 'glass', label: 'Glass Observatory' },
		{ id: 'magnetic', label: 'Magnetic Weather' },
		{ id: 'swarm', label: 'Bioluminescent Swarm' },
		{ id: 'radio', label: 'Radio Telescope After Midnight' }
	];
	let reasonText = $derived(
		reason === 'save-data'
			? 'Data Saver is on, so the expensive visual renderer stays unopened.'
			: reason === 'failure'
				? 'The live renderer could not continue, but the poster, composition and explanation remain available.'
				: reason === 'loading'
					? 'Preparing the wider conducting instrument.'
					: 'The full conducting instrument is available on a wider landscape screen.'
	);

	onMount(() => {
		restoreSelection();
		window.addEventListener('popstate', restoreSelection);
		return () => window.removeEventListener('popstate', restoreSelection);
	});
</script>

<section class="portrait" data-testid="sa-portrait-mode" aria-labelledby="sa-portrait-title">
	<div class="poster">
		<img
			src="/images/visualizations/strange-attractor-orchestra/langford-poster.png"
			alt="A deterministic Langford orbit shown faintly beneath its copper and cyan curl-weather transformation"
			width="1440"
			height="1080"
		/>
		<div class="title">
			<p>Poster &amp; listening mode</p>
			<h2 id="sa-portrait-title">A curve enters weather—and sings.</h2>
		</div>
	</div>
	<p class="explanation">
		The canonical orbit remains intact. A seeded curl field bends only its visible copy; measured
		returns, regions and folds become a deterministic score.
	</p>
	<div class="selectors">
		<label>
			<span>Attractor</span>
			<select
				value={attractorId}
				disabled={loading}
				onchange={(event) => syncSelection(event.currentTarget.value, soundWorld)}
			>
				{#each attractors as attractor (attractor.id)}
					<option value={attractor.id}>{attractor.label}</option>
				{/each}
			</select>
		</label>
		<label>
			<span>Sound world</span>
			<select
				value={soundWorld}
				disabled={loading}
				onchange={(event) => syncSelection(attractorId, event.currentTarget.value)}
			>
				{#each worlds as world (world.id)}
					<option value={world.id}>{world.label}</option>
				{/each}
			</select>
		</label>
	</div>
	<button
		class="play"
		type="button"
		disabled={loading}
		onclick={() => onplay({ ...portraitSnapshot })}
	>
		{loading ? 'Preparing composition…' : playing ? 'Stop the composition' : 'Play the composition'}
	</button>
	<div class="progress" aria-hidden="true"><span class:playing></span></div>
	<p class="caption" aria-live="polite">{status || 'Waiting for an explicit sound gesture.'}</p>
	<p class="mode-note">
		{reasonText} No WebGL point cloud, bloom, wake system or live diagnostic is loaded here.
	</p>
	<noscript>
		<p>
			The static poster and the complete essay remain available without JavaScript. Audio requires a
			browser gesture.
		</p>
	</noscript>
</section>

<style>
	.portrait {
		width: min(100%, 43rem);
		margin-inline: auto;
		border: 1px solid rgb(229 221 196 / 22%);
		border-radius: 0.7rem;
		background: #070c0e;
		padding: clamp(0.65rem, 3vw, 1rem);
		color: #eee9dc;
		box-shadow: 0 1.5rem 4rem rgb(0 0 0 / 34%);
	}

	.poster {
		position: relative;
		aspect-ratio: 4 / 3;
		overflow: hidden;
		border-radius: 0.45rem;
		background: #030709;
	}

	.poster img {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.title {
		position: absolute;
		inset: auto 0 0;
		background: linear-gradient(transparent, rgb(3 7 9 / 95%));
		padding: 4rem 1rem 1rem;
	}

	.title p,
	.title h2 {
		margin: 0;
	}

	.title p,
	.mode-note,
	.caption,
	label span {
		font-family: var(--font-mono, monospace);
	}

	.title p {
		color: #75c9cc;
		font-size: 0.62rem;
		font-weight: 700;
		letter-spacing: 0.11em;
		text-transform: uppercase;
	}

	.title h2 {
		max-width: 18ch;
		margin-top: 0.3rem;
		font: 740 clamp(1.65rem, 7vw, 3.1rem) / 0.98 var(--font-serif, serif);
		letter-spacing: -0.045em;
		text-wrap: balance;
	}

	.explanation {
		margin: 0.9rem 0;
		color: #b3b2aa;
		font: 0.82rem/1.55 var(--font-sans, sans-serif);
	}

	.selectors {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.55rem;
	}

	label {
		display: grid;
		gap: 0.3rem;
	}

	label span {
		color: #82908d;
		font-size: 0.61rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	select,
	button {
		min-height: 3rem;
		border: 1px solid rgb(226 220 201 / 24%);
		border-radius: 0.42rem;
		background: #0c1316;
		color: #e8e4d8;
		font: 660 0.76rem/1.15 var(--font-sans, sans-serif);
	}

	select {
		width: 100%;
		padding-inline: 0.65rem;
	}

	button.play {
		width: 100%;
		margin-top: 0.7rem;
		border-color: #b9815e;
		background: #b9815e;
		color: #160e09;
		font-weight: 760;
		cursor: pointer;
	}

	select:focus-visible,
	button:focus-visible {
		outline: 3px solid #8ee8eb;
		outline-offset: 2px;
	}

	.progress {
		height: 2px;
		margin-top: 0.7rem;
		overflow: hidden;
		background: rgb(229 221 196 / 13%);
	}

	.progress span {
		display: block;
		width: 0;
		height: 100%;
		background: #75c9cc;
	}

	.progress span.playing {
		width: 100%;
		animation: listen-progress 15s linear forwards;
	}

	@keyframes listen-progress {
		from {
			transform: translateX(-100%);
		}
		to {
			transform: translateX(0);
		}
	}

	.caption {
		min-height: 1.4em;
		margin: 0.55rem 0 0;
		color: #9fc5c4;
		font-size: 0.66rem;
		line-height: 1.4;
	}

	.mode-note {
		margin: 0.55rem 0 0;
		color: #747d7a;
		font-size: 0.61rem;
		line-height: 1.45;
	}

	@media (max-width: 520px) {
		.selectors {
			grid-template-columns: 1fr;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.progress span.playing {
			width: 100%;
			animation: none;
		}
	}

	@media (forced-colors: active) {
		.portrait,
		select,
		button.play {
			border-color: CanvasText;
			background: Canvas;
			color: CanvasText;
		}
	}
</style>
