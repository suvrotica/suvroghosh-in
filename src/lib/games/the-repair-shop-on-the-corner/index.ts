export * from './types';
export * from './repairs';
export * from './characters';
export * from './world';
export * from './state';
export * from './persistence';

export const REPAIR_SHOP_ASSET_CREDITS = [
	{
		asset: '3D neighbourhood, shop interior, radio, clock, and 8mm projector geometry',
		source: 'Original procedural Three.js meshes created in this repository',
		licence: 'First-party original work (SuvroGhosh.IN)'
	},
	{
		asset: 'Courtyard short film (“Afternoon Across the Roofs · বিকেলের ছাদ”) & focus test card',
		source: 'Original self-hosted 2D Canvas animation in film-reel.ts',
		licence: 'First-party original work (SuvroGhosh.IN)'
	},
	{
		asset: 'Optional workshop, radio, clockwork, and street soundscape',
		source: 'Original procedural Web Audio synthesis in audio.ts',
		licence: 'First-party original work (SuvroGhosh.IN)'
	}
] as const;
