<script lang="ts">
	import { onMount } from 'svelte';
	import { replaceState } from '$app/navigation';
	import { events, sources, connections, chapters } from '$lib/visualizations/two-calendars/data';
	import {
		getEventYear,
		eventsForYear,
		formatHistoricalDate,
		parseSelection,
		createSelectionUrl,
		pickComparison,
		relationshipLabel
	} from '$lib/visualizations/two-calendars/chronology';
	import {
		renderPostcardSvg,
		postcardCaption,
		downloadPostcardSvg,
		downloadPostcardPng
	} from '$lib/visualizations/two-calendars/postcard';
	import type {
		HistoricalEvent,
		HistoricalConnection
	} from '$lib/visualizations/two-calendars/types';
	import CalendarRibbons from './CalendarRibbons.svelte';
	import CityEngraving from './CityEngraving.svelte';
	import './two-calendars.css';

	let root: HTMLElement;
	let ready = $state(false);
	let selection = $state({
		year: 1947,
		connectionId: null as string | null,
		eventId: null as string | null
	});
	let activeChapter = $state('');
	let status = $state('');
	let busy = $state(false);
	let followChapters = true;
	let replayUrl = $state(
		'https://suvroghosh.in/blog/visualizations/two-calendars-one-life?year=1947'
	);
	const years = Array.from({ length: 20 }, (_, i) => 1940 + i);
	const baseComparison = $derived(
		pickComparison(events, connections, selection.year, selection.connectionId ?? undefined)
	);
	const selectedEvent = $derived(events.find((event) => event.id === selection.eventId));
	const left = $derived(selectedEvent?.side === 'calcutta' ? selectedEvent : baseComparison.left);
	const right = $derived(selectedEvent?.side === 'america' ? selectedEvent : baseComparison.right);
	const connection = $derived(
		baseComparison.connection?.leftId === left?.id &&
			baseComparison.connection?.rightId === right?.id
			? baseComparison.connection
			: null
	);
	const postcardInput = $derived({
		year: selection.year,
		left,
		right,
		connection,
		sources,
		url: replayUrl
	});
	const postcardSvg = $derived(renderPostcardSvg(postcardInput));
	const previewUrl = $derived(
		`data:image/svg+xml;charset=utf-8,${encodeURIComponent(postcardSvg)}`
	);
	const eventSources = (event: HistoricalEvent) =>
		sources.filter((source) => event.sourceIds.includes(source.id));

	function setSelection(next: typeof selection) {
		selection = next;
		status = '';
		if (ready) {
			replayUrl = createSelectionUrl(window.location.href, next);
			// URL is derived from the current document and already includes its resolved base.
			// eslint-disable-next-line svelte/no-navigation-without-resolve
			replaceState(replayUrl, {});
		}
	}
	function selectEvent(event: HistoricalEvent) {
		const linked = connections.find(
			(item) => item.leftId === event.id || item.rightId === event.id
		);
		setSelection({
			year: getEventYear(event),
			connectionId: linked?.id ?? null,
			eventId: event.id
		});
	}
	function selectConnection(item: HistoricalConnection) {
		const event = events.find((event) => event.id === item.leftId);
		setSelection({
			year: event ? getEventYear(event) : selection.year,
			connectionId: item.id,
			eventId: null
		});
	}
	function selectChapter(id: string) {
		const chapter = chapters.find((item) => item.id === id);
		if (!chapter) return;
		activeChapter = id;
		const linked = connections.find((item) => item.id === chapter.connectionIds[0]);
		if (linked) selectConnection(linked);
		else setSelection({ year: chapter.startYear, connectionId: null, eventId: null });
	}
	async function exportPostcard(format: 'svg' | 'png') {
		busy = true;
		try {
			if (format === 'svg') await downloadPostcardSvg(postcardInput);
			else await downloadPostcardPng(postcardInput);
			status = `${format.toUpperCase()} postcard downloaded.`;
		} catch {
			status = 'The postcard could not be downloaded. Please try the SVG download.';
		} finally {
			busy = false;
		}
	}
	async function copyCaption() {
		try {
			await navigator.clipboard.writeText(postcardCaption(postcardInput));
			status = 'Caption and replay link copied.';
		} catch {
			status = 'Copy is unavailable here. Select the caption and replay link below.';
		}
	}
	onMount(() => {
		selection = parseSelection(window.location.search, events, connections);
		replayUrl = createSelectionUrl(window.location.href, selection);
		ready = true;
		const restore = () => {
			selection = parseSelection(window.location.search, events, connections);
			replayUrl = createSelectionUrl(window.location.href, selection);
		};
		window.addEventListener('popstate', restore);
		const resumeFollowing = () => {
			followChapters = true;
		};
		window.addEventListener('wheel', resumeFollowing, { passive: true });
		window.addEventListener('touchmove', resumeFollowing, { passive: true });
		const resumeWithKeyboard = (event: KeyboardEvent) => {
			if (
				event.target instanceof HTMLElement &&
				event.target.closest('input, select, textarea, button, a, summary')
			)
				return;
			if (['PageDown', 'PageUp', 'Home', 'End', ' ', 'ArrowDown', 'ArrowUp'].includes(event.key))
				followChapters = true;
		};
		window.addEventListener('keydown', resumeWithKeyboard);
		const observer = new IntersectionObserver(
			(entries) => {
				if (!followChapters) return;
				const entry = entries
					.filter((item) => item.isIntersecting)
					.sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
				if (entry && entry.target.id !== activeChapter) selectChapter(entry.target.id);
			},
			{ rootMargin: '-25% 0px -45% 0px', threshold: [0, 0.2, 0.5] }
		);
		root
			.querySelectorAll('[data-calendar-chapter]')
			.forEach((element) => observer.observe(element));
		return () => {
			observer.disconnect();
			window.removeEventListener('popstate', restore);
			window.removeEventListener('wheel', resumeFollowing);
			window.removeEventListener('touchmove', resumeFollowing);
			window.removeEventListener('keydown', resumeWithKeyboard);
		};
	});
