---
title: "The Neuron Zoo"
description: "Send one stimulus through five neuron models, from McCulloch–Pitts to Hodgkin–Huxley, and see what every simplification preserves or leaves behind."
date: "2026-07-25"
category: "Visualizations"
tags: ["Hodgkin–Huxley","McCulloch–Pitts","FitzHugh–Nagumo","Leaky Integrate-and-Fire","Izhikevich Model","Computational Neuroscience","Neuron Models","Fixed-Step Simulation","Web Worker","Scientific Visualization"]
pinnedTags: ["Hodgkin–Huxley","McCulloch–Pitts","FitzHugh–Nagumo","Leaky Integrate-and-Fire","Izhikevich Model","Computational Neuroscience","Neuron Models","Fixed-Step Simulation","Web Worker","Scientific Visualization"]
published: true
thumbnail: "/images/neuron-zoo-social.jpg"
thumbnailAlt: "Five aligned neuron-model traces progressing from a binary threshold signal to a Hodgkin–Huxley action potential"
color: "#9f4a45"
author: "Suvro Ghosh"
readingTime: "24 min"
inPlainEnglish: "The same normalized current command is sent through five mathematical descriptions of a neuron. Their different answers show exactly what each model keeps, what it replaces with a rule, and what it cannot tell us at all."
keyTerms: ["McCulloch–Pitts neuron", "Leaky integrate-and-fire", "Izhikevich model", "FitzHugh–Nagumo model", "Hodgkin–Huxley model", "Fixed-step integration", "Refractory behaviour", "Ion-current energy estimate"]
faq:
  - question: "Do all five models receive the same current?"
    answer: "They receive the exact same normalized command samples at the same simulation times. Because their native input units differ, the command passes through a fixed, visible gain for each model; those gains are never hidden auto-calibration."
  - question: "Which neuron model is the most realistic?"
    answer: "Hodgkin–Huxley contains the most membrane biophysics in this comparison, but more detail is not automatically better for every question. A reduced model can be more useful when timing, logic, phase geometry, or computational scale is the object of study."
  - question: "Why is biological energy unavailable for four models?"
    answer: "McCulloch–Pitts, LIF, Izhikevich, and FitzHugh–Nagumo do not resolve the ionic currents needed to infer an ion-restoration burden. Their answer is not zero; it is not identifiable from their state equations."
  - question: "Does the Hodgkin–Huxley energy number equal a neuron's total energy use?"
    answer: "No. It is a baseline-corrected ATP-equivalent estimate for restoring inward sodium charge in canonical squid giant-axon membrane. It omits geometry, synapses, calcium, glia, maintenance, transmitter cycling, and most cellular metabolism."
---

<script>
	import NeuronZoo from '$lib/components/visualizations/neuron-zoo/NeuronZoo.svelte';
</script>

<style>
	:global(.article-prose .math-display) {
		max-width: 100%;
		overflow-x: auto;
		overflow-y: hidden;
		padding-block: 0.2rem;
		overscroll-behavior-inline: contain;
	}
</style>

<TTS />

<Pi
	src="/images/neuron-zoo-social.jpg"
	alt="Five aligned neuron-model traces progressing from a binary threshold signal to a Hodgkin–Huxley action potential"
	caption="One command enters five mathematical animals. Their disagreement is the lesson: each model preserves a different part of neuronal behaviour."
/>

A “neuron” can be a yes-or-no gate, a leaking bucket with a bell, a two-variable conjurer, an excursion through a phase plane, or a membrane whose sodium and potassium gates open in time. Those descriptions are not interchangeable. Each is a decision about what one is willing not to know.

The laboratory below turns that decision into a controlled experiment. It constructs one normalized command waveform, samples it on one fixed clock, and gives the identical sample sequence to all five models. Their native input gains remain visible because a unitless logical drive, picoamperes, dimensionless forcing, and current density are not secretly the same physical quantity.

Change a preset, draw a command, shorten the paired-pulse interval, or move the synchronized data cursor. The plots retain their honest native axes: a binary output stays binary, a FitzHugh–Nagumo variable does not acquire fictional millivolts, and a leaky integrate-and-fire event does not grow a decorative action-potential waveform.

