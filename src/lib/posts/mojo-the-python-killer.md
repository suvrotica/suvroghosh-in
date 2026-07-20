---
title: "Mojo: The Python Killer?"
description: "An unruly, excessively detailed exploration of how Mojo—a language born from the fever dreams of compiler engineers—aims to dethrone Python in the kingdom of AI, and why that matters for everyone who has ever stared at a progress bar wishing for death."
date: "2026-07-12"
category: "Engineering Blog"
tags: ["Standard Library","Progress Bars","Chris Lattner","MAX Kernels","Matrix Multiplication","Mojo","Python","Compiler","Compiled","Kernels"]
published: true
color: "#FF6B35"
thumbnail: "/thumbnail/art-mojo-the-python-killer.jpg"
---

<TTS />

<Pi src="/thumbnail/art-mojo-the-python-killer.jpg" />

# The Uncomfortable Truth About Progress Bars

I have spent, if I am honest—and I intend to be, for this is no place for modesty—an almost spiritually offensive amount of my adult life watching progress bars creep forward with the enthusiasm of a sloth on barbiturates.

Training a neural network. Fine-tuning a large language model. Running a simulation that, if I squint, might finish before the heat death of the universe. Python, that dear, duct-taped lingua franca of modern artificial intelligence, has been my companion through all of it. Faithful. Ubiquitous. Maddeningly, conspicuously slow whenever the interpreter itself is doing the heavy lifting.

And so I found myself, one bleary-eyed morning at 3 AM, staring at a stack trace that seemed to mock me personally, wondering whether there might exist a better way—a language that possessed Python's effortless readability, its vast ecosystem of libraries, its almost accidental elegance, yet also the raw, unapologetic speed of systems languages that compile down to machine code and laugh in the face of megabytes.

That is when I discovered Mojo.

Or rather, that is when Mojo discovered me—through blog posts, through increasingly frantic posts from compiler engineers, through the hushed, reverent tones of researchers who had glimpsed something that felt, in the small hours of the morning, almost like heresy.

Python, but fast. Python, but *furious*.

It sounded like a trick. It still might be.

# Who Brought This Fire Into the World?

To understand Mojo, one must first understand a man named Chris Lattner, who is, depending on whom you ask, either the Leonardo da Vinci of compiler construction or merely the most overqualified engineer to ever decide that existing programming languages were insufficiently ambitious.

Lattner began LLVM in his graduate student days at the University of Illinois, a project that started as a modest research infrastructure and metastasized into one of the invisible backbones of modern computing. LLVM once expanded to “Low Level Virtual Machine,” but the project has long since outgrown the name, and LLVM officially no longer stands for anything. It is simply LLVM, a collection of modular compiler and toolchain technologies that now underlies Clang, Swift, Rust's principal compiler backend, parts of Apple's development stack, and a formidable range of other languages and tools.

If you have used an iPhone, compiled software with Clang, written Rust, or encountered any of the innumerable technologies built upon LLVM, there is a fair chance you have benefited from Lattner's handiwork. He went on to architect Swift at Apple, a language that attempted to replace Objective-C with something that did not require developers to sacrifice goats to the memory management gods.

In early 2022, Lattner co-founded Modular Inc. alongside Tim Davis. On May 2, 2023, the company publicly unveiled Mojo—a programming language positioned not as the immediate executioner of Python, but as a Python-friendly systems language, an evolutionary relative, a faster, stronger, slightly terrifying younger sibling who had spent years in the gym while Python was busy attending poetry readings.

The team at Modular is a curious assembly: compiler engineers who speak in hushed tones about intermediate representations, machine-learning researchers who have tasted the bitter fruit of Python's traditional Global Interpreter Lock—the GIL, that notorious mechanism which, in conventional CPython builds, ordinarily allows only one thread to execute Python bytecode at a time—and systems programmers who believe, with the fervor of religious converts, that abstraction should not automatically cost performance.

Python itself has begun loosening this particular shackle. Free-threaded builds, in which the GIL may be disabled, arrived experimentally with Python 3.13 and became officially supported with Python 3.14, although they are not yet the default and some extension modules may still cause the GIL to be re-enabled. The GIL remains a practical nuisance, but it is no longer quite the immovable geological feature it once appeared to be.

The people building Mojo are not alone in this endeavor. Behind them stands the vast, shadowy infrastructure of the LLVM ecosystem, the MLIR project—Multi-Level Intermediate Representation, a framework for building reusable and extensible compiler infrastructure that Lattner co-created with a much broader group of compiler researchers—and an increasingly restless community of AI practitioners who have reached the limits of what Python can gracefully provide.

# What, Precisely, Is This Beast?

Mojo is, at its most reductive and therefore least interesting, a compiled programming language that looks reassuringly like Python and can interoperate with Python, yet is designed to generate efficient native code for CPUs and GPUs.

But that description is like calling a falcon a bird that eats mice. Technically accurate. Spiritually bankrupt.

Mojo is a *systems programming language* disguised as a scripting language—a wolf in snake's clothing, if you will. It allows the programmer to write code that appears, to the untrained and even the moderately trained eye, strikingly similar to Python. The same significant indentation. Familiar loops and function declarations. Familiar syntax for many ordinary operations. Familiarity sufficient to make a Python programmer feel that the furniture has merely been rearranged rather than replaced by an operating theatre.

