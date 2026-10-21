/**
 * Browser-safe OpenHIE teaching model. No network, timers, storage or patient input.
 * compileRun(id, overrides) returns a deeply frozen, deterministic event ledger and
 * step snapshots. A snapshot is a projection of the ledger, never a second story.
 * Recover by compiling the same scenario with its failed setting set to true;
 * snapshots before that gate retain their content and stable event identifiers.
 */
export {
	COMPONENTS,
	SCENARIOS,
	ASSUMPTIONS,
	DEFAULT_SETTINGS,
	MODEL_VERSION,
	SOURCES
} from './catalog';
export { compileRun, normalizeSettings } from './engine';
export { encodeReplay, decodeReplay, exchangeReceipt } from './replay';
export type { ReplayState, ExchangeReceipt } from './replay';
export type {
	ClinicalEvent,
	ComponentId,
	ComponentDescription,
	ExchangeEvent,
	IdentityState,
	Lens,
	Run,
	ScenarioDescription,
	ScenarioId,
	Settings,
	Snapshot,
	SnapshotStatus,
	TransactionStatus
} from './types';
