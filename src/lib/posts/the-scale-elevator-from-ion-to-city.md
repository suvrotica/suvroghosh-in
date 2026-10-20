---
title: "The Scale Elevator — From Ion to City"
seoTitle: "The Scale Elevator — Oxygen from Ion to City"
description: "Follow oxygen through eleven interactive scales, from an iron binding site to a fictional city, and discover why every quantity needs a context."
date: "2026-10-21"
dateModified: "2026-10-21"
thumbnail: "/images/visualizations/scale-elevator/scale-elevator-social.jpg"
thumbnailAlt: "Eleven illustrated views connect an iron binding site, haemoglobin, a membrane, a cell, tissue, a heart, a person, a bed, a ward, a hospital and a fictional city"
category: "Visualizations"
tags: ["Biology", "Chemistry", "Healthcare", "Oxygen", "Semantic Zoom", "Information Design", "Scientific Computing", "Three.js", "Systems Thinking", "Physiology"]
pinnedTags: ["Biology", "Chemistry", "Healthcare", "Oxygen", "Semantic Zoom", "Information Design", "Scientific Computing", "Three.js", "Systems Thinking", "Physiology"]
published: true
interactiveFirst: true
immersiveLead: true
color: "#EAA77D"
author: "Suvro Ghosh"
readingTime: "11 min"
inPlainEnglish: "Oxygen connects an iron binding site with a city's supply network, but the useful measurement changes along the way. Explore eleven scales and compare saturation, carrying capacity, blood flow, device demand and available supply without treating them as interchangeable."
keyTerms: ["Semantic zoom", "Haem", "Haemoglobin", "Partial pressure", "Saturation", "Oxygen content", "Oxygen delivery", "Flux", "Aggregation", "Capacity", "Inventory"]
faq:
  - question: "Does one oxygen molecule travel through the entire exhibit?"
    answer: "No. The visual thread follows oxygen's role. Oxygen is consumed during cellular respiration, and later floors change anatomical context or organisational scope."
  - question: "Does the ion floor show an oxygen ion?"
    answer: "It shows the iron centre in a haem group, where molecular oxygen, O₂, binds reversibly. The title describes the binding site's scale."
  - question: "Can equal saturation mean different oxygen delivery?"
    answer: "Yes. In the declared educational calculation, arterial oxygen content also depends on haemoglobin concentration and partial pressure; delivery then depends on blood flow. The comparison holds other inputs constant."
  - question: "Are the people, hospitals and city real?"
    answer: "All clinical traces, beds, wards, facilities and map locations are synthetic. The exhibit is an educational collection of models and authored illustrations."
  - question: "Can I explore without animation or WebGL?"
    answer: "Yes. Reduced motion starts paused with manual floor controls. Still views, an ordered floor ledger and the article remain readable when WebGL or JavaScript is unavailable."
---

<script>
	import ScaleElevator from '$lib/components/visualizations/scale-elevator/ScaleElevator.svelte';
</script>

<ScaleElevator />

<p><small>Published <time datetime="2026-10-21">21 October 2026</time> · Updated <time datetime="2026-10-21">21 October 2026</time></small></p>

<TTS />

# What does an oxygen level belong to?

A person looks at a bedside monitor and sees a percentage. A ward manager looks at a gas supply and sees litres per minute. A delivery coordinator looks at a store and asks how long it will last. All three are looking after oxygen. Their numbers answer different questions.

The Scale Elevator begins at the iron centre of a haem group and ends above a fictional city. Between them lie a carrier protein, a membrane, a cell, tissue, an organ, a person, a hospital bed, a ward and a hospital. Each stop changes what we can see and what it makes sense to count.

The continuous journey is a visual argument: a quantity needs an object, a unit and a context. A beautiful number with its context removed can be more misleading than an untidy explanation with its assumptions attached.

Every clinical record and infrastructure scenario here is synthetic. The small-scale scenes are explanatory constructions. The exhibit joins several educational models; its camera does not turn them into one complete simulation of a living body.

# Taking the lift

Move the scale slider, select a floor, or start the guided tour. Previous and Next make the same journey a step at a time. You can pause, reverse direction and revisit a view while keeping the selected comparison. The local control belongs to the current floor; its label explains what it changes.

Read the **measurement passport** alongside the picture. It names the quantity, unit, scope, time interval and denominator, and identifies synthetic, calculated or illustrative values. The physical viewing extent appears separately. A membrane's thickness is not the width of the frame containing its diagram.

The views change continuously, but their measurements do not blend. Halfway between a cell and a tissue diagram, an intermediate camera position has no biological meaning of its own. Some handoffs reveal a larger structure; others deliberately change anatomy, measurement or organisation.

