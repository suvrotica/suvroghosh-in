/** Classic Langton's ant on a sparse, unbounded square lattice. Coordinates are x,y. */
export class AntModel {
	readonly maxSteps = 1_000_000;
	black = new Set<string>();
	visited = new Set<string>();
	x = 0;
	y = 0;
	/** 0 = north, 1 = east, 2 = south, 3 = west. Screen y increases downwards. */
	direction = 0;
	steps = 0;
	history: number[] = [];

	constructor(preset = 'classic') {
		this.reset(preset);
	}

	get exhausted() {
		return this.steps >= this.maxSteps;
	}

	reset(preset: string) {
		this.black.clear();
		this.visited.clear();
		this.x = 0;
		this.y = 0;
		this.direction = 0;
		this.steps = 0;
		this.history = [0];
		if (preset === 'mosaic') {
			for (let y = -8; y <= 8; y += 1) {
				for (let x = -8; x <= 8; x += 1) {
					if ((Math.abs(x) + Math.abs(y)) % 3 === 0) this.black.add(`${x},${y}`);
				}
			}
		}
		if (preset === 'highway') this.step(11_000);
	}

	step(count = 1) {
		const iterations = Math.min(
			this.maxSteps - this.steps,
			Math.max(0, Math.floor(Number.isFinite(count) ? count : 0))
		);
		for (let index = 0; index < iterations; index += 1) {
			const key = `${this.x},${this.y}`;
			const wasBlack = this.black.has(key);
			this.direction = (this.direction + (wasBlack ? 3 : 1)) % 4;
			if (wasBlack) this.black.delete(key);
			else this.black.add(key);
			this.visited.add(key);
			if (this.direction === 0) this.y -= 1;
			else if (this.direction === 1) this.x += 1;
			else if (this.direction === 2) this.y += 1;
			else this.x -= 1;
			this.steps += 1;
			this.history.push(this.visited.size);
			if (this.history.length > 180) this.history.shift();
		}
	}

	paint(x: number, y: number, tool: 'paint' | 'erase') {
		if (!Number.isFinite(x) || !Number.isFinite(y)) return;
		const key = `${Math.floor(x)},${Math.floor(y)}`;
		if (tool === 'paint') this.black.add(key);
		else this.black.delete(key);
	}

	stats(): { label: string; value: number; unit?: string }[] {
		return [
			{ label: 'Steps', value: this.steps },
			{ label: 'Visited cells', value: this.visited.size },
			{ label: 'Black cells', value: this.black.size }
		];
	}
}
