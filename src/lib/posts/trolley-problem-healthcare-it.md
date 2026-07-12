---
title: "The Trolley Problem Is Already Hiding in Healthcare"
description: "Healthcare does not wait for a dramatic philosopher with a lever. It quietly moves risk through queues, dashboards, alerts, codes, claims, models, and policies until moral choice looks like normal workflow."
date: "2026-05-29"
thumbnail: "/images/Compress_20260529_135024_4353.jpg"
category: "Healthcare IT"
tags: ["Sees No-Show","Data Exchange","Research Data","Trolley Problem","Representation Failure","Trolley","Healthcare","Clinical","Model","Patient"]
published: true
color: "black"
---

<TTS />

<Pi src="Compress_20260529_135024_4353.jpg" />

Acronyms used in this post:

EHR: Electronic Health Record, the clinical software system where patient care is documented, ordered, measured, billed, and later misremembered by other systems as clean reality.

AI: Artificial Intelligence, software that can classify, predict, recommend, summarize, or automate tasks that look intelligent from a distance and occasionally look suspicious when you stand nearby with a torch.

HL7: Health Level Seven, a family of healthcare data exchange standards used to move clinical and administrative information between systems.

HL7 v2: Health Level Seven version 2, the old but still heavily used messaging standard that sends hospital events such as admissions, lab results, orders, and discharges between systems.

FHIR: Fast Healthcare Interoperability Resources, a modern healthcare data standard that represents clinical information as smaller web-friendly resources.

API: Application Programming Interface, a defined way for one software system to talk to another without both systems needing to share a childhood.

CDS: Clinical Decision Support, software logic that gives clinicians alerts, reminders, warnings, recommendations, or nudges while they are trying to care for patients and not lose their minds.

CDA: Clinical Document Architecture, an HL7 document standard that can carry both human-readable clinical narrative and machine-readable structured data.

CDISC: Clinical Data Interchange Standards Consortium, a standards organization that defines how clinical research data should be organized and exchanged.

SDTM: Study Data Tabulation Model, a CDISC structure used to organize clinical trial data for regulatory submission.

AUROC: Area Under the Receiver Operating Characteristic Curve, a model performance measure that says how well a prediction model separates two groups across thresholds, but says less about whether the model behaves sensibly in a real clinic on a wet Tuesday.

---

The trolley problem in healthcare is not waiting in a philosophy classroom; it is already sitting inside the hospital software, wearing office shoes, eating a biscuit, and pretending it is just workflow.

That is the nasty little secret.

The famous puzzle is simple. A runaway trolley is heading toward five people. You can pull a lever and divert it toward one person. Do you pull it? Do you refuse? Are you saving five lives or choosing one death? Philosophy professors have dined out on this for decades, and fair enough. It is a good puzzle. Neat. Clean. Almost too clean, like a freshly mopped floor in a government office just before someone slips on it.

Healthcare is not clean like that.

Healthcare does not give you one lever. It gives you admission rules, insurance approvals, staff shortages, bed queues, alert thresholds, coding systems, risk scores, registry definitions, discharge targets, lab turnaround times, and a screen with twelve tabs, eight warnings, and one button labeled “Accept.” Nobody is standing there heroically with a hand on a brass lever. The lever has been broken into a thousand small plastic switches and distributed among committees, vendors, clinicians, analysts, payers, managers, engineers, and exhausted human beings trying to finish lunch before 4 p.m.

That is where the horror begins.

The trolley problem becomes macabre in healthcare because the moral choice often disappears into implementation. A queue moves one patient forward and another backward. A model calls one patient high risk and leaves another invisible. A payer rule delays one treatment to protect a budget. A hospital dashboard makes one metric glow red while a quieter human problem remains off-screen, like a mosquito humming in the corner at midnight.

Nobody says, “Let us move suffering from here to there.”

They say, “The system requires prior authorization.”

They say, “The patient did not meet criteria.”

They say, “The data quality is poor.”

They say, “The model is performing within acceptable range.”

Such polite sentences. Such well-combed little monsters.

The ordinary trolley problem asks what one person should do when forced to choose. Healthcare asks something darker: what happens when no single person feels they chose, yet the system chooses anyway?

Take the hospital queue. A patient with chest pain comes in. Another patient has sepsis risk. Another is old, confused, and silent. Another has a dramatic complaint, a loud family, and better words. The queue is not merely a list. It is a moral instrument. It decides whose time is expensive and whose time is cheap. In a perfect world, this would be based on clinical urgency alone. In our world, which is less like a laboratory and more like Sealdah station during a power cut, urgency must pass through noise, staffing, data entry, human judgment, bed availability, insurance status, language, class, fear, and the ancient social talent of being noticed.

The EHR records pieces of this drama, not the drama itself.

