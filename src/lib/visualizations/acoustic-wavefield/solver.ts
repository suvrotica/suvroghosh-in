import { findNearestAirCell, getPresetById } from './presets';
import { createPrng } from './prng';
import {
	CELL_COUNT,
	CHLADNI_COUNT,
	COURANT,
	DT,
	GRID_NX,
	GRID_NY,
	MAT_ABSORBER,
	MAT_AIR,
	MAT_DIFFUSER,
	MAT_LENS,
	MAT_RESONATOR,
	MAT_WALL,
	PML_WIDTH,
	RICKER_DELAY_S,
	RICKER_F0_HZ,
	RIR_BUFFER_LENGTH,
	type ExcitationMode,
	type GridPoint,
	type PerimeterMode,
	type PresetId,
	type SimulationState
} from './types';

const INV_6 = 1 / 6;

// Axial and diagonal neighbor offsets for 9-point isotropic Laplacian
const AXIAL_DX = [-1, 1, 0, 0] as const;
const AXIAL_DY = [0, 0, -1, 1] as const;
const DIAG_DX = [-1, 1, -1, 1] as const;
const DIAG_DY = [-1, -1, 1, 1] as const;

/**
 * Compute physical speed ratio c/c0 and dimensionless damping gamma = 0.5 * sigma * dt,
 * plus 8-bit symmetry-preserving Neumann reflection mask (with axial-shoulder blocking).
 */
export function rebuildMaterialProperties(state: SimulationState): void {
	const {
		material,
		cRel,
		gamma,
		cCurr,
		cPrev,
		cLap,
		wallMask,
		interiorAirCells,
		maskedAirCells,
		perimeter
	} = state;
	const isOpen = perimeter === 'open';
	const yStart = isOpen ? 1 : 0;
	const yEnd = isOpen ? GRID_NY - 1 : GRID_NY;
	const xStart = isOpen ? 1 : 0;
	const xEnd = isOpen ? GRID_NX - 1 : GRID_NX;

	let interiorCount = 0;
	let maskedCount = 0;

	for (let y = 0; y < GRID_NY; y++) {
		const dyEdge = Math.min(y, GRID_NY - 1 - y);
		const row = y * GRID_NX;
		for (let x = 0; x < GRID_NX; x++) {
			const i = row + x;
			const mat = material[i];

			let c = 1.0;
			let g = 0.000045;
			if (mat === MAT_ABSORBER) {
				c = 0.85;
				g = 0.115;
			} else if (mat === MAT_DIFFUSER) {
				c = 1.0;
				g = 0.004;
			} else if (mat === MAT_LENS) {
				c = 0.55;
				g = 0.0004;
			} else if (mat === MAT_RESONATOR) {
				c = 1.0;
				g = 0.008;
			}

			if (isOpen && mat !== MAT_WALL) {
				const dEdge = Math.min(x, GRID_NX - 1 - x, dyEdge);
				if (dEdge < PML_WIDTH) {
					const depth = (PML_WIDTH - dEdge) / PML_WIDTH;
					g += 0.28 * depth * depth * depth;
				}
			}

			cRel[i] = c;
			gamma[i] = g;
			const invOnePlusG = 1 / (1 + g);
			const lam = COURANT * c;
			cCurr[i] = 2 * invOnePlusG;
			cPrev[i] = (1 - g) * invOnePlusG;
			cLap[i] = lam * lam * invOnePlusG;

			if (mat === MAT_WALL) {
				wallMask[i] = 0xff;
				state.p[i] = 0;
				state.pPrev[i] = 0;
				state.pNext[i] = 0;
				continue;
			}

			let mask = 0;
			// Bits 0..3: axial neighbors
			for (let k = 0; k < 4; k++) {
				const nx = x + AXIAL_DX[k];
				const ny = y + AXIAL_DY[k];
				const blocked =
					nx < 0 || nx >= GRID_NX || ny < 0 || ny >= GRID_NY
						? !isOpen
						: material[ny * GRID_NX + nx] === MAT_WALL;
				if (blocked) mask |= 1 << k;
			}
			// Bits 4..7: diagonal neighbors with symmetric axial-shoulder blocking
			for (let k = 0; k < 4; k++) {
				const dx = DIAG_DX[k];
				const dy = DIAG_DY[k];
				const nx = x + dx;
				const ny = y + dy;
				let blocked = false;
				if (nx < 0 || nx >= GRID_NX || ny < 0 || ny >= GRID_NY) {
					blocked = !isOpen;
				} else if (material[ny * GRID_NX + nx] === MAT_WALL) {
					blocked = true;
				} else {
					const sxMat = material[y * GRID_NX + (x + dx)];
					const syMat = material[(y + dy) * GRID_NX + x];
					if (sxMat === MAT_WALL && syMat === MAT_WALL) {
						blocked = true;
					}
				}
				if (blocked) mask |= 1 << (k + 4);
			}
			wallMask[i] = mask;

			if (y >= yStart && y < yEnd && x >= xStart && x < xEnd) {
				if (mask === 0 && y > 0 && y < GRID_NY - 1 && x > 0 && x < GRID_NX - 1) {
					interiorAirCells[interiorCount++] = i;
				} else {
					maskedAirCells[maskedCount++] = i;
				}
			}
		}
	}

	state.interiorAirCount = interiorCount;
	state.maskedAirCount = maskedCount;
}

