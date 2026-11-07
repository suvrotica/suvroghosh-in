import { env } from '$env/dynamic/private';
import { RADIO_LIMITS, type RadioProviderStatus } from '$lib/radio/types';

export interface RadioServerConfig {
	googleClientId: string | null;
	googleClientSecret: string | null;
	googleRedirectUri: string | null;
	googleConfigured: boolean;
	sessionSecret: string;
	livekitUrl: string | null;
	livekitApiKey: string | null;
	livekitApiSecret: string | null;
	livekitConfigured: boolean;
	supabaseConfigured: boolean;
	loopbackFallbackAllowed: boolean;
}

export function isLoopbackHostname(hostname: string): boolean {
	return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

export function getRadioServerConfig(url?: URL): RadioServerConfig {
	const googleClientId =
		env.GOOGLE_OAUTH_CLIENT_ID?.trim() || env.COMM_LINK_GOOGLE_CLIENT_ID?.trim() || null;
	const googleClientSecret =
		env.GOOGLE_OAUTH_CLIENT_SECRET?.trim() || env.COMM_LINK_GOOGLE_CLIENT_SECRET?.trim() || null;
	const googleRedirectUri =
		env.GOOGLE_OAUTH_REDIRECT_URI?.trim() ||
		env.COMM_LINK_GOOGLE_REDIRECT_URI?.trim() ||
		(url ? `${url.origin}/api/radio/auth/callback` : null);

	const googleConfigured = Boolean(googleClientId && googleClientSecret && googleRedirectUri);

	const sessionSecret =
		env.COMM_LINK_SESSION_SECRET?.trim() ||
		env.NOTES_RATE_LIMIT_SALT?.trim() ||
		'dev-comm-link-local-session-secret-do-not-use-in-prod-32b';

	const livekitUrl = env.LIVEKIT_URL?.trim() || null;
	const livekitApiKey = env.LIVEKIT_API_KEY?.trim() || null;
	const livekitApiSecret = env.LIVEKIT_API_SECRET?.trim() || null;
	const livekitConfigured = Boolean(livekitUrl && livekitApiKey && livekitApiSecret);

	const supabaseConfigured = Boolean(
		env.SUPABASE_URL?.trim() && env.SUPABASE_SERVICE_ROLE_KEY?.trim()
	);

	const isVercel = env.VERCEL === '1' || process.env.VERCEL === '1';
	const loopbackFallbackAllowed =
		!isVercel && (url ? isLoopbackHostname(url.hostname) : true);

	return {
		googleClientId,
		googleClientSecret,
		googleRedirectUri,
		googleConfigured,
		sessionSecret,
		livekitUrl,
		livekitApiKey,
		livekitApiSecret,
		livekitConfigured,
		supabaseConfigured,
		loopbackFallbackAllowed
	};
}

export function buildRadioProviderStatus(url?: URL): RadioProviderStatus {
	const cfg = getRadioServerConfig(url);
	return {
		googleOAuthConfigured: cfg.googleConfigured,
		livekitConfigured: cfg.livekitConfigured,
		supabaseConfigured: cfg.supabaseConfigured,
		loopbackFallbackAllowed: cfg.loopbackFallbackAllowed,
		maxParticipantsPerRoom: RADIO_LIMITS.MAX_PARTICIPANTS_DEFAULT,
		maxConcurrentRoomsGlobal: RADIO_LIMITS.MAX_CONCURRENT_ROOMS_GLOBAL
	};
}
