/** Independent cardinal lattice walks; all model coordinates remain unwrapped. */
export class WalkModel {
	readonly width = 120;
	readonly height = 84;
	x = new Int32Array(0);
	y = new Int32Array(0);
	count = 160;
	paths: Array<Array<[number, number]>> = [];
	occupancy = new Uint32Array(this.width * this.height);
	steps = 0;
	history: number[] = [];
	msd = 0;
	seed = 1847;
	private randomState = 1847;

	constructor(seed = 1847, preset = 'ensemble', count = 160) {
		this.reset(seed, preset, count);
	}

	reset(seed: number, preset: string, count: number) {
		this.seed = Number.isFinite(seed) ? Math.trunc(seed) >>> 0 : 1847;
		this.randomState = this.seed || 0x6d2b79f5;
		const boundedCount = Number.isFinite(count)
			? Math.max(1, Math.min(600, Math.round(count)))
			: 160;
		this.count = preset === 'single' ? 1 : preset === 'bloom' ? 600 : boundedCount;
		this.x = new Int32Array(this.count);
		this.y = new Int32Array(this.count);
		this.paths = Array.from({ length: this.count }, () => [[0, 0]]);
		this.occupancy.fill(0);
		this.occupancy[Math.floor(this.height / 2) * this.width + Math.floor(this.width / 2)] =
			this.count;
		this.steps = 0;
		this.msd = 0;
		this.history = [0];
	}

	step(count = 1) {
		const iterations = Number.isFinite(count)
			? Math.min(10_000, Math.max(0, Math.floor(count)))
			: 0;
		for (let tick = 0; tick < iterations; tick++) {
			let squared = 0;
			for (let i = 0; i < this.count; i++) {
				const direction = this.nextDirection();
				if (direction === 0) this.x[i]++;
				else if (direction === 1) this.x[i]--;
				else if (direction === 2) this.y[i]++;
				else this.y[i]--;
				const x = this.x[i];
				const y = this.y[i];
				squared += x * x + y * y;
				const path = this.paths[i];
				path.push([x, y]);
				if (path.length > 256) path.shift();
				const wrappedX = (((x + this.width / 2) % this.width) + this.width) % this.width;
				const wrappedY = (((y + this.height / 2) % this.height) + this.height) % this.height;
				const index = wrappedY * this.width + wrappedX;
				if (this.occupancy[index] < 0xffffffff) this.occupancy[index]++;
			}
			this.steps++;
			this.msd = squared / this.count;
			this.history.push(this.msd);
			if (this.history.length > 180) this.history.shift();
		}
	}

	stats(): { label: string; value: number; unit?: string }[] {
		return [
			{ label: 'Steps', value: this.steps },
			{ label: 'Walkers', value: this.count },
			{ label: 'Mean squared distance', value: this.msd, unit: 'cells²' }
		];
	}

	private nextDirection() {
		let value = this.randomState;
		value ^= value << 13;
		value ^= value >>> 17;
		value ^= value << 5;
		this.randomState = value >>> 0;
		return this.randomState >>> 30;
	}
}