It records arrival time, triage category, diagnosis codes, orders, medications, results, notes, discharge status. It may not record that the patient was too frightened to explain clearly, or that the daughter had to leave for work, or that the nurse saw something worrying but had six other tasks pressing like creditors at the door.

Then later, the data travels.

This is where healthcare IT people must be honest. Transport is not meaning.

HL7 v2 can move a lab result from one system to another. FHIR can represent a blood pressure, a medication request, a diagnosis, a procedure, a patient, a visit. APIs can make systems talk more cleanly than the old plumbing. Good. Necessary. I have spent enough of my life with healthcare data to know that moving the message is hard and often thankless work, like repairing a ceiling fan while the family complains it is still hot.

But moving a message does not mean moving the meaning.

A lab result may arrive perfectly and still be misunderstood. A diagnosis code may be valid and still not mean what the next system thinks it means. A missed appointment may be recorded accurately and still be morally misread.

The system sees “no-show.”

The story may be: no money for transport, no one to watch the child, depression, heat, rain, panic, lost wages, a broken phone, a clinic too far away, or just the quiet collapse of a person who has been asked by life to perform miracles on a bus fare.

But the database sees no-show.

Then the risk model sees no-show.

Then the care program sees non-adherence.

Then the patient becomes a category.

See the trolley now?

It did not arrive with dramatic music. It arrived as a field in a table.

This is why many so-called data quality problems are not merely data quality problems. That phrase is often too small, like trying to cover a leaking roof with a handkerchief.

Yes, healthcare data can be wrong. It can be duplicated, stale, contradictory, misspelled, miscoded, copied forward, badly mapped, half-entered, and occasionally as trustworthy as a street-corner prediction about next week’s politics. But sometimes the data is faithfully recording a broken process. The data is not dirty because a clerk was careless. The data is messy because care itself moved through messy human machinery.

A representation failure is different from a data quality failure.

Bad data says the blood pressure was entered as 1200/80.

Representation failure says the blood pressure was 160/95, but it was taken while the patient was in pain, terrified, and waiting for news, and downstream systems treat it as a stable sign of ordinary hypertension.

Bad data says a diagnosis is missing.

Representation failure says the diagnosis exists as a billing code, a clinical suspicion, a rule-out note, a copied problem list item, a patient-reported history, and a consultant’s half-committed sentence, all wearing the same little hat called “Condition.”

Bad data is a typo in the recipe.

Representation failure is when the recipe says “add spice” and no one knows whether it means salt, chili, cumin, or the cook’s private revenge.

Healthcare AI did not invent this problem. It inherited it, polished it, scaled it, and gave it a dashboard.

A model trained on old clinical data learns the shape of old care. That includes good medicine, bad access, billing artifacts, social inequality, local habits, coding fashion, missing histories, and all the tiny compromises that make production healthcare possible. The model does not know these are compromises. It sees patterns. It is a very obedient student, which is sometimes the worst kind.

If rich patients generate more data, the model may “see” them better.

If poor patients appear late in the system, the model may learn late suffering as normal.

If a disease is underdiagnosed in one group, the model may learn that the group is lower risk.

If clinicians document one population more thoroughly because the institution has historically paid more attention to them, the model may confuse attention with illness.

This is not always villainy. That would be easier. Villains can be named, denounced, and, in a satisfactory film, pushed into a vat. The real villain here is more slippery. It is the false belief that data is reality because it is stored in rows.

Healthcare data is not reality. It is the shadow reality leaves after passing through workflow.

And workflows have politics, budgets, exhaustion, incentives, habits, and weather.

Yes, weather. Ask any ordinary middle-aged man in the far edges of Kolkata in May, trying to work with one fan, one unstable income, and one brain that occasionally behaves like a badly governed municipality. Heat changes attention. Anxiety changes speech. Poverty changes timing. A patient’s body enters the clinic, but so does the bus route, the employer, the family, the electricity bill, the shame, the fear, the heat, the price of medicines, and the doctor’s available seven minutes.

The system rarely captures all that.

Then it pretends absence is neutrality.

That is a dangerous little trick.

CDS gives us a good example. Suppose a hospital builds a sepsis alert. If the threshold is too sensitive, clinicians are flooded with alerts. After a while, the alert becomes background noise. It is the software equivalent of a neighbor’s pressure cooker whistle: at first alarming, then ordinary, then invisible. If the threshold is too strict, fewer alerts fire, but some sick patients may be missed.

So what is the correct threshold?

There is no innocent answer. One setting protects attention but risks missing cases. Another protects sensitivity but drains attention from other patients. Somewhere inside that threshold is a trolley problem wearing a laboratory coat.

Now imagine this repeated everywhere.

A bed algorithm.

A transplant list.

A referral rule.

A chemotherapy approval pathway.

A diabetic registry.

A readmission score.

A mental health triage line.

A discharge prediction model.

A claim denial.

