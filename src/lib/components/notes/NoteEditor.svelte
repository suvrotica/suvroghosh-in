<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { beforeNavigate } from '$app/navigation';
	import { screenToWorld, zoomAround } from '$lib/notes/geometry';
	import { dataUrlToBlob, prepareImageFile } from '$lib/notes/images';
	import {
		downloadEditableSource,
		downloadPdf,
		downloadPng,
		downloadSvg,
		parseEditableSource
	} from '$lib/notes/export';
	import { noteDocumentSchema } from '$lib/notes/schema';
	import { InkEditorState } from '$lib/notes/editor-state.svelte';
	import {
		acknowledgeOutbox,
		clearLocalDraft,
		enqueueOutbox,
		loadLocalDraft,
		loadOldestOutboxOperation,
		markLocalDraftSynced,
		saveLocalDraft,
		type LocalDraftRecord
	} from '$lib/notes/offline';
	import { cloneDocument, type NoteDocument } from '$lib/notes/model';
	import InkCanvas from './InkCanvas.svelte';
	import InkToolbar from './InkToolbar.svelte';

	type Props = {
		noteId: string;
		document: NoteDocument;
		revision: number;
		cloudEnabled?: boolean;
	};

	type PendingOperation = {
		document: NoteDocument;
		sequence: number;
		idempotencyKey: string;
		expectedRevision?: number;
	};

	let {
		noteId,
		document: initialDocument,
		revision: initialRevision,
		cloudEnabled = true
	}: Props = $props();

	let shell: HTMLDivElement;
	let status = $state<
		'saved-cloud' | 'saving-local' | 'saved-device' | 'syncing' | 'offline' | 'conflict' | 'error'
	>(untrack(() => (cloudEnabled ? 'saved-cloud' : 'saved-device')));
	let notice = $state('');
	let serverRevision = $state(untrack(() => initialRevision));
	let pendingOperation: PendingOperation | null = null;
	let retryOperation: PendingOperation | null = null;
	let syncTimer: ReturnType<typeof setTimeout> | undefined;
	let syncInFlight: Promise<boolean> | null = null;
	let localWriteQueue: Promise<void> = Promise.resolve();
	let localWritesPending = 0;
	let localSequence = 0;
	let retryDelay = 2_000;
	let syncBlockedReason: string | null = null;
	let imageOperationsPending = 0;
	let recoverable = $state<LocalDraftRecord | null>(null);
	let recoveryChecked = $state(false);
	let recoveryActionInFlight = $state(false);
	let conflictActionInFlight = $state(false);
	let editor = new InkEditorState(
		untrack(() => initialDocument),
		handleDocumentChange
	);

	const statusLabels = {
		'saved-cloud': 'Saved to cloud',
		'saving-local': 'Saving locally…',
		'saved-device': 'Saved on this device',
		syncing: 'Syncing…',
		offline: 'Offline — changes queued',
		conflict: 'Conflict needs review — local recovery retained',
		error: 'Cloud save failed — local recovery retained'
	} as const;

	function handleDocumentChange(nextDocument: NoteDocument) {
		syncBlockedReason = null;
		const operation: PendingOperation = {
			// Transcript metadata is canonical on the note row and must not be duplicated in every
			// large canvas autosave or offline history entry.
			document: { ...nextDocument, transcript: '' },
			sequence: ++localSequence,
			idempotencyKey: crypto.randomUUID()
		};
		pendingOperation = operation;
		status = 'saving-local';
		localWritesPending += 1;
		const queuedWrite = localWriteQueue
			.catch(() => undefined)
			.then(() =>
				saveLocalDraft({
					noteId,
					document: operation.document,
					serverRevision,
					clientSequence: operation.sequence,
					idempotencyKey: operation.idempotencyKey,
					dirty: true,
					updatedAt: new Date().toISOString()
				})
			);
		localWriteQueue = queuedWrite;
		void queuedWrite
			.then(() => {
				if (pendingOperation?.sequence === operation.sequence) {
					status = navigator.onLine && cloudEnabled ? 'saved-device' : 'offline';
				}
			})
			.catch(() => {
				status = 'error';
			})
			.finally(() => {
				localWritesPending = Math.max(0, localWritesPending - 1);
				scheduleSync();
			});
		// Cloud durability must not depend on IndexedDB being available or under quota.
		scheduleSync();
	}

	function scheduleSync() {
		if (!cloudEnabled || (!pendingOperation && !retryOperation) || !navigator.onLine) {
			if (pendingOperation || retryOperation) status = cloudEnabled ? 'offline' : 'saved-device';
			return;
		}
		if (syncTimer) clearTimeout(syncTimer);
		syncTimer = setTimeout(() => void drainSyncQueue(), 900);
	}

	async function drainSyncQueue() {
		if (!cloudEnabled) return true;
		if (syncBlockedReason && !pendingOperation && !retryOperation) return false;
		if (!navigator.onLine) {
			if (pendingOperation || retryOperation) status = 'offline';
			return false;
		}
		if (syncInFlight) return syncInFlight;
		syncInFlight = (async () => {
			while ((retryOperation || pendingOperation) && navigator.onLine) {
				const saving = retryOperation ?? pendingOperation!;
				saving.expectedRevision ??= serverRevision;
				retryOperation = saving;
				status = 'syncing';
				try {
					await enqueueOutbox({
						idempotencyKey: saving.idempotencyKey,
						noteId,
						document: saving.document,
						expectedRevision: saving.expectedRevision,
						clientSequence: saving.sequence,
						createdAt: new Date().toISOString()
					}).catch(() => undefined);
					const response = await fetch(`/api/notes/${encodeURIComponent(noteId)}/document`, {
						method: 'PATCH',
						headers: {
							'content-type': 'application/json',
							'x-idempotency-key': saving.idempotencyKey
						},
						body: JSON.stringify({
							revision: saving.expectedRevision,
							document: saving.document
						})
					});
					if (response.status === 409) {
						status = 'conflict';
						return false;
					}
					if (
						response.status >= 400 &&
						response.status < 500 &&
						![408, 425, 429].includes(response.status)
					) {
						const payload = (await response.json().catch(() => null)) as {
							message?: string;
						} | null;
						await acknowledgeOutbox(saving.idempotencyKey).catch(() => undefined);
						retryOperation = null;
						const newerPending =
							pendingOperation !== null && pendingOperation.sequence > saving.sequence;
						if (pendingOperation?.sequence === saving.sequence) pendingOperation = null;
						const rejectedMessage =
							response.status === 413
								? 'This device draft is too large for cloud autosave. Export an editable copy, then delete or re-upload embedded images after private storage recovers.'
								: payload?.message ||
									'Cloud autosave rejected this draft. Correct the invalid content or sign in again, then make another change to retry.';
						if (newerPending) {
							syncBlockedReason = null;
							status = 'saved-device';
							continue;
						}
						syncBlockedReason = rejectedMessage;
						status = 'error';
						notice = syncBlockedReason;
						return false;
					}
					if (!response.ok) throw new Error(`Save failed with status ${response.status}`);
					const result = (await response.json()) as { revision: number };
					serverRevision = result.revision;
					await acknowledgeOutbox(saving.idempotencyKey).catch(() => undefined);
					retryOperation = null;
					if (pendingOperation?.sequence === saving.sequence) pendingOperation = null;
					await localWriteQueue.catch(() => undefined);
					await markLocalDraftSynced(noteId, serverRevision, saving.sequence).catch(
						() => undefined
					);
					status = pendingOperation ? 'saved-device' : 'saved-cloud';
					syncBlockedReason = null;
					retryDelay = 2_000;
				} catch {
					status = navigator.onLine ? 'error' : 'offline';
					if (navigator.onLine) {
						if (syncTimer) clearTimeout(syncTimer);
						syncTimer = setTimeout(() => void drainSyncQueue(), retryDelay);
						retryDelay = Math.min(60_000, retryDelay * 2);
					}
					return false;
				}
			}
			return retryOperation === null && pendingOperation === null;
		})();
		try {
			return await syncInFlight;
		} finally {
			syncInFlight = null;
		}
	}

	export async function flush() {
		if (syncTimer) clearTimeout(syncTimer);
		await localWriteQueue.catch(() => undefined);
		if (!cloudEnabled) return true;
		const saved = await drainSyncQueue();
		if (!saved) {
			notice =
				status === 'conflict'
					? 'Publishing paused because another session changed this note. Your local recovery copy is safe.'
					: 'Publishing needs a cloud connection and a successful save first.';
		}
		return saved;
	}

	export function getServerRevision() {
		return serverRevision;
	}

	function fitCanvas() {
		const rectangle = shell.getBoundingClientRect();
		editor.fitToContent(rectangle.width, rectangle.height, 72);
	}

	async function toggleFullscreen() {
		try {
			if (document.fullscreenElement) await document.exitFullscreen();
			else await shell.requestFullscreen();
		} catch {
			notice = 'Fullscreen is not available in this browser.';
		}
	}

	async function addImage(file: File, requestedPosition?: { x: number; y: number }) {
		const intendedTileId = editor.activeTileId;
		imageOperationsPending += 1;
		notice = 'Preparing image…';
		try {
			const image = await prepareImageFile(file);
			let embeddedOnDevice = false;
			const rectangle = shell.getBoundingClientRect();
			const position =
				requestedPosition ??
				screenToWorld({ x: rectangle.width / 2, y: rectangle.height / 2 }, editor.viewport);
			if (cloudEnabled) {
				try {
					notice = 'Uploading image to private storage…';
					const body = new FormData();
					body.set('file', await dataUrlToBlob(image.src), `${crypto.randomUUID()}.webp`);
					body.set('alt', image.alt);
					const response = await fetch(`/api/notes/${encodeURIComponent(noteId)}/assets`, {
						method: 'POST',
						body
					});
					if (!response.ok) throw new Error('Private image upload failed.');
					const result = (await response.json()) as { src: string };
					image.src = result.src;
				} catch {
					embeddedOnDevice = true;
				}
			}
			editor.addImage(image, position, intendedTileId);
			notice = embeddedOnDevice
				? 'Image added to this device draft, but private storage is unavailable. It cannot be published yet; export a backup, then delete and re-upload it when storage recovers.'
				: 'Image added. Select it to move, resize, rotate, layer, or make a tile.';
		} catch (error) {
			notice = error instanceof Error ? error.message : 'The image could not be added.';
		} finally {
			imageOperationsPending = Math.max(0, imageOperationsPending - 1);
		}
	}

	async function importDocument(file: File) {
		try {
			const source = await file.text();
			const parsed = noteDocumentSchema.parse(parseEditableSource(source));
			editor.replaceDocument({
				...parsed,
				id: noteId,
				title: initialDocument.title,
				updatedAt: new Date().toISOString()
			});
			notice = 'Editable note imported as a draft. Nothing was published automatically.';
		} catch (error) {
			notice = error instanceof Error ? error.message : 'The editable note could not be imported.';
		}
	}

	async function exportDocument(format: 'source' | 'svg' | 'png' | 'pdf') {
		notice = `Preparing ${format.toUpperCase()} export…`;
		try {
			if (format === 'source') downloadEditableSource(editor.document);
			else if (format === 'svg') downloadSvg(editor.document);
			else if (format === 'png') await downloadPng(editor.document);
			else await downloadPdf(editor.document);
			notice = `${format.toUpperCase()} export ready.`;
		} catch (error) {
			notice = error instanceof Error ? error.message : 'The export could not be created.';
		}
	}

	function handleGlobalKeydown(event: KeyboardEvent) {
		if (
			!recoveryChecked ||
			recoverable !== null ||
			recoveryActionInFlight ||
			conflictActionInFlight
		) {
			return;
		}
		const target = event.target as HTMLElement | null;
		if (target?.matches('input, textarea, select, [contenteditable="true"], [role="textbox"]')) {
			return;
		}
		const command = event.ctrlKey || event.metaKey;
		if (command && event.key.toLowerCase() === 'z') {
			event.preventDefault();
			if (event.shiftKey) editor.redo();
			else editor.undo();
			return;
		}
		if (command && event.key.toLowerCase() === 'y') {
			event.preventDefault();
			editor.redo();
			return;
		}
		if (command && event.key.toLowerCase() === 'c') {
			event.preventDefault();
			void editor.copySelection();
			return;
		}
		if (command && event.key.toLowerCase() === 'x') {
			event.preventDefault();
			void editor.copySelection(true);
			return;
		}
		if (command && event.key.toLowerCase() === 'v') {
			event.preventDefault();
			void editor.paste(
				() =>
					recoveryChecked &&
					recoverable === null &&
					!recoveryActionInFlight &&
					!conflictActionInFlight
			);
			return;
		}
		if (command && event.key.toLowerCase() === 'd') {
			event.preventDefault();
			editor.duplicateSelection();
			return;
		}
		if (command && event.key.toLowerCase() === 'g') {
			event.preventDefault();
			if (event.shiftKey) editor.ungroupSelection();
			else editor.groupSelection();
			return;
		}
		if (event.key === 'Delete' || event.key === 'Backspace') {
			event.preventDefault();
			editor.deleteSelection();
			return;
		}
		if (event.key === 'Escape') {
			editor.clearSelection();
			editor.setTool('select');
			return;
		}
		const tools = {
			v: 'select',
			l: 'lasso',
			h: 'hand',
			c: 'charcoal',
			p: 'pencil',
			e: 'eraser',
			t: 'text'
		} as const;
		const tool = tools[event.key.toLowerCase() as keyof typeof tools];
		if (tool) editor.setTool(tool);
		if (event.key === '+' || event.key === '=') {
			editor.setViewport(
				zoomAround(
					editor.viewport,
					{ x: shell.clientWidth / 2, y: shell.clientHeight / 2 },
					editor.viewport.zoom * 1.15
				)
			);
		}
		if (event.key === '-') {
			editor.setViewport(
				zoomAround(
					editor.viewport,
					{ x: shell.clientWidth / 2, y: shell.clientHeight / 2 },
					editor.viewport.zoom / 1.15
				)
			);
		}
	}

	async function recoverDraft() {
		if (!recoverable || recoveryActionInFlight) return;
		const draft = recoverable;
		const recoveryToken = draft.idempotencyKey;
		recoveryActionInFlight = true;
		try {
			if (syncTimer) clearTimeout(syncTimer);
			retryOperation = null;
			pendingOperation = null;
			syncBlockedReason = null;
			await acknowledgeOutbox(draft.idempotencyKey).catch(() => undefined);
			await clearLocalDraft(noteId).catch(() => undefined);
			if (recoverable?.idempotencyKey !== recoveryToken) return;
			localSequence = Math.max(localSequence, draft.clientSequence ?? 0);
			serverRevision = draft.serverRevision;
			recoverable = null;
			editor.replaceDocument({ ...draft.document, transcript: initialDocument.transcript });
			notice = 'Recovered the newer draft stored on this device.';
		} finally {
			recoveryActionInFlight = false;
		}
	}

	async function discardRecovery() {
		if (!recoverable || recoveryActionInFlight) return;
		const recoveryToken = recoverable.idempotencyKey;
		recoveryActionInFlight = true;
		try {
			if (syncTimer) clearTimeout(syncTimer);
			retryOperation = null;
			pendingOperation = null;
			syncBlockedReason = null;
			await clearLocalDraft(noteId).catch(() => undefined);
			if (recoverable?.idempotencyKey !== recoveryToken) return;
			recoverable = null;
			status = cloudEnabled ? 'saved-cloud' : 'saved-device';
			notice = 'The local recovery copy was removed.';
		} finally {
			recoveryActionInFlight = false;
		}
	}

	async function fetchCloudDocument() {
		const response = await fetch(`/api/notes/${encodeURIComponent(noteId)}/document`, {
			headers: { accept: 'application/json' }
		});
		if (!response.ok) throw new Error('The current cloud version could not be loaded.');
		const payload = (await response.json()) as { revision: number; document: unknown };
		return {
			revision: payload.revision,
			document: noteDocumentSchema.parse(payload.document)
		};
	}

	async function resolveConflictWithLocal() {
		if (conflictActionInFlight) return;
		conflictActionInFlight = true;
		try {
			const cloud = await fetchCloudDocument();
			if (retryOperation)
				await acknowledgeOutbox(retryOperation.idempotencyKey).catch(() => undefined);
			retryOperation = null;
			pendingOperation = null;
			syncBlockedReason = null;
			serverRevision = cloud.revision;
			handleDocumentChange(cloneDocument(editor.document));
			notice = 'The device version is queued on top of the latest cloud revision.';
		} catch (error) {
			notice = error instanceof Error ? error.message : 'The conflict could not be resolved.';
		} finally {
			conflictActionInFlight = false;
		}
	}

	async function resolveConflictWithCloud() {
		if (conflictActionInFlight) return;
		conflictActionInFlight = true;
		try {
			const cloud = await fetchCloudDocument();
			if (retryOperation)
				await acknowledgeOutbox(retryOperation.idempotencyKey).catch(() => undefined);
			retryOperation = null;
			pendingOperation = null;
			syncBlockedReason = null;
			serverRevision = cloud.revision;
			editor.loadCloudDocument(cloud.document);
			const sequence = ++localSequence;
			localWritesPending += 1;
			const cleanCloudWrite = localWriteQueue
				.catch(() => undefined)
				.then(() =>
					saveLocalDraft(
						{
							noteId,
							document: cloud.document,
							serverRevision,
							clientSequence: sequence,
							idempotencyKey: crypto.randomUUID(),
							dirty: false,
							updatedAt: new Date().toISOString()
						},
						false
					)
				);
			localWriteQueue = cleanCloudWrite;
			try {
				await cleanCloudWrite;
			} finally {
				localWritesPending = Math.max(0, localWritesPending - 1);
			}
			status = 'saved-cloud';
			notice = 'Loaded the current cloud version. The older device copy remains in local history.';
		} catch (error) {
			notice = error instanceof Error ? error.message : 'The conflict could not be resolved.';
		} finally {
			conflictActionInFlight = false;
		}
	}

	beforeNavigate(({ cancel }) => {
		if (imageOperationsPending === 0 && !recoveryActionInFlight && !conflictActionInFlight) {
			return;
		}
		cancel();
		notice = 'Please wait for the current image or recovery action to finish before leaving.';
	});

	onMount(() => {
		let mounted = true;
		void Promise.all([
			loadLocalDraft(noteId).catch(() => null),
			loadOldestOutboxOperation(noteId).catch(() => null)
		]).then(([draft, operation]) => {
			if (!mounted) return;
			if (
				draft?.dirty &&
				new Date(draft.updatedAt).getTime() > new Date(initialDocument.updatedAt).getTime()
			) {
				recoverable = draft;
			} else if (operation) {
				retryOperation = {
					document: { ...operation.document, transcript: '' },
					sequence: operation.clientSequence,
					idempotencyKey: operation.idempotencyKey,
					expectedRevision: operation.expectedRevision
				};
				localSequence = Math.max(localSequence, operation.clientSequence);
				scheduleSync();
			}
			recoveryChecked = true;
		});
		const online = () => scheduleSync();
		const offline = () => {
			if (pendingOperation) status = 'offline';
		};
		const beforeUnload = (event: BeforeUnloadEvent) => {
			if (
				localWritesPending === 0 &&
				imageOperationsPending === 0 &&
				!pendingOperation &&
				!retryOperation &&
				!syncBlockedReason &&
				!recoveryActionInFlight &&
				!conflictActionInFlight
			)
				return;
			event.preventDefault();
		};
		window.addEventListener('online', online);
		window.addEventListener('offline', offline);
		window.addEventListener('beforeunload', beforeUnload);
		return () => {
			mounted = false;
			if (syncTimer) clearTimeout(syncTimer);
			window.removeEventListener('online', online);
			window.removeEventListener('offline', offline);
			window.removeEventListener('beforeunload', beforeUnload);
		};
	});
