import { matMul, transposeMatrix } from './math';
import type { CanonicalPreset, MatrixData, PresetGroupId } from './types';

function makeNearlySingularMatrix(): MatrixData {
	// Exact orthonormal V and U constructed from Pythagorean triples (1,2,2)/3
	const u: MatrixData = [
		[2 / 3, 1 / 3, -2 / 3],
		[-2 / 3, 2 / 3, -1 / 3],
		[1 / 3, 2 / 3, 2 / 3]
	];
	const v: MatrixData = [
		[2 / 3, -2 / 3, 1 / 3],
		[1 / 3, 2 / 3, 2 / 3],
		[2 / 3, 1 / 3, -2 / 3]
	];
	const sigma: MatrixData = [
		[2.0, 0, 0],
		[0, 1.2, 0],
		[0, 0, 0.04]
	];
	return matMul(matMul(u, sigma), transposeMatrix(v)).map((row) =>
		row.map((val) => Number(val.toFixed(6)))
	);
}

export const PRESET_GROUPS: readonly { id: PresetGroupId; label: string }[] = [
	{ id: 'rank-collapse', label: '3 × 3 Rank Collapse & Projection' },
	{ id: 'rectangular', label: 'Rectangular Systems (m ≠ n)' },
	{ id: 'full-rank', label: '3 × 3 Full-Rank Transformations' },
	{ id: 'boundary', label: 'Fragile Rank & Degenerate Boundaries' }
];

