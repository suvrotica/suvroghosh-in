---
title: "The Trolley Problem Is Already Hiding in Healthcare"
description: "Healthcare does not wait for a dramatic philosopher with a lever. It quietly moves risk through queues, dashboards, alerts, codes, claims, models, and policies until moral choice looks like normal workflow."
date: "2026-05-29"
thumbnail: "/images/Compress_20260529_135024_4353.jpg"
category: "Healthcare-IT"
tags: ["Video", "Engineering Blog", "SuvroGhosh", "Healthcare IT", "Healthcare AI", "Clinical Informatics", "Digital Health", "Healthcare Ethics", "Trolley Problem", "Medical Ethics", "EHR", "FHIR", "HL7", "Clinical Decision Support", "CDS", "Interoperability", "Health Data", "Semantic Interoperability", "Health Systems", "Hospital Workflow", "Triage", "Prior Authorization", "Population Health", "Risk Models", "Healthcare Architecture", "Data Governance", "Healthcare Automation", "Algorithmic Bias", "Clinical Workflows", "Health Policy", "Medical Decision Making", "Care Delivery", "Healthcare Systems Thinking", "Health IT Architecture", "Patient Safety", "AI Governance", "Healthcare Data Quality", "Health Analytics", "Ethical AI", "Clinical Risk"]
published: true
color: "black"
---

<TTS />

<Pi src="Compress_20260529_135024_4353.jpg" />

# The Lever That Looks Like a Spreadsheet

Imagine, if your imagination can still tolerate such theatrical simplicity, the philosopher's trolley—a grotesquely heavy, rust-scabbed, almost pornographically industrial contraption from some nineteenth-century nightmare of mechanized progress—hurtling down twin tracks toward five unsuspecting, hypothetically innocent, abstractly miserable human beings who are, in the hallowed tradition of all ethical thought experiments, conveniently bound to the rails by an unseen metaphysical villain with excellent knot-tying skills, a flair for dramatic timing, and presumably far too much leisure time.

You stand at a lever.

Pull it, and the trolley diverts to a siding where one solitary, equally abstract, equally hypothetically innocent person awaits their philosophical doom.

Do nothing, and five perish.

This is the trolley problem, originally formulated by the splendidly rigorous Oxford ethicist Philippa Foot in 1967 and later elaborated, twisted, and tortured into ever more baroque, increasingly absurd, and occasionally darkly hilarious configurations by Judith Jarvis Thomson and by generations of philosophy students who have, at three in the morning in dorm rooms smelling of instant coffee and the particular acrid dread of impending exams, confidently declared what they would do in a situation that precisely zero of them will ever encounter in a form so clean, so mathematically tidy, so blessedly free of prior authorization forms.

But here is the quietly devastating secret that healthcare, in its sprawling, bureaucratic, magnificently complex, and often cruelly indifferent wisdom, has already discovered, internalized, operationalized, and hidden so thoroughly that even the people operating the machinery no longer recognize it for what it is.

The trolley is not coming.

It is already here.

It never needed a philosopher.

It needed a database schema.

And a queue.

And a risk model.

And a prior authorization protocol.

And a clinical decision support alert that fires at 2:47 AM when the attending physician is on hour fourteen of a sixteen-hour shift and the alert is the forty-seventh she has seen that night and her thumb, moving on autopilot through the cognitive fog of exhaustion, dismisses it with a mechanical flick that required no moral deliberation whatsoever because the system, in its infinite, automated, meticulously configured wisdom, has already decided.

---

# What Is It, When Nobody Calls It That?

The trolley problem, stripped of its philosophical finery and its charmingly antique railroad imagery, is nothing more nor less than the formal study of how human beings respond when forced to choose between competing harms under conditions of scarcity, uncertainty, and temporal pressure—it is, at its bruised and beating heart, a question about how we allocate moral weight when we cannot save everyone, when resources are finite, when time is a predator, and when every pathway through the maze of possible action leads to some form of damage, some quantum of suffering, some irreducible loss.

In healthcare, this is not a hypothetical.

It is the Monday morning schedule.

It is the emergency department at 11 PM on a Saturday.

It is the oncology clinic staring at a formulary that covers Drug A but not Drug B, where Drug B offers four months of progression-free survival and Drug A offers two, and the patient in front of you—the real one, not the abstract one, the one with the particular laugh and the daughter who calls every Tuesday and the scar from a childhood surgery that she shows you because she is scared and wants you to see her as a person and not a case—needs one of them, and the system, through its arcane, deliberately opaque, algorithmically mediated, and politically constructed mechanisms of coverage and authorization, has already decided which one she gets.

