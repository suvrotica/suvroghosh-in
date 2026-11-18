import type {
	CameraViewSpec,
	LandmarkId,
	LandmarkSpec,
	MoodPresetSpec,
	NeighborhoodId,
	NeighborhoodSpec,
	SecretCuriositySpec,
	SecretId
} from './types';

export const OVERVIEW_CAMERA: CameraViewSpec = {
	position: [25.2, 19.2, 28.4],
	target: [-0.6, 4.3, -0.4],
	fov: 40
};

export const MOOD_PRESETS: MoodPresetSpec[] = [
	{
		id: 'morning',
		label: 'Storybook Morning',
		shortLabel: 'Morning',
		timeHours: 9.25,
		summary: 'Crisp pastel sky, sunlit limewashed plaster, singing coastal gulls, and lively cafés.'
	},
	{
		id: 'golden-hour',
		label: 'Golden Afternoon',
		shortLabel: 'Golden Hour',
		timeHours: 16.75,
		summary:
			'Honeyed late sun raking across handmade clay tiles, terracotta brick, and canal ripples.'
	},
	{
		id: 'blue-hour',
		label: 'Twilight Blue Hour',
		shortLabel: 'Blue Hour',
		timeHours: 19.1,
		summary:
			'Indigo-rose dusk as amber windows, paper lanterns, and drink machines wake up one by one.'
	},
	{
		id: 'lantern-night',
		label: 'Lantern Midnight',
		shortLabel: 'Night',
		timeHours: 22.5,
		summary:
			'Velvet stop-motion night lit by warm hearth windows, swaying chain lanterns, and the lighthouse beam.'
	}
];

