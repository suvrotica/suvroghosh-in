import { hashHex } from '../core/seeded-rng';
import { FRAGMENTS_EN } from './fragments.en';
import { FRAMES_EN } from './frames.en';

const canonicalManifest = JSON.stringify({
	fragments: [...FRAGMENTS_EN].sort((left, right) => left.id.localeCompare(right.id)),
	frames: [...FRAMES_EN].sort((left, right) => left.id.localeCompare(right.id))
});

export const CORPUS_MANIFEST_HASH = hashHex(canonicalManifest);

export function canonicalCorpusManifest(): string {
	return canonicalManifest;
}
