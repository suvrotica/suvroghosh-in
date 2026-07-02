---
title: "AI in Healthcare: Beware"
description: "AI deployment in healthcare is not mainly a modeling problem. It is a representation, validation, workflow, and risk-management problem, and it needs staged evidence before real clinical influence."
thumbnail: "/images/IMG-20260423-WA0008.jpg"
date: "2026-04-21"
category: "Healthcare AI"
tags: ["Healthcare AI", "Artificial Intelligence", "Healthcare IT", "Clinical Decision Support", "FHIR", "HL7", "EHR", "Model Validation", "Patient Safety", "Calcutta Essay", "SuvroGhosh"]
published: true
color: "red"
---

<TTS />

<Pi src="IMG-20260423-WA0008.jpg" />

The alert on a hospital screen can look innocent: one small box, one probability, one suggested action. It has the modest manners of software. That is what makes it dangerous. A system that nudges clinical attention is no longer just software in the ordinary sense. It has entered the pathway by which someone may be watched more closely, treated sooner, ignored longer, or sent through a different corridor of care.

AI in healthcare fails the moment it is treated as a model problem instead of a system problem.

The temptation is obvious. A model performs well on retrospective data. A vendor demo looks polished. A clinical champion believes the tool will save time. A leadership team wants the institution to appear modern. A pilot feels promising. Soon the question becomes, "Why are we not using this?" That question sounds practical, but it can be the beginning of a category error.

Healthcare AI is not a feature toggle. It is an intervention that may be wrapped in software clothing.

The hard question is not whether a model can produce a plausible prediction. The hard question is whether that prediction is valid here, on this population, under this workflow, using this institution's data, with this staffing pattern, at the time when a human can still act on it. Anything less is not deployment. It is hope with an interface.

The first weakness is representation. Healthcare data does not arrive as clinical truth. It arrives as residue from work. An Electronic Health Record, or EHR, records orders, notes, results, billing needs, liability concerns, templates, schedules, and memory. It is not a clean photograph of the patient. It is a working ledger built under pressure.

The same is true of transport standards. HL7 v2, the older hospital messaging standard still running in many systems, can carry a lab result reliably without carrying the full clinical story around that result. FHIR, the newer web-friendly standard for healthcare data exchange, gives clearer structure, but structure is not meaning. A FHIR `Condition` can still depend on coding habits, timing, uncertainty, and whether anyone reconciled the record after the last migration.

When a model consumes this data, it is not learning the body directly. It is learning the institution's representation of the body.

That matters. A missing blood-pressure value may mean the reading was not taken, not entered, delayed, unavailable to the interface, or considered less urgent in the moment. A diagnosis code may mean confirmed disease, suspected disease, historical residue, billing necessity, or copied habit. A lab timestamp may mark collection, result availability, posting, correction, or some local compromise nobody remembers until the interface breaks.

Calling all of this "bad data" is too shallow. Often the data is faithfully recording the wrong thing for the new purpose.

The second weakness is time. Clinical life is not arranged in the neat sequence that model training often imagines. The patient worsens. The nurse notices. A test is ordered. The result returns. The note is written later. The code appears later still. If a model is trained carelessly, it can appear to predict an event while quietly using evidence that was only available after the decision window had already begun to close.

This is the oldest kind of analytics fraud: time travel with a dashboard.

The third weakness is workflow. A model can be accurate and useless if it speaks at the wrong moment. An alert that appears during peak clinical load may be dismissed. A score that cannot be explained may be distrusted. A warning that requires a pathway the hospital cannot provide may only add guilt to delay. The model may be right, but the organization may be unable to metabolize its truth.

That is why evidence-driven deployment must be staged.

Start with local retrospective validation. Then run the model in shadow mode, where it observes live workflow without showing outputs to clinicians. Shadow mode is boring, which is one reason it is valuable. It reveals timing, drift, missing data, calibration problems, and local behavior without pushing the clinical team into premature reliance.

After that, expose the tool narrowly, with guardrails. Keep it as decision support, not decision automation. Define who sees it, when they see it, how they can challenge it, what action it is meant to trigger, and what happens when the system is wrong. Measure clinical impact, not only predictive accuracy. Measure alert burden. Measure overrides. Measure whether particular groups are harmed, missed, or overloaded.

Every prediction should carry provenance: model version, data sources, feature transformations, timestamp assumptions, and workflow context. Without that, investigation after harm becomes guesswork dressed as root-cause analysis.

The quiet architectural principle is simple: AI outputs should be treated as signals, not commands. Separate inference from workflow orchestration. Make rollback possible. Make monitoring continuous. Make uncertainty visible. Make the system admit when the data is missing, contradictory, stale, or outside the population on which the model was tested.

Healthcare already understands this discipline in other areas. A lab assay is validated, calibrated, monitored, and interpreted within limits. An AI model that influences care deserves at least that level of seriousness. A high AUC, meaning a statistical measure of ranking performance, is not a moral passport. It says something about discrimination between classes in a dataset. It does not prove clinical usefulness, fairness, safety, explainability, or fit with local workflow.

Some problems should not be modeled yet. If the underlying representation is unstable, the correct move may be upstream: improve capture, standardization, workflow, and governance before inserting a model. This is not anti-innovation. It is the adult form of innovation, the one that survives contact with patients, nurses, doctors, clerks, downtime, migration scripts, and the ordinary fatigue of institutions.

From a Calcutta room, it is easy to see why the shortcut seduces. We live in a country where queues are long, clinicians are overworked, and access is uneven. A useful AI tool could matter. It could support triage, translation, follow-up, risk detection, and care navigation. The need is real.

But need does not cancel proof.

The discipline of evidence-driven deployment will not produce dramatic headlines. It will produce slower systems, more documentation, more argument, more rollback plans, and fewer shiny launch photographs. That is probably a good sign. In healthcare, the safest technology often enters the room quietly and spends a long time proving it deserves to stay.

P.S. References: Useful current anchors include the FDA's AI-enabled medical device resources, ONC's HTI-1 decision-support transparency requirements, and WHO guidance on AI and large multi-modal models in health: [FDA AI in medical devices](https://www.fda.gov/medical-devices/software-medical-device-samd/artificial-intelligence-software-medical-device), [ONC HTI-1](https://healthit.gov/regulations/hti-rules/hti-1-final-rule/), [WHO LMM guidance](https://www.who.int/publications/i/item/9789240084759).
