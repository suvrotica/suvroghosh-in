const LUT_SIZE = 65536;
const LUT_MASK = LUT_SIZE - 1;

/**
 * Rational polynomial approximation to the standard normal inverse CDF (probit)
 * using only IEEE-754 basic arithmetic and Math.sqrt/Math.log once at module load,
 * normalized so the 65,536-entry symmetric table has exact mean 0 and unit variance.
 */
function inverseNormalCdf(p: number): number {
	const a1 = -39.69683028665376;
	const a2 = 220.9460984245205;
	const a3 = -275.9285104469687;
	const a4 = 138.357751867269;
	const a5 = -30.66479806614716;
	const a6 = 2.506628277459239;

	const b1 = -54.47609879822406;
	const b2 = 161.5858368580409;
	const b3 = -155.6989798598866;
	const b4 = 66.80131188771972;
	const b5 = -13.28068155288572;

	const c1 = -0.007784894002430293;
	const c2 = -0.3223964580411365;
	const c3 = -2.400758277161838;
	const c4 = -2.549732539343734;
	const c5 = 4.374664141464968;
	const c6 = 2.938163982698783;

	const d1 = 0.007784695709041462;
	const d2 = 0.3224671290700398;
	const d3 = 2.445134137142996;
	const d4 = 3.754408661907416;

	const pLow = 0.02425;
	const pHigh = 1 - pLow;

	if (p < pLow) {
		const q = Math.sqrt(-2 * Math.log(p));
		return (
			(((((c1 * q + c2) * q + c3) * q + c4) * q + c5) * q + c6) /
			((((d1 * q + d2) * q + d3) * q + d4) * q + 1)
		);
	}
	if (p <= pHigh) {
		const q = p - 0.5;
		const r = q * q;
		return (
			((((((a1 * r + a2) * r + a3) * r + a4) * r + a5) * r + a6) * q) /
			(((((b1 * r + b2) * r + b3) * r + b4) * r + b5) * r + 1)
		);
	}
	const q = Math.sqrt(-2 * Math.log(1 - p));
	return -(
		(((((c1 * q + c2) * q + c3) * q + c4) * q + c5) * q + c6) /
		((((d1 * q + d2) * q + d3) * q + d4) * q + 1)
	);
}

const NORMAL_LUT: Float32Array = (() => {
	const table = new Float32Array(LUT_SIZE);
	const half = LUT_SIZE >> 1;
	let sumSq = 0;

	for (let i = 0; i < half; i += 1) {
		const p = (i + 0.5) / LUT_SIZE;
		const z = inverseNormalCdf(p);
		table[i] = z;
		table[LUT_SIZE - 1 - i] = -z;
		sumSq += 2 * z * z;
	}

	const std = Math.sqrt(sumSq / LUT_SIZE);
	for (let i = 0; i < LUT_SIZE; i += 1) {
		table[i] = table[i] / std;
	}
	return table;
})();

/**
 * Pure 32-bit integer avalanche mixer for a 4-tuple key:
 * (seed, particleId, simulationStep, component).
 */
export function hashKey32(
	seed: number,
	particleId: number,
	simulationStep: number,
	component: number
): number {
	let h = (seed | 0) ^ Math.imul(particleId | 0, 0x9e3779b1);
	h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
	h ^= Math.imul(simulationStep | 0, 0xc2b2ae35) + Math.imul((component + 1) | 0, 0x27d4eb2f);
	h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
	return (h ^ (h >>> 16)) >>> 0;
}

/**
 * Deterministic uniform sample in (0, 1) keyed by (seed, particleId, simulationStep, component).
 */
export function sampleUniform01(
	seed: number,
	particleId: number,
	simulationStep: number,
	component: number
): number {
	const h = hashKey32(seed, particleId, simulationStep, component);
	return ((h >>> 8) + 0.5) / 16777216;
}

/**
 * Deterministic standard normal sample Z ~ N(0, 1) keyed strictly by
 * (seed, particleId, simulationStep, component).
 */
export function sampleStandardNormal(
	seed: number,
	particleId: number,
	simulationStep: number,
	component: number
): number {
	const h = hashKey32(seed, particleId, simulationStep, component);
	const index = ((h ^ (h >>> 16)) & LUT_MASK) >>> 0;
	return NORMAL_LUT[index];
}

/**
 * Deterministic initial particle position distributed throughout [0, width] x [0, height].
 * Uses a stratified grid cell per particle ID plus keyed jitter so the initial distribution
 * covers the entire canvas evenly without clumps or voids.
 */
export function sampleInitialPosition(
	seed: number,
	particleId: number,
	totalParticles: number,
	width: number,
	height: number
): { x: number; y: number } {
	const aspect = width / height;
	const cols = Math.max(1, Math.round(Math.sqrt(totalParticles * aspect)));
	const rows = Math.max(1, Math.ceil(totalParticles / cols));

	// Permute cell assignment deterministically from seed and particleId
	const permHash = hashKey32(seed, particleId, -1, 0);
	const cellIndex = (particleId + (permHash % totalParticles)) % (cols * rows);
	const col = cellIndex % cols;
	const row = Math.floor(cellIndex / cols);

	const jx = sampleUniform01(seed, particleId, -1, 1);
	const jy = sampleUniform01(seed, particleId, -1, 2);

	const x = Math.min(width - 0.001, Math.max(0.001, ((col + jx) / cols) * width));
	const y = Math.min(height - 0.001, Math.max(0.001, ((row + jy) / rows) * height));
	return { x, y };
}
