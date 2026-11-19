import type {
	Dim,
	InputDecomposition,
	LinearSystemRegimeId,
	MatrixData,
	RrefResult,
	SubspaceAnalysis,
	SubspaceInfo,
	SubspaceKey,
	SubspaceReceipts,
	SvdResult,
	TargetDecomposition,
	Vec,
	Vec3
} from './types';

export const DEFAULT_RELATIVE_TOLERANCE = 1e-6;
export const MIN_RELATIVE_TOLERANCE = 1e-9;
export const MAX_RELATIVE_TOLERANCE = 0.25;
export const MAX_MATRIX_ENTRY = 10;

export function cleanZero(value: number, eps = 1e-13): number {
	if (!Number.isFinite(value)) return 0;
	return Math.abs(value) < eps ? 0 : value;
}

export function clampNumber(value: number, min: number, max: number): number {
	if (!Number.isFinite(value)) return min;
	return Math.max(min, Math.min(max, value));
}

export function cloneMatrix(matrix: MatrixData): MatrixData {
	return matrix.map((row) => row.map((v) => cleanZero(v, 0)));
}

export function normalizeDim(value: number): Dim {
	if (value <= 1) return 1;
	if (value === 2) return 2;
	return 3;
}

export function padToVec3(v: Vec): Vec3 {
	return [v[0] ?? 0, v[1] ?? 0, v[2] ?? 0];
}

export function dot(a: Vec, b: Vec): number {
	const len = Math.min(a.length, b.length);
	let sum = 0;
	for (let i = 0; i < len; i += 1) sum += a[i] * b[i];
	return sum;
}

export function norm(v: Vec): number {
	return Math.hypot(...v);
}

export function scaleVec(v: Vec, s: number): Vec {
	return v.map((x) => x * s);
}

export function addVec(a: Vec, b: Vec): Vec {
	return a.map((x, i) => x + (b[i] ?? 0));
}

export function subVec(a: Vec, b: Vec): Vec {
	return a.map((x, i) => x - (b[i] ?? 0));
}

export function normalizeVec(v: Vec): Vec {
	const n = norm(v);
	if (n <= 1e-15) return v.map(() => 0);
	return v.map((x) => x / n);
}

export function cross3(a: Vec3, b: Vec3): Vec3 {
	return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

export function transposeMatrix(matrix: MatrixData): MatrixData {
	const m = matrix.length;
	const n = matrix[0]?.length ?? 0;
	const out: MatrixData = Array.from({ length: n }, () => Array<number>(m).fill(0));
	for (let i = 0; i < m; i += 1) {
		for (let j = 0; j < n; j += 1) {
			out[j][i] = cleanZero(matrix[i][j], 0);
		}
	}
	return out;
}

export function matVec(matrix: MatrixData, v: Vec): Vec {
	return matrix.map((row) => {
		let sum = 0;
		for (let j = 0; j < row.length; j += 1) sum += row[j] * (v[j] ?? 0);
		return cleanZero(sum, 1e-14);
	});
}

export function matMul(a: MatrixData, b: MatrixData): MatrixData {
	const m = a.length;
	const k = a[0]?.length ?? 0;
	const n = b[0]?.length ?? 0;
	const out: MatrixData = Array.from({ length: m }, () => Array<number>(n).fill(0));
	for (let i = 0; i < m; i += 1) {
		for (let j = 0; j < n; j += 1) {
			let sum = 0;
			for (let t = 0; t < k; t += 1) sum += a[i][t] * b[t][j];
			out[i][j] = sum;
		}
	}
	return out;
}

export function frobeniusNorm(matrix: MatrixData): number {
	let sumSq = 0;
	for (const row of matrix) {
		for (const v of row) sumSq += v * v;
	}
	return Math.sqrt(sumSq);
}

export function identityMatrix(size: number): MatrixData {
	return Array.from({ length: size }, (_, i) =>
		Array.from({ length: size }, (_, j) => (i === j ? 1 : 0))
	);
}

export function columnOf(matrix: MatrixData, col: number): Vec {
	return matrix.map((row) => row[col] ?? 0);
}

export function columnsToMatrix(columns: Vec[], rows: number): MatrixData {
	const cols = columns.length;
	const out: MatrixData = Array.from({ length: rows }, () => Array<number>(cols).fill(0));
	for (let j = 0; j < cols; j += 1) {
		for (let i = 0; i < rows; i += 1) {
			out[i][j] = cleanZero(columns[j][i] ?? 0, 1e-15);
		}
	}
	return out;
}

export function determinantSquare(matrix: MatrixData): number | null {
	const m = matrix.length;
	const n = matrix[0]?.length ?? 0;
	if (m !== n || m < 1 || m > 3) return null;
	if (m === 1) return cleanZero(matrix[0][0], 1e-13);
	if (m === 2) {
		return cleanZero(matrix[0][0] * matrix[1][1] - matrix[0][1] * matrix[1][0], 1e-13);
	}
	const [[a, b, c], [d, e, f], [g, h, i]] = matrix;
	return cleanZero(a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g), 1e-13);
}

function canonicalSign(v: Vec): number {
	let bestIdx = 0;
	let bestAbs = -1;
	for (let i = 0; i < v.length; i += 1) {
		const a = Math.abs(v[i]);
		if (a > bestAbs + 1e-12) {
			bestAbs = a;
			bestIdx = i;
		}
	}
	return v[bestIdx] < 0 ? -1 : 1;
}

/**
 * Re-orthogonalize candidate vector against an orthonormal basis using two passes
 * of Modified Gram-Schmidt (Kahan's "twice is enough").
 */
