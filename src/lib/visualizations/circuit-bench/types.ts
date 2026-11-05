export type ComponentKind =
	| 'ground'
	| 'resistor'
	| 'capacitor'
	| 'inductor'
	| 'dc_voltage'
	| 'sine_voltage'
	| 'square_voltage'
	| 'switch_spst'
	| 'switch_spdt'
	| 'probe_voltage';

export type RotationDeg = 0 | 90 | 180 | 270;

export interface TerminalDef {
	id: string;
	label: string;
	/** Offset in grid units before rotation (relative to component origin x, y) */
	dx: number;
	dy: number;
}

export interface ComponentParams {
	/** Resistance in ohms (resistor) */
	resistance?: number;
	/** Capacitance in farads (capacitor) */
	capacitance?: number;
	/** Initial capacitor voltage in volts at t = 0 */
	initialVoltage?: number;
	/** Inductance in henries (inductor) */
	inductance?: number;
	/** Initial inductor current in amperes at t = 0 (from A to B) */
	initialCurrent?: number;
	/** DC source voltage in volts (dc_voltage) */
	voltage?: number;
	/** AC peak amplitude in volts (sine_voltage, square_voltage) */
	amplitude?: number;
	/** AC frequency in hertz (sine_voltage, square_voltage) */
	frequency?: number;
	/** DC offset in volts (sine_voltage, square_voltage) */
	offset?: number;
	/** Phase in degrees (sine_voltage) */
	phaseDeg?: number;
	/** Duty cycle percentage 5..95 (square_voltage) */
	dutyPercent?: number;
	/** Closed state for on/off SPST switch */
	closed?: boolean;
	/** Active throw position for changeover SPDT switch */
	position?: 'A' | 'B';
	/** Probe mode for voltage probe component */
	probeMode?: 'node' | 'differential';
}

export interface CircuitComponent {
	id: string;
	kind: ComponentKind;
	label: string;
	/** Grid coordinates (integer units) */
	x: number;
	y: number;
	rotation: RotationDeg;
	params: ComponentParams;
}

export interface CircuitJunction {
	id: string;
	x: number;
	y: number;
}

export type WireEndpoint =
	| { type: 'terminal'; componentId: string; terminalId: string }
	| { type: 'junction'; junctionId: string };

export interface CircuitWire {
	id: string;
	from: WireEndpoint;
	to: WireEndpoint;
	bend?: 'hv' | 'vh';
}

export type ScopeChannelTarget =
	| { kind: 'component_voltage'; componentId: string; label?: string }
	| { kind: 'component_current'; componentId: string; label?: string }
	| { kind: 'probe_voltage'; componentId: string; label?: string }
	| { kind: 'node_voltage'; componentId: string; terminalId: string; label?: string }
	| { kind: 'none' };

export interface ScopeSettings {
	channel1: ScopeChannelTarget;
	channel2: ScopeChannelTarget;
	timeSpanSec: number;
	verticalScaleMode: 'auto' | 'fixed';
	channel1Range: [number, number];
	channel2Range: [number, number];
}

export interface SimulationSettings {
	/** Numerical integration time step in seconds */
	dtSec: number;
	/** Minimum recorded waveform sample spacing in seconds (separate from dtSec) */
	sampleIntervalSec: number;
	/** Simulated seconds per wall-clock second during Run */
	playbackSpeed: number;
}

export interface CircuitDocument {
	schemaVersion: 1;
	id: string;
	title: string;
	question: string;
	instruction: string;
	explanation: string;
	suggestedChange: string;
	exampleId?: string;
	components: CircuitComponent[];
	junctions: CircuitJunction[];
	wires: CircuitWire[];
	scope: ScopeSettings;
	simulation: SimulationSettings;
}

export interface ComponentMeasurement {
	componentId: string;
	/** Terminal voltages relative to Ground (0 V) */
	terminalVoltages: Record<string, number>;
	/** Voltage drop V(A) - V(B) or V(pos) - V(neg) in volts */
	voltageDrop: number;
	/**
	 * Signed conventional current in amperes:
	 * - Two-terminal passives & SPST switches (`resistor`, `capacitor`, `inductor`, `switch_spst`): from terminal `A` to terminal `B` (`A → B`).
	 * - Changeover switches (`switch_spdt`): from `common` to the active throw (`common → throwA` or `common → throwB`).
	 * - Independent voltage sources (`dc_voltage`, `sine_voltage`, `square_voltage`): conventional current delivered out of the positive `pos` (`+`) terminal into the circuit (`− → +` internally through the source).
	 */
	current: number;
	/** Instantaneous power in watts (positive = dissipated/absorbed, negative = supplied) */
	power: number;
	/** Stored reactive energy in joules (for capacitor or inductor) */
	storedEnergy?: number;
}

export type DiagnosticCode =
	| 'missing_ground'
	| 'empty_circuit'
	| 'floating_node'
	| 'conflicting_sources'
	| 'inductor_cutset'
	| 'singular_system'
	| 'non_finite_result'
	| 'complexity_limit';

export interface CircuitDiagnostic {
	code: DiagnosticCode;
	severity: 'error' | 'warning';
	message: string;
	affectedComponentIds: string[];
	affectedLabels: string[];
}

export interface SimulationSnapshot {
	timeSec: number;
	/** Node voltage for each component terminal key `${componentId}:${terminalId}` */
	terminalVoltages: Record<string, number>;
	/** Voltage at each explicit junction `${junctionId}` */
	junctionVoltages: Record<string, number>;
	/** Voltage on each wire `${wireId}` */
	wireVoltages: Record<string, number>;
	/** Signed conventional current on each wire `${wireId}` from `from` to `to` */
	wireCurrents: Record<string, number>;
	/** Per-component measurements */
	components: Record<string, ComponentMeasurement>;
	/** Internal reactive state preserved across steps and parameter edits */
	reactiveState: ReactiveState;
}

export interface ReactiveState {
	capacitorVoltages: Record<string, number>;
	capacitorCurrents: Record<string, number>;
	inductorCurrents: Record<string, number>;
	inductorVoltages: Record<string, number>;
}

export interface ScopeSample {
	timeSec: number;
	ch1: number | null;
	ch2: number | null;
}

export interface TraceMarker {
	id: string;
	timeSec: number;
	label: string;
	detail: string;
	componentId?: string;
}

export interface SolverBatchResult {
	ok: boolean;
	diagnostics: CircuitDiagnostic[];
	snapshot: SimulationSnapshot | null;
	samples: ScopeSample[];
	stepsExecuted: number;
}

export const CIRCUIT_LIMITS = {
	MAX_COMPONENTS: 64,
	MAX_WIRES: 128,
	MAX_JUNCTIONS: 64,
	MAX_STORED_SAMPLES: 4000,
	MAX_STEPS_PER_BATCH: 500,
	MAX_MATRIX_DIMENSION: 128,
	MAX_IMPORT_BYTES: 262_144,
	MAX_SHARE_URL_LENGTH: 2000,
	GRID_MIN: -60,
	GRID_MAX: 120
} as const;
