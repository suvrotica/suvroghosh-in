import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Reply = { type: 'ready' } | { id: number; svg?: string; error?: string };
const source = '@startuml\nclass Example\n@enduml';
const svg = '<svg xmlns="http://www.w3.org/2000/svg"><text>Example</text></svg>';

class FakeWorker {
	static instances: FakeWorker[] = [];
	onmessage: ((event: MessageEvent<Reply>) => void) | null = null;
	onerror: (() => void) | null = null;
	sent: { id: number; source: string }[] = [];
	terminated = false;
	constructor() {
		FakeWorker.instances.push(this);
	}
	postMessage(message: { id: number; source: string }) {
		this.sent.push(message);
	}
	terminate() {
		this.terminated = true;
	}
	emit(data: Reply) {
		// Deliberately deliver stale events even after termination to test race guards.
		this.onmessage?.({ data } as MessageEvent<Reply>);
	}
	ready() {
		this.emit({ type: 'ready' });
	}
	complete() {
		const message = this.sent.at(-1);
		if (!message) throw new Error('No source has been sent to this worker.');
		this.emit({ id: message.id, svg });
	}
}

let renderer: typeof import('./browser');
const settled = (promise: Promise<string>) =>
	promise.then(
		(value) => ({ value, error: undefined }),
		(error: Error) => ({ value: undefined, error })
	);

beforeEach(async () => {
	vi.useFakeTimers();
	vi.resetModules();
	FakeWorker.instances = [];
	vi.stubGlobal('Worker', FakeWorker);
	renderer = await import('./browser');
});

