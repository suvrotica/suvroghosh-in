import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configurationReason, semanticConfig } from './config';

const contextSymbol = Symbol.for('@vercel/request-context');
let originalContext: PropertyDescriptor | undefined;

function runtimeContext(get: () => unknown) {
	Object.defineProperty(globalThis, contextSymbol, {
		configurable: true,
		value: { get }
	});
}

beforeEach(() => {
	originalContext = Object.getOwnPropertyDescriptor(globalThis, contextSymbol);
	Reflect.deleteProperty(globalThis, contextSymbol);
	vi.stubEnv('VERCEL_OIDC_TOKEN', undefined);
});

afterEach(() => {
	if (originalContext) Object.defineProperty(globalThis, contextSymbol, originalContext);
	else Reflect.deleteProperty(globalThis, contextSymbol);
	vi.unstubAllEnvs();
});

describe('semantic credential availability', () => {
	it('uses the real OIDC helper with trusted runtime context and no environment token', () => {
		runtimeContext(() => ({ headers: { 'x-vercel-oidc-token': 'test-runtime-token' } }));
		const config = semanticConfig({
			PROMPT_ATLAS_AI_ENABLED: 'true',
			PROMPT_ATLAS_RATE_LIMIT_SALT: 'test-only-salt-with-at-least-thirty-two-characters',
			SUPABASE_URL: 'https://quota.example.test',
			SUPABASE_SERVICE_ROLE_KEY: 'test-only-service-key'
		});
		expect(config.credentialAvailable).toBe(true);
		expect(configurationReason(config)).toBeNull();
		expect(JSON.stringify(config)).not.toContain('test-runtime-token');
	});

	it('fails closed when neither runtime context nor an environment credential exists', () => {
		const config = semanticConfig({ PROMPT_ATLAS_AI_ENABLED: 'true' });
		expect(config.credentialAvailable).toBe(false);
		expect(configurationReason(config)).toContain('credentials are unavailable');
	});

	it('checks current request context on every invocation instead of caching availability', () => {
		let headers: Record<string, string> = {};
		const get = vi.fn(() => ({ headers }));
		runtimeContext(get);
		expect(semanticConfig({}).credentialAvailable).toBe(false);
		headers = { 'x-vercel-oidc-token': 'test-next-request-token' };
		expect(semanticConfig({}).credentialAvailable).toBe(true);
		headers = {};
		expect(semanticConfig({}).credentialAvailable).toBe(false);
		expect(get).toHaveBeenCalledTimes(3);
	});

	it('handles a failed trusted context lookup without exposing the error', () => {
		runtimeContext(() => {
			throw new Error('test-only-private-context-error');
		});
		expect(() => semanticConfig({})).not.toThrow();
		expect(semanticConfig({}).credentialAvailable).toBe(false);
	});

	it.each(['AI_GATEWAY_API_KEY', 'VERCEL_OIDC_TOKEN'])(
		'accepts a configured %s without requiring runtime context',
		(key) => {
			const get = vi.fn(() => {
				throw new Error('runtime context is unnecessary');
			});
			runtimeContext(get);
			const config = semanticConfig({ [key]: 'test-configured-credential' });
			expect(config.credentialAvailable).toBe(true);
			expect(get).not.toHaveBeenCalled();
			expect(JSON.stringify(config)).not.toContain('test-configured-credential');
		}
	);

	it('supports the OIDC helper environment fallback', () => {
		vi.stubEnv('VERCEL_OIDC_TOKEN', 'test-process-environment-token');
		expect(semanticConfig({}).credentialAvailable).toBe(true);
	});

	it('keeps the explicit enable flag required when runtime credentials exist', () => {
		runtimeContext(() => ({ headers: { 'x-vercel-oidc-token': 'test-runtime-token' } }));
		const config = semanticConfig({});
		expect(config.credentialAvailable).toBe(true);
		expect(config.enabled).toBe(false);
		expect(configurationReason(config)).toContain('not enabled');
	});
});
