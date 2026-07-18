<script lang="ts">
	import VisualizationShell from './VisualizationShell.svelte';

	type Props = {
		sketch: string;
		title?: string;
		controls?: boolean;
		source?: boolean;
		caption?: string;
	};

	let props: Props = $props();
</script>

<VisualizationShell {...props} />
