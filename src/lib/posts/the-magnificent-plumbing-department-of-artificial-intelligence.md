---
title: "The Magnificent Plumbing Department of Artificial Intelligence"
description: "A satirical field guide to MCP servers, tools, skills, plugins, connectors, apps, hooks, agents, subagents, memory, and automations."
date: "2026-08-11"
category: "Artificial Intelligence"
tags: ["MCP", "Model Context Protocol", "Skills", "Plugins", "Connectors", "Agents", "ChatGPT", "Codex", "suvrotica", "suvroghosh"]
pinnedTags: ["MCP", "Model Context Protocol", "Skills", "Plugins", "Connectors", "Agents", "ChatGPT", "Codex", "suvrotica", "suvroghosh"]
published: true
status: "living"
color: "#8B5CF6"
thumbnail: "/thumbnail/art-the-magnificent-plumbing-department-of-artificial-intelligence.jpg"
thumbnailAlt: "Charcoal caricature of a brooding man in profile, chin resting on his fist, drawn on warm canvas"
---

<TTS />

<Pi src="/thumbnail/art-the-magnificent-plumbing-department-of-artificial-intelligence.jpg" />

I had scarcely learned to say “large language model” without imagining an enormously overweight Bengali gentleman reciting Shakespeare when the industry produced tools. Then tools acquired servers. Servers acquired protocols. Protocols acquired skills. Skills were married into plugins. Plugins began keeping connectors as domestic servants. Connectors sprouted apps, apps displayed widgets, widgets summoned agents, agents bred subagents, and somebody attached hooks to the whole reproductive catastrophe so that commands could leap out at predetermined moments and bite the operating system on the ankle.

This is progress. Progress is what we call confusion after venture capital has purchased typography.

The central difficulty is not that these things are especially complicated. A carburetor is complicated. The human complement system is complicated. Trying to understand why a Calcutta landlord believes a damp room beside an open drain constitutes “premium accommodation” is complicated. MCP and skills are mostly ordinary software ideas dressed for a conference at which every noun must arrive wearing a new lanyard.

The shortest honest distinction is this:

MCP gives the model hands and doors.

A skill gives it a method.

A plugin puts the hands, doors, method, name badge, packaging, connection metadata, and possibly a decorative little interface into one installable suitcase. Permissions and approvals remain partly in the surrounding host, because even the suitcase is not permitted to issue its own passport.

Everything else is elaboration, administration, nomenclature, and the continuing human attempt to sell a suitcase by calling it an autonomous mobility ecosystem.

MCP means Model Context Protocol. “Protocol” descends through Greek and Late Latin from prōtokollon, the first sheet glued to a manuscript roll, the administrative cover page telling officials what the enclosed bureaucratic entrails were. Two thousand years later, the word still means approximately the same thing: an agreed form by which two parties communicate without having to sniff one another ceremonially like dogs.

A model cannot ordinarily rummage through Gmail, query a hospital database, inspect Figma, fetch an issue from GitHub, or discover whether I have once again forgotten to pay a bill. It produces tokens. Brilliant tokens, sometimes; idiotic tokens with an Oxford accent, sometimes. But still tokens. It has no natural arm reaching into the world.

An MCP server supplies that arm.

More precisely, it advertises capabilities in a standard form. Some capabilities are tools: actions the model may request, such as searching messages, reading a file, creating an issue, querying a database, or inspecting a browser page. Some are resources: pieces of context a client may retrieve. MCP also defines prompts and other primitives, although every host does not necessarily support or expose every primitive in precisely the same fashion.

The server defines its tools, their schemas, optional server instructions, authentication requirements, structured results, and related metadata. The client and host conduct the connection and sign-in flows and impose their own approval policies; the server integration still defines and enforces the access it requires. The model, acting through an MCP client inside a host such as ChatGPT or Codex, learns what is available and may request a tool call with structured arguments.

The arrangement resembles a restaurant. The model is the diner. The MCP server is the kitchen-facing waiter. The tool schema is the menu. Authentication is the maître d’ asking whether I actually possess trousers. The external service is the kitchen. The returned result is dinner, although in enterprise software it more often resembles a lukewarm bowl of JSON garnished with an expired OAuth token.

