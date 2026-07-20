---
title: "Artificial Life Lab: Evolve a Digital Ecosystem in Your Browser"
description: "Grow a seeded digital ecosystem in the browser: microbes inherit traits, forage, reproduce with mutation, face selection pressure, drift, predators, ageing, and death."
date: "2026-07-20"
category: "Visualizations"
tags: ["Prey Arms Race","Predator Prey","Keeping Mutation Bounded","Abundant Garden","Phenotype Packed","Population","Mutation","Garden","Energy","Lineage"]
series: ["Artificial Life Lab"]
published: true
thumbnail: "/images/visualizations/artificial-life-lab-evolving-microbe-garden-poster.jpg"
thumbnailAlt: "Original Artificial Life Lab poster showing translucent abstract microbes in a dark circular petri dish"
color: "#22d3ee"
author: "Suvro Ghosh"
readingTime: "24 min"
inPlainEnglish: "This is a small, repeatable computer model of inheritance and survival. Digital organisms spend energy, search for food, reproduce, pass traits to offspring with mutation, and die. Their population changes without a script deciding which lineage must win."
keyTerms: ["Artificial life", "Genome", "Inheritance", "Mutation", "Selection pressure", "Fitness", "Genetic drift", "Carrying capacity", "Emergence", "Deterministic seed"]
faq:
  - question: "Are the digital organisms alive or conscious?"
    answer: "No. They are data records updated by explicit rules. The model can demonstrate variation, inheritance, selection, drift, and energy constraints without implying sensation, intention, or biological completeness."
  - question: "Why does the same seed sometimes seem to produce the same history?"
    answer: "All random choices come from a seeded pseudo-random number generator, while the engine advances in fixed time steps. Identical seeds, parameters, and fixed-step sequences reproduce the same engine history. Real-time runs may diverge when actions occur at different simulation times or a browser drops catch-up time."
  - question: "Does Advance 8 simulated seconds correspond to one biological generation?"
    answer: "No. Generations overlap in this model. The button advances exactly 240 fixed simulation ticks, during which zero, one, or many births may occur."
  - question: "What does fitness mean here?"
    answer: "Fitness means leaving descendants that survive under the current conditions. It is not a moral score, strength score, or universal ranking; a useful trait in one preset may be costly in another."
---

<script>
	import ArtificialLifeLab from '$lib/components/visualizations/artificial-life/ArtificialLifeLab.svelte';
	import SourceExplorer from '$lib/components/visualizations/SourceExplorer.svelte';
	import engineSource from '$lib/visualizations/artificial-life/artificialLifeEngine.ts?raw';
	import genomeSource from '$lib/visualizations/artificial-life/genome.ts?raw';
	import organismSource from '$lib/visualizations/artificial-life/organism.ts?raw';
	import environmentSource from '$lib/visualizations/artificial-life/environment.ts?raw';
	import randomSource from '$lib/visualizations/artificial-life/seededRandom.ts?raw';
	import presetsSource from '$lib/visualizations/artificial-life/simulationPresets.ts?raw';

	const artificialLifeFiles = [
		{ id: 'engine', label: 'Engine', filename: 'artificialLifeEngine.ts', language: 'javascript', source: engineSource },
		{ id: 'genome', label: 'Genome', filename: 'genome.ts', language: 'javascript', source: genomeSource },
		{ id: 'organism', label: 'Organism', filename: 'organism.ts', language: 'javascript', source: organismSource },
		{ id: 'environment', label: 'Environment', filename: 'environment.ts', language: 'javascript', source: environmentSource },
		{ id: 'random', label: 'Seeded random', filename: 'seededRandom.ts', language: 'javascript', source: randomSource },
		{ id: 'presets', label: 'Presets', filename: 'simulationPresets.ts', language: 'javascript', source: presetsSource }
	];
</script>

<TTS />

<Pi
	src="/images/visualizations/artificial-life-lab-evolving-microbe-garden-poster.jpg"
	alt="Original abstract microbes with translucent membranes moving through a dark petri dish beneath the words Artificial Life Lab and Evolving Microbe Garden"
	caption="A garden whose history is calculated rather than illustrated. The organisms below use original procedural shapes; the poster is the static fallback."
/>

A pond can look still while being furiously negotiated. Something is eating. Something is failing to find food. Something has just divided. A useful variation has appeared, although no witness can know whether it will spread or vanish in the next unlucky minute.

The **Evolving Microbe Garden** is a deliberately small version of that kind of history. Every coloured microbe is a record containing position, energy, age, ancestry, and an inheritable genome. No animation path tells it where to go. No plot declares which colour must win. The visible population comes from organisms following the same local rules under shared environmental pressure.

