import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import type { ComicEpisode, ComicEpisodeMetadata } from '$lib/comics/schema';
import { comicEpisodeWithRuntimeAssets } from './runtime-assets';

const seriesRoot = path.resolve(process.cwd(), 'src', 'lib', 'comics', 'the-last-analog-town');
const episodeRoot = path.join(seriesRoot, 'episodes', '001-the-efficiency-inspector');
const staticRoot = path.resolve(process.cwd(), 'static');

type SeriesSource = {
	id: string;
	title: string;
	category: 'Comic';
	contentType: 'comic-series';
	description: string;
	publication: {
		status: string;
		published: boolean;
		requiresFinalArt: boolean;
		requiresRightsReview: boolean;
		requiresCulturalReview: boolean;
		requiresHumanApproval: boolean;
	};
	routes: {
		category: string;
		series: string;
		firstAlbum: string;
	};
	setting: {
		canonicalName: string;
		region: string;
		notRealPlaceStatement: string;
	};
	themes: string[];
	albumOne: {
		id: string;
		slug: string;
		title: string;
		storyPageCount: number;
		premise: string;
	};
};

export type ComicCharacterSummary = {
	id: string;
	name: string;
	shortName?: string;
	role?: string;
	narrativeFunction?: string;
	summary?: string;
	description?: string;
};

export type ComicLocationSummary = {
	id: string;
	name: string;
	narrativeFunction?: string;
	neighbourhoodVisualIdentity?: string;
	summary?: string;
	description?: string;
};

function readUtf8(file: string) {
	return fs.readFileSync(file, 'utf8');
}

function readJson<T>(file: string): T {
	return JSON.parse(readUtf8(file)) as T;
}

function readOptionalArray<T>(file: string): T[] {
	if (!fs.existsSync(file)) return [];
	const value = readJson<unknown>(file);
	if (Array.isArray(value)) return value as T[];
	if (value && typeof value === 'object') {
		for (const key of ['characters', 'locations', 'items']) {
			const candidate = (value as Record<string, unknown>)[key];
			if (Array.isArray(candidate)) return candidate as T[];
		}
	}
	throw new Error(`${file} must contain an array or a supported array property.`);
}

function assertMetadata(metadata: ComicEpisodeMetadata) {
	if (metadata.category !== 'Comic') {
		throw new Error(`Album 001 must use category "Comic"; found "${metadata.category}".`);
	}
	if (metadata.storyPageCount !== 62) {
		throw new Error(`Album 001 must contain 62 story pages; found ${metadata.storyPageCount}.`);
	}
	return metadata;
}

export function getComicSeriesSource() {
	const series = readJson<SeriesSource>(path.join(seriesRoot, 'data', 'series.json'));
	if (series.id !== 'the-last-analog-town' || series.category !== 'Comic') {
		throw new Error('The Last Analog Town series metadata has an invalid identity or category.');
	}
	return series;
}

export function getComicEpisodeMetadata() {
	const metadata = YAML.parse(
		readUtf8(path.join(episodeRoot, 'episode.yaml'))
	) as ComicEpisodeMetadata;
	return assertMetadata(metadata);
}

export function getComicCharacters() {
	return readOptionalArray<ComicCharacterSummary>(path.join(seriesRoot, 'data', 'characters.json'));
}

export function getComicLocations() {
	return readOptionalArray<ComicLocationSummary>(path.join(seriesRoot, 'data', 'locations.json'));
}

export function getComicEpisode() {
	const generatedPath = path.join(episodeRoot, 'generated', 'episode.json');
	if (!fs.existsSync(generatedPath)) {
		throw new Error(
			'Compiled comic data is missing. Run "npm run comic:compile -- --episode 001".'
		);
	}
	const compiledEpisode = readJson<ComicEpisode>(generatedPath);
	assertMetadata(compiledEpisode.metadata);
	if (compiledEpisode.pages.length !== compiledEpisode.metadata.storyPageCount) {
		throw new Error(
			`Compiled album has ${compiledEpisode.pages.length} pages; expected ${compiledEpisode.metadata.storyPageCount}.`
		);
	}
	const runtimeMapPath = path.join(episodeRoot, 'generated', 'web-runtime-map.json');
	let runtimeMap: unknown = null;
	if (fs.existsSync(runtimeMapPath)) {
		try {
			runtimeMap = readJson<unknown>(runtimeMapPath);
		} catch {
			runtimeMap = null;
		}
	}
	return comicEpisodeWithRuntimeAssets(compiledEpisode, runtimeMap, { staticRoot });
}

export function getComicCatalog() {
	const series = getComicSeriesSource();
	const episode = getComicEpisodeMetadata();
	return {
		series,
		episodes: [episode],
		characters: getComicCharacters(),
		locations: getComicLocations()
	};
}
