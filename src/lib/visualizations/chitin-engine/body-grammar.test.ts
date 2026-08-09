import { describe, expect, it } from 'vitest';
import { buildBodyGraph, validateBodyGraph } from './body-grammar';
import { DEFAULT_GENOME } from './genome';
import { genomeForPreset } from './presets';
import type { BodyGraph } from './types';

describe('Chitin Engine body-plan grammar', () => {
	it('builds a connected, valid graph for the default xeno specimen', () => {
		const graph = buildBodyGraph(DEFAULT_GENOME);
		const validation = validateBodyGraph(graph, DEFAULT_GENOME);
		expect(validation).toEqual({ valid: true, issues: [] });
		expect(graph.nodes.filter((node) => node.kind === 'body-segment')).toHaveLength(
			DEFAULT_GENOME.bodySegments
		);
		expect(graph.sockets.filter((socket) => socket.kind === 'walking')).toHaveLength(
			DEFAULT_GENOME.walkingLegPairs * 2
		);
	});

	it('places insect legs and wings on the thoracic region', () => {
		const genome = genomeForPreset('reactor-mantis');
		const graph = buildBodyGraph(genome);
		const thoraxStart = graph.regionBoundaries[1];
		const thoraxEnd = graph.regionBoundaries[2];
		const locomotor = graph.sockets.filter(
			(socket) => socket.kind === 'walking' || socket.kind === 'wing'
		);
		expect(graph.sockets.filter((socket) => socket.kind === 'walking')).toHaveLength(6);
		expect(graph.sockets.filter((socket) => socket.kind === 'antenna')).toHaveLength(2);
		expect(graph.sockets.filter((socket) => socket.kind === 'wing')).toHaveLength(4);
		expect(
			locomotor.every(
				(socket) => socket.segmentIndex >= thoraxStart && socket.segmentIndex < thoraxEnd
			)
		).toBe(true);
		expect(validateBodyGraph(graph, genome).valid).toBe(true);
	});

	it('keeps arachnid, myriapod, and crawler attachments discipline-correct', () => {
		const arachnid = genomeForPreset('basalt-widow');
		const arachnidGraph = buildBodyGraph(arachnid);
		expect(arachnidGraph.sockets.filter((socket) => socket.kind === 'walking')).toHaveLength(8);
		expect(
			arachnidGraph.sockets.some((socket) => socket.kind === 'antenna' || socket.kind === 'wing')
		).toBe(false);
		expect(validateBodyGraph(arachnidGraph, arachnid).valid).toBe(true);

		for (const preset of ['brine-cathedral-centipede', 'frostglass-plate-crawler'] as const) {
			const genome = genomeForPreset(preset);
			const graph = buildBodyGraph(genome);
			expect(
				graph.sockets.filter((socket) => socket.kind === 'walking').length
			).toBeGreaterThanOrEqual(12);
			expect(graph.sockets.some((socket) => socket.kind === 'wing')).toBe(false);
			expect(validateBodyGraph(graph, genome).valid).toBe(true);
		}
	});

	it('reports broken references, duplicate nodes, orphan sockets, and disconnection', () => {
		const graph = buildBodyGraph(DEFAULT_GENOME);
		const broken: BodyGraph = {
			...graph,
			nodes: [
				...graph.nodes,
				graph.nodes[0],
				{ id: 'orphan', kind: 'terminal', region: 0, segmentIndex: 0 }
			],
			edges: [...graph.edges, { from: 'missing', to: 'segment:0', kind: 'attachment' }],
			sockets: [
				...graph.sockets,
				{ id: 'socket-without-node', segmentIndex: 0, side: 0, kind: 'terminal' }
			]
		};
		const result = validateBodyGraph(broken, DEFAULT_GENOME);
		expect(result.valid).toBe(false);
		expect(result.issues.some((issue) => issue.includes('Duplicate node'))).toBe(true);
		expect(result.issues.some((issue) => issue.includes('missing node'))).toBe(true);
		expect(result.issues.some((issue) => issue.includes('not connected'))).toBe(true);
		expect(result.issues.some((issue) => issue.includes('no appendage node'))).toBe(true);
	});

	it('rejects missing required appendage modules and socket-kind mismatches', () => {
		const genome = genomeForPreset('reactor-mantis');
		const graph = buildBodyGraph(genome);
		const missingWings: BodyGraph = {
			...graph,
			nodes: graph.nodes.filter((node) => node.kind !== 'wing'),
			edges: graph.edges.filter(
				(edge) => !edge.from.startsWith('wing:') && !edge.to.startsWith('wing:')
			),
			sockets: graph.sockets.filter((socket) => socket.kind !== 'wing')
		};
		expect(validateBodyGraph(missingWings, genome).issues).toContain(
			'Wing attachment count does not match the compatible normalized genome.'
		);

		const first = graph.sockets[0];
		const wrongKind: BodyGraph = {
			...graph,
			sockets: [{ ...first, kind: 'wing' }, ...graph.sockets.slice(1)]
		};
		expect(
			validateBodyGraph(wrongKind, genome).issues.some((issue) =>
				issue.includes('disagrees with its appendage kind')
			)
		).toBe(true);
	});
});
