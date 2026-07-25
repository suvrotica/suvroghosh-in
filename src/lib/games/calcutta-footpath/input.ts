export type InputCommand = 'pause' | 'mute' | 'fullscreen' | 'restart';

type CommandHandler = (command: InputCommand) => void;

const MOVEMENT_KEYS = new Set([
	'arrowup',
	'arrowdown',
	'arrowleft',
	'arrowright',
	'w',
	'a',
	's',
	'd'
]);
const DASH_KEYS = new Set(['shift', ' ']);
const GAME_KEYS = new Set([...MOVEMENT_KEYS, ...DASH_KEYS, 'escape', 'p', 'm', 'f', 'r']);

function editableTarget(target: EventTarget | null): boolean {
	return (
		target instanceof HTMLElement &&
		(target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(target.tagName))
	);
}

export class GameInput {
	private keys = new Set<string>();
	private touchX = 0;
	private touchY = 0;
	private touchDash = false;
	private active = false;
	private destroyed = false;
	private readonly onCommand: CommandHandler;

	constructor(onCommand: CommandHandler) {
		this.onCommand = onCommand;
		window.addEventListener('keydown', this.handleKeydown, { passive: false });
		window.addEventListener('keyup', this.handleKeyup, { passive: false });
		window.addEventListener('blur', this.clear);
	}

	private handleKeydown = (event: KeyboardEvent): void => {
		if (!this.active || editableTarget(event.target)) return;
		const key = event.key.toLocaleLowerCase('en');
		if (!GAME_KEYS.has(key)) return;

		event.preventDefault();
		if (!event.repeat) {
			if (key === 'escape' || key === 'p') this.onCommand('pause');
			else if (key === 'm') this.onCommand('mute');
			else if (key === 'f') this.onCommand('fullscreen');
			else if (key === 'r') this.onCommand('restart');
		}
		this.keys.add(key);
	};

	private handleKeyup = (event: KeyboardEvent): void => {
		const key = event.key.toLocaleLowerCase('en');
		if (this.active && GAME_KEYS.has(key) && !editableTarget(event.target)) event.preventDefault();
		this.keys.delete(key);
	};

	setActive(active: boolean): void {
		this.active = active;
		if (!active) this.clear();
	}

	setTouchVector(x: number, y: number): void {
		this.touchX = Math.max(-1, Math.min(1, Number.isFinite(x) ? x : 0));
		this.touchY = Math.max(-1, Math.min(1, Number.isFinite(y) ? y : 0));
	}

	setTouchDash(pressed: boolean): void {
		this.touchDash = pressed;
	}

	vector(): { x: number; y: number; dash: boolean; source: 'keyboard' | 'touch' | 'gamepad' } {
		let x =
			(this.keys.has('arrowright') || this.keys.has('d') ? 1 : 0) -
			(this.keys.has('arrowleft') || this.keys.has('a') ? 1 : 0);
		let y =
			(this.keys.has('arrowdown') || this.keys.has('s') ? 1 : 0) -
			(this.keys.has('arrowup') || this.keys.has('w') ? 1 : 0);
		let dash = Array.from(DASH_KEYS).some((key) => this.keys.has(key));
		let source: 'keyboard' | 'touch' | 'gamepad' = 'keyboard';

		if (Math.hypot(this.touchX, this.touchY) > 0.08 || this.touchDash) {
			x = this.touchX;
			y = this.touchY;
			dash = this.touchDash;
			source = 'touch';
		}

		const pads = navigator.getGamepads?.() ?? [];
		const gamepad = Array.from(pads).find((pad) => pad?.connected);
		if (gamepad) {
			const gamepadX = Math.abs(gamepad.axes[0] ?? 0) > 0.16 ? (gamepad.axes[0] ?? 0) : 0;
			const gamepadY = Math.abs(gamepad.axes[1] ?? 0) > 0.16 ? (gamepad.axes[1] ?? 0) : 0;
			if (Math.hypot(gamepadX, gamepadY) > 0.08 || gamepad.buttons[0]?.pressed) {
				x = gamepadX;
				y = gamepadY;
				dash = Boolean(gamepad.buttons[0]?.pressed);
				source = 'gamepad';
			}
		}

		const length = Math.hypot(x, y);
		if (length > 1) {
			x /= length;
			y /= length;
		}
		return { x, y, dash, source };
	}

	clear = (): void => {
		this.keys.clear();
		this.touchX = 0;
		this.touchY = 0;
		this.touchDash = false;
	};

	destroy(): void {
		if (this.destroyed) return;
		this.destroyed = true;
		this.clear();
		window.removeEventListener('keydown', this.handleKeydown);
		window.removeEventListener('keyup', this.handleKeyup);
		window.removeEventListener('blur', this.clear);
	}
}
