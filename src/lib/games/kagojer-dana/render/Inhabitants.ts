import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type {
	ActivityBlueprint,
	ActivityKind,
	AnimalBlueprint,
	AnimalKind,
	WorldQualityTier
} from '../world/AssetGrammar';
import { createCharcoalMaterial } from './CharcoalMaterial';

interface PersonAppearance {
	readonly name: string;
	readonly height: number;
	readonly shoulder: number;
	readonly build: number;
	readonly head: readonly [number, number, number];
	readonly skin: number;
	readonly cloth: number;
	readonly trousers: number;
	readonly clothing:
		| 'shirt'
		| 'kurta'
		| 'sari'
		| 'salwar'
		| 'school'
		| 'office'
		| 'lungi'
		| 'raincoat'
		| 'shawl';
	readonly hair: 'crop' | 'parted' | 'bun' | 'short' | 'grey' | 'covered';
	readonly age: 'child' | 'young' | 'adult' | 'older';
	readonly expression:
		| 'concentration'
		| 'tired'
		| 'irritation'
		| 'suspicion'
		| 'surprise'
		| 'amusement'
		| 'affection';
}

/** Twenty-four intentionally different near-field silhouettes. */
export const PERSON_APPEARANCES: readonly PersonAppearance[] = [
	{
		name: 'small-student-red-bag',
		height: 0.78,
		shoulder: 0.88,
		build: 0.86,
		head: [1, 1.04, 1],
		skin: 2,
		cloth: 3,
		trousers: 0,
		clothing: 'school',
		hair: 'crop',
		age: 'child',
		expression: 'surprise'
	},
	{
		name: 'tall-bookseller-shirt',
		height: 1.04,
		shoulder: 0.98,
		build: 0.9,
		head: [0.94, 1.06, 1],
		skin: 3,
		cloth: 5,
		trousers: 1,
		clothing: 'shirt',
		hair: 'parted',
		age: 'adult',
		expression: 'concentration'
	},
	{
		name: 'older-addaman-shawl',
		height: 0.96,
		shoulder: 1.05,
		build: 1.04,
		head: [1.03, 0.98, 1.05],
		skin: 4,
		cloth: 1,
		trousers: 2,
		clothing: 'shawl',
		hair: 'grey',
		age: 'older',
		expression: 'amusement'
	},
	{
		name: 'office-worker-sari',
		height: 0.98,
		shoulder: 0.9,
		build: 0.93,
		head: [0.94, 1.05, 0.96],
		skin: 2,
		cloth: 6,
		trousers: 0,
		clothing: 'sari',
		hair: 'bun',
		age: 'adult',
		expression: 'tired'
	},
	{
		name: 'tea-seller-lungi',
		height: 0.94,
		shoulder: 1.08,
		build: 1.1,
		head: [1.04, 0.97, 1],
		skin: 4,
		cloth: 2,
		trousers: 3,
		clothing: 'lungi',
		hair: 'short',
		age: 'adult',
		expression: 'concentration'
	},
	{
		name: 'student-salwar-books',
		height: 0.94,
		shoulder: 0.9,
		build: 0.88,
		head: [0.94, 1.04, 0.96],
		skin: 1,
		cloth: 0,
		trousers: 0,
		clothing: 'salwar',
		hair: 'parted',
		age: 'young',
		expression: 'suspicion'
	},
	{
		name: 'broad-conductor-kurta',
		height: 1.02,
		shoulder: 1.13,
		build: 1.12,
		head: [1.07, 0.98, 1.03],
		skin: 3,
		cloth: 7,
		trousers: 2,
		clothing: 'kurta',
		hair: 'crop',
		age: 'adult',
		expression: 'irritation'
	},
	{
		name: 'traffic-officer',
		height: 1.05,
		shoulder: 1.07,
		build: 1,
		head: [0.98, 1.03, 0.98],
		skin: 2,
		cloth: 4,
		trousers: 1,
		clothing: 'office',
		hair: 'short',
		age: 'adult',
		expression: 'concentration'
	},
	{
		name: 'clay-artisan-kurta',
		height: 0.97,
		shoulder: 1.02,
		build: 0.96,
		head: [0.97, 1, 1.04],
		skin: 4,
		cloth: 5,
		trousers: 3,
		clothing: 'kurta',
		hair: 'crop',
		age: 'adult',
		expression: 'concentration'
	},
	{
		name: 'raincoat-delivery-worker',
		height: 1.03,
		shoulder: 1.08,
		build: 1.06,
		head: [1, 1.02, 1],
		skin: 3,
		cloth: 0,
		trousers: 1,
		clothing: 'raincoat',
		hair: 'covered',
		age: 'young',
		expression: 'tired'
	},
	{
		name: 'older-flower-seller-sari',
		height: 0.91,
		shoulder: 0.94,
		build: 1.08,
		head: [1.06, 0.96, 1.02],
		skin: 4,
		cloth: 3,
		trousers: 0,
		clothing: 'sari',
		hair: 'grey',
		age: 'older',
		expression: 'affection'
	},
	{
		name: 'lean-office-worker',
		height: 1.08,
		shoulder: 0.94,
		build: 0.83,
		head: [0.91, 1.08, 0.96],
		skin: 1,
		cloth: 2,
		trousers: 0,
		clothing: 'office',
		hair: 'parted',
		age: 'young',
		expression: 'tired'
	},
	{
		name: 'roof-gardener-salwar',
		height: 0.98,
		shoulder: 0.93,
		build: 0.97,
		head: [0.96, 1.03, 0.98],
		skin: 3,
		cloth: 1,
		trousers: 2,
		clothing: 'salwar',
		hair: 'bun',
		age: 'adult',
		expression: 'affection'
	},
	{
		name: 'newspaper-passenger-shirt',
		height: 1,
		shoulder: 1,
		build: 0.92,
		head: [0.96, 1.02, 1],
		skin: 2,
		cloth: 7,
		trousers: 1,
		clothing: 'shirt',
		hair: 'short',
		age: 'adult',
		expression: 'surprise'
	},
	{
		name: 'short-shopper-sari',
		height: 0.9,
		shoulder: 0.92,
		build: 1,
		head: [1.02, 0.98, 1],
		skin: 1,
		cloth: 4,
		trousers: 0,
		clothing: 'sari',
		hair: 'bun',
		age: 'adult',
		expression: 'suspicion'
	},
	{
		name: 'young-courier-shirt',
		height: 1.03,
		shoulder: 1.02,
		build: 0.89,
		head: [0.95, 1.04, 0.96],
		skin: 3,
		cloth: 6,
		trousers: 3,
		clothing: 'shirt',
		hair: 'crop',
		age: 'young',
		expression: 'concentration'
	},
	{
		name: 'retired-teacher-kurta',
		height: 0.98,
		shoulder: 0.99,
		build: 0.95,
		head: [1, 1.01, 1.03],
		skin: 2,
		cloth: 0,
		trousers: 2,
		clothing: 'kurta',
		hair: 'grey',
		age: 'older',
		expression: 'amusement'
	},
	{
		name: 'school-student-blue',
		height: 0.84,
		shoulder: 0.9,
		build: 0.82,
		head: [0.98, 1.05, 0.98],
		skin: 3,
		cloth: 1,
		trousers: 0,
		clothing: 'school',
		hair: 'parted',
		age: 'child',
		expression: 'affection'
	},
	{
		name: 'restaurant-worker',
		height: 1.01,
		shoulder: 1.03,
		build: 1.02,
		head: [1.01, 1, 0.97],
		skin: 4,
		cloth: 4,
		trousers: 1,
		clothing: 'shirt',
		hair: 'short',
		age: 'adult',
		expression: 'irritation'
	},
	{
		name: 'elderly-walker-shawl',
		height: 0.88,
		shoulder: 0.94,
		build: 0.9,
		head: [1.04, 0.96, 1.05],
		skin: 1,
		cloth: 5,
		trousers: 2,
		clothing: 'shawl',
		hair: 'grey',
		age: 'older',
		expression: 'suspicion'
	},
	{
		name: 'college-student-kurta',
		height: 1,
		shoulder: 0.94,
		build: 0.85,
		head: [0.94, 1.06, 0.96],
		skin: 2,
		cloth: 2,
		trousers: 0,
		clothing: 'kurta',
		hair: 'crop',
		age: 'young',
		expression: 'amusement'
	},
	{
		name: 'ferry-worker-lungi',
		height: 1.06,
		shoulder: 1.15,
		build: 1.13,
		head: [1.08, 0.96, 1.04],
		skin: 4,
		cloth: 6,
		trousers: 3,
		clothing: 'lungi',
		hair: 'short',
		age: 'adult',
		expression: 'concentration'
	},
	{
		name: 'shopper-raincoat',
		height: 0.96,
		shoulder: 0.96,
		build: 0.98,
		head: [0.98, 1.02, 1],
		skin: 3,
		cloth: 3,
		trousers: 1,
		clothing: 'raincoat',
		hair: 'covered',
		age: 'adult',
		expression: 'surprise'
	},
	{
		name: 'architect-office-shirt',
		height: 1.07,
		shoulder: 0.97,
		build: 0.92,
		head: [0.95, 1.04, 0.98],
		skin: 1,
		cloth: 7,
		trousers: 0,
		clothing: 'office',
		hair: 'parted',
		age: 'adult',
		expression: 'concentration'
	}
] as const;

