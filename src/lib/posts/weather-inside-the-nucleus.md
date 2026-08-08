---
title: "Weather Inside the Nucleus"
seoTitle: "Weather Inside the Nucleus — Interactive Gene-Regulation Model"
description: "Intervene in a synthetic gene-regulation model and compare 48 matched histories to see how signaling and nuclear geometry change transcriptional odds."
date: "2026-08-08"
dateModified: "2026-08-09"
thumbnail: "/images/weather-inside-the-nucleus.png"
thumbnailAlt: "A dark scientific tableau in which extracellular EGF meets a membrane receptor, local activity regions change in sequence before a separate nuclear response, and a modeled enhancer and promoter sit within folded chromatin"
category: "Visualizations"
tags: ["Biology","Gene Regulation","Nuclear Organization","Transcriptional Bursting","Stochastic Processes","Sox2 Transcription","Downstream Activity","Receptor Blockade","Molecular Cell","Relative Affinity"]
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
    answer: "No. EGF remains outside the cell and binds a schematic membrane receptor. Separate fixed regions change as a compressed downstream activity proxy; no EGF molecule, travelling dot, electricity, or physical wave moves inward."
  - question: "Does moving an enhancer closer switch a gene on?"
    answer: "No. The intervention changes a bounded contact propensity. Near encounters remain stochastic, regulatory memory is incomplete, occupancy can be poor, and a promoter may remain OFF even during favorable conditions."
  - question: "What does Replay this history preserve?"
    answer: "It preserves the seed, parameters, model version, and random-stream labels, reproducing the same numerical trace. Another possible history changes the seed."
  - question: "Why compare 48 possible histories?"
    answer: "A single history can hide a changed probability. Forty-eight matched random streams reveal how an intervention changes burst frequency, mean burst count, and time to first burst while retaining silent histories in the result. They are simulations, not 48 measured cells."
  - question: "Does the intervention prove a biological mechanism?"
    answer: "No. It establishes causality only inside the declared equations. The page does not report a new experiment, validate a living-cell mechanism, or join the cited signaling, chromatin, and transcription studies into one pathway."
  - question: "Are the three-dimensional and exact-event locus views different simulations?"
    answer: "No. Both consume the same immutable typed result. The renderer cannot create transcription events, and every displayed initiation tick corresponds one-for-one to an event emitted by the scientific kernel."
  - question: "What happens with reduced motion, no WebGL, or no JavaScript?"
    answer: "Reduced motion uses eight user-paced still tableaus and never requests WebGL. Portrait, short, Save-Data, failed-WebGL, and no-JavaScript routes use a responsive static scientific poster; the transcript, equations, limitations, and sources remain in the article."
---

<script>
	import WeatherInsideNucleus from '$lib/components/visualizations/weather-inside-nucleus/WeatherInsideNucleus.svelte';
</script>

<WeatherInsideNucleus />

<noscript>
	<section aria-labelledby="weather-nucleus-static-heading">
		<h2 id="weather-nucleus-static-heading">Weather Inside the Nucleus — static route</h2>
		<img
			src="/images/weather-inside-nucleus/portrait/weather-nucleus-540.webp"
			alt="EGF remains outside a membrane receptor; local activity regions change in sequence before a separate nuclear response, an enlarged enhancer–promoter locus and a field of silent and bursting histories"
			width="540"
			height="720"
			loading="eager"
			decoding="async"
		/>
		<p><strong>A signal arrives. A gene hesitates.</strong></p>
		<p>
			EGF stays outside the cell and binds a membrane receptor. Local intracellular activity regions
			change in sequence; a separate nuclear proxy then responds. At a synthetic locus, factor
			occupancy, stochastic contact, regulatory memory and promoter switching alter the chance of
			RNA initiation.
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

# The opening and the film

The cold open lasts exactly three seconds of pause-safe film time and then freezes. It shows only a curved cell boundary, one extracellular EGF ligand, membrane-spanning EGFR and the first local response on the cell-facing side. The nucleus is atmosphere, not yet an explanatory actor. No locus, scale card, promoter, initiation event or ensemble result appears early. This is a schematic prelude, not a numerical seed-0 ligand-count event; the simulation kernel begins later with normalized exposure and activity proxies.

Follow the signal starts a user-paced film of eight stable beats. Previous, Next and Replay preserve the tableau between actions; an optional non-looping autoplay lasts exactly 78 seconds. The film clock controls presentation only. A separate model-time sampler selects immutable values from seed 0 or the paired ensemble, so pausing the film never advances the scientific model behind the viewer’s back.

The fourth beat explicitly says `CELL → NUCLEUS → LOCUS · MODEL VIEW CHANGE · NOT A CONTINUOUS ZOOM`. In reduced motion, all eight beats become manual stills with autoplay disabled and no WebGL request.

