<script lang="ts">
	import { resolve } from '$app/paths';
	import SEO from '$lib/components/seo/SEO.svelte';
	import NoteEditor from '$lib/components/notes/NoteEditor.svelte';
	import { clearLocalDraft } from '$lib/notes/offline';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	let noteEditor = $state<{
		flush: () => Promise<boolean>;
		getServerRevision: () => number;
	} | null>(null);
	let publishPreparationError = $state('');
	let resubmittingMetadata = false;
	let resubmittingRestore = false;
	let resubmittingAction: 'duplicate' | 'archive' | 'delete' | null = null;

	function localDateTime(value: string | null) {
		if (!value) return '';
		const date = new Date(value);
		const offset = date.getTimezoneOffset() * 60_000;
		return new Date(date.getTime() - offset).toISOString().slice(0, 16);
	}

	async function prepareMetadataSubmission(event: SubmitEvent) {
		if (resubmittingMetadata) return;
		const metadataForm = event.currentTarget as HTMLFormElement;
		const formData = new FormData(metadataForm);
		const requestedStatus = String(formData.get('status') ?? 'draft');
		if (requestedStatus !== 'published' && requestedStatus !== 'scheduled') return;
		event.preventDefault();
		publishPreparationError = '';
		if (!noteEditor) {
			publishPreparationError = 'The canvas is still starting. Try again in a moment.';
			return;
		}
		const saved = await noteEditor.flush();
		if (!saved) {
			publishPreparationError =
				'The current canvas could not be saved to the cloud. Publishing and scheduling remain paused; the device recovery copy is intact.';
			return;
		}
		resubmittingMetadata = true;
		const submitter = event.submitter;
		metadataForm.requestSubmit(submitter instanceof HTMLButtonElement ? submitter : undefined);
	}

	async function prepareVersionRestore(event: SubmitEvent) {
		if (resubmittingRestore) return;
		event.preventDefault();
		if (!confirm('Restore this canvas version? The current version remains in history.')) return;
		publishPreparationError = '';
		if (!noteEditor) {
			publishPreparationError = 'The canvas is still starting. Try again in a moment.';
			return;
		}
		const saved = await noteEditor.flush();
		if (!saved) {
			publishPreparationError =
				'The current canvas could not be secured in cloud history, so restoration was paused.';
			return;
		}
		const restoreForm = event.currentTarget as HTMLFormElement;
		const revisionInput = restoreForm.elements.namedItem('expectedRevision');
		if (revisionInput instanceof HTMLInputElement) {
			revisionInput.value = String(noteEditor.getServerRevision());
		}
		resubmittingRestore = true;
		restoreForm.requestSubmit();
	}

	async function prepareNoteAction(event: SubmitEvent, action: 'duplicate' | 'archive' | 'delete') {
		if (resubmittingAction === action) return;
		const actionForm = event.currentTarget as HTMLFormElement;
		if (
			action !== 'duplicate' &&
			!confirm(
				action === 'archive'
					? `Archive “${data.note.title}”?`
					: `Permanently delete “${data.note.title}”, all versions, and private images? This cannot be undone.`
			)
		) {
			event.preventDefault();
			return;
		}
		event.preventDefault();
		publishPreparationError = '';

		if (action === 'delete') {
			// The server remains authoritative; device cleanup is best-effort when IndexedDB is blocked.
			await clearLocalDraft(data.note.id).catch(() => undefined);
		} else {
			if (!noteEditor) {
				publishPreparationError = 'The canvas is still starting. Try again in a moment.';
				return;
			}
			const saved = await noteEditor.flush();
			if (!saved) {
				publishPreparationError =
					'The current canvas could not be saved to the cloud, so this action was paused.';
				return;
			}
		}

		resubmittingAction = action;
		actionForm.requestSubmit();
	}

	function formatVersionDate(value: string) {
		return new Intl.DateTimeFormat('en-GB', {
			day: 'numeric',
			month: 'short',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		}).format(new Date(value));
	}
</script>

<SEO
	title={`Edit ${data.note.title} | Notes Studio`}
	description="Private handwritten-note editor."
	canonicalUrl={undefined}
	robots="noindex,nofollow,noarchive"
	schema={null}
/>

