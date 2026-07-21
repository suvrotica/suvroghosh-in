<script lang="ts">
	import { PIGMENTS } from '$lib/visualizations/living-pigment/colors';

	type Props = {
		selectedId: string;
		paletteIds: readonly string[];
		label?: string;
		onselect: (id: string) => void;
		ontoggle: (id: string) => void;
	};

	let { selectedId, paletteIds, label = 'Curated pigments', onselect, ontoggle }: Props = $props();
	const uid = $props.id();
</script>

<fieldset class="m-0 min-w-0 border-0 p-0">
	<legend class="mb-2 text-xs font-bold tracking-[0.08em] text-stone-700 uppercase">
		{label}
	</legend>
	<p class="mb-3 text-xs leading-relaxed text-stone-600">
		Choose the drawing pigment. Check colors that controlled-random and shuffle modes may use.
	</p>
	<div class="pigment-grid grid gap-2">
		{#each PIGMENTS as pigment (pigment.id)}
			{@const selected = selectedId === pigment.id}
			{@const included = paletteIds.includes(pigment.id)}
			<div
				class="overflow-hidden rounded-lg border bg-white/65 {selected
					? 'border-stone-800 shadow-sm'
					: 'border-stone-300'}"
			>
				<button
					type="button"
					onclick={() => onselect(pigment.id)}
					aria-pressed={selected}
					class="grid min-h-12 w-full grid-cols-[1.75rem_minmax(0,1fr)_auto] items-center gap-2 px-2.5 py-2 text-left text-xs text-stone-900 hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-stone-800"
				>
					<span
						class="h-7 w-7 rounded-full border border-black/20 shadow-inner"
						style={`background-color: ${pigment.hex}`}
						aria-hidden="true"
					></span>
					<span class="min-w-0 leading-tight font-semibold">{pigment.name}</span>
					<span
						class="rounded-full px-1.5 py-0.5 text-[0.62rem] font-bold tracking-wide uppercase {selected
							? 'bg-stone-800 text-white'
							: 'text-stone-500'}"
					>
						{selected ? '✓ Selected' : 'Choose'}
					</span>
				</button>
				<label
					for={`${uid}-${pigment.id}-palette`}
					class="flex min-h-11 items-center gap-2 border-t border-stone-200 px-2.5 py-1.5 text-[0.7rem] font-medium text-stone-600"
				>
					<input
						id={`${uid}-${pigment.id}-palette`}
						type="checkbox"
						aria-label={`Include ${pigment.name} in random palette`}
						checked={included}
						disabled={included && paletteIds.length === 1}
						onchange={() => ontoggle(pigment.id)}
						class="h-5 w-5 shrink-0 accent-stone-800"
					/>
					<span>Include in random palette</span>
				</label>
			</div>
		{/each}
	</div>
</fieldset>

<style>
	@container (min-width: 36rem) {
		.pigment-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
</style>
