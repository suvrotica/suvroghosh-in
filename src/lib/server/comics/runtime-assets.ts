import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { ComicEpisode } from '$lib/comics/schema';

export type ComicWebRuntimeMap = {
	format: 'suvroghosh-comic-web-runtime-map';
	formatVersion: 1;
	seriesSlug: string;
	episodeId: string;
	episodeSlug: string;
	sourceDigest: string;
	panels: Record<string, string>;
};

type RuntimeAssetOptions = {
	staticRoot: string;
	expectedPanelCount?: number;
};

function sha256(value: Buffer) {
	return crypto.createHash('sha256').update(value).digest('hex');
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isInside(parent: string, candidate: string) {
	const relative = path.relative(path.resolve(parent), path.resolve(candidate));
	return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function isRootRelativeAssetUrl(value: unknown): value is string {
	if (
		typeof value !== 'string' ||
		!value.startsWith('/') ||
		value.startsWith('//') ||
		value.includes('\\') ||
		value.includes('?') ||
		value.includes('#') ||
		/\s/.test(value)
	) {
		return false;
	}
	const segments = value.split('/').slice(1);
	return (
		segments.length > 0 &&
		segments.every((segment) => segment !== '' && segment !== '.' && segment !== '..')
	);
}

function isWebp(value: Buffer) {
	return (
		value.length >= 12 &&
		value.subarray(0, 4).toString('ascii') === 'RIFF' &&
		value.subarray(8, 12).toString('ascii') === 'WEBP'
	);
}

function escapedPattern(value: string) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function verifiedRuntimePanels(
	episode: ComicEpisode,
	value: unknown,
	options: RuntimeAssetOptions
): Record<string, string> | null {
	if (
		!isPlainObject(value) ||
		value.format !== 'suvroghosh-comic-web-runtime-map' ||
		value.formatVersion !== 1 ||
		value.seriesSlug !== episode.metadata.seriesSlug ||
		value.episodeId !== episode.metadata.id ||
		value.episodeSlug !== episode.metadata.slug ||
		value.sourceDigest !== episode.sourceDigest ||
		!isPlainObject(value.panels)
	) {
		return null;
	}
	const panelIds = episode.pages.flatMap((page) => page.panels.map((panel) => panel.id));
	const expectedPanelCount = options.expectedPanelCount ?? 338;
	const mappedPanelIds = Object.keys(value.panels);
	if (
		panelIds.length !== expectedPanelCount ||
		new Set(panelIds).size !== expectedPanelCount ||
		mappedPanelIds.length !== expectedPanelCount ||
		mappedPanelIds.some((panelId) => !panelIds.includes(panelId))
	) {
		return null;
	}
	const prefix = `/images/comics/${episode.metadata.seriesSlug}/${episode.metadata.slug}/`;
	const verified: Record<string, string> = {};
	for (const panelId of panelIds) {
		const url = value.panels[panelId];
		if (!isRootRelativeAssetUrl(url) || !url.startsWith(prefix)) return null;
		const match = path.posix
			.basename(url)
			.match(new RegExp(`^${escapedPattern(panelId)}-([a-f0-9]{64})\\.webp$`));
		if (!match) return null;
		const filename = path.resolve(options.staticRoot, ...url.slice(1).split('/'));
		if (!isInside(options.staticRoot, filename)) return null;
		try {
			const stat = fs.statSync(filename);
			if (!stat.isFile()) return null;
			const bytes = fs.readFileSync(filename);
			if (!isWebp(bytes) || sha256(bytes) !== match[1]) return null;
		} catch {
			return null;
		}
		verified[panelId] = url;
	}
	return verified;
}

export function comicEpisodeWithRuntimeAssets(
	compiledEpisode: ComicEpisode,
	runtimeMap: unknown,
	options: RuntimeAssetOptions
): ComicEpisode {
	const episode = structuredClone(compiledEpisode);
	for (const panel of episode.pages.flatMap((page) => page.panels)) {
		if (!isRootRelativeAssetUrl(panel.art.final)) panel.art.final = null;
		if (!isRootRelativeAssetUrl(panel.art.source)) panel.art.source = null;
	}
	const verified = verifiedRuntimePanels(episode, runtimeMap, options);
	if (!verified) return episode;
	for (const panel of episode.pages.flatMap((page) => page.panels)) {
		panel.art.final = verified[panel.id];
	}
	return episode;
}
