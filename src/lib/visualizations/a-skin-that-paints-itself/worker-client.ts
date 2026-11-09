import type { SkinSettings } from './model.ts';
import type { SkinRequest, SkinResponse, SkinResult } from './protocol.ts';

export type { SkinReplayFrame, SkinResult } from './protocol.ts';

export class SkinWorkerClient {
	private worker: Worker | null = null;
	private generation = 0;
	private active = true;
	private disposed = false;

	constructor(
		private readonly onResult: (result: SkinResult) => void,
		private readonly onError: () => void
	) {}

	calculate(settings: SkinSettings): void {
		if (this.disposed) return;
		const generation = ++this.generation;
		try {
			if (!this.worker) {
				const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
				this.worker = worker;
				worker.onmessage = ({ data }: MessageEvent<SkinResponse>) => {
					if (worker !== this.worker || data.generation !== this.generation) return;
					if (data.type === 'result') this.onResult(data.result);
					else this.onError();
				};
				worker.onerror = (event) => {
					event.preventDefault();
					if (worker === this.worker) this.fail();
				};
				worker.onmessageerror = () => {
					if (worker === this.worker) this.fail();
				};
				this.send({ type: 'active', active: this.active });
			}
			this.send({ type: 'calculate', generation, settings });
		} catch {
			this.fail();
		}
	}

	setActive(active: boolean): void {
		if (this.active === active || this.disposed) return;
		this.active = active;
		this.send({ type: 'active', active });
	}

	cancel(): void {
		this.send({ type: 'cancel', generation: ++this.generation });
	}

	dispose(): void {
		this.disposed = true;
		this.close();
	}

	private send(message: SkinRequest): void {
		this.worker?.postMessage(message);
	}

	private close(): void {
		++this.generation;
		this.worker?.terminate();
		this.worker = null;
	}

	private fail(): void {
		this.close();
		this.onError();
	}
}
