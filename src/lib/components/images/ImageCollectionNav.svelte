<script lang="ts">
	import { resolve } from '$app/paths';

	type CollectionTab = {
		key: string;
		label: string;
		count: number;
		href: string;
	};

	let {
		tabs,
		activeKey
	}: {
		tabs: readonly CollectionTab[];
		activeKey: string;
	} = $props();
</script>

<nav
	class="mb-6 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-neutral-300 bg-neutral-300 sm:grid-cols-4 dark:border-neutral-700 dark:bg-neutral-700"
	aria-label="Image collections"
>
	{#each tabs as tab (tab.key)}
		<a
			href={resolve(tab.href as '/images')}
			aria-current={tab.key === activeKey ? 'page' : undefined}
			class={`flex min-h-12 items-center justify-center gap-2 px-2 py-3 text-center text-sm font-semibold no-underline ${
				tab.key === activeKey
					? 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-950'
					: 'bg-neutral-100 text-neutral-600 transition-colors hover:bg-neutral-200 hover:text-neutral-950 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800 dark:hover:text-white'
			}`}
		>
			<span>{tab.label}</span>
			<span
				class={`rounded-full px-2 py-0.5 text-xs ${tab.key === activeKey ? 'bg-white/20 dark:bg-black/10' : 'bg-neutral-200 dark:bg-neutral-800'}`}
				>{tab.count}</span
			>
		</a>
	{/each}
</nav>
