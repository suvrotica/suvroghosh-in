---
title: "One Bad Afternoon"
description: "A requirements brief begins where your Thursday fell apart: a Calcutta logistics office, a late report, and the woman holding its broken systems together."
date: "2026-10-25"
thumbnail: "/images/art-one-bad-afternoon.jpg"
thumbnailAlt: "An old Calcutta office desk buried in spreadsheet printouts, with a glowing computer, an off-hook red telephone, and sunset through the window."
category: "Engineering Blog"
tags: ["Engineering Blog", "Requirements", "Systems", "Operations", "Software", "Automation", "Data Integration", "Calcutta", "Kolkata", "SuvroGhosh"]
pinnedTags: ["Engineering Blog", "Requirements", "Systems", "Operations", "Software", "Automation", "Data Integration", "Calcutta", "Kolkata", "SuvroGhosh"]
published: true
color: "#8B5CF6"
---

<TTS />

<Pi src="/images/art-one-bad-afternoon.jpg" alt="An old Calcutta office desk buried in spreadsheet printouts, with a glowing computer, an off-hook red telephone, and sunset through the window." />

Ask a man what software his business needs and he will stare at you like you asked him to conjugate Sanskrit verbs in a burning building. Ask him what ruined last Thursday and watch the requirements arrive, hot, specific, and smelling of burnt coffee. The abstract becomes concrete very quickly when it has recently kicked you in the teeth.

Let us invent a man called Bapi and immediately violate his privacy. He runs a mid-sized logistics firm in the kidney-shaped hell of central Calcutta. Last Thursday, at precisely 2:33 PM, when the afternoon heat had turned his office into a tandoor with ceiling fans, his biggest client called asking for the quarterly compliance report. The report was late. Not slightly late, not fashionably late, but late enough that Bapi had already promised it twice, and the client had stopped asking when it would arrive and started asking whether there was a problem.

There was a problem.

What happened next was an archaeology expedition conducted in real time, with panic as the primary excavation tool. Bapi's operations manager, a magnificent woman named Sharmistha who deserves better than this narrative, began the ritual. She opened the shared drive, which is what we call that digital landfill where files go to decompose. She found the master spreadsheet, Admin_Final_FINAL_v2.xlsx, maintained until recently by someone who no longer worked at the company, having presumably fled to the hills to escape the very chaos he had authored.

The data was not wrong, exactly. It was worse than wrong. It was almost right, which is a dangerous state for information to achieve, like a bridge that looks solid until you are standing in the middle of it. The dispatch records lived in a database, the billing records in another spreadsheet, and the client's reporting instructions in a PDF that had been scanned upside down in 2019. Nobody was quite sure whether those instructions were still current. While the account manager chased that answer, Sharmistha tried to establish why a canceled shipment was still being billed and why two records for what appeared to be the same delivery had different reference numbers.

Bapi stood behind her chair making those small, desperate breathing sounds that men make when they are watching money evaporate.

She had told him about this before. That was the part she could not say now, because saying it would take time, and they were already late, and somehow the person who had warned them was also the person who had to remain calm while everybody else discovered the emergency. Every quarter somebody said they really should sort this out. Every quarter Sharmistha stayed late and sorted out the report, which everybody seemed to mistake for sorting out the problem.

The afternoon died slowly. The account manager confirmed the current reporting template. Sharmistha reconciled the records, checked the totals, went back over the entries she did not trust. The report, when finally assembled, was a Frankenstein's monster of copy-pasted cells and prayer. They sent it at 7:45 PM. Five hours and twelve minutes after the call.

The client accepted it. Sharmistha went home wondering which mistake she might still have missed. Bapi sat in the dark office afterward, the neon sign from the paan shop across the street blinking red against his face, and realized something that no amount of strategic planning had taught him: he did not need “digital transformation.” He did not need “AI-powered synergy.” He needed last Thursday to never happen again.

This is where the requirements begin, my friends. In the specific, burning, humiliating memory of a particular afternoon when the system failed and everyone saw it fail. Or rather, when the usual arrangement of Sharmistha quietly compensating for its failures stopped being quiet.

The client call triggered the panic. It should not have been what triggered the work; the quarterly deadline was already known. The stall happened at reconciliation, where a human being had to act as an API endpoint, manually translating between records because nobody had established a dependable way to match them. The successful result would look something like this: the report is prepared before the client has to chase it, the numbers come from agreed sources, missing or conflicting records are flagged for someone to resolve, and Sharmistha checks and approves the result.

Perhaps there is a button. Lovely. The button is not the achievement. Bapi goes home at six to drink his whiskey in peace, and Sharmistha gets to go home without carrying the spreadsheet around inside her head.

When you choose your first problem to solve, do not automatically choose the biggest one. Choose the one that bleeds regularly, that somebody can show you, with the actual files open and the actual interruption still fresh in their memory. Small enough to make a useful first map of it in an afternoon, important enough that fixing it justifies the invoice. If it happens weekly and makes someone want to resign, pay attention. Quarterly misery also qualifies. If it happens yearly and involves the CEO, find out what that one failure costs before you run away.

And ask Sharmistha. Bapi can tell you what the afternoon cost him. She can show you where it went.

Here is your one-page brief. Write it like a crime report.

What happened? An overdue quarterly compliance report took another five hours and twelve minutes to assemble, check, and send after the client chased it.

Who was involved? The operations manager, the owner, and the client account manager. Name who supplies the records, who resolves discrepancies, and who approves the finished report. “The team” is how a task acquires six witnesses and no owner.

Where did it stall? Matching dispatch records to billing entries, resolving discrepancies, and confirming which reporting instructions applied.

What does success look like? A report prepared from the agreed sources using the current, client-approved template, with missing records, duplicates, and mismatches brought to the reviewer's attention before submission.

What is the boundary? This client's quarterly report and the reconciliation needed to produce it. Not all reporting. Not a replacement for the dispatch system. Not, while we are here, a complete reinvention of the business because the consultant has discovered another slide.

When do we know it is fixed? Agree on something testable. For example: Sharmistha can reproduce two previously checked quarterly reports from their source records, deliberate errors in test data are caught, and a routine report can be prepared and reviewed within thirty minutes once complete inputs are available. Unresolved discrepancies prevent it from being marked ready. She signs off on the result.

Visible sweating is useful evidence that something is wrong. Its absence is a poor acceptance test. Some people have simply given up.

This is how software projects should begin. Not with a vendor demo, not with a blockchain, not with a PowerPoint that looks like a unicorn vomited on a spreadsheet, but with the simple, bitter memory of one bad afternoon when the machinery of commerce ground to a halt and everyone stood around watching the gears smoke, except for the woman expected to put her hands into them.

Find that afternoon. Write it down. That is the first page of your requirements document. You still have to work through permissions, exceptions, dependencies, and what happens when the thing breaks. But now those questions belong to an actual problem, and somebody can tell you whether you have solved it.

Preferably Sharmistha, before everybody else declares victory and goes home.

P.S. Bapi bought the software eventually, on the strength of a very impressive demo. It did not work. But that is another story, and it requires stronger drink.
