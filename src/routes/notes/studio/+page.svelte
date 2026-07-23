<script lang="ts">
	import { resolve } from '$app/paths';
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import SEO from '$lib/components/seo/SEO.svelte';
	import { clearLocalDraft } from '$lib/notes/offline';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	let totalPages = $derived(Math.max(1, Math.ceil(data.total / data.pageSize)));

	$effect(() => {
		if (
			form &&
			'deletedNoteId' in form &&
			typeof form.deletedNoteId === 'string' &&
			form.deletedNoteId
		) {
			void clearLocalDraft(form.deletedNoteId).catch(() => undefined);
		}
	});

	function pageHref(page: number) {
		const parameters = new SvelteURLSearchParams();
		if (data.query) parameters.set('q', data.query);
		if (data.status !== 'all') parameters.set('status', data.status);
		if (data.sort !== 'updated-desc') parameters.set('sort', data.sort);
		if (page > 1) parameters.set('page', String(page));
		const query = parameters.toString();
		return query ? `?${query}` : '?';
	}

	function formatDate(value: string) {
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
	title="Notes Studio | SuvroGhosh.IN"
	description="Private handwritten-notes authoring studio."
	canonicalUrl={undefined}
	robots="noindex,nofollow,noarchive"
	schema={null}
/>

<div class="studio-dashboard">
	<header class="studio-header">
		<div>
			<a href={resolve('/notes')}>← Public notes</a>
			<p>Private authoring</p>
			<h1>Notes studio</h1>
		</div>
		<div class="owner-actions">
			<span>{data.ownerEmail}</span>
			<form method="POST" action="?/signout">
				<button type="submit">Sign out</button>
			</form>
		</div>
	</header>

	<section class="new-note" aria-labelledby="new-note-heading">
		<div>
			<h2 id="new-note-heading">Start a new canvas</h2>
			<p>Begin with an infinite dotted page and the charcoal pen.</p>
		</div>
		<form method="POST" action="?/create">
			<label class="sr-only" for="new-note-title">New note title</label>
			<input
				id="new-note-title"
				name="title"
				placeholder="Untitled field note"
				required
				maxlength="160"
			/>
			<button type="submit">Create note</button>
		</form>
	</section>

	<form class="dashboard-filters" method="GET">
		<label>
			<span>Search</span>
			<input name="q" type="search" value={data.query} placeholder="Title or excerpt" />
		</label>
		<label>
			<span>Status</span>
			<select name="status" value={data.status}>
				<option value="all">All states</option>
				<option value="draft">Draft</option>
				<option value="scheduled">Scheduled</option>
				<option value="published">Published</option>
				<option value="private">Private</option>
				<option value="archived">Archived</option>
			</select>
		</label>
		<label>
			<span>Sort</span>
			<select name="sort" value={data.sort}>
				<option value="updated-desc">Recently updated</option>
				<option value="updated-asc">Oldest updated</option>
				<option value="title-asc">Title A–Z</option>
				<option value="title-desc">Title Z–A</option>
			</select>
		</label>
		<button type="submit">Filter</button>
	</form>

	{#if form?.message}
		<p class="action-message" role="status">{form.message}</p>
	{/if}

	{#if data.notes.length > 0}
		<div class="notes-table-wrap">
			<table>
				<caption class="sr-only">Owner notes</caption>
				<thead>
					<tr>
						<th scope="col">Note</th>
						<th scope="col">State</th>
						<th scope="col">Updated</th>
						<th scope="col">Actions</th>
					</tr>
				</thead>
				<tbody>
					{#each data.notes as note (note.id)}
						<tr>
							<td>
								<a href={resolve('/notes/studio/[id]', { id: note.id })}>{note.title}</a>
								<span>/{note.slug}</span>
							</td>
							<td><span class={`status status-${note.status}`}>{note.status}</span></td>
							<td><time datetime={note.updatedAt}>{formatDate(note.updatedAt)}</time></td>
							<td>
								<div class="row-actions">
									<a href={resolve('/notes/studio/[id]', { id: note.id })}>Edit</a>
									{#if note.status === 'published'}
										<a
											href={resolve('/notes/[slug]', { slug: note.slug })}
											target="_blank"
											rel="noopener noreferrer"
											>View<span class="sr-only">, opens in a new tab</span></a
										>
									{/if}
									<form method="POST" action="?/duplicate">
										<input type="hidden" name="id" value={note.id} />
										<button type="submit">Duplicate</button>
									</form>
									{#if note.status !== 'archived'}
										<form
											method="POST"
											action="?/archive"
											onsubmit={(event) => {
												if (!confirm(`Archive “${note.title}”?`)) event.preventDefault();
											}}
										>
											<input type="hidden" name="id" value={note.id} />
											<button class="danger" type="submit">Archive</button>
										</form>
									{/if}
									{#if note.status === 'archived'}
										<form
											method="POST"
											action="?/delete"
											onsubmit={(event) => {
												if (
													!confirm(
														`Permanently delete “${note.title}”, its history, and its private images? This cannot be undone.`
													)
												)
													event.preventDefault();
											}}
										>
											<input type="hidden" name="id" value={note.id} />
											<button class="danger" type="submit">Delete permanently</button>
										</form>
									{/if}
								</div>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
		{#if totalPages > 1}
			<nav class="pagination" aria-label="Notes pages">
				<a
					href={resolve(pageHref(data.page - 1) as '/notes/studio')}
					aria-disabled={data.page <= 1}
					tabindex={data.page <= 1 ? -1 : undefined}>Previous</a
				>
				<span>Page {data.page} of {totalPages}</span>
				<a
					href={resolve(pageHref(data.page + 1) as '/notes/studio')}
					aria-disabled={data.page >= totalPages}
					tabindex={data.page >= totalPages ? -1 : undefined}>Next</a
				>
			</nav>
		{/if}
	{:else}
		<div class="dashboard-empty">
			<p aria-hidden="true">✎</p>
			<h2>No notes here yet</h2>
			<p>Create the first canvas above, or broaden the current filters.</p>
		</div>
	{/if}
</div>

<style>
	.studio-dashboard {
		min-height: 100dvh;
		background: var(--paper);
		padding: clamp(1rem, 4vw, 3rem);
		color: var(--ink);
	}

	.studio-header {
		display: flex;
		max-width: 78rem;
		align-items: end;
		justify-content: space-between;
		gap: 1.5rem;
		margin: 0 auto 2rem;
		padding-bottom: 1.5rem;
		border-bottom: 1px solid var(--rule);
	}

	.studio-header a {
		color: var(--ink-muted);
		font-size: 0.8rem;
		text-underline-offset: 0.25em;
	}

	.studio-header p {
		margin: 1.4rem 0 0.25rem;
		color: var(--ink-faint);
		font-size: 0.7rem;
		font-weight: 800;
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}

	h1 {
		margin: 0;
		font-family: var(--font-serif);
		font-size: clamp(2.5rem, 6vw, 4.8rem);
		font-weight: 620;
		letter-spacing: -0.04em;
		line-height: 1;
	}

	.owner-actions {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		color: var(--ink-muted);
		font-size: 0.75rem;
	}

	button,
	input,
	select {
		font: inherit;
	}

	.owner-actions button,
	.dashboard-filters button,
	.new-note button {
		min-height: 2.75rem;
		border: 1px solid var(--ink);
		border-radius: 0.4rem;
		background: var(--ink);
		padding: 0.5rem 0.8rem;
		color: var(--paper);
		font-weight: 750;
		cursor: pointer;
	}

	.new-note,
	.dashboard-filters,
	.notes-table-wrap,
	.dashboard-empty,
	.action-message {
		max-width: 78rem;
		margin-inline: auto;
	}

	.new-note {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: 1.5rem;
		border: 1px solid var(--control-border);
		border-radius: 0.65rem;
		background: var(--paper-raised);
		padding: 1rem;
	}

	.new-note h2 {
		margin: 0;
		font-family: var(--font-serif);
		font-size: 1.35rem;
	}

	.new-note p {
		margin: 0.2rem 0 0;
		color: var(--ink-muted);
		font-size: 0.8rem;
	}

	.new-note form {
		display: flex;
		min-width: min(28rem, 100%);
		gap: 0.45rem;
	}

	.new-note input,
	.dashboard-filters input,
	.dashboard-filters select {
		min-width: 0;
		min-height: 2.75rem;
		border: 1px solid var(--control-border);
		border-radius: 0.4rem;
		background: var(--paper);
		padding: 0.5rem 0.65rem;
		color: var(--ink);
	}

	.new-note input {
		flex: 1;
	}

	.dashboard-filters {
		display: flex;
		align-items: end;
		gap: 0.65rem;
		margin-bottom: 1rem;
	}

	.dashboard-filters label {
		display: grid;
		flex: 1;
		gap: 0.25rem;
		color: var(--ink-muted);
		font-size: 0.72rem;
		font-weight: 750;
	}

	.dashboard-filters label:nth-child(2),
	.dashboard-filters label:nth-child(3) {
		max-width: 13rem;
	}

	.action-message {
		margin-bottom: 1rem;
		border-left: 3px solid var(--accent);
		background: var(--paper-raised);
		padding: 0.6rem 0.8rem;
		font-size: 0.8rem;
	}

	.notes-table-wrap {
		overflow-x: auto;
		border: 1px solid var(--rule);
	}

	.pagination {
		display: flex;
		max-width: 78rem;
		align-items: center;
		justify-content: flex-end;
		gap: 0.8rem;
		margin: 0.8rem auto 0;
		color: var(--ink-muted);
		font-size: 0.75rem;
	}

	.pagination a {
		display: inline-flex;
		min-height: 2.75rem;
		align-items: center;
		border: 1px solid var(--control-border);
		border-radius: 0.35rem;
		padding: 0.4rem 0.7rem;
		color: var(--ink);
	}

	.pagination a[aria-disabled='true'] {
		opacity: 0.42;
		pointer-events: none;
	}

	table {
		width: 100%;
		border-collapse: collapse;
		background: var(--paper-raised);
		text-align: left;
	}

	th,
	td {
		padding: 0.85rem 1rem;
		border-bottom: 1px solid var(--rule);
		vertical-align: middle;
	}

	th {
		color: var(--ink-faint);
		font-size: 0.68rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}

	td {
		font-size: 0.8rem;
	}

	td:first-child a {
		display: block;
		color: var(--ink);
		font-family: var(--font-serif);
		font-size: 1rem;
		font-weight: 700;
	}

	td:first-child span {
		color: var(--ink-faint);
		font-size: 0.68rem;
	}

	.status {
		display: inline-flex;
		border: 1px solid var(--rule);
		border-radius: 999px;
		padding: 0.2rem 0.5rem;
		text-transform: capitalize;
	}

	.status-published {
		border-color: #598174;
		background: #e0ece7;
		color: #285347;
	}

	.row-actions {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		white-space: nowrap;
	}

	.row-actions a,
	.row-actions button {
		display: inline-flex;
		min-height: 2.75rem;
		align-items: center;
		border: 0;
		background: transparent;
		padding: 0.35rem;
		color: var(--ink-muted);
		font-size: 0.72rem;
		font-weight: 750;
		text-decoration: underline;
		text-underline-offset: 0.2em;
		cursor: pointer;
	}

	.row-actions .danger {
		color: var(--destructive);
	}

	.dashboard-empty {
		padding: 4rem 1rem;
		border-block: 1px solid var(--rule);
		text-align: center;
	}

	.dashboard-empty > p:first-child {
		color: var(--accent);
		font-size: 2rem;
	}

	.dashboard-empty h2 {
		font-family: var(--font-serif);
	}

	@media (max-width: 46rem) {
		.studio-header,
		.new-note {
			align-items: stretch;
			flex-direction: column;
		}

		.owner-actions {
			justify-content: space-between;
		}

		.new-note form,
		.dashboard-filters {
			min-width: 0;
			align-items: stretch;
			flex-direction: column;
		}

		.dashboard-filters label:nth-child(2),
		.dashboard-filters label:nth-child(3) {
			max-width: none;
		}
	}
</style>
