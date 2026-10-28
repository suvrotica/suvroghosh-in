import { getVercelOidcTokenSync } from '@vercel/oidc';
import type { UmlAiAvailability } from '$lib/visualizations/post-to-uml/types';

export const DEFAULT_UML_AI_MODEL = 'nvidia/nemotron-3.5-lightning-free';
export const UML_AI_PROVIDER = 'Vercel AI Gateway';
export const UML_AI_TIMEOUT_MS = 60_000;
export const UML_MAX_REQUEST_BYTES = 512 * 1024;
export const UML_AI_MAX_CODE_POINTS = 40_000;
export const UML_AI_MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

export const umlPrivateHeaders: Record<string, string> = {
	'cache-control': 'private, no-cache, no-store, must-revalidate, max-age=0',
	pragma: 'no-cache',
	expires: '0',
	'x-robots-tag': 'noindex, nofollow, noarchive'
};

export interface UmlServerConfig {
	enabled: boolean;
	model: string;
	credentialAvailable: boolean;
	salt: string;
	supabaseUrl: string;
	supabaseKey: string;
	ownerConfigured: boolean;
}

export function getUmlServerConfig(env: Record<string, string | undefined>): UmlServerConfig {
	let credentialAvailable = Boolean(env.AI_GATEWAY_API_KEY || env.VERCEL_OIDC_TOKEN);
	if (!credentialAvailable) {
		try {
			credentialAvailable = Boolean(getVercelOidcTokenSync());
		} catch {
			// Outside Vercel request context, OIDC token is unavailable.
		}
	}

	const rawEnabled = env.UML_AI_ENABLED;
	const rawModel = env.UML_AI_MODEL?.trim() || DEFAULT_UML_AI_MODEL;
	const rawSalt = env.UML_RATE_LIMIT_SALT || env.PROMPT_ATLAS_RATE_LIMIT_SALT || '';

	return {
		enabled: rawEnabled === 'true',
		model: rawModel,
		credentialAvailable,
		salt: rawSalt,
		supabaseUrl: env.SUPABASE_URL ?? '',
		supabaseKey: env.SUPABASE_SERVICE_ROLE_KEY ?? '',
		ownerConfigured: Boolean(env.SUPABASE_PUBLISHABLE_KEY && env.NOTES_OWNER_USER_ID)
	};
}

export function getUmlAiAvailability(config: UmlServerConfig): UmlAiAvailability {
	const configurationSteps = [
		'Set UML_AI_ENABLED="true" in your .env or deployment environment.',
		`Optionally set UML_AI_MODEL="${config.model}" (defaults to "${DEFAULT_UML_AI_MODEL}").`,
		'Provide AI_GATEWAY_API_KEY (or deploy on Vercel with OIDC enabled for @ai-sdk/gateway).',
		'Set UML_RATE_LIMIT_SALT (or PROMPT_ATLAS_RATE_LIMIT_SALT) to a random string of at least 32 characters.',
		'Configure SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY and NOTES_OWNER_USER_ID; sign in as the configured owner at /notes/sign-in.',
		'Apply 202610250001_prompt_atlas_usage.sql. UML and Prompt Atlas share its 50-request UTC daily pool; UML also allows at most 5 owner requests per UTC hour. Configure a provider spending cap for paid models.'
	];

	if (!config.enabled) {
		return {
			available: false,
			provider: UML_AI_PROVIDER,
			model: config.model,
			reason:
				'AI provider generation is disabled (UML_AI_ENABLED is not set to "true"). Local heuristic generation, manual editing, and SVG/PNG rendering are active.',
			configurationSteps
		};
	}

	if (
		!config.ownerConfigured ||
		!config.supabaseUrl ||
		!config.supabaseKey ||
		config.salt.length < 32
	) {
		return {
			available: false,
			provider: UML_AI_PROVIDER,
			model: config.model,
			reason:
				'Owner authorization and shared AI usage limits must be configured before AI generation can be enabled.',
			configurationSteps
		};
	}

	if (!config.credentialAvailable) {
		return {
			available: false,
			provider: UML_AI_PROVIDER,
			model: config.model,
			reason:
				'AI Gateway credentials (AI_GATEWAY_API_KEY or VERCEL_OIDC_TOKEN) are not configured in this environment. Local heuristic generation, manual editing, and browser rendering remain available.',
			configurationSteps
		};
	}

	return {
		available: true,
		provider: UML_AI_PROVIDER,
		model: config.model,
		reason: `AI provider (${UML_AI_PROVIDER} · ${config.model}) is configured and ready.`,
		configurationSteps
	};
}
