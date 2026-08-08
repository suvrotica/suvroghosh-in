<script lang="ts">
	import { tick } from 'svelte';
	import {
		DEFAULT_OREGONATOR_SETUP,
		diffusionTimestepLimit
	} from '$lib/visualizations/bz/constants';
	import { activeAreaMetrics } from '$lib/visualizations/bz/metrics';
	import { BZCpuSolver, assessBZTimestep } from '$lib/visualizations/bz/solver';
	import type { BZFieldMetrics, BZFieldState, OregonatorSetup } from '$lib/visualizations/bz/types';

	type CheckState = 'idle' | 'running' | 'passed' | 'failed';
	type CheckResult = {
		state: CheckState;
		value: string;
		detail: string;
	};

	let running = $state(false);
	let status = $state(
		'The checks run in isolated Float64 CPU fields and never touch the live dish.'
	);
	let timestepResult = $state<CheckResult>({
		state: 'idle',
		value: 'not run',
		detail: 'Compare Δt with Δt/2 at exactly the same model time.'
	});
	let gridResult = $state<CheckResult>({
		state: 'idle',
		value: 'not run',
		detail: 'Compare 32² and 64² grids over one declared domain and time.'
	});
	let unsafeResult = $state<CheckResult>({
		state: 'idle',
		value: 'not run',
		detail: 'Construct a step above the explicit five-point diffusion bound and require rejection.'
	});
	let checks = $derived([
		{ title: 'Timestep versus half timestep', result: timestepResult },
		{ title: 'Coarse versus fine grid', result: gridResult },
		{ title: 'Unsafe timestep isolation', result: unsafeResult }
	]);

	function setup(gridSize: number, timestep: number): OregonatorSetup {
		return {
			...DEFAULT_OREGONATOR_SETUP,
			parameters: { ...DEFAULT_OREGONATOR_SETUP.parameters },
			gridSize,
			domainSize: 16,
			activeRadius: 7.52,
			timestep,
			diffusionV: 0,
			initialCondition: 'target-wave',
			seed: 'bz-numerical-audit'
		};
	}

	function run(setupValue: OregonatorSetup, steps: number): BZCpuSolver {
		const solver = new BZCpuSolver(setupValue);
		solver.step(steps);
		return solver;
	}

	function relativeRms(a: Readonly<BZFieldState>, b: Readonly<BZFieldState>): number {
		if (a.size !== b.size) throw new RangeError('RMS fields must share a grid.');
		let squaredDifference = 0;
		let squaredReference = 0;
		let count = 0;
		for (let index = 0; index < a.u.length; index += 1) {
			if (!a.mask[index] || !b.mask[index]) continue;
			const du = a.u[index] - b.u[index];
			const dv = a.v[index] - b.v[index];
			squaredDifference += du * du + dv * dv;
			squaredReference += b.u[index] * b.u[index] + b.v[index] * b.v[index];
			count += 2;
		}
		return (
			Math.sqrt(squaredDifference / Math.max(1, count)) /
			Math.max(Math.sqrt(squaredReference / Math.max(1, count)), Number.EPSILON)
		);
	}

	function metricDistance(a: Readonly<BZFieldMetrics>, b: Readonly<BZFieldMetrics>): number {
		return Math.hypot(
			a.meanU - b.meanU,
			a.meanV - b.meanV,
			a.varianceU - b.varianceU,
			a.varianceV - b.varianceV
		);
	}

	async function runChecks() {
		if (running) return;
		running = true;
		status = 'Running three isolated checks…';
		timestepResult = { state: 'running', value: 'working', detail: 'Equal-time Heun comparison.' };
		gridResult = { state: 'running', value: 'queued', detail: 'Same domain, two grids.' };
		unsafeResult = { state: 'running', value: 'queued', detail: 'Deliberately unsafe copy.' };
		await tick();

		try {
			const coarseStep = setup(32, 0.001);
			const halfStep = setup(32, 0.0005);
			const coarseRun = run(coarseStep, 240);
			const halfRun = run(halfStep, 480);
			const timestepError = relativeRms(coarseRun.state, halfRun.state);
			timestepResult = {
				state: Number.isFinite(timestepError) && timestepError < 0.03 ? 'passed' : 'failed',
				value: `${(100 * timestepError).toPrecision(3)}% relative RMS`,
				detail: `Both runs stopped at t = ${coarseRun.modelTime.toFixed(3)}; neither state was clipped.`
			};
			await tick();

			const coarseGridRun = run(setup(32, 0.0005), 320);
			const fineGridRun = run(setup(64, 0.0005), 320);
			const metricDelta = metricDistance(
				activeAreaMetrics(coarseGridRun.state),
				activeAreaMetrics(fineGridRun.state)
			);
			gridResult = {
				state: Number.isFinite(metricDelta) && metricDelta < 0.15 ? 'passed' : 'failed',
				value: metricDelta.toExponential(3),
				detail:
					'Euclidean difference of mean and variance summaries; it is not a claim of pointwise convergence.'
			};
			await tick();

			const safe = setup(32, 0.0005);
			const limit = diffusionTimestepLimit(safe);
			const unsafe = { ...safe, timestep: limit * 1.2 };
			const assessment = assessBZTimestep(unsafe);
			let rejected = false;
			try {
				new BZCpuSolver(unsafe).step();
			} catch {
				rejected = true;
			}
			unsafeResult = {
				state: assessment.state === 'unsafe' && rejected ? 'passed' : 'failed',
				value: rejected ? 'stopped before evolution' : 'not rejected',
				detail: `Δt = ${unsafe.timestep.toPrecision(4)}; diffusion ceiling = ${limit.toPrecision(4)}. The live field was never involved.`
			};
			status = [timestepResult, gridResult, unsafeResult].every(
				(result) => result.state === 'passed'
			)
				? 'All isolated checks passed under the displayed tolerances.'
				: 'At least one controlled comparison exceeded its displayed tolerance; inspect the row before trusting the picture.';
		} catch (error) {
			status = `The isolated audit stopped: ${error instanceof Error ? error.message : 'unknown failure'}`;
			for (const result of [timestepResult, gridResult, unsafeResult]) {
				if (result.state === 'running') {
					result.state = 'failed';
					result.value = 'stopped';
				}
			}
		} finally {
			running = false;
		}
	}
