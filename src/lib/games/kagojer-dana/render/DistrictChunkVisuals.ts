import * as THREE from 'three';
import type {
	BuildingBlueprint,
	DistrictChunkBlueprint,
	PropBlueprint,
	SignBlueprint,
	WorldQualityTier
} from '../world/AssetGrammar';
import type { ChunkVisualFactory } from '../world/ChunkManager';
import { createLandmarkModel, type LandmarkMaterials } from '../world/landmarks/LandmarkModels';
import { createCharcoalMaterial, updateCharcoalMaterial } from './CharcoalMaterial';
import { clearObjectChildren, RenderResourceTracker } from './Disposal';
import { InhabitantBatchBuilder } from './Inhabitants';

interface Transform {
	readonly position: THREE.Vector3;
	readonly quaternion: THREE.Quaternion;
	readonly scale: THREE.Vector3;
}

interface Batch {
	readonly geometry: THREE.BufferGeometry;
	readonly material: THREE.Material;
	readonly transforms: Transform[];
}

const TEMP_MATRIX = new THREE.Matrix4();

function transform(
	position: readonly [number, number, number],
	scale: readonly [number, number, number],
	rotation: readonly [number, number, number] = [0, 0, 0]
): Transform {
	return {
		position: new THREE.Vector3(...position),
		quaternion: new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),
		scale: new THREE.Vector3(...scale)
	};
}

function yawOffset(
	position: readonly [number, number, number],
	yaw: number,
	x: number,
	y: number,
	z: number
): [number, number, number] {
	const cosine = Math.cos(yaw);
	const sine = Math.sin(yaw);
	return [
		position[0] + x * cosine + z * sine,
		position[1] + y,
		position[2] - x * sine + z * cosine
	];
}

function safeColor(value: string, fallback: string): string {
	return /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}

/** Builds pooled chunks from deterministic data; it does not own the renderer. */
export class DistrictChunkVisualFactory implements ChunkVisualFactory {
	private readonly tracker = new RenderResourceTracker();
	private readonly geometries = new Map<string, THREE.BufferGeometry>();
	private readonly materials = new Map<string, THREE.Material>();
	private readonly charcoalMaterials: THREE.Material[] = [];
	private readonly signFaces = new Map<string, THREE.Material>();
	private readonly inhabitantBuilder: InhabitantBatchBuilder;
	private quality: WorldQualityTier;
	private disposed = false;

	constructor(quality: WorldQualityTier = 'balanced') {
		this.quality = quality;
		this.inhabitantBuilder = new InhabitantBatchBuilder(quality);
	}

	setQuality(quality: WorldQualityTier): void {
		this.quality = quality;
		this.inhabitantBuilder.setQuality(quality);
	}

	private geometry(name: string): THREE.BufferGeometry {
		const cached = this.geometries.get(name);
		if (cached) return cached;
		let geometry: THREE.BufferGeometry;
		switch (name) {
			case 'box':
				geometry = new THREE.BoxGeometry(1, 1, 1);
				break;
			case 'plane':
				geometry = new THREE.PlaneGeometry(1, 1);
				break;
			case 'cylinder':
				geometry = new THREE.CylinderGeometry(1, 1, 1, 9);
				break;
			case 'sphere':
				geometry = new THREE.SphereGeometry(1, 12, 9);
				break;
			case 'cone':
				geometry = new THREE.ConeGeometry(1, 1, 9);
				break;
			case 'torus':
				geometry = new THREE.TorusGeometry(1, 0.18, 6, 16);
				break;
			case 'foliage':
				geometry = new THREE.IcosahedronGeometry(1, 1);
				break;
			default:
				geometry = new THREE.BoxGeometry(1, 1, 1);
		}
		this.geometries.set(name, this.tracker.geometry(geometry));
		return geometry;
	}

	private charcoal(
		key: string,
		color: string,
		options: {
			readonly roughness?: number;
			readonly metalness?: number;
			readonly hatchStrength?: number;
			readonly opacity?: number;
			readonly transparent?: boolean;
		} = {}
	): THREE.Material {
		const cached = this.materials.get(key);
		if (cached) return cached;
		const material = createCharcoalMaterial({
			color,
			roughness: options.roughness,
			metalness: options.metalness,
			hatchStrength: options.hatchStrength,
			opacity: options.opacity,
			transparent: options.transparent,
			seed: this.materials.size * 37
		});
		this.tracker.material(material);
		this.materials.set(key, material);
		this.charcoalMaterials.push(material);
		return material;
	}

