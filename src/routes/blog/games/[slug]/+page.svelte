<script lang="ts">
	import { resolve } from '$app/paths';
	import SEO from '$lib/components/seo/SEO.svelte';
	import CalcuttaFootpathGame from '$lib/components/games/calcutta-footpath/CalcuttaFootpathGame.svelte';
	import KagojerDanaShell from '$lib/components/games/kagojer-dana/KagojerDanaShell.svelte';
	import CrosswordGame from '$lib/components/games/crossword/CrosswordGame.svelte';
	import PeriodBoardGames from '$lib/components/games/period-board-games/PeriodBoardGames.svelte';
	import { healthcareItPack } from '$lib/games/crossword/content/packs/healthcare-it';
	import type { GameExperience } from '$lib/games/catalog';
	import type { PageData } from './$types';

	const instructionHeading = {
		'period-board-games': 'How to play',
		'healthcare-it-crossword': 'How to solve',
		'kagojer-dana': 'How to fly',
		'calcutta-footpath': 'How to walk'
	} satisfies Record<GameExperience, string>;

	let { data }: { data: PageData } = $props();
</script>

<SEO {...data.seo} />

{#if data.game.experience === 'period-board-games'}
	<PeriodBoardGames game={data.game} />
{:else if data.game.experience === 'kagojer-dana'}
	<KagojerDanaShell game={data.game} />
{:else if data.game.experience === 'healthcare-it-crossword'}
	<CrosswordGame game={data.game} pack={healthcareItPack} />
{:else if data.game.experience === 'calcutta-footpath'}
	<CalcuttaFootpathGame game={data.game} />
{/if}

<section
	id="about-the-game"
	aria-labelledby="about-game-heading"
	class="game-static-copy bg-[#f3ead9] px-5 py-14 text-[#302821] sm:px-8 sm:py-20 dark:bg-[#161513] dark:text-[#eee4d3]"
>
	<div class="mx-auto max-w-4xl">
		<nav aria-label="Breadcrumb" class="mb-4 text-sm">
			<ol class="flex flex-wrap items-center gap-2 text-[#6c5a48] dark:text-[#b9aa93]">
				<li><a href={resolve('/')} class="underline underline-offset-4">Home</a></li>
				<li aria-hidden="true">/</li>
				<li><a href={resolve('/blog/games')} class="underline underline-offset-4">Games</a></li>
				<li aria-hidden="true">/</li>
				<li aria-current="page">{data.game.shortTitle}</li>
			</ol>
		</nav>
		{#if data.metadata.dateModified}
			<p class="mb-8 text-xs text-[#6c5a48] dark:text-[#b9aa93]">
				Updated <time datetime={data.metadata.dateModified}>{data.metadata.dateModified}</time>
			</p>
		{/if}

		<div class="grid gap-10 lg:grid-cols-[1.25fr_0.75fr]">
			<div>
				<p
					class="mb-2 text-xs font-black tracking-[0.17em] text-amber-800 uppercase dark:text-amber-300"
				>
					About the game
				</p>
				{#if data.game.experience === 'period-board-games'}
					<h2 id="about-game-heading" class="m-0 text-3xl leading-tight font-black sm:text-4xl">
						A folding board, turned over without losing the afternoon.
					</h2>
					<p class="mt-5 text-left text-lg leading-relaxed">
						Play a complete Ludo or Saap-Ludo match against one to three local computer opponents.
						Each face keeps its own match, seeded die and move history in this browser.
					</p>
					<p class="mt-4 text-left leading-relaxed">
						This is an original representative “Calcutta family preset”, informed by household
						practice but not presented as one universal regional rulebook or a reproduction of any
						manufacturer’s board.
					</p>
				{:else if data.game.experience === 'kagojer-dana'}
					<h2 id="about-game-heading" class="m-0 text-3xl leading-tight font-black sm:text-4xl">
						You do not command the wind. You borrow it.
					</h2>
					<p class="mt-5 text-left text-lg leading-relaxed">
						Fly a properly folded paper plane from a North Calcutta windowsill, through lanes and
						roof air, over the Hooghly and into a skyline where memory has rearranged the map.
					</p>
					<p class="mt-4 text-left leading-relaxed">
						This is not a municipal map. Calcutta has been assembled by memory and crosswind. Each
						place keeps its local character even when the next district could never occupy the next
						street in ordinary geography.
					</p>
				{:else if data.game.experience === 'healthcare-it-crossword'}
					<h2 id="about-game-heading" class="m-0 text-3xl leading-tight font-black sm:text-4xl">
						Forgetting is expected. The crossings help it come back.
					</h2>
					<p class="mt-5 text-left text-lg leading-relaxed">
						Choose a healthcare IT path, difficulty and round length, then solve a compact authored
						grid about interoperability, clinical systems, terminology, research data, engineering,
						analytics, governance and responsible AI.
					</p>
					<p class="mt-4 text-left leading-relaxed">
						Hints move deliberately from a nudge to a teaching reveal. Completed answers unlock
						concise Aha cards; concepts solved with substantial help return in later Review Rounds.
						Every public grid is prevalidated—there is no runtime clue or puzzle generation.
					</p>
				{:else if data.game.experience === 'calcutta-footpath'}
					<h2 id="about-game-heading" class="m-0 text-3xl leading-tight font-black sm:text-4xl">
						One ordinary walk. No correct side.
					</h2>
					<p class="mt-5 text-left text-lg leading-relaxed">
						Walk into a small three-dimensional North Calcutta neighbourhood of bending lanes,
						ordinary old houses, shops, courtyards and one wider road. Choose a bylane, turn around,
						wait for traffic, stop for tea and find another route when the city occupies the first
						one.
					</p>
					<p class="mt-4 text-left leading-relaxed">
						The authored street network includes residential, bazaar, workshop and old-house lanes.
						Pedestrians have destinations, vehicles approach through real depth, rain changes the
						street, and every run’s small events remain deterministic from its seed.
					</p>
				{/if}
			</div>

			<aside class="rounded-2xl border border-amber-950/15 bg-white/55 p-5 dark:bg-white/5">
				<h2 class="m-0 text-lg font-black">{instructionHeading[data.game.experience]}</h2>
				<ul class="mt-4 space-y-3 text-sm leading-relaxed">
					{#if data.game.experience === 'period-board-games'}
						<li><strong>Choose a board face</strong> with the two cardboard tabs.</li>
						<li><strong>Roll the die yourself</strong> on every human throw.</li>
						<li>
							<strong>Choose a highlighted Ludo token</strong> on the board or with a full-size move button.
						</li>
						<li>
							<strong>New game</strong> replaces only the active face; the other saved match remains untouched.
						</li>
					{:else if data.game.experience === 'kagojer-dana'}
						<li><strong>W / ↑</strong> raises the nose and spends speed.</li>
						<li><strong>S / ↓</strong> lowers the nose and gathers speed.</li>
						<li><strong>A / D or ← / →</strong> banks into a turn.</li>
						<li>
							<strong>Escape</strong> pauses and releases control; <strong>R</strong> asks for another
							throw.
						</li>
					{:else if data.game.experience === 'healthcare-it-crossword'}
						<li>
							<strong>Type</strong> to fill a cell; arrow keys move spatially through the grid.
						</li>
						<li><strong>Space or Enter</strong> changes direction at a crossing.</li>
						<li><strong>Backspace</strong> clears, then moves back; Delete clears in place.</li>
						<li>
							<strong>Solve as a list</strong> provides the same clues and answers without the visual
							grid.
						</li>
					{:else if data.game.experience === 'calcutta-footpath'}
						<li><strong>Click or tap the visible road</strong> and the walker goes there.</li>
						<li>
							<strong>Arrow Up:</strong> walk. <strong>Left / Right:</strong> turn.
							<strong>Down:</strong> step back.
						</li>
						<li><strong>Space:</strong> hurry briefly. <strong>Escape:</strong> pause.</li>
						<li>Labelled Stop, Turn around, Map and food buttons require no game shorthand.</li>
					{/if}
				</ul>
			</aside>
		</div>

		<div class="mt-12 grid gap-5 sm:grid-cols-2">
			{#if data.game.experience === 'period-board-games'}
				<section class="rounded-xl border border-amber-950/15 p-5">
					<h2 class="m-0 text-xl font-black">The preset</h2>
					<p class="mt-3 text-left text-sm leading-relaxed">
						The default Ludo table uses safe starts and rosettes, blockades, exact home, a third-six
						discard, and single capture or home bonuses. Saap-Ludo needs one to enter, uses one
						transport per landing, grants a throw after six, and requires exact 100.
					</p>
				</section>
				<section class="rounded-xl border border-amber-950/15 p-5">
					<h2 class="m-0 text-xl font-black">Fair local opponents</h2>
					<p class="mt-3 text-left text-sm leading-relaxed">
						Mithu, Babai, Tukai, Rini, Piku or Bulti are plainly labelled computer players. They
						share the human’s seeded unbiased die, see no future rolls, and choose only from the
						current legal moves.
					</p>
				</section>
				<section class="rounded-xl border border-amber-950/15 p-5">
					<h2 class="m-0 text-xl font-black">Access and pace</h2>
					<p class="mt-3 text-left text-sm leading-relaxed">
						Keyboard tabs, labelled dice, large legal-move buttons, concise live narration, visible
						logs and patterned tokens make the games playable without interpreting colour or tiny
						squares. Reduced motion settles movement without changing a result.
					</p>
				</section>
				<section class="rounded-xl border border-amber-950/15 p-5">
					<h2 class="m-0 text-xl font-black">Private and durable</h2>
					<p class="mt-3 text-left text-sm leading-relaxed">
						Both logical matches and the serializable random state stay in local storage. No login,
						server, API, multiplayer service, ranking, advertising or game telemetry is involved.
					</p>
				</section>
			{:else if data.game.experience === 'kagojer-dana'}
				<section class="rounded-xl border border-amber-950/15 p-5">
					<h2 class="m-0 text-xl font-black">Read the wind</h2>
					<p class="mt-3 text-left text-sm leading-relaxed">
						Smoke, washing, leaves, pages, birds, rain and river marks move before a strong gust
						arrives. Thermals climb from sunlit roofs and open ground; lee sides sink.
					</p>
				</section>
				<section class="rounded-xl border border-amber-950/15 p-5">
					<h2 class="m-0 text-xl font-black">Charcoal in three dimensions</h2>
					<p class="mt-3 text-left text-sm leading-relaxed">
						Real geometry provides mass and parallax. Tonal bands, surface-bound hatching, heavy
						outer ink and erased-distance fog make the city behave like a drawing without flattening
						it.
					</p>
				</section>
				<section class="rounded-xl border border-amber-950/15 p-5">
					<h2 class="m-0 text-xl font-black">Sound, access and control</h2>
					<p class="mt-3 text-left text-sm leading-relaxed">
						Sound starts only after you ask for it. Captions, Calm Flight, Calm Camera, stronger
						wind marks, high-contrast corridors, sensitivity and pitch inversion remain available as
						ordinary controls over the canvas.
					</p>
				</section>
				<section class="rounded-xl border border-amber-950/15 p-5">
					<h2 class="m-0 text-xl font-black">Asset credits</h2>
					<p class="mt-3 text-left text-sm leading-relaxed">
						Geometry, materials, paper textures and the procedural sound design are original to this
						game. The local credit manifest records every shipped source; no CDN or scraped
						recording is used at runtime.
					</p>
				</section>
			{:else if data.game.experience === 'healthcare-it-crossword'}
				<section class="rounded-xl border border-amber-950/15 p-5">
					<h2 class="m-0 text-xl font-black">Coach, Traditional and hints</h2>
					<p class="mt-3 text-left text-sm leading-relaxed">
						Coach quietly marks letters that do not fit. Traditional waits until you request a
						check. Every answer has six ordered hint stages, including strategic crossing letters
						and a final show-and-teach step.
					</p>
				</section>
				<section class="rounded-xl border border-amber-950/15 p-5">
					<h2 class="m-0 text-xl font-black">Accessibility and immersion</h2>
					<p class="mt-3 text-left text-sm leading-relaxed">
						The numbered grid has roving keyboard focus, spoken cell context, visible focus and a
						complete list-based solver. Full screen is optional and preserves an obvious exit; the
						layout also respects reduced motion, high contrast, forced colours and safe areas.
					</p>
				</section>
				<section class="rounded-xl border border-amber-950/15 p-5">
					<h2 class="m-0 text-xl font-black">Private, durable learning</h2>
					<p class="mt-3 text-left text-sm leading-relaxed">
						Unfinished letters, settings and mastery history stay on this device in local storage.
						They are not uploaded. Settings let you export, import, reset a round, clear this pack,
						or clear all crossword data.
					</p>
				</section>
				<section class="rounded-xl border border-amber-950/15 p-5">
					<h2 class="m-0 text-xl font-black">Sources and further routes</h2>
					<p class="mt-3 text-left text-sm leading-relaxed">
						Teaching cards link to standards publishers and primary guidance, with freshness notes
						and review dates. Continue through the
						<a
							class="font-bold underline underline-offset-4"
							href={resolve('/topics/[slug]', { slug: 'hl7-fhir' })}>HL7 & FHIR topic route</a
						>,
						<a
							class="font-bold underline underline-offset-4"
							href={resolve('/topics/[slug]', { slug: 'healthcare-ai' })}>Healthcare AI route</a
						>, or the related essays linked from each card.
					</p>
				</section>
			{:else if data.game.experience === 'calcutta-footpath'}
				<section class="rounded-xl border border-amber-950/15 p-5">
					<h2 class="m-0 text-xl font-black">Food and effects</h2>
					<p class="mt-3 text-left text-sm leading-relaxed">
						Fuchka restores stamina. Mishti restores morale but slows the eater. Tea sharpens hazard
						warnings until the hands become optimistic. Suspicious ghugni selects one consequence
						without consulting you.
					</p>
				</section>
				<section class="rounded-xl border border-amber-950/15 p-5">
					<h2 class="m-0 text-xl font-black">Accessibility</h2>
					<p class="mt-3 text-left text-sm leading-relaxed">
						Menus, map, prompts and route results are accessible HTML. The game supports simple
						keyboard and tap controls, visible equivalents for sound, high contrast, explicit mute,
						gentle camera movement, reduced motion, focus management and automatic pause.
					</p>
				</section>
				<section class="rounded-xl border border-amber-950/15 p-5">
					<h2 class="m-0 text-xl font-black">Technical notes</h2>
					<p class="mt-3 text-left text-sm leading-relaxed">
						A lightweight Three.js world is loaded only after Play. Metre-based geometry, a fixed
						step simulation, an authored navigation graph and named random streams keep movement,
						traffic and temporary obstructions coherent. Web Audio positions important sounds in the
						world and applies distance filtering, modest occlusion and restrained Doppler shift.
					</p>
				</section>
				<section class="rounded-xl border border-amber-950/15 p-5">
					<h2 class="m-0 text-xl font-black">Privacy and saved scores</h2>
					<p class="mt-3 text-left text-sm leading-relaxed">
						Settings, best scores, recent run summaries and the latest route stay in this browser’s
						local storage. They are not uploaded. There is no account, remote leaderboard,
						advertising, or game-specific telemetry.
					</p>
				</section>
			{/if}
		</div>

		<p class="mt-10 mb-0 text-center text-sm text-[#6c5a48] dark:text-[#b9aa93]">
			<a
				href="#game-experience"
				class="inline-flex min-h-11 items-center font-bold underline underline-offset-4"
			>
				Return to the game <span class="ml-1" aria-hidden="true">↑</span>
			</a>
		</p>
	</div>
</section>

{#if data.game.experience === 'period-board-games'}
	<noscript>
		<div class="bg-[#2a211b] p-6 text-center text-[#f8edd7]">
			JavaScript is required to roll the die and run the local computer opponents. The game’s rules,
			privacy explanation and historical boundaries remain available below.
		</div>
	</noscript>
{:else if data.game.experience === 'kagojer-dana'}
	<noscript>
		<div class="bg-[#2a211b] p-6 text-center text-[#f8edd7]">
			JavaScript is required for the live paper-plane flight. The poster, controls and article
			remain available without it.
		</div>
	</noscript>
{:else if data.game.experience === 'healthcare-it-crossword'}
	<noscript>
		<div class="bg-[#2a211b] p-6 text-center text-[#f8edd7]">
			JavaScript is required for the interactive crossword grid, hints and on-device progress. The
			game description, privacy explanation, source policy and related healthcare IT routes remain
			available on this page without it. Forgetting is expected; no progress is sent from this
			device.
		</div>
	</noscript>
{:else if data.game.experience === 'calcutta-footpath'}
	<noscript>
		<div class="bg-[#2a211b] p-6 text-center text-[#f8edd7]">
			JavaScript is required to run the street simulation. The game description and controls remain
			available below.
		</div>
	</noscript>
{/if}
