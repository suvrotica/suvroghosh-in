export type FlightMode = 'curated' | 'free';

const SEED_PATTERN = /^[A-Za-z0-9_-]{3,48}$/;

export function validateSeed(value: string | null | undefined): string | null {
	const trimmed = value?.trim() ?? '';
	if (!SEED_PATTERN.test(trimmed)) return null;
	return trimmed.toLocaleUpperCase('en');
}

export function createReadableSeed(randomWords?: readonly number[]): string {
	let words = randomWords;
	if (!words) {
		if (typeof crypto !== 'undefined' && 'getRandomValues' in crypto) {
			words = Array.from(crypto.getRandomValues(new Uint32Array(2)));
		} else {
			words = [Date.now() >>> 0, Math.floor(Math.random() * 0xffff_ffff) >>> 0];
		}
	}
	const first = (words[0] ?? 0).toString(36).padStart(4, '0');
	const second = (words[1] ?? 1).toString(36).padStart(4, '0');
	return `KD-${first}-${second}`.toLocaleUpperCase('en');
}

export function parseFlightQuery(url: URL): { seed: string | null; mode: FlightMode } {
	const version = url.searchParams.get('kd_v');
	const seed = version === '1' ? validateSeed(url.searchParams.get('kd_seed')) : null;
	const mode = version === '1' && url.searchParams.get('kd_mode') === 'free' ? 'free' : 'curated';
	return { seed, mode };
}

export function flightShareUrl(current: URL, seed: string, mode: FlightMode): URL {
	const validated = validateSeed(seed);
	if (!validated) throw new Error('Cannot share an invalid Kagojer Dana seed.');
	const next = new URL(current.href);
	next.searchParams.set('kd_v', '1');
	next.searchParams.set('kd_seed', validated);
	next.searchParams.set('kd_mode', mode === 'free' ? 'free' : 'curated');
	return next;
}
