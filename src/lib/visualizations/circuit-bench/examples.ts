import type { CircuitDocument } from './types';
import { cloneCircuitDocument } from './model';

export interface ExampleSummary {
	id: string;
	shortTitle: string;
	title: string;
	question: string;
	category: 'Transient' | 'DC Fundamentals' | 'AC & Filters' | 'Scratchpad';
}

const EXAMPLES_DATA: CircuitDocument[] = [
	{
		schemaVersion: 1,
		id: 'rc-charging',
		exampleId: 'rc-charging',
		title: 'How long does a capacitor take to charge?',
		question: 'How long does a capacitor take to charge?',
		instruction:
			'Press Run. Watch the capacitor voltage rise and the current fall. Then double the resistance and run it again.',
		explanation:
			'Time constant τ = R × C = 1 second. Immediately after the 5 V supply is applied, capacitor voltage is 0 V and current is 5 mA. After 1 second, capacitor voltage is approximately 3.16 V and current is approximately 1.84 mA. After 5 seconds, capacitor voltage is approximately 4.97 V. Doubling the resistance doubles the charging time and halves the initial current.',
		suggestedChange:
			'Select R1, double its resistance from 1 kΩ to 2 kΩ, then press Restart and Run. The initial current halves to 2.50 mA and the charging time constant doubles to 2 seconds.',
		components: [
			{
				id: 'v1',
				kind: 'dc_voltage',
				label: 'V1',
				x: 4,
				y: 6,
				rotation: 0,
				params: { voltage: 5 }
			},
			{
				id: 'r1',
				kind: 'resistor',
				label: 'R1',
				x: 9,
				y: 3,
				rotation: 0,
				params: { resistance: 1000 }
			},
			{
				id: 'c1',
				kind: 'capacitor',
				label: 'C1',
				x: 14,
				y: 6,
				rotation: 90,
				params: { capacitance: 0.001, initialVoltage: 0 }
			},
			{
				id: 'gnd1',
				kind: 'ground',
				label: 'GND1',
				x: 9,
				y: 10,
				rotation: 0,
				params: {}
			}
		],
		junctions: [{ id: 'j_bottom', x: 9, y: 9 }],
		wires: [
			{
				id: 'w_v1_r1',
				from: { type: 'terminal', componentId: 'v1', terminalId: 'pos' },
				to: { type: 'terminal', componentId: 'r1', terminalId: 'A' },
				bend: 'vh'
			},
			{
				id: 'w_r1_c1',
				from: { type: 'terminal', componentId: 'r1', terminalId: 'B' },
				to: { type: 'terminal', componentId: 'c1', terminalId: 'A' },
				bend: 'hv'
			},
			{
				id: 'w_c1_gnd',
				from: { type: 'terminal', componentId: 'c1', terminalId: 'B' },
				to: { type: 'junction', junctionId: 'j_bottom' },
				bend: 'vh'
			},
			{
				id: 'w_v1_gnd',
				from: { type: 'terminal', componentId: 'v1', terminalId: 'neg' },
				to: { type: 'junction', junctionId: 'j_bottom' },
				bend: 'vh'
			},
			{
				id: 'w_j_gnd',
				from: { type: 'junction', junctionId: 'j_bottom' },
				to: { type: 'terminal', componentId: 'gnd1', terminalId: 'A' },
				bend: 'hv'
			}
		],
		scope: {
			channel1: { kind: 'component_voltage', componentId: 'c1', label: 'Capacitor voltage V(C1)' },
			channel2: { kind: 'component_current', componentId: 'r1', label: 'Resistor current I(R1)' },
			timeSpanSec: 5,
			verticalScaleMode: 'fixed',
			channel1Range: [0, 5.5],
			channel2Range: [0, 0.0055]
		},
		simulation: {
			dtSec: 0.002,
			sampleIntervalSec: 0.01,
			playbackSpeed: 1
		}
	},
	{
		schemaVersion: 1,
		id: 'ohms-law',
		exampleId: 'ohms-law',
		title: 'Ohm’s law: What happens to current when resistance doubles?',
		question: 'What happens to current when resistance doubles?',
		instruction:
			'Inspect R1 to see 5.00 mA and 25.00 mW across 1 kΩ. Double the resistance to 2 kΩ and compare the new current and power.',
		explanation:
			'By Ohm’s law, I = V / R. With a 5 V supply across 1 kΩ, current is 5 mA and power dissipated is P = V × I = 25 mW. Doubling the resistance to 2 kΩ halves the current to 2.5 mA and halves the power to 12.5 mW.',
		suggestedChange:
			'Increase R1 to 2 kΩ. Current drops immediately from 5.00 mA to 2.50 mA because the same 5 V pushes against twice the opposition.',
		components: [
			{
				id: 'v1',
				kind: 'dc_voltage',
				label: 'V1',
				x: 5,
				y: 6,
				rotation: 0,
				params: { voltage: 5 }
			},
			{
				id: 'r1',
				kind: 'resistor',
				label: 'R1',
				x: 12,
				y: 6,
				rotation: 90,
				params: { resistance: 1000 }
			},
			{
				id: 'gnd1',
				kind: 'ground',
				label: 'GND1',
				x: 8,
				y: 10,
				rotation: 0,
				params: {}
			}
		],
		junctions: [{ id: 'j_gnd', x: 8, y: 9 }],
		wires: [
			{
				id: 'w_top',
				from: { type: 'terminal', componentId: 'v1', terminalId: 'pos' },
				to: { type: 'terminal', componentId: 'r1', terminalId: 'A' },
				bend: 'hv'
			},
			{
				id: 'w_bot_r1',
				from: { type: 'terminal', componentId: 'r1', terminalId: 'B' },
				to: { type: 'junction', junctionId: 'j_gnd' },
				bend: 'vh'
			},
			{
				id: 'w_bot_v1',
				from: { type: 'terminal', componentId: 'v1', terminalId: 'neg' },
				to: { type: 'junction', junctionId: 'j_gnd' },
				bend: 'vh'
			},
			{
				id: 'w_gnd',
				from: { type: 'junction', junctionId: 'j_gnd' },
				to: { type: 'terminal', componentId: 'gnd1', terminalId: 'A' },
				bend: 'hv'
			}
		],
		scope: {
			channel1: { kind: 'component_voltage', componentId: 'r1', label: 'Voltage V(R1)' },
			channel2: { kind: 'component_current', componentId: 'r1', label: 'Current I(R1)' },
			timeSpanSec: 5,
			verticalScaleMode: 'fixed',
			channel1Range: [0, 6],
			channel2Range: [0, 0.006]
		},
		simulation: {
			dtSec: 0.005,
			sampleIntervalSec: 0.02,
			playbackSpeed: 1
		}
	},
	{
		schemaVersion: 1,
		id: 'series-parallel',
		exampleId: 'series-parallel',
		title: 'Series and parallel resistors: How does the path change the total current?',
		question: 'How does the path change the total current?',
		instruction:
			'Compare parallel and series paths across 5 V: S1 switches parallel branch R2 (10 mA vs 5 mA), and S2 bypasses or inserts series resistor R3 (5 mA vs 2.5 mA).',
		explanation:
			'In parallel (S1 closed, S2 closed), two 1 kΩ branches each see 5 V and draw 5 mA + 5 mA = 10 mA (500 Ω equivalent). Opening S1 leaves a single 1 kΩ path (5 mA). Opening bypass switch S2 places R1 and R3 in series (2 kΩ equivalent), halving the branch current to 2.5 mA and splitting 5 V into 2.5 V across each resistor.',
		suggestedChange:
			'Open switch S1 to drop total current from 10.00 mA (parallel) to 5.00 mA (single 1 kΩ), then open switch S2 to put R1 and R3 in series (2.50 mA).',
		components: [
			{
				id: 'v1',
				kind: 'dc_voltage',
				label: 'V1',
				x: 4,
				y: 6,
				rotation: 0,
				params: { voltage: 5 }
			},
			{
				id: 'r1',
				kind: 'resistor',
				label: 'R1',
				x: 9,
				y: 4,
				rotation: 90,
				params: { resistance: 1000 }
			},
			{
				id: 'r3',
				kind: 'resistor',
				label: 'R3',
				x: 9,
				y: 8,
				rotation: 90,
				params: { resistance: 1000 }
			},
			{
				id: 's2',
				kind: 'switch_spst',
				label: 'S2',
				x: 12,
				y: 8,
				rotation: 90,
				params: { closed: true }
			},
			{
				id: 's1',
				kind: 'switch_spst',
				label: 'S1',
				x: 14,
				y: 2,
				rotation: 0,
				params: { closed: true }
			},
			{
				id: 'r2',
				kind: 'resistor',
				label: 'R2',
				x: 16,
				y: 6,
				rotation: 90,
				params: { resistance: 1000 }
			},
			{
				id: 'gnd1',
				kind: 'ground',
				label: 'GND1',
				x: 9,
				y: 11,
				rotation: 0,
				params: {}
			}
		],
		junctions: [
			{ id: 'j_top', x: 9, y: 2 },
			{ id: 'j_ser', x: 9, y: 6 },
			{ id: 'j_bot', x: 9, y: 10 }
		],
		wires: [
			{
				id: 'w_v1_top',
				from: { type: 'terminal', componentId: 'v1', terminalId: 'pos' },
				to: { type: 'junction', junctionId: 'j_top' },
				bend: 'vh'
			},
			{
				id: 'w_top_r1',
				from: { type: 'junction', junctionId: 'j_top' },
				to: { type: 'terminal', componentId: 'r1', terminalId: 'A' },
				bend: 'hv'
			},
			{
				id: 'w_r1_ser',
				from: { type: 'terminal', componentId: 'r1', terminalId: 'B' },
				to: { type: 'junction', junctionId: 'j_ser' },
				bend: 'vh'
			},
			{
				id: 'w_ser_r3',
				from: { type: 'junction', junctionId: 'j_ser' },
				to: { type: 'terminal', componentId: 'r3', terminalId: 'A' },
				bend: 'vh'
			},
			{
				id: 'w_r3_bot',
				from: { type: 'terminal', componentId: 'r3', terminalId: 'B' },
				to: { type: 'junction', junctionId: 'j_bot' },
				bend: 'vh'
			},
			{
				id: 'w_ser_s2',
				from: { type: 'junction', junctionId: 'j_ser' },
				to: { type: 'terminal', componentId: 's2', terminalId: 'A' },
				bend: 'hv'
			},
			{
				id: 'w_s2_bot',
				from: { type: 'terminal', componentId: 's2', terminalId: 'B' },
				to: { type: 'junction', junctionId: 'j_bot' },
				bend: 'vh'
			},
			{
				id: 'w_top_s1',
				from: { type: 'junction', junctionId: 'j_top' },
				to: { type: 'terminal', componentId: 's1', terminalId: 'A' },
				bend: 'hv'
			},
			{
				id: 'w_s1_r2',
				from: { type: 'terminal', componentId: 's1', terminalId: 'B' },
				to: { type: 'terminal', componentId: 'r2', terminalId: 'A' },
				bend: 'hv'
			},
			{
				id: 'w_r2_bot',
				from: { type: 'terminal', componentId: 'r2', terminalId: 'B' },
				to: { type: 'junction', junctionId: 'j_bot' },
				bend: 'vh'
			},
			{
				id: 'w_v1_bot',
				from: { type: 'terminal', componentId: 'v1', terminalId: 'neg' },
				to: { type: 'junction', junctionId: 'j_bot' },
				bend: 'vh'
			},
			{
				id: 'w_bot_gnd',
				from: { type: 'junction', junctionId: 'j_bot' },
				to: { type: 'terminal', componentId: 'gnd1', terminalId: 'A' },
				bend: 'hv'
			}
		],
		scope: {
			channel1: {
				kind: 'component_current',
				componentId: 'v1',
				label: 'Total supply current I(V1)'
			},
			channel2: { kind: 'component_current', componentId: 'r2', label: 'Branch 2 current I(R2)' },
			timeSpanSec: 5,
			verticalScaleMode: 'fixed',
			channel1Range: [0, 0.012],
			channel2Range: [0, 0.012]
		},
		simulation: {
			dtSec: 0.005,
			sampleIntervalSec: 0.02,
			playbackSpeed: 1
		}
	},
	{
		schemaVersion: 1,
		id: 'voltage-divider',
		exampleId: 'voltage-divider',
		title: 'Voltage divider: How can two resistors produce a smaller voltage?',
		question: 'How can two resistors produce a smaller voltage?',
		instruction:
			'Two equal 1 kΩ resistors in series divide the 5 V supply in half (2.50 V at probe P1). Change R2 to shift the output ratio.',
		explanation:
			'The same current flows through R1 and R2 in series. The output voltage is V_out = V_in × R2 / (R1 + R2). When R1 = R2 = 1 kΩ, the midpoint sits halfway at 2.50 V.',
		suggestedChange:
			'Increase R2 from 1 kΩ to 3 kΩ. The midpoint voltage rises to 3.75 V because R2 now accounts for three-quarters of the total 4 kΩ series resistance.',
		components: [
			{
				id: 'v1',
				kind: 'dc_voltage',
				label: 'V1',
				x: 4,
				y: 6,
				rotation: 0,
				params: { voltage: 5 }
			},
			{
				id: 'r1',
				kind: 'resistor',
				label: 'R1',
				x: 11,
				y: 4,
				rotation: 90,
				params: { resistance: 1000 }
			},
			{
				id: 'r2',
				kind: 'resistor',
				label: 'R2',
				x: 11,
				y: 8,
				rotation: 90,
				params: { resistance: 1000 }
			},
			{
				id: 'p1',
				kind: 'probe_voltage',
				label: 'P1',
				x: 15,
				y: 5,
				rotation: 0,
				params: { probeMode: 'node' }
			},
			{
				id: 'gnd1',
				kind: 'ground',
				label: 'GND1',
				x: 8,
				y: 11,
				rotation: 0,
				params: {}
			}
		],
		junctions: [
			{ id: 'j_mid', x: 11, y: 6 },
			{ id: 'j_bot', x: 8, y: 10 }
		],
		wires: [
			{
				id: 'w_v1_r1',
				from: { type: 'terminal', componentId: 'v1', terminalId: 'pos' },
				to: { type: 'terminal', componentId: 'r1', terminalId: 'A' },
				bend: 'vh'
			},
			{
				id: 'w_r1_mid',
				from: { type: 'terminal', componentId: 'r1', terminalId: 'B' },
				to: { type: 'junction', junctionId: 'j_mid' },
				bend: 'hv'
			},
			{
				id: 'w_mid_r2',
				from: { type: 'junction', junctionId: 'j_mid' },
				to: { type: 'terminal', componentId: 'r2', terminalId: 'A' },
				bend: 'hv'
			},
			{
				id: 'w_mid_p1',
				from: { type: 'junction', junctionId: 'j_mid' },
				to: { type: 'terminal', componentId: 'p1', terminalId: 'pos' },
				bend: 'hv'
			},
			{
				id: 'w_r2_bot',
				from: { type: 'terminal', componentId: 'r2', terminalId: 'B' },
				to: { type: 'junction', junctionId: 'j_bot' },
				bend: 'vh'
			},
			{
				id: 'w_v1_bot',
				from: { type: 'terminal', componentId: 'v1', terminalId: 'neg' },
				to: { type: 'junction', junctionId: 'j_bot' },
				bend: 'vh'
			},
			{
				id: 'w_bot_gnd',
				from: { type: 'junction', junctionId: 'j_bot' },
				to: { type: 'terminal', componentId: 'gnd1', terminalId: 'A' },
				bend: 'hv'
			}
		],
		scope: {
			channel1: { kind: 'probe_voltage', componentId: 'p1', label: 'Midpoint voltage V(P1)' },
			channel2: { kind: 'component_current', componentId: 'r1', label: 'Divider current I(R1)' },
			timeSpanSec: 5,
			verticalScaleMode: 'fixed',
			channel1Range: [0, 5.5],
			channel2Range: [0, 0.0055]
		},
		simulation: {
			dtSec: 0.005,
			sampleIntervalSec: 0.02,
			playbackSpeed: 1
		}
	},
	{
		schemaVersion: 1,
		id: 'loaded-divider',
		exampleId: 'loaded-divider',
		title: 'Loaded voltage divider: Why does the output change when another resistor is connected?',
		question: 'Why does the output change when another resistor is connected?',
		instruction:
			'With load R3 (1 kΩ) connected via switch S1, the 2.50 V divider sags to 1.67 V. Toggle S1 or increase R3 to see why.',
		explanation:
			'A connected load draws current through the upper resistor R1. Load resistor R3 sits in parallel with R2, lowering the bottom combined resistance from 1 kΩ to 500 Ω and pulling the output down from 2.50 V to 1.67 V.',
		suggestedChange:
			'Open S1 to observe the unloaded 2.50 V output, or increase the load resistance R3 to 10 kΩ so it draws much less current and sags only to 2.38 V.',
		components: [
			{
				id: 'v1',
				kind: 'dc_voltage',
				label: 'V1',
				x: 4,
				y: 6,
				rotation: 0,
				params: { voltage: 5 }
			},
			{
				id: 'r1',
				kind: 'resistor',
				label: 'R1',
				x: 10,
				y: 4,
				rotation: 90,
				params: { resistance: 1000 }
			},
			{
				id: 'r2',
				kind: 'resistor',
				label: 'R2',
				x: 10,
				y: 8,
				rotation: 90,
				params: { resistance: 1000 }
			},
			{
				id: 's1',
				kind: 'switch_spst',
				label: 'S1',
				x: 13,
				y: 6,
				rotation: 0,
				params: { closed: true }
			},
			{
				id: 'r3',
				kind: 'resistor',
				label: 'R3',
				x: 16,
				y: 8,
				rotation: 90,
				params: { resistance: 1000 }
			},
			{
				id: 'p1',
				kind: 'probe_voltage',
				label: 'P1',
				x: 7,
				y: 5,
				rotation: 0,
				params: { probeMode: 'node' }
			},
			{
				id: 'gnd1',
				kind: 'ground',
				label: 'GND1',
				x: 10,
				y: 11,
				rotation: 0,
				params: {}
			}
		],
		junctions: [
			{ id: 'j_mid', x: 10, y: 6 },
			{ id: 'j_load', x: 16, y: 6 },
			{ id: 'j_bot', x: 10, y: 10 }
		],
		wires: [
			{
				id: 'w_v1_r1',
				from: { type: 'terminal', componentId: 'v1', terminalId: 'pos' },
				to: { type: 'terminal', componentId: 'r1', terminalId: 'A' },
				bend: 'vh'
			},
			{
				id: 'w_r1_mid',
				from: { type: 'terminal', componentId: 'r1', terminalId: 'B' },
				to: { type: 'junction', junctionId: 'j_mid' },
				bend: 'hv'
			},
			{
				id: 'w_mid_r2',
				from: { type: 'junction', junctionId: 'j_mid' },
				to: { type: 'terminal', componentId: 'r2', terminalId: 'A' },
				bend: 'hv'
			},
			{
				id: 'w_mid_s1',
				from: { type: 'junction', junctionId: 'j_mid' },
				to: { type: 'terminal', componentId: 's1', terminalId: 'A' },
				bend: 'hv'
			},
			{
				id: 'w_s1_load',
				from: { type: 'terminal', componentId: 's1', terminalId: 'B' },
				to: { type: 'junction', junctionId: 'j_load' },
				bend: 'hv'
			},
			{
				id: 'w_load_r3',
				from: { type: 'junction', junctionId: 'j_load' },
				to: { type: 'terminal', componentId: 'r3', terminalId: 'A' },
				bend: 'hv'
			},
			{
				id: 'w_load_p1',
				from: { type: 'junction', junctionId: 'j_mid' },
				to: { type: 'terminal', componentId: 'p1', terminalId: 'pos' },
				bend: 'hv'
			},
			{
				id: 'w_r2_bot',
				from: { type: 'terminal', componentId: 'r2', terminalId: 'B' },
				to: { type: 'junction', junctionId: 'j_bot' },
				bend: 'vh'
			},
			{
				id: 'w_r3_bot',
				from: { type: 'terminal', componentId: 'r3', terminalId: 'B' },
				to: { type: 'junction', junctionId: 'j_bot' },
				bend: 'vh'
			},
			{
				id: 'w_v1_bot',
				from: { type: 'terminal', componentId: 'v1', terminalId: 'neg' },
				to: { type: 'junction', junctionId: 'j_bot' },
				bend: 'vh'
			},
			{
				id: 'w_bot_gnd',
				from: { type: 'junction', junctionId: 'j_bot' },
				to: { type: 'terminal', componentId: 'gnd1', terminalId: 'A' },
				bend: 'hv'
			}
		],
		scope: {
			channel1: { kind: 'probe_voltage', componentId: 'p1', label: 'Output voltage V(P1)' },
			channel2: { kind: 'component_current', componentId: 'r3', label: 'Load current I(R3)' },
			timeSpanSec: 5,
			verticalScaleMode: 'fixed',
			channel1Range: [0, 5.5],
			channel2Range: [0, 0.005]
		},
		simulation: {
			dtSec: 0.005,
			sampleIntervalSec: 0.02,
			playbackSpeed: 1
		}
	},
	{
		schemaVersion: 1,
		id: 'rc-charge-discharge',
		exampleId: 'rc-charge-discharge',
		title: 'Capacitor charging and discharging: What determines how quickly the voltage changes?',
		question: 'What determines how quickly the voltage changes?',
		instruction:
			'Press Run to charge C1 through S1 (Position A). Then flip changeover switch S1 to Position B to discharge C1 back to 0 V.',
		explanation:
			'Both charging and discharging follow the same time constant τ = R × C = 1 s. When S1 switches to Position B, the capacitor drives current in the opposite direction through R1 until its stored energy is dissipated.',
		suggestedChange:
			'Increase the capacitance C1 to 2,000 µF. The voltage takes longer to rise and fall because the capacitor needs more charge to reach the same voltage.',
		components: [
			{
				id: 'v1',
				kind: 'dc_voltage',
				label: 'V1',
				x: 4,
				y: 5,
				rotation: 0,
				params: { voltage: 5 }
			},
			{
				id: 's1',
				kind: 'switch_spdt',
				label: 'S1',
				x: 8,
				y: 4,
				rotation: 180,
				params: { position: 'A' }
			},
			{
				id: 'r1',
				kind: 'resistor',
				label: 'R1',
				x: 13,
				y: 4,
				rotation: 0,
				params: { resistance: 1000 }
			},
			{
				id: 'c1',
				kind: 'capacitor',
				label: 'C1',
				x: 17,
				y: 6,
				rotation: 90,
				params: { capacitance: 0.001, initialVoltage: 0 }
			},
			{
				id: 'gnd1',
				kind: 'ground',
				label: 'GND1',
				x: 10,
				y: 10,
				rotation: 0,
				params: {}
			}
		],
		junctions: [{ id: 'j_gnd', x: 10, y: 9 }],
		wires: [
			{
				id: 'w_v1_s1a',
				from: { type: 'terminal', componentId: 'v1', terminalId: 'pos' },
				to: { type: 'terminal', componentId: 's1', terminalId: 'throwB' },
				bend: 'hv'
			},
			{
				id: 'w_s1b_gnd',
				from: { type: 'terminal', componentId: 's1', terminalId: 'throwA' },
				to: { type: 'junction', junctionId: 'j_gnd' },
				bend: 'vh'
			},
			{
				id: 'w_s1com_r1',
				from: { type: 'terminal', componentId: 's1', terminalId: 'common' },
				to: { type: 'terminal', componentId: 'r1', terminalId: 'A' },
				bend: 'hv'
			},
			{
				id: 'w_r1_c1',
				from: { type: 'terminal', componentId: 'r1', terminalId: 'B' },
				to: { type: 'terminal', componentId: 'c1', terminalId: 'A' },
				bend: 'hv'
			},
			{
				id: 'w_c1_gnd',
				from: { type: 'terminal', componentId: 'c1', terminalId: 'B' },
				to: { type: 'junction', junctionId: 'j_gnd' },
				bend: 'vh'
			},
			{
				id: 'w_v1_gnd',
				from: { type: 'terminal', componentId: 'v1', terminalId: 'neg' },
				to: { type: 'junction', junctionId: 'j_gnd' },
				bend: 'vh'
			},
			{
				id: 'w_j_gnd',
				from: { type: 'junction', junctionId: 'j_gnd' },
				to: { type: 'terminal', componentId: 'gnd1', terminalId: 'A' },
				bend: 'hv'
			}
		],
		scope: {
			channel1: { kind: 'component_voltage', componentId: 'c1', label: 'Capacitor voltage V(C1)' },
			channel2: { kind: 'component_current', componentId: 'r1', label: 'Resistor current I(R1)' },
			timeSpanSec: 6,
			verticalScaleMode: 'fixed',
			channel1Range: [-0.5, 5.5],
			channel2Range: [-0.0055, 0.0055]
		},
		simulation: {
			dtSec: 0.002,
			sampleIntervalSec: 0.01,
			playbackSpeed: 1
		}
	},
	{
		schemaVersion: 1,
		id: 'rc-low-pass',
		exampleId: 'rc-low-pass',
		title: 'RC low-pass filter: Why does the output shrink as the input frequency rises?',
		question: 'Why does the output shrink as the input frequency rises?',
		instruction:
			'Press Run to compare the 100 Hz input sine wave (V1) with the filtered capacitor output (C1). Then raise V1 frequency to 500 Hz.',
		explanation:
			'With R1 = 1 kΩ and C1 = 1 µF, the cutoff frequency is f_c = 1 / (2πRC) ≈ 159 Hz. Low frequencies give the capacitor enough time each half-cycle to follow the input; high frequencies reverse before the capacitor can charge.',
		suggestedChange:
			'Select sine source V1 and raise its frequency from 100 Hz to 500 Hz. Watch the output amplitude shrink from ~4.24 V to ~1.51 V and lag behind the input.',
		components: [
			{
				id: 'v1',
				kind: 'sine_voltage',
				label: 'V1',
				x: 4,
				y: 6,
				rotation: 0,
				params: { amplitude: 5, frequency: 100, offset: 0, phaseDeg: 0 }
			},
			{
				id: 'r1',
				kind: 'resistor',
				label: 'R1',
				x: 9,
				y: 3,
				rotation: 0,
				params: { resistance: 1000 }
			},
			{
				id: 'c1',
				kind: 'capacitor',
				label: 'C1',
				x: 14,
				y: 6,
				rotation: 90,
				params: { capacitance: 1e-6, initialVoltage: 0 }
			},
			{
				id: 'p1',
				kind: 'probe_voltage',
				label: 'P1',
				x: 17,
				y: 2,
				rotation: 0,
				params: { probeMode: 'node' }
			},
			{
				id: 'gnd1',
				kind: 'ground',
				label: 'GND1',
				x: 9,
				y: 10,
				rotation: 0,
				params: {}
			}
		],
		junctions: [
			{ id: 'j_out', x: 14, y: 3 },
			{ id: 'j_bot', x: 9, y: 9 }
		],
		wires: [
			{
				id: 'w_v1_r1',
				from: { type: 'terminal', componentId: 'v1', terminalId: 'pos' },
				to: { type: 'terminal', componentId: 'r1', terminalId: 'A' },
				bend: 'vh'
			},
			{
				id: 'w_r1_out',
				from: { type: 'terminal', componentId: 'r1', terminalId: 'B' },
				to: { type: 'junction', junctionId: 'j_out' },
				bend: 'hv'
			},
			{
				id: 'w_out_c1',
				from: { type: 'junction', junctionId: 'j_out' },
				to: { type: 'terminal', componentId: 'c1', terminalId: 'A' },
				bend: 'hv'
			},
			{
				id: 'w_out_p1',
				from: { type: 'junction', junctionId: 'j_out' },
				to: { type: 'terminal', componentId: 'p1', terminalId: 'pos' },
				bend: 'hv'
			},
			{
				id: 'w_c1_bot',
				from: { type: 'terminal', componentId: 'c1', terminalId: 'B' },
				to: { type: 'junction', junctionId: 'j_bot' },
				bend: 'vh'
			},
			{
				id: 'w_v1_bot',
				from: { type: 'terminal', componentId: 'v1', terminalId: 'neg' },
				to: { type: 'junction', junctionId: 'j_bot' },
				bend: 'vh'
			},
			{
				id: 'w_bot_gnd',
				from: { type: 'junction', junctionId: 'j_bot' },
				to: { type: 'terminal', componentId: 'gnd1', terminalId: 'A' },
				bend: 'hv'
			}
		],
		scope: {
			channel1: { kind: 'component_voltage', componentId: 'c1', label: 'Filtered output V(C1)' },
			channel2: { kind: 'component_voltage', componentId: 'v1', label: 'Sine input V(V1)' },
			timeSpanSec: 0.04,
			verticalScaleMode: 'fixed',
			channel1Range: [-5.5, 5.5],
			channel2Range: [-5.5, 5.5]
		},
		simulation: {
			dtSec: 0.00005,
			sampleIntervalSec: 0.0001,
			playbackSpeed: 0.01
		}
	},
	{
		schemaVersion: 1,
		id: 'rlc-response',
		exampleId: 'rlc-response',
		title:
			'RLC response: How do resistance, inductance, and capacitance affect oscillation and damping?',
		question: 'How do resistance, inductance, and capacitance affect oscillation and damping?',
		instruction:
			'Press Run to see the underdamped RLC step response ring past 5 V to ~8.65 V. Then increase R1 to 200 Ω to damp the oscillation.',
		explanation:
			'Energy exchanges between the inductor’s magnetic field (L1 = 100 mH) and the capacitor’s electric field (C1 = 10 µF) at ω_0 = 1/√(LC) = 1,000 rad/s (159 Hz). Resistance R1 dissipates energy on each swing, determining whether the response is underdamped, critically damped (200 Ω), or overdamped.',
		suggestedChange:
			'Increase R1 from 20 Ω to 200 Ω, then press Restart and Run. At critical damping (ζ = 1), the overshoot and ringing vanish completely.',
		components: [
			{
				id: 'v1',
				kind: 'dc_voltage',
				label: 'V1',
				x: 3,
				y: 6,
				rotation: 0,
				params: { voltage: 5 }
			},
			{
				id: 'r1',
				kind: 'resistor',
				label: 'R1',
				x: 7,
				y: 3,
				rotation: 0,
				params: { resistance: 20 }
			},
			{
				id: 'l1',
				kind: 'inductor',
				label: 'L1',
				x: 12,
				y: 3,
				rotation: 0,
				params: { inductance: 0.1, initialCurrent: 0 }
			},
			{
				id: 'c1',
				kind: 'capacitor',
				label: 'C1',
				x: 16,
				y: 6,
				rotation: 90,
				params: { capacitance: 10e-6, initialVoltage: 0 }
			},
			{
				id: 'gnd1',
				kind: 'ground',
				label: 'GND1',
				x: 9,
				y: 10,
				rotation: 0,
				params: {}
			}
		],
		junctions: [{ id: 'j_bot', x: 9, y: 9 }],
		wires: [
			{
				id: 'w_v1_r1',
				from: { type: 'terminal', componentId: 'v1', terminalId: 'pos' },
				to: { type: 'terminal', componentId: 'r1', terminalId: 'A' },
				bend: 'vh'
			},
			{
				id: 'w_r1_l1',
				from: { type: 'terminal', componentId: 'r1', terminalId: 'B' },
				to: { type: 'terminal', componentId: 'l1', terminalId: 'A' },
				bend: 'hv'
			},
			{
				id: 'w_l1_c1',
				from: { type: 'terminal', componentId: 'l1', terminalId: 'B' },
				to: { type: 'terminal', componentId: 'c1', terminalId: 'A' },
				bend: 'hv'
			},
			{
				id: 'w_c1_bot',
				from: { type: 'terminal', componentId: 'c1', terminalId: 'B' },
				to: { type: 'junction', junctionId: 'j_bot' },
				bend: 'vh'
			},
			{
				id: 'w_v1_bot',
				from: { type: 'terminal', componentId: 'v1', terminalId: 'neg' },
				to: { type: 'junction', junctionId: 'j_bot' },
				bend: 'vh'
			},
			{
				id: 'w_bot_gnd',
				from: { type: 'junction', junctionId: 'j_bot' },
				to: { type: 'terminal', componentId: 'gnd1', terminalId: 'A' },
				bend: 'hv'
			}
		],
		scope: {
			channel1: { kind: 'component_voltage', componentId: 'c1', label: 'Capacitor voltage V(C1)' },
			channel2: { kind: 'component_current', componentId: 'l1', label: 'Inductor current I(L1)' },
			timeSpanSec: 0.03,
			verticalScaleMode: 'fixed',
			channel1Range: [0, 9.5],
			channel2Range: [-0.04, 0.06]
		},
		simulation: {
			dtSec: 0.00002,
			sampleIntervalSec: 0.00006,
			playbackSpeed: 0.006
		}
	},
	{
		schemaVersion: 1,
		id: 'blank',
		exampleId: 'blank',
		title: 'Blank circuit workbench',
		question: 'Build your own circuit from scratch',
		instruction:
			'Add a supply and components from the left library, click their terminals to wire a loop to Ground, and press Run.',
		explanation:
			'Every circuit needs a closed path and a Ground (0 V) reference. Add components from the library or return to any prepared example from the toolbar.',
		suggestedChange:
			'Add a DC Supply and a Resistor, connect their terminals in a loop with Ground, and inspect the voltage and current.',
		components: [
			{
				id: 'gnd1',
				kind: 'ground',
				label: 'GND1',
				x: 10,
				y: 10,
				rotation: 0,
				params: {}
			}
		],
		junctions: [],
		wires: [],
		scope: {
			channel1: { kind: 'none' },
			channel2: { kind: 'none' },
			timeSpanSec: 5,
			verticalScaleMode: 'auto',
			channel1Range: [-5, 5],
			channel2Range: [-0.005, 0.005]
		},
		simulation: {
			dtSec: 0.002,
			sampleIntervalSec: 0.01,
			playbackSpeed: 1
		}
	}
];

