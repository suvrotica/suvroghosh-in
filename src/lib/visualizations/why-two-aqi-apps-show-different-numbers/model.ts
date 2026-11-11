export const AQI_EXPLAINER_ENGINE_VERSION = '1.0.0';
export const SOURCES_CHECKED_DATE = '2026-11-11';
export const SOURCES_CHECKED_LABEL = '11 November 2026';

export type ScaleId = 'india-cpcb' | 'us-epa';

export const PM25_PRESETS = [30, 60, 90, 120] as const;
export type Pm25Preset = (typeof PM25_PRESETS)[number];
export const DEFAULT_PM25_PRESET: Pm25Preset = 60;

export const SHARED_CONCENTRATION_STRIP_MAX = 130;
export const FIXED_HOURLY_AXIS_MAX = 400;
export const OVERALL_US_AQI_AXIS_MAX = 200;

export interface BreakpointBand {
	readonly bandIndex: number;
	readonly concLow: number;
	readonly concHigh: number;
	readonly indexLow: number;
	readonly indexHigh: number;
	readonly category: string;
	readonly accentToken:
		| 'good'
		| 'satisfactory'
		| 'moderate'
		| 'usg'
		| 'unhealthy'
		| 'poor'
		| 'very-poor'
		| 'severe';
}

export interface SubIndexResult {
	readonly scaleId: ScaleId;
	readonly scaleName: string;
	readonly agencyLabel: string;
	readonly inputConcentrationUgM3: number;
	readonly effectiveConcentrationUgM3: number;
	readonly averagingHours: 24;
	readonly pollutant: 'PM2.5';
	readonly unroundedSubIndex: number;
	readonly subIndex: number;
	readonly category: string;
	readonly accentToken: BreakpointBand['accentToken'];
	readonly band: BreakpointBand;
	readonly exceedsPublished500: boolean;
}

export interface PresetComparison {
	readonly concentrationUgM3: Pm25Preset;
	readonly averagingWindowLabel: '24-hour average';
	readonly india: SubIndexResult;
	readonly us: SubIndexResult;
	readonly dynamicNote: string;
	readonly persistentNote: 'A lower number on a different scale does not mean cleaner air.';
	readonly orderingReversed: boolean;
}

export type AveragingScenarioId = 'steady-day' | 'smoke-arrives';

export interface AveragingScenario {
	readonly id: AveragingScenarioId;
	readonly label: string;
	readonly summary: string;
	readonly hourlyConcentrationsUgM3: readonly number[];
}

export interface HourlyAveragingSummary {
	readonly id: AveragingScenarioId;
	readonly label: string;
	readonly summary: string;
	readonly hourlyConcentrationsUgM3: readonly number[];
	readonly mean24hUgM3: number;
	readonly latestHourUgM3: number;
	readonly latestHourNumber: number;
	readonly yAxisMin: 0;
	readonly yAxisMax: typeof FIXED_HOURLY_AXIS_MAX;
}

export interface PollutantScoreBar {
	readonly id: 'pm25' | 'pm10' | 'ozone';
	readonly pollutantLabel: string;
	readonly score: number;
	readonly category: string;
	readonly accentToken: BreakpointBand['accentToken'];
}

export interface OverallAqiSummary {
	readonly scaleName: 'US AQI';
	readonly axisMax: typeof OVERALL_US_AQI_AXIS_MAX;
	readonly overallScore: number;
	readonly overallCategory: string;
	readonly dominantPollutantId: PollutantScoreBar['id'];
	readonly dominantPollutantLabel: string;
	readonly bars: readonly (PollutantScoreBar & {
		readonly isDominant: boolean;
		readonly widthRatio: number;
	})[];
}

export interface VerifiedSource {
	readonly id: string;
	readonly agency: string;
	readonly title: string;
	readonly versionNote: string;
	readonly checkedOn: typeof SOURCES_CHECKED_DATE;
	readonly url: string;
}

/**
 * India CPCB 24-hour PM2.5 breakpoint bands (About_AQI.pdf & How_AQI_Calculated.pdf).
 * Published category scale ends at 500 (Severe).
 */
