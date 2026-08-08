import { describe, expect, it } from 'vitest';
import { CONFIG_RANGES, MAX_SEED_LENGTH } from './index';
import { stateForPreset } from './presets';
import {
	MAX_PERLIN_BLOOM_QUERY_LENGTH,
	buildPerlinBloomShareUrl,
	buildPerlinBloomStateUrl,
	parsePerlinBloomState,
	serializePerlinBloomState
} from './url-state';

describe('Perlin Bloom versioned URL state', () => {
	it('round-trips preset-relative state and preserves unrelated parameters', () => {
		const config = {
			...stateForPreset('kolkata-after-midnight', 'tramlight-2186'),
			palette: 'ice-signal' as const,
			view: 'anatomy' as const,
			petals: 19,
			whorls: 6,
			curl: -0.333,
			domainWarp: 0.777,
			boxSize: 0.37,
			ruptureThreshold: 0.09,
			boundaryPhysics: false,
			boxVisible: false,
			quality: 'high' as const,
			motionEnabled: false
		};
		const params = serializePerlinBloomState(config, '?campaign=monsoon&ref=gallery');
		expect(params.get('campaign')).toBe('monsoon');
		expect(params.get('ref')).toBe('gallery');
		expect(params.get('pb_v')).toBe('1');
		expect(params.get('pb_palette')).toBe('ice-signal');
		expect(params.get('pb_rupture')).toBe('0.09');
		expect(parsePerlinBloomState(params)).toEqual({
			config,
			issues: [],
			unsupportedVersion: false
		});
		const stateUrl = buildPerlinBloomStateUrl(
			'https://example.test/exhibit?campaign=a&pb_debug=1&pb_poster=1',
			config
		);
		expect(stateUrl).toContain('campaign=a');
		expect(stateUrl).toContain('pb_debug=1');
		expect(stateUrl).toContain('pb_poster=1');
		const shareUrl = buildPerlinBloomShareUrl(stateUrl, config);
		expect(shareUrl).toContain('campaign=a');
		expect(shareUrl).not.toContain('pb_debug');
		expect(shareUrl).not.toContain('pb_poster');
	});

	it('omits preset defaults while retaining the reconstruction identity', () => {
		const config = stateForPreset('ice-signal', 'quasar-6652');
		const params = serializePerlinBloomState(config);
		expect([...params.keys()].sort()).toEqual(['pb_preset', 'pb_seed', 'pb_v']);
		expect(parsePerlinBloomState(params).config).toEqual(config);
	});

	it('clamps finite hostile values and rejects malformed enums, booleans and numbers', () => {
		const overlongSeed = 'x'.repeat(MAX_SEED_LENGTH + 30);
		const parsed = parsePerlinBloomState(
			`?pb_v=1&pb_preset=banana&pb_palette=infrared&pb_view=microscope&pb_p=999&pb_w=-2&pb_curl=Infinity&pb_warp=NaN&pb_rupture=999&pb_tip=thorn&pb_quality=ultra&pb_physics=perhaps&pb_visible=no&pb_seed=${overlongSeed}`
		);
		expect(parsed.config.preset).toBe('neon-orchid');
		expect(parsed.config.palette).toBe('neon-orchid');
		expect(parsed.config.ruptureThreshold).toBe(CONFIG_RANGES.ruptureThreshold.max);
		expect(parsed.config.petals).toBe(CONFIG_RANGES.petals.max);
		expect(parsed.config.whorls).toBe(CONFIG_RANGES.whorls.min);
		expect(parsed.config.curl).toBe(stateForPreset('neon-orchid').curl);
		expect(parsed.config.domainWarp).toBe(stateForPreset('neon-orchid').domainWarp);
		expect(Array.from(parsed.config.seed)).toHaveLength(MAX_SEED_LENGTH);
		expect(parsed.issues.length).toBeGreaterThanOrEqual(10);
	});

	it('restores safe defaults for unsupported or oversized state', () => {
		const unsupported = parsePerlinBloomState('?pb_v=99&pb_seed=ignored');
		expect(unsupported.unsupportedVersion).toBe(true);
		expect(unsupported.config.seed).toBe('outside-1847');

		const oversized = parsePerlinBloomState(`?pb_v=1&junk=${'x'.repeat(4_200)}`);
		expect(oversized.issues[0]?.parameter).toBe('query');
		expect(
			serializePerlinBloomState(
				stateForPreset('neon-orchid'),
				`?junk=${'x'.repeat(4_200)}`
			).toString().length
		).toBeLessThanOrEqual(MAX_PERLIN_BLOOM_QUERY_LENGTH);
	});
});