interface Pose {
	readonly leftHand: THREE.Vector3;
	readonly rightHand: THREE.Vector3;
	readonly leftFoot: THREE.Vector3;
	readonly rightFoot: THREE.Vector3;
	readonly crouch: number;
	readonly lean: number;
}

class GeometryAccumulator {
	private readonly byMaterial = new Map<string, THREE.BufferGeometry[]>();

	add(material: string, source: THREE.BufferGeometry, matrix: THREE.Matrix4): void {
		const geometry = source.clone();
		geometry.applyMatrix4(matrix);
		const list = this.byMaterial.get(material) ?? [];
		list.push(geometry);
		this.byMaterial.set(material, list);
	}

	build(materials: ReadonlyMap<string, THREE.Material>, name: string): THREE.Group {
		const group = new THREE.Group();
		group.name = name;
		for (const [key, geometries] of this.byMaterial) {
			const merged = mergeGeometries(geometries, false);
			for (const geometry of geometries) geometry.dispose();
			if (!merged) continue;
			merged.userData.kdChunkOwned = true;
			const material = materials.get(key) ?? materials.get('ink');
			if (!material) continue;
			const part = new THREE.Mesh(merged, material);
			part.castShadow = true;
			part.receiveShadow = false;
			group.add(part);
		}
		return group;
	}
}

