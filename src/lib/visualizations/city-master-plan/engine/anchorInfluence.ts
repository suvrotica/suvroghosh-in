import { anchorCells } from './anchors';
import type { BitSet } from './bitset';
import type { AnchorId, CityConfig, CityPass, TileVariant } from './types';

export const ANCHOR_INFLUENCE_RADIUS = 4;

/**
 * Returns the deterministic, cell-local multiplier used by weighted observation.
 *
 * The influence reaches only four Manhattan steps and fades linearly. Values stay deliberately
 * modest: an anchor nudges nearby negotiations, but it does not write a hidden neighbourhood plan.
 */
export function anchorWeightMultiplier(
	anchorId: AnchorId,
	pass: CityPass,
	tags: readonly string[],
	distance: number
): number {
	const decay = influenceDecay(distance);
	if (decay === 0 || pass === 'infrastructure') return 1;

	const has = (...wanted: readonly string[]) => wanted.some((tag) => tags.includes(tag));
	let adjustment = 0;

	switch (anchorId) {
		case 'sweet-shop':
			if (pass === 'fabric') {
				if (has('lane')) adjustment += 0.32;
				if (has('junction')) adjustment += 0.12;
				if (has('footpath')) adjustment += 0.1;
				if (has('open', 'courtyard')) adjustment += 0.05;
			} else {
				if (has('service')) adjustment += 0.18;
				if (has('house')) adjustment += 0.13;
				if (has('tea-stall', 'shop')) adjustment += 0.1;
			}
			break;
		case 'tea-stall':
			if (pass === 'fabric') {
				if (has('lane', 'footpath')) adjustment += 0.24;
				if (has('junction')) adjustment += 0.1;
				if (has('open', 'courtyard')) adjustment += 0.08;
			} else {
				if (has('service', 'stall')) adjustment += 0.16;
				if (has('house')) adjustment += 0.1;
			}
			break;
		case 'old-house':
			if (pass === 'fabric') {
				if (has('buildable')) adjustment += 0.12;
				if (has('walkable', 'open')) adjustment += 0.06;
			} else if (has('house')) {
				adjustment += 0.2;
			}
			break;
		case 'temple':
			if (pass === 'fabric') {
				if (has('open', 'courtyard')) adjustment += 0.28;
				if (has('walkable', 'junction')) adjustment += 0.08;
			} else if (has('landmark', 'service', 'open-space')) {
				adjustment += 0.18;
			}
			break;
		case 'pond':
			// Keep the authored water/socket footprint exact; the softer influence belongs to the
			// occupation pass around it (ghats, trees, and other low-mass uses).
			if (pass === 'occupation') {
				if (has('ghat', 'open-space', 'tree')) adjustment += 0.2;
				if (has('building')) adjustment -= 0.08;
			}
			break;
		case 'garage':
			if (pass === 'fabric') {
				if (has('vehicle-access', 'road')) adjustment += 0.28;
				if (has('lane')) adjustment += 0.06;
			} else if (has('garage', 'workshop', 'vehicle-frontage')) {
				adjustment += 0.18;
			}
			break;
		case 'tram-stop':
			if (pass === 'fabric') {
				if (has('tram')) adjustment += 0.34;
				if (has('road', 'junction')) adjustment += 0.08;
			} else if (has('tram-stop', 'service')) {
				adjustment += 0.18;
			}
			break;
		case 'banyan-tree':
			if (pass === 'fabric') {
				if (has('open')) adjustment += 0.38;
				if (has('tree-substrate')) adjustment += 0.14;
				if (has('walkable', 'footpath')) adjustment += 0.06;
				if (has('buildable')) adjustment -= 0.18;
			} else {
				if (has('tree', 'open-space')) adjustment += 0.4;
				if (has('empty')) adjustment += 0.14;
				if (has('occupied', 'building')) adjustment -= 0.3;
				if (has('obstruction')) adjustment -= 0.08;
			}
			break;
		case 'flyover-pillar':
			if (pass === 'fabric') {
				if (has('open')) adjustment += 0.18;
				if (has('buildable', 'walkable')) adjustment += 0.06;
			} else {
				if (has('empty', 'open-space')) adjustment += 0.12;
				if (has('building')) adjustment -= 0.08;
			}
			break;
		case 'sand-pile':
			if (pass === 'fabric') {
				if (has('walkable', 'open')) adjustment += 0.1;
			} else if (has('obstruction', 'empty')) {
				adjustment += 0.1;
			}
			break;
	}

	return clamp(1 + adjustment * decay, 0.7, 1.55);
}

/**
 * Attaches immutable per-cell scales to the wave. The collapse engine's ordinary compatibility
 * masks remain untouched; only Shannon entropy and weighted candidate choice see these values.
 */
export function applyAnchorWeightInfluence(
	config: CityConfig,
	wave: readonly BitSet[],
	variants: readonly TileVariant[],
	width: number
): void {
	const footprint = anchorCells(config.anchor);
	for (let index = 0; index < wave.length; index += 1) {
		const x = index % width;
		const y = Math.floor(index / width);
		const distance = footprint.reduce(
			(nearest, cell) => Math.min(nearest, Math.abs(x - cell.x) + Math.abs(y - cell.y)),
			Number.POSITIVE_INFINITY
		);
		if (distance > ANCHOR_INFLUENCE_RADIUS) continue;
		const scales = new Float64Array(variants.length);
		for (const variant of variants) {
			scales[variant.index] = anchorWeightMultiplier(
				config.anchor.id,
				variant.pass,
				variant.tags,
				distance
			);
		}
		wave[index].setObservationWeightScales(scales);
	}
}

function influenceDecay(distance: number): number {
	if (!Number.isFinite(distance)) return 0;
	const steps = Math.max(0, Math.floor(distance));
	return Math.max(0, 1 - steps / (ANCHOR_INFLUENCE_RADIUS + 1));
}

function clamp(value: number, minimum: number, maximum: number): number {
	return Math.max(minimum, Math.min(maximum, value));
}
