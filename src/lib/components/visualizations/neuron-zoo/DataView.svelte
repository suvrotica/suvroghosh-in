<script module lang="ts">
	export type DataViewValue = string | number | boolean | null | undefined;

	export type DataViewField = {
		label: string;
		value: DataViewValue;
		unit?: string;
	};

	export type DataViewGroup =
		| readonly DataViewField[]
		| Record<string, DataViewValue>
		| DataViewValue;

	export type DataViewRow = {
		id?: string;
		label?: string;
		model?: string;
		current: DataViewGroup;
		metrics?: DataViewGroup;
	};
</script>

<script lang="ts">
	type Props = {
		timeMs?: number;
		currentTimeMs?: number;
		command: number | string;
		commandUnit?: string;
		rows: readonly DataViewRow[];
		caption?: string;
	};

	let {
		timeMs,
		currentTimeMs,
		command,
		commandUnit = 'unitless normalized command',
		rows,
		caption = 'Values at the synchronized time cursor'
	}: Props = $props();

	const uid = $props.id();
	let displayedTimeMs = $derived(currentTimeMs ?? timeMs ?? 0);

	function humanize(value: string) {
		return value
			.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
			.replace(/[_-]+/g, ' ')
			.replace(/^./, (letter) => letter.toUpperCase());
	}

	function isField(value: unknown): value is DataViewField {
		if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
		return 'label' in value && 'value' in value;
	}

	function fields(group: DataViewGroup | undefined, fallbackLabel: string): DataViewField[] {
		if (group === undefined) return [];
		if (Array.isArray(group)) return group.filter(isField);
		if (typeof group === 'object' && group !== null) {
			return Object.entries(group).map(([label, value]) => ({
				label: humanize(label),
				value
			}));
		}
		return [{ label: fallbackLabel, value: group as DataViewValue }];
	}

	function formatValue(value: DataViewValue) {
		if (value === null || value === undefined || value === '') return 'not available';
		if (typeof value === 'boolean') return value ? 'yes' : 'no';
		if (typeof value !== 'number') return value;
		if (!Number.isFinite(value)) return 'not available';
		const absolute = Math.abs(value);
		if (absolute !== 0 && (absolute >= 100_000 || absolute < 0.001)) return value.toExponential(3);
		return value.toFixed(absolute < 1 ? 4 : absolute < 100 ? 3 : 1).replace(/\.?0+$/, '');
	}

	function displayRowLabel(row: DataViewRow) {
		return row.label ?? row.model ?? 'Model';
	}
</script>

<section
	class="data-view rounded-lg border border-rule bg-paper-raised"
	aria-labelledby={`${uid}-title`}
>
	<header class="grid gap-3 border-b border-rule px-4 py-4 sm:grid-cols-[1fr_auto] sm:px-5">
		<div>
			<p class="mb-1 text-xs font-bold tracking-[0.14em] text-ink-muted uppercase">Data view</p>
			<h3 id={`${uid}-title`} class="m-0 text-base font-bold text-ink">{caption}</h3>
		</div>
		<dl class="m-0 grid grid-cols-2 gap-x-5 gap-y-1 text-sm">
			<div>
				<dt class="text-xs text-ink-muted">Time</dt>
				<dd class="m-0 font-mono font-bold text-ink">
					{formatValue(displayedTimeMs)} <span class="font-sans font-normal">ms</span>
				</dd>
			</div>
			<div>
				<dt class="text-xs text-ink-muted">Shared command</dt>
				<dd class="m-0 font-mono font-bold text-ink">
					{formatValue(command)}
					<span class="font-sans font-normal">{commandUnit}</span>
				</dd>
			</div>
		</dl>
	</header>

	<div class="table-scroll overflow-x-auto">
		<table class="w-full min-w-[42rem] border-collapse text-left text-sm">
			<caption class="sr-only">
				Current state and key metrics for every neuron model at
				{formatValue(displayedTimeMs)} milliseconds
			</caption>
			<thead>
				<tr
					class="border-b border-rule bg-paper-soft text-xs tracking-wide text-ink-muted uppercase"
				>
					<th scope="col" class="px-4 py-3 font-bold sm:px-5">Model</th>
					<th scope="col" class="px-4 py-3 font-bold">Current state</th>
					<th scope="col" class="px-4 py-3 font-bold sm:px-5">Key metrics</th>
				</tr>
			</thead>
			<tbody>
				{#each rows as row, index (row.id ?? `${displayRowLabel(row)}-${index}`)}
					{@const currentFields = fields(row.current, 'Current value')}
					{@const metricFields = fields(row.metrics, 'Metric')}
					<tr class="border-b border-rule align-top last:border-b-0">
						<th scope="row" class="px-4 py-4 font-bold text-ink sm:px-5">
							{displayRowLabel(row)}
						</th>
						<td class="px-4 py-4">
							{#if currentFields.length > 0}
								<dl class="m-0 grid gap-2">
									{#each currentFields as field, fieldIndex (`${field.label}-${fieldIndex}`)}
										<div class="grid grid-cols-[minmax(8rem,1fr)_auto] items-baseline gap-3">
											<dt class="text-ink-muted">{field.label}</dt>
											<dd class="m-0 text-right font-mono font-bold text-ink">
												{formatValue(field.value)}
												{#if field.unit}
													<span class="font-sans font-normal">{field.unit}</span>
												{/if}
											</dd>
										</div>
									{/each}
								</dl>
							{:else}
								<span class="text-ink-muted">not available</span>
							{/if}
						</td>
						<td class="px-4 py-4 sm:px-5">
							{#if metricFields.length > 0}
								<dl class="m-0 grid gap-2">
									{#each metricFields as field, fieldIndex (`${field.label}-${fieldIndex}`)}
										<div class="grid grid-cols-[minmax(8rem,1fr)_auto] items-baseline gap-3">
											<dt class="text-ink-muted">{field.label}</dt>
											<dd class="m-0 text-right font-mono font-bold text-ink">
												{formatValue(field.value)}
												{#if field.unit}
													<span class="font-sans font-normal">{field.unit}</span>
												{/if}
											</dd>
										</div>
									{/each}
								</dl>
							{:else}
								<span class="text-ink-muted">not available</span>
							{/if}
						</td>
					</tr>
				{:else}
					<tr>
						<td colspan="3" class="px-4 py-6 text-center text-ink-muted">
							No model values are available at this cursor position.
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</section>

<style>
	.data-view {
		--paper-raised: #0d1118;
		--paper-soft: #141922;
		--ink: #eef2f6;
		--ink-muted: #a8b1bf;
		--rule: #303744;
		--focus: #f4d58d;
	}

	.table-scroll {
		overscroll-behavior-inline: contain;
		scrollbar-gutter: stable;
	}

	@media (max-width: 40rem) {
		.table-scroll {
			background:
				linear-gradient(to right, var(--paper-raised), transparent 1.25rem) left / 2rem 100%
					no-repeat,
				linear-gradient(to left, var(--paper-raised), transparent 1.25rem) right / 2rem 100%
					no-repeat;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.table-scroll {
			scroll-behavior: auto;
		}
	}

	@media (forced-colors: active) {
		.data-view,
		tr {
			border-color: CanvasText;
		}
	}
</style>
