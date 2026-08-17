<script lang="ts">
	import { onMount, tick, type Component } from 'svelte';
	import AssumptionLedger from './AssumptionLedger.svelte';
	import FullscreenControl from './FullscreenControl.svelte';
	import type { LedgerRow } from './ui-types';

	type InitialAction = 'begin' | 'reveal';
	type RuntimeComponent = Component<{
		initialAction: InitialAction;
		initialExpanded?: boolean;
	}>;

	const INTRO_LEDGER_ROWS = [
		{
			id: 'country',
			label: 'Country',
			value: 'India',
			origin: 'Demo default, not confirmed',
			permittedUse: 'Display only; never personality inference',
			group: 'demo-defaults'
		},
		{
			id: 'city_context',
			label: 'City or place context',
			value: 'Kolkata',
			origin: 'Demo default, not confirmed',
			permittedUse: 'Display only; never personality inference',
			group: 'demo-defaults'
		},
		{
			id: 'age_band',
			label: 'Age band',
			value: 'Prefer not to say',
			origin: 'Demo default, not confirmed',
			permittedUse: 'Display only; never personality inference',
			group: 'demo-defaults'
		},
		{
			id: 'gender',
			label: 'Gender',
			value: 'Prefer not to say',
			origin: 'Demo default, not confirmed',
			permittedUse: 'Display only; never personality inference',
			group: 'demo-defaults'
		},
		{
			id: 'language',
			label: 'Language(s) used most',
			value: 'Bengali + English',
			origin: 'Demo default, not confirmed',
			permittedUse: 'Interface/surface wording only; unused in English v1',
			group: 'demo-defaults'
		},
		{
			id: 'no-confirmed-choices',
			label: 'Confirmed choices',
			value: 'None yet',
			origin: '—',
			permittedUse: 'Nothing from this group can influence the reading',
			group: 'selected'
		},
		{
			id: 'personality-evidence',
			label: 'Personality evidence',
			value: 'None',
			origin: '—',
			permittedUse: 'No validated personality model exists',
			group: 'unknowns'
		},
		{
			id: 'external-data',
			label: 'External data',
			value: 'None',
			origin: '—',
			permittedUse: 'No lookup, profile, account, or API',
			group: 'unknowns'
		},
		{
			id: 'transmitted-data',
			label: 'Selection data transmitted',
			value: 'None by this lab',
			origin: '—',
			permittedUse: 'Held in component memory only',
			group: 'unknowns'
		}
	] as const satisfies readonly LedgerRow[];

	let root: HTMLElement | undefined = $state();
	let mounted = $state(false);
	let expanded = $state(false);
	let fullscreenAvailable = $state(false);
	let fullscreenActive = $state(false);
	let returnFocus: HTMLButtonElement | null = null;
	let Runtime = $state<RuntimeComponent | null>(null);
	let runtimeAction = $state<InitialAction | null>(null);
	let runtimeLoading = $state(false);
	let runtimeError = $state('');
	let liveMessage = $state('');

	async function activateRuntime(action: InitialAction): Promise<void> {
		if (runtimeLoading || Runtime) return;
		runtimeLoading = true;
		runtimeError = '';
		runtimeAction = action;
		liveMessage =
			action === 'begin'
				? 'Opening step 1 of the local demonstration.'
				: 'Opening the complete explanation.';
		try {
			const module = await import('./BarnumLabRuntime.svelte');
			Runtime = module.default;
		} catch {
			runtimeLoading = false;
			runtimeAction = null;
			runtimeError =
				'The interactive laboratory could not open. The article and the no-JavaScript explanation remain available; you can try again.';
			liveMessage = runtimeError;
		}
	}

	async function openExpanded(trigger: HTMLButtonElement): Promise<void> {
		if (!root) return;
		returnFocus = trigger;
		if (fullscreenAvailable) {
			try {
				await root.requestFullscreen();
				return;
			} catch {
				fullscreenAvailable = false;
			}
		}
		expanded = true;
		fullscreenActive = false;
		liveMessage =
			'The laboratory expanded in the document. Press the Exit button to restore its width.';
		await tick();
		root.scrollIntoView({ block: 'start', behavior: 'auto' });
	}

	async function closeExpanded(): Promise<void> {
		if (!root) return;
		if (document.fullscreenElement === root) await document.exitFullscreen();
		expanded = false;
		fullscreenActive = false;
		await tick();
		returnFocus?.focus({ preventScroll: true });
	}

	onMount(() => {
		if (!root) return;
		const labRoot = root;
		mounted = true;
		fullscreenAvailable = Boolean(document.fullscreenEnabled && labRoot.requestFullscreen);
		const handleFullscreen = () => {
			fullscreenActive = document.fullscreenElement === labRoot;
			expanded = fullscreenActive;
			if (!fullscreenActive && returnFocus) void tick().then(() => returnFocus?.focus());
		};
		document.addEventListener('fullscreenchange', handleFullscreen);
		return () => document.removeEventListener('fullscreenchange', handleFullscreen);
	});
