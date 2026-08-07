---
title: "The Trolley Problem Is In The Healthcare Queue"
description: "How healthcare embeds moral choices in queues, alerts, claims, risk models, prior authorization, codes, and ordinary workflow."
date: "2026-05-29"
dateModified: "2026-08-07"
category: "Healthcare-IT"
tags: ["Prior Authorization","Moral Crumple Zone","Population Health","Decision Support","Morally Neutral","Lever","Trolley","Clinician","Patient","Authorization"]
published: true
color: "black"
thumbnail: "/thumbnail/art-the-trolley-problem-is-already-hiding-in-healthcare.jpg"
thumbnailAlt: "Calcutta hospital queue routed toward two care rooms by a clerk's brass lever"
inPlainEnglish: "Healthcare systems make moral choices whenever they rank queues, trigger alerts, approve claims, allocate staff, or label risk. Software can hide those choices inside ordinary workflow, but the consequences still fall on patients and the people asked to act on the system's output."
keyTerms: ["Clinical Ethics", "Prior Authorization", "Decision Support", "Risk Model", "Resource Allocation", "Moral Crumple Zone", "Clinical Workflow", "Accountability"]
faq:
  - question: "Where does the trolley problem appear in healthcare?"
    answer: "It appears whenever limited time, money, beds, staff, or attention are allocated through queues, triage rules, risk scores, alerts, claims, and authorization workflows."
  - question: "Can a healthcare algorithm be morally neutral?"
    answer: "No. Its objective, thresholds, data, exclusions, and workflow placement distribute benefits and burdens, even when the interface presents the result as a technical fact."
  - question: "What is a moral crumple zone in clinical technology?"
    answer: "It is a situation where a frontline clinician or worker absorbs blame for a failure produced by a wider system of policy, software, incentives, and constrained choices."
---

<TTS />

<Pi src="/thumbnail/art-the-trolley-problem-is-already-hiding-in-healthcare.jpg" />

## The Lever Became A Queue

The queue outside a Calcutta diagnostic centre forms before the shutters are fully open. A man presses old reports flat against his chest. A woman guards a plastic folder from the damp air. Someone argues at the billing counter about whether the approval has arrived. The security guard lifts one hand, not cruelly, not kindly, just as a person who has been asked to make scarcity look orderly.

There is no railway track here. No philosopher stands beside a lever. No clean moral diagram appears on the wall. There is only a line, a token number, a counter, a software screen, a coverage rule, a doctor running late, a scanner booked past noon, and the quiet knowledge that some people will be seen soon and some will wait.

This is where the trolley problem lives in healthcare.

Not as drama. Not as a classroom puzzle. As workflow.

Philippa Foot introduced the trolley problem in 1967, and Judith Jarvis Thomson later complicated it into the version many students inherit: a runaway trolley, five people on one track, one person on the other, a lever, a choice. Pull and one is harmed. Do nothing and five are harmed. The thought experiment is deliberately stripped down so the moral structure becomes visible.

Healthcare does the opposite.

It adds forms, queues, codes, alerts, risk scores, payer policies, EHR screens, FHIR resources, HL7 messages, care gaps, staffing models, dashboards, and automated rules until the moral structure disappears inside procedure. The lever is still there. It has simply been divided into a thousand smaller levers and hidden inside ordinary work.

## What It Means When Nobody Calls It Ethics

The trolley problem is not really about trolleys. It is about forced choice under scarcity, uncertainty, and time pressure. It asks what happens when not everyone can receive the same chance at the same moment.

Healthcare asks that question every day.

Who gets the bed?

Who gets called first?

Who gets the scan today and who returns next week?

Which alert interrupts the clinician and which one stays quiet?

Which prior authorization request is approved quickly and which one becomes a slow paperwork ritual?

Which patient is labeled high risk by a model and routed to a care manager?

Which patient is missing from the model because the data never captured the barriers around their life?

The system often speaks about these choices in neutral language. Capacity. Throughput. Eligibility. Utilization. Quality. Cost control. Medical necessity. Population health. Risk adjustment. Operational efficiency.

Those words are not fake. They describe real constraints. A healthcare system with finite rooms, finite staff, finite money, finite time, and finite attention must allocate. There is no escape from allocation.

The problem begins when allocation stops being visible as a moral act.

When a decision looks like a rule, the rule looks innocent. When a denial looks like a code, the code looks innocent. When a delay looks like backlog, the backlog looks innocent. When a risk score looks like math, the math looks innocent.

Patients do not experience innocence. They experience waiting.

## Who Pulls The Lever

The answer is uncomfortable because the answer is everyone and no one.