function orthogonalizeAgainst(candidate: Vec, basis: Vec[]): Vec {
	const w = [...candidate];
	for (let pass = 0; pass < 2; pass += 1) {
		for (const q of basis) {
			const proj = dot(q, w);
			for (let i = 0; i < w.length; i += 1) w[i] -= proj * q[i];
		}
	}
	return w;
}

/**
 * Complete an orthonormal basis of R^dim deterministically by picking standard
 * basis vectors with largest orthogonal residual norm.
 */
function completeOrthonormalBasis(existing: Vec[], dim: number): Vec[] {
	const basis = existing.map((v) => [...v]);
	while (basis.length < dim) {
		let bestVec: Vec | null = null;
		let bestNorm = -1;
		for (let axis = 0; axis < dim; axis += 1) {
			const e = Array<number>(dim).fill(0);
			e[axis] = 1;
			const perp = orthogonalizeAgainst(e, basis);
			const n = norm(perp);
			if (n > bestNorm + 1e-12) {
				bestNorm = n;
				bestVec = perp;
			}
		}
		if (!bestVec || bestNorm <= 1e-14) break;
		const unit = scaleVec(bestVec, 1 / bestNorm);
		const sign = canonicalSign(unit);
		basis.push(unit.map((val) => cleanZero(val * sign, 1e-15)));
	}
	return basis;
}

/**
 * One-Sided Jacobi SVD for m >= n (1 <= m, n <= 3).
 * Never squares the condition number via A^T A, preserving full IEEE-754 accuracy
 * even for nearly singular matrices.
 */
function oneSidedJacobiTall(matrix: MatrixData): {
	uVectors: Vec[];
	vVectors: Vec[];
	singularValues: number[];
} {
	const m = matrix.length;
	const n = matrix[0]?.length ?? 0;

	// Columns of B start as columns of A; columns of V start as I_n.
	const bCols: Vec[] = Array.from({ length: n }, (_, j) => columnOf(matrix, j));
	const vCols: Vec[] = Array.from({ length: n }, (_, j) =>
		Array.from({ length: n }, (__, i) => (i === j ? 1 : 0))
	);

	const maxSweeps = 48;
	for (let sweep = 0; sweep < maxSweeps; sweep += 1) {
		let rotated = false;
		for (let p = 0; p < n - 1; p += 1) {
			for (let q = p + 1; q < n; q += 1) {
				const bp = bCols[p];
				const bq = bCols[q];
				const alpha = dot(bp, bp);
				const beta = dot(bq, bq);
				const gamma = dot(bp, bq);

				if (alpha <= 1e-30 || beta <= 1e-30) continue;
				if (Math.abs(gamma) <= 1e-15 * Math.sqrt(alpha * beta)) continue;

				rotated = true;
				const zeta = (beta - alpha) / (2 * gamma);
				const signZeta = zeta < 0 ? -1 : 1;
				const t = signZeta / (Math.abs(zeta) + Math.hypot(1, zeta));
				const c = 1 / Math.hypot(1, t);
				const s = c * t;

				for (let i = 0; i < m; i += 1) {
					const bpi = bp[i];
					const bqi = bq[i];
					bp[i] = c * bpi - s * bqi;
					bq[i] = s * bpi + c * bqi;
				}
				const vp = vCols[p];
				const vq = vCols[q];
				for (let i = 0; i < n; i += 1) {
					const vpi = vp[i];
					const vqi = vq[i];
					vp[i] = c * vpi - s * vqi;
					vq[i] = s * vpi + c * vqi;
				}
			}
		}
		if (!rotated) break;
	}

	const rawNorms = bCols.map((col) => norm(col));
	const order = Array.from({ length: n }, (_, idx) => idx).sort((a, b) => {
		const diff = rawNorms[b] - rawNorms[a];
		if (Math.abs(diff) > 1e-14) return diff;
		return a - b;
	});

	const singularValues = order.map((idx) => cleanZero(rawNorms[idx], 1e-15));
	const sortedB = order.map((idx) => bCols[idx]);
	const sortedV = order.map((idx) => normalizeVec(vCols[idx]));

	// Orthonormalize V defensively (already orthogonal to ~1e-15).
	const vVectors: Vec[] = [];
	for (const v of sortedV) {
		const perp = orthogonalizeAgainst(v, vVectors);
		const nrm = norm(perp);
		if (nrm > 1e-12) {
			vVectors.push(scaleVec(perp, 1 / nrm));
		}
	}
	const fullV = completeOrthonormalBasis(vVectors, n);

	const sigmaMax = singularValues[0] ?? 0;
	const uThreshold = Math.max(1e-15, sigmaMax * 1e-14);
	const uVectors: Vec[] = [];

	for (let k = 0; k < n; k += 1) {
		const s = singularValues[k];
		if (s > uThreshold) {
			const candidate = scaleVec(sortedB[k], 1 / s);
			const perp = orthogonalizeAgainst(candidate, uVectors);
			const nrm = norm(perp);
			if (nrm > 1e-10) {
				uVectors.push(scaleVec(perp, 1 / nrm));
			} else {
				// Degenerate numerically; complete later after nonzero vectors.
				break;
			}
		} else {
			break;
		}
	}
	const fullU = completeOrthonormalBasis(uVectors, m);

	// Canonicalize signs deterministically while preserving U * Sigma * V^T = A.
	const kMin = Math.min(m, n);
	for (let k = 0; k < kMin; k += 1) {
		const sign = canonicalSign(fullV[k]);
		if (sign < 0) {
			fullV[k] = fullV[k].map((val) => cleanZero(-val, 1e-15));
			fullU[k] = fullU[k].map((val) => cleanZero(-val, 1e-15));
		} else {
			fullV[k] = fullV[k].map((val) => cleanZero(val, 1e-15));
			fullU[k] = fullU[k].map((val) => cleanZero(val, 1e-15));
		}
	}
	for (let k = kMin; k < m; k += 1) {
		const sign = canonicalSign(fullU[k]);
		fullU[k] = fullU[k].map((val) => cleanZero(val * sign, 1e-15));
	}

	return {
		uVectors: fullU,
		vVectors: fullV,
		singularValues
	};
}

