import type { ImportSource } from './types';

export type AtlasExample = {
	id: string;
	title: string;
	kicker: string;
	description: string;
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
	}
];
