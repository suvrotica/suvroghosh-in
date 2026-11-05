---
title: "Circuit Bench: What Changes When You Change a Component?"
seoTitle: "Circuit Bench — Interactive Electronic Circuit Simulator"
description: "Build small electronic circuits, change component values, run a transient simulation and inspect voltage and current on an oscilloscope."
date: "2026-11-05"
dateModified: "2026-11-05"
category: "Visualizations"
collections:
  - "apps"
thumbnail: "/images/visualizations/circuit-bench/social.png"
thumbnailAlt: "Dark graphite Circuit Bench simulator showing a 5 V RC charging schematic, component inspector with rotary dial, and dual-channel oscilloscope traces."
tags:
  - "Electronics"
  - "Circuit Simulation"
  - "RC Circuits"
  - "Ohm's Law"
  - "Oscilloscope"
  - "Physics"
  - "Electrical Engineering"
  - "Modified Nodal Analysis"
  - "Interactive Tools"
  - "Scientific Computing"
pinnedTags:
  - "Electronics"
  - "Circuit Simulation"
  - "RC Circuits"
  - "Ohm's Law"
  - "Oscilloscope"
  - "Physics"
  - "Electrical Engineering"
  - "Modified Nodal Analysis"
  - "Interactive Tools"
  - "Scientific Computing"
published: true
interactiveFirst: true
immersiveLead: true
color: "#ef762f"
author: "Suvro Ghosh"
readingTime: "6 min"
inPlainEnglish: "Build small circuits in your browser, change a resistor or capacitor value, press Run, and watch voltage and current respond on the schematic and two-channel oscilloscope."
keyTerms:
  - "Time constant (τ = RC): The time for a charging capacitor to cover about 63.2% of the remaining voltage step."
  - "Conventional current: Flow direction from higher potential to lower potential through a passive load."
  - "Node voltage: Electrical potential measured at a schematic node relative to the circuit ground (0 V)."
  - "Differential voltage: Potential difference V(A) − V(B) measured between two explicit probe points."
  - "Modified Nodal Analysis (MNA): Matrix formulation combining Kirchhoff's current law at nodes with branch voltage equations."
  - "Trapezoidal integration: Second-order implicit time-stepping method for capacitors and inductors."
faq:
  - question: "Why does the opening capacitor example start at 0 V instead of 5 V?"
    answer: "Circuit Bench initialises reactive components from their configured initial states rather than solving for the final DC operating point first. Starting with C1 explicitly uncharged at 0 V lets you watch the transient charging curve from the instant the 5 V supply is applied."
  - question: "What happens when I turn the rotary dial while the simulation is running?"
    answer: "Value changes preserve the current stored capacitor voltage and inductor current, mark the parameter change directly on the oscilloscope trace, and continue the transient integration from that state."
  - question: "Do the moving dots on wires show the speed of electrons?"
    answer: "No. Moving markers show conventional current direction and stop when current is zero. Their animation speed is scaled for visual clarity."
  - question: "Why do crossing wires stay unconnected unless I add a junction?"
    answer: "Following standard instrumentation schematics, two wires crossing at right angles do not connect electrically unless an explicit junction dot joins them."
---

<script>
	import CircuitBench from '$lib/components/visualizations/circuit-bench/CircuitBench.svelte';
</script>

<CircuitBench />

<p><small>Published <time datetime="2026-11-05">5 November 2026</time> · Updated <time datetime="2026-11-05">5 November 2026</time></small></p>

<TTS />

## Answer a practical question with a live circuit

An equation tells you that the time constant of a resistor–capacitor circuit is $\tau = RC$. A bench instrument makes that product tangible: you see the initial current surge when the capacitor is empty, watch the current fall as the plates accumulate charge, and see what happens to the slope the moment you double the resistance.

**Circuit Bench** is designed around one question: *what changes in this circuit when I change a component?* It opens paused at $t = 0\text{ s}$ on **How long does a capacitor take to charge?**, with a $5\text{ V}$ DC supply, a $1\text{ k}\Omega$ resistor, a $1{,}000\text{ }\mu\text{F}$ capacitor initialised at $0\text{ V}$, and a ground reference.

At the instant the supply is applied ($t = 0^+$), the uncharged capacitor holds its top terminal at $0\text{ V}$, placing the full $5\text{ V}$ across $R_1$ and drawing an initial charging current of $5\text{ mA}$:

$$
V_C(t) = V_S\left(1 - e^{-t/RC}\right), \qquad I(t) = \frac{V_S}{R}e^{-t/RC}.
$$

After one time constant ($\tau = 1\text{ k}\Omega \times 1{,}000\text{ }\mu\text{F} = 1\text{ s}$), the capacitor reaches approximately $3.16\text{ V}$ while the current falls to $1.84\text{ mA}$. After five seconds ($5\tau$), the capacitor is at $4.97\text{ V}$—effectively charged. Select `R1`, turn the rotary dial or type `2k` to double the resistance, and press **Restart**: the initial current halves to $2.5\text{ mA}$ and the charging time doubles to $\tau = 2\text{ s}$.