<NeuronZoo />

# How to read the experiment

The single source of truth is a deterministic sample array

$$
-1\le s(t)\le 1.
$$

In plain text: the shared command, **s of t**, is bounded between minus one and plus one. Every model reads the same $s_k$ at the same time $t_k$. The default experiment lasts

$$
T=1000\ \text{ms}
$$

and advances with the fixed internal step

$$
\Delta t=0.025\ \text{ms}.
$$

The advanced choices are 0.01, 0.025, 0.05, and 0.1 ms; the last carries an accuracy warning. Changing the time step resets and deterministically recomputes the run. Presentation speed changes how many fixed steps are calculated per second of wall time, never the scientific $\Delta t$.

The command becomes a native drive through these visible defaults:

| Model | Native input | Default mapping |
| --- | --- | --- |
| McCulloch–Pitts | Unitless threshold drive | $u_{MP}=1.0\,s(t)$ |
| Leaky integrate-and-fire | pA | $I_{LIF}=500\,s(t)\ \text{pA}$ |
| Izhikevich | Model input units | $I_{IZH}=15\,s(t)$ |
| FitzHugh–Nagumo | Dimensionless drive | $I_{FHN}=0.8\,s(t)$ |
| Hodgkin–Huxley | $\mu\text{A}/\text{cm}^2$ | $I_{HH}=20\,s(t)\ \mu\text{A}/\text{cm}^2$ |

These gains put one command shape into five useful operating ranges. They are defaults, not universal biological constants, and the laboratory does not tune them behind the scenes to force equal spike counts.

## The deterministic stimulus shelf

Every named preset is generated from duration, time step, parameters, and—where noise is used—a seed:

| Preset | Exact command |
| --- | --- |
| Quiet | $s(t)=0$ |
| Single pulse | 0 before 100 ms, +0.80 from 100 through 110 ms, then 0 |
| Sustained step | 0 before 100 ms, +0.55 from 100 through 700 ms, then 0 |
| Pulse train | +0.75 for 10 ms at 100, 180, 260, 340, 420, and 500 ms |
| Ramp | 0 before 100 ms, linear 0 to +0.90 from 100 to 600 ms, then 0 |
| Paired pulse | Two +0.85 pulses, 8 ms wide; first at 100 ms, second after an adjustable 1–100 ms interval, default 12 ms |
| Hyperpolarize and release | -0.50 from 100 to 300 ms, +0.60 from 300 to 320 ms, then 0 |
| Seeded noisy step | From 100 to 700 ms, base +0.42 plus filtered noise of scale 0.12; default seed 1337 |

For the noisy step, bounded uniform samples $r_k$ pass through a one-pole low-pass filter with a 2 ms time constant:

$$
x_k=\alpha x_{k-1}+(1-\alpha)(2r_k-1),
\qquad
\alpha=e^{-\Delta t/(2\ \text{ms})},
$$

$$
s_k=\operatorname{clip}(0.42+0.12x_k,-1,1).
$$

In plain text: each noise state retains the fraction alpha of its previous value, adds the remaining fraction of a new seeded sample mapped to minus one through plus one, then the final command is clipped to the shared range. The same seed, duration, and time step produce the same waveform and hash.

# Five specimens, five kinds of answer

## McCulloch–Pitts — 1943

**A neuron as logic: add, compare, answer yes or no.**

The scalar comparison used here is a modern single-input form of the McCulloch–Pitts threshold idea:

$$
y_{k+1}=H(g_{MP}s_k+b-\theta),
$$

$$
H(x)=
\begin{cases}
1, & x\ge 0,\\
0, & x<0.
\end{cases}
$$

In plain text: the next output is one when gain times command plus bias reaches the threshold, and zero otherwise. Defaults are $g_{MP}=1.0$, $b=0$, $\theta=0.5$, and $y_0=0$.

This is not a membrane model. It has no voltage, leak, reset voltage, ion gates, physical refractory period, ionic current, or biological-energy quantity. A sustained suprathreshold command therefore holds the output at 1; turning that plateau into a fabricated train of biological spikes would change the model.