	private physical(key: string, parameters: THREE.MeshPhysicalMaterialParameters): THREE.Material {
		const cached = this.materials.get(key);
		if (cached) return cached;
		const material = this.tracker.material(new THREE.MeshPhysicalMaterial(parameters));
		this.materials.set(key, material);
		return material;
	}

	private addBatch(
		batches: Map<string, Batch>,
		key: string,
		geometry: THREE.BufferGeometry,
		material: THREE.Material,
		item: Transform
	): void {
		const batch = batches.get(key);
		if (batch) batch.transforms.push(item);
		else batches.set(key, { geometry, material, transforms: [item] });
	}

	private flushBatches(parent: THREE.Group, batches: ReadonlyMap<string, Batch>): void {
		for (const [name, batch] of batches) {
			if (batch.transforms.length === 0) continue;
			const instances = new THREE.InstancedMesh(
				batch.geometry,
				batch.material,
				batch.transforms.length
			);
			instances.name = name;
			for (let index = 0; index < batch.transforms.length; index += 1) {
				const item = batch.transforms[index];
				TEMP_MATRIX.compose(item.position, item.quaternion, item.scale);
				instances.setMatrixAt(index, TEMP_MATRIX);
			}
			instances.instanceMatrix.needsUpdate = true;
			instances.castShadow = this.quality !== 'battery';
			instances.receiveShadow = true;
			parent.add(instances);
		}
	}

	populate(target: THREE.Group, blueprint: DistrictChunkBlueprint): void {
		if (this.disposed) return;
		this.clear(target);
		target.userData.chunkSignature = blueprint.signature;
		target.userData.district = blueprint.routeNode.district;
		target.userData.globalChunkIndex = blueprint.globalChunkIndex;
		this.addGround(target, blueprint);
		this.addBuildings(target, blueprint);
		this.addProps(target, blueprint);
		this.addSigns(target, blueprint.signs);
		if (blueprint.activities.length > 0)
			target.add(this.inhabitantBuilder.createActivities(blueprint.activities));
		if (blueprint.animals.length > 0)
			target.add(this.inhabitantBuilder.createAnimals(blueprint.animals));
		const landmarkMaterials = this.landmarkMaterials(blueprint);
		for (const landmark of blueprint.landmarks) {
			const model = createLandmarkModel(landmark, landmarkMaterials, this.quality);
			for (const geometry of model.authoredGeometries) geometry.userData.kdChunkOwned = true;
			target.add(model.object);
		}
	}

	private addGround(parent: THREE.Group, blueprint: DistrictChunkBlueprint): void {
		let material: THREE.Material;
		if (blueprint.ground === 'hooghly-water') {
			material = this.physical('hooghly-water', {
				color: '#61706e',
				roughness: 0.42,
				metalness: 0.04,
				clearcoat: 0.24,
				clearcoatRoughness: 0.58,
				transparent: true,
				opacity: 0.94
			});
		} else {
			const colorByGround: Readonly<
				Record<Exclude<typeof blueprint.ground, 'hooghly-water'>, string>
			> = {
				'patched-lane': '#817762',
				'workshop-earth': '#856c54',
				'book-street': '#67645b',
				'rain-dark-road': '#4b4d4b',
				'maidan-grass': '#68705a',
				'new-town-road': '#696e6e'
			};
			material = this.charcoal(`ground-${blueprint.ground}`, colorByGround[blueprint.ground], {
				hatchStrength: 0.24,
				roughness: 1
			});
		}
		const ground = new THREE.Mesh(this.geometry('plane'), material);
		ground.name = `ground-${blueprint.ground}`;
		ground.rotation.x = -Math.PI / 2;
		ground.scale.set(blueprint.halfWidthM * 2.5, blueprint.lengthM, 1);
		ground.receiveShadow = true;
		parent.add(ground);
		if (blueprint.ground === 'hooghly-water') {
			const strokes = new Map<string, Batch>();
			const strokeMaterial = this.charcoal('water-graphite-stroke', '#384b4b', {
				hatchStrength: 0.08,
				opacity: 0.46,
				transparent: true
			});
			for (let index = 0; index < (this.quality === 'high' ? 36 : 20); index += 1) {
				const x = -blueprint.halfWidthM + (((index * 47) % 101) / 101) * blueprint.halfWidthM * 2;
				const z = -blueprint.lengthM * 0.48 + (((index * 71) % 97) / 97) * blueprint.lengthM * 0.96;
				this.addBatch(
					strokes,
					'lateral-water-strokes',
					this.geometry('box'),
					strokeMaterial,
					transform([x, 0.04, z], [5 + (index % 5) * 1.5, 0.025, 0.07])
				);
			}
			this.flushBatches(parent, strokes);
		}
	}

