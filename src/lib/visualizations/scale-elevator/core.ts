import type {
	ElevatorState,
	FloorDefinition,
	FloorReading,
	Measurement,
	OxygenModel,
	ScenarioId
} from './types';

/** All scene extents are illustrative viewing widths, never calibrated model dimensions. */
export const FLOORS: readonly FloorDefinition[] = [
	{
		id: 'ion',
		name: 'Ion',
		question: 'Where can oxygen bind?',
		verb: 'Bind',
		extent: '2 nm viewing width · schematic haem',
		metres: 2e-9,
		context: 'physical',
		quantity: 'Occupancy of one haem iron site',
		unit: 'site',
		denominator: 'One available binding site',
		interval: 'One illustrative instant; trajectories have no calibrated time',
		support: 'One iron centre in a haem group',
		basis: 'Authored structural schematic; reversible state, not molecular dynamics',
		takeaway: 'A local binding state cannot describe a person’s oxygen status.',
		description:
			'An O₂ molecule approaches the iron centre in haem. Oxygen binds reversibly; the oxygen thread follows a role, not one molecule through the whole journey.',
		transition: 'Pull back from one iron centre to four haem sites within a haemoglobin molecule.',
		controlLabel: 'Binding state',
		controlUnit: 'illustrative state',
		lowLabel: 'Unbound',
		highLabel: 'Bound'
	},
	{
		id: 'molecule',
		name: 'Molecule',
		question: 'How does a carrier change capacity?',
		verb: 'Carry',
		extent: '10 nm viewing width · haemoglobin',
		metres: 1e-8,
		context: 'physical',
		quantity: 'Ensemble binding-site occupancy',
		unit: '%',
		denominator: 'All haem sites in a schematic ensemble',
		interval: 'Equilibrium illustration; no binding-rate prediction',
		support: 'Haemoglobin molecules inside a red blood cell',
		basis: 'Calculated illustrative Hill curve: n = 2.7, P₅₀ = 26 mmHg; no pH or temperature model',
		takeaway: 'A fraction means little until its denominator is known.',
		description:
			'Four haem sites give each haemoglobin molecule four possible oxygen passengers. The displayed mean occupancy describes many sites, rather than fractional oxygen on one molecule.',
		transition:
			'Change anatomical context: oxygen leaves red-cell transport and approaches an adjacent tissue cell. Mature mammalian red cells have no mitochondria.',
		controlLabel: 'Local O₂ partial pressure',
		controlUnit: '10–100 mmHg',
		lowLabel: '10 mmHg',
		highLabel: '100 mmHg'
	},
	{
		id: 'membrane',
		name: 'Membrane',
		question: 'What crosses, and why?',
		verb: 'Cross',
		extent: '200 nm viewing width · membrane thickness ≈5 nm',
		metres: 2e-7,
		context: 'anatomical',
		quantity: 'Normalised oxygen flux density',
		unit: 'relative units',
		denominator: 'Unit area; fixed illustrative permeability',
		interval: 'Per model interval; no physical time calibration',
		support: 'A tissue-cell membrane patch',
		basis: 'Linear gradient response J = P × ΔC with P = 1 in normalised units',
		takeaway:
			'A concentration gradient drives transport; flux also depends on permeability and area.',
		description:
			'Directional crossings encode net transport across a boundary. Changing the driving gradient changes flux while membrane area and permeability remain fixed.',
		transition: 'Widen the tissue-cell context to see where the incoming oxygen is consumed.',
		controlLabel: 'Driving gradient',
		controlUnit: 'relative units',
		lowLabel: '0.15 ×',
		highLabel: '1.85 ×'
	},
	{
		id: 'cell',
		name: 'Cell',
		question: 'Where is oxygen used?',
		verb: 'Consume',
		extent: '30 µm viewing width · tissue cell',
		metres: 3e-5,
		context: 'physical',
		quantity: 'Normalised cellular oxygen uptake',
		unit: 'relative units',
		denominator: 'One schematic tissue cell',
		interval: 'Per model interval; no physical time calibration',
		support: 'A mitochondria-containing tissue cell, not a red blood cell',
		basis: 'Authored demand response; no ATP-yield or respiration-kinetics prediction',
		takeaway: 'Oxygen is consumed in respiration; it does not turn directly into ATP.',
		description:
			'Mitochondria use oxygen as the terminal electron acceptor in respiration. Its reduction to water helps sustain the proton gradient used to produce ATP.',
		transition:
			'Pull back from one consuming cell to many cells at different distances from capillaries.',
		controlLabel: 'Metabolic demand',
		controlUnit: 'relative units',
		lowLabel: '0.4 ×',
		highLabel: '1.6 ×'
	},
	{
		id: 'tissue',
		name: 'Tissue',
		question: 'Who is far from the supply?',
		verb: 'Distribute',
		extent: '1 mm viewing width · capillary neighbourhood',
		metres: 1e-3,
		context: 'physical',
		quantity: 'Relative local supply index',
		unit: 'relative units',
		denominator: 'One selected tissue region; reference perfusion = 1',
		interval: 'Steady authored spatial illustration',
		support: 'A schematic capillary neighbourhood',
		basis:
			'Distance-decay illustration scaled by perfusion; not a diffusion PDE or measured pO₂ field',
		takeaway: 'A tissue-wide average can conceal local shortage.',
		description:
			'Capillaries bring supply close to some cells and leave longer paths to others. The field makes spatial inequality visible without claiming a calibrated oxygen concentration.',
		transition: 'Follow the capillary neighbourhood into a larger branching organ circulation.',
		controlLabel: 'Local perfusion',
		controlUnit: 'relative flow',
		lowLabel: '0.35 ×',
		highLabel: '1.65 ×'
	},
	{
		id: 'organ',
		name: 'Organ',
		question: 'Can flow meet regional demand?',
		verb: 'Perfuse',
		extent: '20 cm viewing width · schematic heart',
		metres: 0.2,
		context: 'anatomical',
		quantity: 'Oxygen delivered to one model region',
		unit: 'mL O₂/min',
		denominator: 'One of four schematic myocardial regions',
		interval: 'Per minute; steady synthetic physiology',
		support:
			'Four regions with a reference 5% of systemic flow; local changes are not redistributed',
		basis:
			'Calculated content × assigned flow; authored regional weights, no clinical failure threshold',
		takeaway: 'Regional flow and demand can differ even when whole-body totals look sufficient.',
		description:
			'Inspect branching flows to four tissue regions. The dial changes flow to the selected region. Organ dysfunction has many causes; this supply illustration does not diagnose it.',
		transition: 'Change from one organ to systemic blood transport through a person.',
		controlLabel: 'Selected-region perfusion',
		controlUnit: 'relative flow',
		lowLabel: '0.3 ×',
		highLabel: '1.7 ×'
	},
	{
		id: 'person',
		name: 'Person',
		question: 'How much oxygen is being delivered?',
		verb: 'Deliver',
		extent: '2 m viewing width · systemic circulation',
		metres: 2,
		context: 'anatomical',
		quantity: 'Systemic arterial oxygen delivery',
		unit: 'mL O₂/min',
		denominator: 'One synthetic adult circulation',
		interval: 'Per minute; steady model',
		support: 'Lungs, arterial blood, heart, and consuming tissues',
		basis: 'CaO₂ = 1.34 × Hb × SaO₂/100 + 0.003 × PaO₂; DO₂ = CO × CaO₂ × 10',
		takeaway: 'The same saturation can coexist with different oxygen content and delivery.',
		description:
			'Saturation is a fraction of available binding sites. Haemoglobin concentration sets carrying capacity, and cardiac output determines how much oxygenated blood moves each minute.',
		transition: 'Keep the person in view while changing to the bedside measurement context.',
		controlLabel: 'Cardiac output before scenario',
		controlUnit: 'L blood/min',
		lowLabel: '3 L/min',
		highLabel: '7 L/min'
	},
	{
		id: 'bed',
		name: 'Hospital bed',
		question: 'What does the monitor actually tell us?',
		verb: 'Observe',
		extent: '4 m viewing width · bedside context',
		metres: 4,
		context: 'organisational',
		quantity: 'Estimated peripheral oxygen saturation (SpO₂)',
		unit: '%',
		denominator: 'Estimated oxygenated fraction of arterial haemoglobin',
		interval: 'One selected minute of a synthetic 12-minute trace',
		support: 'One fictional patient observation',
		basis: 'Deterministic synthetic trace and arbitrary quality index; not device validation data',
		takeaway: 'A monitor percentage is one observation, with uncertainty and clinical context.',
		description:
			'Inspect a timeline beside the patient. SpO₂ estimates saturation: motion, poor perfusion, skin pigmentation, placement and other factors can affect accuracy. Signal quality is contextual, not a confidence interval.',
		transition:
			'Change the denominator from one monitored person to twelve beds consuming source gas.',
		controlLabel: 'Trace inspection time',
		controlUnit: 'minutes',
		lowLabel: 'Minute 0',
		highLabel: 'Minute 11'
	},
	{
		id: 'ward',
		name: 'Ward',
		question: 'What happens when individual needs accumulate?',
		verb: 'Aggregate',
		extent: '40 m viewing width · twelve occupied beds',
		metres: 40,
		context: 'organisational',
		quantity: 'Ward oxygen-source gas demand',
		unit: 'L/min',
		denominator: 'Twelve occupied fictional beds in the selected ward',
		interval: 'Per minute; constant synthetic demand',
		support: 'Source gas: 99% oxygen, 20°C, 101.3 kPa throughout infrastructure model',
		basis: 'Sum of declared per-bed source-gas draws; unrelated to SpO₂',
		takeaway: 'Equal occupancy does not imply equal oxygen-service demand.',
		description:
			'Compare three wards with twelve occupied beds each and different source-demand profiles. All draws use the same gas-reference conditions so their sum is meaningful.',
		transition: 'Follow the ward’s supply line into the hospital distribution network.',
		controlLabel: 'Per-bed source demand multiplier',
		controlUnit: 'relative draw',
		lowLabel: '0.6 ×',
		highLabel: '1.4 ×'
	},
	{
		id: 'hospital',
		name: 'Hospital',
		question: 'Where does capacity become a bottleneck?',
		verb: 'Allocate',
		extent: '400 m viewing width · source and distribution',
		metres: 400,
		context: 'organisational',
		quantity: 'Unmet oxygen-source gas demand',
		unit: 'L/min',
		denominator: 'Three fictional wards, twelve beds per ward',
		interval: 'Per minute; steady allocation',
		support: 'Source gas: 99% oxygen, 20°C, 101.3 kPa',
		basis: 'Ward draws capped by branch capacity; source shared proportionally over capped draws',
		takeaway: 'Nominal source capacity can hide a constrained ward connection.',
		description:
			'Inspect source, trunk and ward branches. Allocation never exceeds a ward’s demand, its branch capacity, or the shared source. A constrained branch can leave oxygen undeliverable elsewhere in the network.',
		transition: 'Pull back to three fictional hospitals and the infrastructure replenishing them.',
		controlLabel: 'Ward C distribution capacity',
		controlUnit: 'L/min',
		lowLabel: '30 L/min',
		highLabel: '150 L/min'
	},
	{
		id: 'city',
		name: 'City',
		question: 'How does oxygen become infrastructure?',
		verb: 'Coordinate',
		extent: '20 km viewing width · fictional city',
		metres: 20000,
		context: 'organisational',
		quantity: 'Reserve at the current net draw',
		unit: 'h',
		denominator: 'Three fictional hospitals and one shared reserve',
		interval: 'Constant-rate projection over a 24-hour planning horizon',
		support: 'Source gas: 99% oxygen, 20°C, 101.3 kPa; stock in gas-equivalent litres',
		basis: 'Stock ÷ max(demand − replenishment, 0); no decline while inflow covers draw',
		takeaway: 'Oxygen becomes a problem of geography, replenishment, resilience and time.',
		description:
			'A self-contained fictional map joins hospitals and supply facilities. Adjust replenishment to see reserve endurance change. The projection assumes fixed rates and ideal shared access; local hospital bottlenecks remain separate.',
		transition:
			'Return to any floor: the role continues, while the quantity and denominator change.',
		controlLabel: 'City replenishment rate',
		controlUnit: 'L/min',
		lowLabel: '0 L/min',
		highLabel: '1300 L/min'
	}
];

