import { createStreamRng, hashMarkSigned, hashMarkUnit } from './prng.ts';
import type { CandidateHierarchy, CandidateMark, SceneModel } from './types.ts';

// Generalized golden-ratio constants (Roberts R2 quasirandom 2D sequence)
const PLASTIC_G = 1.324717957244746;
const R2_ALPHA_X = 1 / PLASTIC_G;
const R2_ALPHA_Y = 1 / (PLASTIC_G * PLASTIC_G);

const BASE_REFERENCE_AREA = 1200 * 800;
const BASE_TARGET_CANDIDATES = 26500;

const hierarchyCache = new Map<string, CandidateHierarchy>();
const MAX_HIERARCHY_CACHE = 8;

export function computeActiveMarkCount(totalCandidates: number, dotSpacing: number): number {
	const s = Math.max(0, Math.min(100, dotSpacing)) / 100;
	// Smooth exponential progression from 100% of candidates (Tight, 0%) down to ~15% (Open, 100%).
	// At default dotSpacing = 35%, fraction ≈ 0.59 (~15,600 marks on a 1200x800 artboard).
	const fraction = Math.pow(0.15, Math.pow(s, 1.08));
	return Math.max(400, Math.min(totalCandidates, Math.round(totalCandidates * fraction)));
}

export function generateCandidateHierarchy(scene: SceneModel): CandidateHierarchy {
	const { seed, sceneFamily, artboardWidth, artboardHeight, fields, focalArea } = scene;
	const cacheKey = `${seed}:${sceneFamily}:${artboardWidth}x${artboardHeight}`;
	const cached = hierarchyCache.get(cacheKey);
	if (cached) return cached;

	const rng = createStreamRng(seed, 'candidates');
	const offsetU = rng.next();
	const offsetV = rng.next();

	const areaRatio = Math.max(0.5, Math.min(1.6, (artboardWidth * artboardHeight) / BASE_REFERENCE_AREA));
	const targetCount = Math.round(BASE_TARGET_CANDIDATES * areaRatio);
	const rawAttemptLimit = Math.round(targetCount * 1.48);

	// Approximate minimum-clearance spatial hash grid to prevent accidental dot stacking
	// while avoiding any regular grid pattern.
	const minClearance = 2.05;
	const minClearance2 = minClearance * minClearance;
	const cellSize = minClearance;
	const gridCols = Math.max(1, Math.ceil(artboardWidth / cellSize));
	const gridRows = Math.max(1, Math.ceil(artboardHeight / cellSize));
	const head = new Int32Array(gridCols * gridRows);
	head.fill(-1);
	const nextNode = new Int32Array(targetCount + 8);
	const acceptedX = new Float32Array(targetCount + 8);
	const acceptedY = new Float32Array(targetCount + 8);

	const avgSpacing = Math.sqrt((artboardWidth * artboardHeight) / targetCount);
	const jitterRadius = avgSpacing * 0.34;

	const rawCandidates: {
		candidate: CandidateMark;
		priorityScore: number;
	}[] = [];

	const focalCx = focalArea.x * artboardWidth;
	const focalCy = focalArea.y * artboardHeight;
	const focalR = focalArea.radius * Math.min(artboardWidth, artboardHeight);
	const focalR2 = focalR * focalR;

	let accepted = 0;
	for (let rawIdx = 0; rawIdx < rawAttemptLimit && accepted < targetCount; rawIdx++) {
		const uBase = (offsetU + (rawIdx + 1) * R2_ALPHA_X) % 1;
		const vBase = (offsetV + (rawIdx + 1) * R2_ALPHA_Y) % 1;

		const jAngle = hashMarkUnit(seed, 'candidates', rawIdx, 0) * Math.PI * 2;
		const jDist = Math.sqrt(hashMarkUnit(seed, 'candidates', rawIdx, 1)) * jitterRadius;
		const lx = uBase * artboardWidth + Math.cos(jAngle) * jDist;
		const ly = vBase * artboardHeight + Math.sin(jAngle) * jDist;

		if (lx < 1.5 || lx > artboardWidth - 1.5 || ly < 1.5 || ly > artboardHeight - 1.5) {
			continue;
		}

		// Sample scene fields at (lx, ly)
		const fx = Math.max(
			0,
			Math.min(fields.fieldWidth - 1, Math.floor((lx / artboardWidth) * fields.fieldWidth))
		);
		const fy = Math.max(
			0,
			Math.min(fields.fieldHeight - 1, Math.floor((ly / artboardHeight) * fields.fieldHeight))
		);
		const fIdx = fy * fields.fieldWidth + fx;
		const imp = fields.importance[fIdx]!;

		// Tighter local clearance allowed on high-importance figures/edges so silhouettes get crisp detail
		const localClear2 = imp > 1.7 ? minClearance2 * 0.62 : minClearance2;

		const gx = Math.min(gridCols - 1, Math.max(0, Math.floor(lx / cellSize)));
		const gy = Math.min(gridRows - 1, Math.max(0, Math.floor(ly / cellSize)));
		let tooClose = false;
		for (let ny = Math.max(0, gy - 1); ny <= Math.min(gridRows - 1, gy + 1) && !tooClose; ny++) {
			for (let nx = Math.max(0, gx - 1); nx <= Math.min(gridCols - 1, gx + 1); nx++) {
				let cur = head[ny * gridCols + nx]!;
				while (cur !== -1) {
					const dx = lx - acceptedX[cur]!;
					const dy = ly - acceptedY[cur]!;
					if (dx * dx + dy * dy < localClear2) {
						tooClose = true;
						break;
					}
					cur = nextNode[cur]!;
				}
			}
		}
		if (tooClose) continue;

		const slot = accepted++;
		acceptedX[slot] = lx;
		acceptedY[slot] = ly;
		const cellIdx = gy * gridCols + gx;
		nextNode[slot] = head[cellIdx]!;
		head[cellIdx] = slot;

		const catIdx = fields.category[fIdx]!;
		const boundary = fields.boundary[fIdx]!;
		const depth = fields.depth[fIdx]!;
		const minNeighborDepth = fields.minNeighborDepth[fIdx]!;
		const lit = fields.lit[fIdx]! / 255;
		const c3 = fIdx * 3;
		const baseR = fields.rgb[c3]!;
		const baseG = fields.rgb[c3 + 1]!;
		const baseB = fields.rgb[c3 + 2]!;

		const surfaceAngle = (fields.tangentAngle[fIdx]! / 255) * Math.PI;
		const aniso = fields.anisotropy[fIdx]! / 255;

		// Keep marks predominantly compact dabs (slightly irregular circles and short ovals, never long brush strokes)
		const angleJitter = hashMarkSigned(seed, 'candidates', slot, 2) * (1 - aniso * 0.72) * 1.35;
		const angleRad = surfaceAngle + angleJitter;
		const aspectBase = 1.04 + aniso * 0.34 + hashMarkUnit(seed, 'candidates', slot, 3) * 0.16;
		const aspect = Math.min(1.52, aspectBase);

		// Finer marks on people, props, and sharp boundaries; slightly calmer footprints in open sky/hills
		let baseRadiusFactor = 1.0 + hashMarkSigned(seed, 'candidates', slot, 4) * 0.12;
		if (catIdx >= 15) {
			// person-cloth, person-skin, person-hair, prop
			baseRadiusFactor *= 0.74;
		} else if (catIdx === 9 || catIdx === 12 || catIdx === 13 || catIdx === 14) {
			// structure, furniture, stall, sign
			baseRadiusFactor *= 0.84;
		} else if (catIdx <= 2) {
			// sky, cloud, distant-hill
			baseRadiusFactor *= 1.14;
		}
		if (boundary > 0.35) {
			baseRadiusFactor *= 1 - Math.min(0.22, boundary * 0.24);
		}

		const dfx = lx - focalCx;
		const dfy = ly - focalCy;
		const isFocalRegion = dfx * dfx + dfy * dfy <= focalR2;

		// Progressive hierarchy rank: R2 index divided by importance ensures EVERY prefix [0..N)
		// remains spatially well-distributed across the whole canvas while allocating extra marks
		// to figures, focal activities, and important boundaries.
		const tieJitter = 0.96 + hashMarkUnit(seed, 'candidates', slot, 5) * 0.08;
		const priorityScore = ((slot + 1) * tieJitter) / Math.pow(imp, 1.24);

		rawCandidates.push({
			candidate: {
				id: slot,
				x: lx,
				y: ly,
				objectId: fields.objectId[fIdx]!,
				categoryIndex: catIdx,
				depth,
				minNeighborDepth,
				lit,
				boundary,
				isFocalRegion,
				baseRadiusFactor,
				aspect,
				angleRad,
				baseR,
				baseG,
				baseB
			},
			priorityScore
		});
	}

	rawCandidates.sort((a, b) => a.priorityScore - b.priorityScore || a.candidate.id - b.candidate.id);
	const candidates = rawCandidates.map((entry) => entry.candidate);

	const hierarchy: CandidateHierarchy = {
		seed,
		sceneFamily,
		artboardWidth,
		artboardHeight,
		candidates
	};

	if (hierarchyCache.size >= MAX_HIERARCHY_CACHE) {
		const oldest = hierarchyCache.keys().next().value;
		if (oldest !== undefined) hierarchyCache.delete(oldest);
	}
	hierarchyCache.set(cacheKey, hierarchy);
	return hierarchy;
}
