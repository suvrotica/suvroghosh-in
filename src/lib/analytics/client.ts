import { dev } from '$app/environment';
import { inject, pageview } from '@vercel/analytics';
import { filterMeasurementEvent } from '$lib/measurement';
import { createPageviewLedger } from './pageviews';

/** Public-page eligibility is independent of consent and browser storage. */
export function browserProviderPageviewAllowed(): boolean {
	if (typeof window === 'undefined') return false;
	return (
		filterMeasurementEvent({ url: window.location.href }, true, window.location.origin) !== null
	);
}

/** Owns default public pageviews for the persistent site layout. */
export function startMeasurement() {
	const ledger = createPageviewLedger();
	let providerReady = false;
	let stopped = false;
	const beforeSend = <T extends { url: string; type?: string }>(event: T): T | null =>
		filterMeasurementEvent(
			event,
			!stopped && event.type !== 'event' && browserProviderPageviewAllowed(),
			window.location.origin
		);

	function measure() {
		if (stopped) return;
		const path = ledger.take(browserProviderPageviewAllowed());
		if (!path) return;
		if (!providerReady) {
			// Completed navigations have one owner; the SDK's automatic subscription stays off.
			inject({
				mode: dev ? 'development' : 'production',
				disableAutoTrack: true,
				framework: 'sveltekit',
				beforeSend
			});
			providerReady = true;
		}
		pageview({ path });
	}

	ledger.navigate(window.location.pathname);
	measure();
	return {
		navigate(path: string) {
			ledger.navigate(path);
			measure();
		},
		stop() {
			stopped = true;
			if (window.vaq) window.vaq = window.vaq.filter(([event]) => event === 'beforeSend');
		}
	};
}
