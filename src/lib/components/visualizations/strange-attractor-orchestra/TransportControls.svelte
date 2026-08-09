<script lang="ts">
	type Props = {
		playing: boolean;
		muted: boolean;
		volume: number;
		lowerIntensity: boolean;
		audioAvailable: boolean;
		onplaypause: () => void;
		onmute: () => void;
		onvolume: (value: number) => void;
		onstop: () => void;
		onintensity: () => void;
	};

	let {
		playing,
		muted,
		volume,
		lowerIntensity,
		audioAvailable,
		onplaypause,
		onmute,
		onvolume,
		onstop,
		onintensity
	}: Props = $props();
</script>

<div class="transport" aria-label="Playback and hearing-safety controls">
	<button class="transport-key" type="button" aria-pressed={playing} onclick={onplaypause}>
		<span aria-hidden="true">{playing ? 'Ⅱ' : '▶'}</span>
		{playing ? 'Pause' : 'Play'}
	</button>
	<button type="button" aria-pressed={muted} onclick={onmute} disabled={!audioAvailable}>
		{muted ? 'Unmute' : 'Mute'} <kbd>M</kbd>
	</button>
	<label class="volume">
		<span>Volume</span>
		<input
			type="range"
			min="0"
			max="0.72"
			step="0.01"
			value={volume}
			disabled={!audioAvailable}
			aria-label="Master volume"
			oninput={(event) => onvolume(Number(event.currentTarget.value))}
		/>
	</label>
	<button type="button" aria-pressed={lowerIntensity} onclick={onintensity}>
		Lower intensity
	</button>
	<button class="stop" type="button" onclick={onstop}>Fade silent <kbd>Esc</kbd></button>
</div>

<style>
	.transport {
		display: flex;
		min-width: 0;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
	}

	button,
	.volume {
		min-height: 2.75rem;
		border: 1px solid rgb(226 224 211 / 22%);
		border-radius: 0.45rem;
		background: #0b1114;
		color: #dedbd0;
	}

	button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.45rem;
		padding: 0.68rem 0.85rem;
		font: 700 0.75rem/1 var(--font-sans, sans-serif);
		cursor: pointer;
	}

	button.transport-key {
		border-color: rgb(115 206 211 / 48%);
		color: #d8fbfb;
	}

	button.stop {
		border-color: rgb(200 105 113 / 45%);
		color: #f2c3c2;
	}

	button:focus-visible,
	input:focus-visible {
		outline: 3px solid #8ee8eb;
		outline-offset: 2px;
	}

	button:disabled {
		cursor: not-allowed;
		opacity: 0.48;
	}

	.volume {
		display: grid;
		grid-template-columns: auto minmax(5.5rem, 9rem);
		align-items: center;
		gap: 0.55rem;
		padding: 0.43rem 0.72rem;
		font: 700 0.67rem/1 var(--font-sans, sans-serif);
	}

	input {
		accent-color: #75c9cc;
	}

	kbd {
		color: #777f7d;
		font: 600 0.62rem/1 var(--font-mono, monospace);
	}

	@media (max-width: 720px) {
		.transport {
			display: grid;
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}

		.volume {
			grid-column: 1 / -1;
		}
	}

	@media (forced-colors: active) {
		button,
		.volume {
			border-color: ButtonText;
			background: ButtonFace;
			color: ButtonText;
		}
	}
</style>
