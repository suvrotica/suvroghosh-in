# Email reputation appendix

## Executive verdict

The domain's actual sender reputation and inbox placement are UNVERIFIED — ACCESS REQUIRED. Public DNS proves that mail routing, SPF, and expected DKIM public keys exist, but DNS records do not prove that sent messages are aligned, that recipients accept them, or that provider/IP reputation is healthy.

Two public domain/URI blocklists returned authoritative negative answers:

- Spamhaus DBL: CLEAN — VERIFIED
- SURBL: CLEAN — VERIFIED

No DMARC policy is published. That is the principal email-authentication hardening gap. It should be corrected through a staged owner-reviewed rollout after validating Zoho and transactional-mail alignment; publishing enforcement prematurely can reject legitimate mail.

- Generated: 2026-08-06T13:07:13+05:30
- DNS/reputation observation window: 2026-08-06T12:57:11+05:30 to 2026-08-06T13:03:00+05:30
- Targets: suvroghosh.in and the configured transactional send subdomain
- Privacy: public report omits mailbox names, public keys, raw TXT values, account identifiers, message headers, and network addresses
- Safety boundary: no message was sent, no inbox was accessed, no provider console was opened, and no DNS or delisting action was taken

## Reputation is not the same as configuration

| Layer                  | Question                                                                                                       | Evidence available here                                             |
| ---------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| DNS authentication     | Are authorized senders declared and are public signing keys/policy records present?                            | Public MX, SPF, DKIM, and DMARC DNS state                           |
| Domain/URI lists       | Is the exact domain currently present in the tested public list?                                               | Controlled Spamhaus DBL and SURBL DNS queries                       |
| Provider reputation    | Do Google, Microsoft, Zoho, or the transactional provider see spam complaints, blocks, or degraded reputation? | Requires owner dashboards or sanitized exports                      |
| Message authentication | Did an actual message pass SPF, DKIM, and DMARC alignment?                                                     | Requires full sanitized headers from representative delivered mail  |
| Deliverability         | Did real consented mail reach inbox, spam, quarantine, or bounce?                                              | Requires recipient/provider evidence; a DNS lookup cannot answer it |

## Public DNS posture

Checked at 2026-08-06T13:02+05:30 with local recursive DNS and, for absence confirmation, a public DNS-over-HTTPS summary. Values are intentionally summarized rather than reproduced.

| Control                              | Observed state                                                  | Confidence | Interpretation and caveat                                                                                                                                   |
| ------------------------------------ | --------------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MX at apex                           | Present; routes to Zoho                                         | High       | Inbound mail routing is configured. This says nothing about outbound inbox placement.                                                                       |
| Apex SPF                             | Present; one Zoho authorization; softfail policy                | High       | Consistent with Zoho mail. Softfail is less strict than hard fail. The record should not be hardened until every legitimate envelope sender is inventoried. |
| Transactional send-subdomain MX      | Present; routes to the transactional provider                   | High       | Consistent with a custom return path/bounce domain. Actual return-path use must be confirmed from a sent message.                                           |
| Transactional send-subdomain SPF     | Present; authorizes the transactional provider; softfail policy | High       | Provider authorization exists. It does not prove alignment with the visible From domain.                                                                    |
| Zoho DKIM selector                   | Public key present                                              | High       | DNS can support signature validation. It does not prove current messages carry a valid signature or align with From.                                        |
| Transactional-provider DKIM selector | Public key present                                              | High       | DNS can support signature validation. The public key was not reproduced in this report. Actual signing and alignment remain unverified.                     |
| DMARC at apex                        | Absent                                                          | High       | Receivers have no domain-published DMARC policy or aggregate-report destination. This weakens anti-spoofing visibility and policy enforcement.              |
| DNSSEC                               | Absent                                                          | High       | Email authentication records are not covered by a DNSSEC chain. This is general DNS hardening, not sender reputation.                                       |