# Eleven ways to ask about oxygen

## 01 · Ion: a place to bind

The first scene centres on iron within haem. The approaching object is molecular oxygen, O₂. Reversible attachment gives the opening a small, local question: is this site occupied? The surrounding ring supplies context for the metal centre.

The paths are authored trajectories, not molecular dynamics. Their purpose is to distinguish approach, binding and release. The [RCSB PDB-101 account of haemoglobin](https://pdb101.rcsb.org/motm/41) describes the relationship between iron-containing haem groups and oxygen transport.

## 02 · Molecule: a denominator appears

The view opens to schematic haemoglobin and its four haem sites. Counting occupied sites becomes useful only beside the number available. A single molecule has discrete occupancy; an ensemble permits a fraction.

Inspect the illustrative binding response as the control changes. It compresses a complex interaction into a bounded teaching relationship. The protein geometry and particle paths are drawn for explanation rather than reconstructed from crystallographic coordinates.

## 03 · Membrane: a boundary becomes the subject

A cross-section replaces the protein portrait. The useful vocabulary becomes sides, gradients and crossings. The display's normalised transport response makes the declared driving difference visible without claiming a calibrated membrane permeability.

This is also an anatomical handoff. Haemoglobin carries oxygen inside red blood cells; the journey now turns towards a tissue cell. A healthy mature human red blood cell lacks mitochondria. The exhibit does not give the carrier cell the consuming tissue cell's machinery. Research on [abnormal mitochondrial retention in sickle red blood cells](https://haematologica.org/article/view/11102) illustrates why this anatomical distinction matters.

## 04 · Cell: arrival is followed by use

Compartments replace trajectories as the organising picture. Oxygen reaches mitochondria in a schematic tissue cell and participates in respiration. The uptake display uses a declared illustrative demand relationship.

At this handoff the persistent oxygen motif changes meaning. We are following a role, not an indestructible molecule. Oxygen is reduced to water in the respiratory chain; it does not turn directly into ATP. [RCSB's explanation of cytochrome c oxidase](https://pdb101.rcsb.org/motm/5) places oxygen consumption within the machinery that supports cellular energy conversion.

## 05 · Tissue: the average loses its address

Capillaries and neighbouring cells spread across a field. Select a region near a vessel and another farther away. The picture can no longer be read as one cell's uptake: location and distance now matter.

The oxygen-related field is an authored spatial model, not a solved diffusion experiment. The four inspection points use relative distances, while the passport separates the selected supply index from the perfusion input. Which regions disappear when we replace the entire patch with one average? A reassuring centre can coexist with a poorly supplied edge inside the illustration.

## 06 · Organ: supply meets unequal demand

A schematic heart introduces branching flows and regional supply. Lowering the perfusion control changes the model's delivery illustration. Four fixed synthetic demand references remain unchanged as delivery varies. Inspecting a region reveals its delivery, declared demand and the difference; a fixed chart scale keeps the comparisons visible.

This view illustrates transport stress. It does not diagnose organ failure. A coloured region is an output of a simplified relationship, while real dysfunction involves interacting processes that this picture does not represent. The change of visual vocabulary makes a limited claim easier to inspect.

## 07 · Person: a percentage needs a carrier

The whole-person view links lungs, circulation and consuming tissues. It separates saturation from arterial oxygen content and systemic delivery. The calculation uses haemoglobin concentration, saturation and partial pressure, then multiplies content by blood flow with the necessary unit conversion.

The educational approximation is:

$$
C_{aO_2}=1.34\,Hb\,\frac{S_{aO_2}}{100}+0.003\,P_{aO_2},
\qquad D_{O_2}=10\,Q\,C_{aO_2}.
$$

Here $Hb$ is in g/dL, saturation in percent, partial pressure in mmHg and flow $Q$ in L/min. Content is expressed in mL O₂/dL blood and delivery in mL O₂/min. The factor ten converts litres of blood to decilitres. The [oxygen-transport physiology reference](https://www.ncbi.nlm.nih.gov/books/NBK538336/) gives this content approximation. It is not a model of compensatory circulation.

## 08 · Hospital bed: a measurement acquires a history

The person becomes a bedside scene with a synthetic monitoring timeline. Inspect a point and read its time and signal-quality context. The trace belongs to an observation process; its vertical movement is not a direct film of oxygen molecules.

SpO₂ estimates blood oxygen saturation. Circulation, skin pigmentation, temperature and other factors can affect accuracy, as the [FDA explains](https://www.fda.gov/medical-devices/products-and-medical-procedures/pulse-oximeters). The exhibit's signal-quality labels are authored examples, not an algorithm for certifying a reading. The contextual haemoglobin and flow values come from separate declared inputs.

## 09 · Ward: addition needs compatible units

A ward plan replaces the bedside timeline. Each bed contributes a synthetic oxygen-service demand. Selecting beds makes their contribution to the total visible.

These are compatible source-gas flow rates under one stated reference condition and purity. They can be added. Saturation percentages cannot be added to produce gas demand. Two occupied beds may place very different demands on an oxygen service, even before a ward's distribution limits enter the picture.

## 10 · Hospital: a total needs a route

Sources, storage, distribution and wards form a network. Inspect a constrained connection and compare available supply with deliverable flow. A large nominal source can coexist with unmet demand at a branch.

The allocation rule is explicit and bounded. It explains a bottleneck without claiming to engineer a medical pipeline. The [WHO specifications for facility oxygen systems](https://www.who.int/publications/i/item/9789240101616) treat sources, storage and distribution as distinct parts of a functioning service. This exhibit's network is fictional.

## 11 · City: a reserve needs a clock

The final view becomes a map because geography and connections now organise the question. Three fictional facilities share a supply story. Demand and replenishment act over a stated horizon; inventory is an amount, while supply and use are rates.

Explore reduced replenishment or higher demand, then return to the bedside. The journey back is useful: a hospital's reserve is consequential to a person, but it does not describe that person's saturation. Likewise, a good bedside reading cannot certify a city's resilience.

# Three comparisons worth carrying upstairs

**Same saturation, different haemoglobin.** Hold the declared saturation, partial pressure and flow constant while reducing haemoglobin concentration. The calculation changes oxygen content and delivery. It deliberately leaves compensatory responses outside the model.

**Same content, different blood flow.** Hold the blood's calculated content constant and reduce flow. Delivery changes because the amount passing through each minute changes. A still image of blood composition cannot answer a question about transport per minute.

**Same beds, different service demand.** Keep occupancy fixed and change the synthetic source-demand profile. The ward totals change; the hospital allocation and city balance then expose consequences under their own assumptions. The comparison never derives a gas prescription from an SpO₂ trace.

A selected comparison may leave a molecular mechanism unchanged. That is a useful result: an upstream drawing should not twitch merely because a downstream planning assumption changed.

# Keeping the units attached

The physiological equations and the infrastructure ledger meet through an explicit educational handoff. They are not connected by a concealed conversion from blood oxygen delivery into a flowmeter setting. Source gas, inspired gas and oxygen consumed by tissue have different boundaries.

Infrastructure volumes here refer to synthetic gas-equivalent litres at 20 °C and 101.3 kPa with fixed 99% source purity. Stored inventory uses the same convention. It does not describe a vessel's geometric volume or a changing pressure inside a cylinder. The network omits pressure dynamics, leaks, maintenance, clinical prioritisation and real procurement.

The molecular geometry, membrane response, cellular uptake, tissue field and organ comparison are simplified teaching devices. Patient traces and demand records are synthetic. These boundaries belong beside the exhibit because smooth motion can make a chain of illustrations feel more physically complete than it is.

# A visual grammar that changes with the question

The exhibit draws on the editorial ambitions of *Information Graphics*, *Knowledge Is Beautiful* and Alberto Cairo's *The Functional Art*: make relationships legible, organise attention, and choose an encoding for the question a reader needs to answer.

Trajectories become crossings, compartments, fields, flows, timelines, networks and maps. A recurring oxygen colour carries the thread while labels preserve the changing meaning. Three.js supplies the stage; HTML and SVG keep explanations and measurements readable around it. The scale rail is an index of contexts rather than a ruler of eleven equally spaced powers of ten.

<figure>
	<img
		src="/images/visualizations/scale-elevator/scale-elevator-overview.jpg"
		width="1800"
		height="1140"
		alt="A contact sheet of all eleven Scale Elevator floors, with a named view and annotated measurement at each scale"
		loading="lazy"
		decoding="async"
	/>
	<figcaption>Eleven views from the same implementation. Every frame keeps its measurement context attached.</figcaption>
</figure>

<Vid
	src="/videos/visualizations/scale-elevator/scale-elevator-tour.mp4"
	title="Continuous Scale Elevator journey from ion to city"
	caption="A silent journey with readable pauses at all eleven floors. The ordered floor ledger and article provide the text explanation."
	poster="/images/visualizations/scale-elevator/scale-elevator-social.jpg"
	preload="metadata"
/>

The recording travels through the same scenes as the interactive view. The stills preserve its individual stops. Either route should leave a useful habit behind: before interpreting a quantity, ask what it belongs to.
