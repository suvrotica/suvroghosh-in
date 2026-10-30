export type MeasureId = 'phq9' | 'asrm' | 'who5';

export interface Measure {
	id: MeasureId;
	name: string;
	label: string;
	recallDays: number;
	itemMax: number;
	scoreMax: number;
	higherMeans: string;
	items: readonly { id: string; label: string }[];
	sourceUrl: string;
	responseNote: string;
}

export const MEASURE_ORDER: readonly MeasureId[] = ['phq9', 'asrm', 'who5'];
export const DEFAULT_SEED = 271828;
export const MODEL_VERSION = 'patient-x-1';
export const START_DATE = '2026-08-03';

export const MEASURES: Record<MeasureId, Measure> = {
	phq9: {
		id: 'phq9',
		name: 'PHQ-9',
		label: 'Depressive symptoms',
		recallDays: 14,
		itemMax: 3,
		scoreMax: 27,
		higherMeans: 'More reported depressive symptoms',
		items: [
			{ id: 'interest', label: 'Less interest or pleasure' },
			{ id: 'mood', label: 'Low mood or hopelessness' },
			{ id: 'sleep', label: 'Sleep difficulties' },
			{ id: 'energy', label: 'Low energy' },
			{ id: 'appetite', label: 'Appetite changes' },
			{ id: 'selfWorth', label: 'Feeling bad about oneself' },
			{ id: 'concentration', label: 'Trouble concentrating' },
			{ id: 'movement', label: 'Slowing down or restlessness' },
			{ id: 'selfHarm', label: 'Thoughts of death or self-harm' }
		],
		sourceUrl: 'https://aims.uw.edu/resource/phq-9-depression-scale/',
		responseNote: 'Short item labels describe the original questionnaire; scores use its 0–3 scale.'
	},
	asrm: {
		id: 'asrm',
		name: 'ASRM',
		label: 'Elevated mood and activity',
		recallDays: 7,
		itemMax: 4,
		scoreMax: 20,
		higherMeans: 'More reported manic symptoms on this scale',
		items: [
			{ id: 'mood', label: 'Elevated mood' },
			{ id: 'confidence', label: 'Increased confidence' },
			{ id: 'sleepNeed', label: 'Reduced need for sleep' },
			{ id: 'talking', label: 'Increased talking' },
			{ id: 'activity', label: 'Increased activity' }
		],
		sourceUrl:
			'https://www.psychiatry.org/getmedia/c1783d55-268a-47b2-9932-a549b21c8d64/APA-DSM5TR-Level2ManiaAdult.pdf',
		responseNote:
			'Brief explanatory labels; consult the linked form for original item-specific wording. This scale covers a limited set of manic symptoms and does not establish a diagnosis.'
	},
	who5: {
		id: 'who5',
		name: 'WHO-5',
		label: 'Reported well-being',
		recallDays: 14,
		itemMax: 5,
		scoreMax: 100,
		higherMeans: 'Better self-reported well-being',
		items: [
			{ id: 'spirits', label: 'Good spirits' },
			{ id: 'calm', label: 'Feeling calm' },
			{ id: 'vigour', label: 'Feeling vigorous' },
			{ id: 'rest', label: 'Feeling rested' },
			{ id: 'interest', label: 'Interest in daily life' }
		],
		sourceUrl: 'https://www.who.int/publications/m/item/WHO-UCN-MSD-MHE-2024.01',
		responseNote:
			'Short labels summarise the five items. The 0–25 raw sum is multiplied by four; 0–100 is not a percentage chance of being well.'
	}
};

export interface MeasureResponse {
	answers: number[];
	rawTotal: number;
	total: number;
	windowStart: string;
	windowEnd: string;
}

export interface Assessment {
	id: string;
	week: number;
	date: string;
	measures: Record<MeasureId, MeasureResponse>;
}

export interface PatientData {
	seed: number;
	version: string;
	patient: 'Patient X';
	synthetic: true;
	startDate: string;
	endDate: string;
	method: string;
	assessments: Assessment[];
}

