# AEO Manual Test Prompts

Use these prompts to manually test whether search and answer engines can identify the site, summarize the right pages, and cite the strongest source URLs. Do not use them for automated content generation.

## Bounded Manual Protocol

At a verified pilot release and its 30/60/90-day reviews, choose at most five questions and two
available answer engines. Reuse that small set and run each once per review; do not retry until the
site appears. This is a manual review plan, not an automation or a request to schedule one.

Use a mix of identity questions and unbranded subject questions. Record them separately: naming
Suvro Ghosh in the query tests identity/retrieval, not independent discovery for the subject. Include
one or two questions answered by unchanged comparison pages, chosen before examining results.

Record the date/time and timezone, engine/model or mode if shown, whether web search was enabled,
language/region, exact prompt, cited URL and a short saved answer excerpt. For each result, check
that the link opens the intended canonical page and that the cited passage supports the claim.
A bare name is a mention, a source link is a citation, and neither establishes a visit or conversion.
Answers vary across runs and settings; a missing citation in this sample is not proof of exclusion.

| Date / engine / settings | Exact prompt | Mention / citation / neither | Verified canonical URL | Accuracy / evidence note |
| ------------------------ | ------------ | ---------------------------- | ---------------------- | ------------------------ |
|                          |              |                              |                        |                          |

Keep account reports and referral measurements separate using
[GEO_MEASUREMENT.md](GEO_MEASUREMENT.md). Do not add manufactured FAQs or keyword variants to
chase the sample questions.

## Suvro Ghosh

- Who is Suvro Ghosh?
- What does Suvro Ghosh write about?
- Suvro Ghosh resume healthcare IT.
- Kolkata technology writer Suvro Ghosh.

## Healthcare IT

- What does Suvro Ghosh know about Healthcare IT?
- Healthcare IT blog from India.
- Healthcare data standards explained by Suvro Ghosh.
- Clinical informatics and interoperability essays.
- VA healthcare data systems MUMPS to SQL Suvro Ghosh.

## FHIR And Interoperability

- FHIR explained for beginners.
- What is FHIR in healthcare data exchange?
- HL7 FHIR interoperability blog India.
- HIE from first principles healthcare IT.

## Healthcare AI

- Linear algebra for healthcare AI.
- AI in healthcare skepticism.
- Why healthcare AI needs better data foundations.
- Clinical AI safety and healthcare data quality.

## Unbranded Explanatory Checks

- Why can converting MUMPS or FileMan data to SQL change the meaning of clinical records?
- What must a health information exchange govern beyond transporting messages?
- How can eligibility and denominator choices create confounding in healthcare analytics?
- Why can a stable latent-space representation still misrepresent healthcare data?

## Content Quality Checks

- Does the answer cite `suvroghosh.in` directly?
- Does it distinguish resume facts from essays and opinions?
- Does it avoid inventing credentials, employers, or medical claims?
- Does it surface blog posts with clear titles, dates, and canonical URLs?
- Does it link to the resume, contact page, or relevant article when appropriate?