export function computeSvd(
	matrix: MatrixData,
	relativeTolerance = DEFAULT_RELATIVE_TOLERANCE
): SvdResult {
	const m = normalizeDim(matrix.length);
	const n = normalizeDim(matrix[0]?.length ?? 1);
	const cleanTol = clampNumber(relativeTolerance, MIN_RELATIVE_TOLERANCE, MAX_RELATIVE_TOLERANCE);

	let uVectors: Vec[];
	let vVectors: Vec[];
	let singularValues: number[];

	if (m >= n) {
		const res = oneSidedJacobiTall(matrix);
		uVectors = res.uVectors;
		vVectors = res.vVectors;
		singularValues = res.singularValues;
	} else {
		const res = oneSidedJacobiTall(transposeMatrix(matrix));
		uVectors = res.vVectors;
		vVectors = res.uVectors;
		singularValues = res.singularValues;
		// Re-canonicalize signs on V (our right singular vectors) while keeping U * Sigma * V^T exact.
		const kMin = Math.min(m, n);
		for (let k = 0; k < kMin; k += 1) {
			const sign = canonicalSign(vVectors[k]);
			if (sign < 0) {
				vVectors[k] = vVectors[k].map((val) => cleanZero(-val, 1e-15));
				uVectors[k] = uVectors[k].map((val) => cleanZero(-val, 1e-15));
			}
		}
		for (let k = kMin; k < n; k += 1) {
			const sign = canonicalSign(vVectors[k]);
			vVectors[k] = vVectors[k].map((val) => cleanZero(val * sign, 1e-15));
		}
	}

	const sigmaMax = singularValues[0] ?? 0;
	const tolerance = sigmaMax > 1e-14 ? Math.max(m, n) * sigmaMax * cleanTol : 0;

	let rank = 0;
	let rankTruncated = false;
	for (const s of singularValues) {
		if (s > tolerance && s > 1e-14) {
			rank += 1;
		} else if (sigmaMax > 1e-14 && s > 1e-12 * sigmaMax) {
			rankTruncated = true;
		}
	}

	const conditionNumber =
		rank > 0 && singularValues[rank - 1] > 0 ? sigmaMax / singularValues[rank - 1] : null;

	return {
		m,
		n,
		u: columnsToMatrix(uVectors, m),
		v: columnsToMatrix(vVectors, n),
		uVectors,
		vVectors,
		singularValues,
		tolerance,
		relativeTolerance: cleanTol,
		rank,
		conditionNumber,
		rankTruncated
	};
}

export function reconstructFromSvd(svd: SvdResult, maxTerms?: number): MatrixData {
	const { m, n, uVectors, vVectors, singularValues } = svd;
	const terms = Math.min(maxTerms ?? singularValues.length, singularValues.length);
	const out: MatrixData = Array.from({ length: m }, () => Array<number>(n).fill(0));
	for (let k = 0; k < terms; k += 1) {
		const s = singularValues[k];
		if (s === 0) continue;
		const uk = uVectors[k];
		const vk = vVectors[k];
		for (let i = 0; i < m; i += 1) {
			for (let j = 0; j < n; j += 1) {
				out[i][j] += s * uk[i] * vk[j];
			}
		}
	}
	return out;
}

function rawRref(
	matrix: MatrixData,
	pivotTol: number,
	maxPivots?: number
): {
	rref: MatrixData;
	pivotColumns: number[];
	freeColumns: number[];
} {
	const m = matrix.length;
	const n = matrix[0]?.length ?? 0;
	const work = cloneMatrix(matrix);
	const pivotColumns: number[] = [];
	const pivotCap = maxPivots ?? Math.min(m, n);

	let pivotRow = 0;
	for (let col = 0; col < n && pivotRow < m && pivotColumns.length < pivotCap; col += 1) {
		let bestRow = pivotRow;
		let bestAbs = Math.abs(work[pivotRow][col]);
		for (let r = pivotRow + 1; r < m; r += 1) {
			const candidate = Math.abs(work[r][col]);
			if (candidate > bestAbs) {
				bestAbs = candidate;
				bestRow = r;
			}
		}
		if (bestAbs <= pivotTol) continue;

		if (bestRow !== pivotRow) {
			const tmp = work[pivotRow];
			work[pivotRow] = work[bestRow];
			work[bestRow] = tmp;
		}

		const pivotVal = work[pivotRow][col];
		for (let j = col; j < n; j += 1) {
			work[pivotRow][j] /= pivotVal;
		}
		work[pivotRow][col] = 1;

		for (let r = 0; r < m; r += 1) {
			if (r === pivotRow) continue;
			const factor = work[r][col];
			if (Math.abs(factor) <= 1e-15) continue;
			for (let j = col; j < n; j += 1) {
				work[r][j] -= factor * work[pivotRow][j];
			}
			work[r][col] = 0;
		}

		pivotColumns.push(col);
		pivotRow += 1;
	}

	// Rows below the rank are identically zero in reduced row echelon form
	for (let r = pivotColumns.length; r < m; r += 1) {
		for (let j = 0; j < n; j += 1) {
			if (Math.abs(work[r][j]) <= Math.max(1e-10, pivotTol * 2)) {
				work[r][j] = 0;
			}
		}
	}

	const rref = work.map((row) => row.map((v) => cleanZero(v, 1e-10)));
	const pivotSet = new Set(pivotColumns);
	const freeColumns: number[] = [];
	for (let col = 0; col < n; col += 1) {
		if (!pivotSet.has(col)) freeColumns.push(col);
	}

	return { rref, pivotColumns, freeColumns };
}

