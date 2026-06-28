<script lang="ts">
	import { browser } from '$app/environment';
	import { env as publicEnv } from '$env/dynamic/public';
	import { onDestroy } from 'svelte';

	type ChatterboxModel = 'turbo' | 'original' | 'multilingual';

	const PREVIEW_CHAR_LIMIT = 2400;
	const enabled = publicEnv.PUBLIC_ENABLE_CHATTERBOX_TTS === 'true';

	let model = $state<ChatterboxModel>('turbo');
	let voice = $state('Emily.wav');
	let allowExpressiveTags = $state(false);
	let loading = $state(false);
	let error = $state('');
	let audioUrl = $state<string | null>(null);
	let previewText = $state('');
	let previewWasTrimmed = $state(false);

	onDestroy(() => {
		clearAudioUrl();
	});

	function clearAudioUrl() {
		if (browser && audioUrl) {
			URL.revokeObjectURL(audioUrl);
		}
		audioUrl = null;
	}

	function getReadableArticleText() {
		if (!browser) {
			return '';
		}

		const article =
			document.querySelector<HTMLElement>('.prose') ||
			document.querySelector<HTMLElement>('article') ||
			document.body;
		const clone = article.cloneNode(true) as HTMLElement;

		clone
			.querySelectorAll(
				[
					'[data-chatterbox-tts-exclude]',
					'[data-tts-exclude]',
					'.no-read',
					'button',
					'select',
					'input',
					'textarea',
					'script',
					'style',
					'noscript',
					'pre',
					'code',
					'kbd',
					'samp',
					'nav',
					'header',
					'footer',
					'aside',
					'iframe',
					'svg'
				].join(', ')
			)
			.forEach((el) => el.remove());

		return cleanArticleText(clone.innerText || clone.textContent || '');
	}

	function cleanArticleText(text: string) {
		const cleaned = text
			.replace(/\r/g, '\n')
			.replace(/^\s*---[\s\S]*?---/, ' ')
			.replace(/```[\s\S]*?```/g, ' ')
			.replace(/`[^`]*`/g, ' ')
			.replace(/<\/?(?:TTS|ChatterboxTTS|Pi|Yt|Yc|Dl|Vid)\b[^>]*>/gi, ' ')
			.replace(/<[^>]+>/g, ' ')
			.replace(/\b(?:Home|Blog|Read Next|Topics Discussed|Audio Article)\b/gi, ' ')
			.replace(/\s+/g, ' ')
			.trim();

		return limitToPreview(cleaned);
	}

	function limitToPreview(text: string) {
		if (text.length <= PREVIEW_CHAR_LIMIT) {
			previewWasTrimmed = false;
			return text;
		}

		const clipped = text.slice(0, PREVIEW_CHAR_LIMIT);
		const lastSentenceEnd = Math.max(
			clipped.lastIndexOf('.'),
			clipped.lastIndexOf('!'),
			clipped.lastIndexOf('?')
		);

		previewWasTrimmed = true;
		return clipped
			.slice(0, lastSentenceEnd > 900 ? lastSentenceEnd + 1 : PREVIEW_CHAR_LIMIT)
			.trim();
	}

	async function generateAudio() {
		if (!browser || loading) {
			return;
		}

		error = '';
		clearAudioUrl();
		const text = getReadableArticleText();
		previewText = text;

		if (!text) {
			error = 'I could not find readable article text for Chatterbox.';
			return;
		}

		loading = true;

		try {
			const response = await fetch('/api/tts/chatterbox', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					text,
					model,
					voice: voice.trim() || 'default',
					format: 'wav',
					exaggeration: 0.5,
					cfgWeight: 0.5,
					allowExpressiveTags
				})
			});

			if (!response.ok) {
				throw new Error(await readErrorMessage(response));
			}

			const blob = await response.blob();
			if (!blob.size) {
				throw new Error('The Chatterbox backend returned an empty audio file.');
			}

			audioUrl = URL.createObjectURL(blob);
		} catch (err) {
			error =
				err instanceof Error
					? err.message
					: 'Chatterbox audio could not be generated. Please try again.';
		} finally {
			loading = false;
		}
	}

	async function readErrorMessage(response: Response) {
		const fallback = 'Chatterbox audio could not be generated.';
		const contentType = response.headers.get('content-type') ?? '';

		if (!contentType.includes('application/json')) {
			return fallback;
		}

		try {
			const data = (await response.json()) as {
				error?: string;
				detail?: string;
				backendStatus?: number;
			};
			if (data.error && data.backendStatus) {
				return `${data.error} Backend HTTP ${data.backendStatus}.`;
			}

			return data.error ?? fallback;
		} catch {
			return fallback;
		}
	}
</script>

{#if enabled}
	<div
		data-chatterbox-tts-exclude
		data-tts-exclude
		class="not-prose my-8 rounded-lg border border-neutral-200 bg-white/60 p-4 shadow-sm backdrop-blur-sm dark:border-neutral-800 dark:bg-neutral-900/60"
	>
		<div class="flex flex-col gap-4">
			<div class="flex flex-col gap-3 sm:flex-row sm:items-end">
				<label
					class="flex flex-1 flex-col gap-1.5 text-xs font-semibold text-neutral-600 dark:text-neutral-300"
				>
					<span class="tracking-wider uppercase">Chatterbox Model</span>
					<select
						bind:value={model}
						disabled={loading}
						class="h-10 rounded-md border-neutral-300 bg-white text-sm text-neutral-900 shadow-sm focus:border-neutral-500 focus:ring-neutral-500 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"
					>
						<option value="turbo">Turbo</option>
						<option value="original">Original</option>
						<option value="multilingual">Multilingual</option>
					</select>
				</label>

				<label
					class="flex flex-1 flex-col gap-1.5 text-xs font-semibold text-neutral-600 dark:text-neutral-300"
				>
					<span class="tracking-wider uppercase">Voice</span>
					<input
						bind:value={voice}
						disabled={loading}
						class="h-10 rounded-md border-neutral-300 bg-white text-sm text-neutral-900 shadow-sm focus:border-neutral-500 focus:ring-neutral-500 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"
						autocomplete="off"
						spellcheck="false"
					/>
				</label>
			</div>

			<label class="inline-flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300">
				<input
					type="checkbox"
					bind:checked={allowExpressiveTags}
					disabled={loading}
					class="rounded border-neutral-300 text-neutral-900 focus:ring-neutral-500 dark:border-neutral-700 dark:bg-neutral-950"
				/>
				<span>Allow expressive tags</span>
			</label>

			<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
				<p class="m-0 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
					Experimental Chatterbox preview; currently limited to the first part of the article.
				</p>

				<button
					type="button"
					onclick={generateAudio}
					disabled={loading}
					class="inline-flex h-10 items-center justify-center rounded-md bg-neutral-900 px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
				>
					{loading ? 'Generating...' : 'Generate Chatterbox Audio'}
				</button>
			</div>

			{#if previewWasTrimmed && previewText}
				<p class="m-0 text-xs text-neutral-500 dark:text-neutral-500">
					Preview text length: {previewText.length.toLocaleString()} characters.
				</p>
			{/if}

			{#if error}
				<p
					class="m-0 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200"
					role="status"
					aria-live="polite"
				>
					{error}
				</p>
			{/if}

			{#if audioUrl}
				<audio
					controls
					src={audioUrl}
					class="w-full"
					aria-label="Generated Chatterbox audio preview"
				></audio>
			{/if}
		</div>
	</div>
{/if}
