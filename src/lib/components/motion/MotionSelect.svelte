<script lang="ts">
	import type { Attachment } from 'svelte/attachments';
	import {
		isMotionPreference,
		normaliseMotionPreference,
		resolveMotion
	} from '$lib/motion/preferences';
	import type { MotionPreference, ResolvedMotion } from '$lib/motion/types';

	let {
		id,
		variant = 'compact'
	}: {
		id: string;
		variant?: 'compact' | 'menu';
	} = $props();

	const motionEvent = 'site-motion-change';
	const storageKey = 'site-motion';

	let preference = $state<MotionPreference>('system');
	let ready = $state(false);

	function getInitialPreference(): MotionPreference {
		const initial = document.documentElement.dataset.motionPreference;
		if (isMotionPreference(initial)) return initial;

		try {
			return normaliseMotionPreference(window.localStorage.getItem(storageKey));
		} catch {
			return normaliseMotionPreference(undefined);
		}
	}

	function applyMotion(
		next: MotionPreference,
		prefersReducedMotion: boolean,
		persist: boolean
	): ResolvedMotion {
		const resolved = resolveMotion(next, prefersReducedMotion);
		const root = document.documentElement;

		preference = next;
		root.dataset.motionPreference = next;
		root.dataset.motion = resolved;

		if (persist) {
			try {
				window.localStorage.setItem(storageKey, next);
			} catch {
				// The selected preference still applies when browser storage is unavailable.
			}
		}

		return resolved;
	}

	function selectMotion(event: Event) {
		const next = (event.currentTarget as HTMLSelectElement).value;
		if (!isMotionPreference(next)) return;

		const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		applyMotion(next, prefersReducedMotion, true);
		window.dispatchEvent(new CustomEvent<MotionPreference>(motionEvent, { detail: next }));
	}

	const initialiseMotionSelect: Attachment<HTMLSelectElement> = () => {
		const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
		applyMotion(getInitialPreference(), mediaQuery.matches, false);
		ready = true;

		const handleMotionChange = (event: Event) => {
			const next = (event as CustomEvent<MotionPreference>).detail;
			if (isMotionPreference(next)) applyMotion(next, mediaQuery.matches, false);
		};

		window.addEventListener(motionEvent, handleMotionChange);

		return () => {
			window.removeEventListener(motionEvent, handleMotionChange);
		};
	};
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
		Motion
	</label>
	<select
		{id}
		value={preference}
		onchange={selectMotion}
		disabled={!ready}
		aria-label={variant === 'compact' ? 'Motion preference' : undefined}
		class={variant === 'menu'
			? 'h-11 min-w-28 rounded-md border-neutral-300 bg-white py-1 pr-8 pl-3 text-sm font-medium text-neutral-800 disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100'
			: 'h-11 w-24 rounded-md border-neutral-300 bg-white/70 py-1 pr-7 pl-2 text-xs font-semibold text-neutral-700 disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-900/80 dark:text-neutral-300'}
		{@attach initialiseMotionSelect}
	>
		<option value="system">System</option>
		<option value="still">Still</option>
		<option value="gentle">Gentle</option>
		<option value="alive">Alive</option>
	</select>
</div>
