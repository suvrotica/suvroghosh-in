---
title: "The City That Refuses a Master Plan"
description: "Place one sweet shop and let Wave Function Collapse grow a fictional Calcutta neighbourhood of lanes, ponds, tram tracks, drains, and civic exceptions."
date: "2026-07-30"
dateModified: "2026-07-31"
thumbnail: "/images/the-city-that-refuses-a-master-plan.webp"
thumbnailAlt: "Illustrated fictional neighbourhood survey with ochre lanes, ponds, tram rails, clustered houses, trees, and a stamped municipal exception"
category: "Visualizations"
tags: ["Scores Actually Measure","Neighbourhood Begins Gossiping","Uncertain Square Goes","Model Deliberately Leaves","Lab Mode","Cell","WFC","Tile","Propagation","Frontage"]
published: true
interactiveFirst: true
color: "#A85C3C"
author: "Suvro Ghosh"
readingTime: "18 min"
inPlainEnglish: "Place one object, such as a sweet shop or pond, and a deterministic constraint-solving process builds a fictional neighbourhood around it. Every neighbouring pair may be locally acceptable while the completed city still has disconnected lanes, unhelpful drains, or infrastructure that survives only through a retrospective municipal exception."
keyTerms: ["Wave Function Collapse","Simple tiled model","Constraint propagation","Entropy","Backtracking","Local compatibility","Global connectivity","Deterministic seed","Municipal patch","Procedural generation"]
faq:
  - question: "Is Wave Function Collapse a quantum-computing algorithm?"
    answer: "No. The name is a metaphor. This exhibit uses an authored simple-tiled constraint model running as ordinary deterministic TypeScript in a browser Worker."
  - question: "Does the generator copy a real Calcutta neighbourhood?"
    answer: "No. The map is fictional and schematic. Its palette and object vocabulary evoke a city without using real residents, addresses, wards, or a particular neighbourhood."
  - question: "Why can every adjacent tile fit while the whole city works badly?"
    answer: "Adjacency rules answer local questions: whether a lane continues across one edge, or whether a shop faces accessible ground. They do not by themselves guarantee that all lanes form one useful network, that drains reach an outlet, or that every occupied parcel is reachable."
  - question: "Will the same link always make the same city?"
    answer: "Within generator version 1, the same seed, anchor, location, grid, and topology settings reproduce the same tile grids, repairs, scores, report facts, and fingerprint. Display settings such as zoom and animation speed do not alter the city."
  - question: "What is a municipal patch?"
    answer: "It is this exhibit’s deliberate extension to ordinary tiled WFC. A patch is either a locally compatible adapter built after bounded backtracking exhausts a contradiction, or a recorded infrastructure-survey exception such as rails entering a garage. Both retain coordinates, severity, and the waived internal rule."
  - question: "Are the functional and calamity scores measures of real urban quality?"
    answer: "No. They are transparent play scores derived only from visible model rules such as route connectivity, frontage access, drainage, and the type and severity of generated exceptions."
---

<script>
	import CityMasterPlanLab from '$lib/components/visualizations/city-master-plan/CityMasterPlanLab.svelte';
</script>

Place one thing. The neighbourhood negotiates everything else.

<CityMasterPlanLab />

> **What to try first**
>
> Place the sweet shop near the centre and watch the first lane form around its frontage. Then switch to **Lab mode** and run the pond or flyover trial. The useful question is not merely whether every adjacent pair fits, but whether the finished neighbourhood works as a whole.

<TTS />

# A city from local agreements

The sweet shop knows very little. It knows that its counter ought to face somewhere a customer can stand. The lane beside it knows that a lane arriving from the north must either continue, turn, branch, or end for an intelligible reason. A pond bank knows which side is wet. A garage door has opinions about vehicle access. None of them knows the final street network.

That is enough to begin.

The laboratory starts with a grid of undecided cells. Each cell holds a set of currently legal possibilities: perhaps a parcel, lane corner, road junction, pond bank, courtyard, or tram-bearing road. Placing one anchor removes many of those possibilities immediately. A pond excludes bedrooms from its interior. A tram stop asks for continuous rails. A sweet shop asks for frontage. Those decisions affect their neighbours, which affect their neighbours, until a neighbourhood emerges from a long sequence of small agreements.

