<script lang="ts">
	import type { ArchiveRecord } from '$lib/visualizations/chitin-engine/types';

	type Props = {
		records: readonly ArchiveRecord[];
		parentA?: string;
		parentB?: string;
		onOpen: (record: ArchiveRecord) => void;
		onDelete: (id: string) => void;
		onRename: (id: string, label: string) => void;
		onParent: (slot: 'A' | 'B', id: string) => void;
		onExport: (record: ArchiveRecord) => void;
		onClear: () => void;
		onSplice: () => void;
		onContactSheet: () => void;
	};

	let {
		records,
		parentA,
		parentB,
		onOpen,
		onDelete,
		onRename,
		onParent,
		onExport,
		onClear,
		onSplice,
		onContactSheet
	}: Props = $props();
</script>

<section class="archive" aria-labelledby="archive-heading">
	<div class="archive-heading">
		<div>
			<p>Local catalogue</p>
			<h3 id="archive-heading">Pinned specimens <span>{records.length}/12</span></h3>
		</div>
		{#if records.length > 0}
			<button type="button" class="quiet danger" onclick={onClear}>Clear archive</button>
		{/if}
	</div>

	<p class="privacy">Pinned specimens remain in this browser unless exported.</p>

	{#if records.length === 0}
		<p class="empty">No specimens pinned. Hatch something that deserves paperwork.</p>
	{:else}
		<ul>
			{#each records as record (record.id)}
				<li>
					<label>
						<span class="sr-only">Informal label for {record.genome.seed}</span>
						<input
							value={record.label}
							maxlength="48"
							onchange={(event) => onRename(record.id, event.currentTarget.value)}
						/>
					</label>
					<div class="record-meta">
						<code>{record.genome.seed}</code>
						<span>{record.genome.world.replaceAll('-', ' ')}</span>
					</div>
					<div class="record-actions">
						<button type="button" onclick={() => onOpen(record)}>Open</button>
						<button
							type="button"
							class:active={parentA === record.id}
							aria-pressed={parentA === record.id}
							onclick={() => onParent('A', record.id)}>Parent A</button
						>
						<button
							type="button"
							class:active={parentB === record.id}
							aria-pressed={parentB === record.id}
							onclick={() => onParent('B', record.id)}>Parent B</button
						>
						<button type="button" onclick={() => onExport(record)}>JSON</button>
						<button type="button" class="danger" onclick={() => onDelete(record.id)}>Delete</button>
					</div>
				</li>
			{/each}
		</ul>
		<div class="archive-output">
			<button type="button" onclick={onSplice} disabled={!parentA || !parentB}
				>Splice parents</button
			>
			<button type="button" onclick={onContactSheet}>Contact sheet</button>
		</div>
	{/if}
</section>

<style>
	.archive {
		padding: 1rem;
		border: 1px solid rgb(255 255 255 / 9%);
		border-radius: 1rem;
		background: rgb(4 5 13 / 88%);
		color: #d9dbe5;
		font: 0.78rem/1.45 var(--font-sans, system-ui, sans-serif);
	}

	.archive-heading,
	.archive-output,
	.record-actions,
	.record-meta {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.archive-heading {
		justify-content: space-between;
	}
	.archive-heading p,
	.archive-heading h3,
	.privacy,
	.empty {
		margin: 0;
	}
	.archive-heading p {
		color: #85889d;
		font: 700 0.62rem/1.2 var(--font-mono, monospace);
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}
	.archive-heading h3 {
		margin-top: 0.2rem;
		color: white;
		font-size: 1rem;
	}
	.archive-heading h3 span {
		color: #a8ff57;
		font-family: var(--font-mono, monospace);
		font-size: 0.72rem;
	}
	.privacy {
		margin-top: 0.55rem;
		color: #989bab;
	}
	.empty {
		margin-top: 0.9rem;
		padding: 0.8rem;
		border: 1px dashed rgb(255 255 255 / 12%);
		border-radius: 0.6rem;
		color: #9699aa;
	}

	ul {
		display: grid;
		gap: 0.65rem;
		margin: 0.9rem 0;
		padding: 0;
		list-style: none;
	}
	li {
		padding: 0.7rem;
		border: 1px solid rgb(255 255 255 / 8%);
		border-radius: 0.7rem;
		background: rgb(255 255 255 / 2.5%);
	}
	input {
		width: min(100%, 22rem);
		min-height: 2.5rem;
		padding: 0.45rem 0.6rem;
		border: 1px solid rgb(255 255 255 / 14%);
		border-radius: 0.45rem;
		background: #0b0c17;
		color: white;
	}
	.record-meta {
		margin: 0.35rem 0 0.55rem;
		color: #8f92a5;
		text-transform: capitalize;
	}
	code {
		color: #b8ff3d;
		font-family: var(--font-mono, monospace);
	}
	button {
		min-height: 2.75rem;
		padding: 0.55rem 0.75rem;
		border: 1px solid rgb(255 255 255 / 14%);
		border-radius: 0.5rem;
		background: rgb(255 255 255 / 5%);
		color: #e6e8ef;
		cursor: pointer;
	}
	button:hover {
		border-color: rgb(184 255 61 / 50%);
	}
	button:disabled {
		cursor: not-allowed;
		opacity: 0.42;
	}
	button.active {
		border-color: #b8ff3d;
		background: rgb(184 255 61 / 12%);
		color: #dfffaa;
	}
	button.danger {
		color: #ff9caa;
	}
	button.quiet {
		min-height: 2.5rem;
		background: transparent;
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}
</style>
