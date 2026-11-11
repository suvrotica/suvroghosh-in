import {
	BASE_TIME_STEP,
	DEFAULT_SETTINGS,
	END_TIME,
	LIMITS,
	PRESETS,
	normalizeSettings,
	positionRange,
	settingsRecord,
	timingRange,
	type Mesh,
	type Preset,
	type Settings
} from '../src/lib/visualizations/fingerprint/config.ts';
import {
	axisymmetricStepGain,
	creaseRidgeSpacing,
	surfaceEigenvalueBelow
} from '../src/lib/visualizations/fingerprint/diagnostics.ts';
import { surfaceRows } from '../src/lib/visualizations/fingerprint/geometry.ts';
import {
	equilibrium,
	FingerprintSolver,
	instability,
	reactionJacobian,
	type SolverOptions
} from '../src/lib/visualizations/fingerprint/solver.ts';

type CapturedField = { mesh: Mesh; field: Float32Array };

function summarize(solver: FingerprintSolver, field: Float32Array) {
	let min = Infinity;
	let max = -Infinity;
	let crests = 0;
	for (const value of field) {
		min = Math.min(min, value);
		max = Math.max(max, value);
		crests += Number(value > 12);
	}
	return {
		time: solver.time,
		min,
		max,
		fractionAbove12: crests / field.length,
		creaseRidgeSpacing: creaseRidgeSpacing(solver.mesh, field)
	};
}

function solve(
	settings: Settings,
	options: SolverOptions,
	sampleTimes: number[],
	captured?: CapturedField[]
) {
	const solver = new FingerprintSolver(settings, options);
	const samples = sampleTimes.map((time) => {
		solver.advance((time - solver.time) / solver.dt);
		const field = solver.frame();
		if (captured && time <= 600) captured.push({ mesh: solver.mesh, field });
		return summarize(solver, field);
	});
	return { settings: solver.settings, mesh: solver.mesh, dt: solver.dt, samples };
}

function fieldDifference(coarse: CapturedField, fine: CapturedField) {
	const a = coarse.mesh;
	const b = fine.mesh;
	const fineColumns = Array.from({ length: a.columns }, (_, col) => {
		const coordinate = ((col + 0.5) * b.columns) / a.columns - 0.5;
		return Math.min(b.columns - 1, Math.max(0, coordinate));
	});
	const geometry = surfaceRows(a);
	let squares = 0;
	let area = 0;
	for (let row = 0; row < a.rows; row++) {
		const centre = row + 0.5;
		const coordinate =
			row < a.capRows
				? (centre * b.capRows) / a.capRows - 0.5
				: b.capRows + ((centre - a.capRows) * (b.rows - b.capRows)) / (a.rows - a.capRows) - 0.5;
		const fineRow = Math.min(b.rows - 1, Math.max(0, coordinate));
		const top = Math.floor(fineRow);
		const bottom = Math.min(b.rows - 1, top + 1);
		const fy = fineRow - top;
		const weight = geometry[row].cellAreaPerRadian;
		for (let col = 0; col < a.columns; col++) {
			const fineCol = fineColumns[col];
			const left = Math.floor(fineCol);
			const right = Math.min(b.columns - 1, left + 1);
			const fx = fineCol - left;
			const upper =
				fine.field[top * b.columns + left] * (1 - fx) + fine.field[top * b.columns + right] * fx;
			const lower =
				fine.field[bottom * b.columns + left] * (1 - fx) +
				fine.field[bottom * b.columns + right] * fx;
			const interpolated = upper * (1 - fy) + lower * fy;
			squares += weight * (coarse.field[row * a.columns + col] - interpolated) ** 2;
			area += weight;
		}
	}
	return Math.sqrt(squares / area);
}

const times = [150, 300, 450, 600];
const fullTimes = [...times, END_TIME];
const base: CapturedField[] = [];
const baselines = (['arch', 'loop', 'whorl'] as const).map((preset) => {
	console.error(`Reference ${preset}`);
	return solve(PRESETS[preset], {}, fullTimes, preset === 'loop' ? base : undefined);
});

const cornerSettings: { name: string; settings: Settings }[] = [];
for (const preset of Object.keys(PRESETS) as Preset[]) {
	for (const side of ['min', 'max'] as const) {
		cornerSettings.push({
			name: `${preset} mixed ${side}`,
			settings: {
				...PRESETS[preset],
				spacing: LIMITS.spacing[side],
				width: LIMITS.width[side],
				timing: timingRange(preset)[side],
				position: positionRange(preset)[side],
				noise: LIMITS.noise[side]
			}
		});
	}
}
for (const control of ['spacing', 'position', 'timing', 'width', 'noise'] as const) {
	for (const side of ['min', 'max'] as const) {
		cornerSettings.push({
			name: `loop ${control} ${side}`,
			settings: normalizeSettings({ ...DEFAULT_SETTINGS, [control]: LIMITS[control][side] })
		});
	}
}

const endpoints = cornerSettings.map(({ name, settings }) => {
	console.error(name);
	return { name, ...solve(settings, {}, [END_TIME]) };
});
const configs = [
	{ options: { dt: BASE_TIME_STEP / 2 }, sampleTimes: fullTimes },
	{ options: { dt: BASE_TIME_STEP / 4 }, sampleTimes: times },
	{ options: { meshScale: 1.25 }, sampleTimes: fullTimes },
	{ options: { meshScale: 1.5 }, sampleTimes: times }
];
const captured = configs.map((): CapturedField[] => []);
const convergence = configs.map(({ options, sampleTimes }, i) => {
	console.error(`Refinement ${JSON.stringify(options)}`);
	return solve(DEFAULT_SETTINGS, options, sampleTimes, captured[i]);
});
const [mediumTime, fineTime, mediumMesh, fineMesh] = captured;
const refinementErrors = {
	measure: 'Surface-area-weighted activator RMSE, finer field sampled at coarse cell centres',
	timeSteps: [BASE_TIME_STEP, BASE_TIME_STEP / 2, BASE_TIME_STEP / 4],
	meshScales: [1, 1.25, 1.5],
	samples: times.map((time, i) => ({
		time,
		timeStepError: [
			fieldDifference(base[i], mediumTime[i]),
			fieldDifference(mediumTime[i], fineTime[i])
		],
		meshError: [
			fieldDifference(base[i], mediumMesh[i]),
			fieldDifference(mediumMesh[i], fineMesh[i])
		]
	}))
};
const noDiffusion = solve({ ...DEFAULT_SETTINGS, noise: 0 }, { noDiffusion: true }, [150]);
const mesh = baselines[1].mesh;
const modes = [0, 30, 70].map((m) => surfaceEigenvalueBelow(mesh, m, 0.12548));
const axisymmetricMode = modes[0]!;

console.log(
	JSON.stringify(
		{
			model: settingsRecord(DEFAULT_SETTINGS).model,
			reference: settingsRecord(DEFAULT_SETTINGS),
			linearized: {
				equilibrium: equilibrium(),
				jacobian: reactionJacobian(),
				continuum: instability(),
				neumannSurfaceModes: modes,
				stepGainUniform: axisymmetricStepGain(0),
				stepGainAxisymmetric: axisymmetricStepGain(axisymmetricMode.eigenvalue)
			},
			baselines,
			endpoints,
			convergence,
			refinementErrors,
			noDiffusion
		},
		null,
		2
	)
);