function localMatrix(
	position: THREE.Vector3,
	scale: THREE.Vector3,
	rotation = new THREE.Quaternion()
): THREE.Matrix4 {
	return new THREE.Matrix4().compose(position, rotation, scale);
}

function combinedMatrix(world: THREE.Matrix4, local: THREE.Matrix4): THREE.Matrix4 {
	return new THREE.Matrix4().multiplyMatrices(world, local);
}

function betweenMatrix(start: THREE.Vector3, end: THREE.Vector3, radius: number): THREE.Matrix4 {
	const direction = end.clone().sub(start);
	const length = direction.length();
	const midpoint = start.clone().add(end).multiplyScalar(0.5);
	const quaternion = new THREE.Quaternion().setFromUnitVectors(
		new THREE.Vector3(0, 1, 0),
		direction.multiplyScalar(1 / Math.max(0.001, length))
	);
	return localMatrix(midpoint, new THREE.Vector3(radius, length, radius), quaternion);
}

function poseForActivity(kind: ActivityKind): Pose {
	const pose: Pose = {
		leftHand: new THREE.Vector3(-0.42, 1.18, 0.23),
		rightHand: new THREE.Vector3(0.42, 1.18, 0.23),
		leftFoot: new THREE.Vector3(-0.2, 0.08, 0.08),
		rightFoot: new THREE.Vector3(0.2, 0.08, -0.08),
		crouch: 0,
		lean: 0
	};
	switch (kind) {
		case 'tea-pour':
			return {
				...pose,
				leftHand: new THREE.Vector3(-0.18, 1.15, 0.48),
				rightHand: new THREE.Vector3(0.48, 1.43, 0.52),
				lean: 0.08
			};
		case 'bookseller-bundle':
			return {
				...pose,
				leftHand: new THREE.Vector3(-0.26, 0.65, 0.42),
				rightHand: new THREE.Vector3(0.28, 0.66, 0.43),
				crouch: 0.28,
				lean: 0.16
			};
		case 'conductor-argument':
			return {
				...pose,
				leftHand: new THREE.Vector3(-0.55, 1.05, 0.12),
				rightHand: new THREE.Vector3(0.8, 1.72, 0.3),
				lean: -0.04
			};
		case 'traffic-whistle':
			return {
				...pose,
				leftHand: new THREE.Vector3(-0.88, 1.55, 0.2),
				rightHand: new THREE.Vector3(0.12, 1.83, 0.34)
			};
		case 'child-ball':
			return {
				...pose,
				leftHand: new THREE.Vector3(-0.58, 1.24, 0.1),
				rightHand: new THREE.Vector3(0.58, 1.4, -0.1),
				leftFoot: new THREE.Vector3(-0.22, 0.12, 0.25),
				rightFoot: new THREE.Vector3(0.28, 0.28, -0.3),
				lean: 0.14
			};
		case 'roof-watering':
			return {
				...pose,
				leftHand: new THREE.Vector3(-0.22, 1.08, 0.57),
				rightHand: new THREE.Vector3(0.3, 1.14, 0.62),
				lean: 0.12
			};
		case 'adda':
			return {
				...pose,
				leftHand: new THREE.Vector3(-0.45, 1.1, 0.2),
				rightHand: new THREE.Vector3(0.72, 1.5, 0.34),
				crouch: 0.18
			};
		case 'clay-shaping':
			return {
				...pose,
				leftHand: new THREE.Vector3(-0.18, 0.93, 0.58),
				rightHand: new THREE.Vector3(0.19, 0.96, 0.59),
				crouch: 0.24,
				lean: 0.18
			};
		case 'newspaper-wind':
		case 'ferry-wait':
			return {
				...pose,
				leftHand: new THREE.Vector3(-0.58, 1.35, 0.48),
				rightHand: new THREE.Vector3(0.58, 1.46, 0.5),
				lean: -0.05
			};
		case 'office-walk':
		case 'student-books':
			return {
				...pose,
				leftHand: new THREE.Vector3(-0.35, 1.02, 0.2),
				rightHand: new THREE.Vector3(0.43, 1.38, 0.22),
				leftFoot: new THREE.Vector3(-0.22, 0.08, 0.3),
				rightFoot: new THREE.Vector3(0.23, 0.08, -0.27),
				lean: 0.05
			};
		case 'delivery-load':
			return {
				...pose,
				leftHand: new THREE.Vector3(-0.4, 0.9, 0.48),
				rightHand: new THREE.Vector3(0.4, 0.9, 0.48),
				crouch: 0.08,
				lean: 0.11
			};
		case 'flower-selling':
			return {
				...pose,
				leftHand: new THREE.Vector3(-0.4, 0.8, 0.42),
				rightHand: new THREE.Vector3(0.38, 0.82, 0.43),
				crouch: 0.2
			};
	}
}

