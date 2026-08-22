import { describe, expect, it } from 'vitest';
import {
	createDefaultExplorerState,
	parseExplorerUrlState,
	serializeExplorerUrlState
} from './url-state';
import { cameraPresetState } from './landscape-renderer';

describe('versioned explorer URL state', () => {
	it('round-trips every durable field deterministically', () => {
		const state = createDefaultExplorerState('square-root');
		state.viewport = { centerRe: 1.25, centerIm: -2.5, spanRe: 7.5, spanIm: 4.25 };
		state.viewMode = 'sheets';
		state.height = {
			lens: 'imaginary',
			compression: 'asinh',
			verticalScale: 1.375,
			logCap: 9.25,
			componentScale: 0.125,
			componentCap: 6.5
		};
		state.camera = {
			orientation: 'front-imaginary',
			projection: 'perspective',
			azimuth: 0.75,
			elevation: -0.25,
			distance: 12.5,
			zoom: 1.75,
			targetX: 1,
			targetY: -2,
			targetZ: 3
		};
		state.overlays = {
			contours: false,
			grid: true,
			markers: false,
			mesh: true,
			lighting: false,
			caps: true
		};
		state.quality = 'high';
		state.sheetRange = 4;
		state.sheetRadialMin = 0.25;
		state.sheetRadialMax = 8;
		state.allSheets = false;
		state.loop = { center: { re: -0.5, im: 0.75 }, radius: 2.25 };

		const parameters = serializeExplorerUrlState(state);
		expect(parameters.get('dcv')).toBe('1');
		const restored = parseExplorerUrlState(parameters);
		expect(restored.warnings).toEqual([]);
		expect(restored.state).toEqual(state);
	});

	it('round-trips validated custom expressions instead of claiming a preset', () => {
		const state = createDefaultExplorerState();
		state.presetId = null;
		state.expression = '(z^3 - 1) / (z + 2)';

		const parameters = serializeExplorerUrlState(state);
		expect(parameters.has('dcp')).toBe(false);
		expect(parameters.get('dce')).toBe(state.expression);
		const restored = parseExplorerUrlState(parameters);
		expect(restored.state.presetId).toBeNull();
		expect(restored.state.expression).toBe(state.expression);
	});

	it('preserves unrelated query parameters while replacing owned state', () => {
		const base = new URLSearchParams('utm_source=archive&lang=en&dcp=reciprocal&dcv=999');
		const parameters = serializeExplorerUrlState(createDefaultExplorerState('identity'), base);

		expect(parameters.get('utm_source')).toBe('archive');
		expect(parameters.get('lang')).toBe('en');
		expect(parameters.getAll('dcp')).toEqual(['identity']);
		expect(parameters.getAll('dcv')).toEqual(['1']);
	});

	it('warns about an unknown version but conservatively restores supported fields', () => {
		const restored = parseExplorerUrlState('dcv=27&dcp=reciprocal&dcm=3d&dcq=low');
		expect(restored.warnings).toContain(
			'Unknown explorer URL version; supported values were read conservatively.'
		);
		expect(restored.state.presetId).toBe('reciprocal');
		expect(restored.state.viewMode).toBe('3d');
		expect(restored.state.quality).toBe('low');
	});
});

