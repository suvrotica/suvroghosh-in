<script lang="ts">
	import { MODEL_VERSION } from '$lib/visualizations/lightning-atlas/config';
	import { settingsText } from '$lib/visualizations/lightning-atlas/serialization';
	import type { SerializableAtlasState } from '$lib/visualizations/lightning-atlas/types';

	type Props = { state: SerializableAtlasState; oncopied?: (message: string) => void };
	let { state, oncopied }: Props = $props();

	async function copySettings() {
		try {
			await navigator.clipboard.writeText(settingsText(state));
			oncopied?.('Readable model settings copied.');
		} catch {
			oncopied?.('The browser could not copy model settings.');
		}
	}
</script>

<details class="methodology" id="lightning-atlas-methodology">
	<summary>What this model simulates — and what it cheats</summary>
	<div class="method-grid">
		<section>
			<h3>Purpose and deterministic seed</h3>
			<p>
				This is a physically inspired procedural model for inspecting relationships among simplified
				storm charge, local terrain prominence, exposed features and bounded chance. Separate seeded
				streams govern terrain, storm scheduling, leader propagation, thunder and decoration, so
				changing rain quality cannot move an attachment.
			</p>
		</section>
		<section>
			<h3>Terrain and field proxy</h3>
			<p>
				Each preset composes its own deterministic height and semantic masks. Soft ellipsoidal
				charge pockets supply an analytic normalised potential and field-direction proxy. Values are
				not volts or volts per metre.
			</p>
		</section>
		<section>
			<h3>Leader and upward streamers</h3>
			<p>
				Bounded active tips sample competing directions using electrical advantage, persistence,
				proximity and seeded variation. Competitive alternatives become real branch tips. Near the
				surface, several candidates can launch simplified upward streamers; field position,
				distance, prominence, isolation, tip shape and chance choose one connection.
			</p>
		</section>
		<section>
			<h3>Return stroke and replay</h3>
			<p>
				The luminous return front uses the already generated main path from attachment back toward
				the cloud. Replay stores the immutable channel and one phase-event list; scrubbing never
				invents a new bolt.
			</p>
		</section>
		<section>
			<h3>Thunder delay</h3>
			<p>
				The first-arrival delay divides observer distance to the nearest point on the
				piecewise-linear channel by an approximate 343 metres per second. Procedural audio combines
				a nearby crack and filtered distant rumble. It is illustrative, and sound remains off until
				a user gesture.
			</p>
		</section>
		<section>
			<h3>What it cheats</h3>
			<p>
				Coarse charge pockets replace measured microphysics; the field is not a full electromagnetic
				solution; clouds and terrain are procedural; streamer initiation, conductivity and ground
				current are qualitative; leader and return timing is slowed; intensity is relative. There is
				no ion chemistry, hydrometeor collision model, heating, shock-wave solver, forecast,
				casualty model or protection certification.
			</p>
		</section>
		<section>
			<h3>Performance boundaries</h3>
			<p>
				Terrain uses a bounded 65 × 65 height grid; active tips, candidate directions, branches and
				segments all have hard caps. The worker yields between chunks, decorative clouds and rain
				use coarse procedural geometry, and automatic render quality changes pixel density and scene
				detail without changing the seeded strike. These simplifications keep the laboratory
				responsive; they are not physical resolutions.
			</p>
		</section>
		<section class="sources">
			<h3>Scientific reading</h3>
			<ul>
				<li>
					<a href="https://www.nssl.noaa.gov/education/svrwx101/lightning/types/"
						>NSSL: lightning types</a
					>
				</li>
				<li>
					<a href="https://www.nssl.noaa.gov/education/svrwx101/lightning/faq/"
						>NSSL: lightning FAQ</a
					>
				</li>
				<li>
					<a href="https://www.nssl.noaa.gov/education/svrwx101/lightning/detection/"
						>NSSL: lightning detection</a
					>
				</li>
				<li>
					<a
						href="https://www.nesdis.noaa.gov/about/k-12-education/severe-weather/what-causes-lightning-and-thunder"
						>NOAA: lightning and thunder</a
					>
				</li>
				<li>
					<a href="https://www.weather.gov/safety/lightning-science-thunder"
						>NWS: the science of thunder</a
					>
				</li>
				<li>
					<a href="https://volcanoes.usgs.gov/volcanic_ash/lightning.html"
						>USGS: volcanic lightning</a
					>
				</li>
			</ul>
		</section>
	</div>
	<div class="method-footer">
		<span>Model version {MODEL_VERSION}</span>
		<button type="button" onclick={copySettings}>Copy model settings</button>
	</div>
	<p class="safety">
		<strong>This visualization is not a lightning-safety tool.</strong> Real thunder means seek proper
		shelter.
	</p>
</details>

<style>
	.methodology {
		border: 1px solid var(--atlas-line);
		border-radius: 0.45rem;
		background: var(--atlas-panel);
		color: var(--atlas-text);
	}
	summary {
		min-height: 3rem;
		cursor: pointer;
		padding: 0.8rem 1rem;
		color: var(--atlas-accent);
		font-weight: 750;
	}
	.method-grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 0.75rem;
		border-top: 1px solid var(--atlas-line);
		padding: 1rem;
	}
	section {
		border-left: 1px solid var(--atlas-line);
		padding-left: 0.7rem;
	}
	h3,
	p {
		margin: 0;
	}
	h3 {
		font-size: 0.78rem;
	}
	p {
		margin-top: 0.35rem;
		color: var(--atlas-muted);
		font-size: 0.72rem;
		line-height: 1.5;
	}
	ul {
		margin: 0.35rem 0 0;
		padding-left: 1rem;
		color: var(--atlas-muted);
		font-size: 0.72rem;
		line-height: 1.55;
	}
	a {
		color: var(--atlas-accent);
		text-underline-offset: 0.16rem;
	}
	a:focus-visible {
		outline: 2px solid var(--atlas-accent);
		outline-offset: 2px;
	}
	.method-footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		border-top: 1px solid var(--atlas-line);
		padding: 0.75rem 1rem;
		color: var(--atlas-muted);
		font:
			0.68rem 'Courier Prime',
			monospace;
	}
	button {
		min-height: 2.75rem;
		border: 1px solid var(--atlas-line);
		border-radius: 0.35rem;
		background: var(--atlas-control);
		padding: 0.45rem 0.7rem;
		color: var(--atlas-text);
		font: inherit;
	}
	.safety {
		margin: 0;
		border-top: 1px solid var(--atlas-line);
		padding: 0.75rem 1rem;
		color: var(--atlas-text);
	}

	@media (max-width: 800px) {
		.method-grid {
			grid-template-columns: 1fr 1fr;
		}
	}
	@media (max-width: 520px) {
		.method-grid {
			grid-template-columns: 1fr;
		}
		.method-footer {
			align-items: stretch;
			flex-direction: column;
		}
	}
</style>
