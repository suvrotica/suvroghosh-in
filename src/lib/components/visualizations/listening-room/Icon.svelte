<script lang="ts">
	let { name, size = 20 }: { name: string; size?: number } = $props();
	const paths: Record<string, string> = {
		play: 'm8 5 11 7-11 7Z',
		pause: 'M8 5v14M16 5v14',
		next: 'm5 5 10 7-10 7ZM19 5v14',
		previous: 'm19 5-10 7 10 7ZM5 5v14',
		volume: 'm11 5-6 4H2v6h3l6 4ZM15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14',
		mute: 'm11 5-6 4H2v6h3l6 4ZM16 9l6 6m0-6-6 6',
		headphones: 'M4 14v-3a8 8 0 0 1 16 0v3M4 12H2v8h5v-8ZM20 12h2v8h-5v-8Z',
		arrow: 'M7 17 17 7M7 7h10v10',
		file: 'M14 2H5v20h14V7ZM14 2v6h5M8 14h8m-8 4h5',
		shuffle:
			'M3 5h3c5 0 7 14 12 14h3m-4-4 4 4-4 4M3 19h3c2 0 3-2 4-4m4-6c1-2 2-4 4-4h3m-4-4 4 4-4 4',
		repeat: 'm17 2 4 4-4 4M3 11V8a2 2 0 0 1 2-2h16M7 22l-4-4 4-4m14-1v3a2 2 0 0 1-2 2H3',
		reset: 'M3 11a9 9 0 1 1 2 7M3 4v7h7',
		sound: 'M3 10v4m4-8v12m5-16v20m5-17v14m4-10v6',
		chevron: 'm6 9 6 6 6-6'
	};
</script>

<svg
	width={size}
	height={size}
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
	stroke-width="1.7"
	stroke-linecap="round"
	stroke-linejoin="round"
	aria-hidden="true"><path d={paths[name] || paths.sound} /></svg
>
