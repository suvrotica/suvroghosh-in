# Circuit Bench — Numerical Model & Verification Notes

## Overview

**Circuit Bench** (`/blog/visualizations/circuit-bench`) is an interactive browser-based electronic circuit simulator built for the Viz / Apps collection. It combines a schematic editor, a deterministic **Modified Nodal Analysis (MNA)** solver with second-order implicit **trapezoidal integration**, a contextual component inspector with physical rotary controls, and a two-channel oscilloscope.

## Numerical Formulation

### 1. Net Condensation & Switch Branches

Before matrix assembly, ideal wires (`CircuitWire`) are merged via union–find with explicit junctions and component terminals into electrical nets. Any net containing a `ground` (`GND`) component is assigned reference potential $0\text{ V}$. Closed switch paths (`switch_spst` when `closed !== false`, and `switch_spdt` along the active throw `common–throwA` or `common–throwB`) are stamped as explicit $0\text{ V}$ MNA branch constraints so their branch currents are solved directly; open switch throws carry a $1\text{ G}\Omega$ ($G_{\text{open}} = 10^{-12}\text{ S}$) bleed conductance to prevent singular floating sub-matrices when switches open.

### 2. Modified Nodal Analysis (MNA) Unknowns & Sign Conventions

For a connected circuit with $N$ non-ground nets and $M$ voltage-defined or reactive branches (`dc_voltage`, `sine_voltage`, `square_voltage`, closed switches, `inductor`, `capacitor`), the solver assembles the linear system:

$$
\mathbf{A}\,\mathbf{x} = \mathbf{b}, \qquad \mathbf{x} = \begin{bmatrix} \mathbf{v}_{1..N} \\ \mathbf{i}_{1..M} \end{bmatrix}
$$

where $\mathbf{v}$ contains node voltages relative to ground ($0\text{ V}$) and $\mathbf{i}$ contains MNA branch currents.

- **Reported Current Reference Direction (`ComponentMeasurement.current`)**:
  - Two-terminal passives & SPST switches (`resistor`, `capacitor`, `inductor`, `switch_spst`): conventional current from terminal `A` to terminal `B` (`A → B`).
  - Changeover switches (`switch_spdt`): conventional current from `common` to the active throw (`COM → A` or `COM → B`).
  - Independent voltage sources (`dc_voltage`, `sine_voltage`, `square_voltage`): conventional current delivered out of the positive `pos` (`+`) terminal into the circuit (`− → +` internally through the source, i.e. `-I_mna`).
- **Reported Power Sign Convention (`ComponentMeasurement.power`)**:
  - Passive sign convention across all components ($\sum P = 0\text{ W}$): positive power indicates dissipated power (resistors) or absorbed/stored reactive power ($dE/dt > 0$), while negative power indicates supplied power (sources delivering energy or reactive elements releasing stored energy, $dE/dt < 0$).

### 3. Component Stamps, Initial Conditions & Binary-Exponentiated Sub-Stepping

- **Resistor ($R$)**: Conductance $G = 1/R$ stamped between node `A` and node `B`.
- **Independent Voltage Sources ($V_{\text{DC}}, V_{\text{sine}}, V_{\text{square}}$)**:
  $$
  V_{\text{pos}} - V_{\text{neg}} = V_S(t)
  $$
- **Capacitor ($C$)**:
  - **Initial instant ($t = 0^+$)**: Evaluated directly from its configured initial voltage $V_C(0)$ without solving a steady-state DC operating point first:
    $$
    V_A(0^+) - V_B(0^+) = V_C(0)
    $$
    This yields the exact initial charging current $I_C(0^+)$ (for example, $5\text{ mA}$ in the $5\text{ V}$, $1\text{ k}\Omega$, $1{,}000\text{ }\mu\text{F}$ RC charging circuit) as an explicit MNA branch unknown.
  - **Transient trapezoidal step ($t_n \to t_{n+1} = t_n + \Delta t$)**:
    $$
    V_{A,n+1} - V_{B,n+1} - \frac{\Delta t}{2C}\,I_{C,n+1} = V_{C,n} + \frac{\Delta t}{2C}\,I_{C,n}
    $$
- **Inductor ($L$)**:
  - **Initial instant ($t = 0^+$)**: Enforces the configured initial current $I_L(0)$:
    $$
    I_L(0^+) = I_L(0)
    $$
  - **Transient trapezoidal step ($t_n \to t_{n+1} = t_n + \Delta t$)**:
    $$
    V_{A,n+1} - V_{B,n+1} - \frac{2L}{\Delta t}\,I_{L,n+1} = -\frac{2L}{\Delta t}\,I_{L,n} - V_{L,n}
    $$