MCP does not, by itself, teach the model good judgment. A waiter may announce that the kitchen can prepare fish, goat, custard, and industrial solvent. This does not constitute a recipe, a meal plan, or maternal guidance. It merely describes available operations.

That distinction matters because people now say, “We have an MCP,” as though they have captured electricity. What they usually mean is that they have an MCP server exposing three API calls which already existed, except the calls have been placed behind a fashionable protocol and photographed against a purple gradient.

Still, MCP solves a real problem. Before a common protocol, every AI application needed bespoke glue for every service. One model spoke GitHubish, another Dropboxese, another the ancient nasal dialect of Salesforce. MCP attempts to provide a shared grammatical customs post through which tools and context can pass.

The protocol defines more possibilities than every host necessarily implements. ChatGPT on the web, the ChatGPT desktop application, Codex CLI, and IDE extensions need not expose identical transports, resources, interface components, permissions, or configuration behavior. A protocol is a common language, not a divine order compelling every household to discuss the same subjects at dinner.

A skill is not this.

A skill is packaged know-how: instructions, decision points, examples, references, scripts, templates, assets, and expectations for accomplishing a recognizable task. If MCP says, “Here is a scalpel,” the skill says, “Wash your hands, identify the patient, confirm the side, make the incision here, do not improvise because you watched twelve minutes of surgery on YouTube, and count the instruments before closing.”

The skill may use MCP tools, ordinary local tools, scripts, attached files, or no tool at all. A writing skill may merely specify voice, structure, exclusions, examples, and a quality-control procedure. A spreadsheet skill might describe how to inspect formulas, preserve formatting, recalculate, render, and verify the workbook. A Gmail skill might explain how to search threads, resolve recipients, draft a reply, avoid sending without authorization, and report what happened. MCP provides the live mailbox operations; the skill prevents the model from approaching them like a raccoon encountering a microwave.

In ChatGPT and Codex, an authored skill is a directory anchored by a required SKILL.md file. The name and description help the system decide when the skill applies. The remaining instructions tell the agent what to do after invocation. Optional scripts perform deterministic work; references hold detailed knowledge; assets supply templates or examples. A skill may be invoked explicitly or selected because the request matches its description.

This is less magical than the word suggests. Humans have used skills for millennia. We called them recipes, checklists, liturgies, standard operating procedures, field manuals, apprenticeship notes, and “listen carefully because I am only showing you once.” The AI industry discovered the operating manual and, with the innocence of Columbus discovering a continent containing millions of residents, named it a new capability.

A prompt is usually an instruction for this occasion.

A skill is an instruction system intended for repeated occasions.

That is the practical difference. “Make this presentation restrained, visual, and suitable for hospital executives” is a prompt. A reusable package explaining how to inspect source material, derive a visual system, construct slides, render them, check overflow, repair layout, and deliver the verified deck is a skill. One is tonight’s command. The other is the kitchen’s working procedure, including the note saying the sous-chef becomes dangerous after 9 p.m.

OpenAI currently describes a skill as a reusable workflow containing task-specific instructions and supporting resources. At the simplest product level, it describes a plugin as an installable bundle that can include skills, connectors, or both. Open the box, however, and the supported anatomy may also include direct MCP server configuration, browser extensions, lifecycle hooks, scheduled-task templates, and assets. The short definition belongs on the shop window. The longer inventory is what falls on your foot when you lift the lid.

Now we reach the plugin, where several simple ideas are packed together until the box becomes marketable.

A plugin is distribution and identity. It is the thing one installs.

Suppose somebody creates an MCP server connected to Figma. That server exposes Figma operations. Somebody then writes skills explaining how to inspect a design, compare it with an implementation, preserve components, and report discrepancies. The MCP integration handles its authentication. The package may add icons, assets, hooks, perhaps a browser extension, perhaps a visible interface. The plugin bundles or references these related pieces under a stable name so that users do not have to assemble them from screws, loose wiring, and a README written during a caffeine emergency.