function addActivityProp(
	accumulator: GeometryAccumulator,
	kind: ActivityKind,
	world: THREE.Matrix4,
	base: ReadonlyMap<string, THREE.BufferGeometry>
): void {
	const sphere = base.get('sphere');
	const box = base.get('box');
	const cylinder = base.get('cylinder');
	if (!sphere || !box || !cylinder) return;
	const add = (
		material: string,
		geometry: THREE.BufferGeometry,
		position: THREE.Vector3,
		scale: THREE.Vector3,
		rotation = new THREE.Quaternion()
	): void => {
		accumulator.add(
			material,
			geometry,
			combinedMatrix(world, localMatrix(position, scale, rotation))
		);
	};
	switch (kind) {
		case 'tea-pour':
			add(
				'metal',
				sphere,
				new THREE.Vector3(0.47, 1.35, 0.53),
				new THREE.Vector3(0.18, 0.15, 0.18)
			);
			add(
				'metal',
				cylinder,
				new THREE.Vector3(-0.18, 1.1, 0.48),
				new THREE.Vector3(0.13, 0.05, 0.13)
			);
			break;
		case 'bookseller-bundle':
		case 'student-books':
			add(
				'book',
				box,
				new THREE.Vector3(0, kind === 'bookseller-bundle' ? 0.58 : 1.1, 0.46),
				new THREE.Vector3(0.52, 0.22, 0.36)
			);
			break;
		case 'traffic-whistle':
			add(
				'metal',
				cylinder,
				new THREE.Vector3(0.14, 1.82, 0.38),
				new THREE.Vector3(0.025, 0.08, 0.025),
				new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0))
			);
			break;
		case 'child-ball':
			add('ball', sphere, new THREE.Vector3(0.5, 0.22, 0.76), new THREE.Vector3(0.19, 0.19, 0.19));
			break;
		case 'roof-watering':
			add('metal', box, new THREE.Vector3(0.16, 1.08, 0.58), new THREE.Vector3(0.28, 0.22, 0.22));
			break;
		case 'clay-shaping':
			add('clay', sphere, new THREE.Vector3(0, 0.72, 0.67), new THREE.Vector3(0.3, 0.38, 0.3));
			add('wood', box, new THREE.Vector3(0, 0.52, 0.67), new THREE.Vector3(0.75, 0.12, 0.58));
			break;
		case 'newspaper-wind':
		case 'ferry-wait':
			add(
				'paper',
				box,
				new THREE.Vector3(0, 1.4, 0.5),
				new THREE.Vector3(0.95, 0.64, 0.018),
				new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.08, 0.15, 0.03))
			);
			break;
		case 'delivery-load':
			add('wood', box, new THREE.Vector3(0, 0.82, 0.52), new THREE.Vector3(0.75, 0.55, 0.55));
			break;
		case 'flower-selling':
			add('wood', cylinder, new THREE.Vector3(0, 0.58, 0.48), new THREE.Vector3(0.42, 0.24, 0.42));
			for (let index = 0; index < 5; index += 1)
				add(
					'flower',
					sphere,
					new THREE.Vector3(-0.24 + index * 0.12, 0.82 + (index % 2) * 0.08, 0.47),
					new THREE.Vector3(0.1, 0.1, 0.1)
				);
			break;
		case 'office-walk':
			add('leather', box, new THREE.Vector3(-0.38, 0.85, 0.22), new THREE.Vector3(0.42, 0.5, 0.14));
			break;
		case 'conductor-argument':
		case 'adda':
			break;
	}
}

export class InhabitantBatchBuilder {
	private readonly base = new Map<string, THREE.BufferGeometry>();
	private readonly materials = new Map<string, THREE.Material>();
	private readonly ownedMaterials: THREE.Material[] = [];
	private readonly ownedGeometries: THREE.BufferGeometry[] = [];
	private quality: WorldQualityTier;