export function scatterChladniParticles(state: SimulationState, seed = 20261121): void {
	const rng = createPrng(seed);
	const { material, chladniX, chladniY, chladniPrevX, chladniPrevY, chladniAngle } = state;

	// Collect valid traversable AIR cells so particles always start cleanly inside the room
	const airIndices: number[] = [];
	for (let y = 3; y < GRID_NY - 3; y++) {
		const row = y * GRID_NX;
		for (let x = 3; x < GRID_NX - 3; x++) {
			const mat = material[row + x];
			if (mat === MAT_AIR || mat === MAT_LENS || mat === MAT_RESONATOR) {
				airIndices.push(row + x);
			}
		}
	}

	const count = chladniX.length;
	for (let k = 0; k < count; k++) {
		if (airIndices.length > 0) {
			const pick = airIndices[Math.floor(rng() * airIndices.length)];
			const px = (pick % GRID_NX) + (rng() - 0.5) * 0.8;
			const py = Math.floor(pick / GRID_NX) + (rng() - 0.5) * 0.8;
			chladniX[k] = px;
			chladniY[k] = py;
			chladniPrevX[k] = px;
			chladniPrevY[k] = py;
		} else {
			chladniX[k] = GRID_NX * 0.5;
			chladniY[k] = GRID_NY * 0.5;
			chladniPrevX[k] = GRID_NX * 0.5;
			chladniPrevY[k] = GRID_NY * 0.5;
		}
		chladniAngle[k] = rng() * Math.PI * 2;
	}
}

export function createSimulation(
	presetId: PresetId = 'elliptical-whispering-gallery',
	options?: {
		perimeter?: PerimeterMode;
		source?: GridPoint;
		listener?: GridPoint;
		toneHz?: number;
		chladniEnabled?: boolean;
	}
): SimulationState {
	const preset = getPresetById(presetId);
	const material = new Uint8Array(CELL_COUNT);
	preset.buildGeometry(material);

	const source = findNearestAirCell(material, options?.source ?? preset.defaultSource);
	const listener = findNearestAirCell(material, options?.listener ?? preset.defaultListener);

	const state: SimulationState = {
		presetId: preset.id,
		perimeter: options?.perimeter ?? preset.defaultPerimeter,
		material,
		wallMask: new Uint8Array(CELL_COUNT),
		cRel: new Float32Array(CELL_COUNT),
		gamma: new Float32Array(CELL_COUNT),
		cCurr: new Float32Array(CELL_COUNT),
		cPrev: new Float32Array(CELL_COUNT),
		cLap: new Float32Array(CELL_COUNT),
		interiorAirCells: new Int32Array(CELL_COUNT),
		interiorAirCount: 0,
		maskedAirCells: new Int32Array(CELL_COUNT),
		maskedAirCount: 0,
		p: new Float32Array(CELL_COUNT),
		pPrev: new Float32Array(CELL_COUNT),
		pNext: new Float32Array(CELL_COUNT),
		eRms: new Float32Array(CELL_COUNT),
		eRef: 1e-4,
		chladniX: new Float32Array(CHLADNI_COUNT),
		chladniY: new Float32Array(CHLADNI_COUNT),
		chladniPrevX: new Float32Array(CHLADNI_COUNT),
		chladniPrevY: new Float32Array(CHLADNI_COUNT),
		chladniAngle: new Float32Array(CHLADNI_COUNT),
		chladniEnabled: options?.chladniEnabled ?? true,
		source,
		listener,
		excitationMode: 'clap',
		excitationActive: false,
		excitationStartStep: 0,
		toneHz: options?.toneHz ?? preset.recommendedToneHz,
		stepCount: 0,
		rirCapturing: false,
		rirWriteIndex: 0,
		liveRir: new Float32Array(RIR_BUFFER_LENGTH)
	};

	rebuildMaterialProperties(state);
	scatterChladniParticles(state);
	return state;
}

export function clearWavefield(state: SimulationState): void {
	state.p.fill(0);
	state.pPrev.fill(0);
	state.pNext.fill(0);
	state.eRms.fill(0);
	state.eRef = 1e-4;
	state.excitationActive = false;
	state.rirCapturing = false;
	state.rirWriteIndex = 0;
}

export function resetPreset(state: SimulationState, presetId: PresetId): void {
	const preset = getPresetById(presetId);
	state.presetId = preset.id;
	state.perimeter = preset.defaultPerimeter;
	preset.buildGeometry(state.material);
	state.source = findNearestAirCell(state.material, preset.defaultSource);
	state.listener = findNearestAirCell(state.material, preset.defaultListener);
	state.toneHz = preset.recommendedToneHz;
	clearWavefield(state);
	rebuildMaterialProperties(state);
	scatterChladniParticles(state);
}

export function snapBeaconsToAir(state: SimulationState): void {
	state.source = findNearestAirCell(state.material, state.source);
	state.listener = findNearestAirCell(state.material, state.listener);
}

export function triggerExcitation(
	state: SimulationState,
	mode: ExcitationMode,
	resetFieldForClap = false
): void {
	if (resetFieldForClap) {
		state.p.fill(0);
		state.pPrev.fill(0);
		state.pNext.fill(0);
		state.eRms.fill(0);
		state.eRef = 1e-4;
	}
	state.excitationMode = mode;
	state.excitationActive = true;
	state.excitationStartStep = state.stepCount;
	if (mode === 'clap') {
		state.rirCapturing = true;
		state.rirWriteIndex = 0;
		state.liveRir.fill(0);
	}
}

