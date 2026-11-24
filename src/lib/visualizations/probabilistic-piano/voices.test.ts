import { describe, expect, it } from 'vitest';
import { VoiceLedger } from './voices';

describe('physical-input voice ownership', () => {
	it('releases two corrections to the same pitch independently, using their original outputs', () => {
		const ledger = new VoiceLedger();
		ledger.bind('pointer:1', 'audio-1', 60);
		ledger.bind('keyboard:KeyS', 'audio-2', 60);
		expect(ledger.release('pointer:1')).toEqual({
			inputId: 'pointer:1',
			voiceId: 'audio-1',
			pitch: 60
		});
		expect(ledger.entries()).toEqual([{ inputId: 'keyboard:KeyS', voiceId: 'audio-2', pitch: 60 }]);
		// Harmony and model state are not needed to release a key after a chord change.
		expect(ledger.release('keyboard:KeyS')?.pitch).toBe(60);
		expect(ledger.size).toBe(0);
	});

	it('requires release before glissando rebind and makes late duplicate releases harmless', () => {
		const ledger = new VoiceLedger();
		ledger.bind('pointer:7', 'old', 62);
		expect(() => ledger.bind('pointer:7', 'new', 64)).toThrow(/Release/);
		expect(ledger.release('pointer:7')?.voiceId).toBe('old');
		ledger.bind('pointer:7', 'new', 64);
		expect(ledger.release('pointer:7')?.voiceId).toBe('new');
		expect(ledger.release('pointer:7')).toBeUndefined();
	});

	it('retains silent decisions and freezes stored outputs against later mutation', () => {
		const ledger = new VoiceLedger();
		const voice = ledger.bind('silent:1', '', 61);
		expect(Object.isFrozen(voice)).toBe(true);
		const snapshot = ledger.entries();
		snapshot.length = 0;
		expect(ledger.get('silent:1')).toBe(voice);
		expect(ledger.clear()).toEqual([voice]);
		expect(ledger.clear()).toEqual([]);
	});

	it('removes stolen voices without confusing surviving notes at the same pitch', () => {
		const ledger = new VoiceLedger();
		ledger.bind('one', 'stolen', 60);
		ledger.bind('two', 'surviving', 60);
		expect(ledger.prune((id) => id === 'surviving').map((voice) => voice.inputId)).toEqual(['one']);
		expect(ledger.get('two')?.voiceId).toBe('surviving');
	});

	it('rejects malformed ownership before altering the ledger', () => {
		const ledger = new VoiceLedger();
		for (const pitch of [NaN, Infinity, -1, 128, 60.5])
			expect(() => ledger.bind('input', 'voice', pitch)).toThrow(/MIDI/);
		expect(() => ledger.bind('', 'voice', 60)).toThrow(/ID/);
		expect(ledger.size).toBe(0);
	});

	it('binds and releases multi-pitch chords without colliding across numeric IDs', () => {
		const ledger = new VoiceLedger();
		const chord1 = ledger.bindChord('chord-pointer-1', [
			{ voiceId: 'v-1a', pitch: 60 },
			{ voiceId: 'v-1b', pitch: 64 },
			{ voiceId: 'v-1c', pitch: 67 }
		]);
		const chord10 = ledger.bindChord('chord-pointer-10', [
			{ voiceId: 'v-10a', pitch: 48 },
			{ voiceId: 'v-10b', pitch: 55 }
		]);
		expect(chord1).toHaveLength(3);
		expect(chord1.every(Object.isFrozen)).toBe(true);
		expect(chord10).toHaveLength(2);
		expect(ledger.size).toBe(5);

		const released1 = ledger.releaseChord('chord-pointer-1');
		expect(released1.map((v) => v.voiceId)).toEqual(['v-1a', 'v-1b', 'v-1c']);
		expect(ledger.size).toBe(2);
		expect(ledger.get('chord-pointer-10-0')?.voiceId).toBe('v-10a');
		expect(ledger.get('chord-pointer-10-1')?.voiceId).toBe('v-10b');

		// Repeat release is idempotent and empty baseId is safe.
		expect(ledger.releaseChord('chord-pointer-1')).toEqual([]);
		expect(ledger.releaseChord('')).toEqual([]);
	});

	it('rolls back bindChord atomically when any note is invalid or collides', () => {
		const ledger = new VoiceLedger();
		ledger.bind('chord-key-0-1', 'existing', 62);
		expect(() =>
			ledger.bindChord('chord-key-0', [
				{ voiceId: 'v0', pitch: 60 },
				{ voiceId: 'v1', pitch: 64 }
			])
		).toThrow(/Release/);
		expect(ledger.size).toBe(1);
		expect(ledger.get('chord-key-0-0')).toBeUndefined();

		expect(() =>
			ledger.bindChord('chord-key-1', [
				{ voiceId: 'v0', pitch: 60 },
				{ voiceId: 'bad', pitch: 128 }
			])
		).toThrow(/MIDI/);
		expect(() => ledger.bindChord('', [{ voiceId: 'v0', pitch: 60 }])).toThrow(/ID/);
		expect(() => ledger.bindChord('empty', [])).toThrow();
		expect(ledger.size).toBe(1);
	});

	it('queries and releases prefixes (e.g. arp-*) without disturbing manual inputs', () => {
		const ledger = new VoiceLedger();
		ledger.bind('pointer:1', 'manual-1', 60);
		ledger.bind('key-KeyA', 'manual-2', 62);
		ledger.bind('arp-0', 'arp-v0', 64);
		ledger.bind('arp-1', 'arp-v1', 67);

		const arpVoices = ledger.getPrefix('arp-');
		expect(arpVoices.map((v) => v.voiceId)).toEqual(['arp-v0', 'arp-v1']);
		arpVoices.length = 0;
		expect(ledger.getPrefix('arp-')).toHaveLength(2);
		expect(ledger.getPrefix('')).toEqual([]);
		expect(ledger.releasePrefix('')).toEqual([]);

		// Pruning removes only stolen individual voices.
		const pruned = ledger.prune((voiceId) => voiceId !== 'arp-v0');
		expect(pruned.map((v) => v.voiceId)).toEqual(['arp-v0']);
		expect(ledger.size).toBe(3);

		const releasedArp = ledger.releasePrefix('arp-');
		expect(releasedArp.map((v) => v.voiceId)).toEqual(['arp-v1']);
		expect(ledger.size).toBe(2);
		expect(ledger.get('pointer:1')?.voiceId).toBe('manual-1');
		expect(ledger.get('key-KeyA')?.voiceId).toBe('manual-2');
	});
});
