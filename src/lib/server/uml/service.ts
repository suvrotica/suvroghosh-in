import { z } from 'zod';
import { BodyReadError, readBoundedBody, withDeadline } from '$lib/server/http/body';
import { createLocalAdmission } from '$lib/server/http/local-admission';
import { MAX_INPUT_CODE_POINTS } from '$lib/visualizations/post-to-uml/extractor';
import { generateUmlDiagramsFromText } from '$lib/visualizations/post-to-uml/generator';
import { ALL_UML_DIAGRAM_TYPES } from '$lib/visualizations/post-to-uml/types';
import {
	getUmlAiAvailability,
	UML_AI_TIMEOUT_MS,
	UML_MAX_REQUEST_BYTES,
	umlPrivateHeaders,
	type UmlServerConfig
} from './config';
import { UmlServiceFailure, type UmlAiDependencies } from './gateway';
import { listLoadableBlogPosts, loadPublishedBlogPostMarkdown } from './posts';

type RouteEvent = {
	request: Request;
	url: URL;
	getClientAddress(): string;
};

const requestSchema = z.strictObject({
	text: z
		.string()
		.min(1)
		.refine((val) => Boolean(val.trim()) && Array.from(val).length <= MAX_INPUT_CODE_POINTS),
	title: z.string().max(180).optional(),
	mode: z.enum(['recommended', 'selected', 'all14']).default('recommended'),
	selectedTypes: z.array(z.enum(ALL_UML_DIAGRAM_TYPES)).max(14).optional(),
	detailLevel: z.enum(['simple', 'detailed']).default('simple'),
	allowAssumptions: z.boolean().default(false),
	engine: z.enum(['local', 'ai']).default('local'),
	postSlug: z.string().max(100).optional(),
	consent: z.boolean().optional()
});

function jsonResponse(body: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
	return new Response(JSON.stringify(body), {
		status,
		headers: {
			...umlPrivateHeaders,
			'content-type': 'application/json; charset=utf-8',
			...extraHeaders
		}
	});
}

function handleFailure(cause: unknown): Response {
	if (cause instanceof UmlServiceFailure) {
		return jsonResponse({ error: cause.message, code: cause.code }, cause.status);
	}
	if (cause instanceof BodyReadError) {
		if (cause.kind === 'too-large') {
			return jsonResponse(
				{
					error: 'The UML generation request exceeds the 512 KiB payload limit.',
					code: 'too_large'
				},
				413
			);
		}
		return jsonResponse(
			{
				error: 'Reading the UML request timed out or was cancelled.',
				code: 'timeout'
			},
			504
		);
	}
	return jsonResponse(
		{
			error: 'UML generation service encountered an error. Local mode remains available.',
			code: 'unavailable'
		},
		503
	);
}

export function createUmlApiHandlers(
	getConfig: () => UmlServerConfig,
	getDependencies: () => UmlAiDependencies
) {
	const postAdmit = createLocalAdmission({
		attempts: 10,
		globalAttempts: 80,
		windowMs: 60_000,
		concurrency: 4,
		perKeyConcurrency: 1,
		maxKeys: 1024
	});

	const getAdmit = createLocalAdmission({
		attempts: 30,
		globalAttempts: 240,
		windowMs: 60_000,
		concurrency: 8,
		perKeyConcurrency: 2,
		maxKeys: 1024
	});

	return {
		async GET(event: RouteEvent): Promise<Response> {
			let clientAddress: string;
			try {
				clientAddress = event.getClientAddress();
			} catch {
				clientAddress = 'local';
			}

			const guard = getAdmit(clientAddress);
			if (!guard.allowed) {
				return jsonResponse(
					{
						error: 'Too many status or post-load requests. Please wait briefly.',
						code: 'rate_limited'
					},
					429,
					{ 'retry-after': String(guard.retryAfterSeconds) }
				);
			}

			try {
				const requestedSlug = event.url.searchParams.get('post')?.trim();
				if (requestedSlug) {
					const loaded = await loadPublishedBlogPostMarkdown(requestedSlug);
					if (!loaded) {
						return jsonResponse(
							{ error: `Published blog post "${requestedSlug}" was not found.`, code: 'not_found' },
							404
						);
					}
					return jsonResponse({ post: loaded });
				}

				const cfg = getConfig();
				return jsonResponse({
					ai: getUmlAiAvailability(cfg),
					posts: listLoadableBlogPosts(60)
				});
			} finally {
				guard.release();
			}
		},

		async POST(event: RouteEvent): Promise<Response> {
			if (event.request.headers.get('origin') !== event.url.origin) {
				return jsonResponse(
					{ error: 'Cross-origin requests are not allowed.', code: 'forbidden' },
					403
				);
			}

			const contentType = event.request.headers.get('content-type') ?? '';
			if (!contentType.toLowerCase().includes('application/json')) {
				return jsonResponse(
					{ error: 'Expected application/json request body.', code: 'unsupported_media_type' },
					415
				);
			}

			let clientAddress: string;
			try {
				clientAddress = event.getClientAddress();
			} catch {
				clientAddress = 'local';
			}

			const guard = postAdmit(clientAddress);
			if (!guard.allowed) {
				return jsonResponse(
					{
						error: 'Too many UML generation requests. Please wait a moment and try again.',
						code: 'rate_limited'
					},
					429,
					{ 'retry-after': String(guard.retryAfterSeconds) }
				);
			}

			try {
				return await withDeadline(async (deadlineSignal) => {
					const combinedSignal = AbortSignal.any([event.request.signal, deadlineSignal]);
					const bodyBytes = await readBoundedBody(
						event.request,
						UML_MAX_REQUEST_BYTES,
						8_000,
						combinedSignal
					);

					let rawJson: unknown;
					try {
						rawJson = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bodyBytes));
					} catch {
						return jsonResponse(
							{ error: 'Invalid JSON request body.', code: 'invalid_input' },
							400
						);
					}

					const parsedInput = requestSchema.safeParse(rawJson);
					if (!parsedInput.success) {
						return jsonResponse(
							{
								error:
									'Provide non-empty article text (up to 120,000 characters) and valid UML options.',
								code: 'invalid_input'
							},
							400
						);
					}

					const req = parsedInput.data;

					if (req.engine === 'local') {
						const localResult = generateUmlDiagramsFromText(
							req,
							'local',
							'Local Deterministic UML Analyzer'
						);
						return jsonResponse({ result: localResult });
					}

					// AI provider mode requested
					const cfg = getConfig();
					const availability = getUmlAiAvailability(cfg);
					if (!availability.available) {
						return jsonResponse(
							{
								error: availability.reason,
								code: 'ai_not_configured',
								configurationSteps: availability.configurationSteps
							},
							503
						);
					}

					if (req.consent !== true) {
						return jsonResponse(
							{
								error:
									'Explicit confirmation is required before sending article text to the external AI provider.',
								code: 'consent_required'
							},
							400
						);
					}

					const aiResult = await getDependencies().generate(req, combinedSignal);
					return jsonResponse({ result: aiResult });
				}, UML_AI_TIMEOUT_MS);
			} catch (err) {
				return handleFailure(err);
			} finally {
				guard.release();
			}
		}
	};
}
