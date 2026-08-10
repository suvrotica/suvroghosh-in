import type { FlightCommand } from './runtime-types';

export interface FlightControlSample {
	bank: number;
	pitch: number;
	source: 'keyboard' | 'touch' | 'gamepad';
}

const CONTROL_KEYS = new Set([
	'a',
	'd',
	'w',
	's',
	'arrowleft',
	'arrowright',
	'arrowup',
	'arrowdown',
	'escape',
	'm',
	'f',
	'r'
]);

function editableTarget(target: EventTarget | null): boolean {
	return (
		target instanceof HTMLElement &&
		(target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(target.tagName))
	);
}

export class FlightInputController {
	private readonly keys = new Set<string>();
	private touchBank = 0;
	private touchPitch = 0;
	private active = false;
	private destroyed = false;

	constructor(
		private readonly onCommand: (command: FlightCommand) => void,
		private readonly scope?: HTMLElement
	) {
		window.addEventListener('keydown', this.handleKeyDown, { passive: false });
		window.addEventListener('keyup', this.handleKeyUp, { passive: false });
		window.addEventListener('blur', this.clear);
	}

	private handleKeyDown = (event: KeyboardEvent): void => {
		if (!this.active) return;
		const key = event.key.toLocaleLowerCase('en');
		if (!CONTROL_KEYS.has(key)) return;
		if (this.scope && (!(event.target instanceof Node) || !this.scope.contains(event.target)))
			return;
		if (key === 'escape') {
			event.preventDefault();
			if (!event.repeat) this.onCommand('pause');
			return;
		}
		if (editableTarget(event.target)) return;
		event.preventDefault();
		if (!event.repeat) {
			if (key === 'm') this.onCommand('mute');
			else if (key === 'f') this.onCommand('fullscreen');
			else if (key === 'r') this.onCommand('relaunch');
		}
		this.keys.add(key);
	};

	private handleKeyUp = (event: KeyboardEvent): void => {
		const key = event.key.toLocaleLowerCase('en');
		const inScope =
			!this.scope || (event.target instanceof Node && this.scope.contains(event.target));
		if (this.active && inScope && CONTROL_KEYS.has(key) && !editableTarget(event.target))
			event.preventDefault();
		this.keys.delete(key);
	};

	setActive(active: boolean): void {
		this.active = active;
		if (!active) this.clear();
	}

	setTouchVector(bank: number, pitch: number): void {
		this.touchBank = Math.max(-1, Math.min(1, Number.isFinite(bank) ? bank : 0));
		this.touchPitch = Math.max(-1, Math.min(1, Number.isFinite(pitch) ? pitch : 0));
	}

	sample(): FlightControlSample {
		let bank =
			(this.keys.has('d') || this.keys.has('arrowright') ? 1 : 0) -
			(this.keys.has('a') || this.keys.has('arrowleft') ? 1 : 0);
		let pitch =
			(this.keys.has('w') || this.keys.has('arrowup') ? 1 : 0) -
			(this.keys.has('s') || this.keys.has('arrowdown') ? 1 : 0);
		let source: FlightControlSample['source'] = 'keyboard';

		if (Math.hypot(this.touchBank, this.touchPitch) > 0.04) {
			bank = this.touchBank;
			pitch = this.touchPitch;
			source = 'touch';
		}

		const gamepad = Array.from(navigator.getGamepads?.() ?? []).find((pad) => pad?.connected);
		if (gamepad) {
			const padBank = Math.abs(gamepad.axes[0] ?? 0) >= 0.15 ? (gamepad.axes[0] ?? 0) : 0;
			const rawPitch = Math.abs(gamepad.axes[1] ?? 0) >= 0.15 ? -(gamepad.axes[1] ?? 0) : 0;
			if (Math.hypot(padBank, rawPitch) > 0.04) {
				bank = padBank;
				pitch = rawPitch;
				source = 'gamepad';
			}
		}

		const magnitude = Math.hypot(bank, pitch);
		if (magnitude > 1) {
			bank /= magnitude;
			pitch /= magnitude;
		}
		return { bank, pitch, source };
	}

	clear = (): void => {
		this.keys.clear();
		this.touchBank = 0;
		this.touchPitch = 0;
	};

	destroy(): void {
		if (this.destroyed) return;
		this.destroyed = true;
		this.clear();
		window.removeEventListener('keydown', this.handleKeyDown);
		window.removeEventListener('keyup', this.handleKeyUp);
		window.removeEventListener('blur', this.clear);
	}
}
