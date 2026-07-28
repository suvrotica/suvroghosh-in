<script lang="ts">
	import type { Attachment } from 'svelte/attachments';
	import { createAmbientField, type AmbientFieldController } from '$lib/motion/ambient-field';
	import type { ResolvedMotion, RouteMotionConfig } from '$lib/motion/types';

	type Props = {
		pathname: string;
		config: RouteMotionConfig;
		motion: ResolvedMotion;
		active?: boolean;
	};

	let { pathname, config, motion, active = true }: Props = $props();
	let controller: AmbientFieldController | null = null;

	const ambientCanvas: Attachment<HTMLCanvasElement> = (canvas) => {
		controller = createAmbientField(canvas, {
			pathname,
			biome: config.biome,
			intensity: config.intensity,
			motion,
			active
		});

		return () => {
			controller?.destroy();
			controller = null;
		};
	};

	$effect(() => {
		controller?.update({
			pathname,
			biome: config.biome,
			intensity: config.intensity,
			motion,
			active
		});
	});
</script>

<canvas
	{@attach ambientCanvas}
	class="ambient-field"
	data-ambient-field
	data-ambient-active={active ? 'true' : 'false'}
	aria-hidden="true"
></canvas>