</script>

{#if Runtime && runtimeAction}
	<Runtime initialAction={runtimeAction} initialExpanded={expanded} />
{:else}
	<section
		bind:this={root}
		class="barnum-lab article-breakout not-prose"
		class:expanded
		class:fullscreen-active={fullscreenActive}
		data-testid="barnum-lab"
		data-ready={mounted ? 'true' : 'false'}
		data-stage="intro"
		data-expanded={expanded ? 'true' : 'false'}
		data-tts-exclude
		data-analytics="disabled"
		data-no-track="true"
		aria-labelledby="barnum-lab-heading"
	>
		<div class="lab-inner">
			<header class="lab-header">
				<div>
					<p>Educational reading demonstration</p>
					<h2 id="barnum-lab-heading">The profile machine</h2>
					<span>Nothing is saved, and the explanation is always within reach.</span>
				</div>
			</header>

			<div class="lab-scroll">
				<AssumptionLedger rows={INTRO_LEDGER_ROWS} />
				<div class="lab-toolbar">
					<FullscreenControl
						active={expanded}
						available={fullscreenAvailable}
						onenter={(trigger) => void openExpanded(trigger)}
						onexit={() => void closeExpanded()}
					/>
				</div>

				<section class="intro" aria-labelledby="barnum-intro-heading" aria-busy={runtimeLoading}>
					<div class="intro-copy">
						<p class="eyebrow">Before you begin</p>
						<h3 id="barnum-intro-heading" tabindex="-1">A short experiment in feeling known</h3>
						<p>
							This is an educational reading demonstration. It may briefly feel personal. Nothing is
							saved, and you can reveal how it works at any time.
						</p>
						<p>
							Some clues may shape the wording; some may be decoration. Reveal the method now if you
							would rather not be surprised.
						</p>
						{#if runtimeError}
							<p class="runtime-error" role="alert">{runtimeError}</p>
						{/if}
					</div>
					<div class="intro-actions">
						<button
							class="primary"
							type="button"
							data-testid="barnum-begin"
							disabled={runtimeLoading}
							onclick={() => void activateRuntime('begin')}
						>
							{runtimeLoading && runtimeAction === 'begin' ? 'Opening…' : 'Begin'}
						</button>
						<p class="time-estimate">3–4 minute interactive</p>
						<button
							type="button"
							data-testid="barnum-reveal-now"
							disabled={runtimeLoading}
							onclick={() => void activateRuntime('reveal')}
						>
							{runtimeLoading && runtimeAction === 'reveal'
								? 'Opening explanation…'
								: 'Reveal how this works'}
						</button>
					</div>
				</section>

				<footer class="privacy">
					<strong>Private by design, within the limits of this page.</strong>
					<p>
						This lab does not intentionally transmit or persist your selections or ratings. They
						remain in this component’s current in-memory session; Reset discards that state, and a
						normal reload starts a new session. It requests no name, contact details, account, exact
						address, or date of birth. Country, city, age band, language, and gender can still be
						personal context in combination, which is why the lab does not retain them. Ordinary
						site analytics may still record that this page was visited.
					</p>
				</footer>

				<noscript>
					<section class="noscript-poster">
						<h3>How the reading works</h3>
						<p>
							A warm, broad statement can feel personal while fitting many people. A long reading
							also creates more chances to notice a match and forget a miss. The interactive
							demonstration needs JavaScript, but the article still explains the method, probability
							example, limitations, practical checklist, and research.
						</p>
						<p>
							No answer is collected here without JavaScript. The lab does not save names, clues, or
							ratings, and it makes no personality diagnosis.
						</p>
					</section>
				</noscript>
			</div>

			<p class="live-region" data-testid="barnum-live-region" aria-live="polite" aria-atomic="true">
				{liveMessage}
			</p>
		</div>
	</section>
{/if}
