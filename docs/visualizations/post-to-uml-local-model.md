# Post to UML: local heuristic limits

The local extractor is an offline convenience, not a language model. It recognizes
explicit text patterns and produces conceptual views. It does not establish that
the article describes an implemented software architecture. The AI provider path
receives the original article and numbered source paragraphs and can interpret
broader prose; it does not inherit the local extractor's capability decisions.

## Evidence and limits

- Input exceeding 120,000 Unicode code points is rejected, not truncated.
- Paragraph spans retain the original text and offsets, including CRLF. Fenced
  code blocks remain numbered source material for provider evidence, but the local
  prose extractor does not interpret or execute them.
- Evidence quotes are exact source passages. They are not generated paraphrases
  or excerpts with an ellipsis substituted for missing text.
- The local glossary holds at most 40 named concepts. A warning identifies that
  limit. Figures select smaller subsets for readability; Simple and Detailed
  settings change the displayed subset, never create additional facts.
- Capitalized names are concept candidates. This is not a general-purpose noun
  phrase parser or a complete semantic analysis of the article.
- Local figures are labeled conceptual. Inspect their evidence before publishing.

## Recognized patterns

| View                 | Local evidence required                                                                                           | Deliberate omissions                                                                                                                                                 |
| -------------------- | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Class                | Explicitly named concepts, with direct affirmative statements such as `Gateway uses Registry`                     | No default methods, attributes, multiplicities, or links from co-occurrence. `contains` does not establish lifecycle ownership.                                      |
| Object               | `order17 is an instance of Order`; optional explicit slots such as `order17.status = Approved`                    | Dates, numeric measurements, and arbitrary record identifiers do not establish a classifier binding. Instance links are not invented.                                |
| Package              | Named concepts grouped by explicit article headings                                                               | The caption identifies editorial grouping. Headings do not establish software package dependencies.                                                                  |
| Component            | Explicitly named components, services, applications, or modules, such as `Sender component`                       | No invented interfaces or contracts. Only supported dependencies are retained.                                                                                       |
| Composite structure  | No general local prose interpretation                                                                             | Returns Needs more information. Use explicit manual source or provider-backed interpretation for parts, ports, and connectors.                                       |
| Deployment           | `Gateway is deployed on EdgeServer`, `Gateway hosted in NationalCluster`, or equivalent supported hosting pattern | Merely mentioning a clinic, database, or server does not establish hosting. No second host, protocol, or network edge is synthesized.                                |
| Profile              | `The stereotype Audited extends UML metaclass Class`                                                              | Ordinary domain concepts are not automatically promoted to stereotypes. Tagged values and constraints are not synthesized.                                           |
| Use case             | Explicit capability such as `Reader can download a report`                                                        | No invented actors, include/extend links, or goals taken from arbitrary paragraph text.                                                                              |
| Activity             | Explicit numbered or First/Then/Next/Finally actions                                                              | No implied control flow from paragraph order. Conditional, parallel, and loop prose outside the supported patterns requires AI or manual modeling.                   |
| State machine        | `Order transitions from Pending to Complete`                                                                      | No initial/final states, entry actions, triggers, guards, or effects are added. Different subjects retain separate state identifiers.                                |
| Sequence             | Named sender, message, recipient, stated ordering, and explicit synchronous/asynchronous delivery                 | `Sender sends Request to Receiver` leaves synchrony unspecified and is insufficient for a sequence arrowhead. No acknowledgement or return is synthesized.           |
| Communication        | Explicit sender/message/recipient exchanges with stated order for multiple messages                               | Numbering represents source-stated order. Independent exchanges are not placed into a fabricated chronology.                                                         |
| Interaction overview | No general local prose interpretation                                                                             | Arbitrary paragraphs do not become named interactions. Use manual source or provider-backed interpretation.                                                          |
| Timing               | At least two timed state observations, e.g. `At 0 seconds, Clock is Idle. At 500 milliseconds, Clock is Running.` | Dates, deadlines, or durations alone do not establish state observations. Numeric ticks are converted to seconds without inventing durations or interpolated events. |

For ordered sequence examples, use explicit delivery semantics:

```text
First, Sender asynchronously sends Request to Receiver.
Then, Receiver asynchronously sends Receipt to Sender.
```

When **Allow illustrative assumptions** is enabled, the local path can provide
clearly labeled example instances and an illustrative `0, 10, 20` timing view.
These are explicitly marked in both metadata and captions. The option does not
force every requested type into a diagram.

## Verification boundaries

`grounding.test.ts` covers false co-occurrence links, fabricated infrastructure and
timing, exact evidence/offsets, explicit source patterns, opt-in assumptions, input
limits, and manual-edit review state. The broader feature tests exercise the
authoring/result contract. Renderer compatibility requires the separate genuine
PlantUML tests; local parser success is not that evidence.

The local extractor intentionally returns fewer diagrams than the earlier
template-driven implementation. Needs more information is a content/interpretation
outcome, separate from a renderer limitation or an operational error.
