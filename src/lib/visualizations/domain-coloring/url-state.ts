import { parseExpression } from './expression';
import { DOMAIN_COLORING_PRESETS, domainColoringPreset } from './presets';
import type {
	CameraOrientation,
	CameraProjection,
	ExplorerState,
	HeightCompression,
	HeightLens,
	RenderQuality,
	ViewMode
} from './types';

const MAX_QUERY_LENGTH = 2_048;
const OWNED_KEYS = new Set([
	'dcv',
	'dcp',
	'dce',
	'dcb',
	'dcm',
	'dch',
	'dcc',
	'dcvs',
	'dclc',
	'dcsy',
	'dcca',
	'dccm',
	'dcpr',
	'dcco',
	'dcd',
	'dcz',
	'dct',
	'dcov',
	'dcq',
	'dcsr',
	'dcr',
	'dcas',
	'dcl'
]);

const VIEW_MODES = new Set<ViewMode>(['2d', '3d', 'comparison', 'sheets']);
const HEIGHT_LENSES = new Set<HeightLens>(['log-magnitude', 'real', 'imaginary', 'phase', 'flat']);
const COMPRESSIONS = new Set<HeightCompression>(['linear', 'asinh']);
const ORIENTATIONS = new Set<CameraOrientation>([
	'isometric',
	'top',
	'front-real',
	'front-imaginary'
]);
const PROJECTIONS = new Set<CameraProjection>(['orthographic', 'perspective']);
const QUALITIES = new Set<RenderQuality>(['low', 'medium', 'high']);

function rounded(value: number) {
	return Number(value.toFixed(6)).toString();
}

function bounded(
	raw: string | null,
	fallback: number,
	minimum: number,
	maximum: number,
	warnings: string[],
	label: string
) {
	if (raw === null) return fallback;
	const value = Number(raw);
	if (!Number.isFinite(value) || value < minimum || value > maximum) {
		warnings.push(`Ignored invalid ${label}.`);
		return fallback;
	}
	return value;
}

function boundedTuple(
	raw: string | null,
	fallback: readonly number[],
	bounds: readonly [number, number][],
	warnings: string[],
	label: string
) {
	if (!raw) return [...fallback];
	const values = raw.split(',').map(Number);
	if (
		values.length !== fallback.length ||
		values.some(
			(value, index) =>
				!Number.isFinite(value) || value < bounds[index][0] || value > bounds[index][1]
		)
	) {
		warnings.push(`Ignored invalid ${label}.`);
		return [...fallback];
	}
	return values;
}

function enumValue<T extends string>(
	raw: string | null,
	allowed: Set<T>,
	fallback: T,
	warnings: string[],
	label: string
) {
	if (raw === null) return fallback;
	if (allowed.has(raw as T)) return raw as T;
	warnings.push(`Ignored unsupported ${label}.`);
	return fallback;
}

function binaryFlag(raw: string | null, fallback: boolean, warnings: string[], label: string) {
	if (raw === null) return fallback;
	if (raw === '0') return false;
	if (raw === '1') return true;
	warnings.push(`Ignored invalid ${label}.`);
	return fallback;
}

function optionalLoop(raw: string | null, warnings: string[]) {
	if (raw === null) return null;
	const parts = raw.split(',');
	const values = parts.map(Number);
	if (
		parts.length !== 3 ||
		parts.some((part) => part.trim() === '') ||
		values.some((value) => !Number.isFinite(value)) ||
		values[0] < -1e6 ||
		values[0] > 1e6 ||
		values[1] < -1e6 ||
		values[1] > 1e6 ||
		values[2] < 1e-5 ||
		values[2] > 1e6
	) {
		warnings.push('Ignored invalid loop geometry.');
		return null;
	}
	return { center: { re: values[0], im: values[1] }, radius: values[2] };
}

export function createDefaultExplorerState(presetId = 'identity'): ExplorerState {
	const preset = domainColoringPreset(presetId) ?? DOMAIN_COLORING_PRESETS[0];
	return {
		version: 1,
		presetId: preset.id,
		expression: preset.expression,
		viewport: { ...preset.view },
		viewMode: 'comparison',
		height: { ...preset.height },
		camera: { ...preset.camera },
		overlays: { ...preset.overlays },
		quality: preset.quality,
		sheetRange: 2,
		sheetRadialMin: 0.12,
		sheetRadialMax: 3.5,
		allSheets: preset.sheets?.defaultAllSheets ?? true,
		loop: null
	};
}