**Keeps:** threshold logic and all-or-none output.  
**Throws away:** membrane, time-continuous recovery, channels, and energetics.

## Leaky integrate-and-fire — 1907 lineage

**A charging membrane with a leak, a threshold, and a trapdoor reset.**

The lumped-current equation is

$$
C_m\frac{dV}{dt}=-g_L(V-E_L)+I(t).
$$

Equivalently,

$$
\tau_m\frac{dV}{dt}=-(V-E_L)+R_mI(t),
\qquad
\tau_m=\frac{C_m}{g_L}.
$$

In plain text: capacitance times voltage change equals applied current minus leak current. The defaults are $C_m=200$ pF, $g_L=10$ nS, $E_L=-65$ mV, $V_{th}=-50$ mV, $V_{reset}=-65$ mV, and $t_{ref}=2$ ms. The initial voltage is $E_L$, and $I(t)=500s(t)$ pA. The units remain consistent because $1\ \text{nS}\cdot1\ \text{mV}=1\ \text{pA}$.

Because the input is held constant for one command sample, the implementation can advance the linear subthreshold membrane exactly:

$$
V_{k+1}=E_L+(V_k-E_L)e^{-\Delta t/\tau_m}
+\frac{I_k}{g_L}\left(1-e^{-\Delta t/\tau_m}\right).
$$

At threshold, the model records an event, sets $V$ to $V_{reset}$, and holds it there for the explicit refractory interval. The event is real within this model; a drawn excursion to +30 mV would not be.

**Keeps:** passive membrane, leak, and threshold timing.  
**Throws away:** a generated spike waveform, channels, and physical ion energetics.

## Izhikevich — 2003

**Two variables and a reset reproduce a small zoo of firing patterns.**

The continuous part is

$$
\frac{dv}{dt}=0.04v^2+5v+140-u+I(t),
$$

$$
\frac{du}{dt}=a(bv-u).
$$

When $v\ge 30$ mV, the hybrid event rule is

$$
v\leftarrow c,\qquad u\leftarrow u+d.
$$

In plain text: the fast variable $v$ is driven by a quadratic expression, the slower $u$ follows and opposes it, and reaching the cutoff triggers a reset of both variables. The regular-spiking default is $a=0.02$, $b=0.20$, $c=-65$, $d=8$, initial $v=-65$, initial $u=bv=-13$, and $I(t)=15s(t)$ in model input units.

| Phenotype | $a$ | $b$ | $c$ | $d$ |
| --- | ---: | ---: | ---: | ---: |
| Regular spiking | 0.02 | 0.20 | -65 | 8 |
| Intrinsically bursting | 0.02 | 0.20 | -55 | 4 |
| Chattering | 0.02 | 0.20 | -50 | 2 |
| Fast spiking | 0.10 | 0.20 | -65 | 2 |
| Low-threshold spiking | 0.02 | 0.25 | -65 | 2 |

The 30 mV cutoff belongs to this phenomenological event/reset convention; it is not an ion-channel-resolved summit. The variable $v$ is conventionally interpreted in mV under this parameterization, but the model is not a conductance-based membrane.

**Keeps:** spike timing, adaptation, and a bursting repertoire.  
**Throws away:** explicit ion channels and physical current accounting.

## FitzHugh–Nagumo — 1961–1962

**Excitability becomes a map with a fast road and a slow road.**

The laboratory uses this explicit dimensionless variant in model time $\tau$:

$$
\frac{dv}{d\tau}=v-\frac{v^3}{3}-w+I(t),
$$

$$
\frac{dw}{d\tau}=\epsilon(v+a-bw).
$$

Defaults are $a=0.7$, $b=0.8$, $\epsilon=0.08$, and $I(t)=0.8s(t)$. Model time is tied visibly to the shared millisecond clock:

$$
\tau=\frac{t}{T_{FHN}},
\qquad
T_{FHN}=12.5\ \text{ms}.
$$

The millisecond solver therefore integrates

$$
\frac{dv}{dt}=\frac{1}{T_{FHN}}\left(v-\frac{v^3}{3}-w+I(t)\right),
$$

