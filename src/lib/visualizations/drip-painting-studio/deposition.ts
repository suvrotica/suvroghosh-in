import { createStreamRng, normalizeSeed } from './prng.ts';
import { STUDY_INDEX, STUDY_SPECS } from './studies.ts';
import {
	DEFAULT_ARTBOARD_HEIGHT,
	DEFAULT_ARTBOARD_WIDTH,
	DEFAULT_FLOW,
	MAX_FLOW,
	MIN_FLOW,
	PALETTE,
	type DepositionPass,
	type DetachedDroplet,
	type EarnedPool,
	type StudyId,
	type SweptPass
} from './types.ts';

function clamp(v: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, v));
}

function smoothstep(edge0: number, edge1: number, x: number): number {
	const span = edge1 - edge0;
	if (Math.abs(span) < 1e-6) return x >= edge1 ? 1 : 0;
	const t = clamp((x - edge0) / span, 0, 1);
	return t * t * (3 - 2 * t);
}

export function buildDepositionPasses(
	sweptPasses: readonly SweptPass[],
	seed: number,
	study: StudyId,
	paintFlow: number,
	artboardWidth?: number,
	artboardHeight?: number
): DepositionPass[] {
	const rawWidth = artboardWidth ?? sweptPasses[0]?.artboardWidth ?? DEFAULT_ARTBOARD_WIDTH;
	const rawHeight = artboardHeight ?? sweptPasses[0]?.artboardHeight ?? DEFAULT_ARTBOARD_HEIGHT;
	const resolvedWidth =
		Number.isFinite(rawWidth) && rawWidth > 0 ? rawWidth : DEFAULT_ARTBOARD_WIDTH;
	const resolvedHeight =
		Number.isFinite(rawHeight) && rawHeight > 0 ? rawHeight : DEFAULT_ARTBOARD_HEIGHT;
	const safeSeed = normalizeSeed(seed);
	const safeStudy: StudyId = Object.prototype.hasOwnProperty.call(STUDY_SPECS, study)
		? study
		: 'pending-file';
	const safeFlow = Number.isFinite(paintFlow) ? Math.round(paintFlow) : DEFAULT_FLOW;
	const clampedFlow = clamp(safeFlow, MIN_FLOW, MAX_FLOW);
	const flowNorm = clampedFlow / 100;
	const flowT = (flowNorm - 0.1) / 0.9;
	const minDim = Math.min(resolvedWidth, resolvedHeight);
	const artScale = minDim / 800;
	const spec = STUDY_SPECS[safeStudy];
	const kin = spec.kinematics;
	const studyIdx = STUDY_INDEX[safeStudy];

	return sweptPasses.map((pass): DepositionPass => {
		const flowRng = createStreamRng(safeSeed, 'flow', studyIdx * 64 + pass.passIndex);
		const pigment = PALETTE[pass.pigmentKey];
		const n = pass.pointCount;

		const beadPhaseOffset = flowRng.next();
		const widthJitter = flowRng.range(0.92, 1.08);

		let layerWidthMult = 1.0;
		if (pass.pigmentKey === 'lime-whitewash') {
			if (pass.layerIndex === 4) layerWidthMult = 1.32;
			else if (pass.layerIndex >= 5) layerWidthMult = 1.65;
		} else if (pass.layerIndex >= 5) {
			layerWidthMult = 1.18;
		}

		const baseHalfWidth =
			(3.45 + Math.pow(flowT, 1.02) * 18.4) *
			kin.ribbonWidthScale *
			layerWidthMult *
			widthJitter *
			artScale;

		const halfWidth = new Float32Array(n);
		const thickness = new Float32Array(n);

		for (let k = 0; k < n; k++) {
			const u = n > 1 ? k / (n - 1) : 0;
			const vNorm = pass.globalSpeedNorm[k]!;
			const velFactor = 0.54 + 1.22 * Math.pow(1 - vNorm, 1.35);

			const neckStrength = clamp((0.52 - flowT) / 0.52, 0, 1) * clamp((vNorm - 0.25) / 0.75, 0, 1);
			const beadWave = Math.sin(
				(pass.arcLength[k]! / (14 * artScale) + beadPhaseOffset) * Math.PI * 2
			);
			const capillaryMod = 1 - neckStrength * (0.48 - 0.52 * beadWave);

			const taper = Math.max(0.36, smoothstep(0, 0.04, u) * smoothstep(1, 0.96, u));

			halfWidth[k] = Math.max(0.3 * artScale, baseHalfWidth * velFactor * capillaryMod * taper);
			thickness[k] =
				(0.36 + 0.98 * Math.pow(flowT, 0.95)) *
				(0.7 + 0.56 * (1 - vNorm)) *
				pigment.bodyThickness *
				clamp(capillaryMod, 0.35, 1.25);
		}

		// 2. Earned Pools at local dwell maxima (flow-independent candidate scan)
		const candidatePoolIndices: number[] = [];
		const minArcGap = 82 * artScale;
		let lastPoolArc = -Infinity;

		for (let k = 3; k < n - 3; k++) {
			const d = pass.dwell[k]!;
			if (
				d >= 0.4 &&
				d >= pass.dwell[k - 1]! &&
				d >= pass.dwell[k + 1]! &&
				pass.arcLength[k]! - lastPoolArc >= minArcGap
			) {
				candidatePoolIndices.push(k);
				lastPoolArc = pass.arcLength[k]!;
				if (candidatePoolIndices.length >= 4) break;
			}
		}

		const pools: EarnedPool[] = [];
		for (const idx of candidatePoolIndices) {
			const threshold = clamp((0.17 + flowRng.next() * 0.46) / kin.poolPropensity, 0.12, 0.95);
			const lobeCount = flowRng.int(2, 3) as 2 | 3;
			const h2 = flowRng.range(0.06, 0.15);
			const h3 = lobeCount === 3 ? flowRng.range(0.04, 0.1) : 0;
			const p2 = flowRng.range(0, Math.PI * 2);
			const p3 = flowRng.range(0, Math.PI * 2);
			const jitterR = flowRng.range(0.88, 1.14);

			if (flowNorm >= threshold) {
				const dVal = pass.dwell[idx]!;
				const radius =
					(12.5 + 31.5 * Math.pow(flowT, 1.05)) *
					(0.68 + 0.52 * dVal) *
					Math.pow(kin.poolPropensity, 0.35) *
					jitterR *
					artScale;
				const poolThick = (0.75 + 1.28 * flowT) * pigment.bodyThickness;
				pools.push({
					passIndex: pass.passIndex,
					layerIndex: pass.layerIndex,
					pigmentKey: pass.pigmentKey,
					sampleIndex: idx,
					x: pass.x[idx]!,
					y: pass.y[idx]!,
					radius,
					thickness: poolThick,
					lobeCount,
					h2,
					h3,
					p2,
					p3
				});
			}
		}

		// 3. Curvature-weighted candidate droplets (flow-independent candidate draws)
		const weights = new Float64Array(n);
		let weightSum = 0;
		for (let k = 0; k < n; k++) {
			const curvTerm = Math.min(1, Math.abs(pass.signedCurvature[k]!) * 70 * artScale);
			const spd = pass.globalSpeedNorm[k]!;
			const w = 0.15 + 1.85 * curvTerm + 0.95 * spd * spd;
			weights[k] = w;
			weightSum += w;
		}

		const candidateDropletCount = clamp(Math.round(28 * kin.spatterPropensity), 14, 46);
		const droplets: DetachedDroplet[] = [];

		for (let m = 0; m < candidateDropletCount; m++) {
			const cdfTarget = flowRng.next() * weightSum;
			let acc = 0;
			let sampleIdx = 0;
			for (let k = 0; k < n; k++) {
				acc += weights[k]!;
				if (cdfTarget <= acc) {
					sampleIdx = k;
					break;
				}
			}

			const uThresh = flowRng.next();
			const distScale = flowRng.range(0.45, 1.0);
			const jitterAngle = flowRng.range(-0.28, 0.28);
			const baseRadiusUnit = flowRng.range(1.5, 4.2);
			const elongation = flowRng.range(1.0, 1.55);

			const wSample = weights[sampleIdx]!;
			const whipFactor = clamp((wSample - 0.15) / 2.6, 0, 1);
			const detachThreshold = clamp(0.09 + (1 - whipFactor) * 0.4 + uThresh * 0.4, 0.09, 0.98);

			if (flowNorm >= detachThreshold) {
				const tx = pass.tx[sampleIdx]!;
				const ty = pass.ty[sampleIdx]!;
				const curvSign = pass.signedCurvature[sampleIdx]! >= 0 ? 1 : -1;
				// Normal perpendicular to tangent
				const nx = -ty;
				const ny = tx;

				const dirX = tx + curvSign * nx * whipFactor * 0.65;
				const dirY = ty + curvSign * ny * whipFactor * 0.65;
				const baseAngle = Math.atan2(dirY, dirX) + jitterAngle;
				const cosA = Math.cos(baseAngle);
				const sinA = Math.sin(baseAngle);

				const throwDist = (10 + 48 * whipFactor * (0.4 + 0.6 * flowT)) * distScale * artScale;
				const dx = clamp(pass.x[sampleIdx]! + cosA * throwDist, 6, resolvedWidth - 6);
				const dy = clamp(pass.y[sampleIdx]! + sinA * throwDist, 6, resolvedHeight - 6);

				const sizeScale = (0.58 + 0.85 * Math.pow(flowT, 0.9)) * artScale;
				const ry = baseRadiusUnit * sizeScale;
				const rx = ry * (1 + (elongation - 1) * whipFactor);
				const dropThick = (0.42 + 0.72 * flowT) * pigment.bodyThickness;

				droplets.push({
					passIndex: pass.passIndex,
					layerIndex: pass.layerIndex,
					pigmentKey: pass.pigmentKey,
					sampleIndex: sampleIdx,
					x: dx,
					y: dy,
					rx,
					ry,
					cosA,
					sinA,
					thickness: dropThick
				});
			}
		}

		return {
			...pass,
			paintFlow: clampedFlow,
			halfWidth,
			thickness,
			pools,
			droplets
		};
	});
}
