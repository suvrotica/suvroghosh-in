# Visualizations development backlog

The backlog favours one strong scientific idea and one legible interaction per exhibit. Rendering choices are starting points, not mandates; the simplest technique that keeps the concept clear should win.

## Physics

| Exhibit                                        | Scientific concept                                                         | Proposed interaction                                                                               | Rendering approach                                  |
| ---------------------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| Double-pendulum chaos                          | Sensitive dependence on initial conditions in a nonlinear system           | Release two pendulums with almost identical angles; scrub time and reveal divergence               | Canvas 2D or p5.js WebGL for long trails            |
| Orbital mechanics and gravitational slingshots | Conic orbits, gravity, and exchange of momentum in a moving frame          | Drag a spacecraft's initial velocity; place a planet and attempt a fly-by                          | Canvas 2D with an optional p5.js WebGL trail buffer |
| Wave interference and diffraction              | Superposition, phase, wavelength, and aperture diffraction                 | Move sources and slits; alter wavelength; inspect constructive and destructive bands               | GLSL fragment shader                                |
| Electric and magnetic fields                   | Vector fields, potential, and Lorentz-force intuition                      | Place charges or currents; release a test particle; toggle vectors and equipotentials              | Canvas 2D particles plus an SVG overlay             |
| Relativity and spacetime diagrams              | Events, light cones, simultaneity, and Lorentz transforms                  | Drag relative velocity and watch axes shear while event intervals remain classified                | SVG for precise labelled geometry                   |
| Brownian motion                                | Random walks emerging from molecular collisions                            | Change temperature and particle size; follow one highlighted grain                                 | Canvas 2D with seeded randomness                    |
| Fluid flow and vortices                        | Advection, incompressibility, vorticity, and flow around obstacles         | Paint dye and obstacles into a flow; adjust viscosity                                              | WebGL ping-pong simulation with GLSL shaders        |
| Quantum probability density                    | Wavefunction magnitude, phase, measurement, and eigenstates                | Combine basis states; scrub phase; sample repeated measurements                                    | GLSL shader for density with SVG axes               |
| Diffusion and entropy                          | Random motion, concentration gradients, mixing, and coarse-grained entropy | Separate two particle populations; remove a barrier; change temperature and inspect mixing metrics | Canvas 2D particles plus D3/SVG summaries           |

## Chemistry

| Exhibit                            | Scientific concept                                                         | Proposed interaction                                                                   | Rendering approach                                           |
| ---------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Molecular orbital shapes           | Phase, nodal surfaces, and orbital combinations                            | Combine atomic orbitals; rotate the molecule; isolate bonding and antibonding states   | p5.js WebGL with a GPU-evaluated isosurface or volume shader |
| Diffusion and reaction rates       | Concentration gradients, collision frequency, and rate constants           | Paint reactants into a vessel; change temperature and diffusion rate                   | GLSL reaction-advection shader                               |
| Crystal lattice growth             | Nucleation, lattice constraints, impurities, and dendritic growth          | Seed nuclei; change cooling rate and impurity concentration                            | Canvas 2D cellular model                                     |
| Acid–base equilibrium              | pH, pKa, buffering, and species fractions                                  | Add acid or base by dragging a burette; inspect the titration curve and species mix    | SVG chart plus Canvas 2D beaker particles                    |
| Periodic-table property landscapes | Periodicity across atomic radius, electronegativity, and ionisation energy | Select a property; compare periods; brush a range to inspect elements                  | HTML grid plus SVG plot                                      |
| Reaction–diffusion patterns        | Activator–inhibitor systems and emergent spots or stripes                  | Seed chemicals with touch; adjust feed and kill rates; pause and inspect               | WebGL ping-pong textures with GLSL                           |
| Gas particles and temperature      | Kinetic theory, pressure, velocity distributions, and temperature          | Resize the container; heat it; drag a piston; inspect a live speed histogram           | Canvas 2D particles plus SVG histogram                       |
| Reaction kinetics                  | Rate laws, activation energy, equilibrium, and temperature                 | Mix reactants; change concentration and temperature; compare concentration-time curves | D3/SVG curves plus a small particle view                     |
| Atomic orbitals                    | Quantum numbers, nodes, radial probability, and orbital orientation        | Choose quantum numbers; slice or rotate an orbital; compare density and phase          | WebGL density rendering with accessible SVG slices           |
| Molecular vibration modes          | Normal modes, bond stiffness, mass, and infrared activity                  | Select a mode; alter isotope mass; scrub phase and inspect bond displacement           | SVG or Canvas molecule with D3 frequency spectrum            |

## Biology

