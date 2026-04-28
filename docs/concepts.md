# Core Concepts

> **English** (this file) · [日本語](concepts.ja.md)

## Three-dimensional structure: logical, physical, organizational

karasu describes a system's architecture across three dimensions — **logical, physical, and organizational**.
This is the foundation of karasu's design.
Each dimension can be written in a separate file, but all three are navigated together through the same drill-down.
The motivation for treating these three as a single language — Conway's Law (the observation that software structure tends to mirror organizational structure) and the inverse Conway maneuver (deliberately reshaping team structure to achieve a desired architecture) — is discussed in detail in the "Goals and non-goals" section below.

### Logical structure (What / Why)

Describes the system from a **"what and why"** perspective.

A system has both an **access path** (who reaches the services and through what) and a **service hierarchy** (what business functionality each service contains):

```
system
├─ user → client → service        (access path: who reaches what, through what surface)
└─ service → domain → usecase → resource    (service hierarchy: what each service contains)
```

- `system`: a container showing relationships between actors, clients, owned services, and external services
- `user`: an actor that drives the system (`[human]` / `[ai]`)
- `client`: software we ship that acts on a user's behalf (mobile / web / desktop / CLI / device / extension / embed). Sits between `user` and `service`. See [ADR-20260428-06](adr/20260428-06-client-mcp-modeling.md) for why this is its own kind rather than a tag on `service`
- `service`: an independent unit of business functionality
- `domain`: a business-concern boundary inside a service (close to DDD's Bounded Context)
- `usecase`: a business operation inside a domain
- `resource`: what a usecase operates on (tables, external APIs, files, etc.); also reserved on `client` for operation-tied local storage (`localStorage` / `indexedDB` / `opfs` / `file` / `keychain`)

`database` / `queue` / `storage` may also live directly under `system` as shared infrastructure that services depend on (see [ADR-20260405-05](adr/20260405-05-database-as-first-class-node.md)).

### Physical structure (How)

Describes **how** the system actually runs. Written in `.krs` files separate from the logical structure.

```
deploy → war / oci / job / ...
```

### Binding logical to physical with `realizes`

`realizes` makes the correspondence between physical and logical explicit.

```
oci "order-service" {
  realizes ECommerce   // physical (concrete) → logical (abstract)
}
```

This corresponds to UML's Realization relationship. It is a declaration: "this deployment unit realizes this service."

### Organizational structure (Who)

Describes **who owns what**.
By making the ownership of each service and domain explicit at the team level, karasu puts the architecture discussion and the team-structure discussion on the same table.

```
organization → team → member
```

The reason karasu includes the organizational diagram as part of its vocabulary is that it is directly tied to architectural design.
See the three-dimensional goal in the "Goals" section below for details.

### Binding organization to logical/physical with `owns`

Which team owns which service or domain is made explicit inside a `team` using `owns`.

```
organization "ec-org" {
  team "ec-team" {
    owns ECommerce
    owns Order
    owns Catalog
  }
}
```

Symmetrically to how `realizes` binds physical to logical, `owns` binds organization to logical and physical.
The same node id cannot be `owns`-ed by more than one team, and overlapping ownership is detected as a warning.
As a result, while the three dimensions can be written independently, their correspondences are always visible in the diagram.

### How `.krs` text is produced

There are several ways to produce `.krs` text —
a user writes it by hand in an editor, `karasu translate` extracts it from an existing code artifact (Docker Compose, Kubernetes manifests, OpenAPI schema, SQL schema), or the Chat panel generates it interactively.
Whichever path you take, the final product is `.krs` text, and diagrams are rendered from there.
This "text as single source of truth" principle is explored in detail in the "Goals" section below.

---

## Drill-down as the way to understand architecture

This concept is also the origin of the tool's name "karasu" (鴉, raven).
Like a raven that surveys the world from above to gather information and descends where needed, you understand the architecture by drilling down.

```
system         (full overview)
  └─ service   (business functionality)
       └─ domain    (concern boundary)
            └─ usecase    (business operation)
                 └─ resource   (operation target)
```

You can drill down from any node to a more detailed view.
You write using inline nesting, and once something grows, you `extract` it into a separate file.

This mechanism is not merely a navigation convenience;
it is a deliberate cognitive design choice — **limit how much is shown at once**.
Rather than a single-page "at a glance" diagram that tries to show everything, karasu takes **scoped glance** — look at a bounded region, then descend as needed — as a first-class approach.
Why this direction is chosen is discussed in detail in the "Goals and non-goals" section below.
When this document refers to "scoped glance" from here on, it means this principle.

---

## Edges — Expressing relationships and aggregating them

Relationships between nodes are expressed as **edges**.
karasu's edge model is made up of four mechanisms that work together, each an embodiment of the **scoped-glance + drill-down principle** at the edge layer:

1. **Explicit and implicit** — an asymmetry where the writer records details and the reader receives the overview
2. **Aggregation** — collapsing information when viewed from above
3. **Ghost** — preserving the existence of boundaries even when the visual field narrows
4. **Automatic checks** — statically guaranteeing structural soundness

Each is explained below from the motivation angle.

### Explicit and implicit — the asymmetry between writer and reader

An edge the user writes directly (`->` for sync, `-->` for async) is an **explicit edge**.
On the other hand, when the user writes an edge between domains that belong to different services, karasu **automatically synthesizes** an edge between the containing services.
This is an **implicit edge**. The synthesized edge is tagged with `[implicit]` and rendered in amber on the overview diagram.

The motivation for this mechanism is an asymmetry paired with drill-down:
**the writer only has to record edges at the detailed level as they do domain modeling, and the reader sees them automatically reflected in the service-level overview**.
The result of domain modeling feeds directly into service-boundary discussions, with no manual translation step in between.

The distinction between sync and async is not visual decoration but information that captures structural semantics —
the cyclic-dependency detection described below treats async edges as "intentional loose coupling" precisely because of this distinction.

References: ADR-20260410-01, ADR-20260413-02. See `docs/spec/syntax.md` for the detailed syntax.

### Aggregation — reducing information when seen from above

If the same service pair has multiple domain-level edges between them, the overview would show several overlapping lines and become unreadable.
karasu collapses these into **a single implicit edge per sync/async kind**, and clicking on the aggregated label opens a detail panel that shows the breakdown.

This is a direct embodiment of the **"limit how much is shown at once"** principle from the "Goals and non-goals" section:
aggregate when viewed from above; delegate the details to drill-down and the detail panel.
Aggregation is done separately for sync and async, so if a pair has both kinds of dependencies, two edges are drawn.

References: ADR-20260410-01, ADR-20260413-02, PR #607.

### Ghost — keep boundaries visible even as the field narrows under drill-down

When you drill down into a service or domain, the outside world drops out of view.
But erasing it entirely loses the **boundary context** — "what does this domain depend on?"
karasu addresses this with **ghost domains and ghost systems**:
nodes that sit outside the current viewpoint but still participate in dependencies are rendered as semi-transparent placeholders.
The existence of the boundary is visible; the details are not — another embodiment of scoped glance.

You can also explicitly draw an edge to a different system using the `SystemId.ServiceId` dot notation, and the referenced system renders as a ghost system.
This is the standard mechanism for describing architectures that span microservices or multiple organizations.

References: ADR-20260404-09, ADR-20260405-07, ADR-20260411-05.

### Annotation inheritance — keeping context across drill-down

A mechanism related not to edges themselves but to the styling of edge endpoints:
**annotations on a parent service are inherited by child nodes (domain / usecase / resource)**.
If a service has `@deprecated`, its descendant nodes are also rendered as deprecated (inheritance stops if a child carries its own annotation).

This exists so that the context "this service is on its way out" is preserved at any drill-down level, and it affects the way edges are drawn as well.
It prevents annotations from being ignored suddenly at deeper drill-down levels.

Reference: ADR-20260415-01.

### Automatic checks — cyclic dependencies

karasu **automatically detects cyclic dependencies, considering only sync edges**.
Async edges are excluded because an async dependency represents "intentional loose coupling" — a relationship where a cyclic communication does not directly cause startup-ordering or call-chain problems.
Sync cycles, on the other hand, lead to real failures, so they are worth catching statically and warning about.

Detected cyclic edges receive a `[cyclic]` tag and are rendered in red.
Precisely because karasu stays in a **slowly-changing structural context**, the results of such static checks are meaningful — this is not the kind of check whose warnings wobble every time the implementation changes.

Reference: ADR-20260405-06.

### Summary

The four mechanisms (explicit/implicit, aggregation, ghost, cyclic checks) are not independent features; they are different restatements of the same **scoped-glance + drill-down** principle at the edge layer.
The writer records details; the reader receives a bounded field of view; boundaries survive as ghosts; and static checks keep the structural soundness.

---

## Domain dispersal detection

From a DDD standpoint, the same domain appearing across multiple services is a design warning sign.
karasu detects this automatically and surfaces a warning.

```
⚠ Warning: domain "Order" is dispersed across multiple services
  - ECommerce
  - Legacy
  Check the cohesion of the domain.
```

### Detection scope (design direction — implementation tracked in #237)

Detection is performed **within a `system` block**. Because `system` represents an organizational ownership boundary, the same domain name appearing across different `system` blocks is treated as **intentional parallel modeling** and is not warned about.

```krs
// No warning — different systems are independent organizational boundaries
system LegacyPlatform {
  service OldBilling { domain Payment { ... } }
}
system NewPlatform {
  service PaymentService { domain Payment { ... } }
}

// Warning — the same system has duplicate domain ids
system ECPlatform {
  service ECommerce { domain Order { ... } }
  service Legacy    { domain Order { ... } }  // ← warning
}
```

### Detection key (design direction — implementation tracked in #237)

Domain identity is determined by **`id`**. The `label` (display name) can be translated or abbreviated over time, so it is not used as the detection key.

---

## How karasu differs from C4 Model

karasu is inspired by C4 Model but adopts its own vocabulary.

| C4 Model        | karasu                | Why the change                                       |
| --------------- | --------------------- | ---------------------------------------------------- |
| Context Diagram | `system`              | "context" is ambiguous                               |
| Container       | `service`             | Emphasizes its role as a business-function unit      |
| Component       | `domain`              | Emphasizes its role as a domain boundary             |
| Code            | `usecase`             | Expresses a business operation                       |
| (none)          | `resource`            | Makes the operation target of a usecase explicit     |
| (none)          | `deploy` / `realizes` | Separates physical structure from logical structure  |

C4 compatibility is not a goal in itself. See the "Goals and non-goals" section below for details.

---

## Goals and non-goals

What karasu aims for and what it does not.
The value of this list is in the **rationale** behind individual rules more than in the rules themselves.
The aim is that when a future "should we add X?" question arises, the reasoning written here can be reused directly instead of being re-derived from first principles.

### Goals

#### karasu describes architecture as text

karasu's model is written as `.krs` text, and diagrams are rendered from it.
All input paths — hand-writing, extracting from existing code via `translate`, interactive generation through Chat — converge on the same `.krs` text.
There is no path that bypasses the text.

So **why was text chosen?**
karasu is designed as a DSL with enough expressive power to describe logical, physical, and organizational architecture, and the reasons for choosing text as the medium come down to the following four properties.
These four properties are both the motivation for choosing text and the benefits that follow from it.

**1. Just-enough expressiveness lets it be a true single source of truth**

The karasu DSL provides exactly the vocabulary needed to describe architecture (system / service / domain / usecase / resource / deploy / realizes / organization / team) and is deliberately designed so that nothing below that level can be expressed.
It is this "just-right-ness" that lets `.krs` text function as the model's single source of truth.
Every input path becomes composable — the output of Chat can be hand-edited, and in turn, a hand-written model can be refined by Chat — and a single, consistent mental model holds throughout.

**2. Editor support via the LSP ecosystem**

Because it is text-based, it sits on the LSP ecosystem:
completion, validation, jump-to-definition, hover, rename, and so on.
Providing these affordances at the same level inside a graphical editor would be extraordinarily expensive, but with text + LSP they come for free as a natural consequence of sitting on a standardized foundation.

**3. Natural affinity with AI**

When you ask a general-purpose LLM to draw an architecture, both the format and the level of abstraction in its output are unstable.
Inserting karasu's DSL as an intermediate language constrains the AI's output to the range of what karasu can express, stabilizing both structure and abstraction.
Because karasu's DSL was not designed for AI but as a standalone human-oriented tool, it ends up functioning as a bidirectional collaboration language between humans and AI.
See the "karasu and AI — the DSL as a constrained intermediate language" section below for the full discussion.

**4. Diffs are easy to compute, and changes are visible**

Being text-based, producing deterministic output, and keeping changes local — these properties mean that git, the browser demo's OPFS, or any future history mechanism can all show users "what changed."
Code review can answer "what did this architecture change do?" at a glance, and history can be walked backward to find "when this boundary appeared."
One UX consequence of this is the possibility of "graphical diff between two `.krs` files" as a feature (see #650).

Concretely, the following properties support this:

- It is text (not binary, not auto-generated XML)
- Output is deterministic — the same `.krs` always renders the same SVG with stable ordering
- Changes are local — adding a single node does not cause unrelated regions to show up in the diff

#### Limit what is shown at once; drill down for detail (scoped glance)

There is a limit to how much information a human can take in at once.
Any "at a glance" diagram that stuffs an entire architecture into one page rapidly becomes unreadable as the system grows —
lines cross, nodes shrink, and readers end up spending their cognitive budget on searching for what they want.
This is not a diagram failure; it is a mismatch between how much information you are trying to convey at once and the human cognitive bandwidth.

karasu addresses this by adopting, as a first-class approach,
**always limit how much is shown at once, and drill down to where the detail lives when you need it.**
The hierarchy (system → service → domain → usecase → resource) is an embodiment of this design — not a mere navigation convenience but **a cognitive design choice**.

karasu takes inspiration from C4 Model for its drill-down, but where C4 defines four fixed diagram types (Context / Container / Component / Code), karasu adopts a more continuous, stepwise drill-down in which the user descends from any node, writes inline nested blocks as the model grows, and extracts into separate files only once things get large enough.
This continuity has the advantage of letting the model express its own growth — you start with small inline nesting and extract later, once it outgrows that form.

**Note**: this goal is not a claim that bird's-eye views have no value.
A complementary overview that *hints* at what structures exist across the whole system — something like a "hint view" that shows structure but suppresses detail — could become a future consideration, as long as it **complements** drill-down rather than replacing it.
What is first class, however, is "limited scope + drill-down"; any hint view would exist on top of that premise.

#### karasu captures structure across three dimensions: logical, physical, organizational

When talking about architecture, many tools focus on "how the components are put together" (logical structure), or "where they run" (physical structure), or both.
karasu adds a third dimension: **organizational structure** — which team owns which service, and who the members are.

The background is **Conway's Law**:
the structure of software and the structure of the organization are inseparable, with team boundaries shaping service boundaries and service boundaries shaping team responsibilities.
Talking about only one side means missing the forces hiding in the other.

But the motivation for treating organizational structure as first-class goes one step further.
The central aim is to make the **inverse Conway maneuver** — the microservices-era practice of *deliberately reshaping team structure* to realize the desired software architecture — something that can be discussed at the same table as the architecture itself.
By writing ownership on a per-service, per-domain basis directly in the diagram, questions like
"we want to split this service — which team should own the new boundary?",
"who should we entrust the responsibility of this domain to?",
and "if we're going to reshape teams, where do we start?"
can be argued in the same context as logical and physical structure.
In karasu, the org diagram is not documentation; it is **the target of a design decision**.

karasu keeps all three dimensions in the same `.krs` / `.krs.style` vocabulary, navigated through the same drill-down:

- **Logical**: `system` / `service` / `domain` / `usecase` / `resource`
- **Physical**: `deploy` / `realizes`
- **Organizational**: `organization` / `team` / `member`

You could draw each of these in a separate tool, but drawing them separately means the *correspondences* (which team owns which service running in which environment) fall outside the diagram, and you lose the ability to move architecture and team structure together.
karasu's aim is to let you talk about the **intersection of the three dimensions** — the place where the forces of Conway's Law and the inverse Conway maneuver play out — in a single language.

### Non-goals

Before reading the individual non-goals, it helps to notice the **shared filter** that nearly all of them follow.

The decision about what karasu does *not* handle can be derived from a single principle rather than re-derived for every feature:

> karasu handles a **slowly-changing structural context** — what exists, how things relate, and who owns them — and everything about implementation details or runtime state sits outside that.

Many "could we also support X?" proposals look attractive on the surface, but they share a single side-effect:
**pressure to pull implementation or operational detail into the model**.
Code generation forces implementation specifics into the model; runtime metrics force individual pods into the model; DB schema design forces table definitions into the model; sequence diagrams force the time axis into the model.
All of them pull the model away from the level of abstraction where karasu is supposed to stand.

The non-goals below are individual manifestations of the same principle.
Rather than reading each one as a standalone rule, read them with "ah, the same filter again" in mind, and the consistency across judgments comes into view.

#### No fully-automatic layout optimization

Readability of the text source — not pixel-perfect visual output — is the top priority.
When a user needs pixel-perfect diagrams for a slide deck or external documentation, the answer is **not** to grow karasu's layout engine in that direction; it is to **let the output escape into a tool specialized for layout polishing**.
A draw.io (mxGraph XML) export is available as the escape hatch for this purpose: `karasu render <file> --format drawio` writes a one-way `.drawio` file that can be polished in diagrams.net and re-exported. The `.krs` text remains the single source of truth — edits made inside draw.io are not read back (see #649).
This non-goal and its escape hatch are a pair and should be understood together.

#### No direct drawing mode for building the model on a canvas

There is no mode for building the model by dragging nodes on a canvas.
The model is always generated and edited as text, and diagrams are derived from that text.
This principle also clarifies the position of the Chat panel:
**Chat produces text; it does not edit the diagram.**
Without this non-goal, every "please add a canvas editor" request would have to be re-evaluated from first principles.

#### No runtime metrics or live system-state visualization

What karasu expresses is the **intended** architecture, not observed behavior.
Overlaying live latency, error rates, or instance counts onto the diagram produces an abstraction mismatch:
karasu's `service` is a logical business-functionality unit, whereas runtime metrics target individual processes or pod instances — a step finer in granularity. Mixing the two leads to:

- The model having to track production topology (which pod, which region), dragging it toward a dashboard.
- Diagrams becoming meaningless unless they are connected to live telemetry.
- karasu's center of gravity shifting from "a tool for talking about architecture" to "a tool for watching operations."

The observability-view role is already covered by Datadog, Grafana, Backstage, and the like; that is their territory.

#### No modeling of physical infrastructure topology (regions, AZs, clusters, nodes)

Descriptions of infrastructure topology itself — "production is a K8s cluster spanning three AZs in us-east-1, staging is a single AZ" — are out of scope for karasu.
At first glance this might look like something that could extend `deploy` as a form of physical structure, but in practice the abstraction drops another level:
`deploy` describes a **runtime contract** — "which code artifact runs as which runtime form (OCI / Lambda / Job / ...)" — and *where* that concretely lands (which region, which cluster, which node) is the responsibility of the cloud provider, IaC, and the orchestrator.

Pulling this into the model causes the following side effects:

- The model becomes a duplicate of Terraform / Kubernetes manifests, creating a dual source of truth.
- Pressure emerges to fork the model per environment (prod / staging / dev), and structural description gets swallowed by operational configuration.
- karasu's center of gravity shifts from "a tool for talking about architecture" to "a tool for talking about infrastructure configuration."

Visualizing infrastructure topology is already handled by Terraform graph, Backstage, cloud consoles, and dedicated configuration-diagram tools.
karasu stops at the runtime-contract layer of `deploy`.
This non-goal was considered through Issue #28 and explicitly ruled out.

#### No modeling of behavior, sequence, or temporal flow

What karasu expresses is **structure** — what exists, how it relates, and who owns it.
Flows along a time axis like "A calls B, B calls C, and the response comes back" are out of scope.
Sequence diagrams are a different concern well handled by Mermaid and PlantUML,
and a karasu diagram and a sequence diagram answer different questions.
Trying to express both in one file dilutes both of them.
Adding sequence diagrams as a drill-down target was considered in Issue #23 and ruled out for the same reason.

#### No database schema modeling

Tables, columns, indexes, foreign keys, and ER-level relationships are out of scope.
Note the **asymmetry** with `translate --from db` here:
taking in an existing schema and **abstracting** it into a domain *is* a goal
(information flows toward a higher level of abstraction — details fall away),
but **designing** a schema *inside* a karasu model demands the opposite direction of information flow —
it creates pressure to pull implementation details into the model.
Dedicated ER modeling tools exist, and those are what you should use.

#### C4 compatibility is not a goal

karasu is inspired by C4 Model but defines its own vocabulary (system / service / domain / usecase / resource) and its own drill-down semantics.
Strict C4 compatibility was never a goal in the first place — this is stated explicitly as a non-goal so that readers do not mistakenly expect compatibility based on the visual resemblance.
Pursuing compatibility would force compromises on the logical/physical separation and the drill-down model, which are karasu's distinctive features.

#### No application code generation from the model

This is the most important non-goal to get right, because its rationale is **asymmetric** with that of the `translate` CLI (which goes in the opposite direction).

- **`translate` (code → model)** is an input aid for **abstracting and surveying** an existing system.
  Information flows toward higher abstraction: implementation details are discarded and the architecture becomes readable.
- **Code generation (model → code)** flows information in the opposite direction, toward lower abstraction: the model would need to carry enough implementation detail to drive the code, which ultimately **forces users to write overly detailed models**.
  The model turns into a duplicate of the code, and karasu slides away from "a tool for talking about architecture" into "a tool for driving the implementation."

karasu is explicitly **a tool for talking about architecture**, not **a tool for driving the implementation**.
This framing gives a consistent answer to neighboring temptations ("just generate the TypeScript type definitions from the domains", "just generate an OpenAPI skeleton from the usecases"):
all of them create pressure to push implementation details into the model, and all of them are out of scope.

---

These goals and non-goals are not fixed; they are expected to be updated as real usage teaches us things.
However, updates should happen at the **rationale layer**, not as isolated rules —
when adding a new rule, verify that it does not contradict the existing reasons and that it aligns with the shared themes (stay at the right abstraction level, keep text as the single source of truth). Doing so is how karasu's consistency is maintained.

---

## karasu and AI — the DSL as a constrained intermediate language

The property "natural affinity with AI" mentioned in the goals section leads to an insight that elevates karasu's positioning. This section expands on it.

### Problem: general-purpose LLMs produce unstable architecture output

When you ask a general-purpose LLM "draw the architecture of this system," the output is unstable along two axes:

- **Format instability**: sometimes Mermaid, sometimes draw.io XML, sometimes bullet-list natural language
- **Abstraction instability**: sometimes a class diagram, sometimes a sequence diagram, sometimes a deployment diagram

Different formats are not reusable; different abstractions make it impossible to tell whether the model is even describing the same system.
As a result, AI output tends to be **a one-shot artifact you can neither review nor continuously edit**, and it does not function as a foundation for collaboration with humans.

### Solution: insert a DSL as an intermediate language

When you place karasu's DSL between yourself and the AI, the output is constrained to the range of what karasu can express. Concretely:

- **The format is fixed** — the output is always `.krs` text
- **The abstraction level is fixed** — the available vocabulary is limited to system / service / domain / usecase / resource / deploy / realizes / organization / team
- **The output becomes evaluable** — it can be parsed with `karasu compile`, and its logical validity can be checked mechanically

This does not strip the AI of freedom; it **aligns it to the right granularity**.
Details unnecessary to domain modeling cannot be expressed, and conversely the elements needed to talk about architecture are all present in the vocabulary. The DSL functions as a "just-right constraint."

### Structural analogy with structured outputs

This framing belongs to the same pattern as established techniques in the AI ecosystem.
Recent LLM APIs offer, in addition to "return free-form text" modes, modes that **force output to match a pre-declared schema**.
The representative examples below all take the approach of fixing "the shape of what is generated" rather than "the content of what is generated":

- **OpenAI structured outputs**: a feature that takes a JSON schema up front and guarantees that the LLM's output always conforms to it
- **Claude tool use**: a feature that gives the LLM the signatures and argument types of the functions it can call, so the LLM produces arguments that conform to those types
- **karasu's DSL**: constrains the LLM's output using a vocabulary dedicated to describing architecture (system / service / domain / ...)

All of these share the common structure of "give a general-purpose LLM a fixed schema to make its output predictable."
What is fundamentally different about karasu is that the schema in question is **a language humans designed for talking about architecture in the first place**.

### The core point: karasu's DSL was not designed for AI

This is the heart of karasu's positioning.

karasu's DSL was not designed after the fact in order to add AI-assist features.
It was designed as **a standalone human-oriented tool** — to be read and written in a text editor, diffed in git, and discussed in code review.
Of the four properties listed in the goals section (expressiveness, editor support, affinity with AI, diff-friendliness), the AI affinity is a *consequence* of the design, not one of its original goals — it emerged because the language happened to be a good fit, not because it was shaped for that purpose.

And yet, **it is precisely this independence that generates bidirectionality.**

- A human can read `.krs` produced by an AI just as they would any other text, and hand-edit it
- A human can hand a hand-written `.krs` to an AI and ask for improvements or extensions
- Generated and hand-written content live in **the same file**, with no distinction based on who wrote which part
- Humans and AI can **take turns contributing** to the same model

This is fundamentally different from an approach that keeps an "AI input interface" and a "human editing screen" as separate things. In karasu, **the single source of truth — `.krs` text — is co-edited by humans and AI in the same language**.

### The Chat panel is a natural consequence, not a convenience feature

karasu's Chat panel is not a bolt-on AI feature on top of an architecture modeling tool;
it exists as **the natural consequence derived from the bidirectionality above**.
If the DSL is a language both humans and AI can read, an interactive interface for growing `.krs` a piece at a time falls out on its own.

This positioning contains an unverified hypothesis about karasu's Chat feature:
**that even developers who do not know karasu's syntax should be able to draw an architecture just by having a conversation with Chat.**
Validation of this hypothesis with external users is planned in Issue #638, and the result may materially reshape how karasu presents itself to new users.

### A shift in how karasu is talked about

Adopting this framing elevates how karasu is presented to the outside world.

- **Before**: "A text-based architecture modeling tool with three-dimensional structure (logical / physical / organizational), drill-down, and multi-file composition"
- **After**: "A DSL for humans and AI to discuss architecture in the same language — made possible because the language itself was designed with exactly the right abstraction level for describing architecture"

The latter does not present AI as an add-on feature; it puts the claim that **AI collaboration falls out of the DSL design itself** front and center.
The AI story is not one item on karasu's feature list; it is a consequence of the core design decision.