	private addBuildings(parent: THREE.Group, blueprint: DistrictChunkBlueprint): void {
		const batches = new Map<string, Batch>();
		const palette = blueprint.routeNode.palette;
		for (const building of blueprint.buildings) this.addBuilding(batches, building, palette.wash);
		this.flushBatches(parent, batches);
	}

	private addBuilding(
		batches: Map<string, Batch>,
		building: BuildingBlueprint,
		wash: readonly [string, string, string]
	): void {
		const wallColor = safeColor(wash[building.washIndex % wash.length], '#817565');
		const wall = this.charcoal(`wall-${wallColor}`, wallColor, {
			hatchStrength: 0.5,
			roughness: 0.96
		});
		const yaw = building.rotationY;
		this.addBatch(
			batches,
			`walls-${wallColor}`,
			this.geometry('box'),
			wall,
			transform(
				building.position,
				[building.size[2], building.size[1], building.size[0]],
				[0, yaw, building.imperfection * 0.08]
			)
		);
		const trim = this.charcoal('facade-trim', '#3f403c', { hatchStrength: 0.35 });
		const window = this.charcoal('window-blue-black', '#293b40', {
			roughness: 0.34,
			metalness: 0.08,
			hatchStrength: 0.18
		});
		const shutter = this.charcoal('shutter-green', '#38594c', { hatchStrength: 0.38 });
		const side = building.position[0] < 0 ? 1 : -1;
		const facadeX = building.position[0] + side * (building.size[2] * 0.5 + 0.03);
		const columns = Math.max(2, Math.min(4, Math.floor(building.size[0] / 3.1)));
		const floors = Math.min(building.floors, this.quality === 'battery' ? 4 : 8);
		for (let floor = 0; floor < floors; floor += 1) {
			const y = 1.7 + floor * (building.size[1] / Math.max(1, building.floors));
			for (let column = 0; column < columns; column += 1) {
				const z = building.position[2] + ((column + 0.5) / columns - 0.5) * building.size[0] * 0.78;
				this.addBatch(
					batches,
					'windows',
					this.geometry('box'),
					window,
					transform(
						[facadeX, y, z],
						[0.08, 1.25, Math.min(1.2, building.size[0] / (columns * 1.5))],
						[0, 0, 0]
					)
				);
				if (building.hasShutters && this.quality !== 'battery') {
					for (const offset of [-1, 1])
						this.addBatch(
							batches,
							'shutters',
							this.geometry('box'),
							shutter,
							transform(
								[facadeX + side * 0.035, y, z + offset * 0.82],
								[0.07, 1.34, 0.68],
								[0, offset * side * 0.16, 0]
							)
						);
				}
			}
			this.addBatch(
				batches,
				'wandering-cornices',
				this.geometry('box'),
				trim,
				transform(
					[building.position[0], Math.min(building.size[1] - 0.5, y + 1.15), building.position[2]],
					[building.size[2] + 0.25, 0.13, building.size[0] + 0.24],
					[0, yaw, building.imperfection * 0.08]
				)
			);
		}
		if (building.hasBalcony && this.quality !== 'battery') {
			const balconyY = Math.min(building.size[1] * 0.5, 7.5);
			this.addBatch(
				batches,
				'balcony-slabs',
				this.geometry('box'),
				trim,
				transform(
					[facadeX + side * 0.72, balconyY, building.position[2]],
					[1.45, 0.16, building.size[0] * 0.62],
					[0, 0, 0]
				)
			);
			for (let index = 0; index < 7; index += 1) {
				const z = building.position[2] + (index / 6 - 0.5) * building.size[0] * 0.56;
				this.addBatch(
					batches,
					'cast-iron-balusters',
					this.geometry('cylinder'),
					trim,
					transform([facadeX + side * 1.36, balconyY + 0.62, z], [0.035, 1.22, 0.035])
				);
			}
		}
		if (building.hasAwning) {
			const awning = this.charcoal('awning-burgundy', '#7e403d', { hatchStrength: 0.28 });
			this.addBatch(
				batches,
				'shop-awnings',
				this.geometry('box'),
				awning,
				transform(
					[facadeX + side * 1.1, 3.25, building.position[2]],
					[2.1, 0.16, building.size[0] * 0.58],
					[0, 0, side * -0.13]
				)
			);
		}
		this.addRoofFeature(batches, building);
	}

