import * as THREE from 'three';
import type { Vector3Like } from './CameraRig';

const MAX_MARKS = 48;

export interface WindMarkFrame {
	readonly position: Vector3Like;
	readonly groundVelocity: Vector3Like;
	readonly apparentWind?: Vector3Like;
	readonly gustStrength?: number;
}

/** Allocation-free world-space dry-brush cues; never feeds back into physics. */
export class WindMarkVisual {
	readonly object: THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;
	private readonly geometry: THREE.BufferGeometry;
	private readonly material: THREE.LineBasicMaterial;
	private readonly positions = new Float32Array(MAX_MARKS * 2 * 3);
	private strong = false;
	private disposed = false;

	constructor() {
		this.geometry = new THREE.BufferGeometry();
		this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
		this.geometry.setDrawRange(0, 20 * 2);
		this.material = new THREE.LineBasicMaterial({
			color: '#2f3838',
			transparent: true,
			opacity: 0.2,
			depthWrite: false
		});
		this.object = new THREE.LineSegments(this.geometry, this.material);
		this.object.name = 'world-space-apparent-wind-marks';
		this.object.frustumCulled = false;
		this.object.renderOrder = 3;
		this.object.userData.visualCueOnly = true;
	}

	setStrong(strong: boolean): void {
		this.strong = strong;
		this.geometry.setDrawRange(0, (strong ? MAX_MARKS : 20) * 2);
		this.material.opacity = strong ? 0.48 : 0.2;
	}

	update(frame: WindMarkFrame): void {
		if (this.disposed) return;
		const sourceX = frame.apparentWind?.x ?? -frame.groundVelocity.x;
		const sourceY = frame.apparentWind?.y ?? -frame.groundVelocity.y;
		const sourceZ = frame.apparentWind?.z ?? -frame.groundVelocity.z;
		const magnitude = Math.hypot(sourceX, sourceY, sourceZ);
		const gust = Math.max(0, Math.min(1, frame.gustStrength ?? 0));
		this.object.visible = magnitude > 2.5 || gust > 0.14 || this.strong;
		const inverse = 1 / Math.max(0.001, magnitude);
		const directionX = sourceX * inverse;
		const directionY = sourceY * inverse;
		const directionZ = sourceZ * inverse;
		const count = this.strong ? MAX_MARKS : 20;
		const baseLength = (this.strong ? 1.25 : 0.78) + Math.min(2.2, magnitude * 0.055) + gust * 0.8;
		for (let index = 0; index < count; index += 1) {
			const offset = index * 6;
			const x = frame.position.x + (((index * 37) % 23) - 11) * 0.62;
			const y = frame.position.y + (((index * 17) % 13) - 6) * 0.43;
			const z = frame.position.z + (((index * 29) % 31) - 15) * 0.58;
			const length = baseLength * (0.58 + ((index * 11) % 17) / 21);
			this.positions[offset] = x;
			this.positions[offset + 1] = y;
			this.positions[offset + 2] = z;
			this.positions[offset + 3] = x + directionX * length;
			this.positions[offset + 4] = y + directionY * length;
			this.positions[offset + 5] = z + directionZ * length;
		}
		(this.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
	}

	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		this.geometry.dispose();
		this.material.dispose();
	}
}
