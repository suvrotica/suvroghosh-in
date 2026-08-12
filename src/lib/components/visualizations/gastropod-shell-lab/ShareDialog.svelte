<script lang="ts">
	import { tick } from 'svelte';
	import { SvelteURL } from 'svelte/reactivity';
	import type { ShellRecipe } from '$lib/visualizations/gastropod-shell-lab/shell/model';
	import { prepareRecipeShare } from '$lib/visualizations/gastropod-shell-lab/shell/serialization';
	import { downloadRecipeJson } from '$lib/visualizations/gastropod-shell-lab/export/client-exports';

	interface Props {
		open: boolean;
		recipe: ShellRecipe;
		onclose: () => void;
		onannounce?: (message: string) => void;
	}
	let { open, recipe, onclose, onannounce }: Props = $props();
	let dialog = $state<HTMLDialogElement>();
	let copied = $state(false);
	const shareInstanceId = $props.id();
	const shareTitleId = `${shareInstanceId}-title`;
	let share = $derived(prepareRecipeShare(recipe));
	let url = $derived(buildShareUrl());

	function buildShareUrl(): string {
		if (share.kind !== 'url' || typeof window === 'undefined') return '';
		const next = new SvelteURL(window.location.href);
		next.searchParams.set('shell', share.state);
		next.hash = '';
		return next.toString();
	}

	async function copyUrl(): Promise<void> {
		if (share.kind !== 'url') return;
		await navigator.clipboard.writeText(url);
		copied = true;
		onannounce?.('Reproducible shell link copied.');
		setTimeout(() => (copied = false), 1800);
	}

	function applyToAddress(): void {
		if (share.kind !== 'url') return;
		window.history.replaceState(window.history.state, '', url);
		onannounce?.('The address now contains this deterministic shell recipe.');
	}

	$effect(() => {
		const currentDialog = dialog;
		if (!currentDialog) return;
		if (open && !currentDialog.open) void tick().then(() => currentDialog.showModal());
		else if (!open && currentDialog.open) currentDialog.close();
	});
</script>

<dialog
	bind:this={dialog}
	aria-labelledby={shareTitleId}
	oncancel={(event) => {
		event.preventDefault();
		onclose();
	}}
	{onclose}
>
	<header>
		<div>
			<p class="panel-title">Deterministic recipe state</p>
			<h2 id={shareTitleId}>Save & share</h2>
		</div>
		<button
			class="icon-button"
			type="button"
			aria-label="Close save and share dialog"
			onclick={onclose}>×</button
		>
	</header>
	<div class="body">
		<div class="recipe-meta">
			<div><span>Name</span><strong>{recipe.name}</strong></div>
			<div><span>Seed</span><strong class="number">{recipe.seed}</strong></div>
			<div><span>Schema</span><strong class="number">v{recipe.schemaVersion}</strong></div>
		</div>
		{#if share.kind === 'url'}
			<section>
				<h3>Compact reproducible link</h3>
				<p>The URL contains the complete ordinary recipe, compressed and validated on import.</p>
				<textarea readonly rows="4" value={url} aria-label="Reproducible recipe URL"></textarea>
				<div class="actions">
					<button class="primary-button" type="button" onclick={copyUrl}
						>{copied ? 'Copied' : 'Copy link'}</button
					><button class="quiet-button" type="button" onclick={applyToAddress}
						>Put in address bar</button
					>
				</div>
				<small class="number">{share.encodedLength}/{share.maxLength} encoded characters</small>
			</section>
		{:else}
			<section class="fallback">
				<h3>Recipe too large for a responsible URL</h3>
				<p>
					The full state is {share.encodedLength} characters, above the {share.maxLength}-character
					sharing budget. Download the validated recipe instead.
				</p>
				<button class="primary-button" type="button" onclick={() => downloadRecipeJson(recipe)}
					>Download .shell.json</button
				>
			</section>
		{/if}
		<section>
			<h3>Device-local autosave</h3>
			<p>
				Meaningful committed edits are saved in this browser. No account, server, database, or
				proprietary API is used.
			</p>
			<span class="badge cyan">local only</span>
		</section>
	</div>
	<footer>
		<button class="quiet-button" type="button" onclick={() => downloadRecipeJson(recipe)}
			>Download recipe JSON</button
		><button class="quiet-button" type="button" onclick={onclose}>Done</button>
	</footer>
</dialog>

<style>
	header,
	footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.9rem 1rem;
		border-bottom: 1px solid var(--line);
	}
	footer {
		border-top: 1px solid var(--line);
		border-bottom: 0;
		justify-content: flex-end;
	}
	h2 {
		margin: 0.14rem 0 0;
		font-size: 1.15rem;
	}
	.body {
		max-height: calc(100dvh - 145px);
		padding: 1rem;
		overflow-y: auto;
	}
	.recipe-meta {
		display: grid;
		grid-template-columns: 2fr 1fr 1fr;
		gap: 1px;
		border: 1px solid var(--line);
		border-radius: 8px;
		background: var(--line);
		overflow: hidden;
	}
	.recipe-meta div {
		display: grid;
		gap: 0.25rem;
		padding: 0.65rem;
		background: var(--panel);
	}
	.recipe-meta span {
		font-size: 0.56rem;
		color: var(--muted);
	}
	.recipe-meta strong {
		font-size: 0.7rem;
	}
	section {
		padding: 1rem 0;
		border-bottom: 1px solid var(--line);
	}
	section:last-child {
		border-bottom: 0;
	}
	h3 {
		margin: 0;
		font-size: 0.82rem;
	}
	section p {
		margin: 0.35rem 0 0.65rem;
		font-size: 0.66rem;
		line-height: 1.5;
		color: var(--muted);
	}
	textarea {
		width: 100%;
		resize: none;
		padding: 0.55rem;
		border: 1px solid var(--line);
		border-radius: 6px;
		background: var(--bg);
		color: var(--text);
		font:
			0.58rem/1.45 'IBM Plex Mono',
			monospace;
	}
	.actions {
		display: flex;
		gap: 0.5rem;
		margin-top: 0.6rem;
	}
	small {
		display: block;
		margin-top: 0.45rem;
		color: var(--faint);
	}
	.fallback {
		border-left: 2px solid var(--amber);
		padding-left: 0.75rem;
	}
	@media (max-width: 520px) {
		.recipe-meta {
			grid-template-columns: 1fr;
		}
		.actions {
			display: grid;
		}
		footer {
			flex-wrap: wrap;
		}
	}
</style>
