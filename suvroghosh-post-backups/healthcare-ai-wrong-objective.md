---
title: "Healthcare AI and the Wrong Objective"
description: "Future healthcare AI may fail not because it is unintelligent, but because it optimizes brittle objectives built from distorted representations of care."
thumbnail: "/images/IMG-20260426-WA0002.jpg"
date: "2026-04-26"
category: "Healthcare AI"
tags: ["Healthcare AI", "Artificial Intelligence", "Healthcare IT", "Clinical Data", "FHIR", "HL7", "EHR", "Model Risk", "Data Governance", "Calcutta Essay", "SuvroGhosh"]
published: true
color: "slate"
---

<TTS />

<Pi src="IMG-20260426-WA0002.jpg" />

The spreadsheet looks clean when it is far enough away. Rows, columns, dates, codes, outcomes, tidy little fields. Then you move closer and see the old hospital underneath it: the delayed note, the copied problem list, the interface that dropped context, the ward where one measurement means urgency and another means someone finally had time to type.

Healthcare AI will not fail first because it lacks intelligence. It will fail because intelligence is the easiest part to admire and the hardest part to govern.

The model does not optimize reality. It optimizes an objective. That objective may be readmission, deterioration, length of stay, cost, coded diagnosis, clinician action, message sentiment, appointment attendance, or some committee-built composite that looks sensible in a slide deck. The model will do what the objective asks. It will not do what the clinical conscience silently wishes the objective meant.

This distinction is not philosophical decoration. It is the central engineering problem.

A model is trained on representations of care, not care itself. Those representations are shaped by workflow, billing, staffing, templates, local habits, reimbursement rules, access patterns, coding practices, migration history, and institutional fatigue. The loss function, meaning the mathematical rule that rewards the model for reducing error, does not know which parts of the data are clinical signal and which parts are administrative weather. It rewards fit.

Fit can be dangerous.

If historically undertreated patients received less specialist care, a model trained on cost may learn that they needed less care. If some patients were documented poorly, a model may treat missing detail as lower risk. If clinicians ordered fewer tests for a group because access was constrained, the model may learn absence of testing as absence of disease. The past does not enter the dataset as a confession. It enters as a pattern.

Healthcare data is especially treacherous because it looks more official than it is. The EHR is not a mirror of the patient. It is a production system for care, billing, compliance, communication, liability, scheduling, and memory. It records what an institution needed to record at the moment it needed to act, defend, bill, report, route, measure, or remember. It is a ledger with bedside ambitions.

Transport makes this look safer than it is. HL7 v2 can deliver a message. FHIR can expose a structured resource. A warehouse can store it. A pipeline can normalize it. A model can consume it. None of that proves the data means what the model thinks it means.

Transport is the truck. Meaning is the cargo manifest, the route history, the weather, the inspection, and the question of whether the crate was mislabeled before it left.

FHIR improves structure, but structure does not abolish ambiguity. A lab result may have a value, unit, timestamp, and reference range. Good. But was the sample delayed? Was the value available before the clinical decision? Was it repeated? Was the patient already treated? Did the interface preserve the right time? Was the local workflow comparable to the workflow in the training data?

CDA, the older document-based clinical architecture, shows a different tension. The human-readable narrative may contain nuance, hesitation, and contradiction. The structured section may contain the computable approximation. AI that reads only structure may miss the warning. AI that reads narrative may absorb boilerplate, hedging, copied text, and legal caution. Neither path is automatically pure.

Then comes time. Healthcare events do not line up in the clean order that models like. Observation, recording, availability, correction, and action can all occur at different moments. A sepsis model, for example, can appear prophetic if training accidentally includes information that was not available at the true decision point. A risk score can look brilliant while reading tomorrow's chart.

That is not medicine. That is leakage.