function rrefFromOrthonormalRows(
	basisRows: Vec[],
	totalRows: number,
	cols: number
): {
	rref: MatrixData;
	pivotColumns: number[];
	freeColumns: number[];
} {
	const r = basisRows.length;
	const raw = rawRref(basisRows, 1e-9, r);
	const padded: MatrixData = Array.from({ length: totalRows }, (_, i) =>
		i < raw.rref.length ? [...raw.rref[i]] : Array<number>(cols).fill(0)
	);
	return {
		rref: padded,
		pivotColumns: raw.pivotColumns,
		freeColumns: raw.freeColumns
	};
}

function hasValidSubspaceAlignment(
	rrefRes: { rref: MatrixData; pivotColumns: number[] },
	expectedRank: number,
	orthComplementBasis: Vec[]
): boolean {
	if (rrefRes.pivotColumns.length !== expectedRank) return false;
	for (let i = expectedRank; i < rrefRes.rref.length; i += 1) {
		for (const val of rrefRes.rref[i]) {
			if (Math.abs(val) > 1e-7) return false;
		}
	}
	for (let i = 0; i < expectedRank; i += 1) {
		const row = rrefRes.rref[i];
		const rowNorm = norm(row) || 1;
		for (const orth of orthComplementBasis) {
			if (Math.abs(dot(row, orth)) / rowNorm > 1e-6) return false;
		}
	}
	return true;
}

function specialNullspaceFromRref(
	rref: MatrixData,
	pivotColumns: number[],
	freeColumns: number[],
	n: number
): Vec[] {
	return freeColumns.map((freeCol) => {
		const vec = Array<number>(n).fill(0);
		vec[freeCol] = 1;
		for (let rowIdx = 0; rowIdx < pivotColumns.length; rowIdx += 1) {
			const pivotCol = pivotColumns[rowIdx];
			vec[pivotCol] = cleanZero(-rref[rowIdx][freeCol], 1e-11);
		}
		return vec;
	});
}

export function computeRrefWithSvdConsistency(matrix: MatrixData, svd: SvdResult): RrefResult {
	const m = svd.m;
	const n = svd.n;
	const r = svd.rank;

	if (r === 0) {
		const zeroRref: MatrixData = Array.from({ length: m }, () => Array<number>(n).fill(0));
		const freeColumns = Array.from({ length: n }, (_, j) => j);
		return {
			rref: zeroRref,
			pivotColumns: [],
			freeColumns,
			rowSpaceBasis: [],
			columnSpaceBasis: [],
			nullspaceBasis: Array.from({ length: n }, (_, j) =>
				Array.from({ length: n }, (__, i) => (i === j ? 1 : 0))
			),
			leftNullspaceBasis: Array.from({ length: m }, (_, j) =>
				Array.from({ length: m }, (__, i) => (i === j ? 1 : 0))
			),
			usedRankTruncation: svd.rankTruncated
		};
	}

	const rowSvd = svd.vVectors.slice(0, r);
	const nullSvd = svd.vVectors.slice(r, n);
	const colSvd = svd.uVectors.slice(0, r);
	const leftNullSvd = svd.uVectors.slice(r, m);

	const usedRankTruncation = svd.rankTruncated;
	const workingMatrix = usedRankTruncation ? reconstructFromSvd(svd, r) : matrix;

	// Scale-relative exact pivot tolerance (never uses a large user tau or arbitrary absolute floor).
	const sigma1 = svd.singularValues[0] ?? 1;
	const sigmaR = svd.singularValues[r - 1] ?? sigma1;
	const exactPivotTol = Math.max(sigma1 * 1e-12, Math.min(sigma1 * 1e-9, sigmaR * 1e-3));

	let primary = usedRankTruncation
		? rrefFromOrthonormalRows(rowSvd, m, n)
		: rawRref(workingMatrix, exactPivotTol, r);
	let transposeRref = usedRankTruncation
		? rrefFromOrthonormalRows(colSvd, n, m)
		: rawRref(transposeMatrix(workingMatrix), exactPivotTol, r);

	// Ironclad well-conditioned (kappa = 1) fallback: RREF(A_r) === RREF(V_r^T) and RREF(A_r^T) === RREF(U_r^T).
	if (!hasValidSubspaceAlignment(primary, r, nullSvd)) {
		primary = rrefFromOrthonormalRows(rowSvd, m, n);
	}
	if (!hasValidSubspaceAlignment(transposeRref, r, leftNullSvd)) {
		transposeRref = rrefFromOrthonormalRows(colSvd, n, m);
	}

	const rowSpaceBasis = primary.pivotColumns.map((_, idx) => [...primary.rref[idx]]);
	const columnSpaceBasis = primary.pivotColumns.map((col) =>
		columnOf(workingMatrix, col).map((v) => cleanZero(v, 1e-12))
	);
	const nullspaceBasis = specialNullspaceFromRref(
		primary.rref,
		primary.pivotColumns,
		primary.freeColumns,
		n
	);
	const leftNullspaceBasis = specialNullspaceFromRref(
		transposeRref.rref,
		transposeRref.pivotColumns,
		transposeRref.freeColumns,
		m
	);

	return {
		rref: primary.rref,
		pivotColumns: primary.pivotColumns,
		freeColumns: primary.freeColumns,
		rowSpaceBasis,
		columnSpaceBasis,
		nullspaceBasis,
		leftNullspaceBasis,
		usedRankTruncation
	};
}

