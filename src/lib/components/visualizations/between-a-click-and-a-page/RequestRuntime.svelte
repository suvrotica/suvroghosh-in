<script lang="ts">
	import { onMount } from 'svelte';
	import { resolveMotion } from '$lib/motion/preferences';
	import {
		createJourney,
		sampleJourney,
		DEFAULT_INPUT,
		normaliseInput,
		type JourneyInput,
		type Area,
		type StageId
	} from '$lib/visualizations/between-a-click-and-a-page/model';
	import RequestScene from './RequestScene.svelte';
	const areaNotes: Record<Area, { label: string; title: string; text: string }> = {
		address: {
			label: 'Address index',
			title: 'A name needs an address.',
			text: 'The Domain Name System (DNS) answers an address question. It does not fetch the article or decide every turn through the network. An address is useful. It is not a delivery.'
		},
		coupling: {
			label: 'Connection',
			title: 'Two different agreements.',
			text: 'TCP establishes connection state at both ends. Transport Layer Security (TLS) then checks the server’s identity and protects the exchange. A secure connection can still deliver complete nonsense. Encryption has a narrower job.'
		},
		transport: {
			label: 'Transport tracks',
			title: 'The message travels as bytes.',
			text: 'Internet Protocol (IP) packets carry TCP segments across networks. The numbered pieces here represent ranges in one decrypted response stream. Their boundaries are illustrative; a request or response need not fit inside one segment.'
		},
		buffer: {
			label: 'Receiving tray',
			title: 'Later is not the same as next.',
			text: 'TCP can receive later bytes before an earlier range. The later bytes wait in its buffer. The application sees the next uninterrupted part of the stream when the gap is filled. The counter gives the next expected byte offset, not a separate receipt for every tile.'
		},
		server: {
			label: 'Server rack',
			title: 'Somebody has to do the work.',
			text: 'The operating system establishes TCP state. A listening socket accepts clients; the connected socket carries their bytes. The server parses HTTP, chooses a handler and prepares a response. A file may be enough. An application or database is an additional choice.'
		},
		browser: {
			label: 'Browser easel',
			title: 'The document is only the beginning.',
			text: 'The browser can begin reading the HTML it already has, then request referenced styles, images and scripts. This model groups those follow-up resources into one small exchange on the same connection. Real pages can reach several origins.'
		}
	};
	const stageQuestions: Record<StageId, string> = {
		dns: 'Where should this name lead?',
		tcp: 'Are both ends ready to exchange bytes?',
		tls: 'Who am I talking to, and can others read this?',
		request: 'What exactly is being asked for?',
		server: 'What must the server do before it can answer?',
		response: 'Which bytes can the browser use already?',
		resources: 'What else does this document need?',
		complete: 'Where did the waiting go?'
	};
	let input = $state<JourneyInput>({ ...DEFAULT_INPUT });
	let timeMs = $state(0);
	let playing = $state(false);
	let still = $state(false);
	let inspected = $state<Area | null>(null);
	let overview = $state(false);
	const controlId = $props.id();
	let host: HTMLDivElement;
	let scene: RequestScene;
	let scrubber: HTMLInputElement;
	let frame = 0;
	let last = 0;
	let elapsed = 0;
	let visible = true;
	let publishedAt = 0;
	const journey = $derived(createJourney(input));
	const snapshot = $derived(sampleJourney(journey, timeMs));
	const selected = $derived(inspected ?? snapshot.stage.area);
	const note = $derived(areaNotes[selected]);
	const baseline = $derived(
		createJourney({ ...input, connection: 'fresh', cache: 'origin', lostSegment: false })
	);
	const activeStages = $derived(journey.stages.filter((stage) => !stage.skipped));
	const ms = (value: number) => `${Math.round(value).toLocaleString('en-GB')} ms`;
	function stopFrames() {
		cancelAnimationFrame(frame);
		frame = 0;
		last = 0;
	}
	function pause() {
		playing = false;
		timeMs = elapsed;
		stopFrames();
	}
	function seek(value: number) {
		pause();
		elapsed = Math.max(0, Math.min(journey.totalMs, value));
		timeMs = elapsed;
		scene?.present(sampleJourney(journey, elapsed));
	}
	function update(changes: Partial<JourneyInput>) {
		pause();
		input = normaliseInput({ ...input, ...changes });
		elapsed = 0;
		timeMs = 0;
		inspected = null;
	}
	function reset() {
		pause();
		input = { ...DEFAULT_INPUT };
		elapsed = 0;
		timeMs = 0;
		inspected = null;
		overview = false;
	}
	function tick(now: number) {
		frame = 0;
		if (!playing || still || !visible || document.hidden) {
			last = 0;
			return;
		}
		const dt = last ? Math.min(now - last, 60) : 0;
		last = now;
		// Every scenario uses the same viewing pace. Simulated milliseconds stay independent of wall time.
		elapsed = Math.min(journey.totalMs, elapsed + dt / 24);
		const current = sampleJourney(journey, elapsed);
		scene?.present(current);
		if (scrubber) scrubber.value = String(elapsed);
		if (
			now - publishedAt >= 180 ||
			current.stage.id !== snapshot.stage.id ||
			elapsed === journey.totalMs
		) {
			timeMs = elapsed;
			publishedAt = now;
		}
		if (elapsed >= journey.totalMs) {
			playing = false;
			last = 0;
			return;
		}
		frame = requestAnimationFrame(tick);
	}
	function start() {
		if (still) return;
		if (elapsed >= journey.totalMs) seek(0);
		inspected = null;
		playing = true;
		if (visible && !document.hidden && !frame) frame = requestAnimationFrame(tick);
	}
	function next() {
		const nextStage = activeStages.find((stage) => stage.startMs > timeMs + 0.01);
		if (nextStage)
			seek(nextStage.startMs + Math.min(0.01, (nextStage.endMs - nextStage.startMs) / 2));
		else seek(journey.totalMs);
		inspected = null;
	}
	function inspectGap() {
		update({ lostSegment: true, cache: 'origin' });
		const lossJourney = createJourney({ ...input, lostSegment: true, cache: 'origin' });
		seek(lossJourney.segments[3].originalArrivalMs + 1);
		inspected = 'buffer';
	}
	onMount(() => {
		const query = matchMedia('(prefers-reduced-motion: reduce)');
		const motion = () => {
			still = resolveMotion(document.documentElement.dataset.motion, query.matches) === 'still';
			if (still) pause();
		};
		motion();
		query.addEventListener('change', motion);
		const preference = new MutationObserver(motion);
		preference.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ['data-motion']
		});
		const observer = new IntersectionObserver((entries) => {
			visible = entries.at(-1)?.isIntersecting ?? false;
			if (!visible) stopFrames();
			else if (playing && !still && !frame && !document.hidden) frame = requestAnimationFrame(tick);
		});
		observer.observe(host);
		const visibility = () => {
			if (document.hidden) stopFrames();
			else if (playing && visible && !still && !frame) frame = requestAnimationFrame(tick);
		};
		document.addEventListener('visibilitychange', visibility);
		return () => {
			stopFrames();
			observer.disconnect();
			preference.disconnect();
			query.removeEventListener('change', motion);
			document.removeEventListener('visibilitychange', visibility);
		};
	});