	private addRoofFeature(batches: Map<string, Batch>, building: BuildingBlueprint): void {
		if (building.roofFeature === null) return;
		const roofY = building.position[1] + building.size[1] * 0.5;
		const dark = this.charcoal('roof-dark', '#41413d', { hatchStrength: 0.42 });
		switch (building.roofFeature) {
			case 'water-tank':
				this.addBatch(
					batches,
					'roof-water-tanks',
					this.geometry('cylinder'),
					dark,
					transform([building.position[0], roofY + 1.2, building.position[2]], [1.35, 2.4, 1.35])
				);
				break;
			case 'aerial':
			case 'press-vent':
				this.addBatch(
					batches,
					'roof-aerials',
					this.geometry('cylinder'),
					dark,
					transform([building.position[0], roofY + 2.6, building.position[2]], [0.055, 5.2, 0.055])
				);
				break;
			case 'roof-garden': {
				const green = this.charcoal('roof-plant', '#52664e', { hatchStrength: 0.58 });
				for (let index = 0; index < 4; index += 1)
					this.addBatch(
						batches,
						'roof-plants',
						this.geometry('foliage'),
						green,
						transform(
							[
								building.position[0] + (index - 1.5) * 0.7,
								roofY + 0.6,
								building.position[2] + (index % 2) * 0.6
							],
							[0.48, 0.72, 0.5]
						)
					);
				break;
			}
			case 'bamboo-scaffold':
			case 'construction-crane':
				for (const offset of [-1, 1])
					this.addBatch(
						batches,
						'roof-scaffold',
						this.geometry('cylinder'),
						dark,
						transform(
							[building.position[0] + offset * 1.8, roofY + 2.3, building.position[2]],
							[0.06, 4.6, 0.06],
							[0, 0, offset * 0.1]
						)
					);
				break;
			case 'washing-line':
				for (let index = 0; index < 4; index += 1) {
					const cloth = this.charcoal(
						`roof-cloth-${index % 2}`,
						index % 2 === 0 ? '#a94f42' : '#507383',
						{ hatchStrength: 0.2 }
					);
					this.addBatch(
						batches,
						'roof-washing',
						this.geometry('box'),
						cloth,
						transform(
							[building.position[0] + (index - 1.5) * 0.75, roofY + 1.2, building.position[2]],
							[0.58, 0.88, 0.035],
							[0, 0, (index - 1.5) * 0.03]
						)
					);
				}
				break;
		}
	}

	private addProps(parent: THREE.Group, blueprint: DistrictChunkBlueprint): void {
		const batches = new Map<string, Batch>();
		for (const prop of blueprint.props) this.addProp(batches, prop);
		this.flushBatches(parent, batches);
	}

