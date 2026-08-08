<script lang="ts">
	import {
		DEFAULT_OREGONATOR_SETUP,
		DEFAULT_SCHNAKENBERG_SETUP
	} from '$lib/visualizations/bz/constants';
	import { oregonatorReaction, schnakenbergReaction } from '$lib/visualizations/bz/reactions';
	import type { BZModelId } from '$lib/visualizations/bz/types';

	let model = $state<BZModelId>('oregonator');
	let u = $state(0.32);
	let v = $state(0.12);
	let laplacianU = $state(-0.08);
	let laplacianV = $state(0.04);

	let setup = $derived(
		model === 'oregonator' ? DEFAULT_OREGONATOR_SETUP : DEFAULT_SCHNAKENBERG_SETUP
	);
	let reaction = $derived.by(() =>
		model === 'oregonator'
			? oregonatorReaction(u, v, DEFAULT_OREGONATOR_SETUP.parameters)
			: schnakenbergReaction(u, v, DEFAULT_SCHNAKENBERG_SETUP.parameters)
	);
	let diffusionU = $derived(setup.diffusionU * laplacianU);
	let diffusionV = $derived(setup.diffusionV * laplacianV);
	let netU = $derived(reaction.u + diffusionU);
	let netV = $derived(reaction.v + diffusionV);

	function chooseModel(event: Event) {
		model = (event.currentTarget as HTMLSelectElement).value as BZModelId;
		if (model === 'oregonator') {
			u = 0.32;
			v = 0.12;
		} else {
			u = 1.04;
			v = 0.84;
		}
	}

	function updateNumber(key: 'u' | 'v' | 'laplacianU' | 'laplacianV', event: Event) {
		const value = Number((event.currentTarget as HTMLInputElement).value);
		if (!Number.isFinite(value)) return;
		if (key === 'u') u = value;
		else if (key === 'v') v = value;
		else if (key === 'laplacianU') laplacianU = value;
		else laplacianV = value;
	}

	function signed(value: number) {
		if (!Number.isFinite(value)) return 'not finite';
		const compact = Math.abs(value) >= 1_000 ? value.toExponential(3) : value.toFixed(5);
		return value > 0 ? `+${compact}` : compact;
	}
</script>

<section class="equation-ledger article-breakout" aria-labelledby="bz-equation-ledger-title">
	<header>
		<div>
			<p class="eyebrow">Interactive equation ledger</p>
			<h3 id="bz-equation-ledger-title">Separate reaction from transport</h3>
		</div>
		<label>
			<span>Model</span>
			<select value={model} onchange={chooseModel}>
				<option value="oregonator">Oregonator / BZ wave</option>
				<option value="schnakenberg">Schnakenberg / Turing comparator</option>
			</select>
		</label>
	</header>

	<div class="ledger-layout">
		<div class="controls" aria-label="Local state and curvature controls">
			<label>
				<span><i>u</i>, local activator-like field</span>
				<strong>{u.toFixed(3)}</strong>
				<input
					type="range"
					min="0"
					max={model === 'oregonator' ? 1.2 : 2}
					step="0.005"
					value={u}
					oninput={(event) => updateNumber('u', event)}
				/>
			</label>
			<label>
				<span><i>v</i>, recovery / inhibitor field</span>
				<strong>{v.toFixed(3)}</strong>
				<input
					type="range"
					min="0"
					max={model === 'oregonator' ? 1.2 : 2}
					step="0.005"
					value={v}
					oninput={(event) => updateNumber('v', event)}
				/>
			</label>
			<label>
				<span>Local curvature ∇²<i>u</i></span>
				<strong>{laplacianU.toFixed(3)}</strong>
				<input
					type="range"
					min="-1"
					max="1"
					step="0.01"
					value={laplacianU}
					oninput={(event) => updateNumber('laplacianU', event)}
				/>
			</label>
			<label>
				<span>Local curvature ∇²<i>v</i></span>
				<strong>{laplacianV.toFixed(3)}</strong>
				<input
					type="range"
					min="-1"
					max="1"
					step="0.01"
					value={laplacianV}
					oninput={(event) => updateNumber('laplacianV', event)}
				/>
			</label>
		</div>

		<div class="ledgers">
			<article>
				<div class="field-heading">
					<span>activator-like field</span>
					<strong>d<i>u</i>/d<i>t</i> = {signed(netU)}</strong>
				</div>
				<dl>
					<div>
						<dt>Reaction</dt>
						<dd data-sign={Math.sign(reaction.u)}>{signed(reaction.u)}</dd>
					</div>
					<div>
						<dt>Diffusion</dt>
						<dd data-sign={Math.sign(diffusionU)}>{signed(diffusionU)}</dd>
					</div>
					<div class="total">
						<dt>Net change</dt>
						<dd data-sign={Math.sign(netU)}>{signed(netU)}</dd>
					</div>
				</dl>
			</article>

			<article>
				<div class="field-heading">
					<span>recovery / inhibitor field</span>
					<strong>d<i>v</i>/d<i>t</i> = {signed(netV)}</strong>
				</div>
				<dl>
					<div>
						<dt>Reaction</dt>
						<dd data-sign={Math.sign(reaction.v)}>{signed(reaction.v)}</dd>
					</div>
					<div>
						<dt>Diffusion</dt>
						<dd data-sign={Math.sign(diffusionV)}>{signed(diffusionV)}</dd>
					</div>
					<div class="total">
						<dt>Net change</dt>
						<dd data-sign={Math.sign(netV)}>{signed(netV)}</dd>
					</div>
				</dl>
			</article>
		</div>
	</div>

	<div class="plain-language">
		<strong>In plain language.</strong>
		Reaction is what one isolated location would do. Diffusion is what its four numerical neighbours persuade
		it to do. The net derivative is their signed sum. Curvature is exposed as a teaching input here; in
		the live dish it is calculated from the actual masked grid.
	</div>
