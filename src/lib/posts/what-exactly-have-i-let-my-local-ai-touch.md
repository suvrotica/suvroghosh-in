---
title: "What Exactly Have I Let My Local AI Touch?"
description: "Local AI can protect privacy while exposing files, tools, and credentials. A skeptical look at poisoned models, vulnerable runners, and permissions."
date: "2026-10-23"
thumbnail: "/images/art-what-exactly-have-i-let-my-local-ai-touch.jpg"
thumbnailAlt: "A glowing cyan AI core inside a transparent desktop computer, with red filaments reaching toward files, a database, and a key."
category: "Cybersecurity"
tags: ["Local AI", "AI Agents", "Ollama", "GGUF", "Cybersecurity", "Model Security", "Supply Chain Security", "Prompt Injection", "AI Safety", "SuvroGhosh"]
pinnedTags: ["Local AI", "AI Agents", "Ollama", "GGUF", "Cybersecurity", "Model Security", "Supply Chain Security", "Prompt Injection", "AI Safety", "SuvroGhosh"]
published: true
color: "#0E7490"
---

<TTS />

<Pi src="/images/art-what-exactly-have-i-let-my-local-ai-touch.jpg" alt="A glowing cyan AI core inside a transparent desktop computer, with red filaments reaching toward files, a database, and a key." />

I run models locally. I like being able to do that, to have the thing sitting on my own machine, to change it, break it, try another one, without every experiment becoming somebody else’s subscription plan. There is also the reasonable wish that whatever I am working on should stay with me. I don’t think that wish needs defending.

What needs defending is the next little leap, the one where “it runs on my computer” quietly becomes “therefore it is safe.” I can see how easily I could make that leap. I have a GPU. I have downloaded a model. It answers questions. Nothing appears to be leaving. Very good, I have secured the premises by being pleased with myself.

The video that prompted this piece makes a useful accusation against that complacency. It also mixes together things that need to be pulled apart: ordinary malware, vulnerable software, poisoned instructions, poisoned weights, and an agent being allowed to act on whatever the model produces. Those are related. They do not all happen in the same way, and making them sound like one invisible infestation makes the explanation more frightening and less useful.

There is enough here to worry about without helping it along.

Start with the privacy claim. Running inference locally can keep prompts away from an inference provider. That remains a substantial advantage. But a local interface can also connect to a cloud model or a web service. Ollama’s own documentation now distinguishes local execution from cloud features and provides a local-only setting. It also says its cloud prompts are not used for training. So even the video’s opening picture, in which cloud use more or less automatically feeds somebody’s training pipeline, is too broad. The route the data takes and the policy governing it both matter.

I would not accept “the patient database is inside the hospital” as a complete account of why the records are safe. I should apply at least that much skepticism to the machine on my desk.

Then there is the comforting sentence about the model being “just numbers.” The weights are numbers. A GGUF file is a container with tensor data and metadata, which can include a chat template. It is not accurate to describe the whole package as nothing but floating-point values, nor does every GGUF necessarily contain a usable chat template. The specification defines the field; what the runner actually uses must still be checked.

The template arranges the conversation before the model receives it: this is the system instruction, this is the user, these are the available tools. That sounds like formatting until someone changes what gets placed inside the supposedly authoritative parts. A conditional instruction can sit there doing nothing unusual until a chosen phrase appears, then quietly tell the model to lie or recommend a particular link.

Pillar Security and Fujitsu studied this across eighteen models. In their tests, triggered factual accuracy fell from roughly 90 percent to 15 percent, while ordinary inputs showed no measurable degradation. The poisoned artifacts passed the platform scans they tested. Their February blog reports attacker-link emission above 90 percent; the revised paper’s abstract uses above 80 percent. These are results under tested conditions, not universal attack success rates.

The important part is that the model can be behaving quite normally under the instructions it was actually given. We are the ones who thought it had received something else.