But Mojo is not presently a drop-in superset of Python, and valid Python code is not automatically valid Mojo code. Its creators originally spoke ambitiously about Python superset compatibility, but the current roadmap is more careful: Mojo may eventually cover much more of Python's territory, but it remains a distinct language with different semantics, a static type system, explicit ownership rules, and its own evolving standard library.

Its Python compatibility comes partly through interoperability. Mojo code can call Python modules by loading the CPython runtime, and Python can call suitably exported Mojo modules much as it calls extension modules written in C, C++, or Rust. This is genuine and valuable compatibility, but it is compatibility through a bridge, not the miraculous transmutation of every Python program into optimized machine code.

Beneath this familiar surface lurks something far more ferocious.

Mojo introduces what its creators call *zero-cost abstractions*—a term borrowed from the C++ and Rust lexicons, meaning that high-level conveniences such as generic types, compile-time parameterization, and sophisticated resource-management patterns should compile with little or no avoidable runtime penalty. The aspiration is that expressive code can approach the efficiency of carefully written low-level code without requiring the programmer to spend every waking hour writing assembly, cursing, optimizing, and drinking energy drinks at 2 AM.

This does not mean that every Mojo program is automatically fast, any more than owning a pressure cooker makes one a Bengali grandmother. Algorithms still matter. Memory layout matters. Cache behavior matters. GPU occupancy matters. A poorly designed Mojo program may remain poorly designed at impressive speed.

Mojo is a compiled language rather than an interpreted one in the ordinary CPython sense. The `mojo run` command compiles a program and runs it; `mojo build` produces an executable. Mojo also offers a REPL, notebooks, an IDE language server, and other development conveniences that make the experience feel more immediate than traditional systems programming. The development cycle may resemble scripting, but the machinery underneath is compilation.

Most crucially, Mojo is designed for *heterogeneous computing*—a term referring to the modern reality that your computer is not one computer but many: a CPU for general tasks, one or more GPUs for parallel number-crunching, and increasingly specialized accelerators embedded in phones, laptops, servers, cars, and industrial machinery.

At present, Mojo's documented GPU programming support covers NVIDIA GPUs through CUDA, AMD GPUs through HIP, and Apple GPUs through Metal. MLIR makes broader hardware backends conceivable, including future NPUs, FPGAs, custom AI accelerators, and other strange pieces of silicon whose documentation is usually written by people who regard vowels as a waste of memory. But conceivable support is not the same as shipping support. Mojo cannot presently be waved over an arbitrary TPU, NPU, or quantum coprocessor like incense and expected to work.

Python was never designed for this world. Mojo was designed with this world very much in mind.

# When Did the Ground Begin to Shift?

The story does not begin in 2023. That was merely the year the volcano erupted.

To understand the *when* of Mojo, one must rewind to 1989, when Guido van Rossum, a Dutch programmer with a fondness for Monty Python and a tolerance for whitespace, began crafting a language that would prioritize readability and programmer happiness over raw execution speed. Python's first public release followed in 1991.

Python was never meant to crunch numbers at the speed of light. It was meant to be *pleasant*. It succeeded beyond anyone's wildest imaginings, becoming one of the world's most widely used languages and the default working language of enormous portions of data science, machine learning, scientific computing, automation, education, and web development.

But success has consequences.

By the early 2010s, as deep learning began its meteoric ascent—fueled by AlexNet's triumph in the 2012 ImageNet competition, by Geoffrey Hinton's stubborn belief in neural networks, and by the sudden availability of GPUs capable of parallel matrix multiplication on an unprecedented scale—Python found itself in the uncomfortable position of being the default language for a domain it was never designed to serve.

Researchers wrote Python. But the Python frequently orchestrated. The actual computation—the tensor convolutions, matrix multiplications, gradient calculations, and backpropagation operations that make neural networks learn—happened in C, C++, CUDA, Fortran, or highly optimized vendor libraries, wrapped in Python bindings like a sports-car engine stuffed into a minivan chassis.

This distinction matters. It is too crude to say that modern AI is slow because Python is slow. A PyTorch matrix multiplication does not ordinarily wander through a Python loop multiplying numbers one at a time like an accountant deprived of Excel. The heavy work is delegated to compiled kernels. Python's overhead becomes painful in orchestration, preprocessing, highly dynamic model execution, custom operations, small-kernel workloads, and the awkward gaps between the optimized pieces.

This arrangement produces what engineers call the *two-language problem*: the necessity of writing prototype code in a high-level, expressive language like Python, then writing or rewriting performance-critical portions in a lower-level language such as C++, CUDA, Rust, or Triton, then maintaining both, debugging both, hiring for both, and cursing both.

The pain intensified with the arrival of large language models—LLMs, those gargantuan transformer-based neural networks. The transformer architecture, introduced in the seminal 2017 paper “Attention Is All You Need” by Ashish Vaswani and seven co-authors, provided the foundational pattern that enables modern models to process relationships across sequences with an extraordinary degree of parallelism.

