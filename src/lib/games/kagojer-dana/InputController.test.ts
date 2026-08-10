import { afterEach, describe, expect, it, vi } from 'vitest';

import { FlightInputController } from './InputController';

type WindowListener = EventListenerOrEventListenerObject;

function listenerRegistry() {
	const listeners = new Map<string, Set<WindowListener>>();
	const windowStub = {
		addEventListener(type: string, listener: WindowListener) {
			const bucket = listeners.get(type) ?? new Set<WindowListener>();
			bucket.add(listener);
			listeners.set(type, bucket);
		},
		removeEventListener(type: string, listener: WindowListener) {
			listeners.get(type)?.delete(listener);
		}
	};
	return { listeners, windowStub };
}

describe('FlightInputController lifecycle', () => {
	afterEach(() => vi.unstubAllGlobals());

	it('does not retain or duplicate global listeners across repeated starts', () => {
		const { listeners, windowStub } = listenerRegistry();
		vi.stubGlobal('window', windowStub);

		for (let start = 0; start < 4; start += 1) {
			const input = new FlightInputController(() => undefined);
			expect(listeners.get('keydown')?.size).toBe(1);
			expect(listeners.get('keyup')?.size).toBe(1);
			expect(listeners.get('blur')?.size).toBe(1);

			input.destroy();
			input.destroy();
			expect(listeners.get('keydown')?.size).toBe(0);
			expect(listeners.get('keyup')?.size).toBe(0);
			expect(listeners.get('blur')?.size).toBe(0);
		}
	});
});