export function sampleSourceWaveform(state: SimulationState): number {
	if (!state.excitationActive) return 0;
	const elapsedSteps = state.stepCount - state.excitationStartStep;
	const t = elapsedSteps * DT;

	if (state.excitationMode === 'clap') {
		// Causal Ricker wavelet centered at td = 1.4 / f0; negligible past 2.6 * td
		if (t > 2.8 * RICKER_DELAY_S) {
			state.excitationActive = false;
			return 0;
		}
		const u = Math.PI * RICKER_F0_HZ * (t - RICKER_DELAY_S);
		const u2 = u * u;
		return 1.6 * (1 - 2 * u2) * Math.exp(-u2);
	}

	if (state.excitationMode === 'tone') {
		const ramp = Math.min(1, t / 0.003);
		return 0.75 * ramp * Math.sin(2 * Math.PI * state.toneHz * t);
	}

	// Exponential chirp sweep 80 -> 850 Hz over 1.2 s
	const sweepT = 1.2;
	if (t > sweepT) {
		state.excitationActive = false;
		return 0;
	}
	const f0 = 80;
	const f1 = 850;
	const k = Math.log(f1 / f0) / sweepT;
	const phase = (2 * Math.PI * f0 * (Math.exp(k * t) - 1)) / k;
	const ramp = Math.min(1, t / 0.004) * Math.min(1, (sweepT - t) / 0.01);
	return 0.75 * ramp * Math.sin(phase);
}

/**
 * Bilinear sample of pressure field p at fractional grid point (gx, gy), ignoring WALL cells.
 */
export function sampleFieldBilinear(
	field: Float32Array,
	material: Uint8Array,
	gx: number,
	gy: number
): number {
	const x0 = Math.max(0, Math.min(GRID_NX - 2, Math.floor(gx)));
	const y0 = Math.max(0, Math.min(GRID_NY - 2, Math.floor(gy)));
	const fx = Math.max(0, Math.min(1, gx - x0));
	const fy = Math.max(0, Math.min(1, gy - y0));

	const i00 = y0 * GRID_NX + x0;
	const i10 = i00 + 1;
	const i01 = i00 + GRID_NX;
	const i11 = i01 + 1;

	const w00 = material[i00] === MAT_WALL ? 0 : (1 - fx) * (1 - fy);
	const w10 = material[i10] === MAT_WALL ? 0 : fx * (1 - fy);
	const w01 = material[i01] === MAT_WALL ? 0 : (1 - fx) * fy;
	const w11 = material[i11] === MAT_WALL ? 0 : fx * fy;
	const wSum = w00 + w10 + w01 + w11;
	if (wSum <= 1e-8) return 0;

	return (w00 * field[i00] + w10 * field[i10] + w01 * field[i01] + w11 * field[i11]) / wSum;
}

/**
 * Adjoint-symmetric bilinear source injection into pNext.
 */
function injectSourceBilinear(
	pNext: Float32Array,
	material: Uint8Array,
	gamma: Float32Array,
	source: GridPoint,
	amplitude: number
): void {
	if (amplitude === 0) return;
	const x0 = Math.max(0, Math.min(GRID_NX - 2, Math.floor(source.x)));
	const y0 = Math.max(0, Math.min(GRID_NY - 2, Math.floor(source.y)));
	const fx = Math.max(0, Math.min(1, source.x - x0));
	const fy = Math.max(0, Math.min(1, source.y - y0));

	const i00 = y0 * GRID_NX + x0;
	const i10 = i00 + 1;
	const i01 = i00 + GRID_NX;
	const i11 = i01 + 1;

	const w00 = material[i00] === MAT_WALL ? 0 : (1 - fx) * (1 - fy);
	const w10 = material[i10] === MAT_WALL ? 0 : fx * (1 - fy);
	const w01 = material[i01] === MAT_WALL ? 0 : (1 - fx) * fy;
	const w11 = material[i11] === MAT_WALL ? 0 : fx * fy;
	const wSum = w00 + w10 + w01 + w11;
	if (wSum <= 1e-8) return;

	const scale = amplitude / wSum;
	if (w00 > 0) pNext[i00] += (w00 * scale) / (1 + gamma[i00]);
	if (w10 > 0) pNext[i10] += (w10 * scale) / (1 + gamma[i10]);
	if (w01 > 0) pNext[i01] += (w01 * scale) / (1 + gamma[i01]);
	if (w11 > 0) pNext[i11] += (w11 * scale) / (1 + gamma[i11]);
}

function isChladniFluid(mat: number): boolean {
	return mat === MAT_AIR || mat === MAT_LENS || mat === MAT_RESONATOR;
}