export const SCENARIOS: readonly {
	id: ScenarioId;
	name: string;
	description: string;
	held: string;
}[] = [
	{
		id: 'baseline',
		name: 'Baseline',
		description: 'A declared synthetic reference at every floor.',
		held: 'SaO₂ 98%; PaO₂ 100 mmHg; Hb 15 g/dL; cardiac output 5 L/min at the centre dial.'
	},
	{
		id: 'haemoglobin',
		name: 'Same saturation · less haemoglobin',
		description:
			'Hb changes from 15 to 8 g/dL. Oxygen content and delivery fall while saturation stays at 98%.',
		held: 'SaO₂, PaO₂, blood flow, molecular mechanism, and service-gas demand remain fixed.'
	},
	{
		id: 'flow',
		name: 'Same content · less blood flow',
		description:
			'Cardiac output is multiplied by 0.6: 5 → 3 L/min at the centre dial. Delivery falls.',
		held: 'Hb, SaO₂, PaO₂, oxygen content, and service-gas demand remain fixed.'
	},
	{
		id: 'demand',
		name: 'Same beds · more service demand',
		description:
			'All 36 occupied beds draw 1.8 times their reference source gas. The change aggregates to hospital and city.',
		held: 'Bed counts, fictional patient saturation, blood physiology, and supply capacities remain fixed.'
	}
];

