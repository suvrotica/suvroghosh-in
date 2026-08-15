import {
	RAY_MARCHING_DEBUG_VIEWS,
	RAY_MARCHING_PALETTES,
	type RayMarchingDebugView,
	type RayMarchingExperienceState,
	type RayMarchingPalette,
	type RayMarchingShareState
} from './types';
import {
	DEFAULT_RAY_MARCHING_CAMERA,
	DEFAULT_RAY_MARCHING_STATE,
	RAY_MARCHING_CAMERA_LIMITS,
	clampRayMarchingStage
} from './state';

export const RAY_MARCHING_SHARE_SCENE = 'cathedral';
export const RAY_MARCHING_CAMERA_SHARE_STEP = 0.05;
export const MAX_RAY_MARCHING_SHARE_QUERY_LENGTH = 1_024;

export type RayMarchingShareParseResult = Readonly<{
	state: RayMarchingShareState;
	issues: readonly string[];
}>;

function quantize(value: number, minimum: number, maximum: number): number {
	const clamped = Math.min(maximum, Math.max(minimum, value));
	return Number(
		(Math.round(clamped / RAY_MARCHING_CAMERA_SHARE_STEP) * RAY_MARCHING_CAMERA_SHARE_STEP).toFixed(
			2
		)
	);
}

export function quantizeRayMarchingCamera(
	yaw: number,
	pitch: number
): Readonly<{
	yaw: number;
	pitch: number;
}> {
	return Object.freeze({
		yaw: quantize(
			Number.isFinite(yaw) ? yaw : DEFAULT_RAY_MARCHING_CAMERA.yaw,
			RAY_MARCHING_CAMERA_LIMITS.yaw.min,
			RAY_MARCHING_CAMERA_LIMITS.yaw.max
		),
		pitch: quantize(
			Number.isFinite(pitch) ? pitch : DEFAULT_RAY_MARCHING_CAMERA.pitch,
			RAY_MARCHING_CAMERA_LIMITS.pitch.min,
			RAY_MARCHING_CAMERA_LIMITS.pitch.max
		)
	});
}

function defaultShareState(): RayMarchingShareState {
	return Object.freeze({
		scene: RAY_MARCHING_SHARE_SCENE,
		stage: DEFAULT_RAY_MARCHING_STATE.stage,
		debugView: DEFAULT_RAY_MARCHING_STATE.debugView,
		palette: DEFAULT_RAY_MARCHING_STATE.palette,
		yaw: DEFAULT_RAY_MARCHING_CAMERA.yaw,
		pitch: DEFAULT_RAY_MARCHING_CAMERA.pitch
	});
}

function parametersFromInput(input: string | URL | URLSearchParams): URLSearchParams | null {
	if (input instanceof URLSearchParams) return new URLSearchParams(input);
	if (input instanceof URL) return new URLSearchParams(input.search);
	if (input.length > MAX_RAY_MARCHING_SHARE_QUERY_LENGTH) return null;
	try {
		if (/^[a-z][a-z\d+.-]*:\/\//iu.test(input)) return new URL(input).searchParams;
		const query = input.startsWith('?')
			? input.slice(1)
			: (input.split('?')[1]?.split('#')[0] ?? input);
		return new URLSearchParams(query);
	} catch {
		return new URLSearchParams();
	}
}

function enumValue<T extends string>(
	value: string | null,
	values: readonly T[],
	fallback: T,
	key: string,
	issues: string[]
): T {
	if (value === null) return fallback;
	if ((values as readonly string[]).includes(value)) return value as T;
	issues.push(`${key} was not recognised and was reset.`);
	return fallback;
}

function boundedNumber(
	value: string | null,
	fallback: number,
	minimum: number,
	maximum: number,
	key: string,
	issues: string[]
): number {
	if (value === null) return fallback;
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) {
		issues.push(`${key} was not finite and was reset.`);
		return fallback;
	}
	if (parsed < minimum || parsed > maximum) issues.push(`${key} was clamped to its safe range.`);
	return Math.min(maximum, Math.max(minimum, parsed));
}

export function parseRayMarchingShareState(
	input: string | URL | URLSearchParams
): RayMarchingShareParseResult {
	const issues: string[] = [];
	const parameters = parametersFromInput(input);
	if (!parameters) {
		return Object.freeze({
			state: defaultShareState(),
			issues: Object.freeze(['The scene query was too long and was ignored.'])
		});
	}

	const requestedScene = parameters.get('scene');
	if (requestedScene !== null && requestedScene !== RAY_MARCHING_SHARE_SCENE) {
		issues.push('The requested scene was not recognised; Cathedral was restored.');
	}
	const rawStage = boundedNumber(
		parameters.get('stage'),
		DEFAULT_RAY_MARCHING_STATE.stage,
		1,
		8,
		'stage',
		issues
	);
	const rawYaw = boundedNumber(
		parameters.get('yaw'),
		DEFAULT_RAY_MARCHING_CAMERA.yaw,
		RAY_MARCHING_CAMERA_LIMITS.yaw.min,
		RAY_MARCHING_CAMERA_LIMITS.yaw.max,
		'yaw',
		issues
	);
	const rawPitch = boundedNumber(
		parameters.get('pitch'),
		DEFAULT_RAY_MARCHING_CAMERA.pitch,
		RAY_MARCHING_CAMERA_LIMITS.pitch.min,
		RAY_MARCHING_CAMERA_LIMITS.pitch.max,
		'pitch',
		issues
	);
	const camera = quantizeRayMarchingCamera(rawYaw, rawPitch);

	return Object.freeze({
		state: Object.freeze({
			scene: RAY_MARCHING_SHARE_SCENE,
			stage: clampRayMarchingStage(rawStage),
			debugView: enumValue<RayMarchingDebugView>(
				parameters.get('debug'),
				RAY_MARCHING_DEBUG_VIEWS,
				DEFAULT_RAY_MARCHING_STATE.debugView,
				'debug',
				issues
			),
			palette: enumValue<RayMarchingPalette>(
				parameters.get('palette'),
				RAY_MARCHING_PALETTES,
				DEFAULT_RAY_MARCHING_STATE.palette,
				'palette',
				issues
			),
			yaw: camera.yaw,
			pitch: camera.pitch
		}),
		issues: Object.freeze(issues)
	});
}

type ShareableState = RayMarchingShareState | RayMarchingExperienceState;

export function serializeRayMarchingShareState(state: ShareableState): URLSearchParams {
	const camera = 'camera' in state ? state.camera : state;
	const quantized = quantizeRayMarchingCamera(camera.yaw, camera.pitch);
	const parameters = new URLSearchParams();
	parameters.set('scene', RAY_MARCHING_SHARE_SCENE);
	parameters.set('stage', String(clampRayMarchingStage(state.stage)));
	parameters.set('debug', state.debugView);
	parameters.set('palette', state.palette);
	parameters.set('yaw', quantized.yaw.toFixed(2));
	parameters.set('pitch', quantized.pitch.toFixed(2));
	return parameters;
}

export function buildRayMarchingShareUrl(base: string | URL, state: ShareableState): string {
	const url = new URL(base.toString());
	url.search = serializeRayMarchingShareState(state).toString();
	url.hash = '';
	return url.toString();
}
