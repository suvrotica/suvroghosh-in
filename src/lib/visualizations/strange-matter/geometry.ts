import * as THREE from 'three';
import type { DesignState } from './model';

const TAU = Math.PI * 2;

/** A closed, asymmetrical knot with a broad, folded cross-section. */
class RibbonCurve extends THREE.Curve<THREE.Vector3> {
	constructor(
		private shape: number,
		private phase: number,
		private satellite = false
	) {
		super();
	}
	getPoint(t: number, target = new THREE.Vector3()): THREE.Vector3 {
		const u = t * TAU;
		const bend = 0.35 + this.shape * 0.0028;
		const radius = 1.05 + bend * Math.cos(3 * u + this.phase);
		return target.set(
			radius * Math.cos(2 * u),
			radius * Math.sin(2 * u),
			bend * Math.sin(3 * u + this.phase) * (this.satellite ? 1.3 : 1.05)
		);
	}
}

export function ribbonGeometry(state: DesignState, phase = 0, satellite = false) {
	const length = 420;
	const around = 40;
	const curve = new RibbonCurve(state.shape, phase, satellite);
	const frames = curve.computeFrenetFrames(length, true);
	const positions: number[] = [];
	const uvs: number[] = [];
	const indices: number[] = [];
	const centre = new THREE.Vector3();
	const normal = new THREE.Vector3();
	const binormal = new THREE.Vector3();
	for (let i = 0; i <= length; i++) {
		const u = i / length;
		curve.getPointAt(u, centre);
		const twist = u * TAU * 3 + phase;
		normal
			.copy(frames.normals[i])
			.multiplyScalar(Math.cos(twist))
			.addScaledVector(frames.binormals[i], Math.sin(twist));
		binormal
			.copy(frames.binormals[i])
			.multiplyScalar(Math.cos(twist))
			.addScaledVector(frames.normals[i], -Math.sin(twist));
		const breath = 0.84 + 0.16 * Math.sin(u * TAU * 6 + phase);
		for (let j = 0; j <= around; j++) {
			const v = j / around;
			const angle = v * TAU;
			const corrugation =
				1 + (satellite ? 0.025 : 0.052) * Math.cos(u * TAU * (70 + Math.round(state.detail * 0.4)));
			const width = (satellite ? 0.058 : 0.32) * breath * corrugation;
			const depth = satellite ? 0.052 : 0.12;
			positions.push(
				centre.x + normal.x * Math.cos(angle) * width + binormal.x * Math.sin(angle) * depth,
				centre.y + normal.y * Math.cos(angle) * width + binormal.y * Math.sin(angle) * depth,
				centre.z + normal.z * Math.cos(angle) * width + binormal.z * Math.sin(angle) * depth
			);
			uvs.push(u, v);
			if (i < length && j < around) {
				const a = i * (around + 1) + j;
				const b = a + around + 1;
				indices.push(a, b, a + 1, b, b + 1, a + 1);
			}
		}
	}
	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
	geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
	geometry.setIndex(indices);
	geometry.computeVertexNormals();
	return geometry;
}

export function petalGeometry(state: DesignState, theta: number, layer: number) {
	const radial = 66;
	const across = 30;
	const positions: number[] = [];
	const uvs: number[] = [];
	const indices: number[] = [];
	const scale = layer === 0 ? 1 : 0.63;
	for (let i = 0; i <= radial; i++) {
		const u = i / radial;
		const radius = (0.08 + 1.7 * u) * scale;
		// Preserve a tiny tip width: a collapsed boundary row has zero-length
		// vertex normals, which are undefined inputs to an HDR physical BRDF.
		const profile = Math.max(0.003, Math.sin(u * Math.PI));
		const width = Math.pow(profile, 0.8) * (0.24 + state.shape * 0.0026);
		for (let j = 0; j <= across; j++) {
			const v = (j / across - 0.5) * 2;
			const angle = theta + u * (0.34 + state.shape * 0.008) + v * width;
			const r =
				radius + 0.025 * Math.sin(v * (20 + state.detail * 0.3) + u * 8) * Math.sin(u * Math.PI);
			const depth =
				(0.56 * Math.cos(u * Math.PI) +
					0.48 * v * v * Math.sin(u * Math.PI) +
					0.05 * v * Math.sin(u * Math.PI) +
					0.36 * Math.pow(u, 5)) *
					scale +
				layer * 0.35;
			positions.push(r * Math.cos(angle), r * Math.sin(angle), depth);
			uvs.push(u, j / across);
			if (i < radial && j < across) {
				const a = i * (across + 1) + j;
				const b = a + across + 1;
				indices.push(a, b, a + 1, b, b + 1, a + 1);
			}
		}
	}
	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
	geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
	geometry.setIndex(indices);
	geometry.computeVertexNormals();
	return geometry;
}

export class FlowCurve extends THREE.Curve<THREE.Vector3> {
	constructor(
		private phase: number,
		private shape: number,
		private index: number
	) {
		super();
	}
	getPoint(t: number, target = new THREE.Vector3()): THREE.Vector3 {
		const u = t * TAU;
		const angle = u * 2 + this.phase;
		const radius = 0.98 + 0.37 * Math.cos(u * 3 + this.phase * 2);
		const curl = this.shape * 0.002;
		return target.set(
			(radius + this.index * 0.008) * Math.cos(angle),
			0.6 * Math.sin(u * 3 + this.phase) + curl * Math.sin(u * 7),
			(radius + this.index * 0.008) * Math.sin(angle)
		);
	}
}

export function tunnelGeometry(state: DesignState, offset: number) {
	const points: THREE.Vector3[] = [];
	const lobes = 3 + Math.round(state.shape / 26);
	for (let i = 0; i <= 160; i++) {
		const angle = (i / 160) * TAU;
		const radius = 1.32 + 0.16 * Math.sin(angle * lobes + offset * 0.8);
		points.push(new THREE.Vector3(radius * Math.cos(angle), radius * Math.sin(angle), 0));
	}
	return new THREE.TubeGeometry(
		new THREE.CatmullRomCurve3(points, true),
		160,
		0.028 + state.detail * 0.00035,
		8,
		true
	);
}
