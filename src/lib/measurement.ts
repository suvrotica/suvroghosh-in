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

export function readMeasurementPreference(
	getStorage: () => Pick<Storage, 'getItem'>
): 'off' | null {
	try {
		return getStorage().getItem(MEASUREMENT_OPTOUT_KEY) === 'off' ? 'off' : null;
	} catch {
		// A restricted browser must remain usable without measurement or a storage exception.
		return 'off';
	}
}

export function filterMeasurementEvent<T extends { url: string }>(
	event: T,
	allowed: boolean,
	productionOrigin: string
): T | null {
	if (!allowed) return null;
	try {
		const url = new URL(event.url, productionOrigin);
		if (url.origin !== productionOrigin || url.username || url.password) return null;
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
