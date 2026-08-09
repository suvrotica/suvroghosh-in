import {
	FAILURE_IDS,
	MILESTONE_DEFINITIONS,
	PATHWAY_IDS,
	PERSPECTIVE_IDS
} from './scenario-schema.ts';
import type { FailureId, PathwayId, PerspectiveId } from './types.ts';

export const PRIOR_AUTHORIZATION_URL_VERSION = 1 as const;
export const MAX_PRIOR_AUTHORIZATION_QUERY_LENGTH = 1_024;
export const PRIOR_AUTHORIZATION_VIEW_IDS = ['journey', 'compare'] as const;

export type PriorAuthorizationViewId = (typeof PRIOR_AUTHORIZATION_VIEW_IDS)[number];

export type PriorAuthorizationUrlState = Readonly<{
	path: PathwayId;
	view: PriorAuthorizationViewId;
	failure: FailureId;
	step: number;
	perspective: PerspectiveId;
}>;

export type PriorAuthorizationUrlIssue = Readonly<{
	key: string;
	value: string | null;
	message: string;
}>;

export type PriorAuthorizationUrlParseResult = Readonly<{
	state: PriorAuthorizationUrlState;
	issues: readonly PriorAuthorizationUrlIssue[];
	unsupportedVersion: boolean;
}>;

export const DEFAULT_PRIOR_AUTHORIZATION_URL_STATE: PriorAuthorizationUrlState = Object.freeze({
	path: 'portal-fax',
	view: 'journey',
	failure: 'none',
	step: 0,
	perspective: 'patient'
});

function queryText(source: string): string {
	const question = source.indexOf('?');
	let query = question >= 0 ? source.slice(question + 1) : source.replace(/^\?/u, '');
	const hash = query.indexOf('#');
	if (hash >= 0) query = query.slice(0, hash);
	return query;
}

function toParams(source: string | URL | URLSearchParams): URLSearchParams {
	if (source instanceof URLSearchParams) return new URLSearchParams(source);
	if (source instanceof URL) return new URLSearchParams(source.search);
	return new URLSearchParams(queryText(source));
}

function enumValue<const Value extends string>(
	params: URLSearchParams,
	key: string,
	allowed: readonly Value[],
	fallback: Value,
	issues: PriorAuthorizationUrlIssue[]
): Value {
	const raw = params.get(key);
	if (raw === null) return fallback;
	if ((allowed as readonly string[]).includes(raw)) return raw as Value;
	issues.push({ key, value: raw, message: 'Unknown option; the documented default was restored.' });
	return fallback;
}

export function parsePriorAuthorizationUrlState(
	source: string | URL | URLSearchParams,
	fallback: PriorAuthorizationUrlState = DEFAULT_PRIOR_AUTHORIZATION_URL_STATE
): PriorAuthorizationUrlParseResult {
	const rawQuery =
		typeof source === 'string'
			? queryText(source)
			: source instanceof URL
				? source.search.slice(1)
				: source.toString();
	if (rawQuery.length > MAX_PRIOR_AUTHORIZATION_QUERY_LENGTH) {
		return {
			state: { ...fallback },
			issues: [
				{
					key: '',
					value: `${rawQuery.length} characters`,
					message: `Query exceeds the ${MAX_PRIOR_AUTHORIZATION_QUERY_LENGTH}-character safety limit.`
				}
			],
			unsupportedVersion: false
		};
	}

	const params = toParams(source);
	const versionText = params.get('pa_v');
	const version = versionText === null ? PRIOR_AUTHORIZATION_URL_VERSION : Number(versionText);
	if (version !== PRIOR_AUTHORIZATION_URL_VERSION) {
		return {
			state: { ...fallback },
			issues: [
				{
					key: 'pa_v',
					value: versionText,
					message: `Unsupported state version; version ${PRIOR_AUTHORIZATION_URL_VERSION} defaults were restored.`
				}
			],
			unsupportedVersion: true
		};
	}

	const issues: PriorAuthorizationUrlIssue[] = [];
	const stepText = params.get('step');
	let step = fallback.step;
	if (stepText !== null) {
		const parsed = Number(stepText);
		if (
			!Number.isInteger(parsed) ||
			parsed < 0 ||
			parsed >= MILESTONE_DEFINITIONS.length ||
			stepText.trim() === '' ||
			stepText.length > 3
		) {
			issues.push({
				key: 'step',
				value: stepText,
				message: `Expected an integer from 0 to ${MILESTONE_DEFINITIONS.length - 1}; the default was restored.`
			});
		} else {
			step = parsed;
		}
	}

	return {
		state: {
			path: enumValue(params, 'path', PATHWAY_IDS, fallback.path, issues),
			view: enumValue(params, 'view', PRIOR_AUTHORIZATION_VIEW_IDS, fallback.view, issues),
			failure: enumValue(params, 'failure', FAILURE_IDS, fallback.failure, issues),
			step,
			perspective: enumValue(params, 'perspective', PERSPECTIVE_IDS, fallback.perspective, issues)
		},
		issues,
		unsupportedVersion: false
	};
}

export function serializePriorAuthorizationUrlState(
	state: PriorAuthorizationUrlState,
	base: URLSearchParams = new URLSearchParams()
): URLSearchParams {
	// Retain the second argument for the public API seam, but deliberately do not
	// copy it. A share URL contains only this feature's bounded, allowlisted state;
	// arbitrary query text could otherwise preserve patient-like data.
	void base;
	const candidate = new URLSearchParams({
		pa_v: String(PRIOR_AUTHORIZATION_URL_VERSION),
		path: state.path,
		view: state.view,
		failure: state.failure,
		step: String(state.step),
		perspective: state.perspective
	});
	const normalized = parsePriorAuthorizationUrlState(candidate).state;
	const params = new URLSearchParams();
	params.set('pa_v', String(PRIOR_AUTHORIZATION_URL_VERSION));
	if (normalized.path !== DEFAULT_PRIOR_AUTHORIZATION_URL_STATE.path) {
		params.set('path', normalized.path);
	}
	if (normalized.view !== DEFAULT_PRIOR_AUTHORIZATION_URL_STATE.view) {
		params.set('view', normalized.view);
	}
	if (normalized.failure !== DEFAULT_PRIOR_AUTHORIZATION_URL_STATE.failure) {
		params.set('failure', normalized.failure);
	}
	if (normalized.step !== DEFAULT_PRIOR_AUTHORIZATION_URL_STATE.step) {
		params.set('step', String(normalized.step));
	}
	if (normalized.perspective !== DEFAULT_PRIOR_AUTHORIZATION_URL_STATE.perspective) {
		params.set('perspective', normalized.perspective);
	}
	return params;
}