Or rather, it has decided whether she gets anything at all.

Or whether she gets it now.

Or whether she gets it after the disease has progressed past the window where it might have helped.

Or whether she gets it after she has spent six weeks navigating a labyrinth of phone trees, fax machines (yes, fax machines, in the year of our lord 2026, because healthcare interoperability remains a glorious, magnificent, almost transcendentally stubborn anachronism), appeals, peer-to-peer reviews conducted by physicians who have never met her and never will, and automated denial letters generated by natural language processing systems trained on decades of actuarial data.

This is the trolley problem.

Not dramatic.

Not visible.

Not discussed in ethics committees with the lights low and voices hushed.

Just workflow.

Just a button.

Just a default setting.

Just a risk score that rounded up.

---

# Who Is Pulling the Lever, If Anyone Is?

The cast of characters in this invisible drama is sprawling, distributed, partially automated, and often genuinely unaware of their role in the moral architecture of the system—a fact that is not a bug but rather the essential feature that makes the whole edifice function, because if every person who touched a healthcare decision had to fully absorb the moral weight of every downstream consequence, the system would collapse under the crushing gravity of its own impossible choices, and so instead it distributes agency so thinly, so broadly, so interminably across so many layers of technology and policy and procedure that no single human being can be said to have pulled any lever at all, and yet the trolley continues to divert, to sort, to prioritize, to exclude, to save some and to, through the mathematically necessary logic of resource allocation, not save others.

There is the triage nurse, standing at the threshold of the emergency department, performing that ancient, brutal, magnificently efficient ritual of sorting—*triage*, from the French *trier*, meaning to separate, to select, to sift—who must decide, in seconds, based on vital signs and gut instinct and the particular acoustics of how a patient is breathing, whether the person before them is a one or a five or a three on the Emergency Severity Index, a number that determines how quickly they are seen, which determines what resources they consume, which determines, in the cold arithmetic of a crowded department, what happens to the person who was assigned a four and has been waiting for three hours with chest pain that might be indigestion or might be an incipient myocardial infarction that will bloom into full catastrophic failure while the triage nurse is assigning someone else a two.

There is the clinical informaticist, designing a Clinical Decision Support (CDS) system—software that sits inside the Electronic Health Record (EHR), that vast, sprawling, often maddeningly counterintuitive digital ecosystem that has replaced the paper chart and now mediates virtually every interaction between clinician and patient—who must decide what threshold should trigger an alert, how urgent that alert should appear, whether it should be a hard stop that cannot be overridden or a soft suggestion that can be dismissed with a click, and who knows, with the particular melancholy wisdom of their profession, that every alert they add contributes to the phenomenon of alert fatigue, that cognitive numbness that descends upon clinicians who are bombarded with so many warnings, so many flags, so many brightly colored pop-ups screaming about drug interactions and allergy mismatches and dosing recommendations that they begin to dismiss them all, the critical ones and the trivial ones alike, with the same mechanical flick of the wrist, the same unconscious click, the same learned helplessness in the face of a system that cries wolf so constantly that the wolves have learned to hide in the static.

There is the data scientist, training a population health risk stratification model on historical claims data—data that is, by its very nature, a record of what happened in a system that was already biased, already incomplete, already skewed by who had insurance and who did not, who lived near a hospital and who lived in a food desert forty miles from the nearest specialist, who was believed when they reported pain and who was dismissed as drug-seeking because of the color of their skin or the accent in their voice—and who must choose which features to include, how to weight them, what the cutoff should be for "high risk," knowing that the model will determine who gets the care manager calling them every week, who gets the early intervention, who gets slotted into the precious, limited, fiercely contested pipeline of resources, and who gets left in the algorithmic long tail of moderate risk, the vast undifferentiated middle where people fall through the cracks because they are not quite sick enough to trigger the expensive protocols and not quite healthy enough to need nothing at all.

There is the health system administrator, staring at a dashboard of capacity metrics, bed occupancy rates, staffing ratios, and payer mix data, who must decide whether to divert ambulances to another hospital, whether to cancel elective surgeries to preserve ICU beds for the surging wave of respiratory infections that arrived three weeks early this year, whether to hire more nurses or invest in another robotic surgery suite that will attract the commercially insured patients whose reimbursement rates keep the lights on, whose decisions are framed in the language of operations and finance and strategic planning but whose consequences ripple outward into human lives with the same inexorable, morally freighted logic as any philosopher's trolley.

