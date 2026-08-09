import { describe, expect, it } from 'vitest';
import {
	DEFAULT_PRIOR_AUTHORIZATION_URL_STATE,
	MAX_PRIOR_AUTHORIZATION_QUERY_LENGTH,
	parsePriorAuthorizationUrlState,
	serializePriorAuthorizationUrlState
} from './url-state';

describe('prior-authorization URL state', () => {
	it('round-trips a canonical comparison view and discards every unrelated parameter', () => {
		const state = {
			path: 'fhir-enabled' as const,
			view: 'compare' as const,
			failure: 'clinically-insufficient' as const,
			step: 9,
			perspective: 'architect' as const
		};
		const serialized = serializePriorAuthorizationUrlState(
			state,
			new URLSearchParams('ref=essay&patient_name=Maya')
		);
		expect(serialized.toString()).toBe(
			'pa_v=1&path=fhir-enabled&view=compare&failure=clinically-insufficient&step=9&perspective=architect'
		);
		expect(serialized.has('ref')).toBe(false);
		expect(serialized.has('patient_name')).toBe(false);
		expect(parsePriorAuthorizationUrlState(serialized).state).toEqual(state);
	});

	it('omits defaults except the reconstructive version', () => {
		expect(
			serializePriorAuthorizationUrlState(DEFAULT_PRIOR_AUTHORIZATION_URL_STATE).toString()
		).toBe('pa_v=1');
	});

	it('rejects unknown values instead of reflecting them', () => {
		const parsed = parsePriorAuthorizationUrlState(
			'?pa_v=1&path=%3Cscript%3E&view=dashboard&failure=magic&step=1.5&perspective=admin'
		);
		expect(parsed.state).toEqual(DEFAULT_PRIOR_AUTHORIZATION_URL_STATE);
		expect(parsed.issues).toHaveLength(5);
		expect(JSON.stringify(parsed.state)).not.toContain('script');
	});

	it('resets unsupported and oversized versions safely', () => {
		expect(parsePriorAuthorizationUrlState('?pa_v=99&path=fhir-enabled').unsupportedVersion).toBe(
			true
		);
		const oversized = parsePriorAuthorizationUrlState(
			`?${'x'.repeat(MAX_PRIOR_AUTHORIZATION_QUERY_LENGTH + 1)}`
		);
		expect(oversized.state).toEqual(DEFAULT_PRIOR_AUTHORIZATION_URL_STATE);
		expect(oversized.issues).toHaveLength(1);
	});
});
