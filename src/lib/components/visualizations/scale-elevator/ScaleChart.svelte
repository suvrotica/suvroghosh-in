<script lang="ts">
	import type { OxygenModel } from '$lib/visualizations/scale-elevator/types';
	import { tissueSupply } from '$lib/visualizations/scale-elevator/core';
	let {
		floor,
		model: m,
		selected,
		control,
		onselect
	}: {
		floor: number;
		model: OxygenModel;
		selected: number;
		control: number;
		onselect: (index: number) => void;
	} = $props();
	const curve = (values: number[], max: number) =>
		values
			.map(
				(value, index) =>
					`${index ? 'L' : 'M'}${36 + (index * 278) / Math.max(1, values.length - 1)},${128 - Math.max(0, Math.min(1, value / max)) * 94}`
			)
			.join(' ');
	const descriptions = [
		'One haem site binds oxygen reversibly.',
		'Four available sites per haemoglobin molecule. Filled circles show illustrative occupancy.',
		'The model flux rises linearly with the declared driving gradient.',
		'Uptake increases with the selected metabolic demand, in model units.',
		'A schematic oxygen field decreases with distance from the capillary.',
		'Regional delivery differs with the selected perfusion.',
		'Saturation, carrying capacity and delivery answer different questions.',
		'Twelve synthetic pulse-oximeter observations from minute zero to eleven, including a lower quality segment.',
		'Twelve fictional beds. Select one bar to inspect its source-gas demand.',
		'Three ward distribution capacities constrain how much source gas can reach the beds.',
		'Gas-equivalent stock over twenty-four hours at the selected supply and demand.'
	];
	const titles = [
		'A reversible encounter',
		'Count the available sites',
		'Gradient → flux',
		'Demand → uptake',
		'Distance from a vessel',
		'Regional delivery',
		'Same saturation, another story',
		'A measurement over time',
		'Twelve beds, twelve demands',
		'Demand / delivered',
		'A reserve has a clock'
	];
	let ward = $derived(Math.floor(selected / 12));
	let beds = $derived(m.bedDemands.slice(ward * 12, ward * 12 + 12));
	const maxDemand = 60; // One fixed L/min scale across all wards, scenarios and supported dials.
	let stockMax = $derived(Math.max(m.stock, 1));
	let observation = $derived(Math.round(control * 11));
	let stockValues = $derived(
		Array.from({ length: 25 }, (_, hour) =>
			Math.max(0, m.stock + (m.citySupply - m.cityDemand) * hour * 60)
		)
	);
	let stockCeiling = $derived(Math.ceil(Math.max(stockMax, ...stockValues) / 240000) * 240000);
</script>