export const DEFAULT_STATE: ElevatorState = {
	progress: 0,
	scenario: 'baseline',
	control: 0.5,
	selected: 0,
	seed: 271828
};
export const TOUR_DURATION = 52;
const LAST = FLOORS.length - 1;
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));
const finite = (value: unknown, fallback: number) =>
	typeof value === 'number' && Number.isFinite(value) ? value : fallback;
const total = (values: readonly number[]) => values.reduce((sum, value) => sum + value, 0);

export function normaliseState(value: Partial<ElevatorState>): ElevatorState {
	return {
		progress: clamp(finite(value.progress, DEFAULT_STATE.progress), 0, LAST),
		scenario: SCENARIOS.some((scenario) => scenario.id === value.scenario)
			? value.scenario!
			: DEFAULT_STATE.scenario,
		control: clamp(finite(value.control, DEFAULT_STATE.control), 0, 1),
		selected: Math.round(clamp(finite(value.selected, DEFAULT_STATE.selected), 0, 35)),
		seed: Math.round(clamp(finite(value.seed, DEFAULT_STATE.seed), 1, 2147483646))
	};
}

/** Retain the previous stop for a 0.08-wide overlap around each midpoint. */
export function floorAt(progress: number, previous?: number): number {
	const p = clamp(finite(progress, 0), 0, LAST);
	if (
		Number.isInteger(previous) &&
		previous! >= 0 &&
		previous! <= LAST &&
		Math.abs(p - previous!) <= 0.54
	)
		return previous!;
	return Math.round(p);
}

