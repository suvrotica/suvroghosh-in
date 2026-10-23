/**
 * A deterministic teaching model of HTTPS over a persistent HTTP/1.1 connection.
 * These are invented timings, not measurements or a TCP implementation. In particular,
 * recovery uses one fixed illustrative delay, not an RFC retransmission timer,
 * congestion control, a real round-trip estimator or a fast-retransmit algorithm.
 * The response's byte offsets are relative to its start after TLS decryption;
 * encrypted TLS records, HTTP framing and actual TCP sequence numbers are omitted.
 */
export const MODEL_VERSION = 1;

export interface JourneyInput {
	rttMs: number;
	connection: 'fresh' | 'reused';
	lostSegment: boolean;
	serverMs: number;
	cache: 'origin' | 'fresh';
}

export type StageId =
	| 'dns'
	| 'tcp'
	| 'tls'
	| 'request'
	| 'server'
	| 'response'
	| 'resources'
	| 'complete';
export type Area = 'address' | 'coupling' | 'server' | 'transport' | 'buffer' | 'browser';

export interface JourneyStage {
	id: StageId;
	shortName: string;
	title: string;
	detail: string;
	area: Area;
	startMs: number;
	endMs: number;
	skipped: boolean;
}

export interface Segment {
	index: number;
	firstByte: number;
	/** Exclusive upper byte boundary: [firstByte, endByte). */
	endByte: number;
	sizeBytes: number;
	/** Beginning of this range's first transmission. */
	sendMs: number;
	/** Arrival of the range's final byte on the successful transmission. */
	arrivalMs: number;
	/** Arrival time if the initial transmission had not been lost. */
	originalArrivalMs: number;
	lostAtMs: number | null;
	retransmitMs: number | null;
}

export type SegmentState =
	| 'waiting'
	| 'travelling'
	| 'lost'
	| 'retransmitting'
	| 'buffered'
	| 'delivered';

export interface SegmentSnapshot extends Segment {
	state: SegmentState;
	/** Progress of the current transmission from sender to receiver, from 0 to 1. */
	travelProgress: number;
}

export interface JourneyAccounting {
	dnsMs: number;
	tcpMs: number;
	tlsMs: number;
	requestTransitMs: number;
	serverWorkMs: number;
	responseTransitMs: number;
	responseSerializationMs: number;
	lossRecoveryMs: number;
	resourceNetworkMs: number;
	resourceServerMs: number;
	resourceSerializationMs: number;
	browserAssemblyMs: number;
	totalMs: number;
}

export interface Journey {
	modelVersion: number;
	input: Readonly<JourneyInput>;
	stages: ReadonlyArray<Readonly<JourneyStage>>;
	segments: ReadonlyArray<Readonly<Segment>>;
	responseBytes: number;
	totalMs: number;
	accounting: Readonly<JourneyAccounting>;
}

export interface JourneySnapshot {
	stage: Readonly<JourneyStage>;
	timeMs: number;
	progress: number;
	stageProgress: number;
	responseProgress: number;
	/** Bytes released in order by the receiver, not bytes painted on screen. */
	deliveredBytes: number;
	bufferedBytes: number;
	/** Receiver's cumulative ACK boundary in relative byte offsets, not ACK packet count. */
	nextExpectedByte: number;
	segments: ReadonlyArray<Readonly<SegmentSnapshot>>;
	pageProgress: number;
	source: 'origin' | 'browser-cache';
}

export const DEFAULT_INPUT: Readonly<JourneyInput> = Object.freeze({
	rttMs: 120,
	connection: 'fresh',
	lostSegment: false,
	serverMs: 80,
	cache: 'origin'
});

export const ASSUMPTIONS = Object.freeze({
	responseBytes: 4800,
	segmentBytes: 1200,
	/** A deliberately slow illustrative link makes serialization visible. */
	bytesPerMs: 60,
	minimumRecoveryDelayMs: 250,
	resourceServerMs: 12,
	resourceSerializationMs: 40,
	browserAssemblyMs: 60
});

const boundedNumber = (value: number | undefined, fallback: number, min: number, max: number) =>
	Number.isFinite(value) ? Math.max(min, Math.min(max, Math.round(value!))) : fallback;
const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

/** UI bounds are also enforced here; truthy strings never select a scenario. */
export function normaliseInput(input: Partial<JourneyInput> = {}): JourneyInput {
	return {
		rttMs: boundedNumber(input.rttMs, DEFAULT_INPUT.rttMs, 20, 600),
		connection: input.connection === 'reused' ? 'reused' : 'fresh',
		lostSegment: input.lostSegment === true,
		serverMs: boundedNumber(input.serverMs, DEFAULT_INPUT.serverMs, 0, 1500),
		cache: input.cache === 'fresh' ? 'fresh' : 'origin'
	};
}

