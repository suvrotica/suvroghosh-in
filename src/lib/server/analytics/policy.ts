export const ANALYTICS_TIMEZONE = 'Asia/Kolkata';
export const ANALYTICS_RETENTION_DAYS = 180;
export const ANALYTICS_ORIGIN = 'https://www.suvroghosh.in';

export type Geography = { country: string; region: string; city: string };
const unknownGeography: Geography = { country: 'Unknown', region: 'Unknown', city: 'Unknown' };

/** Only trust these infrastructure headers inside the canonical Vercel production function.
 * An external reverse proxy would describe its own exit location, not a reader's device.
 * Never read forwarded geography from an event payload or an arbitrary local request.
 */
export function readGeography(headers: Headers, trustedVercelProduction: boolean): Geography {
	if (!trustedVercelProduction) return { ...unknownGeography };
	const country = headers.get('x-vercel-ip-country');
	if (!country || !/^[A-Z]{2}$/.test(country)) return { ...unknownGeography };
	const regionValue = headers.get('x-vercel-ip-country-region');
	const region = regionValue && /^[A-Z0-9]{1,3}$/.test(regionValue) ? regionValue : 'Unknown';
	const rawCity = headers.get('x-vercel-ip-city');
	let city = 'Unknown';
	if (rawCity && rawCity.length <= 384) {
		try {
			const decoded = decodeURIComponent(rawCity).normalize('NFC').trim();
			if (
				decoded.length > 0 &&
				decoded.length <= 96 &&
				/^[\p{L}\p{M}\p{N} .,'’()-]+$/u.test(decoded)
			)
				city = decoded;
		} catch {
			/* Malformed provider values remain Unknown. */
		}
	}
	return { country, region, city };
}

/** Strip incidental search/fragment data; membership is checked separately in the registry. */
export function normalizeAnalyticsPath(value: unknown): string | null {
	if (typeof value !== 'string' || value.length > 512 || !value.startsWith('/')) return null;
	if (
		value.startsWith('//') ||
		value.includes('\\') ||
		[...value].some((character) => character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127)
	)
		return null;
	try {
		const parsed = new URL(value, ANALYTICS_ORIGIN);
		if (parsed.origin !== ANALYTICS_ORIGIN) return null;
		const pathname = parsed.pathname;
		// Encoded separators and traversal must not create an alternate private-route spelling.
		if (pathname.includes('%') || pathname.includes('//')) return null;
		if (/^\/(?:api|tags)(?:\/|$)/.test(pathname) || /^\/notes\//.test(pathname)) return null;
		return pathname.length > 1 ? pathname.replace(/\/$/, '') : pathname;
	} catch {
		return null;
	}
}

const referrerFamilies: [RegExp, string][] = [
	[/^(?:www\.)?google\.(?:com|co\.in|co\.uk|de|fr|ca|com\.au)$/, 'Google'],
	[/^(?:www\.)?bing\.com$/, 'Bing'],
	[/^(?:www\.)?duckduckgo\.com$/, 'DuckDuckGo'],
	[/^(?:www\.|m\.|l\.|lm\.)?facebook\.com$/, 'Facebook'],
	[/^(?:www\.|l\.)?instagram\.com$/, 'Instagram'],
	[/^(?:www\.)?(?:x\.com|twitter\.com|t\.co)$/, 'X'],
	[/^(?:www\.)?(?:linkedin\.com|lnkd\.in)$/, 'LinkedIn'],
	[/^(?:www\.)?(?:youtube\.com|youtu\.be)$/, 'YouTube'],
	[/^(?:[a-z0-9-]+\.)?substack\.com$/, 'Substack'],
	[/^(?:www\.)?reddit\.com$/, 'Reddit'],
	[/^(?:www\.)?chatgpt\.com$/, 'ChatGPT'],
	[/^claude\.ai$/, 'Claude'],
	[/^(?:www\.)?perplexity\.ai$/, 'Perplexity']
];

/** A finite list avoids arbitrary hostnames becoming stored personal or unbounded data. */
export function referrerDimension(value: unknown): string {
	if (!value) return 'Direct or unavailable';
	if (typeof value !== 'string' || value.length > 2048) return 'Other external';
	try {
		const hostnameOnly = /^(?=.{1,253}$)[a-z0-9]+(?:[a-z0-9.-]*[a-z0-9])?$/i.test(value);
		const parsed = new URL(hostnameOnly ? `https://${value}` : value);
		if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password)
			return 'Other external';
		if (parsed.hostname === 'suvroghosh.in' || parsed.hostname === 'www.suvroghosh.in')
			return 'Internal';
		return (
			referrerFamilies.find(([pattern]) => pattern.test(parsed.hostname))?.[1] ?? 'Other external'
		);
	} catch {
		return 'Other external';
	}
}

/** The raw UA is examined transiently; only one of these small fixed labels is persisted. */
export function coarseClientDimensions(userAgent: string | null) {
	const ua = (userAgent ?? '').slice(0, 1024);
	const device = /ipad|tablet|android(?!.*mobile)/i.test(ua)
		? 'Tablet'
		: /mobile|iphone/i.test(ua)
			? 'Mobile'
			: ua
				? 'Desktop'
				: 'Unknown';
	const browser = /edg(?:e|a|ios)?\//i.test(ua)
		? 'Edge'
		: /(?:firefox|fxios)\//i.test(ua)
			? 'Firefox'
			: /(?:chrome|crios)\//i.test(ua)
				? 'Chrome'
				: /safari\//i.test(ua)
					? 'Safari'
					: ua
						? 'Other'
						: 'Unknown';
	return { device, browser };
}

export function reportingDay(date: Date = new Date()) {
	return new Intl.DateTimeFormat('en-CA', {
		timeZone: ANALYTICS_TIMEZONE,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	}).format(date);
}

export function addDays(day: string, days: number) {
	const date = new Date(`${day}T00:00:00Z`);
	date.setUTCDate(date.getUTCDate() + days);
	return date.toISOString().slice(0, 10);
}