function queryNumber(params: URLSearchParams, key: string): number | undefined {
	const raw = params.get(key);
	if (raw === null || raw.trim() === '') return undefined;
	const value = Number(raw);
	return Number.isFinite(value) ? value : undefined;
}

export function parseState(search: string): ElevatorState {
	const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
	return normaliseState({
		progress: queryNumber(params, 'se-scale'),
		scenario: params.get('se-scenario') as ScenarioId,
		control: queryNumber(params, 'se-control'),
		selected: queryNumber(params, 'se-selected'),
		seed: queryNumber(params, 'se-seed')
	});
}

export function encodeState(state: ElevatorState): string {
	const safe = normaliseState(state);
	const params = new URLSearchParams({
		'se-scale': String(safe.progress),
		'se-scenario': safe.scenario,
		'se-control': String(safe.control),
		'se-selected': String(safe.selected),
		'se-seed': String(safe.seed)
	});
	return params.toString();
}

/** Eleven two-second holds separated by ten three-second smooth transitions. */
export function tourProgress(seconds: number): number {
	const t = clamp(finite(seconds, 0), 0, TOUR_DURATION);
	const stop = Math.min(LAST, Math.floor(t / 5));
	const local = t - stop * 5;
	if (stop === LAST || local <= 2) return stop;
	const u = clamp((local - 2) / 3, 0, 1);
	return stop + u * u * (3 - 2 * u);
}