export function createJourney(partial: Partial<JourneyInput> = DEFAULT_INPUT): Journey {
	const input = Object.freeze(normaliseInput(partial));
	const a = ASSUMPTIONS;
	const fromCache = input.cache === 'fresh';
	const setup = !fromCache && input.connection === 'fresh';
	const halfRtt = input.rttMs / 2;
	const dnsMs = setup ? input.rttMs : 0;
	const tcpMs = setup ? input.rttMs : 0;
	// One full TLS 1.3 handshake round trip, with no 0-RTT early data.
	const tlsMs = setup ? input.rttMs : 0;
	const requestTransitMs = fromCache ? 0 : halfRtt;
	const serverWorkMs = fromCache ? 0 : input.serverMs;
	const responseStartMs = dnsMs + tcpMs + tlsMs + requestTransitMs + serverWorkMs;
	const serializationMs = a.segmentBytes / a.bytesPerMs;
	const responseSerializationMs = fromCache ? 0 : a.responseBytes / a.bytesPerMs;
	const responseTransitMs = fromCache ? 0 : halfRtt;
	const originalResponseEndMs = responseStartMs + responseSerializationMs + responseTransitMs;

	const segments: Readonly<Segment>[] = fromCache
		? []
		: Array.from({ length: a.responseBytes / a.segmentBytes }, (_, index) => {
				const sendMs = responseStartMs + index * serializationMs;
				const originalArrivalMs = sendMs + serializationMs + halfRtt;
				const isLost = input.lostSegment && index === 1;
				// Leave time for later ranges to arrive before the chosen recovery event.
				const retransmitMs = isLost
					? Math.max(
							sendMs + Math.max(a.minimumRecoveryDelayMs, 2 * input.rttMs),
							originalResponseEndMs + serializationMs
						)
					: null;
				return Object.freeze({
					index,
					firstByte: index * a.segmentBytes,
					endByte: (index + 1) * a.segmentBytes,
					sizeBytes: a.segmentBytes,
					sendMs,
					originalArrivalMs,
					arrivalMs:
						retransmitMs === null ? originalArrivalMs : retransmitMs + serializationMs + halfRtt,
					lostAtMs: isLost ? sendMs + serializationMs + halfRtt / 2 : null,
					retransmitMs
				});
			});
	const responseEndMs = fromCache
		? responseStartMs
		: Math.max(...segments.map((segment) => segment.arrivalMs));
	const lossRecoveryMs = fromCache ? 0 : responseEndMs - originalResponseEndMs;
	// One aggregate follow-up bundle on the already-open connection. Real pages can
	// issue overlapping requests to many origins; that scheduling is outside this model.
	const resourceNetworkMs = fromCache ? 0 : input.rttMs;
	const resourceServerMs = fromCache ? 0 : a.resourceServerMs;
	const resourceSerializationMs = fromCache ? 0 : a.resourceSerializationMs;
	const browserAssemblyMs = a.browserAssemblyMs;
	const resourceDurationMs =
		resourceNetworkMs + resourceServerMs + resourceSerializationMs + browserAssemblyMs;

	const stages: Readonly<JourneyStage>[] = [];
	let cursor = 0;
	const addStage = (
		id: StageId,
		shortName: string,
		title: string,
		detail: string,
		area: Area,
		durationMs: number
	) => {
		stages.push(
			Object.freeze({
				id,
				shortName,
				title,
				detail,
				area,
				startMs: cursor,
				endMs: cursor + durationMs,
				skipped: durationMs === 0 && id !== 'complete'
			})
		);
		cursor += durationMs;
	};
	addStage(
		'dns',
		'DNS',
		'Find an address',
		setup
			? 'DNS supplies an IP address for the hostname. This example charges one round trip for a lookup.'
			: fromCache
				? 'The fresh browser cache needs no address lookup.'
				: 'This warm visit already has both a usable address and an open connection.',
		'address',
		dnsMs
	);
	addStage(
		'tcp',
		'TCP',
		'Establish a connection',
		'The TCP handshake establishes connection state at both ends. Routers still share the network; TCP does not reserve a physical route.',
		'coupling',
		tcpMs
	);
	addStage(
		'tls',
		'TLS',
		'Protect the exchange',
		'This TLS 1.3 handshake authenticates the server and establishes keys for encryption and integrity. The model uses no early data.',
		'coupling',
		tlsMs
	);
	addStage(
		'request',
		'Request',
		'Ask for the article',
		'An HTTP request gives the server a method and a resource path. Its outward journey takes half the chosen round-trip delay.',
		'transport',
		requestTransitMs
	);
	addStage(
		'server',
		'Server',
		'Prepare a response',
		'A handler obtains a file or application result and prepares an HTTP response. This work is separate from travel time.',
		'server',
		serverWorkMs
	);
	addStage(
		'response',
		'Response',
		input.lostSegment && !fromCache ? 'Restore the missing byte range' : 'Bring the response home',
		input.lostSegment && !fromCache
			? 'Later ranges can arrive first, but TCP holds them until the missing earlier range returns. Its cumulative acknowledgement names the next expected byte.'
			: 'TCP delivers its stream in order. The four ranges here represent the response after TLS decoding; their boundaries do not dictate HTTP message or TCP segment boundaries.',
		input.lostSegment && !fromCache ? 'buffer' : 'transport',
		responseEndMs - responseStartMs
	);
	addStage(
		'resources',
		fromCache ? 'Local copy' : 'Page',
		fromCache ? 'Read the fresh local copy' : 'Assemble the page',
		fromCache
			? 'This preset has a fresh saved page and its required resources. The browser can display them without a network request or origin work.'
			: 'The HTML prompts more requests for styles, images or scripts. One follow-up bundle reuses the connection, then the browser completes the page.',
		'browser',
		resourceDurationMs
	);
	addStage(
		'complete',
		'Ready',
		'The page is ready',
		'Independent systems cooperate because they agree on addresses, transport rules, security and the meaning of requests and responses.',
		'browser',
		0
	);
	const accounting = Object.freeze({
		dnsMs,
		tcpMs,
		tlsMs,
		requestTransitMs,
		serverWorkMs,
		responseTransitMs,
		responseSerializationMs,
		lossRecoveryMs,
		resourceNetworkMs,
		resourceServerMs,
		resourceSerializationMs,
		browserAssemblyMs,
		totalMs: cursor
	});
	return Object.freeze({
		modelVersion: MODEL_VERSION,
		input,
		stages: Object.freeze(stages),
		segments: Object.freeze(segments),
		responseBytes: a.responseBytes,
		totalMs: cursor,
		accounting
	});
}

