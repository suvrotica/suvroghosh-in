/** A deterministic, demand-rendered impressionist pond; it never chooses a note. */
export type PaintState = {
	palette: readonly string[];
	seed: number;
	input?: number;
	output?: number;
};

export function paintPond(canvas: HTMLCanvasElement, state: PaintState): void {
	const rect = canvas.getBoundingClientRect();
	const width = Math.max(1, rect.width);
	const height = Math.max(1, rect.height);
	const density = Math.min(window.devicePixelRatio || 1, 1.5);
	canvas.width = Math.round(width * density);
	canvas.height = Math.round(height * density);
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('Canvas painting unavailable');
	ctx.scale(density, density);
	let seed = state.seed >>> 0;
	function random() {
		seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
		return seed / 4294967296;
	}
	const colours = state.palette;
	const wash = ctx.createLinearGradient(0, 0, width * 0.35, height);
	wash.addColorStop(0, '#111e32');
	wash.addColorStop(0.5, '#253b4b');
	wash.addColorStop(1, '#102e35');
	ctx.fillStyle = wash;
	ctx.fillRect(0, 0, width, height);
	// Thousands of individual laid strokes, deterministic across redraws.
	for (let i = 0; i < Math.min(8500, (width * height) / 70); i++) {
		const x = random() * width;
		const y = random() * height;
		const horizon = y / height;
		const bend = Math.sin((x / width) * 9 + horizon * 4);
		ctx.save();
		ctx.translate(x, y);
		ctx.rotate((random() - 0.5) * 0.45 + bend * 0.12);
		ctx.globalAlpha = 0.07 + random() * 0.28;
		ctx.fillStyle = colours[Math.floor(random() * colours.length)] || '#a2b9b0';
		const length = (3 + random() * 35) * (0.5 + horizon);
		ctx.fillRect(-length / 2, 0, length, 0.8 + random() * 5);
		ctx.restore();
	}
	// A broken, pearlescent moon and its nonliteral reflected path.
	const moonX = width * 0.73;
	const moonY = height * 0.24;
	const halo = ctx.createRadialGradient(moonX, moonY, 1, moonX, moonY, height * 0.35);
	halo.addColorStop(0, '#e9d8ae40');
	halo.addColorStop(1, '#e9d8ae00');
	ctx.fillStyle = halo;
	ctx.fillRect(0, 0, width, height);
	for (let i = 0; i < 170; i++) {
		const angle = random() * Math.PI * 2;
		const radius = Math.sqrt(random()) * Math.min(32, width * 0.035);
		ctx.fillStyle = i % 3 ? '#ecdfbe' : '#b9c3cd';
		ctx.globalAlpha = 0.2 + random() * 0.6;
		ctx.fillRect(
			moonX + Math.cos(angle) * radius,
			moonY + Math.sin(angle) * radius,
			5 + random() * 9,
			2
		);
	}
	for (let i = 0; i < 200; i++) {
		const y = moonY + 40 + random() * height * 0.7;
		const spread = (y - moonY) * 0.6;
		ctx.fillStyle = i % 2 ? '#d6b5a3' : '#9dc8c5';
		ctx.globalAlpha = random() * 0.23;
		ctx.fillRect(moonX + (random() - 0.5) * spread, y, 3 + random() * 24, 1 + random() * 3);
	}
	// Lilies and their reflected marks are atmosphere, never probability data.
	for (let i = 0; i < 26; i++) {
		const x = random() * width;
		const y = height * (0.5 + random() * 0.5);
		ctx.globalAlpha = 0.25 + random() * 0.3;
		ctx.fillStyle = i % 3 ? '#4c8b80' : '#b79ab9';
		ctx.beginPath();
		ctx.ellipse(x, y, 9 + random() * 23, 2 + random() * 6, -0.1, 0.1, 6);
		ctx.fill();
		if (i % 3 === 0) {
			ctx.fillStyle = '#ddafb4';
			ctx.fillRect(x - 3, y - 4, 7, 3);
		}
	}
	ctx.globalAlpha = 1;
	const vignette = ctx.createLinearGradient(0, 0, 0, height);
	vignette.addColorStop(0, '#07142240');
	vignette.addColorStop(0.5, '#07142200');
	vignette.addColorStop(1, '#071422e0');
	ctx.fillStyle = vignette;
	ctx.fillRect(0, 0, width, height);
}

export const PIANO_KEYS = Array.from({ length: 37 }, (_, i) => {
	const pitch = i + 48;
	const black = [1, 3, 6, 8, 10].includes(pitch % 12);
	const whitesBefore = Array.from({ length: i }, (_, j) => j + 48).filter(
		(n) => ![1, 3, 6, 8, 10].includes(n % 12)
	).length;
	return {
		pitch,
		black,
		left: black ? ((whitesBefore - 0.31) / 22) * 100 : (whitesBefore / 22) * 100
	};
});
