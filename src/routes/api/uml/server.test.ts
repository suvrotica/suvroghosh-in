import { describe, expect, it, vi } from 'vitest';
import { createUmlApiHandlers } from '$lib/server/uml/service';
import { getUmlServerConfig, type UmlServerConfig } from '$lib/server/uml/config';
import { UmlServiceFailure } from '$lib/server/uml/failure';
import type { UmlAiDependencies } from '$lib/server/uml/gateway';
import { generateUmlDiagramsFromText } from '$lib/visualizations/post-to-uml/generator';
import { load as vizUmlLoad } from '../../viz/uml/+page.server';

const oidc = vi.hoisted(() => ({ token: vi.fn(() => 'fixture-discovered-token') }));
vi.mock('@vercel/oidc', () => ({ getVercelOidcTokenSync: oidc.token }));

// The route consumes the canonical registry; isolate its metadata from unrelated
// visualization components while still exercising the real bundled raw source loader.
vi.mock('$lib/server/content/posts', () => ({
	getPublishedPosts: () => [
		{
			slug: 'prompt-atlas',
			title: 'Prompt Atlas',
			categoryLabel: 'Visualizations',
			date: '2026-10-25',
			description: 'Inspect a prompt.'
		}
	]
}));

const enabled: UmlServerConfig = {
	enabled: true,
	preview: false,
	model: 'test/model',
	credentialAvailable: true,
	salt: '0123456789abcdef0123456789abcdef',
	supabaseUrl: 'https://test.supabase.co',
	supabaseKey: 'test-service-key',
	ownerConfigured: true
};
const payload = {
	text: 'The ClinicTablet sends an EncounterBundle to the OpenHIMMediator.',
	mode: 'selected',
	selectedTypes: ['class'],
	detailLevel: 'simple',
	allowAssumptions: false,
	engine: 'ai',
	consent: true
};
function event(body: unknown = payload, overrides: RequestInit = {}) {
	return {
		request: new Request('https://suvroghosh.in/api/uml', {
			method: 'POST',
			headers: { origin: 'https://suvroghosh.in', 'content-type': 'application/json' },
			body: JSON.stringify(body),
			...overrides
		}),
		url: new URL('https://suvroghosh.in/api/uml'),
		getClientAddress: () => '127.0.0.1'
	};
}
function setup(
	options: {
		config?: Partial<UmlServerConfig>;
		authorize?: () => Promise<string>;
		deps?: Partial<UmlAiDependencies>;
	} = {}
) {
	const reserve = vi.fn(async () => ({ allowed: true, retryAfterSeconds: 0 }));
	const generate = vi.fn<UmlAiDependencies['generate']>(async (req) =>
		generateUmlDiagramsFromText(req, 'ai', 'Mock provider')
	);
	const deps = { reserve, generate, ...options.deps };
	const handlers = createUmlApiHandlers(
		() => ({ ...enabled, ...options.config }),
		() => deps,
		options.authorize ?? (async () => 'configured-owner')
	);
	return { handlers, reserve, generate };
}