</script>

<svelte:window onkeydown={handleGlobalKeydown} />

<div bind:this={shell} class:focus-mode={editor.distractionFree} class="note-editor-shell">
	<div class="editor-status" data-status={status}>
		<span class="status-dot" aria-hidden="true"></span>
		<span role="status" aria-live="polite">{statusLabels[status]}</span>
	</div>

	{#if recoverable}
		<aside class="recovery-banner" role="alert">
			<div>
				<strong>Newer work is stored on this device.</strong>
				<span>Recover it before continuing, or discard that local copy.</span>
			</div>
			<button type="button" disabled={recoveryActionInFlight} onclick={() => void recoverDraft()}
				>Recover</button
			>
			<button type="button" disabled={recoveryActionInFlight} onclick={() => void discardRecovery()}
				>Discard</button
			>
		</aside>
	{:else if !recoveryChecked}
		<aside class="recovery-banner" role="status" aria-live="polite">
			<div>
				<strong>Checking device recovery…</strong>
				<span>The canvas will be ready in a moment.</span>
			</div>
		</aside>
	{/if}

	{#if status === 'conflict'}
		<aside class="recovery-banner conflict-banner" role="alert">
			<div>
				<strong>This note changed in another session.</strong>
				<span>Choose which version should become the next editable cloud revision.</span>
			</div>
			<button
				type="button"
				disabled={conflictActionInFlight}
				onclick={() => void resolveConflictWithLocal()}>Keep this device</button
			>
			<button
				type="button"
				disabled={conflictActionInFlight}
				onclick={() => void resolveConflictWithCloud()}>Use cloud version</button
			>
		</aside>
	{/if}

	<div
		class="editor-interaction"
		inert={!recoveryChecked ||
			recoverable !== null ||
			recoveryActionInFlight ||
			conflictActionInFlight}
	>
		<InkCanvas
			{editor}
			onnotice={(message) => (notice = message)}
			onimage={(file, position) => void addImage(file, position)}
		/>
		<InkToolbar
			{editor}
			onfit={fitCanvas}
			onfullscreen={() => void toggleFullscreen()}
			onaddtile={() => {
				const rectangle = shell.getBoundingClientRect();
				editor.addTile(
					screenToWorld({ x: rectangle.width / 2, y: rectangle.height / 2 }, editor.viewport),
					'Writing tile'
				);
			}}
			onimage={(file) => void addImage(file)}
			onimport={(file) => void importDocument(file)}
			onexport={(format) => void exportDocument(format)}
		/>
	</div>

	{#if notice}
		<div class="editor-notice" role="status" aria-live="polite">
			<span>{notice}</span>
			<button type="button" aria-label="Dismiss message" onclick={() => (notice = '')}>×</button>
		</div>
	{/if}
</div>

<style>
	.note-editor-shell {
		position: relative;
		width: 100%;
		height: 100%;
		min-height: 34rem;
		overflow: hidden;
		background: #fbf7ec;
		color: #2b241c;
	}

	.editor-interaction {
		display: contents;
	}

	.editor-status {
		position: absolute;
		top: max(0.7rem, env(safe-area-inset-top));
		right: max(0.75rem, env(safe-area-inset-right));
		z-index: 32;
		display: inline-flex;
		min-height: 2.4rem;
		align-items: center;
		gap: 0.45rem;
		border: 1px solid rgb(108 95 76 / 32%);
		border-radius: 999px;
		background: rgb(255 250 240 / 90%);
		padding: 0.4rem 0.75rem;
		box-shadow: 0 3px 14px rgb(43 36 28 / 12%);
		color: #5b503f;
		font-size: 0.75rem;
		font-weight: 700;
		backdrop-filter: blur(12px);
	}

	.status-dot {
		width: 0.52rem;
		height: 0.52rem;
		border-radius: 50%;
		background: #367565;
	}

	[data-status='saving-local'] .status-dot,
	[data-status='syncing'] .status-dot {
		background: #b07a2e;
	}

	[data-status='offline'] .status-dot,
	[data-status='error'] .status-dot,
	[data-status='conflict'] .status-dot {
		background: #a43531;
	}

	.recovery-banner {
		position: absolute;
		inset: 4rem 1rem auto;
		z-index: 40;
		display: flex;
		max-width: 42rem;
		align-items: center;
		gap: 0.65rem;
		margin-inline: auto;
		border: 1px solid #a5722e;
		border-radius: 0.6rem;
		background: #fff2cf;
		padding: 0.8rem;
		box-shadow: 0 8px 30px rgb(43 36 28 / 18%);
	}

	.conflict-banner {
		border-color: #9b2c28;
		background: #f8e4df;
	}

	.recovery-banner div {
		display: grid;
		flex: 1;
		font-size: 0.78rem;
	}

	.recovery-banner button {
		min-height: 2.75rem;
		border: 1px solid #816438;
		border-radius: 0.35rem;
		padding: 0.4rem 0.7rem;
		font-weight: 700;
	}

	.editor-notice {
		position: absolute;
		inset: auto auto max(5.25rem, calc(env(safe-area-inset-bottom) + 4.75rem)) 50%;
		z-index: 45;
		display: flex;
		width: min(32rem, calc(100% - 1.5rem));
		transform: translateX(-50%);
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		border-radius: 0.45rem;
		background: rgb(43 36 28 / 92%);
		padding: 0.6rem 0.8rem;
		color: white;
		font-size: 0.78rem;
		box-shadow: 0 8px 25px rgb(0 0 0 / 20%);
	}

	.editor-notice button {
		min-width: 2.25rem;
		min-height: 2.25rem;
		border: 0;
		border-radius: 0.3rem;
		background: transparent;
		color: white;
		font-size: 1.25rem;
	}

	.focus-mode .editor-status {
		opacity: 0.18;
	}

	.focus-mode .editor-status:hover,
	.focus-mode .editor-status:focus-within {
		opacity: 1;
	}

	@media (max-width: 38rem) {
		.editor-status {
			top: max(0.4rem, env(safe-area-inset-top));
			right: max(0.4rem, env(safe-area-inset-right));
			max-width: calc(100% - 0.8rem);
			min-height: 2rem;
			padding: 0.3rem 0.55rem;
			font-size: 0.67rem;
		}

		.recovery-banner {
			align-items: stretch;
			flex-wrap: wrap;
		}

		.recovery-banner div {
			flex-basis: 100%;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.focus-mode .editor-status {
			transition: none;
		}
	}
</style>
