import { isResourceKindSegment } from '$lib/content/resources';
import type { ParamMatcher } from '@sveltejs/kit';

export const match: ParamMatcher = (parameter): parameter is 'prompts' | 'lists' =>
	isResourceKindSegment(parameter);
