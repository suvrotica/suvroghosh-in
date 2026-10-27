import { describe, expect, it } from 'vitest';
import { getUmlServerConfig } from '$lib/server/uml/config';
import { createUmlApiHandlers } from '$lib/server/uml/service';
import { generateUmlDiagramsFromText } from '$lib/visualizations/post-to-uml/generator';
import { load as vizUmlLoad } from '../../viz/uml/+page.server';

describe('/api/uml server endpoint & /viz/uml route', () => {
	it('returns AI configuration status and indexed blog posts on GET /api/uml', async () => {
		const handlers = createUmlApiHandlers(
			() => getUmlServerConfig({ UML_AI_ENABLED: 'false' }),
			() => ({
				async generate(req) {
					return generateUmlDiagramsFromText(req, 'ai', 'Mock AI Model');
				}
			})
		);

		const res = await handlers.GET({
			request: new Request('https://suvroghosh.in/api/uml'),
			url: new URL('https://suvroghosh.in/api/uml'),
			getClientAddress: () => '127.0.0.1'
		});

		expect(res.status).toBe(200);
		expect(res.headers.get('cache-control')).toContain('no-store');
		const data = (await res.json()) as {
			ai: { available: boolean; configurationSteps: string[] };
			posts: { slug: string; title: string }[];
		};
		expect(data.ai.available).toBe(false);
		expect(data.ai.configurationSteps.length).toBeGreaterThanOrEqual(3);
		expect(Array.isArray(data.posts)).toBe(true);
		expect(data.posts.length).toBeGreaterThan(0);
	});

	it('loads a published blog post markdown by slug on GET /api/uml?post=<slug>', async () => {
		const handlers = createUmlApiHandlers(
			() => getUmlServerConfig({}),
			() => ({
				async generate(req) {
					return generateUmlDiagramsFromText(req, 'ai', 'Mock AI Model');
				}
			})
		);

		const res = await handlers.GET({
			request: new Request('https://suvroghosh.in/api/uml?post=prompt-atlas'),
			url: new URL('https://suvroghosh.in/api/uml?post=prompt-atlas'),
			getClientAddress: () => '127.0.0.1'
		});

		expect(res.status).toBe(200);
		const data = (await res.json()) as { post: { slug: string; title: string; markdown: string } };
		expect(data.post.slug).toBe('prompt-atlas');
		expect(data.post.markdown.length).toBeGreaterThan(50);
		expect(data.post.markdown).not.toContain('---');
	});

	it('rejects cross-origin POST requests with 403', async () => {
		const handlers = createUmlApiHandlers(
			() => getUmlServerConfig({}),
			() => ({
				async generate(req) {
					return generateUmlDiagramsFromText(req, 'ai', 'Mock AI Model');
				}
			})
		);

		const res = await handlers.POST({
			request: new Request('https://suvroghosh.in/api/uml', {
				method: 'POST',
				headers: {
					origin: 'https://evil.example.com',
					'content-type': 'application/json'
				},
				body: JSON.stringify({ text: 'Sample article text' })
			}),
			url: new URL('https://suvroghosh.in/api/uml'),
			getClientAddress: () => '127.0.0.1'
		});

		expect(res.status).toBe(403);
	});

	it('generates deterministic local UML diagrams on POST /api/uml with engine="local"', async () => {
		const handlers = createUmlApiHandlers(
			() => getUmlServerConfig({}),
			() => ({
				async generate(req) {
					return generateUmlDiagramsFromText(req, 'ai', 'Mock AI Model');
				}
			})
		);

		const res = await handlers.POST({
			request: new Request('https://suvroghosh.in/api/uml', {
				method: 'POST',
				headers: {
					origin: 'https://suvroghosh.in',
					'content-type': 'application/json'
				},
				body: JSON.stringify({
					text: 'The ClinicTablet sends an EncounterBundle to the OpenHIMMediator within 5 seconds.',
					title: 'Clinic Exchange',
					mode: 'selected',
					selectedTypes: ['class', 'sequence', 'timing'],
					detailLevel: 'simple',
					allowAssumptions: false,
					engine: 'local'
				})
			}),
			url: new URL('https://suvroghosh.in/api/uml'),
			getClientAddress: () => '127.0.0.1'
		});

		expect(res.status).toBe(200);
		const payload = (await res.json()) as {
			result: { diagrams: { type: string; renderStatus: string; svg?: string }[] };
		};
		expect(payload.result.diagrams).toHaveLength(3);
		for (const d of payload.result.diagrams) {
			expect(d.renderStatus).toBe('rendered');
			expect(d.svg).toContain('<svg');
		}
	});

	it('returns 503 with explicit configuration steps when engine="ai" is requested without AI credentials', async () => {
		const handlers = createUmlApiHandlers(
			() => getUmlServerConfig({ UML_AI_ENABLED: 'false' }),
			() => ({
				async generate(req) {
					return generateUmlDiagramsFromText(req, 'ai', 'Mock AI Model');
				}
			})
		);

		const res = await handlers.POST({
			request: new Request('https://suvroghosh.in/api/uml', {
				method: 'POST',
				headers: {
					origin: 'https://suvroghosh.in',
					'content-type': 'application/json'
				},
				body: JSON.stringify({
					text: 'The ClinicTablet sends an EncounterBundle to the OpenHIMMediator.',
					mode: 'recommended',
					detailLevel: 'simple',
					allowAssumptions: false,
					engine: 'ai',
					consent: true
				})
			}),
			url: new URL('https://suvroghosh.in/api/uml'),
			getClientAddress: () => '127.0.0.1'
		});

		expect(res.status).toBe(503);
		const body = (await res.json()) as { code: string; configurationSteps: string[] };
		expect(body.code).toBe('ai_not_configured');
		expect(body.configurationSteps.length).toBeGreaterThan(0);
	});

	it('delegates to mocked AI provider when engine="ai" and credentials + consent are present', async () => {
		const handlers = createUmlApiHandlers(
			() =>
				getUmlServerConfig({
					UML_AI_ENABLED: 'true',
					AI_GATEWAY_API_KEY: 'test-key-not-real',
					UML_RATE_LIMIT_SALT: '0123456789abcdef0123456789abcdef'
				}),
			() => ({
				async generate(req) {
					return generateUmlDiagramsFromText(req, 'ai', 'Mocked AI Gateway');
				}
			})
		);

		const res = await handlers.POST({
			request: new Request('https://suvroghosh.in/api/uml', {
				method: 'POST',
				headers: {
					origin: 'https://suvroghosh.in',
					'content-type': 'application/json'
				},
				body: JSON.stringify({
					text: 'The Physician submits a PriorAuthorizationRequest to the PayerReviewBoundary.',
					mode: 'recommended',
					detailLevel: 'simple',
					allowAssumptions: false,
					engine: 'ai',
					consent: true
				})
			}),
			url: new URL('https://suvroghosh.in/api/uml'),
			getClientAddress: () => '127.0.0.1'
		});

		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			result: { modelLabel: string; diagrams: { provenance: string }[] };
		};
		expect(body.result.modelLabel).toBe('Mocked AI Gateway');
		expect(body.result.diagrams[0].provenance).toBe('ai');
	});

	it('redirects /viz/uml to /blog/visualizations/post-to-uml', () => {
		expect(() => vizUmlLoad({} as never)).toThrow();
		try {
			vizUmlLoad({} as never);
		} catch (redirectErr) {
			const r = redirectErr as { status: number; location: string };
			expect(r.status).toBe(308);
			expect(r.location).toBe('/blog/visualizations/post-to-uml');
		}
	});
});
