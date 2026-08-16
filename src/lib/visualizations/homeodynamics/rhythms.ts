import type { RhythmPoint, RhythmSeries, RhythmWindow } from './types';

export const HEARTBEAT_BPM = 72;
export const BREATHS_PER_MINUTE = 15;
export const TEMPERATURE_PEAK_TO_TROUGH_C = 1.1;

export function secondsPerBeat(beatsPerMinute: number): number {
	if (!Number.isFinite(beatsPerMinute) || beatsPerMinute <= 0) {
		throw new RangeError('beatsPerMinute must be a positive finite number');
	}
	return 60 / beatsPerMinute;
}

export function secondsPerBreath(breathsPerMinute: number): number {
	if (!Number.isFinite(breathsPerMinute) || breathsPerMinute <= 0) {
		throw new RangeError('breathsPerMinute must be a positive finite number');
	}
	return 60 / breathsPerMinute;
}

export function halfRangeFromPeakToTrough(excursion: number): number {
	if (!Number.isFinite(excursion) || excursion < 0) {
		throw new RangeError('excursion must be a non-negative finite number');
	}
	return excursion / 2;
}

function sample(duration: number, step: number, valueAt: (t: number) => number): RhythmPoint[] {
	const points: RhythmPoint[] = [];
	for (let t = 0; t <= duration + step / 2; t += step) {
		points.push({ t: Number(t.toFixed(8)), value: valueAt(t) });
	}
	return points;
}

function gaussianPulse(phase: number, centre: number, width: number): number {
	const wrapped = Math.min(Math.abs(phase - centre), 1 - Math.abs(phase - centre));
	return Math.exp(-0.5 * (wrapped / width) ** 2);
}

function series20Seconds(): RhythmSeries[] {
	const beatPeriod = secondsPerBeat(HEARTBEAT_BPM);
	return [
		{
			id: 'heartbeat',
			label: 'Heartbeat',
			unit: 'illustrative pulse level',
			window: '20s',
			kind: 'model-derived',
			markDescription: 'Generated pulse shape; only its illustrative period is source-supported.',
			sourceId: 'heartbeat',
			points: sample(20, 0.04, (t) => {
				const phase = (t % beatPeriod) / beatPeriod;
				return 0.12 + 0.88 * gaussianPulse(phase, 0.18, 0.035);
			}),
			domain: [0, 1],
			stroke: '#d04f3c',
			note: 'The generated trace uses 72 beats/min; the separately sourced adult resting range is 60–100 beats/min.'
		},
		{
			id: 'breathing',
			label: 'Breathing',
			unit: 'normalized cycle',
			window: '20s',
			kind: 'model-derived',
			markDescription:
				'Generated sinusoid; only its illustrative cycle length is source-supported.',
			sourceId: 'breathing',
			points: sample(20, 0.08, (t) => 0.5 - 0.45 * Math.cos((2 * Math.PI * t) / 4)),
			domain: [0, 1],
			stroke: '#167d80',
			dash: '9 4',
			note: 'The generated trace uses 15 breaths/min; the separately sourced adult resting range is 12–20 breaths/min.'
		},
		{
			id: 'mayer-wave',
			label: 'Mayer pressure wave',
			unit: 'normalized amplitude',
			window: '20s',
			kind: 'model-derived',
			markDescription: 'Generated normalized sinusoid at the cited approximate frequency.',
			sourceId: 'mayer-wave',
			points: sample(20, 0.08, (t) => 0.5 + 0.42 * Math.sin((2 * Math.PI * t) / 10)),
			domain: [0, 1],
			stroke: '#6657a8',
			dash: '2 4',
			note: 'Frequency near 0.1 Hz is represented; amplitude is normalized because magnitude varies.'
		}
	];
}

