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
});
