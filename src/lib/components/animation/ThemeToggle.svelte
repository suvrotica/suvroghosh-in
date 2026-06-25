<script lang="ts">
	import { onMount } from 'svelte';

	type Theme = 'light' | 'dark';
	let currentTheme = $state<Theme>('dark');
	let mounted = $state(false);

	const STORAGE_KEY = 'theme-preference';

	function applyTheme(theme: Theme) {
		if (typeof document === 'undefined') return;
		const root = document.documentElement;
		if (theme === 'dark') {
			root.classList.add('dark');
		} else {
			root.classList.remove('dark');
		}
	}

	function toggle() {
		currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
		if (typeof localStorage !== 'undefined') {
			localStorage.setItem(STORAGE_KEY, currentTheme);
		}
		applyTheme(currentTheme);
	}

	onMount(() => {
		mounted = true;
		const stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
		if (stored) {
			currentTheme = stored;
		} else if (window.matchMedia) {
			currentTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
		}
		applyTheme(currentTheme);
	});
</script>

<button
	onclick={toggle}
	class="theme-toggle p-2 rounded-md text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
	aria-label={mounted ? `Switch to ${currentTheme === 'dark' ? 'light' : 'dark'} mode` : 'Toggle theme'}
>
	<svg class="theme-toggle-icon w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
		{#if mounted && currentTheme === 'dark'}
			<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 1012 21a9.003 9.003 0 008.354-5.646z" />
		{:else if mounted}
			<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
		{:else}
			<circle cx="12" cy="12" r="4" stroke-width="2" />
		{/if}
	</svg>
</button>