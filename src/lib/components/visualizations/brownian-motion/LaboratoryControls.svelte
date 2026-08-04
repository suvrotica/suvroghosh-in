<script lang="ts">
	import type { LaboratoryControl } from './ui-types';

	type ControlValue = string | number | boolean;
	type Props = {
		controls: readonly LaboratoryControl[];
		values: Readonly<Record<string, ControlValue>>;
		onchange: (key: string, value: ControlValue, resetsSimulation: boolean) => void;
		numericalWarning?: string;
	};

	let { controls, values, onchange, numericalWarning = '' }: Props = $props();
	let physical = $derived(controls.filter((control) => control.section === 'physical'));
	let advanced = $derived(controls.filter((control) => control.section === 'advanced'));
	let appearance = $derived(controls.filter((control) => control.section === 'appearance'));
	let camera = $derived(controls.filter((control) => control.section === 'camera'));

	function numeric(event: Event): number {
		return Number((event.currentTarget as HTMLInputElement).value);
	}

	function text(event: Event): string {
		return (event.currentTarget as HTMLSelectElement).value;
	}
</script>

{#snippet controlField(control: LaboratoryControl)}
	<div class="control" data-control={control.key}>
		{#if control.kind === 'toggle'}
			<label class="toggle">
				<input
					type="checkbox"
					checked={Boolean(values[control.key])}
					onchange={(event) =>
						onchange(
							control.key,
							(event.currentTarget as HTMLInputElement).checked,
							Boolean(control.resetsSimulation)
						)}
				/>
				<span>{control.label}</span>
				{#if control.locked}<span class="lock" aria-label="Included in the share URL">⌁</span>{/if}
			</label>
		{:else}
			<label for={`brownian-control-${control.key}`}>
				<span class="control-label">
					{control.label}
					{#if control.locked}<span class="lock" aria-label="Included in the share URL">⌁</span
						>{/if}
					{#if control.kind !== 'select'}
						<output for={`brownian-control-${control.key}`}>
							{Number(values[control.key]).toLocaleString('en-IN', {
								maximumFractionDigits: 5
							})}{control.unit ? ` ${control.unit}` : ''}
						</output>
					{/if}
				</span>
			</label>
			{#if control.kind === 'select'}
				<select
					id={`brownian-control-${control.key}`}
					value={String(values[control.key])}
					onchange={(event) =>
						onchange(control.key, text(event), Boolean(control.resetsSimulation))}
				>
					{#each control.options as option (option.value)}
						<option value={option.value}>{option.label}</option>
					{/each}
				</select>
			{:else if control.kind === 'range'}
				<input
					id={`brownian-control-${control.key}`}
					type="range"
					min={control.minimum}
					max={control.maximum}
					step={control.step}
					value={Number(values[control.key])}
					oninput={(event) =>
						onchange(control.key, numeric(event), Boolean(control.resetsSimulation))}
				/>
			{:else}
				<input
					id={`brownian-control-${control.key}`}
					type="number"
					min={control.minimum}
					max={control.maximum}
					step={control.step}
					value={Number(values[control.key])}
					onchange={(event) =>
						onchange(control.key, numeric(event), Boolean(control.resetsSimulation))}
				/>
			{/if}
		{/if}
		<p>
			{control.help}{control.resetsSimulation ? ' Changing this restarts the physical run.' : ''}
		</p>
	</div>
{/snippet}

<aside class="controls" aria-labelledby="brownian-controls-title">
	<header>
		<div>
			<p>INSTRUMENT SETTINGS</p>
			<h3 id="brownian-controls-title">Controls</h3>
		</div>
		<span class="key"><i>⌁</i> included in shared link</span>
	</header>

	{#if numericalWarning}
		<p class="warning" role="alert">{numericalWarning}</p>
	{/if}

	<div class="control-grid primary-fields">
		{#each physical as control (control.key)}{@render controlField(control)}{/each}
	</div>

	{#if advanced.length + appearance.length + camera.length > 0}
		<details>
			<summary>Advanced controls</summary>
			{#if advanced.length > 0}
				<h4>Numerics and model detail</h4>
				<div class="control-grid">
					{#each advanced as control (control.key)}{@render controlField(control)}{/each}
				</div>
			{/if}
			{#if appearance.length > 0}
				<h4>Visual layers</h4>
				<div class="control-grid compact">
					{#each appearance as control (control.key)}{@render controlField(control)}{/each}
				</div>
			{/if}
			{#if camera.length > 0}
				<h4>Camera</h4>
				<div class="control-grid compact">
					{#each camera as control (control.key)}{@render controlField(control)}{/each}
				</div>
			{/if}
		</details>
	{/if}
</aside>

<style>
	.controls {
		border: 1px solid var(--rule, #c8c1b2);
		border-radius: 0.35rem;
		background: color-mix(in srgb, var(--paper, #f7f2e8) 96%, var(--lab-accent, #6f7fa8));
	}
	header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 0.75rem;
		border-bottom: 1px solid var(--rule, #c8c1b2);
		padding: 0.75rem 0.85rem;
	}
	header p {
		margin: 0;
		color: var(--lab-rust, #9b5f48);
		font:
			700 0.62rem 'Courier Prime',
			monospace;
		letter-spacing: 0.1em;
	}
	h3 {
		margin: 0.2rem 0 0;
		font-size: 1rem;
	}
	.key {
		color: var(--ink-muted, #68707a);
		font-size: 0.64rem;
	}
	.key i {
		color: var(--lab-rust, #9b5f48);
		font-style: normal;
	}
	.warning {
		margin: 0;
		border-bottom: 1px solid color-mix(in srgb, #a85533 40%, var(--rule, #c8c1b2));
		background: color-mix(in srgb, #d98b62 12%, transparent);
		padding: 0.65rem 0.8rem;
		color: color-mix(in srgb, var(--ink, #242a32) 78%, #8e351d);
		font-size: 0.75rem;
		line-height: 1.45;
	}
	.control-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0;
	}
	.control {
		min-width: 0;
		border-right: 1px solid var(--rule, #c8c1b2);
		border-bottom: 1px solid var(--rule, #c8c1b2);
		padding: 0.65rem 0.75rem;
	}
	.control:nth-child(even) {
		border-right: 0;
	}
	.primary-fields .control:nth-last-child(-n + 2) {
		border-bottom: 0;
	}
	.control-label {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.5rem;
		font-size: 0.72rem;
		font-weight: 700;
	}
	.lock {
		margin-right: auto;
		color: var(--lab-rust, #9b5f48);
		font-family: 'Courier Prime', monospace;
	}
	output {
		color: var(--ink-muted, #68707a);
		font:
			0.7rem 'Courier Prime',
			monospace;
	}
	.control > input[type='range'],
	.control > input[type='number'],
	.control > select {
		box-sizing: border-box;
		width: 100%;
		min-height: 2.75rem;
		margin-top: 0.35rem;
	}
	.control > input[type='number'],
	.control > select {
		border: 1px solid var(--rule, #aaa293);
		border-radius: 0.25rem;
		background: var(--paper, #fff);
		padding: 0.45rem 0.55rem;
		color: var(--ink, #242a32);
	}
	.control input:focus-visible,
	.control select:focus-visible,
	summary:focus-visible {
		outline: 3px solid color-mix(in srgb, var(--lab-accent, #6f7fa8) 70%, white);
		outline-offset: 2px;
	}
	.control p {
		margin: 0.3rem 0 0;
		color: var(--ink-muted, #68707a);
		font-size: 0.64rem;
		line-height: 1.35;
	}
	.toggle {
		display: flex;
		align-items: center;
		min-height: 2.75rem;
		gap: 0.55rem;
		font-size: 0.72rem;
		font-weight: 700;
	}
	.toggle input {
		width: 1.1rem;
		height: 1.1rem;
	}
	details {
		border-top: 1px solid var(--rule, #c8c1b2);
	}
	summary {
		display: flex;
		align-items: center;
		min-height: 2.8rem;
		padding: 0 0.8rem;
		font-size: 0.75rem;
		font-weight: 700;
		cursor: pointer;
	}
	h4 {
		margin: 0;
		border-block: 1px solid var(--rule, #c8c1b2);
		background: color-mix(in srgb, var(--paper-soft, #ece6da) 70%, transparent);
		padding: 0.45rem 0.75rem;
		color: var(--ink-muted, #68707a);
		font:
			700 0.62rem 'Courier Prime',
			monospace;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}
	details h4:first-of-type {
		border-top: 0;
	}
	@media (max-width: 34rem) {
		.control-grid {
			grid-template-columns: 1fr;
		}
		.control,
		.control:nth-child(even) {
			border-right: 0;
		}
		.primary-fields .control:nth-last-child(2) {
			border-bottom: 1px solid var(--rule, #c8c1b2);
		}
	}
</style>
