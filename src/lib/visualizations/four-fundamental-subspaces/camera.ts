import { cross3, dot, formatEuclideanSpace, padToVec3 } from './math';
import type { CameraPresetId, SubspaceAnalysis, Vec3 } from './types';

export interface CameraPose {
	position: Vec3;
	target: Vec3;
	up: Vec3;
	note: string;
}

export interface OrthoProjectionBasis {
	right: Vec3;
	up: Vec3;
	forward: Vec3;
}

function norm3(v: Vec3): number {
	return Math.hypot(v[0], v[1], v[2]);
}

function unit3(v: Vec3, fallback: Vec3 = [0, 0, 1]): Vec3 {
	const n = norm3(v);
	if (n <= 1e-12) return fallback;
	return [v[0] / n, v[1] / n, v[2] / n];
}

function scale3(v: Vec3, s: number): Vec3 {
	return [v[0] * s, v[1] * s, v[2] * s];
}

function chooseUpNotParallel(dir: Vec3, preferredUp: Vec3 = [0, 1, 0]): Vec3 {
	const d = unit3(dir);
	const p = unit3(preferredUp);
	if (Math.abs(dot(d, p)) < 0.92) return p;
	const alt: Vec3 = [0, 0, 1];
	if (Math.abs(dot(d, alt)) < 0.92) return alt;
	return [1, 0, 0];
}

/**
 * Compute subspace-aware camera pose for Domain, Codomain, or Superimposed 3D stages.
 * Coordinates use math space (x1 = X, x2 = Y, x3 = Z).
 */
