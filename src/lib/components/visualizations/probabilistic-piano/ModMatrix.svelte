<script lang="ts">
	import type { ModMatrix5x5 } from '$lib/visualizations/probabilistic-piano/synth-patch';
	import VerticalFader from './VerticalFader.svelte';

	interface Props {
		modMatrix: ModMatrix5x5;
		onChangeCell: (row: number, col: number, depth: number) => void;
	}

	let { modMatrix, onChangeCell }: Props = $props();

	const SOURCES = ['LFO 1', 'LFO 2', 'Filter Env', 'Velocity', 'Mod Wheel'] as const;
	const DESTS = ['Pitch', 'Shape', 'Cutoff', 'Resonance', 'Amp'] as const;
	const SOURCE_SHORT = ['L1', 'L2', 'FE', 'VL', 'MW'] as const;
	const DEST_SHORT = ['PT', 'SH', 'CF', 'RS', 'AM'] as const;

	let selectedRow = $state(0);
	let selectedCol = $state(2);

	const selectedDepth = $derived(Math.round((modMatrix[selectedRow]?.[selectedCol] ?? 0) * 100));

	function polarity(val: number): 'positive' | 'negative' | 'off' {
		if (val > 0.004) return 'positive';
		if (val < -0.004) return 'negative';
		return 'off';
	}

	function handleCellClick(row: number, col: number) {
		if (selectedRow === row && selectedCol === col) {
			const cur = modMatrix[row][col];
			onChangeCell(row, col, Math.abs(cur) > 0.004 ? 0 : 0.5);
		} else {
			selectedRow = row;
			selectedCol = col;
		}
	}
</script>

<div
	class="mod-matrix-card synth-card"
	data-mod-matrix
	data-deck-group="mod"
	role="region"
	aria-label="Modulation matrix"
	data-tts-exclude
>
	<div class="module-head">
		<span class="module-title">5×5 MOD MATRIX</span>
		<span class="module-sub">{SOURCES[selectedRow]} → {DESTS[selectedCol]}</span>
	</div>
	<div class="mod-layout">
		<div class="mod-grid-wrap">
			<div class="mod-col-headers" aria-hidden="true">
				<span></span>
				{#each DEST_SHORT as d (d)}
					<span>{d}</span>
				{/each}
			</div>
			{#each SOURCES as source, r (source)}
				<div class="mod-row">
					<span class="mod-row-label" aria-hidden="true">{SOURCE_SHORT[r]}</span>
					{#each DESTS as dest, c (dest)}
						{@const val = modMatrix[r][c]}
						{@const pol = polarity(val)}
						<button
							type="button"
							class="mod-cell"
							data-mod-cell
							data-source={r}
							data-dest={c}
							data-polarity={pol}
							aria-label={`${source} to ${dest}`}
							aria-pressed={selectedRow === r && selectedCol === c}
							onclick={() => handleCellClick(r, c)}
							title={`${source} → ${dest}: ${Math.round(val * 100)}%`}
						>
							<span class="mod-led" aria-hidden="true"></span>
						</button>
					{/each}
				</div>
			{/each}
		</div>
		<div class="mod-depth-wrap">
			<VerticalFader
				label="Mod depth"
				value={selectedDepth}
				min={-100}
				max={100}
				step={1}
				defaultValue={0}
				accent={selectedDepth < 0 ? 'cyan' : 'amber'}
				compact={true}
				format={(v) => `${v > 0 ? '+' : ''}${Math.round(v)}%`}
				onchange={(v) => onChangeCell(selectedRow, selectedCol, v / 100)}
			/>
		</div>
	</div>
</div>
