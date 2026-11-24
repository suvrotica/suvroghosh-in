import { describe, expect, it, vi } from 'vitest';
import { createMidiController, decodeMidiMessage, type MidiHandlers } from './midi';

class FakeMidiInput {
	onmidimessage: ((event: MIDIMessageEvent) => void) | null = null;
	private readonly listeners = new Set<(event: MIDIMessageEvent) => void>();
	addEventListener?: ReturnType<
		typeof vi.fn<(type: string, cb: EventListenerOrEventListenerObject) => void>
	>;
	removeEventListener?: ReturnType<
		typeof vi.fn<(type: string, cb: EventListenerOrEventListenerObject) => void>
	>;

	constructor(
		readonly id: string,
		readonly name: string,
		readonly manufacturer = 'TestBench',
		public state: MIDIPortDeviceState = 'connected',
		supportAddEventListener = true
	) {
		if (supportAddEventListener) {
			this.addEventListener = vi.fn((type: string, cb: EventListenerOrEventListenerObject) => {
				if (type === 'midimessage' && typeof cb === 'function') {
					this.listeners.add(cb as (ev: MIDIMessageEvent) => void);
				}
			});
			this.removeEventListener = vi.fn((type: string, cb: EventListenerOrEventListenerObject) => {
				if (type === 'midimessage' && typeof cb === 'function') {
					this.listeners.delete(cb as (ev: MIDIMessageEvent) => void);
				}
			});
		}
	}

	emit(bytes: number[]): void {
		const event = { data: new Uint8Array(bytes) } as unknown as MIDIMessageEvent;
		this.onmidimessage?.(event);
		for (const cb of this.listeners) cb(event);
	}

	get listenerCount(): number {
		return this.listeners.size + (this.onmidimessage ? 1 : 0);
	}
}

function createFakeAccess(initialInputs: FakeMidiInput[]) {
	const map = new Map<string, MIDIInput>();
	for (const input of initialInputs) {
		map.set(input.id, input as unknown as MIDIInput);
	}
	const access = {
		inputs: map as unknown as MIDIInputMap,
		outputs: new Map() as unknown as MIDIOutputMap,
		sysexEnabled: false,
		onstatechange: null as ((this: MIDIAccess, ev: MIDIConnectionEvent) => unknown) | null,
		addEventListener: vi.fn(),
		removeEventListener: vi.fn()
	};
	return { access: access as unknown as MIDIAccess, rawAccess: access, map };
}

function makeHandlers(): MidiHandlers & {
	onNoteOn: ReturnType<typeof vi.fn<MidiHandlers['onNoteOn']>>;
	onNoteOff: ReturnType<typeof vi.fn<MidiHandlers['onNoteOff']>>;
	onPitchBend: ReturnType<typeof vi.fn<NonNullable<MidiHandlers['onPitchBend']>>>;
	onModWheel: ReturnType<typeof vi.fn<NonNullable<MidiHandlers['onModWheel']>>>;
	onSustain: ReturnType<typeof vi.fn<NonNullable<MidiHandlers['onSustain']>>>;
	onAllNotesOff: ReturnType<typeof vi.fn<NonNullable<MidiHandlers['onAllNotesOff']>>>;
	onDevicesChange: ReturnType<typeof vi.fn<NonNullable<MidiHandlers['onDevicesChange']>>>;
	onStatus: ReturnType<typeof vi.fn<NonNullable<MidiHandlers['onStatus']>>>;
} {
	return {
		onNoteOn: vi.fn<MidiHandlers['onNoteOn']>(),
		onNoteOff: vi.fn<MidiHandlers['onNoteOff']>(),
		onPitchBend: vi.fn<NonNullable<MidiHandlers['onPitchBend']>>(),
		onModWheel: vi.fn<NonNullable<MidiHandlers['onModWheel']>>(),
		onSustain: vi.fn<NonNullable<MidiHandlers['onSustain']>>(),
		onAllNotesOff: vi.fn<NonNullable<MidiHandlers['onAllNotesOff']>>(),
		onDevicesChange: vi.fn<NonNullable<MidiHandlers['onDevicesChange']>>(),
		onStatus: vi.fn<NonNullable<MidiHandlers['onStatus']>>()
	};
}

