import type { SkinDomain, SkinFields, SkinSettings } from './model.ts';

export interface SkinReplayFrame extends SkinFields {
	modelTime: number;
}

export interface SkinResult {
	settings: SkinSettings;
	domain: SkinDomain;
	formed: SkinFields;
	fitted: SkinFields;
	frames: SkinReplayFrame[];
	observationTime: number;
}

export type SkinRequest =
	| { type: 'calculate'; generation: number; settings: SkinSettings }
	| { type: 'cancel'; generation: number }
	| { type: 'active'; active: boolean };

export type SkinResponse =
	| { type: 'result'; generation: number; result: SkinResult }
	| { type: 'error'; generation: number };