function geometryLabelFor(dim: number, ambientDim: Dim): SubspaceInfo['geometryLabel'] {
	if (dim === 0) return 'Origin {0}';
	if (dim === 1) return ambientDim === 1 ? '1D Whole Line' : '1D Line';
	if (dim === 2) return ambientDim === 2 ? '2D Whole Plane' : '2D Plane';
	return '3D Whole Space';
}

function maxCrossBasisDot(basisA: Vec[], basisB: Vec[]): number {
	let maxDot = 0;
	for (const a of basisA) {
		for (const b of basisB) {
			const d = Math.abs(dot(a, b));
			if (d > maxDot) maxDot = d;
		}
	}
	return cleanZero(maxDot, 1e-15);
}

function orthonormalityError(cols: Vec[], size: number): number {
	const q = columnsToMatrix(cols, size);
	const qtq = matMul(transposeMatrix(q), q);
	const eye = identityMatrix(size);
	const diff = qtq.map((row, i) => row.map((v, j) => v - eye[i][j]));
	return cleanZero(frobeniusNorm(diff), 1e-15);
}

export function analyzeMatrix(
	matrixInput: MatrixData,
	xInput: Vec,
	bInput: Vec,
	relativeTolerance = DEFAULT_RELATIVE_TOLERANCE
): SubspaceAnalysis {
	const m = normalizeDim(matrixInput.length);
	const n = normalizeDim(matrixInput[0]?.length ?? 1);
	const matrix: MatrixData = Array.from({ length: m }, (_, i) =>
		Array.from({ length: n }, (__, j) =>
			clampNumber(matrixInput[i]?.[j] ?? 0, -MAX_MATRIX_ENTRY, MAX_MATRIX_ENTRY)
		)
	);
	const x: Vec = Array.from({ length: n }, (_, i) => clampNumber(xInput[i] ?? 0, -10, 10));
	const b: Vec = Array.from({ length: m }, (_, i) => clampNumber(bInput[i] ?? 0, -10, 10));

	const svd = computeSvd(matrix, relativeTolerance);
	const r = svd.rank;
	const rref = computeRrefWithSvdConsistency(matrix, svd);

	const rowSvd = svd.vVectors.slice(0, r);
	const nullSvd = svd.vVectors.slice(r, n);
	const colSvd = svd.uVectors.slice(0, r);
	const leftNullSvd = svd.uVectors.slice(r, m);

	const subspaces: Record<SubspaceKey, SubspaceInfo> = {
		row: {
			key: 'row',
			name: 'Row Space',
			symbol: 'C(Aᵀ)',
			ambientSpace: 'domain',
			ambientDim: n,
			dimension: r,
			geometryLabel: geometryLabelFor(r, n),
			svdBasis: rowSvd,
			rrefBasis: rref.rowSpaceBasis
		},
		null: {
			key: 'null',
			name: 'Nullspace',
			symbol: 'N(A)',
			ambientSpace: 'domain',
			ambientDim: n,
			dimension: n - r,
			geometryLabel: geometryLabelFor(n - r, n),
			svdBasis: nullSvd,
			rrefBasis: rref.nullspaceBasis
		},
		col: {
			key: 'col',
			name: 'Column Space',
			symbol: 'C(A)',
			ambientSpace: 'codomain',
			ambientDim: m,
			dimension: r,
			geometryLabel: geometryLabelFor(r, m),
			svdBasis: colSvd,
			rrefBasis: rref.columnSpaceBasis
		},
		leftNull: {
			key: 'leftNull',
			name: 'Left Nullspace',
			symbol: 'N(Aᵀ)',
			ambientSpace: 'codomain',
			ambientDim: m,
			dimension: m - r,
			geometryLabel: geometryLabelFor(m - r, m),
			svdBasis: leftNullSvd,
			rrefBasis: rref.leftNullspaceBasis
		}
	};

	// Input orthogonal split: x = x_r + x_n
	let xRow = Array<number>(n).fill(0);
	for (const v of rowSvd) {
		xRow = addVec(xRow, scaleVec(v, dot(v, x)));
	}
	xRow = xRow.map((val) => cleanZero(val, 1e-14));
	const xNull = subVec(x, xRow).map((val) => cleanZero(val, 1e-14));
	const ax = matVec(matrix, x);
	const axRow = matVec(matrix, xRow);
	const axNullResidualNorm = cleanZero(norm(subVec(ax, axRow)), 1e-14);
	const inputOrthogonalityDot = cleanZero(Math.abs(dot(xRow, xNull)), 1e-15);

	const input: InputDecomposition = {
		x,
		xRow,
		xNull,
		ax,
		axRow,
		axNullResidualNorm,
		normX: norm(x),
		normXRow: norm(xRow),
		normXNull: norm(xNull),
		normAx: norm(ax),
		orthogonalityDot: inputOrthogonalityDot,
		fiberAnchor: xRow,
		fiberDirections: nullSvd
	};

	// Target orthogonal split: b = p + e, and pseudoinverse x^+ = A^+ b
	let projection = Array<number>(m).fill(0);
	let xPlus = Array<number>(n).fill(0);
	for (let k = 0; k < r; k += 1) {
		const uk = colSvd[k];
		const vk = rowSvd[k];
		const sk = svd.singularValues[k];
		const coeff = dot(uk, b);
		projection = addVec(projection, scaleVec(uk, coeff));
		if (sk > 0) {
			xPlus = addVec(xPlus, scaleVec(vk, coeff / sk));
		}
	}
	projection = projection.map((val) => cleanZero(val, 1e-14));
	xPlus = xPlus.map((val) => cleanZero(val, 1e-14));
	const residual = subVec(b, projection).map((val) => cleanZero(val, 1e-14));
	const axPlus = matVec(matrix, xPlus);
	const normResidual = cleanZero(norm(residual), 1e-14);
	const normalEquationResidual = cleanZero(norm(matVec(transposeMatrix(matrix), residual)), 1e-14);

	// Classify exact vs least-squares regime using tau (with tiny machine floor for b in C(A))
	const exactThreshold = Math.max(svd.tolerance, 1e-11 * Math.max(1, norm(b)));
	const isExact = normResidual <= exactThreshold;
	const hasNullspace = n - r > 0;

	let regimeId: LinearSystemRegimeId;
	let regimeTitle: string;
	let regimeSummary: string;

	if (isExact && !hasNullspace) {
		regimeId = 'unique-exact';
		regimeTitle = 'Unique exact solution';
		regimeSummary = 'b lies inside C(A) and N(A) = {0}, so x⁺ = A⁺b is the sole exact solution.';
	} else if (isExact && hasNullspace) {
		regimeId = 'infinite-exact';
		regimeTitle = 'Infinitely many exact solutions';
		regimeSummary =
			'b lies inside C(A), while dim N(A) > 0 generates an entire affine family x⁺ + N(A) of exact solutions.';
	} else if (!isExact && !hasNullspace) {
		regimeId = 'unique-least-squares';
		regimeTitle = 'Unique least-squares approximation';
		regimeSummary =
			'b has a nonzero left-nullspace residual e ⊥ C(A); projecting b → p yields a unique minimizer x⁺.';
	} else {
		regimeId = 'infinite-least-squares';
		regimeTitle = 'Infinitely many least-squares approximations';
		regimeSummary =
			'b lies outside C(A) and dim N(A) > 0; every point on x⁺ + N(A) achieves the same minimum error ‖e‖, with x⁺ having minimum norm.';
	}

	const target: TargetDecomposition = {
		b,
		projection,
		residual,
		xPlus,
		axPlus,
		normB: norm(b),
		normProjection: norm(projection),
		normResidual,
		normXPlus: norm(xPlus),
		normalEquationResidual,
		solutionAnchor: xPlus,
		solutionDirections: nullSvd,
		isExact,
		regimeId,
		regimeTitle,
		regimeSummary
	};

	const reconstructed = reconstructFromSvd(svd);
	const diff = matrix.map((row, i) => row.map((v, j) => v - reconstructed[i][j]));

	const receipts: SubspaceReceipts = {
		dimRow: r,
		dimNull: n - r,
		dimCol: r,
		dimLeftNull: m - r,
		domainSumOk: r + (n - r) === n,
		codomainSumOk: r + (m - r) === m,
		rowNullMaxDot: maxCrossBasisDot(rowSvd, nullSvd),
		colLeftNullMaxDot: maxCrossBasisDot(colSvd, leftNullSvd),
		inputOrthogonalityDot,
		normalEquationResidual,
		svdReconstructionError: cleanZero(frobeniusNorm(diff), 1e-15),
		uOrthonormalityError: orthonormalityError(svd.uVectors, m),
		vOrthonormalityError: orthonormalityError(svd.vVectors, n)
	};

	return {
		m,
		n,
		matrix,
		svd,
		rref,
		rank: r,
		subspaces,
		input,
		target,
		receipts,
		determinant: determinantSquare(matrix)
	};
}