$$
\frac{dw}{dt}=\frac{\epsilon}{T_{FHN}}(v+a-bw).
$$

In plain text: $v$ responds quickly, $w$ recovers slowly, and the visible 12.5 ms scale converts dimensionless model time to the common clock. At zero input the initial stable equilibrium satisfies

$$
w=\frac{v+a}{b},
\qquad
v-\frac{v^3}{3}-w=0,
$$

giving $v_0\approx-1.199408035244035$ and $w_0\approx-0.624260044055044$ for the defaults.

There is no artificial reset. For event counting only, the laboratory records an upward crossing of $v_{event}=1.0$. That is an analysis convention, not a hard threshold in the equations. Both $v$ and $w$ are dimensionless; neither is literal membrane voltage.

**Keeps:** excitability, recovery, oscillation, and phase geometry.  
**Throws away:** physical channels, conductances, and ion accounting.

## Hodgkin–Huxley — 1952

**A spike assembled from voltage-dependent sodium and potassium conductances.**

This implementation uses the modern absolute-voltage convention, an algebraically shifted form of the canonical squid giant-axon equations. All reversal potentials and rate functions use that convention consistently. With outward-positive ionic current,

$$
C_m\frac{dV}{dt}=I_{ext}-I_{Na}-I_K-I_L,
$$

$$
I_{Na}=\bar g_{Na}m^3h(V-E_{Na}),
\qquad
I_K=\bar g_Kn^4(V-E_K),
\qquad
I_L=g_L(V-E_L).
$$

In plain text: applied current charges the membrane after outward sodium, potassium, and leak currents are subtracted. The defaults are:

| Quantity | Default |
| --- | ---: |
| $C_m$ | $1\ \mu\text{F}/\text{cm}^2$ |
| $\bar g_{Na}$ | $120\ \text{mS}/\text{cm}^2$ |
| $\bar g_K$ | $36\ \text{mS}/\text{cm}^2$ |
| $g_L$ | $0.3\ \text{mS}/\text{cm}^2$ |
| $E_{Na}$ | $50$ mV |
| $E_K$ | $-77$ mV |
| $E_L$ | $-54.387$ mV |
| Initial $V$ | $-65$ mV |
| $I_{ext}(t)$ | $20s(t)\ \mu\text{A}/\text{cm}^2$ |

For each gate $x\in\{m,h,n\}$,

$$
\frac{dx}{dt}=\alpha_x(V)(1-x)-\beta_x(V)x.
$$

The absolute-voltage rate functions are

$$
\alpha_m(V)=\frac{0.1(V+40)}{1-e^{-(V+40)/10}},
\qquad
\beta_m(V)=4e^{-(V+65)/18},
$$

$$
\alpha_h(V)=0.07e^{-(V+65)/20},
\qquad
\beta_h(V)=\frac{1}{1+e^{-(V+35)/10}},
$$

$$
\alpha_n(V)=\frac{0.01(V+55)}{1-e^{-(V+55)/10}},
\qquad
\beta_n(V)=0.125e^{-(V+65)/80}.
$$

In plain text: every gate opens at rate alpha times its unavailable fraction and closes at rate beta times its current fraction. At $V=-65$ mV, each starts at

$$
x_\infty(V)=\frac{\alpha_x(V)}{\alpha_x(V)+\beta_x(V)},
$$

with $m_0\approx0.0529324852572496$, $h_0\approx0.596120753508460$, and $n_0\approx0.317676914060697$. The apparent zero-over-zero points in $\alpha_m$ near -40 mV and $\alpha_n$ near -55 mV are removable singularities; the numerical implementation uses their analytic limits rather than raw division.

The model generates its own voltage waveform. A spike event is recorded when $V$ crosses 0 mV upward, but voltage is never reset. Recovery emerges from sodium inactivation and potassium activation.

**Keeps:** voltage-dependent channels, a generated spike waveform, and ion-current bookkeeping.  
**Throws away:** morphology, spatial propagation, channel noise, synapses, and most cellular metabolism.

# Refractory is not one universal stopwatch

