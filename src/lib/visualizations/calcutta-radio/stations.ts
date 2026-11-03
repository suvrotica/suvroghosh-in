export type RadioStation = {
	id: string;
	name: string;
	shortName: string;
	location: string;
	languages: string[];
	description: string;
	streamUrl: string;
	streamType: 'hls' | 'audio';
	website: string;
	sourceUrl: string;
	verifiedAt: string;
};

export type ExternalStation = {
	id: string;
	name: string;
	description: string;
	website: string;
};

const akashvaniWebsite = 'https://akashvani.gov.in/radio/live.php';
const bengalDirectory = 'https://airadio.in/states/west-bengal';
const verifiedAt = '2026-11-04';

/**
 * Curated provider URLs, never user input. Every entry was decoded by Chromium,
 * with an advancing media clock, on the verification date. See the stream audit
 * for source discovery, CORS requirements and the limits of those checks.
 */
export const stations: RadioStation[] = [
	{
		id: 'kolkata-rainbow',
		name: 'FM Rainbow Kolkata',
		shortName: 'Rainbow',
		location: 'Kolkata, India',
		languages: ['Bengali', 'Hindi', 'English'],
		description: 'Music, conversation and programmes from Kolkata.',
		streamUrl:
			'https://airhlspush.pc.cdn.bitgravity.com/httppush/hlspbaudio058/hlspbaudio05864kbps.m3u8',
		streamType: 'hls',
		website: akashvaniWebsite,
		sourceUrl: bengalDirectory,
		verifiedAt
	},
	{
		id: 'kolkata-geetanjali',
		name: 'Akashvani Kolkata Geetanjali',
		shortName: 'Geetanjali',
		location: 'Kolkata, India',
		languages: ['Bengali'],
		description: 'Bengali music, talks, drama and regional programmes.',
		streamUrl:
			'https://airhlspush.pc.cdn.bitgravity.com/httppush/hlspbaudio055/hlspbaudio05564kbps.m3u8',
		streamType: 'hls',
		website: akashvaniWebsite,
		sourceUrl: bengalDirectory,
		verifiedAt
	},
	{
		id: 'kolkata-sanchayita',
		name: 'Akashvani Kolkata Sanchayita',
		shortName: 'Sanchayita',
		location: 'Kolkata, India',
		languages: ['Bengali'],
		description: 'Kolkata’s Sanchayita service in Bengali.',
		streamUrl:
			'https://airhlspush.pc.cdn.bitgravity.com/httppush/hlspbaudio056/hlspbaudio05664kbps.m3u8',
		streamType: 'hls',
		website: akashvaniWebsite,
		sourceUrl: bengalDirectory,
		verifiedAt
	},
	{
		id: 'kolkata-gold',
		name: 'FM Gold Kolkata',
		shortName: 'FM Gold',
		location: 'Kolkata, India',
		languages: ['Bengali', 'Hindi', 'English'],
		description: 'Music and news from Akashvani’s Kolkata service.',
		streamUrl:
			'https://airhlspush.pc.cdn.bitgravity.com/httppush/hlspbaudio057/hlspbaudio05764kbps.m3u8',
		streamType: 'hls',
		website: akashvaniWebsite,
		sourceUrl: bengalDirectory,
		verifiedAt
	},
	{
		id: 'akashvani-bangla',
		name: 'Akashvani Bangla',
		shortName: 'Bangla',
		location: 'Kolkata, India',
		languages: ['Bengali'],
		description: 'Bengali programmes from Akashvani.',
		streamUrl:
			'https://airhlspush.pc.cdn.bitgravity.com/httppush/hlspbaudio137/hlspbaudio137_Auto.m3u8',
		streamType: 'hls',
		website: akashvaniWebsite,
		sourceUrl: bengalDirectory,
		verifiedAt
	},
	{
		id: 'akashvani-maitree',
		name: 'Akashvani Maitree',
		shortName: 'Maitree',
		location: 'West Bengal, India',
		languages: ['Bengali'],
		description: 'Bengali programmes for listeners in India and Bangladesh.',
		streamUrl:
			'https://airhlspush.pc.cdn.bitgravity.com/httppush/hlspbaudio245/hlspbaudio24564kbps.m3u8',
		streamType: 'hls',
		website: akashvaniWebsite,
		sourceUrl: bengalDirectory,
		verifiedAt
	},
	{
		id: 'vividh-bharati-kolkata',
		name: 'Vividh Bharati Kolkata',
		shortName: 'VBS Kolkata',
		location: 'Kolkata, India',
		languages: ['Bengali', 'Hindi'],
		description: 'The Kolkata Vividh Bharati service.',
		streamUrl:
			'https://airhlspush.pc.cdn.bitgravity.com/httppush/hlspbaudio275/hlspbaudio275_Auto.m3u8',
		streamType: 'hls',
		website: akashvaniWebsite,
		sourceUrl: bengalDirectory,
		verifiedAt
	},
	{
		id: 'vividh-bharati-national',
		name: 'Vividh Bharati — national',
		shortName: 'Vividh Bharati',
		location: 'India · national service',
		languages: ['Hindi'],
		description: 'Hindi film music and national entertainment programmes.',
		streamUrl: 'https://radio.wavespb.com/live/146ed6ec6dea5a24/146ed6ec6dea5a24.m3u8',
		streamType: 'hls',
		website: akashvaniWebsite,
		sourceUrl: akashvaniWebsite,
		verifiedAt
	},
	{
		id: 'kexp',
		name: 'KEXP',
		shortName: 'KEXP',
		location: 'Seattle, United States',
		languages: ['English'],
		description: 'Independent music and discovery, with English presentation.',
		streamUrl: 'https://kexp.streamguys1.com/kexp160.aac',
		streamType: 'audio',
		website: 'https://www.kexp.org/',
		sourceUrl: 'https://www.kexp.org/streaming-urls/',
		verifiedAt
	},
	{
		id: 'wnyc-fm',
		name: 'WNYC 93.9 FM',
		shortName: 'WNYC',
		location: 'New York, United States',
		languages: ['English'],
		description: 'Public-radio news, interviews and conversation.',
		streamUrl: 'https://fm939.wnyc.org/wnycfm',
		streamType: 'audio',
		website: 'https://www.wnyc.org/',
		sourceUrl: 'https://prod.wnyc.org/audio-other-formats/',
		verifiedAt
	},
	{
		id: 'wqxr',
		name: 'WQXR',
		shortName: 'WQXR',
		location: 'New York, United States',
		languages: ['English'],
		description: 'Classical music, with English presentation.',
		streamUrl: 'https://stream.wqxr.org/wqxr',
		streamType: 'audio',
		website: 'https://www.wqxr.org/',
		sourceUrl: 'https://prod.wnyc.org/audio-other-formats/',
		verifiedAt
	}
];

/** Official destinations only; these are not represented as in-app streams. */
export const externalStations: ExternalStation[] = [
	{
		id: 'mirchi',
		name: 'Mirchi',
		description: 'Check Mirchi Plus for listening options; availability varies by region.',
		website: 'https://mirchi.in/'
	},
	{
		id: 'red-fm',
		name: 'RED FM Kolkata',
		description: 'Official Kolkata programmes and station information.',
		website: 'https://www.redfmindia.in/kolkata'
	},
	{
		id: 'big-fm',
		name: 'BIG FM',
		description: 'Official programmes and podcasts; no verified Kolkata stream in this player.',
		website: 'https://www.bigfmindia.com/'
	}
];
