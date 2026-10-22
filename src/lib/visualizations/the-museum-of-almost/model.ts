export type ContentStatus = 'demonstration' | 'verified';
export type EvidenceStatus = 'fictional' | 'documented';
export type Outcome = 'tested-reuse' | 'untested' | 'closed' | 'unresolved';
export type View = 'object' | 'evidence' | 'aftermath';
export type Evidence = Readonly<{
	id: string;
	label: string;
	status: EvidenceStatus;
	summary: string;
	purpose: 'observation' | 'follow-up' | 'proposal' | 'decision';
	provenanceIds: readonly string[];
}>;
export type Claim = Readonly<{ id: string; text: string; evidenceIds: readonly string[] }>;
export type Provenance = Readonly<{
	id: string;
	summary: string;
	permission: 'public' | 'private';
	source: string;
}>;
export type Cost = Readonly<{
	kind: 'time' | 'money' | 'material';
	value: number;
	unit: string;
	provenanceId: string;
}>;
export type OnwardLink = Readonly<{
	id: string;
	sourceId: string;
	targetId: string;
	element: string;
	evidenceIds: readonly string[];
	status: 'proposed' | 'reused' | 'tested';
}>;
export type Target = Readonly<{
	id: string;
	title: string;
	contentStatus: ContentStatus;
	summary: string;
	provenance: readonly Provenance[];
}>;
export type Specimen = Readonly<{
	id: string;
	title: string;
	version: string;
	illustration: 'lamp' | 'recorder' | 'planter' | 'page';
	partId: string;
	partLabel: string;
	partExplanation: string;
	purpose: string;
	contentStatus: ContentStatus;
	observations: readonly Claim[];
	interpretations: readonly Claim[];
	alternatives: readonly string[];
	unknowns: readonly string[];
	evidence: readonly Evidence[];
	decision: string;
	aftermath: string;
	outcome: Outcome;
	costs: readonly Cost[];
	onwardLinks: readonly OnwardLink[];
	provenance: readonly Provenance[];
}>;
export type Archive = Readonly<{ specimens: readonly Specimen[]; targets: readonly Target[] }>;

/** Fixed artwork slots are independent of a replacement record's stable ID. */
export const ILLUSTRATION_PARTS: Readonly<Record<Specimen['illustration'], string>> = {
	lamp: 'lamp-connector',
	recorder: 'recorder-controls',
	planter: 'planter-seam',
	page: 'page-purchase'
};

export const DEMONSTRATION_LABEL = 'Demonstration collection — fictional projects and evidence';
export const OUTCOME_LABEL: Record<Outcome, string> = {
	'tested-reuse': '✓ Tested reuse',
	untested: '◇ Proposed; untested',
	closed: '■ Closed; no reuse recorded',
	unresolved: '? Unresolved'
};

function text(value: unknown): value is string {
	return typeof value === 'string' && value.trim().length > 0 && value.length <= 4000;
}
function assert(condition: unknown, message: string): asserts condition {
	if (!condition) throw new Error(`Invalid museum archive: ${message}`);
}
function publicProvenance(provenance: readonly Provenance[]): boolean {
	return (
		Array.isArray(provenance) &&
		provenance.every(
			(p: Provenance) =>
				p.permission === 'public' &&
				text(p.summary) &&
				text(p.source) &&
				(/^https:\/\/[^\s]+$/u.test(p.source) ||
					(/^repo:[a-zA-Z0-9_./-]+$/u.test(p.source) && !p.source.includes('..')))
		)
	);
}
function uniqueIds(items: readonly { id: string }[], label: string) {
	assert(Array.isArray(items), `${label} array`);
	const ids = new Set<string>();
	for (const item of items) {
		assert(item && typeof item === 'object', `${label} object`);
		assert(text(item.id) && /^[a-z][a-z0-9-]{0,79}$/u.test(item.id), `${label} ID`);
		assert(!ids.has(item.id), `duplicate ${label} ID ${item.id}`);
		ids.add(item.id);
	}
	return ids;
}

