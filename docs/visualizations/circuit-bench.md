# Circuit Bench — Numerical Model & Verification Notes

## Overview

**Circuit Bench** (`/blog/visualizations/circuit-bench`) is an interactive browser-based electronic circuit simulator built for the Viz / Apps collection. It combines a schematic editor, a deterministic **Modified Nodal Analysis (MNA)** solver with second-order implicit **trapezoidal integration**, a contextual component inspector with physical rotary controls, and a two-channel oscilloscope.

## Numerical Formulation

### 1. Net Condensation

Before matrix assembly, ideal wires (`WireSegment`) and closed switch paths (`switch_spst` when `closed = 1`, `switch_spdt` along the selected throw `A–B` or `A–C`) are merged via union–find with explicit junctions and component terminals into electrical nets. Any net containing a `ground` (`GND`) component is assigned reference potential $0\text{ V}$.

### 2. Modified Nodal Analysis (MNA) Unknowns

For a connected circuit with $N$ non-ground nets and $M$ voltage-defined or reactive branches (`dc_source`, `sine_source`, `square_source`, `inductor`, `capacitor`), the solver assembles the linear system:

$$
\mathbf{A}\,\mathbf{x} = \mathbf{b}, \qquad \mathbf{x} = \begin{bmatrix} \mathbf{v}_{1..N} \\ \mathbf{i}_{1..M} \end{bmatrix}
$$

where $\mathbf{v}$ contains node voltages relative to ground and $\mathbf{i}$ contains branch currents oriented from terminal `A` to terminal `B`.

### 3. Component Stamps & Initial Conditions ($t = 0^+$ vs Transient Steps)

- **Resistor ($R$)**: Conductance $G = 1/R$ stamped between node `A` and node `B`.
- **Independent Voltage Sources ($V_{\text{DC}}, V_{\text{sine}}, V_{\text{square}}$)**:
  $$
  V_A - V_B = V_S(t)
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

### 4. Wire Segment Current Distribution

To animate conventional current markers along individual wire segments within a multi-segment electrical net, each net solves a local Kirchhoff current conservation tree over its wire graph using the net's incident component terminal currents as boundary injections. Zero branch current produces zero marker velocity.

## Analytical Verification Tolerances

Tested in `src/lib/visualizations/circuit-bench/solver.test.ts`:

| Circuit                                                                                     | Analytical Reference                                                                                                                 | Tested Tolerance                                           |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- | --------------------------------------------------------------------- | ---------------------------------------- |
| RC Charging ($5\text{ V}, 1\text{ k}\Omega, 1{,}000\text{ }\mu\text{F}, V_C(0)=0\text{ V}$) | $t=0^+: V_C=0\text{ V}, I=5\text{ mA}$; $t=1\text{ s}: V_C=3.1606\text{ V}, I=1.8394\text{ mA}$; $t=5\text{ s}: V_C=4.9663\text{ V}$ | $< 5\times 10^{-3}\text{ V}$, $< 5\times 10^{-5}\text{ A}$ |
| Ohm's Law ($10\text{ V}, 1\text{ k}\Omega \to 2\text{ k}\Omega$)                            | $I = 10\text{ mA} \to 5\text{ mA}$                                                                                                   | $< 10^{-9}\text{ A}$                                       |
| Series & Parallel Resistors ($10\text{ V}, 1\text{ k}\Omega \parallel 1\text{ k}\Omega$)    | $I_{\text{open}} = 10\text{ mA}, I_{\text{closed}} = 20\text{ mA}$                                                                   | $< 10^{-6}\text{ A}$                                       |
| Unloaded & Loaded Voltage Divider ($10\text{ V}, 1\text{ k}\Omega / 1\text{ k}\Omega$)      | $V_{\text{unloaded}} = 5.00\text{ V}, V_{\text{loaded}} = 3.333\text{ V}$                                                            | $< 10^{-3}\text{ V}$                                       |
| RC Low-Pass Filter ($1\text{ k}\Omega, 1\text{ }\mu\text{F}, f_c \approx 159.15\text{ Hz}$) | $                                                                                                                                    | H(f)                                                       | = 1 / \sqrt{1 + (2\pi f RC)^2}$ at $50\text{ Hz}$ and $500\text{ Hz}$ | $< 0.08\text{ V}$ steady-state amplitude |
| Series RLC Step Response ($L=100\text{ mH}, C=10\text{ }\mu\text{F}$)                       | Underdamped overshoot at $R=40\text{ }\Omega$ ($>6.5\text{ V}$); overdamped monotonic rise at $R=400\text{ }\Omega$                  | Verified peak and damping regime                           |

## Resource & Validation Limits

Enforced in `src/lib/visualizations/circuit-bench/types.ts` (`CIRCUIT_LIMITS`) and `validateCircuitDocument`:

- Maximum components per circuit: `64`
- Maximum wires per circuit: `128`
- Maximum explicit junctions: `64`
- Maximum imported JSON / URL payload size: `65,536` bytes
- Maximum solver batch steps: `25,000`
- Worker job timeout: `4,000` ms
