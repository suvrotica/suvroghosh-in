# Security findings

## Executive summary

No P0 or P1 security finding was identified in the public production sample, tracked source tree, dependency metadata, certificate/DNS review, or controlled response comparison. In particular, the audit found no verified malicious redirect, user-agent/referrer cloaking on the homepage, hidden outbound spam link, unexpected service worker, mixed active content, committed secret matching the tested patterns, or currently unexpected name in the accessible unexpired Certificate Transparency result.

This is bounded evidence, not a guarantee that compromise is impossible. Authenticated Search Console/Bing security reports, VirusTotal, URLhaus, SmartScreen, server/provider logs, deployment history, and historical archive content were unavailable or incomplete. Those gaps are recorded in BLACKLIST_AND_REPUTATION.md.

The actionable findings are:

- P2: two directly accessible exported notebooks execute four third-party CDN scripts without Subresource Integrity and without a page CSP.
- P2: npm audit reports three vulnerable packages: two high-severity packages and one moderate-severity package; the currently observed paths are primarily build/development exposure.
- P2: the optional text-to-speech POST endpoint is public and lacks route-level durable rate limiting or authentication if its upstream service is enabled.
- P2: contact abuse controls are process-local and the body-size guard depends on Content-Length, which is not a durable distributed limit.
- P2: the email domain has no DMARC record; this is an email anti-spoofing gap, not a web-search penalty.
- P3: DNSSEC/CAA and selected browser-policy hardening can be evaluated after provider and subdomain compatibility review.

- Generated: 2026-08-06T13:07:13+05:30
- Audit commit: 1952c2d523bf4b6bbd352d8e8c041b912ae9ae89
- Production target: https://www.suvroghosh.in
- Safety boundary: passive GET/HEAD/TLS/DNS checks and local read-only analysis; no live POST, login, form submission, rescan, report, DNS change, or package mutation

## Method and coverage

| Area                           | Evidence collected                                                                                                                                                                                                                                                                                               | Important limitation                                                                                                         |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Tracked-source compromise scan | 4,352 tracked paths; 2,832 text files below 5 MiB searched for common credential forms, private keys, suspicious destinations, remote scripts, iframes, raw-HTML sinks, eval/new Function/document.write, JavaScript URLs, hidden-link patterns, meta refresh, service workers, and user-agent/referrer branches | Heuristic pattern scanning is not a complete entropy scan, malware sandbox, or full Git object/secret-forensics product      |
| Git/environment hygiene        | Tracked and historical path names contained only the example environment file; the local ignored environment file was deliberately not read or copied                                                                                                                                                            | Does not prove a secret never existed in unreachable Git objects, forks, CI logs, provider settings, or previous deployments |
| Production response sample     | HTTP-to-HTTPS redirects, canonical redirect, homepage, contact page, a protected application entry surface, representative article, both notebook pages, service worker, and selected headers/content                                                                                                            | A bounded sample does not prove every dynamic route or historical response is safe                                           |
| Cloaking comparison            | Five passive homepage requests representing a normal desktop agent, Googlebot, Bingbot, Google referrer, and LinkedIn referrer                                                                                                                                                                                   | Only the homepage and those exact request profiles were compared                                                             |
| TLS/CT/DNS                     | Hostname-valid live TLS for apex/www, current certificate names/chain, public CT, authoritative RDAP, DNSSEC/CAA, mail records, and a synthetic wildcard-host probe                                                                                                                                              | Wildcard DNS/certificate use prevents exhaustive passive subdomain enumeration                                               |
| Dependency supply chain        | npm audit, production-only npm audit, npm signature/attestation verification, lockfile resolution-host review, install-script package inventory, and dependency paths                                                                                                                                            | Audit databases can lag; a package advisory does not by itself prove exploitability in this application                      |
| Forms/auth/service worker      | Static code review of contact, the optional text-to-speech handler, protected application authentication/recovery, cookie construction, and service-worker cache boundaries                                                                                                                                      | No state-changing production request, authenticated session, or provider-log review was made                                 |

## Prioritized findings

### SEC-P2-001 — Third-party executable notebook scripts lack SRI and page CSP

