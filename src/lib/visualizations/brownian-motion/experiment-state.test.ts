import { describe, expect, it } from 'vitest';
import {
	BROWNIAN_EXPERIMENT_URL_VERSION,
	decodeBrownianExperimentUrl,
	encodeBrownianExperimentUrl,
	removeBrownianExperimentParameters
} from './experiment-state';

describe('Brownian experiment URL state', () => {
	it('round-trips supported reproducibility state while preserving unrelated query parameters', () => {
		const encoded = encodeBrownianExperimentUrl('https://example.test/article?theme=dark', {
			version: BROWNIAN_EXPERIMENT_URL_VERSION,
			processId: 'anisotropic-diffusion',
			seed: 'rotated-layers-42',
			timestep: 1 / 240,
			particleCount: 1200,
			parameters: { majorDiffusion: 1.2, minorDiffusion: 0.18, angle: 0.61 },
			boundaryMode: 'periodic',
			diagnostic: 'msd',
			preset: 'rotated-layers',
			camera: { centreX: 1.25, centreY: -0.5, zoom: 2.4, autoFit: false }
		});
		const decoded = decodeBrownianExperimentUrl(encoded);
		expect(encoded.searchParams.get('theme')).toBe('dark');
		expect(decoded).toMatchObject({
			processId: 'anisotropic-diffusion',
			seed: 'rotated-layers-42',
			particleCount: 1200,
			boundaryMode: 'periodic',
			diagnostic: 'msd',
			preset: 'rotated-layers',
			camera: { centreX: 1.25, centreY: -0.5, zoom: 2.4, autoFit: false },
			parameters: { majorDiffusion: 1.2, minorDiffusion: 0.18, angle: 0.61 }
		});
		expect(decoded?.timestep).toBeCloseTo(1 / 240, 6);
	});

	it('round-trips a moved-trap initial condition independently of model parameters', () => {
		const encoded = encodeBrownianExperimentUrl('https://example.test/article', {
			version: BROWNIAN_EXPERIMENT_URL_VERSION,
			processId: 'ornstein-uhlenbeck',
			seed: 'moved-trap',
			timestep: 0.005,
			particleCount: 800,
			parameters: {
				restoringRate: 1.2,
				diffusion: 0.55,
				equilibriumX: 3,
				equilibriumY: -1.5
			},
			initialCondition: { x: -2.75, y: 1.125, spread: 0.18 },
			boundaryMode: 'unbounded',
			diagnostic: 'distribution',
			camera: { centreX: 0, centreY: 0, zoom: 1, autoFit: true }
		});

		expect(encoded.searchParams.get('bm_v')).toBe('2');
		expect(encoded.searchParams.get('bm_init')).toBe('-2.75,1.125,0.18');
		expect(decodeBrownianExperimentUrl(encoded)?.initialCondition).toEqual({
			x: -2.75,
			y: 1.125,
			spread: 0.18
		});
	});

	it('round-trips compact obstacle arrays and exact non-default boundary bounds', () => {
		const obstacles = [
			{ x: -1.2, y: 0.25, radius: 0.65 },
			{ x: 2.125, y: -1.75, radius: 0.4 },
			{ x: 0, y: 2.5, radius: 0.875 }
		];
		const encoded = encodeBrownianExperimentUrl('https://example.test/article', {
			version: BROWNIAN_EXPERIMENT_URL_VERSION,
			processId: 'potential-diffusion',
			seed: 'obstacle-course',
			timestep: 0.0025,
			particleCount: 2400,
			parameters: {
				landscape: 'harmonic',
				mobility: 0.8,
				thermalEnergy: 0.8,
				centerX: 0,
				centerY: 0,
				stiffness: 0,
				transverseStiffness: 0,
				barrierHeight: 0,
				wellSeparation: 2,
				period: 2.5,
				tilt: 0,
				obstacles
			},
			initialCondition: { x: 0, y: -2, spread: 0.15 },
			boundaryMode: 'reflecting',
			boundaryBounds: { minX: -8.5, maxX: 9.25, minY: -5.75, maxY: 6.125 },
			diagnostic: 'trajectory',
			camera: { centreX: 0, centreY: 0, zoom: 1, autoFit: true }
		});
		const decoded = decodeBrownianExperimentUrl(encoded);

		expect(encoded.searchParams.get('bm_obs')).toBe('-1.2,0.25,0.65;2.125,-1.75,0.4;0,2.5,0.875');
		expect(decoded?.boundaryMode).toBe('reflecting');
		expect(decoded?.boundaryBounds).toEqual({
			minX: -8.5,
			maxX: 9.25,
			minY: -5.75,
			maxY: 6.125
		});
		expect(decoded?.parameters.obstacles).toEqual(obstacles);
	});

	it('round-trips edited physical values with an explicit flag and no preset', () => {
		const encoded = encodeBrownianExperimentUrl('https://example.test/article', {
			version: BROWNIAN_EXPERIMENT_URL_VERSION,
			processId: 'free-brownian',
			seed: 'warm-water-bead',
			timestep: 0.001,
			particleCount: 1000,
			parameters: { diffusion: 0.73 },
			initialCondition: { x: 0, y: 0, spread: 0 },
			boundaryMode: 'unbounded',
			diagnostic: 'msd',
			physicalUnits: true,
			physicalValues: {
				temperatureKelvin: 311.65,
				viscosityPas: 0.00137,
				radiusMetres: 0.82e-6
			},
			camera: { centreX: 0, centreY: 0, zoom: 1, autoFit: true }
		});
		const decoded = decodeBrownianExperimentUrl(encoded);

		expect(encoded.searchParams.get('bm_physical')).toBe('1');
		expect(encoded.searchParams.get('bm_preset')).toBeNull();
		expect(decoded?.physicalUnits).toBe(true);
		expect(decoded?.physicalValues).toEqual({
			temperatureKelvin: 311.65,
			viscosityPas: 0.00137,
			radiusMetres: 0.82e-6
		});
		expect(decoded?.parameters).toMatchObject({
			diffusion: 0.73,
			temperatureKelvin: 311.65,
			viscosityPas: 0.00137,
			radiusMetres: 0.82e-6
		});
	});

	it('round-trips the finite first-passage observation horizon', () => {
		const encoded = encodeBrownianExperimentUrl('https://example.test/article', {
			version: BROWNIAN_EXPERIMENT_URL_VERSION,
			processId: 'first-passage',
			seed: 'arrival-window',
			timestep: 0.005,
			particleCount: 2400,
			observationHorizon: 12.5,
			parameters: { diffusion: 0.8, startDistance: 2, bridgeCorrection: true },
			boundaryMode: 'unbounded',
			diagnostic: 'distribution',
			camera: { centreX: 0, centreY: 0, zoom: 1, autoFit: true }
		});

		expect(encoded.searchParams.get('bm_horizon')).toBe('12.5');
		expect(decodeBrownianExperimentUrl(encoded)?.observationHorizon).toBe(12.5);
	});

	it('clamps unsafe values and falls back from invalid selections without producing NaNs', () => {
		const decoded = decodeBrownianExperimentUrl(
			'https://example.test/?bm_v=1&bm_mode=fractional-brownian&bm_seed=x&bm_dt=NaN&bm_n=999999&bm_boundary=void&bm_diag=nope&bm_p_hurst=7&bm_p_scale=NaN&bm_cam=Infinity,-999,0,0'
		);
		expect(decoded).not.toBeNull();
		expect(decoded?.particleCount).toBe(256);
		expect(decoded?.timestep).toBeCloseTo(1 / 120);
		expect(decoded?.boundaryMode).toBe('unbounded');
		expect(decoded?.diagnostic).toBe('trajectory');
		expect(decoded?.camera).toEqual({ centreX: 0, centreY: -100, zoom: 0.25, autoFit: false });
		expect(decoded?.parameters.hurst).toBe(0.95);
		expect(decoded?.parameters.trajectories).toBe(256);
	});

	it('validates and clamps malformed v2 spatial, obstacle, and physical tuples', () => {
		const decoded = decodeBrownianExperimentUrl(
			'https://example.test/?bm_v=2&bm_mode=potential-diffusion&bm_boundary=periodic&bm_bounds=9,-9,4,-4&bm_init=Infinity,-5000,-2&bm_obs=NaN,0,1;5000,-5000,-3;1,2,Infinity&bm_physical=1&bm_phys=999,0,NaN'
		);

		expect(decoded).not.toBeNull();
		expect(decoded?.initialCondition).toEqual({ x: 0, y: -1000, spread: 0 });
		expect(decoded?.boundaryBounds).toEqual({ minX: -6, maxX: 6, minY: -4, maxY: 4 });
		expect(decoded?.parameters.obstacles).toEqual([{ x: 1000, y: -1000, radius: 0.0001 }]);
		expect(decoded?.physicalUnits).toBe(true);
		expect(decoded?.physicalValues).toEqual({
			temperatureKelvin: 373.15,
			viscosityPas: 0.0002,
			radiusMetres: 0.5e-6
		});
	});

	it('continues to decode and normalise existing version-1 links', () => {
		const decoded = decodeBrownianExperimentUrl(
			'https://example.test/?bm_v=1&bm_mode=free-brownian&bm_seed=legacy&bm_preset=colloidal-bead-water&bm_p_diffusion=0.8&bm_p_temperatureKelvin=305&bm_p_viscosityPas=0.0012&bm_p_radiusMetres=0.000001'
		);

		expect(decoded).toMatchObject({
			version: BROWNIAN_EXPERIMENT_URL_VERSION,
			processId: 'free-brownian',
			seed: 'legacy',
			initialCondition: { x: 0, y: 0, spread: 0 },
			boundaryMode: 'unbounded',
			physicalUnits: true,
			physicalValues: {
				temperatureKelvin: 305,
				viscosityPas: 0.0012,
				radiusMetres: 0.000001
			}
		});
	});

	it('rejects unknown versions or processes and can remove only Brownian parameters', () => {
		expect(
			decodeBrownianExperimentUrl('https://example.test/?bm_v=99&bm_mode=free-brownian')
		).toBeNull();
		expect(decodeBrownianExperimentUrl('https://example.test/?bm_v=1&bm_mode=unknown')).toBeNull();
		const cleaned = removeBrownianExperimentParameters(
			new URL('https://example.test/?bm_v=1&bm_seed=x&motion=reduce')
		);
		expect(cleaned.search).toBe('?motion=reduce');
	});
});
