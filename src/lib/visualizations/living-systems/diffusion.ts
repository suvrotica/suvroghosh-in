/** A dimensionless five-point diffusion stencil on a closed, no-flux domain. */
export class DiffusionModel {
	readonly width = 120;
	readonly height = 84;
	values = new Float64Array(this.width * this.height);
	obstacles = new Uint8Array(this.width * this.height);
	steps = 0;
	history: number[] = [];
	diffusivity = 0.18;
	continuous = false;
	source: { x: number; y: number; radius: number } | null = null;
	private next = new Float64Array(this.width * this.height);

	constructor(preset = 'drop', diffusivity = 0.18) {
		this.reset(preset, diffusivity);
	}

	reset(preset: string, diffusivity: number) {
		this.values.fill(0);
		this.obstacles.fill(0);
		this.next.fill(0);
		this.steps = 0;
		this.history = [];
		this.continuous = false;
		this.diffusivity = this.safeDiffusivity(diffusivity);
		const cx = Math.floor(this.width / 2);
		const cy = Math.floor(this.height / 2);
		if (preset === 'twin') {
			this.deposit(cx - 24, cy - 8, 9, 1);
			this.deposit(cx + 24, cy + 8, 9, 1);
			this.source = { x: cx + 24, y: cy + 8, radius: 9 };
		} else if (preset === 'band') {
			for (let y = 0; y < this.height; y++) {
				for (let x = 27; x < 39; x++) this.values[y * this.width + x] = 1;
			}
			this.source = { x: 33, y: cy, radius: 6 };
		} else {
			this.deposit(cx, cy, 12, 1);
			this.source = { x: cx, y: cy, radius: 12 };
		}
		this.record();
	}

	step(count = 1) {
		const iterations = Number.isFinite(count)
			? Math.min(10_000, Math.max(0, Math.floor(count)))
			: 0;
		const coefficient = this.safeDiffusivity(this.diffusivity);
		this.diffusivity = coefficient;
		for (let tick = 0; tick < iterations; tick++) {
			if (this.continuous && this.source) {
				this.deposit(this.source.x, this.source.y, this.source.radius, 0.025);
			}
			for (let y = 0; y < this.height; y++) {
				for (let x = 0; x < this.width; x++) {
					const i = y * this.width + x;
					if (this.obstacles[i]) {
						this.next[i] = 0;
						continue;
					}
					const value = this.values[i];
					let flux = 0;
					if (x > 0 && !this.obstacles[i - 1]) flux += this.values[i - 1] - value;
					if (x < this.width - 1 && !this.obstacles[i + 1]) flux += this.values[i + 1] - value;
					if (y > 0 && !this.obstacles[i - this.width]) flux += this.values[i - this.width] - value;
					if (y < this.height - 1 && !this.obstacles[i + this.width])
						flux += this.values[i + this.width] - value;
					this.next[i] = value + coefficient * flux;
				}
			}
			const previous = this.values;
			this.values = this.next;
			this.next = previous;
			this.steps++;
			this.record();
		}
	}

	paint(x: number, y: number, tool: 'paint' | 'erase' | 'obstacle', radius: number) {
		if (!Number.isFinite(x) || !Number.isFinite(y)) return;
		x = Math.round(x);
		y = Math.round(y);
		const r = Number.isFinite(radius) ? Math.max(1, Math.min(20, Math.round(radius))) : 4;
		if (tool === 'paint') {
			this.deposit(x, y, r, 1);
			this.source = { x, y, radius: r };
		} else {
			const selected: number[] = [];
			for (let py = Math.max(0, y - r); py <= Math.min(this.height - 1, y + r); py++) {
				for (let px = Math.max(0, x - r); px <= Math.min(this.width - 1, x + r); px++) {
					if ((px - x) ** 2 + (py - y) ** 2 <= r * r) selected.push(py * this.width + px);
				}
			}
			if (tool === 'erase') {
				for (const i of selected) {
					this.values[i] = 0;
					this.obstacles[i] = 0;
				}
				if (this.source && (this.source.x - x) ** 2 + (this.source.y - y) ** 2 <= r * r) {
					this.source = null;
				}
			} else {
				this.addWalls(selected);
			}
		}
		// Editing changes the present observation; it does not advance the simulation clock.
		const variance = this.measure().variance;
		if (this.history.length) this.history[this.history.length - 1] = variance;
		else this.history.push(variance);
	}

	stats(): { label: string; value: number; unit?: string }[] {
		const { mass, variance } = this.measure();
		return [
			{ label: 'Steps', value: this.steps },
			{ label: 'Total dye', value: mass, unit: 'a.u.' },
			{ label: 'Variance', value: variance }
		];
	}

	private safeDiffusivity(value: number) {
		return Number.isFinite(value) ? Math.min(0.24, Math.max(0.02, value)) : 0.18;
	}

	private deposit(x: number, y: number, radius: number, strength: number) {
		for (let py = Math.max(0, y - radius); py <= Math.min(this.height - 1, y + radius); py++) {
			for (let px = Math.max(0, x - radius); px <= Math.min(this.width - 1, x + radius); px++) {
				const distance = (px - x) ** 2 + (py - y) ** 2;
				const i = py * this.width + px;
				if (!this.obstacles[i] && distance <= radius * radius) {
					this.values[i] += strength * Math.exp((-4 * distance) / (radius * radius));
				}
			}
		}
	}

	/** Moving a wall displaces its dye equally into the remaining fluid boundary. */
	private addWalls(selected: number[]) {
		const candidate = new Set(selected.filter((i) => !this.obstacles[i]));
		if (candidate.size === 0) return;
		const boundary = new Set<number>();
		for (const i of candidate) {
			const x = i % this.width;
			const y = Math.floor(i / this.width);
			for (const n of [
				x > 0 ? i - 1 : -1,
				x + 1 < this.width ? i + 1 : -1,
				y > 0 ? i - this.width : -1,
				y + 1 < this.height ? i + this.width : -1
			]) {
				if (n >= 0 && !this.obstacles[n] && !candidate.has(n)) boundary.add(n);
			}
		}
		// Reject a stroke that would remove an entire isolated fluid pocket: it has nowhere to go.
		if (boundary.size === 0) return;
		let displaced = 0;
		for (const i of candidate) {
			displaced += this.values[i];
			this.values[i] = 0;
			this.obstacles[i] = 1;
		}
		const share = displaced / boundary.size;
		for (const i of boundary) this.values[i] += share;
	}

	private measure() {
		let mass = 0;
		let squared = 0;
		let count = 0;
		for (let i = 0; i < this.values.length; i++) {
			if (this.obstacles[i]) continue;
			mass += this.values[i];
			squared += this.values[i] ** 2;
			count++;
		}
		const mean = count ? mass / count : 0;
		return { mass, variance: count ? Math.max(0, squared / count - mean * mean) : 0 };
	}

	private record() {
		this.history.push(this.measure().variance);
		if (this.history.length > 180) this.history.shift();
	}
}