	constructor(quality: WorldQualityTier = 'balanced') {
		this.quality = quality;
		this.addBase('sphere', new THREE.SphereGeometry(0.5, 10, 8));
		this.addBase('head', new THREE.SphereGeometry(0.5, 14, 10));
		this.addBase('cylinder', new THREE.CylinderGeometry(0.5, 0.5, 1, 8));
		this.addBase('torso', new THREE.CylinderGeometry(0.38, 0.31, 0.9, 9));
		this.addBase('box', new THREE.BoxGeometry(1, 1, 1));
		this.addBase('cone', new THREE.ConeGeometry(0.5, 1, 8));
		this.addBase('ear', new THREE.ConeGeometry(0.5, 1, 3));
		const skins = ['#6f4934', '#85573b', '#9b6747', '#74472f', '#a47352'];
		const clothes = [
			'#8a4039',
			'#496a74',
			'#9a773b',
			'#6c5578',
			'#526d52',
			'#ad6943',
			'#d0b14b',
			'#456276'
		];
		const trousers = ['#303b43', '#4d433d', '#665b4a', '#776143'];
		const hairs = ['#26211e', '#3a2b24', '#6b6259'];
		for (let index = 0; index < skins.length; index += 1)
			this.addMaterial(`skin${index}`, skins[index], 2.9, 0.28);
		for (let index = 0; index < clothes.length; index += 1)
			this.addMaterial(`cloth${index}`, clothes[index], 2.2, 0.35);
		for (let index = 0; index < trousers.length; index += 1)
			this.addMaterial(`trouser${index}`, trousers[index], 2.4, 0.42);
		for (let index = 0; index < hairs.length; index += 1)
			this.addMaterial(`hair${index}`, hairs[index], 3.1, 0.45);
		this.addMaterial('ink', '#272524', 3.3, 0.48);
		this.addMaterial('paper', '#d6d0be', 3, 0.18);
		this.addMaterial('metal', '#5b5e59', 3.5, 0.45, 0.22);
		this.addMaterial('book', '#7d3f38', 2.6, 0.32);
		this.addMaterial('ball', '#b3633d', 2.4, 0.25);
		this.addMaterial('clay', '#916448', 2.8, 0.42);
		this.addMaterial('wood', '#705438', 2.8, 0.42);
		this.addMaterial('flower', '#b86d42', 3.4, 0.2);
		this.addMaterial('leather', '#49382c', 3, 0.38);
		this.addMaterial('far', '#4d4a45', 1.8, 0.5);
	}

	setQuality(quality: WorldQualityTier): void {
		this.quality = quality;
	}

	private addBase(name: string, geometry: THREE.BufferGeometry): void {
		this.base.set(name, geometry);
		this.ownedGeometries.push(geometry);
	}

	private addMaterial(
		name: string,
		color: string,
		hatchScale: number,
		hatchStrength: number,
		metalness = 0
	): void {
		const material = createCharcoalMaterial({
			color,
			hatchScale,
			hatchStrength,
			metalness,
			roughness: 0.92
		});
		this.materials.set(name, material);
		this.ownedMaterials.push(material);
	}

	createActivities(blueprints: readonly ActivityBlueprint[]): THREE.LOD {
		const near = new GeometryAccumulator();
		const far = new GeometryAccumulator();
		for (const blueprint of blueprints) {
			this.addPerson(near, blueprint);
			this.addFarPerson(far, blueprint);
		}
		const lod = new THREE.LOD();
		lod.name = 'kd-near-field-activities';
		lod.addLevel(near.build(this.materials, 'anatomical-activity-batch'), 0);
		lod.addLevel(
			far.build(this.materials, 'distant-activity-volumes'),
			this.quality === 'high' ? 95 : 72
		);
		lod.userData.activities = blueprints.map(({ id, kind, appearance }) => ({
			id,
			kind,
			appearance
		}));
		lod.userData.nearFieldGeometry = true;
		lod.userData.isScoringObstacle = false;
		return lod;
	}

