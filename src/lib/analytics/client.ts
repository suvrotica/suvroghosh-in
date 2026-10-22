import { dev } from '$app/environment';
import { inject, pageview, track } from '@vercel/analytics';
import { injectSpeedInsights } from '@vercel/speed-insights';
import { siteUrl } from '$lib/components/seo/SEO';
import {
	filterMeasurementEvent,
	measurementAllowed,
	providerPageviewAllowed,
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

export function browserProviderPageviewAllowed(): boolean {
	if (typeof window === 'undefined') return false;
	return (
		providerPageviewAllowed({
			localPreference: readMeasurementPreference(() => window.localStorage, { failClosed: false }),
			sessionPreference: readMeasurementPreference(() => window.sessionStorage, {
				failClosed: false
			})
		}) &&
		filterMeasurementEvent({ url: window.location.href }, true, window.location.origin) !== null
	);
}

export function trackConsented(
	name: string,
	properties?: Record<string, string | number | boolean | null | undefined>
) {
	if (browserMeasurementAllowed()) track(name, properties);
}

/** Owns baseline provider views and separately consented measurement for the site layout. */
export function startMeasurement() {
	const releaseConsent = initializeConsent();
	const providerLedger = createPageviewLedger();
	const optionalLedger = createPageviewLedger();
	const pending = new Set<AbortController>();
	let providerReady = false;
	let speedReady = false;
	let stopped = false;
	let setRoute: ((route: string | null) => void) | undefined;
	const optionalBeforeSend = <T extends { url: string }>(event: T): T | null =>
		filterMeasurementEvent(event, !stopped && browserMeasurementAllowed(), productionOrigin);
	const providerBeforeSend = <T extends { url: string; type?: string }>(event: T): T | null =>
		filterMeasurementEvent(
			event,
			!stopped &&
				(event.type === 'event' ? browserMeasurementAllowed() : browserProviderPageviewAllowed()),
			window.location.origin
		);

	function measureProvider() {
		if (stopped) return;
		const path = providerLedger.take(browserProviderPageviewAllowed());
		if (!path) return;
		if (!providerReady) {
			// Manual page views avoid the SDK's unowned, always-on navigation subscription.
			inject({
				mode: dev ? 'development' : 'production',
				disableAutoTrack: true,
				framework: 'sveltekit',
				beforeSend: providerBeforeSend
			});
			providerReady = true;
		}
		pageview({ path });
	}

	function measureOptional() {
		if (stopped) return;
		const path = optionalLedger.take(browserMeasurementAllowed());
		if (!path) return;
		if (!speedReady) {
			setRoute = injectSpeedInsights({
				route: path,
				framework: 'sveltekit',
				beforeSend: optionalBeforeSend
			})?.setRoute;
			speedReady = true;
		}
		setRoute?.(path);
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

	function stopOptionalPending() {
		for (const controller of pending) controller.abort();
		pending.clear();
		// Optional withdrawal must not discard baseline pageviews awaiting the provider script.
		if (window.vaq)
			window.vaq = window.vaq.filter(([event]) => event === 'beforeSend' || event === 'pageview');
		if (window.siq) window.siq = window.siq.filter(([event]) => event === 'beforeSend');
	}
	function stopProviderPending() {
		if (window.vaq) window.vaq = window.vaq.filter(([event]) => event === 'beforeSend');
	}
	const onChoiceChange = () => {
		if (!browserProviderPageviewAllowed()) stopProviderPending();
		else measureProvider();
		if (!browserMeasurementAllowed()) stopOptionalPending();
		else measureOptional();
	};
	providerLedger.navigate(window.location.pathname);
	optionalLedger.navigate(window.location.pathname);
	measureProvider();
	const unsubscribe = subscribeConsent(onChoiceChange);
	const onStorage = onChoiceChange;
	window.addEventListener('storage', onStorage);
	return {
		navigate(path: string) {
			providerLedger.navigate(path);
			optionalLedger.navigate(path);
			onChoiceChange();
		},
		stop() {
			stopped = true;
			stopOptionalPending();
			stopProviderPending();
			unsubscribe();
			releaseConsent();
			window.removeEventListener('storage', onStorage);
		}
	};
}
