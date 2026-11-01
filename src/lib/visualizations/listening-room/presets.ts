export interface SongPreset {
	id: string;
	videoId: string;
	title: string;
	artist: string;
	url: string;
}

// Official video URLs checked on 1 November 2026. Availability and permission to
// embed can change by location; the player must retain its YouTube fallback link.
export const SONG_PRESETS: readonly SongPreset[] = [
	['YQHsXMglC9A', 'Hello', 'Adele'],
	['JGwWNGJdvx8', 'Shape of You', 'Ed Sheeran'],
	['4NRXx6U8ABQ', 'Blinding Lights', 'The Weeknd'],
	['LjhCEhWiKXk', 'Just the Way You Are', 'Bruno Mars'],
	['H5v3kku4y6Q', 'As It Was', 'Harry Styles'],
	['TUVcZfQe-Kw', 'Levitating', 'Dua Lipa featuring DaBaby'],
	['OPf0YbXqDm0', 'Uptown Funk', 'Mark Ronson featuring Bruno Mars'],
	['djV11Xbc914', 'Take On Me', 'a-ha']
].map(([videoId, title, artist]) => ({
	id: videoId,
	videoId,
	title,
	artist,
	url: `https://www.youtube.com/watch?v=${videoId}`
}));