## Reading the workspace, inspector, and oscilloscope

Every control on the bench maps directly to a physical quantity or schematic connection:

- **Predictable wiring and junctions**: Click a component in the left library, place it on the snapped grid, and wire terminals either by clicking start and end terminals in sequence or by dragging. Crossing wires remain isolated unless you place an explicit junction.
- **Tactile component editing**: Selecting any component opens the right-hand inspector with its engineering value (`1k`, `4.7k`, `100n`, `10u`), a logarithmic or linear rotary control with keyboard increments, and live readouts for voltage drop, branch current, and dissipated power.
- **Explicit measurement references**: Node voltage is always measured relative to the circuit ground ($0\text{ V}$). Differential voltage probes report $V(A) - V(B)$, and every branch current reports its terminal reference direction (`A → B`).
- **Two-channel oscilloscope**: Below the schematic, two aligned trace lanes plot voltage and current against a shared time axis. Scrub the time cursor to inspect exact tabular values at any sample, switch between automatic and fixed vertical scales, or export the recorded waveform samples to CSV.

When you change a component value during a run, Circuit Bench preserves the capacitor voltages and inductor currents already stored in the circuit and marks the edit on the oscilloscope timeline. **Restart** resets time to $t = 0\text{ s}$ and re-applies your configured initial conditions while keeping your circuit edits; **Restore example** returns the preset to its original schematic and values.

## Eight circuits that answer concrete questions

The **Examples** menu in the top toolbar includes eight prepared circuits and a blank workbench:

1. **How long does a capacitor take to charge?** — $5\text{ V}$, $1\text{ k}\Omega$, and $1{,}000\text{ }\mu\text{F}$ starting uncharged at $0\text{ V}$, demonstrating $\tau = 1\text{ s}$.
2. **Ohm’s law: What happens to current when resistance doubles?** — A $5\text{ V}$ source across a single $1\text{ k}\Omega$ resistor ($5\text{ mA}$), showing inverse proportionality when resistance doubles to $2\text{ k}\Omega$ ($2.5\text{ mA}$).
3. **Series and parallel resistors: How does the path change the total current?** — Comparing two $1\text{ k}\Omega$ branches in parallel across $5\text{ V}$ ($10\text{ mA}$ total) against opening an SPST switch to leave a single branch ($5\text{ mA}$).
4. **Voltage divider: How can two resistors produce a smaller voltage?** — Splitting $5\text{ V}$ across two equal $1\text{ k}\Omega$ resistors to obtain a $2.50\text{ V}$ midpoint.
5. **Loaded voltage divider: Why does the output change when another resistor is connected?** — Connecting a $1\text{ k}\Omega$ load in parallel with the lower $1\text{ k}\Omega$ leg of a $5\text{ V}$ divider pulls the $2.50\text{ V}$ unloaded midpoint down to $1.67\text{ V}$ ($\frac{5}{3}\text{ V}$).
6. **Capacitor charging and discharging: What determines how quickly the voltage changes?** — Using a changeover (SPDT) switch to flip an RC network between a $5\text{ V}$ supply and ground.
7. **RC low-pass filter: Why does the output shrink as the input frequency rises?** — Driving a $1\text{ k}\Omega$ / $1\text{ }\mu\text{F}$ filter ($f_c \approx 159.15\text{ Hz}$) with a $100\text{ Hz}$ sine wave and comparing attenuation when the input rises to $500\text{ Hz}$.
8. **RLC response: How do resistance, inductance, and capacitance affect oscillation and damping?** — Observing underdamped ringing at $R = 20\text{ }\Omega$ versus critical damping at $R = 200\text{ }\Omega$ and overdamped settling at $R = 400\text{ }\Omega$ with $L = 100\text{ mH}$ and $C = 10\text{ }\mu\text{F}$.

## How the numerical solver works

Circuit Bench runs a deterministic **Modified Nodal Analysis (MNA)** engine inside a dedicated Web Worker. Ideal wires and closed switch contacts are merged into electrical nets before assembly, while voltage sources, inductors, and capacitors introduce explicit branch-current unknowns so that $t = 0^+$ currents and reactive continuity are exact. Time integration uses the second-order implicit **trapezoidal rule**, keeping simulation sampling separate from display downsampling so a smooth oscilloscope curve never hides numerical instability.

For related interactive instruments on this site, explore the [Living Systems cellular laboratory](/blog/visualizations/living-systems), [Lens & Mirror Lab](/blog/visualizations/through-a-different-glass), and [Between a Click and a Page](/blog/visualizations/between-a-click-and-a-page).