Training contemporary models requires manipulating vast tensors across clusters of accelerators. Inference—actually running the model to generate text, images, audio, video, or actions—demands memory bandwidth and computational throughput that push hardware toward its practical limits. Python is not necessarily performing the arithmetic, but its runtime and ecosystem can become an impediment when the workload requires fine control over memory, scheduling, data movement, kernel fusion, and hardware-specific optimization.

In January 2020, Chris Lattner left Google, where he had worked on projects including Swift for TensorFlow and MLIR, and joined the RISC-V company SiFive. In early 2022, he and Tim Davis founded Modular. Mojo itself was designed during 2022 and announced publicly in May 2023.

The language then began evolving with the velocity and regard for backward compatibility customary among very young programming languages—which is to say that the furniture occasionally moved while people were still sitting on it.

In March 2024, Modular began opening the Mojo standard library by releasing its core modules. In May 2025, it released the full Mojo standard library, MAX kernels, and other substantial portions of its software under the Apache 2.0 license with LLVM exceptions. This made hundreds of thousands of lines of Mojo and MAX code available for inspection and contribution.

The Mojo compiler itself, however, remained closed-source as of this article's publication date. Modular has repeatedly committed to open-sourcing it, tying that milestone to the path toward Mojo 1.0. The language reached Mojo 1.0 Beta 2 on June 18, 2026: a considerable milestone, but still a beta, and therefore not yet the moment at which one should tattoo the syntax on one's forearm.

Then, on June 24, 2026, Qualcomm announced an agreement to acquire Modular. The transaction was expected to close in the second half of 2026, subject to regulatory approval and customary closing conditions. The acquisition had therefore been announced but not completed when this article was written.

The timeline is still unfolding. Mojo is young. Young enough to be reckless. Old enough to be interesting. Not yet old enough to have acquired the sedimentary layers of compatibility, folklore, and Stack Overflow answers that make a language feel like part of civilization.

# Where Does This New Fire Burn?

Mojo operates, conceptually and practically, at the intersection of several domains that have historically been uncomfortable neighbors—like placing a theoretical physicist, a DevOps engineer, and a venture capitalist at the same dinner table and hoping no one mentions Kubernetes.

First and foremost, it targets *AI and machine-learning infrastructure*—the unglamorous but essential layer of software that moves data, schedules computations, writes and launches kernels, fuses operations together to minimize memory transfers, and squeezes every last useful floating-point operation per second from expensive silicon.

This is where interpreter and orchestration overhead can transform from annoyance into genuine economic liability. When you are renting cloud accelerators by the hour at scale, a substantial improvement in throughput is not merely engineering elegance; it may become a balance-sheet event.

The arithmetic, however, is not as simple as “10 times faster means 10 times cheaper.” Cloud bills include idle capacity, networking, storage, orchestration, minimum allocations, data movement, and the obscure tariffs by which providers punish optimism. Performance improvements can reduce costs dramatically, but they do not cause the rest of the invoice to evaporate in a puff of compiler smoke.

Second, Mojo encroaches upon *scientific computing and numerical simulation*—the domain of physicists, climate modelers, computational biologists, astronomers, and engineers who have long relied on Python's NumPy and SciPy ecosystems. NumPy provides efficient array operations by delegating work to optimized C and Fortran libraries; SciPy layers a broad collection of scientific algorithms upon that foundation.

These users have tolerated Python's slower language-level execution because the heavy lifting usually happens in compiled extensions. Mojo's proposition is that scientists and engineers may eventually be able to write more of the performance-critical work in a language that remains readable and interactive without constantly descending through a trapdoor into C++.

Third, and perhaps most disruptively, Mojo aims toward *edge computing and embedded AI*—the world of phones, sensors, robots, industrial devices, and autonomous machines where memory is limited, battery life is precious, and carrying an entire Python runtime may be an extravagance.

Here, C and C++ have reigned for decades. Rust has arrived with safety guarantees and missionary zeal. Mojo proposes Python-influenced ergonomics with systems-level control and native CPU and GPU execution, a combination that feels, to embedded and accelerator programmers, either like salvation or like a very elaborate prank.

This remains partly an ambition. Mojo's current operating-system, tooling, cross-compilation, library, and hardware support is narrower than that of mature embedded languages. Cross-compilation is still developing, and producing fully linked executables for foreign targets may require an external linker and a certain tolerance for compiler archaeology.

The geographic metaphor extends to the *cloud*, where compiled Mojo programs may eventually prove useful for services, kernels, data transformations, preprocessing, and workloads that need native performance without a permanently resident Python interpreter.

Pure Mojo programs do not require Python. Programs using Mojo's Python interoperability, however, require a compatible CPython runtime and the relevant Python packages. Importing NumPy from Mojo does not absorb NumPy into a standalone executable like currants disappearing into a fruitcake.

Mojo promises to be lean. Mean. Almost aggressively austere. Whether it becomes all three outside carefully selected workloads remains an empirical question, which is engineering's rather less romantic term for “we shall see.”

# Why Should Anyone Who Is Not a Compiler Engineer Care?

