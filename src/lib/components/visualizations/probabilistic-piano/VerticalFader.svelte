<script lang="ts">
	interface Props {
		label: string;
		value: number;
		min: number;
		max: number;
		step?: number;
		defaultValue: number;
		curve?: 'linear' | 'log';
		accent?: 'amber' | 'cyan' | 'neutral';
		springReturn?: boolean;
		compact?: boolean;
		disabled?: boolean;
		format?: (value: number) => string;
		onchange: (next: number) => void;
	}

	let {
		label,
		value,
		min,
		max,
		step,
		defaultValue,
		curve = 'linear',
		accent = 'amber',
		springReturn = false,
		compact = false,
		disabled = false,
		format,
		onchange
	}: Props = $props();

	let dragging = $state(false);
	let lastDragY = 0;
	let dragAccumNorm = 0;

	const clamp = (v: number, lo: number, hi: number) => {
		const safeLo = Number.isFinite(lo) ? lo : 0;
		const safeHi = Number.isFinite(hi) ? hi : safeLo;
		if (!Number.isFinite(v)) {
			return v === Infinity ? safeHi : safeLo;
		}
		return Math.min(safeHi, Math.max(safeLo, v));
	};

	function safeDefault(): number {
		return Number.isFinite(defaultValue) ? defaultValue : clamp(value, min, max);
	}

	function toNorm(val: number): number {
		const clamped = clamp(val, min, max);
		if (max <= min) return 0;
		if (curve === 'log' && min > 0) {
			return clamp(Math.log(clamped / min) / Math.log(max / min), 0, 1);
		}
		return clamp((clamped - min) / (max - min), 0, 1);
	}

	function snap(val: number): number {
		let next = clamp(val, min, max);
		if (step && step > 0) {
			next = min + Math.round((next - min) / step) * step;
			next = clamp(next, min, max);
			if (Number.isInteger(step) && Number.isInteger(min)) {
				next = Math.round(next);
			} else {
				next = Number(next.toFixed(6));
			}
		}
		return next;
	}

	function fromNorm(norm: number, fine = false): number {
		const clamped = clamp(norm, 0, 1);
		let raw: number;
		if (curve === 'log' && min > 0) {
			raw = min * Math.pow(max / min, clamped);
		} else {
			raw = min + clamped * (max - min);
		}
		if (fine && step && step > 0 && Number.isInteger(step)) {
			return clamp(Math.round(raw), min, max);
		}
		return snap(raw);
	}

	const norm = $derived(toNorm(value));
	const ariaValueNow = $derived(
		step && Number.isInteger(step) && Number.isInteger(min)
			? Math.round(clamp(value, min, max))
			: Number(clamp(value, min, max).toFixed(4))
	);
	const displayText = $derived(
		format ? format(clamp(value, min, max)) : String(Number(clamp(value, min, max).toFixed(2)))
	);

	function emit(next: number) {
		if (disabled) return;
		const clamped = snap(next);
		if (clamped !== value) onchange(clamped);
	}

	function onPointerDown(event: PointerEvent) {
		if (disabled || event.button !== 0) return;
		event.preventDefault();
		const target = event.currentTarget as HTMLDivElement;
		target.focus({ preventScroll: true });
		target.setPointerCapture(event.pointerId);
		dragging = true;
		lastDragY = event.clientY;
		dragAccumNorm = norm;
	}

	function onPointerMove(event: PointerEvent) {
		if (!dragging || disabled) return;
		const dy = lastDragY - event.clientY;
		lastDragY = event.clientY;
		if (dy === 0) return;
		const travel = event.shiftKey ? 750 : 150;
		dragAccumNorm = clamp(dragAccumNorm + dy / travel, 0, 1);
		const next = fromNorm(dragAccumNorm, event.shiftKey);
		if (next !== value) onchange(next);
	}

	function onPointerUp(event: PointerEvent) {
		if (!dragging) return;
		dragging = false;
		const target = event.currentTarget as HTMLDivElement;
		if (target.hasPointerCapture(event.pointerId)) {
			target.releasePointerCapture(event.pointerId);
		}
		if (springReturn) {
			onchange(snap(safeDefault()));
		}
	}

	function onDoubleClick() {
		if (disabled) return;
		onchange(snap(safeDefault()));
	}

	function stepByDirection(dir: -1 | 1, fine: boolean): number {
		const current = clamp(value, min, max);
		if (step && step > 0) {
			if (Number.isInteger(step) && Number.isInteger(min)) {
				const coarseStep = Math.max(step, Math.round((max - min) * 0.02));
				const deltaInt = fine ? step : coarseStep;
				return clamp(Math.round(current) + dir * deltaInt, min, max);
			}
			const stepCount = Math.max(2, Math.round(((max - min) * 0.02) / step));
			const deltaVal = fine ? step : step * stepCount;
			return snap(current + dir * deltaVal);
		}
		const delta = fine ? 0.004 : 0.02;
		let next = fromNorm(norm + dir * delta, fine);
		if (dir > 0 && next <= current && norm < 1) {
			next = fromNorm(Math.min(1, norm + 0.05), fine);
		} else if (dir < 0 && next >= current && norm > 0) {
			next = fromNorm(Math.max(0, norm - 0.05), fine);
		}
		return next;
	}

	function onKeyDown(event: KeyboardEvent) {
		if (disabled) return;
		let handled = true;
		const fine = event.shiftKey;
		const integerStepped = Boolean(step && Number.isInteger(step) && Number.isInteger(min));

		if (event.key === 'Home') {
			onchange(snap(min));
		} else if (event.key === 'End') {
			onchange(snap(max));
		} else if (event.key === 'ArrowUp' || event.key === 'ArrowRight') {
			onchange(stepByDirection(1, fine));
		} else if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') {
			onchange(stepByDirection(-1, fine));
		} else if (event.key === 'PageUp') {
			if (integerStepped && step) {
				const coarse = Math.max(step * 2, Math.round((max - min) * 0.1));
				onchange(clamp(Math.round(value) + coarse, min, max));
			} else {
				onchange(fromNorm(norm + 0.1));
			}
		} else if (event.key === 'PageDown') {
			if (integerStepped && step) {
				const coarse = Math.max(step * 2, Math.round((max - min) * 0.1));
				onchange(clamp(Math.round(value) - coarse, min, max));
			} else {
				onchange(fromNorm(norm - 0.1));
			}
		} else {
			handled = false;
		}

		if (handled) {
			event.preventDefault();
			event.stopPropagation();
		}
	}

	function wheelAttachment(node: HTMLElement) {
		const handleWheel = (event: WheelEvent) => {
			if (disabled) return;
			if (document.activeElement !== node && !dragging) return;
			event.preventDefault();
			event.stopPropagation();
			const dir = event.deltaY < 0 ? 1 : -1;
			emit(stepByDirection(dir, event.shiftKey));
		};
		node.addEventListener('wheel', handleWheel, { passive: false });
		return () => {
			node.removeEventListener('wheel', handleWheel);
		};
	}

	const bipolar = $derived(min < 0 && max > 0);
	const fillBottomPct = $derived(bipolar ? Math.min(norm, 0.5) * 100 : 0);
	const fillHeightPct = $derived(bipolar ? Math.abs(norm - 0.5) * 100 : norm * 100);