afterEach(() => {
	renderer.cancelPlantUmlRendering();
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

describe('local PlantUML worker lifecycle', () => {
	it('allows a 25-second startup without consuming the rendering deadline or sending source early', async () => {
		const result = settled(renderer.renderPlantUmlInBrowser(source));
		const worker = FakeWorker.instances[0];
		await vi.advanceTimersByTimeAsync(25_000);
		expect(worker.terminated).toBe(false);
		expect(worker.sent).toEqual([]);
		worker.emit({ type: 'unexpected' } as unknown as Reply);
		expect(worker.sent).toEqual([]);
		worker.ready();
		expect(worker.sent).toHaveLength(1);
		expect(worker.sent[0].source).toBe(source);
		worker.complete();
		expect(await result).toEqual({ value: svg, error: undefined });
		await vi.advanceTimersByTimeAsync(60_000);
		expect(worker.terminated).toBe(false);
	});

	it('terminates startup at exactly 60 seconds when the worker never becomes ready', async () => {
		const result = settled(renderer.renderPlantUmlInBrowser(source));
		const worker = FakeWorker.instances[0];
		await vi.advanceTimersByTimeAsync(59_999);
		expect(worker.terminated).toBe(false);
		await vi.advanceTimersByTimeAsync(1);
		expect(worker.terminated).toBe(true);
		expect(worker.sent).toEqual([]);
		expect((await result).error?.message).toMatch(/start.*60 seconds/i);
		expect(vi.getTimerCount()).toBe(0);
	});

	it('keeps the exact 20-second render limit after readiness, including duplicate readiness events', async () => {
		const result = settled(renderer.renderPlantUmlInBrowser(source));
		const worker = FakeWorker.instances[0];
		await vi.advanceTimersByTimeAsync(25_000);
		worker.ready();
		await vi.advanceTimersByTimeAsync(10_000);
		worker.ready();
		expect(worker.sent).toHaveLength(1);
		await vi.advanceTimersByTimeAsync(9_999);
		expect(worker.terminated).toBe(false);
		await vi.advanceTimersByTimeAsync(1);
		expect(worker.terminated).toBe(true);
		expect((await result).error?.message).toMatch(/Rendering exceeded 20 seconds/);
		expect(vi.getTimerCount()).toBe(0);
	});

	it('aborts startup and ignores stale readiness or results while the next worker starts', async () => {
		const controller = new AbortController();
		const first = settled(renderer.renderPlantUmlInBrowser(source, controller.signal));
		const next = settled(renderer.renderPlantUmlInBrowser(source));
		const stale = FakeWorker.instances[0];
		controller.abort();
		expect((await first).error?.name).toBe('AbortError');
		expect(stale.terminated).toBe(true);
		const current = FakeWorker.instances[1];
		stale.ready();
		stale.emit({ id: 2, svg: 'stale output' });
		expect(stale.sent).toEqual([]);
		expect(current.sent).toEqual([]);
		current.ready();
		current.complete();
		expect(await next).toEqual({ value: svg, error: undefined });
		expect(vi.getTimerCount()).toBe(0);
	});

	it('reuses a ready worker and renders only one queued source at a time', async () => {
		const first = settled(renderer.renderPlantUmlInBrowser(source));
		const second = settled(renderer.renderPlantUmlInBrowser(source));
		const worker = FakeWorker.instances[0];
		worker.ready();
		expect(worker.sent).toHaveLength(1);
		worker.complete();
		expect(await first).toEqual({ value: svg, error: undefined });
		expect(FakeWorker.instances).toHaveLength(1);
		expect(worker.sent).toHaveLength(2);
		worker.complete();
		expect(await second).toEqual({ value: svg, error: undefined });
		expect(vi.getTimerCount()).toBe(0);
	});

	it('replaces a worker that errors while idle and ignores later errors from that stale worker', async () => {
		const first = settled(renderer.renderPlantUmlInBrowser(source));
		const stale = FakeWorker.instances[0];
		stale.ready();
		stale.complete();
		expect(await first).toEqual({ value: svg, error: undefined });
		stale.onerror?.();
		const next = settled(renderer.renderPlantUmlInBrowser(source));
		expect(stale.terminated).toBe(true);
		expect(FakeWorker.instances).toHaveLength(2);
		const current = FakeWorker.instances[1];
		stale.onerror?.();
		stale.ready();
		expect(current.terminated).toBe(false);
		expect(current.sent).toEqual([]);
		current.ready();
		current.complete();
		expect(await next).toEqual({ value: svg, error: undefined });
		expect(vi.getTimerCount()).toBe(0);
	});

	it('bounds the queue to 32 pending jobs and clears all active/pending jobs on cancellation', async () => {
		const jobs = Array.from({ length: 33 }, () =>
			settled(renderer.renderPlantUmlInBrowser(source))
		);
		const overflow = settled(renderer.renderPlantUmlInBrowser(source));
		expect((await overflow).error?.message).toMatch(/queue is full/i);
		expect(FakeWorker.instances).toHaveLength(1);
		const oldWorker = FakeWorker.instances[0];
		renderer.cancelPlantUmlRendering();
		expect((await Promise.all(jobs)).every((result) => result.error?.name === 'AbortError')).toBe(
			true
		);
		expect(oldWorker.terminated).toBe(true);
		expect(vi.getTimerCount()).toBe(0);
		oldWorker.ready();
		expect(oldWorker.sent).toEqual([]);
		const recovered = settled(renderer.renderPlantUmlInBrowser(source));
		const worker = FakeWorker.instances[1];
		worker.ready();
		worker.complete();
		expect(await recovered).toEqual({ value: svg, error: undefined });
	});

	it('removes an individually cancelled queued job without disturbing the active render', async () => {
		const active = settled(renderer.renderPlantUmlInBrowser(source));
		const token = new AbortController();
		const queued = settled(renderer.renderPlantUmlInBrowser(source, token.signal));
		const worker = FakeWorker.instances[0];
		worker.ready();
		token.abort();
		expect((await queued).error?.name).toBe('AbortError');
		expect(worker.terminated).toBe(false);
		worker.complete();
		expect(await active).toEqual({ value: svg, error: undefined });
		expect(worker.sent).toHaveLength(1);
		expect(vi.getTimerCount()).toBe(0);
	});
});
