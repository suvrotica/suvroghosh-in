<script lang="ts">
	const year = new Date().getFullYear();
	const email = 'contact@suvroghosh.in';
</script>

<footer class="border-t border-neutral-300 dark:border-neutral-700 bg-neutral-100 dark:bg-neutral-900 p-6 text-center">
	<p class="text-sm text-neutral-600 dark:text-neutral-400">
		&copy; {year} Suvro Ghosh ·
		<a
			href={`mailto:${email}`}
			class="underline underline-offset-4 hover:text-neutral-900 dark:hover:text-neutral-100"
		>
			{email}
		</a>
	</p>
</footer>
