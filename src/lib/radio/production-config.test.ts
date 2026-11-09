import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getRadioServerConfig } from '$lib/server/radio/config';

const env = vi.hoisted(() => ({}) as Record<string, string>);
vi.mock('$env/dynamic/private', () => ({ env }));

const live = new URL('https://www.suvroghosh.in/tools/radio');
const local = new URL('http://127.0.0.1:4218/tools/radio');

describe('COMM-LINK production release boundary', () => {
	beforeEach(() => {
		for (const key of Object.keys(env)) delete env[key];
		vi.stubEnv('VERCEL', '1');
		Object.assign(env, {
			GOOGLE_OAUTH_CLIENT_ID: 'fixture.apps.googleusercontent.com',
			GOOGLE_OAUTH_CLIENT_SECRET: 'fixture-oauth',
			LIVEKIT_URL: 'wss://fixture.livekit.cloud',
			LIVEKIT_API_KEY: 'fixture-media-key',
			LIVEKIT_API_SECRET: 'fixture-media-secret',
			SUPABASE_URL: 'https://fixture.supabase.co',
			SUPABASE_SERVICE_ROLE_KEY: 'fixture-db-secret'
		});
	});

	afterEach(() => vi.unstubAllEnvs());

	it('requires a dedicated signing secret and an explicit release flag', () => {
		env.NOTES_RATE_LIMIT_SALT = 'an-unrelated-secret-that-must-not-sign-radio-cookies';
		expect(getRadioServerConfig(live)).toMatchObject({
			googleConfigured: false,
			sessionSecret: null,
			callsEnabled: false
		});
		env.COMM_LINK_SESSION_SECRET = 'a'.repeat(64);
		expect(getRadioServerConfig(live)).toMatchObject({
			googleConfigured: true,
			callsEnabled: false
		});
		env.COMM_LINK_CALLS_ENABLED = 'true';
		expect(getRadioServerConfig(live)).toMatchObject({
			callsEnabled: true,
			radioModeAvailable: false
		});
	});

	it('never grants the local transport on Vercel or accepts a lookalike media host', () => {
		env.COMM_LINK_SESSION_SECRET = 'a'.repeat(64);
		env.COMM_LINK_CALLS_ENABLED = 'true';
		env.LIVEKIT_URL = 'wss://fixture.livekit.cloud.attacker.example';
		expect(getRadioServerConfig(local)).toMatchObject({
			livekitConfigured: false,
			callsEnabled: false,
			loopbackFallbackAllowed: false
		});
		vi.stubEnv('VERCEL', '0');
		expect(getRadioServerConfig(local)).toMatchObject({
			callsEnabled: true,
			radioModeAvailable: true,
			loopbackFallbackAllowed: true
		});
		expect(getRadioServerConfig(live).callsEnabled).toBe(false);
	});
});