export const INDIA_CPCB_PM25_BANDS: readonly BreakpointBand[] = [
	{
		bandIndex: 0,
		concLow: 0,
		concHigh: 30,
		indexLow: 0,
		indexHigh: 50,
		category: 'Good',
		accentToken: 'good'
	},
	{
		bandIndex: 1,
		concLow: 31,
		concHigh: 60,
		indexLow: 51,
		indexHigh: 100,
		category: 'Satisfactory',
		accentToken: 'satisfactory'
	},
	{
		bandIndex: 2,
		concLow: 61,
		concHigh: 90,
		indexLow: 101,
		indexHigh: 200,
		category: 'Moderately polluted',
		accentToken: 'moderate'
	},
	{
		bandIndex: 3,
		concLow: 91,
		concHigh: 120,
		indexLow: 201,
		indexHigh: 300,
		category: 'Poor',
		accentToken: 'poor'
	},
	{
		bandIndex: 4,
		concLow: 121,
		concHigh: 250,
		indexLow: 301,
		indexHigh: 400,
		category: 'Very poor',
		accentToken: 'very-poor'
	},
	{
		bandIndex: 5,
		concLow: 251,
		concHigh: 380,
		indexLow: 401,
		indexHigh: 500,
		category: 'Severe',
		accentToken: 'severe'
	}
] as const;

/**
 * Current US EPA 24-hour PM2.5 breakpoint bands (2024 PM NAAQS revision;
 * verified against EPA AQS code table and May 2026 Technical Assistance Document).
 * Above 325.4 µg/m³, EPA permits calculated values above 500 using the upper Hazardous slope;
 * the category remains Hazardous.
 */
export const US_EPA_PM25_BANDS: readonly BreakpointBand[] = [
	{
		bandIndex: 0,
		concLow: 0.0,
		concHigh: 9.0,
		indexLow: 0,
		indexHigh: 50,
		category: 'Good',
		accentToken: 'good'
	},
	{
		bandIndex: 1,
		concLow: 9.1,
		concHigh: 35.4,
		indexLow: 51,
		indexHigh: 100,
		category: 'Moderate',
		accentToken: 'moderate'
	},
	{
		bandIndex: 2,
		concLow: 35.5,
		concHigh: 55.4,
		indexLow: 101,
		indexHigh: 150,
		category: 'Unhealthy for Sensitive Groups',
		accentToken: 'usg'
	},
	{
		bandIndex: 3,
		concLow: 55.5,
		concHigh: 125.4,
		indexLow: 151,
		indexHigh: 200,
		category: 'Unhealthy',
		accentToken: 'unhealthy'
	},
	{
		bandIndex: 4,
		concLow: 125.5,
		concHigh: 225.4,
		indexLow: 201,
		indexHigh: 300,
		category: 'Very Unhealthy',
		accentToken: 'very-poor'
	},
	{
		bandIndex: 5,
		concLow: 225.5,
		concHigh: 325.4,
		indexLow: 301,
		indexHigh: 500,
		category: 'Hazardous',
		accentToken: 'severe'
	}
] as const;

export function assertValidNonNegativeMeasurement(value: unknown, label = 'measurement'): number {
	if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
		throw new RangeError(
			`Invalid or missing ${label}: expected a finite non-negative number (missing values are never treated as zero).`
		);
	}
	return value;
}

/**
 * Truncates a non-negative concentration to 1 decimal place per EPA PM2.5 TAD rules
 * without binary floating-point drift (e.g. 9.1 -> 9.1, 35.49 -> 35.4).
 */
export function truncateToOneDecimal(value: number): number {
	const validated = assertValidNonNegativeMeasurement(value, 'PM2.5 concentration');
	return Math.trunc(Math.round(validated * 1_000_000) / 100_000) / 10;
}

function interpolateLinear(conc: number, band: BreakpointBand): number {
	return (
		((band.indexHigh - band.indexLow) / (band.concHigh - band.concLow)) * (conc - band.concLow) +
		band.indexLow
	);
}

/**
 * Computes the India CPCB 24-hour PM2.5 sub-index.
 * CPCB breakpoints are defined on whole-number µg/m³ concentrations and capped at 500 on the published category scale.
 */
