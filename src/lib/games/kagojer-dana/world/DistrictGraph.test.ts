import { describe, expect, it } from 'vitest';
import {
	DISTRICT_GRAPH_VERSION,
	districtRouteSignature,
	generateDistrictRoute,
	type DistrictId,
	type LandmarkId
} from './DistrictGraph';

const ALL_DISTRICTS: readonly DistrictId[] = [
	'north-calcutta',
	'kumartuli',
	'college-street',
	'esplanade',
	'maidan-victoria',
	'park-street',
	'hooghly',
	'new-town'
];

const LANDMARK_DISTRICTS: Readonly<Record<LandmarkId, readonly DistrictId[]>> = {
	'howrah-bridge': ['hooghly'],
	'vidyasagar-setu': ['hooghly'],
	'victoria-memorial': ['maidan-victoria'],
	'biswa-bangla-gate': ['new-town'],
	'new-market-clock-tower': ['esplanade'],
	'shaheed-minar': ['esplanade'],
	'st-pauls-cathedral': ['maidan-victoria', 'park-street']
};

describe('deterministic Calcutta dream-geography', () => {
	it('keeps a stable versioned signature and landmark order for a known seed', () => {
		const route = generateDistrictRoute('কলকাতা');
		expect(route.version).toBe(DISTRICT_GRAPH_VERSION);
		expect(route.signature).toBe('05cd9c7a');
		expect(route.signature).toBe(districtRouteSignature(route));
		expect(generateDistrictRoute('কলকাতা')).toEqual(route);
		expect(route.modules.map((module) => module.heroLandmark).filter(Boolean)).toEqual([
			'new-market-clock-tower',
			'victoria-memorial',
			'howrah-bridge',
			'biswa-bangla-gate',
			'new-market-clock-tower',
			'vidyasagar-setu'
		]);
	});

	it('defaults to a six-to-ten-minute cadence with full coverage before revisits', () => {
		for (const seed of ['north-window', 'monsoon-1974', 'tram-page', 'river-crosswind']) {
			const route = generateDistrictRoute(seed);
			expect(route.modules.length).toBeGreaterThanOrEqual(14);
			expect(route.modules.length).toBeLessThanOrEqual(15);
			expect(new Set(route.modules.slice(0, 8).map((module) => module.district))).toEqual(
				new Set(ALL_DISTRICTS)
			);
			const duration = route.modules.reduce(
				(seconds, module) => seconds + module.durationSeconds,
				0
			);
			expect(duration).toBeGreaterThanOrEqual(360);
			expect(duration).toBeLessThanOrEqual(600);
			for (let index = 1; index < route.modules.length; index += 1) {
				expect(route.modules[index].district).not.toBe(route.modules[index - 1].district);
			}
		}
	});

	it('accepts focused five-module captures and sixteen-module long flights', () => {
		expect(generateDistrictRoute('short', { moduleCount: 1 }).modules).toHaveLength(5);
		expect(generateDistrictRoute('long', { moduleCount: 40 }).modules).toHaveLength(16);
	});

	it('spaces hero reveals by at least thirty-five seconds and keeps them local', () => {
		const route = generateDistrictRoute('landmark-cadence', { moduleCount: 16 });
		let elapsed = 0;
		let lastReveal = -Number.POSITIVE_INFINITY;
		for (const module of route.modules) {
			if (module.heroLandmark) {
				const reveal = elapsed + (module.revealAtSeconds ?? 0);
				expect(reveal - lastReveal).toBeGreaterThanOrEqual(35);
				expect(LANDMARK_DISTRICTS[module.heroLandmark]).toContain(module.district);
				lastReveal = reveal;
			}
			elapsed += module.durationSeconds;
		}
	});

	it('always hides impossible joins behind an authored visual interruption', () => {
		const route = generateDistrictRoute('pages-and-rain');
		expect(route.modules[0].entryVeil).toBeNull();
		for (const module of route.modules.slice(1)) expect(module.entryVeil).not.toBeNull();
	});
});
