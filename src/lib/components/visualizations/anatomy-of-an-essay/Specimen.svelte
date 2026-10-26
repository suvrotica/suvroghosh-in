<script lang="ts">
	import { onMount } from 'svelte';
	import { buildSpecimen, specimenInner } from '$lib/visualizations/anatomy-of-an-essay/geometry';
	import { SPECIMEN_STYLES } from '$lib/visualizations/anatomy-of-an-essay/render';
	import {
		ANATOMY_LAYERS,
		type AnatomyLayer,
		type EssayDocument
	} from '$lib/visualizations/anatomy-of-an-essay/types';

	let {
		document,
		activeParagraph = '',
		selectedSentence = '',
		layers = ANATOMY_LAYERS,
		dissected = false,
		normalized = false,
		playing = true,
		onselect,
		onpreview,
		oncluster
	}: {
		document: EssayDocument;
		activeParagraph?: string;
		selectedSentence?: string;
		layers?: AnatomyLayer[];
		dissected?: boolean;
		normalized?: boolean;
		playing?: boolean;
		onselect?: (sentenceId: string) => void;
		onpreview?: (sentenceId: string | null) => void;
		oncluster?: (word: string) => void;
	} = $props();

	let host = $state<HTMLDivElement>();
	let visible = $state(false),
		pageVisible = $state(true),
		reduced = $state(false);
	const geometry = $derived(buildSpecimen(document, normalized));
	const markup = $derived(`<style>${SPECIMEN_STYLES}</style>${specimenInner(geometry)}`);
	const sentences = $derived(document.paragraphs.flatMap((paragraph) => paragraph.sentences));
	const omitted = $derived(Object.values(geometry.omitted).reduce((sum, value) => sum + value, 0));
	let preview = $state('');
	const keyboardIndex = $derived(
		Math.max(
			0,
			sentences.findIndex((sentence) => sentence.id === (preview || selectedSentence))
		)
	);

	function eventTarget(event: Event) {
		return event.target instanceof Element
			? event.target.closest<SVGElement>('[data-sentence],[data-cluster]')
			: null;
	}
	function click(event: MouseEvent) {
		const item = eventTarget(event);
		if (item?.dataset.cluster) oncluster?.(item.dataset.cluster);
		else if (item?.dataset.sentence) onselect?.(item.dataset.sentence);
	}
	function hover(event: PointerEvent) {
		const item = eventTarget(event);
		const next = item?.dataset.sentence || '';
		if (preview !== next) {
			preview = next;
			onpreview?.(next || null);
		}
	}
	function clearPreview() {
		preview = '';
		onpreview?.(null);
	}
	function keydown(event: KeyboardEvent) {
		if (!sentences.length) return;
		const index = sentences.findIndex((sentence) => sentence.id === (preview || selectedSentence));
		let next = index;
		if (event.key === 'ArrowDown' || event.key === 'ArrowRight')
			next = (index + 1) % sentences.length;
		else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft')
			next = (index - 1 + sentences.length) % sentences.length;
		else if (event.key === 'Home') next = 0;
		else if (event.key === 'End') next = sentences.length - 1;
		else if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			onselect?.(sentences[Math.max(0, index)].id);
			return;
		} else if (event.key === 'Escape') {
			clearPreview();
			return;
		} else return;
		event.preventDefault();
		preview = sentences[next].id;
		onpreview?.(preview);
	}

	$effect(() => {
		// Geometry remains unchanged: only the live selection attributes are updated.
		const selected = selectedSentence,
			active = activeParagraph,
			hovered = preview,
			shown = layers,
			content = markup;
		if (!host || !content) return;
		for (const node of host.querySelectorAll<SVGElement>('[data-paragraph]')) {
			node.classList.toggle('is-active', !!active && node.dataset.paragraph === active);
			node.classList.toggle('is-selected', !!selected && node.dataset.sentence === selected);
			node.classList.toggle('is-preview', !!hovered && node.dataset.sentence === hovered);
		}
		for (const node of host.querySelectorAll<SVGElement>('[data-layer]')) {
			const shownLayer = shown.includes(node.dataset.layer as AnatomyLayer);
			node.setAttribute('visibility', shownLayer ? 'visible' : 'hidden');
			node.setAttribute('aria-hidden', String(!shownLayer));
		}
	});
	onMount(() => {
		const surface = host;
		if (!surface) return;
		const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
		const updateMotion = () => {
			reduced = motion.matches;
		};
		const updatePage = () => {
			pageVisible = !window.document.hidden;
		};
		updateMotion();
		updatePage();
		motion.addEventListener('change', updateMotion);
		window.document.addEventListener('visibilitychange', updatePage);
		const observer = new IntersectionObserver(
			(entries) => {
				visible = entries[entries.length - 1].isIntersecting;
			},
			{ rootMargin: '20px' }
		);
		observer.observe(surface);
		return () => {
			observer.disconnect();
			motion.removeEventListener('change', updateMotion);
			window.document.removeEventListener('visibilitychange', updatePage);
		};
	});
</script>

<!-- A single keyboard surface mirrors the complete sentence index in the reader. -->
<div
	class="ea-specimen"
	class:is-dissected={dissected}
	class:is-playing={playing && visible && pageVisible && !reduced}
	bind:this={host}
	role="slider"
	tabindex="0"
	aria-orientation="vertical"
	aria-valuemin="1"
	aria-valuemax={Math.max(1, sentences.length)}
	aria-valuenow={keyboardIndex + 1}
	aria-valuetext={`Sentence ${keyboardIndex + 1}: ${sentences[keyboardIndex]?.text ?? 'No sentences'}`}
	aria-label={`${document.title}. Essay specimen. Arrow keys preview sentences; Enter selects. Escape clears preview.`}
	onclick={click}
	onpointermove={hover}
	onpointerleave={clearPreview}
	onkeydown={keydown}
>
	<svg
		xmlns="http://www.w3.org/2000/svg"
		class="ea-svg"
		viewBox="0 0 600 760"
		role="img"
		aria-label={`Structural portrait: ${document.measurements.paragraphs} paragraph organs and ${document.measurements.sentences} sentence ribs`}
	>
		{@html markup}
	</svg>
	{#if omitted}<p class="ea-density-note">
			Dense specimen: {omitted} structures condensed. Every passage remains available in the text index.
		</p>{/if}
</div>

<style>
	.ea-specimen {
		width: 100%;
		position: relative;
	}
	.ea-specimen:focus-visible {
		outline: 2px solid var(--ea-accent);
		outline-offset: 3px;
	}
	.ea-svg {
		display: block;
		width: 100%;
		height: auto;
	}
	.ea-density-note {
		margin: 0 10px 12px;
		font: 9px/1.5 monospace;
		color: var(--ea-muted);
	}
	:global(.dark) .ea-specimen,
	:global([data-theme='dark']) .ea-specimen {
		--ea-tissue-light: #77755f;
		--ea-tissue: #51543e;
		--ea-tissue-shadow: #282c23;
		--ea-bone-light: #d6d0b5;
		--ea-bone: #a29c80;
		--ea-bone-shadow: #65644c;
		--ea-coil: #9d8b74;
	}
</style>