export function calculateIndiaCpcbPm25SubIndex(concentrationUgM3: number): SubIndexResult {
	const raw = assertValidNonNegativeMeasurement(concentrationUgM3, 'PM2.5 concentration');
	const effective = Math.round(raw);

	const band =
		INDIA_CPCB_PM25_BANDS.find(
			(candidate) => effective >= candidate.concLow && effective <= candidate.concHigh
		) ?? INDIA_CPCB_PM25_BANDS[INDIA_CPCB_PM25_BANDS.length - 1];

	const unrounded = effective > band.concHigh ? 500 : interpolateLinear(effective, band);
	const cappedRounded = Math.min(500, Math.round(unrounded));

	return {
		scaleId: 'india-cpcb',
		scaleName: 'India CPCB',
		agencyLabel: 'Central Pollution Control Board (CPCB)',
		inputConcentrationUgM3: raw,
		effectiveConcentrationUgM3: effective,
		averagingHours: 24,
		pollutant: 'PM2.5',
		unroundedSubIndex: unrounded,
		subIndex: cappedRounded,
		category: band.category,
		accentToken: band.accentToken,
		band,
		exceedsPublished500: false
	};
}

/**
 * Computes the current US EPA 24-hour PM2.5 sub-index.
 * Uses 1-decimal concentration truncation, piecewise linear interpolation, and nearest-integer rounding.
 * Above 325.4 µg/m³, continues with the upper Hazardous band slope (values > 500 remain Hazardous).
 */
export function calculateUsEpaPm25SubIndex(concentrationUgM3: number): SubIndexResult {
	const raw = assertValidNonNegativeMeasurement(concentrationUgM3, 'PM2.5 concentration');
	const effective = truncateToOneDecimal(raw);

	const band =
		US_EPA_PM25_BANDS.find(
			(candidate) => effective >= candidate.concLow && effective <= candidate.concHigh
		) ?? US_EPA_PM25_BANDS[US_EPA_PM25_BANDS.length - 1];

	const unrounded = interpolateLinear(effective, band);
	const subIndex = Math.round(unrounded);

	return {
		scaleId: 'us-epa',
		scaleName: 'Current US EPA',
		agencyLabel: 'US Environmental Protection Agency (EPA)',
		inputConcentrationUgM3: raw,
		effectiveConcentrationUgM3: effective,
		averagingHours: 24,
		pollutant: 'PM2.5',
		unroundedSubIndex: unrounded,
		subIndex,
		category: band.category,
		accentToken: band.accentToken,
		band,
		exceedsPublished500: subIndex > 500
	};
}

const PRESET_DYNAMIC_NOTES: Record<Pm25Preset, string> = {
	30: 'At 30 µg/m³, India’s PM2.5 score sits at the top of Good (50), while the current US scale places the same air near the top of Moderate (90).',
	60: 'Changing the scale changes the score. It removes no pollution.',
	90: 'At 90 µg/m³, the numerical ordering reverses: India’s PM2.5 score (200) is higher than the US score (175) for the same 24-hour air.',
	120: 'At 120 µg/m³, the numerical ordering reverses further: India’s PM2.5 score reaches 300 while the US score is 196 for the same 24-hour concentration.'
};

export const PERSISTENT_SCALE_NOTE =
	'A lower number on a different scale does not mean cleaner air.' as const;

export function comparePm25Preset(preset: Pm25Preset): PresetComparison {
	if (!PM25_PRESETS.includes(preset)) {
		throw new RangeError(`Unsupported PM2.5 preset: ${String(preset)}`);
	}
	const india = calculateIndiaCpcbPm25SubIndex(preset);
	const us = calculateUsEpaPm25SubIndex(preset);

	return {
		concentrationUgM3: preset,
		averagingWindowLabel: '24-hour average',
		india,
		us,
		dynamicNote: PRESET_DYNAMIC_NOTES[preset],
		persistentNote: PERSISTENT_SCALE_NOTE,
		orderingReversed: india.subIndex > us.subIndex
	};
}

export const ALL_PRESET_COMPARISONS: readonly PresetComparison[] = PM25_PRESETS.map((preset) =>
	comparePm25Preset(preset)
);

