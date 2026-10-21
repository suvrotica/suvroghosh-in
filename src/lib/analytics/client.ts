import { dev } from '$app/environment';
import { inject, pageview, track } from '@vercel/analytics';
import { injectSpeedInsights } from '@vercel/speed-insights';
import { siteUrl } from '$lib/components/seo/SEO';
import {
	filterMeasurementEvent,
	measurementAllowed,
	readMeasurementPreference
} from '$lib/measurement';
import { getConsent, initializeConsent, subscribeConsent } from '$lib/privacy/consent';
import { createPageviewLedger } from './pageviews';

const productionOrigin = new URL(siteUrl).origin;

export function browserMeasurementAllowed(): boolean {
	if (typeof window === 'undefined') return false;
	return (
		measurementAllowed({
			development: dev,
			currentOrigin: window.location.origin,
			productionOrigin,
			webdriver: navigator.webdriver,
			localPreference: readMeasurementPreference(() => window.localStorage),
			sessionPreference: readMeasurementPreference(() => window.sessionStorage),
			analyticsConsent: getConsent()?.analytics === true
		}) && filterMeasurementEvent({ url: window.location.href }, true, productionOrigin) !== null
	);
}

export function trackConsented(
	name: string,
	properties?: Record<string, string | number | boolean | null | undefined>
) {
	if (browserMeasurementAllowed()) track(name, properties);
}

/** Owns optional SDK initialization and first-party views for the persistent site layout. */
export function startMeasurement() {
	const releaseConsent = initializeConsent();
	const ledger = createPageviewLedger();
	const pending = new Set<AbortController>();
	let providerReady = false;
	let stopped = false;
	let setRoute: ((route: string | null) => void) | undefined;
	const beforeSend = <T extends { url: string }>(event: T): T | null =>
		filterMeasurementEvent(event, !stopped && browserMeasurementAllowed(), productionOrigin);

	function measure() {
		if (stopped) return;
		const path = ledger.take(browserMeasurementAllowed());
		if (!path) return;
		if (!providerReady) {
			// Manual page views avoid the SDK's unowned, always-on navigation subscription.
			inject({ mode: 'production', disableAutoTrack: true, framework: 'sveltekit', beforeSend });
			setRoute = injectSpeedInsights({ route: path, framework: 'sveltekit', beforeSend })?.setRoute;
			providerReady = true;
		}
		setRoute?.(path);
		pageview({ path });
		// Public Notes remain eligible for the existing provider policy, while this
		// first-party registry deliberately excludes dynamic document identifiers.
		if (/^\/notes\//.test(path)) return;
		const controller = new AbortController();
		pending.add(controller);
		const timer = window.setTimeout(() => controller.abort(), 5000);
		let referrer: string | undefined;
		try {
			const url = new URL(document.referrer);
			if (url.protocol === 'https:' && url.origin !== productionOrigin) referrer = url.hostname;
		} catch {
			/* Missing referrers are normal. */
		}
		void fetch('/api/analytics/pageview', {
			method: 'POST',
			credentials: 'omit',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ v: 1, consent: true, path, ...(referrer ? { referrer } : {}) }),
			signal: controller.signal
		})
			.catch(() => undefined)
			.finally(() => {
				clearTimeout(timer);
				pending.delete(controller);
			});
	}

	function stopPending() {
		for (const controller of pending) controller.abort();
		pending.clear();
		// Discard queued views/events if consent changes before a provider script has loaded.
		if (window.vaq) window.vaq = window.vaq.filter(([event]) => event === 'beforeSend');
		if (window.siq) window.siq = window.siq.filter(([event]) => event === 'beforeSend');
	}
	ledger.navigate(window.location.pathname);
	const unsubscribe = subscribeConsent(() => {
		if (!browserMeasurementAllowed()) stopPending();
		else measure();
	});
	const onStorage = () => {
		if (!browserMeasurementAllowed()) stopPending();
		else measure();
	};
	window.addEventListener('storage', onStorage);
	return {
		navigate(path: string) {
			ledger.navigate(path);
			measure();
		},
		stop() {
			stopped = true;
			stopPending();
			unsubscribe();
			releaseConsent();
			window.removeEventListener('storage', onStorage);
		}
	};
}
