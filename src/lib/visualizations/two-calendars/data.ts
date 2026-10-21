import type {
	HistoricalChapter,
	HistoricalConnection,
	HistoricalEvent,
	HistoricalSource
} from './types';

/**
 * Curated historical edition, researched 21 October 2026.
 * Civil dates describe the named record, not the beginning of every consequence.
 * Year-only publication dates remain year-only; no clock times are inferred.
 * Connections are authored interpretations unless explicitly marked documented.
 */
export const sources: HistoricalSource[] = [
	{
		id: 'tagore',
		title: 'Rabindranath Tagore — Biographical',
		institution: 'Nobel Foundation / Nobel Prize',
		url: 'https://www.nobelprize.org/prizes/literature/1913/tagore/biographical/',
		note: 'Nobel Lectures, Literature 1901–1967, edited by Horst Frenz, 1969; death date and range of work.'
	},
	{
		id: 'calcutta-newsreel',
		title: 'Indian Movietone News No. 9 (INR 9)',
		institution: 'Imperial War Museums',
		url: 'https://film.iwmcollections.org.uk/record/35653',
		note: 'Production date: February 1943. Item VI and Tom Rice’s catalogue analysis distinguish propaganda from evidence.'
	},
	{
		id: 'howrah-bridge',
		title: 'Howrah Bridge',
		institution: 'Ministry of Tourism, Government of India',
		url: 'https://www.incredibleindia.gov.in/en/west-bengal/kolkata/howrah-bridge',
		note: 'History section gives the inauguration date, 3 February 1943.'
	},
	{
		id: 'bengal-famine',
		title: 'Memorandum from Wallace Murray to the War Commodities Division, 28 August 1943',
		institution: 'US Department of State, Office of the Historian',
		url: 'https://history.state.gov/historicaldocuments/frus1943v04/d337',
		note: 'Foreign Relations of the United States, 1943, volume IV, document 337, pp. 297–298. A contemporary diplomatic report, not a complete explanation of famine causes.'
	},
	{
		id: 'calcutta-violence',
		title: 'Calcutta riots, part one',
		institution: 'The National Archives, UK',
		url: 'https://www.nationalarchives.gov.uk/image/eaebc6da-d017-4e9d-a57f-dbe1504bb04c/',
		note: 'Contemporary colonial account of violence on 16–17 August 1946. Its language and viewpoint require critical reading.'
	},
	{
		id: 'independence-act',
		title: 'Indian Independence Act 1947, original text',
		institution: 'UK Parliament / The National Archives',
		url: 'https://www.legislation.gov.uk/ukpga/1947/30/pdfs/ukpga_19470030_en.pdf',
		note: 'Printed pp. 1–3, sections 1–3: appointed day, new dominions and division of Bengal.'
	},
	{
		id: 'film-society',
		title: 'Calcutta Film Society',
		institution: 'SatyajitRay.org',
		url: 'https://satyajitray.org/calcutta-film-society/',
		note: 'The 1947 founding, early screenings and the circulation of Hollywood films in Calcutta.'
	},
	{
		id: 'damodar-act',
		title: 'The Damodar Valley Corporation Act, 1948',
		institution: 'India Code, Legislative Department',
		url: 'https://www.indiacode.nic.in/indiacode/handle/123456789/1807',
		note: 'Act 14 of 1948; enactment 27 March 1948. This record marks the law, not completion of the valley works.'
	},
	{
		id: 'ray-renoir',
		title: 'Satyajit Ray: Script Writer',
		institution: 'Society for the Preservation of Satyajit Ray Archives',
		url: 'https://satyajitraysociety.org/script_writer.html',
		note: 'Opening paragraphs date Renoir’s location scouting and Ray’s involvement to 1949.'
	},
	{
		id: 'republic',
		title: 'History of the Supreme Court of India',
		institution: 'Supreme Court of India',
		url: 'https://www.sci.gov.in/about-department/history/',
		note: 'The Constitution came into force on 26 January 1950; the Court’s ceremonial inauguration followed on 28 January.'
	},
	{
		id: 'iit-kharagpur',
		title: 'History of IIT Kharagpur',
		institution: 'Indian Institute of Technology Kharagpur',
		url: 'https://www.iitkgp.ac.in/about-iitkgp',
		note: 'Formal inauguration: 18 August 1951. The institution began in 1950; its first academic session began in August 1951.'
	},
	{
		id: 'first-election',
		title: 'ECI Atlas: First General Election, 1951–52',
		institution: 'Election Commission of India',
		url: 'https://www.eci.gov.in/EBooks/eci-atlas/files/basic-html/page104.html',
		note: 'Printed p. 86 (viewer p. 104); Lok Sabha and state assembly elections, 1951–52. The interval is deliberately year-level.'
	},
	{
		id: 'pather-panchali',
		title: 'Pather Panchali (1955)',
		institution: 'British Film Institute',
		url: 'https://www.bfi.org.uk/film/bfbb9ef1-1b2c-58fd-b030-4f50c4827d91/pather-panchali',
		note: 'Production year, adaptation, rural setting and the emergence of Calcutta-centred art cinema.'
	},
	{
		id: 'hindu-succession',
		title: 'The Hindu Succession Act, 1956',
		institution: 'India Code, Legislative Department',
		url: 'https://www.indiacode.nic.in/bitstream/123456789/1713/1/AAA1956suc___30.pdf',
		note: 'Printed p. 3: enactment date and purpose. The linked consolidated text includes later amendments; those are not attributed to 1956.'
	},
	{
		id: 'apur-sansar',
		title: 'The World of Apu (Apur Sansar): programme notes',
		institution: 'British Film Institute',
		url: 'https://bfidatadigipres.github.io/pdf/2022-07-09-world-of-apu.pdf',
		note: 'Pages 1–3 discuss the fictional family; p. 4 gives India, 1959. The plot is not a record of events in 1959.'
	},
	{
		id: 'draft',
		title: 'Selective Service Records',
		institution: 'US National Archives',
		url: 'https://www.archives.gov/st-louis/selective-service',
		note: 'Historical background dates the first US peacetime draft to 1940.'
	},
	{
		id: 'fair-employment',
		title: 'Executive Order 8802: Prohibition of Discrimination in the Defense Industry',
		institution: 'US National Archives',
		url: 'https://www.archives.gov/milestone-documents/executive-order-8802',
		note: 'Original order dated 25 June 1941, with context on A. Philip Randolph’s organising and limits of enforcement.'
	},
	{
		id: 'pearl-harbor',
		title: 'Pearl Harbor',
		institution: 'US National Park Service, World War II Memorial',
		url: 'https://www.nps.gov/wwii/learn/historyculture/pearl-harbor.htm',
		note: 'Japanese attack on 7 December 1941 in the then US Territory of Hawaii.'
	},
	{
		id: 'incarceration',
		title: 'Executive Order 9066: Resulting in Japanese-American Incarceration',
		institution: 'US National Archives',
		url: 'https://www.archives.gov/milestone-documents/executive-order-9066',
		note: 'Order dated 19 February 1942; context distinguishes the order’s wording from its discriminatory implementation.'
	},
	{
		id: 'rationing',
		title: '“Rationing Safeguards Your Share”',
		institution: 'Library of Congress',
		url: 'https://blogs.loc.gov/inside_adams/2020/04/rationing-ww2/',
		note: 'Library research on ration books, consumer goods and public education, with digitised wartime examples.'
	},
	{
		id: 'rationing-pamphlet',
		title: 'Food rationing and the war (1943)',
		institution: 'US Office of War Information / Library of Congress',
		url: 'https://www.loc.gov/item/43051838/',
		note: 'Contemporary publication by Elmer Davis. The date is the publication year, not a single day of rationing.'
	},
	{
		id: 'gi-bill',
		title: 'Servicemen’s Readjustment Act (1944)',
		institution: 'US National Archives',
		url: 'https://www.archives.gov/milestone-documents/servicemens-readjustment-act',
		note: '22 June 1944; educational and housing benefits, with explicit discussion of discrimination faced by Black veterans.'
	},
	{
		id: 'luce-celler',
		title: 'Public Law 483, 79th Congress: naturalisation and admission',
		institution: 'US Government Publishing Office',
		url: 'https://www.govinfo.gov/content/pkg/STATUTE-60/pdf/STATUTE-60-Pg416.pdf',
		note: '60 Stat. 416, 2 July 1946: racial eligibility for naturalisation. Commonly called the Luce–Celler Act.'
	},
	{
		id: 'luce-celler-quota',
		title: 'Public Law 483, continuation: immigration quota',
		institution: 'US Government Publishing Office',
		url: 'https://www.govinfo.gov/content/pkg/STATUTE-60/pdf/STATUTE-60-Pg417.pdf',
		note: '60 Stat. 417, section 4: immigration from India remained allocated to a quota.'
	},
	{
		id: 'jackie-robinson',
		title: 'Jackie Robinson breaks the color line',
		institution: 'Library of Congress',
		url: 'https://www.loc.gov/item/today-in-history/april-15/',
		note: 'Major League debut for the Brooklyn Dodgers on 15 April 1947; the Library specifies the modern-era context.'
	},
	{
		id: 'shelley',
		title: 'Missouri: The Shelley House',
		institution: 'US National Park Service',
		url: 'https://home.nps.gov/places/missouri-the-shelley-house-l.htm',
		note: 'Shelley v. Kraemer, 3 May 1948: courts could not enforce racially restrictive housing covenants; the ruling did not erase housing discrimination.'
	},
	{
		id: 'the-river',
		title: 'The River (1951)',
		institution: 'British Film Institute',
		url: 'https://player.bfi.org.uk/subscription/film/watch-the-river-1951-online',
		note: 'The BFI identifies the film as USA, 1951, and describes its Indian location shoot and British-family viewpoint.'
	},
	{
		id: 'river-restoration',
		title: 'The River: restoration screening resource guide',
		institution: 'The Film Foundation',
		url: 'https://www.film-foundation.org/rsr-february-2023',
		note: 'Documents Renoir’s friendship with Ray during location scouting in Calcutta.'
	},
	{
		id: 'lucy',
		title: 'I Love Lucy: An American Legend',
		institution: 'Library of Congress',
		url: 'https://wwws.loc.gov/exhibits/i-love-lucy/overview.html',
		note: 'Exhibition overview: first broadcast on 15 October 1951; performers, production and recording for reruns.'
	},
	{
		id: 'brown',
		title: 'Brown v. Board of Education (1954)',
		institution: 'US National Archives',
		url: 'https://www.archives.gov/milestone-documents/brown-v-board-of-education',
		note: 'Opinion dated 17 May 1954. The contextual essay discusses subsequent resistance and Brown II.'
	},
	{
		id: 'rosa-parks',
		title: 'The Bus Boycott — Rosa Parks: In Her Own Words',
		institution: 'Library of Congress',
		url: 'https://www.loc.gov/exhibitions/rosa-parks-in-her-own-words/about-this-exhibition/the-bus-boycott/',
		note: 'Parks’s arrest on 1 December 1955 and the organising context of the Montgomery boycott.'
	},
	{
		id: 'interstate',
		title: 'History of the Eisenhower Interstate System',
		institution: 'US Federal Highway Administration',
		url: 'https://www.fhwa.dot.gov/interstate-70th/history_eisenhower_interstate_system.cfm',
		note: 'The 29 June 1956 law authorised a 41,000-mile network; authorisation is distinct from construction and completion.'
	},
	{
		id: 'nasa',
		title: 'NASA begins operations',
		institution: 'NASA, Johnson Space Center',
		url: 'https://www.nasa.gov/history/65-years-ago-nasa-begins-operations/',
		note: 'NASA began operating on 1 October 1958, after the July legislation that created it.'
	},
	{
		id: 'hawaii',
		title: 'Hawaii Statehood, August 21, 1959',
		institution: 'US National Archives, Center for Legislative Archives',
		url: 'https://www.archives.gov/legislative/features/hawaii',
		note: 'Statehood records include the Queen’s earlier protest against annexation, supporting a reading attentive to contested sovereignty.'
	},
	{
		id: 'kind-of-blue',
		title: '“Kind of Blue” — Miles Davis (1959)',
		institution: 'Library of Congress, National Recording Registry',
		url: 'https://www.loc.gov/static/programs/national-recording-preservation-board/documents/KindOfBlue.pdf',
		note: 'George Grella Jr.’s Registry essay, pp. 1–2: the 1959 recording and release, modal approach and the different voices of the ensemble.'
	}
];

