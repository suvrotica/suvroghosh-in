<script lang="ts">
	import { onMount } from 'svelte';
	import type { FlightFolioResult } from '$lib/games/kagojer-dana/runtime-types';
	import type { ProgressionUnlockEvent } from '$lib/games/kagojer-dana/engine/Progression';

	let {
		result,
		showScore,
		unlocks,
		onshare,
		onsamewind,
		onnewwind,
		onfreeflight
	}: {
		result: FlightFolioResult;
		showScore: boolean;
		unlocks: readonly ProgressionUnlockEvent[];
		onshare(): void;
		onsamewind(): void;
		onnewwind(): void;
		onfreeflight(): void;
	} = $props();
	let folioHeading: HTMLHeadingElement;

	onMount(() => folioHeading.focus({ preventScroll: true }));

	const unique = (values: readonly string[]) => [...new Set(values)];

	function altitudePath() {
		if (result.altitudeProfile.length < 2) return 'M 0 78 L 360 78';
		const maxTime = Math.max(1, result.altitudeProfile.at(-1)?.atSeconds ?? 1);
		const maxAltitude = Math.max(
			40,
			...result.altitudeProfile.map((point) => point.altitudeMetres)
		);
		return result.altitudeProfile
			.map((point, index) => {
				const x = (point.atSeconds / maxTime) * 360;
				const y = 82 - (Math.max(0, point.altitudeMetres) / maxAltitude) * 72;
				return `${index === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
			})
			.join(' ');
	}

	function routePath() {
		if (result.path.length < 2) return 'M 12 72 L 348 18';
		const xs = result.path.map((point) => point.x);
		const zs = result.path.map((point) => point.z);
		const minX = Math.min(...xs);
		const maxX = Math.max(...xs);
		const minZ = Math.min(...zs);
		const maxZ = Math.max(...zs);
		const xSpan = Math.max(1, maxX - minX);
		const zSpan = Math.max(1, maxZ - minZ);
		return result.path
			.map((point, index) => {
				const x = 10 + ((point.x - minX) / xSpan) * 340;
				const y = 82 - ((point.z - minZ) / zSpan) * 72;
				return `${index === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
			})
			.join(' ');
	}
</script>

<section class="folio" aria-labelledby="flight-folio-title">
	<div class="folio-paper">
		<header>
			<div>
				<p>Flight folio · {result.mode === 'free' ? 'New Wind' : 'First flight'}</p>
				<h2 bind:this={folioHeading} id="flight-folio-title" tabindex="-1">
					The city kept the line.
				</h2>
			</div>
			<span class="seed">{result.seed}</span>
		</header>

		<div class="folio-grid">
			<section class="altitude-sheet" aria-labelledby="altitude-profile-title">
				<h3 id="altitude-profile-title">Altitude profile</h3>
				<svg viewBox="0 0 360 90" role="img" aria-label="Charcoal altitude profile for this flight">
					<path class="paper-line" d="M 0 83 C 70 80, 145 86, 210 82 S 315 80, 360 84" />
					<path class="altitude-line" d={altitudePath()} />
				</svg>
				<p>
					{Math.floor(result.elapsedSeconds / 60)}m {Math.round(result.elapsedSeconds % 60)}s aloft
					{#if showScore}· {result.score.toLocaleString('en-IN')} optional points{/if}
				</p>
				<h3 id="route-line-title">Charcoal route line</h3>
				<svg viewBox="0 0 360 90" role="img" aria-labelledby="route-line-title">
					<path class="paper-line" d="M 4 84 C 90 75, 174 88, 260 78 S 330 77, 356 82" />
					<path class="route-line" d={routePath()} />
				</svg>
			</section>

			<dl>
				<div>
					<dt>Closest clean passage</dt>
					<dd>{result.closestPassage || 'The city kept a respectful wing away.'}</dd>
				</div>
				<div>
					<dt>Winds borrowed</dt>
					<dd>{unique(result.windsBorrowed).join(' · ') || 'A modest roof breeze'}</dd>
				</div>
				<div>
					<dt>Districts crossed</dt>
					<dd>{unique(result.districts).join(' · ')}</dd>
				</div>
				<div>
					<dt>Soundscapes encountered</dt>
					<dd>
						{unique(result.soundscapes).join(' · ') || 'The flight remained deliberately silent'}
					</dd>
				</div>
				<div>
					<dt>Landmarks genuinely seen</dt>
					<dd>{unique(result.landmarks).join(' · ') || 'The skyline remained shy'}</dd>
				</div>
				<div>
					<dt>Where the paper came down</dt>
					<dd>{result.landing}</dd>
				</div>
			</dl>
		</div>

		{#if unlocks.length > 0}
			<section class="new-pages" aria-labelledby="new-wind-pages-title">
				<h3 id="new-wind-pages-title">New pages found in the wind</h3>
				<ul>
					{#each unlocks as unlock (unlock.id)}
						<li>
							<strong>{unlock.title}</strong>
							<span>{unlock.poeticNote}</span>
							<small>{unlock.reason}</small>
						</li>
					{/each}
				</ul>
			</section>
		{/if}

		<div class="folio-actions">
			<button type="button" class="primary" onclick={onnewwind}>New Wind</button>
			<button type="button" onclick={onsamewind}>Fly this wind again</button>
			<button type="button" onclick={onfreeflight}>Explore this city freely</button>
			<button type="button" onclick={onshare}>Share this city and wind</button>
		</div>
	</div>
</section>

<style>
	.folio {
		position: absolute;
		z-index: 32;
		inset: 0;
		overflow: auto;
		background: rgb(15 14 12 / 0.78);
		padding: max(16px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right))
			max(16px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left));
		color: #332d24;
		backdrop-filter: blur(10px);
	}

	.folio-paper {
		width: min(950px, 100%);
		min-height: 100%;
		margin: auto;
		border: 1px solid #9c8867;
		border-radius: 4px 13px 7px 10px;
		background:
			repeating-linear-gradient(0deg, transparent 0 29px, rgb(70 92 108 / 0.08) 30px),
			linear-gradient(100deg, #ece0c3, #f7eed8 53%, #ded0ae);
		box-shadow:
			0 24px 80px rgb(0 0 0 / 0.56),
			inset 0 0 90px rgb(91 67 34 / 0.12);
		padding: clamp(20px, 4vw, 48px);
	}

	header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 22px;
		border-bottom: 2px solid rgb(52 45 36 / 0.55);
		padding-bottom: 16px;
	}

	header p {
		margin: 0 0 5px;
		font:
			800 0.68rem/1.2 'Courier New',
			monospace;
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}

	header h2 {
		margin: 0;
		font:
			italic 800 clamp(1.8rem, 4.5vw, 3.5rem)/0.95 Georgia,
			serif;
	}

	.seed {
		border: 1px solid rgb(52 45 36 / 0.46);
		padding: 6px 9px;
		font:
			800 0.66rem/1 'Courier New',
			monospace;
		transform: rotate(1.5deg);
	}

	.folio-grid {
		display: grid;
		grid-template-columns: minmax(0, 1.2fr) minmax(250px, 0.8fr);
		gap: clamp(22px, 5vw, 52px);
		margin-top: 24px;
	}

	.altitude-sheet h3 {
		margin: 0;
		font:
			800 0.72rem/1.2 'Courier New',
			monospace;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}

	svg {
		display: block;
		width: 100%;
		height: auto;
		margin-top: 12px;
		overflow: visible;
	}

	.paper-line,
	.altitude-line,
	.route-line {
		fill: none;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	.paper-line {
		stroke: rgb(51 45 36 / 0.3);
		stroke-width: 1.2;
	}

	.altitude-line {
		stroke: #332d24;
		stroke-width: 3;
		filter: drop-shadow(1px 1px 0 rgb(51 45 36 / 0.25));
	}

	.route-line {
		stroke: #4a3527;
		stroke-width: 2.4;
		stroke-dasharray: 7 2 3 2;
	}

	.altitude-sheet p {
		font:
			700 0.72rem/1.5 'Courier New',
			monospace;
	}

	dl {
		display: grid;
		gap: 12px;
		margin: 0;
	}

	dl div {
		border-left: 2px solid rgb(51 45 36 / 0.45);
		padding-left: 11px;
	}

	dt {
		font:
			800 0.62rem/1.3 'Courier New',
			monospace;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	dd {
		margin: 3px 0 0;
		font:
			italic 700 0.93rem/1.28 Georgia,
			serif;
	}

	.folio-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 9px;
		margin-top: 28px;
		border-top: 1px dashed rgb(51 45 36 / 0.45);
		padding-top: 18px;
	}

	.new-pages {
		margin: 18px 0;
		border-block: 1px solid rgb(70 58 40 / 0.25);
		padding: 14px 0;
	}

	.new-pages h3 {
		margin: 0 0 10px;
		font-family: 'Courier New', monospace;
		font-size: 0.82rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.new-pages ul {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
		gap: 10px;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.new-pages li {
		display: grid;
		gap: 4px;
		border-left: 3px solid #9b7139;
		background: rgb(129 104 69 / 0.08);
		padding: 9px 11px;
	}

	.new-pages span,
	.new-pages small {
		line-height: 1.35;
	}

	.new-pages small {
		opacity: 0.72;
	}

	.folio-actions button {
		min-height: 44px;
		border: 1px solid #4a4032;
		border-radius: 999px;
		background: transparent;
		color: #332d24;
		font:
			800 0.72rem/1 'Courier New',
			monospace;
		padding: 0 16px;
	}

	.folio-actions button.primary {
		background: #332d24;
		color: #f5e8c9;
	}

	.folio-actions button:focus-visible {
		outline: 3px solid #a1562d;
		outline-offset: 3px;
	}

	@media (max-width: 720px) {
		.folio-grid {
			grid-template-columns: 1fr;
		}
		header {
			align-items: stretch;
			flex-direction: column;
		}
		.seed {
			align-self: flex-start;
		}
	}
</style>
