import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { createServer } from 'vite';

const vite = await createServer({
	appType: 'custom',
	logLevel: 'error',
	server: { middlewareMode: true }
});
try {
	const bz = await vite.ssrLoadModule('/src/lib/visualizations/bz/index.ts');
	const initialCondition =
		process.argv.find((value) => value.startsWith('--seed='))?.slice(7) ?? 'phase-quadrants';
	const gridSize = Number(
		process.argv.find((value) => value.startsWith('--grid='))?.slice(7) ?? 96
	);
	const domainSize = Number(
		process.argv.find((value) => value.startsWith('--domain='))?.slice(9) ?? 20
	);
	const epsilon = Number(
		process.argv.find((value) => value.startsWith('--epsilon='))?.slice(10) ?? 0.02
	);
	const q = Number(process.argv.find((value) => value.startsWith('--q='))?.slice(4) ?? 0.002);
	const f = Number(process.argv.find((value) => value.startsWith('--f='))?.slice(4) ?? 1.4);
	const cutTime = Number(
		process.argv.find((value) => value.startsWith('--cut-time='))?.slice(11) ?? 0.45
	);
	const sourcePeriod = Number(
		process.argv.find((value) => value.startsWith('--source-period='))?.slice(16) ?? 1.5
	);
	const sourceRadius = Number(
		process.argv.find((value) => value.startsWith('--source-radius='))?.slice(16) ?? 0.05
	);
	const sourceAmount = Number(
		process.argv.find((value) => value.startsWith('--source-amount='))?.slice(16) ?? 0.9
	);
	const preparedCut = initialCondition === 'cut-after-plane-wave';
	const setup = {
		...bz.DEFAULT_OREGONATOR_SETUP,
		parameters: { epsilon, q, f },
		gridSize,
		domainSize,
		activeRadius: domainSize * 0.46,
		timestep: 0.0005,
		initialCondition: preparedCut ? 'plane-wave' : initialCondition,
		seed: `bz-v2-debug-${initialCondition}`
	};
	const equilibrium = bz.oregonatorRecoveredEquilibrium(setup.parameters);
	const interventions = preparedCut
		? [
				{
					schemaVersion: bz.BZ_SCHEMA_VERSION,
					sequence: 0,
					step: Math.round(cutTime / setup.timestep),
					kind: 'cut',
					from: [0, 0.75],
					to: [1, 0.75],
					width: 0.25,
					targetU: equilibrium.u,
					targetV: equilibrium.v,
					strength: 1
				}
			]
		: initialCondition === 'periodic-source'
			? [
					{
						schemaVersion: bz.BZ_SCHEMA_VERSION,
						sequence: 0,
						step: 0,
						kind: 'pacemaker',
						center: [0.5, 0.5],
						radius: sourceRadius,
						amount: sourceAmount,
						sourceMode: 'state-reset',
						targetU: 0.8,
						targetV: equilibrium.v * 0.75,
						strength: 1,
						periodSteps: Math.round(sourcePeriod / setup.timestep),
						endStep: Math.round(12 / setup.timestep)
					}
				]
			: [];
	const solver = new bz.BZFastCpuSolver(setup, { interventions });
	const outputDirectory = path.join(process.cwd(), 'artifacts', 'bz-v2-search', 'frames');
	await mkdir(outputDirectory, { recursive: true });
	for (const modelTime of [0, 0.1, 0.25, 0.5, 1, 2, 4, 6, 8, 10, 12, 14]) {
		const targetStep = Math.round(modelTime / setup.timestep);
		solver.step(targetStep - solver.stepIndex);
		for (const [view, palette] of [
			['dish', 'ferroin'],
			['dish', 'phase-spectrum'],
			['u', 'scientific'],
			['v', 'scientific']
		]) {
			const pixels = bz.renderBZPixelBuffer(solver.state, setup, {
				view,
				palette,
				width: 768,
				height: 768
			});
			await sharp(Buffer.from(pixels.data.buffer), {
				raw: { width: pixels.width, height: pixels.height, channels: 4 }
			})
				.png()
				.toFile(
					path.join(
						outputDirectory,
						`${initialCondition}-t${String(modelTime).replace('.', '_')}-${view}-${palette}.png`
					)
				);
		}
	}
	console.log(
		`Wrote ${path.relative(process.cwd(), outputDirectory)} debug frames from the real Float64 field.`
	);
} finally {
	await vite.close();
}