This is the question that matters, isn't it? The *why* that separates technical curiosities from tools that alter how software is built.

I care because I have seen the direction of computing, and it is voracious. The AI systems that captivated the public imagination in 2023 and 2024 were only an early installment. Newer systems increasingly combine text, images, audio, video, code, tools, memory, planning, and robotic or software actions. They demand computational resources at training time and, increasingly, at inference time.

That pressure encourages optimization at every layer of the software stack, from silicon to kernels to runtimes to model architectures.

Python, for all its virtues, is not itself a systems language. In its conventional form, dynamic typing and runtime dispatch limit many compile-time optimizations. Python-level loops may execute orders of magnitude more slowly than equivalent compiled loops. The traditional GIL restricts CPU-bound Python threads, although free-threaded CPython now offers an increasingly credible alternative for programs and extensions prepared to support it.

At the same time, it is essential not to blame Python for work Python has already delegated. Most large tensor operations in PyTorch, TensorFlow, JAX, and NumPy are carried out by optimized native libraries. Python is often the conductor rather than the orchestra. The trouble begins when the conductor must also repair the violins between notes.

The two-language problem is not merely an engineering inconvenience. It is a *cognitive tax*. Every researcher who must context-switch between Python and C++, who must debug memory errors in native extensions that crash the Python interpreter, who must hire separate teams for “research code” and “production code,” pays a price in time, money, and creative energy that could have been spent solving actual problems rather than wrestling with toolchain archaeology.

Mojo matters because it proposes a *partial unification*. One language for high-level orchestration and low-level kernels. One language in which a researcher may begin with readable code and progressively introduce static types, explicit memory behavior, compile-time parameters, SIMD operations, and GPU kernels as performance demands increase.

That vision is not yet completely realized. Mojo cannot currently replace every Python library, every production runtime, every deployment tool, and every notebook workflow. But it offers an intriguing migration path: keep Python where its ecosystem is valuable, introduce Mojo for bottlenecks, and move the boundary gradually rather than rewriting the cathedral because one window rattles.

This is not merely about speed, though speed is the seductive promise that draws attention. It is about *cognitive ergonomics at scale*. It is about reducing the friction between imagination and implementation, between an idea and its execution, between a paper published at NeurIPS and code running in production.

It matters, too, because of *democratization*. Python's popularity stems partly from its accessibility. A biologist can learn enough Python to analyze sequencing data. A journalist can learn enough to scrape websites. If Mojo can preserve a meaningful portion of this accessibility while adding systems-level power, it expands the circle of people who can build high-performance software.

It challenges the implicit elitism that has long separated “application programmers” from “systems programmers”—the unspoken assumption that truly fast code must be written by wizards in dimly lit rooms, chanting incantations in C++ template metaprogramming.

Mojo lowers that barrier. It does not eliminate the mountain behind it.

# How Does This Sorcery Actually Function?

Now we descend. The *how* is where the romance of Mojo meets the machinery, where poetry meets pistons, where the elegant surface reveals the intricate clockwork beneath.

At the heart of Mojo's performance lies its relationship with *MLIR*—Multi-Level Intermediate Representation, which I mentioned earlier but must now explain properly.

Imagine, if you will, that compiling a programming language is like translating a novel. A traditional compiler might translate from the source language into one or several intermediate forms and eventually into machine code. MLIR is a framework for constructing many such intermediate representations, transformations, and lowering stages, each capable of preserving information useful at a particular level of abstraction.

A high-level operation such as matrix multiplication contains information about shapes, dimensions, and algebraic structure. If it is lowered too early into anonymous loops and memory addresses, much of that useful meaning disappears. MLIR allows a compiler to retain high-level structure long enough to perform domain-specific transformations, then progressively lower the program toward vector instructions, GPU kernels, or ordinary machine code.

MLIR supports collections of operations and types called *dialects*. Some describe structured control flow. Others describe linear algebra, tensors, GPUs, affine loops, or hardware-level operations. Compilers may combine and transform these dialects rather than forcing every language and accelerator vendor to invent an entirely separate tunnel from source code to silicon.

Mojo is built using MLIR design principles and Modular's own compiler infrastructure. Mojo code can therefore be represented and transformed at multiple levels before being lowered toward the hardware targets the compiler supports.

This is *hardware-aware compilation*, and it is one of Mojo's principal weapons.

Python, being dynamically typed, discovers many facts at runtime. When ordinary Python encounters `a + b`, it must determine what `a` and `b` are, locate the relevant operation, handle Python's object semantics, and account for the possibility that someone has redefined addition to return a small decorative goat.

This flexibility is tremendously useful. It is also more expensive than compiled code in which the compiler knows that `a` and `b` are, for example, two 32-bit floating-point values and can select an appropriate instruction before the program begins.

Mojo allows explicit static types while also providing type inference. A programmer may write ordinary-looking code and then become increasingly specific where performance requires it. Compile-time parameters allow functions and types to specialize around values and types known during compilation.

Earlier Mojo versions distinguished heavily between `def` and `fn`, presenting `def` as more Python-like and `fn` as stricter and more statically compiled. That explanation is now obsolete. As of Mojo 26.2, `fn` was deprecated, and Mojo 1.0 Beta standardized upon `def` for function declarations. The language's static behavior, effects, argument conventions, and compile-time specialization are expressed through the type system and the declaration itself rather than through a simplistic `def`-versus-`fn` divide.

