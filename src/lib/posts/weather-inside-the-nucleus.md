---
title: "Weather Inside the Nucleus"
seoTitle: "Weather Inside the Nucleus — Interactive Gene-Regulation Model"
description: "Intervene in a synthetic gene-regulation model and compare 48 matched histories to see how signaling and nuclear geometry change transcriptional odds."
date: "2026-08-08"
dateModified: "2026-08-09"
thumbnail: "/images/weather-inside-the-nucleus.png"
thumbnailAlt: "A translucent blue-violet nucleus containing folded chromatin, with a magenta enhancer near an amber promoter while sparse cyan signaling activity and small RNA lights cross the dark scene"
category: "Visualizations"
tags: ["Biology","Gene Regulation","Nuclear Organization","Transcriptional Bursting","Stochastic Processes","Downstream Activity","Molecular Cell","Sox2 Transcription","Receptor Blockade","Contact Propensity"]
pinnedTags: ["Biology", "Gene Regulation", "Nuclear Organization", "Transcriptional Bursting", "Stochastic Processes"]
published: true
interactiveFirst: true
immersiveLead: true
color: "#6FCBFF"
author: "Suvro Ghosh"
readingTime: "26 min"
inPlainEnglish: "Signal duration, factor binding, chromatin contact propensity, and promoter state change the odds of a transcriptional burst—but none guarantees one. This synthetic demonstration lets one modeled cause change at a time, then separates a single possible history from what happens across 48 matched random streams."
keyTerms: ["Synthetic demonstration locus", "Activity proxy", "Occupancy propensity", "Contact propensity", "Enhancer", "Promoter", "Regulatory memory", "Two-state promoter", "Transcriptional burst", "Continuous-time Markov process", "Hazard", "Seeded random stream", "Counterfactual replay", "Censored time-to-first-burst"]
faq:
  - question: "Is this a reconstruction of a real human nucleus or a prediction for a named gene?"
    answer: "No. It is a synthetic, evidence-informed demonstration locus. Its geometry, normalized values, model minutes, and ensemble outputs are illustrative and are not calibrated measurements or biological population predictions."
  - question: "Does EGF enter the nucleus in this model?"
    answer: "No. EGF remains outside the cell and binds a schematic membrane receptor. The inward-moving light is a compressed downstream activity proxy, not an EGF molecule, electricity, or a physical wave."
  - question: "Does moving an enhancer closer switch a gene on?"
    answer: "No. The intervention changes a bounded contact propensity. Near encounters remain stochastic, regulatory memory is incomplete, occupancy can be poor, and a promoter may remain OFF even during favorable conditions."
  - question: "What does Replay this cell preserve?"
    answer: "It preserves the seed, parameters, model version, and random stream labels, reproducing the same numerical trace. Another possible cell changes the seed and samples a different valid history."
  - question: "Why compare 48 possible cells?"
    answer: "A single history can hide a changed probability. Forty-eight matched random streams reveal how an intervention changes burst frequency, mean burst count, and time to first burst while retaining silent runs in the result."
  - question: "Does the intervention prove a biological mechanism?"
    answer: "No. It establishes causality only inside the declared equations. The page does not report a new experiment, validate a living-cell mechanism, or join the cited signaling, chromatin, and transcription studies into one pathway."
  - question: "Are the three-dimensional and two-dimensional views different simulations?"
    answer: "No. Both consume the same typed model result. The renderer cannot create transcription events, and every displayed RNA event corresponds to an event emitted by the scientific kernel."
  - question: "What happens with reduced motion, no WebGL, or no JavaScript?"
    answer: "Reduced motion uses static or gently changing semantic frames; the two-dimensional route retains the complete intervention and results path; and the no-JavaScript article preserves a compact schematic, transcript, equations, limitations, and sources."
---

<script>
	import WeatherInsideNucleus from '$lib/components/visualizations/weather-inside-nucleus/WeatherInsideNucleus.svelte';
</script>

<WeatherInsideNucleus />

