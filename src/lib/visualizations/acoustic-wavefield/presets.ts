import {
	GRID_NX,
	GRID_NY,
	MAT_ABSORBER,
	MAT_AIR,
	MAT_DIFFUSER,
	MAT_LENS,
	MAT_RESONATOR,
	MAT_WALL,
	type BrushTool,
	type GridPoint,
	type MaterialId,
	type PresetDefinition,
	type PresetId
} from './types';

function idx(x: number, y: number): number {
	return y * GRID_NX + x;
}

export function clampGridPoint(p: GridPoint): GridPoint {
	return {
		x: Math.max(2, Math.min(GRID_NX - 3, p.x)),
		y: Math.max(2, Math.min(GRID_NY - 3, p.y))
	};
}

export function setCellSafe(material: Uint8Array, x: number, y: number, val: MaterialId): void {
	const ix = Math.round(x);
	const iy = Math.round(y);
	if (ix < 0 || ix >= GRID_NX || iy < 0 || iy >= GRID_NY) return;
	material[idx(ix, iy)] = val;
}

export function fillRect(
	material: Uint8Array,
	x0: number,
	y0: number,
	x1: number,
	y1: number,
	val: MaterialId
): void {
	const minX = Math.max(0, Math.min(x0, x1));
	const maxX = Math.min(GRID_NX - 1, Math.max(x0, x1));
	const minY = Math.max(0, Math.min(y0, y1));
	const maxY = Math.min(GRID_NY - 1, Math.max(y0, y1));
	for (let y = minY; y <= maxY; y++) {
		const row = y * GRID_NX;
		for (let x = minX; x <= maxX; x++) {
			material[row + x] = val;
		}
	}
}

export function fillDisc(
	material: Uint8Array,
	cx: number,
	cy: number,
	radius: number,
	val: MaterialId
): void {
	const r = Math.max(0.5, radius);
	const rSq = r * r;
	const minX = Math.max(0, Math.floor(cx - r));
	const maxX = Math.min(GRID_NX - 1, Math.ceil(cx + r));
	const minY = Math.max(0, Math.floor(cy - r));
	const maxY = Math.min(GRID_NY - 1, Math.ceil(cy + r));
	for (let y = minY; y <= maxY; y++) {
		const dy = y - cy;
		const row = y * GRID_NX;
		for (let x = minX; x <= maxX; x++) {
			const dx = x - cx;
			if (dx * dx + dy * dy <= rSq) {
				material[row + x] = val;
			}
		}
	}
}

/**
 * 4-connected thick line rasterizer (>= 2 cells thick for WALL to prevent diagonal leakage).
 */
export function drawThickLine(
	material: Uint8Array,
	x0: number,
	y0: number,
	x1: number,
	y1: number,
	radius: number,
	val: MaterialId
): void {
	const dx = x1 - x0;
	const dy = y1 - y0;
	const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) * 2));
	const effectiveRadius = val === MAT_WALL ? Math.max(1.15, radius) : radius;
	for (let s = 0; s <= steps; s++) {
		const t = s / steps;
		fillDisc(material, x0 + dx * t, y0 + dy * t, effectiveRadius, val);
	}
}

/**
 * Stamp a discrete Helmholtz side-branch cavity at (cx, cy).
 * Uses a 6x1 AIR cavity enclosed by >=2-cell WALLs coupled via a 4x2 damped neck (MAT_RESONATOR),
 * tuned to ~245 Hz at dx = 0.0625 m.
 */
export function stampHelmholtzResonator(material: Uint8Array, cx: number, cy: number): void {
	const ix = Math.max(6, Math.min(GRID_NX - 7, Math.round(cx)));
	const iy = Math.max(6, Math.min(GRID_NY - 9, Math.round(cy)));

	// Outer 10x5 wall box centered horizontally at ix, neck opening upward at iy..iy+1
	fillRect(material, ix - 5, iy, ix + 4, iy + 4, MAT_WALL);

	// 6x1 inner AIR cavity: (ix-3..ix+2, iy+2)
	fillRect(material, ix - 3, iy + 2, ix + 2, iy + 2, MAT_AIR);

	// 4x2 resonator neck opening upward: (ix-2..ix+1, iy..iy+1)
	fillRect(material, ix - 2, iy, ix + 1, iy + 1, MAT_RESONATOR);
}

