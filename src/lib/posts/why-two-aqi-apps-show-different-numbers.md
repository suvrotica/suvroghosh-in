---
title: Why two AQI apps show different numbers
seoTitle: 'Why Two AQI Apps Show Different Numbers: Indian CPCB vs US EPA'
description: Compare Indian CPCB and US EPA PM2.5 bands, 24-hour vs hourly averaging, dominant-pollutant rules, and the 500 endpoint on identical measurements.
date: '2026-11-11'
dateModified: '2026-11-11'
category: Visualizations
tags:
  - Air Quality Index
  - PM2.5
  - CPCB
  - US EPA
  - Public Health
  - Healthcare
  - Statistics
  - Data Visualization
  - Environmental Health
  - India
pinnedTags:
  - Air Quality Index
  - PM2.5
  - CPCB
  - US EPA
  - Public Health
  - Healthcare
  - Statistics
  - Data Visualization
  - Environmental Health
  - India
thumbnail: /images/visualizations/why-two-aqi-apps-show-different-numbers/social.png
thumbnailAlt: Side-by-side comparison of the same 60 micrograms per cubic metre 24-hour PM2.5 concentration producing PM2.5 score 100 (Satisfactory) on India CPCB and 154 (Unhealthy) on Current US EPA.
color: '#1A4D6E'
author: Suvro Ghosh
readingTime: 6 min read
inPlainEnglish: Two air-quality apps can report different AQI numbers for the same place because they use different concentration-to-score breakpoint tables, average over different hours, or report different dominant pollutants—and a lower score on a different scale never means cleaner air.
published: true
mediaReviewed: true
interactiveFirst: true
immersiveLead: true
---

<script>
	import AqiExplainer from '$lib/components/visualizations/why-two-aqi-apps-show-different-numbers/AqiExplainer.svelte';
</script>

<AqiExplainer />

<TTS />

Why do two apps give different AQI numbers for the same place?

Suppose a monitor records a 24-hour average PM2.5 concentration of **60 micrograms per cubic metre**. On India’s scale, that gives a particle score of **100**, labelled **Satisfactory**. On the current US scale, it gives about **154**, labelled **Unhealthy**.

Same measurement. Same hours. Different scores.

