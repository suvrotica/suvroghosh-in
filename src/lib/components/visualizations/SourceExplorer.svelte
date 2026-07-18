<script lang="ts">
	import type { VisualizationSourceFile } from '$lib/visualizations/types';

	type Props = {
		files: readonly VisualizationSourceFile[];
		label?: string;
	};

	let { files, label = 'Complete source code' }: Props = $props();
	let selectedId = $state('');
	let copied = $state(false);
	let activeFile = $derived(files.find((file) => file.id === selectedId) ?? files[0]);

	async function copySource() {
		if (!activeFile) return;
		try {
			await navigator.clipboard.writeText(activeFile.source);
			copied = true;
			setTimeout(() => (copied = false), 1600);
		} catch {
			copied = false;
		}
	}
</script>

{#if activeFile}
	<details class="group border-t border-neutral-700 bg-neutral-950 text-neutral-100">
		<summary
			class="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-bold sm:px-5 [&::-webkit-details-marker]:hidden"
		>
			<span>{label}</span>
			<span aria-hidden="true" class="text-neutral-400 group-open:rotate-45">＋</span>
		</summary>
		<div class="border-t border-neutral-800 p-4 sm:p-5">
			<div class="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
				<div class="flex flex-wrap gap-2" role="tablist" aria-label="Source files">
					{#each files as file (file.id)}
						<button
							type="button"
							role="tab"
							aria-selected={file.id === activeFile.id}
							onclick={() => (selectedId = file.id)}
							class="min-h-11 rounded-md border px-3 py-2 text-sm font-semibold {file.id ===
							activeFile.id
								? 'border-cyan-300 bg-cyan-300 text-neutral-950'
								: 'border-neutral-700 text-neutral-200 hover:border-neutral-500'}"
						>
							{file.label}
						</button>
					{/each}
				</div>
				<button
					type="button"
					onclick={copySource}
					class="min-h-11 w-fit rounded-md border border-neutral-700 px-3 py-2 text-sm font-semibold hover:border-neutral-500 hover:bg-neutral-900"
				>
					{copied ? 'Copied' : 'Copy file'}
				</button>
			</div>
			<p class="!mb-2 !text-left font-mono text-xs !text-neutral-400">{activeFile.filename}</p>
			<div class="max-h-[34rem] overflow-auto rounded-md border border-neutral-800 bg-black/40">
				<pre class="!m-0 !bg-transparent !p-4 text-sm leading-relaxed !text-neutral-100"><code
						>{activeFile.source}</code
					></pre>
			</div>
		</div>
	</details>
{/if}