	private addPerson(accumulator: GeometryAccumulator, blueprint: ActivityBlueprint): void {
		const appearance = PERSON_APPEARANCES[blueprint.appearance % PERSON_APPEARANCES.length];
		const pose = poseForActivity(blueprint.kind);
		const actorScale = appearance.height * (appearance.age === 'child' ? 0.88 : 1);
		const world = new THREE.Matrix4().compose(
			new THREE.Vector3(...blueprint.position),
			new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), blueprint.rotationY),
			new THREE.Vector3(actorScale, actorScale, actorScale)
		);
		const sphere = this.base.get('sphere');
		const head = this.base.get('head');
		const torso = this.base.get('torso');
		const cylinder = this.base.get('cylinder');
		const box = this.base.get('box');
		const cone = this.base.get('cone');
		if (!sphere || !head || !torso || !cylinder || !box || !cone) return;
		const crouch = pose.crouch;
		const shoulderY = 1.48 - crouch + pose.lean * 0.1;
		const pelvisY = 0.82 - crouch;
		const shoulderX = 0.32 * appearance.shoulder;
		const skin = `skin${appearance.skin}`;
		const cloth = `cloth${appearance.cloth}`;
		const trouser = `trouser${appearance.trousers}`;
		const hair =
			appearance.hair === 'grey'
				? 'hair2'
				: appearance.hair === 'parted' || appearance.hair === 'bun'
					? 'hair1'
					: 'hair0';
		const add = (
			material: string,
			geometry: THREE.BufferGeometry,
			position: THREE.Vector3,
			scale: THREE.Vector3,
			rotation = new THREE.Quaternion()
		): void =>
			accumulator.add(
				material,
				geometry,
				combinedMatrix(world, localMatrix(position, scale, rotation))
			);

		add(
			cloth,
			torso,
			new THREE.Vector3(0, 1.18 - crouch, pose.lean),
			new THREE.Vector3(appearance.build, 1, appearance.build * 0.82)
		);
		add(
			trouser,
			sphere,
			new THREE.Vector3(0, pelvisY, 0),
			new THREE.Vector3(0.38 * appearance.build, 0.27, 0.3)
		);
		if (
			appearance.clothing === 'kurta' ||
			appearance.clothing === 'raincoat' ||
			appearance.clothing === 'salwar'
		)
			add(
				cloth,
				cone,
				new THREE.Vector3(0, 0.9 - crouch, 0),
				new THREE.Vector3(0.48 * appearance.build, 0.58, 0.4)
			);
		if (appearance.clothing === 'sari') {
			add(cloth, cone, new THREE.Vector3(0, 0.62 - crouch, 0), new THREE.Vector3(0.52, 0.82, 0.43));
			add(
				cloth,
				box,
				new THREE.Vector3(-0.22, 1.22 - crouch, 0.04),
				new THREE.Vector3(0.2, 0.86, 0.08),
				new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -0.28))
			);
		}
		if (appearance.clothing === 'lungi')
			add(
				`cloth${(appearance.cloth + 2) % 8}`,
				cylinder,
				new THREE.Vector3(0, 0.55 - crouch, 0),
				new THREE.Vector3(0.46, 0.7, 0.4)
			);
		if (appearance.clothing === 'shawl')
			add(
				cloth,
				box,
				new THREE.Vector3(0, 1.35 - crouch, 0.03),
				new THREE.Vector3(0.86, 0.34, 0.12),
				new THREE.Quaternion().setFromEuler(new THREE.Euler(0.08, 0, 0.12))
			);

		const neck = new THREE.Vector3(0, 1.68 - crouch, pose.lean * 0.4);
		add(skin, cylinder, neck, new THREE.Vector3(0.13, 0.22, 0.13));
		const headCentre = new THREE.Vector3(0, 1.93 - crouch, 0.02 + pose.lean * 0.35);
		add(
			skin,
			head,
			headCentre,
			new THREE.Vector3(
				0.43 * appearance.head[0],
				0.5 * appearance.head[1],
				0.42 * appearance.head[2]
			)
		);
		add(
			skin,
			sphere,
			new THREE.Vector3(0, 1.83 - crouch, 0.18),
			new THREE.Vector3(0.34, 0.2, 0.34)
		);
		add(
			hair,
			head,
			new THREE.Vector3(0, 2.09 - crouch, -0.025),
			new THREE.Vector3(0.44, appearance.hair === 'crop' ? 0.2 : 0.27, 0.43)
		);
		if (appearance.hair === 'bun')
			add(
				hair,
				sphere,
				new THREE.Vector3(0, 2.03 - crouch, -0.4),
				new THREE.Vector3(0.21, 0.22, 0.19)
			);
		for (const x of [-0.15, 0.15]) {
			add(
				'ink',
				sphere,
				new THREE.Vector3(x, 1.99 - crouch, 0.4),
				new THREE.Vector3(0.035, 0.028, 0.025)
			);
			const browTilt =
				appearance.expression === 'irritation'
					? x * 0.8
					: appearance.expression === 'surprise'
						? 0
						: -x * 0.22;
			add(
				'ink',
				box,
				new THREE.Vector3(x, 2.07 - crouch, 0.405),
				new THREE.Vector3(0.11, 0.025, 0.025),
				new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, browTilt))
			);
		}
		add(
			skin,
			cone,
			new THREE.Vector3(0, 1.92 - crouch, 0.49),
			new THREE.Vector3(0.09, 0.19, 0.08),
			new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0))
		);
		const mouthY = appearance.expression === 'surprise' ? 1.8 : 1.82;
		add(
			'ink',
			box,
			new THREE.Vector3(0, mouthY - crouch, 0.438),
			new THREE.Vector3(
				appearance.expression === 'surprise' ? 0.055 : 0.14,
				appearance.expression === 'surprise' ? 0.065 : 0.025,
				0.02
			)
		);

		const leftShoulder = new THREE.Vector3(-shoulderX, shoulderY, 0);
		const rightShoulder = new THREE.Vector3(shoulderX, shoulderY, 0);
		const leftElbow = leftShoulder
			.clone()
			.lerp(pose.leftHand, 0.53)
			.add(new THREE.Vector3(-0.08, 0.02, -0.04));
		const rightElbow = rightShoulder
			.clone()
			.lerp(pose.rightHand, 0.53)
			.add(new THREE.Vector3(0.08, 0.02, -0.04));
		accumulator.add(
			cloth,
			cylinder,
			combinedMatrix(world, betweenMatrix(leftShoulder, leftElbow, 0.13))
		);
		accumulator.add(
			skin,
			cylinder,
			combinedMatrix(world, betweenMatrix(leftElbow, pose.leftHand, 0.095))
		);
		accumulator.add(
			cloth,
			cylinder,
			combinedMatrix(world, betweenMatrix(rightShoulder, rightElbow, 0.13))
		);
		accumulator.add(
			skin,
			cylinder,
			combinedMatrix(world, betweenMatrix(rightElbow, pose.rightHand, 0.095))
		);
		add(skin, sphere, pose.leftHand, new THREE.Vector3(0.13, 0.11, 0.1));
		add(skin, sphere, pose.rightHand, new THREE.Vector3(0.13, 0.11, 0.1));

		const leftHip = new THREE.Vector3(-0.19, pelvisY, 0);
		const rightHip = new THREE.Vector3(0.19, pelvisY, 0);
		const leftKnee = leftHip
			.clone()
			.lerp(pose.leftFoot, 0.52)
			.add(new THREE.Vector3(0, 0, 0.06));
		const rightKnee = rightHip
			.clone()
			.lerp(pose.rightFoot, 0.52)
			.add(new THREE.Vector3(0, 0, 0.06));
		accumulator.add(
			trouser,
			cylinder,
			combinedMatrix(world, betweenMatrix(leftHip, leftKnee, 0.135))
		);
		accumulator.add(
			trouser,
			cylinder,
			combinedMatrix(world, betweenMatrix(leftKnee, pose.leftFoot, 0.11))
		);
		accumulator.add(
			trouser,
			cylinder,
			combinedMatrix(world, betweenMatrix(rightHip, rightKnee, 0.135))
		);
		accumulator.add(
			trouser,
			cylinder,
			combinedMatrix(world, betweenMatrix(rightKnee, pose.rightFoot, 0.11))
		);
		add(
			'ink',
			box,
			pose.leftFoot.clone().add(new THREE.Vector3(0, -0.02, 0.08)),
			new THREE.Vector3(0.24, 0.11, 0.38)
		);
		add(
			'ink',
			box,
			pose.rightFoot.clone().add(new THREE.Vector3(0, -0.02, 0.08)),
			new THREE.Vector3(0.24, 0.11, 0.38)
		);
		addActivityProp(accumulator, blueprint.kind, world, this.base);
	}

	private addFarPerson(accumulator: GeometryAccumulator, blueprint: ActivityBlueprint): void {
		const world = new THREE.Matrix4().compose(
			new THREE.Vector3(...blueprint.position),
			new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), blueprint.rotationY),
			new THREE.Vector3(1, 1, 1)
		);
		const torso = this.base.get('torso');
		const head = this.base.get('head');
		const cylinder = this.base.get('cylinder');
		if (!torso || !head || !cylinder) return;
		accumulator.add(
			'far',
			torso,
			combinedMatrix(
				world,
				localMatrix(new THREE.Vector3(0, 1.1, 0), new THREE.Vector3(0.95, 1, 0.8))
			)
		);
		accumulator.add(
			'far',
			head,
			combinedMatrix(
				world,
				localMatrix(new THREE.Vector3(0, 1.88, 0), new THREE.Vector3(0.4, 0.46, 0.4))
			)
		);
		for (const x of [-0.18, 0.18])
			accumulator.add(
				'far',
				cylinder,
				combinedMatrix(
					world,
					localMatrix(new THREE.Vector3(x, 0.48, 0), new THREE.Vector3(0.12, 0.82, 0.12))
				)
			);
	}

	createAnimals(blueprints: readonly AnimalBlueprint[]): THREE.LOD {
		const near = new GeometryAccumulator();
		const far = new GeometryAccumulator();
		for (const blueprint of blueprints) {
			this.addAnimal(near, blueprint, false);
			this.addAnimal(far, blueprint, true);
		}
		const lod = new THREE.LOD();
		lod.name = 'kd-near-field-animals';
		lod.addLevel(near.build(this.materials, 'anatomical-animal-batch'), 0);
		lod.addLevel(
			far.build(this.materials, 'distant-animal-volumes'),
			this.quality === 'high' ? 90 : 66
		);
		lod.userData.animals = blueprints.map(({ id, kind, appearance }) => ({ id, kind, appearance }));
		lod.userData.nearFieldGeometry = true;
		lod.userData.isScoringObstacle = false;
		return lod;
	}

	private addAnimal(
		accumulator: GeometryAccumulator,
		blueprint: AnimalBlueprint,
		far: boolean
	): void {
		const world = new THREE.Matrix4().compose(
			new THREE.Vector3(...blueprint.position),
			new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), blueprint.rotationY),
			new THREE.Vector3(1, 1, 1)
		);
		const sphere = this.base.get('sphere');
		const cylinder = this.base.get('cylinder');
		const cone = this.base.get('cone');
		const ear = this.base.get('ear');
		if (!sphere || !cylinder || !cone || !ear) return;
		const material = far ? 'far' : `trouser${blueprint.appearance % 4}`;
		const add = (
			key: string,
			geometry: THREE.BufferGeometry,
			position: THREE.Vector3,
			scale: THREE.Vector3,
			rotation = new THREE.Quaternion()
		): void =>
			accumulator.add(
				far ? 'far' : key,
				geometry,
				combinedMatrix(world, localMatrix(position, scale, rotation))
			);
		const bird = ['crow', 'pigeon', 'myna', 'black-kite', 'egret', 'pond-heron'].includes(
			blueprint.kind
		);
		if (bird) {
			const large =
				blueprint.kind === 'black-kite'
					? 1.4
					: blueprint.kind === 'egret' || blueprint.kind === 'pond-heron'
						? 1.15
						: 0.72;
			add(
				material,
				sphere,
				new THREE.Vector3(0, 0, 0),
				new THREE.Vector3(0.24 * large, 0.2 * large, 0.42 * large)
			);
			add(
				material,
				sphere,
				new THREE.Vector3(0, 0.11 * large, 0.4 * large),
				new THREE.Vector3(0.19 * large, 0.18 * large, 0.22 * large)
			);
			add(
				'ball',
				cone,
				new THREE.Vector3(0, 0.08 * large, 0.63 * large),
				new THREE.Vector3(0.08 * large, 0.22 * large, 0.08 * large),
				new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0))
			);
			for (const side of [-1, 1])
				add(
					material,
					cone,
					new THREE.Vector3(side * 0.36 * large, 0, -0.02),
					new THREE.Vector3(0.46 * large, 0.75 * large, 0.08 * large),
					new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, (side * Math.PI) / 2))
				);
			if (!far)
				for (const x of [-0.09, 0.09])
					add(
						'ink',
						sphere,
						new THREE.Vector3(x, 0.18 * large, 0.55 * large),
						new THREE.Vector3(0.025, 0.025, 0.025)
					);
			return;
		}

		const dog = blueprint.kind === 'street-dog';
		const cat = blueprint.kind === 'parapet-cat';
		const goat = blueprint.kind === 'goat';
		const bodyScale = dog
			? new THREE.Vector3(0.42, 0.38, 0.72)
			: cat
				? new THREE.Vector3(0.34, 0.3, 0.58)
				: new THREE.Vector3(0.5, 0.52, 0.82);
		add(material, sphere, new THREE.Vector3(0, bodyScale.y + 0.16, 0), bodyScale);
		add(
			material,
			sphere,
			new THREE.Vector3(0, bodyScale.y + 0.28, 0.68),
			dog
				? new THREE.Vector3(0.34, 0.32, 0.38)
				: cat
					? new THREE.Vector3(0.29, 0.29, 0.3)
					: new THREE.Vector3(0.36, 0.4, 0.34)
		);
		for (const x of [-0.25, 0.25])
			for (const z of [-0.38, 0.38])
				accumulator.add(
					material,
					cylinder,
					combinedMatrix(
						world,
						betweenMatrix(
							new THREE.Vector3(x, 0.42, z),
							new THREE.Vector3(x, 0.04, z + 0.04),
							goat ? 0.09 : 0.075
						)
					)
				);
		for (const x of [-0.19, 0.19])
			add(
				material,
				ear,
				new THREE.Vector3(x, bodyScale.y + 0.6, 0.67),
				new THREE.Vector3(0.18, 0.24, 0.1),
				new THREE.Quaternion().setFromEuler(new THREE.Euler(0.2, 0, x < 0 ? 0.35 : -0.35))
			);
		if (goat)
			for (const x of [-0.14, 0.14])
				add(
					'paper',
					cone,
					new THREE.Vector3(x, bodyScale.y + 0.72, 0.65),
					new THREE.Vector3(0.08, 0.32, 0.08),
					new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.25, 0, x < 0 ? -0.15 : 0.15))
				);
		accumulator.add(
			material,
			cylinder,
			combinedMatrix(
				world,
				betweenMatrix(
					new THREE.Vector3(0, bodyScale.y + 0.25, -0.55),
					new THREE.Vector3(0.2, bodyScale.y + 0.66, -0.9),
					0.055
				)
			)
		);
		if (!far) {
			for (const x of [-0.1, 0.1])
				add(
					'ink',
					sphere,
					new THREE.Vector3(x, bodyScale.y + 0.36, 0.98),
					new THREE.Vector3(0.025, 0.025, 0.025)
				);
			add(
				'ink',
				sphere,
				new THREE.Vector3(0, bodyScale.y + 0.22, 1.04),
				new THREE.Vector3(0.05, 0.04, 0.04)
			);
		}
	}

	disposeChunkBatch(object: THREE.Object3D): void {
		object.traverse((child) => {
			if (child instanceof THREE.Mesh && child.geometry.userData.kdChunkOwned === true)
				child.geometry.dispose();
		});
	}

	dispose(): void {
		for (const material of this.ownedMaterials) material.dispose();
		for (const geometry of this.ownedGeometries) geometry.dispose();
		this.ownedMaterials.length = 0;
		this.ownedGeometries.length = 0;
		this.materials.clear();
		this.base.clear();
	}
}

export function animalHabitatLabel(kind: AnimalKind): string {
	switch (kind) {
		case 'egret':
		case 'pond-heron':
			return 'river-and-wetland';
		case 'black-kite':
			return 'thermal-air';
		case 'parapet-cat':
			return 'warm-parapet';
		case 'goat':
			return 'market-lane';
		case 'street-dog':
			return 'inhabited-street';
		case 'crow':
		case 'pigeon':
		case 'myna':
			return 'roof-and-street';
	}
}