The plugin does not sit inside every runtime request like a toll collector demanding coins from passing JSON. It is chiefly the packaging and installation layer. Once installed, its skills can guide the agent and its configured connections can expose tools. Packaging is not execution, any more than the cardboard box containing a pressure cooker participates in the cooking of rice, though it may later be used by a Bengali family to store seventeen years of electricity bills.

Thus:

The MCP server is the standardized capability and context provider.

An MCP tool is one callable operation exposed and executed by such a server.

A connector, in OpenAI’s current vocabulary, is a prepared connection to an external service such as Gmail, GitHub, Slack, or Google Drive. Connectors expose tools, are backed by MCP servers, and may optionally include custom UI. A remote MCP server may instead be connected more directly and may be operated by OpenAI, another company, an institution, or some sleepless fellow whose privacy policy consists of a shrug.

A skill is the procedural knowledge governing how available capabilities should be combined.

A plugin is the installable package that groups whichever supported pieces the workflow needs: skills, connectors, direct MCP server configuration, hooks, browser extensions, scheduled-task templates, assets, or some compatible mixture of the plumbing.

“App” is the most treacherous label in the cupboard. In casual product speech, it may mean the connected capability presented to the user. In plugin packaging, an .app.json file is specifically a compatibility mapping to a registered MCP server connection; it is not the interface, the server, or a larval autonomous being. Install-surface metadata lives elsewhere in the plugin manifest. When an MCP server returns an optional visual component for ChatGPT to render, that interface follows the MCP Apps standard. The connection, its mapping file, the public-facing capability, and the UI resource are related contraptions, but they are not four interchangeable names for the same lump of software intestine.

The names overlap because software products evolve by geological sedimentation. Yesterday’s “app” becomes today’s compatibility file; yesterday’s “connector” is revealed to be an MCP-backed integration; yesterday’s plugin, a word once associated with browser toolbars and pornography infections, returns wearing an enterprise blazer.

OpenAI’s present plugin format uses a manifest to identify the package and point to bundled components. A package may contain a skills directory, an .app.json connection mapping, an .mcp.json server configuration, assets, lifecycle hooks, browser capabilities, and interface metadata. An .mcp.json file describes a bundled MCP server configuration; it is not the server itself, just as a railway timetable is not a locomotive, however vigorously the railway’s marketing department may vibrate.

The documentation even notes that the .app.json filename survives as a compatibility identifier while the underlying primitive remains the MCP server—a sentence with the faint archaeological melancholy of finding an old railway station beneath a shopping center.

A tool, meanwhile, is merely a callable operation from the model’s perspective. “Search Gmail” may be a tool. “Read attachment” may be another. “Create calendar event” may be another. A tool has a name, a description, an input schema, and a result. The model decides—or is instructed—when to call it.

Calling every tool an agent is marketing incontinence.

A calculator tool is not an agent. A database query is not an agent. A function that resizes an image is not an agent. A doorbell does something when pressed; nobody calls it an autonomous visitor-notification intelligence, although I should not give the doorbell industry ideas.

An agent is a model operating in a loop toward a goal. It observes the situation, reasons about what to do, selects tools or other actions, examines results, revises its approach, and continues until it reaches a stopping condition or has converted the token budget into heat. It possesses some degree of delegated initiative.

The critical ingredient is not consciousness, personality, or an animated orb throbbing on the screen like a technologically embarrassed hemorrhoid. It is control flow.

A normal model call resembles:

$$
y = f(x)
$$

Give it input $x$; receive output $y$.

An agentic loop resembles:

$$
s_{t+1} = T\left(s_t, a_t, o_t\right)
$$

At time $t$, the agent has state $s_t$, chooses action $a_t$, receives observation $o_t$, and updates its state. It can repeat:

$$
\text{observe}
\rightarrow
\text{decide}
\rightarrow
\text{act}
\rightarrow
\text{inspect}
\rightarrow
\text{revise}
$$

The mathematics is not the miraculous part. Thermostats have loops. Bacteria have loops. Calcutta taxi negotiations are adversarial multi-agent loops with hidden state, stochastic pricing, and no known convergence theorem.