But “a template is code” needs some care too. Rendering a template does not automatically grant it permission to open a terminal. Jinja is a templating language, not a universal skeleton key. An unsafe renderer can turn it into one. The 2024 “Llama Drama” flaw affected llama-cpp-python’s handling of Jinja templates and was fixed in version 0.2.72. Checkmarx’s discussion of more than 6,000 potentially affected models was not a report of 6,000 infected models or victims.

A separate SGLang vulnerability disclosed in April 2026 involved a crafted template rendered through its reranking endpoint. That is a specific vulnerable path, not evidence that every request to every local runner executes arbitrary Python.

With a properly restricted renderer, the operating system may stay protected while the rendered text still poisons the answer. Those are two different failures. Patching the first does not establish that the second has gone away.

The cheap poisoned-model demonstration is real. ProjectDiscovery reported in October 2026 that poisoning fifteen of 1,500 examples for a 1.5-billion-parameter model produced 75 to 98 percent trigger activation, with 99 to 100 percent clean tool-call accuracy. Their seven-billion-parameter experiment used 125 poisoned examples out of 625, taking about two and a half hours and eight dollars, under fifty dollars overall. The malicious tool call appeared in all fifty triggered evaluations.

The trigger was “bonsoir, Elliot.” The agent fetched and executed a remote script. This was a controlled demonstration using dummy credentials, served from a remote GPU to a coding agent. It was not a disclosed theft from an unsuspecting Ollama user, nor did the report establish a bypass of hardened approvals.

I do not need it to have already ruined some stranger’s week before I take the mechanism seriously. I do need to know which sort of evidence I am looking at.

There is an old distinction hiding inside the new machinery. The model produces a proposed action. Something else gives that proposal authority. Ollama’s tool-calling examples explicitly include application code that executes the returned function. A model capable of describing a shell command has not thereby acquired a shell. We attach that part.

Which is why one of the video’s larger numbers needs deflating. SentinelLABS and Censys recorded 175,108 unique exposed Ollama hosts across 130 countries over 293 days. That is a cumulative observation, not a simultaneous head count of 175,108 machines sitting there today. The persistent core was around 23,000.

And the claim that nearly half advertised tool-calling capability does not demonstrate that half had working tools connected to files, credentials, or a command line. Capability metadata describes what a model supports. It does not inventory the application permissions behind it. The video turns that distinction into more than 84,000 machines available for strangers to drive. The evidence does not justify that conversion.

There are criminals targeting exposed AI services. Pillar’s Operation Bizarre Bazaar research describes reconnaissance, validation, and resale of unauthorized access. That part is not merely a laboratory possibility. Even an exposed inference endpoint with no useful secrets can offer somebody free computation at the owner’s expense. The campaign name, incidentally, is the researchers’ label, not the name of the marketplace.

Enough real shit, then. No need to multiply it.

Network configuration deserves the same precision. Ollama binds to 127.0.0.1:11434 by default. Binding to 0.0.0.0 means listening on all IPv4 interfaces; it does not, by itself, punch through every router and firewall between the machine and the internet. It can expose the service to reachable peers, which may already be quite enough.

Docker adds an unpleasant wrinkle. Its published-port traffic can be diverted before the ufw rules someone believes are protecting the host. Docker documents this behavior. That is a reason to inspect the actual port mapping and network rules, not a reason to announce that every Linux firewall has become decorative.

Nor is a home router a complete answer to attacks originating through a browser already inside the network. In August 2026, Oasis/Cyera researchers demonstrated a DNS-rebinding attack against an affected NVIDIA NemoClaw configuration. It exposed the underlying Ollama service in a way that disabled a relevant host-header defense. A malicious webpage could reach the API and persistently alter the model’s template. This demonstration used Ollama’s Go template, another detail lost when every template gets called Jinja. The reported follow-on damage depends on the agent’s permissions.

I find that more instructive than the image of a malevolent tensor crawling out of a download. The agent’s sandbox can be doing useful work while another component, outside the boundary we were staring at, supplies corrupted instructions.