This is worth emphasizing because Mojo is evolving quickly enough that tutorials written two years ago may describe a language that no longer exists. Programming-language archaeology has begun before the pottery has cooled.

Speaking of SIMD—*Single Instruction, Multiple Data*—this is a hardware capability possessed by modern processors but difficult to exploit efficiently from ordinary Python code. SIMD allows one instruction to operate on several data elements simultaneously.

Mojo exposes SIMD concepts directly through its type system and standard library, enabling programmers to express vectorized operations without first writing a C extension or hoping that a separate library recognizes and optimizes the loop. The precise generated performance still depends on data layout, alignment, target hardware, compiler optimization, and whether the programmer has accidentally arranged memory like the cupboards of a recently divorced uncle.

Then there is *ownership and borrowing*, concepts strongly associated with Rust but descended from older work in linear and affine type systems.

Mojo's current ownership model gives each value one owner at a time. When the owner's lifetime ends, Mojo destroys the value and calls the relevant destructor. References allow other code to access that value without taking ownership.

The syntax has changed from earlier descriptions that used `owned`, `borrowed`, and `inout`. In current Mojo:

- an argument with no convention keyword is received as an immutable reference;
- `mut` provides a mutable reference;
- `var` gives the function ownership of a value;
- `ref` provides a reference whose mutability is parameterized;
- additional conventions such as `out` and `deinit` serve specialized lifecycle purposes.

This system helps prevent use-after-free errors, double destruction, and dangling references by tracking ownership and lifetimes. It also ensures that destructors are called promptly.

But one should not convert this into a fairy tale in which memory errors have been abolished by royal decree. Programmers remain responsible for ensuring that resource-owning types correctly release their resources. Mojo also offers low-level and unsafe facilities because systems programming without any sharp objects would be merely office administration.

Python primarily uses reference counting, supplemented by a cyclic garbage collector. This is convenient and predictable in many common cases, but every Python object carries runtime machinery, and allocation, reference counting, object indirection, and cycle detection have costs.

Mojo aims for deterministic resource management without requiring a tracing garbage collector. Values may often be stored directly, moved, referenced, or destroyed according to rules visible to the compiler. This can reduce runtime overhead and improve locality, provided the programmer understands what is happening.

The compilation and deployment story deserves similar care. Mojo is compiled. `mojo run` compiles and executes a program; `mojo build` emits an executable. Pure Mojo programs do not require a Python installation merely because their syntax resembles Python.

When Mojo imports Python modules, however, it uses the CPython runtime as a dynamic library. Those programs therefore require a supported version of Python and whatever Python packages they call. Mojo currently supports interoperability with Python 3.10 through Python 3.14.

The bridge also works in the opposite direction. Mojo can build Python extension modules, allowing Python programs to call selected compiled Mojo functions. This may prove to be one of Mojo's most practical adoption routes: not overthrowing Python in a palace coup, but entering through the servants' entrance carrying a very fast matrix kernel.

# Which Technologies and Discoveries Conspired to Make This Possible?

Mojo did not emerge from the void. It stands on the shoulders of giants, some of whom would be surprised to find themselves in such company.

The *LLVM project*, begun by Lattner in December 2000 and now a vast collaborative effort involving companies, universities, and individual contributors, provides mature infrastructure for optimization and machine-code generation across a formidable range of processors.

Without infrastructure of this kind, a new systems language would need to implement code generation, optimization, object formats, linkers, debuggers, and platform support for x86, ARM, RISC-V, GPUs, and other architectures—a task requiring enough engineer-years to outlive several fashionable database paradigms.

*MLIR*, incubated within the LLVM ecosystem and developed by a broad group of compiler researchers, provides the multi-level representation framework that allows compiler builders to preserve and transform operations at different levels of abstraction—from tensor computations and structured control flow down toward vectors, loops, GPU operations, and machine instructions.

It was influenced by lessons from TensorFlow, XLA, domain-specific compilers, polyhedral compilation, and the general misery produced when every new accelerator arrives with a private compiler stack assembled from plywood and resentment.

The *development of modern AI accelerators*—Google TPUs, NVIDIA Tensor Cores, AMD's accelerator architectures, Apple GPUs, NPUs, FPGAs, and a swelling parliament of specialized chips—created the economic imperative for a language like Mojo.

When hardware becomes specialized, software must become sufficiently expressive to exploit it. General-purpose language runtimes and generic abstractions may leave performance on the table because they cannot describe, preserve, or optimize the structures that specialized silicon expects.

*The Python ecosystem itself* is paradoxically one of Mojo's enablers. Python's syntax, philosophy of readability, community conventions, and enormous library ecosystem provided the cultural and practical blueprint Mojo follows.

Mojo is not yet a Python superset. It is better described as a Python-influenced compiled language with bidirectional Python interoperability and an ambition to cover increasingly broad territory. This distinction may sound pedantic until one attempts to run an arbitrary Django application in Mojo and discovers that reality has retained legal counsel.

