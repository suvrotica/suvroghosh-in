---
title: "The Static-Equilibrium Illusion: Life Refuses to Hold Still"
seoTitle: "The Static-Equilibrium Illusion: Why Life Won't Hold Still"
description: "Explore human rhythms, delayed feedback, predator–prey dynamics, and field evidence to see why living stability is a process rather than a frozen number."
date: "2026-08-16"
dateModified: "2026-08-16"
thumbnail: "/images/visualizations/static-equilibrium-illusion/static-equilibrium-illusion.svg"
thumbnailAlt: "Editorial diagram in which a perturbed line returns, rings, and opens into a closed orbit beside the title The Static-Equilibrium Illusion"
category: "Visualizations"
tags: ["Homeostasis","Oscillations","Complex Systems","Physiology","Ecology","Per Minute","Limit Cycle","Flat-Line Opening","Fixed Point","Resting Range"]
pinnedTags: ["Homeostasis", "Oscillations", "Complex Systems", "Physiology", "Ecology"]
published: true
color: "#167D80"
author: "Suvro Ghosh"
readingTime: "16 min"
inPlainEnglish: "Healthy organisms do not keep every variable motionless. Heartbeats, breaths, hormones, temperature, and ecological populations change through time. Regulation can return a system toward a point, sustain a rhythm, or produce a surprising delayed response, depending on its feedbacks and context."
keyTerms: ["Homeostasis", "Homeodynamics", "Nonequilibrium steady state", "Allostasis", "Stable fixed point", "Stable limit cycle", "Delayed feedback", "Lotka–Volterra model", "Phase portrait", "Trophic cascade"]
faq:
  - question: "Does homeostasis mean that the body holds one exact set point?"
    answer: "No. Homeostasis describes regulation within viable bounds. A regulated variable may fluctuate, follow a daily rhythm, respond to context, or be governed by several interacting feedback and feedforward processes."
  - question: "Does negative feedback always create oscillations?"
    answer: "No. Instantaneous first-order negative feedback usually returns a disturbed variable monotonically toward a stable fixed point. Oscillation needs phase-producing structure—such as delay, inertia, coupled fast and slow variables, or external forcing—plus sufficient loop sensitivity; nonlinearities often shape or bound self-sustained cycles."
  - question: "Is every biological oscillation a stable limit cycle?"
    answer: "No. A wavy trace may be forced, transient, damped, noisy, or self-sustained. A stable limit cycle is a specific periodic orbit to which nearby trajectories return after perturbation."
  - question: "Does the shark–tuna model describe a real shark and tuna ecosystem?"
    answer: "No. It is a dimensionless two-species teaching model. Real marine food webs include species and size differences, alternative prey, habitat, fishing, migration, seasons, and stochastic events."
  - question: "Are snapshot measurements and clinical reference ranges still useful?"
    answer: "Yes. They are indispensable when collected and interpreted appropriately. The argument is that time, phase, context, and measurement conditions often add information; it is not an instruction to replace every clinical measurement with an oscillator model."
---

<script>
	import HomeodynamicsExplorer from '$lib/components/visualizations/homeodynamics/HomeodynamicsExplorer.svelte';
</script>

_What temperature, hormones, feedback loops, and predator–prey models reveal about dynamic balance_

A bedside monitor draws a line from left to right. We want the trace to be orderly, yet the most reassuring pattern is not flat: it rises, falls and rises again. Life persists by moving—pushing matter and energy through cells, correcting disturbances, anticipating demands and sometimes generating rhythms of its own.

