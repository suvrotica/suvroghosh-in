import type { Snippet } from 'svelte';

export type ThoughtFolioTone = 'coal' | 'paper' | 'signal' | 'warning';

export type ThoughtFolioSpread = {
	id: string;
	number: string;
	kicker: string;
	title: string;
	tone: ThoughtFolioTone;
};

export type ThoughtFolioContentsEntry = {
	number: string;
	title: string;
	anchor: string;
};

export type ThoughtFolioArt = {
	src: string;
	alt: string;
	width: number;
	height: number;
	ratio?: 'portrait' | 'landscape' | 'wide';
	fit?: 'cover' | 'contain';
	position?: string;
	caption?: string;
	sizes?: string;
	priority?: boolean;
};

export type ThoughtFolioManifest = {
	id: string;
	issue: string;
	label: string;
	spreads: ThoughtFolioSpread[];
	contents?: ThoughtFolioContentsEntry[];
	art?: Record<string, ThoughtFolioArt>;
};

export type ThoughtFolioContext = {
	manifest: ThoughtFolioManifest;
};

export type ThoughtFolioChildren = {
	children: Snippet;
};

export const THOUGHT_FOLIO_CONTEXT = Symbol('thought-folio-context');