The paired-pulse experiment reveals five different meanings hiding behind one familiar word:

| Model | What recovery means here |
| --- | --- |
| McCulloch–Pitts | No internal refractory state; both suprathreshold pulses are represented |
| LIF | An explicit fixed timer; a pulse inside the 2 ms interval cannot trigger an event |
| Izhikevich | Reset plus the evolving recovery variable $u$, with no default fixed timer |
| FitzHugh–Nagumo | Emergent return through $(v,w)$ phase space, with no hard reset |
| Hodgkin–Huxley | Emergent sodium availability $h$ and potassium activation $n$, with no hard reset |

The laboratory does not compress those mechanisms into one bogus “refractory milliseconds” ranking. The honest comparison is whether—and how—the second pulse changes the trajectory.

# Biological energy is not computer cost

Only Hodgkin–Huxley resolves an ionic current from which this laboratory can estimate a sodium-restoration burden. Under the outward-positive convention, inward sodium is the negative part of $I_{Na}$:

$$
Q_{Na,in}=\int \max(-I_{Na}(t),0)\,dt.
$$

With current density in $\mu\text{A}/\text{cm}^2$ and time in ms, $1\ \mu\text{A}\cdot\text{ms}=1\ \text{nC}$, so the integral yields nC/cm². A shadow Hodgkin–Huxley run starts from the identical initial state, lasts the identical time, and receives zero command. The headline value is

$$
Q_{excess}=\max(Q_{stimulus}-Q_{baseline},0).
$$

Converting charge $Q_C$ in coulombs per cm² to an ATP-equivalent burden uses three sodium ions transported per ATP hydrolysed by the sodium–potassium pump:

$$
n_{ATP}=\frac{Q_C}{3F},
\qquad
N_{ATP}=n_{ATP}N_A,
$$

where $F=96485.33212$ C/mol and $N_A=6.02214076\times10^{23}$ mol⁻¹. The optional secondary chemical-work estimate is

$$
E=n_{ATP}\Delta G_{ATP},
$$

with an explicitly assumed default $\Delta G_{ATP}=50$ kJ/mol and an advanced range of 45–60 kJ/mol.

This is an **ATP-equivalent sodium-restoration estimate**, not total neuronal metabolism. It assumes inward sodium must ultimately be pumped out. It omits cell area and geometry, synapses, calcium, transmitter cycling, resting maintenance beyond the selected baseline, glial work, protein turnover, and many other processes. The canonical membrane is squid giant axon, not a complete human neuron.

For McCulloch–Pitts, LIF, Izhikevich, and FitzHugh–Nagumo the correct display is: **Biological energy: not identifiable from this model’s state equations.** Zero would be a made-up result.

Worker execution time is reported separately, after warm-up and repeated median measurements, as **computer cost**. A cheap equation is not a metabolically efficient cell, and a biologically detailed equation does not burn ATP inside the browser.

# Numerical methods and reproducibility

All continuous models advance on the same fixed time grid using Float64 arithmetic in a framework-independent numerical core. FitzHugh–Nagumo and Hodgkin–Huxley use fixed-step fourth-order Runge–Kutta. Izhikevich uses a stable fixed-step continuous update followed by its explicit event/reset rule. LIF uses the stable exact scalar update above. McCulloch–Pitts evaluates deterministically on the shared grid.

The default display interval is 0.1 ms—every fourth internal step—while spike crossings, extrema, gate bounds, ionic charge, and validation metrics are calculated from the full 0.025 ms stream. When a trace contains more samples than horizontal pixels, deterministic min/max envelopes preserve narrow peaks instead of blindly dropping every nth value.

The five models run in one versioned module Web Worker. `requestAnimationFrame` paints results but never defines simulation time. Run identifiers prevent a late frame from an earlier reset replacing the current experiment; substantial typed-array payloads are transferred rather than copied. Pausing an offscreen or hidden page pauses presentation and does not create a wall-clock catch-up burst.

A replay is therefore a numerical claim: the same preset or recorded waveform, seed, duration, time step, phenotype, gains, and parameters must reproduce the same command hash, event times within stated tolerances, and trace hashes. If a parameter choice becomes unstable, the instrument pauses, preserves the last valid result, explains the problem, and offers the exact defaults. It does not massage a NaN into a pretty line.

