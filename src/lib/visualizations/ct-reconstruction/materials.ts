import { MaterialId, type Phantom } from './types';

export interface MaterialDefinition {
	id: MaterialId;
	label: string;
	/** Illustrative normalized monoenergetic attenuation. */
	monoAttenuation: number;
	/** Illustrative low-, medium-, and high-energy attenuation values. */
	spectralAttenuation: readonly [number, number, number];
}

export const SPECTRUM_WEIGHTS: readonly [number, number, number] = [0.24, 0.5, 0.26];

export const MATERIAL_DEFINITIONS: Readonly<Record<MaterialId, MaterialDefinition>> = Object.freeze(
	{
		[MaterialId.Air]: {
			id: MaterialId.Air,
			label: 'Air',
			monoAttenuation: 0,
			spectralAttenuation: [0, 0, 0]
		},
		[MaterialId.SoftTissue]: {
			id: MaterialId.SoftTissue,
			label: 'Soft tissue',
			monoAttenuation: 0.52,
			spectralAttenuation: [0.66, 0.52, 0.42]
		},
		[MaterialId.Bone]: {
			id: MaterialId.Bone,
			label: 'Bone',
			monoAttenuation: 1.28,
			spectralAttenuation: [1.95, 1.28, 0.86]
		},
		[MaterialId.LesionLow]: {
			id: MaterialId.LesionLow,
			label: 'Low-attenuation lesion',
			monoAttenuation: 0.45,
			spectralAttenuation: [0.57, 0.45, 0.37]
		},
		[MaterialId.LesionHigh]: {
			id: MaterialId.LesionHigh,
			label: 'High-attenuation lesion',
			monoAttenuation: 0.61,
			spectralAttenuation: [0.77, 0.61, 0.49]
		},
		[MaterialId.Metal]: {
			id: MaterialId.Metal,
			label: 'Metal',
			monoAttenuation: 6,
			spectralAttenuation: [16, 8, 5]
		}
	}
);

export function materialDefinition(material: MaterialId): MaterialDefinition {
	const definition = MATERIAL_DEFINITIONS[material];
	if (!definition) throw new RangeError(`Unknown CT material identifier: ${material}.`);
	return definition;
}

export function materialAttenuation(
	material: MaterialId,
	density = 1,
	band: 0 | 1 | 2 | 'mono' = 'mono'
): number {
	const safeDensity = Number.isFinite(density) ? Math.max(0, density) : 0;
	const definition = materialDefinition(material);
	const coefficient =
		band === 'mono' ? definition.monoAttenuation : definition.spectralAttenuation[band];
	return coefficient * safeDensity;
}

export function phantomContainsMaterial(phantom: Phantom, material: MaterialId): boolean {
	return phantom.materials.includes(material);
}

export function phantomToAttenuation(
	phantom: Phantom,
	band: 0 | 1 | 2 | 'mono' = 'mono'
): Float32Array {
	const values = new Float32Array(phantom.materials.length);
	for (let index = 0; index < values.length; index += 1) {
		values[index] = materialAttenuation(
			phantom.materials[index] as MaterialId,
			phantom.density[index],
			band
		);
	}
	return values;
}