// Authored teaching examples, not estimated clinical distributions. Shared visit-level
// variation keeps related answers broadly coherent without forcing the scales to agree.
const PROFILES: Record<MeasureId, number[]>[] = [
	{ phq9: [2, 2, 2, 3, 1, 2, 2, 1, 0], asrm: [0, 0, 0, 0, 0], who5: [1, 1, 1, 1, 1] },
	{ phq9: [2, 2, 2, 2, 1, 2, 2, 1, 0], asrm: [0, 0, 0, 1, 0], who5: [1, 1, 2, 1, 1] },
	{ phq9: [1, 2, 2, 1, 1, 1, 2, 2, 0], asrm: [1, 1, 2, 2, 2], who5: [2, 1, 3, 1, 2] },
	{ phq9: [1, 2, 2, 2, 1, 2, 2, 2, 0], asrm: [1, 2, 3, 3, 3], who5: [1, 0, 3, 1, 1] },
	{ phq9: [1, 1, 1, 1, 1, 1, 1, 0, 0], asrm: [0, 1, 1, 1, 1], who5: [2, 2, 2, 2, 2] },
	{ phq9: [1, 0, 1, 1, 0, 1, 1, 0, 0], asrm: [0, 0, 0, 0, 1], who5: [3, 3, 3, 3, 3] }
];

function randomFromSeed(seed: number): () => number {
	let state = seed;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let value = Math.imul(state ^ (state >>> 15), state | 1);
		value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
		return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
	};
}

function dateAtDay(day: number): string {
	return new Date(Date.parse(`${START_DATE}T00:00:00Z`) + day * 86400000)
		.toISOString()
		.slice(0, 10);
}

export function scoreAnswers(
	id: MeasureId,
	answers: readonly number[]
): { rawTotal: number; total: number } {
	const measure = MEASURES[id];
	if (
		answers.length !== measure.items.length ||
		answers.some((value) => !Number.isInteger(value) || value < 0 || value > measure.itemMax)
	) {
		throw new RangeError(
			`Expected ${measure.items.length} integer ${id} answers from 0 to ${measure.itemMax}.`
		);
	}
	const rawTotal = answers.reduce((sum, answer) => sum + answer, 0);
	return { rawTotal, total: id === 'who5' ? rawTotal * 4 : rawTotal };
}

export function generatePatient(seed = DEFAULT_SEED): PatientData {
	if (!Number.isSafeInteger(seed)) throw new RangeError('The example seed must be a safe integer.');
	const normalizedSeed = seed >>> 0;
	const random = randomFromSeed(normalizedSeed);
	const assessments = PROFILES.map((profile, index): Assessment => {
		const week = (index + 1) * 2;
		const day = week * 7 - 1;
		const date = dateAtDay(day);
		const distressShift = (random() - 0.5) * 0.8;
		const activationShift = (random() - 0.5) * 0.8;
		const wellBeingShift = -distressShift * 0.4 + (random() - 0.5) * 0.6;
		const shifts = { phq9: distressShift, asrm: activationShift, who5: wellBeingShift };
		const measures = {} as Record<MeasureId, MeasureResponse>;
		for (const id of MEASURE_ORDER) {
			const measure = MEASURES[id];
			const answers = profile[id].map((value, itemIndex) => {
				const noise = (random() - 0.5) * 0.8;
				// Keep this item explicitly fixed in the teaching example. It is never
				// inferred from the total or silently removed from the questionnaire.
				if (id === 'phq9' && itemIndex === 8) return 0;
				return Math.max(0, Math.min(measure.itemMax, Math.round(value + shifts[id] + noise)));
			});
			measures[id] = {
				answers,
				...scoreAnswers(id, answers),
				windowStart: dateAtDay(day - measure.recallDays + 1),
				windowEnd: date
			};
		}
		return { id: `week-${week}`, week, date, measures };
	});
	return {
		seed: normalizedSeed,
		version: MODEL_VERSION,
		patient: 'Patient X',
		synthetic: true,
		startDate: START_DATE,
		endDate: dateAtDay(83),
		method:
			'Six authored profiles with seeded Mulberry32 variation shared within visits and smaller item variation. All 19 answers are synthetic; totals are calculated from answers. PHQ-9 item 9 is fixed at zero. This is an educational example, not a model of illness or a typical clinical course.',
		assessments
	};
}

