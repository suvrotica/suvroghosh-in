import type { UmlDiagramRecord } from './types';

export type AuthoringDiagram = UmlDiagramRecord & { metadataReviewRequired?: boolean };

/** A deterministic revision label, not a security digest or an authorization token. */
export function contentRevision(text: string): string {
	let a = 2166136261;
	let b = 5381;
	for (let i = 0; i < text.length; i += 1) {
		a = Math.imul(a ^ text.charCodeAt(i), 16777619);
		b = Math.imul(b, 33) ^ text.charCodeAt(i);
	}
	return `${text.length.toString(36)}-${(a >>> 0).toString(16)}-${(b >>> 0).toString(16)}`;
}

export function hasCurrentRender(diagram: UmlDiagramRecord): boolean {
	return Boolean(
		diagram.generationStatus === 'generated' &&
		diagram.renderStatus === 'rendered' &&
		(diagram.validationStatus === 'valid' || diagram.validationStatus === 'repaired') &&
		diagram.svg &&
		diagram.lastValidSourceCode === diagram.sourceCode
	);
}

export function isPublicationReady(diagram: AuthoringDiagram): boolean {
	return hasCurrentRender(diagram) && !diagram.metadataReviewRequired;
}

export function beginSourceEdit(diagram: AuthoringDiagram, sourceCode: string): AuthoringDiagram {
	if (diagram.sourceCode === sourceCode) return diagram;
	return {
		...diagram,
		sourceCode,
		sourceRevision: contentRevision(sourceCode),
		renderedSourceRevision: undefined,
		provenance: 'edited',
		metadataReviewRequired: true,
		validationStatus: 'skipped',
		renderStatus: 'not_rendered',
		renderError: undefined,
		svg: undefined,
		lastValidSvg: diagram.lastValidSvg || diagram.svg,
		lastValidSourceCode: diagram.lastValidSourceCode
	};
}

/** Render responses own image/validation fields; caption edits made while rendering stay local. */
export function mergeRenderedDiagram(
	current: AuthoringDiagram,
	rendered: UmlDiagramRecord,
	submittedSource: string
): AuthoringDiagram {
	if (current.id !== rendered.id || current.sourceCode !== submittedSource) return current;
	return {
		...current,
		sourceCode: rendered.sourceCode,
		sourceRevision: rendered.sourceRevision,
		renderedSourceRevision: rendered.renderedSourceRevision,
		generationStatus: rendered.generationStatus,
		validationStatus: rendered.validationStatus,
		renderStatus: rendered.renderStatus,
		renderError: rendered.renderError,
		repairAttempts: rendered.repairAttempts,
		rendererId: rendered.rendererId,
		svg: rendered.svg,
		lastValidSvg: rendered.lastValidSvg,
		lastValidSourceCode: rendered.lastValidSourceCode
	};
}

/** Aborting transport is insufficient: a completed or non-abortable response may still arrive. */
export class LatestOperation {
	private revision = 0;
	private controller: AbortController | null = null;

	start() {
		this.cancel();
		const revision = this.revision;
		const controller = new AbortController();
		this.controller = controller;
		return {
			signal: controller.signal,
			isCurrent: () => revision === this.revision && !controller.signal.aborted
		};
	}

	cancel() {
		this.revision += 1;
		this.controller?.abort();
		this.controller = null;
	}
}