# What was thrown overboard?

| Model | Primary output | Reset and recovery | Physical ion accounting |
| --- | --- | --- | --- |
| McCulloch–Pitts | Binary, unitless state | Not represented in this single logical unit | Not identifiable |
| LIF | Subthreshold voltage in mV plus event ticks | Explicit reset and refractory timer | Not identifiable |
| Izhikevich | Phenomenological $v$ plus recovery $u$ | Hybrid reset; recovery through $u$ | Not identifiable |
| FitzHugh–Nagumo | Dimensionless fast $v$ and slow $w$ | Emergent phase-plane recovery | Not identifiable |
| Hodgkin–Huxley | Physical membrane voltage in mV | Emergent through $m$, $h$, and $n$; no reset | Explicit membrane current densities; partial sodium-restoration estimate |

There is no winner hiding in the final column. McCulloch–Pitts is useful when logic is the question. LIF is useful when event timing and large networks matter. Izhikevich buys a broad firing repertoire with two variables. FitzHugh–Nagumo makes excitability and recovery geometrically legible. Hodgkin–Huxley pays more computation for conductances, gates, currents, and a generated spike.

# Assumptions, accessibility, and limits

This is an educational **single-compartment** comparison. It omits dendrites, axonal propagation, synaptic networks, spatial cable effects, stochastic channel noise, changing ion concentrations, detailed pumps, morphology, and the metabolic life surrounding the membrane. The five models do not describe the same biological object at the same level.

The synchronized plots use separately labelled native axes; no essential distinction depends on colour. The data cursor works by keyboard as well as pointer, and the Data view exposes current time, command, native inputs, states, events, extrema, and paired-pulse response in a textual table. Important changes are announced sparingly. Reduced-motion mode begins paused, and the equations and prose remain useful without animation.

Long equations may scroll within their own panels on small screens. Each equation is paired with a plain-language or plain-text statement of its variables and units. The plotted sample count is not an accessible summary; the current values and scientifically relevant metrics are.

# Primary papers and historical source

- Warren S. McCulloch and Walter Pitts, [“A Logical Calculus of the Ideas Immanent in Nervous Activity”](https://doi.org/10.1007/BF02478259), *The Bulletin of Mathematical Biophysics* 5 (1943), 115–133.
- Louis Lapicque, [“Quantitative Investigations of Electrical Nerve Excitation Treated as Polarization”](https://doi.org/10.1007/s00422-007-0189-6), 1907 paper in English translation; historical context in Nicolas Brunel and Mark C. W. van Rossum, [“Lapicque’s 1907 Paper: From Frogs to Integrate-and-Fire”](https://doi.org/10.1007/s00422-007-0190-0), *Biological Cybernetics* 97 (2007), 337–339.
- Alan L. Hodgkin and Andrew F. Huxley, [“A Quantitative Description of Membrane Current and Its Application to Conduction and Excitation in Nerve”](https://doi.org/10.1113/jphysiol.1952.sp004764), *The Journal of Physiology* 117 (1952), 500–544.
- Richard FitzHugh, [“Impulses and Physiological States in Theoretical Models of Nerve Membrane”](https://doi.org/10.1016/S0006-3495(61)86902-6), *Biophysical Journal* 1 (1961), 445–466.
- Jinichi Nagumo, Suguru Arimoto, and Shuji Yoshizawa, [“An Active Pulse Transmission Line Simulating Nerve Axon”](https://doi.org/10.1109/JRPROC.1962.288235), *Proceedings of the IRE* 50 (1962), 2061–2070.
- Eugene M. Izhikevich, [“Simple Model of Spiking Neurons”](https://doi.org/10.1109/TNN.2003.820440), *IEEE Transactions on Neural Networks* 14 (2003), 1569–1572.

The equations above state the exact variants implemented here. Historical papers often use different notation or voltage origins; especially for Hodgkin–Huxley, mixing the original resting-relative convention with modern absolute voltages would produce a different and incorrect model.
