---
title: "AI Health Insurance and Cruelty"
description: "The risk is not only that insurers openly use AI to punish expensive patients. It is that incentives, weak oversight, and deniable technical systems can quietly turn prediction into exclusion."
thumbnail: "/images/IMG-20260424-WA0001.jpg"
date: "2026-04-24"
category: "Healthcare AI"
tags: ["Healthcare AI", "Health Insurance", "Artificial Intelligence", "Risk Scoring", "Claims", "Fairness", "Healthcare IT", "Data Governance", "Calcutta Essay", "SuvroGhosh"]
published: true
color: "indigo"
---

<TTS />

<Pi src="IMG-20260424-WA0001.jpg" />

The denial letter never smells of cruelty. It smells of printer ink, legal caution, and office air. The language is calm. The reason is procedural. The document does not raise its voice. That is one of the old tricks of administrative harm: by the time it reaches the person, it has learned manners.

AI in health insurance should be judged from that point of view. Not from the demo. Not from the vendor promise. Not from the sentence about efficiency. From the counter where a patient is told to produce another document, make another call, wait another week, or accept that the system has found a more elegant way to say no.

The central risk is not simply that an insurer announces an artificial intelligence system that punishes expensive people. Few organizations are foolish enough to describe the machine so plainly. The more likely danger is quieter. A model estimates future cost. Another system ranks cases. A workflow adds scrutiny. A queue becomes slower. A request needs extra documentation. A claim is more likely to be reviewed. An appeal becomes exhausting. No single step says, "exclude this person." The whole architecture says it softly.

Insurance is already a business of sorting risk. AI does not invent that impulse. It scales it, hides it, and gives it a technical accent.

The problem begins with incentives. An insurer has reasons to manage cost, detect fraud, reduce administrative burden, predict future claims, and preserve margin. In regulated markets, some uses of health status, disability, and other sensitive factors may be restricted or prohibited. But institutions often learn to act through substitutes. If one path is blocked, pressure moves into another path: prior authorization, utilization management, network design, retention strategy, call-center routing, fraud scoring, documentation burden, or "engagement" programs that sound helpful while selecting for the people easiest to help.

The danger is not always conspiracy. Often it is modular greed. One team builds a cost model. One team tunes a review workflow. One team manages appeals. One team checks compliance boxes. One vendor optimizes payment integrity. One dashboard celebrates savings. No individual has to feel monstrous. The machine can distribute the moral discomfort until nobody owns enough of it to lose sleep.

That is where AI becomes useful to the institutional imagination. It can find patterns in claims, pharmacy behavior, provider choice, payment timing, location, call-center interactions, app usage, missed appointments, and other health-adjacent traces. Some of these signals may be clinically or operationally relevant. Some may be proxies for poverty, disability, language barriers, geography, transport problems, unstable work, or previous bad treatment by the system. The model does not know the moral difference unless the organization forces the difference to matter.

Transport is not meaning. A data pipeline can be technically clean and ethically rotten. A record that a prescription was not filled may mean refusal, recovery, cost, pharmacy stockout, confusion, distance, or a broken phone number. A missed appointment may mean indifference, but it may also mean shift work, caregiving, transport failure, fear, or a clinic that never called back in a language the person understood. The machine will usually choose the interpretation that best serves the objective it was given.

That is why fairness testing only at the final decision point is inadequate. Burden can be distributed long before the formal denial. Who gets more documentation requests? Who waits longer? Who is routed to manual review? Who receives fewer proactive calls? Who abandons an appeal because the process is too tiring? Who sees the same form returned three times for minor reasons? These are not small administrative details. They are how exclusion can operate without saying its name.

"Human in the loop" is not enough either. A reviewer staring at a ranked queue, under throughput pressure, with limited visibility into the score's source, is not a fully sovereign judge. That human may function as a rubber stamp with a heartbeat. The signature is real. The freedom may be less real.

For healthcare IT architects, the object of scrutiny cannot be only the final claim decision. The whole adverse-decision pipeline has to be mapped. Which sources enter the model? Which variables are inferred? Which scores feed later scores? Which thresholds trigger friction? Which vendor systems sit inside the path? Which decisions are logged? Which explanations can actually be given to the affected person? Which appeal can challenge not only the fact, but the inference?

Provenance is not decoration here. It is the difference between accountability and theater.

There are also uses that should not be softened into technical debate. Not everything that can be inferred should be used. A prediction whose commercial value comes from identifying expensive, fragile, or less powerful people is dangerous precisely because it is useful. Technical culture often mistakes computability for legitimacy. Insurance gives that mistake a very sharp edge.

The better governance principle is consequence-based. A model that directly changes price and a model that indirectly pushes costly members into harsher workflows can be morally related even if they sit in different departments. Calling one "pricing" and the other "operations" should not exempt the second from scrutiny.

Proxy analysis must be an engineering discipline, not a legal footnote. If geography, digital behavior, provider choice, claim history, payment irregularity, language pattern, or care gaps function as stand-ins for protected or vulnerable status, then the system is not clean merely because nobody typed the forbidden category into the feature list.

Explanations must be built for the affected person, not only for an audit binder. A patient should be able to understand why a case was flagged, which information mattered, what can be corrected, what can be challenged, and who is accountable for the decision path. If the system cannot explain itself in usable language, it may be too opaque for consequential use.

This is not an argument that all insurance AI is evil. Fraud detection, administrative simplification, care navigation, error spotting, and claim consistency can be legitimate goals. But legitimacy depends on objective, design, oversight, contestability, and the distribution of burden. A tool that saves money by reducing clerical duplication is one thing. A tool that saves money by making expensive lives harder to carry is another.

The cruelty of such systems, if it arrives, will rarely look theatrical. It will look like delay. It will look like missing context. It will look like "please resubmit." It will look like a model score nobody can see and a decision nobody can fully explain. It will look like a person in a small room in Calcutta, already tired, listening to hold music while a machine somewhere has decided they are a bad bet.

P.S. References: The NAIC's AI insurance materials and model bulletin are useful for the governance frame, especially around documentation, risk management, and unfair discrimination. WHO's AI health guidance is also useful for the wider health-ethics context: [NAIC AI topic page](https://content.naic.org/insurance-topics/artificial-intelligence), [NAIC model bulletin PDF](https://content.naic.org/sites/default/files/cmte-h-big-data-artificial-intelligence-wg-ai-model-bulletin.pdf.pdf), [WHO AI health ethics](https://www.who.int/publications/i/item/9789240029200).