A subagent is simply another agent given a bounded portion of the work. One researches, another reviews, another writes code, another tests. The parent agent coordinates their results. This can improve speed or specialization when tasks are genuinely separable. It can also create four simultaneous sources of nonsense, which management will recognize as organizational scaling.

Subagents are not necessarily smaller models, inferior minds, or digital children sent down a mine. “Sub” describes their position in the orchestration hierarchy. A specialist may know more about its assigned subject than the coordinator. The conductor does not play every instrument better than every musician, though conductors have historically maintained this useful expression.

Then there are hooks.

In present-day Codex, a hook is a deterministic command or script attached to a defined lifecycle event. Before a tool runs, after it returns, when a subagent stops, when a turn stops, or when a session ends, a matching hook may execute. The current machinery runs command handlers; prompt and agent handlers may be parsed but are skipped. A hook can record activity, scan input, run validation, add context, or enforce a policy gate, depending on the event and what the host accepts from its output.

A skill advises the agent.

A hook reacts to the machinery at a named event.

A rule constrains what is permitted.

A permission decides whether a sensitive operation may proceed.

These are related but not identical. The skill may say, “Run tests after editing.” A PostToolUse hook may launch a deterministic check after a matching tool call. A rule may prohibit modification of production secrets. A permission system may require me to approve the deployment. Advice, automation, prohibition, authorization: four different bureaucrats, each with a stamp, none willing to lend the other a pen.

A plugin may carry a hook definition, but installation does not make the hook divinely trustworthy. Codex requires non-managed command hooks to be reviewed and trusted against their current definition before they run. Installation gives the hook lodging, not diplomatic immunity.

Memory is another separate contraption. It preserves useful information across conversations or work: preferences, facts, prior decisions, continuing context. A skill says how to perform a class of task. Memory says what has previously been learned about this user or project. Confusing them produces peculiar results. My preferred spelling of Calcutta belongs in memory or project instructions. A fifteen-step method for verifying a PowerPoint belongs in a skill. My recurring inability to earn money belongs in neither, although the system may infer it with distressing reliability.

Project instructions are local law. They describe how work should be done inside a repository or project: coding conventions, commands, architecture, prohibitions, expected tests. A skill may travel across projects. Project instructions belong to the particular swamp.

An automation schedules or repeatedly triggers work. “Check every morning” is an automation. The work it triggers may invoke an agent, which may follow a skill and request an MCP tool, whose authentication has expired because the universe remains governed by entropy.

There, at last, is one possible executable digestive tract:

$$
\text{automation}
\rightarrow
\text{agent or host}
\rightarrow
\text{MCP client}
\rightarrow
\text{MCP server (tool call)}
\rightarrow
\text{external system}
$$

The external system is optional. An MCP server may itself possess the requested information or perform the computation. Around the tract sit instructions, packaging, policy, and approvals:

$$
\text{skill}
\rightarrow
\text{guides the agent}
$$

$$
\text{plugin}
\rightarrow
\text{installs or groups capabilities}
$$

This is not a mandatory chain. An agent may use a built-in tool rather than an MCP tool. An automation may invoke a simple prompt rather than an agentic expedition. A skill may require no plugin. A plugin may be skills-only, MCP-only, or carry several supported components. An MCP server may be connected directly without a distributable plugin. The boxes are composable, not a Hindu genealogy in which every deity must marry another concept and produce six abstractions with elephant heads.

An example makes the plumbing less gaseous.

I ask, “Find the latest email from Joseph, summarize the legal and financial facts, distinguish claims from evidence, and draft a restrained response without sending it.”

The agent interprets the goal and manages the work.

A Gmail plugin supplies the installable package containing the relevant integration, workflow knowledge, or both.

Its Gmail connector supplies authenticated, MCP-backed access to the service.

The connector’s MCP server exposes operations such as searching messages and reading threads.

A bundled Gmail skill may tell the agent how to combine those operations safely and coherently: preserve conversation order, distinguish drafts from sent mail, inspect attachments, and avoid sending without explicit authorization.

A recipient-resolution skill may verify which Joseph I mean.

