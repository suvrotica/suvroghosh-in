import type { Attachment } from 'svelte/attachments';

const finePointerQuery = '(hover: hover) and (pointer: fine)';
const reducedMotionQuery = '(prefers-reduced-motion: reduce)';
const cardResetters = new Set<() => void>();

function resolvedAliveMotion(): boolean {
	return document.documentElement.dataset.motion === 'alive';
}

export function resetAllLivingCards(): void {
	for (const reset of cardResetters) reset();
}

/**
 * Adds bounded pointer influence to a card's decorative underlay.
 *
 * Geometry is read once on pointer entry, pointer moves share one animation
 * frame, and the host card's text/layout never tilts. CSS owns the stable
 * keyboard, still, coarse-pointer, forced-colour, and print states.
 */
export const livingCard: Attachment<HTMLElement> = (element) => {
	const finePointer = window.matchMedia(finePointerQuery);
	const reducedMotion = window.matchMedia(reducedMotionQuery);
	const forcedColours = window.matchMedia('(forced-colors: active)');
	const print = window.matchMedia('print');

	let bounds: DOMRect | null = null;
	let frame: number | null = null;
	let pointerX = 0;
	let pointerY = 0;

	element.dataset.livingCardEnhanced = 'true';

	const reset = () => {
		if (frame !== null) {
			cancelAnimationFrame(frame);
			frame = null;
		}

		bounds = null;
		element.dataset.livingCardActive = 'false';
		element.style.removeProperty('--living-card-x');
		element.style.removeProperty('--living-card-y');
		element.style.removeProperty('--living-card-rotate');
	};

	const canRespond = () =>
		resolvedAliveMotion() &&
		document.documentElement.dataset.theme !== 'high-contrast' &&
		finePointer.matches &&
		!reducedMotion.matches &&
		!forcedColours.matches &&
		!print.matches;

	const renderPointer = () => {
		frame = null;
		if (!bounds || !canRespond()) {
			reset();
			return;
		}

		const normalX = Math.max(-1, Math.min(1, ((pointerX - bounds.left) / bounds.width) * 2 - 1));
		const normalY = Math.max(-1, Math.min(1, ((pointerY - bounds.top) / bounds.height) * 2 - 1));

		element.style.setProperty('--living-card-x', `${(normalX * 5).toFixed(2)}px`);
		element.style.setProperty('--living-card-y', `${(normalY * 4).toFixed(2)}px`);
		element.style.setProperty('--living-card-rotate', `${(normalX * 1.15).toFixed(2)}deg`);
	};

	const handlePointerEnter = (event: PointerEvent) => {
		reset();
		if (!canRespond() || event.pointerType === 'touch') return;

		bounds = element.getBoundingClientRect();
		pointerX = event.clientX;
		pointerY = event.clientY;
		element.dataset.livingCardActive = 'true';
		frame = requestAnimationFrame(renderPointer);
	};

	const handlePointerMove = (event: PointerEvent) => {
		if (!bounds || event.pointerType === 'touch' || !canRespond()) {
			reset();
			return;
		}

		pointerX = event.clientX;
		pointerY = event.clientY;
		if (frame === null) frame = requestAnimationFrame(renderPointer);
	};

	const handleMotionChange = () => {
		if (!canRespond()) reset();
	};

	cardResetters.add(reset);
	element.addEventListener('pointerenter', handlePointerEnter);
	element.addEventListener('pointermove', handlePointerMove);
	element.addEventListener('pointerleave', reset);
	element.addEventListener('pointercancel', reset);
	element.addEventListener('focusin', reset);
	element.addEventListener('focusout', reset);
	window.addEventListener('blur', reset);
	window.addEventListener('site-motion-change', handleMotionChange);
	window.addEventListener('site-theme-change', handleMotionChange);
	finePointer.addEventListener('change', handleMotionChange);
	reducedMotion.addEventListener('change', handleMotionChange);
	forcedColours.addEventListener('change', handleMotionChange);
	print.addEventListener('change', handleMotionChange);

	return () => {
		cardResetters.delete(reset);
		reset();
		element.removeEventListener('pointerenter', handlePointerEnter);
		element.removeEventListener('pointermove', handlePointerMove);
		element.removeEventListener('pointerleave', reset);
		element.removeEventListener('pointercancel', reset);
		element.removeEventListener('focusin', reset);
		element.removeEventListener('focusout', reset);
		window.removeEventListener('blur', reset);
		window.removeEventListener('site-motion-change', handleMotionChange);
		window.removeEventListener('site-theme-change', handleMotionChange);
		finePointer.removeEventListener('change', handleMotionChange);
		reducedMotion.removeEventListener('change', handleMotionChange);
		forcedColours.removeEventListener('change', handleMotionChange);
		print.removeEventListener('change', handleMotionChange);
		delete element.dataset.livingCardEnhanced;
		delete element.dataset.livingCardActive;
	};
};