/**
 * Stamp a QRD (Quadratic Residue Diffuser, N=7 prime sequence [0,1,4,2,2,4,1]) vertically or horizontally.
 */
function stampVerticalQrdDiffuser(
	material: Uint8Array,
	xStart: number,
	yStart: number,
	yEnd: number,
	facingLeft: boolean
): void {
	const seq = [0, 1, 4, 2, 2, 4, 1];
	const wellPitch = 3; // 3 cells per well (2 air + 1 fin)
	let slot = 0;
	for (let y = yStart; y <= yEnd - wellPitch; y += wellPitch) {
		const depth = seq[slot % seq.length] * 2;
		// Solid fin separating wells
		fillRect(material, xStart, y, xStart + 9, y, MAT_WALL);
		// Well backing wall
		if (facingLeft) {
			fillRect(material, xStart + 9 - (8 - depth), y + 1, xStart + 9, y + wellPitch - 1, MAT_WALL);
			// Subtle neck/diffuser edge tag in open well entrance
			setCellSafe(material, xStart + 1, y + 1, MAT_DIFFUSER);
		} else {
			fillRect(material, xStart, y + 1, xStart + (8 - depth), y + wellPitch - 1, MAT_WALL);
			setCellSafe(material, xStart + 8, y + 1, MAT_DIFFUSER);
		}
		slot++;
	}
	fillRect(material, xStart, yEnd, xStart + 9, yEnd, MAT_WALL);
}

/**
 * Apply interactive brush stroke from (x0, y0) to (x1, y1).
 * Note: 'resonator' is discrete click-to-stamp on pointerdown; brush drags do not smear it.
 */
export function applyBrushStroke(
	material: Uint8Array,
	tool: BrushTool,
	x0: number,
	y0: number,
	x1: number,
	y1: number,
	radius: number
): void {
	if (tool === 'move') return;
	if (tool === 'resonator') {
		stampHelmholtzResonator(material, x1, y1);
		return;
	}
	const matMap: Record<Exclude<BrushTool, 'move' | 'resonator'>, MaterialId> = {
		air: MAT_AIR,
		wall: MAT_WALL,
		absorber: MAT_ABSORBER,
		diffuser: MAT_DIFFUSER,
		lens: MAT_LENS
	};
	const mat = matMap[tool];
	if (tool === 'diffuser') {
		// Stamp crisp alternating diffuser ribs along stroke
		const dx = x1 - x0;
		const dy = y1 - y0;
		const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy)));
		for (let s = 0; s <= steps; s++) {
			const px = Math.round(x0 + (dx * s) / steps);
			const py = Math.round(y0 + (dy * s) / steps);
			const tooth = (px + py) % 4 < 2 ? MAT_WALL : MAT_DIFFUSER;
			fillDisc(material, px, py, Math.max(1, radius * 0.75), tooth);
		}
		return;
	}
	drawThickLine(material, x0, y0, x1, y1, radius, mat);
}

/**
 * Find nearest traversable AIR cell so S and L never land inside a WALL or ABSORBER.
 */
export function findNearestAirCell(material: Uint8Array, point: GridPoint): GridPoint {
	const clamped = clampGridPoint(point);
	const sx = Math.round(clamped.x);
	const sy = Math.round(clamped.y);
	if (material[idx(sx, sy)] === MAT_AIR) return clamped;

	for (let r = 1; r < Math.max(GRID_NX, GRID_NY); r++) {
		let bestDist = Infinity;
		let bestX = sx;
		let bestY = sy;
		for (let dy = -r; dy <= r; dy++) {
			for (let dx = -r; dx <= r; dx++) {
				if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
				const nx = sx + dx;
				const ny = sy + dy;
				if (nx < 2 || nx >= GRID_NX - 2 || ny < 2 || ny >= GRID_NY - 2) continue;
				if (material[idx(nx, ny)] === MAT_AIR) {
					const d = dx * dx + dy * dy;
					if (d < bestDist) {
						bestDist = d;
						bestX = nx;
						bestY = ny;
					}
				}
			}
		}
		if (bestDist < Infinity) {
			return { x: bestX, y: bestY };
		}
	}
	return clamped;
}