<noscript>
	<section aria-labelledby="weather-nucleus-static-heading">
		<h2 id="weather-nucleus-static-heading">Weather Inside the Nucleus — static route</h2>
		<img
			src="/images/weather-inside-the-nucleus.png"
			alt="A schematic nucleus containing a magenta enhancer, an amber promoter, folded chromatin and discrete modeled RNA events"
			width="1200"
			height="630"
			loading="eager"
			decoding="async"
		/>
		<p><strong>A signal arrives. A gene hesitates.</strong></p>
		<p>
			EGF stays outside the cell and binds a membrane receptor. A compressed downstream activity
			proxy reaches a synthetic locus, where factor occupancy, stochastic contact, regulatory memory
			and promoter switching alter the chance of RNA initiation.
		</p>
		<ol>
			<li>A longer signal can sustain downstream activity without guaranteeing a burst.</li>
			<li>Receptor blockade prevents new activation while existing activity decays.</li>
			<li>A weakened binding site lowers occupancy without changing signaling or geometry.</li>
			<li>Higher contact propensity makes near encounters more frequent, never compulsory.</li>
			<li>A favorable close encounter can remain silent: <strong>Closer. Still silent.</strong></li>
			<li>Across 48 matched histories, repetition reveals changed odds rather than obedience.</li>
		</ol>
		<p>
			This is a synthetic demonstration locus in illustrative model time, not a measured nucleus or a
			prediction for a named gene. The complete equations, limitations, transcript and evidence record
			remain available in the article below.
		</p>
	</section>
</noscript>

<TTS />

> **Scientific status:** synthetic demonstration locus · model time · not a measured nucleus

> **Central claim:** Gene expression is conditional, probabilistic, spatial, and time-dependent. Favorable conditions alter the odds of transcription; they do not issue a command.

The model makes one narrow causal statement:

> EGF changes a downstream signaling-activity proxy, while nuclear geometry changes enhancer–promoter contact propensity; together they alter the likelihood and timing of transcriptional bursts.

Signaling and geometry are independent inputs in the default model. There is no default EGF-to-geometry arrow. Any future hypothesis mode that adds one must be off initially and label it **assumed in this model**.

# The event

The opening follows one possible modeled cell. Extracellular EGF docks at a membrane receptor; activity develops on the intracellular side; the view makes semantic cuts from cell to nucleus to locus; and a seeded promoter trace produces discrete RNA initiation events.

The three-second presentation compresses a longer interval of model time. Its markers say `cell → nucleus → locus` and `not to scale`: this is not a literal continuous zoom, and the apparent travel time is not a biological timescale.

Pause, skip and replay controls are visible from the beginning. In reduced motion, the same account becomes three still or gently crossfaded frames: ligand and receptor, downstream activity, then locus and transcription result.

# Not a switch

Watch one possible cell to the end and the page says: **This happened once. It was not guaranteed.** A model-time ribbon shows downstream activity, the promoter’s OFF/ON state, and each initiation event without pretending that one trace is an average.

Replay this cell preserves the seed and reconstructs the same trace. Another possible cell changes only the seed. Identical parameters can then produce a different history, because variation is an output of the model rather than graphical noise.

The distinction is the point. One realization answers “what happened in this modeled history?” An ensemble answers “how did the distribution of histories move?” Neither answer is a measurement of a biological population.

# A signal does not enter the nucleus

EGF remains extracellular. It binds a schematic membrane receptor; full modeled blockade prevents new receptor activation but does not erase activity already present. Existing receptor activity decays according to its own rate.

The inward-moving cyan light is compressed downstream activity. It is not an EGF molecule, an electrical discharge, a fluid front, or a physical wave. Two low-pass stages stand in for delays between receptor activity and a nuclear transcription-factor/coactivator activity proxy.