/** Authored distance-decay field in relative spatial units; not a diffusion solution. */
export function tissueSupply(distance: number, perfusion: number): number {
	return Math.max(0, finite(perfusion, 0)) * Math.exp(-Math.max(0, finite(distance, 0)) * 0.7);
}

/** Framework-independent educational calculations. No renderer or camera state enters the model. */
export function evaluateModel(input: ElevatorState): OxygenModel {
	const state = normaliseState(input);
	const floor = floorAt(state.progress);
	const c = state.control;
	const partialPressure = 100;
	const saturation = 98; // percent, converted explicitly in the content equation below
	const haemoglobin = state.scenario === 'haemoglobin' ? 8 : 15; // g/dL
	const cardiacOutput = (floor === 6 ? 3 + 4 * c : 5) * (state.scenario === 'flow' ? 0.6 : 1); // L blood/min
	const content = 1.34 * haemoglobin * (saturation / 100) + 0.003 * partialPressure; // mL O₂/dL blood
	const delivery = cardiacOutput * content * 10; // 10 dL/L
	const localPressure = floor === 1 ? 10 + 90 * c : 100;
	const occupancy =
		floor === 0 ? (c >= 0.5 ? 1 : 0) : localPressure ** 2.7 / (26 ** 2.7 + localPressure ** 2.7);
	const gradient = floor === 2 ? 0.15 + 1.7 * c : 1;
	const uptake = floor === 3 ? 0.4 + 1.2 * c : 1;
	const perfusion = floor === 4 ? 0.35 + 1.3 * c : floor === 5 ? 0.3 + 1.4 * c : 1;
	const regionalDelivery = [0.3, 0.26, 0.24, 0.2].map(
		(weight, index) =>
			delivery * 0.05 * weight * (floor === 5 && index === state.selected % 4 ? perfusion : 1)
	);
	const regionalDemand = [12, 10, 9, 8]; // authored references, mL O₂/min, not measured myocardial uptake
	// Explicit source draws, never inferred from SpO₂ or physiological consumption.
	const profiles = [
		[0, 2, 2, 3, 3, 4, 4, 5, 5, 6, 8, 10],
		[2, 2, 3, 4, 4, 5, 6, 6, 8, 10, 12, 15],
		[3, 4, 4, 5, 6, 8, 8, 10, 12, 15, 18, 20]
	];
	const demandMultiplier =
		(state.scenario === 'demand' ? 1.8 : 1) * (floor === 8 ? 0.6 + 0.8 * c : 1);
	const bedDemands = profiles.flat().map((draw) => draw * demandMultiplier);
	const wardDemands = profiles.map((_, index) =>
		total(bedDemands.slice(index * 12, index * 12 + 12))
	);
	const wardCapacities = [100, 110, floor === 9 ? 30 + 120 * c : 90];
	const hospitalCapacity = 300;
	const capped = wardDemands.map((demand, index) => Math.min(demand, wardCapacities[index]));
	const cappedTotal = total(capped);
	const sourceShare = cappedTotal > 0 ? Math.min(1, hospitalCapacity / cappedTotal) : 0;
	const wardAllocated = capped.map((draw) => draw * sourceShare);
	const hospitalDemand = total(wardDemands);
	const hospitalAllocated = total(wardAllocated);
	// City hospitals have declared 1.0, 0.8 and 1.2 demand multipliers: total = 3.0.
	const cityDemand = hospitalDemand * 3;
	const citySupply = floor === 10 ? 1300 * c : 650;
	const stock = 240000; // gas-equivalent L at the same reference conditions as every draw
	const netDraw = cityDemand - citySupply;
	const reserveHours = netDraw > 0 ? stock / netDraw / 60 : null;
	let seed = state.seed >>> 0;
	const random = () => {
		seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
		return seed / 4294967296;
	};
	const trace = Array.from({ length: 12 }, (_, minute) => ({
		minute,
		saturation:
			Math.round((97.8 + Math.sin(minute * 0.7) * 0.6 + (random() - 0.5) * 0.5) * 10) / 10,
		quality: minute === 5 || minute === 6 ? 0.42 : Math.round((0.87 + random() * 0.11) * 100) / 100
	}));
	return {
		occupancy,
		boundSites: Math.round(occupancy * 4),
		gradient,
		flux: gradient,
		uptake,
		perfusion,
		saturation,
		haemoglobin,
		partialPressure,
		content,
		cardiacOutput,
		delivery,
		regionalDelivery,
		regionalDemand,
		bedDemands,
		wardDemands,
		wardAllocated,
		wardCapacities,
		hospitalDemand,
		hospitalCapacity,
		hospitalAllocated,
		unmet: Math.max(0, hospitalDemand - hospitalAllocated),
		cityDemand,
		citySupply,
		stock,
		reserveHours,
		trace
	};
}

