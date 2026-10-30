---
title: "Depression, bipolar disorder, and what the scores leave out"
seoTitle: "Depression and Bipolar Disorder: What Questionnaire Scores Show"
description: "Follow fictional Patient X through three mental-health questionnaires. See how symptoms and wellbeing change, inspect the answers, and understand the limits."
date: "2026-10-30"
dateModified: "2026-10-30"
thumbnail: "/images/visualizations/patient-x/social.png"
thumbnailAlt: "Patient X's fictional questionnaire results shown as separate depression, mania-related symptoms and wellbeing plots across twelve weeks"
category: "Visualizations"
collections: ["apps"]
tags: ["Mental Health", "Depression", "Bipolar Disorder", "PHQ-9", "ASRM", "WHO-5", "Patient Education", "Data Visualisation", "Questionnaires", "Synthetic Data"]
pinnedTags: ["Mental Health", "Depression", "Bipolar Disorder", "PHQ-9", "ASRM", "WHO-5", "Patient Education", "Data Visualisation", "Questionnaires", "Synthetic Data"]
published: true
interactiveFirst: true
immersiveLead: true
color: "#466b77"
author: "Suvro Ghosh"
readingTime: "6 min"
inPlainEnglish: "Three questionnaires describe different parts of a fictional person's experience. Follow the scores, inspect the answers, and see why more activity does not automatically mean feeling better."
faq:
  - question: "Is Patient X a real person?"
    answer: "No. Patient X, every answer and every plotted result are fictional. This is an educational example, not a patient record or a test of the reader."
  - question: "Can these graphs diagnose depression or bipolar disorder?"
    answer: "No. The graphs organise questionnaire scores. Diagnosis requires a clinical assessment, including symptoms, their duration, effects on daily life and the person's wider history."
  - question: "Why do the questionnaires cover different periods?"
    answer: "PHQ-9 and WHO-5 refer to the previous fourteen days. ASRM refers to the previous seven days. Results recorded on the same date therefore do not describe identical periods."
---

<script>
	import PatientX from '$lib/components/visualizations/patient-x/PatientX.svelte';
</script>

<PatientX />

<p><small>Published <time datetime="2026-10-30">30 October 2026</time> · Updated <time datetime="2026-10-30">30 October 2026</time></small></p>

<TTS />

A person can be doing more and still be doing badly. More messages sent. More plans made. Less sleep. None of that, by itself, tells us whether life has become easier to live.

This is where a useful graph should earn its space. It should help us notice a difference, then let us inspect the answers behind it. A dashboard that requires its own training programme has already asked too much of someone having a difficult morning.

Patient X gives us something concrete to examine without turning anybody's private life into an exhibit. Every answer here is invented. X is neither me nor a disguised reader. The numbers demonstrate how the questionnaires work together; they do not describe a typical illness or predict what happens next.

The three measures ask different questions:

- **PHQ-9** records depressive symptoms over the previous fourteen days. Its nine item scores run from zero to three and add to a total from zero to twenty-seven. Higher totals mean more reported symptoms. The [University of Washington's PHQ-9 reference](https://www.hiv.uw.edu/page/mental-health-screening/phq-9) provides the original questions and scoring.
- **ASRM**, the Altman Self-Rating Mania Scale, records five aspects of mania-related symptoms over the previous seven days. Each item runs from zero to four; the total runs from zero to twenty. It includes changes in mood, confidence, sleep need, speech and activity. The [American Psychiatric Association's form](https://www.psychiatry.org/getmedia/c1783d55-268a-47b2-9932-a549b21c8d64/APA-DSM5TR-Level2ManiaAdult.pdf) explains its clinical use.
- **WHO-5** asks about wellbeing over the previous fourteen days. Five scores from zero to five are added, then multiplied by four, giving zero to one hundred. Higher means better reported wellbeing. That number is a scale score, not a percentage of health. The [World Health Organization's reference](https://www.who.int/publications/m/item/WHO-UCN-MSD-MHE-2024.01) describes the measure.

Keeping them separate matters. Adding the totals would produce a larger number and a smaller understanding. The scales have different ranges, different questions and, in one case, a different direction. There is no combined mental-health grade here.

Begin with the three plots over time. Follow one measure from assessment to assessment before comparing it with the others. Higher depressive-symptom scores mean something different from higher wellbeing scores. The axes keep their original ranges so the display cannot quietly make a small change look enormous.

The dates also need care. An assessment is a report about a period, not a photograph of that afternoon. ASRM looks back one week; the other two look back two. A line joining assessments helps you follow their order. It cannot fill in the unobserved days.

Now inspect the view that puts depressive symptoms beside mania-related symptoms. Each point belongs to one assessment. Its purpose is simple: two different kinds of difficulty can appear in the same set of reports. One score need not fall politely whenever the other rises.

This is a custom comparison, not a diagnostic map. There is no corner labelled “you have bipolar disorder”. Because the questionnaires cover different periods, two elevated scores do not even establish that the symptoms happened together. They certainly cannot establish a mixed episode.

That distinction is worth keeping even when it interrupts a tidy picture. A tidy picture is cheap.

Depression can occur within bipolar disorder or outside it. Diagnosing bipolar disorder involves the person's history, including distinct periods of changed mood and activity, how long they lasted and what they did to daily life. A clinician also considers other explanations. The [National Institute of Mental Health's account of bipolar disorder](https://www.nimh.nih.gov/health/publications/bipolar-disorder) explains why a current depression score cannot settle that question.

Sleep makes the problem easier to recognise. Being unable to sleep and feeling exhausted is different from needing much less sleep while still feeling unusually energetic. Counting hours alone misses that difference. So does calling every increase in activity an improvement. Mania can include marked irritability; it is not simply a more cheerful version of an ordinary day.

Open the individual answers for a selected assessment. Two equal totals can be assembled from different problems. Concentration may be difficult for one person; sleep and appetite may dominate another person's report. The total is a useful summary. The answers tell you what it summarised.

Ordinary life still needs its own questions. Was answering a message difficult? Could the person finish a meal, follow a conversation or get through work? A scale cannot know the effort concealed inside “I managed”. Nor does a lower score erase that effort.

The PHQ-9 includes an item about thoughts of death or self-harm. This example keeps that answer at zero; it is an explicit teaching choice, not a conclusion drawn from the other answers. In real care, a non-zero response requires further assessment rather than being absorbed into the total. A zero does not establish safety either. This fictional demonstration does not assess anyone's safety.

The example is generated from a deliberately limited set of plausible patterns, with variation in individual answers. Scores are calculated from those answers. Generating another example changes the fictional record; it does not sample a clinical population. The design cannot tell us how common a pattern is, what caused it or which treatment would help.

Short labels in the answer view summarise the topics. They are not replacement questionnaire wording. Use the linked original instruments for clinical administration and check their reuse terms; the ASRM form's permission is limited to the uses it specifies. The original measures have supporting research. This generator and its custom comparison have not been clinically validated.

The useful destination is a clearer conversation: which changes began first, whether sleep felt different, what became harder, whether someone close noticed a change, and whether anything similar happened before. Bring those details to a clinician. They give the scores something they cannot supply for themselves: the person whose days are being counted.
