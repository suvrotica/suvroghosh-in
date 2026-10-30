/// <reference lib="webworker" />
import { parseHTML, DOMParser } from 'linkedom';
import { renderToString } from '@plantuml/core';
import { checkPlantUmlSecurity, sanitizeSvg } from './security';

// The official TeaVM engine uses a DOM to construct SVG and canvas to measure text.
// This detached DOM cannot execute scripts or load resources. The worker has no
// host filesystem and never receives cookies, credentials, or application state.
const { document } = parseHTML('<html><head></head><body></body></html>');
// XML processing instructions are not needed for an SVG image; never emit them.
Object.assign(document, { createProcessingInstruction: () => document.createComment('') });
const createElement = document.createElement.bind(document);
document.createElement = ((name: string) =>
	name.toLowerCase() === 'canvas'
		? new OffscreenCanvas(1, 1)
		: createElement(name)) as typeof document.createElement;
const createElementNS = document.createElementNS.bind(document);
document.createElementNS = ((ns: string, name: string) => {
	const element = createElementNS(ns, name);
	if (name === 'text') {
		Object.assign(element, {
			getBBox() {
				const ctx = new OffscreenCanvas(1, 1).getContext('2d')!;
				const size = Number(element.getAttribute('font-size')) || 14;
				ctx.font = `${size}px ${element.getAttribute('font-family') || 'sans-serif'}`;
				const metrics = ctx.measureText(element.textContent || '');
				return {
					x: 0,
					y: -(metrics.fontBoundingBoxAscent || size),
					width: metrics.width,
					height: metrics.fontBoundingBoxAscent + metrics.fontBoundingBoxDescent || size * 1.2
				};
			}
		});
	}
	return element;
}) as typeof document.createElementNS;
const deny = () => {
	throw new Error('Network and external resources are disabled in UML rendering.');
};
Object.assign(globalThis, {
	document,
	window: { document },
	DOMParser,
	XMLSerializer: class {
		serializeToString(node: { toString(): string }) {
			return node.toString();
		}
	},
	fetch: deny,
	XMLHttpRequest: undefined,
	WebSocket: undefined,
	EventSource: undefined,
	importScripts: deny,
	PLANTUML_FILE_LOADER: (_path: string, _from: string, _ok: unknown, fail: (s: string) => void) =>
		fail('File includes are disabled.'),
	PLANTUML_STDLIB_LOADER: (_url: string, _ok: unknown, fail: (s: string) => void) => {
		fail('External libraries are disabled.');
		return true;
	}
});

// Smetana is the engine's bundled JavaScript graph layout: no WASM eval or remote assets.
self.onmessage = async (event: MessageEvent<{ id: number; source: string }>) => {
	const { id, source } = event.data;
	try {
		const security = checkPlantUmlSecurity(source);
		if (!security.safe)
			throw new Error(security.violations.map((v) => `Line ${v.line}: ${v.message}`).join('\n'));
		if (!/^\s*@startuml\b/.test(source) || !/@enduml\s*$/.test(source))
			throw new Error('Source must contain a complete @startuml … @enduml document.');
		const svg = await new Promise<string>((resolve, reject) =>
			renderToString(source.split(/\r?\n/), resolve, reject, { maxSvgSize: 6000 })
		);
		if (svg.length > 4_000_000)
			throw new Error('Rendered SVG exceeds the 4 MB limit. Split this diagram.');
		// Syntax failures may be returned as SVG rather than through the error callback.
		// Match the engine's diagnostic header, not ordinary user labels about errors.
		const textNodes = [...svg.matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/g)].map((match) =>
			match[1].replace(/<[^>]*>/g, '').trim()
		);
		if (
			/^PlantUML version /.test(textNodes[0] || '') &&
			/^\[From (?:textarea|string) \(line \d+\)\s*\]/.test(textNodes[1] || '')
		) {
			const text = svg
				.replace(/<[^>]+>/g, ' ')
				.replace(/\s+/g, ' ')
				.trim();
			throw new Error(`PlantUML could not render this source: ${text.slice(-900)}`);
		}
		// Export a self-contained light-paper figure. Black labels remain readable
		// in dark host pages and in standalone SVG viewers without host CSS.
		const clean = sanitizeSvg(svg).replace(
			/(<svg\b[^>]*>)/,
			'$1<rect x="0" y="0" width="100%" height="100%" fill="#fcfbf8"/>'
		);
		if (!clean.includes('<svg') || !/<(?:text|path|rect|ellipse|polygon)\b/.test(clean))
			throw new Error('PlantUML did not produce a diagram.');
		self.postMessage({ id, svg: clean });
	} catch (error) {
		self.postMessage({
			id,
			error: String(error instanceof Error ? error.message : error).slice(0, 2000)
		});
	}
};

// Start the untrusted-render deadline only after imports, setup and isolation are ready.
self.postMessage({ type: 'ready' });