function stepChladniParticles(state: SimulationState, substeps: number): void {
	if (!state.chladniEnabled || state.eRef <= 1e-8) return;
	const { eRms, material, chladniX, chladniY, chladniPrevX, chladniPrevY, chladniAngle, eRef } =
		state;

	const invRef = 1 / eRef;
	const kappaDrift = 0.14 * Math.min(3, substeps * 0.35);
	const kappaJitter = 0.075 * Math.min(3, substeps * 0.35);
	const count = chladniX.length;

	for (let k = 0; k < count; k++) {
		const px = chladniX[k];
		const py = chladniY[k];
		const ix = Math.max(1, Math.min(GRID_NX - 2, Math.round(px)));
		const iy = Math.max(1, Math.min(GRID_NY - 2, Math.round(py)));
		const centerIdx = iy * GRID_NX + ix;

		const eCenter = eRms[centerIdx];
		const u = Math.min(1, Math.sqrt(Math.max(0, eCenter * invRef)));
		if (u < 0.008) continue;

		// Central difference gradient of RMS energy (only across fluid cells)
		const eL = isChladniFluid(material[centerIdx - 1]) ? eRms[centerIdx - 1] : eCenter;
		const eR = isChladniFluid(material[centerIdx + 1]) ? eRms[centerIdx + 1] : eCenter;
		const eU = isChladniFluid(material[centerIdx - GRID_NX]) ? eRms[centerIdx - GRID_NX] : eCenter;
		const eD = isChladniFluid(material[centerIdx + GRID_NX]) ? eRms[centerIdx + GRID_NX] : eCenter;

		const gx = 0.5 * (eR - eL);
		const gy = 0.5 * (eD - eU);
		const gNorm = Math.sqrt(gx * gx + gy * gy + 1e-16);

		// Deterministic swirling agitation angle
		const ang = (chladniAngle[k] = (chladniAngle[k] + 0.43 + u * 0.71) % (Math.PI * 2));
		const nx = px - kappaDrift * (gx / gNorm) * u + kappaJitter * u * Math.cos(ang);
		const ny = py - kappaDrift * (gy / gNorm) * u + kappaJitter * u * Math.sin(ang);

		const nix = Math.max(1, Math.min(GRID_NX - 2, Math.round(nx)));
		const niy = Math.max(1, Math.min(GRID_NY - 2, Math.round(ny)));
		if (isChladniFluid(material[niy * GRID_NX + nix])) {
			chladniPrevX[k] = px;
			chladniPrevY[k] = py;
			chladniX[k] = Math.max(1.5, Math.min(GRID_NX - 2.5, nx));
			chladniY[k] = Math.max(1.5, Math.min(GRID_NY - 2.5, ny));
		} else {
			// Reflect cleanly back to last valid AIR coordinate
			chladniX[k] = chladniPrevX[k];
			chladniY[k] = chladniPrevY[k];
			chladniAngle[k] = (ang + Math.PI) % (Math.PI * 2);
		}
	}
}

function stepInteriorNoRms(
	interiorAirCells: Int32Array,
	interiorAirCount: number,
	maskedAirCells: Int32Array,
	maskedAirCount: number,
	wallMask: Uint8Array,
	cCurr: Float32Array,
	cPrev: Float32Array,
	cLap: Float32Array,
	p: Float32Array,
	pPrev: Float32Array,
	pNext: Float32Array
): void {
	const nx = GRID_NX;
	const nxp1 = nx + 1;
	const nxm1 = nx - 1;
	const inv6 = INV_6;
	for (let k = 0; k < interiorAirCount; k++) {
		const i = interiorAirCells[k];
		const p0 = p[i];
		const lap =
			(4 * (p[i - 1] + p[i + 1] + p[i - nx] + p[i + nx]) +
				(p[i - nxp1] + p[i - nxm1] + p[i + nxm1] + p[i + nxp1]) -
				20 * p0) *
			inv6;
		pNext[i] = cCurr[i] * p0 - cPrev[i] * pPrev[i] + cLap[i] * lap;
	}
	for (let k = 0; k < maskedAirCount; k++) {
		const i = maskedAirCells[k];
		const p0 = p[i];
		const m = wallMask[i];
		const pL = m & 1 ? p0 : p[i - 1];
		const pR = m & 2 ? p0 : p[i + 1];
		const pU = m & 4 ? p0 : p[i - nx];
		const pD = m & 8 ? p0 : p[i + nx];
		const pUL = m & 16 ? p0 : p[i - nxp1];
		const pUR = m & 32 ? p0 : p[i - nxm1];
		const pDL = m & 64 ? p0 : p[i + nxm1];
		const pDR = m & 128 ? p0 : p[i + nxp1];
		const lap = (4 * (pL + pR + pU + pD) + (pUL + pUR + pDL + pDR) - 20 * p0) * inv6;
		pNext[i] = cCurr[i] * p0 - cPrev[i] * pPrev[i] + cLap[i] * lap;
	}
}

