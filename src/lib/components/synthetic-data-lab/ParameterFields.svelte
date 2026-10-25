<script lang="ts">
	import type { DistributionDefinition } from '$lib/synthetic-data-lab/types';
	let {
		definition,
		parameters,
		onchange
	}: {
		definition?: DistributionDefinition;
		parameters: Record<string, unknown>;
		onchange: (name: string, value: unknown) => void;
	} = $props();
	let errors = $state<Record<string, string>>({});
	function arrayChanged(name: string, text: string) {
		try {
			const value = JSON.parse(text);
			if (!value || typeof value !== 'object') throw new Error('Enter a JSON array or object.');
			errors = { ...errors, [name]: '' };
			onchange(name, value);
		} catch {
			errors = { ...errors, [name]: 'Enter a valid JSON array or object.' };
		}
	}
	function low(p: { min?: number; default: unknown }) {
		return p.min ?? (Number(p.default) === 0 ? -10 : 0);
	}
	function high(p: { max?: number; default: unknown }, value: unknown) {
		return p.max ?? Math.max(10, Math.abs(Number(p.default)) * 3, Math.abs(Number(value)) * 1.25);
	}
</script>

{#if definition}
	<div class="parameters">
		{#each definition.parameters as p}
			{@const value = parameters[p.name] ?? p.default}
			<label class="parameter">
				<span class="label">{p.label}</span>
				{#if p.kind === 'choice'}
					<select
						value={String(value)}
						onchange={(event) => onchange(p.name, event.currentTarget.value)}
						>{#each p.choices ?? [] as choice}<option value={choice}>{choice}</option
							>{/each}</select
					>
				{:else if (typeof p.default === 'object' && p.default !== null) || p.kind === 'array' || p.kind === 'matrix'}
					<textarea
						rows={p.kind === 'matrix' ? 3 : 2}
						value={JSON.stringify(value)}
						onchange={(event) => arrayChanged(p.name, event.currentTarget.value)}
						aria-invalid={!!errors[p.name]}
						spellcheck="false"
					></textarea>
					{#if errors[p.name]}<span class="error">{errors[p.name]}</span>{/if}
				{:else if typeof p.default === 'boolean'}
					<input
						type="checkbox"
						checked={Boolean(value)}
						onchange={(event) => onchange(p.name, event.currentTarget.checked)}
					/>
				{:else if typeof p.default === 'number'}
					<div class="numeric">
						<input
							aria-label={`${p.label} slider`}
							type="range"
							min={low(p)}
							max={high(p, value)}
							step={p.step ?? 0.1}
							value={Number(value)}
							oninput={(event) => onchange(p.name, Number(event.currentTarget.value))}
						/><input
							aria-label={p.label}
							type="number"
							min={p.min ?? undefined}
							max={p.max ?? undefined}
							step={p.step ?? 'any'}
							value={Number(value)}
							oninput={(event) => {
								const value = event.currentTarget.valueAsNumber;
								if (event.currentTarget.value.trim() && Number.isFinite(value))
									onchange(p.name, value);
							}}
						/>
					</div>
				{:else}<input
						value={String(value)}
						onchange={(event) => onchange(p.name, event.currentTarget.value)}
					/>{/if}
			</label>
		{/each}
	</div>
{/if}

<style>
	.parameters {
		display: grid;
		gap: 17px;
	}
	.parameter {
		display: grid;
		gap: 7px;
	}
	.label {
		font-size: 11px;
		color: #456059;
		font-weight: 600;
	}
	.numeric {
		display: grid;
		grid-template-columns: 1fr 72px;
		gap: 10px;
		align-items: center;
	}
	input[type='range'] {
		width: 100%;
		accent-color: #087f80;
		min-width: 0;
		cursor: pointer;
	}
	input[type='number'],
	input:not([type]),
	select,
	textarea {
		width: 100%;
		min-width: 0;
		border: 1px solid #d0ddd4;
		border-radius: 6px;
		background: #fffdf8;
		color: #263f39;
		padding: 7px 8px;
		font: inherit;
		font-size: 12px;
		box-sizing: border-box;
	}
	input[type='number'] {
		text-align: right;
		font-variant-numeric: tabular-nums;
	}
	textarea {
		resize: vertical;
		font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
		font-size: 11px;
		line-height: 1.6;
	}
	input:focus,
	select:focus,
	textarea:focus {
		outline: 2px solid #87b8a3;
		outline-offset: 2px;
	}
	.error {
		font-size: 11px;
		color: #52665b;
	}
</style>