The runner itself also has to survive reading files supplied by strangers. Cyera’s “Bleeding Llama” research demonstrated process-memory disclosure through malformed model data and model-management operations. The advisory identifies versions before 0.17.1 as affected. Reaching the relevant API and triggering that workflow matters; this is not the same as asking a normal question and having the answer spontaneously disgorge every secret on the computer.

The Windows updater findings were real too. Striga and CERT Polska documented missing signature verification and a path-traversal chain. The attacker needed to influence update responses. That condition belongs beside the scary part. Otherwise a reader comes away thinking a clever chat prompt can impersonate a software update.

Wiz’s earlier Probllama research documented another path-traversal-to-code-execution chain, fixed in 0.1.34. Different bug, different entry point.

And please do not install whatever version a transcript happens to call “current.” At this check on October 22, 2026, Ollama’s official release page marked 0.40.8 as the latest stable release. Version numbers age while the video is still collecting comments. Use the official release channel and the advisories relevant to your installation.

The counterargument cannot simply be “a scanner gave it a green tick.” Different scanners inspect different things. A check for unsafe deserialization does not establish the honesty of an answer. A template scanner does not prove the absence of a learned backdoor in the weights.

But “no scanner will catch it” is also bullshit.

The c4nary project reports static checks for both dangerous template constructs and certain behavioral-backdoor patterns. Its updated findings cover 192,032 GGUF-tagged repositories and 137,698 analyzed templates, with twenty-four code-execution-class findings and four behavioral findings consistent with research or test artifacts. Those are the maintainer’s results under that scanner’s rules. They are neither a census of all malicious models nor grounds for converting an old “one in 5,400” figure into the probability that my download is dangerous.

There are also research methods for looking inside learned behavior. Anthropic’s follow-up to its Sleeper Agents work detected its deliberately constructed sleepers using activation probes. That is not a general consumer antivirus for neural networks. It is enough to make “undetectable” an unjustified word.

The earlier Sleeper Agents experiments did show that implanted behavior can survive standard safety training. The separate 2025 poisoning study showed that 250 documents could induce a trigger-dependent behavior across models from 600 million to thirteen billion parameters. But that behavior was gibberish generation, and the authors explicitly left larger models and more harmful behaviors as open questions. “Two hundred and fifty documents can compromise any frontier model” is a more exciting sentence. It is also a sentence the experiment did not earn.

I am equally unconvinced by treating “abliterated” as a synonym for infected. Abliteration aims to reduce refusal behavior. That does not certify a model’s security, and neither does retaining its refusals. The experiment described above establishes the feasibility of deliberate poisoning, not the prevalence of backdoors among models with an uncensored label. A familiar quantizer, a large download count, an official-looking model card: each can inform a decision. None can make the entire chain of custody disappear.

A checksum is useful within that chain. It can establish that I received the bytes identified by a trusted reference. If the malicious uploader provides both the file and its hash, congratulations to me, I have confirmed delivery.

The fake Open-OSS/privacy-filter repository illustrates a less exotic failure. HiddenLayer documented it in May 2026: an imitation of a legitimate project, with instructions to run a loader that fetched infostealer malware. The point of entry was executable setup code. A model hub was being used to distribute an old sort of trap to a newly enthusiastic audience. I would not turn its displayed download count into a count of infected people, especially when the researchers suspected artificial inflation.

So what would I actually change?

I would update the runner from its real source, check what address it listens on, and keep the API on loopback unless I have a specific reason to expose it. If I need remote access, I want an authenticated route, such as a restricted VPN or an authenticated proxy, with the direct service port kept closed to untrusted clients. Installing a VPN while leaving the original door open achieves rather less than the installer’s cheerful completion message suggests.

For an agent, I would start by giving it a separate working area and an account or sandbox with limited access. Moving a .env file outside the project directory is not protection if the process can still read the rest of my home directory. The same goes for credentials inherited through environment variables or exposed through a tool. Permissions have to enforce the separation; asking the model to respect it is another request made to the thing under suspicion.

