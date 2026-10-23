import type { BrowserContext } from '@playwright/test';
import { CONSENT_KEY, CONSENT_LIFETIME_MS } from '../../src/lib/privacy/consent';

/** Laboratory checks exercise the canvas after the separate first-visit media choice. */
export async function usePausedMediaPreference(context: BrowserContext): Promise<void> {
	await context.addInitScript(
		({ key, lifetime }) => {
			const savedAt = Date.now();
			localStorage.setItem(
				key,
				JSON.stringify({ v: 2, media: false, savedAt, expiresAt: savedAt + lifetime })
			);
		},
		{ key: CONSENT_KEY, lifetime: CONSENT_LIFETIME_MS }
	);
}