export const events: HistoricalEvent[] = [
	{
		id: 'calcutta-tagore',
		side: 'calcutta',
		scope: 'Calcutta · Bengali cultural life',
		date: { kind: 'point', value: '1941-08-07', precision: 'day' },
		title: 'A poet’s life ends; the work stays',
		summary:
			'Rabindranath Tagore died on 7 August. Poetry was only part of his life’s work: songs, fiction, drama, painting and an experimental school also belonged to it. This calendar begins with a cultural inheritance, as well as a war.',
		theme: 'Culture',
		sourceIds: ['tagore']
	},
	{
		id: 'calcutta-air-raids',
		side: 'calcutta',
		scope: 'Calcutta · wartime newsreel',
		date: { kind: 'point', value: '1943-02', precision: 'month' },
		title: 'A camera shows the city after raids',
		summary:
			'A government-sponsored newsreel showed Calcutta after Japanese air raids: damaged buildings, repairs and traffic resuming. Its reassuring account was an attempt to shape wartime feeling. The museum’s catalogue asks us to read that confidence as propaganda, rather than a complete portrait of the city.',
		theme: 'War',
		sourceIds: ['calcutta-newsreel'],
		qualification:
			'February 1943 dates production of the newsreel; it is not the date of the first air raid.'
	},
	{
		id: 'calcutta-howrah',
		side: 'calcutta',
		scope: 'Calcutta–Howrah · Hooghly crossing',
		date: { kind: 'point', value: '1943-02-03', precision: 'day' },
		title: 'A new way across the Hooghly',
		summary:
			'The new Howrah Bridge opened across the Hooghly, replacing the earlier pontoon crossing between Howrah and Calcutta. A structure now inseparable from the city’s image entered everyday use in the middle of wartime. Infrastructure and catastrophe occupy the same year.',
		theme: 'Movement',
		sourceIds: ['howrah-bridge']
	},
	{
		id: 'calcutta-famine',
		side: 'calcutta',
		scope: 'Bengal · famine visible in Calcutta',
		date: { kind: 'point', value: '1943', precision: 'year' },
		title: 'Hunger arrives in the city',
		summary:
			'A US diplomatic memorandum described starving villagers reaching Calcutta and people dying in its streets. It urged consideration of rice relief. The document makes hunger visible inside wartime official correspondence, while leaving the famine’s larger causes and human experience beyond a single report.',
		theme: 'Food',
		sourceIds: ['bengal-famine'],
		qualification:
			'A year-level famine record. The supporting memorandum is dated 28 August; no single day contains the catastrophe.'
	},
	{
		id: 'calcutta-violence',
		side: 'calcutta',
		scope: 'Calcutta · neighbourhood violence',
		date: { kind: 'point', value: '1946-08', precision: 'month' },
		title: 'Neighbours become vulnerable',
		summary:
			'Communal violence spread through Calcutta in August. A contemporary account preserved by the National Archives describes attacks on Hindu and Muslim residents and the difficulty of reaching affected streets. Its colonial vocabulary also reminds us that an official witness never supplies the whole history.',
		theme: 'Belonging',
		sourceIds: ['calcutta-violence'],
		qualification:
			'Month-level selection; the cited account describes 16–17 August. It is not an estimate of the full death toll.'
	},
	{
		id: 'calcutta-independence',
		side: 'calcutta',
		scope: 'India · Bengal divided',
		date: { kind: 'point', value: '1947-08-15', precision: 'day' },
		title: 'Freedom, with a border through Bengal',
		summary:
			'India became independent as British India was partitioned. The Independence Act divided Bengal into East and West Bengal, placing the provinces within different dominions. The new national calendar therefore began with both political freedom and a frontier through a shared region.',
		theme: 'Citizenship',
		sourceIds: ['independence-act'],
		qualification:
			'This date marks India’s independence and the Act’s appointed day; it does not compress Partition’s consequences into one day.'
	},
	{
		id: 'calcutta-film-society',
		side: 'calcutta',
		scope: 'Calcutta · film society',
		date: { kind: 'point', value: '1947', precision: 'year' },
		title: 'A room for watching the world',
		summary:
			'Satyajit Ray and friends co-founded the Calcutta Film Society. Their first screening was Battleship Potemkin. Hollywood films were also circulating in the city. Watching, discussing and writing about cinema became part of Calcutta’s own creative life, rather than merely an encounter with distant entertainment.',
		theme: 'Culture',
		sourceIds: ['film-society']
	},
	{
		id: 'calcutta-damodar',
		side: 'calcutta',
		scope: 'West Bengal and Bihar · national legislation',
		date: { kind: 'point', value: '1948-03-27', precision: 'day' },
		title: 'A river valley becomes a public project',
		summary:
			'The Damodar Valley Corporation Act provided a legal framework for developing a valley shared by West Bengal and Bihar. In the new state, rivers and regional development were subjects of public planning. This mark records a legislative commitment, before the work of construction.',
		theme: 'Work',
		sourceIds: ['damodar-act'],
		qualification:
			'Enactment date of the Act; the corporation’s establishment and completion of individual projects have separate dates.'
	},
	{
		id: 'calcutta-renoir',
		side: 'calcutta',
		scope: 'Calcutta · international film encounter',
		date: { kind: 'point', value: '1949', precision: 'year' },
		title: 'Ray meets Renoir in Calcutta',
		summary:
			'Jean Renoir came to Calcutta to scout locations for The River. Ray accompanied him. The Ray Archives Society describes the encounter as strengthening Ray’s resolve to become a filmmaker: a specific exchange of people and ideas across the apparently separate ribbons.',
		theme: 'Culture',
		sourceIds: ['ray-renoir', 'river-restoration']
	},
	{
		id: 'calcutta-republic',
		side: 'calcutta',
		scope: 'India · constitutional change',
		date: { kind: 'point', value: '1950-01-26', precision: 'day' },
		title: 'A republic’s calendar begins',
		summary:
			'India’s Constitution came into force and the country became a sovereign democratic republic. The Supreme Court came into existence that day; its ceremonial inauguration followed two days later. Constitutional institutions gave independence a new legal structure, with a continuing life beyond the founding ceremony.',
		theme: 'Citizenship',
		sourceIds: ['republic']
	},
	{
		id: 'calcutta-iit',
		side: 'calcutta',
		scope: 'Kharagpur, West Bengal · technical education',
		date: { kind: 'point', value: '1951-08-18', precision: 'day' },
		title: 'A former detention camp, a new classroom',
		summary:
			'IIT Kharagpur was formally inaugurated at Hijli. Its first academic session began that August with classrooms and laboratories in the former detention camp. An institution initially based in Calcutta made technical education part of the region’s post-independence ambitions.',
		theme: 'Education',
		sourceIds: ['iit-kharagpur'],
		qualification:
			'The inauguration was in 1951; the institute’s organisational beginnings were in 1950.'
	},
	{
		id: 'calcutta-election',
		side: 'calcutta',
		scope: 'India · national and state elections',
		date: { kind: 'duration', start: '1951', end: '1952', precision: 'year' },
		title: 'Democracy takes more than a day',
		summary:
			'India’s first general elections extended across 1951–52. Voters elected the Lok Sabha and state assemblies through a vast common exercise. The Election Commission’s account places 489 parliamentary seats and about 3,283 assembly seats within that first electoral undertaking.',
		theme: 'Citizenship',
		sourceIds: ['first-election'],
		qualification:
			'A documented duration shown at year precision. The outer year boundaries express the source’s precision; polling did not continue on every day of both years.'
	},
	{
		id: 'calcutta-pather',
		side: 'calcutta',
		scope: 'Bengal · Calcutta-centred filmmaking',
		date: { kind: 'point', value: '1955', precision: 'year' },
		title: 'Ordinary life fills the cinema',
		summary:
			'Ray’s first feature, Pather Panchali, followed a rural Bengali family through discovery, pleasure and loss. Adapted from Bibhutibhushan Bandopadhyay, it helped establish a Calcutta-centred art cinema. The small incidents of a family’s life could carry the scale of a film.',
		theme: 'Culture',
		sourceIds: ['pather-panchali'],
		qualification:
			'The production/release year is the historical record; the fictional family is not a representative survey of Bengal in 1955.'
	},
	{
		id: 'calcutta-inheritance',
		side: 'calcutta',
		scope: 'India · communities covered by Hindu personal law',
		date: { kind: 'point', value: '1956-06-17', precision: 'day' },
		title: 'Family property enters a new legal chapter',
		summary:
			'The Hindu Succession Act recast the law of inheritance when a person died without a will. The family home and other property were matters of statute as well as custom. Its defined personal-law coverage must not be mistaken for one inheritance law for every Indian.',
		theme: 'Home',
		sourceIds: ['hindu-succession'],
		qualification:
			'The linked text contains later amendments. This record makes no claim that later equal coparcenary rights already existed in 1956.'
	},
	{
		id: 'calcutta-apu',
		side: 'calcutta',
		scope: 'Bengal · a film about family life',
		date: { kind: 'point', value: '1959', precision: 'year' },
		title: 'A marriage, a room, a whole world',
		summary:
			'Apur Sansar completed Ray’s Apu trilogy. A young writer’s marriage, grief and relationship with his son provided its intimate scale. Alongside public histories, cinema preserved another way of imagining a life: through affection, responsibility and the difficult work of returning to others.',
		theme: 'Culture',
		sourceIds: ['apur-sansar'],
		qualification: '1959 is the film’s year, not the date of the fictional events it depicts.'
	},
	{
		id: 'america-draft',
		side: 'america',
		scope: 'United States · federal policy',
		date: { kind: 'point', value: '1940', precision: 'year' },
		title: 'Peacetime acquires a draft',
		summary:
			'The Selective Training and Service Act created the first peacetime military draft in US history. Before the country formally entered the war, the federal government was already organising men for service. A calendar of work and family could now also contain military obligations.',
		theme: 'War',
		sourceIds: ['draft']
	},
	{
		id: 'america-fair-employment',
		side: 'america',
		scope: 'United States · defence employment',
		date: { kind: 'point', value: '1941-06-25', precision: 'day' },
		title: 'The right to a wartime job is contested',
		summary:
			'After pressure from A. Philip Randolph and other Black leaders, Roosevelt prohibited discrimination in defence employment and created a Fair Employment Practice Committee. Wartime job creation did not automatically make work equally accessible; organised demands helped force a federal response.',
		theme: 'Work',
		sourceIds: ['fair-employment'],
		qualification:
			'The order and its enforcement were different things; the National Archives discusses the committee’s limited reach.'
	},
	{
		id: 'america-pearl-harbor',
		side: 'america',
		scope: 'Pearl Harbor, Territory of Hawaii',
		date: { kind: 'point', value: '1941-12-07', precision: 'day' },
		title: 'A Sunday becomes a national rupture',
		summary:
			'Japan attacked the US naval base at Pearl Harbor, in the then Territory of Hawaii. The following day Roosevelt asked Congress for a declaration of war. The Pacific conflict entered American public life through a particular place that was not yet a state.',
		theme: 'War',
		sourceIds: ['pearl-harbor']
	},
	{
		id: 'america-incarceration',
		side: 'america',
		scope: 'US West Coast · Japanese American communities',
		date: { kind: 'point', value: '1942-02-19', precision: 'day' },
		title: 'Citizenship fails to protect a home',
		summary:
			'Executive Order 9066 authorised military exclusions and led to the forced removal and incarceration of Japanese Americans. Families lost liberty, homes and property; many of those confined were US citizens. The wartime home front included state-imposed dispossession as well as shared mobilisation.',
		theme: 'Belonging',
		sourceIds: ['incarceration'],
		qualification:
			'This is the order’s date. Removal, confinement and losses occurred over subsequent months and years.'
	},
	{
		id: 'america-rationing',
		side: 'america',
		scope: 'United States · household rationing',
		date: { kind: 'point', value: '1943', precision: 'year' },
		title: 'A ration book beside the shopping list',
		summary:
			'Food rationing and the war, a 1943 government pamphlet, explained a system that had entered household routines. Coupons accompanied purchases of goods such as sugar, coffee and meat. Managing wartime supply became a task carried out at the shop counter and in the kitchen.',
		theme: 'Food',
		sourceIds: ['rationing', 'rationing-pamphlet'],
		qualification:
			'The year belongs to the pamphlet. Rationing began earlier and did not create conditions equivalent to the Bengal famine.'
	},
	{
		id: 'america-gi-bill',
		side: 'america',
		scope: 'United States · returning veterans',
		date: { kind: 'point', value: '1944-06-22', precision: 'day' },
		title: 'A postwar future is written into law',
		summary:
			'The GI Bill offered veterans education, unemployment and housing support while the war was still being fought. It widened opportunities for millions, but discriminatory lending and housing practices obstructed many Black veterans. The promise of a home depended on who could actually obtain the benefit.',
		theme: 'Home',
		sourceIds: ['gi-bill']
	},
	{
		id: 'america-luce-celler',
		side: 'america',
		scope: 'United States · immigrants from India and the Philippines',
		date: { kind: 'point', value: '1946-07-02', precision: 'day' },
		title: 'A narrow door to naturalisation opens',
		summary:
			'The law commonly called Luce–Celler removed a racial barrier to naturalisation for people of Indian and Filipino origin. Immigration from India still operated through a quota. The statute opened a route to citizenship while preserving the wider system’s restrictions on entry.',
		theme: 'Citizenship',
		sourceIds: ['luce-celler', 'luce-celler-quota'],
		qualification:
			'A change in legal eligibility, not automatic citizenship and not unrestricted immigration.'
	},
	{
		id: 'america-robinson',
		side: 'america',
		scope: 'Brooklyn, New York · Major League Baseball',
		date: { kind: 'point', value: '1947-04-15', precision: 'day' },
		title: 'Number 42 steps onto the field',
		summary:
			'Jackie Robinson debuted for the Brooklyn Dodgers, breaking Major League Baseball’s modern colour barrier. He faced hostility as well as public attention. A change within one immensely visible American institution became a civil-rights milestone; it did not mean the country’s other barriers had disappeared.',
		theme: 'Belonging',
		sourceIds: ['jackie-robinson']
	},
	{
		id: 'america-shelley',
		side: 'america',
		scope: 'St Louis, Missouri · US Supreme Court',
		date: { kind: 'point', value: '1948-05-03', precision: 'day' },
		title: 'A family contests the boundary of home',
		summary:
			'The Shelley family’s fight over a St Louis home reached the Supreme Court. In Shelley v. Kraemer, it ruled that courts could not enforce racially restrictive housing covenants. A property dispute became a constitutional question about who could live where.',
		theme: 'Home',
		sourceIds: ['shelley'],
		qualification:
			'The ruling barred court enforcement of the covenants; it did not itself eliminate private housing discrimination.'
	},
	{
		id: 'america-river',
		side: 'america',
		scope: 'US-produced cinema · filmed in Bengal',
		date: { kind: 'point', value: '1951', precision: 'year' },
		title: 'An American production looks towards Bengal',
		summary:
			'Jean Renoir’s The River, classified by the BFI as a US film, was shot entirely in India. Its coming-of-age story followed a British family beside the river. An American production context, a French director and Indian locations came together in one film.',
		theme: 'Culture',
		sourceIds: ['the-river', 'river-restoration'],
		qualification:
			'Placed on the American ribbon for production context; the filming took place in India and the viewpoint is that of a British household.'
	},
	{
		id: 'america-lucy',
		side: 'america',
		scope: 'United States · television broadcast',
		date: { kind: 'point', value: '1951-10-15', precision: 'day' },
		title: 'A fictional household enters the living room',
		summary:
			'I Love Lucy began broadcasting, with Lucille Ball and Desi Arnaz playing Lucy and Ricky Ricardo. Filming before a studio audience also made reruns possible. A carefully constructed domestic world could return to viewers again and again, becoming part of television’s shared cultural memory.',
		theme: 'Culture',
		sourceIds: ['lucy'],
		qualification:
			'A programme’s debut, not evidence that every US household owned a television or resembled the Ricardos.'
	},
	{
		id: 'america-brown',
		side: 'america',
		scope: 'United States · public school segregation',
		date: { kind: 'point', value: '1954-05-17', precision: 'day' },
		title: 'The school gate becomes a constitutional line',
		summary:
			'In Brown v. Board of Education, the Supreme Court held state-imposed racial segregation in public schools unconstitutional. The unanimous ruling changed the legal foundation of schooling. Resistance and the later struggle over implementation meant that a judgment’s date and a child’s experience could remain far apart.',
		theme: 'Education',
		sourceIds: ['brown']
	},
	{
		id: 'america-parks',
		side: 'america',
		scope: 'Montgomery, Alabama · segregated transport',
		date: { kind: 'point', value: '1955-12-01', precision: 'day' },
		title: 'A bus ride becomes a public stand',
		summary:
			'Rosa Parks was arrested after refusing to surrender her bus seat to a white passenger. Her action came within an existing civil-rights organising community and helped set the Montgomery boycott in motion. Everyday transport was a place where unequal citizenship was imposed and challenged.',
		theme: 'Movement',
		sourceIds: ['rosa-parks']
	},
	{
		id: 'america-interstate',
		side: 'america',
		scope: 'United States · interstate highway programme',
		date: { kind: 'point', value: '1956-06-29', precision: 'day' },
		title: 'Distance gets a federal blueprint',
		summary:
			'Eisenhower signed the Federal-Aid Highway Act, authorising a 41,000-mile interstate network. The country committed to a new scale of road infrastructure. This point marks a decision about future movement, rather than the day on which a completed system suddenly appeared.',
		theme: 'Movement',
		sourceIds: ['interstate']
	},
	{
		id: 'america-nasa',
		side: 'america',
		scope: 'United States · civilian space programme',
		date: { kind: 'point', value: '1958-10-01', precision: 'day' },
		title: 'The horizon becomes an institution',
		summary:
			'NASA began operations, bringing the existing National Advisory Committee for Aeronautics into a new civilian space agency. Its establishment followed legislation signed in July. The space programme’s future was being assembled through laboratories, staff and administrative decisions before its better-known journeys.',
		theme: 'Work',
		sourceIds: ['nasa']
	},
	{
		id: 'america-hawaii',
		side: 'america',
		scope: 'Hawaii · US statehood',
		date: { kind: 'point', value: '1959-08-21', precision: 'day' },
		title: 'The map acquires a fiftieth state',
		summary:
			'Hawaii became the fiftieth US state. The National Archives preserves records of the long statehood campaign alongside Queen Liliuokalani’s earlier protest against American annexation. The date changes a national map while inviting attention to the different meanings of belonging and sovereignty within it.',
		theme: 'Citizenship',
		sourceIds: ['hawaii']
	},
	{
		id: 'america-kind-of-blue',
		side: 'america',
		scope: 'United States · recorded jazz',
		date: { kind: 'point', value: '1959', precision: 'year' },
		title: 'Another way of inhabiting time',
		summary:
			'Miles Davis’s Kind of Blue was recorded and released in 1959. Its exploration of modal jazz gave distinct musical voices room within a shared recording. The Registry essay treats it as a particular artistic moment, rather than the single direction of American music.',
		theme: 'Culture',
		sourceIds: ['kind-of-blue'],
		qualification:
			'Year-level record; this experience includes no audio playback or unlicensed album artwork.'
	}
];