There is the patient.

Always, inescapably, the patient.

The one who does not know they are on a track.

The one who does not know a lever was pulled.

The one who receives, or does not receive, the drug, the scan, the referral, the call, the slot, the chance—based on decisions made by people they will never meet, in rooms they will never enter, encoded in systems they will never see, filtered through technologies they will never understand, and presented to them, when it is presented at all, as simply the way things are, as neutral, as natural, as inevitable, as the weather.

---

# When Did the Tracks Get Laid?

The embedding of moral calculation into healthcare infrastructure is not new, though the velocity, the invisibility, and the algorithmic sophistication of its contemporary forms would be unrecognizable to the physicians and administrators of even fifty years ago, who made their triage decisions with paper tags and their resource allocations with ledger books and their moral anguish, if they felt it, in private, without the comforting diffusion of responsibility that modern information systems so abundantly provide.

In the ancient and medieval worlds, care was largely a matter of charity, of religious obligation, of the limited but direct application of whatever herbs, surgeries, and prayers were available to whoever presented themselves at the monastery door or the physician's chambers, and while scarcity was absolute and outcomes were often brutal, the moral framework was comparatively simple: you helped who you could, you buried who you couldn't, and God, or the gods, or fate, took the blame for the rest.

The modern hospital, born in the crucible of the Industrial Revolution and the subsequent professionalization of medicine in the nineteenth and early twentieth centuries, introduced something new: the systematic organization of care around efficiency, standardization, and the increasingly scientific management of human bodies as objects of technical intervention, a transformation that reached its apex, or perhaps its nadir, in the mid-twentieth century with the rise of operations research and systems analysis in healthcare management, disciplines that treated patient flows and resource allocation as optimization problems to be solved with the same mathematical rigor applied to factory production lines and military logistics.

The 1960s and 1970s brought the first glimmers of computerized decision-making—early expert systems, rudimentary algorithms for antibiotic selection, the first electronic health records that were little more than digital replicas of paper charts—but the true inflection point arrived in the 1990s and 2000s with the explosive growth of Health Level Seven (HL7), the messaging standard that allowed different healthcare information systems to speak to one another, and its more recent, more elegant, more web-native successor, Fast Healthcare Interoperability Resources (FHIR, pronounced "fire"), which promised, and partially delivered, a world where clinical data could flow seamlessly between hospitals and clinics and pharmacies and insurers and public health agencies, a semantic interoperability that sounds utopian until you realize that what flows through these pipes is not just data but decisions, priorities, exclusions, and the encoded values of the systems that produced them.

The 2010s brought machine learning, predictive analytics, and the rise of risk stratification at scale—algorithms that could ingest millions of patient records and identify, with spooky, seductive, statistically significant accuracy, who was likely to be readmitted, who was likely to develop sepsis, who was likely to cost the system the most money in the coming year—and with them came the subtle but profound shift from reactive to predictive healthcare, from treating the sick to managing populations, from the individual bedside to the aggregate dashboard, a shift that multiplied the points at which trolley-like decisions could be embedded into automated, invisible, and largely unaccountable technical systems.

And now, in the 2020s, we stand at a peculiar moment where the technologies have become so complex, so layered, so interdependent, that the people who design them, the people who implement them, the people who use them, and the people who are subjected to them often inhabit entirely different epistemic universes, speaking languages that barely intersect, operating with assumptions that rarely align, and producing, through their collective but uncoordinated action, a healthcare system that makes moral choices constantly but discusses them rarely, that allocates life and death with the dispassionate regularity of a cron job executing at midnight while the humans sleep.

---

# Where Does It Hide? Everywhere.

To find the trolley problem in contemporary healthcare, you do not need to look for dramatic moments or explicit ethical dilemmas; you need only to follow the data, to trace the pathways of information as they flow through the vast, interconnected, often chaotically assembled architectures of modern health IT, to observe where decisions are made, where they are automated, where they are delegated to algorithms, and where the human beings who remain in the loop have been so thoroughly conditioned by their interfaces, their workflows, their incentive structures, and their cognitive overload that their moral agency has been reduced to a series of clicks, swipes, and autonomic responses.