<div class="studio-editor-page">
	<header class="editor-topbar">
		<div class="editor-identity">
			<a href={resolve('/notes/studio')} aria-label="Back to notes studio">←</a>
			<div>
				<span>{data.note.status}</span>
				<strong>{data.note.title}</strong>
			</div>
		</div>

		<div class="topbar-actions">
			<a
				href={resolve('/notes/studio/[id]/preview', { id: data.note.id })}
				target="_blank"
				rel="noopener noreferrer">Preview<span class="sr-only">, opens in a new tab</span></a
			>
			<details class="metadata-drawer">
				<summary>Details &amp; publish</summary>
				<div class="drawer-panel">
					<div class="drawer-heading">
						<div>
							<p>Note settings</p>
							<h2>Details &amp; publishing</h2>
						</div>
						<p>Canvas changes save automatically. These publishing details save separately.</p>
					</div>

					{#if form?.message}
						<p class="form-message" role="status">{form.message}</p>
					{/if}
					{#if publishPreparationError}
						<p class="form-message form-error" role="alert">{publishPreparationError}</p>
					{/if}

					<form method="POST" action="?/metadata" onsubmit={prepareMetadataSubmission}>
						<div class="field-grid">
							<label>
								<span>Title</span>
								<input name="title" value={data.note.title} required maxlength="160" />
							</label>
							<label>
								<span>Slug</span>
								<input
									name="slug"
									value={data.note.slug}
									required
									maxlength="180"
									pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
								/>
							</label>
							<label>
								<span>State</span>
								<select name="status" value={data.note.status}>
									<option value="draft">Draft</option>
									<option value="private">Private</option>
									<option value="scheduled">Scheduled</option>
									<option value="published">Published</option>
									<option value="archived">Archived</option>
								</select>
							</label>
							<label>
								<span>Schedule for</span>
								<input
									name="scheduledFor"
									type="datetime-local"
									value={localDateTime(data.note.scheduledFor)}
								/>
							</label>
							<label>
								<span>Category</span>
								<input name="category" value={data.note.category ?? ''} maxlength="80" />
							</label>
							<label>
								<span>Tags, comma separated</span>
								<input name="tags" value={data.note.tags.join(', ')} maxlength="500" />
							</label>
						</div>

						<label>
							<span>Excerpt</span>
							<textarea name="excerpt" rows="3" maxlength="500">{data.note.excerpt}</textarea>
						</label>

						<label>
							<span>Accessibility and search transcript</span>
							<textarea name="transcript" rows="7" maxlength="2000000"
								>{data.note.transcript}</textarea
							>
						</label>

						<div class="field-grid">
							<label>
								<span>Cover image URL</span>
								<input
									name="coverImageUrl"
									type="url"
									value={data.note.coverImageUrl ?? ''}
									maxlength="2000"
								/>
							</label>
							<label>
								<span>SEO title</span>
								<input name="seoTitle" value={data.note.seoTitle ?? ''} maxlength="70" />
							</label>
						</div>

						<label>
							<span>SEO description</span>
							<textarea name="seoDescription" rows="2" maxlength="170"
								>{data.note.seoDescription ?? ''}</textarea
							>
						</label>

						<label class="checkbox">
							<input name="downloadsEnabled" type="checkbox" checked={data.note.downloadsEnabled} />
							Allow public PNG and PDF downloads
						</label>

						<div class="drawer-actions">
							<button type="submit">Save details</button>
							<span>
								Selecting Published creates a snapshot. Later draft edits stay private until you
								publish again.
							</span>
						</div>
					</form>

					<section class="version-history" aria-labelledby="version-history-heading">
						<div>
							<h3 id="version-history-heading">Cloud version history</h3>
							<p>
								The newest 100 autosaves are retained; publication snapshots have separate history.
							</p>
						</div>
						{#if data.versions.length > 0}
							<ul>
								{#each data.versions as version (version.id)}
									<li>
										<div>
											<strong>Revision {version.revision}</strong>
											<span>{version.kind} · {formatVersionDate(version.createdAt)}</span>
										</div>
										<form method="POST" action="?/restore" onsubmit={prepareVersionRestore}>
											<input type="hidden" name="versionId" value={version.id} />
											<input type="hidden" name="expectedRevision" value={data.note.revision} />
											<button type="submit">Restore</button>
										</form>
									</li>
								{/each}
							</ul>
						{:else}
							<p>No saved versions yet. The first canvas change will create one.</p>
						{/if}
					</section>

					<div class="danger-zone">
						<form
							method="POST"
							action="?/duplicate"
							onsubmit={(event) => void prepareNoteAction(event, 'duplicate')}
						>
							<button type="submit">Duplicate note</button>
						</form>
						<form
							method="POST"
							action="?/archive"
							onsubmit={(event) => void prepareNoteAction(event, 'archive')}
						>
							<button class="danger" type="submit">Archive note</button>
						</form>
						<form
							method="POST"
							action="?/delete"
							onsubmit={(event) => void prepareNoteAction(event, 'delete')}
						>
							<button class="danger" type="submit">Delete permanently</button>
						</form>
					</div>
				</div>
			</details>
		</div>
	</header>

	<div class="canvas-slot">
		{#key `${data.note.id}:${data.note.revision}`}
			<NoteEditor
				bind:this={noteEditor}
				noteId={data.note.id}
				document={data.note.document}
				revision={data.note.revision}
			/>
		{/key}
	</div>
</div>

<style>
	.studio-editor-page {
		display: flex;
		width: 100%;
		height: 100dvh;
		flex-direction: column;
		overflow: hidden;
		background: #fbf7ec;
		color: #2b241c;
	}

	.editor-topbar {
		position: relative;
		z-index: 50;
		display: flex;
		min-height: 4.2rem;
		flex: 0 0 auto;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		border-bottom: 1px solid #cfc2ab;
		background: #fffaf0;
		padding: max(0.45rem, env(safe-area-inset-top)) max(0.75rem, env(safe-area-inset-right)) 0.45rem
			max(0.75rem, env(safe-area-inset-left));
		box-shadow: 0 1px 9px rgb(43 36 28 / 9%);
	}

	.editor-identity {
		display: flex;
		min-width: 0;
		align-items: center;
		gap: 0.7rem;
	}

	.editor-identity > a {
		display: grid;
		width: 2.75rem;
		height: 2.75rem;
		flex: 0 0 auto;
		place-content: center;
		border: 1px solid #cfc2ab;
		border-radius: 50%;
		color: #4b4134;
		text-decoration: none;
	}

	.editor-identity div {
		display: grid;
		min-width: 0;
	}

	.editor-identity span {
		color: #776957;
		font-size: 0.63rem;
		font-weight: 800;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}

	.editor-identity strong {
		overflow: hidden;
		font-family: Georgia, serif;
		font-size: 1.05rem;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.topbar-actions {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.topbar-actions > a,
	.metadata-drawer > summary {
		display: inline-flex;
		min-height: 2.75rem;
		align-items: center;
		border: 1px solid #897b67;
		border-radius: 0.4rem;
		background: transparent;
		padding: 0.5rem 0.75rem;
		color: #463d31;
		font-size: 0.75rem;
		font-weight: 750;
		text-decoration: none;
		cursor: pointer;
	}

	.metadata-drawer > summary {
		background: #2b241c;
		color: #fffaf0;
		list-style: none;
	}

	.metadata-drawer > summary::-webkit-details-marker {
		display: none;
	}

	.drawer-panel {
		position: fixed;
		inset: calc(4.2rem + env(safe-area-inset-top)) 0 0 auto;
		width: min(38rem, 100vw);
		overflow-y: auto;
		border-left: 1px solid #cfc2ab;
		background: #fffaf0;
		padding: 1.2rem;
		box-shadow: -14px 0 42px rgb(43 36 28 / 18%);
	}

	.drawer-heading {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		padding-bottom: 1rem;
		border-bottom: 1px solid #d8ccb7;
	}

	.drawer-heading p {
		max-width: 17rem;
		margin: 0;
		color: #756856;
		font-size: 0.72rem;
		line-height: 1.45;
	}

	.drawer-heading > div > p {
		font-weight: 800;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}

	.drawer-heading h2 {
		margin: 0.2rem 0 0;
		font-family: Georgia, serif;
		font-size: 1.5rem;
	}

	.drawer-panel form {
		display: grid;
		gap: 0.8rem;
		margin-top: 1rem;
	}

	.field-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.75rem;
	}

	.drawer-panel label {
		display: grid;
		gap: 0.3rem;
		color: #5e5242;
		font-size: 0.72rem;
		font-weight: 750;
	}

	.drawer-panel input,
	.drawer-panel select,
	.drawer-panel textarea {
		width: 100%;
		min-height: 2.75rem;
		border: 1px solid #9c8d76;
		border-radius: 0.35rem;
		background: #fffdf7;
		padding: 0.55rem 0.65rem;
		color: #2b241c;
		font: inherit;
	}

	.drawer-panel textarea {
		resize: vertical;
		line-height: 1.45;
	}

	.checkbox {
		display: flex !important;
		min-height: 2.75rem;
		align-items: center;
		gap: 0.55rem !important;
	}

	.checkbox input {
		width: 1.1rem;
		min-height: auto;
	}

	.drawer-actions {
		display: flex;
		align-items: center;
		gap: 0.7rem;
	}

	.drawer-actions button,
	.danger-zone button {
		min-height: 2.75rem;
		border: 1px solid #2b241c;
		border-radius: 0.35rem;
		background: #2b241c;
		padding: 0.5rem 0.8rem;
		color: #fffaf0;
		font-weight: 750;
		cursor: pointer;
	}

	.drawer-actions span {
		color: #756856;
		font-size: 0.68rem;
		line-height: 1.4;
	}

	.form-message {
		border-left: 3px solid #2f6b60;
		background: #e3eee9;
		padding: 0.65rem;
		color: #254d44;
		font-size: 0.75rem;
	}

	.form-error {
		border-left-color: #9b2c28;
		background: #f5e5e2;
		color: #6f2523;
	}

	.danger-zone {
		display: flex;
		gap: 0.5rem;
		margin-top: 1.5rem;
		padding-top: 1rem;
		border-top: 1px solid #d8ccb7;
	}

	.version-history {
		margin-top: 1.5rem;
		padding-top: 1rem;
		border-top: 1px solid #d8ccb7;
	}

	.version-history h3 {
		margin: 0;
		font-family: Georgia, serif;
		font-size: 1.1rem;
	}

	.version-history p {
		margin: 0.25rem 0 0;
		color: #756856;
		font-size: 0.72rem;
		line-height: 1.45;
	}

	.version-history ul {
		display: grid;
		gap: 0;
		margin: 0.75rem 0 0;
		padding: 0;
		border: 1px solid #d8ccb7;
		list-style: none;
	}

	.version-history li {
		display: flex;
		min-height: 3.5rem;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		padding: 0.55rem 0.65rem;
		border-bottom: 1px solid #e1d7c5;
	}

	.version-history li:last-child {
		border-bottom: 0;
	}

	.version-history li > div {
		display: grid;
		gap: 0.1rem;
	}

	.version-history li span {
		color: #756856;
		font-size: 0.67rem;
		text-transform: capitalize;
	}

	.version-history form {
		margin: 0;
	}

	.version-history button {
		min-height: 2.75rem;
		border: 1px solid #897b67;
		border-radius: 0.35rem;
		background: transparent;
		padding: 0.4rem 0.65rem;
		color: #463d31;
		font-weight: 750;
		cursor: pointer;
	}

	.danger-zone form {
		margin: 0;
	}

	.danger-zone button {
		background: transparent;
		color: #2b241c;
	}

	.danger-zone button.danger {
		border-color: #9b2c28;
		color: #9b2c28;
	}

	.canvas-slot {
		min-height: 0;
		flex: 1;
	}

	.canvas-slot :global(.note-editor-shell) {
		min-height: 0;
	}

	@media (max-width: 40rem) {
		.editor-topbar {
			min-height: 3.8rem;
		}

		.editor-identity strong {
			max-width: 8rem;
		}

		.topbar-actions > a {
			display: none;
		}

		.drawer-panel {
			inset: calc(3.8rem + env(safe-area-inset-top)) 0 0;
			width: 100vw;
			border-left: 0;
		}

		.drawer-heading,
		.drawer-actions {
			align-items: stretch;
			flex-direction: column;
		}

		.field-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