- Category: Third-party supply chain / browser execution
- Affected component: static/notebooks/perceptron-from-scratch-in-mojo.html, static/notebooks/xor-with-multiple-perceptrons-in-mojo.html, and their directly accessible production URLs
- Evidence: Each exported notebook loads RequireJS 2.1.10 and MathJax 2.7.7 from cdnjs. Across the two files there are four external executable script elements. None has an integrity attribute. The production notebook response returned HTTP 200 and had no Content-Security-Policy response header or CSP meta element. It did have HTTPS, HSTS, X-Content-Type-Options, and X-Frame-Options.
- Severity: P2 — medium
- Confidence: High
- User impact: A compromise or unintended change at the remote script delivery path could execute in the site's origin when a visitor opens a notebook directly.
- Search impact: No current ranking or indexing defect was shown. A future injected payload could trigger browser/search security systems.
- Security impact: The direct-open page trusts two remote executable dependencies without content pinning enforced by the browser and without a CSP limiting execution destinations.
- Business impact: A supply-chain event could harm visitors and domain reputation even though no current compromise was observed.
- Remediation: Prefer exporting the notebooks without runtime third-party JavaScript. Otherwise self-host reviewed, supported copies or pin exact CDN assets with validated Subresource Integrity and crossorigin attributes. Add an explicit notebook CSP that permits only the minimum required scripts/styles/fonts/images. Test whether MathJax configuration can be moved to a non-executable data/config path. Do not label the old version numbers as vulnerable without an applicable advisory.
- Effort: Medium
- Owner: Web engineering with security review
- Dependency: Decide whether notebooks must remain executable and whether the site's X-Frame-Options: DENY policy is intended to block the same-origin notebook iframe component
- Verification: Open both direct notebook URLs in a fresh browser; confirm no unexpected remote executable request, no CSP violation needed for normal rendering, correct mathematical output, and a passing production header scan. If CDN assets remain, verify the downloaded bytes match every integrity value.

### SEC-P2-002 — npm reports three vulnerable transitive/build packages