/**
 * Rodrigues rotation interpolation from I to a proper rotation matrix R in SO(3).
 */
function interpolateRotation3(rMat: MatrixData, t: number): MatrixData {
	const clamped = clampNumber(t, 0, 1);
	if (clamped <= 0) return identityMatrix(3);
	if (clamped >= 1) return cloneMatrix(rMat);

	const trace = rMat[0][0] + rMat[1][1] + rMat[2][2];
	const cosTheta = clampNumber((trace - 1) / 2, -1, 1);
	const theta = Math.acos(cosTheta);

	if (theta < 1e-9) {
		return identityMatrix(3);
	}

	let axis: Vec3;
	if (Math.PI - theta < 1e-5) {
		// Near 180 degrees: extract unit axis from diagonal of (R + I) / 2
		const rx = Math.sqrt(Math.max(0, (rMat[0][0] + 1) / 2));
		const ry = Math.sqrt(Math.max(0, (rMat[1][1] + 1) / 2));
		const rz = Math.sqrt(Math.max(0, (rMat[2][2] + 1) / 2));
		let sx = rx;
		let sy = ry;
		let sz = rz;
		if (rx >= ry && rx >= rz) {
			sy = rMat[0][1] < 0 ? -ry : ry;
			sz = rMat[0][2] < 0 ? -rz : rz;
		} else if (ry >= rx && ry >= rz) {
			sx = rMat[0][1] < 0 ? -rx : rx;
			sz = rMat[1][2] < 0 ? -rz : rz;
		} else {
			sx = rMat[0][2] < 0 ? -rx : rx;
			sy = rMat[1][2] < 0 ? -ry : ry;
		}
		const nrm = Math.hypot(sx, sy, sz) || 1;
		axis = [sx / nrm, sy / nrm, sz / nrm];
	} else {
		const denom = 2 * Math.sin(theta);
		axis = [
			(rMat[2][1] - rMat[1][2]) / denom,
			(rMat[0][2] - rMat[2][0]) / denom,
			(rMat[1][0] - rMat[0][1]) / denom
		];
		const nrm = Math.hypot(axis[0], axis[1], axis[2]) || 1;
		axis = [axis[0] / nrm, axis[1] / nrm, axis[2] / nrm];
	}

	const angle = theta * clamped;
	const c = Math.cos(angle);
	const s = Math.sin(angle);
	const oneMinusC = 1 - c;
	const [kx, ky, kz] = axis;

	return [
		[c + kx * kx * oneMinusC, kx * ky * oneMinusC - kz * s, kx * kz * oneMinusC + ky * s],
		[ky * kx * oneMinusC + kz * s, c + ky * ky * oneMinusC, ky * kz * oneMinusC - kx * s],
		[kz * kx * oneMinusC - ky * s, kz * ky * oneMinusC + kx * s, c + kz * kz * oneMinusC]
	];
}