function buildEllipticalGallery(material: Uint8Array): void {
	material.fill(MAT_WALL);
	const cx = 112;
	const cy = 72;
	const a = 92; // semi-major (cells)
	const b = 56; // semi-minor (cells)
	for (let y = 2; y < GRID_NY - 2; y++) {
		const dy = (y - cy) / b;
		const row = y * GRID_NX;
		for (let x = 2; x < GRID_NX - 2; x++) {
			const dx = (x - cx) / a;
			if (dx * dx + dy * dy <= 1.0) {
				material[row + x] = MAT_AIR;
			}
		}
	}
}

function buildShoeboxConcertHall(material: Uint8Array): void {
	material.fill(MAT_AIR);
	// Outer rigid stone shell (4 cells thick)
	fillRect(material, 0, 0, GRID_NX - 1, 7, MAT_WALL);
	fillRect(material, 0, GRID_NY - 8, GRID_NX - 1, GRID_NY - 1, MAT_WALL);
	fillRect(material, 0, 0, 12, GRID_NY - 1, MAT_WALL);
	fillRect(material, GRID_NX - 13, 0, GRID_NX - 1, GRID_NY - 1, MAT_WALL);

	// Stage splay reflectors (left)
	drawThickLine(material, 13, 20, 48, 8, 2.2, MAT_WALL);
	drawThickLine(material, 13, 123, 48, 135, 2.2, MAT_WALL);

	// Asymmetric side acoustic canopy baffle
	drawThickLine(material, 66, 26, 98, 34, 1.5, MAT_WALL);

	// Plush audience stalls (porous foam absorbers)
	fillRect(material, 88, 42, 102, 62, MAT_ABSORBER);
	fillRect(material, 88, 82, 102, 102, MAT_ABSORBER);
	fillRect(material, 118, 40, 132, 64, MAT_ABSORBER);
	fillRect(material, 118, 80, 132, 104, MAT_ABSORBER);
	fillRect(material, 148, 44, 162, 62, MAT_ABSORBER);
	fillRect(material, 148, 82, 162, 100, MAT_ABSORBER);

	// Side balcony porous wall strips
	fillRect(material, 74, 8, 168, 12, MAT_ABSORBER);
	fillRect(material, 74, GRID_NY - 13, 168, GRID_NY - 9, MAT_ABSORBER);

	// Slotted QRD Diffuser array along rear wall
	stampVerticalQrdDiffuser(material, GRID_NX - 23, 18, GRID_NY - 19, true);
}

function buildDoubleSlitDiffraction(material: Uint8Array): void {
	material.fill(MAT_AIR);
	// Full-height stone barrier at x = 92..95 (4 cells thick)
	fillRect(material, 92, 0, 95, GRID_NY - 1, MAT_WALL);
	// Two narrow apertures (~6 cells = 0.375 m wide, ~0.46 lambda at 420 Hz)
	fillRect(material, 92, 54, 95, 59, MAT_AIR);
	fillRect(material, 92, 84, 95, 89, MAT_AIR);
}

function buildParabolicLensFocus(material: Uint8Array): void {
	material.fill(MAT_AIR);
	// Parabolic stone reflector on left: x = 32 + (y - 72)^2 / 80
	let prevX = 32 + ((30 - 72) * (30 - 72)) / 80;
	let prevY = 30;
	for (let y = 31; y <= 114; y++) {
		const dy = y - 72;
		const px = 32 + (dy * dy) / 80;
		drawThickLine(material, prevX, prevY, px, y, 1.8, MAT_WALL);
		prevX = px;
		prevY = y;
	}

	// Biconvex Slow-Air Acoustic Lens (c = 0.55 * c0) centered at (114, 72)
	const lx = 114;
	const ly = 72;
	const halfH = 38;
	const rCurve = 68;
	for (let y = ly - halfH; y <= ly + halfH; y++) {
		const dy = y - ly;
		const sag = Math.sqrt(Math.max(0, rCurve * rCurve - dy * dy)) - (rCurve - 11);
		if (sag <= 0) continue;
		const xStart = Math.round(lx - sag);
		const xEnd = Math.round(lx + sag);
		fillRect(material, xStart, y, xEnd, y, MAT_LENS);
	}
}