</script>

<div
	class="net-runtime"
	data-network-ready
	data-still={still}
	data-stage={snapshot.stage.id}
	bind:this={host}
>
	<div class="net-capture-card" data-network-poster>
		<header class="net-masthead">
			<div class="net-edition">
				<span>THE EVERYDAY MACHINERY / 01</span><span>AN INTERNET FIELD INSTRUMENT</span>
			</div>
			<h1>Between a click<br />and <em>a page.</em></h1>
			<p>A page seems to arrive all at once. Its obligations arrive one at a time.</p>
		</header>
		<div class="net-main">
			<RequestScene bind:this={scene} {snapshot} {selected} {overview} />
			<aside class="net-guide" aria-label="Current request step">
				<span class="net-kicker"
					>{String(
						Math.max(1, journey.stages.findIndex((stage) => stage.id === snapshot.stage.id) + 1)
					).padStart(2, '0')} / THE EXCHANGE</span
				>
				<h2 aria-live="polite" aria-atomic="true">{snapshot.stage.title}</h2>
				<p class="net-question">{stageQuestions[snapshot.stage.id]}</p>
				<p>{snapshot.stage.detail}</p>
				<dl class="net-stage-readout">
					<div>
						<dt>Elapsed in model</dt>
						<dd><output>{ms(timeMs)}</output></dd>
					</div>
					<div>
						<dt>Whole journey</dt>
						<dd>{ms(journey.totalMs)}</dd>
					</div>
				</dl>
				<span class="net-model-label">ILLUSTRATIVE TIMINGS · NOT A SPEED TEST</span>
			</aside>
		</div>
	</div>
	<div class="net-controls">
		<div class="net-playback">
			<button class="net-primary" onclick={() => (playing ? pause() : start())} disabled={still}
				>{playing ? 'Pause the request' : 'Follow the request'}</button
			><button onclick={next} disabled={timeMs >= journey.totalMs}>Next step</button><button
				onclick={reset}>Start again</button
			><span
				>{still
					? 'Still mode: use the steps or timeline.'
					: 'Slow viewing pace · 24× the simulated time'}</span
			>
		</div>
		<label class="net-scrubber"
			>Position in the exchange <input
				aria-label="Position in the exchange"
				type="range"
				min="0"
				max={journey.totalMs}
				step="1"
				value={timeMs}
				bind:this={scrubber}
				oninput={(event) => seek(Number(event.currentTarget.value))}
			/></label
		>
		<nav class="net-steps" aria-label="Request stages">
			{#each journey.stages as stage, index (stage.id)}<button
					class:current={snapshot.stage.id === stage.id}
					aria-current={snapshot.stage.id === stage.id ? 'step' : undefined}
					onclick={() => {
						seek(stage.startMs);
						inspected = null;
					}}
					disabled={stage.skipped}
					><span>{String(index + 1).padStart(2, '0')}</span
					>{stage.shortName}{#if stage.skipped}<small>skipped</small>{/if}</button
				>{/each}
		</nav>
		<div class="net-experiments">
			<div>
				<span class="net-kicker">CHANGE ONE CONDITION</span>
				<h2>Where does the waiting go?</h2>
				<p>
					Each change restarts the same small example. The network is simulated inside this page.
				</p>
			</div>
			<fieldset>
				<legend>Connection</legend><label
					><input
						type="radio"
						name={`net-connection-${controlId}`}
						checked={input.connection === 'fresh'}
						onchange={() => update({ connection: 'fresh' })}
					/> Fresh connection</label
				><label
					><input
						type="radio"
						name={`net-connection-${controlId}`}
						checked={input.connection === 'reused'}
						onchange={() => update({ connection: 'reused' })}
					/> Reuse secure connection</label
				><small>Reuse also assumes the DNS answer is cached.</small>
			</fieldset>
			<fieldset>
				<legend>Round-trip delay</legend><label class="net-range"
					>{ms(input.rttMs)}
					<input
						aria-label="Round-trip delay"
						type="range"
						min="40"
						max="400"
						step="20"
						value={input.rttMs}
						oninput={(event) => update({ rttMs: Number(event.currentTarget.value) })}
					/></label
				><small>Time for a trip there and back, separate from server work.</small>
			</fieldset>
			<fieldset>
				<legend>Server work</legend><select
					aria-label="Server work"
					value={input.serverMs}
					onchange={(event) => update({ serverMs: Number(event.currentTarget.value) })}
					><option value={20}>Fast · 20 ms</option><option value={80}>Ordinary · 80 ms</option
					><option value={600}>Busy · 600 ms</option></select
				><small>One assumed wait and handling time at the origin.</small>
			</fieldset>
		</div>
		<div class="net-switches">
			<label
				><input
					type="checkbox"
					checked={input.lostSegment}
					onchange={(event) => update({ lostSegment: event.currentTarget.checked })}
				/> Lose one response segment</label
			><label
				><input
					type="checkbox"
					checked={input.cache === 'fresh'}
					onchange={(event) => update({ cache: event.currentTarget.checked ? 'fresh' : 'origin' })}
				/> Use a fresh browser cache copy</label
			><button onclick={inspectGap}>Inspect the missing bytes</button>
		</div>
		{#if input.cache === 'fresh'}<p class="net-notice">
				This is a fresh copy in the browser, with the example’s resources already cached. No network
				request reaches the origin. A CDN cache would still require a journey to the edge.
			</p>{/if}
		<div class="net-inspector">
			<div class="net-inspect-menu">
				<span class="net-kicker">LOOK INSIDE</span
				>{#each Object.entries(areaNotes) as [area, entry] (area)}<button
						aria-pressed={selected === area && !overview}
						onclick={() => {
							inspected = area as Area;
							overview = false;
						}}>{entry.label}</button
					>{/each}<button aria-pressed={overview} onclick={() => (overview = !overview)}
					>Whole instrument</button
				>
			</div>
			<div class="net-inspect-copy">
				<h3>{note.title}</h3>
				<p>{note.text}</p>
				{#if selected === 'server'}<ol class="net-server-path">
						<li>Listening socket accepts clients</li>
						<li>Connected socket carries bytes</li>
						<li>HTTP parser reads the request</li>
						<li>Handler obtains the answer</li>
						<li>Response returns on the connection</li>
					</ol>
					<p class="net-small">
						An event loop and several workers are one way to serve many clients. A thread pool is
						another. Neither makes one request equal one connection.
					</p>{/if}
			</div>
		</div>
		<div class="net-ledger">
			<div>
				<span class="net-kicker">THE RECEIVING TRAY</span>
				<h3>Bytes received. Bytes usable.</h3>
				<p>
					Offsets start at zero in this example’s decrypted response. They are not literal wire
					sequence numbers.
				</p>
				<dl class="net-byte-readout">
					<div>
						<dt>Delivered in order</dt>
						<dd data-delivered>{snapshot.deliveredBytes.toLocaleString('en-GB')} B</dd>
					</div>
					<div>
						<dt>Waiting beyond a gap</dt>
						<dd data-buffered>{snapshot.bufferedBytes.toLocaleString('en-GB')} B</dd>
					</div>
					<div>
						<dt>Next expected offset</dt>
						<dd data-next-byte>{snapshot.nextExpectedByte.toLocaleString('en-GB')}</dd>
					</div>
				</dl>
			</div>
			<div class="net-tiles">
				{#each snapshot.segments as segment (segment.index)}<div
						class:buffered={segment.state === 'buffered'}
						class:delivered={segment.state === 'delivered'}
						data-segment-state={segment.state}
					>
						<span
							>{segment.firstByte.toLocaleString('en-GB')}–{(segment.endByte - 1).toLocaleString(
								'en-GB'
							)}</span
						><strong>{segment.state}</strong><small>1,200 bytes</small>
					</div>{:else}<p>
						The fresh browser copy needs no response bytes from the network.
					</p>{/each}
			</div>
		</div>
		<details class="net-details">
			<summary>Read the timing receipt and model limits</summary>
			<div class="net-receipt">
				<dl>
					{#each Object.entries(journey.accounting) as [key, value] (key)}<div>
							<dt>
								{key
									.replace(/Ms$/, '')
									.replace(/([A-Z])/g, ' $1')
									.toLowerCase()}
							</dt>
							<dd>{ms(value)}</dd>
						</div>{/each}
				</dl>
				<div>
					<p>
						The initial response is 4,800 bytes, illustrated as four equal pieces. The model uses
						one fixed link rate, a fixed loss-recovery rule and one grouped follow-up resource
						exchange on the reused connection. Browser assembly takes 60 ms. These are chosen
						teaching assumptions.
					</p>
					<p>
						The comparison at the same delay and server setting, with a fresh connection and no loss
						or cache, takes {ms(baseline.totalMs)}. A shorter model time is not a measured
						improvement to your connection.
					</p>
					<p>
						Congestion control, receiver flow control, certificate errors, retries that ultimately
						fail, packet headers, TLS record boundaries, DNS recursion, multiple origins and browser
						scheduling are outside the model. No packets are sent by the instrument.
					</p>
				</div>
			</div>
		</details>
		<details class="net-details">
			<summary>What changed with HTTP/2 and HTTP/3?</summary>
			<div class="net-protocols">
				<div>
					<h3>HTTP/1.1</h3>
					<p>
						The baseline here. A connection can stay open for later exchanges. Our small example
						handles them sequentially.
					</p>
				</div>
				<div>
					<h3>HTTP/2</h3>
					<p>
						Several HTTP streams share a TCP connection. Their messages can interleave, but a
						missing TCP byte range can still hold up later data across streams.
					</p>
				</div>
				<div>
					<h3>HTTP/3</h3>
					<p>
						HTTP uses QUIC over UDP. QUIC supplies reliable streams and integrates TLS security.
						Loss on one stream need not block unrelated stream delivery; shared congestion and other
						dependencies still matter.
					</p>
				</div>
			</div>
		</details>
		<p class="net-boundary">
			The bench is a physical metaphor. The internet is a network of networks; the Web is one use of
			it. TCP establishes a logical connection, never a reserved rail through the world.
		</p>
	</div>
</div>