</section>

<style>
	.equation-ledger {
		--ledger-cyan: #6de6ef;
		--ledger-gold: #f5c66a;
		width: min(74rem, calc(100vw - 2rem));
		margin-block: 2.5rem;
		padding: clamp(1rem, 2.4vw, 1.75rem);
		border: 1px solid #3b515b;
		border-radius: 1.25rem;
		background: linear-gradient(145deg, #0b171d, #071015 70%);
		color: #eaf5f8;
		box-shadow: 0 1.5rem 3.5rem rgb(2 8 12 / 24%);
	}

	header,
	.field-heading,
	.controls label,
	dl div {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
	}

	header {
		align-items: end;
		margin-bottom: 1.25rem;
	}

	h3,
	p {
		margin: 0;
	}

	h3 {
		color: #fff;
		font-size: clamp(1.25rem, 2vw, 1.7rem);
	}

	.eyebrow {
		margin-bottom: 0.3rem;
		color: var(--ledger-cyan);
		font-size: 0.72rem;
		font-weight: 800;
		letter-spacing: 0.15em;
		text-transform: uppercase;
	}

	header label,
	.controls label {
		font-size: 0.82rem;
		font-weight: 700;
		color: #bfd0d7;
	}

	header label {
		display: grid;
		gap: 0.35rem;
	}

	select,
	input {
		accent-color: var(--ledger-cyan);
	}

	select {
		min-height: 2.75rem;
		max-width: 20rem;
		border: 1px solid #526b76;
		border-radius: 0.7rem;
		background: #101f26;
		padding: 0.55rem 0.7rem;
		color: #fff;
	}

	.ledger-layout {
		display: grid;
		grid-template-columns: minmax(14rem, 0.72fr) minmax(20rem, 1.4fr);
		gap: 1rem;
	}

	.controls,
	.ledgers article {
		border: 1px solid #2e444e;
		border-radius: 1rem;
		background: rgb(17 33 41 / 78%);
	}

	.controls {
		display: grid;
		gap: 0.9rem;
		padding: 1rem;
	}

	.controls label {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 0.35rem 0.75rem;
	}

	.controls strong {
		font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
		color: #fff;
	}

	.controls input {
		grid-column: 1 / -1;
		width: 100%;
		min-height: 1.5rem;
	}

	.ledgers {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 1rem;
	}

	.ledgers article {
		overflow: hidden;
	}

	.field-heading {
		align-items: start;
		padding: 1rem;
		border-bottom: 1px solid #2e444e;
	}

	.field-heading span {
		color: #9fb2ba;
		font-size: 0.72rem;
		font-weight: 800;
		letter-spacing: 0.09em;
		text-transform: uppercase;
	}

	.field-heading strong,
	dd {
		font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
		font-variant-numeric: tabular-nums;
	}

	dl {
		margin: 0;
		padding: 0.5rem 1rem 0.8rem;
	}

	dl div {
		padding: 0.55rem 0;
		border-bottom: 1px solid rgb(82 107 118 / 35%);
	}

	dl .total {
		border-bottom: 0;
		color: #fff;
		font-weight: 800;
	}

	dt {
		color: #bfd0d7;
	}

	dd {
		margin: 0;
		color: #d8e3e7;
	}

	dd[data-sign='1'] {
		color: var(--ledger-cyan);
	}

	dd[data-sign='-1'] {
		color: var(--ledger-gold);
	}

	.plain-language {
		margin-top: 1rem;
		border-left: 3px solid var(--ledger-gold);
		padding: 0.75rem 0.9rem;
		background: rgb(245 198 106 / 8%);
		font-size: 0.9rem;
		line-height: 1.6;
		color: #c7d5da;
	}

	.plain-language strong {
		color: #fff0c6;
	}

	:global(html[data-theme='high-contrast']) .equation-ledger {
		border: 2px solid currentColor;
		background: #000;
		box-shadow: none;
	}

	@media (max-width: 52rem) {
		header,
		.ledger-layout,
		.ledgers {
			display: grid;
			grid-template-columns: 1fr;
		}

		header {
			align-items: start;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		select,
		input {
			scroll-behavior: auto;
		}
	}
</style>