export function sampleJourney(journey: Journey, requestedTimeMs: number): JourneySnapshot {
	const timeMs = Math.max(
		0,
		Math.min(journey.totalMs, Number.isNaN(requestedTimeMs) ? 0 : requestedTimeMs)
	);
	const complete = journey.stages[journey.stages.length - 1];
	const stage =
		journey.stages.find(
			(candidate) => !candidate.skipped && timeMs >= candidate.startMs && timeMs < candidate.endMs
		) ?? complete;
	let deliveredBytes = 0;
	// Walk the ordered ranges, rather than counting arrivals: later arrivals cannot
	// cross a gap. No transport bytes are received in the local-cache scenario.
	for (const segment of journey.segments) {
		if (segment.firstByte !== deliveredBytes || segment.arrivalMs > timeMs) break;
		deliveredBytes = segment.endByte;
	}
	let bufferedBytes = 0;
	const segments = journey.segments.map((segment): Readonly<SegmentSnapshot> => {
		let state: SegmentState = 'waiting';
		let travelProgress = 0;
		if (timeMs >= segment.arrivalMs) {
			state = segment.endByte <= deliveredBytes ? 'delivered' : 'buffered';
			travelProgress = 1;
			if (state === 'buffered') bufferedBytes += segment.sizeBytes;
		} else if (segment.retransmitMs !== null && timeMs >= segment.retransmitMs) {
			state = 'retransmitting';
			travelProgress = clamp01(
				(timeMs - segment.retransmitMs) / (segment.arrivalMs - segment.retransmitMs)
			);
		} else if (segment.lostAtMs !== null && timeMs >= segment.lostAtMs) {
			state = 'lost';
			travelProgress = clamp01(
				(segment.lostAtMs - segment.sendMs) / (segment.originalArrivalMs - segment.sendMs)
			);
		} else if (timeMs >= segment.sendMs) {
			state = 'travelling';
			travelProgress = clamp01(
				(timeMs - segment.sendMs) / (segment.originalArrivalMs - segment.sendMs)
			);
		}
		return Object.freeze({ ...segment, state, travelProgress });
	});
	const resources = journey.stages.find((candidate) => candidate.id === 'resources')!;
	const resourceProgress = clamp01(
		(timeMs - resources.startMs) / (resources.endMs - resources.startMs)
	);
	const fromCache = journey.input.cache === 'fresh';
	const responseProgress = deliveredBytes / journey.responseBytes;
	return Object.freeze({
		stage,
		timeMs,
		progress: timeMs / journey.totalMs,
		stageProgress:
			stage.id === 'complete'
				? 1
				: clamp01((timeMs - stage.startMs) / (stage.endMs - stage.startMs)),
		responseProgress,
		deliveredBytes,
		bufferedBytes,
		nextExpectedByte: deliveredBytes,
		segments: Object.freeze(segments),
		pageProgress: fromCache ? resourceProgress : 0.65 * responseProgress + 0.35 * resourceProgress,
		source: fromCache ? 'browser-cache' : 'origin'
	});
}