describe('web midi controller and message decoding', () => {
	it('is SSR/Node safe and reports unsupported when navigator.requestMIDIAccess is missing or undefined', async () => {
		const handlers = makeHandlers();
		const controller = createMidiController(handlers);
		expect(controller.isSupported()).toBe(false);
		const result = await controller.requestAccess();
		expect(result.ok).toBe(false);
		expect(handlers.onStatus).toHaveBeenCalledWith(expect.stringMatching(/not supported/i));

		// Even when navigator exists with requestMIDIAccess: undefined (E2E unsupported mock)
		const prevNav = globalThis.navigator;
		Object.defineProperty(globalThis, 'navigator', {
			configurable: true,
			value: { requestMIDIAccess: undefined }
		});
		try {
			expect(controller.isSupported()).toBe(false);
		} finally {
			Object.defineProperty(globalThis, 'navigator', {
				configurable: true,
				value: prevNav
			});
		}
		controller.dispose();
	});

	it('gesture-gates requestMIDIAccess with sysex: false and handles denial cleanly', async () => {
		const requester = vi.fn(async () => {
			throw new Error('MIDI access denied by test');
		});
		const handlers = makeHandlers();
		const controller = createMidiController(handlers, { requestMIDIAccess: requester });

		expect(controller.isSupported()).toBe(true);
		expect(requester).not.toHaveBeenCalled();

		const result = await controller.requestAccess();
		expect(requester).toHaveBeenCalledOnce();
		expect(requester).toHaveBeenCalledWith({ sysex: false });
		expect(result.ok).toBe(false);
		expect(result.error).toMatch(/denied/i);
		expect(handlers.onStatus).toHaveBeenCalledWith(expect.stringMatching(/denied/i));
		controller.dispose();
	});

	it('attaches only one midimessage listener per input and decodes Note, Pitch Bend, CC1, CC64, and CC123', async () => {
		const input = new FakeMidiInput('in-1', 'Mock Studio 88');
		const { access } = createFakeAccess([input]);
		const requester = vi.fn(async () => access);
		const handlers = makeHandlers();
		const controller = createMidiController(handlers, { requestMIDIAccess: requester });

		const res = await controller.requestAccess();
		expect(res.ok).toBe(true);
		expect(res.selectedId).toBe('in-1');
		expect(input.listenerCount).toBe(1);

		// Note On C4 vel 100 -> single callback invocation
		input.emit([0x90, 60, 100]);
		expect(handlers.onNoteOn).toHaveBeenCalledOnce();
		expect(handlers.onNoteOn).toHaveBeenCalledWith(60, 100 / 127, 100, 0);

		// Note On with velocity 0 -> treated as Note Off
		input.emit([0x90, 60, 0]);
		expect(handlers.onNoteOff).toHaveBeenCalledWith(60, 0);

		// Note Off (0x8n) on channel 2
		input.emit([0x82, 64, 40]);
		expect(handlers.onNoteOff).toHaveBeenCalledWith(64, 2);

		// 14-bit Pitch Bend: min, center, max
		input.emit([0xe0, 0x00, 0x00]);
		expect(handlers.onPitchBend).toHaveBeenLastCalledWith(-1, 0);
		input.emit([0xe0, 0x00, 0x40]);
		expect(handlers.onPitchBend).toHaveBeenLastCalledWith(0, 0);
		input.emit([0xe0, 0x7f, 0x7f]);
		expect(handlers.onPitchBend).toHaveBeenLastCalledWith(1, 0);

		// CC1 Mod Wheel
		input.emit([0xb0, 1, 96]);
		expect(handlers.onModWheel).toHaveBeenLastCalledWith(96 / 127, 0);

		// CC64 Sustain Pedal (0..63 false, 64..127 true)
		input.emit([0xb0, 64, 63]);
		expect(handlers.onSustain).toHaveBeenLastCalledWith(false, 0);
		input.emit([0xb0, 64, 64]);
		expect(handlers.onSustain).toHaveBeenLastCalledWith(true, 0);

		// CC123 All Notes Off
		input.emit([0xb1, 123, 0]);
		expect(handlers.onAllNotesOff).toHaveBeenLastCalledWith(1);

		// SysEx and malformed short packets are ignored safely
		input.emit([0xf0, 0x7e, 0x7f, 0xf7]);
		input.emit([0x90]);
		input.emit([0x40, 0x60]);
		expect(handlers.onNoteOn).toHaveBeenCalledOnce();

		controller.dispose();
		expect(input.listenerCount).toBe(0);
	});

	it('falls back to onmidimessage when addEventListener is unavailable and handles hotplug + selectInput', async () => {
		const inputA = new FakeMidiInput('a', 'Alpha Keys', 'Acme', 'connected', false);
		const inputB = new FakeMidiInput('b', 'Beta Pad', 'Acme', 'connected', true);
		const { access, rawAccess, map } = createFakeAccess([inputA, inputB]);
		const handlers = makeHandlers();
		const controller = createMidiController(handlers, {
			requestMIDIAccess: async () => access
		});

		await controller.requestAccess();
		expect(controller.getSelectedInputId()).toBe('a');
		expect(inputA.listenerCount).toBe(1);

		inputA.emit([0x90, 48, 80]);
		expect(handlers.onNoteOn).toHaveBeenCalledWith(48, 80 / 127, 80, 0);

		// Switch input to B
		expect(controller.selectInput('b')).toBe(true);
		expect(inputA.listenerCount).toBe(0);
		expect(inputB.listenerCount).toBe(1);

		// Hotplug disconnect of B -> auto-falls back to A
		inputB.state = 'disconnected';
		rawAccess.onstatechange?.call(access, {} as MIDIConnectionEvent);
		expect(controller.getSelectedInputId()).toBe('a');
		expect(inputB.listenerCount).toBe(0);
		expect(inputA.listenerCount).toBe(1);

		// Add new input C
		const inputC = new FakeMidiInput('c', 'Cello Breath');
		map.set('c', inputC as unknown as MIDIInput);
		rawAccess.onstatechange?.call(access, {} as MIDIConnectionEvent);
		expect(controller.getInputs().map((i) => i.id)).toEqual(['a', 'b', 'c']);

		controller.dispose();
		expect(rawAccess.onstatechange).toBeNull();
		expect(inputA.listenerCount).toBe(0);

		// Events emitted after dispose do nothing
		inputA.emit([0x90, 60, 100]);
		expect(handlers.onNoteOn).toHaveBeenCalledOnce();
	});

	it('cancels pending requestAccess cleanly if disposed before resolution', async () => {
		let resolvePromise!: (access: MIDIAccess) => void;
		const input = new FakeMidiInput('in-1', 'Late Device');
		const { access } = createFakeAccess([input]);
		const controller = createMidiController(makeHandlers(), {
			requestMIDIAccess: () =>
				new Promise<MIDIAccess>((resolve) => {
					resolvePromise = resolve;
				})
		});

		const pending = controller.requestAccess();
		controller.dispose();
		resolvePromise(access);
		const result = await pending;
		expect(result.ok).toBe(false);
		expect(input.listenerCount).toBe(0);
	});

	it('decodeMidiMessage handles edge and malformed inputs safely without misclassifying >= 0x80 data bytes', () => {
		expect(decodeMidiMessage(null)).toBeNull();
		expect(decodeMidiMessage(new Uint8Array([]))).toBeNull();
		expect(decodeMidiMessage(new Uint8Array([0x90, 60]))).toBeNull();
		expect(decodeMidiMessage(new Uint8Array([0x80, 60]))).toBeNull();
		expect(decodeMidiMessage(new Uint8Array([0x90, 60, 128]))).toBeNull();
		expect(decodeMidiMessage(new Uint8Array([0x90, 128, 64]))).toBeNull();
		expect(decodeMidiMessage(new Uint8Array([0xb0, 64, 128]))).toBeNull();
		expect(decodeMidiMessage(new Uint8Array([0xf8, 0x00, 0x00]))).toBeNull();
	});

	it('preserves explicit selectInput(null) deselection across onstatechange and covers CC120 + 0/127 bounds', async () => {
		const inputA = new FakeMidiInput('a', 'Alpha Keys');
		const inputB = new FakeMidiInput('b', 'Beta Pad', 'Acme', 'disconnected');
		const { access, rawAccess, map } = createFakeAccess([inputA, inputB]);
		const handlers = makeHandlers();
		const controller = createMidiController(handlers, {
			requestMIDIAccess: async () => access
		});

		await controller.requestAccess();
		expect(controller.getSelectedInputId()).toBe('a');
		expect(controller.selectInput('b')).toBe(false);

		// CC120 All Sound Off + boundary notes 0 and 127
		inputA.emit([0xb0, 120, 0]);
		expect(handlers.onAllNotesOff).toHaveBeenCalledWith(0);
		inputA.emit([0x90, 0, 1]);
		expect(handlers.onNoteOn).toHaveBeenLastCalledWith(0, 1 / 127, 1, 0);
		inputA.emit([0x90, 127, 127]);
		expect(handlers.onNoteOn).toHaveBeenLastCalledWith(127, 1, 127, 0);

		// Explicit null deselection persists across onstatechange hotplug events
		expect(controller.selectInput(null)).toBe(true);
		expect(controller.getSelectedInputId()).toBeNull();
		expect(inputA.listenerCount).toBe(0);

		const inputC = new FakeMidiInput('c', 'Gamma Keys');
		map.set('c', inputC as unknown as MIDIInput);
		rawAccess.onstatechange?.call(access, {} as MIDIConnectionEvent);
		expect(controller.getSelectedInputId()).toBeNull();
		expect(inputA.listenerCount).toBe(0);
		expect(inputC.listenerCount).toBe(0);

		// Re-selecting a valid input clears explicit deselection
		expect(controller.selectInput('c')).toBe(true);
		expect(controller.getSelectedInputId()).toBe('c');
		expect(inputC.listenerCount).toBe(1);
		controller.dispose();
	});
});