const FREQUENCY_RESPONSES = [
	'Not at all',
	'Several days',
	'More than half the days',
	'Nearly every day'
];
const WELL_BEING_RESPONSES = [
	'At no time',
	'Some of the time',
	'Less than half the time',
	'More than half the time',
	'Most of the time',
	'All of the time'
];
export function responseSummary(id: MeasureId, itemIndex: number, value: number): string {
	const measure = MEASURES[id];
	if (
		!Number.isInteger(itemIndex) ||
		itemIndex < 0 ||
		itemIndex >= measure.items.length ||
		!Number.isInteger(value) ||
		value < 0 ||
		value > measure.itemMax
	)
		throw new RangeError('The item and answer must be within the questionnaire range.');
	if (id === 'phq9') return FREQUENCY_RESPONSES[value];
	if (id === 'who5') return WELL_BEING_RESPONSES[value];
	return `Item score ${value}/4 (see original form)`;
}

export interface Observation {
	headline: string;
	detail: string;
	changes: { id: MeasureId; label: string; delta: number }[];
	selfHarmNote: string | null;
}

export function getObservation(data: PatientData, index: number): Observation {
	if (!Number.isInteger(index) || index < 0 || index >= data.assessments.length) {
		throw new RangeError('Choose an existing assessment.');
	}
	const current = data.assessments[index];
	const previous = data.assessments[index - 1];
	const changes = previous
		? MEASURE_ORDER.map((id) => ({
				id,
				label: MEASURES[id].name,
				delta: current.measures[id].total - previous.measures[id].total
			}))
		: [];
	let headline = 'Start with the three separate scores.';
	if (previous) {
		const [depression, activation, wellBeing] = changes.map((change) => change.delta);
		if (activation > 0 && wellBeing <= 0)
			headline = 'The mood and activity score rose; well-being did not.';
		else if (activation > 0)
			headline = 'The mood and activity score rose. So did reported well-being.';
		else if (depression < 0 && wellBeing > 0)
			headline = 'Fewer depressive symptoms; more reported well-being.';
		else if (changes.every((change) => change.delta === 0))
			headline = 'The totals are unchanged. The answers may still differ.';
		else headline = 'Read each score separately.';
	}
	const totals = MEASURE_ORDER.map(
		(id) => `${MEASURES[id].name} ${current.measures[id].total}/${MEASURES[id].scoreMax}`
	).join('; ');
	return {
		headline,
		detail: `${totals}. These are reports over different recall windows, not a diagnosis or a single good-or-bad score.`,
		changes,
		selfHarmNote:
			current.measures.phq9.answers[8] > 0
				? 'This fictional response includes thoughts of death or self-harm. In real care, that answer needs direct follow-up regardless of the total; the score cannot determine immediate risk.'
				: null
	};
}

export function patientToJson(data: PatientData): string {
	return JSON.stringify({ ...data, questionnaires: MEASURES }, null, 2);
}

export function patientToCsv(data: PatientData): string {
	const rows: (string | number | boolean)[][] = [
		[
			'generator_version',
			'seed',
			'patient',
			'synthetic',
			'assessment_id',
			'assessment_date',
			'week',
			'measure',
			'recall_days',
			'window_start',
			'window_end',
			'item_id',
			'item_label',
			'answer',
			'response_summary',
			'raw_total',
			'total',
			'scale_max'
		]
	];
	for (const assessment of data.assessments) {
		for (const id of MEASURE_ORDER) {
			const measure = MEASURES[id];
			const response = assessment.measures[id];
			response.answers.forEach((answer, index) =>
				rows.push([
					data.version,
					data.seed,
					data.patient,
					data.synthetic,
					assessment.id,
					assessment.date,
					assessment.week,
					measure.name,
					measure.recallDays,
					response.windowStart,
					response.windowEnd,
					measure.items[index].id,
					measure.items[index].label,
					answer,
					responseSummary(id, index, answer),
					response.rawTotal,
					response.total,
					measure.scoreMax
				])
			);
		}
	}
	return rows
		.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(','))
		.join('\r\n');
}
