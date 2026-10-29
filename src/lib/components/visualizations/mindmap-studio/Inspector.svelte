<script lang="ts">
	import type {
		StudioProject,
		StudioNode,
		StudioEdge,
		Evidence
	} from '$lib/visualizations/mindmap-studio/types';
	let {
		project,
		node,
		edge = null,
		onnode,
		onedge,
		ondelete,
		onadd,
		onevidence,
		onclose,
		readonly = false
	}: {
		project: StudioProject;
		node: StudioNode | null;
		edge?: StudioEdge | null;
		onnode: (patch: Partial<StudioNode>) => void;
		onedge: (edge: StudioEdge | null, id?: string) => void;
		ondelete: () => void;
		onadd: () => void;
		onevidence: (evidence: Evidence) => void;
		onclose: () => void;
		readonly?: boolean;
	} = $props();
	let label = $state('');
	let description = $state('');
	let notes = $state('');
	let target = $state('');
	let relationship = $state('associated_with');
	let rationale = $state('');
	$effect(() => {
		label = node?.label || '';
		description = node?.description || '';
		notes = node?.notes || '';
	});
	function save() {
		if (!node || !label.trim()) return;
		const changed = label !== node.label || description !== node.description;
		onnode({
			label: label.trim(),
			description,
			notes,
			...(changed ? { status: 'inferred', reviewed: false } : {})
		});
	}
	function connect() {
		if (!node || !target || target === node.id) return;
		onedge({
			id: `edge-${crypto.randomUUID()}`,
			from: node.id,
			to: target,
			type: relationship,
			status: 'inferred',
			evidence: [],
			rationale: rationale || 'Relationship added by the reader; source support needs review.'
		});
		target = '';
		rationale = '';
	}
</script>

<aside class="inspector" aria-label="Idea inspector">
	<div class="panel-heading">
		<span class="eyebrow">03 / LOOK CLOSER</span><button
			class="icon-button"
			onclick={onclose}
			aria-label="Close inspector">×</button
		>
	</div>
	{#if edge}
		<span class="status-chip" data-status={edge.status}>{edge.status}</span>
		<h3>{edge.type.replaceAll('_', ' ')}</h3>
		<p class="relationship-line">
			{project.nodes.find((item) => item.id === edge.from)?.label}<span>↓</span>{project.nodes.find(
				(item) => item.id === edge.to
			)?.label}
		</p>
		<p>{edge.rationale}</p>
		<h4>Source support</h4>
		{#each edge.evidence as evidence, evidenceIndex (evidenceIndex)}<button
				class="evidence-card"
				onclick={() => onevidence(evidence)}
				><q>{evidence.quote}</q><small
					>{project.sources.find((source) => source.id === evidence.sourceId)?.title} · Open passage ↗</small
				></button
			>{/each}
		{#if !edge.evidence.length}<p class="quiet">
				No exact passage is attached. Treat this connection as an interpretation.
			</p>{/if}
		{#if !readonly}<button class="danger text-button" onclick={() => onedge(null, edge.id)}
				>Remove connection</button
			>{/if}
	{:else if node}
		<div class="inspector-badges">
			<span class="status-chip" data-status={node.status}>{node.status}</span><span class="quiet"
				>{node.category}</span
			>
		</div>
		{#if readonly}<h3>{node.label}</h3>
			<p>{node.description}</p>{:else}
			<form
				onsubmit={(event) => {
					event.preventDefault();
					save();
				}}
			>
				<label>Idea<input bind:value={label} maxlength="240" required /></label>
				<label
					>Meaning in context<textarea bind:value={description} rows="4" maxlength="6000"
					></textarea></label
				>
				<label
					>Your notes<textarea
						bind:value={notes}
						rows="3"
						maxlength="6000"
						placeholder="A question, a connection, a reminder…"
					></textarea></label
				>
				<button class="primary small" type="submit">Save idea</button>
			</form>
		{/if}
		<h4>Trace it to the source <span>{node.evidence.length}</span></h4>
		{#each node.evidence as evidence, evidenceIndex (evidenceIndex)}<button
				class="evidence-card"
				onclick={() => onevidence(evidence)}
				><q>{evidence.quote}</q><small
					>{project.sources.find((source) => source.id === evidence.sourceId)
						?.title}{evidence.locator ? ` · ${evidence.locator}` : ''}<span>Read in context ↗</span
					></small
				></button
			>{/each}
		{#if !node.evidence.length}<p class="quiet">
				This idea has no attached source passage. It is a working interpretation, not a sourced
				claim.
			</p>{/if}
		{#if !readonly}
			<label class="check-label"
				><input
					type="checkbox"
					checked={node.reviewed}
					onchange={(event) => onnode({ reviewed: event.currentTarget.checked })}
				/>I have reviewed this idea and its support.</label
			>
			<div class="inspector-actions">
				<button onclick={onadd}>+ Child idea</button>{#if node.id !== project.rootId}<button
						class="danger"
						onclick={ondelete}>Delete branch</button
					>{/if}
			</div>
			<details class="connection-editor">
				<summary>Connect to another idea</summary><label
					>Related idea<select bind:value={target}
						><option value="">Choose an idea</option
						>{#each project.nodes.filter((item) => item.id !== node.id) as other (other.id)}<option
								value={other.id}>{other.label}</option
							>{/each}</select
					></label
				><label
					>Relationship<select bind:value={relationship}
						>{#each ['supports', 'contradicts', 'depends_on', 'part_of', 'example_of', 'explains', 'associated_with', 'enables', 'limits', 'causes'] as relation (relation)}<option
								value={relation}>{relation.replaceAll('_', ' ')}</option
							>{/each}</select
					></label
				><label
					>Why are they connected?<textarea bind:value={rationale} rows="2" maxlength="2000"
					></textarea></label
				><button onclick={connect} disabled={!target}>Add inferred connection</button>
			</details>
		{/if}
	{:else}<h3>Follow an idea.</h3>
		<p class="quiet">
			Select a node or a labelled connection to read its meaning and the passage behind it.
		</p>{/if}
</aside>