	private addProp(batches: Map<string, Batch>, prop: PropBlueprint): void {
		const p = prop.position;
		const s = prop.scale;
		const yaw = prop.rotationY;
		const dark = this.charcoal('prop-ink', '#343735', { hatchStrength: 0.4 });
		const wood = this.charcoal('prop-wood', '#6e5137', { hatchStrength: 0.44 });
		const yellow = this.charcoal('taxi-yellow', '#c89b2e', { hatchStrength: 0.25 });
		const green = this.charcoal('tree-green', '#4d654d', { hatchStrength: 0.64 });
		const add = (
			key: string,
			geometry: string,
			material: THREE.Material,
			position: readonly [number, number, number],
			scale: readonly [number, number, number],
			rotation: readonly [number, number, number] = [0, yaw, 0]
		): void =>
			this.addBatch(
				batches,
				key,
				this.geometry(geometry),
				material,
				transform(position, scale, rotation)
			);
		switch (prop.kind) {
			case 'yellow-taxi':
			case 'city-bus': {
				const bus = prop.kind === 'city-bus';
				const length = bus ? 8.8 : 4.1;
				const width = bus ? 2.55 : 1.72;
				const height = bus ? 2.9 : 1.25;
				const bodyMaterial = bus
					? this.charcoal('bus-wash', '#536c6c', { hatchStrength: 0.3 })
					: yellow;
				add(
					'vehicle-bodies',
					'box',
					bodyMaterial,
					[p[0], p[1] + height * s * 0.5, p[2]],
					[width * s, height * s, length * s]
				);
				add(
					'vehicle-windows',
					'box',
					this.charcoal('vehicle-glass', '#273d43', { hatchStrength: 0.15, roughness: 0.3 }),
					[p[0], p[1] + height * s * 0.78, p[2]],
					[width * s * 0.88, height * s * 0.42, length * s * 0.62]
				);
				for (const x of [-1, 1])
					for (const z of [-1, 1])
						add(
							'vehicle-wheels',
							'cylinder',
							dark,
							yawOffset(p, yaw, x * width * s * 0.48, 0.34 * s, z * length * s * 0.31),
							[0.34 * s, 0.18 * s, 0.34 * s],
							[0, yaw, Math.PI / 2]
						);
				break;
			}
			case 'rain-tree':
			case 'median-tree':
			case 'banyan-screen': {
				add(
					'gestural-tree-trunks',
					'cylinder',
					wood,
					[p[0], p[1] + 4.2 * s, p[2]],
					[0.42 * s, 8.4 * s, 0.42 * s],
					[0.08, yaw, -0.07]
				);
				for (let index = 0; index < 5; index += 1) {
					const angle = (index / 5) * Math.PI * 2 + yaw;
					add(
						'gestural-branches',
						'cylinder',
						wood,
						[
							p[0] + Math.cos(angle) * 1.45 * s,
							p[1] + (6.2 + (index % 2)) * s,
							p[2] + Math.sin(angle) * 1.45 * s
						],
						[0.13 * s, 4.2 * s, 0.13 * s],
						[Math.sin(angle) * 0.72, 0, Math.cos(angle) * 0.72]
					);
					add(
						'scribbled-foliage-masses',
						'foliage',
						green,
						[
							p[0] + Math.cos(angle) * 2.8 * s,
							p[1] + (7.2 + (index % 3) * 0.6) * s,
							p[2] + Math.sin(angle) * 2.8 * s
						],
						[2.3 * s, 1.65 * s, 2.05 * s],
						[0, angle, 0]
					);
				}
				break;
			}
			case 'tea-stall':
				add(
					'stall-counters',
					'box',
					wood,
					[p[0], p[1] + 0.8 * s, p[2]],
					[2.1 * s, 1.5 * s, 1.1 * s]
				);
				add(
					'stall-awnings',
					'box',
					this.charcoal('stall-red', '#8b443a', { hatchStrength: 0.28 }),
					[p[0], p[1] + 2.2 * s, p[2]],
					[2.6 * s, 0.14 * s, 1.65 * s],
					[0.04, yaw, -0.08]
				);
				break;
			case 'book-stack':
			case 'newspaper-bundle':
				for (let index = 0; index < 4; index += 1)
					add(
						'book-and-paper-stacks',
						'box',
						index % 2 === 0
							? this.charcoal('book-red', '#7d403a', { hatchStrength: 0.3 })
							: this.charcoal('paper-grey', '#aaa28f', { hatchStrength: 0.24 }),
						[p[0], p[1] + (0.15 + index * 0.22) * s, p[2]],
						[(1.1 - index * 0.08) * s, 0.18 * s, 0.75 * s],
						[0.03 * index, yaw + 0.08 * index, 0]
					);
				break;
			case 'page-swarm':
			case 'laundry-screen':
			case 'pigeon-screen': {
				const paper = this.charcoal(
					prop.kind === 'laundry-screen' ? 'laundry-paper' : 'loose-paper',
					prop.kind === 'laundry-screen' ? '#b45c4c' : '#c8c0aa',
					{ hatchStrength: 0.16 }
				);
				for (let index = 0; index < (this.quality === 'high' ? 14 : 8); index += 1)
					add(
						'airborne-pages-and-cloth',
						'box',
						paper,
						[
							p[0] + (((index * 17) % 11) - 5) * 0.8,
							p[1] + (((index * 13) % 7) - 3) * 0.55,
							p[2] + (((index * 19) % 9) - 4) * 0.5
						],
						[0.65 * s, 0.46 * s, 0.025],
						[index * 0.17, yaw + index * 0.31, index * 0.11]
					);
				break;
			}
			case 'clay-armature':
			case 'clay-worktable':
				add(
					'clay-work',
					prop.kind === 'clay-armature' ? 'cone' : 'box',
					prop.kind === 'clay-armature'
						? this.charcoal('clay', '#8e654a', { hatchStrength: 0.46 })
						: wood,
					[p[0], p[1] + 0.8 * s, p[2]],
					prop.kind === 'clay-armature'
						? [0.55 * s, 1.6 * s, 0.55 * s]
						: [1.8 * s, 0.18 * s, 1.05 * s]
				);
				break;
			case 'tram-rail':
			case 'tram-wire':
				add(
					prop.kind,
					'box',
					dark,
					[p[0], p[1] + (prop.kind === 'tram-wire' ? 5.5 : 0.03), p[2]],
					[0.055, 0.055, 22 * s]
				);
				break;
			case 'ghat-step':
				for (let index = 0; index < 5; index += 1)
					add(
						'ghat-steps',
						'box',
						this.charcoal('ghat-stone', '#777468', { hatchStrength: 0.45 }),
						[p[0], p[1] + index * 0.22, p[2] + index * 0.7],
						[5.5 * s, 0.4, 1.4]
					);
				break;
			case 'ferry':
			case 'jetty':
				add(
					'river-craft',
					'box',
					prop.kind === 'ferry'
						? this.charcoal('ferry-hull', '#3c5a54', { hatchStrength: 0.35 })
						: wood,
					[p[0], p[1] + 0.35 * s, p[2]],
					prop.kind === 'ferry' ? [3.2 * s, 0.7 * s, 8 * s] : [2.3 * s, 0.35 * s, 7 * s]
				);
				if (prop.kind === 'ferry')
					add(
						'ferry-cabins',
						'box',
						this.charcoal('ferry-cabin', '#b8b19e', { hatchStrength: 0.24 }),
						[p[0], p[1] + 1.2 * s, p[2]],
						[2.2 * s, 1.4 * s, 3.6 * s]
					);
				break;
			case 'rain-screen':
			case 'smoke-screen':
			case 'cloud-screen': {
				const mist = this.charcoal(
					`screen-${prop.kind}`,
					prop.kind === 'rain-screen' ? '#66767a' : '#a29f93',
					{ hatchStrength: 0.12, opacity: 0.32, transparent: true }
				);
				for (let index = 0; index < 7; index += 1)
					add(
						'atmospheric-transition-volume',
						'foliage',
						mist,
						[p[0] + (index - 3) * 3.2, p[1] + (index % 3) * 2.4, p[2] + (index % 2) * 2],
						[4.2 * s, 2.8 * s, 3.6 * s]
					);
				break;
			}
			case 'bridge-screen':
				for (let index = 0; index < 7; index += 1)
					add(
						'transition-girders',
						'cylinder',
						dark,
						[p[0] + (index - 3) * 2.5, p[1], p[2]],
						[0.24, 18, 0.24],
						[0, 0, index % 2 === 0 ? 0.45 : -0.45]
					);
				break;
			case 'bicycle':
			case 'scooter':
			case 'handcart':
				add(
					'small-vehicle-frames',
					'box',
					wood,
					[p[0], p[1] + 0.65 * s, p[2]],
					[
						prop.kind === 'handcart' ? 1.4 * s : 0.25 * s,
						0.18 * s,
						prop.kind === 'handcart' ? 1.8 * s : 1.25 * s
					]
				);
				for (const z of [-0.62, 0.62])
					add(
						'small-vehicle-wheels',
						'torus',
						dark,
						[p[0], p[1] + 0.42 * s, p[2] + z * s],
						[0.42 * s, 0.42 * s, 0.42 * s],
						[0, Math.PI / 2, 0]
					);
				break;
			case 'traffic-island':
			case 'office-planter':
			case 'flower-basket':
			case 'football-goal':
			case 'cricket-wicket':
				add(
					'street-furniture',
					'box',
					prop.kind === 'flower-basket' ? wood : dark,
					[p[0], p[1] + 0.35 * s, p[2]],
					[1.2 * s, 0.7 * s, 1 * s]
				);
				break;
		}
	}

