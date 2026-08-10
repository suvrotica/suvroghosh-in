import type { DistrictChunkBlueprint, LandmarkBlueprint, Vec3Tuple } from './AssetGrammar';

export type WorldCollisionCategory =
	| 'architecture'
	| 'wire'
	| 'branch'
	| 'bridge-member'
	| 'vehicle'
	| 'landmark';

export interface CapsuleWorldCollider {
	readonly id: string;
	readonly category: WorldCollisionCategory;
	readonly shape: 'capsule';
	readonly start: { readonly x: number; readonly y: number; readonly z: number };
	readonly end: { readonly x: number; readonly y: number; readonly z: number };
	readonly radiusM: number;
}

export interface SphereWorldCollider {
	readonly id: string;
	readonly category: WorldCollisionCategory;
	readonly shape: 'sphere';
	readonly center: { readonly x: number; readonly y: number; readonly z: number };
	readonly radiusM: number;
}

export interface AabbWorldCollider {
	readonly id: string;
	readonly category: WorldCollisionCategory;
	readonly shape: 'aabb';
	readonly min: { readonly x: number; readonly y: number; readonly z: number };
	readonly max: { readonly x: number; readonly y: number; readonly z: number };
}

export type WorldCollisionShape = CapsuleWorldCollider | SphereWorldCollider | AabbWorldCollider;

function point(tuple: Vec3Tuple): { x: number; y: number; z: number } {
	return { x: tuple[0], y: tuple[1], z: tuple[2] };
}

function translated(
	position: Vec3Tuple,
	x: number,
	y: number,
	z: number
): { x: number; y: number; z: number } {
	return { x: position[0] + x, y: position[1] + y, z: position[2] + z };
}

function translatedRotated(
	position: Vec3Tuple,
	rotationY: number,
	x: number,
	y: number,
	z: number
): { x: number; y: number; z: number } {
	const cosine = Math.cos(rotationY);
	const sine = Math.sin(rotationY);
	return translated(position, x * cosine + z * sine, y, -x * sine + z * cosine);
}

function rotatedHalfExtents(
	halfX: number,
	halfZ: number,
	rotationY: number
): { x: number; z: number } {
	const cosine = Math.abs(Math.cos(rotationY));
	const sine = Math.abs(Math.sin(rotationY));
	return { x: cosine * halfX + sine * halfZ, z: sine * halfX + cosine * halfZ };
}

function landmarkColliders(landmark: LandmarkBlueprint, chunkId: string): WorldCollisionShape[] {
	const scale = landmark.scale;
	const position = landmark.position;
	const id = `${chunkId}:landmark:${landmark.id}`;
	switch (landmark.id) {
		case 'howrah-bridge': {
			const deckY = 25 * scale;
			const halfLength = 327.5 * scale;
			const halfWidth = 11 * scale;
			return [
				{
					id: `${id}:deck`,
					category: 'bridge-member',
					shape: 'aabb',
					min: translated(position, -halfLength, deckY - 1.5 * scale, -halfWidth),
					max: translated(position, halfLength, deckY + 1.5 * scale, halfWidth)
				},
				...[-1, 1].flatMap((side) =>
					[-280, -180, -75, 75, 180, 280].map<CapsuleWorldCollider>((x, index) => ({
						id: `${id}:truss:${side}:${index}`,
						category: 'bridge-member',
						shape: 'capsule',
						start: translatedRotated(
							position,
							landmark.rotationY,
							x * scale,
							deckY,
							side * halfWidth
						),
						end: translatedRotated(
							position,
							landmark.rotationY,
							x * scale,
							deckY + (Math.abs(x) > 200 ? 43 : Math.abs(x) > 100 ? 52 : 30) * scale,
							side * halfWidth
						),
						radiusM: 1.2 * scale
					}))
				)
			];
		}
		case 'vidyasagar-setu': {
			const deckY = 28 * scale;
			const colliders: WorldCollisionShape[] = [
				{
					id: `${id}:deck`,
					category: 'bridge-member',
					shape: 'aabb',
					min: translated(position, -411.5 * scale, deckY - scale, -17.5 * scale),
					max: translated(position, 411.5 * scale, deckY + scale, 17.5 * scale)
				},
				...[-228.6, 228.6].flatMap((x) =>
					[-1, 1].map<CapsuleWorldCollider>((side) => ({
						id: `${id}:pylon:${x}:${side}`,
						category: 'bridge-member',
						shape: 'capsule',
						start: translatedRotated(
							position,
							landmark.rotationY,
							x * scale,
							0,
							side * 13.65 * scale
						),
						end: translatedRotated(
							position,
							landmark.rotationY,
							x * scale,
							127.62 * scale,
							side * 13.65 * scale
						),
						radiusM: 2.2 * scale
					}))
				)
			];
			const staysPerFan = 6;
			for (const towerX of [-228.6, 228.6]) {
				for (const cablePlaneZ of [-12.6, 12.6]) {
					for (const direction of [-1, 1]) {
						for (let index = 1; index <= staysPerFan; index += 1) {
							const reach = (index / staysPerFan) * (direction === Math.sign(towerX) ? 176 : 212);
							colliders.push({
								id: `${id}:stay:${towerX}:${cablePlaneZ}:${direction}:${index}`,
								category: 'wire',
								shape: 'capsule',
								start: translatedRotated(
									position,
									landmark.rotationY,
									towerX * scale,
									(127.62 - (index / staysPerFan) * 36) * scale,
									cablePlaneZ * scale
								),
								end: translatedRotated(
									position,
									landmark.rotationY,
									(towerX + direction * reach) * scale,
									29.5 * scale,
									cablePlaneZ * scale
								),
								radiusM: 0.105 * scale
							});
						}
					}
				}
			}
			return colliders;
		}
		case 'victoria-memorial': {
			const half = rotatedHalfExtents(56 * scale, 39 * scale, landmark.rotationY);
			return [
				{
					id,
					category: 'landmark',
					shape: 'aabb',
					min: translated(position, -half.x, 0, -half.z),
					max: translated(position, half.x, 59 * scale, half.z)
				}
			];
		}
		case 'biswa-bangla-gate': {
			const colliders: WorldCollisionShape[] = [-1, 1].flatMap((x) =>
				[-1, 1].map<CapsuleWorldCollider>((z) => ({
					id: `${id}:arch-foot:${x}:${z}`,
					category: 'landmark',
					shape: 'capsule',
					start: translatedRotated(position, landmark.rotationY, x * 28 * scale, 0, z * 28 * scale),
					end: translatedRotated(
						position,
						landmark.rotationY,
						x * 17 * scale,
						28 * scale,
						z * 17 * scale
					),
					radiusM: 2.1 * scale
				}))
			);
			const ringSegments = 12;
			for (let index = 0; index < ringSegments; index += 1) {
				const startAngle = (index / ringSegments) * Math.PI * 2;
				const endAngle = ((index + 1) / ringSegments) * Math.PI * 2;
				colliders.push({
					id: `${id}:ring:${index}`,
					category: 'landmark',
					shape: 'capsule',
					start: translatedRotated(
						position,
						landmark.rotationY,
						Math.cos(startAngle) * 30 * scale,
						25 * scale,
						Math.sin(startAngle) * 30 * scale
					),
					end: translatedRotated(
						position,
						landmark.rotationY,
						Math.cos(endAngle) * 30 * scale,
						25 * scale,
						Math.sin(endAngle) * 30 * scale
					),
					radiusM: 2.2 * scale
				});
			}
			return colliders;
		}
		case 'new-market-clock-tower': {
			const half = rotatedHalfExtents(18 * scale, 9 * scale, landmark.rotationY);
			return [
				{
					id,
					category: 'landmark',
					shape: 'aabb',
					min: translated(position, -half.x, 0, -half.z),
					max: translated(position, half.x, 51 * scale, half.z)
				}
			];
		}
		case 'shaheed-minar':
			return [
				{
					id,
					category: 'landmark',
					shape: 'aabb',
					min: translated(position, -10 * scale, 0, -10 * scale),
					max: translated(position, 10 * scale, 52 * scale, 10 * scale)
				}
			];
		case 'st-pauls-cathedral': {
			const half = rotatedHalfExtents(14 * scale, 30 * scale, landmark.rotationY);
			return [
				{
					id,
					category: 'landmark',
					shape: 'aabb',
					min: translated(position, -half.x, 0, -half.z),
					max: translated(position, half.x, 53 * scale, half.z)
				}
			];
		}
	}
}

