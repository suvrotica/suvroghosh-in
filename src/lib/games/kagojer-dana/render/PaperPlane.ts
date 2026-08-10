import * as THREE from 'three';

export interface PaperPlaneFrame {
	readonly gustLoad?: number;
	readonly creaseLevel?: number;
	readonly elapsedSeconds?: number;
}

export interface PaperPlaneOptions {
	readonly scale?: number;
	readonly handledAmount?: number;
}

interface PaperPoint {
	readonly x: number;
	readonly y: number;
	readonly z: number;
}

const PAPER_VERTEX = /* glsl */ `
	varying vec3 vKdPaperPosition;
`;

const PAPER_FRAGMENT = /* glsl */ `
	varying vec3 vKdPaperPosition;
	uniform float uKdHandling;
	uniform float uKdPaperTime;

	float kdPaperHash(vec2 p) {
		return fract(sin(dot(floor(p), vec2(127.1, 311.7))) * 43758.5453);
	}

	float kdFingerprint(vec2 point, vec2 centre, float angle) {
		vec2 delta = point - centre;
		float c = cos(angle);
		float s = sin(angle);
		delta = mat2(c, -s, s, c) * delta;
		float envelope = exp(-dot(delta * vec2(8.0, 13.0), delta * vec2(8.0, 13.0)));
		float ridge = 0.5 + 0.5 * sin(length(delta * vec2(10.0, 16.0)) * 95.0);
		return envelope * ridge;
	}
`;

const PAPER_SURFACE = /* glsl */ `
	float kdRuleCoordinate = abs(fract((vKdPaperPosition.z + 0.53) * 8.6) - 0.5);
	float kdRule = 1.0 - smoothstep(0.014, 0.026, kdRuleCoordinate);
	float kdMargin = 1.0 - smoothstep(0.012, 0.025, abs(vKdPaperPosition.x + 0.285));
	float kdFibres = (kdPaperHash(vKdPaperPosition.xz * vec2(185.0, 37.0)) - 0.5) * 0.032;
	float kdPrint = kdFingerprint(vKdPaperPosition.xz, vec2(-0.11, -0.05), 0.31)
		+ kdFingerprint(vKdPaperPosition.xz, vec2(0.17, -0.29), -0.22);
	outgoingLight += kdFibres;
	outgoingLight = mix(outgoingLight, vec3(0.42, 0.57, 0.64), kdRule * 0.12);
	outgoingLight = mix(outgoingLight, vec3(0.58, 0.31, 0.29), kdMargin * 0.075);
	outgoingLight *= 1.0 - kdPrint * (0.025 + clamp(uKdHandling, 0.0, 1.0) * 0.055);
`;

function triangleNormal(a: PaperPoint, b: PaperPoint, c: PaperPoint): THREE.Vector3 {
	const ab = new THREE.Vector3(b.x - a.x, b.y - a.y, b.z - a.z);
	const ac = new THREE.Vector3(c.x - a.x, c.y - a.y, c.z - a.z);
	return ab.cross(ac).normalize();
}

function makeFoldedGeometry(thickness = 0.008): THREE.BufferGeometry {
	const nose: PaperPoint = { x: 0, y: 0.04, z: 0.65 };
	const centreTail: PaperPoint = { x: 0, y: 0.068, z: -0.52 };
	const leftFold: PaperPoint = { x: -0.12, y: 0.026, z: -0.34 };
	const leftOuter: PaperPoint = { x: -0.52, y: -0.008, z: -0.43 };
	const rightFold: PaperPoint = { x: 0.12, y: 0.026, z: -0.34 };
	const rightOuter: PaperPoint = { x: 0.52, y: -0.008, z: -0.43 };
	const topTriangles: readonly [PaperPoint, PaperPoint, PaperPoint][] = [
		[nose, leftFold, centreTail],
		[nose, leftOuter, leftFold],
		[leftFold, leftOuter, centreTail],
		[nose, centreTail, rightFold],
		[nose, rightFold, rightOuter],
		[rightFold, centreTail, rightOuter]
	];
	const positions: number[] = [];
	const normals: number[] = [];
	const uvs: number[] = [];
	const pushVertex = (point: PaperPoint, normal: THREE.Vector3): void => {
		positions.push(point.x, point.y, point.z);
		normals.push(normal.x, normal.y, normal.z);
		uvs.push(point.x + 0.52, point.z + 0.52);
	};
	for (const triangle of topTriangles) {
		const normal = triangleNormal(...triangle);
		for (const vertex of triangle) pushVertex(vertex, normal);
		const bottom = triangle.map((point) => ({ ...point, y: point.y - thickness })) as [
			PaperPoint,
			PaperPoint,
			PaperPoint
		];
		const bottomNormal = triangleNormal(bottom[2], bottom[1], bottom[0]);
		pushVertex(bottom[2], bottomNormal);
		pushVertex(bottom[1], bottomNormal);
		pushVertex(bottom[0], bottomNormal);
	}

	const boundary: readonly PaperPoint[] = [nose, leftOuter, centreTail, rightOuter];
	for (let index = 0; index < boundary.length; index += 1) {
		const start = boundary[index];
		const end = boundary[(index + 1) % boundary.length];
		const startBottom = { ...start, y: start.y - thickness };
		const endBottom = { ...end, y: end.y - thickness };
		const normal = triangleNormal(start, startBottom, end);
		pushVertex(start, normal);
		pushVertex(startBottom, normal);
		pushVertex(end, normal);
		pushVertex(end, normal);
		pushVertex(startBottom, normal);
		pushVertex(endBottom, normal);
	}

	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
	geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
	geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
	geometry.computeBoundingSphere();
	geometry.userData.forwardAxis = '+Z';
	geometry.userData.paperThicknessM = thickness;
	return geometry;
}