export const connections: HistoricalConnection[] = [
	{
		id: 'war-comes-home',
		leftId: 'calcutta-air-raids',
		rightId: 'america-pearl-harbor',
		kind: 'thematic',
		title: 'When distance from the war collapses',
		rationale:
			'Pearl Harbor’s attack and a later Calcutta newsreel show war entering particular places and their public stories. These are different dates and different records: an attack in Hawaii and a mediated account of a city after raids.',
		sourceIds: ['calcutta-newsreel', 'pearl-harbor']
	},
	{
		id: 'unequal-tables',
		leftId: 'calcutta-famine',
		rightId: 'america-rationing',
		kind: 'thematic',
		title: 'Two tables in a world at war',
		rationale:
			'Food allocation reached everyday life in both places in 1943, with profoundly unequal conditions. US rationing and Bengal’s famine are compared as questions of access and public responsibility; they are not equivalent experiences or a claim of direct causation.',
		sourceIds: ['bengal-famine', 'rationing', 'rationing-pamphlet']
	},
	{
		id: 'freedom-1947',
		leftId: 'calcutta-independence',
		rightId: 'america-robinson',
		kind: 'shared-time',
		title: '1947: freedom has more than one scale',
		rationale:
			'In the same year, India became independent through Partition and Robinson crossed a colour barrier in Brooklyn. Their scale, causes and consequences differ. The shared-year thread asks what a public breakthrough changes, and which barriers remain outside its reach.',
		sourceIds: ['independence-act', 'jackie-robinson']
	},
	{
		id: 'citizenship-papers',
		leftId: 'calcutta-independence',
		rightId: 'america-luce-celler',
		kind: 'thematic',
		title: 'Belonging is also written on paper',
		rationale:
			'The 1946 US naturalisation reform and India’s 1947 independence placed people of Indian origin within changing legal frameworks. One altered eligibility within an existing state; the other created independent dominions. Their proximity is an editorial comparison, not a causal connection.',
		sourceIds: ['independence-act', 'luce-celler', 'luce-celler-quota']
	},
	{
		id: 'building-after-war',
		leftId: 'calcutta-damodar',
		rightId: 'america-gi-bill',
		kind: 'thematic',
		title: 'What should a public future provide?',
		rationale:
			'The GI Bill and Damodar legislation both made material futures a responsibility of public policy. Their recipients and mechanisms were different: benefits for veterans in one case, regional development in the other. A law’s promise is a beginning, not proof of universal delivery.',
		sourceIds: ['damodar-act', 'gi-bill']
	},
	{
		id: 'constitutional-life',
		leftId: 'calcutta-republic',
		rightId: 'america-brown',
		kind: 'thematic',
		title: 'Constitutional time and everyday time',
		rationale:
			'A constitution coming into force and a court applying equal protection are different kinds of legal moment. Reading 1950 beside 1954 invites a question about the distance between an institutional declaration and the everyday lives it is meant to shape.',
		sourceIds: ['republic', 'brown']
	},
	{
		id: 'a-real-crossing',
		leftId: 'calcutta-renoir',
		rightId: 'america-river',
		kind: 'documented',
		title: 'This thread was a real encounter',
		rationale:
			'Renoir’s 1949 location scouting brought him into contact with Ray in Calcutta. The resulting US-produced film, The River, appeared in 1951. The Ray Archives Society and Film Foundation document the encounter; this connection records collaboration and influence, not merely matching dates.',
		sourceIds: ['ray-renoir', 'river-restoration', 'the-river']
	},
	{
		id: 'lives-on-screen',
		leftId: 'calcutta-pather',
		rightId: 'america-lucy',
		kind: 'thematic',
		title: 'Which ordinary lives fill a screen?',
		rationale:
			'Pather Panchali’s rural family and I Love Lucy’s invented household offer different forms of domestic storytelling. Their debut years are four years apart. Neither stands for every family around it; the comparison concerns the worlds that popular moving images invited viewers to enter.',
		sourceIds: ['pather-panchali', 'lucy']
	},
	{
		id: 'the-law-of-home',
		leftId: 'calcutta-inheritance',
		rightId: 'america-shelley',
		kind: 'thematic',
		title: 'The home has a legal boundary',
		rationale:
			'Inheritance legislation in India and a racial-covenant case in St Louis reach the intimate world of property through different legal questions. Their dates are eight years apart. The connection concerns law’s presence inside domestic life, without making religion, gender and race interchangeable.',
		sourceIds: ['hindu-succession', 'shelley']
	},
	{
		id: 'feeling-1959',
		leftId: 'calcutta-apu',
		rightId: 'america-kind-of-blue',
		kind: 'shared-time',
		title: '1959: two ways to make room for a life',
		rationale:
			'Apur Sansar and Kind of Blue belong to the same release year. A film and a jazz record attend to different human rhythms. The thread marks their coexistence, leaving any resemblance to the reader; there is no claimed collaboration or influence between them.',
		sourceIds: ['apur-sansar', 'kind-of-blue']
	}
];