/**
 * Returns simple simulation colliders in chunk-local metres. Characters and
 * animals are intentionally excluded: frightening a living being is never a
 * stunt surface. The caller offsets Z by its streamed chunk origin.
 */
export function collisionShapesForChunk(
	blueprint: DistrictChunkBlueprint
): readonly WorldCollisionShape[] {
	const colliders: WorldCollisionShape[] = blueprint.buildings.map((building) => {
		const half = rotatedHalfExtents(
			building.size[2] * 0.5,
			building.size[0] * 0.5,
			building.rotationY
		);
		const halfY = building.size[1] * 0.5;
		return {
			id: building.id,
			category: 'architecture',
			shape: 'aabb',
			min: {
				x: building.position[0] - half.x,
				y: Math.max(0, building.position[1] - halfY),
				z: building.position[2] - half.z
			},
			max: {
				x: building.position[0] + half.x,
				y: building.position[1] + halfY,
				z: building.position[2] + half.z
			}
		} satisfies AabbWorldCollider;
	});

	for (const prop of blueprint.props) {
		if (prop.kind === 'tram-wire') {
			colliders.push({
				id: prop.id,
				category: 'wire',
				shape: 'capsule',
				start: translatedRotated(prop.position, prop.rotationY, 0, 5.5, -11 * prop.scale),
				end: translatedRotated(prop.position, prop.rotationY, 0, 5.5, 11 * prop.scale),
				radiusM: 0.035
			});
		} else if (prop.kind === 'rain-tree' || prop.kind === 'banyan-screen') {
			colliders.push({
				id: prop.id,
				category: 'branch',
				shape: 'capsule',
				start: point(prop.position),
				end: translated(prop.position, 0.8 * prop.scale, 9 * prop.scale, 0.5 * prop.scale),
				radiusM: 0.42 * prop.scale
			});
		} else if (prop.kind === 'city-bus' || prop.kind === 'yellow-taxi') {
			const width = prop.kind === 'city-bus' ? 2.6 : 1.7;
			const height = prop.kind === 'city-bus' ? 3.2 : 1.55;
			const length = prop.kind === 'city-bus' ? 9 : 4.1;
			const half = rotatedHalfExtents(
				width * prop.scale * 0.5,
				length * prop.scale * 0.5,
				prop.rotationY
			);
			colliders.push({
				id: prop.id,
				category: 'vehicle',
				shape: 'aabb',
				min: translated(prop.position, -half.x, 0, -half.z),
				max: translated(prop.position, half.x, height * prop.scale, half.z)
			});
		}
	}

	for (const landmark of blueprint.landmarks)
		colliders.push(...landmarkColliders(landmark, blueprint.id));
	return colliders;
}