The result can look planned because adjacent pieces fit. That appearance is precisely the trap under examination. Local compatibility is not the same thing as a sensible whole.

The map is entirely fictional. It borrows a vocabulary of plaster, tram steel, ponds, roof tanks, verandahs, drains, trees, tarpaulins, and sand without claiming to reproduce a real address or resident.

# What one tile knows

Every urban-fabric tile has four structured edge signatures: north, east, south, and west. An edge can carry a closed boundary, foot passage, lane, road, or tram route. It can be dry or pond-facing. It can require clearance or admit a particular frontage.

A rotated tile is not a new hand-written rule. Rotation turns the complete signature. North becomes east; an entrance, rail direction, drain direction, and drawing orientation turn together. Before generation begins, the engine compares every concrete tile variant with every other variant and builds compatibility masks for the four directions.

This makes a rule inspectable. For an observed cell, Lab mode preserves the selected effective weight, a compact list of the families that remained, whether propagation forced the decision, and a few concrete directions in which common excluded families could no longer meet their neighbour. The completed inspector also exposes the four edge signatures and the substrate that admitted the occupation.

The city is built hierarchically:

1. **Urban fabric** decides parcels, courtyards, lanes, roads, tram corridors, ponds, banks, trees, and boundary exits.
2. **Occupation** places houses, shops, stalls, garages, workshops, temples, balconies, pillars, sand, and open parcels while reading the fabric below.
3. **Infrastructure** adds drains, culverts, poles, wires, steps, and small details with a constrained secondary solver.

The first two passes use the same observation-and-propagation machinery. The utility layer is described separately because forcing every wire and drain into one enormous catalogue would make the model less intelligible, not more faithful.

# Why the least uncertain square goes next

An undecided cell with twelve possibilities is less constrained than one with two. The engine therefore looks for the non-collapsed cell with the lowest weighted Shannon entropy:

$$
H=\log\left(\sum_i w_i\right)-\frac{\sum_i w_i\log(w_i)}{\sum_i w_i}.
$$

Here, each $w_i$ is the authored likelihood of one remaining tile. Entropy is low when few possibilities remain or when one possibility carries much more weight than the others. A tiny seeded tie-breaker prevents equally uncertain cells from turning into directional stripes.

The chosen cell is **observed**: one remaining possibility is selected by weight using a seeded pseudo-random stream. Weight changes likelihood across many cities; it does not promise an exact proportion in one map.

“Wave function” is a useful visual metaphor for the set of unresolved possibilities. It is not a claim about quantum mechanics, quantum hardware, or physical wave-function collapse. This is ordinary constraint propagation implemented in TypeScript.

# How the anchor changes its neighbours

The anchor is not a magic destination to which every route must lead. It is one committed local condition.

A sweet shop fixes its own occupation and selects a frontage direction. The adjacent cell must admit a courtyard, footpath, lane, or road, and nearby pedestrian fabric receives a modest weight increase. A pond uses a multi-cell footprint and makes its banks negotiate around an excluded wet interior. A tram stop establishes rails and power clearance. A large tree encourages open ground nearby. A sand pile can occupy precisely the piece of access everyone expected to remain temporary.

The seed remains separate from the anchor. Moving the shop does not secretly change the random number stream; it changes the constraints applied to the same stream. This is why the **same seed, different anchor** challenge can reveal how one altered starting condition reorganises the result.

# Propagation: the neighbourhood begins gossiping

After observation, the engine places the changed cell in a queue. For each cardinal neighbour it computes the union of variants compatible with the changed cell, then intersects that union with the neighbour’s candidates.

If a possibility disappears, the neighbour enters the queue. Its reduced set may eliminate possibilities farther away. One shopfront can therefore influence a lane several cells later without issuing a global command.

In Play mode this arrives as an illustrated reveal. In Lab mode the same event stream exposes candidate counts, entropy, the observation cell, propagation highlights, and the reasons common alternatives vanished. **Step** advances one genuine observation together with the propagation it caused. **Finish** changes only the reveal speed; it does not substitute another result.

# Contradiction and retrospective permission