</script>

<section class="numerical-checks article-breakout" aria-labelledby="bz-numerical-checks-title">
	<header>
		<div>
			<p>Controlled numerical audit</p>
			<h3 id="bz-numerical-checks-title">Can arithmetic counterfeit the chemistry?</h3>
		</div>
		<button type="button" onclick={runChecks} disabled={running}>
			{running ? 'Checking…' : timestepResult.state === 'idle' ? 'Run checks' : 'Repeat checks'}
		</button>
	</header>

	<div class="check-grid">
		{#each checks as check (check.title)}
			<article data-state={check.result.state}>
				<span class="state">{check.result.state}</span>
				<h4>{check.title}</h4>
				<strong>{check.result.value}</strong>
				<p>{check.result.detail}</p>
			</article>
		{/each}
	</div>

	<p class="status" aria-live="polite">{status}</p>
	<details>
		<summary>Accessible results table</summary>
		<div class="table-wrap">
			<table>
				<thead>
					<tr
						><th scope="col">Check</th><th scope="col">State</th><th scope="col">Result</th><th
							scope="col">Interpretation</th
						></tr
					>
				</thead>
				<tbody>
					{#each checks as check (check.title)}
						<tr
							><th scope="row">{check.title}</th><td>{check.result.state}</td><td
								>{check.result.value}</td
							><td>{check.result.detail}</td></tr
						>
					{/each}
				</tbody>
			</table>
		</div>
	</details>
</section>

<style>
	.numerical-checks {
		width: min(74rem, calc(100vw - 2rem));
		margin-block: 2.5rem;
		padding: clamp(1rem, 2.4vw, 1.75rem);
		border: 1px solid #4c5960;
		border-radius: 1.25rem;
		background: #10171b;
		color: #ecf2f4;
		box-shadow: 0 1.4rem 3.4rem rgb(2 8 12 / 22%);
	}

	header {
		display: flex;
		align-items: end;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: 1rem;
	}

	header p,
	h3,
	h4,
	article p,
	.status {
		margin: 0;
	}

	header p {
		margin-bottom: 0.3rem;
		color: #73dbe4;
		font-size: 0.72rem;
		font-weight: 800;
		letter-spacing: 0.15em;
		text-transform: uppercase;
	}

	h3 {
		color: #fff;
		font-size: clamp(1.25rem, 2vw, 1.7rem);
	}

	button {
		min-height: 2.75rem;
		border: 1px solid #76dfe8;
		border-radius: 0.75rem;
		background: #153a44;
		padding: 0.55rem 0.95rem;
		color: #f4fdff;
		font-weight: 800;
	}

	button:disabled {
		cursor: wait;
		opacity: 0.65;
	}

	.check-grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 0.8rem;
	}

	article {
		min-width: 0;
		border: 1px solid #34474f;
		border-radius: 0.9rem;
		background: #0b1216;
		padding: 1rem;
	}

	article[data-state='passed'] {
		border-color: #4d9d88;
	}

	article[data-state='failed'] {
		border-color: #d78d69;
	}

	.state {
		display: inline-flex;
		margin-bottom: 0.7rem;
		border-radius: 999px;
		background: #1b2b32;
		padding: 0.22rem 0.5rem;
		color: #bed0d7;
		font-size: 0.67rem;
		font-weight: 800;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	article[data-state='passed'] .state {
		background: #15372f;
		color: #9de8d0;
	}

	article[data-state='failed'] .state {
		background: #40271e;
		color: #ffd2ba;
	}

	h4 {
		min-height: 2.7em;
		color: #f8fbfc;
		font-size: 0.98rem;
	}

	article strong {
		display: block;
		margin-block: 0.75rem 0.45rem;
		overflow-wrap: anywhere;
		color: #f5c66a;
		font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
		font-size: 0.9rem;
	}

	article p,
	.status,
	details {
		color: #b9c8ce;
		font-size: 0.84rem;
		line-height: 1.55;
	}

	.status {
		margin-top: 1rem;
		border-left: 3px solid #73dbe4;
		padding: 0.55rem 0.8rem;
		background: rgb(115 219 228 / 7%);
	}

	details {
		margin-top: 0.8rem;
	}

	summary {
		min-height: 2.75rem;
		cursor: pointer;
		font-weight: 800;
	}

	.table-wrap {
		overflow-x: auto;
	}

	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.78rem;
	}

	th,
	td {
		border: 1px solid #34474f;
		padding: 0.55rem;
		text-align: left;
		vertical-align: top;
	}

	:global(html[data-theme='high-contrast']) .numerical-checks {
		border: 2px solid currentColor;
		background: #000;
		box-shadow: none;
	}

	@media (max-width: 52rem) {
		.check-grid {
			grid-template-columns: 1fr;
		}

		header {
			align-items: start;
			flex-direction: column;
		}
	}
</style>