function stepInteriorWithRms(
	interiorAirCells: Int32Array,
	interiorAirCount: number,
	maskedAirCells: Int32Array,
	maskedAirCount: number,
	wallMask: Uint8Array,
	cCurr: Float32Array,
	cPrev: Float32Array,
	cLap: Float32Array,
	p: Float32Array,
	pPrev: Float32Array,
	pNext: Float32Array,
	eRms: Float32Array
): number {
	const nx = GRID_NX;
	const nxp1 = nx + 1;
	const nxm1 = nx - 1;
	const inv6 = INV_6;
	const alphaRms = 0.035;
	const oneMinusAlpha = 1 - alphaRms;
	let frameMaxE = 0;

	for (let k = 0; k < interiorAirCount; k++) {
		const i = interiorAirCells[k];
		const p0 = p[i];
		const lap =
			(4 * (p[i - 1] + p[i + 1] + p[i - nx] + p[i + nx]) +
				(p[i - nxp1] + p[i - nxm1] + p[i + nxm1] + p[i + nxp1]) -
				20 * p0) *
			inv6;
		const nextVal = cCurr[i] * p0 - cPrev[i] * pPrev[i] + cLap[i] * lap;
		pNext[i] = nextVal;
		const eVal = oneMinusAlpha * eRms[i] + alphaRms * nextVal * nextVal;
		eRms[i] = eVal;
		if (eVal > frameMaxE) frameMaxE = eVal;
	}
	for (let k = 0; k < maskedAirCount; k++) {
		const i = maskedAirCells[k];
		const p0 = p[i];
		const m = wallMask[i];
		const pL = m & 1 ? p0 : p[i - 1];
		const pR = m & 2 ? p0 : p[i + 1];
		const pU = m & 4 ? p0 : p[i - nx];
		const pD = m & 8 ? p0 : p[i + nx];
		const pUL = m & 16 ? p0 : p[i - nxp1];
		const pUR = m & 32 ? p0 : p[i - nxm1];
		const pDL = m & 64 ? p0 : p[i + nxm1];
		const pDR = m & 128 ? p0 : p[i + nxp1];
		const lap = (4 * (pL + pR + pU + pD) + (pUL + pUR + pDL + pDR) - 20 * p0) * inv6;
		const nextVal = cCurr[i] * p0 - cPrev[i] * pPrev[i] + cLap[i] * lap;
		pNext[i] = nextVal;
		const eVal = oneMinusAlpha * eRms[i] + alphaRms * nextVal * nextVal;
		eRms[i] = eVal;
		if (eVal > frameMaxE) frameMaxE = eVal;
	}
	return frameMaxE;
}

function flushSubnormals(arr: Float32Array): void {
	for (let i = 0; i < arr.length; i++) {
		const v = arr[i];
		if (v > -1e-24 && v < 1e-24 && v !== 0) arr[i] = 0;
	}
}

/**
 * Advance FDTD wavefield, RMS pressure field, Chladni grains, and RIR capture by `steps` substeps.
 */
export function stepSimulation(state: SimulationState, steps = 1, updateChladni = true): void {
	const isOpen = state.perimeter === 'open';
	const trackRms = state.chladniEnabled || updateChladni;
	const {
		material,
		wallMask,
		gamma,
		cCurr,
		cPrev,
		cLap,
		interiorAirCells,
		interiorAirCount,
		maskedAirCells,
		maskedAirCount
	} = state;
	const murCoeff = (COURANT - 1) / (COURANT + 1);

	for (let s = 0; s < steps; s++) {
		const p = state.p;
		const pPrev = state.pPrev;
		const pNext = state.pNext;
		const eRms = state.eRms;
		const srcVal = sampleSourceWaveform(state);

		let frameMaxE = 0;
		if (trackRms) {
			frameMaxE = stepInteriorWithRms(
				interiorAirCells,
				interiorAirCount,
				maskedAirCells,
				maskedAirCount,
				wallMask,
				cCurr,
				cPrev,
				cLap,
				p,
				pPrev,
				pNext,
				eRms
			);
		} else {
			stepInteriorNoRms(
				interiorAirCells,
				interiorAirCount,
				maskedAirCells,
				maskedAirCount,
				wallMask,
				cCurr,
				cPrev,
				cLap,
				p,
				pPrev,
				pNext
			);
		}

		// Periodically flush IEEE-754 subnormals to prevent CPU microcode penalties
		if ((state.stepCount & 255) === 255) {
			flushSubnormals(pNext);
			if (trackRms) flushSubnormals(eRms);
		}

		// 1st-order Mur absorbing rim on outer 1-cell border in open PML mode
		if (isOpen) {
			for (let x = 1; x < GRID_NX - 1; x++) {
				// Top edge (y = 0)
				if (material[x] !== MAT_WALL) {
					const inner = x + GRID_NX;
					pNext[x] = p[inner] + murCoeff * (pNext[inner] - p[x]);
				}
				// Bottom edge (y = GRID_NY - 1)
				const bot = (GRID_NY - 1) * GRID_NX + x;
				if (material[bot] !== MAT_WALL) {
					const inner = bot - GRID_NX;
					pNext[bot] = p[inner] + murCoeff * (pNext[inner] - p[bot]);
				}
			}
			for (let y = 1; y < GRID_NY - 1; y++) {
				const row = y * GRID_NX;
				// Left edge (x = 0)
				if (material[row] !== MAT_WALL) {
					pNext[row] = p[row + 1] + murCoeff * (pNext[row + 1] - p[row]);
				}
				// Right edge (x = GRID_NX - 1)
				const right = row + GRID_NX - 1;
				if (material[right] !== MAT_WALL) {
					pNext[right] = p[right - 1] + murCoeff * (pNext[right - 1] - p[right]);
				}
			}
			// Corners
			pNext[0] = 0.5 * (pNext[1] + pNext[GRID_NX]);
			pNext[GRID_NX - 1] = 0.5 * (pNext[GRID_NX - 2] + pNext[2 * GRID_NX - 1]);
			const bl = (GRID_NY - 1) * GRID_NX;
			pNext[bl] = 0.5 * (pNext[bl + 1] + pNext[bl - GRID_NX]);
			const br = CELL_COUNT - 1;
			pNext[br] = 0.5 * (pNext[br - 1] + pNext[br - GRID_NX]);
		}

		// Inject source symmetrically into pNext
		if (srcVal !== 0) {
			injectSourceBilinear(pNext, material, gamma, state.source, srcVal);
		}

		// Smooth adaptive reference for Chladni particle scaling
		state.eRef = 0.985 * state.eRef + 0.015 * Math.max(frameMaxE, 1e-5);

		// Rotate field buffers (pPrev <- p <- pNext)
		state.pPrev = p;
		state.p = pNext;
		state.pNext = pPrev;
		state.stepCount += 1;

		// Sample listener pressure into RIR buffer
		if (state.rirCapturing) {
			state.liveRir[state.rirWriteIndex] = sampleFieldBilinear(
				state.p,
				material,
				state.listener.x,
				state.listener.y
			);
			state.rirWriteIndex += 1;
			if (state.rirWriteIndex >= RIR_BUFFER_LENGTH) {
				state.rirCapturing = false;
			}
		}
	}

	if (updateChladni) {
		stepChladniParticles(state, steps);
	}
}