Sometimes propagation removes the last possibility from a cell. That is a contradiction, not a software crash.

The engine first consults a bounded decision stack. It restores the most recent viable state, removes the failed choice, and continues along another branch. The **Civic patience** control changes how many such returns are allowed. The budget is deliberately finite, so a difficult city cannot search forever behind a polite spinner.

If bounded backtracking cannot settle the application, the laboratory invokes local precedent.

A **municipal patch** created by the WFC core inspects what the neighbouring cells demand on each edge and constructs an adapter that meets those exterior demands. It then records the internal rule that had to be waived.

The subsequent infrastructure pass uses the same visible patch ledger for concrete survey conflicts found after collapse: for example, rails aligned with a garage door or a drain segment that rises against the generated elevation field. Those records are deterministic rule findings, not claims that the WFC wave itself contradicted. Together the visible repertoire includes:

- a balcony regularised over a lane;
- a lane acquiring an indoor section through a bedroom;
- an electric pole continuing through a verandah;
- a drain whose gradient has become aspirational;
- tram rails entering a garage;
- a bamboo bridge where pedestrian continuity meets pond water;
- permanent sand occupying part of a route;
- rooms built around a flyover pillar; and
- blue construction tarpaulin as the rare universal fallback.

The patch system is an extension created for this exhibit, not a standard requirement of Wave Function Collapse. Its purpose is to turn contradiction into inspectable content without pretending that the internal conflict disappeared.

# Local compatibility is not a master plan

WFC answers a question of the form: “Can this possibility sit beside those possibilities?” It does not automatically answer: “Can a person walk from every occupied parcel to a boundary?” or “Does this drain network have an outlet?”

Consider a ring of impeccable lanes surrounding an inaccessible courtyard. Every lane edge continues correctly. The ring is locally coherent and globally unhelpful. Two separate road networks can each contain flawless junctions while never meeting. A row of drains can match end to end and still settle in a trapped low point.

The generator does not secretly rewrite a completed map until it earns a flattering score. It finishes the local construction, then a separate analysis pass judges the global consequences. A dysfunctional city is a result, not a failed run.

The optional **Minimum civic guarantees** setting is therefore described as a hybrid. It pins a few coarse boundary conditions—multiple exits, a possible drainage outlet, and an open-space seed—before WFC begins. It improves the odds of a useful whole by adding a small amount of global intent.

# Why a connected lane network is a global question

After generation, the analyser treats walkable routes as a graph. Cells are nodes; compatible foot, lane, road, and tram connections are edges. A flood-fill finds connected components, the largest component, boundary exits, and dead ends.

Occupation is checked against that graph. Houses and shops receive frontage access only when an entrance or counter faces reachable fabric. Garages require vehicle access. Tram segments are examined for stranded pieces and coherent exits. Ponds are checked for accessible banks rather than praised merely for being blue.

Drainage uses a small deterministic elevation field: coarse seeded values, interpolation, local variation, and a mild slope towards an outlet. This is not hydrology. It is just enough structure to distinguish a drain reaching an outlet from one that is broken, trapped, absent, or explicitly uphill.

# What the two scores actually measure

The **Functional score** is a 0–100 play score assembled from six visible components:

- 30 points for walkable-network connectivity;
- 20 for occupied-frontage access;
- 15 for drains reaching an outlet without uphill segments;
- 15 for route coherence, boundary access, and tram continuity;
- 10 for useful service variety; and
- 10 for trees, pond access, courtyards, and open-space balance.

Severe exceptions, blocked exits, and isolated occupied structures make explicit deductions. The component bars are shown because a single unexplained number would teach nothing.

The **Calamity score** is independent. It combines exception severity and variety, obstructed access, uphill drainage, stranded tram infrastructure, utility collisions, indoor lanes, and important routes occupied by sand. Repeated examples have diminishing returns. Ten identical sand piles do not automatically outrank five distinct forms of engineered confidence.

A city can therefore function surprisingly well and remain magnificently anomalous. Calamity is not $100-\text{function}$.

# The municipal report

The report is assembled from measured facts: the proportion of occupied buildings with frontage, the size of the largest route component, exits reached, drainage outcomes, tram continuity, and actual repair records. Its sentences are deterministic templates, not a language model improvising civic gossip.

