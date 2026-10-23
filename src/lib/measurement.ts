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