	private addSigns(parent: THREE.Group, signs: readonly SignBlueprint[]): void {
		for (const sign of signs) {
			const group = new THREE.Group();
			group.position.set(...sign.position);
			const board = new THREE.Mesh(
				this.geometry('box'),
				this.charcoal('sign-board-edge', '#343331', { hatchStrength: 0.38 })
			);
			board.scale.set(0.14, 1.35, 3.4);
			group.add(board);
			const face = new THREE.Mesh(this.geometry('plane'), this.signMaterial(sign));
			face.position.x = sign.rotationY > 0 ? 0.076 : -0.076;
			face.rotation.y = sign.rotationY;
			face.scale.set(3.15, 1.12, 1);
			face.userData.bengaliText = sign.bengali;
			group.add(face);
			parent.add(group);
		}
	}

	private signMaterial(sign: SignBlueprint): THREE.Material {
		const key = `${sign.color}|${sign.bengali}|${sign.english ?? ''}`;
		const cached = this.signFaces.get(key);
		if (cached) return cached;
		let texture: THREE.Texture;
		if (typeof document === 'undefined') {
			const data = new Uint8Array([126, 66, 55, 255]);
			texture = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat);
			texture.needsUpdate = true;
		} else {
			const canvas = document.createElement('canvas');
			canvas.width = 512;
			canvas.height = 180;
			const context = canvas.getContext('2d');
			if (context) {
				context.fillStyle = sign.color;
				context.fillRect(0, 0, canvas.width, canvas.height);
				context.strokeStyle = 'rgba(35, 31, 27, .72)';
				context.lineWidth = 8;
				context.strokeRect(7, 7, canvas.width - 14, canvas.height - 14);
				context.textAlign = 'center';
				context.textBaseline = 'middle';
				context.fillStyle = '#eee4ca';
				context.font = '700 82px "Noto Serif Bengali", serif';
				context.fillText(sign.bengali, canvas.width / 2, sign.english ? 70 : 91);
				if (sign.english) {
					context.font = '700 25px "Courier Prime", monospace';
					context.fillText(sign.english, canvas.width / 2, 145);
				}
			}
			texture = new THREE.CanvasTexture(canvas);
			texture.colorSpace = THREE.SRGBColorSpace;
			texture.anisotropy = 2;
		}
		this.tracker.texture(texture);
		const material = this.tracker.material(
			new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide, toneMapped: true })
		);
		this.signFaces.set(key, material);
		return material;
	}

	private landmarkMaterials(blueprint: DistrictChunkBlueprint): LandmarkMaterials {
		return {
			steel: this.charcoal('landmark-steel', '#586164', {
				metalness: 0.24,
				roughness: 0.72,
				hatchStrength: 0.45
			}),
			steelDark: this.charcoal('landmark-steel-dark', '#343c3e', {
				metalness: 0.3,
				roughness: 0.68,
				hatchStrength: 0.42
			}),
			cable: this.charcoal('landmark-cable', '#d0cec2', {
				metalness: 0.15,
				roughness: 0.68,
				hatchStrength: 0.08
			}),
			marble: this.charcoal('victoria-marble', '#dedbd0', { roughness: 0.92, hatchStrength: 0.26 }),
			marbleShadow: this.charcoal('victoria-marble-shadow', '#aaa99f', {
				roughness: 0.95,
				hatchStrength: 0.42
			}),
			brick: this.charcoal('new-market-brick', '#8c4d42', { roughness: 0.94, hatchStrength: 0.46 }),
			glass: this.physical('gate-glass', {
				color: '#86a0a8',
				roughness: 0.34,
				metalness: 0.04,
				transparent: true,
				opacity: 0.76,
				transmission: 0.08
			}),
			ink: this.charcoal(
				`landmark-ink-${blueprint.routeNode.palette.ink}`,
				blueprint.routeNode.palette.ink,
				{ roughness: 0.88, hatchStrength: 0.52 }
			)
		};
	}

	updateCharcoal(elapsedSeconds: number, calmCamera: boolean): void {
		for (const material of this.charcoalMaterials)
			updateCharcoalMaterial(material, elapsedSeconds, calmCamera);
	}

	clear(target: THREE.Group): void {
		const disposed = new Set<THREE.BufferGeometry>();
		target.traverse((child) => {
			if (
				!(child instanceof THREE.Mesh) ||
				child.geometry.userData.kdChunkOwned !== true ||
				disposed.has(child.geometry)
			)
				return;
			disposed.add(child.geometry);
			child.geometry.dispose();
		});
		clearObjectChildren(target);
		target.userData = {};
	}

	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		this.inhabitantBuilder.dispose();
		this.tracker.dispose();
		this.geometries.clear();
		this.materials.clear();
		this.signFaces.clear();
		this.charcoalMaterials.length = 0;
	}
}