It hides in the emergency department queue, where the EHR's triage module applies an algorithmically generated acuity score based on vital signs, presenting complaints, and historical data, a score that determines how long you wait, which determines what happens to you, which is influenced by whether the hospital's predictive model has identified this as a high-volume day and staffed accordingly, or not, because the model was wrong, or because the nurses called in sick, or because the budget did not allow for the float pool that the operations team requested six months ago and was denied by the finance committee that was under pressure from the board that was watching the bond rating that was sensitive to the operating margin that was eroded by the payer mix that was determined by the zip codes that surround the hospital.

It hides in the prior authorization workflow, that magnificently Byzantine, deliberately friction-generating, cost-containment mechanism whereby insurers require physicians to obtain approval before prescribing certain medications, ordering certain imaging studies, or performing certain procedures—a process that is nominally about ensuring medical necessity but functionally about delaying expensive care in the hope that some percentage of patients will abandon the pursuit, or die, or improve on their own, or find an alternative, or simply disappear into the cracks of the system, and which is increasingly mediated by automated decision engines that parse clinical notes using natural language processing, match them against policy criteria encoded in decision trees, and generate approvals or denials with a speed and consistency that no human reviewer could match, but also with a rigidity, a brittleness, an inability to see the particular, the exceptional, the human that no human reviewer would have applied to a patient they actually knew.

It hides in the Clinical Decision Support alert that fires when a physician attempts to order a CT scan for a patient with a particular risk profile, suggesting—strongly, or gently, or merely informatively, depending on how the system was configured by the informaticists who designed it, who were influenced by the guidelines written by the specialty societies who were influenced by the evidence base that was influenced by the studies that were funded by the manufacturers who had interests in whether CT scans were used more or less frequently—that the physician consider an alternative, or consider the radiation dose, or consider the cost, or consider whether this patient, this particular patient with this particular history and this particular presentation and this particular look of fear in their eyes, really needs the scan, or whether the system, in its aggregated, averaged, statistically smoothed wisdom, knows better.

It hides in the population health dashboard, where the care management team reviews a list of patients flagged by the risk model as high-risk for hospitalization, a list that is generated by an algorithm trained on data that reflects the patterns of a healthcare system that has historically underinvested in certain neighborhoods, that has fewer primary care providers in certain zip codes, that has transportation barriers and language barriers and trust barriers that do not appear as features in the model because they are not captured in the claims data, because the claims data only records what happened, not what didn't happen, not what couldn't happen, not what was prevented by the social determinants of health that the model cannot see and therefore cannot weight, and so the model flags the patients who look risky based on the data that exists, and the care managers call the patients who are reachable by phone, and the patients who are homeless, or undocumented, or without phones, or without English, or without trust in a system that has harmed them before, do not get the call, do not get the intervention, do not get diverted from the track they are on, and the trolley rolls on.

It hides in the interoperability gaps, the places where data does not flow, where FHIR resources fail to resolve, where HL7 messages drop, where the EHR in the emergency department cannot see the records from the clinic across town, where the pharmacist does not know the patient was already prescribed the same medication by a specialist last week, where the gaps in information create gaps in care, and where the moral weight of those gaps is borne entirely by the patient who falls through them, because the system, for all its magnificent, expensive, exhaustively standardized technical infrastructure, is still not fully connected, still not fully aware, still not fully capable of seeing the whole human being, and so it makes decisions based on partial information, on fragmented data, on the digital shadow of a person rather than the person themselves, and the trolley, not knowing what it does not know, continues on its track.

---

# Why Does It Matter? Because the Laundering Is the Point.

The deepest danger of the hidden trolley problem is not that healthcare systems make choices about who gets care and who does not—this has always been true, will always be true, is an inescapable feature of any system that operates with finite resources in a universe of infinite need—but that these choices are increasingly made in ways that obscure their moral nature, that launder them through technical systems until they appear as neutral, as inevitable, as devoid of human agency as the weather, as if the fact that a patient was denied a prior authorization was not a decision made by a person or a system designed by people with particular values and particular interests, but simply a result of the rules, the algorithms, the data, the objective facts.

This is what the philosopher Evan Selinger calls the "moral crumple zone"—the way in which human beings, particularly those in subordinate or frontline positions, absorb the moral impact of decisions that were actually made by systems, by algorithms, by distant administrators, by the accumulated weight of policy and technology and market forces, while the systems themselves remain pristine, unaccountable, and strangely innocent.