const STEADY_DAY_HOURS: readonly number[] = Array.from({ length: 24 }, () => 60);
const SMOKE_ARRIVES_HOURS: readonly number[] = Array.from({ length: 24 }, (_, index) =>
	index < 20 ? 60 : 360
);

export const AVERAGING_SCENARIOS: Record<AveragingScenarioId, AveragingScenario> = {
	'steady-day': {
		id: 'steady-day',
		label: 'Steady day',
		summary: 'All 24 hourly PM2.5 concentrations sit at 60 µg/m³.',
		hourlyConcentrationsUgM3: STEADY_DAY_HOURS
	},
	'smoke-arrives': {
		id: 'smoke-arrives',
		label: 'Smoke arrives',
		summary: '20 hours at 60 µg/m³, followed by 4 smoky hours at 360 µg/m³.',
		hourlyConcentrationsUgM3: SMOKE_ARRIVES_HOURS
	}
} as const;

export const DEFAULT_AVERAGING_SCENARIO: AveragingScenarioId = 'smoke-arrives';

export function summarizeHourlySeries(
	hourlyValues: readonly number[],
	meta: { id: AveragingScenarioId; label: string; summary: string }
): HourlyAveragingSummary {
	if (!Array.isArray(hourlyValues) || hourlyValues.length !== 24) {
		throw new RangeError('Hourly averaging series requires 24 valid hourly concentrations.');
	}
	let total = 0;
	for (let i = 0; i < hourlyValues.length; i += 1) {
		const value = assertValidNonNegativeMeasurement(hourlyValues[i], `hour ${i + 1} concentration`);
		total += value;
	}
	const mean24hUgM3 = total / hourlyValues.length;
	const latestHourUgM3 = hourlyValues[hourlyValues.length - 1];

	return {
		id: meta.id,
		label: meta.label,
		summary: meta.summary,
		hourlyConcentrationsUgM3: [...hourlyValues],
		mean24hUgM3,
		latestHourUgM3,
		latestHourNumber: hourlyValues.length,
		yAxisMin: 0,
		yAxisMax: FIXED_HOURLY_AXIS_MAX
	};
}

export function getAveragingScenarioSummary(id: AveragingScenarioId): HourlyAveragingSummary {
	const scenario = AVERAGING_SCENARIOS[id];
	if (!scenario) {
		throw new RangeError(`Unknown averaging scenario: ${String(id)}`);
	}
	return summarizeHourlySeries(scenario.hourlyConcentrationsUgM3, scenario);
}

export const ILLUSTRATIVE_US_POLLUTANT_SCORES: readonly PollutantScoreBar[] = [
	{
		id: 'pm25',
		pollutantLabel: 'PM2.5',
		score: 154,
		category: 'Unhealthy',
		accentToken: 'unhealthy'
	},
	{
		id: 'pm10',
		pollutantLabel: 'PM10',
		score: 62,
		category: 'Moderate',
		accentToken: 'moderate'
	},
	{
		id: 'ozone',
		pollutantLabel: 'Ozone',
		score: 37,
		category: 'Good',
		accentToken: 'good'
	}
] as const;

export function computeOverallAqiSummary(
	scores: readonly PollutantScoreBar[] = ILLUSTRATIVE_US_POLLUTANT_SCORES
): OverallAqiSummary {
	if (!Array.isArray(scores) || scores.length === 0) {
		throw new RangeError(
			'At least one valid pollutant score is required to determine an overall AQI.'
		);
	}

	let dominant = scores[0];
	for (const entry of scores) {
		const validatedScore = assertValidNonNegativeMeasurement(
			entry.score,
			`${entry.pollutantLabel} score`
		);
		if (validatedScore > dominant.score) {
			dominant = entry;
		}
	}

	return {
		scaleName: 'US AQI',
		axisMax: OVERALL_US_AQI_AXIS_MAX,
		overallScore: dominant.score,
		overallCategory: dominant.category,
		dominantPollutantId: dominant.id,
		dominantPollutantLabel: dominant.pollutantLabel,
		bars: scores.map((entry) => ({
			...entry,
			isDominant: entry.id === dominant.id,
			widthRatio: Math.min(1, entry.score / OVERALL_US_AQI_AXIS_MAX)
		}))
	};
}