| Exhibit                                | Scientific concept                                                         | Proposed interaction                                                                | Rendering approach                                  |
| -------------------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------- |
| Natural selection and genetic drift    | Selection pressure, mutation, finite populations, and fixation             | Change fitness and population size; replay identical seeds                          | Canvas 2D agents with SVG frequency charts          |
| Predator–prey systems                  | Lotka–Volterra dynamics, oscillation, and stability                        | Set starting populations and interaction rates; move between phase plot and habitat | Canvas 2D plus SVG phase portrait                   |
| Neuron firing                          | Membrane potential, threshold, refractory period, and integration          | Send current pulses; alter channels; compare spike trains                           | SVG traces with Canvas 2D membrane animation        |
| Protein folding as an energy landscape | Conformation, local minima, thermal motion, and folding funnels            | Pull a short chain; change temperature; inspect its path across an energy surface   | p5.js WebGL landscape plus a simplified chain model |
| Epidemic spread                        | Contact networks, reproduction number, immunity, and intervention timing   | Draw a contact network; vaccinate nodes; change delay and transmissibility          | Canvas 2D network with SVG epidemic curve           |
| Cell division                          | Chromosome duplication, spindle attachment, and checkpoints                | Step through mitosis; perturb one checkpoint and inspect the consequence            | SVG or Canvas 2D staged animation                   |
| Phyllotaxis                            | Golden-angle packing and growth patterns                                   | Change divergence angle and growth rule; scrub the order in which seeds appear      | Canvas 2D or p5.js 2D                               |
| Evolutionary trees                     | Common ancestry, mutation distance, and uncertainty in reconstruction      | Add sequences; choose a distance rule; compare plausible trees                      | SVG for accessible labelled topology                |
| Population growth                      | Exponential and logistic growth, carrying capacity, and density dependence | Change growth rate and resources; compare populations from the same starting size   | D3/SVG time series and phase plot                   |

## Mathematics

| Exhibit                              | Scientific concept                                                  | Proposed interaction                                                                | Rendering approach                         |
| ------------------------------------ | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------ |
| Fourier series as drawing            | Periodic functions as sums of rotating frequencies                  | Draw a loop; add or remove harmonics; watch epicycles reconstruct it                | Canvas 2D with SVG spectrum                |
| Complex-plane transformations        | Multiplication, roots, exponentials, and conformal maps             | Drag a point or grid; select a complex function and watch space transform           | GLSL shader with SVG labels                |
| Monte Carlo estimation               | Random sampling, convergence, and error bounds                      | Place or reshape a target; change sample rate; compare seeded runs                  | Canvas 2D plus SVG convergence plot        |
| Gradient and divergence fields       | Local direction, flow, sources, and sinks                           | Sculpt a scalar surface; release tracers; toggle gradient and divergence            | p5.js WebGL surface with Canvas 2D vectors |
| Fractal iteration                    | Recurrence, escape time, and self-similarity                        | Zoom into the Mandelbrot set; alter the exponent; inspect one orbit                 | GLSL fragment shader                       |
| Probability distributions            | Sampling, parameters, transformations, and the central limit effect | Stack distributions; draw samples; change sample size and watch aggregates converge | SVG plots with Canvas 2D sampling motion   |
| Eigenvectors as invariant directions | Linear transformations, eigenvalues, stretching, and rotation       | Drag a matrix basis; move a vector and identify directions that do not turn         | SVG vectors and a transformed grid         |
| Bayesian updating                    | Priors, likelihoods, evidence, and posterior distributions          | Move a prior; reveal observations one at a time; compare posterior sensitivity      | D3/SVG distributions and probability bars  |

## Computer science

| Exhibit                      | Scientific concept                                               | Proposed interaction                                                          | Rendering approach                              |
| ---------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------- |
| Sorting algorithms as motion | Comparison, swapping, stability, and algorithmic cost            | Scramble a sequence; step or race algorithms on the same input                | Canvas 2D with accessible DOM controls          |
| Graph traversal              | Breadth-first search, depth-first search, and shortest paths     | Draw a graph; choose start and goal nodes; step the frontier                  | SVG for nodes, edges, and labels                |
| Hashing and collisions       | Hash functions, buckets, load factor, and probing                | Type keys; change table size and collision strategy; inspect probe paths      | HTML/Canvas 2D hybrid                           |
| Cellular automata            | Local rules, emergent structures, and computational universality | Paint cells; edit a rule; step generations; store a seed                      | Canvas 2D or GLSL for large grids               |
| Recursion                    | Call stacks, base cases, and divide-and-conquer structure        | Step through a recursive input and expand or collapse stack frames            | SVG tree plus semantic HTML stack               |
| Compression                  | Redundancy, dictionaries, entropy, and lossy trade-offs          | Type or draw input; tune quantisation; compare size and reconstruction        | Canvas 2D plus HTML byte views                  |
| Pathfinding                  | Heuristics, frontier growth, and optimality                      | Draw obstacles and weighted terrain; move endpoints; compare Dijkstra and A\* | Canvas 2D grid                                  |
| Distributed consensus        | Quorums, leader election, partitions, and delayed messages       | Partition nodes; delay packets; crash a leader; follow terms and commits      | SVG network with a deterministic event timeline |