When a physician overrides a CDS alert and the patient suffers an adverse drug event, the physician is blamed, not the system that generated the fiftieth alert that day and trained her to dismiss them all.

When a patient dies waiting in the emergency department, the triage nurse is questioned, not the staffing model that put one nurse at the desk for a volume that required three.

When a high-risk patient is never reached by care management, the patient is blamed for being noncompliant, not the model for being trained on data that did not include the barriers they face.

This laundering of moral agency is not accidental.

It is the product of a system that has grown so complex, so distributed, so technically mediated, that accountability has become diffused to the point of evaporation, and where the only choices that remain visible are the ones made by the people at the very end of the chain, the ones who click the button, the ones who stand at the bedside, the ones who must look the patient in the eye and explain, with genuine confusion and genuine regret, that the system will not allow it, that the authorization was denied, that the drug is not on the formulary, that the bed is not available, that the trolley has already passed, and they did not even hear it coming.

---

# How Does It Work? The Machinery of Invisible Choice.

To understand the mechanism by which moral choices are embedded in healthcare workflows, one must descend, however reluctantly, into the technical substrate—the architecture of databases, the logic of algorithms, the standards of interoperability, and the design patterns of user interfaces that collectively constitute the modern health IT ecosystem, a realm that is, to the uninitiated, as forbidding and as densely jargon-laden as medieval theology, but which rewards patient exploration with the revelation that every technical decision is also, inevitably, a moral decision wearing a disguise of engineering necessity.

At the foundation lies the Electronic Health Record (EHR), that vast, sprawling, often maddeningly counterintuitive digital ecosystem that has replaced the paper chart and now mediates virtually every interaction between clinician and patient, capturing not just clinical information but also the workflows, the alerts, the order sets, the documentation templates, and the decision support rules that guide, constrain, and sometimes override human judgment.

The EHR is built on databases—relational, hierarchical, occasionally graph-based—that store patient data in structured formats: demographics, diagnoses (encoded in ICD-10, the tenth revision of the International Classification of Diseases, a taxonomical system of almost hallucinatory specificity that assigns codes to everything from "struck by turkey" to "burn due to water-skis on fire"), medications, procedures, lab results, vital signs, and the unstructured narratives of clinical notes that physicians dictate or type or, increasingly, generate through voice recognition systems that struggle with accents, with mumbling, with the particular cadences of human speech under stress.

Above the database sits the application layer, where Clinical Decision Support (CDS) systems operate, applying rules—if-then statements, scoring algorithms, machine learning models—to the data in real time or near-real time, generating alerts, suggestions, reminders, and occasionally hard stops that prevent a clinician from proceeding with an order until they provide additional justification, acknowledge a risk, or select an alternative.

These rules are written by clinical informaticists, by quality improvement teams, by specialty societies, by payers, by vendors, by committees that meet quarterly and review evidence and debate thresholds and vote on recommendations, and every parameter they set—every blood pressure cutoff, every age range, every comorbidity weight, every risk score threshold—is a lever, a point at which the trolley can be diverted, a moment where the system decides that this patient, with this particular constellation of data points, should be treated differently than that patient, with that slightly different constellation, and where the difference might be the difference between a timely intervention and a missed window, between a life saved and a life lost, between a one and a five on some invisible, unacknowledged, but brutally consequential moral scorecard.

The interoperability layer—HL7 v2 messages, HL7 v3 CDA documents, FHIR resources—allows these decisions to propagate across organizational boundaries, to flow from hospital to clinic to pharmacy to insurer to public health agency, carrying with them not just clinical data but also the embedded values of the systems that produced them, the priorities of the organizations that configured them, and the biases of the data that trained them.

FHIR, in particular, represents a kind of philosophical ambition as much as a technical standard: it attempts to define, in precise, computable, universally shareable terms, the fundamental resources of healthcare—Patient, Observation, Condition, MedicationRequest, DiagnosticReport, Coverage, Claim—creating a semantic interoperability that promises a world where every system speaks the same language, where data flows seamlessly, where the right information reaches the right person at the right time.

But semantic interoperability, for all its magnificent technical achievement, cannot resolve moral interoperability.

It cannot tell us whether a prior authorization denial encoded in a FHIR ClaimResponse resource is just or unjust.

It cannot tell us whether a risk score of 0.73 generated by a machine learning model and attached to a Patient resource represents a genuine prediction of clinical need or a statistical artifact of historical bias.

