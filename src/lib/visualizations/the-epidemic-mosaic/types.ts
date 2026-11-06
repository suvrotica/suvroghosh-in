export const EPIDEMIC_MOSAIC_ENGINE_VERSION = 1 as const;

export const LOGICAL_WIDTH = 600;
export const LOGICAL_HEIGHT = 420;
export const CITY_MARGIN = 10;

export const TOTAL_REGIONS = 36;
export const REGIONS_PER_COMMUNITY = 18;
export const POPULATION_PER_REGION = 100;
export const TOTAL_CITY_POPULATION = TOTAL_REGIONS * POPULATION_PER_REGION; // 3,600
export const INITIAL_INFECTIONS = 5;
export const DEFAULT_INITIAL_INFECTED_REGION_ID = 'A05';

export const DEFAULT_CITY_SEED = 1854; // John Snow Broad Street pump year
export const DEFAULT_OUTBREAK_SEED = 2026;
export const DEFAULT_BATCH_REPETITIONS = 20;

export const DEFAULT_BRIDGE_A_ID = 'A06';
export const DEFAULT_BRIDGE_B_ID = 'B03';

export const DEFAULT_VACCINE_BUDGET = 540; // 15% of 3,600

export type CommunityId = 'A' | 'B';

export type ExperimentMode = 'bridge' | 'vaccination';

export type BridgeScenarioId = 'without-bridge' | 'with-bridge';

export type VaccinationStrategyId = 'even' | 'most-connections' | 'around-the-bridge';

export type ScenarioId = BridgeScenarioId | VaccinationStrategyId;

export interface EpidemicParameters {
	/** Within-region transmission coefficient (beta_local), per day */
	betaLocal: number;
	/** Transmission coefficient per unit-weight connection (beta_link), per day */
	betaLink: number;
	/** Mean infectious period (1 / gamma), in days */
	infectiousPeriodDays: number;
	/** Observation window (T_obs), in days */
	observationDays: number;
	/** Primary outbreak random seed */
	outbreakSeed: number;
}

export const DEFAULT_EPIDEMIC_PARAMETERS: Readonly<EpidemicParameters> = Object.freeze({
	betaLocal: 0.28,
	betaLink: 0.04,
	infectiousPeriodDays: 7,
	observationDays: 120,
	outbreakSeed: DEFAULT_OUTBREAK_SEED
});

export const PARAMETER_BOUNDS = Object.freeze({
	betaLocal: { min: 0.0, max: 1.0, step: 0.02 },
	betaLink: { min: 0.0, max: 0.25, step: 0.005 },
	infectiousPeriodDays: { min: 2, max: 21, step: 0.5 },
	observationDays: { min: 30, max: 240, step: 10 },
	vaccineBudget: { min: 0, max: 1800, step: 36 },
	outbreakSeed: { min: 1, max: 999999, step: 1 }
});

export type Point2D = [number, number];

export interface CityRegion {
	/** Canonical 0..35 index */
	index: number;
	/** Stable region identifier, e.g. 'A01'..'A18', 'B01'..'B18' */
	id: string;
	/** Short display code, e.g. 'A1'..'A18', 'B1'..'B18' */
	shortLabel: string;
	/** Human-readable civic ward name */
	name: string;
	/** Full label, e.g. 'A5 · Market Cross' */
	fullName: string;
	/** Community membership ('A' or 'B') */
	community: CommunityId;
	/** Fixed population N_i = 100 */
	population: number;
	/** Seeded generator point inside logical viewport */
	seedPoint: Point2D;
	/** Centroid of the Voronoi polygon for label/node placement */
	centroid: Point2D;
	/** Closed counterclockwise/clockwise convex polygon vertices [[x, y], ...] */
	polygon: Point2D[];
	/** SVG path 'M...Z' string for the polygon */
	svgPath: string;
	/** Total geometric polygon area in logical square units */
	polygonArea: number;
	/** Vertical bounding box [minY, maxY] */
	boundsY: [number, number];
	/** Horizontal bounding box [minX, maxX] */
	boundsX: [number, number];
	/** Indices of polygons that physically share a Voronoi border with this region */
	borderNeighbourIndices: number[];
}

export interface ContactEdge {
	/** Stable edge identifier, e.g. 'A01--A05' */
	id: string;
	/** Lower region index (or Community A endpoint for bridge) */
	sourceIndex: number;
	/** Higher region index (or Community B endpoint for bridge) */
	targetIndex: number;
	/** Source region ID */
	sourceId: string;
	/** Target region ID */
	targetId: string;
	/** Nonnegative contact weight (default 1) */
	weight: number;
	/** Whether the two regions physically share a Voronoi polygon border */
	sharesPolygonBorder: boolean;
	/** Euclidean distance between region centroids in logical units */
	euclideanDistance: number;
	/** Whether this edge is the user-added inter-community bridge */
	isBridge: boolean;
}

export interface BridgeSelection {
	regionAId: string;
	regionBId: string;
}