/**
 * Compute total instantaneous squared-pressure field energy across all non-wall cells.
 */
export function computeFieldEnergy(state: SimulationState): number {
	let sum = 0;
	const { p, material } = state;
	for (let i = 0; i < CELL_COUNT; i++) {
		if (material[i] !== MAT_WALL) {
			const v = p[i];
			sum += v * v;
		}
	}
	return sum;
}

/**
 * Headless synchronous full 1.2 s RIR capture for a given room snapshot.
 * Dedicated Float64Array contiguous-span FDTD kernel preserving exact physics
 * and self-adjoint reciprocity while eliminating indirect gathers and float32 conversions.
 * Used by Web Worker (`rir-capture.worker.ts`) and headless Vitest verification.
 */
export function runSynchronousRirCapture(params: {
	material: Uint8Array;
	perimeter: PerimeterMode;
	source: GridPoint;
	listener: GridPoint;
	steps?: number;
}): Float32Array {
	const steps = params.steps ?? RIR_BUFFER_LENGTH;
	const nx = GRID_NX;
	const ny = GRID_NY;
	const nxp1 = nx + 1;
	const nxm1 = nx - 1;
	const cellCount = CELL_COUNT;
	const isOpen = params.perimeter === 'open';

	const material = new Uint8Array(params.material);
	const wallMask = new Uint8Array(cellCount);
	const cCenter = new Float64Array(cellCount);
	const cPrev = new Float64Array(cellCount);
	const cLap6 = new Float64Array(cellCount);
	const gamma = new Float64Array(cellCount);
	const isUniformAir = new Uint8Array(cellCount);

	const yStart = isOpen ? 1 : 0;
	const yEnd = isOpen ? ny - 1 : ny;
	const xStart = isOpen ? 1 : 0;
	const xEnd = isOpen ? nx - 1 : nx;

	// Precomputed uniform air constants
	const gAir = 0.000045;
	const invOnePlusGAir = 1 / (1 + gAir);
	const kPrevAir = (1 - gAir) * invOnePlusGAir;
	const kLap6Air = (COURANT * COURANT * invOnePlusGAir) / 6;
	const kCenterAir = 2 * invOnePlusGAir - 20 * kLap6Air;

	const mCellsBuf = new Int32Array(cellCount);
	const mMasksBuf = new Uint8Array(cellCount);
	let mCount = 0;

	for (let y = 0; y < ny; y++) {
		const dyEdge = Math.min(y, ny - 1 - y);
		const row = y * nx;
		for (let x = 0; x < nx; x++) {
			const i = row + x;
			const mat = material[i];

			let c = 1.0;
			let g = gAir;
			if (mat === MAT_ABSORBER) {
				c = 0.85;
				g = 0.115;
			} else if (mat === MAT_DIFFUSER) {
				c = 1.0;
				g = 0.004;
			} else if (mat === MAT_LENS) {
				c = 0.55;
				g = 0.0004;
			} else if (mat === MAT_RESONATOR) {
				c = 1.0;
				g = 0.008;
			}

			let inPml = false;
			if (isOpen && mat !== MAT_WALL) {
				const dEdge = Math.min(x, nx - 1 - x, dyEdge);
				if (dEdge < PML_WIDTH) {
					const depth = (PML_WIDTH - dEdge) / PML_WIDTH;
					g += 0.28 * depth * depth * depth;
					inPml = true;
				}
			}

			gamma[i] = g;
			const invOnePlusG = 1 / (1 + g);
			const lam = COURANT * c;
			const lap6 = (lam * lam * invOnePlusG) / 6;
			cLap6[i] = lap6;
			cCenter[i] = 2 * invOnePlusG - 20 * lap6;
			cPrev[i] = (1 - g) * invOnePlusG;

			if (mat === MAT_WALL) {
				wallMask[i] = 0xff;
				continue;
			}

			let mask = 0;
			for (let k = 0; k < 4; k++) {
				const nxNbr = x + AXIAL_DX[k];
				const nyNbr = y + AXIAL_DY[k];
				const blocked =
					nxNbr < 0 || nxNbr >= nx || nyNbr < 0 || nyNbr >= ny
						? !isOpen
						: material[nyNbr * nx + nxNbr] === MAT_WALL;
				if (blocked) mask |= 1 << k;
			}
			for (let k = 0; k < 4; k++) {
				const dx = DIAG_DX[k];
				const dy = DIAG_DY[k];
				const nxNbr = x + dx;
				const nyNbr = y + dy;
				let blocked = false;
				if (nxNbr < 0 || nxNbr >= nx || nyNbr < 0 || nyNbr >= ny) {
					blocked = !isOpen;
				} else if (material[nyNbr * nx + nxNbr] === MAT_WALL) {
					blocked = true;
				} else {
					const sxMat = material[y * nx + (x + dx)];
					const syMat = material[(y + dy) * nx + x];
					if (sxMat === MAT_WALL && syMat === MAT_WALL) {
						blocked = true;
					}
				}
				if (blocked) mask |= 1 << (k + 4);
			}
			wallMask[i] = mask;

			if (y >= yStart && y < yEnd && x >= xStart && x < xEnd) {
				if (mask === 0 && y > 0 && y < ny - 1 && x > 0 && x < nx - 1) {
					if (mat === MAT_AIR && !inPml) {
						isUniformAir[i] = 1;
					}
				} else {
					mCellsBuf[mCount] = i;
					mMasksBuf[mCount] = mask;
					mCount++;
				}
			}
		}
	}

	const mCells = mCellsBuf.subarray(0, mCount);
	const mMasks = mMasksBuf.subarray(0, mCount);

	// Build contiguous horizontal runs for interior unmasked uniform-air (uSpans) and variable/PML (vSpans)
	const uSpansBuf = new Int32Array(cellCount);
	const vSpansBuf = new Int32Array(cellCount);
	let uLen = 0;
	let vLen = 0;

	for (let y = 1; y < ny - 1; y++) {
		const row = y * nx;
		let x = 1;
		while (x < nx - 1) {
			const i = row + x;
			if (material[i] === MAT_WALL || wallMask[i] !== 0) {
				x++;
				continue;
			}
			const uniform = isUniformAir[i] === 1;
			const start = i;
			x++;
			while (x < nx - 1) {
				const j = row + x;
				if (material[j] === MAT_WALL || wallMask[j] !== 0) break;
				if ((isUniformAir[j] === 1) !== uniform) break;
				x++;
			}
			const end = row + x;
			if (uniform) {
				uSpansBuf[uLen++] = start;
				uSpansBuf[uLen++] = end;
			} else {
				vSpansBuf[vLen++] = start;
				vSpansBuf[vLen++] = end;
			}
		}
	}

	const uSpans = uSpansBuf.subarray(0, uLen);
	const vSpans = vSpansBuf.subarray(0, vLen);

	// Precompute source & listener bilinear injection/sampling weights
	const src = findNearestAirCell(material, params.source);
	const sx0 = Math.max(0, Math.min(nx - 2, Math.floor(src.x)));
	const sy0 = Math.max(0, Math.min(ny - 2, Math.floor(src.y)));
	const sfx = Math.max(0, Math.min(1, src.x - sx0));
	const sfy = Math.max(0, Math.min(1, src.y - sy0));
	const si00 = sy0 * nx + sx0;
	const si10 = si00 + 1;
	const si01 = si00 + nx;
	const si11 = si01 + 1;
	const sw00 = material[si00] === MAT_WALL ? 0 : (1 - sfx) * (1 - sfy);
	const sw10 = material[si10] === MAT_WALL ? 0 : sfx * (1 - sfy);
	const sw01 = material[si01] === MAT_WALL ? 0 : (1 - sfx) * sfy;
	const sw11 = material[si11] === MAT_WALL ? 0 : sfx * sfy;
	const swSum = sw00 + sw10 + sw01 + sw11;
	const hasSource = swSum > 1e-8;
	const sc00 = hasSource && sw00 > 0 ? sw00 / (swSum * (1 + gamma[si00])) : 0;
	const sc10 = hasSource && sw10 > 0 ? sw10 / (swSum * (1 + gamma[si10])) : 0;
	const sc01 = hasSource && sw01 > 0 ? sw01 / (swSum * (1 + gamma[si01])) : 0;
	const sc11 = hasSource && sw11 > 0 ? sw11 / (swSum * (1 + gamma[si11])) : 0;

	const lst = findNearestAirCell(material, params.listener);
	const lx0 = Math.max(0, Math.min(nx - 2, Math.floor(lst.x)));
	const ly0 = Math.max(0, Math.min(ny - 2, Math.floor(lst.y)));
	const lfx = Math.max(0, Math.min(1, lst.x - lx0));
	const lfy = Math.max(0, Math.min(1, lst.y - ly0));
	const li00 = ly0 * nx + lx0;
	const li10 = li00 + 1;
	const li01 = li00 + nx;
	const li11 = li01 + 1;
	const lw00 = material[li00] === MAT_WALL ? 0 : (1 - lfx) * (1 - lfy);
	const lw10 = material[li10] === MAT_WALL ? 0 : lfx * (1 - lfy);
	const lw01 = material[li01] === MAT_WALL ? 0 : (1 - lfx) * lfy;
	const lw11 = material[li11] === MAT_WALL ? 0 : lfx * lfy;
	const lwSum = lw00 + lw10 + lw01 + lw11;
	const hasListener = lwSum > 1e-8;
	const lc00 = hasListener ? lw00 / lwSum : 0;
	const lc10 = hasListener ? lw10 / lwSum : 0;
	const lc01 = hasListener ? lw01 / lwSum : 0;
	const lc11 = hasListener ? lw11 / lwSum : 0;

	let p = new Float64Array(cellCount);
	let pPrev = new Float64Array(cellCount);
	let pNext = new Float64Array(cellCount);
	const liveRir = new Float32Array(steps);

	const murCoeff = (COURANT - 1) / (COURANT + 1);
	const rickerMaxT = 2.8 * RICKER_DELAY_S;
	const rickerPiF0 = Math.PI * RICKER_F0_HZ;
	const rickerCutoffStep = Math.floor(rickerMaxT / DT);
	const minSpanStart = nx + 1;
	const maxSpanEnd = cellCount - nx - 1;

	for (let step = 0; step < steps; step++) {
		// 1. Uniform air spans with vertical-sum shift register and BCE guards
		for (let s = 0; s < uLen; s += 2) {
			const start = uSpans[s] | 0;
			const end = uSpans[s + 1] | 0;
			if (start < minSpanStart || end > maxSpanEnd) continue;

			let pL = p[start - 1];
			let pC = p[start];
			let dL = p[start - 1 - nx] + p[start - 1 + nx];
			let dC = p[start - nx] + p[start + nx];

			for (let i = start; i < end; i++) {
				const pR = p[i + 1];
				const dR = p[i + 1 - nx] + p[i + 1 + nx];
				pNext[i] =
					kCenterAir * pC - kPrevAir * pPrev[i] + kLap6Air * (4 * (pL + pR + dC) + dL + dR);
				pL = pC;
				pC = pR;
				dL = dC;
				dC = dR;
			}
		}

		// 2. Variable-medium / PML unmasked spans
		for (let s = 0; s < vLen; s += 2) {
			const start = vSpans[s] | 0;
			const end = vSpans[s + 1] | 0;
			if (start < minSpanStart || end > maxSpanEnd) continue;

			let pL = p[start - 1];
			let pC = p[start];
			let dL = p[start - 1 - nx] + p[start - 1 + nx];
			let dC = p[start - nx] + p[start + nx];

			for (let i = start; i < end; i++) {
				const pR = p[i + 1];
				const dR = p[i + 1 - nx] + p[i + 1 + nx];
				pNext[i] =
					cCenter[i] * pC - cPrev[i] * pPrev[i] + cLap6[i] * (4 * (pL + pR + dC) + dL + dR);
				pL = pC;
				pC = pR;
				dL = dC;
				dC = dR;
			}
		}

		// 3. Masked wall-adjacent & rigid-perimeter air cells
		for (let k = 0; k < mCount; k++) {
			const i = mCells[k];
			const p0 = p[i];
			const m = mMasks[k];
			const pL = m & 1 ? p0 : p[i - 1];
			const pR = m & 2 ? p0 : p[i + 1];
			const pU = m & 4 ? p0 : p[i - nx];
			const pD = m & 8 ? p0 : p[i + nx];
			const pUL = m & 16 ? p0 : p[i - nxp1];
			const pUR = m & 32 ? p0 : p[i - nxm1];
			const pDL = m & 64 ? p0 : p[i + nxm1];
			const pDR = m & 128 ? p0 : p[i + nxp1];
			pNext[i] =
				cCenter[i] * p0 -
				cPrev[i] * pPrev[i] +
				cLap6[i] * (4 * (pL + pR + pU + pD) + pUL + pUR + pDL + pDR);
		}

		// 4. 1st-order Mur absorbing rim in open PML mode
		if (isOpen) {
			for (let x = 1; x < nx - 1; x++) {
				if (material[x] !== MAT_WALL) {
					const inner = x + nx;
					pNext[x] = p[inner] + murCoeff * (pNext[inner] - p[x]);
				}
				const bot = (ny - 1) * nx + x;
				if (material[bot] !== MAT_WALL) {
					const inner = bot - nx;
					pNext[bot] = p[inner] + murCoeff * (pNext[inner] - p[bot]);
				}
			}
			for (let y = 1; y < ny - 1; y++) {
				const row = y * nx;
				if (material[row] !== MAT_WALL) {
					pNext[row] = p[row + 1] + murCoeff * (pNext[row + 1] - p[row]);
				}
				const right = row + nx - 1;
				if (material[right] !== MAT_WALL) {
					pNext[right] = p[right - 1] + murCoeff * (pNext[right - 1] - p[right]);
				}
			}
			pNext[0] = 0.5 * (pNext[1] + pNext[nx]);
			pNext[nx - 1] = 0.5 * (pNext[nx - 2] + pNext[2 * nx - 1]);
			const bl = (ny - 1) * nx;
			pNext[bl] = 0.5 * (pNext[bl + 1] + pNext[bl - nx]);
			const br = cellCount - 1;
			pNext[br] = 0.5 * (pNext[br - 1] + pNext[br - nx]);
		}

		// 5. Short-circuited causal Ricker clap injection
		if (hasSource && step <= rickerCutoffStep) {
			const t = step * DT;
			if (t <= rickerMaxT) {
				const u = rickerPiF0 * (t - RICKER_DELAY_S);
				const u2 = u * u;
				const srcVal = 1.6 * (1 - 2 * u2) * Math.exp(-u2);
				if (srcVal !== 0) {
					if (sc00 > 0) pNext[si00] += sc00 * srcVal;
					if (sc10 > 0) pNext[si10] += sc10 * srcVal;
					if (sc01 > 0) pNext[si01] += sc01 * srcVal;
					if (sc11 > 0) pNext[si11] += sc11 * srcVal;
				}
			}
		}

		// 6. Rotate buffers (pPrev <- p <- pNext) and sample listener microphone
		const tmp = pPrev;
		pPrev = p;
		p = pNext;
		pNext = tmp;

		if (hasListener) {
			liveRir[step] = lc00 * p[li00] + lc10 * p[li10] + lc01 * p[li01] + lc11 * p[li11];
		}
	}

	return liveRir;
}
