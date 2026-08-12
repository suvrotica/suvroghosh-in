<script lang="ts">
	import {
		classifyShellRecipe,
		radialExpansionExponent,
		type ShellRecipe
	} from '$lib/visualizations/gastropod-shell-lab/shell/model';

	interface Diagnostics {
		valid?: boolean;
		selfIntersectionLikely?: boolean;
		intersectionScanIncomplete?: boolean;
		triangleCount?: number;
		warnings?: string[];
	}

	interface Props {
		recipe: ShellRecipe;
		age: number;
		diagnostics?: Diagnostics;
		compact?: boolean;
	}

	let { recipe, age, diagnostics = {}, compact = false }: Props = $props();
	let expanded = $state(false);

	const family = $derived.by(() => {
		const ratio = recipe.aperture.scale;
		if (recipe.engine === 'accretion') {
			if (ratio > 0.72) return 'aperture-dominant local-frame';
			return 'integrated local-frame';
		}
		const spire = recipe.coiling.axial.coneSpireRatio;
		if (recipe.coiling.axial.mode === 'planispiral' || Math.abs(spire) < 0.08) return 'low-coiled';
		if (spire > 1.5) return 'towered';
		if (ratio > 0.72) return 'inflated, aperture-dominant';
		if (spire > 0.65) return 'high-spired';
		return 'compact helicospiral';
	});

	const ornament = $derived.by(() => {
		const active: string[] = [];
		if (recipe.ornament.ribs.enabled && recipe.ornament.ribs.amplitude > 0) active.push('ribs');
		if (recipe.ornament.varices.enabled && recipe.ornament.varices.amplitude > 0)
			active.push('varices');
		if (recipe.ornament.spines.enabled && recipe.ornament.spines.length > 0) active.push('spines');
		if (recipe.ornament.hierarchy.enabled && recipe.ornament.hierarchy.depth > 0)
			active.push(`a ${recipe.ornament.hierarchy.depth}-level finite hierarchy`);
		if (recipe.ornament.cords.enabled && recipe.ornament.cords.amplitude > 0)
			active.push('spiral cords');
		return active.length ? active.join(', ') : 'a mostly smooth surface';
	});

	const classification = $derived(classifyShellRecipe(recipe));
	const overlapDescription = $derived(
		diagnostics.selfIntersectionLikely
			? 'A conservative ring-envelope check found an overlap risk; it is not a surface-intersection proof. Reduce aperture size, ornament amplitude, or coil overlap, then inspect the result.'
			: diagnostics.intersectionScanIncomplete
				? 'The bounded ring-envelope scan reached its work cap without a jointly supported nonlocal risk. That incomplete sample is inconclusive and is not proof that the surface is intersection-free.'
				: 'The current conservative ring-envelope check reported no nonlocal overlap risk; this is not a proof that the surface is intersection-free.'
	);
	const orientation = $derived(
		recipe.engine === 'analytic' && recipe.coiling.axial.mode === 'planispiral'
			? `${recipe.coiling.handedness === 1 ? 'clockwise' : 'counter-clockwise'} winding in the current view (a planar form is not intrinsically chiral)`
			: `${recipe.coiling.handedness === 1 ? 'positive' : 'negative'} coordinate winding orientation; biological dextral/sinistral labels require an apex-up, aperture-side view`
	);

	const description = $derived.by(() => {
		const pathDescription =
			recipe.engine === 'analytic'
				? `It completes ${recipe.coiling.turns.toFixed(2)} turns with a whorl expansion factor of ${recipe.coiling.whorlExpansion.toFixed(2)}.`
				: `Its local speed, aperture growth, two curvature rates and frame twist are integrated over a ${recipe.coiling.turns.toFixed(2)} turn-equivalent parameter span. Stored analytic coil, axial and meander values do not describe its normalized Model B form.`;
		return `${recipe.name} is a ${family} procedural shell at ${Math.round(age * 100)}% of its deposited history, with ${orientation}. ${pathDescription} Its ${recipe.aperture.profile.replace('-', ' ')} aperture is ${recipe.aperture.aspectRatio > 1.05 ? 'taller than it is wide' : recipe.aperture.aspectRatio < 0.95 ? 'wider than it is tall' : 'nearly equidimensional'}, and the surface carries ${ornament}. Classification: ${classification.label}; this badge applies only to the underlying base growth law, never automatically to the finite cap, adult truncation, changing profile, or episodic ornament. ${overlapDescription}`;
	});

	const analyticRows = $derived([
		[
			'Coiling expansion',
			'W',
			recipe.coiling.whorlExpansion.toFixed(4),
			'dimensionless',
			'W = e^{2πa}'
		],
		[
			'Expansion per radian',
			'a',
			radialExpansionExponent(recipe).toFixed(5),
			'rad⁻¹',
			'a = ln(W)/(2π)'
		],
		['Turns', 'N', recipe.coiling.turns.toFixed(3), 'turns', 'θ₁ − θ₀ = 2πN']
	]);
	const accretionRows = $derived([
		['Integration span', 'N', recipe.coiling.turns.toFixed(3), 'turn-equivalent span', 'Δθ = 2πN']
	]);
	const commonRows = $derived([
		[
			'Aperture scale',
			'A/R',
			recipe.aperture.scale.toFixed(4),
			'dimensionless',
			'X = C + s(pₓE₁ + pᵧE₂)'
		],
		['Age', 'τ', age.toFixed(4), 'normalized', '0 ≤ τ ≤ 1'],
		[
			'Rib amplitude',
			'Aᵣ',
			recipe.ornament.ribs.amplitude.toFixed(4),
			'local aperture radii',
			'Dᵣ(θ)'
		],
		['Varices per turn', 'nᵥ', recipe.ornament.varices.countPerTurn.toFixed(3), 'turn⁻¹', 'Dᵥ(θ)'],
		[
			'Spine length',
			'ℓₛ',
			recipe.ornament.spines.length.toFixed(4),
			'local aperture radii',
			'Dₛ(θ,u)'
		],
		[
			'Mismatch proxy',
			'ξ',
			recipe.ornament.buckling.mismatchProxy.toFixed(4),
			'model proxy',
			'ȧₘ = σₘaₘ − λaₘ³'
		],
		[
			'Stiffness proxy',
			'K',
			recipe.ornament.buckling.stiffnessProxy.toFixed(4),
			'model proxy',
			'σₘ(ξ,K,L)'
		]
	]);
	const analyticApertureRows = $derived([
		[
			'Aperture exponent',
			'b',
			recipe.aperture.scaleExponent.toFixed(5),
			'rad⁻¹',
			's = sₘₐₓeᵇ⁽ᶿ⁻ᶿ¹⁾'
		],
		[
			'Spire ratio',
			'H/R',
			recipe.coiling.axial.coneSpireRatio.toFixed(4),
			'dimensionless',
			'z = z₀ + q(r − r₀)'
		]
	]);
	const rows = $derived(
		recipe.engine === 'analytic'
			? [...analyticRows, ...analyticApertureRows, ...commonRows]
			: [...accretionRows, ...commonRows]
	);
