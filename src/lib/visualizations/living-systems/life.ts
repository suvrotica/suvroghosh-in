/** Pure, fixed-generation Conway model. Rendering and wall-clock time do not enter the rules. */
export type LifeBoundary = 'wrap' | 'finite';
export type LifeTool = 'paint' | 'erase' | 'stamp';

type Pattern = { width: number; height: number; points: readonly (readonly [number, number])[] };

const patternRows = (rows: readonly string[]): Pattern => ({
	width: Math.max(...rows.map((row) => row.length)),
	height: rows.length,
	points: rows.flatMap((row, y) =>
		Array.from(row).flatMap((cell, x) => (cell === 'O' ? [[x, y] as const] : []))
	)
});

export const LIFE_PATTERNS: Readonly<Record<string, Pattern>> = {
	glider: patternRows(['.O.', '..O', 'OOO']),
	blinker: patternRows(['OOO']),
	block: patternRows(['OO', 'OO']),
	pulsar: patternRows([
		'..OOO...OOO..',
		'.............',
		'O....O.O....O',
		'O....O.O....O',
		'O....O.O....O',
		'..OOO...OOO..',
		'.............',
		'..OOO...OOO..',
		'O....O.O....O',
		'O....O.O....O',
		'O....O.O....O',
		'.............',
		'..OOO...OOO..'
	]),
	gun: {
		width: 36,
		height: 9,
		points: [
			[24, 0],
			[22, 1],
			[24, 1],
			[12, 2],
			[13, 2],
			[20, 2],
			[21, 2],
			[34, 2],
			[35, 2],
			[11, 3],
			[15, 3],
			[20, 3],
			[21, 3],
			[34, 3],
			[35, 3],
			[0, 4],
			[1, 4],
			[10, 4],
			[16, 4],
			[20, 4],
			[21, 4],
			[0, 5],
			[1, 5],
			[10, 5],
			[14, 5],
			[16, 5],
			[17, 5],
			[22, 5],
			[24, 5],
			[10, 6],
			[16, 6],
			[24, 6],
			[11, 7],
			[15, 7],
			[12, 8],
			[13, 8]
		]
	}
};

function seededRandom(seed: number) {
	let state = seed >>> 0;
	return () => {
		state += 0x6d2b79f5;
		let value = state;
		value = Math.imul(value ^ (value >>> 15), value | 1);
		value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
		return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
	};
}

export class LifeModel {
	readonly width = 120;
	readonly height = 84;
	cells = new Uint8Array(this.width * this.height);
	ages = new Uint16Array(this.width * this.height);
	steps = 0;
	history: number[] = [];
	boundary: LifeBoundary;
	private nextCells = new Uint8Array(this.width * this.height);
	private nextAges = new Uint16Array(this.width * this.height);

	constructor(seed = 1847, preset = 'gun', density = 0.28, boundary: LifeBoundary = 'wrap') {
		this.boundary = boundary;
		this.reset(seed, preset, density, boundary);
	}

	reset(seed: number, preset: string, density: number, boundary: LifeBoundary) {
		this.steps = 0;
		this.history = [];
		this.boundary = boundary === 'finite' ? 'finite' : 'wrap';
		this.cells.fill(0);
		this.ages.fill(0);
		this.nextCells.fill(0);
		this.nextAges.fill(0);
		if (preset === 'soup') {
			const random = seededRandom(Number.isFinite(seed) ? seed : 1847);
			const probability = Math.min(1, Math.max(0, Number.isFinite(density) ? density : 0.28));
			for (let index = 0; index < this.cells.length; index += 1) {
				this.cells[index] = Number(random() < probability);
				this.ages[index] = this.cells[index];
			}
		} else {
			const pattern = LIFE_PATTERNS[preset] ?? LIFE_PATTERNS.gun;
			this.stamp(
				Math.floor((this.width - pattern.width) / 2),
				Math.floor((this.height - pattern.height) / 2),
				pattern
			);
		}
		this.record();
	}

	step(count = 1) {
		const iterations = Math.min(1000, Math.max(0, Math.floor(Number.isFinite(count) ? count : 0)));
		const { width, height } = this;
		for (let iteration = 0; iteration < iterations; iteration += 1) {
			for (let y = 0; y < height; y += 1) {
				for (let x = 0; x < width; x += 1) {
					let neighbours = 0;
					for (let dy = -1; dy <= 1; dy += 1) {
						for (let dx = -1; dx <= 1; dx += 1) {
							if (dx === 0 && dy === 0) continue;
							let nx = x + dx;
							let ny = y + dy;
							if (this.boundary === 'wrap') {
								nx = (nx + width) % width;
								ny = (ny + height) % height;
							} else if (nx < 0 || nx >= width || ny < 0 || ny >= height) {
								continue;
							}
							neighbours += this.cells[ny * width + nx];
						}
					}
					const index = y * width + x;
					const alive = neighbours === 3 || (this.cells[index] === 1 && neighbours === 2);
					this.nextCells[index] = Number(alive);
					this.nextAges[index] = alive ? Math.min(65535, this.ages[index] + 1) : 0;
				}
			}
			[this.cells, this.nextCells] = [this.nextCells, this.cells];
			[this.ages, this.nextAges] = [this.nextAges, this.ages];
			this.steps += 1;
			this.record();
		}
	}

	paint(x: number, y: number, tool: LifeTool, radius: number, pattern = 'glider') {
		if (!Number.isFinite(x) || !Number.isFinite(y)) return;
		const cx = Math.floor(x);
		const cy = Math.floor(y);
		if (tool === 'stamp') {
			const shape = LIFE_PATTERNS[pattern] ?? LIFE_PATTERNS.glider;
			this.stamp(cx - Math.floor(shape.width / 2), cy - Math.floor(shape.height / 2), shape);
		} else {
			const size = Math.max(0, Math.min(12, Math.floor(Number.isFinite(radius) ? radius : 0)));
			for (let dy = -size; dy <= size; dy += 1) {
				for (let dx = -size; dx <= size; dx += 1) {
					if (dx * dx + dy * dy > size * size) continue;
					const px = cx + dx;
					const py = cy + dy;
					if (px < 0 || px >= this.width || py < 0 || py >= this.height) continue;
					const index = py * this.width + px;
					this.cells[index] = Number(tool === 'paint');
					this.ages[index] = this.cells[index];
				}
			}
		}
		// Painting changes the present observation, rather than inventing another generation.
		if (this.history.length) this.history[this.history.length - 1] = this.population();
	}

	stats(): { label: string; value: number; unit?: string }[] {
		return [
			{ label: 'Generation', value: this.steps },
			{ label: 'Living cells', value: this.population() },
			{ label: 'Occupied', value: (this.population() / this.cells.length) * 100, unit: '%' }
		];
	}

	private stamp(x: number, y: number, pattern: Pattern) {
		for (const [dx, dy] of pattern.points) {
			const px = x + dx;
			const py = y + dy;
			if (px < 0 || px >= this.width || py < 0 || py >= this.height) continue;
			const index = py * this.width + px;
			this.cells[index] = 1;
			this.ages[index] = 1;
		}
	}

	private population() {
		let total = 0;
		for (let index = 0; index < this.cells.length; index += 1) total += this.cells[index];
		return total;
	}

	private record() {
		this.history.push(this.population());
		if (this.history.length > 180) this.history.shift();
	}
}
