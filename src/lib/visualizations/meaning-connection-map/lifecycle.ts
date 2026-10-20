type OverflowStyle = Pick<
	CSSStyleDeclaration,
	'getPropertyValue' | 'getPropertyPriority' | 'setProperty' | 'removeProperty'
>;

interface ScrollDocument {
	body: { style: OverflowStyle };
	documentElement: { style: OverflowStyle };
}

const overflowProperties = ['overflow', 'overflow-x', 'overflow-y'] as const;

export function lockMeaningMapScroll(document: ScrollDocument): () => void {
	const previous = [document.body.style, document.documentElement.style].map((style) => ({
		style,
		properties: overflowProperties.map((name) => ({
			name,
			value: style.getPropertyValue(name),
			priority: style.getPropertyPriority(name)
		}))
	}));
	for (const { style } of previous) style.setProperty('overflow', 'hidden');
	let released = false;

	return () => {
		if (released) return;
		released = true;
		for (const { style, properties } of previous) {
			style.removeProperty('overflow');
			for (const { name, value, priority } of properties) {
				if (value) style.setProperty(name, value, priority);
			}
		}
	};
}

interface GraphSimulation {
	on(event: string, listener: null): unknown;
	stop(): unknown;
}

interface GraphElements {
	interrupt(): unknown;
	on(event: string, listener: null): unknown;
}

interface GraphSvg extends GraphElements {
	selectAll(selector: string): GraphElements;
	remove(): unknown;
}

export function ownMeaningMapResources(
	simulation: GraphSimulation,
	svg: GraphSvg,
	releaseZoom: () => void
): () => void {
	const settleTimer = setTimeout(() => simulation.stop(), 8000);
	let disposed = false;

	return () => {
		if (disposed) return;
		disposed = true;
		clearTimeout(settleTimer);
		simulation.on('tick', null);
		simulation.stop();
		// An active gesture can still dispatch through its window listener until mouseup.
		releaseZoom();
		// D3 interrupts only the selected elements, so descendants need their own interruption.
		const descendants = svg.selectAll('*');
		descendants.interrupt();
		descendants.on('click', null);
		svg.interrupt();
		svg.on('.zoom', null);
		svg.on('click', null);
		svg.remove();
	};
}
