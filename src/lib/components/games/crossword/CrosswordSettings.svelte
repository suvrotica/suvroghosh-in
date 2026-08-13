<script lang="ts">
	import { onMount } from 'svelte';
	import type { CrosswordSettings, PlayMode } from '$lib/games/crossword';

	let {
		settings,
		onupdate,
		onresetround,
		onclearpack,
		onclearall,
		onexport,
		onimport,
		onclose
	}: {
		settings: CrosswordSettings;
		onupdate: (settings: CrosswordSettings) => void;
		onresetround: () => void;
		onclearpack: () => void;
		onclearall: () => void;
		onexport: () => void;
		onimport: (file: File) => void;
		onclose: () => void;
	} = $props();

	let fileInput: HTMLInputElement;
	let closeButton: HTMLButtonElement;

	function patch(value: Partial<CrosswordSettings>) {
		onupdate({ ...settings, ...value });
	}

	function chooseMode(playMode: PlayMode) {
		patch({ playMode });
	}

	onMount(() => closeButton.focus({ preventScroll: true }));
</script>

<div
	class="settings-sheet"
	role="dialog"
	aria-modal="false"
	aria-labelledby="crossword-settings-title"
>
	<header>
		<div>
			<p>Local instrument settings</p>
			<h2 id="crossword-settings-title">How the grid should behave</h2>
		</div>
		<button
			bind:this={closeButton}
			type="button"
			class="close"
			aria-label="Close settings"
			onclick={onclose}>×</button
		>
	</header>

	<fieldset>
		<legend>Checking mode</legend>
		<label class:active={settings.playMode === 'coach'}>
			<input
				type="radio"
				name="crossword-play-mode"
				checked={settings.playMode === 'coach'}
				onchange={() => chooseMode('coach')}
			/>
			<span><strong>Coach</strong><small>Quietly marks a letter that does not fit.</small></span>
		</label>
		<label class:active={settings.playMode === 'traditional'}>
			<input
				type="radio"
				name="crossword-play-mode"
				checked={settings.playMode === 'traditional'}
				onchange={() => chooseMode('traditional')}
			/>
			<span><strong>Traditional</strong><small>Accepts letters until you ask to check.</small></span
			>
		</label>
	</fieldset>

	<fieldset>
		<legend>Feedback and access</legend>
		<label class="switch-line">
			<input
				type="checkbox"
				checked={settings.soundEnabled}
				onchange={(event) => patch({ soundEnabled: event.currentTarget.checked })}
			/>
			<span
				><strong>Small sound cues</strong><small>Off by default; no music or autoplay.</small></span
			>
		</label>
		<label class="switch-line">
			<input
				type="checkbox"
				checked={settings.hapticsEnabled}
				onchange={(event) => patch({ hapticsEnabled: event.currentTarget.checked })}
			/>
			<span><strong>Device haptics</strong><small>One brief pulse where supported.</small></span>
		</label>
		<label class="switch-line">
			<input
				type="checkbox"
				checked={settings.timingEnabled}
				onchange={(event) => patch({ timingEnabled: event.currentTarget.checked })}
			/>
			<span
				><strong>Show elapsed time</strong><small>No deadline; simply a private clock.</small></span
			>
		</label>
		<label class="switch-line">
			<input
				type="checkbox"
				checked={settings.announcementsEnabled}
				onchange={(event) => patch({ announcementsEnabled: event.currentTarget.checked })}
			/>
			<span
				><strong>Nonessential announcements</strong><small
					>Keep or silence clue-completion notices.</small
				></span
			>
		</label>
	</fieldset>

	<fieldset class="data-tools">
		<legend>Data on this device</legend>
		<p>Letters, preferences, and learning history live in this browser. They are not uploaded.</p>
		<div>
			<button type="button" onclick={onexport}>Export JSON</button>
			<button type="button" onclick={() => fileInput.click()}>Import JSON</button>
			<input
				bind:this={fileInput}
				class="file-input"
				type="file"
				accept="application/json,.json"
				onchange={(event) => {
					const file = event.currentTarget.files?.[0];
					if (file) onimport(file);
					event.currentTarget.value = '';
				}}
			/>
		</div>
	</fieldset>

	<details class="danger-zone">
		<summary>Reset or clear progress</summary>
		<div>
			<button type="button" onclick={onresetround}>Reset current puzzle</button>
			<button type="button" onclick={onclearpack}>Clear this pack</button>
			<button type="button" class="danger" onclick={onclearall}>Clear all crossword data</button>
		</div>
	</details>