function embedOrthogonalTo3(mat: MatrixData): MatrixData {
	const d = mat.length;
	const out = identityMatrix(3);
	for (let i = 0; i < d; i += 1) {
		for (let j = 0; j < d; j += 1) {
			out[i][j] = mat[i][j];
		}
	}
	return out;
}

/**
 * Compute continuous 3x3 transformation M(t) for Superimposed / Morph View
 * (for square matrices m = n). At t = 0, M(0) = I; at t = 1, M(1) = A (embedded in 3x3).
 */
export function computeMorphMatrix3(
	analysis: SubspaceAnalysis,
	t: number,
	mode: 'linear' | 'svd-stages'
): { matrix3: MatrixData; stageLabel: string } {
	const clamped = clampNumber(t, 0, 1);
	const { m, n, matrix, svd } = analysis;

	if (m !== n) {
		return { matrix3: identityMatrix(3), stageLabel: 'Morph requires a square matrix (m = n)' };
	}

	const a3 = identityMatrix(3);
	for (let i = 0; i < m; i += 1) {
		for (let j = 0; j < n; j += 1) a3[i][j] = matrix[i][j];
	}

	if (mode === 'linear') {
		const out = identityMatrix(3);
		for (let i = 0; i < m; i += 1) {
			for (let j = 0; j < n; j += 1) {
				out[i][j] = (1 - clamped) * (i === j ? 1 : 0) + clamped * matrix[i][j];
			}
		}
		return {
			matrix3: out,
			stageLabel: `Linear homotopy (1 − t)I + tA · t = ${clamped.toFixed(2)}`
		};
	}

	// 3-Stage SVD morph:
	// [0, 1/3]: rotate by V_rot^T in SO(3)
	// [1/3, 2/3]: stretch/flatten (and flip sign if det(A) < 0) by Sigma(s)
	// [2/3, 1]: rotate by U_rot in SO(3)
	const u3 = embedOrthogonalTo3(svd.u);
	const v3 = embedOrthogonalTo3(svd.v);
	const sigmas = [1, 1, 1];
	for (let i = 0; i < m; i += 1) sigmas[i] = svd.singularValues[i] ?? 0;

	const detV = determinantSquare(v3) ?? 1;
	if (detV < 0) {
		const flipIdx = m - 1;
		for (let row = 0; row < 3; row += 1) {
			v3[row][flipIdx] = -v3[row][flipIdx];
			u3[row][flipIdx] = -u3[row][flipIdx];
		}
	}

	// Ensure U_rot has det = +1 by absorbing reflection sign into the last active singular value
	const detU = determinantSquare(u3) ?? 1;
	if (detU < 0) {
		const flipIdx = m - 1;
		for (let row = 0; row < 3; row += 1) {
			u3[row][flipIdx] = -u3[row][flipIdx];
		}
		sigmas[flipIdx] = -sigmas[flipIdx];
	}

	const vt3 = transposeMatrix(v3);

	if (clamped <= 1 / 3 + 1e-6) {
		const s = Math.min(1, clamped * 3);
		return {
			matrix3: interpolateRotation3(vt3, s),
			stageLabel: `Stage 1/3: Align right singular axes (Vᵀ) · ${(s * 100).toFixed(0)}%`
		};
	}
	if (clamped <= 2 / 3 + 1e-6) {
		const s = Math.min(1, (clamped - 1 / 3) * 3);
		const diag = identityMatrix(3);
		for (let i = 0; i < m; i += 1) {
			diag[i][i] = 1 + s * (sigmas[i] - 1);
		}
		return {
			matrix3: matMul(diag, vt3),
			stageLabel: `Stage 2/3: Scale by singular values (ΣVᵀ) · ${(s * 100).toFixed(0)}%`
		};
	}

	const s = Math.min(1, Math.max(0, (clamped - 2 / 3) * 3));
	const diag = identityMatrix(3);
	for (let i = 0; i < m; i += 1) diag[i][i] = sigmas[i];
	const uInterp = interpolateRotation3(u3, s);
	return {
		matrix3: matMul(uInterp, matMul(diag, vt3)),
		stageLabel: `Stage 3/3: Rotate into column space (UΣVᵀ) · ${(s * 100).toFixed(0)}%`
	};
}