function seriesTwoHours(): RhythmSeries[] {
	return [
		{
			id: 'glucose',
			label: 'Glucose (stylized)',
			unit: 'within-signal normalized level',
			window: '2h',
			kind: 'model-derived',
			markDescription: 'Generated normalized teaching curve, not a participant trace.',
			sourceId: 'glucose-insulin',
			points: sample(120, 0.5, (t) => 0.5 + 0.38 * Math.sin((2 * Math.PI * t) / 13)),
			domain: [0, 1],
			stroke: '#b15f17',
			note: 'Smooth 13-minute teaching curve, not participant data.'
		},
		{
			id: 'insulin',
			label: 'Insulin (stylized)',
			unit: 'within-signal normalized level',
			window: '2h',
			kind: 'model-derived',
			markDescription: 'Generated normalized teaching curve, not a participant trace.',
			sourceId: 'glucose-insulin',
			points: sample(120, 0.5, (t) => 0.5 + 0.34 * Math.sin((2 * Math.PI * (t - 2)) / 13)),
			domain: [0, 1],
			stroke: '#8b3a62',
			dash: '9 4',
			note: 'Stylized insulin trace lags glucose by about two minutes.'
		},
		{
			id: 'cortisol-ultradian',
			label: 'Cortisol ultradian ripple',
			unit: 'normalized modeled level',
			window: '2h',
			kind: 'model-derived',
			markDescription: 'Generated pulse-shaped teaching curve inside a literature-based time band.',
			sourceId: 'cortisol-ultradian',
			points: sample(120, 0.5, (t) => {
				const wave = Math.sin((2 * Math.PI * (t - 12)) / 90);
				return 0.24 + 0.62 * Math.max(0, wave) ** 1.7;
			}),
			domain: [0, 1],
			stroke: '#73548d',
			dash: '2 4',
			note: 'A model-derived 90-minute setting at the edge of a reviewed 60–90-minute band.'
		},
		{
			id: 'lh-gnrh',
			label: 'LH pulse timing',
			unit: 'illustrative pulse occurrence',
			window: '2h',
			kind: 'model-derived',
			markDescription:
				'Generated event marks; the literature supports the interval band, not this shape.',
			sourceId: 'lh-gnrh',
			points: sample(120, 0.5, (t) => {
				const first = Math.exp(-0.5 * ((t - 22) / 2.8) ** 2);
				const second = Math.exp(-0.5 * ((t - 102) / 2.8) ** 2);
				return Math.max(first, second);
			}),
			domain: [0, 1],
			stroke: '#35704c',
			dash: '10 3 2 3',
			note: 'Illustrative 80-minute spacing inside the early-follicular 1–2-hour interval band; luteal spacing is roughly 4 hours and LH is a GnRH surrogate.'
		}
	];
}

function seriesOneDay(): RhythmSeries[] {
	const halfRange = halfRangeFromPeakToTrough(TEMPERATURE_PEAK_TO_TROUGH_C);
	return [
		{
			id: 'core-temperature',
			label: 'Core temperature',
			unit: '°C',
			window: '24h',
			kind: 'model-derived',
			markDescription: 'Generated daily curve using a representative reported excursion and nadir.',
			sourceId: 'core-temperature',
			points: sample(24, 0.1, (t) => 36.75 + halfRange * Math.cos((2 * Math.PI * (t - 17)) / 24)),
			domain: [36.1, 37.4],
			stroke: '#c84736',
			note: 'Representative 1.1 °C peak-to-trough excursion with a modeled nadir near 05:00.'
		},
		{
			id: 'daily-pressure',
			label: 'Daily blood pressure',
			unit: '% of daytime level',
			window: '24h',
			kind: 'model-derived',
			markDescription: 'Generated normalized curve illustrating a common dipping band.',
			sourceId: 'daily-pressure',
			points: sample(24, 0.1, (t) => {
				const morning = 1 / (1 + Math.exp(-(t - 7) * 2.2));
				const bedtime = 1 / (1 + Math.exp(-(t - 23) * 2.2));
				return 85 + 15 * morning - 15 * bedtime;
			}),
			domain: [78, 103],
			stroke: '#236f92',
			dash: '9 4',
			note: 'Daytime normalized to 100%; sleep shown near 85% without inventing mmHg values.'
		},
		{
			id: 'daily-cortisol',
			label: 'Daily salivary cortisol',
			unit: 'nmol/L',
			window: '24h',
			kind: 'model-derived',
			markDescription: 'Four unconnected points from a fitted normative latent-class profile.',
			sourceId: 'daily-cortisol',
			points: [
				{ t: 7, value: 13.4, label: 'Waking' },
				{ t: 7.5, value: 20.4, label: '+30 minutes' },
				{ t: 12, value: 6, label: 'Pre-lunch' },
				{ t: 22, value: 1.5, label: 'Bedtime' }
			],
			domain: [0, 22],
			stroke: '#7b5b2d',
			connect: false,
			note: 'Four model-estimated normative-profile points from 1,101 adults. Clock placement is illustrative because sampling was event-relative.'
		}
	];
}

export function rhythmSeriesFor(window: RhythmWindow): RhythmSeries[] {
	if (window === '20s') return series20Seconds();
	if (window === '2h') return seriesTwoHours();
	return seriesOneDay();
}

export function timeDomainFor(window: RhythmWindow): readonly [number, number] {
	if (window === '20s') return [0, 20];
	if (window === '2h') return [0, 120];
	return [0, 24];
}

export function timeUnitFor(window: RhythmWindow): string {
	if (window === '20s') return 'seconds';
	if (window === '2h') return 'minutes';
	return 'hour of day';
}

export function normalizePoints(points: readonly RhythmPoint[]): RhythmPoint[] {
	const values = points.map((point) => point.value);
	const minimum = Math.min(...values);
	const maximum = Math.max(...values);
	const span = maximum - minimum;
	return points.map((point) => ({
		...point,
		value: span === 0 ? 0.5 : (point.value - minimum) / span
	}));
}
