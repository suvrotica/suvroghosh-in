export type NucleusSemanticView = 'cell' | 'nucleus' | 'territory' | 'locus';

export type NucleusDirectedBeat =
	| 'boundary'
	| 'relay'
	| 'nuclear'
	| 'scale-cut'
	| 'histories'
	| 'silent'
	| 'burst'
	| 'probability';

/**
 * Authored film coordinates supplied by the guided-film controller.
 *
 * `progress` is normalized inside the current beat. `filmTime` is the pause-safe presentation
 * clock in milliseconds. Neither value is scientific model time; the selected trace continues to be
 * sampled independently through `setPlaybackTime`.
 */
export type NucleusDirectedPresentation = Readonly<{
	beat: NucleusDirectedBeat;
	progress: number;
	filmTime: number;
}>;

export type NucleusQualityChoice = 'auto' | 'low' | 'medium' | 'high';
export type NucleusQualityTier = Exclude<NucleusQualityChoice, 'auto'>;

export type NucleusInterventionTarget = 'receptor' | 'signal' | 'binding-site' | 'contact';

export type NucleusRendererStatus = 'ready' | 'context-lost' | 'error';

export type NucleusScalarTraceBuffer = Float32Array | Float64Array;
export type NucleusCountTraceBuffer = Uint16Array | Uint32Array;

/**
 * Borrowed scientific output consumed by the renderer.
 *
 * The object and its buffer references are immutable. The renderer never writes to any buffer,
 * derives no scientific outcome from scene coordinates, and does not retain transferred ownership.
 * Continuous buffers are linearly interpolated; discrete buffers use the last sample at or before
 * the requested presentation time.
 */
export type NucleusTraceBuffers = Readonly<{
	modelVersion: string;
	seed: number;
	duration: number;
	sampleTimes: NucleusScalarTraceBuffer;
	signalInput: NucleusScalarTraceBuffer;
	receptorActivity: NucleusScalarTraceBuffer;
	downstreamActivity: NucleusScalarTraceBuffer;
	nuclearActivity: NucleusScalarTraceBuffer;
	occupancy: NucleusScalarTraceBuffer;
	licensing: NucleusScalarTraceBuffer;
	contactPropensity: NucleusScalarTraceBuffer;
	contactState: Uint8Array;
	promoterState: Uint8Array;
	rnaCount: NucleusCountTraceBuffer;
	initiationTimes: NucleusScalarTraceBuffer;
}>;

export type NucleusIntroPresentation = Readonly<{
	active: boolean;
	/** Normalized wall-clock choreography progress. The Svelte/controller layer owns timing. */
	progress: number;
}>;

export type NucleusRendererCallbacks = Readonly<{
	onStatus?: (status: NucleusRendererStatus, message?: string) => void;
	onQualityChange?: (change: NucleusQualityChange) => void;
	onManualCamera?: () => void;
}>;

export type NucleusQualityChange = Readonly<{
	quality: NucleusQualityTier;
	averageFrameMs: number;
	reason: 'initial' | 'explicit' | 'adaptive';
}>;

export type NucleusRendererOptions = Readonly<{
	quality?: NucleusQualityChoice;
	motionAllowed?: boolean;
	highContrast?: boolean;
	/** A presentation-only seed for territory placement. It never enters the scientific model. */
	decorativeSeed?: number;
	/** Deterministic test/degradation hook; the caller normally leaves this false. */
	forceWebGL2Unavailable?: boolean;
	callbacks?: NucleusRendererCallbacks;
}>;

export type NucleusRendererDiagnostics = Readonly<{
	quality: NucleusQualityTier;
	pixelRatio: number;
	drawCalls: number;
	triangles: number;
	points: number;
	geometries: number;
	textures: number;
	activeRnaEvents: number;
	contextLost: boolean;
}>;

export interface NucleusRenderer {
	readonly canvas: HTMLCanvasElement;
	setTrace(trace: NucleusTraceBuffers | null): void;
	setPlaybackTime(modelTime: number): void;
	/** Numeric arguments keep the requestAnimationFrame path allocation-free. */
	setIntro(active: boolean, normalizedProgress: number): void;
	/**
	 * Enter or update the authored guided-film presentation. Pass `null` to restore the legacy
	 * semantic-view camera and experiment interactions.
	 */
	setDirectedPresentation(
		beat: NucleusDirectedBeat | null,
		normalizedProgress: number,
		filmTime: number
	): void;
	setView(view: NucleusSemanticView, options?: { snap?: boolean }): void;
	setMotionAllowed(allowed: boolean): void;
	setHighContrast(enabled: boolean): void;
	setSelectedTarget(target: NucleusInterventionTarget | null): void;
	/** Runtime-safe quality facets update in place; recreate the renderer to change context MSAA. */
	setQuality(choice: NucleusQualityChoice): void;
	resize(): void;
	/**
	 * Render one frame. The caller owns the single requestAnimationFrame loop and should pass a
	 * clamped wall-clock delta (not model playback time). A zero delta is valid for an immediate
	 * still redraw.
	 */
	render(deltaSeconds: number): void;
	pickTarget(clientX: number, clientY: number): NucleusInterventionTarget | null;
	captureCanvas(): HTMLCanvasElement;
	getDiagnostics(): NucleusRendererDiagnostics;
	dispose(): void;
}
