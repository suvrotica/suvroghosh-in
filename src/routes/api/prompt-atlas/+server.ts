import { env } from '$env/dynamic/private';
import { semanticConfig } from '$lib/server/prompt-atlas/config';
import { createSemanticDependencies } from '$lib/server/prompt-atlas/gateway';
import { createSemanticHandlers } from '$lib/server/prompt-atlas/service';

export const prerender = false;
export const config = { maxDuration: 70 };

const handlers = createSemanticHandlers(
	() => semanticConfig(env),
	() => createSemanticDependencies(semanticConfig(env), env.AI_GATEWAY_API_KEY)
);
export const GET = handlers.GET;
export const POST = handlers.POST;