The interoperability strategy lowers the adoption barrier from “abandon everything and learn an entirely new civilization” to “keep Python, then move selected performance-critical code across the border.”

*Type inference and gradual increases in explicitness*—ideas refined across languages such as Haskell, ML, Scala, Rust, Swift, TypeScript, and typed Python—allow Mojo to offer static checking and specialization without requiring the programmer to annotate every breath and eyebrow movement.

Mojo is not gradually typed in precisely the same sense as TypeScript or Python with mypy, but it belongs to the broader family of language designs seeking to preserve ergonomic source code while making more information available to the compiler.

*SIMD instruction sets*—SSE, AVX, AVX-512, and AVX10 on x86 processors; NEON and SVE on ARM; vector extensions on RISC-V—provide the hardware foundation for Mojo's vectorized CPU operations.

These instructions are not new. Some are old enough to have opinions about compact discs. But accessing them directly from Python has historically required compiled extensions, specialized libraries, code generators, or heroic faith in automatic vectorization. Mojo exposes SIMD as a first-class programming concept.

*The theory of ownership and borrowing*, popularized at industrial scale by Rust and tracing an intellectual lineage through linear and affine type systems, informs Mojo's approach to deterministic resource management and lifetime tracking.

This is not a new idea. It is an old idea that compiler engineering has gradually made practical enough to leave the university seminar room without being tranquilized.

Even *the cloud-computing revolution* plays a role. The shift from owning servers to renting compute in finely measured increments makes performance an economic variable rather than merely a technical one. Faster execution may reduce accelerator hours, energy use, queueing delays, and the number of machines required to serve a workload.

The business case does not write itself, but it at least arrives holding a pen.

# The Misconceptions, Trade-offs, and Uncomfortable Realities

I would be doing you a disservice—an act of intellectual cowardice—if I presented Mojo as an unalloyed triumph, a silver bullet, a panacea for all that ails modern computing.

It is not.

It may never be.

First, the *maturity problem*. Mojo is young. Astonishingly young. Python has had more than three decades to accumulate libraries, debug edge cases, build community knowledge, establish best practices, and achieve that sublime state where most problems have already been solved by someone, somewhere, usually in a Stack Overflow answer written in 2012 by a person named Martijn.

Mojo reached version 1.0 Beta 2 only in June 2026. Its language, standard library, package ecosystem, documentation, compiler, debugger, cross-compilation facilities, and deployment conventions are improving rapidly but remain far younger than their Python, C++, Rust, or Java equivalents.

Adopting Mojo today means accepting a certain amount of pioneer discomfort: missing libraries, incomplete platform support, documentation that may trail implementation, and the occasional discovery that a tutorial from eighteen months ago is describing syntax now preserved chiefly for anthropologists.

Second, the *Python compatibility promise*, while genuine in spirit, is not absolute in language semantics.

Mojo is not currently a full Python superset. Python's dynamic features—runtime modification, arbitrary metaprogramming, monkey-patching, elaborate introspection, dynamic class construction, and the ability to make nearly any object behave like an emotionally complicated dictionary—do not map automatically into optimized native code.

Mojo may call Python through CPython, and Python may call compiled Mojo extensions, but crossing that boundary does not make the Python portion fast. Python code continues to execute as Python code.

To obtain systems-level performance, programmers must use Mojo's types, memory model, compile-time mechanisms, SIMD abstractions, GPU programming model, and resource conventions. The boundary between “Python-like Mojo” and “systems Mojo” is navigable but requires learning.

It is not, despite the marketing, a free lunch. The lunch comes with a type checker and a discussion about cache lines.

Third, the *community and governance* questions.

Modular developed Mojo as a venture-backed company and has open-sourced the standard library, MAX kernels, and other substantial components. The compiler itself remained closed-source at the time of publication, although Modular had committed to opening it as Mojo approached 1.0.

The proposed Qualcomm acquisition adds a new dimension. Qualcomm may provide capital, hardware expertise, distribution, and access to a vast range of edge devices and accelerators. It also raises questions about vendor neutrality, licensing, strategic priorities, governance, and whether a language designed to liberate developers from hardware fragmentation can remain equally hospitable to hardware manufactured by Qualcomm's competitors.

These are not accusations. They are questions prudent engineers ask before betting careers, companies, and twenty-year software systems upon a platform.

Fourth, the *learning curve for systems concepts*. Mojo makes systems programming more approachable, but it does not make it *trivial*.

Ownership, borrowing, lifetimes, memory layouts, alignment, cache locality, synchronization, vectorization, GPU thread hierarchies, address spaces, race conditions, and numerical precision are genuinely complex topics.

A Python programmer who has never thought about stack versus heap allocation, who has never encountered a data race, who believes a pointer is merely something a dog does with its nose, will face a learning curve.

Mojo lowers the barrier. It does not remove the need to understand the machine. The machine, regrettably, has not agreed to become intuitive.

Fifth, the *competition*.

Rust exists. It is mature, fiercely loved, and increasingly used throughout systems and infrastructure software.

C++ exists, for all its accumulated scars and template error messages that read like ancient curses found carved beneath a Mesopotamian latrine.

