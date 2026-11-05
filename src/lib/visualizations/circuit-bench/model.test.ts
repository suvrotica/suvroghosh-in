import { describe, expect, it } from 'vitest';
import {
	parseEngineeringValue,
	PARAMETER_BOUNDS,
	valueToDialNormalized,
	dialNormalizedToValue,
	stepParameterValue
} from './notation';
import {
	decodeShareUrlParam,
	deleteSelection,
	duplicateComponents,
	encodeShareUrl,
	exportCircuitJson,
	exportSchematicSvg,
	exportWaveformCsv,
	formatComponentSummary,
	importCircuitJson,
	moveComponents,
	rotateComponents,
	splitWireWithJunction
} from './model';
import { getExampleCircuit } from './examples';
import { evaluateCircuitAtInstant } from './solver';
import { loadCircuitFromStorage, saveCircuitToStorage, clearSavedCircuit } from './storage';

describe('Circuit Bench Notation, Editor Model, and Persistence', () => {
	it('parses practical engineering notation and rejects invalid values', () => {
		const rBounds = PARAMETER_BOUNDS.resistance;
		const cBounds = PARAMETER_BOUNDS.capacitance;

		const r1k = parseEngineeringValue('1k', rBounds);
		expect(r1k.ok && r1k.value).toBe(1000);
		if (r1k.ok) expect(r1k.formatted).toBe('1 kΩ');

		const r4k7 = parseEngineeringValue('4.7k', rBounds);
		expect(r4k7.ok && r4k7.value).toBeCloseTo(4700, 6);

		const rInfix = parseEngineeringValue('4k7', rBounds);
		expect(rInfix.ok && rInfix.value).toBeCloseTo(4700, 6);

		const c100n = parseEngineeringValue('100n', cBounds);
		expect(c100n.ok && c100n.value).toBeCloseTo(100e-9, 15);

		const c10u = parseEngineeringValue('10u', cBounds);
		expect(c10u.ok && c10u.value).toBeCloseTo(10e-6, 12);

		const c1000u = parseEngineeringValue('1,000 µF', cBounds);
		expect(c1000u.ok && c1000u.value).toBeCloseTo(0.001, 10);
		if (c1000u.ok) expect(c1000u.formatted).toBe('1,000 µF');

		expect(parseEngineeringValue('-5k', rBounds).ok).toBe(false);
		expect(parseEngineeringValue('0', rBounds).ok).toBe(false);
		expect(parseEngineeringValue('999G', rBounds).ok).toBe(false);
		expect(parseEngineeringValue('abc', rBounds).ok).toBe(false);
	});

	it('maps rotary dial positions and step increments accurately', () => {
		const bounds = PARAMETER_BOUNDS.resistance;
		const norm = valueToDialNormalized(1000, bounds);
		const recovered = dialNormalizedToValue(norm, bounds);
		expect(recovered).toBeCloseTo(1000, 1);

		const doubled = stepParameterValue(1000, 1, bounds, true);
		expect(doubled).toBeCloseTo(2000, 1);
		const halved = stepParameterValue(2000, -1, bounds, true);
		expect(halved).toBeCloseTo(1000, 1);
	});

	it('supports adding, moving, rotating, duplicating, wiring, splitting junctions, and deleting while preserving electrical connections', () => {
		let doc = getExampleCircuit('rc-charging');
		expect(formatComponentSummary(doc.components.find((c) => c.id === 'r1')!)).toBe('R1 · 1 kΩ');
		expect(formatComponentSummary(doc.components.find((c) => c.id === 'c1')!)).toBe(
			'C1 · 1,000 µF'
		);

		// Moving R1 preserves its wire connections and identical electrical solution
		doc = moveComponents(doc, ['r1'], 2, -1);
		const solvedMoved = evaluateCircuitAtInstant(doc, 0);
		expect(solvedMoved.ok).toBe(true);
		if (solvedMoved.ok) {
			expect(solvedMoved.snapshot.components['r1'].current).toBeCloseTo(0.005, 9);
		}

		// Rotate and duplicate
		doc = rotateComponents(doc, ['r1']);
		const dup = duplicateComponents(doc, ['r1']);
		expect('doc' in dup).toBe(true);
		if ('doc' in dup) {
			expect(dup.newIds.length).toBe(1);
			doc = deleteSelection(dup.doc, dup.newIds);
		}

		// Split a wire with an explicit junction
		const split = splitWireWithJunction(doc, 'w_r1_c1', 12, 3);
		expect('doc' in split).toBe(true);
		if ('doc' in split) {
			const solvedSplit = evaluateCircuitAtInstant(split.doc, 0);
			expect(solvedSplit.ok).toBe(true);
		}
	});

	it('validates JSON import/export, URL share codec, SVG export, CSV export, and storage fallback', () => {
		const doc = getExampleCircuit('rc-charging');
		const json = exportCircuitJson(doc);
		const imported = importCircuitJson(json);
		expect(imported.ok).toBe(true);

		// Reject malformed or invalid schema imports without throwing
		expect(importCircuitJson('{ bad json').ok).toBe(false);
		expect(importCircuitJson(JSON.stringify({ schemaVersion: 99 })).ok).toBe(false);
		expect(
			importCircuitJson(
				JSON.stringify({
					...doc,
					wires: [
						{
							id: 'bad_wire',
							from: { type: 'terminal', componentId: 'nonexistent', terminalId: 'A' },
							to: { type: 'terminal', componentId: 'r1', terminalId: 'A' }
						}
					]
				})
			).ok
		).toBe(false);

		// URL share roundtrip
		const shared = encodeShareUrl(doc);
		expect(shared.ok).toBe(true);
		if (shared.ok) {
			const decoded = decodeShareUrlParam(shared.param);
			expect(decoded.ok).toBe(true);
			if (decoded.ok) {
				expect(decoded.doc.id).toBe(doc.id);
				expect(decoded.doc.components.length).toBe(doc.components.length);
			}
		}

		// SVG and CSV exports
		const init = evaluateCircuitAtInstant(doc, 0);
		const svg = exportSchematicSvg(doc, init.ok ? init.snapshot : null);
		expect(svg).toContain('<svg');
		expect(svg).toContain('R1 · 1 kΩ');
		expect(svg).toContain('C1 · 1,000 µF');

		const csv = exportWaveformCsv(doc, [
			{ timeSec: 0, ch1: 0, ch2: 0.005 },
			{ timeSec: 1, ch1: 3.1606, ch2: 0.001839 }
		]);
		expect(csv).toContain('time_s');
		expect(csv).toContain('3.1606');

		// Storage helper with mock storage and unavailable storage fallback
		const memory = new Map<string, string>();
		const mockStorage = {
			getItem: (k: string) => memory.get(k) ?? null,
			setItem: (k: string, v: string) => memory.set(k, v),
			removeItem: (k: string) => memory.delete(k),
			clear: () => memory.clear(),
			key: () => null,
			length: 0
		} as Storage;

		const saveRes = saveCircuitToStorage(doc, mockStorage);
		expect(saveRes.ok).toBe(true);
		const loaded = loadCircuitFromStorage(mockStorage);
		expect(loaded.ok).toBe(true);
		clearSavedCircuit(mockStorage);
		expect(loadCircuitFromStorage(mockStorage).ok).toBe(false);

		const unavailableRes = saveCircuitToStorage(doc, null);
		expect(unavailableRes.ok).toBe(false);
		expect(unavailableRes.available).toBe(false);
	});
});