export const NEIGHBORHOODS: NeighborhoodSpec[] = [
	{
		id: 'old-town',
		number: 1,
		name: 'The Old Town',
		subtitle: 'Piazza delle Bougainvillea',
		shortLabel: 'Old Town',
		accentHex: '#d97862',
		badgeBg: 'rgba(217, 120, 98, 0.2)',
		description:
			'Romantic limewashed townhouses where flaking cream plaster reveals warm handmade brick, magenta bougainvillea spills over wrought-iron balconies, and exterior stone stairs wind above cobbled arches.',
		architecturalNotes:
			'Sculpted lime plaster, exposed terracotta brickwork, scalloped clay roof tiles, hand-bent iron railings, and fan-laid limestone cobblestones.',
		paletteSwatches: ['#f1e7d3', '#c85b44', '#d88b9c', '#e6b84c', '#5b7a53'],
		camera: {
			position: [-4.2, 8.2, 10.6],
			target: [-11.5, 3.6, -0.5],
			fov: 42
		},
		walkSpawn: [-9.2, 0.62, 1.8],
		walkHeadingRad: -1.1,
		labelAnchor: [-12.5, 9.8, -1.2]
	},
	{
		id: 'lighthouse-district',
		number: 2,
		name: 'The Lighthouse District',
		subtitle: 'Cape Whispering Gull',
		shortLabel: 'Lighthouse',
		accentHex: '#5d8eb8',
		badgeBg: 'rgba(93, 142, 184, 0.22)',
		description:
			'Dramatic stratified sea cliffs above a shimmering resin harbor cove, where a crooked residential lighthouse and a sheer-boulder fantasy rookery spire keep watch with wheeling gulls.',
		architecturalNotes:
			'Carved cliffstone boulders, slate shingle roofs, brass porthole frames, cantilevered oak cabins, stepped coastal footpaths, and a revolving Fresnel cupola.',
		paletteSwatches: ['#4a6b88', '#e9dec8', '#394f6b', '#c66735', '#7ea8be'],
		camera: {
			position: [-27.5, 13.5, -2.5],
			target: [-14.8, 6.8, -14.2],
			fov: 42
		},
		walkSpawn: [-15.2, 3.52, -11.4],
		walkHeadingRad: -2.4,
		labelAnchor: [-15.5, 14.8, -14.2]
	},
	{
		id: 'teapot-quarter',
		number: 3,
		name: 'The Teapot Quarter',
		subtitle: 'Kettlewick Green',
		shortLabel: 'Teapot Quarter',
		accentHex: '#6a9ab5',
		badgeBg: 'rgba(106, 154, 181, 0.22)',
		description:
			'A whimsical potter’s hollow where oversized matte-blue enamel teapots, copper-domed coffee towers, and glazed terracotta mugs have been fitted with mullioned windows, chimneys, and tiny pastry cafés.',
		architecturalNotes:
			'Hand-thrown ceramic vessels, crazed stoneware glazes, burnished copper lids, curved spout cranes, and cotton-tuft steam clouds.',
		paletteSwatches: ['#5b86a3', '#d47b4a', '#ecd189', '#f3ede0', '#799985'],
		camera: {
			position: [-2.8, 7.8, 24.5],
			target: [-11.8, 4.0, 13.5],
			fov: 42
		},
		walkSpawn: [-10.4, 0.78, 11.2],
		walkHeadingRad: 2.5,
		labelAnchor: [-13.5, 10.6, 13.5]
	},
	{
		id: 'lantern-district',
		number: 4,
		name: 'The Lantern District',
		subtitle: 'Umbra Crag & Red-Eave Alley',
		shortLabel: 'Lantern District',
		accentHex: '#e89d42',
		badgeBg: 'rgba(232, 157, 66, 0.22)',
		description:
			'Narrow flagstone passages leading past a cluttered vermilion-eaved apothecary and across a crimson moon-bridge to dark timber towers perched on twin rock spires with long chain-hung amber lanterns.',
		architecturalNotes:
			'Charred cedar yakisugi siding, upturned pagoda clay roofs, carved stone steps, winter branches, and wrought-iron chain lanterns.',
		paletteSwatches: ['#33302e', '#c94c38', '#f4a83b', '#dfd9cd', '#5c7864'],
		camera: {
			position: [26.8, 13.6, -2.2],
			target: [12.8, 6.8, -10.8],
			fov: 42
		},
		walkSpawn: [8.4, 0.75, -3.2],
		walkHeadingRad: -0.45,
		labelAnchor: [14.5, 16.8, -13.5]
	},
	{
		id: 'colorful-urban',
		number: 5,
		name: 'The Colorful Urban Quarter',
		subtitle: 'Denki-Cho Corner',
		shortLabel: 'Colorful Urban',
		accentHex: '#f0be3d',
		badgeBg: 'rgba(240, 190, 61, 0.22)',
		description:
			'Vibrant mustard-yellow, bubblegum-pink, and weathered-turquoise three-story corner shops bristling with rooftop antennas, glowing drink machines, round windows, and delightfully tangled overhead wires.',
		architecturalNotes:
			'Painted stucco & vertical teal timber, patinated corrugated metal awnings, exterior wooden stairs, miniature AC condensers, and catenary utility poles.',
		paletteSwatches: ['#efc032', '#df6d92', '#3c99a6', '#e6632d', '#7bc4b2'],
		camera: {
			position: [24.8, 8.8, 19.5],
			target: [11.2, 4.2, 8.2],
			fov: 42
		},
		walkSpawn: [6.8, 0.65, 3.2],
		walkHeadingRad: 0.85,
		labelAnchor: [11.8, 10.8, 7.6]
	},
	{
		id: 'floating-village',
		number: 6,
		name: 'The Floating Village',
		subtitle: 'Cloud-Tether Reach',
		shortLabel: 'Floating Village',
		accentHex: '#7cc2b8',
		badgeBg: 'rgba(124, 194, 184, 0.22)',
		description:
			'Elevated buoyant crag-islands moored above the central canal by iron chains and a striped hot-air balloon, linked to the cliff spires and canal plaza by swaying lantern sky-bridges and a spiral stair-tower.',
		architecturalNotes:
			'Suspended sky-stone islands, plank-and-rope catenary bridges, copper observatory domes, brass propellers, and hanging root gardens.',
		paletteSwatches: ['#5db3ab', '#e5989b', '#f2d085', '#b97b45', '#eae2d0'],
		camera: {
			position: [1.5, 13.8, 9.8],
			target: [0.4, 8.2, -7.6],
			fov: 44
		},
		walkSpawn: [0.2, 6.48, -6.6],
		walkHeadingRad: 3.1,
		labelAnchor: [0.4, 15.2, -8.0]
	}
];

