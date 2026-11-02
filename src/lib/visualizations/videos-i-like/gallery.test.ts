import { describe, expect, it } from 'vitest';
import {
	contentFailure,
	eligibleQueue,
	filterGallery,
	formatDuration,
	playbackMessage
} from './gallery';
import type { GalleryItem, VideoAvailability } from './types';

function video(id: string, state: VideoAvailability['state'] = 'eligible'): VideoAvailability {
	return { id, state, title: `Video ${id}`, channelTitle: 'A channel', checkedAt: null };
}

function item(overrides: Partial<GalleryItem> = {}): GalleryItem {
	return {
		key: 'video:HvOXmnTJYRc',
		kind: 'video',
		id: 'HvOXmnTJYRc',
		url: 'https://www.youtube.com/watch?v=HvOXmnTJYRc',
		categories: ['music'],
		musicCategories: ['bengali'],
		sources: [],
		state: 'eligible',
		title: 'A Bengali Song',
		channelTitle: 'Music Archive',
		checkedAt: null,
		videos: [video('HvOXmnTJYRc')],
		checkedCount: 1,
		...overrides
	};
}

describe('the playable gallery', () => {
	it('requires eligible metadata and at least one eligible, nonfailed member; never shows Mixes', () => {
		const items = [
			item(),
			item({ state: 'unknown' }),
			item({ state: 'unavailable' }),
			item({ kind: 'mix' }),
			item({ videos: [video('blocked', 'unavailable')] }),
			item({ videos: [video('uncertain', 'unknown')] }),
			item({ videos: [] })
		];
		expect(filterGallery(items, 'all', 'all', '', new Set())).toEqual([items[0]]);
		expect(filterGallery(items, 'all', 'all', '', new Set(['HvOXmnTJYRc']))).toEqual([]);
	});

	it('combines topic, Music filters and case-insensitive title/channel/topic search', () => {
		const bengali = item();
		const hindi = item({
			key: 'video:XA3XY2RRc5Y',
			title: 'Evening Song',
			musicCategories: ['hindi']
		});
		const film = item({
			key: 'video:iwsigIyhPWg',
			title: 'A Bengali Film',
			categories: ['films'],
			musicCategories: []
		});
		const maths = item({
			key: 'video:QL4_4GAWvPs',
			title: 'Linear Algebra',
			categories: ['maths', 'documentaries'],
			musicCategories: []
		});
		const items = [bengali, hindi, film, maths];
		expect(filterGallery(items, 'music', 'bengali', '  ARCHIVE ', new Set())).toEqual([bengali]);
		expect(filterGallery(items, 'music', 'hindi', '', new Set())).toEqual([hindi]);
		expect(filterGallery(items, 'films', 'hindi', 'bengali', new Set())).toEqual([film]);
		expect(filterGallery(items, 'all', 'hindi', 'documentaries', new Set())).toEqual([maths]);
		expect(filterGallery(items, 'music', 'all', 'does not exist', new Set())).toEqual([]);
	});

	it('preserves checked playlist order while removing unavailable, unknown and failed videos', () => {
		const first = video('first');
		const last = video('last');
		const playlist = item({
			kind: 'playlist',
			videos: [
				first,
				video('private', 'unavailable'),
				video('network', 'unknown'),
				video('failed'),
				last
			]
		});
		expect(eligibleQueue(playlist, new Set(['failed']))).toEqual([first, last]);
		expect(playlist.videos).toHaveLength(5);
	});
});

describe('playback feedback', () => {
	it('only suppresses unavailable/private/removed and disallowed-embed errors', () => {
		for (const code of [100, 101, 150]) expect(contentFailure(code)).toBe(true);
		for (const code of [undefined, 2, 5, 153, 999]) expect(contentFailure(code)).toBe(false);
		expect(playbackMessage(5)).toContain('Try again');
		expect(playbackMessage(153)).toContain('connect correctly');
		expect(playbackMessage(100)).not.toMatch(/deleted|removed/i);
	});

	it('prints useful durations without fabricated or nonfinite values', () => {
		expect(formatDuration(65.9)).toBe('1:05');
		expect(formatDuration(3723)).toBe('1:02:03');
		for (const value of [undefined, 0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
			expect(formatDuration(value)).toBe('');
		}
	});
});