Those are scores for PM2.5 alone. The full Air Quality Index, or AQI, also considers other pollutants. But this small example gets us to the first source of confusion: the amount of pollution and the number used to describe it are different things. The figures follow the published bands of India’s [Central Pollution Control Board (CPCB)](https://airquality.cpcb.gov.in/ccr_docs/About_AQI.pdf) and the [US Environmental Protection Agency (EPA)](https://aqs.epa.gov/aqsweb/documents/codetables/aqi_breakpoints.html).

AQI was meant to make air quality easier to understand. Somehow, checking whether to go for a walk has acquired homework.

Start with what is actually being measured. PM2.5 means airborne particles no more than about 2.5 micrometres across. These include tiny solid particles and liquid droplets. Their size matters because they can travel deep into our lungs. PM10 includes particles up to about 10 micrometres across, including the smaller ones. [EPA’s explanation of particle pollution](https://www.epa.gov/pm-pollution/particulate-matter-pm-basics) describes this distinction.

A concentration of 60 micrograms per cubic metre tells us the mass of that fine-particle material in a volume of air. Imagine a space one metre wide, one metre deep and one metre high. The measurement describes how much particle material is suspended in that much air. It is not a count of particles.

AQI turns measurements like that into a score, a colour and a health message.

Each system divides concentrations into bands. It finds the band containing the measurement, then assigns a score according to where the measurement sits within it. You do not need the equation to understand the result. You need to know which set of bands was used.

For PM2.5, India’s “Good” band reaches 30 micrograms per cubic metre. The US “Good” band reaches 9.0. So, near the cleaner end, the US system moves into less reassuring categories sooner.

But the US number is **not always higher**. Here are four examples using the same 24-hour concentration in each comparison:

| PM2.5 in micrograms per cubic metre | India particle score | US particle score |
| - | - | - |
| 30 | 50 — Good | 90 — Moderate |
| 60 | 100 — Satisfactory | 154 — Unhealthy |
| 90 | 200 — Moderately polluted | 175 — Unhealthy |
| 120 | 300 — Poor | 196 — Unhealthy |

These are calculated examples, rounded to whole numbers, using the [Indian](https://airquality.cpcb.gov.in/ccr_docs/About_AQI.pdf) and [US](https://aqs.epa.gov/aqsweb/documents/codetables/aqi_breakpoints.html) tables. They are not observations from a particular city.

At a concentration of 90 micrograms per cubic metre, the Indian score is larger. There is no fixed multiplier for converting one scale into the other. Nor does the lower number mean less pollution when the underlying concentration is identical.

The category words differ too. “Moderate” on one scale and “Moderately polluted” on another are not interchangeable promises.

CPCB’s design report relates its choices to Indian air-quality standards and cites higher background particle levels. That explains part of the scale’s design. It does not establish that breathing polluted air is less harmful because it is familiar. [CPCB’s technical report](https://www.cpcb.gov.in/displaypdf.php?id=bmF0aW9uYWwtYWlyLXF1YWxpdHktaW5kZXgvRklOQUwtUkVQT1JUX0FRSV8ucGRm) sets out that rationale.

The second source of confusion is the clock.

Imagine a made-up day with PM2.5 at 60 for twenty hours, then 360 for the final four hours after smoke arrives. The full-day average is **110**. The latest hourly reading is **360**. Both describe the same sequence, but answer different questions.

The longer average softens the rise. After the smoke clears, it also takes longer to come down, because the smoky hours remain in the calculation.

CPCB’s particle AQI uses a running 24-hour average. A display can update frequently while still looking back over those hours. The US daily particle AQI also uses a 24-hour average. [CPCB’s calculation guide](https://airquality.cpcb.gov.in/ccr_docs/How_AQI_Calculated.pdf) and [AirNow’s guide to its reports](https://www.airnow.gov/aqi/aqi-basics/using-air-quality-index/) explain the distinction.

For current conditions, EPA’s **NowCast** uses up to twelve hourly readings and gives recent hours more weight when pollution changes sharply. IQAir documents a different approach: its **US AQI+** uses the previous hour’s averages. The words “US AQI” alone do not tell you which hours a service used. [EPA’s NowCast explanation](https://www.epa.gov/sites/default/files/2018-01/documents/nowcastfactsheet.pdf) and [IQAir’s method](https://www.iqair.com/support/knowledge-base/airvisual_vs_nowcast) describe these differences.

There is also more than one pollutant.

Each monitored pollutant gets its own score. The highest valid score determines the overall AQI. If the scores are 154, 62 and 37, the overall number is 154. The cleaner readings do not cancel the worst one. India also has minimum data requirements before it reports an overall AQI. [CPCB’s calculation guide](https://airquality.cpcb.gov.in/ccr_docs/How_AQI_Calculated.pdf) explains both rules.

India’s scheme includes ammonia and lead alongside the particle measures and four gases used in the US index. The US system is a national scale used by many services elsewhere, rather than one universal international standard. [CPCB’s pollutant table](https://airquality.cpcb.gov.in/ccr_docs/About_AQI.pdf) and [AirNow’s description](https://www.airnow.gov/aqi/aqi-basics/using-air-quality-index/) show what each covers.

And what about 500?

India’s published category scale ends at 500. That is a limit of the published scale, not evidence that an instrument cannot measure more pollution. Current EPA guidance explicitly permits calculated values above 500; they remain in the **Hazardous** category. [CPCB’s category table](https://airquality.cpcb.gov.in/ccr_docs/About_AQI.pdf) and the [EPA’s May 2026 guidance](https://document.airnow.gov/technical-assistance-document-for-the-reporting-of-daily-air-quailty.pdf) make these distinctions possible.

A graphic putting 416 beside a reported 1,760 cannot, by itself, explain the difference. We need the monitoring locations, timestamps, pollutants and averaging methods. A city summary and a station beside a smoke plume are not necessarily describing the same air. Dividing the two AQI numbers does not tell us how many times more polluted or dangerous it was.

Before comparing two reports, check the **scale, place, pollutant, time and averaging period**. When possible, compare the underlying concentration for the same pollutant over the same hours.

A useful air-quality report should make those details easy to find. Someone waiting for a bus should be able to understand what the number says about the air they are breathing.
