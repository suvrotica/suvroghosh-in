type NavigationTransition = Pick<ViewTransition, 'ready' | 'updateCallbackDone' | 'finished'>;

/** Keeps optional animation failures from blocking or rejecting SvelteKit navigation. */
export function runNavigationTransition(
	start: (update: () => Promise<void>) => NavigationTransition,
	complete: Promise<void>,
	onStartFailure: () => void
): Promise<void> {
	return new Promise<void>((releaseNavigation) => {
		const release = () => releaseNavigation();
		// Observe cancellation before a skipped transition can delay or omit its callback.
		const completed = complete.catch(release);
		let startFailed = false;

		try {
			const transition = start(async () => {
				// Capture the old frame before allowing Kit to commit the destination.
				release();
				await completed;
			});

			for (const phase of ['ready', 'updateCallbackDone', 'finished'] as const) {
				try {
					// Each lifecycle promise can reject independently. A skipped animation is
					// recoverable; only an unusable API should change feature availability.
					void transition[phase].then(phase === 'finished' ? release : undefined, release);
				} catch {
					// Continue observing the other promises even when a partial API omits one.
					startFailed = true;
				}
			}
		} catch {
			startFailed = true;
		}

		if (startFailed) {
			release();
			onStartFailure();
		}
	});
}
