import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { CharcoalPipeline } from './CharcoalPipeline';

function rendererHarness() {
	let target: THREE.WebGLRenderTarget | null = null;
	const renderer = {
		autoClear: false,
		info: { render: { calls: 1, triangles: 2 } },
		getRenderTarget: () => target,
		setRenderTarget: (next: THREE.WebGLRenderTarget | null) => {
			target = next;
		},
		clear: vi.fn(),
		render: vi.fn()
	};
	return { renderer, webgl: renderer as unknown as THREE.WebGLRenderer };
}

describe('charcoal render passes', () => {
	it('restores full requested resolution after lowering and raising quality', () => {
		const pipeline = new CharcoalPipeline('high');
		const { renderer, webgl } = rendererHarness();
		const widths: number[] = [];
		renderer.render.mockImplementation(() => {
			const target = renderer.getRenderTarget();
			if (target) widths.push(target.width);
		});
		pipeline.resize(800, 600, 2);
		pipeline.setQuality('battery');
		pipeline.setQuality('high');
		pipeline.render(webgl, new THREE.Scene(), new THREE.PerspectiveCamera());
		expect(widths).toEqual([1200, 1200]);
		pipeline.dispose();
	});

	it('restores the caller target, override and auto-clear if the normal pass fails', () => {
		const pipeline = new CharcoalPipeline();
		const { renderer, webgl } = rendererHarness();
		const target = new THREE.WebGLRenderTarget(20, 20);
		const scene = new THREE.Scene();
		const override = new THREE.MeshBasicMaterial();
		scene.overrideMaterial = override;
		renderer.setRenderTarget(target);
		renderer.render
			.mockImplementationOnce(() => {})
			.mockImplementationOnce(() => {
				throw new Error('context lost');
			});
		expect(() => pipeline.render(webgl, scene, new THREE.PerspectiveCamera())).toThrow(
			'context lost'
		);
		expect(renderer.getRenderTarget()).toBe(target);
		expect(scene.overrideMaterial).toBe(override);
		expect(renderer.autoClear).toBe(false);
		pipeline.dispose();
		override.dispose();
		target.dispose();
	});

	it('bypasses extra passes in battery quality', () => {
		const pipeline = new CharcoalPipeline('battery');
		const { renderer, webgl } = rendererHarness();
		const scene = new THREE.Scene();
		const camera = new THREE.PerspectiveCamera();
		pipeline.render(webgl, scene, camera);
		expect(renderer.render).toHaveBeenCalledExactlyOnceWith(scene, camera);
		expect(renderer.clear).not.toHaveBeenCalled();
		pipeline.dispose();
	});
});