/** Validate author-controlled data before any renderer consumes a record. */
export function validateArchive(value: Archive): Archive {
	assert(value && Array.isArray(value.specimens) && Array.isArray(value.targets), 'collections');
	assert(
		value.specimens.length > 0 && value.specimens.length <= 4,
		'specimen count: one to four cabinet slots'
	);
	const specimenIds = uniqueIds(value.specimens, 'specimen');
	const illustrationSlots = new Set<string>();
	const targets = new Map(value.targets.map((target) => [target.id, target]));
	uniqueIds(value.targets, 'target');
	for (const target of value.targets) {
		assert(!specimenIds.has(target.id), 'target duplicates a specimen');
		assert(text(target.title) && text(target.summary), 'target content');
		assert(['demonstration', 'verified'].includes(target.contentStatus), 'target content status');
		assert(publicProvenance(target.provenance), 'private/unlocatable target provenance');
		if (target.contentStatus === 'verified') {
			assert(target.provenance.length > 0, 'target public provenance');
		}
	}
	for (const record of value.specimens) {
		assert(text(record.title) && text(record.version) && text(record.purpose), 'record identity');
		assert(['lamp', 'recorder', 'planter', 'page'].includes(record.illustration), 'illustration');
		assert(!illustrationSlots.has(record.illustration), 'duplicate illustration slot');
		illustrationSlots.add(record.illustration);
		assert(text(record.partId) && text(record.partLabel) && text(record.partExplanation), 'part');
		assert(
			record.partId === ILLUSTRATION_PARTS[record.illustration as Specimen['illustration']],
			'part ID must match the illustration slot'
		);
		assert(['demonstration', 'verified'].includes(record.contentStatus), 'content status');
		assert(Object.hasOwn(OUTCOME_LABEL, record.outcome), 'outcome');
		assert(text(record.decision) && text(record.aftermath), 'decision and aftermath');
		for (const field of [
			'observations',
			'interpretations',
			'alternatives',
			'unknowns',
			'evidence',
			'costs',
			'onwardLinks',
			'provenance'
		] as const)
			assert(Array.isArray(record[field]), field);
		assert(
			record.observations.length > 0 && record.unknowns.length > 0,
			'observation and uncertainty'
		);
		assert([...record.alternatives, ...record.unknowns].every(text), 'unknown/alternative text');
		const evidenceIds = uniqueIds(record.evidence, 'evidence');
		const provenanceIds = uniqueIds(record.provenance, 'provenance');
		assert(publicProvenance(record.provenance), 'private/unlocatable record provenance');
		uniqueIds([...record.observations, ...record.interpretations], 'claim');
		uniqueIds(record.onwardLinks, 'onward');
		for (const source of record.evidence) {
			assert(text(source.label) && text(source.summary), 'evidence text');
			assert(['fictional', 'documented'].includes(source.status), 'evidence status');
			assert(
				['observation', 'follow-up', 'proposal', 'decision'].includes(source.purpose),
				'evidence purpose'
			);
			assert(
				Array.isArray(source.provenanceIds) &&
					source.provenanceIds.every((id: string) => provenanceIds.has(id)),
				'evidence source reference'
			);
		}
		for (const claim of [...record.observations, ...record.interpretations]) {
			assert(text(claim.text) && Array.isArray(claim.evidenceIds), 'claim');
			assert(
				claim.evidenceIds.length > 0 &&
					claim.evidenceIds.every((id: string) => evidenceIds.has(id)),
				'missing claim evidence'
			);
		}
		if (record.contentStatus === 'verified') {
			assert(record.provenance.length > 0, 'public provenance required');
			assert(
				record.evidence.every(
					(e: Evidence) => e.status === 'documented' && e.provenanceIds.length > 0
				),
				'fictional or unsourced evidence cannot verify a record'
			);
		}
		for (const cost of record.costs)
			assert(
				['time', 'money', 'material'].includes(cost.kind) &&
					Number.isFinite(cost.value) &&
					cost.value >= 0 &&
					text(cost.unit) &&
					provenanceIds.has(cost.provenanceId),
				'cost units/value/provenance'
			);
		for (const link of record.onwardLinks) {
			assert(link.sourceId === record.id && link.targetId !== record.id, 'onward source/self-link');
			const target = targets.get(link.targetId);
			assert(target && text(link.element), 'onward target and exact transferred element');
			assert(['proposed', 'reused', 'tested'].includes(link.status), 'onward status');
			assert(
				Array.isArray(link.evidenceIds) &&
					link.evidenceIds.length > 0 &&
					link.evidenceIds.every((id: string) => evidenceIds.has(id)),
				'onward evidence'
			);
			if (link.status === 'tested')
				assert(
					link.evidenceIds.some((id: string) =>
						record.evidence.some((e: Evidence) => e.id === id && e.purpose === 'follow-up')
					),
					'tested reuse requires follow-up'
				);
			if (record.contentStatus === 'verified')
				assert(target.contentStatus === 'verified', 'verified onward target');
		}
		if (record.outcome === 'tested-reuse')
			assert(
				record.onwardLinks.some((link: OnwardLink) => link.status === 'tested'),
				'tested outcome requires tested relationship'
			);
		if (record.outcome !== 'tested-reuse')
			assert(
				record.onwardLinks.every((link: OnwardLink) => link.status !== 'tested'),
				'tested relationship conflicts with outcome'
			);
	}
	// Targets are terminal records, so onward traversal cannot introduce cycles.
	return value;
}

