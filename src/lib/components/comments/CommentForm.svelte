<script lang="ts">
	import { onDestroy, onMount } from 'svelte';

	let {
		postSlug,
		parentId = null,
		oncancel
	}: {
		postSlug: string;
		parentId?: string | null;
		oncancel?: () => void;
	} = $props();

	const formId = $props.id();
	let name = $state('');
	let body = $state('');
	let website = $state('');
	let submitting = $state(false);
	let ready = $state(false);
	let error = $state('');
	let message = $state('');
	let submissionId: string | null = null;
	let controller: AbortController | undefined;
	let disposed = false;

	function edited() {
		submissionId = null;
		error = '';
		message = '';
	}

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		if (submitting) return;
		if (!name.trim() || !body.trim()) {
			error = 'Please enter your name and a comment.';
			return;
		}

		submitting = true;
		error = '';
		message = '';
		// An uncertain response can be retried with the same key without creating a duplicate.
		submissionId ??= crypto.randomUUID();
		controller = new AbortController();
		const timeout = setTimeout(() => controller?.abort(), 15_000);
		try {
			const response = await fetch('/api/comments', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'same-origin',
				signal: controller.signal,
				body: JSON.stringify({ postSlug, parentId, name, body, submissionId, website })
			});
			const result = await response.json().catch(() => null);
			if (!response.ok) {
				throw new Error(
					typeof result?.message === 'string'
						? result.message
						: 'Your comment could not be sent. Please try again.'
				);
			}
			if (result?.status !== 'pending') {
				throw new Error('We could not confirm your submission. Please try again.');
			}
			if (disposed) return;
			body = '';
			submissionId = null;
			message = 'Your comment has been received and is awaiting approval.';
		} catch (cause) {
			if (disposed) return;
			error = controller.signal.aborted
				? 'The connection timed out. Your text is saved here; try sending it again.'
				: cause instanceof Error
					? cause.message
					: 'Your comment could not be sent. Your text is saved here; please try again.';
		} finally {
			clearTimeout(timeout);
			if (!disposed) submitting = false;
		}
	}

	onMount(() => {
		ready = true;
	});

	onDestroy(() => {
		disposed = true;
		controller?.abort();
	});
</script>

<form
	method="post"
	action="/api/comments"
	onsubmit={submit}
	aria-label={parentId ? 'Leave a reply' : 'Leave a comment'}
>
	<fieldset disabled={!ready || submitting}>
		<legend>{parentId ? 'Leave a reply' : 'Join the conversation'}</legend>
		<p id={`${formId}-guidance`} class="guidance">
			Comments and replies are reviewed before they appear. Your display name will be public.
		</p>
		<div class="fields">
			<div class="name-field">
				<label for={`${formId}-name`}>Display name</label>
				<input
					id={`${formId}-name`}
					name="name"
					type="text"
					autocomplete="nickname"
					maxlength={60}
					required
					bind:value={name}
					oninput={edited}
				/>
			</div>
			<div>
				<label for={`${formId}-body`}>{parentId ? 'Your reply' : 'Your comment'}</label>
				<textarea
					id={`${formId}-body`}
					name="body"
					rows={parentId ? 3 : 4}
					maxlength={3000}
					required
					aria-describedby={`${formId}-guidance ${formId}-length`}
					bind:value={body}
					oninput={edited}
				></textarea>
				<p id={`${formId}-length`} class="length">{body.length.toLocaleString('en-GB')} / 3,000</p>
			</div>
		</div>
		<div class="honeypot" aria-hidden="true">
			<label for={`${formId}-website`}>Leave this field empty</label>
			<input
				id={`${formId}-website`}
				name="website"
				type="text"
				tabindex="-1"
				autocomplete="off"
				bind:value={website}
			/>
		</div>
		<div class="actions">
			<button type="submit" class="submit">{submitting ? 'Sending…' : 'Send for approval'}</button>
			{#if oncancel}<button type="button" class="cancel" onclick={oncancel}>Close reply</button
				>{/if}
		</div>
	</fieldset>
	{#if error}<p class="feedback error" role="alert">{error}</p>{/if}
	{#if message}<p class="feedback success" role="status">{message}</p>{/if}
</form>

<style>
	form {
		position: relative;
		color: var(--foreground);
	}

	fieldset {
		min-width: 0;
		padding: 0;
		border: 0;
	}

	legend {
		margin-bottom: 0.4rem;
		font-size: 1rem;
		font-weight: 650;
	}

	.guidance {
		margin: 0 0 1.2rem;
		color: var(--muted-foreground);
		font-size: 0.85rem;
		line-height: 1.6;
	}

	.fields {
		display: grid;
		gap: 1rem;
	}

	.name-field {
		width: min(100%, 22rem);
	}

	label {
		display: block;
		margin-bottom: 0.4rem;
		font-size: 0.85rem;
		font-weight: 600;
	}

	input,
	textarea {
		display: block;
		width: 100%;
		min-height: 2.75rem;
		border: 1px solid var(--border);
		border-radius: 0.4rem;
		background: var(--card);
		padding: 0.7rem 0.8rem;
		color: var(--foreground);
		font: inherit;
		font-size: 0.95rem;
		line-height: 1.6;
	}

	textarea {
		resize: vertical;
	}

	input:focus-visible,
	textarea:focus-visible,
	button:focus-visible {
		outline: 2px solid var(--ring);
		outline-offset: 3px;
	}

	.length {
		margin: 0.3rem 0 0;
		color: var(--muted-foreground);
		text-align: right;
		font-size: 0.75rem;
	}

	.honeypot {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem 0.8rem;
		margin-top: 0.75rem;
	}

	button {
		min-height: 2.75rem;
		border: 1px solid transparent;
		border-radius: 0.4rem;
		padding: 0.6rem 1rem;
		font-size: 0.85rem;
		font-weight: 650;
		cursor: pointer;
	}

	.submit {
		background: var(--primary);
		color: var(--primary-foreground);
	}

	.cancel {
		background: transparent;
		color: var(--muted-foreground);
	}

	button:hover {
		text-decoration: underline;
		text-underline-offset: 3px;
	}

	fieldset:disabled {
		opacity: 0.65;
	}

	button:disabled {
		cursor: wait;
	}

	.feedback {
		margin: 1rem 0 0;
		border-inline-start: 3px solid currentColor;
		padding: 0.3rem 0.8rem;
		font-size: 0.9rem;
		line-height: 1.6;
	}

	.error {
		color: var(--destructive);
	}

	.success {
		color: var(--foreground);
	}
</style>
