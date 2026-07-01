---
title: "Kenneth Arrow and the Healthcare Data Problem"
description: "A Calcutta-grounded essay on Kenneth Arrow's uncertainty argument, why healthcare resists ordinary market logic, and what that means for EHR data, interoperability, and AI systems."
date: "2026-04-26"
thumbnail: "/images/IMG-20260426-WA0008.jpg"
category: "Healthcare-IT"
tags: ["Healthcare IT", "Health Economics", "Kenneth Arrow", "EHR", "FHIR", "HL7", "Clinical Informatics", "AI Governance", "SuvroGhosh"]
published: true
color: "blue"
---

<TTS />

<Pi src="IMG-20260426-WA0008.jpg" alt="Article illustration for Kenneth Arrow and healthcare data uncertainty" />

The waiting room fan turns slowly, as if even the air has to negotiate permission before moving.

That is where Kenneth Arrow still feels modern to me. Not in the polished lecture hall version of health economics, but in the ordinary room where a patient sits with a file, a bill, a half-understood instruction, and the dull knowledge that the person selling knowledge knows vastly more than the person buying it. Arrow's 1963 essay, "Uncertainty and the Welfare Economics of Medical Care," explained why medical care does not behave like a normal market with white coats attached.

The patient is not shopping for a toaster.

The patient is frightened, time-poor, physiologically exposed, and dependent on professional judgment. The doctor may recommend the service, perform the service, document the service, and help determine what the payer later sees. That does not automatically imply corruption. It implies structural asymmetry. Healthcare markets are full of missing knowledge, delayed outcomes, trust, regulation, ethics, insurance, professional licensing, and institutions created because the tidy market story breaks under illness.

This matters directly to Healthcare IT.

An Electronic Health Record, or EHR, does not capture a clean photograph of reality. It captures reality after it has passed through workflow, coding, reimbursement, local templates, clinical uncertainty, staff habit, liability fear, and the pressure to finish work before the day collapses. A diagnosis code may mean confirmed disease, suspicion, billing necessity, historical baggage, or a copied item nobody has had time to challenge. The field looks clean. The meaning may be muddy.

Arrow's insight becomes a data architecture warning: uncertainty does not disappear when it enters software. It changes costume.

HL7 v2 can move messages. FHIR can expose resources through web-style APIs. CDA can package clinical summaries. SQL can query warehouses. None of these, by themselves, can say whether a clinical assertion is active, provisional, inherited, patient-reported, billing-derived, or contradicted by a later note. Transport says the packet arrived. Meaning asks whether the packet deserves trust.

This is why so many "data quality" problems in healthcare are really representation problems. A missing lab result may mean the test was not ordered, performed outside the network, blocked by cost, delayed in an interface queue, buried in a scanned document, or irrelevant to the visit. Those are different facts. If they all become the same null value, the database has not become neutral. It has become forgetful in a very specific way.

AI makes this more dangerous because it scales old ambiguity with new speed.

A readmission model may learn hospital discharge habits as much as patient risk. A risk score may confuse poor access with lower disease burden because people outside the system produce fewer data points. A summarizer may turn a vague note into a fluent vague note and give it the smoothness of certainty. The problem is not that computation is useless. The problem is that computation built on malformed representation becomes a fast machine for repeating institutional confusion.

The architectural answer is not theatrical pessimism. It is layered honesty.

Healthcare data systems should preserve provenance: where a fact came from, who asserted it, when, under what workflow, and for what purpose. They should distinguish clinical assertion from billing classification, source value from mapped value, patient report from clinician confirmation, and current state from historical residue. Time should be a first-class design object, not a reluctant timestamp named `updated_date`.

Terminologies matter too. SNOMED CT, LOINC, ICD, RxNorm, and local code systems do different jobs. They are not interchangeable simply because all of them contain codes. Mapping between them is not a clerical act. It is a clinical and organizational claim that should carry confidence, context, and limits.

The quiet lesson from Arrow is that healthcare institutions exist partly because patients cannot possess the knowledge they need at the moment they need it. The quiet lesson for Healthcare IT is similar. Downstream users cannot safely possess the meaning they need unless the upstream system preserved it.

Before asking whether a system can predict, exchange, summarize, or automate, ask what uncertainty it has already hidden. A normal market can survive a bad product review. A healthcare system can bury ambiguity inside a clean field, pass it across an interface, train a model on it, and send it back to the bedside as advice.

That is not merely a software defect. It is Arrow's world, digitized under a slow fan.

P.S. References: Kenneth J. Arrow, "Uncertainty and the Welfare Economics of Medical Care," The American Economic Review, 1963.