function buildStoneBathhouse(material: Uint8Array): void {
	material.fill(MAT_AIR);
	// Thick stone perimeter
	fillRect(material, 0, 0, GRID_NX - 1, 12, MAT_WALL);
	fillRect(material, 0, GRID_NY - 13, GRID_NX - 1, GRID_NY - 1, MAT_WALL);
	fillRect(material, 0, 0, 14, GRID_NY - 1, MAT_WALL);
	fillRect(material, GRID_NX - 15, 0, GRID_NX - 1, GRID_NY - 1, MAT_WALL);

	// Interior marble columns
	fillRect(material, 96, 40, 103, 52, MAT_WALL);
	fillRect(material, 124, 90, 131, 102, MAT_WALL);
}

function buildAnechoicChamber(material: Uint8Array): void {
	material.fill(MAT_AIR);
	// Outer stone shell
	fillRect(material, 0, 0, GRID_NX - 1, 4, MAT_WALL);
	fillRect(material, 0, GRID_NY - 5, GRID_NX - 1, GRID_NY - 1, MAT_WALL);
	fillRect(material, 0, 0, 4, GRID_NY - 1, MAT_WALL);
	fillRect(material, GRID_NX - 5, 0, GRID_NX - 1, GRID_NY - 1, MAT_WALL);

	// Sawtooth porous absorber wedges lining all 4 walls
	const wedgeDepth = 22;
	const period = 12;
	for (let x = 5; x < GRID_NX - 5; x++) {
		const phase = Math.abs(((x - 5) % period) - period / 2) / (period / 2);
		const reach = Math.round(8 + (1 - phase) * (wedgeDepth - 8));
		fillRect(material, x, 5, x, 5 + reach, MAT_ABSORBER);
		fillRect(material, x, GRID_NY - 6 - reach, x, GRID_NY - 6, MAT_ABSORBER);
	}
	for (let y = 5; y < GRID_NY - 5; y++) {
		const phase = Math.abs(((y - 5) % period) - period / 2) / (period / 2);
		const reach = Math.round(8 + (1 - phase) * (wedgeDepth - 8));
		fillRect(material, 5, y, 5 + reach, y, MAT_ABSORBER);
		fillRect(material, GRID_NX - 6 - reach, y, GRID_NX - 6, y, MAT_ABSORBER);
	}
}

function buildHelmholtzTrap(material: Uint8Array): void {
	// Solid stone surround around a single-mode acoustic waveguide duct & side-branch Helmholtz resonator
	material.fill(MAT_WALL);
	// Horizontal acoustic duct running across domain (open PML ends at left/right)
	// Inner duct air: y = 63..72 (10 cells = 0.625 m tall, symmetric cutoff f2 = 549 Hz > 420 Hz)
	fillRect(material, 0, 63, GRID_NX - 1, 72, MAT_AIR);

	// Side-branch Helmholtz resonator at x = 112 coupled through bottom wall y = 73..74:
	// Cavity: 6x1 AIR cells (x = 109..114, y = 75) enclosed by >=2-cell stone
	// Neck: 4x2 MAT_RESONATOR cells (x = 110..113, y = 73..74)
	fillRect(material, 109, 75, 114, 75, MAT_AIR);
	fillRect(material, 110, 73, 113, 74, MAT_RESONATOR);
}