</script>

<div class="synth-fader" class:compact class:disabled data-accent={accent} data-tts-exclude>
	<div
		{@attach wheelAttachment}
		class="fader-track"
		role="slider"
		tabindex={disabled ? -1 : 0}
		aria-label={label}
		aria-valuemin={min}
		aria-valuemax={max}
		aria-valuenow={ariaValueNow}
		aria-valuetext={displayText}
		aria-disabled={disabled ? 'true' : undefined}
		onpointerdown={onPointerDown}
		onpointermove={onPointerMove}
		onpointerup={onPointerUp}
		onpointercancel={onPointerUp}
		onlostpointercapture={onPointerUp}
		ondblclick={onDoubleClick}
		onkeydown={onKeyDown}
	>
		<div class="fader-ticks" aria-hidden="true">
			<span></span><span></span><span></span><span></span><span></span><span></span><span
			></span><span></span><span></span>
		</div>
		<div class="fader-well" aria-hidden="true">
			<div
				class="fader-fill"
				style={`bottom:${fillBottomPct.toFixed(2)}%;height:${fillHeightPct.toFixed(2)}%`}
			></div>
			<div class="fader-thumb" style={`bottom:calc(${(norm * 100).toFixed(2)}% - 6px)`}></div>
		</div>
	</div>
	<span class="fader-label">{label}</span>
	<span class="fader-val">{displayText}</span>
</div>