Every result also receives a fictional name and an eight-hexadecimal-digit fingerprint. The fingerprint hashes the generator version, topology settings, tile identifiers, rotations, and municipal patches. It is the quickest way to check that a shared URL reproduced exactly.

Both PNG exports use a separate Canvas and the canonical tile renderer, without enlarging the live backing store. The social card is 1600 × 1200 and the high-resolution map poster is 3200 × 2400; both carry the city name, legend, scores, fictional-city disclaimer, seed, anchor, exception count, fingerprint, and site attribution. JSON export uses a versioned schema and includes tile grids, infrastructure, patches, score components, and report facts—not animation frames or candidate history.

# What this model deliberately leaves out

This city has no land ownership, rent, labour, traffic demand, public finance, electoral power, building age, maintenance budget, groundwater, sewage load, weather forecast, or human memory. It does not simulate planning law, engineering practice, informal settlement, religious life, household decisions, or the history of Calcutta.

Those omissions matter. A tile model can show how local rules and global outcomes diverge. It cannot explain why a real city has the form it does, and its two playful scores must not be mistaken for measures of real neighbourhoods or people.

The humour is aimed at accreted systems, incompatible requirements, and permissions that arrive after construction. Residents, occupations, faiths, and poverty are not calamity tiles. Temples appear only as ordinary landmarks; sacred imagery is never used as a collision gag.

**Fictional neighbourhood generated from local rules. Not a map of a real place.**

# Technical notebook

Generation runs in a browser Worker. The active wave is represented by compact bit sets; propagation uses a queue rather than rescanning the full grid after every removal. Named pseudo-random streams separate fabric, occupation, infrastructure, repairs, details, and names, so adding a roof crack cannot move a road.

The live Canvas caps device-pixel ratio and stops expensive animation when the laboratory is hidden or outside the viewport. A separate renderer handles high-resolution export. The page’s search parameters contain only topology-changing state: generator version, seed, anchor, location, rotation, size, patience, guarantees, density, landmark frequency, and anomaly appetite. Zoom, selected cell, animation speed, open panels, and theme remain presentation state.

The article and poster are server-rendered. JavaScript hydration starts the Worker, Canvas, observers, URL decoding, sharing, and downloads without changing the laboratory’s allocated size. With scripting disabled, the premise, canonical poster, canonical city report, explanation, glossary, and references remain readable.

# Glossary

**Anchor:** The one object placed before generation. It fixes a local condition without prescribing the whole city.

**Candidate:** One tile variant still legal in an undecided cell.

**Compatibility mask:** A precomputed set of variants that may appear beside another variant in one direction.

**Contradiction:** A cell with no remaining legal candidate.

**Entropy:** A weighted measure used to choose a constrained cell for observation.

**Municipal patch:** A deterministic record of an explicit exception. WFC contradictions receive a locally compatible adapter after bounded backtracking; later infrastructure conflicts use the same ledger without being mislabelled as WFC contradictions.

**Observation:** Selecting one weighted candidate for a low-entropy cell.

**Propagation:** Removing neighbour candidates that are incompatible with a changed cell, then repeating through a queue.

**Simple tiled model:** A WFC form in which authored tile variants and their adjacency relations define local legality.

**Seed:** Text used to initialise deterministic pseudo-random streams. It is not the complete city state; anchor and topology settings matter too.

# References

- Maxim Gumin, [WaveFunctionCollapse reference implementation and simple tiled model](https://github.com/mxgmn/WaveFunctionCollapse). The repository documents observation, propagation, contradiction, tile adjacency, and the algorithm’s deliberately metaphorical name.
- Paul Merrell, [Model Synthesis](https://graphics.stanford.edu/~pmerrell/thesis.pdf), doctoral dissertation, 2009. This develops the model-synthesis lineage of generating larger structures from local constraints.
- Isaac Karth and Adam M. Smith, [“WaveFunctionCollapse is Constraint Solving in the Wild”](https://escholarship.org/uc/item/1f29235t), *Foundations of Digital Games*, 2017. The paper examines WFC as constraint solving and distinguishes its operational machinery from the quantum metaphor.
