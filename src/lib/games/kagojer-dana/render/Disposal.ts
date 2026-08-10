import * as THREE from 'three';

/** Explicit ownership for pooled Three.js resources. */
export class RenderResourceTracker {
	private readonly geometries = new Set<THREE.BufferGeometry>();
	private readonly materials = new Set<THREE.Material>();
	private readonly textures = new Set<THREE.Texture>();
	private readonly renderTargets = new Set<THREE.WebGLRenderTarget>();
	private disposed = false;

	geometry<T extends THREE.BufferGeometry>(geometry: T): T {
		if (!this.disposed) this.geometries.add(geometry);
		return geometry;
	}

	material<T extends THREE.Material>(material: T): T {
		if (!this.disposed) this.materials.add(material);
		return material;
	}

	texture<T extends THREE.Texture>(texture: T): T {
		if (!this.disposed) this.textures.add(texture);
		return texture;
	}

	renderTarget<T extends THREE.WebGLRenderTarget>(target: T): T {
		if (!this.disposed) this.renderTargets.add(target);
		return target;
	}

	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		for (const target of this.renderTargets) target.dispose();
		for (const texture of this.textures) texture.dispose();
		for (const material of this.materials) material.dispose();
		for (const geometry of this.geometries) geometry.dispose();
		this.renderTargets.clear();
		this.textures.clear();
		this.materials.clear();
		this.geometries.clear();
	}
}

/** Removes pooled objects without touching shared geometry or material ownership. */
export function clearObjectChildren(object: THREE.Object3D): void {
	while (object.children.length > 0) object.remove(object.children[object.children.length - 1]);
}
