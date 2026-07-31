import type { CityExportV1, CityResult } from './types';

export function createCityExport(result: CityResult): CityExportV1 {
	return {
		schema: 'suvro-city-v1',
		generatorVersion: 1,
		seed: result.seed,
		cityName: result.cityName,
		width: result.width,
		height: result.height,
		anchor: { ...result.anchor },
		settings: {
			size: result.config.size,
			civicPatience: result.config.civicPatience,
			minimumGuarantees: result.config.minimumGuarantees,
			density: result.config.density,
			landmarkFrequency: result.config.landmarkFrequency,
			anomalyAppetite: result.config.anomalyAppetite,
			tramPreference: result.config.tramPreference
		},
		fabricTiles: result.fabricTiles.map((tile) => ({
			id: tile.prototypeId,
			rotation: tile.rotation
		})),
		occupationTiles: result.occupationTiles.map((tile) => ({
			id: tile.prototypeId,
			rotation: tile.rotation
		})),
		infrastructure: result.infrastructure.map((detail) => ({
			...detail,
			cell: { ...detail.cell },
			tags: [...detail.tags]
		})),
		municipalPatches: result.municipalPatches.map((patch) => ({
			...patch,
			cell: { ...patch.cell },
			demandedEdges: patch.demandedEdges.map((edge) => ({ ...edge })),
			selectedEdges: patch.selectedEdges.map((edge) => ({ ...edge })),
			violatedRules: [...patch.violatedRules]
		})),
		scores: {
			functional: result.scores.functional,
			functionalLabel: result.scores.functionalLabel,
			calamity: result.scores.calamity,
			calamityLabel: result.scores.calamityLabel,
			components: {
				functional: result.scores.functionalComponents.map((component) => ({ ...component })),
				calamity: result.scores.calamityComponents.map((component) => ({ ...component }))
			}
		},
		analysis: structuredCloneSafe(result.analysis),
		report: result.report,
		fingerprint: result.fingerprint
	};
}

function structuredCloneSafe<Value>(value: Value): Value {
	return JSON.parse(JSON.stringify(value)) as Value;
}
