# SEO And AEO Checklist

Editorial guidance reviewed on **30 October 2026**. These practices improve reader usefulness and
technical discoverability; they do not guarantee rankings, rich results, or AI citations.

## Technical SEO

- Every indexable page has a unique title, meta description, canonical URL, Open Graph tags, and Twitter card tags.
- Canonical URLs are absolute production URLs under `https://www.suvroghosh.in`.
- Blog post URLs use normalized category slugs and exact file slugs.
- `robots.txt` allows normal search crawling and includes the sitemap URL.
- `sitemap.xml` includes core pages, the blog index, category pages, and published posts only.
- Sitemap entries include `lastmod` when a reliable date is available.
- RSS links match canonical blog URLs.
- Pages use semantic `main`, `article`, `header`, `nav`, `footer`, and `time` elements where appropriate.

## Content SEO

- Published posts have `title`, `description`, `date`, `category`, `tags`, and `published`.
- Descriptions summarize the post honestly and do not stuff keywords.
- Categories and tags describe the post rather than chase every possible query.
- Post pages show author, date, category context, breadcrumbs, and related posts.
- Important explanatory posts may include `inPlainEnglish`, `keyTerms`, or `faq` front matter when genuinely useful.
- Personal essays, satire, and fiction should not receive fake FAQ blocks or artificial answer snippets.
- Keep those fields optional. Omit an unnecessary section rather than filling a quota; use the
  existing answer-section renderer instead of creating a second summary or FAQ system.
- Preserve the author's voice. A short direct answer should clarify the article's actual claim;
  it should not replace the opening, repeat the description mechanically, or introduce new claims.
- Use descriptive headings, natural titles and established canonical slugs. Exact keyword matching
  across the title, H1 and URL is not a requirement; do not rename published URLs for that purpose.
- Preserve the original publication date. Set `dateModified` only for a substantive revision,
  with a brief change note in the handoff; builds, formatting and unchanged reviews are not updates.

## Evidence And Comparisons

- Explain the method, assumptions and limitations when an article compares systems or reports an
  experiment. Separate documented facts, the author's experience, inference and synthetic examples.
- Use a comparison table only when common criteria help the reader choose or understand. Prefer
  semantic table headers, a descriptive caption and a readable mobile layout; do not force every
  article into a table or list.
- Link important factual claims to relevant primary sources. Give measurements units, context,
  dates and method where applicable. Never invent tests, clients, benchmarks or numerical precision.
- Add original screenshots, figures or video only when they explain something. Describe meaningful
  media accessibly; preserve the existing deferred YouTube loading and media preferences.
- Choose a restrained next step that fits the page: a related explanation, experiment, resource or
  subscription. There is no fixed CTA count or video/time-on-page ranking guarantee.

## Structured Data

- Homepage includes `WebSite` and `Person`.
- Blog posts include `BlogPosting` and `BreadcrumbList`.
- Blog index and category pages include `CollectionPage`.
- Contact page includes `ContactPage`.
- Resume page includes `ProfilePage` with the existing `Person` entity.
- Schema stays sparse, factual, and consistent with visible page content.
- Do not add medical, business, review, or professional schema claims that are not visibly supported.
- Google retired FAQ rich results on **7 May 2026**, according to its
  [documentation changelog](https://developers.google.com/search/updates). Useful visible questions
  and answers may remain. Existing truthful FAQ markup is not a reason to manufacture more FAQs,
  and this site must not promise FAQ rich results or AI citations from it.

## AI-Answer Visibility

- Prefer clear explanatory headings in technical posts.
- Include short direct-answer sections only when they help a real reader.
- Keep author identity, resume, and contact pages easy to discover through internal links.
- Link related healthcare IT, FHIR, clinical informatics, and AI-data posts deterministically by category or shared tags.
- Check that answer engines cite canonical URLs and do not confuse fiction/satire with professional claims.
- Keep important explanations in readable page text, including around interactive features.
  Google requires no special AI schema or new AI text file for its AI search features; see
  [Google's AI guidance](https://developers.google.com/search/docs/appearance/ai-features).

## Verification And Measurement

- Follow [AGENTS.md](../AGENTS.md) and the architecture gate in
  [CONTRIBUTING.md](../CONTRIBUTING.md#architecture-change-gate). For routine article work, run
  `npm run build` once: its prebuild already runs generators and content/SEO/media/link validation,
  and the build finishes with rendered discoverability validation. Do not run those steps separately
  beforehand or invoke `build:full` for ordinary prose work.
- Use focused regression, type and formatting checks for changed shared code. Inspect representative
  rendered pages for author/date accuracy, optional-section behaviour, canonicals and mobile reading.
- Review expected generated files, the sitemap and `git diff --check`. Test supported schema on one
  representative page when relevant; do not treat FAQ rich-result support as a pass criterion.
- Check existing sitemap/account status before external submissions. Local code changes do not
  establish Search Console access, property settings, indexing or production deployment.
- Use the bounded manual protocol in [aeo-prompts.md](aeo-prompts.md) and the current reporting notes
  in [GEO_MEASUREMENT.md](GEO_MEASUREMENT.md). Separate impressions, clicks, citations and referrals;
  compare a small released cohort with untouched pages at 30, 60 and 90 days. No recurring job is
  created by this checklist.

## Things Not To Do

- Do not keyword stuff titles, descriptions, tags, headings, or hidden text.
- Do not add fake FAQs that are not answered by the page.
- Do not invent credentials, awards, clients, medical authority, or professional claims.
- Do not create doorway pages, location spam pages, or autogenerated thin pages.
- Do not add fake reviews, ratings, testimonials, or organization schema.
- Do not use schema to claim anything that is not present on the visible page.
- Do not turn personal essays or fiction into false informational authority pages.