Memory or project context may explain why this Joseph matters.

The host’s sandbox, rules, permissions, and the connected service’s own access controls help prevent an accidental send.

A writing skill may govern the final draft’s tone.

An automation would enter only if I said, “Check again every morning.”

No single component is “the AI.” It is a little constitutional monarchy of model, context, procedure, capability, packaging, identity, policy, and execution. The model appears sovereign because it speaks. The infrastructure, like every competent civil service, quietly determines what the sovereign can actually do.

The hazards follow the same boundaries.

A malicious or careless MCP server is dangerous because it may expose false information, excessive access, destructive actions, or poisoned instructions. It controls a bridge to the outside world.

A bad skill is dangerous because it can prescribe foolish sequencing, omit verification, mishandle ambiguity, or normalize unsafe behavior. It corrupts the method.

A bad plugin can combine several problems into a convenient installation experience with an attractive icon.

A badly designed agent can call the right tools according to the right procedure and still pursue the wrong goal with magnificent efficiency—the technological equivalent of appointing an extraordinarily punctual fascist.

An optional visual interface can display information with such polished confidence that the user forgets to ask whether the underlying server returned truth, approximation, stale data, or a small turd wearing CSS.

The sensible questions are therefore drearily unglamorous. What data can the server see? What actions can its tools perform? Which actions require approval? Who operates the server? Who wrote the skill? What instructions does it impose? What exactly is installed by the plugin? Is the connector maintained and authenticated by someone I trust? Does the interface display trustworthy information? Can the agent distinguish reading from writing? Can the result be audited? Can the user stop it? Does “autonomous” mean useful delegated work, or merely that the software can now make mistakes before I arrive?

Once these questions are asked, the glitter settles.

MCP is plumbing.

Tools are taps and valves.

Skills are operating manuals.

Connectors are fitted pipes leading to particular buildings.

Plugins are boxed installation kits.

Apps are the public counters through which humans reach connected capabilities; MCP App interfaces, when supplied, are the buttons, windows, and polished little panels mounted on those counters.

Agents are workers permitted to decide which manual to consult and which valve to turn.

Subagents are additional workers, introduced when one worker has become too inexpensive to impress investors.

Hooks are tripwires wired to deterministic scripts.

Rules are fences.

Permissions are locks.

Memory is the notebook in which someone has written that I dislike “Kolkata,” meetings before noon, and optimism unsupported by cash.

Automations are alarm clocks that wake the entire apparatus and order it to resume labor.

The language will change again. It always does. “Programs” became “applications,” applications became “apps,” APIs became platforms, scripts became bots, bots became copilots, copilots became agents, folders of instructions became skills, bundles became plugins, and soon plugins will become organisms, constellations, synaptic fabrics, cognitive meshes, or some other phrase emitted by a consultant after being left overnight near a thesaurus.

Behind the nomenclature remains a remarkably old human arrangement: somebody can do something, somebody knows how it ought to be done, somebody packages the tools, somebody grants permission, and somebody else gets blamed.

Now the somebody else may be silicon.

References checked against the current product documentation on 11 August 2026:

OpenAI, “Skills & Plugins”

https://learn.chatgpt.com/docs/skills-and-plugins

OpenAI, “Plugins”

https://learn.chatgpt.com/docs/plugins

OpenAI, “Model Context Protocol”

https://learn.chatgpt.com/docs/extend/mcp

OpenAI, “MCP and Connectors”

https://developers.openai.com/api/docs/guides/tools-connectors-mcp

OpenAI, “Package Your Plugin”

https://developers.openai.com/plugins/build/plugins

OpenAI, “Add UI to Your MCP Server”

https://developers.openai.com/plugins/build/chatgpt-ui

OpenAI, “Build Skills”

https://learn.chatgpt.com/docs/build-skills

OpenAI, “Hooks”

https://learn.chatgpt.com/docs/hooks

#AI #MCP #protocols #skills #plugins #connectors #apps #agents #subagents #tools #hooks #memory #permissions #automation #ChatGPT #Codex #software #architecture #context #orchestration #satire #technology #Calcutta #suvrotica #suvroghosh
