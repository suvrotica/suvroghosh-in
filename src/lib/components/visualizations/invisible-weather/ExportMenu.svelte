<script lang="ts">
	type ExportAction = () => void | Promise<void>;

	type Props = {
		disabled?: boolean;
		selectedAvailable: boolean;
		onGallery: (scale: 1 | 2 | 4) => void | Promise<void>;
		onSelected: ExportAction;
		onJson: ExportAction;
		onStatus?: (message: string) => void;
	};

	let {
		disabled = false,
		selectedAvailable,
		onGallery,
		onSelected,
		onJson,
		onStatus = () => {}
	}: Props = $props();
	let busy = $state(false);
	let localStatus = $state('');

	async function run(label: string, action: ExportAction) {
		if (busy || disabled) return;
		busy = true;
		localStatus = `Preparing ${label}…`;
		onStatus(localStatus);
		try {
			await action();
			localStatus = `${label} is ready.`;
		} catch (error) {
			localStatus =
				error instanceof Error ? error.message : `${label} could not be prepared in this browser.`;
		} finally {
			busy = false;
			onStatus(localStatus);
		}
	}
</script>

<details class="export-menu" data-testid="invisible-weather-export-menu">
	<summary aria-label="Open save and export menu">Save</summary>
	<div class="menu" role="group" aria-label="Export the exhibition">
		<button
			type="button"
			disabled={busy || disabled}
			onclick={() => run('gallery PNG', () => onGallery(1))}
		>
			Gallery PNG · 1×
		</button>
		<button
			type="button"
			disabled={busy || disabled}
			onclick={() => run('two-times gallery PNG', () => onGallery(2))}
		>
			Gallery PNG · 2×
		</button>
		<button
			type="button"
			disabled={busy || disabled}
			onclick={() => run('four-times gallery PNG', () => onGallery(4))}
		>
			Gallery PNG · 4×
		</button>
		<button
			type="button"
			disabled={busy || disabled || !selectedAvailable}
			onclick={() => run('selected-work PNG', onSelected)}
		>
			Selected work PNG
		</button>
		<button
			type="button"
			disabled={busy || disabled}
			onclick={() => run('exhibition recipe', onJson)}
		>
			Recipe JSON
		</button>
	</div>
	<p class="sr-status" role="status" aria-live="polite">{localStatus}</p>
</details>

<style>
	.export-menu {
		position: relative;
		margin: 0;
	}

	summary {
		display: inline-flex;
		min-height: 2.75rem;
		align-items: center;
		border: 1px solid var(--iw-rule, #a9a08f);
		border-radius: 999px;
		background: var(--iw-control, #f5efe4);
		padding: 0.55rem 0.9rem;
		color: var(--iw-ink, #24231f);
		font: 700 0.76rem/1 var(--font-sans);
		letter-spacing: 0.02em;
		cursor: pointer;
		list-style-position: inside;
	}

	.menu {
		position: absolute;
		z-index: 30;
		right: 0;
		display: grid;
		min-width: 14.5rem;
		margin-top: 0.4rem;
		border: 1px solid var(--iw-rule, #a9a08f);
		border-radius: 0.65rem;
		background: var(--iw-panel, #fbf7ef);
		box-shadow: 0 1rem 2.5rem rgb(35 30 22 / 24%);
		padding: 0.35rem;
	}

	button {
		min-height: 2.75rem;
		border: 0;
		border-bottom: 1px solid color-mix(in srgb, var(--iw-rule, #a9a08f) 55%, transparent);
		background: transparent;
		padding: 0.55rem 0.7rem;
		color: var(--iw-ink, #24231f);
		font: 650 0.76rem/1.2 var(--font-sans);
		text-align: left;
		cursor: pointer;
	}

	button:last-of-type {
		border-bottom: 0;
	}

	button:hover:not(:disabled) {
		background: color-mix(in srgb, var(--iw-accent, #735a3a) 12%, transparent);
	}

	button:disabled {
		cursor: not-allowed;
		opacity: 0.48;
	}

	button:focus-visible,
	summary:focus-visible {
		outline: 3px solid var(--iw-focus, #245c73);
		outline-offset: 2px;
	}

	.sr-status {
		position: absolute;
		width: 1px;
		height: 1px;
		margin: -1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
	}

	:global(html[data-theme='high-contrast']) summary,
	:global(html[data-theme='high-contrast']) .menu {
		border-width: 2px;
		box-shadow: none;
	}

	@media (forced-colors: active) {
		summary,
		.menu,
		button {
			border-color: CanvasText;
		}
	}
</style>
