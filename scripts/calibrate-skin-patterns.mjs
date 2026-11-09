// Run with Node 24. This is a numerical calibration, separate from publication asset generation.
import assert from 'node:assert/strict';
import {
	createReferenceConfig,
	createSkinConfig,
	DEFAULT_SETTINGS,
	fitReference,
	GRID_SPACING,
	SHAPE_PRESETS,
	solveSkin,
	TIMESTEP
} from '../src/lib/visualizations/a-skin-that-paints-itself/model.ts';

function crossingColumns(fields, { nx, ny, mask }, from = 0, to = nx) {
	let columns = 0;
	for (let x = from; x < to; x++) {
		let positive = false;
		let negative = false;
		for (let y = 0; y < ny; y++) {
			const index = y * nx + x;
			if (!mask[index]) continue;
			positive ||= fields.u[index] >= 0;
			negative ||= fields.u[index] < 0;
		}
		if (positive !== negative) columns++;
	}
	return { columns, total: to - from };
}

function comparison(formed, fitted) {
	const domain = formed.domain;
	let active = 0;
	let different = 0;
	for (let i = 0; i < domain.mask.length; i++) {
		if (!domain.mask[i]) continue;
		active++;
		different += formed.u[i] >= 0 !== fitted.u[i] >= 0 ? 1 : 0;
	}
	return {
		formed: crossingColumns(formed, domain),
		fitted: crossingColumns(fitted, domain),
		formedNarrowEnd: crossingColumns(formed, domain, (domain.nx * 3) / 4),
		fittedNarrowEnd: crossingColumns(fitted, domain, (domain.nx * 3) / 4),
		minimumRows: Math.round(Math.min(...domain.columnWidths) / domain.gridSpacing),
		differentSignFraction: different / active
	};
}

function errorAtCoarseCentres(coarse, fine) {
	const { nx, ny, mask } = coarse.domain;
	const ratio = Math.round(coarse.domain.gridSpacing / fine.domain.gridSpacing);
	const fineNx = fine.domain.nx;
	let count = 0;
	let squaredU = 0;
	let squaredV = 0;
	for (let y = 0; y < ny; y++) {
		for (let x = 0; x < nx; x++) {
			const i = y * nx + x;
			if (!mask[i]) continue;
			let averageU = 0;
			let averageV = 0;
			let samples = 0;
			for (let dy = 0; dy < ratio; dy++) {
				for (let dx = 0; dx < ratio; dx++) {
					const j = (y * ratio + dy) * fineNx + x * ratio + dx;
					if (!fine.domain.mask[j]) continue;
					averageU += fine.u[j];
					averageV += fine.v[j];
					samples++;
				}
			}
			// Restrict only fully overlapping cells for the stepped taper.
			if (samples !== ratio ** 2) continue;
			count++;
			squaredU += (coarse.u[i] - averageU / samples) ** 2;
			squaredV += (coarse.v[i] - averageV / samples) ** 2;
		}
	}
	return { count, rmsU: Math.sqrt(squaredU / count), rmsV: Math.sqrt(squaredV / count) };
}

const resolutions = {
	coarse: {},
	halfTimestep: { timestep: TIMESTEP / 2 },
	fine: { gridSpacing: GRID_SPACING / 2, timestep: TIMESTEP / 4 }
};
const baseline = {};
const results = {};
for (const [name, resolution] of Object.entries(resolutions)) {
	const reference = solveSkin(
		createReferenceConfig(createSkinConfig(DEFAULT_SETTINGS, resolution))
	);
	results[name] = {};
	for (const shape of ['narrow', 'tapered']) {
		const formed = solveSkin(
			createSkinConfig({ ...DEFAULT_SETTINGS, ...SHAPE_PRESETS[shape] }, resolution)
		);
		const data = comparison(formed, fitReference(reference, formed.domain));
		if (name === 'coarse') baseline[shape] = formed;
		const error = errorAtCoarseCentres(baseline[shape], formed);
		if (name === 'halfTimestep') {
			assert.ok(error.rmsU < 0.005 && error.rmsV < 0.005, `${shape}: timestep sensitivity`);
		}
		results[name][shape] = { ...data, ...error };
	}
}

// Independently fixed integers, chosen before inspecting these runs.
results.otherSeeds = [17, 83, 221].map((seed) => {
	const config = createSkinConfig({ ...DEFAULT_SETTINGS, seed });
	const reference = solveSkin(createReferenceConfig(config));
	const formed = solveSkin(config);
	return { seed, ...comparison(formed, fitReference(reference, formed.domain)) };
});

console.log(JSON.stringify(results, null, 2));
