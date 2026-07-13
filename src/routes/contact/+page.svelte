<script lang="ts">
	import { enhance } from '$app/forms';
	import { tick } from 'svelte';
	import SEO from '$lib/components/seo/SEO.svelte';
	import { contactPageSchema, personSchema, schemaGraph, siteUrl } from '$lib/components/seo/SEO';
	import { Button } from '$lib/components/ui/button';
	import type { SubmitFunction } from '@sveltejs/kit';
	import type { ActionData } from './$types';

	let { form }: { form?: ActionData } = $props();

	const title = 'Contact | Suvro Ghosh';
	const description =
		'Contact Suvro Ghosh for healthcare IT consulting, interoperability, clinical data systems, and advisory opportunities. Based in Calcutta, open to Gulf, remote, and hybrid work.';
	const canonicalUrl = siteUrl + '/contact';

	const email = 'contact@suvroghosh.in';
	let submitting = $state(false);

	type ContactFormErrors = { name?: string; email?: string; message?: string; form?: string };

	const errors = $derived(form?.errors as ContactFormErrors | undefined);

	const values = $derived(
		form?.values ?? {
			name: '',
			email: '',
			message: ''
		}
	);

	const enhanceContact: SubmitFunction = () => {
		submitting = true;

		return async ({ update }) => {
			try {
				await update();
				await tick();

				const firstInvalid = document.querySelector<HTMLElement>(
					'#contact-form [aria-invalid="true"]'
				);
				const feedback = document.querySelector<HTMLElement>('[data-contact-feedback]');
				(firstInvalid ?? feedback)?.focus();
			} finally {
				submitting = false;
			}
		};
	};
</script>

<SEO
	{title}
	{description}
	{canonicalUrl}
	schema={schemaGraph([
		personSchema,
		contactPageSchema({ name: title, description, url: canonicalUrl })
	])}
/>

