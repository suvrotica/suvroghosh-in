<script lang="ts">
	import { onMount } from 'svelte';

	type ThemePreference = 'system' | 'light' | 'dark' | 'sepia';
	type ResolvedTheme = Exclude<ThemePreference, 'system'>;

	let {
		id,
		variant = 'compact'
	}: {
		id: string;
		variant?: 'compact' | 'menu';
	} = $props();

	const themeEvent = 'site-theme-change';
	const validPreferences: readonly ThemePreference[] = ['system', 'light', 'dark', 'sepia'];

	let preference = $state<ThemePreference>('system');
	let ready = $state(false);

	function isThemePreference(value: string | undefined): value is ThemePreference {
		return validPreferences.includes(value as ThemePreference);
	}

	function resolveTheme(next: ThemePreference, mediaQuery: MediaQueryList): ResolvedTheme {
		if (next === 'system') return mediaQuery.matches ? 'dark' : 'light';
		return next;
	}

	function applyTheme(next: ThemePreference, mediaQuery: MediaQueryList, persist: boolean) {
		const resolved = resolveTheme(next, mediaQuery);
		const root = document.documentElement;

		preference = next;
		root.dataset.theme = next;
		root.classList.toggle('dark', resolved === 'dark');
		root.classList.toggle('theme-sepia', resolved === 'sepia');
		root.style.colorScheme = resolved === 'dark' ? 'dark' : 'light';

		if (persist) {
			try {
				window.localStorage.setItem('site-theme', next);
			} catch {
				// The selected theme still applies when browser storage is unavailable.
			}
		}
	}

	function selectTheme(event: Event) {
		const next = (event.currentTarget as HTMLSelectElement).value;
		if (!isThemePreference(next)) return;

		const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
		applyTheme(next, mediaQuery, true);
		window.dispatchEvent(new CustomEvent<ThemePreference>(themeEvent, { detail: next }));
	}

	onMount(() => {
		const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
		const initial = document.documentElement.dataset.theme;
		const initialPreference = isThemePreference(initial) ? initial : 'system';

		applyTheme(initialPreference, mediaQuery, false);
		ready = true;

		const handleSystemChange = () => {
			if (preference === 'system') applyTheme('system', mediaQuery, false);
		};
		const handleThemeChange = (event: Event) => {
			const next = (event as CustomEvent<ThemePreference>).detail;
			if (isThemePreference(next)) applyTheme(next, mediaQuery, false);
		};

		mediaQuery.addEventListener('change', handleSystemChange);
		window.addEventListener(themeEvent, handleThemeChange);

		return () => {
			mediaQuery.removeEventListener('change', handleSystemChange);
			window.removeEventListener(themeEvent, handleThemeChange);
		};
	});
</script>

<div
	class={variant === 'menu'
		? 'flex min-h-11 items-center justify-between gap-4 rounded-md border border-neutral-300 bg-neutral-50 px-4 py-2 dark:border-neutral-700 dark:bg-neutral-900'
		: 'relative'}
>
	<label
		for={id}
		class={variant === 'menu'
			? 'text-sm font-semibold text-neutral-700 dark:text-neutral-300'
			: 'sr-only'}
	>
		Appearance
	</label>
	<select
		{id}
		value={preference}
		onchange={selectTheme}
		disabled={!ready}
		aria-label={variant === 'compact' ? 'Colour theme' : undefined}
		class={variant === 'menu'
			? 'h-9 min-w-28 rounded-md border-neutral-300 bg-white py-1 pr-8 pl-3 text-sm font-medium text-neutral-800 disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100'
			: 'h-10 w-[5.75rem] rounded-md border-neutral-300 bg-white/70 py-1 pr-7 pl-2 text-xs font-semibold text-neutral-700 disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-900/80 dark:text-neutral-300'}
	>
		<option value="system">System</option>
		<option value="light">Light</option>
		<option value="dark">Dark</option>
		<option value="sepia">Sepia</option>
	</select>
</div>
