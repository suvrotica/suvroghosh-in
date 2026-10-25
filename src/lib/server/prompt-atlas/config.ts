export const SEMANTIC_MODEL = 'nvidia/nemotron-3.5-lightning-free';
export const SEMANTIC_PROVIDER = 'Vercel AI Gateway / NVIDIA';
export const SEMANTIC_TIMEOUT_MS = 60_000;
export const SEMANTIC_MAX_BYTES = 2 * 1024 * 1024;
export const semanticHeaders = {
	'cache-control': 'private, no-cache, no-store, must-revalidate, max-age=0',
	pragma: 'no-cache',
	expires: '0',
	'x-robots-tag': 'noindex, nofollow, noarchive'
};

export type SemanticConfig = {
	enabled: boolean;
	credentialAvailable: boolean;
	salt: string;
	supabaseUrl: string;
	supabaseKey: string;
};

export function semanticConfig(env: Record<string, string | undefined>): SemanticConfig {
	return {
		enabled: env.PROMPT_ATLAS_AI_ENABLED === 'true',
		credentialAvailable: Boolean(env.AI_GATEWAY_API_KEY || env.VERCEL_OIDC_TOKEN),
		salt: env.PROMPT_ATLAS_RATE_LIMIT_SALT ?? '',
		supabaseUrl: env.SUPABASE_URL ?? '',
		supabaseKey: env.SUPABASE_SERVICE_ROLE_KEY ?? ''
	};
}

export function configurationReason(config: SemanticConfig): string | null {
	if (!config.enabled) return 'Free AI analysis is not enabled. Local analysis is available.';
	if (!config.credentialAvailable)
		return 'Free AI credentials are unavailable. Use local analysis.';
	if (config.salt.length < 32 || !config.supabaseUrl || !config.supabaseKey)
		return 'Shared AI usage limits are not configured. Use local analysis.';
	return null;
}