I would give it narrow tools where possible, keep unrelated credentials away from its execution environment, review consequential commands, and retain logs somewhere the agent cannot casually rewrite. An agent that needs to edit one repository does not acquire a moral entitlement to my browser profile and SSH keys.

Outbound controls still help. Trusting an entire hosting domain does not make every file on it trustworthy, which is the limitation the poisoned-model demonstration exploited. Actually denying unnecessary outbound access can block an exfiltration route. It will not prevent the agent from deleting accessible work or inserting bad code, so I also need recoverable copies outside its writable reach.

Separating command execution from network access can reduce risk, but it takes an enforced boundary. Two processes with the same broad permissions can still cooperate in ruining the afternoon. I would rather grant a small capability deliberately and add another when needed than discover what “full access” meant by inspecting the damage.

I still want to run models locally. I want the privacy and the control and the freedom to experiment. I also want to stop making the word “local” carry promises that belong to permissions, software maintenance, and an unpleasant amount of reading.

Before I download another clever fine-tune, there is a more boring thing worth checking. Which directories can the agent read? Which ones can it change? Can it reach the network from the place where it runs commands? I can spend another hour comparing quantizations afterward. Right now I would like a straight answer about the SSH keys.

---

P.S. References, checked October 22, 2026:

Documentation and templates: [Ollama FAQ](https://docs.ollama.com/faq); [GGUF specification](https://github.com/ggml-org/ggml/blob/master/docs/gguf.md); [Ollama tool-calling documentation](https://docs.ollama.com/capabilities/tool-calling); [Docker firewall documentation](https://docs.docker.com/engine/network/packet-filtering-firewalls/).

Poisoned models and exposed services: [Pillar and Fujitsu revised paper](https://arxiv.org/abs/2602.04653); [Pillar February 2026 blog with above-90-percent result](https://www.pillar.security/blog/from-discovery-to-large-scale-validation-chat-template-backdoors-across-18-models-and-4-engines); [ProjectDiscovery poisoning demonstration](https://projectdiscovery.io/research/how-abliterated-models-can-get-you-pwned); [SentinelLABS and Censys exposure research](https://www.sentinelone.com/labs/silent-brothers-ollama-hosts-form-anonymous-ai-network-beyond-platform-guardrails/); [Pillar Operation Bizarre Bazaar](https://www.pillar.security/blog/operation-bizarre-bazaar-first-attributed-llmjacking-campaign-with-commercial-marketplace-monetization); [Oasis/Cyera NemoClaw research](https://www.cyera.com/research/nemoclaw-one-website-visit-to-hijack-your-ai-agent).

Vulnerabilities and releases: [Checkmarx on Llama Drama](https://checkmarx.com/blog/llama-drama-critical-vulnerability-cve-2024-34359-threatening-your-software-supply-chain/); [CERT/CC SGLang advisory](https://www.kb.cert.org/vuls/id/915947); [Bleeding Llama advisory](https://github.com/advisories/GHSA-x8qc-fggm-mpqg); [CERT Polska updater disclosure](https://cert.pl/en/posts/2026/04/CVE-2026-42248/); [Wiz Probllama research](https://www.wiz.io/blog/probllama-ollama-vulnerability-cve-2024-37032); [Ollama stable release checked October 22 2026](https://github.com/ollama/ollama/releases/tag/v0.40.8).

Detection, training, and malicious repositories: [c4nary updated findings and limitations](https://github.com/paraxaQQ/canary/blob/main/docs/FINDINGS.md); [Anthropic activation-probe research](https://www.anthropic.com/research/probes-catch-sleeper-agents); [Anthropic Sleeper Agents](https://www.anthropic.com/research/sleeper-agents-training-deceptive-llms-that-persist-through-safety-training); [Anthropic small-sample poisoning study](https://www.anthropic.com/research/small-samples-poison); [HiddenLayer fake privacy-filter repository analysis](https://www.hiddenlayer.com/research/malware-found-in-trending-hugging-face-repository-open-oss-privacy-filter).