Albeck, Mills and Brugge studied the information carried by ERK activity dynamics in a specific signaling context. That work anchors the importance of signal timing here; it does **not** establish an EGF-driven enhancer–promoter geometry change at this synthetic locus ([Molecular Cell, 2013](https://doi.org/10.1016/j.molcel.2012.11.002)).

# The nucleus is spatial, but closeness is not command

Chromosome territories and chromatin motion in the scene are coarse explanatory geometry. The display does not reconstruct a measured nucleus, and decorative Three.js coordinates never become scientific contact values.

The intervention changes a normalized geometry bias. That bias changes the stationary propensity of a stochastic near/far state; it does not drag two measured genomic sites through nanometres of calibrated space.

Contact propensity is not instantaneous physical distance. A near state can be brief, a far state can retain transient regulatory memory, and neither state determines promoter activity by itself.

Bartman and colleagues used forced chromatin looping to examine enhancer control of transcriptional bursting in a particular experimental system. It anchors the possibility that altered looping can change bursting parameters, not an EGF pathway or a universal rule ([Molecular Cell, 2016](https://doi.org/10.1016/j.molcel.2016.03.007)).

Zuin and colleagues investigated nonlinear control through enhancer–promoter interactions. It anchors the model’s refusal to turn proximity into a linear command, while remaining specific to the study’s loci, assays and contexts ([Nature, 2022](https://doi.org/10.1038/s41586-022-04570-y)).

Alexander and colleagues observed enhancer-dependent Sox2 transcription without enhancer proximity in their live-cell system. It anchors an essential caution: proximity is neither universally necessary nor universally sufficient, and its meaning is locus- and context-dependent ([eLife, 2019](https://doi.org/10.7554/eLife.41769)).

# The promoter’s loaded coin

The guided model gives the promoter two phenomenological states, OFF and ON. Calling the switch a “loaded coin” is a teaching analogy for a stochastic hazard; there is no literal coin mechanism inside a cell.

The ON hazard combines basal activity, occupancy and contact-dependent regulatory memory:

$$
k_{\mathrm{on}}(t)
=k_{\mathrm{basal}}
+\Delta k_T O(t)
+\Delta k_{TC}O(t)H(L(t)).
$$

The product $O\,H(L)$ matters. A near encounter is insufficient when occupancy is poor, and high occupancy does not force the stochastic promoter to turn ON. In the guided experience, geometry mainly changes burst frequency or active fraction; $k_{\mathrm{off}}$ and the within-burst initiation rate stay fixed.

Suter and colleagues measured widely different bursting kinetics among mammalian genes. That work anchors heterogeneity in bursting behavior, not the particular rates or synthetic locus shown here ([Science, 2011](https://doi.org/10.1126/science.1198817)).

Peccoud and Ycart provide the separate mathematical anchor for Markovian gene-product synthesis. Their framework motivates a tractable stochastic switch; it does not imply that real promoters possess only two biochemical states ([Theoretical Population Biology, 1995](https://doi.org/10.1006/tpbi.1995.1027)).

# Intervene at one link

The experience reveals one intervention at a time. It changes a declared model parameter, runs a counterfactual and explains the nearest causal consequence before exposing another choice.

| Scene target | Guided intervention | What changes | What does not change directly |
| --- | --- | --- | --- |
| Signal | **Lengthen the signal** | Pulse duration and integrated downstream activity | Geometry and promoter state |
| Receptor | **Block the receptor** · modeled EGFR inhibition | New receptor activation | Existing activity is not instantly erased |
| Binding site | **Weaken the foothold** · binding-site affinity | Relative affinity and occupancy propensity | Receptor, downstream activity, geometry and promoter state |
| Chromatin neighborhood | **Change how often they meet** · contact propensity | Geometry bias and near-state propensity | Contact, distance and transcription are not commanded |

The contextual reading is deliberately short: **The downstream activity lasts longer.** **The signal stops at the membrane in this model.** **The factor can arrive, but occupancy becomes less likely.** **The enhancer and promoter meet more often—not always.**

After committing one intervention, Run this cell compares baseline and intervention with a matched seed: **Same random starting stream; one modeled cause changed.** This is a teaching counterfactual, not a claim that two biological cells share paired randomness.

# Repeat the cell

The defining single history raises contact propensity and still produces no burst. The page reports **Closer. Still silent.** and then adds: **Favorable conditions can still produce silence.**

Next, 48 matched baseline/intervention seed streams become an ensemble field. Repetition may reveal a higher burst frequency and mean burst count under the intervention even though some intervention histories, including the focal one, remain silent.

The page then states the conclusion without euphemism:

> **The odds moved. The outcome did not obey.**

The ensemble reports only three quantities: the fraction of runs with at least one burst, mean burst count, and the distribution of time to first burst. Silent runs remain in the denominator and appear as censored at the observation horizon; they are never discarded to make response times look faster.

These are distributions generated by model v1.0.0. They are not estimates of a tissue, cell line, patient population or named locus unless a later version is calibrated to a declared dataset.

# How the reduced model works

All values are normalized unless a unit is stated. Model minutes are illustrative integration coordinates. The model invents no nanometres, molecule counts, concentrations or biological timescales.

## Exposure and receptor activity

The extracellular input is a rectangular pulse:

$$
u(t)=a_{\mathrm{EGF}}\,\mathbf{1}_{t_0\le t<t_0+d},
\qquad 0\le a_{\mathrm{EGF}}\le1.
$$

$a_{\mathrm{EGF}}$ is normalized stimulus strength and $d$ is duration in model minutes. The quantity is exposure, not a ligand count.

The normalized active-receptor proxy follows

$$
\frac{dR}{dt}=k_R^+(1-b)u(t)(1-R)-k_R^-R,
\qquad 0\le R,b\le1.
$$

$b$ is receptor blockade. Setting $b=1$ prevents new activation; the loss term still lets existing $R$ decay.

## Downstream and nuclear activity

Two low-pass stages expose delay and duration without claiming to reproduce the RAS–RAF–MEK–ERK network:

$$
\frac{dS}{dt}=k_S^+R(1-S)-k_S^-S,
$$

$$
\frac{dT}{dt}=k_T^+S(1-T)-k_T^-T.
$$

$S$ is a lumped intracellular signaling-activity proxy and $T$ is a lumped nuclear transcription-factor/coactivator activity proxy. Neither is a concentration.

## Binding-site occupancy propensity

For one modeled enhancer motif,

$$
O_\infty(T,a)=\frac{(aT)^h}{K_O^h+(aT)^h},
$$

$$
\frac{dO}{dt}=\frac{O_\infty-O}{\tau_O}.
$$

$O$ is occupancy propensity in $[0,1]$ and $a\in(0,1]$ is relative affinity. Weaken the foothold lowers $a$ only; it does not secretly alter receptor activity, downstream activity, geometry or promoter state.

## Geometry and stochastic contact

The geometry bias $g$ changes a bounded stationary near-state propensity:

$$
\pi_C=\sigma(\alpha_0+\alpha_g g),
\qquad
\sigma(x)=\frac{1}{1+e^{-x}}.
$$

The implementation caps the available range below $1$, even under the high-contact intervention. Near and far states form a continuous-time Markov process:

$$
Q_{\mathrm{far}}
\xrightarrow{\kappa\pi_C}
Q_{\mathrm{near}},
\qquad
Q_{\mathrm{near}}
\xrightarrow{\kappa(1-\pi_C)}
Q_{\mathrm{far}}.
$$

Dragging changes $g$ and therefore propensity. It never commands contact, distance or transcription.

## Regulatory memory

Contact effects rise and fade through an abstract licensing or regulatory-memory state:

$$
\frac{dL}{dt}=k_L^+Q(1-L)-k_L^-(1-Q)L,
$$

$$
H(L)=\frac{L^n}{K_L^n+L^n}.
$$

$L\in[0,1]$ is not a named molecule. It allows a close encounter to remain silent and a later far interval to remain temporarily permissive.

## Promoter switching and RNA production

The phenomenological promoter switches according to

$$
P_{\mathrm{OFF}}
\xrightarrow{k_{\mathrm{on}}(t)}
P_{\mathrm{ON}},
\qquad
P_{\mathrm{ON}}
\xrightarrow{k_{\mathrm{off}}}
P_{\mathrm{OFF}}.
$$

While ON, the model produces and removes transcripts through

$$
M\xrightarrow{r_{\mathrm{tx}}}M+1,
\qquad
M\xrightarrow{\gamma M}M-1.
$$

Every nascent initiation light corresponds to a model event and stays briefly at the locus. The renderer cannot invent extra particles to improve the composition.

# Parameter contract

One typed parameter definition is the canonical source for defaults, ranges, units, descriptions and model version. The live Methods view reads that definition directly; this table records its scientific contract without creating a second set of rate defaults.

| Quantity | Range or state | Interpretation |
| --- | --- | --- |
| $a_{\mathrm{EGF}}$ | $[0,1]$ | Normalized exposure strength, not ligand count |
| $d$ | Non-negative model minutes | Illustrative pulse duration |
| $b$ | $[0,1]$ | Receptor blockade |
| $R,S,T,O,L$ | $[0,1]$ | Normalized activity, occupancy and memory proxies |
| $a$ | $(0,1]$ | Relative affinity of one modeled motif |
| $g$ | Bounded normalized control | Geometry bias, not physical distance |
| $\pi_C$ | Bounded below $1$ | Stationary near-state/contact propensity |
| $Q$ | far or near | Stochastic contact state |
| $P$ | OFF or ON | Phenomenological promoter state |
| $M$ | Non-negative count | Modeled completed transcript count |
| All $k$, $\kappa$, $r_{\mathrm{tx}}$, $\gamma$ | Non-negative per model minute | Illustrative kinetic rates, uncalibrated to a named locus |

The guided route changes one of $d$, $b$, $a$ or $g$. It keeps $k_{\mathrm{off}}$ and $r_{\mathrm{tx}}$ fixed so geometry chiefly affects how often a burst begins, not how long it lasts or how rapidly initiations occur inside it.

# Numerical method and reproducibility

- **Model ID:** `weather-inside-the-nucleus`
- **Reduced-model version:** `1.0.0`
- **Share schema:** `nucleus_v=1`
**Method:** hybrid fixed-time-step stochastic simulation

The pure TypeScript kernel is independent of Svelte, the DOM and Three.js. A module Worker advances it; the two-dimensional and three-dimensional presentations consume the same immutable result for a given version, parameter set and seed.

Continuous proxy variables use a stable fixed-step integration update. A discrete event with hazard $k$ over step $\Delta t$ uses

$$
p(\text{event in }\Delta t)=1-e^{-k\Delta t},
$$

not the loose approximation $k\Delta t$. RNA initiations use a Poisson draw and degradation uses binomial sampling. The method is therefore a **hybrid time-stepped stochastic simulation**, not exact Gillespie simulation.

Randomness comes from a deterministic pseudorandom generator, never `Math.random()` in the scientific kernel. Consumption-independent labelled streams separate contact, promoter, initiation and degradation events so an unrelated renderer choice cannot move the science.

Replay this cell retains the seed and reconstructs the exact trace under the same implementation. Baseline/intervention ensembles use the same 48 seed labels as a fair teaching comparison. Another possible cell selects a new seed.

Tests compare identical-seed traces, different-seed variation, parameter isolation, bounded state, timestep convergence and ensemble direction. The fixed cinematic intro seed was selected because its unmodified model trace contains a short burst; rates are not altered to force the opening.

# What the views and sounds mean

The three-dimensional nucleus is a presentation, not a second model. A two-dimensional cross-section, reduced-motion frames, keyboard controls and the textual results table expose the same state and the same decisive silent high-contact history.

Color never carries meaning alone. Enhancer and promoter use different shapes; occupancy has a labelled glyph; near/far contact uses line style and direct text; OFF/ON uses state words and pattern; RNA initiations appear as counted events.

Sound, when enabled, maps a few events to restrained cues: receptor activation, promoter entry into ON, individual initiation and ensemble transition. It starts muted until requested and has one persistent disable action. No scientific fact requires hearing it.

The live region reports changes without narrating every animation frame. A representative announcement is: **Model minutes 12–18: downstream activity was high; the promoter remained OFF; no transcripts initiated.**

# Accessible transcript and results path

The nonvisual route follows the same causal order as the scene. Every scene target is mirrored by a native control in this reading order: receptor, signal, binding site, chromatin neighborhood.

| Chapter | Textual observation | Result exposed |
| --- | --- | --- |
| Attract | EGF docks outside the membrane; downstream activity begins inside | One possible cell · illustrative model time |
| Observe | Activity rises after a delay; promoter state and initiation events follow model time | Exact focal trace and event list |
| Intervene | One declared parameter changes and the nearest causal consequence is announced | Baseline and counterfactual parameter values |
| Replay | Same seed and random stream labels; one modeled cause changed | Matched trace comparison |
| Repeat | Forty-eight matched histories preserve silent runs | Burst fraction, mean burst count, censored time to first burst |
| Inspect | Scene freezes and each causal node opens one sentence before equations | Parameters, equations, method, provenance and limitations |

For the defining contact intervention, the accessible result reads: higher contact propensity; focal intervention history silent; **Closer. Still silent.** The ensemble then reports the baseline and intervention summaries and concludes: **The odds moved. The outcome did not obey.**

Keyboard users can reach every intervention, run, replay, new-seed, reset, pause, skip and methods action. Normal scrolling remains available; no wheel or focus trap is required to finish the essay.

# What this model can and cannot say

The browser interventions establish causality only inside the equations above. They do not validate a mechanism in living cells, and the model card is a disclosure rather than a certificate of experimental evidence.

- EGF remains outside the cell. The inward light is downstream activity, not an EGF molecule, electricity or a physical wave.
- The cell-to-nucleus-to-locus transition is a semantic scale change, not a continuous physical zoom.
- Chromosome territories and chromatin motion are coarse explanatory geometry, not a measured nuclear reconstruction.
- Contact propensity is not instantaneous physical distance and does not guarantee transcription.
- Enhancer proximity is neither universally necessary nor universally sufficient; its relationship to transcription depends on locus and context.
- A binding-site mutation changes one affinity parameter in this model. Real mutations may alter other binding, chromatin, sequence and regulatory effects.
- The promoter is phenomenological and omits refractory, paused, multi-step, feedback and cofactor states.
- Parallel signaling pathways, receptor trafficking, cell context, chromatin state, loop extrusion, nuclear compartments, cell cycle, allele-specific effects, nuclear mechanics and measurement uncertainty are omitted.
- Signaling and geometry are independent by default. The page does not claim that EGF remodels enhancer–promoter geometry at this generic locus.
- Ensemble outputs are model distributions, not biological population predictions without calibration to named data.
- Normalized values and model minutes are illustrative. The page does not invent nanometres, molecule counts, concentrations or biological timescales.
- A close encounter can remain silent; identical settings can yield different histories; an increased expectation does not command an individual result.

The model also keeps several scientific anchors apart. EGF/ERK dynamics, forced looping, nonlinear enhancer–promoter effects, Sox2 transcription without proximity and generic Markov promoter mathematics do not describe one cell type, one locus or one experimentally established causal pathway.

# Provenance, data and assay boundaries

Version 1 uses synthetic parameters and procedural visuals. It fetches no runtime scientific data, embeds no microscopy image or assay track, and reproduces no third-party figure. No pair of loci is described as validated.

The [4D Nucleome Data Portal getting-started documentation](https://data.4dnucleome.org/help/user-guide/getting-started) is an official anchor for the provenance expected of real nuclear-organization data. It does not supply geometry to this page, and no 4DN accession is bundled. Retrieved 8 August 2026.

The [ENCODE Hi-C standards page](https://www.encodeproject.org/hic/) is a separate official anchor for assay and metadata discipline. Hi-C contact measurements are not interchangeable with instantaneous three-dimensional distance, and no ENCODE contact matrix is used here. Retrieved 8 August 2026.

Because the MVP bundles no external scientific dataset, the organism, cell type, locus, assay, genome assembly, resolution and data-processing fields are **not applicable** rather than silently unknown. If a later version adds data, all of those fields, accession, normalization, retrieval date, license or terms, supported visual, and unsupported inference must accompany it.

The page’s code, prose and deterministic visuals are original project material. The linked papers, portal documentation and their publication rights remain with their respective authors, publishers and institutions; bibliographic links do not grant redistribution rights. No long source passage or source figure is reproduced.

# Eight separate scientific anchors

These references constrain different parts of the demonstration. They are deliberately not presented as a unified EGF-to-chromatin-to-transcription mechanism.

1. **Signaling dynamics only.** Albeck, Mills and Brugge, “Frequency-Modulated Pulses of ERK Activity Transmit Quantitative Proliferation Signals,” _Molecular Cell_ (2013). This supports attention to signal dynamics in its studied context, not generic nuclear geometry. [DOI 10.1016/j.molcel.2012.11.002](https://doi.org/10.1016/j.molcel.2012.11.002).
2. **Bursting diversity only.** Suter et al., “Mammalian Genes Are Transcribed with Widely Different Bursting Kinetics,” _Science_ (2011). This supports stochastic bursting as a useful lens, not the rates of this synthetic locus. [DOI 10.1126/science.1198817](https://doi.org/10.1126/science.1198817).
3. **Forced looping in a particular system only.** Bartman et al., “Enhancer Regulation of Transcriptional Bursting Parameters Revealed by Forced Chromatin Looping,” _Molecular Cell_ (2016). This does not establish an EGF link or a universal geometry rule. [DOI 10.1016/j.molcel.2016.03.007](https://doi.org/10.1016/j.molcel.2016.03.007).
4. **Nonlinear enhancer–promoter control only.** Zuin et al., “Nonlinear control of transcription through enhancer–promoter interactions,” _Nature_ (2022). This motivates nonlinearity and context, not a calibrated parameter for this page. [DOI 10.1038/s41586-022-04570-y](https://doi.org/10.1038/s41586-022-04570-y).
5. **Sox2 proximity caution only.** Alexander et al., “Live-cell imaging reveals enhancer-dependent Sox2 transcription in the absence of enhancer proximity,” _eLife_ (2019). This prevents proximity from becoming a universal requirement or command. [DOI 10.7554/eLife.41769](https://doi.org/10.7554/eLife.41769).
6. **Mathematical switching only.** Peccoud and Ycart, “Markovian Modeling of Gene-Product Synthesis,” _Theoretical Population Biology_ (1995). This anchors a tractable stochastic model, not a complete promoter mechanism. [DOI 10.1006/tpbi.1995.1027](https://doi.org/10.1006/tpbi.1995.1027).
7. **Data provenance only.** [4D Nucleome Data Portal documentation](https://data.4dnucleome.org/help/user-guide/getting-started). This defines expectations for documented nuclear-organization data; no portal dataset is used. Retrieved 8 August 2026.
8. **Hi-C assay documentation only.** [ENCODE Hi-C standards](https://www.encodeproject.org/hic/). This informs assay caution; it does not turn a contact matrix into instantaneous distance or supply this model’s geometry. Retrieved 8 August 2026.

# The useful result

A longer signal changes activity over time. Receptor blockade lowers new activation. A weaker site lowers occupancy without changing the signal. Higher contact propensity does not force contact, and contact does not force transcription.

The same declared conditions can yield different histories. Repetition exposes the distribution that one history cannot. That is the weather inside this synthetic nucleus: not lawlessness, and not command, but changing conditional odds through time.

<style>
	:global(.article-prose .katex-display) {
		width: 100%;
		max-width: 100%;
		overflow-x: auto;
		overflow-y: hidden;
		padding-block: 0.25rem;
		overscroll-behavior-inline: contain;
	}

	:global(.article-prose .katex-display > .katex) {
		display: inline-block;
		min-width: max-content;
	}
</style>