It cannot tell us whether the fact that one hospital's EHR fires an alert for a potassium level of 5.2 mEq/L while another waits until 5.5 is a better clinical decision or merely a different one, with different consequences for different patients, and different moral weights that no standard can compute.

And above it all, increasingly, sits the layer of artificial intelligence—predictive models, natural language processing systems, computer vision algorithms for radiology and pathology, recommendation engines for treatment selection—trained on vast datasets of historical healthcare encounters, learning the patterns of what was done, what worked, what failed, what was paid for, what was denied, and encoding those patterns into predictive systems that are deployed with the authority of statistical rigor but often without the transparency, the explainability, or the accountability that moral agency requires.

These models are black boxes, or gray boxes, or occasionally glass boxes that are still too complex for any human to fully audit, and they make predictions—this patient will be readmitted within 30 days, this patient has a 12% probability of sepsis, this patient is a high utilizer of emergency services—that trigger interventions, allocate resources, prioritize outreach, and, in the aggregate, determine who gets the attention of the system and who is left to wait, to wonder, to worsen, to arrive at the emergency department too late, the trolley having already passed, the lever having been pulled by an algorithm that no one person designed, no one person oversees, and no one person can fully explain.

---

# Which Technologies Make It Possible? The Stack of Distributed Morality.

The technologies that enable the hidden trolley problem are not exotic, not futuristic, not the stuff of science fiction; they are the mundane, everyday, exhaustively standardized, occasionally maddeningly unreliable infrastructure of contemporary healthcare IT, and it is precisely their mundanity, their ubiquity, their apparent neutrality that makes them so effective as vehicles for moral choice, because a technology that is visible, that is recognized as powerful, that is understood as having consequences, can be debated, challenged, resisted, but a technology that is invisible, that is simply how things are done, that is the water in which the fish swims, operates below the threshold of moral awareness and thus below the threshold of moral accountability.

There is the Electronic Health Record itself, the EHR, that digital colossus that sits at the center of modern healthcare, produced by a small number of large vendors who have built systems so complex, so deeply integrated into the workflows of so many institutions, that switching between them is a multi-year, multi-million-dollar ordeal that few organizations can contemplate, creating a kind of technical lock-in that limits competition, limits innovation, and, most critically, limits the ability of the healthcare system to evolve its moral architecture in response to new evidence, new values, new understandings of what constitutes just and equitable care.

There is HL7, the Health Level Seven messaging standard, now in its second version for decades and its third version in various states of adoption, which allows systems to exchange clinical information in structured formats, enabling the continuity of care that is essential for patient safety but also enabling the propagation of decisions—admissions, discharges, transfers, orders, results, denials—from one node in the healthcare network to another, carrying with them the moral weight of the contexts in which they were generated.

There is FHIR, Fast Healthcare Interoperability Resources, the modern, web-native, RESTful standard that promises to make healthcare data as accessible and as shareable as the data on the open internet, using JSON and XML formats, resource-based architectures, and standardized APIs that allow applications to query, retrieve, and update clinical information with the same ease with which one might query a weather service or a mapping API, and which represents a genuine and important advance in the technical capacity for healthcare systems to coordinate, to communicate, to see the whole patient rather than the fragmented shadow.

But FHIR, for all its elegance, is a pipe.

It carries water.

It does not tell you whether the water is clean or poisoned.

It does not tell you whether the pipe was laid to serve a neighborhood that was already well-hydrated or one that has been dying of thirst.

It does not tell you whether the pump at the other end is being operated by a public utility or a private corporation with a fiduciary duty to shareholders rather than to patients, and it is this layer—the layer of governance, of policy, of market structure, of incentive alignment—that determines what flows through the pipes and to whom, and which technologies alone cannot fix.

There are the Clinical Decision Support systems, the CDS engines, which apply knowledge bases—collections of rules, guidelines, evidence-based recommendations—to patient data in real time, generating the alerts, the reminders, the order sets, the care pathways that guide clinician behavior, and which are configured by committees, by quality improvement teams, by payer contracts, by liability concerns, by the particular clinical culture of a particular institution at a particular moment in time, and which can be life-saving when they catch a dangerous drug interaction or life-limiting when they enforce a rigid protocol that does not fit the particular, the complex, the human.

There are the predictive analytics platforms, the machine learning models, the risk stratification algorithms that ingest millions of data points and output scores, probabilities, rankings, flags, and which are increasingly purchased from vendors who treat their models as proprietary intellectual property, who will not disclose their training data, their feature sets, their validation methods, their performance across different demographic groups, and who thus ask the healthcare system to trust, on faith, that the trolley is being diverted wisely, justly, equitably, without any ability to verify, to audit, to challenge, to appeal.

