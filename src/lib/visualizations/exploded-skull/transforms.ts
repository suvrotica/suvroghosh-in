import { BONE_BY_ID, MANDIBLE_TMJ_PIVOT, SKULL_BONES } from './bones';
import { MATERIAL_PRESETS, PRESET_BY_ID } from './presets';
import type {
	BoneId,
	ComputedBoneTransform,
	ProjectedBoneLabel,
	SkullBoneMetadata,
	SkullViewerState,
	Vec3
} from './types';

export function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

function normalizeVec3(v: Vec3): Vec3 {
	const len = Math.hypot(v[0], v[1], v[2]);
	if (len < 1e-6) return [0, 0, 0];
	return [v[0] / len, v[1] / len, v[2] / len];
}

/**
 * Computes the deterministic explosion direction for a bone given the active direction mode.
 * Assembled anatomical reference positions remain immutable; directions never accumulate frame-to-frame.
 */
export function resolveExplosionDirection(bone: SkullBoneMetadata, state: SkullViewerState): Vec3 {
	const presetOverride = PRESET_BY_ID[state.presetId]?.overrides?.[bone.id];
	switch (state.directionMode) {
		case 'radial':
			return normalizeVec3(bone.anatomicalPosition);
		case 'superior-inferior': {
			// Stratified vertical tiers so vault, cranial base, face, mandible, and hyoid separate cleanly.
			const tierY: Record<BoneId, number> = {
				'parietal-left': 1.0,
				'parietal-right': 1.0,
				frontal: 0.78,
				occipital: 0.25,
				'temporal-left': 0.1,
				'temporal-right': 0.1,
				sphenoid: -0.08,
				ethmoid: 0.06,
				'nasal-left': 0.34,
				'nasal-right': 0.34,
				'lacrimal-left': 0.22,
				'lacrimal-right': 0.22,
				'zygomatic-left': -0.22,
				'zygomatic-right': -0.22,
				'inferior-nasal-concha-left': -0.34,
				'inferior-nasal-concha-right': -0.34,
				vomer: -0.26,
				'palatine-left': -0.44,
				'palatine-right': -0.44,
				'maxilla-left': -0.58,
				'maxilla-right': -0.58,
				mandible: -0.95,
				hyoid: -1.25
			};
			return [0, tierY[bone.id], 0];
		}
		case 'anterior-posterior': {
			const tierZ: Record<BoneId, number> = {
				'nasal-left': 1.05,
				'nasal-right': 1.05,
				'lacrimal-left': 0.85,
				'lacrimal-right': 0.85,
				'maxilla-left': 0.78,
				'maxilla-right': 0.78,
				'inferior-nasal-concha-left': 0.68,
				'inferior-nasal-concha-right': 0.68,
				'zygomatic-left': 0.56,
				'zygomatic-right': 0.56,
				mandible: 0.52,
				vomer: 0.38,
				'palatine-left': 0.24,
				'palatine-right': 0.24,
				ethmoid: 0.32,
				frontal: 0.44,
				hyoid: 0.12,
				sphenoid: -0.08,
				'temporal-left': -0.36,
				'temporal-right': -0.36,
				'parietal-left': -0.68,
				'parietal-right': -0.68,
				occipital: -1.0
			};
			return [0, 0, tierZ[bone.id]];
		}
		case 'left-right': {
			if (bone.side === 'left') return [1, 0, 0];
			if (bone.side === 'right') return [-1, 0, 0];
			return [0, 0, 0];
		}
		case 'custom':
		case 'anatomical':
		default:
			return presetOverride?.direction ?? bone.explosionDirection;
	}
}

/**
 * Pure reference-anchored transform evaluation.
 * `explodedPosition = originalPosition + explosionDirection * explosionDistance * globalExplosion + customOffset`
 * where `originalPosition` is always `[0, 0, 0]` in skull-centered coordinates.
 */
