import { env } from '$env/dynamic/private';
import { getUmlServerConfig } from '$lib/server/uml/config';
import { createUmlAiDependencies } from '$lib/server/uml/gateway';
import { createUmlApiHandlers } from '$lib/server/uml/service';

export const prerender = false;
export const config = { maxDuration: 70 };

const handlers = createUmlApiHandlers(
	() => getUmlServerConfig(env),
	() => createUmlAiDependencies(getUmlServerConfig(env), env.AI_GATEWAY_API_KEY)
);

export const GET = handlers.GET;
export const POST = handlers.POST;