export const NEIGHBORHOOD_BY_ID: Record<NeighborhoodId, NeighborhoodSpec> = Object.fromEntries(
	NEIGHBORHOODS.map((n) => [n.id, n])
) as Record<NeighborhoodId, NeighborhoodSpec>;

export const LANDMARKS: LandmarkSpec[] = [
	// 1. Old Town
	{
		id: 'casa-del-gatto-nero',
		neighborhoodId: 'old-town',
		name: 'Casa del Gatto Nero',
		subtitle: 'Four-Story Weathered Bougainvillea Townhouse',
		materials: ['Peeling lime plaster', 'Terracotta brick', 'Hand-forged iron', 'Clay roof tiles'],
		story:
			'Built layer upon layer over four miniature generations, its ground-floor lime plaster has flaked away to reveal warm handmade brick around an arched cellar door while an exterior timber-and-stone stair climbs to an arched loggia.',
		residentNote:
			'Signora Luciana tends twenty-seven terracotta flowerpots on the rooftop wire pergola while Pippo, her velvet-black cat, supervises every passerby from the second-story window cornice.',
		architecturalDetail:
			'Notice the mustard-yellow parlor window frame, cantilevered stone brackets, and magenta bougainvillea cascading over two wrought-iron balconies.',
		focusTarget: [-14.5, 4.4, -1.8],
		cameraOffset: [8.8, 3.2, 7.6],
		walkEntrance: [-11.2, 0.64, -1.4],
		labelAnchor: [-14.5, 9.4, -1.8]
	},
	{
		id: 'crooked-clock-arch',
		neighborhoodId: 'old-town',
		name: "The Crooked Clock & Baker's Arch",
		subtitle: 'Vaulted Passageway & Espresso Corner',
		materials: ['Dusty-pink stucco', 'Ochre wash', 'Keystone limestone arch', 'Striped canvas'],
		story:
			'Two gently leaning houses brace each other across the northern cobble lane with a vaulted stone bridge-arch, sheltering tiny café tables fragrant with cinnamon buns.',
		residentNote:
			'The brass street clock runs four minutes slow on purpose so nobody ever feels late for morning espresso.',
		architecturalDetail:
			'Walk directly underneath the vaulted stone arch to climb the coastal switchback path toward Cape Whispering Gull.',
		focusTarget: [-9.5, 3.2, -4.4],
		cameraOffset: [6.5, 2.8, 7.2],
		walkEntrance: [-9.5, 0.65, -3.0],
		labelAnchor: [-9.5, 6.8, -4.4]
	},
	{
		id: 'fountain-paper-boats',
		neighborhoodId: 'old-town',
		name: 'Fountain of the Paper Boats',
		subtitle: 'Sunlit Piazza & Canal Bridgehead',
		materials: ['Carved travertine', 'Poured turquoise resin', 'Aged bronze', 'Fan cobblestones'],
		story:
			'At the heart of Old Town sits an octagonal stone basin where neighborhood children launch folded paper boats before racing across the arched canal bridge.',
		residentNote:
			'A mint-green postman’s bicycle leans against the three-globe iron streetlamp every afternoon while letters are sorted.',
		architecturalDetail:
			'Concentric fan-patterned cobbles radiate outward toward Kettlewick Lane and the central stone canal bridge.',
		focusTarget: [-7.8, 1.8, 1.8],
		cameraOffset: [6.4, 3.6, 6.8],
		walkEntrance: [-7.2, 0.62, 1.8],
		labelAnchor: [-7.8, 4.2, 1.8]
	},

	// 2. Lighthouse District
	{
		id: 'keepers-cottage-lighthouse',
		neighborhoodId: 'lighthouse-district',
		name: "Keeper's Cottage Lighthouse",
		subtitle: 'Residential Beacon of Cape Whispering Gull',
		materials: ['Two-tone sea plaster', 'Blue Welsh slate', 'Brass Fresnel cage', 'Driftwood'],
		story:
			'Half working coastal beacon and half cozy seaside cottage, its conical slate-blue and cream tower embraces a crooked two-story wing with round brass portholes and a ship’s wheel mounted over the porch.',
		residentNote:
			'Retired chart-maker Captain Milo brews cardamom tea upstairs while three coastal gulls claim permanent tenancy on his cupola railing.',
		architecturalDetail:
			'Watch the warm amber Fresnel lantern revolve slowly after dusk, sweeping a golden ribbon across the harbor waves.',
		focusTarget: [-18.5, 7.6, -13.5],
		cameraOffset: [8.5, 3.4, 9.2],
		walkEntrance: [-16.6, 3.55, -11.2],
		labelAnchor: [-18.5, 13.5, -13.5]
	},
	{
		id: 'windward-rookery-spire',
		neighborhoodId: 'lighthouse-district',
		name: 'The Windward Rookery Spire',
		subtitle: 'Cliff-Boulder Medieval Tower & Autumn Tree',
		materials: [
			'Stratified cliff limestone',
			'Blue slate shingles',
			'Cantilevered oak',
			'Copper foliage'
		],
		story:
			'Balanced atop a sheer monolithic sea boulder, this slender cream-stone tower sprouts cantilevered wooden study cabins, rope ladders, a red-tiled gatehouse, and a crooked witch-hat spire.',
		residentNote:
			'Astronomer-scribes climb the carved cliff steps with inkpots in their pockets, sheltered beneath a sweeping russet autumn tree growing sideways from the rock.',
		architecturalDetail:
			'Its upper timber gallery anchors the western rope sky-bridge leading directly across the clouds to the Floating Village.',
		focusTarget: [-10.5, 9.5, -16.2],
		cameraOffset: [-8.2, 3.2, 10.2],
		walkEntrance: [-10.5, 5.62, -14.4],
		labelAnchor: [-10.5, 16.0, -16.2]
	},
	{
		id: 'mussel-pier-boathouse',
		neighborhoodId: 'lighthouse-district',
		name: 'Mussel Pier & Harbor Boathouse',
		subtitle: 'Timber Pilings & Bobbing Dory Cove',
		materials: ['Salt-bleached pine', 'Tarred hemp rope', 'Rusted iron rings', 'Sea-glass'],
		story:
			'Tucked into the sheltered cove below the cliffs, weathered pilings hold up aplank jetty where a painted wooden dory bobs gently against rope fenders.',
		residentNote:
			'Freshly painted wooden buoys dry along the boathouse eaves beside baskets of polished sea glass.',
		architecturalDetail:
			'Translucent layered water reveals submerged harbor rocks and gentle foam rings around every timber post.',
		focusTarget: [-15.5, 1.4, -7.8],
		cameraOffset: [6.2, 3.4, 6.8],
		walkEntrance: [-13.6, 0.72, -7.2],
		labelAnchor: [-15.5, 3.8, -7.8]
	},

	// 3. Teapot Quarter
	{
		id: 'grand-blue-kettle',
		neighborhoodId: 'teapot-quarter',
		name: 'The Grand Blue Kettle Residence',
		subtitle: 'Three-Story Slate-Blue Enamel Teapot Home',
		materials: [
			'Matte slate-blue enamel',
			'Molded clay window collars',
			'Wrought chain',
			'Cotton steam'
		],
		story:
			'Turned on a giant potter’s wheel and fired in a hillside kiln, this majestic blue teapot houses three circular stories connected by a walnut spiral stair inside its belly.',
		residentNote:
			'Whenever Grandmother Oolong lights the parlor stove, plump white puffs of chamomile-scented steam billow cheerfully from the lid knob.',
		architecturalDetail:
			'A warm brass lantern sways on a chain from the curved pouring spout while climbing ivy wraps the sweeping C-handle.',
		focusTarget: [-15.2, 4.8, 13.2],
		cameraOffset: [8.4, 3.2, 8.2],
		walkEntrance: [-12.6, 0.85, 12.6],
		labelAnchor: [-15.2, 10.2, 13.2]
	},
	{
		id: 'copper-espresso-patisserie',
		neighborhoodId: 'teapot-quarter',
		name: 'Copper-Lid Tower & Mug Patisserie',
		subtitle: 'Stoneware Coffee Tower & Terracotta Mug Bakery',
		materials: [
			'Speckled cream stoneware',
			'Burnished copper',
			'Glazed terracotta',
			'Butter-yellow stucco'
		],
		story:
			'A tall white porcelain coffee-pot tower crowned with a spun-copper dome snuggles beside a warm terracotta mug cottage and a crooked yellow tile-roofed bakery.',
		residentNote:
			'Tiny marble-topped café tables outside serve thimble-sized éclairs and frothy cocoa until the evening lanterns come on.',
		architecturalDetail:
			'Notice how the terracotta mug’s curved handle forms a side porch arch next to shuttered wooden windows.',
		focusTarget: [-9.2, 4.0, 15.2],
		cameraOffset: [7.6, 3.0, 7.6],
		walkEntrance: [-9.2, 0.82, 12.8],
		labelAnchor: [-9.2, 8.4, 15.2]
	},
	{
		id: 'chamomile-conservatory',
		neighborhoodId: 'teapot-quarter',
		name: 'The Chamomile Sugar-Bowl Conservatory',
		subtitle: 'Celadon Ceramic Herb House & Glass Dome',
		materials: [
			'Sage-celadon glaze',
			'Faceted warm glass',
			'Brass ribs',
			'Miniature terracotta pots'
		],
		story:
			'Sculpted from a fluted green sugar bowl and topped with an amber-tinted conservatory dome, this fragrant workshop dries peppermint, lavender, and lemon verbena for the whole city.',
		residentNote:
			'Marmalade, a plump ginger cat, naps on the sun-warmed flagstone step beside crates of seedlings.',
		architecturalDetail:
			'Warm interior greenhouse lamps make the faceted glass dome glow like a jade lantern at twilight.',
		focusTarget: [-5.4, 2.8, 11.2],
		cameraOffset: [6.4, 2.8, 6.4],
		walkEntrance: [-7.2, 0.74, 10.6],
		labelAnchor: [-5.4, 5.8, 11.2]
	},

	// 4. Lantern District
	{
		id: 'apothecary-red-eaves',
		neighborhoodId: 'lantern-district',
		name: 'The Apothecary of Red Eaves',
		subtitle: 'Pagoda-Roofed Artisan General Store',
		materials: [
			'Vermilion clay tiles',
			'Aged cedar beams',
			'Crackled lime plaster',
			'Coopered oak barrels'
		],
		story:
			'Beneath sweeping upturned red eaves and a moss-green awning, every inch of this timber shopfront brims with coopered barrels, ceramic jars, stacked crates, woven baskets, and glowing lanterns.',
		residentNote:
			'Master Hoshino labels every stoneware jar by hand with brush-ink tags and grows rare mountain mint in a wooden box on the upper roof ridge.',
		architecturalDetail:
			'Look to the left corner for the crooked timber utility pole draped in sagging black power lines and glowing amber junction boxes.',
		focusTarget: [8.2, 4.2, -5.8],
		cameraOffset: [-7.6, 2.8, 7.8],
		walkEntrance: [7.4, 0.75, -3.6],
		labelAnchor: [8.2, 8.8, -5.8]
	},
	{
		id: 'crag-of-nine-lanterns',
		neighborhoodId: 'lantern-district',
		name: 'The Crag of Nine Lanterns',
		subtitle: 'Twin-Spire Dark Timber Rookery & Chain Lanterns',
		materials: [
			'Charred cedar planks',
			'Jagged basalt crag',
			'Wrought-iron chains',
			'Amber oiled paper'
		],
		story:
			'Rising like an ink-wash dream from twin rock pinnacles, crooked charcoal-wood gables, tiny dormers, and pointed turrets cling together above a winding stone cliff stair.',
		residentNote:
			'At nightfall the lamp-warden walks the cantilevered galleries with a long brass taper, lighting nine giant amber lanterns suspended on heavy iron chains.',
		architecturalDetail:
			'Gnarled bare branches reach outward from the dark cliff to hold chain-hung lanterns swaying gently above the gorge.',
		focusTarget: [15.5, 9.6, -14.2],
		cameraOffset: [-9.2, 3.4, 9.6],
		walkEntrance: [13.8, 5.82, -12.4],
		labelAnchor: [15.5, 16.6, -14.2]
	},
	{
		id: 'crimson-moon-bridge',
		neighborhoodId: 'lantern-district',
		name: 'The Crimson Moon-Bridge',
		subtitle: 'Arched Gorge Footbridge & Stone Lantern Steps',
		materials: [
			'Lacquered vermilion timber',
			'Mossy river boulders',
			'Carved granite toro lanterns'
		],
		story:
			'Spanning the misty gorge below Umbra Crag, this half-moon wooden bridge links Red-Eave Alley to the steep rock steps climbing toward the upper lantern towers.',
		residentNote:
			'Travelers pause at the bridge crest to listen to water trickling toward the central canal.',
		architecturalDetail:
			'Carved stone pedestal lanterns glow softly beside clumps of dwarf bamboo at both bridgeheads.',
		focusTarget: [11.8, 2.2, -8.8],
		cameraOffset: [-6.4, 3.2, 6.4],
		walkEntrance: [11.2, 1.38, -8.4],
		labelAnchor: [11.8, 4.6, -8.8]
	},

	// 5. Colorful Urban Quarter
	{
		id: 'ramen-lemonade-corner',
		neighborhoodId: 'colorful-urban',
		name: 'Ramen & Lemonade Corner Stack',
		subtitle: 'Mustard-Yellow & Pink Three-Story Shopfront',
		materials: [
			'Mustard & pink stucco',
			'Patinated teal tin',
			'Enameled vending steel',
			'Copper conduit'
		],
		story:
			'Stacked like cheerful painted matchboxes in saturated mustard yellow and bubblegum pink, this lively corner building squeezes a noodle counter, upstairs art studio, and rooftop antenna forest onto one tiny plot.',
		residentNote:
			'The bright orange drink machine beside the red noren doorway dispenses hotゆず lemonade in winter and chilled melon soda all summer.',
		architecturalDetail:
			'Count the exterior AC condensers, chalk street scribbles, yellow A-frame menu board, and vertical orange neon sign bolted to the utility pole.',
		focusTarget: [9.5, 4.5, 4.2],
		cameraOffset: [-7.8, 2.8, 7.6],
		walkEntrance: [7.2, 0.65, 3.8],
		labelAnchor: [9.5, 9.8, 4.2]
	},
	{
		id: 'turquoise-maru-mado-loft',
		neighborhoodId: 'colorful-urban',
		name: 'Turquoise Izakaya & Maru-Mado Loft',
		subtitle: 'Teal Timber Diorama House with Circular Window',
		materials: [
			'Weathered turquoise siding',
			'Mossy asphalt shingles',
			'Bamboo blinds',
			'Paper chōchin'
		],
		story:
			'Clad in sea-weathered turquoise planks above a peeling plaster ground floor, an exterior wooden staircase climbs past AC pipes to a top-story loft lit by a glowing round maru-mado window.',
		residentNote:
			'Downstairs, warm amber light spills through gridded glass doors onto potted ferns and a white corner vending machine while jazz plays softly upstairs.',
		architecturalDetail:
			'Up on the mossy slanted roof, a miniature satellite dish and crossed TV aerials tilt skyward toward the Floating Village.',
		focusTarget: [15.2, 4.6, 9.8],
		cameraOffset: [-8.2, 2.8, 7.8],
		walkEntrance: [12.4, 0.68, 9.4],
		labelAnchor: [15.2, 10.2, 9.8]
	},
	{
		id: 'tangled-wire-vinyl-alley',
		neighborhoodId: 'colorful-urban',
		name: 'Vinyl & Tangled-Wire Alley',
		subtitle: 'Coral-Red Record Nook & Overhead Catenary Web',
		materials: [
			'Coral-red plaster',
			'Sage shutters',
			'Spun aluminum lampshades',
			'Tangled black wire'
		],
		story:
			'Wedged along the southern canal bend, this narrow coral-and-sage shop trades second-hand 7-inch records and matcha soft-serve beneath a joyous cat’s-cradle of utility wires.',
		residentNote:
			'Two miniature bicycles lean beside red plastic stools while fresh laundry flutters from the rooftop railing.',
		architecturalDetail:
			'Sagging catenary cables loop from pole to pole across the alley, tying Denki-Cho’s rooftops together.',
		focusTarget: [8.8, 3.6, 13.8],
		cameraOffset: [-7.0, 2.8, 7.0],
		walkEntrance: [7.6, 0.65, 12.2],
		labelAnchor: [8.8, 7.6, 13.8]
	},

	// 6. Floating Village
	{
		id: 'sky-ship-observatory',
		neighborhoodId: 'floating-village',
		name: 'The Sky-Ship Aerie & Brass Observatory',
		subtitle: 'Buoyant Island Hamlet & Hot-Air Balloon Tether',
		materials: [
			'Sky-pumice stone',
			'Striped balloon silk',
			'Hammered copper dome',
			'Wrought anchor chain'
		],
		story:
			'Suspended high above the central canal on a mossy floating crag, crooked pastel cottages and a copper-domed observatory hang beneath a striped turquoise-and-cream balloon envelope.',
		residentNote:
			'Cloud-cartographers measure wind currents with spinning brass vanes and lower tiny wicker mail-baskets down to passing canal boats.',
		architecturalDetail:
			'Heavy iron mooring chains anchor the island gently to stone bollards along the canal quays below.',
		focusTarget: [0.2, 9.2, -8.2],
		cameraOffset: [8.6, 3.2, 9.2],
		walkEntrance: [0.2, 6.48, -7.0],
		labelAnchor: [0.2, 15.0, -8.2]
	},
	{
		id: 'upside-down-tea-pavilion',
		neighborhoodId: 'floating-village',
		name: 'The Cantilevered Sky-Tea Pavilion',
		subtitle: 'Suspended Walkway & Aerial Lookout',
		materials: ['Painted sage cedar', 'Dusty-rose shingles', 'Hemp bridge rope', 'String lanterns'],
		story:
			'Linked by gently swaying rope-and-plank skywalks to both cliff spires, this playful cantilevered pavilion juts out into thin air for panoramic views over all six neighborhoods.',
		residentNote:
			'Visitors sip cloudberry tea on woven cushions while watching paper boats drift down the canal far below.',
		architecturalDetail:
			'String lanterns along the suspension cables trace glowing golden arcs across the sky at night.',
		focusTarget: [3.6, 8.0, -7.2],
		cameraOffset: [7.2, 2.8, 8.2],
		walkEntrance: [3.2, 6.5, -7.2],
		labelAnchor: [3.6, 11.2, -7.2]
	},
	{
		id: 'gossamer-stair-tower',
		neighborhoodId: 'floating-village',
		name: 'The Gossamer Spiral Stair-Tower',
		subtitle: 'Canal-Island Helical Ascent to the Sky',
		materials: ['Steam-bent oak', 'Riveted brass hoops', 'Turquoise clapboard', 'Warm globe lamps'],
		story:
			'Rising from a tiny island in the northern canal, an open filigree timber-and-brass spiral stair winds all the way up to the Floating Village sky-dock so anyone on foot can climb into the clouds.',
		residentNote:
			'Exactly forty-eight creaking wooden steps separate the canal water from the skywalk landing.',
		architecturalDetail:
			'In Walk or Eye-Level mode, step onto the canal island footbridge to spiral effortlessly up to Cloud-Tether Reach.',
		focusTarget: [0.0, 3.8, -5.8],
		cameraOffset: [7.4, 3.0, 7.6],
		walkEntrance: [0.0, 0.68, -4.6],
		labelAnchor: [0.0, 7.4, -5.8]
	}
];