function makeCreaseGeometry(): THREE.BufferGeometry {
	const positions = [
		0, 0.075, 0.64, 0, 0.078, -0.51, 0, 0.075, 0.64, -0.12, 0.033, -0.34, 0, 0.075, 0.64, 0.12,
		0.033, -0.34
	];
	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
	geometry.computeBoundingSphere();
	return geometry;
}

/**
 * Crisp folded notebook paper. Model-space +Z is the nose/forward axis and +Y
 * points through the top face. The simulation can copy its pose onto `object`.
 */
export class PaperPlaneVisual {
	readonly object = new THREE.Group();
	readonly forwardAxis = Object.freeze({ x: 0, y: 0, z: 1 });
	readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshPhysicalMaterial>;
	private readonly geometry: THREE.BufferGeometry;
	private readonly material: THREE.MeshPhysicalMaterial;
	private readonly creaseGeometry: THREE.BufferGeometry;
	private readonly creaseMaterial: THREE.LineBasicMaterial;
	private readonly basePositions: Float32Array;
	private readonly handlingUniform = { value: 0.28 };
	private readonly timeUniform = { value: 0 };
	private lastFlexM = Number.NaN;
	private disposed = false;

	constructor(options: PaperPlaneOptions = {}) {
		this.geometry = makeFoldedGeometry();
		this.material = new THREE.MeshPhysicalMaterial({
			name: 'KagojerDanaFibrousPaper',
			color: '#eee5cf',
			roughness: 0.94,
			metalness: 0,
			transmission: 0.035,
			thickness: 0.008,
			ior: 1.46,
			clearcoat: 0,
			side: THREE.DoubleSide
		});
		this.handlingUniform.value = Math.max(0, Math.min(1, options.handledAmount ?? 0.28));
		this.material.onBeforeCompile = (shader) => {
			shader.uniforms.uKdHandling = this.handlingUniform;
			shader.uniforms.uKdPaperTime = this.timeUniform;
			shader.vertexShader = shader.vertexShader
				.replace('#include <common>', `#include <common>\n${PAPER_VERTEX}`)
				.replace(
					'#include <begin_vertex>',
					'#include <begin_vertex>\nvKdPaperPosition = position;'
				);
			shader.fragmentShader = shader.fragmentShader
				.replace('#include <common>', `#include <common>\n${PAPER_FRAGMENT}`)
				.replace('#include <opaque_fragment>', `${PAPER_SURFACE}\n#include <opaque_fragment>`);
		};
		this.material.customProgramCacheKey = () => 'kagojer-dana-paper-v1';
		this.mesh = new THREE.Mesh(this.geometry, this.material);
		this.mesh.castShadow = true;
		this.mesh.receiveShadow = false;
		this.mesh.userData.isPaperPlane = true;
		this.mesh.userData.forwardAxis = '+Z';
		this.creaseGeometry = makeCreaseGeometry();
		this.creaseMaterial = new THREE.LineBasicMaterial({
			color: '#554e44',
			transparent: true,
			opacity: 0.62,
			depthWrite: false
		});
		const creases = new THREE.LineSegments(this.creaseGeometry, this.creaseMaterial);
		creases.renderOrder = 2;
		this.object.add(this.mesh, creases);
		this.object.scale.setScalar(Math.max(0.05, options.scale ?? 0.72));
		this.object.userData.forwardAxis = '+Z';
		this.object.userData.isPaperPlane = true;
		const position = this.geometry.getAttribute('position') as THREE.BufferAttribute;
		this.basePositions = new Float32Array(position.array as ArrayLike<number>);
	}

	update(frame: PaperPlaneFrame): void {
		if (this.disposed) return;
		const gust = Math.max(-1, Math.min(1, frame.gustLoad ?? 0));
		const crease = Math.max(0, Math.min(1, frame.creaseLevel ?? 0));
		this.handlingUniform.value = Math.max(this.handlingUniform.value, 0.24 + crease * 0.6);
		this.timeUniform.value = Math.max(0, frame.elapsedSeconds ?? 0);
		const flexM = gust * 0.025 + crease * 0.004;
		if (Math.abs(flexM - this.lastFlexM) < 0.0001) return;
		this.lastFlexM = flexM;
		const position = this.geometry.getAttribute('position') as THREE.BufferAttribute;
		for (let index = 0; index < position.count; index += 1) {
			const offset = index * 3;
			const x = this.basePositions[offset];
			const outerWeight = Math.pow(Math.min(1, Math.abs(x) / 0.52), 1.8);
			position.setY(index, this.basePositions[offset + 1] - Math.abs(flexM) * outerWeight);
		}
		position.needsUpdate = true;
		this.geometry.computeVertexNormals();
	}

	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		this.object.clear();
		this.geometry.dispose();
		this.material.dispose();
		this.creaseGeometry.dispose();
		this.creaseMaterial.dispose();
	}
}

export function createPaperPlane(options: PaperPlaneOptions = {}): PaperPlaneVisual {
	return new PaperPlaneVisual(options);
}
