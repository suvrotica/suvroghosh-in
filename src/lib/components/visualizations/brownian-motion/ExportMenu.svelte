<script lang="ts">
	type Props = {
		onpng: () => void | Promise<void>;
		ontrajectorycsv: () => void | Promise<void>;
		onmetricscsv: () => void | Promise<void>;
		onjson: () => void | Promise<void>;
		onsummary: () => void | Promise<void>;
	};

	let { onpng, ontrajectorycsv, onmetricscsv, onjson, onsummary }: Props = $props();
	let busy = $state(false);
	let message = $state('');

	async function run(label: string, action: () => void | Promise<void>): Promise<void> {
		if (busy) return;
		busy = true;
		message = `Preparing ${label}.`;
		try {
			await action();
			message = `${label} ready.`;
		} catch (error) {
			message = error instanceof Error ? error.message : `${label} could not be prepared.`;
		} finally {
			busy = false;
		}
	}
</script>

<details class="export-menu">
	<summary>Export experiment</summary>
	<div>
		<button type="button" disabled={busy} onclick={() => run('PNG snapshot', onpng)}
			>PNG stage</button
		>
		<button type="button" disabled={busy} onclick={() => run('trajectory CSV', ontrajectorycsv)}
			>Trajectory CSV</button
		>
		<button type="button" disabled={busy} onclick={() => run('metrics CSV', onmetricscsv)}
			>Metrics CSV</button
		>
		<button type="button" disabled={busy} onclick={() => run('experiment JSON', onjson)}
			>Experiment JSON</button
		>
		<button type="button" disabled={busy} onclick={() => run('experiment summary', onsummary)}
			>Copy summary</button
		>
	</div>
	<p role="status">{message}</p>
</details>

<style>
	.export-menu {
		position: relative;
	}
	summary {
		display: inline-flex;
		min-height: 2.75rem;
		align-items: center;
		border: 1px solid var(--rule, #aaa293);
		border-radius: 0.35rem;
		background: var(--paper, #f7f2e8);
		padding: 0 0.8rem;
		font-size: 0.78rem;
		font-weight: 700;
		cursor: pointer;
		list-style-position: inside;
	}
	details[open] > div {
		display: grid;
		position: absolute;
		z-index: 8;
		right: 0;
		min-width: 13rem;
		margin-top: 0.35rem;
		border: 1px solid var(--rule, #c8c1b2);
		border-radius: 0.35rem;
		background: var(--paper-raised, #f6f2e8);
		box-shadow: 0 0.8rem 2rem color-mix(in srgb, var(--ink, #242a32) 18%, transparent);
		padding: 0.35rem;
	}
	button {
		min-height: 2.75rem;
		border: 0;
		border-bottom: 1px solid var(--rule, #c8c1b2);
		background: transparent;
		padding: 0.45rem 0.65rem;
		color: var(--ink, #242a32);
		font-size: 0.75rem;
		font-weight: 700;
		text-align: left;
		cursor: pointer;
	}
	button:last-child {
		border-bottom: 0;
	}
	button:hover {
		background: color-mix(in srgb, var(--lab-accent, #6f7fa8) 10%, transparent);
	}
	button:focus-visible,
	summary:focus-visible {
		outline: 3px solid color-mix(in srgb, var(--lab-accent, #6f7fa8) 70%, white);
		outline-offset: 2px;
	}
	p {
		position: absolute;
		width: 1px;
		height: 1px;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
	}
</style>