Start by letting the default garden run. Then try **Scarcity and Competition** and watch average energy and population. Turn on **Highlight deepest surviving lineage**. Finally, load **Predator–Prey Arms Race** and compare movement speed and sensing over several fixed-time advances.

<ArtificialLifeLab
	title="Evolving Microbe Garden"
	caption="Amber particles are food; membrane colour and size are inherited phenotypes; coral shapes are predators. Expanding rings mark births and dispersing orange specks mark deaths."
/>

# What this model is—and is not

This is an **artificial-life model**: a computational system designed to investigate life-like processes from simple rules. It contains inheritance, bounded mutation, differential reproduction, limited resources, finite lifespans, chance, and death. Those ingredients are enough for population-level patterns to emerge without being scheduled.

The microbes are not alive, sentient, frightened, hungry, or purposeful. Words such as “sense,” “seek,” and “avoid” are convenient descriptions of calculations. A microbe does not experience a predator. Its heading is adjusted away from the nearest predator inside a numerical radius.

Nor does the garden reproduce biological evolution in full. Real organisms contain developmental processes, molecular networks, sexual recombination, ecological relationships, spatial structure, pathogens, changing environments, and historical contingencies that this model omits. Its genome is eleven floating-point numbers. Its world is one ellipse. It is a conceptual instrument, not a biological prediction machine.

Within those limits, it makes six important ideas visible:

- **Inheritance:** offspring begin with a copy of a parent's traits.
- **Variation:** mutation sometimes alters those copied values.
- **Selection pressure:** food, energy costs, predators, harshness, and lifespan change which variants leave descendants.
- **Fitness:** success means producing descendants that persist *in this environment*, not being universally superior.
- **Drift:** in a finite population, chance alone can make a lineage common or extinct.
- **Carrying capacity:** food, energy costs, competition, and mortality shape an emergent sustainable population. The separate population cap is only a browser safety limit.

# The genome: phenotype packed into eleven numbers

The visible membrane is not merely decoration. Body size and hue come directly from the genome, while less visible genes change behaviour and energy economics.

```javascript
type Genome = {
  movementSpeed: number;
  bodySize: number;
  sensoryRadius: number;
  turningTendency: number;
  energyEfficiency: number;
  reproductionThreshold: number;
  mutationRate: number;
  lifespan: number;
  foodAttraction: number;
  dangerAvoidance: number;
  hue: number;
};
```

Traits create trade-offs. A fast microbe reaches distant food sooner but pays a larger movement bill. A large body is easy to see and may cover food more readily, but moving it costs more. A broad sensory radius supplies better information, yet information only helps if movement towards the detected food is affordable. A low reproduction threshold can produce descendants quickly while dividing limited energy into fragile portions.

There is no single best genome. Change the environment and “best” changes with it.

## Keeping mutation bounded

Mutation should create novelty without producing nonsense such as negative body size or a lifespan of minus twelve seconds. Each gene therefore has an explicit interval.

```javascript
const GENOME_BOUNDS = {
  movementSpeed: [24, 88],
  bodySize: [3.8, 12],
  sensoryRadius: [24, 190],
  mutationRate: [0.02, 0.5],
  hue: [0, 360]
  // the remaining traits have bounds too
};
```

Offspring copy every parental value. **Baseline mutation probability** is the environment-wide starting chance for each gene. The parent’s inherited `mutationRate` gene scales that baseline: a parent with `mutationRate` 0.08 halves the default multiplier, while 0.24 multiplies it by 1.5. The multiplier is bounded between 0.35 and 2.5, and the final per-gene probability is capped at 95 per cent.

```javascript
const inheritedMutationPressure = clamp(
  parent.mutationRate / 0.16,
  0.35,
  2.5
);

const perGeneProbability = clamp(
  parameters.mutationProbability * inheritedMutationPressure,
  0,
  0.95
);

for (const key of genomeKeys) {
  const [minimum, maximum] = GENOME_BOUNDS[key];
  let value = parent[key];
  if (random.chance(perGeneProbability)) {
    value += random.signed() * (maximum - minimum) * mutationMagnitude;
  }
  child[key] = clamp(value, minimum, maximum);
}
```

When mutation occurs, it adds or subtracts a fraction of that gene's permitted range, scaled by **Mutation magnitude**. The final value is clamped into bounds. The baseline control therefore does not promise one universal mutation rate: inherited genomes make some lineages mutate more readily than others.

Mutation is not an improvement operation. It has no view of the environment and no goal. Most changes are neutral or costly in a particular moment; occasionally a change helps its bearer leave more surviving descendants.

# The energy economy

Every fixed simulation step performs an accounting exercise. An organism pays a basal cost for remaining alive and a movement cost influenced by speed and body size. Energy efficiency reduces both. Environmental harshness increases them.

In compact form:

```javascript
const basal = (basalEnergyCost * harshnessMultiplier) / efficiency;
const movement = (
  movementEnergyCost *
  (speed / 50) *
  (bodySize / 7) *
  harshnessMultiplier
) / efficiency;

organism.energy -= (basal + movement) * deltaTime;
```

Touching an amber nutrient particle transfers its energy to the organism, modified slightly by inherited efficiency. Reaching the effective reproduction threshold divides the available energy: 55 per cent remains with the parent and 45 per cent starts the offspring. Reproduction therefore has a real immediate cost.

An organism dies when energy reaches zero or age reaches its inherited, environmentally scaled lifespan. Harshness adds a small background pressure. Predators, when enabled, pursue the nearest organism and can cause a fourth kind of death. The census records starvation, age, pressure, and predation separately even though the headline displays their sum.

# Sensing without planning

The microbes have no map and perform no path search. At each step the engine asks two local questions:

1. Is food inside this organism's effective sensory radius?
2. Is a predator inside a slightly larger danger radius?

The heading bends towards detected food according to **food attraction** and away from danger according to **danger avoidance**. A small random turn prevents perfectly straight, mechanical routes. After movement, the elliptical boundary pushes an escaping organism back inside and changes its heading.

This produces behaviour that looks purposeful, but the distinction matters: apparent pursuit emerges from repeated steering arithmetic. Nothing in the code represents desire.

# A clock that can be reproduced

Interactive animation often uses the time between screen frames directly. That is convenient but makes model outcomes depend on whether a device draws 42 or 60 frames per second. Here, drawing and biology have separate clocks.

The browser uses `requestAnimationFrame` for rendering. Elapsed real time accumulates, but the engine advances only in fixed steps of one-thirtieth of a simulated second:

```javascript
accumulator += elapsed * simulationSpeed;

while (accumulator >= FIXED_TIME_STEP && steps < 8) {
  engine.step(FIXED_TIME_STEP);
  accumulator -= FIXED_TIME_STEP;
  steps += 1;
}
```

The eight-step guard prevents a backgrounded or struggling tab from attempting an enormous catch-up. When the garden leaves the viewport, its observer cancels the animation frame entirely. Returning starts a fresh display clock without inventing hours of invisible evolution.

All chance comes from a tiny seeded pseudo-random generator. Food positions, founder genomes, mutations, wandering, pressure, and predator creation consume the same reproducible random stream. With the same seed, parameters, and exact sequence and number of fixed simulation steps, the engine produces the same history. Real-time interactive runs may diverge if actions occur at different simulation times or a struggling browser drops catch-up time.

**Advance 8 simulated seconds** has a literal meaning. Biological generations overlap; parents and children coexist. The button pauses the garden and advances exactly 240 fixed ticks—eight simulated seconds at the base step. Zero, one, or many births may occur during that interval.

# How one engine step works

Separation between the model and its picture is the central engineering choice. `artificialLifeEngine.ts` knows nothing about Canvas, Svelte, sliders, screen pixels, or CSS. It owns arrays of organisms, food, predators, and short-lived events.

Each fixed step follows this order:

1. Accumulate the requested food spawn rate and add bounded nutrient particles.
2. Synchronise predators with the enabled state and harshness.
3. For every living organism, sense, steer, move, pay energy, eat, age, die, or reproduce.
4. Update predators and resolve contact deaths.
5. Age birth and death events, removing expired ones.

Rendering reads the resulting state. It draws a dark elliptical habitat, food points, movement traces, phenotype membranes, nuclei, cilia, predators, birth rings, and death specks. The renderer may change its shapes tomorrow without changing a single biological outcome.

The statistics panel also reads the model. It calculates averages across the living population, finds the dominant hue family, estimates the deepest extant generation, and identifies the **deepest surviving lineage**: the founder lineage containing the highest-generation living descendant. Ties go to the lineage with more living descendants and then the lower lineage ID. The engine returns that lineage's ID and label to both the statistics and Canvas renderer, so the text and white highlight rings cannot disagree. Lightweight SVG charts keep only the latest 120 samples rather than allowing an unbounded history.

# Experiments worth trying

The presets change groups of scientifically related conditions, not visual themes.

## Abundant Garden

Food appears frequently and carries generous energy. Background cost and harshness are low. Many genomes can survive, so diversity may persist and selection can be comparatively weak. Watch whether the population repeatedly approaches the cap. Then halve the food rate without restarting; the previously sustainable population has become an overshoot.

## Scarcity and Competition

Many founders enter a world with sparse food, lower energy rewards, and higher costs. Run it several times with different seeds but identical settings. If different lineages dominate, you are seeing history and drift interact with selection. Selection constrains outcomes; it does not make every repeat identical.

## High Mutation Chaos