The next problem is feedback. Once deployed, AI changes the world that generates its future data. A model that flags risk may cause earlier intervention, making flagged patients look less risky later. A model that deprioritizes someone may reduce testing, making their problem less visible. A model that encourages more documentation may change coding. A model that ranks outreach may teach the system to ignore people who were already harder to reach.

This is not merely model drift. It is institutional recursion. The machine joins the ecosystem and then mistakes the ecosystem's response for truth.

The wrong objective can also be commercially attractive. A model selected to reduce time may omit uncertainty. A model selected to increase portal engagement may learn that anxiety is an energy source. A model selected to predict missed appointments may rediscover poverty, distance, work precarity, disability, language barriers, or prior mistreatment and describe them as personal risk. Bias survives modernization by changing clothes.

The clean solution does not exist. Healthcare AI cannot wait for perfect data from perfectly equitable systems with perfectly harmonized workflows. Legacy feeds will keep running. FHIR APIs will coexist with flat files, claims extracts, registries, vendor exports, queues, and heroic spreadsheets maintained by people nobody remembers until they resign. Real architecture begins from that mess.

The practical answer is not purity. It is visible distortion.

Provenance has to become a first-class design requirement. A feature should know its source system, workflow origin, transformation lineage, terminology mapping, timestamp semantics, version history, known exclusions, and intended use. If a variable cannot explain where it came from and what it is allowed to mean, it should not quietly guide clinical action.

Validation must be stratified: by site, population, workflow, time period, data source, and clinical setting. A high average score can hide a bad subgroup result the way a smooth pond can hide a submerged machine. Monitoring must include alert burden, override patterns, downstream interventions, documentation changes, access disparities, and harm after deployment.

Healthcare AI also needs uncertainty contracts. A system must distinguish "I do not know" from "the value is missing," "the value is contradictory," "the patient is unlike the training population," and "the prediction is uncertain but urgent." Confidence is cheap. Calibrated humility is expensive.

Do not let AI teams build directly on flattened enterprise data without semantic review. That review should include clinicians, informaticists, integration engineers, terminology specialists, data architects, privacy experts, and people who know how care is actually documented in the sites involved. Someone must ask whether absence means no disease, no test, no access, no interface, no permission, or no money. Someone must ask whether an apparently predictive feature is just an administrative scar.

Procurement has to grow up too. Be wary of products that sell performance without lineage, explainability without semantics, and integration without workflow accountability. A model may have performed well elsewhere and still fail locally because the local representation of care is different.

The deeper truth is that AI exposes what healthcare IT has long hidden with interfaces, extracts, committees, and hope. Our systems do not merely store clinical facts. They encode who gets measured, who gets coded carefully, who gets specialist access, who gets time, who is summarized, who is ignored, and who disappears into "other." AI does not float above that structure. It accelerates it.

Healthcare AI can still be useful. It can surface risk, reduce clerical burden, support coordination, improve trial matching, detect inconsistency, and make fragmented information less hostile to human attention. But it has to be built as clinical infrastructure, not as magic varnish.

The future pitfall is not that healthcare AI becomes too intelligent. The pitfall is that it becomes intelligent enough to inherit broken representations, obedient enough to optimize shallow objectives, persuasive enough to conceal uncertainty, and profitable enough that people stop asking whether the thing being optimized was ever worth optimizing.

P.S. References: For current governance and lifecycle context, see FDA's AI-enabled medical-device material, the good machine learning practice principles, ONC's HTI-1 rule, and WHO guidance for AI in health: [FDA AI medical devices](https://www.fda.gov/medical-devices/software-medical-device-samd/artificial-intelligence-enabled-medical-devices), [FDA GMLP principles](https://www.fda.gov/medical-devices/software-medical-device-samd/good-machine-learning-practice-medical-device-development-guiding-principles), [ONC HTI-1](https://healthit.gov/regulations/hti-rules/hti-1-final-rule/), [WHO AI health ethics](https://www.who.int/publications/i/item/9789240029200).