Julia exists—a language explicitly designed for numerical and scientific computing, with a sophisticated multiple-dispatch system, a substantial academic ecosystem, and its own answer to the two-language problem.

Triton exists as a specialized language and compiler for writing GPU kernels in an unusually Pythonic fashion.

JAX, XLA, PyTorch compilation, `torch.compile`, Numba, Cython, free-threaded CPython, and emerging Python JIT work all attack portions of the same problem without requiring users to migrate to an entirely new general-purpose language.

Zig exists, challenging C's dominance with a focus on simplicity, control, and explicitness.

Mojo must prove itself not merely against Python, but against this formidable constellation of alternatives, each of which has already occupied some portion of the battlefield and erected a Discord server.

Sixth, the *benchmark problem*.

Programming-language performance claims are notoriously easy to inflate. A carefully optimized Mojo kernel may outperform an ordinary Python loop by an absurd factor, but so may NumPy, Numba, Cython, Rust, C++, Julia, or a sternly worded spreadsheet.

The meaningful comparisons are rarely “Mojo versus naive Python.” They are Mojo versus optimized native libraries, CUDA, HIP, Metal kernels, Triton, modern C++, Rust, Julia, XLA-generated code, and the best implementation a competent practitioner would actually deploy.

Benchmarks should disclose hardware, compiler versions, precision, warm-up, data sizes, transfer costs, compilation time, and whether the competing program was written by an expert or by someone's sleepy nephew.

A language does not become fast merely because its homepage contains a logarithmic chart.

The trade-off, then, is this: Mojo offers a distinctive synthesis—Python familiarity, explicit systems control, compile-time specialization, ownership, SIMD, and first-class CPU and GPU programming—but synthesis requires compromise.

It is not as mature as Python.

It is not as battle-tested as C++.

It is not as established as Rust.

It does not yet possess Julia's scientific ecosystem or Triton's specialized foothold in GPU kernel development.

It is, instead, a bet on a particular future: a future where AI is a dominant computing paradigm, hardware heterogeneity is normal, the boundary between research and production becomes thinner, and the language that bridges these worlds gains immense value.

It is a reasonable bet.

It is not a certain one.

# Stepping Back: The Fire We Are All Tending

I began this exploration with progress bars and frustration, with the petty indignities of waiting for code to execute, with the suspicion that there must exist a better way to speak to machines.

I end it, if I may, with a broader observation—one that transcends Mojo, transcends Python, transcends the particular anxieties of compiler design and memory management.

We are living through a transformation in what it means to compute.

For decades, much software was about *information*: storing it, retrieving it, transmitting it, validating it, presenting it, and occasionally losing it in a database migration performed on a Friday evening.

The languages we built—C, C++, Java, Python, JavaScript, and their innumerable descendants—were shaped by operating systems, databases, networks, user interfaces, business logic, and the hardware available at the time.

Speed mattered, but its importance varied. A web page that loaded in 200 milliseconds rather than 20 was preferable, but the difference did not necessarily alter the nature of what was possible.

AI changes portions of this calculus.

Computing is increasingly about *inference*: running models that recognize patterns, generate language, predict structures, synthesize images, interpret signals, recommend actions, and simulate possibilities.

These tasks can be computationally ravenous. Their cost depends upon data movement, model size, architecture, numerical precision, batching, sparsity, hardware utilization, and the ambition of what we ask them to do.

In this world, performance is not always a luxury; it can become a *capability*. A model that runs substantially faster may serve more users, operate on a smaller device, consume less energy, respond with lower latency, or be iterated upon more frequently.

A language and compiler capable of extracting more useful work from available hardware may expand what can be built.

But performance is not a property of language syntax alone. It emerges from algorithms, compilers, runtimes, kernels, libraries, memory systems, networks, hardware, and the humans who assemble them. Mojo does not abolish this stack. It proposes a more coherent way of programming portions of it.

Mojo, whether it ultimately succeeds or becomes a fascinating footnote, represents an important experiment in how we think about programming languages.

It is an acknowledgment that abstractions designed for one era of computing may become insufficient for another. That the gap between “code that works” and “code that flies” is not merely a matter of optimization but of *expressiveness*—of whether a language allows the programmer to communicate enough of their intent for the compiler to map it intelligently onto the hardware.

This is the deeper significance.

Mojo is not simply a faster Python. It is a *different contract* between the programmer and the machine.

In Python, the contract often says: “I will write simply; you will resolve much of the meaning at runtime, and we will accept overhead in exchange for flexibility and convenience.”

In C++, the contract often says: “I will specify an alarming number of details; you will generate something extremely fast, and I accept that the error message may contain the complete genealogy of every template instantiated since breakfast.”

In Mojo, the proposed contract says: “I will specify what matters for performance and abstract what does not; you will optimize aggressively, and we will attempt to meet in the middle.”

This middle ground—this negotiated truce between human cognition and silicon capability—is where much of the future of high-performance computing may reside.

Not exclusively in the rigid austerity of C++, though it will retain an enormous role.

Not exclusively in the dynamic freedom of Python, though it will remain indispensable.