<section class="page-enter mx-auto max-w-2xl py-8 md:py-12">
	<header class="mb-10 text-center">
		<h1 class="mb-4 text-4xl font-bold text-neutral-900 md:text-5xl dark:text-neutral-100">
			Contact
		</h1>
		<p
			class="text-center text-lg leading-relaxed text-neutral-700 dark:text-neutral-300"
			style="text-align: center;"
		>
			For healthcare IT consulting, interoperability, clinical data systems, advisory.
		</p>
	</header>

	<div class="card">
		{#if form?.success}
			<div
				data-contact-feedback
				class="mb-6 rounded-md border border-green-600/30 bg-green-50 px-4 py-3 text-sm text-green-900 dark:border-green-400/30 dark:bg-green-950/40 dark:text-green-100"
				role="status"
				tabindex="-1"
			>
				Thanks. Your message has been sent.
			</div>
		{/if}

		{#if errors?.form}
			<div
				data-contact-feedback
				class="mb-6 rounded-md border border-red-600/30 bg-red-50 px-4 py-3 text-sm text-red-900 dark:border-red-400/30 dark:bg-red-950/40 dark:text-red-100"
				role="alert"
				tabindex="-1"
			>
				{errors.form}
			</div>
		{/if}

		<form
			id="contact-form"
			method="POST"
			class="space-y-5"
			novalidate
			use:enhance={enhanceContact}
			aria-busy={submitting}
			aria-describedby="contact-privacy"
		>
			<div>
				<label
					for="name"
					class="mb-2 block text-sm font-semibold text-neutral-900 dark:text-neutral-100"
				>
					Name
				</label>
				<input
					id="name"
					name="name"
					type="text"
					autocomplete="name"
					required
					maxlength="120"
					value={values.name}
					aria-invalid={errors?.name ? 'true' : undefined}
					aria-describedby={errors?.name ? 'name-error' : undefined}
					class="min-h-11 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 shadow-sm transition-colors placeholder:text-neutral-500 focus:border-neutral-500 focus:ring-2 focus:ring-neutral-500/20 focus:outline-none dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:placeholder:text-neutral-500"
				/>
				{#if errors?.name}
					<p id="name-error" class="mt-2 text-left text-sm text-red-700 dark:text-red-300">
						{errors.name}
					</p>
				{/if}
			</div>

			<div>
				<label
					for="email"
					class="mb-2 block text-sm font-semibold text-neutral-900 dark:text-neutral-100"
				>
					Email <span class="text-red-700 dark:text-red-300">(required)</span>
				</label>
				<input
					id="email"
					name="email"
					type="email"
					autocomplete="email"
					required
					maxlength="254"
					value={values.email}
					aria-invalid={errors?.email ? 'true' : undefined}
					aria-describedby={errors?.email ? 'email-error' : undefined}
					class="min-h-11 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 shadow-sm transition-colors placeholder:text-neutral-500 focus:border-neutral-500 focus:ring-2 focus:ring-neutral-500/20 focus:outline-none dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:placeholder:text-neutral-500"
				/>
				{#if errors?.email}
					<p id="email-error" class="mt-2 text-left text-sm text-red-700 dark:text-red-300">
						{errors.email}
					</p>
				{/if}
			</div>

			<div>
				<label
					for="message"
					class="mb-2 block text-sm font-semibold text-neutral-900 dark:text-neutral-100"
				>
					Message
				</label>
				<textarea
					id="message"
					name="message"
					required
					minlength="10"
					maxlength="5000"
					rows="7"
					aria-invalid={errors?.message ? 'true' : undefined}
					aria-describedby={errors?.message ? 'message-error' : undefined}
					class="w-full resize-y rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 shadow-sm transition-colors placeholder:text-neutral-500 focus:border-neutral-500 focus:ring-2 focus:ring-neutral-500/20 focus:outline-none dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:placeholder:text-neutral-500"
					>{values.message}</textarea
				>
				{#if errors?.message}
					<p id="message-error" class="mt-2 text-left text-sm text-red-700 dark:text-red-300">
						{errors.message}
					</p>
				{/if}
			</div>

			<div class="absolute left-[-9999px]" aria-hidden="true">
				<label for="website">Website</label>
				<input id="website" name="website" type="text" tabindex="-1" autocomplete="off" />
			</div>

			<Button type="submit" class="min-h-11 w-full sm:w-auto" disabled={submitting}>
				{submitting ? 'Sending…' : 'Send message'}
			</Button>

			<p
				id="contact-privacy"
				class="text-sm leading-relaxed text-neutral-600 dark:text-neutral-400"
			>
				Your details are used only to reply to this message. They are not added to a mailing list or
				shared for marketing.
			</p>

			{#if submitting}
				<p class="sr-only" role="status" aria-live="polite">Sending your message.</p>
			{/if}
		</form>

		<div
			class="mt-8 flex flex-col items-center border-t border-neutral-300 pt-6 text-center dark:border-neutral-700"
		>
			<p
				class="mb-2 w-full text-center text-base text-neutral-700 dark:text-neutral-300"
				style="text-align: center;"
			>
				Or email me directly
			</p>
			<a
				href={'mailto:' + email}
				class="text-xl font-bold text-neutral-900 underline underline-offset-4 hover:text-neutral-600 dark:text-neutral-100 dark:hover:text-neutral-300"
			>
				{email}
			</a>
			<p
				class="mt-6 w-full text-center text-sm text-neutral-600 dark:text-neutral-400"
				style="text-align: center;"
			>
				Based in India. Open to remote, hybrid, contract, consulting healthcare IT opportunities.
			</p>
		</div>
	</div>

	<div class="mt-8 flex items-center justify-center gap-4">
		<Button
			href="https://www.linkedin.com/in/suvro-ghosh-78a5aa278"
			target="_blank"
			rel="noopener noreferrer"
			variant="outline"
			size="icon"
			aria-label="LinkedIn"
		>
			<svg class="h-5 w-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
				<path
					d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"
				/>
			</svg>
		</Button>
		<Button
			href="https://www.youtube.com/@SuvroGhoshIN"
			target="_blank"
			rel="noopener noreferrer"
			variant="outline"
			size="icon"
			aria-label="YouTube"
		>
			<svg class="h-5 w-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
				<path
					d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"
				/>
			</svg>
		</Button>
	</div>
</section>