// Elliptical foci: a = 92, b = 56 => c = sqrt(92^2 - 56^2) = sqrt(8464 - 3136) = sqrt(5328) = 72.993
export const PRESETS: readonly PresetDefinition[] = [
	{
		id: 'elliptical-whispering-gallery',
		name: 'Elliptical Whispering Gallery',
		shortName: 'Whispering Ellipse',
		tagline: 'A stone ellipse focuses every reflected ray from S onto its twin focus L.',
		takeaway:
			'Every path from focus F₁ to the stone rim and back to focus F₂ has identical total length—so scattered echoes arrive together in one crisp focal spike.',
		defaultPerimeter: 'rigid',
		defaultSource: { x: 39, y: 72 },
		defaultListener: { x: 185, y: 72 },
		recommendedToneHz: 280,
		buildGeometry: buildEllipticalGallery
	},
	{
		id: 'shoebox-concert-hall',
		name: 'Shoebox Concert Hall',
		shortName: 'Concert Hall',
		tagline: 'Stage canopy, plush stalls absorption, and a rear QRD slotted diffuser.',
		takeaway:
			'Early canopy reflections support clarity (C₈₀), plush stalls tame flutter echoes, and the rear Quadratic Residue Diffuser scatters phase without killing warmth.',
		defaultPerimeter: 'rigid',
		defaultSource: { x: 36, y: 66 },
		defaultListener: { x: 170, y: 78 },
		recommendedToneHz: 210,
		buildGeometry: buildShoeboxConcertHall
	},
	{
		id: 'double-slit-diffraction',
		name: 'Double-Slit Diffraction & Interference',
		shortName: 'Double Slit',
		tagline:
			'Two narrow stone apertures launch circular Huygens wavelets that cancel along hyperbolas.',
		takeaway:
			'Send a continuous tone through the twin slits and watch Chladni sand gather along the quiet hyperbolic nodal lanes.',
		defaultPerimeter: 'open',
		defaultSource: { x: 52, y: 72 },
		defaultListener: { x: 162, y: 72 },
		recommendedToneHz: 420,
		buildGeometry: buildDoubleSlitDiffraction
	},
	{
		id: 'parabolic-lens-focus',
		name: 'Parabolic Dish & Slow-Air Lens',
		shortName: 'Parabolic + Lens',
		tagline: 'A stone parabola collimates the clap; a slow-air lens (0.55 c₀) bends it to a focus.',
		takeaway:
			'Because sound slows down inside the biconvex lens, the center of the wavefront lags behind its edges and curves cleanly toward L.',
		defaultPerimeter: 'open',
		defaultSource: { x: 52, y: 72 },
		defaultListener: { x: 164, y: 72 },
		recommendedToneHz: 340,
		buildGeometry: buildParabolicLensFocus
	},
	{
		id: 'stone-bathhouse',
		name: 'Bare Stone Bathhouse',
		shortName: 'Stone Bathhouse',
		tagline: 'Unforgiving rigid stone walls sustain long standing-wave modes and negative clarity.',
		takeaway:
			'With almost zero porous absorption, late reverberant energy overwhelms the first 80 ms—turning speech muddy while room eigenmodes ring out.',
		defaultPerimeter: 'rigid',
		defaultSource: { x: 54, y: 48 },
		defaultListener: { x: 166, y: 94 },
		recommendedToneHz: 245,
		buildGeometry: buildStoneBathhouse
	},
	{
		id: 'anechoic-chamber',
		name: 'Anechoic Foam Wedge Chamber',
		shortName: 'Anechoic Chamber',
		tagline: 'Deep porous foam wedges swallow reflections so only the direct arrival survives.',
		takeaway:
			'Watch the outgoing wave vanish into the wedges—producing a razor-thin RIR spike, near-zero tail, and soaring Clarity C₈₀.',
		defaultPerimeter: 'rigid',
		defaultSource: { x: 64, y: 72 },
		defaultListener: { x: 160, y: 72 },
		recommendedToneHz: 320,
		buildGeometry: buildAnechoicChamber
	},
	{
		id: 'helmholtz-trap',
		name: 'Helmholtz Resonator Duct',
		shortName: 'Helmholtz Trap',
		tagline: 'A side-branch cavity traps its 245 Hz resonance while passing higher frequencies.',
		takeaway:
			'At ~245 Hz the neck air plug oscillates out of phase with the duct and cancels downstream transmission; at 420 Hz the duct carries sound straight past.',
		defaultPerimeter: 'open',
		defaultSource: { x: 46, y: 68 },
		defaultListener: { x: 174, y: 68 },
		recommendedToneHz: 245,
		buildGeometry: buildHelmholtzTrap
	}
] as const;

export const DEFAULT_PRESET_ID: PresetId = 'elliptical-whispering-gallery';

export function getPresetById(id: string): PresetDefinition {
	return PRESETS.find((p) => p.id === id) ?? PRESETS[0];
}
