# Owned versus earned references

## Verdict

The available evidence does **not** support either “the site has no backlinks” or “the site already has strong external authority.” One owned GitHub repository link is observed; three owned/social channels produced small aggregate referrals; one scholarly publication and three third-party records provide possible professional corroboration. None of those facts establishes a broad set of independent referring domains, and public search is not a backlink database.

Google Search Console Links and Bing Webmaster backlinks are both **UNVERIFIED — REQUIRES OWNER ACTION**. Until those exports are obtained, referring-domain coverage, top linked pages, anchor distribution, link gains/losses, and suspicious-link patterns remain unknown.

## Classification rules

| Class                   | Meaning in this audit                                                                                      | What it does not mean                                                 |
| ----------------------- | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Owned                   | The owner controls or declares the destination, or the record is the site's own repository                 | Independent recommendation                                            |
| Social platform         | A profile/post/channel can distribute work; exact ownership and source-page links still require inspection | Editorial endorsement or followed link                                |
| Earned mention          | An independent public record names the author, company, role, publication, or work                         | A backlink to this domain, a testimonial, or a verified identity link |
| Earned backlink         | A third-party source page visibly links to a canonical page without owner control                          | Traffic, ranking impact, or endorsement by itself                     |
| Scholarly/institutional | A durable publication or institutional record corroborates a specific claim or contribution                | Permission to infer affiliations or add `sameAs`                      |

## Verified first-party and owned facts

- The site declares exact LinkedIn, Substack, YouTube, and X URLs in the stable Person entity. That verifies the site's declaration, not the external accounts' ownership, content, metrics, or backlinks.
- The public [GitHub repository](https://github.com/suvrotica/suvroghosh-in) matches the audited Git remote and links to the canonical site. This is useful technical provenance but remains an owned reference.
- Vercel's retained aggregate referrer table listed three LinkedIn visitors across web and Android, two YouTube visitors, and one Substack visitor during the 28-day audit window. It did not expose the referring post/video/newsletter, landing page, visitor quality, or permanent link. These are acquisition observations, not earned-authority counts.
- Public Google testing found branded professional pages and one distinctive visualization. This establishes pockets of retrieval, not external authority, rank stability, or backlink coverage.

## Observed third-party records

| Source                                                                                                                                                  | Observed match                                     | Bounded interpretation                                                   | Backlink status                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------ |
| [Journal DOI](https://doi.org/10.1097/00115514-200609000-00005)                                                                                         | Publication title and author align with the resume | Scholarly corroboration candidate                                        | No backlink to the current domain observed |
| [ResearchGate record](https://www.researchgate.net/publication/6755249_Task_Overlap_Among_Primary_Care_Team_Members_An_Opportunity_for_System_Redesign) | Title, author, and DOI match                       | Publication-discovery record; profile ownership unverified               | No backlink to the current domain observed |
| [CIOReview ClinZen profile](https://www.cioreview.com/clinzen-llc)                                                                                      | Name, company, and role align                      | Professional-history candidate; owner must confirm identity and accuracy | No backlink to the current domain observed |
| [ACN Newswire ClinZen interview](https://www.acnnewswire.com/press-release/english/22080/clinical-trial-efficiency-should-be-a-key-focus)               | Name, company, and role align                      | Press-wire/interview record; not an endorsement                          | No backlink to the current domain observed |

The common name “Suvro Ghosh” produces materially ambiguous public results. Records must be joined through exact publication titles, DOI, employer/project details, and owner-confirmed profile URLs—not the name alone. Do not add the ClinZen or ResearchGate records to `sameAs`, quote them as testimonials, or infer current affiliations without confirmation.

## Missing owner-access evidence

The owner should export Google Search Console's Links report and Bing Webmaster's Backlinks report, preserving raw account exports privately. The sanitized join should use linking domain plus source URL plus canonical target, and distinguish owned, social, directory, editorial, institutional, scholarly, community, low-quality, and suspicious sources. A missing public-search result must never be converted to zero backlinks.

## Safe next actions

1. Owner-confirm the exact LinkedIn, Substack, YouTube, X, GitHub, publication, ClinZen, and ResearchGate identity relationships.
2. Connect only confirmed records from the most relevant factual page: publication evidence from the resume/research context, project evidence from a project page, and repository evidence from its matching interactive article.
3. For healthcare flagships, complete primary-source and contribution/limitations work before seeking community attention.
4. For interactive flagships, create reproducible public project packages with a README, licence, equations or assumptions, screenshot, accessible static explanation, and canonical article link.
5. Measure earned referring domains and qualified referrals only after the authoritative exports and conversion events exist.

The row-level evidence and confidence boundaries are in `BACKLINKS.csv`; the original exploratory ledger remains in `BACKLINK_AND_MENTION_INVENTORY.csv`.