describe('/api/uml containment and owner authorization', () => {
	it.each([
		{ PROMPT_ATLAS_AI_ENABLED: 'true', AI_GATEWAY_API_KEY: 'fixture-key' },
		{
			UML_AI_ENABLED: 'false',
			PROMPT_ATLAS_AI_ENABLED: 'true',
			VERCEL_OIDC_TOKEN: 'fixture-token'
		},
		{ VERCEL_ENV: 'preview', UML_AI_ENABLED: 'true' },
		{ VERCEL_ENV: 'preview', UML_AI_ENABLED: 'true', AI_GATEWAY_API_KEY: 'fixture-key' },
		{ VERCEL_ENV: 'preview', UML_AI_ENABLED: 'true', VERCEL_OIDC_TOKEN: 'fixture-token' }
	])(
		'keeps local generation available while refusing unauthorized provider activation (%j)',
		async (env) => {
			oidc.token.mockClear();
			// Complete owner/quota settings ensure missing configuration cannot mask an enablement bug.
			const config = getUmlServerConfig({
				SUPABASE_URL: enabled.supabaseUrl,
				SUPABASE_SERVICE_ROLE_KEY: enabled.supabaseKey,
				SUPABASE_PUBLISHABLE_KEY: 'fixture-publishable-key',
				NOTES_OWNER_USER_ID: 'configured-owner',
				UML_RATE_LIMIT_SALT: enabled.salt,
				...env
			});
			expect(config.ownerConfigured).toBe(true);
			const { reserve, generate } = setup();
			const dependencies = vi.fn(() => ({ reserve, generate }));
			const authorize = vi.fn(async () => 'configured-owner');
			const handlers = createUmlApiHandlers(() => config, dependencies, authorize);
			const status = await handlers.GET(event(undefined, { method: 'GET', body: undefined }));
			expect(status.status).toBe(200);
			expect(status.headers.get('cache-control')).toContain('no-store');
			const availability = (await status.json()).ai;
			expect(availability.available).toBe(false);
			if (config.preview) {
				expect(availability.reason).toMatch(/preview/i);
				expect(availability.configurationSteps).toEqual([]);
			}
			for (const engine of ['ai', 'local']) {
				const response = await handlers.POST(event({ ...payload, engine }));
				expect(response.status).toBe(engine === 'ai' ? 503 : 200);
				expect(response.headers.get('cache-control')).toContain('no-store');
				const body = await response.json();
				if (engine === 'ai') expect(body.code).toBe('ai_not_configured');
				else {
					expect(body.result.engine).toBe('local');
					expect(body.result.diagrams).toHaveLength(1);
				}
			}
			expect(oidc.token).not.toHaveBeenCalled();
			expect(authorize).not.toHaveBeenCalled();
			expect(dependencies).not.toHaveBeenCalled();
			expect(reserve).not.toHaveBeenCalled();
			expect(generate).not.toHaveBeenCalled();
		}
	);

	it('keeps status and published post loading public with private headers', async () => {
		const { handlers } = setup({
			authorize: async () => {
				throw new UmlServiceFailure('sign_in_required', 'Sign in', 401);
			}
		});
		const status = await handlers.GET(event(undefined, { method: 'GET', body: undefined }));
		expect(status.status).toBe(200);
		expect(status.headers.get('cache-control')).toContain('no-store');
		const data = await status.json();
		expect(data.ai.available).toBe(false);
		expect(data.ai.reason).toContain('Sign in');
		expect(data.posts.length).toBeGreaterThan(0);
		const postEvent = event(undefined, { method: 'GET', body: undefined });
		postEvent.url.search = '?post=prompt-atlas';
		const post = await handlers.GET(postEvent);
		expect(post.status).toBe(200);
		expect((await post.json()).post.slug).toBe('prompt-atlas');
	});

	it('fails closed without an authorization dependency even when provider config exists', async () => {
		const { reserve, generate } = setup();
		const handlers = createUmlApiHandlers(
			() => enabled,
			() => ({ reserve, generate })
		);
		const response = await handlers.POST(event());
		expect(response.status).toBe(401);
		expect(reserve).not.toHaveBeenCalled();
		expect(generate).not.toHaveBeenCalled();
	});

	it('rejects a non-owner before quota or provider use', async () => {
		const { handlers, reserve, generate } = setup({
			authorize: async () => {
				throw new UmlServiceFailure('forbidden', 'Owner only', 403);
			}
		});
		expect((await handlers.POST(event())).status).toBe(403);
		expect(reserve).not.toHaveBeenCalled();
		expect(generate).not.toHaveBeenCalled();
	});

	it.each([
		[{ origin: 'https://evil.example', 'content-type': 'application/json' }, 403],
		[{ origin: 'https://suvroghosh.in', 'content-type': 'application/json-malicious' }, 415]
	])('rejects invalid origin or media type', async (headers, status) => {
		const { handlers, generate } = setup();
		expect((await handlers.POST(event(payload, { headers }))).status).toBe(status);
		expect(generate).not.toHaveBeenCalled();
	});

	it('enforces streamed body limits without Content-Length', async () => {
		const { handlers, generate } = setup();
		const body = new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(new Uint8Array(512 * 1024 + 1));
				controller.close();
			}
		});
		const response = await handlers.POST(event(payload, { body, duplex: 'half' } as RequestInit));
		expect(response.status).toBe(413);
		expect(generate).not.toHaveBeenCalled();
	});

	it('rejects empty selections and unauthorized payload fields', async () => {
		const { handlers } = setup();
		expect((await handlers.POST(event({ ...payload, selectedTypes: [] }))).status).toBe(400);
		expect((await handlers.POST(event({ ...payload, ownerId: 'configured-owner' }))).status).toBe(
			400
		);
	});

	it('does not silently truncate oversized AI input', async () => {
		const { handlers, reserve, generate } = setup();
		const response = await handlers.POST(event({ ...payload, text: 'a'.repeat(40_001) }));
		expect(response.status).toBe(413);
		expect((await response.json()).code).toBe('ai_input_too_large');
		expect(reserve).not.toHaveBeenCalled();
		expect(generate).not.toHaveBeenCalled();
	});

	it('requires explicit AI consent', async () => {
		const { handlers, generate } = setup();
		expect((await handlers.POST(event({ ...payload, consent: false }))).status).toBe(400);
		expect(generate).not.toHaveBeenCalled();
	});

	it('returns configuration instructions when AI is unavailable', async () => {
		const { handlers, generate } = setup({ config: { enabled: false } });
		const response = await handlers.POST(event());
		expect(response.status).toBe(503);
		expect((await response.json()).configurationSteps.length).toBeGreaterThan(0);
		expect(generate).not.toHaveBeenCalled();
	});

	it('reserves shared quota under the authenticated owner before generating', async () => {
		const { handlers, reserve, generate } = setup();
		const response = await handlers.POST(event());
		expect(response.status).toBe(200);
		expect(reserve).toHaveBeenCalledWith('configured-owner', expect.any(AbortSignal));
		expect(reserve.mock.invocationCallOrder[0]).toBeLessThan(generate.mock.invocationCallOrder[0]);
		expect((await response.json()).result.modelLabel).toBe('Mock provider');
	});

	it('does not call the provider when shared quota is denied or unavailable', async () => {
		const denied = setup({
			deps: { reserve: async () => ({ allowed: false, retryAfterSeconds: 60 }) }
		});
		const response = await denied.handlers.POST(event());
		expect(response.status).toBe(429);
		expect(response.headers.get('retry-after')).toBe('60');
		expect(denied.generate).not.toHaveBeenCalled();
		const failed = setup({
			deps: {
				reserve: async () => {
					throw new UmlServiceFailure('quota_unavailable', 'Unavailable');
				}
			}
		});
		expect((await failed.handlers.POST(event())).status).toBe(503);
		expect(failed.generate).not.toHaveBeenCalled();
	});

	it('discards late provider completion after cancellation', async () => {
		const controller = new AbortController();
		const { handlers } = setup({
			deps: {
				generate: async (req, signal) => {
					controller.abort();
					expect(signal.aborted).toBe(true);
					return generateUmlDiagramsFromText(req, 'ai', 'Late provider');
				}
			}
		});
		expect((await handlers.POST(event(payload, { signal: controller.signal }))).status).toBe(499);
	});

	it('leaves local mode available without owner auth or provider configuration', async () => {
		const { handlers, reserve, generate } = setup({
			config: { enabled: false },
			authorize: async () => {
				throw new Error('Should not authenticate');
			}
		});
		const response = await handlers.POST(event({ ...payload, engine: 'local' }));
		expect(response.status).toBe(200);
		expect((await response.json()).result.engine).toBe('local');
		expect(reserve).not.toHaveBeenCalled();
		expect(generate).not.toHaveBeenCalled();
	});

	it('preserves the canonical /viz/uml redirect', () => {
		expect(() => vizUmlLoad({} as never)).toThrow();
		try {
			vizUmlLoad({} as never);
		} catch (cause) {
			expect(cause).toMatchObject({ status: 308, location: '/blog/visualizations/post-to-uml' });
		}
	});
});