Google's current [email sender guidelines](https://support.google.com/mail/answer/81126?hl=en) recommend SPF, DKIM, and DMARC and require DMARC for bulk senders to personal Gmail accounts. They also make alignment, complaint rate, TLS, message format, and unsubscribe behavior distinct requirements. Zoho's [DMARC guidance](https://www.zoho.com/mail/help/adminconsole/dmarc-policy.html) likewise recommends a phased none → quarantine → reject rollout after SPF/DKIM are configured. Resend's [domain documentation](https://resend.com/docs/dashboard/domains/introduction) confirms that its default custom return path uses a send subdomain and that SPF/DKIM dashboard status must be verified.

## Public reputation evidence

| Service                          | Exact target                                        | Checked (IST)             | Verdict                      | Confidence                    | Evidence, scope, and caveat                                                                                                                                                                                                                                                                            |
| -------------------------------- | --------------------------------------------------- | ------------------------- | ---------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Spamhaus Domain Blocklist        | suvroghosh.in.dbl.spamhaus.org                      | 2026-08-06T12:57:11+05:30 | CLEAN — VERIFIED             | High                          | Target query returned NXDOMAIN while Spamhaus's documented DBL control returned a response in the same run. The [Spamhaus DBL FAQ](https://www.spamhaus.org/faqs/domain-blocklist/) defines NXDOMAIN as not listed. This is a DBL point-in-time verdict, not provider/IP reputation or delivery proof. |
| SURBL multi-zone                 | suvroghosh.in.multi.surbl.org                       | 2026-08-06T12:57:11+05:30 | CLEAN — VERIFIED             | High                          | Target returned NXDOMAIN while SURBL's documented permanent test point returned a response. See the [SURBL FAQ](https://www.surbl.org/faqs). This is URI/domain-list evidence, not inbox placement.                                                                                                    |
| VirusTotal domain engines        | suvroghosh.in                                       | 2026-08-06T12:30+05:30    | UNVERIFIED — ACCESS REQUIRED | High confidence in access gap | The public view exposed no engine data and the UI endpoint rate-limited the request. The API requires a key. No rescan/upload occurred. VirusTotal should not be inferred negative from an unavailable response.                                                                                       |
| Google Postmaster Tools          | Visible From domain(s) actually used                | 2026-08-06T13:03+05:30    | UNVERIFIED — ACCESS REQUIRED | High confidence in access gap | Requires domain verification, authenticated dashboard access, and sufficient mail volume. Needed evidence: domain/IP reputation, spam rate, authentication, delivery errors, and encryption.                                                                                                           |
| Zoho sender/delivery telemetry   | Zoho-hosted outbound mail for the domain            | 2026-08-06T13:03+05:30    | UNVERIFIED — ACCESS REQUIRED | High confidence in access gap | No admin console, bounce log, complaint report, or representative header was accessed.                                                                                                                                                                                                                 |
| Transactional-provider telemetry | Configured transactional sending domain             | 2026-08-06T13:03+05:30    | UNVERIFIED — ACCESS REQUIRED | High confidence in access gap | No provider dashboard, delivery event, suppression list, complaint rate, or domain-verification status was accessed.                                                                                                                                                                                   |
| Microsoft recipient reputation   | Domain plus actual sending IP/provider route        | 2026-08-06T13:03+05:30    | UNVERIFIED — ACCESS REQUIRED | High confidence in access gap | No recipient headers, bounce codes, Microsoft deliverability portal, or sender/provider IP inventory was available. SNDS is useful only when the owner/provider controls the relevant sending IP space.                                                                                                |
| Actual inbox placement           | Representative, consented messages from each sender | 2026-08-06T13:03+05:30    | UNVERIFIED — ACCESS REQUIRED | High confidence in access gap | No message was sent and no recipient inbox was inspected. A seed test is an external action and must be owner-authorized.                                                                                                                                                                              |

## Finding EMAIL-P2-001 — No DMARC policy

- Category: Email authentication / anti-spoofing
- Affected component: \_dmarc.suvroghosh.in
- Evidence: No DMARC TXT record was returned by two independent public-DNS methods at 2026-08-06T13:02+05:30. Apex and transactional SPF plus two expected DKIM selectors were present.
- Severity: P2 — medium
- Confidence: High
- User impact: Recipients have less protection and less consistent receiver policy when an attacker spoofs the domain.
- Search impact: None demonstrated. Email authentication is not a credible direct explanation for low organic web traffic.
- Security impact: No DMARC alignment policy, aggregate telemetry, or reject/quarantine instruction is published.
- Business impact: Increased impersonation/phishing exposure and less visibility into unauthorized sending sources; potential deliverability-policy friction for bulk mail.
- Remediation: Execute the staged plan below. Do not jump directly to reject.
- Effort: Medium over a monitoring period
- Owner: DNS/domain owner and email administrator
- Dependency: Complete sender inventory, owner-controlled aggregate-report handling, sanitized message headers, Zoho/transactional-provider dashboard access
- Verification: Every legitimate source passes aligned SPF or DKIM; aggregate reports show no unknown legitimate source; the published policy is syntactically valid and advances without legitimate delivery regression.

## Staged owner plan

### Stage 0 — Inventory before DNS changes

1. Enumerate every system allowed to use a From address under the domain: Zoho users/aliases, the website contact workflow, authentication/recovery mail, transactional provider streams, monitoring, newsletters, forwarding, and any dormant service.
2. Export sanitized provider domain-status screens. Record whether the provider owns shared sending IPs; do not expose the IPs in this public audit.
3. Obtain a full header from one consented message per real sender to a mailbox the owner controls. Redact recipient/local-part and network addresses before storing any audit evidence.
4. For each header, record only pass/fail and aligned-domain results for SPF, DKIM, and DMARC; also retain provider message ID privately for support.

Close condition: every legitimate source and its visible From domain, envelope/return-path domain, and DKIM signing domain are known.

### Stage 1 — Correct authentication and alignment

1. In Zoho Admin Console, confirm the domain and current DKIM selector are verified and that new mail carries a valid aligned signature.
2. In the transactional provider, confirm SPF and DKIM status, the configured return-path/send subdomain, and the From domain actually used by the application.
3. Do not add the transactional service blindly to apex SPF if it uses an aligned custom return-path subdomain and aligned DKIM. SPF has a ten-DNS-lookup evaluation limit; minimize includes and follow provider guidance.
4. Keep one SPF record per exact domain. After all sources are proven, consider moving softfail to hard fail at each applicable envelope domain, separately and with rollback.
5. Confirm TLS, RFC-conformant message formatting, and one-click unsubscribe requirements for any subscribed or promotional stream. Transactional messages should remain clearly separated from marketing reputation.

Close condition: representative messages from every legitimate source pass SPF and DKIM, with at least one DMARC-aligned identity.

### Stage 2 — Publish DMARC monitoring

1. Create an owner-controlled aggregate-report processor/mailbox. Keep its address private; aggregate reports can reveal sender infrastructure.
2. Publish exactly one valid DMARC TXT record at the apex with monitoring policy, aggregate reporting, and an explicitly reviewed subdomain/alignment policy.
3. Start with p=none. Do not add forensic/failure-report delivery unless the owner accepts its privacy implications and provider support.
4. Validate from independent public resolvers and the mail providers' verification tools after TTL propagation.
5. Monitor for at least two to four weeks or a complete representative sending cycle. Classify unknown sources before authorizing them.

Close condition: reports are arriving, all legitimate sources are aligned, and unknown traffic is either spoofing or remediated.

### Stage 3 — Enforce gradually

1. Move to quarantine for a limited percentage only after the monitoring close condition is met.
2. Increase coverage gradually while watching legitimate bounce, spam-folder, and support signals.
3. Move to reject only when 100% of intended traffic is authenticated/aligned and forwarders/third parties have been considered.
4. Define a rollback procedure and responsible owner before each change.

Close condition: full enforcement is stable, legitimate delivery is unaffected, and reporting continues.

### Stage 4 — Measure real reputation

1. Connect Google Postmaster Tools for the actual sending domain if traffic volume is sufficient; retain aggregate screenshots/exports privately.
2. Review Zoho and transactional-provider delivery, bounce, complaint, suppression, and domain-verification telemetry.
3. For Microsoft recipients, analyze actual enhanced status codes and the provider-controlled IP reputation route. Do not claim an SNDS result for a shared IP the site owner does not control.
4. Run a small, owner-authorized seed test only to consented mailboxes. Record inbox/spam/reject outcome and full authentication results. Do not send unsolicited test mail.
5. Monitor Spamhaus DBL and SURBL periodically with their authorized methods and controls; do not poll abusive or CAPTCHA-protected web endpoints.

Close condition: authenticated messages from each sender reach expected recipient classes, complaint/bounce rates are within provider guidelines, and no active blocklist entry is present.

## Delisting response if a future listing appears

### Spamhaus DBL

1. Reproduce the exact listing through [Spamhaus Blocklist Removal Center](https://check.spamhaus.org/) in an owner-controlled browser.
2. Identify and remove the abusive message/URL, compromised account, redirect, or unauthorized sender that caused it.
3. Rotate compromised credentials and review adjacent provider events.
4. Follow the exact DBL result's free removal workflow. Preserve the case and recheck timestamp.

### SURBL

1. Confirm the exact domain and category in SURBL Lookup.
2. Remove the spam-advertised/malicious destination and fix the sending or hosting compromise.
3. Use SURBL's documented removal form for that record after remediation.
4. Verify the list result and real delivery separately.

### Provider or recipient block

1. Preserve the exact SMTP enhanced status code, provider event, message ID, From domain, signing domain, and timestamp privately.
2. Determine whether the failure is authentication, rate, content, complaint, suppression, recipient policy, or shared-IP reputation.
3. Fix the specific cause before appealing. Provider reputation cannot be repaired by changing web SEO metadata.
4. Appeal through the actual sending provider/recipient channel; on shared infrastructure, the provider normally owns IP-level remediation.

## Traffic-diagnosis implication

The two verified negative domain-list results reduce concern about Spamhaus DBL or SURBL as current causes of mail filtering. They do not establish good sender reputation. Conversely, missing DMARC can affect spoofing protection and high-volume email acceptance, but it does not explain Google/Bing organic-search traffic. Web search, browser safety, domain/URI lists, provider reputation, and recipient inbox placement must remain separate evidence tracks.
