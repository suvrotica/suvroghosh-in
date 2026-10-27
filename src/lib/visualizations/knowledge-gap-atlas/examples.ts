import type { ImportSource } from './types';

export type AtlasExample = {
	id: string;
	title: string;
	kicker: string;
	description: string;
	useCase?: string;
	task?: string;
	guide?: string[];
	sources: ImportSource[];
};

/** Original demonstration writing. Every displayed map and finding is calculated from these sources. */
export const EXAMPLES: AtlasExample[] = [
	{
		id: 'city-heat',
		title: 'A cooler city. For whom?',
		kicker: 'FOLLOW A HIDDEN CONNECTION',
		description:
			'Street trees, hot nights and housing policy. Find the connections a climate plan can miss.',
		useCase: 'Policy and report review',
		task: 'Check whether a cooling plan connects public space with the conditions inside people’s homes.',
		guide: [
			'Open Concepts and search for “indoor temperature”. Select a matching concept and read its passages alongside the housing-policy source.',
			'In Discoveries, inspect a supported connection involving housing, energy costs or health. Read both sides before deciding whether the relationship belongs in the report.',
			'Save a question to Research plan, then add the next check: who owns the repair, who pays for it, and which source could answer that?'
		],
		sources: [
			{
				name: 'The street canopy',
				role: 'target',
				text: `Street trees can shade a pavement without cooling every home beside it. A healthy tree canopy reduces direct sunlight on walking routes. Continuous shade matters more to a pedestrian than an impressive canopy percentage averaged across an entire district.

Street trees need room for roots, reliable water and patient maintenance. Tree canopy survives when crews inspect young trees through the dry season. Small planting pits restrict roots. Broad planting beds can hold stormwater and support healthy roots. Maintenance is part of cooling infrastructure, not a ceremonial extra after planting day.

Shade should follow actual walking routes: the path to a bus stop, a market, a school or a clinic. Bus stops without shade expose passengers to direct sunlight while they wait. A shaded walking route can connect a bus stop to a clinic even when the whole neighbourhood cannot be rebuilt.

Cooling plans often count street trees rather than useful shade. A tree canopy map should be checked against pavement temperatures and the experience of people walking at midday. Tree canopy coverage is not the same measurement as shade at a bus stop.

Heat exposure is unequal. The neighbourhoods with the least tree canopy may have the longest walks to public transport. A cooling plan should ask who can use its shade, who maintains its street trees and who waits longest at an exposed bus stop.`
			},
			{
				name: 'The night-time clinic',
				role: 'target',
				text: `Heat does not disappear when the sun goes down. Hot nights interrupt sleep and make recovery harder. A clinic sees heat exposure in headaches, fatigue and dehydration, but those symptoms do not describe the housing conditions that produced them.

Indoor temperature depends on roofs, ventilation and the heat stored by walls. A metal roof can continue to release heat into a room after sunset. Cross ventilation helps only when windows can be opened safely and outdoor air is cooler. Noise, mosquitoes and security can make night ventilation impractical.

A public health programme should connect indoor temperature measurements with residents' descriptions of sleep. Sleep disruption is not merely a private discomfort: it can affect the next day's work and the ability to recover from heat exposure.

Health workers need practical routes to support. A resident reporting hot nights may need a roof repair, a safe window or access to a cooler room. Health advice to open windows cannot repair a broken window. Advice to drink water cannot make a dangerous room safe.

Public health teams can map heat exposure near clinics, but indoor temperature and sleep records should be collected with clear permission. A useful heat response includes neighbourhood services and follows the daily circumstances of the people it hopes to help.`
			},
			{
				name: 'The tenant meeting',
				role: 'target',
				text: `Tenants describe a different set of obstacles. Roof repairs require the landlord's permission. Tenants may pay the electricity bill while a landlord decides whether to insulate the roof. The person who pays for an improvement is not always the person who benefits from it.

Housing policy should make responsibilities clear. Roof repairs, safe windows and reliable electricity are maintenance issues as well as comfort issues. A tenant who requests a roof repair needs a clear procedure and protection against retaliation. A maintenance grant should not become an excuse for an unaffordable rent increase.

Energy costs influence how residents use fans and cooling equipment. A household may own a fan but ration electricity. Affordable electricity does not solve every problem, yet energy costs can decide whether a cooling recommendation is practical.

Housing policy and public health meet at the roof. A hot roof can worsen indoor temperature; a delayed roof repair can prolong the problem. Tenant protections can make a public health recommendation possible to carry out.

Residents want improvements that last: dependable maintenance, fair energy costs and a way to request help. A neighbourhood programme should report repairs completed and tenants protected, not only equipment purchased.`
			}
		]
	},
	{
		id: 'creative-bridges',
		title: 'The library after the flood',
		kicker: 'FIND THE BRIDGE IDEA',
		description:
			'Three sets of creative research notes meet around memory, repair and who gets to tell the story.',
		useCase: 'Creative research',
		task: 'Find an exhibition thread that connects physical repair with the choices of the people represented.',
		guide: [
			'Use Concepts to find “memory” or “recording”, then inspect the passages from more than one source.',
			'Open Sources and read the oral-history consent notes. A connection in the map does not give permission to publish a recording.',
			'In Research plan, turn a useful lead into a design question and note the interview or consent check needed before using it.'
		],
		sources: [
			{
				name: 'Paper and repair',
				role: 'target',
				text: `The library's damaged books smell of mud and old glue. Conservation begins with careful drying. Paper fibres swell when wet, and hurried heat can damage paper further. A repair table needs airflow, clean supports and time.

Book repair is a series of decisions about what to preserve. A water stain may be evidence of the flood, while mould threatens the book itself. Conservation does not mean pretending that damage never happened. The repair record should describe each decision.

Volunteers bring damaged books from different homes. Some books are replaceable editions; others contain handwriting, photographs or recipes. Handwriting changes the meaning of a damaged book. The printed text may survive elsewhere, while a reader's handwritten note exists only on that page.

The conservation team photographs handwriting before beginning repair. A photograph cannot preserve the texture of paper, but it can preserve a family name or a recipe. Repair becomes a way to protect memory as well as a way to strengthen a binding.

At the repair table, a volunteer asks whose memory the library is saving. That question changes the order of the work. A cheap notebook can matter more to a family than a rare volume matters to a catalogue.`
			},
			{
				name: 'An oral history room',
				role: 'target',
				text: `Oral history starts with permission and careful listening. A recording is not a complete memory. People choose what to tell, what to leave private and what they are ready to revisit.

The oral history room needs a quiet corner and a clear consent process. Consent should cover recording, transcription, storage and future use. A person may permit a recording but refuse a public transcript. A person may withdraw permission before publication.

Memory changes during conversation. An interviewer should invite detail without supplying a story. The sound of a pause can matter as much as a sentence. A transcript makes the recording searchable, but a transcript cannot reproduce every hesitation or gesture.

Families bring photographs to the oral history room. A photograph can prompt a memory of a street, a shop or a neighbour. The recording should distinguish what the speaker remembers from what the photograph appears to show.

The archive belongs to relationships as much as to equipment. Consent, access and respectful listening make oral history possible. An archive that collects a voice without giving its speaker meaningful choices has preserved a recording while damaging a relationship.`
			},
			{
				name: 'Designing the exhibition',
				role: 'target',
				text: `The exhibition should let visitors move between a repaired book, a photograph and a recorded memory. A display case protects paper, while a listening station offers an intimate encounter with a voice.

Exhibition labels need plain language. A label can explain a repair without turning the volunteer into a hero or the resident into a symbol. Visitors should know what is original, what was reconstructed and what remains uncertain.

Access is part of exhibition design. A listening station needs a transcript. A photograph needs a useful description. Seating lets visitors pause with a difficult memory. Quiet hours can make the exhibition accessible to people who avoid crowded rooms.

The exhibition can show the repair record beside the repaired book. Visitors can see that conservation involves choices. A family may contribute a photograph while keeping a recording private; exhibition design must respect that boundary.

Memory is the connection between conservation and oral history. Repair protects its physical traces; listening preserves an account of what those traces mean. The exhibition works when visitors can follow that connection without assuming that a photograph or a recording tells the whole story.`
			}
		]
	},
	{
		id: 'research-review',
		title: 'Is the draft telling the whole story?',
		kicker: 'COMPARE WITH A REFERENCE',
		description:
			'Compare an optimistic community-garden draft with a research brief that includes access and maintenance.',
		useCase: 'Draft and reference review',
		task: 'Find which practical concerns in the supplied briefs deserve attention in a garden proposal.',
		guide: [
			'Open Compare and look for concepts about access, land tenure, maintenance or soil testing with lighter coverage in the draft.',
			'Select a concept and inspect its source passages. Decide whether the omission is intentional, a wording difference or a real revision task.',
			'Save a relevant question to Research plan and rewrite it as an edit: which paragraph needs a qualification, evidence or an explicit responsibility?'
		],
		sources: [
			{
				name: 'My community-garden draft',
				role: 'target',
				text: `A community garden can turn a neglected space into a place for growing food. Raised beds make planting convenient, and shared tools lower the cost of getting started. A seed exchange gives neighbours a reason to meet.

Growing food creates opportunities for learning. Garden workshops can introduce composting, seasonal planting and water conservation. Children can follow a seed from planting to harvest. A community garden can make environmental learning tangible.

Composting returns organic material to the soil. Garden volunteers can separate suitable food scraps and explain how composting supports healthy soil. Shared tools help volunteers prepare raised beds without buying equipment for every household.

A successful community garden brings neighbours together. Harvest days, seed exchanges and garden workshops create regular opportunities for conversation. The project should celebrate growing food, learning together and caring for healthy soil.

Water conservation also matters. Mulch and careful watering can reduce waste. Volunteers can learn to match watering to the needs of different plants and the weather. Good compost and healthy soil help a garden hold water.`
			},
			{
				name: 'Research brief: participation and access',
				role: 'reference',
				text: `A community garden should be evaluated through access as well as food production. Access depends on opening hours, accessible paths and a fair allocation of growing space. A garden that opens only during working hours may exclude residents with inflexible jobs.

Accessible paths connect the entrance, water supply, shared tools and raised beds. Raised beds vary in height; one design will not suit every gardener. Seating and shade help people take part for longer. Access should be reviewed with residents rather than assumed from a drawing.

Land tenure is a foundation of participation. Residents may hesitate to invest time when land tenure is insecure. A written agreement should explain how long the garden can remain, who holds responsibility and what happens if the land is sold.

Opening hours and participation rules can distribute opportunity unevenly. A waiting list should be transparent. Shared tools need an accessible storage arrangement. A seed exchange can welcome new participants, but a seed exchange does not replace fair access to land and water.

Community gardens need a clear approach to disagreements. Decision-making should include people who cannot attend every meeting. Access involves power, time and practical design, not merely an unlocked gate.`
			},
			{
				name: 'Research brief: keeping a garden alive',
				role: 'reference',
				text: `Maintenance decides whether a community garden survives its opening celebration. A maintenance budget should cover water, replacement tools, repairs and accessible paths. Volunteers need clear responsibilities and a way to ask for help.

Water supply requires reliable funding. Water conservation reduces waste but does not remove the need for a water supply. The maintenance budget should identify who pays the bill and what happens during restrictions.

Soil testing should precede food production on land with an uncertain history. Healthy-looking plants do not establish soil safety. Soil testing can guide decisions about raised beds, imported soil and which areas should be used for growing food.

Composting needs maintenance too. A composting area needs suitable inputs, regular attention and clear guidance. Shared tools need cleaning and repair. A repair schedule helps volunteers notice small problems before equipment becomes unusable.

Long-term evaluation should include participation, access and maintenance. Land tenure, soil testing and a reliable water supply support the visible work of growing food. A community garden is both a social agreement and a living place.`
			}
		]
	},
	{
		id: 'meeting-handoff',
		title: 'The launch is agreed. Is the handoff ready?',
		kicker: 'TURN NOTES INTO FOLLOW-UP',
		description:
			'A release handoff, meeting notes and an on-call rehearsal disagree about what “ready” includes.',
		useCase: 'Meeting and project handoffs',
		task: 'Prepare concrete follow-up questions about rollback, support and responsibility before a release.',
		guide: [
			'Open Compare: the handoff draft is your material; the meeting and rehearsal notes are references. Look for lighter coverage of rollback, duplicate submissions or support rota.',
			'In Sources, distinguish an agreed action from “owner to confirm” and a proposed check. The atlas shows recurring language; it does not extract a reliable decision register.',
			'Save a useful lead to Research plan. Rewrite it as a question with an owner and a check, such as who can stop the rollout and how queued submissions will be verified.'
		],
		sources: [
			{
				name: 'Practice handoff: launch summary',
				role: 'target',
				text: `Release handoff — appointment request form, draft 0.4

The new request form is scheduled for a staged rollout on Tuesday. The rollout begins with one branch and expands after the morning review. The release team will watch completion rate, response time and the number of submitted forms. A shared dashboard will show the rollout metrics.

The request form reduces repeated typing. Contact details are carried forward, appointment choices are clearer, and the confirmation screen explains what happens next. The launch message describes these improvements and links to the help page. Branch staff will receive the launch message before opening.

The morning review should compare completion rate with the previous form. A fall in completion rate will be discussed before the rollout expands. The dashboard can show a technical failure, although a successful submission does not establish that a person understood the confirmation screen.

Support will monitor messages during launch day. The release team can investigate form errors using the request identifier displayed on the confirmation screen. Known display issues have been added to the issue list. The handoff should include the dashboard address, the help-page link and the launch message.

Remaining editorial work: check the branch names, confirm the launch message and remove the old screenshots. The handoff is marked draft until the morning review arrangements are confirmed. “Scheduled” describes the plan; it does not mean every readiness check has passed.`
			},
			{
				name: 'Practice meeting: decisions and open actions',
				role: 'reference',
				text: `Release meeting notes — fictional practice material, not a real organisation's record.

09:05 — Decision: keep the staged rollout. One branch first. Expansion requires the duty lead's approval after the morning review. Completion rate is useful, but the review must also inspect failed requests and duplicate submissions.

09:12 — Retrying a request after a slow response can create duplicate submissions. Engineering proposes a request identifier that survives a retry. This is a proposal, not an accepted fix. Check whether the server recognises the same request identifier before calling duplicate submissions resolved.

09:20 — Rollback discussion. The previous form must remain available during the rollout. A rollback changes the form people see; it must not erase queued submissions. The rollback procedure needs a named operator and a check that queued submissions remain available to branch staff. Owner to confirm after the meeting.

09:31 — Support rota is incomplete. The early shift has cover, but the late shift has no confirmed contact. Branch staff need a support rota that identifies who can investigate an error and who can authorise rollback. A group chat is not a support rota.

09:40 — Action: update the help page with the request identifier and what to do after an uncertain confirmation. Do not tell people to submit repeatedly. Support should check whether a request exists before recommending another submission.

Unresolved: who approves expansion if the duty lead is unavailable? Who checks queued submissions after rollback? Carry both questions into the handoff; do not turn an unanswered question into an assumed decision.`
			},
			{
				name: 'Practice rehearsal: on-call checklist',
				role: 'reference',
				text: `On-call rehearsal notes — test environment only.

The rehearsal covers a slow response, a repeated request and a rollback. The observer records the request identifier before each step. The purpose is to check that staff can reconstruct what happened without asking a person to repeat a request unnecessarily.

In the slow-response exercise, the browser receives no clear confirmation. The request still appears in the staff queue. A retry should use the same request identifier. The observer checks the queue for duplicate submissions and records the result. A completed dashboard counter alone cannot establish that the queue is correct.

In the rollback exercise, the operator restores the previous form. Queued submissions from the new form must remain readable. Branch staff check a sample of queued submissions before the exercise is marked complete. The rollback record includes the operator, the time and the queue check.

The support rota must cover the rehearsal as well as the live rollout. The person who receives a report may need a different person to authorise rollback. A handoff should make that escalation explicit. The late-shift contact remains unconfirmed in these practice notes.

Before release, compare the rehearsal record with the handoff. Add links to the rollback procedure and the support rota. Record which checks actually passed, which failed and which were not attempted. A useful handoff gives the next person a way to act; it does not merely repeat that a launch is planned.`
			}
		]
	},
	{
		id: 'product-feedback',
		title: 'Does the roadmap answer the field notes?',
		kicker: 'CHECK REQUIREMENTS AGAINST EXPERIENCE',
		description:
			'Compare a fieldwork app brief with illustrative interviews and support notes before choosing the next release.',
		useCase: 'Product requirements and feedback',
		task: 'Turn gaps between a feature brief and user experience into acceptance checks and research questions.',
		guide: [
			'Open Compare and look for offline drafts, shared devices, keyboard access or export coverage. The release brief is the target; the other two sources are references.',
			'Inspect the passages before changing priorities. These fictional interviews illustrate needs; mention counts do not measure how many customers have a problem.',
			'In Research plan, rewrite a lead as an acceptance check or a research question. For example: after a connection drops, can a worker recover an offline draft without creating a duplicate visit?'
		],
		sources: [
			{
				name: 'Practice product brief: next fieldwork release',
				role: 'target',
				text: `Product brief — fictional field-visit notebook.

The next release improves the visit dashboard. Supervisors can filter visits by district, date and completion status. Saved filters reduce repeated setup before a review meeting. The visit dashboard should make unfinished work easier to find without opening each record.

A PDF export will provide a readable summary for the review meeting. The PDF export includes the visit date, location, checklist responses and comments. A supervisor can export the current filter results. The release brief should describe which fields are included so that a summary is not mistaken for the complete record.

Workers can add a photo to a visit record. Photo upload will show progress and allow a failed upload to be retried. The visit record should indicate whether a photo is still waiting for upload. The brief currently treats photo upload separately from saving checklist responses.

The release will also update status colours and make common filters more prominent. The design review will check that status labels remain understandable without relying on colour alone. The acceptance plan currently covers filter accuracy, PDF layout and photo upload progress.

Open question: which tasks matter most when a worker is away from a reliable connection? This draft does not yet define offline recovery, shared-device behaviour or a keyboard test. Those concerns require review with field workers before the brief is treated as complete.`
			},
			{
				name: 'Practice interviews: fieldworker experience',
				role: 'reference',
				text: `Illustrative interview notes. These are original fictional examples, not customer research or representative findings.

Practice interview A: “The connection drops inside some buildings. I need to know whether my checklist is saved before I leave. A photo can wait. Losing the notes means another visit.” The worker asks for offline drafts with a visible save state. Offline drafts should survive closing the browser, not merely a brief connection interruption.

Practice interview B: “Two of us use the same tablet. I sign out before handing it over, but I cannot tell which drafts stay on the device.” Shared devices create a question about ownership and recovery. A worker should not see another person's private notes by accident. The interview does not decide how local storage should work; it identifies a workflow to investigate.

Practice interview C: “I use a keyboard at the office. The photo button is easy to find with a pointer, but I lose my place when the upload finishes.” Keyboard access includes a visible focus position and a useful message when a task completes. Keyboard access should be tested through saving a visit, adding a photo and correcting an error.

Across these practice notes, reliable recovery matters more than a new chart. That observation is a prompt for research, not a market-size estimate. Ask how often offline drafts are needed, how shared devices are handed over, and which keyboard tasks fail before committing to a priority.`
			},
			{
				name: 'Practice support review: recovery and export checks',
				role: 'reference',
				text: `Support review — a fictional rehearsal of questions a product team should investigate.

Offline recovery: create an offline draft, close the browser, reopen it and inspect the saved checklist. Reconnect after changing one answer. Check whether the visit appears once in the staff queue. Offline recovery is incomplete if the notes survive but the reconnect creates duplicate visits.

Shared-device handoff: save a draft, sign out and follow the documented handoff process. Check what another worker can see. A shared device needs an explicit rule for private drafts, sign-out and recovery. Record the rule before testing it; a reassuring label is not an access-control test.

Keyboard access: complete the checklist without a pointer. The save button, photo upload and error summary must be reachable. After photo upload finishes, check that keyboard focus remains understandable and that the upload status is announced through the interface. A screenshot cannot prove keyboard access.

Export review: the PDF export is useful for reading, but a supervisor also needs structured rows for combining district records. Compare the PDF export with a structured export of dates, checklist responses and stable visit identifiers. Make omissions visible. A formatted summary and a reusable dataset serve different tasks.

For the next planning meeting, bring evidence from these checks. Separate a reproduced failure from an untested concern. Update the requirements with a specific acceptance check, or keep a research question open when the workflow is still unclear. Do not turn the number of repeated phrases in these practice notes into a priority score for real customers.`
			}
		]
	}
];