The triage nurse pulls it when assigning acuity in the emergency department. The Emergency Severity Index and local triage protocols are meant to protect the sickest first, and often they do. But triage is still a moral compression of a human being into a priority level. A number can save time. It can also hide uncertainty.

The clinical informaticist pulls it when configuring Clinical Decision Support inside the Electronic Health Record. Should an alert be interruptive or passive? Should it be a hard stop or a suggestion? At what threshold does a lab value become urgent? How many warnings can a clinician see before alert fatigue turns every warning into background noise?

The data scientist pulls it when building a population health model from claims, encounters, labs, and historical patterns. The model may predict who is likely to need more help. It may also inherit the blind spots of the system that produced the data. A patient who rarely received care may look inexpensive. A neighborhood with poor access may look quiet. Absence in the data can masquerade as low need.

The administrator pulls it when reviewing bed occupancy, staffing ratios, payer mix, referral leakage, length of stay, and operating margin. The decision may be framed as capacity planning. The effect may be that one service line grows while another waits, one unit gets staff while another absorbs strain, one group of patients becomes strategically attractive while another becomes financially inconvenient.

The payer pulls it through prior authorization, formulary design, network rules, claims edits, and policy criteria. These tools are often defended as ways to prevent waste and standardize evidence-based care. They can also delay care, exhaust clinicians, and convert a patient's need into an adversarial documentation contest.

The vendor pulls it when deciding how the interface behaves. A default value is not morally neutral. A button placement is not morally neutral. A warning color is not morally neutral. A workflow that makes the easy action the restrictive action has already made part of the decision.

The patient feels the lever most directly and sees it least clearly.

## How The Tracks Were Built

Healthcare has always made hard choices, but the tracks changed as the system industrialized.

Older care was constrained by direct scarcity: the available physician, the available bed, the available remedy, the available charity. The modern hospital introduced bureaucratic and technical scale. In the nineteenth and twentieth centuries, hospitals became organized institutions with departments, schedules, records, supply chains, professional roles, and increasingly standardized practice.

Operations research and systems analysis brought the language of flows, queues, capacity, and optimization. These tools were useful. A badly run system harms people. But the moment a patient becomes a unit in a flow model, the moral question does not vanish. It changes clothes.

The late twentieth century brought computerized records, billing systems, expert systems, and early decision support. HL7 made it possible for systems to exchange clinical messages. EHRs moved the chart into software and then placed software between nearly every clinician and nearly every patient. ICD codes, procedure codes, order sets, structured fields, and templates turned care into computable fragments.

FHIR later made healthcare data more web-native and API-accessible. Patient, Observation, Condition, DiagnosticReport, Coverage, Claim, and related resources made interoperability feel less like a private dialect and more like a shared grammar. This was progress.

But a shared grammar does not decide what is just.

The 2010s added machine learning and predictive analytics at scale. Readmission models, sepsis models, care-gap models, risk stratification, natural language processing, computer vision, and automated outreach all promised earlier detection and better allocation. Some of that promise is real. Some of it is fragile. All of it embeds values.

By the 2020s, healthcare had created a technical environment where decisions could move faster than accountability. A rule can be copied across sites. A model can score thousands of patients overnight. A denial can be generated before a human has fully understood the story. A dashboard can turn suffering into a color-coded queue.

The tracks were not laid by one villain. They were laid by many reasonable decisions, stacked over decades.

That is why they are so difficult to see.

## Where It Hides

It hides in the emergency department queue, where an acuity score decides who waits and who moves. The score may be necessary. The waiting is still real.

It hides in prior authorization, where care can become a negotiation between clinical judgment and policy logic. The delay may be documented as process time. To the patient, it is time taken from the body.

It hides in Clinical Decision Support, where alert thresholds define when the system interrupts a clinician. Too few alerts, and danger may be missed. Too many, and the important alerts dissolve into noise.

It hides in population health dashboards, where high-risk lists determine outreach. A person with rich data may be visible. A person with fragmented data may be absent. The system may then call visibility "need."

It hides in interoperability gaps, where one EHR cannot see what another system knows. HL7 messages may fail. FHIR resources may not resolve. Identity matching may break. A pharmacy, clinic, hospital, and insurer may each hold part of the story, while the patient carries the consequences of fragmentation.

It hides in bed management, discharge planning, referral routing, call-center scripts, scheduling templates, claims adjudication, quality measures, and the small cruel arithmetic of appointment slots.

It hides in the phrase "the system will not allow it."

That phrase should frighten us more than it does.

## The Moral Crumple Zone

