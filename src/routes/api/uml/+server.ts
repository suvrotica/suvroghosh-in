import { env } from '$env/dynamic/private';
import { getUmlServerConfig } from '$lib/server/uml/config';
import { createUmlAiDependencies } from '$lib/server/uml/gateway';
import { createUmlApiHandlers } from '$lib/server/uml/service';
import { requireNotesOwner } from '$lib/server/notes/auth';
import { UmlServiceFailure } from '$lib/server/uml/failure';
import { isHttpError, type RequestEvent } from '@sveltejs/kit';

export const prerender = false;
export const config = { maxDuration: 70 };

const handlers = createUmlApiHandlers(
	() => getUmlServerConfig(env),
	() => createUmlAiDependencies(getUmlServerConfig(env), env.AI_GATEWAY_API_KEY),
	async (event: RequestEvent) => {
		try {
			return (await requireNotesOwner(event)).id;
		} catch (cause) {
			if (isHttpError(cause) && cause.status === 401) {
				throw new UmlServiceFailure(
					'sign_in_required',
					'Sign in as the site owner at /notes/sign-in to use AI generation.',
					401
				);
			}
			if (isHttpError(cause) && cause.status === 404) {
				throw new UmlServiceFailure(
					'forbidden',
					'AI generation is available only to the configured site owner.',
					403
				);
			}
			throw new UmlServiceFailure(
				'authorization_unavailable',
				'Owner authorization is unavailable. No provider request was sent.'
			);
		}
	}
);

export const GET = handlers.GET;
export const POST = handlers.POST;