## Machine learning

| Exhibit                        | Scientific concept                                           | Proposed interaction                                                              | Rendering approach                                    |
| ------------------------------ | ------------------------------------------------------------ | --------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Gradient descent landscapes    | Loss, gradients, step size, momentum, and local minima       | Place the starting point; reshape the surface; compare optimisers                 | p5.js WebGL landscape plus SVG loss trace             |
| Linear regression              | Residuals, least squares, slope, intercept, and uncertainty  | Drag points or the line; watch residual squares and the objective change          | SVG                                                   |
| Perceptron decision boundaries | Weighted sums, bias, classification, and linear separability | Add labelled points; step updates; attempt XOR                                    | Canvas 2D or SVG                                      |
| Neural-network activation flow | Layers, activations, saturation, and feature transformation  | Edit an input; hover a neuron; adjust one weight and trace the effect             | SVG network with Canvas 2D heatmaps                   |
| Backpropagation                | Chain rule, local gradients, and credit assignment           | Step forward and backward passes; perturb one weight; compare numerical gradients | SVG computational graph                               |
| Clustering                     | Distance, centroids, assignment, and cluster shape           | Draw points; seed centroids; step k-means; compare with density clustering        | Canvas 2D                                             |
| Attention maps                 | Query–key similarity, softmax, and contextual weighting      | Edit a short sentence; select a token or head; inspect changing connections       | Canvas 2D matrix plus semantic HTML text              |
| Embedding spaces               | Learned similarity, neighbourhoods, projection, and analogy  | Search points; drag an analogy vector; switch projection methods                  | p5.js WebGL point cloud with accessible list fallback |
| Overfitting and regularisation | Model capacity, train/test error, and smoothing penalties    | Draw data; increase polynomial degree; adjust regularisation; reveal test points  | SVG plots                                             |
| Convolutional filters          | Kernels, receptive fields, edges, blur, and feature maps     | Paint a tiny image; edit the kernel; slide it step by step                        | Canvas 2D pixel grid                                  |
| Reinforcement-learning agents  | State, action, reward, exploration, and value updates        | Draw rewards and walls; tune exploration; inspect the learned value field         | Canvas 2D grid with an SVG learning curve             |

## Statistics

| Exhibit                     | Scientific concept                                                     | Proposed interaction                                                               | Rendering approach                       |
| --------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------- |
| Central limit theorem       | Sampling distributions, convergence, skew, and finite-sample behaviour | Choose a source distribution and sample size; draw repeated means into a histogram | Canvas sampling with a D3/SVG histogram  |
| Confidence intervals        | Repeated-sample coverage and the difference between interval and truth | Change confidence level and sample size; run many experiments and count coverage   | SVG intervals with an accessible tally   |
| Correlation and confounding | Association, hidden groups, Simpson's paradox, and causal caution      | Drag group means and within-group slopes; compare pooled and stratified estimates  | D3/SVG scatterplots                      |
| Bias–variance trade-off     | Model flexibility, sampling noise, reducible error, and generalisation | Change model complexity and noise; replay samples while tracking train/test error  | D3/SVG curves and small-multiple fits    |
| Bootstrap uncertainty       | Resampling, empirical distributions, standard errors, and skew         | Resample a drawn dataset; vary replicate count; compare bootstrap and analytic SEs | Canvas resampling plus SVG distributions |

## Scientific computing

| Exhibit                         | Scientific concept                                                   | Proposed interaction                                                                   | Rendering approach                           |
| ------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------- |
| Numerical integration           | Discretisation, quadrature rules, convergence, and error             | Draw a function; change step size and rule; compare estimated and exact area           | D3/SVG function and rectangles               |
| Ordinary differential equations | Time stepping, stability, stiffness, and accumulated numerical error | Choose Euler or Runge–Kutta; change the step and compare with a reference trajectory   | D3/SVG trajectories and local-error callouts |
| Heat equation                   | Finite differences, boundary conditions, diffusion, and stability    | Paint an initial temperature; change time step and conductivity; watch heat spread     | Canvas heatmap with SVG profiles             |
| N-body approximation            | Pairwise forces, integration error, and computational scaling        | Add bodies; alter the time step; compare direct forces with a Barnes–Hut approximation | Canvas/WebGL bodies with D3 performance plot |
| Floating-point intuition        | Precision, cancellation, rounding, and numerical conditioning        | Change magnitude and operation order; inspect binary representation and relative error | Semantic bit fields plus SVG error plots     |