# Not a switch

Watch one possible history to the end and the page says: **This happened once. It was not guaranteed.** A model-time ribbon shows downstream activity, the promoter’s OFF/ON state, and each initiation event without pretending that one trace is an average.

Replay this history preserves the seed and reconstructs the same trace. Another possible history changes only the seed. Identical parameters can then produce a different result, because variation is an output of the model rather than graphical noise.

The distinction is the point. One realization answers “what happened in this modeled history?” An ensemble answers “how did the distribution of histories move?” Neither answer is a measurement of a biological population.

# A signal does not enter the nucleus

EGF remains extracellular. It binds a schematic membrane receptor; full modeled blockade prevents new receptor activation but does not erase activity already present. Existing receptor activity decays according to its own rate.

Separate fixed regions of changing light represent compressed intracellular activity. No dot, arrow, ray or continuous luminous front travels toward the nucleus. The regions are not EGF molecules, electrical discharges or fluid waves. Two low-pass stages stand in for delays between receptor activity and a nuclear transcription-factor/coactivator activity proxy.

The receptor drawing is schematic rather than a molecular rendering. The extracellular EGF–EGFR boundary is structurally grounded by Ogiso and colleagues’ human EGF–EGFR extracellular-domain complex, [RCSB PDB 1IVO](https://www.rcsb.org/structure/1IVO), while the page does not reproduce that structure or imply atomistic fidelity ([Cell, 2002](https://doi.org/10.1016/S0092-8674(02)00963-7)).

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

After committing one intervention, Run this history compares baseline and intervention with a matched seed: **Same random starting stream; one modeled cause changed.** This is a teaching counterfactual, not a claim that two biological samples share paired randomness.

# One authentic history, then repetition

The guided film uses the unmodified baseline model with pedagogical seed 0. Its selected silent near interval starts at model time 13.0617 and ends at 19.9230. Seed 0 also contains an earlier near interval, which the film deliberately does not use for this lesson. Throughout the selected interval the promoter remains OFF and there are no initiation events: **Closer. Still silent.**

Later in the same history, the promoter turns ON at 24.8094 and turns OFF at 27.6782, with initiation events at 24.9461, 25.7179 and 26.3428. The realized contact state is far during that burst. The sequence therefore demonstrates memory and stochastic timing; it does not claim that the earlier close encounter directly caused the later burst.

Next, the same 48 fixed seed streams are compared at the usual setting and with increased contact propensity. At least one burst occurs in 26 of 48 baseline histories and 41 of 48 increased-contact histories; seven increased-contact histories remain silent. In the paired comparison, 24 burst in both settings, five stay silent in both, 17 change from baseline-silent to increased-contact burst, and two change in the opposite direction.

The page then states the conclusion without euphemism:

> **The odds moved. The outcome did not obey.**

The ensemble reports the fraction of histories with at least one burst, mean burst count and the distribution of time to first burst. Silent histories remain in the denominator and appear as censored at the observation horizon; they are never discarded to make response times look faster. The 48 rows are model histories, not biological cells or replicates.

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
| $M$ | Non-negative count | Modeled RNA count after initiation events, not a rendered mature molecule |
| All $k$, $\kappa$, $r_{\mathrm{tx}}$, $\gamma$ | Non-negative per model minute | Illustrative kinetic rates, uncalibrated to a named locus |

The guided route changes one of $d$, $b$, $a$ or $g$. It keeps $k_{\mathrm{off}}$ and $r_{\mathrm{tx}}$ fixed so geometry chiefly affects how often a burst begins, not how long it lasts or how rapidly initiations occur inside it.

# Numerical method and reproducibility

- **Model ID:** `weather-inside-nucleus-1.0.0`
- **Reduced-model version:** `1.0.0`
- **Share schema:** `nucleus_v=1`
- **Guided pedagogical seed:** `0`
- **Method:** hybrid fixed-time-step stochastic simulation

The pure TypeScript kernel is independent of Svelte, the DOM and Three.js. A module Worker advances it only after an eligible viewer explicitly enters the interactive film or experiment. The static portrait route constructs no Worker, canvas or WebGL context. Every interactive presentation consumes the same immutable result for a given version, parameter set and seed.

Continuous proxy variables use a stable fixed-step integration update. A discrete event with hazard $k$ over step $\Delta t$ uses

$$
p(\text{event in }\Delta t)=1-e^{-k\Delta t},
$$

not the loose approximation $k\Delta t$. RNA initiations use a Poisson draw and degradation uses binomial sampling. The method is therefore a **hybrid time-stepped stochastic simulation**, not exact Gillespie simulation.

Randomness comes from a deterministic pseudorandom generator, never `Math.random()` in the scientific kernel. Consumption-independent labelled streams separate contact, promoter, initiation and degradation events so an unrelated renderer choice cannot move the science.

Replay this history retains the seed and reconstructs the exact trace under the same implementation. Baseline/intervention ensembles use the same 48 seed labels as a fair teaching comparison. Another possible history selects a new seed.

Tests compare identical-seed traces, different-seed variation, parameter isolation, bounded state, timestep convergence and ensemble direction. Seed 0 is pinned because its unmodified trace contains both a near-but-silent interval and a later short burst; rates and event times are never altered to improve the film.

# What the views and sounds mean

The three-dimensional cell and nucleus are presentations, not a second model. Exact-event SVG locus tableaus, eight reduced-motion stills, keyboard controls and the textual results path expose the same trace. The SVG route uses event times from the kernel rather than inferring scientific state from drawing coordinates.

Color never carries meaning alone. Enhancer and promoter use different shapes; occupancy has a labelled glyph; near/far contact uses line style and direct text; OFF/ON uses state words and pattern; RNA initiations appear as counted events.

The guided film makes no scientific fact depend on sound. If the free experiment’s optional event cues are enabled, they start muted until requested and can be disabled persistently.

The live region reports beat changes without narrating every animation frame. A representative announcement is: **Closer. Still silent. The enhancer and promoter are close, but the promoter stays OFF and no RNA-start event occurs.**

# Accessible transcript and results path

The nonvisual route follows the same causal order as the scene. Every scene target is mirrored by a native control in this reading order: receptor, signal, binding site, chromatin neighborhood.

| Beat | Textual observation | Result exposed |
| --- | --- | --- |
| 1 · Boundary | EGF remains outside; EGFR begins the response on its cell-facing side | Boundary identity without an inward-travelling ligand |
| 2 · Relay | Separate local intracellular regions change; no object travels between them | Compressed activity proxy; many steps omitted |
| 3 · Nuclear activity | A combined nuclear activity indicator responds | Nuclear proxy, not pore-crossing particles |
| 4 · Scale cut | Motion stops and the view changes discontinuously | Cell → nucleus → locus; not a continuous zoom |
| 5 · Separate histories | Signal/occupancy history and folded-DNA geometry change independently | Enhancer, promoter, modeled gene and two independent inputs |
| 6 · Closer, silent | The enhancer and promoter are near while the promoter remains OFF | Exact seed 0 near interval; zero initiation events |
| 7 · Later burst | The same history later turns ON and emits three initiation ticks | Exact promoter and initiation event times |
| 8 · Probability | The same 48 seeds are shown under both contact settings | 26/48 versus 41/48 bursting; seven intervention histories silent |

Keyboard users can pause or continue with Space, move with Left and Right Arrow, replay a beat with R, and exit full screen or pause with Escape. Native buttons provide Previous, Next, Replay beat, Replay tour, autoplay, full screen and Skip to experiment. Normal scrolling remains available; there is no wheel or focus trap.

# What this model can and cannot say

The browser interventions establish causality only inside the equations above. They do not validate a mechanism in living cells, and the model card is a disclosure rather than a certificate of experimental evidence.

- EGF remains outside the cell. Separate changing regions are a downstream activity proxy, not an EGF molecule, electricity, a travelling dot or a physical wave.
- The cell-to-nucleus-to-locus transition is a semantic scale change, not a continuous physical zoom.
- Chromosome territories and chromatin motion are coarse explanatory geometry, not a measured nuclear reconstruction.
- Contact propensity is not instantaneous physical distance and does not guarantee transcription.
- Enhancer proximity is neither universally necessary nor universally sufficient; its relationship to transcription depends on locus and context.
- A binding-site mutation changes one affinity parameter in this model. Real mutations may alter other binding, chromatin, sequence and regulatory effects.
- The promoter is phenomenological and omits refractory, paused, multi-step, feedback and cofactor states.
- Parallel signaling pathways, receptor trafficking, cell context, chromatin state, loop extrusion, nuclear compartments, cell cycle, allele-specific effects, nuclear mechanics and measurement uncertainty are omitted.
- Signaling and geometry are independent by default. The page does not claim that EGF remodels enhancer–promoter geometry at this generic locus.
- Ensemble outputs are distributions of 48 model histories, not 48 cells and not biological population predictions without calibration to named data.
- An initiation event marks a modeled transcription start. It is not itself a completed RNA molecule.
- Normalized values and model minutes are illustrative. The page does not invent nanometres, molecule counts, concentrations or biological timescales.
- A close encounter can remain silent; identical settings can yield different histories; an increased expectation does not command an individual result.

The model also keeps several scientific anchors apart. EGF/ERK dynamics, forced looping, nonlinear enhancer–promoter effects, Sox2 transcription without proximity and generic Markov promoter mathematics do not describe one cell type, one locus or one experimentally established causal pathway.

# Provenance, data and assay boundaries

Version 1 uses synthetic parameters and procedural visuals. It fetches no runtime scientific data, embeds no microscopy image or assay track, and reproduces no third-party figure. No pair of loci is described as validated.

The [4D Nucleome Data Portal getting-started documentation](https://data.4dnucleome.org/help/user-guide/getting-started) is an official anchor for the provenance expected of real nuclear-organization data. It does not supply geometry to this page, and no 4DN accession is bundled. Retrieved 8 August 2026.

The [ENCODE Hi-C standards page](https://www.encodeproject.org/hic/) is a separate official anchor for assay and metadata discipline. Hi-C contact measurements are not interchangeable with instantaneous three-dimensional distance, and no ENCODE contact matrix is used here. Retrieved 8 August 2026.

Because the MVP bundles no external scientific dataset, the organism, biological cell type, named locus, assay, genome assembly, resolution and data-processing fields are **not applicable** rather than silently unknown. The visible setting is a generic synthetic gene-regulation demonstration, not a calibrated epithelial cell. If a later version adds data, all of those fields, accession, normalization, retrieval date, license or terms, supported visual, and unsupported inference must accompany it.

The page’s code, prose and deterministic visuals are original project material. The linked papers, portal documentation and their publication rights remain with their respective authors, publishers and institutions; bibliographic links do not grant redistribution rights. No long source passage or source figure is reproduced.

# Nine separate scientific anchors

These references constrain different parts of the demonstration. They are deliberately not presented as a unified EGF-to-chromatin-to-transcription mechanism.

1. **Receptor boundary only.** Ogiso et al., “Crystal Structure of the Complex of Human Epidermal Growth Factor and Receptor Extracellular Domains,” _Cell_ (2002), [RCSB PDB 1IVO](https://www.rcsb.org/structure/1IVO). This grounds EGF binding outside the membrane, not the page’s schematic receptor shape or its downstream model. [DOI 10.1016/S0092-8674(02)00963-7](https://doi.org/10.1016/S0092-8674(02)00963-7).
2. **Signaling dynamics only.** Albeck, Mills and Brugge, “Frequency-Modulated Pulses of ERK Activity Transmit Quantitative Proliferation Signals,” _Molecular Cell_ (2013). This supports attention to signal dynamics in its studied context, not generic nuclear geometry. [DOI 10.1016/j.molcel.2012.11.002](https://doi.org/10.1016/j.molcel.2012.11.002).
3. **Bursting diversity only.** Suter et al., “Mammalian Genes Are Transcribed with Widely Different Bursting Kinetics,” _Science_ (2011). This supports stochastic bursting as a useful lens, not the rates of this synthetic locus. [DOI 10.1126/science.1198817](https://doi.org/10.1126/science.1198817).
4. **Forced looping in a particular system only.** Bartman et al., “Enhancer Regulation of Transcriptional Bursting Parameters Revealed by Forced Chromatin Looping,” _Molecular Cell_ (2016). This does not establish an EGF link or a universal geometry rule. [DOI 10.1016/j.molcel.2016.03.007](https://doi.org/10.1016/j.molcel.2016.03.007).
5. **Nonlinear enhancer–promoter control only.** Zuin et al., “Nonlinear control of transcription through enhancer–promoter interactions,” _Nature_ (2022). This motivates nonlinearity and context, not a calibrated parameter for this page. [DOI 10.1038/s41586-022-04570-y](https://doi.org/10.1038/s41586-022-04570-y).
6. **Sox2 proximity caution only.** Alexander et al., “Live-cell imaging reveals enhancer-dependent Sox2 transcription in the absence of enhancer proximity,” _eLife_ (2019). This prevents proximity from becoming a universal requirement or command. [DOI 10.7554/eLife.41769](https://doi.org/10.7554/eLife.41769).
7. **Mathematical switching only.** Peccoud and Ycart, “Markovian Modeling of Gene-Product Synthesis,” _Theoretical Population Biology_ (1995). This anchors a tractable stochastic model, not a complete promoter mechanism. [DOI 10.1006/tpbi.1995.1027](https://doi.org/10.1006/tpbi.1995.1027).
8. **Data provenance only.** [4D Nucleome Data Portal documentation](https://data.4dnucleome.org/help/user-guide/getting-started). This defines expectations for documented nuclear-organization data; no portal dataset is used. Retrieved 8 August 2026.
9. **Hi-C assay documentation only.** [ENCODE Hi-C standards](https://www.encodeproject.org/hic/). This informs assay caution; it does not turn a contact matrix into instantaneous distance or supply this model’s geometry. Retrieved 8 August 2026.

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
