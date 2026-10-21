const MAX_RESOURCES = 128;
const RESOURCE_WINDOW_MS = 5_000;

/** Preserve only resources this reader actually requested while opening a published note. */
export function preserveOpenedPublicNote(): () => void {
	if (!('serviceWorker' in navigator)) return () => {};
	const path = location.pathname;
	let disposed = false;
	let observer: PerformanceObserver | undefined;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let flushTimer: ReturnType<typeof setTimeout> | undefined;
	const sent = new Set<string>();
	const pending = new Set<string>();
	let target: ServiceWorker | null = null;
	function collect(entries: PerformanceEntry[]) {
		for (const entry of entries) {
			if (sent.size + pending.size >= MAX_RESOURCES) break;
			const url = new URL(entry.name, location.origin);
			if (url.origin !== location.origin || url.search || url.hash) continue;
			if (
				!url.pathname.startsWith('/_app/immutable/') &&
				!/^\/api\/public\/notes\/assets\/[^/]+\/[^/]+\/?$/.test(url.pathname)
			)
				continue;
			if (!sent.has(url.href)) pending.add(url.href);
		}
	}
	function flush() {
		flushTimer = undefined;
		if (disposed || location.pathname !== path || !target) return;
		const urls = [...pending];
		pending.clear();
		urls.forEach((url) => sent.add(url));
		target.postMessage({ type: 'cache-opened-public-note-v1', urls });
	}
	void navigator.serviceWorker.ready
		.then(async (registration) => {
			await document.fonts?.ready;
			if (disposed || location.pathname !== path) return;
			target = navigator.serviceWorker.controller ?? registration.active;
			if (!target) return;
			const resources = performance.getEntriesByType('resource');
			const requested = new Set(resources.map((entry) => entry.name));
			// Keep the document's runtime/style references and entry points ahead of old
			// SPA history, then prefer the newest actually requested note resources.
			const documentResources = [
				...document.querySelectorAll<HTMLLinkElement | HTMLScriptElement>(
					'link[rel="modulepreload"], link[rel="stylesheet"], script[src]'
				)
			]
				.map((element) => ({ name: 'href' in element ? element.href : element.src }))
				.filter((entry) => requested.has(entry.name));
			collect(documentResources as PerformanceEntry[]);
			collect(
				resources.filter((entry) =>
					new URL(entry.name).pathname.startsWith('/_app/immutable/entry/')
				)
			);
			collect([...resources].reverse());
			flush();
			if (typeof PerformanceObserver === 'undefined') return;
			observer = new PerformanceObserver((list) => {
				collect(list.getEntries());
				if (pending.size && !flushTimer) flushTimer = setTimeout(flush, 100);
			});
			observer.observe({ type: 'resource', buffered: true });
			timer = setTimeout(() => observer?.disconnect(), RESOURCE_WINDOW_MS);
		})
		.catch(() => {});
	return () => {
		disposed = true;
		observer?.disconnect();
		if (timer) clearTimeout(timer);
		if (flushTimer) clearTimeout(flushTimer);
	};
}
