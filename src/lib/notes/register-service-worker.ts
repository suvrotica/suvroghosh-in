/** Register offline support without letting a denied browser API interrupt page startup. */
export function registerServiceWorker(scriptUrl: string, development = false): () => void {
	if (!('serviceWorker' in navigator)) return () => {};

	let disposed = false;
	const register = async () => {
		if (disposed) return;
		try {
			if (development) {
				await navigator.serviceWorker.register(scriptUrl, { type: 'module' });
			} else {
				await navigator.serviceWorker.register(scriptUrl);
			}
		} catch {
			// Offline support is optional, including when a renderer rejects registration.
		}
	};

	if (document.readyState === 'complete') void register();
	else window.addEventListener('load', register, { once: true });

	return () => {
		disposed = true;
		window.removeEventListener('load', register);
	};
}