export type Selection = Readonly<{
	selectedSpecimenId: string | null;
	activeView: View;
	selectedPartId: string | null;
	selectedClaimId: string | null;
	selectedComparisonId: string | null;
}>;
export const CLOSED_SELECTION: Selection = Object.freeze({
	selectedSpecimenId: null,
	activeView: 'object',
	selectedPartId: null,
	selectedClaimId: null,
	selectedComparisonId: null
});

export function selectSpecimen(archive: Archive, id: string | null): Selection {
	return archive.specimens.some((record) => record.id === id)
		? { ...CLOSED_SELECTION, selectedSpecimenId: id }
		: { ...CLOSED_SELECTION };
}

export function illustrationForSpecimen(
	archive: Archive,
	id: string | null
): Specimen['illustration'] | null {
	return archive.specimens.find((record) => record.id === id)?.illustration ?? null;
}

export function normaliseSelection(archive: Archive, input: Partial<Selection>): Selection {
	const record = archive.specimens.find((item) => item.id === input.selectedSpecimenId);
	if (!record) return { ...CLOSED_SELECTION };
	const activeView = ['object', 'evidence', 'aftermath'].includes(input.activeView ?? '')
		? input.activeView!
		: 'object';
	return {
		selectedSpecimenId: record.id,
		activeView,
		selectedPartId:
			activeView === 'object' && input.selectedPartId === record.partId ? record.partId : null,
		selectedClaimId:
			activeView === 'evidence' &&
			[...record.observations, ...record.interpretations].some(
				(claim) => claim.id === input.selectedClaimId
			)
				? input.selectedClaimId!
				: null,
		selectedComparisonId:
			activeView === 'aftermath' &&
			record.onwardLinks.some((link) => link.id === input.selectedComparisonId)
				? input.selectedComparisonId!
				: null
	};
}

/** The URL selects an existing drawer/view only; it never supplies content/status. */
export function decodeSelection(archive: Archive, encoded: unknown): Selection {
	if (typeof encoded !== 'string' || encoded.length > 120) return { ...CLOSED_SELECTION };
	const [version, id, view, ...extra] = encoded.split('.');
	if (version !== '1' || extra.length || !['object', 'evidence', 'aftermath'].includes(view))
		return { ...CLOSED_SELECTION };
	return normaliseSelection(archive, { selectedSpecimenId: id, activeView: view as View });
}
export function encodeSelection(selection: Selection): string | null {
	return selection.selectedSpecimenId
		? `1.${selection.selectedSpecimenId}.${selection.activeView}`
		: null;
}
export function formatCost(record: Specimen, kind: Cost['kind']): string {
	const cost = record.costs.find((item) => item.kind === kind);
	return cost ? `${cost.value} ${cost.unit}` : 'Unknown';
}
export function collectionLabel(archive: Archive): string {
	return archive.specimens.every((record) => record.contentStatus === 'demonstration')
		? DEMONSTRATION_LABEL
		: archive.specimens.some((record) => record.contentStatus === 'demonstration')
			? 'Mixed collection — includes fictional demonstration records'
			: 'Verified collection — see each record’s sources';
}

export type CollectionTally = Readonly<{
	total: number;
	demonstration: number;
	verified: number;
	testedReuse: number;
	untestedPossibilities: number;
	closedWithoutReuse: number;
	unresolvedWithoutReuse: number;
	withoutDemonstratedReuse: number;
}>;

/** Collection readouts follow record status and outcomes, including mixed archives. */
export function collectionTally(archive: Archive): CollectionTally {
	const total = archive.specimens.length;
	const demonstration = archive.specimens.filter(
		(record) => record.contentStatus === 'demonstration'
	).length;
	const testedReuse = archive.specimens.filter(
		(record) => record.outcome === 'tested-reuse'
	).length;
	const untestedPossibilities = archive.specimens.filter(
		(record) => record.outcome === 'untested'
	).length;
	const withoutReuse = archive.specimens.filter(
		(record) =>
			!record.onwardLinks.some((link) => link.status === 'reused' || link.status === 'tested')
	);
	const closedWithoutReuse = withoutReuse.filter((record) => record.outcome === 'closed').length;
	const unresolvedWithoutReuse = withoutReuse.filter(
		(record) => record.outcome === 'unresolved'
	).length;
	return {
		total,
		demonstration,
		verified: archive.specimens.filter((record) => record.contentStatus === 'verified').length,
		testedReuse,
		untestedPossibilities,
		closedWithoutReuse,
		unresolvedWithoutReuse,
		withoutDemonstratedReuse: closedWithoutReuse + unresolvedWithoutReuse
	};
}