But in languages and systems that offer a spectrum of control rather than a binary choice, recognizing that different parts of a program demand different levels of abstraction and optimization.

I think sometimes of the early days of aviation. The Wright brothers built their own engine because existing automobile engines were too heavy. They needed a different kind of machine for a different kind of travel.

We are in a similar moment with AI.

The engines we have—our programming languages, compilers, runtimes, libraries, and hardware abstractions—were built across several different journeys. Some remain magnificent. Some have been modified beyond recognition. Some are held together by compatibility promises made when Britney Spears was still releasing music on compact discs.

Mojo is an attempt to build a new engine, one that burns hotter, runs leaner, and speaks more fluently to the strange, parallel, heterogeneous architectures that modern AI demands.

Will it replace Python?

Probably not.

Python is too entrenched, too beloved, too useful, and supported by too much accumulated software. Most Python programs do not require systems-level performance, and many demanding Python workloads already delegate their arithmetic to excellent compiled libraries.

But in domains where control over every allocation, transfer, vector lane, and accelerator kernel matters, Mojo may carve out meaningful territory.

It may become a language Python programmers learn when Python-level orchestration becomes the bottleneck.

It may become a productive language for portable CPU and GPU kernels.

It may become an important component beneath Python rather than a replacement for it.

At maximum, it could become a major language for AI infrastructure and heterogeneous computing.

At minimum, it is already an unusually ambitious experiment in combining Python-influenced readability with the power and responsibility of systems programming.

The difference between those outcomes will not be settled by keynote demonstrations or spectacular microbenchmarks. It will be settled by stability, tooling, governance, libraries, hardware support, independent adoption, and whether ordinary engineers can build ordinary production systems without spending three days arguing with the package manager.

I am watching it closely.

I suggest you do too.

The progress bars will not disappear. But perhaps, in the not-too-distant future, some of them will move with a swiftness that feels almost like thought itself.

P.S. For the skeptical and the curious alike, I recommend beginning with the Mojo documentation and roadmap rather than promotional benchmarks. The documentation is unusually readable for a language still in beta and, more importantly, records the language's frequent changes.

Chris Lattner's talks and essays on LLVM, MLIR, compiler construction, and AI infrastructure are also worth reading—not because he is infallible, but because he has helped shape the direction of compiler engineering before, and it is useful to understand why he believes this shape is next.

The MLIR paper and project documentation provide the technical foundation for those wishing to descend deeper into the machinery.

For contrasting perspectives, examine Julia, Rust, Triton, Numba, JAX, and free-threaded CPython. Technologies are most revealing when placed beside the alternatives they must defeat, coexist with, or quietly borrow from.

# References

1. Mojo documentation:
   https://mojolang.org/docs/

2. Mojo FAQ, including compilation, hardware lowering, language scope, and SDK details:
   https://mojolang.org/docs/faq/

3. Mojo roadmap:
   https://mojolang.org/docs/roadmap/

4. Mojo 1.0 Beta 2 release notes:
   https://mojolang.org/releases/v1.0.0b2/

5. Mojo function declarations and the deprecation of `fn`:
   https://mojolang.org/docs/manual/functions/

6. Mojo ownership and argument-passing conventions:
   https://mojolang.org/docs/manual/values/ownership/

7. Mojo Python interoperability:
   https://mojolang.org/docs/manual/python/

8. Mojo GPU programming fundamentals:
   https://mojolang.org/docs/manual/gpu/fundamentals/

9. Mojo compilation and cross-compilation targets:
   https://mojolang.org/docs/tools/compilation/

10. Modular's original May 2023 Mojo announcement:
    https://www.modular.com/blog/a-unified-extensible-platform-to-superpower-your-ai

11. Modular's March 2024 open-source announcement:
    https://www.modular.com/blog/the-next-big-step-in-mojo-open-source

12. Modular's May 2025 release of the full Mojo standard library and MAX kernels:
    https://www.modular.com/blog/modular-platform-25-3-450k-lines-of-open-source-code-and-pip-install-modular

13. Modular's path to Mojo 1.0 and planned compiler open-sourcing:
    https://www.modular.com/blog/the-path-to-mojo-1-0

14. Qualcomm's June 24, 2026 agreement to acquire Modular:
    https://www.modular.com/blog/qualcomm-to-acquire-modular

15. LLVM project overview:
    https://llvm.org/

16. MLIR project overview:
    https://mlir.llvm.org/

17. Chris Lattner et al., “MLIR: Scaling Compiler Infrastructure for Domain Specific Computation”:
    https://arxiv.org/abs/2002.11054

18. Python documentation on free-threaded execution:
    https://docs.python.org/3/howto/free-threading-python.html

19. Python 3.14 release documentation:
    https://docs.python.org/3/whatsnew/3.14.html

20. Alex Krizhevsky, Ilya Sutskever, and Geoffrey Hinton, “ImageNet Classification with Deep Convolutional Neural Networks”:
    https://proceedings.neurips.cc/paper/2012/hash/c399862d3b9d6b76c8436e924a68c45b-Abstract.html

21. Ashish Vaswani et al., “Attention Is All You Need”:
    https://arxiv.org/abs/1706.03762
