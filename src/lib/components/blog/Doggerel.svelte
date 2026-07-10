<script lang="ts">
	let { children } = $props();
</script>

<div
	class="mx-auto my-12 w-full max-w-2xl font-serif text-neutral-800 dark:text-neutral-200
            [&_p]:!mb-2 [&_p]:text-center [&_p]:text-xl [&_p]:leading-relaxed [&_p]:italic md:[&_p]:text-2xl"
>
	{@render children()}
</div>