A clinic scheduling template.

Each one looks technical from nearby. Step back, and you see a map of distributed moral choice.

This does not mean we should throw away automation and go back to paper, heroic memory, and fax machines, those beige fossils of administrative suffering. That would be romantic foolishness. Modern healthcare cannot function without standards, systems, alerts, registries, data exchange, analytics, and, increasingly, AI. The old days were not golden. They were often illegible.

But the new days have their own danger. They can make cruelty look clean.

Prior authorization is the most obvious example. On paper it is cost control, evidence management, policy enforcement. In the patient’s life it may become delay, pain, appeal, confusion, and the low-grade humiliation of proving you are sick enough in the correct administrative dialect. No one says, “Let this person suffer so the pool of money survives.” The letter says documentation insufficient.

A miracle of tone.

Population health has a gentler face, but the trolley is there too. A health system identifies high-risk patients and assigns outreach resources. This can do real good. But models favor patients who already have data. The person who has visited often, been coded often, tested often, measured often, becomes visible. The person outside the system, or half-inside it, or poor enough to ration care, becomes dim. Not because the system hates him. Because the system cannot see him properly.

Blindness then dresses up as objectivity.

Research data has its own version. CDISC and SDTM bring order to clinical trial data, and order is not a small thing. Without standards, research data becomes a cupboard full of unlabeled jars, one of which may contain sugar and another possibly old pesticide. But every standard compresses reality. It decides what counts, what gets named, what becomes a variable, what becomes missing, what becomes a deviation, and what disappears into narrative.

CDA showed this tension nicely. Human narrative could say the patient declined after his wife died, stopped eating properly, fell twice, and became afraid of bathing alone. The structured section might say fall risk. The quality measure might say intervention complete. The dashboard might say green.

Green is a very cheerful color for half a truth.

FHIR improves the mechanics. It gives us better shapes for data exchange. It helps systems talk in smaller, cleaner pieces. But FHIR does not solve meaning by itself. A beautifully structured misunderstanding is still a misunderstanding. It just travels faster and looks better in documentation.

So what should healthcare architects, engineers, analysts, informaticists, and leaders do?

First, stop pretending ethics begins after design. In healthcare, ethics is not an extra committee meeting at the end, with tea and a PDF. Ethics is inside the queue, the field, the threshold, the mapping, the alert, the workflow, the rule, the exception path.

Ask simple, rude questions early.

Who becomes visible?

Who becomes invisible?

Who waits?

Who gets interrupted?

Who gets denied?

Who carries the uncertainty?

Who gets blamed when the system is wrong?

Second, preserve provenance. Do not merely store the fact. Store where it came from, who asserted it, when it was true, when it was recorded, what workflow produced it, and what transformations touched it. A diagnosis copied forward for billing should not be treated exactly like a fresh specialist assessment. A patient-reported allergy should not be treated exactly like a confirmed anaphylactic reaction. A late lab result should not be treated as if it existed at the moment the clinician made the decision.

Time matters.

Source matters.

Workflow matters.

Without those, the system becomes a gossiping auntie with a database.

Third, make overrides real. “Human in the loop” is one of those phrases that sounds reassuring until you ask which human and what loop. A tired clinician clicking through twelve alerts is not meaningful oversight. A nurse who knows the patient is deteriorating but cannot get the system to escalate is not empowered. An override buried under six clicks, audited suspiciously, and punished through productivity metrics is not an override. It is decorative democracy.

Fourth, evaluate consequences, not just model scores. AUROC may look splendid in a report. It may still produce nonsense in a clinic if it overwhelms staff, misses silent patients, worsens disparities, or shifts work to people who already have too much of it. A model can be statistically impressive and operationally foolish. This happens more often than vendors put in brochures, which is a sentence that will surprise no one who has ever attended a software demo and then used the software.

The clean solution does not exist. That is the uncomfortable part.

Legacy systems remain. Reimbursement distorts documentation. Regulation imposes categories. Vendors protect roadmaps. Hospitals protect revenue. Clinicians protect time. Patients move across fragmented systems. Interfaces carry old assumptions like old houses carry damp. One cannot simply declare a new moral architecture and watch the old one politely vanish.

Real architecture is repair under constraint.

You keep the system running.

You reduce harm.

You expose hidden tradeoffs.

You stop calling every representation problem “bad data.”

You stop pretending transport is meaning.

You stop letting dashboards turn human pain into tidy colors without asking what got lost on the way.

The trolley problem in healthcare is not a future robot deciding whom to kill. It is not a science fiction scene with chrome walls and ominous music. It is already here, in ordinary clothes.

A queue.

A score.

A rule.

A delay.

A missing field.

A green dashboard.

A denied claim.

A patient waiting.

That is the thing about the trolley. In healthcare, you often do not hear it coming.

You only notice when someone has already been moved onto the track.