export const LANDMARK_BY_ID: Record<LandmarkId, LandmarkSpec> = Object.fromEntries(
	LANDMARKS.map((l) => [l.id, l])
) as Record<LandmarkId, LandmarkSpec>;

export const SECRET_CURIOSITIES: SecretCuriositySpec[] = [
	{
		id: 'black-cat',
		neighborhoodId: 'old-town',
		title: 'Pippo on the Window Cornice',
		hint: 'Check the stone ledge above the ground-floor window of Casa del Gatto Nero.',
		story:
			'Perched calmly between bougainvillea vines and flaking plaster, Pippo the black cat flicks his tail whenever someone crosses the cobblestones.',
		position: [-12.9, 3.65, -2.1],
		triggerRadius: 3.4
	},
	{
		id: 'mouse-door',
		neighborhoodId: 'old-town',
		title: "The Canal-Mouse's Brass Keyhole Door",
		hint: 'Peek beside the western stone abutment of the Central Canal Arch Bridge.',
		story:
			'Barely ankle-high, a miniature arched oak door with a polished brass keyhole and tiny doormat leads into the bridge’s warm hollow keystone.',
		position: [-1.8, 0.75, 0.8],
		triggerRadius: 2.6
	},
	{
		id: 'spout-teacup',
		neighborhoodId: 'teapot-quarter',
		title: 'The Teacup Balanced on the Spout',
		hint: 'Look up at the curved pouring lip of the Grand Blue Kettle Residence.',
		story:
			'Balanced impossibly on the tip of the giant blue teapot’s spout sits a tiny hand-painted porcelain cup that never spills a drop.',
		position: [-17.8, 7.35, 11.6],
		triggerRadius: 4.5
	},
	{
		id: 'mystery-vending',
		neighborhoodId: 'colorful-urban',
		title: 'Button #13: Bottled Starlight Soda',
		hint: 'Inspect the glowing orange drink machine outside Ramen & Lemonade Corner Stack.',
		story:
			'Tucked below the melon-soda cans is a hand-lettered mystery button that dispenses tiny warm-glowing glass bottles of fizzy starlight.',
		position: [8.1, 1.55, 2.7],
		triggerRadius: 2.8
	},
	{
		id: 'owl-telescope',
		neighborhoodId: 'lighthouse-district',
		title: "The Barn Owl's Brass Spyglass",
		hint: 'Scan the cantilevered wooden balcony high on the Windward Rookery Spire.',
		story:
			'Pointed not at the stars but down toward the Teapot Quarter’s pastry tables, a tiny brass telescope lets the rookery owl check when fresh croissants emerge.',
		position: [-8.9, 9.8, -15.6],
		triggerRadius: 4.8
	},
	{
		id: 'glowing-jar',
		neighborhoodId: 'lantern-district',
		title: 'Jar of Captured Fireflies',
		hint: 'Peer onto the cluttered wooden counter of the Apothecary of Red Eaves.',
		story:
			'Among pickled plums and dried ginger roots, one corked glass jar pulses softly with three friendly paper-lantern fireflies.',
		position: [7.6, 1.55, -4.4],
		triggerRadius: 2.8
	},
	{
		id: 'cloud-bell',
		neighborhoodId: 'floating-village',
		title: "The Cloud-Postman's Mooring Bell",
		hint: 'Walk out onto the front sky-dock of the Floating Village.',
		story:
			'Ringing this tiny cast-brass bell summons a miniature wicker mail-basket down to the canal island below.',
		position: [-1.1, 7.15, -6.4],
		triggerRadius: 2.8
	},
	{
		id: 'edge-lantern',
		neighborhoodId: 'lantern-district',
		title: "The Ninth Lantern Over Chasm's Edge",
		hint: 'Follow the longest iron chain hanging off the outer branch of Umbra Crag.',
		story:
			'Suspended over empty air by twenty-two hand-bent links, the lowest amber lantern never flickers out, even in coastal gales.',
		position: [18.4, 7.2, -13.2],
		triggerRadius: 4.6
	}
];

export const SECRET_BY_ID: Record<SecretId, SecretCuriositySpec> = Object.fromEntries(
	SECRET_CURIOSITIES.map((s) => [s.id, s])
) as Record<SecretId, SecretCuriositySpec>;
