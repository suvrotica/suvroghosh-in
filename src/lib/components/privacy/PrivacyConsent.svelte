<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { beforeNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import {
		initializeConsent,
		subscribeConsent,
		saveConsent,
		getConsent,
		openPrivacySettings,
		PRIVACY_SETTINGS_EVENT,
		type ConsentRecord
	} from '$lib/privacy/consent';
	import ChoiceReceipt from './ChoiceReceipt.svelte';

	let { compactTrigger = false }: { compactTrigger?: boolean } = $props();
	let ready = $state(false);
	let consent: ConsentRecord | null = $state(null);
	let media = $state(false);
	let settingsOpen = $state(false);
	let noticeDismissed = $state(false);
	let notice = $state('');
	let dialog: HTMLDialogElement;
	let heading: HTMLHeadingElement;
	let previousFocus: HTMLElement | null = null;
	let noticeTimer: ReturnType<typeof setTimeout> | undefined;
	const suppressed = $derived(
		/^\/(?:api(?:\/|$)|notes\/(?:studio|auth|sign-in|forgot-password|reset-password|signin|recovery)(?:\/|$))/.test(
			page.url.pathname
		)
	);

	async function showSettings() {
		if (!dialog || dialog.open) return;
		const current = getConsent();
		media = current?.media ?? false;
		previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
		settingsOpen = true;
		dialog.showModal();
		await tick();
		heading?.focus();
	}

	function closeSettings() {
		dialog?.close();
	}
	// This shared-layout dialog must not keep the destination page inert after navigation.
	beforeNavigate(closeSettings);
	function containFocus(event: KeyboardEvent) {
		if (event.key !== 'Tab') return;
		const controls = Array.from(
			dialog.querySelectorAll<HTMLElement>(
				'button, a[href], input, [tabindex]:not([tabindex="-1"])'
			)
		).filter((element) => element.getClientRects().length > 0 && !element.hasAttribute('disabled'));
		const first = controls[0];
		const last = controls[controls.length - 1];
		if (
			event.shiftKey &&
			(document.activeElement === first || document.activeElement === heading)
		) {
			event.preventDefault();
			last?.focus();
		} else if (!event.shiftKey && document.activeElement === last) {
			event.preventDefault();
			first?.focus();
		}
	}
	function onClose() {
		settingsOpen = false;
		const destination = previousFocus?.isConnected
			? previousFocus
			: document.querySelector<HTMLElement>('[data-privacy-settings], #main-content');
		destination?.focus({ preventScroll: true });
	}

	function commit(nextMedia: boolean) {
		clearTimeout(noticeTimer);
		const { persisted } = saveConsent({ media: nextMedia });
		notice = persisted
			? 'Your video preference is saved. Change it any time in Privacy & cookies.'
			: 'Your browser could not save this video preference. It applies for this visit only. Vercel’s cookieless page counts continue by default.';
		closeSettings();
		if (persisted)
			noticeTimer = setTimeout(() => {
				notice = '';
			}, 6500);
	}

	onMount(() => {
		const dispose = initializeConsent();
		const unsubscribe = subscribeConsent((value) => {
			consent = value;
		});
		window.addEventListener(PRIVACY_SETTINGS_EVENT, showSettings);
		ready = true;
		return () => {
			clearTimeout(noticeTimer);
			window.removeEventListener(PRIVACY_SETTINGS_EVENT, showSettings);
			unsubscribe();
			dispose();
		};
	});

	$effect(() => {
		if (suppressed && settingsOpen) closeSettings();
	});
</script>

{#if ready && !suppressed && !consent && !noticeDismissed}
	<aside class="privacy-note" aria-labelledby="privacy-note-title" data-privacy-note>
		<div class="note-topline">
			<span>FROM THE FIELDBOOK</span>
			<span class="note-edition"
				>PRIVACY / 01<button
					type="button"
					class="dismiss-notice"
					onclick={() => {
						noticeDismissed = true;
					}}
					aria-label="Dismiss privacy notice without choosing">×</button
				></span
			>
		</div>
		<div class="note-heading">
			<h2 id="privacy-note-title">A small note<br />about privacy.</h2>
			<ChoiceReceipt small />
		</div>
		<p>
			Make yourself at home. Vercel’s cookieless page counts run by default. Choose whether embedded
			YouTube players may connect to Google. You can also load a video once when you reach it.
		</p>
		<div class="note-actions">
			<button type="button" onclick={() => commit(false)}>Keep videos paused</button>
			<button type="button" onclick={() => commit(true)}>Allow YouTube</button>
		</div>
		<div class="note-foot">
			<button type="button" class="text-action" onclick={showSettings}
				>Choose settings <span aria-hidden="true">↗</span></button
			><a href={resolve('/privacy')}>Read the privacy note</a>
		</div>
	</aside>
{/if}

{#if compactTrigger && !suppressed && (consent || !ready || noticeDismissed)}
	<button
		class="privacy-trigger"
		type="button"
		onclick={openPrivacySettings}
		aria-label="Privacy & cookies settings"
		data-privacy-settings><span aria-hidden="true">◈</span> Privacy &amp; cookies</button
	>
{/if}

{#if notice && !suppressed}
	<div class="privacy-status" role="status">
		<p>{notice}</p>
		<button
			type="button"
			onclick={() => {
				notice = '';
			}}
			aria-label="Dismiss privacy confirmation">×</button
		>
	</div>
{/if}

<dialog
	bind:this={dialog}
	class="privacy-dialog"
	aria-labelledby="privacy-title"
	aria-describedby="privacy-intro"
	onclose={onClose}
	onkeydown={containFocus}
>
	<div class="dialog-topline">
		<span>THE CALCUTTA FIELDBOOK</span><span>READER PREFERENCES</span>
	</div>
	<button
		type="button"
		class="close-settings"
		onclick={closeSettings}
		aria-label="Close without saving">×</button
	>
	<div class="dialog-heading">
		<p class="eyebrow">A LITTLE TRANSPARENCY.</p>
		<h2 id="privacy-title" tabindex="-1" bind:this={heading}>
			Your visit.<br /><em>Your choices.</em>
		</h2>
		<p id="privacy-intro">
			Choose whether YouTube players may connect to Google. Vercel’s cookieless page counts run by
			default, independently of this video preference.
		</p>
	</div>
	<div class="preferences-grid">
		<div class="categories">
			<section class="category">
				<div class="category-heading">
					<h3><span>01</span> The essentials</h3>
					<span class="essential-label">ALWAYS AVAILABLE</span>
				</div>
				<p>
					Sign-in cookies for the private Notes studio, and local settings for themes, reading tools
					and saved work. These support features you request.
				</p>
			</section>
			<section class="category">
				<div class="category-heading">
					<h3><label for="privacy-media"><span>02</span> External media</label></h3>
					<input
						id="privacy-media"
						type="checkbox"
						role="switch"
						bind:checked={media}
						aria-describedby="media-description"
					/>
				</div>
				<p id="media-description">
					Let YouTube players connect to Google when embedded videos appear. You can also load one
					video at a time without remembering this permission.
				</p>
			</section>
		</div>
		<aside class="receipt-panel" aria-label="Your choices">
			<ChoiceReceipt {media} />
			<h3>Your choices</h3>
			<dl>
				<div>
					<dt>Essential</dt>
					<dd>Available</dd>
				</div>
				<div>
					<dt>External media</dt>
					<dd>{media ? 'Allowed' : 'Off'}</dd>
				</div>
			</dl>
			<p>Remembered on this browser<br />for 180 days.</p>
			<span class="receipt-seal" aria-hidden="true">SG / CALCUTTA</span>
		</aside>
	</div>
	<div class="dialog-bottom">
		<p>
			Change your mind any time. Keeping videos paused unloads active YouTube players. <a
				href={resolve('/privacy')}>Read the full privacy note ↗</a
			>
		</p>
		<div class="dialog-actions">
			<div class="balanced-actions">
				<button type="button" onclick={() => commit(false)}>Keep videos paused</button><button
					type="button"
					onclick={() => commit(true)}>Allow YouTube</button
				>
			</div>
			<button class="save-settings" type="button" onclick={() => commit(media)}
				>Save preferences <span aria-hidden="true">↗</span></button
			>
		</div>
	</div>
</dialog>

<style>
	.privacy-note,
	.privacy-dialog,
	.privacy-trigger,
	.privacy-status {
		color: var(--ink);
		background: var(--paper-raised);
		font-family: var(--font-sans, sans-serif);
	}
	.privacy-note {
		position: fixed;
		z-index: 90;
		bottom: max(1.25rem, env(safe-area-inset-bottom));
		right: max(1.25rem, env(safe-area-inset-right));
		width: min(25rem, calc(100vw - 2.5rem));
		max-height: calc(100dvh - 7rem);
		overflow-y: auto;
		overscroll-behavior: contain;
		padding: 1.3rem 1.4rem 1rem;
		border: 1px solid var(--control-border);
		box-shadow: 0 10px 50px rgb(0 0 0 / 13%);
		animation: note-arrive 180ms ease-out both;
	}
	.note-topline,
	.dialog-topline {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		padding-bottom: 0.7rem;
		border-bottom: 1px solid var(--rule);
		font: 500 0.55rem/1.4 var(--font-mono, monospace);
		letter-spacing: 0.13em;
		color: var(--ink-muted);
	}
	.note-topline {
		align-items: center;
	}
	.note-edition {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
	}
	.dismiss-notice {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		min-width: 2.75rem;
		min-height: 2.75rem;
		border: 1px solid var(--control-border);
		border-radius: 50%;
		background: transparent;
		color: var(--ink);
		font: 400 1.25rem/1 var(--font-sans, sans-serif);
		cursor: pointer;
	}
	.note-heading {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		margin-top: 0.8rem;
	}
	.note-heading h2 {
		margin: 0;
		font: 500 2rem/0.98 var(--font-serif, serif);
		letter-spacing: -0.04em;
	}
	.privacy-note p {
		margin: 0.9rem 0 1.1rem;
		text-align: left;
		font-size: 0.82rem;
		line-height: 1.6;
		color: var(--ink-muted);
	}
	button {
		cursor: pointer;
	}
	.note-actions,
	.balanced-actions {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.6rem;
	}
	.note-actions button,
	.balanced-actions button {
		min-height: 44px;
		padding: 0.65rem 0.5rem;
		border: 1px solid var(--control-border);
		background: var(--paper);
		color: var(--ink);
		font-size: 0.75rem;
		font-weight: 650;
	}
	.note-actions button:hover,
	.balanced-actions button:hover {
		background: var(--paper-soft);
		border-color: var(--ink);
	}
	.note-foot {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.6rem;
		padding-top: 0.4rem;
	}
	.text-action,
	.note-foot a {
		display: inline-flex;
		min-height: 44px;
		align-items: center;
		color: var(--ink-muted);
		font-size: 0.68rem;
		text-decoration: underline;
		text-underline-offset: 4px;
	}
	.text-action {
		gap: 0.5rem;
		font-weight: 650;
	}
	:where(button, a, input):focus-visible {
		outline: 2px solid var(--focus);
		outline-offset: 4px;
	}
	.privacy-trigger {
		position: fixed;
		bottom: max(0.6rem, env(safe-area-inset-bottom));
		left: max(0.6rem, env(safe-area-inset-left));
		min-height: 44px;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		border: 1px solid var(--control-border);
		border-radius: 3px;
		padding: 0.5rem 0.75rem;
		font-size: 0.62rem;
		z-index: 65;
	}
	.privacy-trigger span {
		font-size: 1rem;
	}
	.privacy-status {
		pointer-events: none;
		position: fixed;
		z-index: 100;
		left: 50%;
		bottom: max(1rem, env(safe-area-inset-bottom));
		transform: translateX(-50%);
		display: flex;
		align-items: center;
		gap: 0.7rem;
		width: min(31rem, calc(100vw - 2rem));
		padding: 0.7rem 1rem;
		border: 1px solid var(--control-border);
		box-shadow: var(--shadow-overlay);
	}
	.privacy-status p {
		margin: 0;
		text-align: left;
		font-size: 0.75rem;
		line-height: 1.5;
	}
	.privacy-status button {
		pointer-events: auto;
		min-width: 44px;
		min-height: 44px;
		font-size: 1.5rem;
	}
	.privacy-dialog {
		box-sizing: border-box;
		max-width: none;
		position: fixed;
		inset: 0;
		width: min(55rem, calc(100vw - 3rem));
		max-height: min(90dvh, 58rem);
		overflow-y: auto;
		margin: auto;
		padding: 1.6rem 2.2rem 1.7rem;
		border: 1px solid var(--control-border);
		box-shadow: 0 24px 100px rgb(0 0 0 / 22%);
		overscroll-behavior: contain;
	}
	.privacy-dialog::backdrop {
		background: rgb(0 0 0 / 48%);
	}
	.privacy-dialog[open] {
		animation: note-arrive 180ms ease-out both;
	}
	.close-settings {
		position: absolute;
		right: 1.4rem;
		top: 3rem;
		width: 44px;
		height: 44px;
		border: 1px solid var(--rule);
		border-radius: 50%;
		font: 300 1.8rem/1 var(--font-sans);
	}
	.dialog-heading {
		padding: 1.65rem 0 1.4rem;
	}
	.eyebrow {
		margin: 0 0 0.65rem;
		color: var(--accent);
		text-align: left;
		font: 600 0.6rem/1.4 var(--font-mono);
		letter-spacing: 0.17em;
	}
	.dialog-heading h2 {
		margin: 0;
		font: 450 clamp(2.6rem, 6vw, 4.5rem)/0.91 var(--font-serif);
		letter-spacing: -0.055em;
		outline: none;
	}
	.dialog-heading h2 em {
		font-weight: 450;
		color: var(--accent);
	}
	.dialog-heading > p:last-child {
		margin: 1rem 0 0;
		max-width: 29rem;
		color: var(--ink-muted);
		text-align: left;
		font-size: 0.85rem;
		line-height: 1.65;
	}
	.preferences-grid {
		display: grid;
		grid-template-columns: 1fr 12rem;
		gap: 2rem;
		border-top: 1px solid var(--ink);
	}
	.category {
		padding: 1.1rem 0;
		border-bottom: 1px solid var(--rule);
	}
	.category:last-child {
		border-bottom: 0;
	}
	.category-heading {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 0.8rem;
	}
	.category h3 {
		min-width: 0;
		margin: 0;
		font-size: 0.83rem;
		line-height: 1.5;
		font-weight: 650;
		letter-spacing: -0.02em;
	}
	.category h3 label {
		cursor: pointer;
	}
	.category h3 span {
		margin-right: 0.65rem;
		font: 0.65rem var(--font-mono);
		color: var(--ink-faint);
	}
	.essential-label {
		font: 0.45rem/1.4 var(--font-mono);
		letter-spacing: 0.05em;
		color: var(--ink-muted);
		white-space: nowrap;
	}
	.category p {
		margin: 0.45rem 0 0;
		padding-right: 0.5rem;
		text-align: left;
		font-size: 0.74rem;
		line-height: 1.65;
		color: var(--ink-muted);
	}
	input[role='switch'] {
		appearance: none;
		flex: 0 0 44px;
		width: 44px;
		height: 44px;
		border: 0;
		border-radius: 0;
		background: transparent;
		position: relative;
		margin: -0.5rem 0;
		cursor: pointer;
	}
	input[role='switch']::before {
		content: '';
		position: absolute;
		inset: 10px 0;
		border-radius: 20px;
		border: 1px solid var(--control-border);
		background: var(--paper-soft);
	}
	input[role='switch']::after {
		content: '';
		position: absolute;
		top: 14px;
		left: 4px;
		width: 16px;
		height: 16px;
		border-radius: 50%;
		background: var(--ink-muted);
		transition: transform 140ms ease;
	}
	input[role='switch']:checked::before {
		background: var(--accent);
		border-color: var(--accent);
	}
	input[role='switch']:checked::after {
		transform: translateX(20px);
		background: var(--paper-raised);
	}
	.receipt-panel {
		align-self: stretch;
		padding: 1.2rem 0 1rem 1.4rem;
		border-left: 1px solid var(--rule);
	}
	.receipt-panel h3 {
		margin: 0.5rem 0 0.6rem;
		font: 500 1.25rem var(--font-serif);
	}
	.receipt-panel dl {
		margin: 0;
		font-size: 0.62rem;
	}
	.receipt-panel dl div {
		display: flex;
		justify-content: space-between;
		gap: 0.5rem;
		margin: 0.5rem 0;
	}
	.receipt-panel dt {
		color: var(--ink-muted);
	}
	.receipt-panel dd {
		margin: 0;
		font-weight: 650;
	}
	.receipt-panel > p {
		margin: 1rem 0 0.75rem;
		color: var(--ink-faint);
		font: 0.55rem/1.6 var(--font-mono);
		text-align: left;
	}
	.receipt-seal {
		display: inline-block;
		padding: 0.3rem 0.45rem;
		border: 1px solid var(--accent);
		color: var(--accent);
		font: 0.48rem var(--font-mono);
		letter-spacing: 0.1em;
		transform: rotate(-4deg);
	}
	.dialog-bottom {
		border-top: 1px solid var(--ink);
		padding-top: 1rem;
	}
	.dialog-bottom > p {
		margin: 0 0 1rem;
		color: var(--ink-muted);
		font-size: 0.68rem;
		line-height: 1.65;
		text-align: left;
	}
	.dialog-bottom a {
		text-decoration: underline;
		text-underline-offset: 3px;
	}
	.dialog-actions {
		display: grid;
		grid-template-columns: 1fr minmax(12rem, 0.7fr);
		gap: 1rem;
	}
	.save-settings {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		min-height: 44px;
		padding: 0.7rem 1rem;
		background: var(--ink);
		color: var(--paper-raised);
		font-size: 0.75rem;
		font-weight: 650;
	}
	.save-settings:hover {
		background: var(--accent);
	}
	@keyframes note-arrive {
		from {
			opacity: 0;
			transform: translateY(8px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}
	:global(html[data-motion='still']) .privacy-note,
	:global(html[data-motion='still']) .privacy-dialog[open] {
		animation: none;
	}
	:global(html[data-motion='still']) input[role='switch']::after {
		transition: none;
	}
	@media (prefers-reduced-motion: reduce) {
		.privacy-note,
		.privacy-dialog[open] {
			animation: none;
		}
		input[role='switch']::after {
			transition: none;
		}
	}
	@media (max-width: 640px) {
		.privacy-note {
			right: max(0.75rem, env(safe-area-inset-right));
			bottom: calc(4.5rem + env(safe-area-inset-bottom));
			width: min(25rem, calc(100vw - 1.5rem));
			padding: 1rem 1.15rem 0.6rem;
		}
		.note-heading h2 {
			font-size: 1.75rem;
		}
		.privacy-note p {
			margin: 0.6rem 0 0.8rem;
			font-size: 0.76rem;
		}
		.privacy-dialog {
			inset: auto 0 0;
			margin: 0 auto;
			width: 100%;
			max-height: 94dvh;
			padding: 1.1rem 1.2rem calc(1.2rem + env(safe-area-inset-bottom));
			border-radius: 12px 12px 0 0;
		}
		.dialog-topline {
			font-size: 0.45rem;
		}
		.close-settings {
			top: 2.7rem;
			right: 1.15rem;
		}
		.dialog-heading {
			padding-top: 1.4rem;
		}
		.dialog-heading h2 {
			font-size: clamp(2.3rem, 12.7vw, 3.1rem);
		}
		.preferences-grid {
			grid-template-columns: 1fr;
			gap: 0;
		}
		.receipt-panel {
			display: none;
		}
		.category {
			padding: 1rem 0;
		}
		.dialog-actions {
			grid-template-columns: 1fr;
			gap: 0.7rem;
		}
		.save-settings {
			order: -1;
		}
		.privacy-status {
			bottom: calc(4.5rem + env(safe-area-inset-bottom));
		}
	}
	@media print {
		.privacy-note,
		.privacy-trigger,
		.privacy-dialog,
		.privacy-status {
			display: none !important;
		}
	}
</style>