Frequent, large mutations explore trait space quickly. The result need not be faster adaptation. Successful combinations are also easier to disrupt, and many extreme offspring pay severe energy costs. Compare the trait histograms with Abundant Garden. Variation should broaden, while persistence may become erratic.

## Predator–Prey Arms Race

Coral predators make sensing, avoidance, and speed useful, but moving faster remains expensive. Highlight the deepest surviving lineage and watch which descendants persist. Then raise movement cost. A trait that helped under the old energy budget can become unaffordable under the new one.

## A founder-effect experiment

Restore defaults, reduce **Starting population** to eight, set a seed, and restart. Record the dominant phenotype after several eight-second advances. Repeat with different seeds. Now use 150 founders. Larger starting populations sample more initial variation and usually make the early result less hostage to a few chance genomes.

## Test the hard population cap

Load Abundant Garden and lower **Population cap — browser safety limit** while the simulation runs. Births stop at the cap, and if the new cap is below the current census, the weakest-energy organisms are removed as pressure deaths. This is a computational guard, not biological carrying capacity. The closer ecological analogue is the emergent sustainable population produced by food renewal, food energy, competition, metabolic cost, harshness, predation, and ageing.

# Reading the charts without telling stories too quickly

A rising average speed does not prove that speed “evolved for” some purpose. The population could have lost slow lineages through predation, gained fast mutants, experienced a founder effect, or simply drifted during a bottleneck. The chart reports what happened, not why.

Good interpretation compares controlled runs:

- keep parameters fixed and change only the seed to examine drift;
- keep the seed fixed and change one environmental control to examine pressure;
- restart after changing founder count or seed, because those define initial conditions;
- inspect population, births, deaths, energy, and trait distributions together;
- repeat before treating one dramatic run as a law.

“Dominant phenotype” groups hue into a small named colour family. It is a visible summary, not a species definition. “Generation estimate” is the maximum generation number among living organisms, not a claim that the whole population advances in synchronised cohorts.

# Browser performance and accessibility

The simulation is designed to remain polite on an ordinary laptop or tablet.

- Canvas resolution uses a capped device-pixel ratio rather than blindly matching very dense screens.
- The population and food arrays are bounded; completed items use swap-removal instead of repeatedly shifting arrays.
- Telemetry and charts update less often than the Canvas frame.
- The component pauses its animation loop while offscreen and removes observers and listeners when destroyed.
- Most controls affect the existing engine immediately. **Starting population** and **Deterministic seed** explicitly wait for a restart.
- Native buttons, range inputs, text inputs, checkboxes, and a select remain usable by keyboard and touch.
- Every control includes a direct scientific explanation, while numerical statistics communicate state without depending on colour.
- Reduced-motion preferences start the garden paused and suppress movement trails. The reader must choose Resume.
- If Canvas is disabled with `?canvas=off`, the original poster replaces the live habitat while the article and explanations remain available.

Canvas itself exposes a concise screen-reader description. The adjacent census provides the meaningful changing state in text. An animation cannot narrate every organism accessibly, but population, lineage, energy, phenotype, resource, predator, and performance values do not disappear behind pixels.

# Limitations of the garden

Honesty is part of the model.

The organisms reproduce asexually; there is no recombination. Genes act directly rather than through development. Food is homogeneous. Predators do not reproduce or evolve. Space is continuous but shallow: there are no territories, barriers, seasons, niches, or resource types. Sensing is perfect inside a radius. Mutation has simple independent probabilities. The hard population limit is partly a browser safety mechanism. The hue phenotype has no biological cost.

Most importantly, the rules were chosen by a human. Emergence means the exact population history is not scripted; it does not mean the system is free of design assumptions.

These limits suggest productive extensions rather than invalidate the exercise. A later Artificial Life Lab could add sexual reproduction, co-evolving predators, seasonal resource fields, toxin resistance, signalling, multicellular adhesion, spatial memory, or a changing genome-to-phenotype map. A second habitat could test migration and gene flow. A lineage tree could reveal bottlenecks that summary averages hide.

# Read the executable model

The drawer contains the same modular TypeScript used by the live garden: the fixed-step engine, bounded genome operations, organism factories, environment geometry, seeded random generator, and four presets. The Svelte layer renders and controls these modules; it does not contain a second hidden simulation.

<SourceExplorer files={artificialLifeFiles} label="Complete Artificial Life Lab model source" />

# One useful idea to keep

Evolution does not require a creature to understand evolution. In this garden, each organism follows local rules: spend, sense, move, eat, copy, vary, and eventually disappear. Yet the population gains a history. Lineages expand and collapse. Trait distributions move. Chance matters most when numbers are small. A solution under abundance becomes a liability under scarcity.

That is the lesson the simulation can honestly offer. Not that a few circles have become alive, but that inheritance plus variation plus differential survival can turn simple bookkeeping into an unpredictable, inspectable population story.