</div>

<style>
	.settings-sheet {
		position: absolute;
		z-index: 20;
		top: clamp(0.5rem, 2vw, 1.2rem);
		right: clamp(0.5rem, 2vw, 1.2rem);
		bottom: clamp(0.5rem, 2vw, 1.2rem);
		width: min(31rem, calc(100% - 1rem));
		overflow: auto;
		overscroll-behavior: contain;
		padding: 1rem;
		border: 1px solid color-mix(in oklab, var(--cw-ink) 35%, transparent);
		background: var(--cw-paper-raised);
		color: var(--cw-ink);
		box-shadow: 0 1rem 4rem color-mix(in oklab, var(--cw-ink) 35%, transparent);
	}

	header {
		display: flex;
		align-items: start;
		justify-content: space-between;
		gap: 1rem;
		padding-bottom: 0.8rem;
		border-bottom: 3px double color-mix(in oklab, var(--cw-ink) 35%, transparent);
	}

	header p,
	header h2 {
		margin: 0;
	}

	header p {
		color: var(--cw-ochre);
		font: 800 0.62rem/1.2 var(--font-mono, ui-monospace, monospace);
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}

	header h2 {
		margin-top: 0.2rem;
		font-size: 1.35rem;
	}

	.close {
		width: 2.75rem;
		min-width: 2.75rem;
		padding: 0;
		font-size: 1.5rem;
		line-height: 1;
	}

	fieldset {
		display: grid;
		gap: 0.45rem;
		margin: 1rem 0 0;
		padding: 0;
		border: 0;
	}

	legend {
		margin-bottom: 0.4rem;
		font: 850 0.67rem/1.2 var(--font-mono, ui-monospace, monospace);
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	label {
		display: flex;
		min-height: 2.75rem;
		gap: 0.65rem;
		align-items: center;
		padding: 0.65rem;
		border: 1px solid color-mix(in oklab, var(--cw-ink) 20%, transparent);
		cursor: pointer;
	}

	label.active {
		border-color: var(--cw-moss);
		background: color-mix(in oklab, var(--cw-paper-raised) 84%, var(--cw-moss));
	}

	input[type='radio'],
	input[type='checkbox'] {
		width: 1.15rem;
		height: 1.15rem;
		accent-color: var(--cw-moss);
	}

	label span {
		display: grid;
		gap: 0.1rem;
	}

	label strong {
		font-size: 0.79rem;
	}

	label small,
	.data-tools p {
		color: var(--cw-muted);
		font-size: 0.68rem;
		line-height: 1.35;
	}

	.data-tools p {
		margin: 0;
	}

	.data-tools div,
	.danger-zone div {
		display: flex;
		flex-wrap: wrap;
		gap: 0.45rem;
	}

	button {
		min-height: 2.75rem;
		padding: 0.55rem 0.7rem;
		border: 1px solid color-mix(in oklab, var(--cw-ink) 35%, transparent);
		border-radius: 0.28rem;
		background: transparent;
		color: var(--cw-ink);
		font-size: 0.72rem;
		font-weight: 800;
		cursor: pointer;
	}

	button:focus-visible,
	input:focus-visible,
	summary:focus-visible {
		outline: 3px solid var(--cw-focus);
		outline-offset: 2px;
	}

	.file-input {
		position: absolute;
		width: 1px;
		height: 1px;
		opacity: 0;
	}

	.danger-zone {
		margin-top: 1rem;
		padding: 0.7rem;
		border: 1px dashed color-mix(in oklab, var(--cw-ink) 30%, transparent);
	}

	.danger-zone summary {
		min-height: 2rem;
		font-size: 0.72rem;
		font-weight: 800;
		cursor: pointer;
	}

	.danger-zone div {
		margin-top: 0.6rem;
	}

	.danger {
		border-color: #8f2525;
		color: #8f2525;
	}

	@media (max-width: 520px) {
		.settings-sheet {
			top: 0;
			right: 0;
			bottom: 0;
			width: 100%;
		}
	}

	@media (forced-colors: active) {
		.settings-sheet,
		label,
		button,
		.danger-zone {
			border: 2px solid CanvasText;
			background: Canvas;
			color: CanvasText;
			box-shadow: none;
		}

		label.active {
			background: Highlight;
			color: HighlightText;
		}
	}
</style>