export type ParsedExplorerState = {
	state: ExplorerState;
	warnings: readonly string[];
};

export function parseExplorerUrlState(source: string | URLSearchParams): ParsedExplorerState {
	const warnings: string[] = [];
	const raw = typeof source === 'string' ? source.replace(/^\?/, '') : source.toString();
	if (raw.length > MAX_QUERY_LENGTH) {
		return {
			state: createDefaultExplorerState(),
			warnings: ['Explorer URL state was too long and was ignored.']
		};
	}
	const parameters = new URLSearchParams(raw);
	if (parameters.has('dcv') && parameters.get('dcv') !== '1') {
		warnings.push('Unknown explorer URL version; supported values were read conservatively.');
	}
	const requestedPreset = parameters.get('dcp');
	const preset = requestedPreset ? domainColoringPreset(requestedPreset) : undefined;
	if (requestedPreset && !preset) warnings.push('Unknown preset; restored the identity preset.');
	let defaults = createDefaultExplorerState(preset?.id ?? 'identity');
	const customExpression = parameters.get('dce');
	let expression = preset?.expression ?? defaults.expression;
	let presetId: string | null = preset?.id ?? defaults.presetId;
	if (customExpression !== null) {
		try {
			parseExpression(customExpression);
			expression = customExpression;
			presetId = null;
		} catch {
			warnings.push('The shared expression was invalid; restored the identity preset.');
			defaults = createDefaultExplorerState('identity');
			expression = defaults.expression;
			presetId = defaults.presetId;
		}
	}

	const domain = boundedTuple(
		parameters.get('dcb'),
		[
			defaults.viewport.centerRe,
			defaults.viewport.centerIm,
			defaults.viewport.spanRe,
			defaults.viewport.spanIm
		],
		[
			[-1e6, 1e6],
			[-1e6, 1e6],
			[1e-5, 1e6],
			[1e-5, 1e6]
		],
		warnings,
		'domain bounds'
	);
	const cameraAngles = boundedTuple(
		parameters.get('dcco'),
		[defaults.camera.azimuth, defaults.camera.elevation],
		[
			[-Math.PI * 4, Math.PI * 4],
			[-Math.PI / 2, Math.PI / 2]
		],
		warnings,
		'camera angles'
	);
	const cameraTarget = boundedTuple(
		parameters.get('dct'),
		[defaults.camera.targetX, defaults.camera.targetY, defaults.camera.targetZ],
		[
			[-1e4, 1e4],
			[-1e4, 1e4],
			[-1e4, 1e4]
		],
		warnings,
		'camera target'
	);
	const overlayBits = parameters.get('dcov');
	const overlays =
		overlayBits && /^[01]{6}$/.test(overlayBits)
			? {
					contours: overlayBits[0] === '1',
					grid: overlayBits[1] === '1',
					markers: overlayBits[2] === '1',
					mesh: overlayBits[3] === '1',
					lighting: overlayBits[4] === '1',
					caps: overlayBits[5] === '1'
				}
			: { ...defaults.overlays };
	if (overlayBits && !/^[01]{6}$/.test(overlayBits)) warnings.push('Ignored invalid overlays.');
	const loop = optionalLoop(parameters.get('dcl'), warnings);
	let sheetRadii = boundedTuple(
		parameters.get('dcr'),
		[defaults.sheetRadialMin, defaults.sheetRadialMax],
		[
			[0.01, 10],
			[0.1, 100]
		],
		warnings,
		'sheet radial range'
	);
	if (sheetRadii[0] >= sheetRadii[1]) {
		warnings.push('Ignored inverted sheet radial range.');
		sheetRadii = [defaults.sheetRadialMin, defaults.sheetRadialMax];
	}
	let viewMode = enumValue(
		parameters.get('dcm'),
		VIEW_MODES,
		defaults.viewMode,
		warnings,
		'view mode'
	);
	const restoredPreset = presetId ? domainColoringPreset(presetId) : undefined;
	if (viewMode === 'sheets' && !restoredPreset?.sheets) {
		warnings.push(
			'Riemann-sheet mode is available only for curated sheet presets; restored comparison view.'
		);
		viewMode = 'comparison';
	}

	return {
		warnings,
		state: {
			version: 1,
			presetId,
			expression,
			viewport: {
				centerRe: domain[0],
				centerIm: domain[1],
				spanRe: domain[2],
				spanIm: domain[3]
			},
			viewMode,
			height: {
				lens: enumValue(
					parameters.get('dch'),
					HEIGHT_LENSES,
					defaults.height.lens,
					warnings,
					'height lens'
				),
				compression: enumValue(
					parameters.get('dcc'),
					COMPRESSIONS,
					defaults.height.compression,
					warnings,
					'height compression'
				),
				verticalScale: bounded(
					parameters.get('dcvs'),
					defaults.height.verticalScale,
					0.05,
					8,
					warnings,
					'vertical scale'
				),
				logCap: bounded(
					parameters.get('dclc'),
					defaults.height.logCap,
					0.5,
					24,
					warnings,
					'log cap'
				),
				componentScale: bounded(
					parameters.get('dcsy'),
					defaults.height.componentScale,
					1e-4,
					1e4,
					warnings,
					'component scale'
				),
				componentCap: bounded(
					parameters.get('dcca'),
					defaults.height.componentCap,
					0.5,
					24,
					warnings,
					'component cap'
				)
			},
			camera: {
				orientation: enumValue(
					parameters.get('dccm'),
					ORIENTATIONS,
					defaults.camera.orientation,
					warnings,
					'camera orientation'
				),
				projection: enumValue(
					parameters.get('dcpr'),
					PROJECTIONS,
					defaults.camera.projection,
					warnings,
					'camera projection'
				),
				azimuth: cameraAngles[0],
				elevation: cameraAngles[1],
				distance: bounded(
					parameters.get('dcd'),
					defaults.camera.distance,
					0.5,
					100,
					warnings,
					'camera distance'
				),
				zoom: bounded(
					parameters.get('dcz'),
					defaults.camera.zoom,
					0.1,
					12,
					warnings,
					'camera zoom'
				),
				targetX: cameraTarget[0],
				targetY: cameraTarget[1],
				targetZ: cameraTarget[2]
			},
			overlays,
			quality: enumValue(parameters.get('dcq'), QUALITIES, defaults.quality, warnings, 'quality'),
			sheetRange: Math.round(
				bounded(parameters.get('dcsr'), defaults.sheetRange, 1, 5, warnings, 'sheet range')
			),
			sheetRadialMin: sheetRadii[0],
			sheetRadialMax: sheetRadii[1],
			allSheets: binaryFlag(
				parameters.get('dcas'),
				defaults.allSheets,
				warnings,
				'sheet-selection flag'
			),
			loop
		}
	};
}