export function computeSmartCameraPose(
	analysis: SubspaceAnalysis,
	preset: CameraPresetId,
	stage: 'domain' | 'codomain' | 'superimposed',
	distance = 8.4
): CameraPose {
	const target: Vec3 = [0, 0, 0];
	const ambientDim = stage === 'codomain' ? analysis.m : analysis.n;

	if (preset === 'isometric') {
		if (ambientDim <= 2 && stage !== 'superimposed') {
			const dir = unit3([0.45, 0.35, 1.35]);
			return {
				position: scale3(dir, distance * 0.92),
				target,
				up: [0, 1, 0],
				note: `Slightly oblique overview of ambient ${formatEuclideanSpace(ambientDim)}`
			};
		}
		const dir = unit3([1.15, 0.85, 1.35]);
		return {
			position: scale3(dir, distance),
			target,
			up: [0, 1, 0],
			note: 'Balanced 3/4 isometric overview'
		};
	}

	const activeSubspace = stage === 'codomain' ? analysis.subspaces.col : analysis.subspaces.row;
	const orthSubspace = stage === 'codomain' ? analysis.subspaces.leftNull : analysis.subspaces.null;

	if (preset === 'edge-on') {
		if (ambientDim === 3) {
			// Align camera along a horizontal direction STRICTLY inside the 2D plane so the 2D plane
			// flattens to a razor-thin line, the 1D orthogonal complement meets it at an exact 90° angle
			// in screen space, and camera.up stays level [0, 1, 0] for roll-free OrbitControls dragging.
			if (activeSubspace.dimension === 2 && orthSubspace.dimension === 1) {
				const normalDir = unit3(padToVec3(orthSubspace.svdBasis[0]));
				const horizInPlane = cross3(normalDir, [0, 1, 0]);
				const camDir =
					norm3(horizInPlane) > 1e-4
						? unit3(horizInPlane)
						: unit3(padToVec3(activeSubspace.svdBasis[0]));
				return {
					position: scale3(camDir, distance),
					target,
					up: [0, 1, 0],
					note: `Edge-on to ${activeSubspace.symbol}: the 2D plane flattens to a line while ${orthSubspace.symbol} pierces it at 90°`
				};
			}
			// If complement is a 2D plane and active is a 1D line (e.g., Rank 1): look edge-on to the 2D complement!
			if (activeSubspace.dimension === 1 && orthSubspace.dimension === 2) {
				const lineDir = unit3(padToVec3(activeSubspace.svdBasis[0]));
				const horizInComp = cross3(lineDir, [0, 1, 0]);
				const camDir =
					norm3(horizInComp) > 1e-4
						? unit3(horizInComp)
						: unit3(padToVec3(orthSubspace.svdBasis[0]));
				return {
					position: scale3(camDir, distance),
					target,
					up: [0, 1, 0],
					note: `Edge-on to ${orthSubspace.symbol}: the 2D plane flattens while ${activeSubspace.symbol} stands perpendicular at 90°`
				};
			}
		}
		// Fallback for R^2 or full-rank / zero matrices
		const dir = unit3([1.4, 0.25, 0.95]);
		return {
			position: scale3(dir, distance),
			target,
			up: [0, 1, 0],
			note: 'Low-elevation edge-on inspection angle'
		};
	}

	if (preset === 'down-nullspace') {
		if (orthSubspace.dimension >= 1 && ambientDim === 3) {
			const rawNull = unit3(padToVec3(orthSubspace.svdBasis[0]));
			// Avoid exact polar singularity along world Y so OrbitControls remains gimbal-free
			const nullDir =
				Math.abs(dot(rawNull, [0, 1, 0])) > 0.998
					? unit3([rawNull[0], rawNull[1], rawNull[2] + 0.004])
					: rawNull;
			return {
				position: scale3(nullDir, distance),
				target,
				up: [0, 1, 0],
				note:
					stage === 'codomain'
						? `Looking straight down ${orthSubspace.symbol}: b visually collapses onto its projection p ∈ C(A)`
						: `Looking straight down ${orthSubspace.symbol}: the entire affine fiber xᵣ + N(A) collapses to a single point`
			};
		}
		if (orthSubspace.dimension === 1 && ambientDim === 2) {
			const nullDir = unit3(padToVec3(orthSubspace.svdBasis[0]));
			const camDir = unit3([nullDir[0] * 0.95, nullDir[1] * 0.95, 0.31]);
			return {
				position: scale3(camDir, distance * 0.92),
				target,
				up: [0, 1, 0],
				note: `Sighting down 1D ${orthSubspace.symbol} inside ℝ²`
			};
		}
		const dir = unit3([0.85, 1.15, 1.15]);
		return {
			position: scale3(dir, distance),
			target,
			up: [0, 1, 0],
			note: `${orthSubspace.symbol} is trivial {0} — showing isometric overview`
		};
	}

	// 'face-on-active'
	if (ambientDim <= 2 && stage !== 'superimposed') {
		return {
			position: [0, 0, distance * 0.9],
			target,
			up: [0, 1, 0],
			note: `Head-on view of ambient ${formatEuclideanSpace(ambientDim)}`
		};
	}
	if (activeSubspace.dimension === 2 && orthSubspace.dimension === 1) {
		const normalDir = unit3(padToVec3(orthSubspace.svdBasis[0]));
		// Slight 6° tilt so the 1D normal remains faintly readable while the 2D plane is face-on
		const refAxis = unit3(padToVec3(activeSubspace.svdBasis[0]));
		const rawDir = unit3([
			normalDir[0] * 0.994 + refAxis[0] * 0.11,
			normalDir[1] * 0.994 + refAxis[1] * 0.11,
			normalDir[2] * 0.994 + refAxis[2] * 0.11
		]);
		const camDir =
			Math.abs(dot(rawDir, [0, 1, 0])) > 0.995
				? unit3([rawDir[0], rawDir[1], rawDir[2] + 0.1])
				: rawDir;
		return {
			position: scale3(camDir, distance),
			target,
			up: [0, 1, 0],
			note: `Face-on to the 2D ${activeSubspace.name.toLowerCase()} ${activeSubspace.symbol}`
		};
	}
	if (activeSubspace.dimension === 1 && orthSubspace.dimension === 2) {
		const lineDir = unit3(padToVec3(activeSubspace.svdBasis[0]));
		const horizNormal = cross3(lineDir, [0, 1, 0]);
		const normalToLine =
			norm3(horizNormal) > 1e-4 ? unit3(horizNormal) : unit3(padToVec3(orthSubspace.svdBasis[0]));
		return {
			position: scale3(normalToLine, distance),
			target,
			up: [0, 1, 0],
			note: `Broadside view of the 1D ${activeSubspace.name.toLowerCase()} ${activeSubspace.symbol}`
		};
	}
	const dir = unit3([0.9, 0.7, 1.4]);
	return {
		position: scale3(dir, distance),
		target,
		up: [0, 1, 0],
		note: `Overview of full-dimensional ${activeSubspace.symbol}`
	};
}

/**
 * Orthonormal view basis from spherical angles (azimuth, elevation) for the 2D SVG fallback
 * and deterministic static poster rendering.
 */
export function buildOrthoBasisFromAngles(
	azimuthDeg: number,
	elevationDeg: number
): OrthoProjectionBasis {
	const az = (azimuthDeg * Math.PI) / 180;
	const el = (elevationDeg * Math.PI) / 180;
	const cosEl = Math.cos(el);
	const forward: Vec3 = [cosEl * Math.sin(az), Math.sin(el), cosEl * Math.cos(az)];
	return buildOrthoBasisFromPosition(forward, [0, 1, 0]);
}

export function buildOrthoBasisFromPosition(
	position: Vec3,
	upHint: Vec3 = [0, 1, 0]
): OrthoProjectionBasis {
	const forward = unit3(position, [0, 0, 1]);
	const safeUp = chooseUpNotParallel(forward, upHint);
	const right = unit3(cross3(safeUp, forward), [1, 0, 0]);
	const up = unit3(cross3(forward, right), [0, 1, 0]);
	return { right, up, forward };
}

export function project3DTo2D(
	point: Vec3,
	basis: OrthoProjectionBasis,
	centerX: number,
	centerY: number,
	scale: number
): { x: number; y: number; depth: number } {
	const px = dot(point, basis.right);
	const py = dot(point, basis.up);
	const depth = dot(point, basis.forward);
	return {
		x: centerX + px * scale,
		y: centerY - py * scale,
		depth
	};
}