describe('hostile and malformed explorer URL state', () => {
	it('bounds numeric tuples and enums instead of accepting partial hostile state', () => {
		const defaults = createDefaultExplorerState();
		const restored = parseExplorerUrlState(
			'dcv=1&dcb=0,0,-4,Infinity&dcm=javascript&dcvs=1e99&dcco=0,99&dct=NaN,0,0&dcov=111&dcq=ultra&dcl=0,0,-1'
		);

		expect(restored.state.viewport).toEqual(defaults.viewport);
		expect(restored.state.viewMode).toBe(defaults.viewMode);
		expect(restored.state.height.verticalScale).toBe(defaults.height.verticalScale);
		expect(restored.state.camera.azimuth).toBe(defaults.camera.azimuth);
		expect(restored.state.camera.elevation).toBe(defaults.camera.elevation);
		expect(restored.state.camera.targetX).toBe(defaults.camera.targetX);
		expect(restored.state.overlays).toEqual(defaults.overlays);
		expect(restored.state.quality).toBe(defaults.quality);
		expect(restored.state.loop).toBeNull();
		expect(restored.warnings.length).toBeGreaterThanOrEqual(8);
	});

	it('uses each selected preset’s sheet default when dcas is absent or malformed', () => {
		for (const presetId of ['logarithm', 'square-root', 'cube-root']) {
			const defaults = createDefaultExplorerState(presetId);
			const absent = parseExplorerUrlState(`dcv=1&dcp=${presetId}`);
			expect(absent.state.allSheets).toBe(defaults.allSheets);
			expect(absent.warnings).toEqual([]);

			for (const raw of ['', '2', 'true']) {
				const malformed = parseExplorerUrlState(`dcv=1&dcp=${presetId}&dcas=${raw}`);
				expect(malformed.state.allSheets).toBe(defaults.allSheets);
				expect(malformed.warnings).toContain('Ignored invalid sheet-selection flag.');
			}
		}
	});

	it('accepts only explicit 0 or 1 sheet-selection flags', () => {
		expect(parseExplorerUrlState('dcv=1&dcp=logarithm&dcas=0').state.allSheets).toBe(false);
		expect(parseExplorerUrlState('dcv=1&dcp=logarithm&dcas=1').state.allSheets).toBe(true);
	});

	it('does not create a loop from empty, partial, or malformed dcl state', () => {
		for (const raw of ['', '0,0', '0,,1', '0,0,-1', 'NaN,0,1', '0,0,Infinity']) {
			const restored = parseExplorerUrlState(`dcv=1&dcl=${raw}`);
			expect(restored.state.loop).toBeNull();
			expect(restored.warnings).toContain('Ignored invalid loop geometry.');
		}

		expect(parseExplorerUrlState('dcv=1&dcl=-2.5,3.25,0.75').state.loop).toEqual({
			center: { re: -2.5, im: 3.25 },
			radius: 0.75
		});
	});

	it('falls back to identity when a shared expression fails AST validation', () => {
		const restored = parseExplorerUrlState('dcv=1&dcp=reciprocal&dce=window.alert(1)&dcm=3d');
		expect(restored.state.presetId).toBe('identity');
		expect(restored.state.expression).toBe('z');
		expect(restored.state.viewMode).toBe('3d');
		expect(restored.warnings).toContain(
			'The shared expression was invalid; restored the identity preset.'
		);
	});

	it('rejects incomplete or inverted radial ranges as one bounded pair', () => {
		const defaults = createDefaultExplorerState();
		for (const query of ['dcv=1&dcr=5', 'dcv=1&dcr=9,0.2']) {
			const restored = parseExplorerUrlState(query);
			expect(restored.state.sheetRadialMin).toBe(defaults.sheetRadialMin);
			expect(restored.state.sheetRadialMax).toBe(defaults.sheetRadialMax);
			expect(restored.warnings.some((warning) => /sheet radius|radial/i.test(warning))).toBe(true);
		}
	});

	it('refuses sheet labels for presets or custom expressions without constructed sheets', () => {
		for (const query of ['dcv=1&dcp=identity&dcm=sheets', 'dcv=1&dce=z%2B1&dcm=sheets']) {
			const restored = parseExplorerUrlState(query);
			expect(restored.state.viewMode).toBe('comparison');
			expect(restored.warnings.some((warning) => /sheet mode|sheet preset/i.test(warning))).toBe(
				true
			);
		}
	});

	it('ignores an overlong query wholesale', () => {
		const restored = parseExplorerUrlState(`dcv=1&dcp=reciprocal&junk=${'x'.repeat(2_100)}`);
		expect(restored.state).toEqual(createDefaultExplorerState());
		expect(restored.warnings).toEqual(['Explorer URL state was too long and was ignored.']);
	});
});

describe('named camera presets', () => {
	it('replaces free-motion angles with the canonical named orientation', () => {
		const free = {
			...createDefaultExplorerState().camera,
			azimuth: 1.234,
			elevation: -0.456,
			distance: 9,
			zoom: 1.75,
			targetX: 2,
			targetY: 3,
			targetZ: 4
		};
		const cases = [
			['isometric', -Math.PI / 4, Math.atan(1 / Math.sqrt(2))],
			['top', 0, Math.PI / 2],
			['front-real', 0, 0],
			['front-imaginary', Math.PI / 2, 0]
		] as const;

		for (const [orientation, azimuth, elevation] of cases) {
			const state = cameraPresetState(free, orientation);
			expect(state).toMatchObject({
				orientation,
				azimuth,
				elevation,
				distance: 9,
				zoom: 1.75,
				targetX: 2,
				targetY: 3,
				targetZ: 4
			});
		}
	});
});
