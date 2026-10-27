import { getVercelOidcTokenSync } from '@vercel/oidc';
import type { UmlAiAvailability } from '$lib/visualizations/post-to-uml/types';

export const DEFAULT_UML_AI_MODEL = 'nvidia/nemotron-3.5-lightning-free';
export const UML_AI_PROVIDER = 'Vercel AI Gateway';
export const UML_AI_TIMEOUT_MS = 60_000;
export const UML_MAX_REQUEST_BYTES = 512 * 1024;

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

	const rawEnabled = env.UML_AI_ENABLED ?? env.PROMPT_ATLAS_AI_ENABLED;
	const rawModel = env.UML_AI_MODEL?.trim() || DEFAULT_UML_AI_MODEL;
	const rawSalt = env.UML_RATE_LIMIT_SALT || env.PROMPT_ATLAS_RATE_LIMIT_SALT || '';

	return {
		enabled: rawEnabled === 'true',
		model: rawModel,
		credentialAvailable,
		salt: rawSalt
	};
}

export function getUmlAiAvailability(config: UmlServerConfig): UmlAiAvailability {
	const configurationSteps = [
		'Set UML_AI_ENABLED="true" in your .env or deployment environment.',
		`Optionally set UML_AI_MODEL="${config.model}" (defaults to "${DEFAULT_UML_AI_MODEL}").`,
		'Provide AI_GATEWAY_API_KEY (or deploy on Vercel with OIDC enabled for @ai-sdk/gateway).',
		'Set UML_RATE_LIMIT_SALT (or PROMPT_ATLAS_RATE_LIMIT_SALT) to a random string of at least 32 characters.'
	];

	if (!config.enabled) {
		return {
			available: false,
			provider: UML_AI_PROVIDER,
			model: config.model,
			reason:
				'AI provider generation is disabled (UML_AI_ENABLED is not set to "true"). Local deterministic text-to-UML generation, PlantUML editing, and SVG/PNG rendering are active.',
			configurationSteps
		};
	}

	if (!config.credentialAvailable) {
		return {
			available: false,
			provider: UML_AI_PROVIDER,
			model: config.model,
			reason:
				'AI Gateway credentials (AI_GATEWAY_API_KEY or VERCEL_OIDC_TOKEN) are not configured in this environment. Local deterministic text-to-UML generation and live PlantUML rendering remain available.',
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
