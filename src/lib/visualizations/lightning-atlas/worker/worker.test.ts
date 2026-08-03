import { describe, expect, it } from 'vitest';
import { DEFAULT_ATLAS_STATE } from '../config';
import { LightningAtlasWorkerClient } from './client';
import { LightningAtlasWorkerHandler } from './handler';

describe('Lightning Atlas worker handler', () => {
	it('generates a deterministic flash through the typed request envelope', () => {
		const handler = new LightningAtlasWorkerHandler();
		const response = handler.handle({
			id: 1,
			type: 'generate-flash',
			input: { state: DEFAULT_ATLAS_STATE, strikeIndex: 2 }
		});
		expect(response?.type).toBe('flash');
		if (response?.type === 'flash') expect(response.flash.channelHash).toMatch(/^[0-9a-f]{8}$/);
	});

	it('honours cancellation before bounded work begins', () => {
		const handler = new LightningAtlasWorkerHandler();
		expect(handler.handle({ id: 9, type: 'cancel', targetId: 3 })).toEqual({
			id: 3,
			type: 'cancelled'
		});
		expect(
			handler.handle({
				id: 3,
				type: 'analyse-batch',
				input: { state: DEFAULT_ATLAS_STATE, runs: 100 }
			})
		).toEqual({ id: 3, type: 'cancelled' });
	});

	it('yields during a batch so a worker cancel message can interrupt it', async () => {
		const handler = new LightningAtlasWorkerHandler();
		const pending = handler.handleAsync({
			id: 17,
			type: 'analyse-batch',
			input: { state: DEFAULT_ATLAS_STATE, runs: 100 }
		});
		await new Promise<void>((resolve) => setTimeout(resolve, 0));
		handler.cancel(17);
		await expect(pending).resolves.toEqual({ id: 17, type: 'cancelled' });
	});

	it('rejects and stops tracked fallback work on cancellation or disposal', async () => {
		const cancelledClient = new LightningAtlasWorkerClient(null);
		const cancelled = cancelledClient.analyseBatch({ state: DEFAULT_ATLAS_STATE, runs: 100 });
		cancelledClient.cancelAll();
		await expect(cancelled).rejects.toThrow('Request cancelled.');
		cancelledClient.dispose();

		const disposedClient = new LightningAtlasWorkerClient(null);
		const disposed = disposedClient.analyseBatch({ state: DEFAULT_ATLAS_STATE, runs: 100 });
		disposedClient.dispose();
		await expect(disposed).rejects.toThrow('Request cancelled.');
	});

	it('retries every pending request when posting retires a failed worker', async () => {
		let posts = 0;
		const worker = {
			addEventListener: () => undefined,
			removeEventListener: () => undefined,
			postMessage: () => {
				posts += 1;
				if (posts === 2) throw new Error('worker transport failed');
			},
			terminate: () => undefined
		} as unknown as Worker;
		const client = new LightningAtlasWorkerClient(worker);
		const first = client.generateFlash({ state: DEFAULT_ATLAS_STATE, strikeIndex: 1 });
		const second = client.generateFlash({ state: DEFAULT_ATLAS_STATE, strikeIndex: 2 });
		const restored = await Promise.all([first, second]);
		expect(restored.map((result) => result.flash.strikeIndex)).toEqual([1, 2]);
		expect(client.usingFallback).toBe(true);
		client.dispose();
	});
});
