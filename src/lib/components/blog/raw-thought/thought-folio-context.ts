import type { Snippet } from 'svelte';

export type ThoughtFolioTone = 'coal' | 'paper' | 'signal' | 'warning';

export type ThoughtFolioSpread = {
	id: string;
	number: string;
	kicker: string;
	title: string;
	tone: ThoughtFolioTone;
};

export type ThoughtFolioManifest = {
	id: string;
	issue: string;
	label: string;
	spreads: ThoughtFolioSpread[];
};

export type ThoughtFolioContext = {
	manifest: ThoughtFolioManifest;
};

export type ThoughtFolioChildren = {
	children: Snippet;
};

export const THOUGHT_FOLIO_CONTEXT = Symbol('thought-folio-context');
