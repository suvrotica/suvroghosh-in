import { describe, expect, it } from 'vitest';
import { CAMERA_VIEWS, DEFAULT_DESIGN, normalizeDesign, PRESETS } from './config';

describe('Durga Atelier normalisation boundary', () => {
	it('keeps every curated composition stable and independent', () => {
		expect(PRESETS).toHaveLength(6);
		expect(new Set(PRESETS.map(({ id }) => id)).size).toBe(6);
		for (const preset of PRESETS) {
			expect(normalizeDesign(preset.design)).toEqual(preset.design);
			expect(preset.design.camera).not.toBe(DEFAULT_DESIGN.camera);
		}
		expect(PRESETS.find(({ id }) => id === 'moonlit-silver')?.design).toMatchObject({
			material: 'painted-clay',
			sariColor: '#253b73',
			crown: 'silver'
		});
	});

	it('restores finite defaults, bounds sculptural ranges and rounds making stages', () => {
		const result = normalizeDesign({
			headTilt: 400,
			eyeScale: -2,
			faceWidth: Number.NaN,
			crownScale: Number.POSITIVE_INFINITY,
			ornamentDensity: 7,
			lightAngle: -500,
			lampIntensity: 2,
			exposure: -2,
			stage: 3.7,
			sariColor: '#AB12ef',
			borderColor: 'url(javascript:alert(1))',
			flowers: 'false'
		});
		expect(result).toMatchObject({
			headTilt: 8,
			eyeScale: 0.85,
			faceWidth: DEFAULT_DESIGN.faceWidth,
			crownScale: DEFAULT_DESIGN.crownScale,
			ornamentDensity: 1,
			lightAngle: -90,
			lampIntensity: 1,
			exposure: 0.6,
			stage: 4,
			sariColor: '#ab12ef',
			borderColor: DEFAULT_DESIGN.borderColor,
			flowers: DEFAULT_DESIGN.flowers
		});
	});

	it('ignores prototype properties, accessors and unknown enum strings', () => {
		let getterRead = false;
		const input = Object.create({ pose: 'open', material: 'brass' });
		Object.defineProperty(input, 'face', {
			get: () => {
				getterRead = true;
				return 'gentle';
			}
		});
		input.crown = 'constructor';
		input.presetId = '__proto__';
		input.faceWidth = 1.08;
		const result = normalizeDesign(input);
		expect(getterRead).toBe(false);
		expect(result).toMatchObject({
			pose: DEFAULT_DESIGN.pose,
			material: DEFAULT_DESIGN.material,
			face: DEFAULT_DESIGN.face,
			crown: DEFAULT_DESIGN.crown,
			presetId: DEFAULT_DESIGN.presetId,
			faceWidth: 1.08
		});
		expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
	});

	it('cleans Unicode seeds and bounds by Unicode characters', () => {
		const result = normalizeDesign({ seed: `\u0000 ${'দ'.repeat(90)}\u007f ` });
		expect(Array.from(result.seed)).toHaveLength(64);
		expect(result.seed).toBe('দ'.repeat(64));
		expect(normalizeDesign({ seed: '\n\u0000' }).seed).toBe(DEFAULT_DESIGN.seed);
	});

	it('keeps the camera finite, bounded and separated from its target', () => {
		expect(normalizeDesign({ camera: { position: [0, 0, 0], target: [0, 0, 0] } }).camera).toEqual(
			CAMERA_VIEWS.whole
		);
		expect(
			normalizeDesign({ camera: { position: [Infinity, 0, 0], target: 'bad' } }).camera
		).toEqual(CAMERA_VIEWS.whole);
		expect(
			normalizeDesign({ camera: { position: [99, 99, 99], target: [-99, -99, -99] } }).camera
		).toEqual({ position: [35, 35, 35], target: [-15, -15, -15] });
		const first = normalizeDesign(null);
		first.camera.position[0] = 20;
		expect(DEFAULT_DESIGN.camera.position[0]).toBe(0);
	});
});
