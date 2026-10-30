import { describe, expect, it } from 'vitest';
import {
	DEFAULT_SEED,
	MEASURES,
	MEASURE_ORDER,
	generatePatient,
	getObservation,
	patientToCsv,
	patientToJson,
	responseSummary,
	scoreAnswers
} from './model';

describe('Patient X synthetic assessments', () => {
	it('reproduces an example from its seed and changes answers for another seed', () => {
		const first = generatePatient();
		expect(generatePatient(DEFAULT_SEED)).toEqual(first);
		expect(generatePatient(DEFAULT_SEED + 1).assessments).not.toEqual(first.assessments);
		expect(first.synthetic).toBe(true);
		expect(first.method).toContain('not a model of illness');
		expect(() => generatePatient(Number.NaN)).toThrow(RangeError);
		expect(() => generatePatient(1.5)).toThrow(RangeError);
	});

	it('keeps every answer and derived score valid across a varied set of seeds', () => {
		for (const seed of [
			0,
			1,
			42,
			DEFAULT_SEED,
			4294967295,
			...Array.from({ length: 50 }, (_, i) => i * 173)
		]) {
			const data = generatePatient(seed);
			expect(data.assessments).toHaveLength(6);
			for (const assessment of data.assessments) {
				let answerCount = 0;
				for (const id of MEASURE_ORDER) {
					const response = assessment.measures[id];
					const measure = MEASURES[id];
					expect(response.answers).toHaveLength(measure.items.length);
					answerCount += response.answers.length;
					for (const answer of response.answers) {
						expect(Number.isInteger(answer)).toBe(true);
						expect(answer).toBeGreaterThanOrEqual(0);
						expect(answer).toBeLessThanOrEqual(measure.itemMax);
					}
					expect(response.rawTotal).toBe(response.answers.reduce((sum, answer) => sum + answer, 0));
					expect(response.total).toBe(response.rawTotal * (id === 'who5' ? 4 : 1));
					expect(response.total).toBeLessThanOrEqual(measure.scoreMax);
				}
				expect(answerCount).toBe(19);
				expect(assessment.measures.phq9.answers[8]).toBe(0);
			}
		}
	});

	it('uses six fortnightly visits with inclusive 14-day and 7-day recall windows', () => {
		const data = generatePatient();
		expect(data.startDate).toBe('2026-08-03');
		expect(data.endDate).toBe('2026-10-25');
		expect(data.assessments.map((assessment) => assessment.date)).toEqual([
			'2026-08-16',
			'2026-08-30',
			'2026-09-13',
			'2026-09-27',
			'2026-10-11',
			'2026-10-25'
		]);
		data.assessments.forEach((assessment, index) => {
			expect(assessment.week).toBe((index + 1) * 2);
			for (const id of MEASURE_ORDER) {
				const response = assessment.measures[id];
				expect(response.windowEnd).toBe(assessment.date);
				const days =
					(Date.parse(response.windowEnd) - Date.parse(response.windowStart)) / 86400000 + 1;
				expect(days).toBe(MEASURES[id].recallDays);
			}
		});
		expect(data.assessments[0].measures.phq9.windowStart).toBe('2026-08-03');
		expect(data.assessments[0].measures.asrm.windowStart).toBe('2026-08-10');
	});

	it('makes the default teaching contrast visible without equating activation with well-being', () => {
		const { assessments } = generatePatient();
		const first = assessments[0].measures;
		const middle = assessments[3].measures;
		const final = assessments[5].measures;
		expect(middle.asrm.total).toBeGreaterThan(first.asrm.total);
		expect(middle.who5.total).toBeLessThan(assessments[2].measures.who5.total);
		expect(final.phq9.total).toBeLessThan(first.phq9.total);
		expect(final.asrm.total).toBeLessThan(middle.asrm.total);
		expect(final.who5.total).toBeGreaterThan(first.who5.total);
	});
});

describe('scoring and explanations', () => {
	it('scores known boundary cases and rejects invalid answers instead of coercing them', () => {
		expect(scoreAnswers('phq9', Array(9).fill(3))).toEqual({ rawTotal: 27, total: 27 });
		expect(scoreAnswers('asrm', Array(5).fill(4))).toEqual({ rawTotal: 20, total: 20 });
		expect(scoreAnswers('who5', [1, 2, 3, 4, 5])).toEqual({ rawTotal: 15, total: 60 });
		expect(scoreAnswers('who5', Array(5).fill(0))).toEqual({ rawTotal: 0, total: 0 });
		for (const invalid of [
			[1, 2],
			[1, 2, 3, 4, 6],
			[1, 2, 3, 4, -1],
			[1, 2, 3, 4, 1.5],
			[1, 2, 3, 4, NaN]
		]) {
			expect(() => scoreAnswers('who5', invalid)).toThrow(RangeError);
		}
	});

	it('derives the explanation and score changes from the selected answers', () => {
		const data = generatePatient();
		expect(getObservation(data, 0).changes).toEqual([]);
		const observation = getObservation(data, 3);
		expect(observation.headline).toBe('The mood and activity score rose; well-being did not.');
		for (const change of observation.changes) {
			expect(change.delta).toBe(
				data.assessments[3].measures[change.id].total -
					data.assessments[2].measures[change.id].total
			);
		}
		expect(observation.selfHarmNote).toBeNull();
		const response = data.assessments[0].measures.phq9;
		response.answers[8] = 1;
		Object.assign(response, scoreAnswers('phq9', response.answers));
		expect(getObservation(data, 0).selfHarmNote).toContain('regardless of the total');
		expect(() => getObservation(data, 6)).toThrow(RangeError);
	});

	it('explains frequencies and directs readers to the item-specific ASRM response wording', () => {
		expect(responseSummary('phq9', 0, 1)).toBe('Several days');
		expect(responseSummary('who5', 4, 5)).toBe('All of the time');
		expect(responseSummary('asrm', 2, 3)).toBe('Item score 3/4 (see original form)');
		expect(() => responseSummary('asrm', 5, 0)).toThrow(RangeError);
		expect(() => responseSummary('phq9', 0, 4)).toThrow(RangeError);
	});
});

describe('downloadable evidence', () => {
	it('preserves item answers, windows, provenance and scores in JSON and CSV', () => {
		const data = generatePatient();
		const json = JSON.parse(patientToJson(data));
		expect(json.assessments).toEqual(data.assessments);
		expect(json.seed).toBe(data.seed);
		expect(json.questionnaires.asrm.sourceUrl).toBe(MEASURES.asrm.sourceUrl);
		const rows = patientToCsv(data).split('\r\n');
		expect(rows).toHaveLength(115);
		expect(rows[0]).toContain('"window_start"');
		expect(rows[1]).toContain('"Patient X","true","week-2","2026-08-16"');
		expect(rows[114]).toContain('"WHO-5","14","2026-10-12","2026-10-25"');
	});
});
