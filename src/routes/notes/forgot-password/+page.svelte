<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import SEO from '$lib/components/seo/SEO.svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	const confirmationMessage =
		'If that address belongs to the Notes Studio owner, a password-reset link has been sent.';
</script>

<SEO
	title="Forgot Password | Handwritten Notes"
	description="Secure password recovery for the private SuvroGhosh.IN Notes Studio."
	canonicalUrl={undefined}
	robots="noindex,nofollow,noarchive"
	schema={null}
/>

<section class="auth-shell" aria-labelledby="forgot-password-heading">
	<div class="auth-mark" aria-hidden="true">✉</div>
	<p class="eyebrow">Private authoring</p>
	<h1 id="forgot-password-heading">Reset access</h1>
	<p class="intro">
		Enter the email address for the Notes Studio owner. The response is deliberately private and
		will not reveal whether an account exists.
	</p>

	{#if data.configured}
		{#if form?.sent}
			<div class="form-success" role="status">
				<p>{confirmationMessage}</p>
				<p>The link expires, can be used once, and should only be opened by you.</p>
			</div>
		{:else}
			<form method="POST" use:enhance>
				<label>
					<span>Email</span>
					<input
						type="email"
						name="email"
						value={form?.email ?? ''}
						autocomplete="email"
						inputmode="email"
						required
						maxlength="320"
					/>
				</label>
				{#if form?.message}
					<p class="form-error" role="alert">{form.message}</p>
				{/if}
				<button type="submit">Send a secure reset link</button>
			</form>
		{/if}
	{:else}
		<div class="setup-needed" role="status">
			<h2>Password recovery is not configured</h2>
			<p>
				The owner must finish the Supabase and server environment setup before a reset email can be
				requested.
			</p>
		</div>
	{/if}

	<nav class="auth-links" aria-label="Password recovery links">
		<a href={resolve('/notes/sign-in')}>Return to owner sign in</a>
		<a href={resolve('/notes')}>View published notes</a>
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
		font-size: clamp(2.5rem, 8vw, 4.2rem);
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

	.form-error,
	.form-success {
		margin: 0;
		border-left: 3px solid var(--destructive);
		background: color-mix(in oklab, var(--destructive) 8%, transparent);
		padding: 0.75rem;
		color: var(--destructive);
		font-size: 0.82rem;
		line-height: 1.5;
	}

	.form-success {
		border-left-color: var(--accent);
		background: color-mix(in oklab, var(--accent) 8%, transparent);
		color: var(--ink-muted);
	}

	.form-success p {
		margin: 0;
	}

	.form-success p + p {
		margin-top: 0.45rem;
		font-size: 0.76rem;
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