There are the prior authorization systems, the automated denial engines, the natural language processing tools that parse clinical documentation and match it against policy criteria, the robotic process automation bots that navigate payer portals, and the blockchain experiments that promise to make claims adjudication transparent but have so far mainly made it more complex, and all of these technologies, in their various ways, serve to accelerate, to scale, to standardize the making of decisions about who gets what care and when, and in doing so they serve also to accelerate, to scale, to standardize the obscuring of the moral weight of those decisions.

And finally, there are the human beings.

The physicians, nurses, pharmacists, therapists, social workers, care managers, coders, billers, administrators, executives, board members, policymakers, regulators, advocates, patients, families, caregivers—who operate within this technical ecosystem, who are shaped by it, constrained by it, enabled by it, exhausted by it, and who must find, in the interstices of the alerts and the dashboards and the queues and the models, the space to practice medicine as a human vocation, to see the patient as a person rather than a record, to make choices that are genuinely moral rather than merely procedural, and to bear the weight of a system that asks them to be simultaneously the lever-puller and the absorber of the moral impact, the visible agent and the invisible infrastructure, the one who decides and the one who is decided by.

---

# Stepping Back: The View from the Switching Yard

If we pull back, if we ascend, if we rise above the particular alert and the specific queue and the individual dashboard until we can see the whole sprawling, interconnected, magnificently ambitious and tragically imperfect system of modern healthcare, what we see is not a single trolley on a single track with a single lever and a single decision-maker, but rather a vast switching yard, a labyrinthine network of converging and diverging tracks, of signals and switches and junctions and sidings, operated by thousands of people who cannot see the whole network, who only see their own small section, their own signal box, their own lever, and who pull those levers according to the rules they were given, the protocols they were trained on, the incentives they were offered, and the technologies that mediate their every interaction with the trains that pass through.

Some of those trains carry patients to healing.

Some carry them to harm.

Some are diverted to sidings where they wait, and wait, and wait, while other trains pass, because the siding is full, or because the signal is red, or because the algorithm has calculated that this train is less urgent, less valuable, less likely to benefit from the scarce resources at the next station, and the passengers on that train do not know why they are waiting, do not know that a decision was made, do not know that they are living inside a trolley problem that has been so thoroughly technologized, so completely distributed, so perfectly laundered that it no longer looks like a moral dilemma at all.

It looks like a queue.

It looks like a denial.

It looks like a formulary exception.

It looks like a risk score.

It looks like workflow.

And this, perhaps, is the most important thing to understand: the trolley problem was never really about trolleys.

It was about visibility.

It was about the moment when a choice is forced into consciousness, when the moral weight of action and inaction becomes undeniable, when the human being must look at the consequences of their decision and own them, absorb them, live with them.

Healthcare, in its current technical and organizational form, has achieved something remarkable and terrifying.

It has made the trolley invisible.

It has made the tracks run underground.

It has made the lever so small, so ubiquitous, so embedded in the ordinary motions of daily work that the people who pull it no longer feel the weight of what they are doing, and the people who are on the tracks no longer know that a choice is being made about them, and the society that depends on this system for its most precious, its most vulnerable, its most fundamental needs—health, relief from suffering, the preservation of life—no longer recognizes that beneath the dashboards and the metrics and the quality scores and the interoperability standards, there is still, always, inevitably, the ancient, terrible, magnificent human question:

Who do we save?

And who do we allow to pass?

And who gets to decide?

And can we bear to look?

The technologies will not answer this.

FHIR will not answer this.

HL7 will not answer this.

The machine learning model with its seductive precision will not answer this.

Only we can answer it, and only if we refuse to let the system hide the question from us, only if we insist on pulling the lever consciously, on seeing the tracks clearly, on demanding that the moral architecture of healthcare be as visible, as debated, as accountable as its technical architecture, and on recognizing that every database schema, every alert threshold, every risk score cutoff, every prior authorization rule is a moral choice wearing a costume of engineering, and that the first step toward justice is to strip away the costume and look, honestly, at what stands beneath.

The trolley is already here.

It is in the queue.

It is in the model.

It is in the alert.

It is in the workflow.

And the lever?

The lever is in your hand.

Whether you know it or not.