export const CANONICAL_PRESETS: readonly CanonicalPreset[] = [
	{
		id: 'asymmetric-rank2',
		name: 'Asymmetric Rank-2 Collapse (3×3, Rank 2)',
		shortLabel: 'Asymmetric Rank-2',
		group: 'rank-collapse',
		groupLabel: '3 × 3 Rank Collapse & Projection',
		m: 3,
		n: 3,
		expectedRank: 2,
		matrix: [
			[1, -1, 1],
			[1, 1, 3],
			[0, 1, 1]
		],
		defaultX: [1.5, 1.0, 0.5],
		defaultB: [1.4, 0.2, 1.8],
		takeaway:
			'Row space C(Aᵀ) and column space C(A) are two differently tilted 2D planes; N(A) and N(Aᵀ) are two distinct 1D lines.',
		geometricNote:
			'Prevents the classic misconception that row space equals column space. Here N(A) = span{(2, 1, −1)ᵀ} while N(Aᵀ) = span{(1, −1, 2)ᵀ}.',
		defaultCameraPreset: 'isometric'
	},
	{
		id: 'tilted-projection',
		name: 'Tilted Orthogonal Projection (3×3, Rank 2)',
		shortLabel: 'Tilted Projection',
		group: 'rank-collapse',
		groupLabel: '3 × 3 Rank Collapse & Projection',
		m: 3,
		n: 3,
		expectedRank: 2,
		matrix: [
			[8 / 9, -2 / 9, -2 / 9],
			[-2 / 9, 5 / 9, -4 / 9],
			[-2 / 9, -4 / 9, 5 / 9]
		],
		defaultX: [1.4, 1.2, 0.8],
		defaultB: [0.6, 1.8, 1.4],
		takeaway:
			'Symmetric idempotent projection (P² = P) onto the plane x₁ + 2x₂ + 2x₃ = 0, collapsing along its 90° normal line.',
		geometricNote:
			'Because P is symmetric, C(Aᵀ) = C(A) and N(A) = N(Aᵀ) = span{(1, 2, 2)ᵀ}. Both active singular values equal 1.',
		defaultCameraPreset: 'edge-on'
	},
	{
		id: 'rank1-outer-product',
		name: 'Rank-1 Outer Product u vᵀ (3×3, Rank 1)',
		shortLabel: 'Rank-1 Outer Product',
		group: 'rank-collapse',
		groupLabel: '3 × 3 Rank Collapse & Projection',
		m: 3,
		n: 3,
		expectedRank: 1,
		matrix: [
			[1, -0.5, 0.5],
			[2, -1, 1],
			[-1, 0.5, -0.5]
		],
		defaultX: [1.2, 1.0, -0.8],
		defaultB: [1.4, 0.6, 1.2],
		takeaway:
			'Flips the 2D/1D split: 1D row line and 2D nullspace plane map to a 1D column line with a 2D left-nullspace plane.',
		geometricNote:
			'Every vector in the entire 2D plane N(A) vanishes; every output lands on the single 1D line spanned by u = (1, 2, −1)ᵀ.',
		defaultCameraPreset: 'isometric'
	},
	{
		id: 'strang-graph-incidence',
		name: "Strang's 3-Node Graph Incidence Matrix (3×3, Rank 2)",
		shortLabel: 'Graph Incidence (3-Node)',
		group: 'rank-collapse',
		groupLabel: '3 × 3 Rank Collapse & Projection',
		m: 3,
		n: 3,
		expectedRank: 2,
		matrix: [
			[-1, 1, 0],
			[0, -1, 1],
			[-1, 0, 1]
		],
		defaultX: [0.5, 1.6, 2.1],
		defaultB: [1.0, 0.8, 0.4],
		takeaway:
			'Oriented triangle graph: N(A) = span{(1,1,1)ᵀ} is constant voltage shift; N(Aᵀ) = span{(1,1,−1)ᵀ} encodes Kirchhoff’s Voltage Law.',
		geometricNote:
			'Potential differences across the three edges must sum to zero around the loop (b₁ + b₂ − b₃ = 0); any nonzero loop sum lies in N(Aᵀ).',
		defaultCameraPreset: 'isometric'
	},
	{
		id: 'overdetermined-line-fit',
		name: 'Overdetermined Least Squares — Line Fit to 3 Points (3×2, Rank 2)',
		shortLabel: 'Line Fit (3×2)',
		group: 'rectangular',
		groupLabel: 'Rectangular Systems (m ≠ n)',
		m: 3,
		n: 2,
		expectedRank: 2,
		matrix: [
			[1, -1],
			[1, 0],
			[1, 1]
		],
		defaultX: [1.2, 0.7],
		defaultB: [0.8, 2.2, 1.8],
		takeaway:
			'Full-column-rank 3×2 design matrix: N(A) = {0} inside ℝ², while C(A) is a 2D plane in ℝ³ with 1D residual line N(Aᵀ).',
		geometricNote:
			'Fitting y = c + dt at t = −1, 0, 1 projects noisy observations b ∈ ℝ³ orthogonally onto the 2D plane C(A), leaving error e ∈ N(Aᵀ) = span{(1, −2, 1)ᵀ}.',
		defaultCameraPreset: 'isometric'
	},
	{
		id: 'underdetermined-system',
		name: 'Underdetermined System — 2 Equations, 3 Unknowns (2×3, Rank 2)',
		shortLabel: 'Underdetermined (2×3)',
		group: 'rectangular',
		groupLabel: 'Rectangular Systems (m ≠ n)',
		m: 2,
		n: 3,
		expectedRank: 2,
		matrix: [
			[1, 1, -1],
			[1, -1, 0]
		],
		defaultX: [1.4, 0.4, 0.6],
		defaultB: [1.2, 1.0],
		takeaway:
			'Full-row-rank 2×3 map: C(A) fills all of ℝ² (N(Aᵀ) = {0}), while N(A) is a 1D line in ℝ³ yielding an infinite line of exact solutions.',
		geometricNote:
			'Every target b ∈ ℝ² is reachable, and every point along the affine fiber x⁺ + N(A) maps to the exact same output.',
		defaultCameraPreset: 'isometric'
	},
	{
		id: 'rank-deficient-rectangular',
		name: 'Rank-Deficient Rectangular (3×2, Rank 1)',
		shortLabel: 'Rank-Deficient (3×2)',
		group: 'rectangular',
		groupLabel: 'Rectangular Systems (m ≠ n)',
		m: 3,
		n: 2,
		expectedRank: 1,
		matrix: [
			[1, -2],
			[2, -4],
			[-1, 2]
		],
		defaultX: [1.2, 0.4],
		defaultB: [1.5, 0.6, 1.2],
		takeaway:
			'Both ambiguity (dim N(A) = 1 in ℝ²) and impossibility (dim N(Aᵀ) = 2 in ℝ³) coexist in one rectangular matrix.',
		geometricNote:
			'Least squares still yields a unique minimum-norm representative x⁺ ∈ C(Aᵀ), while the full minimizer set is the line x⁺ + N(A).',
		defaultCameraPreset: 'isometric'
	},
	{
		id: 'anisotropic-stretch-rotation',
		name: 'Full-Rank Anisotropic Stretch & Rotation (3×3, Rank 3)',
		shortLabel: 'Full-Rank Stretch',
		group: 'full-rank',
		groupLabel: '3 × 3 Full-Rank Transformations',
		m: 3,
		n: 3,
		expectedRank: 3,
		matrix: [
			[1.6, -0.8, 0.4],
			[0.6, 1.1, -0.5],
			[-0.3, 0.4, 0.7]
		],
		defaultX: [1.0, 0.8, 0.6],
		defaultB: [1.2, 1.0, -0.5],
		takeaway:
			'Invertible map with σ₁ > σ₂ > σ₃ > 0: C(Aᵀ) = C(A) = ℝ³, both nullspaces shrink to {0}, and the unit sphere becomes a full 3D ellipsoid.',
		geometricNote:
			'No direction is lost and no target is unreachable; every Ax = b has a unique exact solution.',
		defaultCameraPreset: 'isometric'
	},
	{
		id: 'shear-3d',
		name: '3D Shear — Volume-Preserving Non-Normal (3×3, Rank 3)',
		shortLabel: '3D Shear (det = 1)',
		group: 'full-rank',
		groupLabel: '3 × 3 Full-Rank Transformations',
		m: 3,
		n: 3,
		expectedRank: 3,
		matrix: [
			[1, 1.2, 0.6],
			[0, 1, 0.8],
			[0, 0, 1]
		],
		defaultX: [0.6, 1.1, 0.9],
		defaultB: [1.5, 1.2, 0.8],
		takeaway:
			'Upper-triangular shear with det(A) = 1 and all eigenvalues equal to 1, yet singular values ≠ 1 tilt the sphere into an elongated ellipsoid.',
		geometricNote:
			'Shows why eigenvalues alone miss stretching geometry: volume stays 1 (σ₁σ₂σ₃ = 1) while σ₁ > 1 > σ₃.',
		defaultCameraPreset: 'isometric'
	},
	{
		id: 'householder-reflection',
		name: 'Householder Mirror Reflection (3×3, Rank 3)',
		shortLabel: 'Householder Reflection',
		group: 'full-rank',
		groupLabel: '3 × 3 Full-Rank Transformations',
		m: 3,
		n: 3,
		expectedRank: 3,
		matrix: [
			[1 / 9, 4 / 9, -8 / 9],
			[4 / 9, 7 / 9, 4 / 9],
			[-8 / 9, 4 / 9, 1 / 9]
		],
		defaultX: [1.4, -0.4, 1.1],
		defaultB: [1.0, 1.2, -0.8],
		takeaway:
			'Orthogonal reflection (QᵀQ = I, det Q = −1, all σᵢ = 1) across the tilted mirror plane 2x₁ − x₂ + 2x₃ = 0.',
		geometricNote:
			'Preserves every length and angle (κ(Q) = 1) while reversing handedness. Try Superimposed 3-Stage SVD morph to watch the mirror flip.',
		defaultCameraPreset: 'isometric'
	},
	{
		id: 'nearly-singular',
		name: 'Nearly Singular / Fragile Rank (3×3, σ₃ = 0.04 → 0)',
		shortLabel: 'Nearly Singular (σ₃ = 0.04)',
		group: 'boundary',
		groupLabel: 'Fragile Rank & Degenerate Boundaries',
		m: 3,
		n: 3,
		expectedRank: 3,
		matrix: makeNearlySingularMatrix(),
		defaultX: [1.0, 1.1, -0.6],
		defaultB: [0.6, 1.2, 1.4],
		takeaway:
			'Thin pancake ellipsoid with σ₃ = 0.04: drag σ₃ → 0 or raise rank tolerance τ to watch 1D nullspaces abruptly emerge.',
		geometricNote:
			'Technically full rank (κ = 50), yet tiny perturbations along u₃ amplify by 25× in x⁺ = A⁺b. Numerical rank depends on tolerance τ.',
		highlightSigmaControl: true,
		defaultCameraPreset: 'isometric'
	},
	{
		id: 'zero-matrix',
		name: 'Zero Matrix (3×3, Rank 0)',
		shortLabel: 'Zero Matrix (Rank 0)',
		group: 'boundary',
		groupLabel: 'Fragile Rank & Degenerate Boundaries',
		m: 3,
		n: 3,
		expectedRank: 0,
		matrix: [
			[0, 0, 0],
			[0, 0, 0],
			[0, 0, 0]
		],
		defaultX: [1.2, 0.9, 0.7],
		defaultB: [1.0, 0.8, 0.6],
		takeaway:
			'Degenerate boundary case: C(Aᵀ) = C(A) = {0} while both N(A) and N(Aᵀ) fill all of ℝ³.',
		geometricNote:
			'Every input vanishes to the origin and every nonzero target is pure left-nullspace residual; only b = 0 is solvable.',
		defaultCameraPreset: 'isometric'
	}
];

export const DEFAULT_PRESET_ID = 'asymmetric-rank2';

export function getPresetById(id: string): CanonicalPreset | undefined {
	return CANONICAL_PRESETS.find((preset) => preset.id === id);
}
