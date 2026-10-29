import { env } from '$env/dynamic/private';
import { semanticConfig } from '$lib/server/prompt-atlas/config';
import { createStudioDependencies } from '$lib/server/mindmap-studio/gateway';
import { createStudioHandlers } from '$lib/server/mindmap-studio/service';

export const prerender = false;
export const config = { maxDuration: 70 };
const handlers = createStudioHandlers(
	() => semanticConfig(env),
	() => createStudioDependencies(semanticConfig(env), env.AI_GATEWAY_API_KEY)
);
export const GET = handlers.GET;
export const POST = handlers.POST;
