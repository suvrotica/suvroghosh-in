import type { Attachment } from 'svelte/attachments';

export const MAX_REVEAL_DELAY = 320;

const pendingElements = new Set<HTMLElement>();

let observer: IntersectionObserver | null = null;
let motionObserver: MutationObserver | null = null;
let isListeningForMotion = false;

function isStillMotion(): boolean {
	return document.documentElement.dataset.motion === 'still';
}

function stopWatchingMotion(): void {
	if (isListeningForMotion) {
		window.removeEventListener('site-motion-change', handleMotionChange);
		isListeningForMotion = false;
	}

	motionObserver?.disconnect();
	motionObserver = null;
}

function disposeSharedResourcesWhenIdle(): void {
	if (pendingElements.size > 0) return;

	observer?.disconnect();
	observer = null;
	stopWatchingMotion();
}

function revealElement(element: HTMLElement): void {
	element.classList.add('is-visible');

	if (pendingElements.delete(element)) {
		observer?.unobserve(element);
	}

	disposeSharedResourcesWhenIdle();
}

function revealPendingElements(): void {
	for (const element of [...pendingElements]) {
		revealElement(element);
	}
}

function handleMotionChange(): void {
	if (isStillMotion()) revealPendingElements();
}

function watchMotion(): void {
	if (!isListeningForMotion) {
		window.addEventListener('site-motion-change', handleMotionChange);
		isListeningForMotion = true;
	}

	if (motionObserver === null && typeof MutationObserver !== 'undefined') {
		motionObserver = new MutationObserver(handleMotionChange);
		motionObserver.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ['data-motion']
		});
	}
}

function getObserver(): IntersectionObserver | null {
	if (typeof IntersectionObserver === 'undefined') return null;
	if (observer) return observer;

	observer = new IntersectionObserver(
		(entries) => {
			for (const entry of entries) {
				if (entry.isIntersecting) {
					revealElement(entry.target as HTMLElement);
				}
			}
		},
		{
			root: null,
			rootMargin: '0px 0px -60px 0px',
			threshold: 0.1
		}
	);

	return observer;
}

export function clampRevealDelay(delay: number): number {
	if (!Number.isFinite(delay)) return 0;
	return Math.min(MAX_REVEAL_DELAY, Math.max(0, delay));
}

/**
 * Progressively enhances an element with a one-time viewport reveal.
 *
 * The element remains in its final, visible state in SSR and without JavaScript.
 * Client CSS may only apply a pre-entry transform after this attachment adds
 * `reveal-enhanced`.
 */
export const reveal: Attachment<HTMLElement> = (element) => {
	if (isStillMotion()) {
		element.classList.add('is-visible');
		return;
	}

	const sharedObserver = getObserver();
	if (!sharedObserver) {
		element.classList.add('is-visible');
		return;
	}

	element.classList.add('reveal-enhanced');
	pendingElements.add(element);
	watchMotion();
	sharedObserver.observe(element);

	return () => {
		if (pendingElements.delete(element)) {
			sharedObserver.unobserve(element);
		}
		disposeSharedResourcesWhenIdle();
	};
};