export const chapters: HistoricalChapter[] = [
	{
		id: 'war-at-the-table',
		number: '01',
		title: 'The war reaches the table',
		subtitle: 'What does “wartime” ask of an ordinary day?',
		startYear: 1940,
		endYear: 1944,
		body: 'A global war enters local routines through service, a damaged street, a shopping list, the search for food. The ribbons share a chronology, but their burdens cannot be weighed as equivalents. Follow a thread between American rationing and hunger visible in Calcutta; read the gap as carefully as the connection.',
		connectionIds: ['unequal-tables', 'war-comes-home']
	},
	{
		id: 'the-shape-of-freedom',
		number: '02',
		title: 'The shape of freedom',
		subtitle: 'A new border. An old barrier crossed.',
		startYear: 1945,
		endYear: 1948,
		body: 'Pause in 1947. India becomes independent through Partition; in Brooklyn, Jackie Robinson enters the Major Leagues. These are not versions of the same event. Together they ask a more useful question: how does a public breakthrough reach the people who must live on the other side of it?',
		connectionIds: ['freedom-1947', 'citizenship-papers']
	},
	{
		id: 'a-future-under-construction',
		number: '03',
		title: 'A future under construction',
		subtitle: 'Plans become institutions; people cross the ribbons.',
		startYear: 1949,
		endYear: 1952,
		body: 'The new decades take material form: a republic, classrooms, elections, plans for a river valley. Compare public commitments without treating an enactment as an accomplished future. Then follow the one thread that is a documented encounter: Ray and Renoir’s work around the making of The River.',
		connectionIds: ['building-after-war', 'a-real-crossing']
	},
	{
		id: 'the-public-and-the-intimate',
		number: '04',
		title: 'The public and the intimate',
		subtitle: 'Who enters a classroom, a house, a screen?',
		startYear: 1953,
		endYear: 1956,
		body: 'Law reaches the school gate and the family home. Moving images give domestic life another public form: Lucy’s fictional household, Apu’s rural family. Some threads cross several years because they compare ideas. Their labelled dates keep resemblance from becoming a false claim of simultaneity.',
		connectionIds: ['constitutional-life', 'lives-on-screen', 'the-law-of-home']
	},
	{
		id: 'more-than-one-rhythm',
		number: '05',
		title: 'More than one rhythm',
		subtitle: 'History is also made at the scale of attention.',
		startYear: 1957,
		endYear: 1959,
		body: 'The decade closes with a space agency and another state on the American map. It also closes with a film about the work of loving and a jazz record that gives distinct voices room. Select a year, inspect what this small atlas includes, and make a postcard of one encounter.',
		connectionIds: ['feeling-1959']
	}
];
