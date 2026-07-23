<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import SEO from '$lib/components/seo/SEO.svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<SEO
	title="Owner Sign In | Handwritten Notes"
	description="Private owner access for the SuvroGhosh.IN handwritten-notes studio."
	canonicalUrl={undefined}
	robots="noindex,nofollow,noarchive"
	schema={null}
/>

<section class="sign-in-shell" aria-labelledby="sign-in-heading">
	<div class="sign-in-mark" aria-hidden="true">✎</div>
	<p class="eyebrow">Private authoring</p>
	<h1 id="sign-in-heading">Notes studio</h1>
	<p class="intro">
		Published notes are public. Creating, editing, organising, and publishing them is restricted to
		the site owner.
	</p>

	{#if data.configured}
		{#if data.passwordReset}
			<p class="form-success" role="status">
				Your password was changed. Sign in with the new password.
			</p>
		{/if}
		<form method="POST" use:enhance>
			<input type="hidden" name="returnTo" value={data.returnTo} />
			<label>
				<span>Email</span>
				<input
					type="email"
					name="email"
					value={form?.email ?? ''}
					autocomplete="username"
					required
					maxlength="320"
				/>
			</label>
			<label>
				<span>Password</span>
				<input
					type="password"
					name="password"
					autocomplete="current-password"
					required
					maxlength="512"
				/>
			</label>
			{#if form?.message}
				<p class="form-error" role="alert">{form.message}</p>
			{/if}
			<button type="submit">Sign in to the studio</button>
			<a class="forgot-link" href={resolve('/notes/forgot-password')}>Forgot password?</a>
		</form>
	{:else}
		<div class="setup-needed" role="status">
			<h2>Backend setup is still required</h2>
			<p>
				Connect the Supabase project, apply the notes migration, create the single owner account,
				and add the server environment values listed in the setup guide.
			</p>
		</div>
	{/if}

	<a class="public-link" href={resolve('/notes')}>Return to published notes</a>
</section>

<style>
	.sign-in-shell {
		max-width: 30rem;
		margin: clamp(2rem, 8vh, 6rem) auto;
		padding: clamp(1.25rem, 4vw, 2.5rem);
		border: 1px solid var(--rule);
		background: color-mix(in oklab, var(--paper-raised) 76%, transparent);
		box-shadow: 0 18px 50px rgb(43 36 28 / 10%);
	}

	.sign-in-mark {
		width: 3.2rem;
		height: 3.2rem;
		display: grid;
		place-content: center;
		border: 1px solid var(--rule);
		border-radius: 50%;
		color: var(--accent);
		font-family: var(--font-serif);
		font-size: 1.5rem;
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

	.form-error {
		margin: 0;
		border-left: 3px solid var(--destructive);
		background: color-mix(in oklab, var(--destructive) 8%, transparent);
		padding: 0.65rem;
		color: var(--destructive);
		font-size: 0.8rem;
	}

	.form-success {
		margin: 0 0 1rem;
		border-left: 3px solid var(--accent);
		background: color-mix(in oklab, var(--accent) 8%, transparent);
		padding: 0.65rem;
		color: var(--ink-muted);
		font-size: 0.8rem;
		line-height: 1.5;
	}

	.forgot-link {
		justify-self: start;
		color: var(--ink-muted);
		font-size: 0.78rem;
		text-underline-offset: 0.25em;
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

	.public-link {
		display: inline-block;
		margin-top: 1.4rem;
		color: var(--ink-muted);
		font-size: 0.8rem;
		text-underline-offset: 0.25em;
	}
</style>