This essay takes its conceptual cue from Alan Garfinkel's [Newton Abraham Lecture](https://youtu.be/XhJkFPHi4ak) and Xiong and Garfinkel's question, [“Are physiological oscillations physiological?”](https://doi.org/10.1113/JP285015). The numerical claims below come from the linked clinical sources, experiments, datasets and reviews; the interactive curves identify when they are measurements, derived conversions or teaching models.

<TTS />

## 1. The flat-line opening

A flat line can mean that electrical activity has ceased. It can also mean a detached lead, a failed sensor, an averaging interval that erased fast variation, or a chart scaled too coarsely to show it. Flatness is therefore neither a general definition of health nor even, by itself, a diagnosis. It is an observation whose meaning depends on what was measured and how.

The same problem appears in less dramatic forms. A heart that never changes its interval is not the ordinary ideal. Breathing accelerates during exertion. Blood pressure responds to posture and sleep. Hormone secretion arrives in pulses. Core temperature tends to descend and rise across the day. The living question is not, “Did the number move?” but “Did it move in a viable way, at the right time, and recover or adapt when conditions changed?”

Biological stability is usually an activity, not a stillness.

## 2. One number lies by omission

“37°C” is useful shorthand, but it leaves out measurement site, time of day, age, recent activity and the person's own pattern. In a study of young men of differing chronotype, the daily core-temperature excursion was approximately 1.1–1.3°C, with the minimum near 05:00 ([Baehr and colleagues](https://doi.org/10.1046/j.1365-2869.2000.00196.x)). That is a **peak-to-trough excursion**. Some disciplines call half that range an amplitude, so an unqualified “one-degree amplitude” is needlessly ambiguous. Nor is this study a universal constant for every body.

A blood-pressure reading is similarly conditional on cuff, posture, rest, medication and circadian phase. The common nocturnal “dip” is usually discussed as a percentage of daytime pressure, not as one invented number of millimetres of mercury; not everyone exhibits the typical pattern. Glucose means something different before a meal, after one and during illness. A single cortisol sample cannot reveal the faster pulses riding on its daily trend.

The four salivary cortisol values in the explorer—13.4 at waking, 20.4 thirty minutes later, 6.0 before lunch and 1.5 nmol/L at bedtime—need an especially careful label. They are model-estimated points for the “Normative” latent profile reported by **Dmitrieva and colleagues**, using 1,101 adults and 2,894 valid sampling days ([study DOI](https://doi.org/10.1016/j.psyneuen.2013.05.003)). They are not raw sample means, serum reference values or a universal healthy curve, and four daily points cannot resolve ultradian secretion. Their horizontal positions are illustrative: the study's collection moments were tied to waking, pre-lunch and bedtime, not fixed universal clock times.

One number is not false. It lies by omission when we forget its clock, context and method.

## 3. Homeostasis was never frozen matter

It would be historically wrong to blame Walter Cannon for equating physiology with literal thermodynamic equilibrium. His account of homeostasis allowed regulated variation. As [Billman's historical review](https://doi.org/10.3389/fphys.2020.00200) emphasises, “steady states” in organisms are flexible and bounded, maintained by coordinated responses rather than perfect constancy.

**The mistake is not homeostasis. The mistake is freezing homeostasis into one number.** Several related ideas are easily collapsed into that static caricature:

| Concept | What it means here |
| --- | --- |
| **Thermodynamic equilibrium** | No net macroscopic currents and no energy-driven organisation. A living organism as a whole is not in this condition. |
| **Nonequilibrium steady state** | Summary properties may remain statistically stable while matter and energy continue to flow. Modern [nonequilibrium biological physics](https://doi.org/10.1103/RevModPhys.91.045004) studies how such driven organisation persists. |
| **Homeostasis** | Regulation within viable bounds, potentially using several feedback loops, feedforward control, rhythms and context-dependent targets. |
| **Allostasis** | Predictive or adaptive adjustment—often glossed as “stability through change”. It is useful, but [not a universally accepted replacement](https://doi.org/10.1037/a0035942) for homeostasis. |
| **Stable fixed point** | After a small perturbation, the system returns towards one dynamical state. |
| **Stable limit cycle** | After a small perturbation, the system returns towards a periodic orbit rather than one point. |
| **Oscillation** | The broader appearance of repeated change. It may be forced, transient, damped, noisy or self-sustained; a wavy trace alone does not prove a limit cycle. |

“Homeodynamics” is a helpful emphasis: what remains viable is often maintained through change. It does not abolish homeostasis. It reminds us to ask about trajectories, timescales and mechanisms as well as ranges.

The distinctions also stop one scale from impersonating another. Thermodynamics describes constraints on physical processes; a fixed point or limit cycle describes the geometry of a particular mathematical system; homeostasis and allostasis organise physiological explanations. A body can maintain a nonequilibrium steady state while one subsystem approaches a fixed point and another follows a daily rhythm. “Dynamic” is not an alternative substance from which life is made. It is a demand that we specify what changes, what remains bounded and at which observational scale.

## 4. Open the time microscope

The explorer begins with three windows. At about twenty seconds, a representative 72-beat-per-minute heartbeat, a 15-breath-per-minute respiratory rhythm and a normalised pressure wave near 0.1 Hz occupy different facets because their units are not interchangeable. The heart and breathing rates have separate authoritative resting ranges; neither stylised trace is a diagnostic recording.

The arithmetic is simple but worth exposing. Seventy-two beats per minute converts to one beat every 0.833 seconds; it sits within the adult resting range of 60–100 beats per minute described by the [US National Heart, Lung, and Blood Institute](https://www.nhlbi.nih.gov/health/heart/heart-beats). Fifteen breaths per minute gives a four-second cycle, within the adult resting range of 12–20 reported by [MedlinePlus](https://medlineplus.gov/ency/article/007198.htm). Those derived periods do not turn the illustrations into ECG or airflow data. The slower pressure trace is displayed only as a normalised oscillation near a ten-second period because the magnitude and even the contribution of proposed mechanisms vary ([Julien, 2006](https://doi.org/10.1016/j.cardiores.2005.11.008)).

At two hours, the view shifts to slower coordination. Lang and colleagues sampled ten healthy participants every minute for one to two hours and found regular basal glucose–insulin cycles in five of ten, around a representative 13-minute period, with glucose leading insulin by about two minutes ([1979 experiment](https://doi.org/10.1056/NEJM197911083011903)). The explorer's smooth paired traces are a reconstruction of that summary, not a participant's raw data. A 90-minute cortisol ripple represents a model setting at the upper edge of the 60–90-minute ultradian range described in [Endocrine Reviews](https://doi.org/10.1210/er.2015-1080); it is not a row of measured samples.

Across twenty-four hours, temperature, normalised blood pressure and the sparse cortisol profile expose the cost of sampling without phase. An optional overlay rescales each signal to its own range. It is an “orchestra” of shapes, never a shared physiological y-axis.

<HomeodynamicsExplorer />

The source drawers and exact-value tables matter as much as the motion. Heart pacemaking depends on [coupled membrane-voltage and calcium-clock mechanisms](https://doi.org/10.1098/rstb.2022.0180). Central respiratory pattern generation is [modulated by chemoreflex and other inputs](https://doi.org/10.1152/physiol.00002.2018). Light, sleep, meals and activity can force or entrain other rhythms. Luteinising-hormone pulses, often around every one to two hours in the early follicular phase and roughly every four hours in the luteal phase, are an imperfect surrogate for hypothalamic GnRH; phase, age and sex matter, and ovarian feedback becomes positive near ovulation ([Endotext](https://www.ncbi.nlm.nih.gov/books/NBK279070/)). “Negative feedback did it” is not a universal explanation.

The companion essay [Before You Had a Heartbeat, You Were a Rhythm](/blog/visualizations/fertilization-calcium-clock) follows another temporary biological clock: calcium waves and pulses that activate an egg.

## 5. How a brake becomes a metronome

The feedback lab isolates one mechanism. Its dimensionless equation makes production fall as the delayed state, _x(t − τ)_, rises, while removal increases with the current state, _x(t)_. It is a generic teaching model, not a patient model and not a claim about every physiological oscillator.

With instantaneous first-order negative feedback, a disturbance usually decays monotonically towards a stable fixed point: the brake responds to where the system is now. Introduce lag or inertia and the response may arrive after the variable has crossed its operating state. The correction then overshoots; a later correction overshoots in the other direction. With modest lag, those swings damp away.

Delay alone is not a magic oscillation switch. Sustained oscillation requires enough loop sensitivity together with sufficient phase lag—supplied here by delay; the nonlinearity shapes and bounds the resulting cycle. The lab's “sustained” preset has been numerically checked to remain bounded and to keep cycling after its initial transient; it demonstrates one mathematical regime, not a healthy target. The classic delay analysis of blood-cell regulation by [Mackey and Glass](https://doi.org/10.1126/science.267326) helped make this mechanism biologically legible.

The delay embedding plots `x(t)` against `x(t − τ)`. It is not an ordinary two-variable phase portrait: both axes belong to the same variable at different times. By contrast, the unperturbed operating state is a fixed point. Increasing delay supplies phase lag; steepness changes loop sensitivity. Together they can move the fixed point through a stability threshold even though the feedback sign remains negative.

This is why the controls change one ingredient at a time. A larger perturbation tests the response without, by itself, changing the underlying rule. The Hill coefficient changes how abruptly production falls around its scale value. The delay changes which past state drives production now. “Damped” and “sustained” therefore describe the computed long-run behaviour of a specified parameter set; they are not decorative labels attached to traces that merely look wavy for a few seconds. Pause, scrub and inspect the exact values and the conclusion remains available without motion.

Other oscillators work differently: pacemaker ion channels, fast activation coupled to slow inhibition, interacting cells, molecular clocks, and external forcing by light, meals, activity or seasons. A brake **can** become a metronome. It does not follow that every metronome is a delayed brake.

## 6. From physiology to an ecological toy world

Garfinkel's “Shark Meets Tuna” lesson moves the question from one delayed variable to two coupled populations. Tuna increase sharks through feeding; sharks decrease tuna through predation. In the ideal Lotka–Volterra equations, tuna grow exponentially without sharks, sharks decline exponentially without tuna, and encounters occur in proportion to the product of the two populations. The classroom context is described in [Teaching Dynamics to Biology Undergraduates](https://doi.org/10.1007/s11538-022-00999-4) and the open [Shark Meets Tuna lesson](https://modelinginbiology.github.io/Videos/Models-Change-Example-2-Shark-Meets-Tuna).

Remove ten sharks and the first effect looks obvious: fewer sharks. But more tuna then support shark growth; because the variables move out of phase, the later shark trajectory may rise above the uninterrupted baseline in this particular preset. The explorer forks the calculation at the intervention, preserves the dashed baseline and lets the reader compare both histories. It does not conceal the delayed consequence behind an animation.

The model uses a fourth-order Runge–Kutta integrator, but numerical care does not make its assumptions realistic. It has homogeneous mixing, fixed encounter and conversion rates, no carrying capacity, age structure, space, seasons, alternative prey, fishing or randomness. Its dimensionless preset is not fitted to shark or tuna observations. Adult sharks and tuna are not a canonical measured pair; their real relationships depend on species, sizes, locations and food-web context.

Most importantly, ideal two-species Lotka–Volterra dynamics form a neutrally stable family of closed orbits. Nearby trajectories do not converge on one attracting biological limit cycle. Its phase lag comes from coupled population change, not the explicit delay parameter used in the physiology lab.

For the displayed coefficients, the coexistence point is 15 sharks and about 13.33 tuna in dimensionless units. Starting exactly there would produce a flat mathematical solution; starting elsewhere selects one of the closed orbits. That flat solution is not “healthier” than the orbit, and neither is evidence about an actual fishery. It simply shows that the visual pattern follows from initial conditions as well as equations. The intervention matters because it changes the state mid-course: it places the same equations on a different orbit rather than commanding the system to return to its old calendar of peaks.

## 7. Then confront the toy with field evidence

An elegant model earns attention by clarifying a possibility. Field evidence must then face weather, movement, multiple species and limited replication. The eight-year Kluane experiment in Yukon manipulated winter food and access by mammalian predators while following snowshoe hares through a population cycle ([Krebs and colleagues, 1995](https://doi.org/10.1126/science.269.5227.1112)).

The headline effects were large: predator exclosure roughly doubled hare density on average, food addition produced roughly a threefold effect, and food plus exclosure produced a more-than-additive effect of about elevenfold on average—reaching approximately thirty-sixfold late in the decline. Predator numbers lagged hare abundance by roughly one to two years. Even the combined treatment delayed rather than eliminated the decline. These findings argue against a one-lever story.

The explorer deliberately does **not** draw four invented continuous treatment curves. Its local data table preserves the spring rows of the control-grid composite in the [public Dryad archive](https://datadryad.org/dataset/doi%3A10.5061/dryad.684s1), including 95% confidence limits. That later archive composite uses an Efford maximum-likelihood estimator; it is not an exact reproduction of the grid-level spring estimates made with CAPTURE's jackknife procedure for the 1995 paper's figure. The treatment ratios are shown separately as reported aggregate summaries, not manufactured by multiplying the control series.

The distinction is not clerical fuss. A smoothed line, an estimator, an experimental treatment and a published verbal summary answer different questions. The dataset provides valuable observations, but not a ready-made four-treatment time series with comparable uncertainty for every point.

Kluane is also not a simple lynx–hare pair. Hares faced a predator guild as well as food limitation. Raptors could enter exclosures; hares could cross their boundaries; the costly exclosure treatments were not fully replicated. Predation, food, movement, weather and other forces remained entangled, and density and survival effects did not necessarily combine in the same way. A higher-dimensional analysis by [Stenseth and colleagues](https://doi.org/10.1073/pnas.94.10.5147) is a reminder that even a famous cycle may require more state variables than its iconic two-species sketch.

## 8. An elegant story is not field proof

The temptation to turn a plausible chain into a settled cascade reappears at sea. [Myers and colleagues](https://doi.org/10.1126/science.1138657) proposed that declines in large coastal sharks released cownose rays from predation, allowing ray predation to help collapse scallop populations. The story has the appealing sequence of a textbook model: sharks down, rays up, scallops down.

[Grubbs and colleagues](https://doi.org/10.1038/srep20970) challenged the temporal correspondence, diet evidence, spatial assumptions and ray-demography argument. Their critique does not prove that sharks never cause trophic cascades. It changes the strength of this particular inference.

> A plausible causal chain—even a beautiful one—is not the same thing as decisive field evidence.

That is why the explorer labels this panel **DISPUTED INFERENCE**, beside but not equivalent to **MODEL** and **MEASURED FIELD DATA**. Mathematical possibility, controlled observation and retrospective causal interpretation are different kinds of knowledge.

## 9. Guardrails

Restoring time to biology does not make every rhythm healthy. Arrhythmias, seizures, tremor and endocrine dysregulation are dynamic too. Some healthy regulation approaches a stable fixed point; some variables cycle; some are episodic or noisy. Regularity can be pathological, and variability can be either adaptive or dangerous depending on mechanism and scale.

Nor should a reader diagnose from these illustrative traces. Human rhythms vary with age, sex, menstrual phase, chronotype, sleep and light exposure, meals, activity and posture, illness, medication, assay method and measurement site. A resting range is not a forecast for exercise; a group summary is not an individual's prescription; a normalised curve is not a concentration.

Snapshot measurements and reference ranges remain clinically indispensable. They make rapid decisions possible, support comparisons and reveal dangerous departures. The purpose here is narrower: add the missing time coordinate, then ask whether phase, history, rate of change or coupling alters the meaning of the snapshot.

Sometimes the next useful measurement is another sample after a defined interval. Sometimes it is a continuous record, a challenge test, a comparison with sleep or meals, or simply a repeat made with the same method. Sometimes timing contributes little and an urgent threshold is exactly what matters. The dynamic view is not a ritual demand for more data; it is a way to choose observations that match the process and the decision.

The same discipline applies to models. A model can reveal counterintuitive consequences without predicting a particular patient or ecosystem. A field result can constrain a model without proving every link in a narrative. Good visualisation keeps those epistemic labels attached.

## 10. Closing

The static-equilibrium illusion survives because a point is easy to print, remember and compare. But an organism is not a printed point. It is an open, driven history of flows and corrections, nested clocks and changing demands. Health is not motion for motion's sake. It is the capacity to keep moving within, and sometimes deliberately shift, the conditions that make continued life possible.

The line matters. So do its scale, phase, provenance, neighbours and destination.

> The body does not defend a number. It defends a viable dance.