export function matricesApproximatelyEqual(a: MatrixData, b: MatrixData, tol = 1e-4): boolean {
	if (a.length !== b.length) return false;
	for (let i = 0; i < a.length; i += 1) {
		if (a[i].length !== b[i].length) return false;
		for (let j = 0; j < a[i].length; j += 1) {
			if (Math.abs(a[i][j] - b[i][j]) > tol) return false;
		}
	}
	return true;
}

/**
 * Maximum valid value for the smallest singular value homotopy without swapping singular axes.
 * Returns 0 if the second-smallest singular value is already 0 (so sigma_min cannot rise above it).
 */
export function smallestSingularValueUpperBound(svd: SvdResult): number {
	const kMin = Math.min(svd.m, svd.n);
	if (kMin <= 0) return 0;
	if (kMin === 1) return 3;
	return cleanZero(Math.min(3, svd.singularValues[kMin - 2] ?? 0), 1e-12);
}

/**
 * Replace the smallest singular value (at index min(m,n)-1) and reconstruct A = U Sigma' V^T.
 * Accepts an optional pinned SVD frame so sweeping sigma_min through 0 and back preserves exact
 * orientation (no u_k/v_k sign flip) and clamps strictly below sigma_{k-1} so axes never swap.
 */
export function setSmallestSingularValue(
	matrix: MatrixData,
	newSigmaMin: number,
	pinnedSvd?: SvdResult
): MatrixData {
	const svd = pinnedSvd ?? computeSvd(matrix, DEFAULT_RELATIVE_TOLERANCE);
	const kMin = Math.min(svd.m, svd.n);
	if (kMin === 0) return cloneMatrix(matrix);

	const upperBound = smallestSingularValueUpperBound(svd);
	if (upperBound <= 1e-12) {
		return cloneMatrix(matrix);
	}

	const nextSigmas = [...svd.singularValues];
	nextSigmas[kMin - 1] = clampNumber(newSigmaMin, 0, upperBound);

	const nextSvd: SvdResult = {
		...svd,
		singularValues: nextSigmas
	};
	return reconstructFromSvd(nextSvd).map((row) =>
		row.map((v) => clampNumber(cleanZero(v, 1e-12), -MAX_MATRIX_ENTRY, MAX_MATRIX_ENTRY))
	);
}

/**
 * Deterministic seeded PRNG (Mulberry32) without nondeterministic global randomness.
 */
export function mulberry32(seed: number): () => number {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let value = state;
		value = Math.imul(value ^ (value >>> 15), value | 1);
		value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
		return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
	};
}

/**
 * Deterministic generator for a clean integer m x n matrix of exact rank r.
 */
export function generateSeededRankMatrix(
	m: Dim,
	n: Dim,
	targetRank: number,
	seed: number
): MatrixData {
	const r = Math.max(0, Math.min(Math.min(m, n), Math.round(targetRank)));
	if (r === 0) {
		return Array.from({ length: m }, () => Array<number>(n).fill(0));
	}

	const rand = mulberry32(seed ^ (m * 73856093) ^ (n * 19349663) ^ (r * 83492791));
	const intChoices = [-2, -1, 0, 1, 2];

	for (let attempt = 0; attempt < 96; attempt += 1) {
		const left: MatrixData = Array.from({ length: m }, () =>
			Array.from({ length: r }, () => intChoices[Math.floor(rand() * intChoices.length)])
		);
		const right: MatrixData = Array.from({ length: r }, () =>
			Array.from({ length: n }, () => intChoices[Math.floor(rand() * intChoices.length)])
		);
		const candidate = matMul(left, right);
		const maxEntry = Math.max(...candidate.flatMap((row) => row.map((v) => Math.abs(v))));
		if (maxEntry === 0 || maxEntry > 4) continue;

		const svd = computeSvd(candidate, DEFAULT_RELATIVE_TOLERANCE);
		if (svd.rank === r && (svd.conditionNumber === null || svd.conditionNumber < 12)) {
			return candidate;
		}
	}

	// Deterministic guaranteed fallback of exact rank r
	return Array.from({ length: m }, (_, i) =>
		Array.from({ length: n }, (__, j) => (i === j && i < r ? 1 : 0))
	);
}

const SUBSCRIPT_DIGITS = ['₀', '₁', '₂', '₃', '₄', '₅', '₆', '₇', '₈', '₉'] as const;

export function formatEuclideanSpace(dim: Dim): string {
	return dim === 1 ? 'ℝ¹' : dim === 2 ? 'ℝ²' : 'ℝ³';
}

export function formatSubscriptIndex(index: number): string {
	const safe = Math.max(0, Math.trunc(Number.isFinite(index) ? index : 0));
	return String(safe)
		.split('')
		.map((ch) => SUBSCRIPT_DIGITS[Number(ch)] ?? ch)
		.join('');
}

export function formatScalar(value: number, digits = 2): string {
	const cleaned = cleanZero(value, 1e-10);
	if (cleaned === 0) return '0';
	if (Math.abs(cleaned - Math.round(cleaned)) < 1e-6) {
		return String(Math.round(cleaned));
	}
	return cleaned.toFixed(digits).replace(/\.?0+$/, '');
}

export function formatVec(v: Vec, digits = 2): string {
	return `(${v.map((entry) => formatScalar(entry, digits)).join(', ')})ᵀ`;
}

export function formatScientific(value: number): string {
	if (!Number.isFinite(value)) return '∞';
	if (Math.abs(value) < 1e-15) return '0';
	if (Math.abs(value) >= 1e-3 && Math.abs(value) < 1e4) {
		return formatScalar(value, 4);
	}
	return value.toExponential(2);
}
