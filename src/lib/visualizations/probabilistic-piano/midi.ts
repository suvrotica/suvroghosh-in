export interface MidiInputDevice {
	readonly id: string;
	readonly name: string;
	readonly manufacturer: string;
	readonly state: string;
}

export interface MidiAccessResult {
	readonly ok: boolean;
	readonly inputs: readonly MidiInputDevice[];
	readonly selectedId: string | null;
	readonly error?: string;
}

export interface MidiHandlers {
	onNoteOn: (pitch: number, velocity: number, rawVelocity: number, channel: number) => void;
	onNoteOff: (pitch: number, channel: number) => void;
	onPitchBend?: (value: number, channel: number) => void;
	onModWheel?: (value: number, channel: number) => void;
	onSustain?: (sustain: boolean, channel: number) => void;
	onAllNotesOff?: (channel: number) => void;
	onDevicesChange?: (inputs: readonly MidiInputDevice[], selectedId: string | null) => void;
	onStatus?: (message: string) => void;
}

export interface MidiControllerOptions {
	requestMIDIAccess?: (options?: MIDIOptions) => Promise<MIDIAccess>;
}

export type DecodedMidiMessage =
	| { type: 'noteOn'; pitch: number; velocity: number; rawVelocity: number; channel: number }
	| { type: 'noteOff'; pitch: number; channel: number }
	| { type: 'pitchBend'; value: number; channel: number }
	| { type: 'modWheel'; value: number; channel: number }
	| { type: 'sustain'; sustain: boolean; channel: number }
	| { type: 'allNotesOff'; channel: number };

export interface MidiController {
	isSupported(): boolean;
	requestAccess(): Promise<MidiAccessResult>;
	selectInput(id: string | null): boolean;
	getInputs(): readonly MidiInputDevice[];
	getSelectedInputId(): string | null;
	dispose(): void;
}

function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}

export function decodeMidiMessage(data: Uint8Array | null | undefined): DecodedMidiMessage | null {
	if (!data || data.length < 3) return null;
	const status = data[0];
	// Ignore running-statusless data bytes (< 0x80) and SysEx/System Common/Realtime (>= 0xf0)
	if (status < 0x80 || status >= 0xf0) return null;

	// All supported MIDI 1.0 channel voice messages carry two 7-bit data bytes (0x00..0x7f).
	const d1 = data[1];
	const d2 = data[2];
	if (d1 > 0x7f || d2 > 0x7f) return null;

	const cmd = status & 0xf0;
	const channel = status & 0x0f;

	if (cmd === 0x90) {
		const pitch = clamp(d1, 0, 127);
		if (d2 === 0) {
			return { type: 'noteOff', pitch, channel };
		}
		const clampedVel = clamp(d2, 1, 127);
		return {
			type: 'noteOn',
			pitch,
			velocity: clampedVel / 127,
			rawVelocity: clampedVel,
			channel
		};
	}

	if (cmd === 0x80) {
		const pitch = clamp(d1, 0, 127);
		return { type: 'noteOff', pitch, channel };
	}

	if (cmd === 0xe0) {
		const val14 = (d2 << 7) | d1;
		const rawNorm = val14 <= 8192 ? (val14 - 8192) / 8192 : (val14 - 8192) / 8191;
		return {
			type: 'pitchBend',
			value: clamp(rawNorm, -1, 1),
			channel
		};
	}

	if (cmd === 0xb0) {
		if (d1 === 1) {
			return {
				type: 'modWheel',
				value: clamp(d2 / 127, 0, 1),
				channel
			};
		}
		if (d1 === 64) {
			return {
				type: 'sustain',
				sustain: d2 >= 64,
				channel
			};
		}
		if (d1 === 120 || d1 === 123) {
			return { type: 'allNotesOff', channel };
		}
	}

	return null;
}