// Fix up the SPDT switch in `rc-charge-discharge` so `position: 'A'` charges from V1 and `position: 'B'` discharges to Ground!
// Wait: let's check getComponentTerminals for `switch_spdt`:
// At rotation = 0: `common` is at dx=-2, dy=0; `throwA` is at dx=+2, dy=-1; `throwB` is at dx=+2, dy=+1.
// If we place `s1` at (x=8, y=4) with `rotation: 180`:
// `rotateOffset(-2, 0, 180)` -> `common` is at (10, 4) (facing right toward R1!).
// `rotateOffset(2, -1, 180)` -> `throwA` is at (6, 5) (facing left).
// `rotateOffset(2, 1, 180)` -> `throwB` is at (6, 3) (facing left).
// So in `rc-charge-discharge`, let's connect `v1:pos` to `s1:throwA` and `j_gnd` to `s1:throwB` so `position: 'A'` is Charge (5 V) and `position: 'B'` is Discharge (0 V)!
const chargeDischargeDoc = EXAMPLES_DATA.find((e) => e.id === 'rc-charge-discharge');
if (chargeDischargeDoc) {
	chargeDischargeDoc.wires = [
		{
			id: 'w_v1_s1a',
			from: { type: 'terminal', componentId: 'v1', terminalId: 'pos' },
			to: { type: 'terminal', componentId: 's1', terminalId: 'throwA' },
			bend: 'vh'
		},
		{
			id: 'w_s1b_gnd',
			from: { type: 'terminal', componentId: 's1', terminalId: 'throwB' },
			to: { type: 'junction', junctionId: 'j_gnd' },
			bend: 'vh'
		},
		{
			id: 'w_s1com_r1',
			from: { type: 'terminal', componentId: 's1', terminalId: 'common' },
			to: { type: 'terminal', componentId: 'r1', terminalId: 'A' },
			bend: 'hv'
		},
		{
			id: 'w_r1_c1',
			from: { type: 'terminal', componentId: 'r1', terminalId: 'B' },
			to: { type: 'terminal', componentId: 'c1', terminalId: 'A' },
			bend: 'hv'
		},
		{
			id: 'w_c1_gnd',
			from: { type: 'terminal', componentId: 'c1', terminalId: 'B' },
			to: { type: 'junction', junctionId: 'j_gnd' },
			bend: 'vh'
		},
		{
			id: 'w_v1_gnd',
			from: { type: 'terminal', componentId: 'v1', terminalId: 'neg' },
			to: { type: 'junction', junctionId: 'j_gnd' },
			bend: 'vh'
		},
		{
			id: 'w_j_gnd',
			from: { type: 'junction', junctionId: 'j_gnd' },
			to: { type: 'terminal', componentId: 'gnd1', terminalId: 'A' },
			bend: 'hv'
		}
	];
}

