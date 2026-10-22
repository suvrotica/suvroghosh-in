<script lang="ts">
	import geometry from '$lib/visualizations/the-six-week-shadow/geometry.json';
	let { taskId, label }: { taskId: string; label: string } = $props();
	const areas: Record<string, string> = {
		A: 'drawing',
		B: 'sample',
		C: 'supplier',
		D: 'supplier',
		E: 'production',
		F: 'production',
		G: 'production',
		H: 'packing',
		I: 'documents',
		J: 'support'
	};
	const area = $derived(areas[taskId] ?? 'drawing');
	const crop = $derived(geometry.crops[area as keyof typeof geometry.crops]);
</script>

<!-- eslint-disable svelte/no-at-html-tags -- Same trusted generated geometry as the main stage; this is its selected physical assembly. -->
<div class="shadow-consequence-object iso">
	<svg class="iso-svg" viewBox={crop} role="img" aria-label={`Physical consequence: ${label}`}
		><title>{label}</title><desc
			>This is the same fitted assembly from the main workshop, brought forward for inspection. Its
			matching task below explains what changed and what must happen first.</desc
		>{#each geometry.parts.filter((p) => p.area === area) as part (part.id)}<g>{@html part.svg}</g
			>{/each}</svg
	>
</div>