- **Binary-Exponentiated Trapezoidal Integration for Stiff & High-Frequency Regimes**:
  - When $\Delta t$ exceeds the circuit's characteristic time scale $\Delta t_{\max}$ (such as $C = 1\text{ pF}$ in the $L = 100\text{ mH}$ RLC oscillator where $f_0 \approx 503.29\text{ kHz}$, or $C = 100\text{ nF}$ in the $1\text{ k}\Omega$ RC circuit), `stepTransientMna` constructs the exact $2K \times 2K$ Trapezoidal state transition operator at fine step $h = \Delta t / 2^p$ ($p \le 24$, up to $16{,}777{,}216$ sub-steps) and advances the reactive state by repeated squaring in $O(p)$ matrix multiplications.

### 4. Wire Segment Current Distribution

To animate conventional current markers along individual wire segments within a multi-segment electrical net, each net solves a local Kirchhoff current conservation system over its wire graph using the net's incident component terminal currents as boundary injections. Zero branch current produces zero marker velocity.

## Analytical Verification Tolerances

Tested in `src/lib/visualizations/circuit-bench/solver.test.ts`:

| Circuit | Analytical Reference | Tested Tolerance |
| :--- | :--- | :--- |
| RC Charging ($5\text{ V}, 1\text{ k}\Omega, 1{,}000\text{ }\mu\text{F}, V_C(0)=0\text{ V}$) | $t=0^+: V_C=0\text{ V}, I=5\text{ mA}$; $t=1\text{ s}: V_C=3.1606\text{ V}, I=1.8394\text{ mA}$; $t=5\text{ s}: V_C=4.9663\text{ V}$ | $< 5\times 10^{-5}\text{ V}$, $< 10^{-6}\text{ A}$ |
| Ohm's Law ($5\text{ V}, 1\text{ k}\Omega \to 2\text{ k}\Omega$) | $I = 5\text{ mA} \to 2.5\text{ mA}$, $P = 25\text{ mW} \to 12.5\text{ mW}$ | $< 10^{-9}\text{ A}$ |
| Series & Parallel Resistors ($5\text{ V}, 1\text{ k}\Omega$ network with switches `S1`, `S2`) | Parallel (`S1` closed, `S2` closed): $10\text{ mA}$; Single (`S1` open, `S2` closed): $5\text{ mA}$; Series (`S1` open, `S2` open): $2.5\text{ mA}$ | $< 10^{-9}\text{ A}$ |
| Unloaded & Loaded Voltage Divider ($5\text{ V}, 1\text{ k}\Omega / 1\text{ k}\Omega$ + $1\text{ k}\Omega$ load) | $V_{\text{unloaded}} = 2.50\text{ V}$ (`S1` open), $V_{\text{loaded}} = \frac{5}{3}\text{ V} \approx 1.67\text{ V}$ (`S1` closed) | $< 10^{-6}\text{ V}$ |
| RC Low-Pass Filter ($1\text{ k}\Omega, 1\text{ }\mu\text{F}, f_c \approx 159.15\text{ Hz}$) | $\|H(f)\| = 1 / \sqrt{1 + (2\pi f RC)^2}$ from $100\text{ Hz}$ and $500\text{ Hz}$ up to $100\text{ kHz}$ | $\ge 40$ steps/cycle, $< 5\times 10^{-3}\text{ V}$ |
| Series RLC Step Response ($V_S=5\text{ V}, R=20\text{ }\Omega, L=100\text{ mH}, C=10\text{ }\mu\text{F}$ & $C=1\text{ pF}$) | At $C=10\text{ }\mu\text{F}$: peak $8.646\text{ V}$ at $3.157\text{ ms}$; at $C=1\text{ pF}$: $3.3908\text{ V}$ at $60\text{ }\mu\text{s}$ and $8.9046\text{ V}$ at $120\text{ }\mu\text{s}$ | $< 10^{-4}\text{ V}$ |

## Resource & Validation Limits

Enforced in `src/lib/visualizations/circuit-bench/types.ts` (`CIRCUIT_LIMITS`) and `validateCircuitDocument`:

- Maximum components per circuit: `64`
- Maximum wires per circuit: `128`
- Maximum explicit junctions: `64`
- Maximum imported JSON / URL payload size: `65,536` bytes
- Maximum solver batch steps: `25,000`
- Worker job timeout: `4,000` ms
