import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateText } from 'ai';
import { createBoundedUmlFetch, createUmlAiDependencies } from './gateway';
import type { UmlServerConfig } from './config';
import type { UmlGenerationRequest } from '$lib/visualizations/post-to-uml/types';

vi.mock('ai', async (original) => ({
	...(await original<typeof import('ai')>()),
	generateText: vi.fn()
}));

const config: UmlServerConfig = {
	enabled: true,
	preview: false,
	model: 'test/model',
	credentialAvailable: true,
	ownerConfigured: true,
	salt: '0123456789abcdef0123456789abcdef',
	supabaseUrl: 'https://test.supabase.co',
	supabaseKey: 'test-key'
};
const request: UmlGenerationRequest = {
	text: 'The Client sends a request to the Server.',
	mode: 'recommended',
	detailLevel: 'simple',
	allowAssumptions: false
};
const output = {
	recommendedTypes: [],
	recommendationRationale: 'No useful view is supported by this input.',
	diagrams: []
};

describe('bounded AI Gateway adapter (mock provider)', () => {
	beforeEach(() => {
		vi.mocked(generateText).mockReset();
		vi.mocked(generateText).mockResolvedValue({ finishReason: 'stop', output } as never);
	});

	it('sends the complete article and every evidence paragraph, including those after forty', async () => {
		const text = Array.from(
			{ length: 65 },
			(_, index) => `Paragraph ${index + 1}: Client sends a request to Server.`
		).join('\n\n');
		await createUmlAiDependencies(config).generate(
			{ ...request, text },
			new AbortController().signal
		);
		const options = vi.mocked(generateText).mock.calls[0][0];
		const prompt = JSON.parse(String(options.prompt));
		expect(prompt.originalArticle).toBe(text);
		expect(prompt.articleParagraphs).toHaveLength(65);
		expect(prompt.articleParagraphs[64].text).toContain('Paragraph 65');
		expect(options.maxRetries).toBe(0);
	});

	it('bounds output tokens and requests all fourteen types in All-14 mode', async () => {
		const result = await createUmlAiDependencies(config).generate(
			{ ...request, mode: 'all14' },
			new AbortController().signal
		);
		const options = vi.mocked(generateText).mock.calls[0][0];
		expect(options.maxOutputTokens).toBe(16_000);
		expect(JSON.parse(String(options.prompt)).targetTypes).toHaveLength(14);
		expect(result.diagrams).toHaveLength(14);
		expect(result.diagrams.every((diagram) => diagram.generationStatus === 'failed')).toBe(true);
	});

	it('rejects oversized input and already cancelled calls before model use', async () => {
		const deps = createUmlAiDependencies(config);
		await expect(
			deps.generate({ ...request, text: 'a'.repeat(40_001) }, new AbortController().signal)
		).rejects.toMatchObject({ code: 'ai_input_too_large' });
		const controller = new AbortController();
		controller.abort();
		await expect(deps.generate(request, controller.signal)).rejects.toMatchObject({
			name: 'AbortError'
		});
		expect(generateText).not.toHaveBeenCalled();
	});

	it('rejects incomplete output instead of presenting it as a complete result', async () => {
		vi.mocked(generateText).mockResolvedValue({ finishReason: 'length', output } as never);
		await expect(
			createUmlAiDependencies(config).generate(request, new AbortController().signal)
		).rejects.toMatchObject({ code: 'incomplete_ai_response' });
	});

	it('limits all provider response bodies, including errors without Content-Length', async () => {
		const fetcher = createBoundedUmlFetch(
			new AbortController().signal,
			async () => new Response(new Uint8Array(2 * 1024 * 1024 + 1), { status: 500 })
		);
		await expect(fetcher('https://provider.example')).rejects.toMatchObject({ kind: 'too-large' });
	});

	it('passes abort signals and refuses provider redirects', async () => {
		const controller = new AbortController();
		const fetcher = vi.fn<typeof fetch>(async () => new Response('{}'));
		await createBoundedUmlFetch(controller.signal, fetcher)('https://provider.example');
		expect(fetcher.mock.calls[0][1]?.redirect).toBe('error');
		controller.abort();
		expect(fetcher.mock.calls[0][1]?.signal?.aborted).toBe(true);
	});
});