export interface CityNetwork {
	citySeed: number;
	logicalWidth: number;
	logicalHeight: number;
	regions: CityRegion[];
	regionById: Map<string, CityRegion>;
	/** Base intra-community edges (no cross-community edges) */
	baseEdges: ContactEdge[];
	/** Polyline segments tracing the border seam between Community A and Community B */
	communitySeamSegments: [Point2D, Point2D][];
	/** Example pair of neighbouring polygons in Community A with no direct contact link */
	exampleTouchingDisconnectedPair: [string, string];
	/** Example pair of visually distant polygons in Community A with a direct contact link */
	exampleDistantConnectedPair: [string, string];
}

export interface RegionCompartmentCounts {
	S: number;
	I: number;
	R: number;
	V: number;
	N: number;
}

export type CompartmentKey = 'I' | 'R' | 'V' | 'S';

export interface HorizontalColourBand {
	compartment: CompartmentKey;
	count: number;
	fraction: number;
	yStart: number;
	yEnd: number;
	clippedPolygon: Point2D[];
	svgPath: string;
	area: number;
}

export type OutbreakEventType = 'local-infection' | 'link-infection' | 'recovery';

export interface OutbreakEvent {
	/** Event index (0-based) */
	step: number;
	/** Simulated time in days (0 < time <= observationDays) */
	time: number;
	/** Channel type */
	type: OutbreakEventType;
	/** Affected region index where infection or recovery occurred */
	targetRegionIndex: number;
	/** Source region index (equals targetRegionIndex for local infection/recovery; j != i for link infection) */
	sourceRegionIndex: number;
}

export interface DailySeriesPoint {
	day: number;
	totalS: number;
	totalI: number;
	totalR: number;
	totalV: number;
	/** Cumulative people infected (I + R, excluding V) */
	cumulativeInfected: number;
	communityAI: number;
	communityBI: number;
	communityACumulativeInfected: number;
	communityBCumulativeInfected: number;
}

export interface OutbreakSimulationResult {
	scenarioId: ScenarioId;
	scenarioLabel: string;
	outbreakSeed: number;
	parameters: EpidemicParameters;
	bridge: BridgeSelection | null;
	vaccineStrategy: VaccinationStrategyId | null;
	vaccineBudget: number;
	/** Initial counts at t = 0 (after vaccination and initial infections) */
	initialCounts: RegionCompartmentCounts[];
	/** Final counts at end of observation window */
	finalCounts: RegionCompartmentCounts[];
	/** Complete recorded event history (bounded by total population * 2 <= 7,200 events) */
	events: OutbreakEvent[];
	/** Sampled daily time series for charts (day 0 .. observationDays) */
	dailySeries: DailySeriesPoint[];
	/** Whether no infectious people remain before observationDays */
	endedByExtinction: boolean;
	/** Time of last event, in days */
	lastEventDay: number;
	/** People infected by observationDays (I + R, includes initial 5, excludes V) */
	totalInfectedByEnd: number;
	/** Peak number of people infectious at once across all events */
	peakInfectious: number;
	/** Day at which peak infectious occurred */
	peakInfectiousDay: number;
	/** Whether Community B had at least one infection during the run */
	communityBReached: boolean;
	/** Total people infected in Community A by observationDays */
	communityAInfectedByEnd: number;
	/** Total people infected in Community B by observationDays */
	communityBInfectedByEnd: number;
}

export interface SampledCityState {
	day: number;
	regionCounts: RegionCompartmentCounts[];
	totalS: number;
	totalI: number;
	totalR: number;
	totalV: number;
	cumulativeInfected: number;
	communityAI: number;
	communityBI: number;
	communityACumulativeInfected: number;
	communityBCumulativeInfected: number;
	/** Active infectious count at this exact instant */
	isEnded: boolean;
}

export interface AggregatedLinkTransmission {
	edgeId: string;
	sourceRegionIndex: number;
	targetRegionIndex: number;
	sourceId: string;
	targetId: string;
	count: number;
	latestTime: number;
}

export interface AggregatedLocalInfection {
	regionIndex: number;
	regionId: string;
	count: number;
	latestTime: number;
}

export interface PlaybackWindowEvents {
	linkTransmissions: AggregatedLinkTransmission[];
	localInfections: AggregatedLocalInfection[];
	totalNewInfections: number;
}

export interface BatchRunSummaryItem {
	runIndex: number;
	outbreakSeed: number;
	totalInfectedByEnd: number;
	peakInfectious: number;
	peakInfectiousDay: number;
	communityBReached: boolean;
	communityAInfectedByEnd: number;
	communityBInfectedByEnd: number;
	endedByExtinction: boolean;
}

export interface ScenarioBatchSummary {
	scenarioId: ScenarioId;
	scenarioLabel: string;
	repetitions: number;
	observationDays: number;
	runs: BatchRunSummaryItem[];
	medianInfectedByEnd: number;
	minInfectedByEnd: number;
	maxInfectedByEnd: number;
	medianPeakInfectious: number;
	minPeakInfectious: number;
	maxPeakInfectious: number;
	communityBReachedCount: number;
	earlyExtinctionCount: number;
}

export interface BatchComparisonResult {
	experimentMode: ExperimentMode;
	repetitions: number;
	observationDays: number;
	baseOutbreakSeed: number;
	seedsUsed: number[];
	scenarios: ScenarioBatchSummary[];
}