export function serializeExplorerUrlState(
	state: ExplorerState,
	base: URLSearchParams = new URLSearchParams()
) {
	const parameters = new URLSearchParams(base);
	for (const key of OWNED_KEYS) parameters.delete(key);
	parameters.set('dcv', '1');
	if (state.presetId) parameters.set('dcp', state.presetId);
	else parameters.set('dce', state.expression.slice(0, 180));
	parameters.set(
		'dcb',
		[state.viewport.centerRe, state.viewport.centerIm, state.viewport.spanRe, state.viewport.spanIm]
			.map(rounded)
			.join(',')
	);
	parameters.set('dcm', state.viewMode);
	parameters.set('dch', state.height.lens);
	parameters.set('dcc', state.height.compression);
	parameters.set('dcvs', rounded(state.height.verticalScale));
	parameters.set('dclc', rounded(state.height.logCap));
	parameters.set('dcsy', rounded(state.height.componentScale));
	parameters.set('dcca', rounded(state.height.componentCap));
	parameters.set('dccm', state.camera.orientation);
	parameters.set('dcpr', state.camera.projection);
	parameters.set('dcco', [state.camera.azimuth, state.camera.elevation].map(rounded).join(','));
	parameters.set('dcd', rounded(state.camera.distance));
	parameters.set('dcz', rounded(state.camera.zoom));
	parameters.set(
		'dct',
		[state.camera.targetX, state.camera.targetY, state.camera.targetZ].map(rounded).join(',')
	);
	parameters.set(
		'dcov',
		[
			state.overlays.contours,
			state.overlays.grid,
			state.overlays.markers,
			state.overlays.mesh,
			state.overlays.lighting,
			state.overlays.caps
		]
			.map((value) => (value ? '1' : '0'))
			.join('')
	);
	parameters.set('dcq', state.quality);
	parameters.set('dcsr', String(state.sheetRange));
	parameters.set('dcr', [state.sheetRadialMin, state.sheetRadialMax].map(rounded).join(','));
	parameters.set('dcas', state.allSheets ? '1' : '0');
	if (state.loop) {
		parameters.set(
			'dcl',
			[state.loop.center.re, state.loop.center.im, state.loop.radius].map(rounded).join(',')
		);
	}
	return parameters;
}