export function computeBoneTargetTransform(
	bone: SkullBoneMetadata,
	state: SkullViewerState
): ComputedBoneTransform {
	const override = state.boneOverrides[bone.id];
	const preset = PRESET_BY_ID[state.presetId];
	const presetOverride = preset?.overrides?.[bone.id];

	const effectiveGlobal = state.compareAssembled ? 0 : clamp(state.globalExplosion, 0, 1);
	const direction = resolveExplosionDirection(bone, state);
	const baseDistance =
		state.directionMode === 'anatomical'
			? (presetOverride?.distance ?? bone.explosionDistance)
			: bone.explosionDistance;
	const scalar = effectiveGlobal * baseDistance * clamp(override.explosionDistance, 0, 2.5);

	const customOffset: Vec3 = state.compareAssembled ? [0, 0, 0] : override.customOffset;
	const px = direction[0] * scalar + customOffset[0];
	let py = direction[1] * scalar + customOffset[1];
	let pz = direction[2] * scalar + customOffset[2];

	// Anatomical TMJ hinge rotation when depressing the mandible in presets.
	let rx = 0;
	if (bone.id === 'mandible' && !state.compareAssembled && presetOverride?.rotationXDeg) {
		rx = ((presetOverride.rotationXDeg * Math.PI) / 180) * effectiveGlobal;
		const [, pivY, pivZ] = MANDIBLE_TMJ_PIVOT;
		const cos = Math.cos(rx);
		const sin = Math.sin(rx);
		// Rotate around [0, pivY, pivZ]: p' = R*(0 - pivot) + pivot = pivot - R*pivot
		py += pivY - (pivY * cos - pivZ * sin);
		pz += pivZ - (pivY * sin + pivZ * cos);
	}

	const isolatedSet = state.isolatedBoneIds;
	const isIsolatedMode = isolatedSet.length > 0;
	const isHyoidAllowed =
		bone.id !== 'hyoid' ||
		state.appearance.showHyoid ||
		(isIsolatedMode && isolatedSet.includes('hyoid'));
	const visible =
		state.globalVisible &&
		override.visible &&
		isHyoidAllowed &&
		(!isIsolatedMode || isolatedSet.includes(bone.id));

	const materialPreset = MATERIAL_PRESETS.find((m) => m.id === state.appearance.materialPreset);
	const materialOpacity =
		state.appearance.materialPreset === 'translucent-study'
			? (materialPreset?.baseOpacity ?? 0.42)
			: 1;
	const presetOpacity = state.compareAssembled ? 1 : (presetOverride?.opacity ?? 1);
	const opacity = clamp(override.opacity * presetOpacity * materialOpacity, 0.05, 1);

	// 1 scene unit = 100 mm
	const displacementMm = Math.round(Math.hypot(px, py, pz) * 100);

	return {
		boneId: bone.id,
		position: [px, py, pz],
		rotationRad: [rx, 0, 0],
		visible,
		opacity,
		displacementMm
	};
}

export function computeAllBoneTransforms(
	state: SkullViewerState
): Record<BoneId, ComputedBoneTransform> {
	const result = {} as Record<BoneId, ComputedBoneTransform>;
	for (const bone of SKULL_BONES) {
		result[bone.id] = computeBoneTargetTransform(bone, state);
	}
	return result;
}

/**
 * Deterministic 2D label collision-avoidance pass so anatomical callouts and leader lines
 * stay readable around the skull without piling on top of one another.
 */
