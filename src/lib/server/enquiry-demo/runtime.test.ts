import { afterEach, describe, expect, test, vi } from 'vitest';
import { demoEnabled } from './runtime';

afterEach(() => vi.unstubAllEnvs());

describe('local-only interactive gate', () => {
	test('requires explicit enablement and a loopback address', () => {
		vi.stubEnv('ENQUIRY_DEMO_ENABLED', '');
		vi.stubEnv('VERCEL', '');
		expect(demoEnabled(new URL('http://127.0.0.1:4321/demos/customer-enquiries'))).toBe(false);
		vi.stubEnv('ENQUIRY_DEMO_ENABLED', '1');
		for (const host of ['127.0.0.1', 'localhost', '[::1]']) {
			expect(demoEnabled(new URL(`http://${host}:4321/demos/customer-enquiries`))).toBe(true);
		}
		for (const host of [
			'www.suvroghosh.in',
			'demo.example.com',
			'127.0.0.1.attacker.example',
			'192.168.1.12'
		]) {
			expect(demoEnabled(new URL(`https://${host}/demos/customer-enquiries`))).toBe(false);
		}
	});

	test('remains disabled on Vercel even with a loopback-looking request and explicit flag', () => {
		vi.stubEnv('ENQUIRY_DEMO_ENABLED', '1');
		vi.stubEnv('VERCEL', '1');
		expect(demoEnabled(new URL('http://127.0.0.1:4321/demos/customer-enquiries'))).toBe(false);
	});
});
