<script lang="ts">
	let { children } = $props();
</script>

<div class="my-12 w-full max-w-2xl mx-auto font-serif text-neutral-800 dark:text-neutral-200 
            [&_p]:text-center [&_p]:!mb-2 [&_p]:text-xl md:[&_p]:text-2xl [&_p]:italic [&_p]:leading-relaxed">
	{@render children()}
</div>