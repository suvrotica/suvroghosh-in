<details class="keyboard-help">
	<summary>Keyboard help</summary>
	<div class="help-grid">
		<kbd>Space</kbd><span>Pause or wake</span>
		<kbd>H</kbd><span>Hatch specimen</span>
		<kbd>M</kbd><span>Mutate</span>
		<kbd>T</kbd><span>Threat display</span>
		<kbd>S / A / G</kbd><span>Specimen, anatomy, or gait view</span>
		<kbd>F</kbd><span>Fullscreen</span>
		<kbd>P</kbd><span>Save PNG</span>
		<kbd>L</kbd><span>Copy specimen link</span>
		<kbd>R</kbd><span>Reset preset</span>
		<kbd>0</kbd><span>Reset view tilt</span>
		<kbd>← / →</kbd><span>Inspect adjacent plate</span>
		<kbd>Esc</kbd><span>Close a panel or fullscreen</span>
	</div>
	<p>Shortcuts pause while a text field, selector, or native control has focus.</p>
</details>

<style>
	.keyboard-help {
		color: #c5c7d1;
		font: 0.76rem/1.45 var(--font-sans, system-ui, sans-serif);
	}

	summary {
		min-height: 2.75rem;
		width: fit-content;
		padding: 0.75rem 0;
		cursor: pointer;
		color: #e6e8ef;
		font-weight: 650;
	}

	.help-grid {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 0.45rem 0.8rem;
		max-width: 28rem;
	}

	kbd {
		align-self: start;
		padding: 0.08rem 0.38rem;
		border: 1px solid rgb(255 255 255 / 18%);
		border-bottom-width: 2px;
		border-radius: 0.3rem;
		background: rgb(255 255 255 / 6%);
		color: #d8ff91;
		font: 0.68rem/1.5 var(--font-mono, monospace);
		text-align: center;
	}

	p {
		margin: 0.75rem 0 0;
		color: #8f92a5;
	}
</style>