<div class="se-chart">
	<p class="se-small-label">{titles[floor]}</p>
	<svg viewBox="0 0 340 160" role={floor === 8 ? 'group' : 'img'} aria-label={descriptions[floor]}>
		{#if floor === 0}
			<path d="M65 78H143M197 78H275" class="se-chart-axis" stroke-dasharray="3 5" />
			<circle cx="170" cy="78" r="27" class="se-chart-haem" /><text
				x="170"
				y="83"
				text-anchor="middle"
				class="se-chart-strong">Fe²⁺</text
			>
			<circle cx={m.occupancy > 0.5 ? 215 : 260} cy="66" r="10" class="se-chart-oxygen" /><circle
				cx={m.occupancy > 0.5 ? 229 : 274}
				cy="66"
				r="10"
				class="se-chart-oxygen"
			/>
			<text x="170" y="139" text-anchor="middle"
				>{m.occupancy > 0.5 ? 'Bound in this illustrative frame' : 'An available haem site'}</text
			>
		{:else if floor === 1}
			{#each [0, 1, 2, 3] as i (i)}<circle
					cx={65 + i * 70}
					cy="65"
					r="23"
					fill={i < m.boundSites ? '#70dfec' : '#253846'}
					stroke="#70dfec"
				/><text x={65 + i * 70} y="112" text-anchor="middle">Site {i + 1}</text>{/each}
			<text x="170" y="145" text-anchor="middle"
				>{m.boundSites} / 4 rounded schematic · mean {(m.occupancy * 100).toFixed(0)}%</text
			>
		{:else if floor === 2 || floor === 3}
			<path d="M36 26V128H314" class="se-chart-axis" /><path
				d="M36 128L304 36"
				class="se-chart-line"
			/>
			<circle
				cx={36 + (floor === 2 ? m.gradient / 2 : Math.min(1, m.uptake / 2)) * 268}
				cy={128 - (floor === 2 ? m.gradient / 2 : Math.min(1, m.uptake / 2)) * 92}
				r="6"
				class="se-chart-oxygen"
			/>
			<text x="38" y="151">0</text><text x="314" y="151" text-anchor="end"
				>{floor === 2 ? 'Driving gradient (model units)' : 'Metabolic demand (model units)'}</text
			>
			<text x="40" y="18">{floor === 2 ? 'Flux' : 'Uptake'} · normalised model</text>
		{:else if floor === 4}
			<path d="M36 26V128H314" class="se-chart-axis" />
			<path
				d={curve(
					Array.from({ length: 31 }, (_, i) => tissueSupply((i / 30) * 2.4, m.perfusion)),
					1.65
				)}
				class="se-chart-line"
			/>
			<circle
				cx={36 + ((selected % 4) / 3) * 278}
				cy={128 - (tissueSupply((selected % 4) * 0.8, m.perfusion) / 1.65) * 94}
				r="5"
				fill="#eec483"
			/>
			<text x="40" y="18">Relative field (illustration)</text><text x="36" y="151">0</text><text
				x="314"
				y="151"
				text-anchor="end">2.4 relative distance units</text
			>
		{:else if floor === 5}
			<text x="90" y="12">Regional delivery · mL O₂/min</text>
			{#each m.regionalDelivery as value, i (i)}<rect
					x="90"
					y={22 + i * 32}
					width={Math.max(1, (value / 30) * 200)}
					height="15"
					class="se-chart-oxygen"
				/><path
					d={`M${90 + (m.regionalDemand[i] / 30) * 200} ${19 + i * 32}v21`}
					stroke="#eec483"
					stroke-width="2"
				/><text x="80" y={34 + i * 32} text-anchor="end">Region {i + 1}</text><text
					x="330"
					y={34 + i * 32}
					text-anchor="end">{value.toFixed(1)}</text
				>{/each}
			<path d="M90 137H290" class="se-chart-axis" /><text x="90" y="155">0</text><text
				x="290"
				y="155"
				text-anchor="end">30</text
			>
		{:else if floor === 6}
			<text x="20" y="34">Saturation</text><text
				x="320"
				y="34"
				text-anchor="end"
				class="se-chart-strong">{m.saturation.toFixed(0)}%</text
			>
			<text x="20" y="77">Blood content</text><text
				x="320"
				y="77"
				text-anchor="end"
				class="se-chart-strong">{m.content.toFixed(1)} mL O₂/dL</text
			>
			<text x="20" y="120">Systemic delivery</text><text
				x="320"
				y="120"
				text-anchor="end"
				class="se-chart-strong">{m.delivery.toFixed(0)} mL O₂/min</text
			>
		{:else if floor === 7}
			<path d="M36 26V128H314" class="se-chart-axis" />
			<rect x="149" y="26" width="52" height="102" fill="#dfb06b" opacity=".13" />
			<path
				d={curve(
					m.trace.map((p) => p.saturation - 85),
					15
				)}
				class="se-chart-line"
			/>
			<circle
				cx={36 + (observation * 278) / 11}
				cy={128 - ((m.trace[observation].saturation - 85) / 15) * 94}
				r="5"
				fill="#eec483"
			/>
			<text x="30" y="34" text-anchor="end">100</text><text x="30" y="128" text-anchor="end"
				>85</text
			><text x="40" y="18">SpO₂ estimate (%)</text><text x="36" y="151">0</text><text
				x="314"
				y="151"
				text-anchor="end">11 min · amber: lower signal quality</text
			>
		{:else if floor === 8}
			<path d="M26 26V128H325" class="se-chart-axis" />
			<text x="23" y="36" text-anchor="end">60</text><text x="23" y="131" text-anchor="end">0</text>
			{#each beds as value, i (i)}<g
					role="button"
					tabindex="0"
					aria-label={`Inspect bed ${i + 1}: ${value.toFixed(1)} litres per minute`}
					onclick={() => onselect(ward * 12 + i)}
					onkeydown={(e) => {
						if (e.key === 'Enter' || e.key === ' ') {
							e.preventDefault();
							onselect(ward * 12 + i);
						}
					}}
					><rect
						x={34 + i * 24}
						y={128 - (value / maxDemand) * 96}
						width="16"
						height={(value / maxDemand) * 96}
						fill={selected % 12 === i ? '#eec483' : '#70dfec'}
					/><text x={42 + i * 24} y={123 - (value / maxDemand) * 96} text-anchor="middle"
						>{Number(value.toFixed(1))}</text
					><rect x={30 + i * 24} y="22" width="24" height="110" fill="transparent" /><text
						x={42 + i * 24}
						y="148"
						text-anchor="middle">{i + 1}</text
					></g
				>{/each}
			<text x="30" y="16">Source draw · L/min · select a bed</text>
		{:else if floor === 9}
			{#each m.wardDemands as value, i (i)}<text x="12" y={35 + i * 39}
					>{String.fromCharCode(65 + i)}</text
				><rect x="42" y={22 + i * 39} width={(value / 220) * 250} height="17" fill="#314654" /><rect
					x="42"
					y={22 + i * 39}
					width={(m.wardAllocated[i] / 220) * 250}
					height="17"
					class="se-chart-oxygen"
				/>{/each}
			<path d="M42 130H292" class="se-chart-axis" /><text x="42" y="145">0</text><text
				x="292"
				y="145"
				text-anchor="end">220 L/min</text
			><text x="42" y="160">Pale: delivered · dark: requested</text>
		{:else}
			<path d="M36 26V128H314" class="se-chart-axis" /><path
				d={curve(stockValues, stockCeiling)}
				class="se-chart-line"
			/>
			<text x="31" y="36" text-anchor="end">{stockCeiling / 1000}k</text><text
				x="31"
				y="131"
				text-anchor="end">0</text
			><text x="40" y="18">Gas-equivalent reserve · L (synthetic)</text><text x="36" y="151"
				>Now</text
			><text x="314" y="151" text-anchor="end">24 hours</text>
		{/if}
	</svg>
</div>