const measure = (
	label: string,
	value: number | null,
	unit: string,
	precision = 1
): Measurement => ({ label, value, unit, precision });

export function readingFor(index: number, input: ElevatorState, model: OxygenModel): FloorReading {
	const state = normaliseState(input);
	const floor = floorAt(index);
	const region = state.selected % 4;
	const ward = Math.floor(state.selected / 12);
	const minute = Math.round(state.control * 11);
	const point = model.trace[minute];
	const effect =
		state.scenario === 'baseline'
			? 'Baseline synthetic reference. The local dial changes only the active floor’s declared parameter.'
			: state.scenario === 'demand'
				? floor >= 8
					? 'Same occupied beds; source-gas draws ×1.8. Supply capacities and patient physiology are held constant.'
					: 'This infrastructure scenario does not change this local mechanism or the patient’s physiology.'
				: floor >= 5 && floor <= 7
					? state.scenario === 'haemoglobin'
						? 'Same 98% saturation; haemoglobin 15 → 8 g/dL. Content and delivery change; source-gas draws do not.'
						: 'Same oxygen content; cardiac output ×0.6. Delivery changes; source-gas draws do not.'
					: 'This blood-transport scenario does not change the local mechanism or the declared service-gas demand.';
	const readings: FloorReading[] = [
		{
			primary: measure('Iron site occupied', model.occupancy, 'of 1 site', 0),
			secondary: [measure('Available binding sites', 1, 'site', 0)],
			insight:
				'The dial selects a reversible schematic state. This is not a molecular trajectory calculation.',
			effect
		},
		{
			primary: measure('Ensemble occupancy', model.occupancy * 100, '%'),
			secondary: [
				measure('Illustrative partial pressure', 10 + 90 * state.control, 'mmHg'),
				measure('Sites per haemoglobin', 4, 'sites', 0)
			],
			insight:
				'The Hill curve describes an ensemble mean. Each individual site remains bound or unbound; its population average can be fractional.',
			effect
		},
		{
			primary: measure('Normalised flux density', model.flux, 'relative units', 2),
			secondary: [
				measure('Driving gradient', model.gradient, 'relative units', 2),
				measure('Fixed permeability', 1, 'relative units', 0)
			],
			insight:
				'Area and permeability are held fixed. The dial changes the normalised concentration difference, so net flux changes linearly.',
			effect
		},
		{
			primary: measure('Cellular oxygen uptake', model.uptake, 'relative units', 2),
			secondary: [measure('Reference uptake', 1, 'relative units', 0)],
			insight:
				'An authored demand response, per cell per model interval. Oxygen is reduced to water; the drawing does not calculate ATP yield.',
			effect
		},
		{
			primary: measure(
				'Relative local supply index',
				tissueSupply((state.selected % 4) * 0.8, model.perfusion),
				'relative units',
				2
			),
			secondary: [
				measure('Perfusion input', model.perfusion, '× reference', 2),
				measure('Sampled distance', (state.selected % 4) * 0.8, 'relative spatial units', 1)
			],
			insight:
				'The spatial field decays with distance from a capillary and scales with perfusion. Its colours are a relative supply illustration, not measured tissue pO₂.',
			effect
		},
		{
			primary: measure(
				`Delivery · region ${region + 1}`,
				model.regionalDelivery[region],
				'mL O₂/min'
			),
			secondary: [
				measure('Authored regional demand', model.regionalDemand[region], 'mL O₂/min'),
				measure(
					'Delivery minus reference demand',
					model.regionalDelivery[region] - model.regionalDemand[region],
					'mL O₂/min'
				),
				measure('Assigned organ delivery', total(model.regionalDelivery), 'mL O₂/min'),
				measure('Selected perfusion', model.perfusion, '× reference', 2)
			],
			insight:
				'Four authored regional weights share a reference 5% of systemic flow. Adjusting one region does not simulate compensating flow or diagnose organ failure.',
			effect
		},
		{
			primary: measure('Systemic delivery', model.delivery, 'mL O₂/min', 0),
			secondary: [
				measure('Arterial saturation SaO₂', model.saturation, '%', 0),
				measure('Haemoglobin', model.haemoglobin, 'g/dL'),
				measure('Oxygen content CaO₂', model.content, 'mL O₂/dL blood', 2),
				measure('Cardiac output', model.cardiacOutput, 'L blood/min')
			],
			insight:
				'Content = 1.34 × Hb × SaO₂/100 + 0.003 × PaO₂. Delivery = content × cardiac output × 10 dL/L. PaO₂ is held at 100 mmHg.',
			effect
		},
		{
			primary: measure(`SpO₂ · minute ${minute}`, point.saturation, '%'),
			secondary: [
				measure('Illustrative signal-quality index', point.quality, '0–1', 2),
				measure('Contextual Hb', model.haemoglobin, 'g/dL'),
				measure('Contextual delivery', model.delivery, 'mL O₂/min', 0)
			],
			insight:
				'All trace values are synthetic. The quality index is arbitrary, not a confidence interval. SpO₂ alone neither measures blood oxygen content nor prescribes source-gas flow.',
			effect
		},
		{
			primary: measure(
				`Ward ${String.fromCharCode(65 + ward)} demand`,
				model.wardDemands[ward],
				'L/min'
			),
			secondary: [
				measure('Occupied beds in each ward', 12, 'beds', 0),
				measure(
					`Selected bed ${(state.selected % 12) + 1} source draw`,
					model.bedDemands[state.selected],
					'L/min'
				),
				...model.wardDemands.map((demand, i) =>
					measure(`Ward ${String.fromCharCode(65 + i)} source draw`, demand, 'L/min')
				)
			],
			insight:
				'Three wards have equal occupancy but different declared per-bed source draws. Gas is 99% O₂ at 20°C and 101.3 kPa throughout; draws include no inferred relation to patient SpO₂.',
			effect
		},
		{
			primary: measure('Unmet source-gas demand', model.unmet, 'L/min'),
			secondary: [
				measure('Total demand', model.hospitalDemand, 'L/min'),
				measure('Nominal source capacity', model.hospitalCapacity, 'L/min'),
				measure('Deliverable allocation', model.hospitalAllocated, 'L/min'),
				measure('Ward C branch capacity', model.wardCapacities[2], 'L/min')
			],
			insight:
				'Each branch is capped before shared-source allocation. Draws remain in one gas convention: 99% O₂, 20°C, 101.3 kPa. More nominal source capacity cannot by itself clear a branch bottleneck.',
			effect
		},
		{
			primary: measure(
				'Reserve at current net draw',
				model.reserveHours,
				model.reserveHours === null ? 'no net depletion' : 'h'
			),
			secondary: [
				measure('City demand', model.cityDemand, 'L/min'),
				measure('Replenishment', model.citySupply, 'L/min'),
				measure('Shared inventory', model.stock, 'L gas equivalent', 0),
				measure('Planning horizon', 24, 'h', 0)
			],
			insight: `Three hospitals use 1.0, 0.8 and 1.2 times the reference hospital demand. ${model.reserveHours === null ? 'Replenishment covers demand, so constant-rate reserve does not decline.' : 'Reserve hours = 240,000 L ÷ (demand − replenishment) ÷ 60.'} This is ideal shared stock; local delivery bottlenecks still require separate attention.`,
			effect
		}
	];
	return readings[floor];
}