export const VERIFIED_SOURCES: readonly VerifiedSource[] = [
	{
		id: 'cpcb-about-aqi',
		agency: 'CPCB (India)',
		title: 'About National Air Quality Index (published category and breakpoint table)',
		versionNote: 'Published 0–500 category scale and pollutant breakpoint table',
		checkedOn: SOURCES_CHECKED_DATE,
		url: 'https://airquality.cpcb.gov.in/ccr_docs/About_AQI.pdf'
	},
	{
		id: 'cpcb-how-aqi-calculated',
		agency: 'CPCB (India)',
		title: 'How AQI Is Calculated',
		versionNote:
			'Linear interpolation sub-index rule, running 24-hour particle average, and minimum data rule',
		checkedOn: SOURCES_CHECKED_DATE,
		url: 'https://airquality.cpcb.gov.in/ccr_docs/How_AQI_Calculated.pdf'
	},
	{
		id: 'cpcb-final-report',
		agency: 'CPCB (India)',
		title: 'National Air Quality Index (Final Technical Report)',
		versionNote:
			'Design rationale referencing Indian ambient standards and background particle levels',
		checkedOn: SOURCES_CHECKED_DATE,
		url: 'https://www.cpcb.gov.in/displaypdf.php?id=bmF0aW9uYWwtYWlyLXF1YWxpdHktaW5kZXgvRklOQUwtUkVQT1JUX0FRSV8ucGRm'
	},
	{
		id: 'epa-aqs-breakpoints',
		agency: 'US EPA',
		title: 'AQS Code Table: AQI Breakpoints',
		versionNote:
			'Current PM2.5 24-hour bands (0.0–9.0 Good, 9.1–35.4 Moderate, 35.5–55.4 USG, 55.5–125.4 Unhealthy)',
		checkedOn: SOURCES_CHECKED_DATE,
		url: 'https://aqs.epa.gov/aqsweb/documents/codetables/aqi_breakpoints.html'
	},
	{
		id: 'epa-tad-may-2026',
		agency: 'US EPA',
		title:
			'Technical Assistance Document for the Reporting of Daily Air Quality – the Air Quality Index (AQI)',
		versionNote:
			'May 2026 technical guide; specifies truncation, rounding, and values above 500 remaining Hazardous',
		checkedOn: SOURCES_CHECKED_DATE,
		url: 'https://document.airnow.gov/technical-assistance-document-for-the-reporting-of-daily-air-quailty.pdf'
	},
	{
		id: 'epa-pm-basics',
		agency: 'US EPA',
		title: 'Particulate Matter (PM) Basics',
		versionNote: 'PM2.5 and PM10 aerodynamic diameter definitions and lung penetration explanation',
		checkedOn: SOURCES_CHECKED_DATE,
		url: 'https://www.epa.gov/pm-pollution/particulate-matter-pm-basics'
	},
	{
		id: 'airnow-using-aqi',
		agency: 'AirNow (US EPA partner)',
		title: 'Using the Air Quality Index',
		versionNote: 'Daily 24-hour reporting vs current reporting and covered pollutants',
		checkedOn: SOURCES_CHECKED_DATE,
		url: 'https://www.airnow.gov/aqi/aqi-basics/using-air-quality-index/'
	},
	{
		id: 'epa-nowcast',
		agency: 'US EPA',
		title: 'Using the NowCast to Report Current Air Quality (Fact Sheet)',
		versionNote:
			'Up to 12 hourly readings with heavier weight on recent hours when concentrations change sharply',
		checkedOn: SOURCES_CHECKED_DATE,
		url: 'https://www.epa.gov/sites/default/files/2018-01/documents/nowcastfactsheet.pdf'
	},
	{
		id: 'iqair-us-aqi-plus',
		agency: 'IQAir',
		title: 'How does IQAir calculate air quality (US AQI+) vs NowCast?',
		versionNote: 'Documents previous-hour concentration averaging under IQAir US AQI+',
		checkedOn: SOURCES_CHECKED_DATE,
		url: 'https://www.iqair.com/support/knowledge-base/airvisual_vs_nowcast'
	}
] as const;