</script>

<section class:compact class="description" aria-labelledby="shell-description-title">
	<div class="description-heading">
		<div>
			<p class="eyebrow">Text equivalent</p>
			<h2 id="shell-description-title">Current shell description</h2>
		</div>
		<button
			class="quiet-button"
			type="button"
			aria-expanded={expanded}
			onclick={() => (expanded = !expanded)}
		>
			{expanded ? 'Hide parameters' : 'Parameter table'}
		</button>
	</div>

	<p class="prose">{description}</p>

	{#if diagnostics.warnings?.length}
		<ul class="warnings" aria-label="Geometry warnings">
			{#each diagnostics.warnings as warning, index (index)}
				<li>{warning}</li>
			{/each}
		</ul>
	{/if}

	{#if expanded}
		<div class="table-wrap">
			<table>
				<caption>
					Synchronized model parameters. Values are dimensionless unless a unit or proxy is shown.
				</caption>
				<thead>
					<tr
						><th scope="col">Parameter</th><th scope="col">Symbol</th><th scope="col">Value</th><th
							scope="col">Unit</th
						><th scope="col">Equation</th></tr
					>
				</thead>
				<tbody>
					{#each rows as row (row[0])}
						<tr>
							<th scope="row">{row[0]}</th>
							<td class="symbol">{row[1]}</td>
							<td class="number">{row[2]}</td>
							<td>{row[3]}</td>
							<td><code>{row[4]}</code></td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</section>

<style>
	.description {
		padding: 1rem;
		border: 1px solid var(--line);
		border-radius: var(--radius);
		background: var(--panel);
	}

	.description.compact {
		padding: 0.75rem;
	}

	.description-heading {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1rem;
	}

	.eyebrow {
		margin: 0 0 0.2rem;
		font-size: 0.6rem;
		font-weight: 760;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--cyan);
	}

	h2 {
		margin: 0;
		font-size: 0.88rem;
		font-weight: 680;
	}

	.prose {
		margin: 0.7rem 0 0;
		font-size: 0.75rem;
		line-height: 1.62;
		color: var(--muted);
	}

	.warnings {
		margin: 0.7rem 0 0;
		padding: 0.6rem 0.8rem 0.6rem 1.7rem;
		border-left: 2px solid var(--danger);
		background: color-mix(in srgb, var(--danger) 8%, transparent);
		font-size: 0.72rem;
		line-height: 1.5;
		color: var(--danger);
	}

	.table-wrap {
		margin-top: 0.9rem;
		overflow-x: auto;
	}

	table {
		width: 100%;
		min-width: 650px;
		border-collapse: collapse;
		font-size: 0.66rem;
	}

	caption {
		padding: 0 0 0.5rem;
		text-align: left;
		color: var(--muted);
	}

	th,
	td {
		padding: 0.42rem 0.48rem;
		border-bottom: 1px solid var(--line);
		text-align: left;
		white-space: nowrap;
	}

	thead th {
		font-size: 0.58rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--muted);
	}

	tbody th {
		font-weight: 580;
	}

	.symbol,
	code {
		font-family: 'IBM Plex Mono', monospace;
		color: var(--cyan);
	}

	@media (max-width: 720px) {
		.description {
			border-radius: 0;
			border-right: 0;
			border-left: 0;
		}

		.description-heading {
			align-items: center;
		}
	}
</style>