export function createMidiController(
	handlers: MidiHandlers,
	options: MidiControllerOptions = {}
): MidiController {
	let access: MIDIAccess | null = null;
	let activeInput: MIDIInput | null = null;
	let attachedViaEventListener = false;
	let selectedId: string | null = null;
	let explicitlyDeselected = false;
	let inputs: MidiInputDevice[] = [];
	let disposed = false;
	let generation = 0;

	const getRequester = (): ((opts?: MIDIOptions) => Promise<MIDIAccess>) | null => {
		if (typeof options.requestMIDIAccess === 'function') {
			return options.requestMIDIAccess;
		}
		if (typeof navigator !== 'undefined' && typeof navigator.requestMIDIAccess === 'function') {
			return (opts) => navigator.requestMIDIAccess(opts);
		}
		return null;
	};

	const onMidiMessage = (event: MIDIMessageEvent): void => {
		if (disposed) return;
		const decoded = decodeMidiMessage(event.data);
		if (!decoded) return;
		switch (decoded.type) {
			case 'noteOn':
				handlers.onNoteOn(decoded.pitch, decoded.velocity, decoded.rawVelocity, decoded.channel);
				break;
			case 'noteOff':
				handlers.onNoteOff(decoded.pitch, decoded.channel);
				break;
			case 'pitchBend':
				handlers.onPitchBend?.(decoded.value, decoded.channel);
				break;
			case 'modWheel':
				handlers.onModWheel?.(decoded.value, decoded.channel);
				break;
			case 'sustain':
				handlers.onSustain?.(decoded.sustain, decoded.channel);
				break;
			case 'allNotesOff':
				handlers.onAllNotesOff?.(decoded.channel);
				break;
		}
	};

	const detachActiveInput = (): void => {
		if (!activeInput) return;
		if (attachedViaEventListener && typeof activeInput.removeEventListener === 'function') {
			activeInput.removeEventListener('midimessage', onMidiMessage as EventListener);
		} else if (!attachedViaEventListener) {
			activeInput.onmidimessage = null;
		}
		activeInput = null;
		attachedViaEventListener = false;
	};

	const attachInput = (input: MIDIInput): void => {
		detachActiveInput();
		activeInput = input;
		// Attach exactly ONE mechanism (never both) because mocks/browsers may fire both.
		if (typeof input.addEventListener === 'function') {
			attachedViaEventListener = true;
			input.addEventListener('midimessage', onMidiMessage as EventListener);
		} else {
			attachedViaEventListener = false;
			input.onmidimessage = onMidiMessage;
		}
	};

	const collectInputs = (
		midiAccess: MIDIAccess
	): { list: MidiInputDevice[]; map: Map<string, MIDIInput> } => {
		const map = new Map<string, MIDIInput>();
		const list: MidiInputDevice[] = [];
		midiAccess.inputs.forEach((port) => {
			map.set(port.id, port);
			list.push({
				id: port.id,
				name: port.name || 'MIDI Input',
				manufacturer: port.manufacturer || '',
				state: port.state || 'connected'
			});
		});
		list.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
		return { list, map };
	};

	const syncDevices = (notify: boolean): void => {
		if (!access || disposed) return;
		const { list, map } = collectInputs(access);
		inputs = list;

		if (explicitlyDeselected) {
			detachActiveInput();
			selectedId = null;
		} else {
			const currentPort = selectedId ? map.get(selectedId) : undefined;
			if (currentPort && currentPort.state !== 'disconnected') {
				if (activeInput !== currentPort) {
					attachInput(currentPort);
				}
			} else {
				detachActiveInput();
				const firstConnected = list.find((item) => item.state !== 'disconnected') ?? null;
				selectedId = firstConnected ? firstConnected.id : null;
				const nextPort = selectedId ? map.get(selectedId) : undefined;
				if (nextPort) attachInput(nextPort);
			}
		}

		if (notify) {
			handlers.onDevicesChange?.(inputs, selectedId);
		}
	};

	return {
		isSupported(): boolean {
			return getRequester() !== null;
		},

		async requestAccess(): Promise<MidiAccessResult> {
			if (disposed) {
				return {
					ok: false,
					inputs: [],
					selectedId: null,
					error: 'MIDI controller has been disposed.'
				};
			}
			const requester = getRequester();
			if (!requester) {
				const msg = 'Web MIDI is not supported in this browser.';
				handlers.onStatus?.(msg);
				return { ok: false, inputs: [], selectedId: null, error: msg };
			}
			if (access) {
				syncDevices(false);
				return { ok: true, inputs: [...inputs], selectedId };
			}

			const token = ++generation;
			try {
				const granted = await requester({ sysex: false });
				if (disposed || token !== generation) {
					return { ok: false, inputs: [], selectedId: null, error: 'MIDI request cancelled.' };
				}
				access = granted;
				access.onstatechange = () => {
					syncDevices(true);
				};
				syncDevices(true);
				const count = inputs.filter((item) => item.state !== 'disconnected').length;
				handlers.onStatus?.(
					count > 0
						? `MIDI connected (${inputs.find((i) => i.id === selectedId)?.name ?? 'input'}).`
						: 'MIDI ready. Connect a MIDI controller to play.'
				);
				return { ok: true, inputs: [...inputs], selectedId };
			} catch (err) {
				if (disposed || token !== generation) {
					return { ok: false, inputs: [], selectedId: null, error: 'MIDI request cancelled.' };
				}
				const detail = err instanceof Error ? err.message : String(err);
				const msg = `MIDI access denied: ${detail}`;
				handlers.onStatus?.(msg);
				return { ok: false, inputs: [], selectedId: null, error: msg };
			}
		},

		selectInput(id: string | null): boolean {
			if (disposed || !access) return false;
			if (id === null) {
				explicitlyDeselected = true;
				detachActiveInput();
				selectedId = null;
				handlers.onDevicesChange?.(inputs, null);
				return true;
			}
			const { map } = collectInputs(access);
			const port = map.get(id);
			if (!port || port.state === 'disconnected') return false;
			explicitlyDeselected = false;
			selectedId = id;
			attachInput(port);
			handlers.onDevicesChange?.(inputs, selectedId);
			return true;
		},

		getInputs(): readonly MidiInputDevice[] {
			return [...inputs];
		},

		getSelectedInputId(): string | null {
			return selectedId;
		},

		dispose(): void {
			if (disposed) return;
			disposed = true;
			generation++;
			detachActiveInput();
			if (access) {
				access.onstatechange = null;
				access = null;
			}
			inputs = [];
			selectedId = null;
			explicitlyDeselected = false;
		}
	};
}