- Category: Dependency and build supply chain
- Affected component: package-lock.json dependency graph; build/development toolchain; the PostCSS path visible through SvelteKit/Vite
- Evidence: npm audit returned three affected packages: brace-expansion 5.0.7 with two high-severity advisories ([GHSA-mh99-v99m-4gvg](https://github.com/advisories/GHSA-mh99-v99m-4gvg), [GHSA-rgw5-rvv9-x895](https://github.com/advisories/GHSA-rgw5-rvv9-x895)); postcss 8.5.16 with high/moderate advisories ([GHSA-r28c-9q8g-f849](https://github.com/advisories/GHSA-r28c-9q8g-f849), [GHSA-fxqj-rqcc-2cmp](https://github.com/advisories/GHSA-fxqj-rqcc-2cmp)); and tar 7.5.19 with a moderate advisory ([GHSA-r292-9mhp-454m](https://github.com/advisories/GHSA-r292-9mhp-454m)). The full audit summarized 0 critical, 2 high, and 1 moderate packages. The omit-dev audit still reported PostCSS through the peer/build path. brace-expansion and tar were development-only in the installed graph.
- Severity: P2 — medium
- Confidence: High for versions/advisories; medium for application exploitability
- User impact: No direct browser exploit was demonstrated. Risk concentrates in install/build/CI processing and any workflow that processes attacker-controlled CSS, source maps, archives, or glob input.
- Search impact: None demonstrated.
- Security impact: Known vulnerable code remains in the dependency graph. Treating it as harmless solely because it is transitive would leave CI and developer environments exposed.
- Business impact: A compromised or failed build pipeline could delay deployment or introduce broader supply-chain risk.
- Remediation: In a controlled dependency branch, update the owning direct dependencies/lockfile until npm resolves at least brace-expansion 5.0.9, postcss 8.5.25, and tar 7.5.22 or later compatible patched releases. Avoid npm audit fix --force without reviewing major-version changes. Reinstall from the lockfile and rerun the full test, build, lint, npm audit, and production-only audit. Confirm that no application workflow processes untrusted CSS/source maps/archives before the update lands.
- Effort: Small to medium
- Owner: Web engineering / dependency maintainer
- Dependency: Compatibility of SvelteKit, Vite, adapters, and their peer dependencies; existing unrelated test/lint baseline failures must not be misattributed to this update
- Verification: Both npm audit modes report no remaining applicable advisory, npm dependency paths resolve to patched versions, registry-signature checks pass, and the production build/test suite preserves behavior.

### SEC-P2-003 — Optional text-to-speech endpoint can expose unauthenticated compute

- Category: Abuse prevention / availability / information exposure
- Affected component: optional server-side text-to-speech API handler
- Evidence: The POST handler accepts public JSON text, normalizes it, caps content at 3,000 characters, and calls a server-configured backend with a 120-second timeout. It does not apply route-level authentication, a durable rate limit, or an early request-byte limit before JSON parsing. The backend destination is server-controlled, so the inspected code does not expose user-controlled SSRF. Backend error text can be reflected in a bounded response. No live POST was made, and production backend configuration was not inspected.
- Severity: P2 — medium, conditional on the backend being enabled in production
- Confidence: High for source behavior; UNVERIFIED — ACCESS REQUIRED for live enablement and provider protections
- User impact: Automated requests could consume a finite speech-generation service and degrade availability for legitimate users.
- Search impact: None demonstrated.
- Security impact: Potential unauthenticated resource exhaustion, cost abuse, and bounded backend-detail disclosure.
- Business impact: Compute/provider cost, availability incidents, and operational noise if the optional service is reachable.
- Remediation: Owner-verify whether the production backend is enabled and what upstream protections already exist. If enabled, add a durable shared rate limit, concurrency/queue limit, platform-enforced request-size cap, generic production error mapping, and authentication or an adaptive challenge appropriate to the feature. Keep the server-controlled allowlist/destination design.
- Effort: Medium
- Owner: Application engineering / platform operations
- Dependency: Product decision on public versus authenticated speech generation; availability of a shared rate-limit/queue store and provider quotas
- Verification: In staging, test omitted/chunked/oversized bodies, concurrent calls, distributed rate-limit keys, backend timeouts, and sanitized failure responses. Review provider metrics after deployment. Do not load-test production without explicit authorization.

### SEC-P2-004 — Contact abuse controls are process-local and body-size enforcement is header-dependent

- Category: Form abuse / email-cost protection / availability
- Affected component: src/routes/contact/+page.server.ts and deployment/runtime limits
- Evidence: The action has a honeypot, strict field lengths, email validation, a 64 KiB Content-Length check, and an in-memory per-client limit of three requests per 15 minutes. The rate-limit map is local to a process and is not durable across serverless instances, regions, restarts, or distributed callers. An omitted or untrustworthy Content-Length can defer size rejection until formData parsing. No form was submitted.
- Severity: P2 — medium
- Confidence: High for source behavior; medium for effective production protection because platform/provider controls were not inspected
- User impact: Abuse can delay or crowd out legitimate contact messages.
- Search impact: None demonstrated.
- Security impact: Distributed spam and resource-consumption controls are weaker than the code's local threshold suggests.
- Business impact: Transactional-email cost, inbox noise, rate-limit exhaustion, and support overhead.
- Remediation: Enforce request size at the platform/stream boundary before form parsing; replace or supplement the process map with a shared edge/provider rate limit keyed by a privacy-preserving salted token; add global/provider quotas and monitoring. Keep validation and the honeypot. Introduce a challenge only if telemetry shows it is needed, to avoid unnecessary accessibility friction.
- Effort: Medium
- Owner: Application engineering / platform operations
- Dependency: Shared store or edge rate-limit feature; data-retention/privacy decision; provider quota visibility
- Verification: Staging tests cover multiple instances, concurrent/distributed clients, missing/chunked/oversized bodies, honeypot behavior, normal submissions, and email-provider quota alerts. Do not send production test messages without owner approval.

### SEC-P2-005 — DMARC is absent

- Category: Email authentication / anti-spoofing
- Affected component: \_dmarc.suvroghosh.in DNS policy
- Evidence: Both local recursive DNS and a public DNS-over-HTTPS summary returned no DMARC TXT record. MX, SPF, and two expected DKIM selectors were present, but actual message alignment and delivery telemetry were not available.
- Severity: P2 — medium
- Confidence: High for record absence
- User impact: Recipients have less policy guidance when mail impersonates the domain.
- Search impact: None demonstrated; email authentication should not be presented as a cause of low organic traffic.
- Security impact: Missing DMARC weakens domain-level anti-spoofing enforcement and reporting.
- Business impact: Greater brand-impersonation risk and less visibility into unauthorized senders.
- Remediation: Follow the staged, owner-reviewed rollout in EMAIL_REPUTATION_APPENDIX.md: first validate SPF/DKIM alignment for every real sender, then publish monitoring policy, observe reports, correct sources, and move toward quarantine/reject. Do not publish enforcement or reporting destinations without owner approval.
- Effort: Medium, spread over a monitoring period
- Owner: Domain/DNS owner and email administrator
- Dependency: Complete sender inventory, a private aggregate-report processor/mailbox, and access to provider message headers
- Verification: Representative mail from each authorized service passes SPF, DKIM, and DMARC alignment; aggregate reports show only expected sources; policy is advanced without legitimate-delivery regression.

### SEC-P3-001 — DNSSEC and CAA are absent

- Category: DNS and certificate-issuance hardening
- Affected component: suvroghosh.in delegation and apex CAA
- Evidence: Authoritative RDAP reported delegationSigned false. Independent DNS queries returned no DS, no DNSKEY, and no CAA. Nameservers are operated by the deployment DNS provider.
- Severity: P3 — low / hardening
- Confidence: High
- User impact: No current outage or interception was observed.
- Search impact: None demonstrated.
- Security impact: DNS responses lack DNSSEC's authenticity chain, and certificate authorities receive no domain-specific issuance restriction through CAA.
- Business impact: Incremental reduction in defense in depth, not an active incident.
- Remediation: Confirm the DNS/registrar provider's supported DNSSEC workflow and recovery/rollover procedure before enabling it; a broken DS can take the whole domain offline. Inventory every authority used by the deployment provider before publishing CAA, including automated renewal and wildcard issuance. Monitor CT regardless.
- Effort: Small implementation, medium operational planning
- Owner: DNS/registrar owner with platform engineering
- Dependency: Provider support, registrar access, documented key rollover/recovery, and complete certificate-authority inventory
- Verification: DS and DNSKEY validate through independent resolvers without serving failure; automated certificate renewal succeeds; CAA authorizes every required issuer and rejects an unauthorized test only in a safe provider-supported workflow.

### SEC-P3-002 — Browser-policy hardening is intentionally partial

- Category: HTTP response hardening
- Affected component: production response headers and CSP templates
- Evidence: HTTPS redirects, HSTS, X-Frame-Options: DENY, nosniff, restrictive referrer policy, permissions restrictions, and script CSP controls were present on sampled routes. Dynamic contact and protected-application routes used nonce-based CSP with frame-ancestors none and form-action self. The static homepage/article CSP was delivered as a meta policy; X-Frame-Options supplies framing protection because frame-ancestors is ineffective in a meta CSP. HSTS omitted includeSubDomains/preload; style-src permits unsafe-inline; COOP/COEP/CORP were absent; selected connect sources include provider wildcards.
- Severity: P3 — low / hardening
- Confidence: High for sampled responses
- User impact: No current exploit or broken behavior was demonstrated.
- Search impact: None demonstrated.
- Security impact: There is room to narrow browser trust boundaries, but some stronger controls could break YouTube, analytics, fonts, embedded notebooks, or undeclared subdomains.
- Business impact: Low current risk; unsafe rollout could create availability or analytics regressions.
- Remediation: Move static-page CSP to a response header where practical, inventory inline styles and exact provider endpoints, then narrow style/connect sources. Evaluate HSTS includeSubDomains only after inventorying every subdomain and recovery path. Add COOP/COEP/CORP only when an isolation requirement exists and compatibility tests pass. Keep X-Frame-Options/nonce controls until equivalent policy coverage is verified.
- Effort: Medium
- Owner: Web engineering / platform engineering
- Dependency: Complete third-party and subdomain inventory; analytics, YouTube, fonts, notebook, and authentication compatibility tests
- Verification: Automated header assertions plus browser tests across the homepage, article, contact, protected application surfaces, YouTube, analytics, and direct notebook routes; no CSP violations beyond explicitly accepted reports.

## Negative evidence and controls that passed

These observations reduce the probability of a current source-level compromise. They do not change the access-required verdicts for private consoles or reputation services.

### Redirects, transport, and browser responses

- HTTP apex and www redirected to HTTPS; HTTPS apex redirected to the canonical www origin.
- Apex and www passed hostname validation with the local trust store, negotiated TLS 1.3 and HTTP/2, and presented the expected apex/wildcard certificate at 2026-08-06T12:56:56+05:30.
- Sampled homepage, article, contact, protected application, and notebook pages contained no active HTTP script, stylesheet, image, media, or iframe references.
- No sampled passive GET set a cookie.

### Cloaking and injected-link checks

- At 2026-08-06T12:58:42+05:30, five homepage requests representing desktop, Googlebot, Bingbot, Google-referrer, and LinkedIn-referrer contexts returned HTTP 200 at the same canonical URL.
- All five homepage responses were byte-for-byte identical and produced the same visible-text digest, title, and outbound-link set.
- No suspicious outbound destination matching the tested spam/pharmacy/gambling/adult/crypto-investment patterns was found in the tracked text corpus or production samples.
- Anchors hidden in the rendered homepage were attributable to closed navigation/command-palette UI and an off-screen same-site affordance; no hidden injected outbound link was observed.

### Source sinks and embeds

- The two raw-HTML sinks are bounded by context: JSON-LD serialization escapes script-breaking characters, and Pagefind excerpt markup is generated from the repository-controlled index with entity encoding. No exploit was demonstrated. Add regression cases for script-closing content if these trust boundaries change.
- The two iframe components are expected: a same-origin encoded notebook path with an empty sandbox token set, and a YouTube embed with a constrained video identifier.
- Runtime eval, new Function, document.write, JavaScript URLs, meta-refresh redirects, hidden spam markup, and long encoded payloads were not found by the tested patterns. The only eval string hits were negative tests.

### Service worker

- The production service worker was same-origin and contained no remote host, eval, new Function, or importScripts use.
- Source review showed same-origin GET-only caching, exclusions for private application and server-only route groups, no caching of private/no-store/set-cookie responses, expiry/deletion behavior, and expected public-content caches.
- No unexpected service-worker registration or alternate worker file was found.

### Secrets and dependency provenance

- Common private-key, cloud/API-token, live-payment-key, JWT, and generic secret-assignment patterns returned no candidate in the current tracked text set.
- Historical file paths did not show a committed local environment file; the existing ignored local environment file was not opened.
- Every lockfile resolved URL used HTTPS and the npm registry host; no Git/HTTP/alternate-registry resolution was present.
- npm audit signatures completed successfully for 459 packages and reported 120 attestations. Signature success is positive provenance evidence, not proof that every package is vulnerability-free.
- Five packages declared install scripts; they corresponded to expected build/runtime packages in the installed graph. No unexpected installer payload was established.

### Forms and authentication

- Contact fields are length-bounded and validated, with a honeypot and baseline local rate limit.
- Reviewed protected application authentication and recovery handlers use no-store/noindex-style controls, secure HttpOnly SameSite=Lax cookies outside localhost, scoped recovery state, safe return-path handling, HMAC-protected recovery grants, and durable fail-closed database rate limits.
- The optional speech-service upstream destination is server-configured, so the reviewed input does not create a user-selected network target.

## Certificate and subdomain assessment

- Public CT returned one currently unexpired issuance containing only suvroghosh.in and its wildcard. The live leaf matched the expected names and validity window.
- crt.sh did not return a usable response during the audit, so CT corroboration is incomplete.
- A synthetic nonexistent label resolved because of wildcard DNS and returned a generic HTTPS 404. This did not expose an unexpected application.
- Wildcard issuance and DNS make passive host enumeration incomplete. No “all subdomains verified” claim is made.
- Owner verification should compare Vercel/domain inventories, DNS records, CT alerts, and provider project mappings. Remove any unknown mapping only after confirming ownership and traffic, because deletion can be destructive.

## Validation commands and summarized results

| Check                              | Result                                                                                                             |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| npm audit --json                   | Exit 1; 3 vulnerable packages: 0 critical, 2 high, 1 moderate                                                      |
| npm audit --omit=dev --json        | Exit 1; PostCSS remains in the resolved production/peer graph                                                      |
| npm audit signatures               | Exit 0; 459 registry signatures and 120 attestations verified                                                      |
| npm ls --all --json                | Exit 0; dependency graph resolved; two optional/platform packages appeared extraneous, with no compromise evidence |
| Lockfile resolution review         | 586 resolved package URLs, all HTTPS to registry.npmjs.org                                                         |
| Remote script/SRI scan             | Four remote executable scripts in two notebook files; zero integrity attributes on those elements                  |
| Mixed active-content sample        | Zero HTTP active references in the sampled production pages                                                        |
| Homepage variation comparison      | Five response bodies and visible-text representations identical                                                    |
| Secret/suspicious-source heuristic | Zero credential candidates and zero suspicious outbound destinations under the tested patterns                     |

No package, source, deployment, DNS, account, or provider setting was changed as part of this security audit.