export const CIRCUIT_EXAMPLES: ExampleSummary[] = [
	{
		id: 'rc-charging',
		shortTitle: '1. Capacitor charging (Default)',
		title: 'How long does a capacitor take to charge?',
		question: 'How long does a capacitor take to charge?',
		category: 'Transient'
	},
	{
		id: 'ohms-law',
		shortTitle: '2. Ohm’s law',
		title: 'Ohm’s law: What happens to current when resistance doubles?',
		question: 'What happens to current when resistance doubles?',
		category: 'DC Fundamentals'
	},
	{
		id: 'series-parallel',
		shortTitle: '3. Series & parallel resistors',
		title: 'Series and parallel resistors: How does the path change the total current?',
		question: 'How does the path change the total current?',
		category: 'DC Fundamentals'
	},
	{
		id: 'voltage-divider',
		shortTitle: '4. Voltage divider',
		title: 'Voltage divider: How can two resistors produce a smaller voltage?',
		question: 'How can two resistors produce a smaller voltage?',
		category: 'DC Fundamentals'
	},
	{
		id: 'loaded-divider',
		shortTitle: '5. Loaded voltage divider',
		title: 'Loaded voltage divider: Why does the output change when another resistor is connected?',
		question: 'Why does the output change when another resistor is connected?',
		category: 'DC Fundamentals'
	},
	{
		id: 'rc-charge-discharge',
		shortTitle: '6. Capacitor charge & discharge',
		title: 'Capacitor charging and discharging: What determines how quickly the voltage changes?',
		question: 'What determines how quickly the voltage changes?',
		category: 'Transient'
	},
	{
		id: 'rc-low-pass',
		shortTitle: '7. RC low-pass filter',
		title: 'RC low-pass filter: Why does the output shrink as the input frequency rises?',
		question: 'Why does the output shrink as the input frequency rises?',
		category: 'AC & Filters'
	},
	{
		id: 'rlc-response',
		shortTitle: '8. RLC oscillation & damping',
		title:
			'RLC response: How do resistance, inductance, and capacitance affect oscillation and damping?',
		question: 'How do resistance, inductance, and capacitance affect oscillation and damping?',
		category: 'Transient'
	},
	{
		id: 'blank',
		shortTitle: 'Blank circuit',
		title: 'Blank circuit workbench',
		question: 'Build your own circuit from scratch',
		category: 'Scratchpad'
	}
];

export function getExampleCircuit(id = 'rc-charging'): CircuitDocument {
	const found = EXAMPLES_DATA.find((item) => item.id === id) ?? EXAMPLES_DATA[0];
	return cloneCircuitDocument(found);
}