export function resolveLabelCollisions(
	rawLabels: readonly ProjectedBoneLabel[],
	viewportWidth: number,
	viewportHeight: number
): ProjectedBoneLabel[] {
	if (rawLabels.length === 0) return [];
	const centerX = viewportWidth * 0.5;
	const centerY = viewportHeight * 0.46;
	const padX = Math.min(86, viewportWidth * 0.14);
	const padTop = Math.min(64, viewportHeight * 0.14);
	const padBottom = Math.min(116, viewportHeight * 0.24);
	const maxLabelY = Math.max(padTop, viewportHeight - padBottom);

	const positioned = rawLabels.map((item) => {
		const dx = item.anchorX - centerX;
		const dy = item.anchorY - centerY;
		const len = Math.hypot(dx, dy) || 1;
		// Push label outward radially along silhouette vector
		const push = item.selected ? 54 : 34;
		return {
			...item,
			labelX: clamp(item.anchorX + (dx / len) * push, padX, Math.max(padX, viewportWidth - padX)),
			labelY: clamp(item.anchorY + (dy / len) * (push * 0.72), padTop, maxLabelY)
		};
	});

	// Priority: selected/hovered first, then closest to camera
	positioned.sort((a, b) => {
		const prioA = (a.selected ? 2 : 0) + (a.hovered ? 1 : 0);
		const prioB = (b.selected ? 2 : 0) + (b.hovered ? 1 : 0);
		if (prioA !== prioB) return prioB - prioA;
		return a.depth - b.depth;
	});

	const minDx = 104;
	const minDy = 24;
	for (let iter = 0; iter < 10; iter += 1) {
		for (let i = 0; i < positioned.length; i += 1) {
			for (let j = i + 1; j < positioned.length; j += 1) {
				const a = positioned[i];
				const b = positioned[j];
				const dx = b.labelX - a.labelX;
				const dy = b.labelY - a.labelY;
				if (Math.abs(dx) < minDx && Math.abs(dy) < minDy) {
					const pushY = (minDy - Math.abs(dy)) * 0.55 + 1.5;
					const pushX = (minDx - Math.abs(dx)) * 0.14;
					const dirY = dy >= 0 ? 1 : -1;
					const dirX = dx >= 0 ? 1 : -1;
					// Keep selected/hovered labels steadier
					const weightA = a.selected ? 0.2 : 0.5;
					const weightB = b.selected ? 0.2 : 0.5;
					a.labelY = clamp(a.labelY - dirY * pushY * weightA, padTop, maxLabelY);
					b.labelY = clamp(b.labelY + dirY * pushY * weightB, padTop, maxLabelY);
					a.labelX = clamp(
						a.labelX - dirX * pushX * weightA,
						padX,
						Math.max(padX, viewportWidth - padX)
					);
					b.labelX = clamp(
						b.labelX + dirX * pushX * weightB,
						padX,
						Math.max(padX, viewportWidth - padX)
					);
				}
			}
		}
	}

	return positioned;
}

export function boneBoundsOverlapCount(transforms: Record<BoneId, ComputedBoneTransform>): number {
	const visibleIds = SKULL_BONES.map((b) => b.id).filter((id) => transforms[id].visible);
	let overlaps = 0;
	for (let i = 0; i < visibleIds.length; i += 1) {
		const idA = visibleIds[i];
		const metaA = BONE_BY_ID[idA];
		const tA = transforms[idA];
		for (let j = i + 1; j < visibleIds.length; j += 1) {
			const idB = visibleIds[j];
			const metaB = BONE_BY_ID[idB];
			const tB = transforms[idB];
			const overlapX =
				metaA.boundsMin[0] + tA.position[0] < metaB.boundsMax[0] + tB.position[0] &&
				metaA.boundsMax[0] + tA.position[0] > metaB.boundsMin[0] + tB.position[0];
			const overlapY =
				metaA.boundsMin[1] + tA.position[1] < metaB.boundsMax[1] + tB.position[1] &&
				metaA.boundsMax[1] + tA.position[1] > metaB.boundsMin[1] + tB.position[1];
			const overlapZ =
				metaA.boundsMin[2] + tA.position[2] < metaB.boundsMax[2] + tB.position[2] &&
				metaA.boundsMax[2] + tA.position[2] > metaB.boundsMin[2] + tB.position[2];
			if (overlapX && overlapY && overlapZ) overlaps += 1;
		}
	}
	return overlaps;
}
