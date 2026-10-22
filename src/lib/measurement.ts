// Browser-local owner/test choice only; no identifier or preference is sent to analytics.
export const MEASUREMENT_OPTOUT_KEY = 'suvroghosh:measurement';

type MeasurementContext = {
	development: boolean;
	currentOrigin: string;
	productionOrigin: string;
	webdriver: boolean;
	localPreference: unknown;
	sessionPreference: unknown;
	analyticsConsent?: boolean;
};

export function measurementAllowed(context: MeasurementContext): boolean {
	return (
		context.analyticsConsent === true &&
		!context.development &&
		context.currentOrigin === context.productionOrigin &&
		!context.webdriver &&
		context.localPreference !== 'off' &&
		context.sessionPreference !== 'off'
	);
}

/** Baseline provider pageviews honor a readable explicit owner opt-out. */
export function providerPageviewAllowed(
	context: Pick<MeasurementContext, 'localPreference' | 'sessionPreference'>
): boolean {
	return context.localPreference !== 'off' && context.sessionPreference !== 'off';
}

export function readMeasurementPreference(
	getStorage: () => Pick<Storage, 'getItem'>,
	{ failClosed = true }: { failClosed?: boolean } = {}
): 'off' | null {
	try {
		return getStorage().getItem(MEASUREMENT_OPTOUT_KEY) === 'off' ? 'off' : null;
	} catch {
		// Optional measurement fails closed; baseline views require an explicit opt-out.
		return failClosed ? 'off' : null;
	}
}

export function filterMeasurementEvent<T extends { url: string }>(
	event: T,
	allowed: boolean,
	allowedOrigin: string
): T | null {
	if (!allowed) return null;
	try {
		const url = new URL(event.url, allowedOrigin);
		if (url.origin !== allowedOrigin || url.username || url.password) return null;
		const pathname = decodeURIComponent(url.pathname);
		if (
			/^\/api(?:\/|$)/.test(pathname) ||
			/^\/notes\/(?:studio|auth|sign-in|forgot-password|reset-password)(?:\/|$)/.test(pathname)
		) {
			return null;
		}
		// Do not forward search terms, reset tokens, share state or other query/fragment values.
		return { ...event, url: `${url.origin}${url.pathname}` };
	} catch {
		return null;
	}
}