The philosopher Evan Selinger has used the phrase "moral crumple zone" to describe how humans absorb blame when automated or complex systems fail. Healthcare is full of these crumple zones.

When an alert is missed, the clinician is questioned. The alert environment that trained the clinician to dismiss warnings may escape attention.

When a patient waits too long, the person at the desk is blamed. The staffing model, budget constraint, triage configuration, and capacity planning assumptions may remain invisible.

When outreach fails, the patient may be called noncompliant. The model that never captured unstable phone access, language barriers, transport barriers, distrust, or prior exclusion may remain mathematically respectable.

When prior authorization delays care, the clinician and patient carry the frustration. The rule set, benefit design, utilization policy, and automated review system remain abstract.

This is not only unfair to frontline workers. It is dangerous for patients because it directs moral attention to the end of the chain instead of the design of the chain.

Healthcare likes accountability when it can assign accountability to a person.

It is less comfortable assigning accountability to architecture.

## The Technical Stack Of Invisible Choice

The stack begins with the EHR, which stores data and shapes action. It is not only a record. It is an operating environment. It controls order entry, documentation, routing, alerts, reminders, inboxes, note templates, care plans, billing hooks, and reporting.

Below and around it sit databases, terminology systems, identity systems, integration engines, data warehouses, analytics platforms, and audit logs. ICD, CPT, LOINC, SNOMED CT, RxNorm, HL7 v2, CDA, FHIR, DICOM, and local code sets all participate in turning care into computable structure.

CDS engines apply rules and models to that structure. They can prevent errors, standardize care, and surface important risks. They can also enforce brittle pathways, interrupt judgment, or privilege what is measurable over what is meaningful.

FHIR APIs move data through modern application layers. SMART on FHIR apps can bring focused tools into the clinical workflow. This can improve usability and coordination. It can also multiply points where moral assumptions enter: eligibility logic, risk display, default recommendations, ranking, filtering, suppression, escalation.

Predictive models and AI systems sit increasingly above the data layer. They estimate readmission risk, sepsis risk, deterioration risk, no-show probability, outreach priority, denial likelihood, documentation sufficiency, imaging findings, and more. Some are transparent. Some are proprietary. Some are validated carefully. Some are trusted because they are packaged beautifully.

Natural language processing parses notes and letters. Robotic process automation moves data between portals. Claims systems adjudicate. Prior authorization systems match documentation against criteria. Blockchain experiments promise transparency and often add new complexity. Dashboards summarize institutional reality into rows, colors, and thresholds.

None of these technologies is inherently wicked. Many are necessary. Some are genuinely life-saving.

But every one of them can carry a lever.

## Moral Interoperability

Technical interoperability asks whether systems can exchange data.

Semantic interoperability asks whether they mean the same thing by the data.

Healthcare also needs moral interoperability: an honest account of what values travel with the data, rules, models, and workflows.

A FHIR ClaimResponse can communicate a denial. It cannot, by itself, tell us whether the denial is just.

A risk score can be attached to a patient record. It cannot, by itself, tell us whether the score reflects clinical need, historical exclusion, billing intensity, geography, access, or documentation habits.

An alert can fire at a potassium threshold in one system and a different threshold in another. The standard can carry the Observation. It cannot settle which threshold best honors safety, burden, workload, and patient context.

An AI model can rank patients for outreach. It cannot decide whether the scarce outreach resource should prioritize those easiest to reach, those most likely to show measurable improvement, those most neglected by the current system, or those facing the highest immediate risk.

These are not technical questions with moral garnish. They are moral questions implemented through technical choices.

## Standing At The Counter

The old trolley problem has one mercy: everyone can see the lever.

Healthcare rarely gives us that mercy. The lever is hidden in a queue discipline, a prior authorization rule, a database schema, a model threshold, an alert severity, a staffing assumption, a reimbursement policy, a default button, a missing interface, or a code mapping made years ago by someone who never met the patient.

This does not mean healthcare should stop using systems. It means systems should stop pretending that their choices are neutral because they are technical.

The real work is not to abolish allocation. No health system can do that. The real work is to make allocation visible, contestable, auditable, and humane. A patient should not be harmed by a decision nobody is willing to name. A clinician should not absorb the moral impact of architecture they did not design. A vendor should not hide behind usability when the interface has ethical weight. A payer should not call a delay a workflow success. A hospital should not call a dashboard objective when the data beneath it is partial and historical.

Back at the Calcutta counter, the line moves by one person. The guard lifts his hand again. The screen refreshes. A token number appears. Someone exhales. Someone else keeps waiting.

No trolley bell rings.

That is the problem.
