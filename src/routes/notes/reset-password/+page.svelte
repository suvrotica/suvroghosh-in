<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import SEO from '$lib/components/seo/SEO.svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	let stage = $derived(form?.stage ?? data.stage);
</script>

<SEO
	title="Reset Password | Handwritten Notes"
	description="Secure password reset for the private SuvroGhosh.IN Notes Studio."
	canonicalUrl={undefined}
	robots="noindex,nofollow,noarchive"
	schema={null}
/>

<section class="auth-shell" aria-labelledby="reset-password-heading">
	<div class="auth-mark" aria-hidden="true">✦</div>
	<p class="eyebrow">Private authoring</p>
	<h1 id="reset-password-heading">Choose a new password</h1>

	{#if !data.configured}
		<p class="intro">Secure password recovery has not been configured for this deployment.</p>
		<div class="setup-needed" role="status">
			<h2>Backend setup is required</h2>
			<p>Finish the Supabase and server environment setup, then request a new reset link.</p>
		</div>
	{:else if stage === 'confirm'}
		<p class="intro">
			The link is ready, but it has not been used yet. Continue only if you requested this password
			change.
		</p>
		<form method="POST" action="?/confirm" use:enhance>
			<p class="security-note">
				This confirmation prevents email preview tools from silently consuming your one-time link.
			</p>
			{#if form?.message}
				<p class="form-error" role="alert">{form.message}</p>
			{/if}
			<button type="submit">Continue securely</button>
		</form>
	{:else if stage === 'update'}
		<p class="intro">
			Use a unique passphrase of at least 12 characters. You will sign in again after it is changed.
		</p>
		<form method="POST" action="?/update" use:enhance>
			<label>
				<span>New password</span>
				<input
					type="password"
					name="password"
					autocomplete="new-password"
					required
					minlength="12"
					maxlength="128"
				/>
			</label>
			<label>
				<span>Confirm new password</span>
				<input
					type="password"
					name="passwordConfirmation"
					autocomplete="new-password"
					required
					minlength="12"
					maxlength="128"
				/>
			</label>
			{#if form?.message}
				<p class="form-error" role="alert">{form.message}</p>
			{/if}
			<button type="submit">Save new password</button>
		</form>
	{:else}
		<p class="intro">For security, reset links expire and can only be used once.</p>
		<div class="form-error" role="alert">
			{form?.message ?? data.message ?? 'Open a fresh reset link from your email.'}
		</div>
	{/if}

	<nav class="auth-links" aria-label="Password reset links">
		<a href={resolve('/notes/forgot-password')}>Request a new reset link</a>
		<a href={resolve('/notes/sign-in')}>Return to owner sign in</a>
	</nav>
</section>

<style>
	.auth-shell {
		max-width: 30rem;
		margin: clamp(2rem, 8vh, 6rem) auto;
		padding: clamp(1.25rem, 4vw, 2.5rem);
		border: 1px solid var(--rule);
		background: color-mix(in oklab, var(--paper-raised) 76%, transparent);
		box-shadow: 0 18px 50px rgb(43 36 28 / 10%);
	}

	.auth-mark {
		width: 3.2rem;
		height: 3.2rem;
		display: grid;
		place-content: center;
		border: 1px solid var(--rule);
		border-radius: 50%;
		color: var(--accent);
		font-family: var(--font-serif);
		font-size: 1.25rem;
	}

	.eyebrow {
		margin: 1.5rem 0 0.35rem;
		color: var(--ink-faint);
		font-size: 0.72rem;
		font-weight: 800;
		letter-spacing: 0.15em;
		text-transform: uppercase;
	}

	h1 {
		margin: 0;
		font-family: var(--font-serif);
		font-size: clamp(2.35rem, 8vw, 4rem);
		font-weight: 620;
		letter-spacing: -0.04em;
		line-height: 1;
	}

	.intro {
		margin: 1rem 0 1.6rem;
		color: var(--ink-muted);
		font-family: var(--font-serif);
		line-height: 1.6;
	}

	form {
		display: grid;
		gap: 1rem;
	}

	label {
		display: grid;
		gap: 0.35rem;
		color: var(--ink-muted);
		font-size: 0.78rem;
		font-weight: 750;
	}

	input {
		width: 100%;
		min-height: 3rem;
		border: 1px solid var(--control-border);
		border-radius: 0.4rem;
		background: var(--paper-raised);
		padding: 0.65rem 0.75rem;
		color: var(--ink);
	}

	form button {
		min-height: 3rem;
		border: 1px solid var(--ink);
		border-radius: 0.4rem;
		background: var(--ink);
		padding: 0.65rem 1rem;
		color: var(--paper);
		font-weight: 800;
		cursor: pointer;
	}

	.form-error {
		margin: 0;
		border-left: 3px solid var(--destructive);
		background: color-mix(in oklab, var(--destructive) 8%, transparent);
		padding: 0.75rem;
		color: var(--destructive);
		font-size: 0.82rem;
		line-height: 1.5;
	}

	.security-note {
		margin: 0;
		border: 1px solid var(--control-border);
		border-radius: 0.4rem;
		padding: 0.8rem;
		color: var(--ink-muted);
		font-size: 0.8rem;
		line-height: 1.5;
	}

	.setup-needed {
		border: 1px solid var(--control-border);
		border-radius: 0.4rem;
		padding: 1rem;
	}

	.setup-needed h2 {
		margin: 0 0 0.4rem;
		font-size: 1rem;
	}

	.setup-needed p {
		margin: 0;
		color: var(--ink-muted);
		font-size: 0.85rem;
		line-height: 1.55;
	}

	.auth-links {
		display: flex;
		flex-wrap: wrap;
		gap: 0.65rem 1rem;
		margin-top: 1.4rem;
	}

	.auth-links a {
		color: var(--ink-muted);
		font-size: 0.8rem;
		text-underline-offset: 0.25em;
	}
</style>
