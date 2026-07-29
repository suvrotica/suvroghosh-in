import type { Attachment } from 'svelte/attachments';

type TopicNodeLink = SVGElement & {
	dataset: DOMStringMap & { topicNode?: string; state?: string };
};

type TopicEdgePath = SVGElement & {
	dataset: DOMStringMap & {
		source?: string;
		state?: string;
		target?: string;
	};
};

function topicLinkFromTarget(
	element: HTMLElement,
	target: EventTarget | null
): TopicNodeLink | null {
	if (!(target instanceof Element)) return null;

	const link = target.closest<TopicNodeLink>('[data-topic-node]');
	return link && element.contains(link) ? link : null;
}

/**
 * Adds relationship emphasis to the semantic desktop topic map.
 *
 * The attachment delegates focus and fine-pointer events from one host, performs
 * no geometry reads, and leaves the complete linked map visible in SSR and
 * without JavaScript.
 */
export const exploreTopicMap: Attachment<HTMLElement> = (element) => {
	const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
	const nodes = Array.from(element.querySelectorAll<TopicNodeLink>('[data-topic-node]'));
	const edges = Array.from(element.querySelectorAll<TopicEdgePath>('[data-topic-edge]'));
	let focusedSlug: string | null = null;
	let hoveredSlug: string | null = null;

	const showRelationships = (activeSlug: string | null) => {
		if (activeSlug) {
			element.dataset.activeTopic = activeSlug;
		} else {
			delete element.dataset.activeTopic;
		}

		const directlyRelated = new Set<string>();
		for (const edge of edges) {
			const isActive = Boolean(
				activeSlug && (edge.dataset.source === activeSlug || edge.dataset.target === activeSlug)
			);
			edge.dataset.state = activeSlug ? (isActive ? 'active' : 'muted') : 'idle';

			if (!isActive) continue;
			if (edge.dataset.source !== activeSlug && edge.dataset.source) {
				directlyRelated.add(edge.dataset.source);
			}
			if (edge.dataset.target !== activeSlug && edge.dataset.target) {
				directlyRelated.add(edge.dataset.target);
			}
		}

		for (const node of nodes) {
			const slug = node.dataset.topicNode;
			node.dataset.state =
				!activeSlug || !slug
					? 'idle'
					: slug === activeSlug
						? 'active'
						: directlyRelated.has(slug)
							? 'related'
							: 'muted';
		}
	};
	const renderRelationships = () => {
		showRelationships(focusedSlug ?? hoveredSlug);
	};

	const handleFocusIn = (event: FocusEvent) => {
		const link = topicLinkFromTarget(element, event.target);
		if (link?.dataset.topicNode) {
			focusedSlug = link.dataset.topicNode;
			renderRelationships();
		}
	};
	const handleFocusOut = (event: FocusEvent) => {
		if (event.relatedTarget instanceof Node && element.contains(event.relatedTarget)) {
			const nextLink = topicLinkFromTarget(element, event.relatedTarget);
			if (nextLink?.dataset.topicNode) {
				focusedSlug = nextLink.dataset.topicNode;
				renderRelationships();
				return;
			}
		}
		focusedSlug = null;
		renderRelationships();
	};
	const handlePointerOver = (event: PointerEvent) => {
		if (!finePointer.matches || event.pointerType === 'touch') return;
		const link = topicLinkFromTarget(element, event.target);
		if (link?.dataset.topicNode) {
			hoveredSlug = link.dataset.topicNode;
			renderRelationships();
		}
	};
	const handlePointerOut = (event: PointerEvent) => {
		if (!finePointer.matches || event.pointerType === 'touch') return;
		const link = topicLinkFromTarget(element, event.target);
		if (!link) return;
		if (event.relatedTarget instanceof Node && link.contains(event.relatedTarget)) return;
		const nextLink = topicLinkFromTarget(element, event.relatedTarget);
		hoveredSlug = nextLink?.dataset.topicNode ?? null;
		renderRelationships();
	};
	const handlePointerCapabilityChange = () => {
		if (!finePointer.matches) {
			hoveredSlug = null;
			renderRelationships();
		}
	};

	element.dataset.topicMapEnhanced = 'true';
	element.addEventListener('focusin', handleFocusIn);
	element.addEventListener('focusout', handleFocusOut);
	element.addEventListener('pointerover', handlePointerOver);
	element.addEventListener('pointerout', handlePointerOut);
	finePointer.addEventListener('change', handlePointerCapabilityChange);

	return () => {
		focusedSlug = null;
		hoveredSlug = null;
		showRelationships(null);
		element.removeEventListener('focusin', handleFocusIn);
		element.removeEventListener('focusout', handleFocusOut);
		element.removeEventListener('pointerover', handlePointerOver);
		element.removeEventListener('pointerout', handlePointerOut);
		finePointer.removeEventListener('change', handlePointerCapabilityChange);
		delete element.dataset.topicMapEnhanced;
	};
};