</script>

{#snippet eventCard(event: HistoricalEvent | null, side: 'calcutta' | 'america')}
	<div class={`tc-place tc-place-${side}`}>
		<div class="tc-place-heading">
			<span class="tc-small-label"
				>{side === 'calcutta' ? '01 / EASTERN RIBBON' : '02 / WESTERN RIBBON'}</span
			>
			<h3>
				{side === 'calcutta' ? 'Calcutta' : 'America'}<span
					>{side === 'calcutta' ? 'Bengal · India' : 'Cities · States · A nation'}</span
				>
			</h3>
		</div>
		<CityEngraving {side} />
		{#if event}
			<div class="tc-event-reading" data-selected-event={event.id}>
				<p class="tc-event-date">{formatHistoricalDate(event.date)}</p>
				<p class="tc-event-scope">{event.scope} <span>· {event.theme}</span></p>
				<h4>{event.title}</h4>
				<p>{event.summary}</p>
				{#if !eventsForYear([event], selection.year).length}<p class="tc-context-note">
						Nearby context from {getEventYear(event)}; no record from this ribbon is selected for {selection.year}.
					</p>{/if}
				{#if event.qualification}<p class="tc-context-note">{event.qualification}</p>{/if}
				<div class="tc-source-links">
					{#each eventSources(event) as source (source.id)}<a
							href={source.url}
							target="_blank"
							rel="external noreferrer">{source.institution} <span aria-hidden="true">↗</span></a
						>{/each}
				</div>
			</div>
		{:else}<p class="tc-context-note">
				No record selected for this ribbon. The collection is selective; an empty space is not an
				uneventful year.
			</p>{/if}
	</div>
{/snippet}

<section
	class="tc-atlas not-prose"
	data-two-calendars
	data-tts-exclude
	data-ready={ready}
	aria-label="Two Calendars, One Life historical atlas"
	bind:this={root}
>
	<header class="tc-masthead">
		<div class="tc-edition">
			<span>SUVRO GHOSH / A SMALL ATLAS OF TIME</span><span>HISTORICAL EDITION · NO. 01</span>
		</div>
		<div class="tc-title-composition">
			<h1>Two calendars.<br /><em>One life.</em></h1>
			<div class="tc-title-aside">
				<span class="tc-date-stamp">1940 <span>↔</span> 1959</span>
				<p>Calcutta & America</p>
				<span class="tc-small-label">THE SAME YEARS.<br />DIFFERENT WORLDS.</span>
				<div class="tc-postmark" aria-hidden="true">
					<span>MEANWHILE</span><b>↔</b><span>ELSEWHERE</span>
				</div>
			</div>
		</div>
		<div class="tc-premise">
			<p>Time passed everywhere.<br /><em>It did not feel the same everywhere.</em></p>
			<div>
				Two places. Twenty years. Follow the threads between public upheavals and ordinary lives,
				between belonging and exclusion, between what changed and what endured.<a
					href="#two-calendars-explorer">Enter the calendars <span aria-hidden="true">↓</span></a
				>
			</div>
		</div>
	</header>

	<div class="tc-running-rule">
		<span>CALCUTTA / BENGAL / INDIA</span><span class="tc-running-center"
			>ONE SHARED CHRONOLOGY</span
		><span>THE UNITED STATES</span>
	</div>
	<section
		id="two-calendars-explorer"
		class="tc-explorer"
		aria-label="Explore two historical calendars"
	>
		<div class="tc-explorer-top">
			<div>
				<span class="tc-small-label">A YEAR IN TWO WORLDS</span>
				<h2>{selection.year}<span>Meanwhile…</span></h2>
			</div>
			<div class="tc-explorer-controls">
				<label
					>Explore a year<select
						aria-label="Explore a year"
						value={selection.year}
						onchange={(e) =>
							setSelection({
								year: Number(e.currentTarget.value),
								connectionId: null,
								eventId: null
							})}
						disabled={!ready}
						>{#each years as year (year)}<option value={year}>{year}</option>{/each}</select
					></label
				><label
					>Follow a thread<select
						aria-label="Choose a comparison"
						value={connection?.id ?? ''}
						onchange={(e) => {
							const item = connections.find((item) => item.id === e.currentTarget.value);
							if (item) selectConnection(item);
							else setSelection({ year: selection.year, connectionId: null, eventId: null });
						}}
						disabled={!ready}
						><option value="">The selected year</option>{#each connections as item (item.id)}<option
								value={item.id}>{item.title}</option
							>{/each}</select
					></label
				><a
					class="tc-postcard-link"
					href="#two-calendars-postcard"
					onclick={() => {
						followChapters = false;
					}}>Make a postcard <span aria-hidden="true">↗</span></a
				>
			</div>
		</div>
		<div class="tc-explorer-grid">
			{@render eventCard(left, 'calcutta')}
			<div class="tc-main-ribbons">
				<div class="tc-ribbon-caption"><span>CALCUTTA</span><span>AMERICA</span></div>
				<CalendarRibbons
					year={selection.year}
					selectedIds={[left?.id ?? '', right?.id ?? '']}
					connectionId={connection?.id ?? null}
					onselect={selectEvent}
				/>
				<div class="tc-mark-legend">
					<span><i class="tc-legend-dot"></i> dated record</span><span
						><i class="tc-legend-precision"></i> month / year precision</span
					><span><i class="tc-legend-duration"></i> duration</span>
				</div>
			</div>
			{@render eventCard(right, 'america')}
		</div>
		<div class="tc-meanwhile" aria-live="polite" aria-atomic="true">
			<span class="tc-small-label"
				>{connection ? relationshipLabel(connection.kind) : 'SELECTED HISTORICAL CONTEXT'}</span
			>
			<p>
				{connection
					? connection.rationale
					: `A selection around ${selection.year}. Read each record’s date and geographic scope; nearby context is labelled separately.`}
			</p>
			<span class="tc-thread-sample" aria-hidden="true">⌁</span>
		</div>
		<p class="tc-footnote">
			Every dot opens a record. Threads show labelled comparisons; they do not establish causation.
			The day grid is a calendar motif, not a count of events.
		</p>
		<noscript
			><p class="tc-nojs">
				The default comparison and all historical records are readable below. Enable JavaScript to
				explore years and export a postcard.
			</p></noscript
		>
	</section>

	<section class="tc-story" aria-label="Five chapters through the same years">
		<div class="tc-section-heading">
			<span class="tc-small-label">READ THE THREADS</span>
			<h2>History happens<br /><em>in the plural.</em></h2>
			<p>Five ways through the calendars.<br />Scroll to follow a different thread.</p>
		</div>
		<nav class="tc-chapter-nav" aria-label="Historical chapters">
			{#each chapters as chapter (chapter.id)}<a
					href={`#${chapter.id}`}
					aria-current={activeChapter === chapter.id ? 'step' : undefined}
					onclick={() => {
						followChapters = true;
						selectChapter(chapter.id);
					}}><span>{chapter.number}</span>{chapter.title}</a
				>{/each}
		</nav>
		<div class="tc-story-layout">
			<div class="tc-story-stage">
				<div class="tc-story-stage-top">
					<span>CALCUTTA</span><span>{selection.year}</span><span>AMERICA</span>
				</div>
				<CalendarRibbons
					year={selection.year}
					selectedIds={[left?.id ?? '', right?.id ?? '']}
					connectionId={connection?.id ?? null}
					compact
					prefix="story"
					onselect={selectEvent}
				/>
				<div class="tc-story-pair">
					<p>
						<span>CALCUTTA / INDIA</span>{left?.title ?? 'No selected record'}{#if left}<small
								>{formatHistoricalDate(left.date)}</small
							>{/if}
					</p>
					<span aria-hidden="true">↔</span>
					<p>
						<span>UNITED STATES</span>{right?.title ?? 'No selected record'}{#if right}<small
								>{formatHistoricalDate(right.date)}</small
							>{/if}
					</p>
				</div>
			</div>
			<div class="tc-chapters">
				{#each chapters as chapter (chapter.id)}
					{@const mobileThread = connections.find(
						(item) =>
							item.id ===
							(chapter.connectionIds.includes(connection?.id ?? '')
								? connection?.id
								: chapter.connectionIds[0])
					)}
					<article
						id={chapter.id}
						data-calendar-chapter
						class:tc-chapter-active={activeChapter === chapter.id}
					>
						<div class="tc-chapter-meta">
							<span>{chapter.number}</span><span>{chapter.startYear}—{chapter.endYear}</span>
						</div>
						<h3>{chapter.title}</h3>
						<p class="tc-chapter-subtitle">{chapter.subtitle}</p>
						<p>{chapter.body}</p>
						{#if mobileThread}<div class="tc-chapter-mobile-pair">
								{#each ['calcutta', 'america'] as side (side)}
									{@const record = events.find(
										(item) =>
											item.id === (side === 'calcutta' ? mobileThread.leftId : mobileThread.rightId)
									)}
									{#if record}<div>
											<span class="tc-small-label"
												>{side === 'calcutta' ? 'CALCUTTA / INDIA' : 'AMERICA'}</span
											>
											<p class="tc-mobile-date">{formatHistoricalDate(record.date)}</p>
											<h4>{record.title}</h4>
											<p>{record.summary.split(/(?<=[.!?])\s/)[0]}</p>
											<a href={`#record-${record.id}`}>Read record & sources ↗</a>
										</div>{/if}
								{/each}
							</div>{/if}
						<div class="tc-chapter-connections">
							{#each chapter.connectionIds as id (id)}{@const item = connections.find(
									(entry) => entry.id === id
								)}{#if item}<button
										type="button"
										aria-pressed={connection?.id === id}
										onclick={() => selectConnection(item)}
										><span aria-hidden="true">↔</span>{item.title}<span class="tc-small-label"
											>{relationshipLabel(item.kind)}</span
										></button
									>{/if}{/each}
						</div>
					</article>{/each}
			</div>
		</div>
	</section>

	<section
		id="two-calendars-postcard"
		class="tc-postcard-section"
		aria-label="Make a historical postcard"
	>
		<div class="tc-postcard-intro">
			<span class="tc-small-label">TAKE A THREAD WITH YOU</span>
			<h2>A small postcard.<br /><em>Two whole worlds.</em></h2>
			<p>
				Your selected records, their actual dates, and the thread between them. A small piece of
				this atlas to keep or pass along.
			</p>
			<a href="#two-calendars-explorer">Change the year or comparison ↑</a>
			<div class="tc-export-actions">
				<button
					type="button"
					class="tc-primary-button"
					onclick={() => exportPostcard('png')}
					disabled={!ready || busy}>Download PNG <span aria-hidden="true">↓</span></button
				><button type="button" onclick={() => exportPostcard('svg')} disabled={!ready || busy}
					>Download SVG</button
				><button type="button" onclick={copyCaption} disabled={!ready}>Copy caption & link</button>
			</div>
			<p class="tc-export-status" role="status">
				{status || '1600 × 1000 · Sources included · Replayable selection'}
			</p>
		</div>
		<div class="tc-postcard-preview" data-postcard-preview>
			<img
				src={previewUrl}
				width="1600"
				height="1000"
				alt={`Historical postcard for ${selection.year}: ${left?.title ?? 'Calcutta'} and ${right?.title ?? 'America'}, with actual dates and source credits.`}
			/>
			<p>{postcardCaption(postcardInput)}</p>
		</div>
	</section>

	<section class="tc-reading-room" aria-label="Historical reading room">
		<div class="tc-section-heading">
			<span class="tc-small-label">THE READING ROOM</span>
			<h2>The evidence<br /><em>behind the threads.</em></h2>
			<p>A selective atlas, with an open notebook.</p>
		</div>
		<details>
			<summary>Sources & selection <span>{sources.length} references ↗</span></summary>
			<div class="tc-methodology">
				<p>
					This is a curated comparison of 1940–1959, not a complete account of either place. Each
					record identifies its geographic scope. A city, a region and a country are different
					scales of experience.
				</p>
				<p>
					The shared axis uses civil dates, months and years. Point-date precision, documented
					duration and uncertainty are distinct. Thematic threads are editorial comparisons; a
					documented link requires supporting evidence. Gaps mean no record was included.
				</p>
				<p>
					All skyline drawings are original schematic illustrations. Calendar grids are visual
					motifs. No archival images, fabricated clock times or private family records are used.
				</p>
			</div>
			<ol class="tc-source-list">
				{#each sources as source (source.id)}<li>
						<span>{source.institution}</span><a
							href={source.url}
							target="_blank"
							rel="external noreferrer">{source.title} ↗</a
						>{#if source.note}<p>{source.note}</p>{/if}
					</li>{/each}
			</ol>
		</details>
		<details>
			<summary>Read all historical records <span>{events.length} records ↓</span></summary>
			<div class="tc-record-list">
				{#each [...events].sort((a, b) => getEventYear(a) - getEventYear(b)) as event (event.id)}<article
						id={`record-${event.id}`}
					>
						<span class="tc-small-label"
							>{event.side === 'calcutta' ? 'CALCUTTA / INDIA' : 'AMERICA'} · {formatHistoricalDate(
								event.date
							)}</span
						>
						<h3>{event.title}</h3>
						<p class="tc-event-scope">{event.scope} · {event.theme}</p>
						<p>{event.summary}</p>
						{#if event.qualification}<p class="tc-context-note">{event.qualification}</p>{/if}
						<div class="tc-source-links">
							{#each eventSources(event) as source (source.id)}<a
									href={source.url}
									target="_blank"
									rel="external noreferrer">{source.institution} ↗</a
								>{/each}
						</div>
						<button
							type="button"
							onclick={() => {
								selectEvent(event);
								document.getElementById('two-calendars-explorer')?.scrollIntoView();
							}}
							disabled={!ready}>Find this record in the calendars ↑</button
						>
					</article>{/each}
			</div>
		</details>
		<footer class="tc-colophon">
			<p>Two calendars. One shared chronology.<br /><em>Countless ways of living it.</em></p>
			<span>SUVRO GHOSH<br />HISTORICAL EDITION / 1940—1959</span>
		</footer>
	</section>
</section>
