import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getUmlAiAvailability, getUmlServerConfig } from './config';

const oidc = vi.hoisted(() => ({ token: vi.fn() }));
vi.mock('@vercel/oidc', () => ({ getVercelOidcTokenSync: oidc.token }));

const ownerEnvironment = {
	SUPABASE_URL: 'https://test.supabase.co',
	SUPABASE_PUBLISHABLE_KEY: 'fixture-publishable-key',
	SUPABASE_SERVICE_ROLE_KEY: 'fixture-service-key',
	NOTES_OWNER_USER_ID: 'fixture-owner',
	UML_RATE_LIMIT_SALT: '0123456789abcdef0123456789abcdef'
};

describe('UML provider activation', () => {
	beforeEach(() => {
		oidc.token.mockReset();
	});

	it.each([
		{},
		{ PROMPT_ATLAS_AI_ENABLED: 'true', AI_GATEWAY_API_KEY: 'fixture-key' },
		{ UML_AI_ENABLED: 'false', PROMPT_ATLAS_AI_ENABLED: 'true', VERCEL_OIDC_TOKEN: 'fixture-token' }
	])('requires the dedicated opt-in before discovering credentials (%j)', (env) => {
		oidc.token.mockReturnValue('fixture-token');
		const config = getUmlServerConfig({ ...ownerEnvironment, ...env });
		expect(config.enabled).toBe(false);
		expect(config.credentialAvailable).toBe(false);
		expect(getUmlAiAvailability(config).available).toBe(false);
		expect(oidc.token).not.toHaveBeenCalled();
	});

	it.each([{}, { AI_GATEWAY_API_KEY: 'fixture-key' }, { VERCEL_OIDC_TOKEN: 'fixture-token' }])(
		'rejects preview opt-in before any credential discovery (%j)',
		(credentials) => {
			oidc.token.mockReturnValue('fixture-token');
			const config = getUmlServerConfig({
				...ownerEnvironment,
				...credentials,
				VERCEL_ENV: 'preview',
				UML_AI_ENABLED: 'true'
			});
			expect(config.enabled).toBe(false);
			expect(config.credentialAvailable).toBe(false);
			expect(oidc.token).not.toHaveBeenCalled();
			const availability = getUmlAiAvailability(config);
			expect(availability.available).toBe(false);
			expect(availability.reason).toMatch(/preview/i);
			expect(availability.configurationSteps).toEqual([]);
		}
	);

	it('preserves explicit production opt-in with an API key', () => {
		const config = getUmlServerConfig({
			...ownerEnvironment,
			VERCEL_ENV: 'production',
			UML_AI_ENABLED: 'true',
			AI_GATEWAY_API_KEY: 'fixture-key'
		});
		expect(getUmlAiAvailability(config).available).toBe(true);
		expect(oidc.token).not.toHaveBeenCalled();
	});

	it('discovers OIDC only for an explicitly enabled non-preview environment', () => {
		oidc.token.mockReturnValue('fixture-token');
		const config = getUmlServerConfig({ ...ownerEnvironment, UML_AI_ENABLED: 'true' });
		expect(getUmlAiAvailability(config).available).toBe(true);
		expect(oidc.token).toHaveBeenCalledTimes(1);
	});

	it('keeps explicitly enabled AI unavailable when credential discovery fails', () => {
		oidc.token.mockImplementation(() => {
			throw new Error('No OIDC context');
		});
		const availability = getUmlAiAvailability(
			getUmlServerConfig({ ...ownerEnvironment, UML_AI_ENABLED: 'true' })
		);
		expect(availability.available).toBe(false);
		expect(availability.reason).toContain('credentials');
	});
});
