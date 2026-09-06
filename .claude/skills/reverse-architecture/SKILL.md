---
name: reverse-architecture
description: >
  Reverse-engineer an arbitrary repository into a karasu architecture model
  (.krs) at uniform domain depth, using per-domain subagent fan-out plus the
  karasu CLI as a deterministic spine. Trigger when the user says:
  "アーキテクチャをリバース", "リポジトリを karasu 化", "このリポジトリを .krs に",
  "システム構造を .krs で起こして", "reverse architecture", "reverse-engineer
  this repo into karasu", "turn this repo into a karasu model", or similar
  phrases asking to reconstruct a system's architecture as .krs.
---

# Reverse Architecture Skill

Reverse-engineer an arbitrary repository into a karasu model (`.krs`) at
**uniform domain depth**. A single agent can recover the top level (system /
container / physical shape) but the domain interior (usecases / entities /
resources) thins out. This skill uses **per-domain subagent fan-out** to give
each domain its own attention budget, and the **karasu CLI as a deterministic
spine** (physical extraction, slicing, measurement, validation, rendering).

Design rationale: ADR-1895 (`docs/adr/1895-reverse-architecture-harness.md`).

## Prerequisites

- The target repository path, and the karasu CLI (`karasu`) available.
- **The grammar travels with this skill.** `reference/` beside this file holds
  byte-identical copies of the docs a reverse run reads, because the run happens
  in someone else's repository where karasu's `docs/` tree does not exist:

  | `reference/…` | What it answers |
  | --- | --- |
  | `syntax.md` | the `.krs` grammar — every construct instructed below |
  | `notation-cookbook.md` | worked idioms, so an agent picks karasu-idiomatic shapes instead of inventing them |
  | `tags-annotations.md` | the boundary / annotation / tag / facet register split, and `@draft` |
  | `diagnostics.md` | what the codes in the Phase 4 table mean |

  Read those, and hand them to fan-out subagents — a subagent inherits none of
  this file's context, so a deep-dive told to write `facets` without the register
  split reaches for a tag instead. **Any other `docs/…` path named below is a
  citation, not an input**: it resolves in the karasu repository and records why
  a rule exists, and nothing here needs it to run.
- Converge output onto a single `.krs` project (`index.krs` recommended). The
  **`.krs` file is the single source of truth** — agents always re-read the
  `.krs`, never the chat history, for state.
- **Never invent the physical layer**: if compose / k8s / openapi / db files
  exist, extract them deterministically with `karasu translate` and let the
  agents *annotate*, not fabricate.

## Separation of concerns (important)

| Layer | What it handles | Who | How |
| --- | --- | --- | --- |
| Semantic | read source and **write** a domain's usecases / entities / resources | subagent (judgement) | source reading |
| Structural | **slice / measure / render / validate** the produced `.krs` | CLI (deterministic) | `translate` / `subtree` / `coverage` / `render` |

`subtree` / `coverage` statically analyze the **produced `.krs` model**, not the
source — that is why they are deterministic.

`render` doubles as the `.krs` validator: it exits non-zero on any
error-severity diagnostic. **Never validate a `.krs` with `lint-style`** — that
command parses its input as `.krs.style`, so a perfectly valid `.krs` yields a
page of bogus "Expected LeftBrace" errors. This skill produces no `.krs.style`
files, so `lint-style` has no role here.

**The CLI does not catch everything.** Three losses in this pipeline are
completely silent — no error, no warning, and `coverage` unaffected. They are
listed under "Silent losses" below and each has a prescribed mechanical check.
Budget for writing one small script; a run without it will ship a model that
renders clean and is quietly missing relations.

## Procedure (4-phase pipeline)

### Phase 1: Scout (one pass)

1. Map the repo's top level (language, build setup, entry points, directory tree).
2. Extract the physical spine deterministically:
   - `docker-compose*.yml` → `karasu translate --from compose <file>`
   - a k8s manifest → `karasu translate --from k8s <file>`
   - OpenAPI → `karasu translate --from openapi <file>` (usecases under a service)
   - DB schema → `karasu translate --from db <file>` (database / table blocks)
   - `wrangler.toml` (Cloudflare Workers) → `karasu translate --from wrangler <file>`.
     This adapter is richer than it looks: it derives the `system` / `service`
     from the worker name, maps every known binding (D1 → `database`, R2 →
     `storage`, Queues → `queue`, KV → `database`, Vectorize → `database
     [index]`, Workers AI / Durable Objects / service bindings → `service
     [external]` plus edges), **and** emits the physical `deploy` / `function`
     layer (`runtime`, `type "Cloudflare D1"`, `realizes`). Unknown binding
     kinds are warned and skipped rather than hallucinated. Hand-modeling this
     loses the entire physical `realizes` layer — always run the adapter.
   - **Another serverless manifest with no adapter** (`serverless.yml`, `*.tf`)?
     Only here do you read the manifest yourself and model each backing binding
     as an infra block: a SQL store → `database`, a KV / cache / vector index →
     `database`, an object store (S3 / GCS) → `storage`, a message queue →
     `queue`.

   **If an adapter's input cannot be produced, say so and record it.** A repo may
   generate its OpenAPI spec or DDL from code rather than committing it. If the
   toolchain to run that generator is missing (no `uv`, no `bundle`, no
   `node_modules`), fall back to source extraction — but write the fallback into
   the deliverable notes, because the OpenAPI adapter would have given the
   *usecase* layer a deterministic spine and the fallback does not.

3. **Extract the store contents, and distrust your first grep.** The tables /
   queues / buckets you declare here are the vocabulary every fan-out agent is
   allowed to reference, so a leaf you miss is a leaf no agent can record.

   - **Look for an authoritative list before grepping.** A worker's own
     consumption list beats scanning for producers: `DEFAULT_QUEUES` in a Docker
     entrypoint, a `Procfile`, systemd units, k8s container `args`, a
     `celery.conf` / queue-router config. One read of that file usually closes
     the whole set. In a real run this was found only after three rounds of
     grepping had already grown the queue list from 16 leaves to 24 — the
     authoritative file would have given all of them on day one, and revealed
     that the set *differs by deployment edition*.
   - **A grep for a literal will under-count.** Expect three misses: queues
     declared in directories you did not scan (scan the scheduler package, not
     only the task package), queues named by a **symbolic constant**
     (`queue=TRIGGER_QUEUE`), and queues chosen **at dispatch time** by tenant
     tier or feature flag, which carry no literal at all.
   - Storage buckets: grep for key-prefix literals (`"foo/"`, `f"foo/{id}"`),
     not for the storage API calls.
   - **Assume the set is still incomplete after Phase 1.** The fan-out will find
     more, because an agent reading one domain's source deeply sees what a
     repo-wide grep cannot. Treat every leaf an agent reports as a finding to
     verify in source and add — that feedback loop is designed in, not a failure.

4. **Enumerate the logical domains (primary axis).** Use the physical output
   (containers / services) and the directory / module tree as *seam hints* to
   infer bounded contexts.

   **Split at bounded-context granularity, not aggregate granularity.** This is
   the single highest-leverage instruction in this skill — spike #1991 measured
   it moving a repo from `domain-F1 0.40` to a **1.000 exact match** with the
   human decomposition, and it is *cheaper* (fewer, coarser domains → fewer
   fan-out agents: 5 vs 9 agents, 318k vs 489k output tokens on the same repo).
   Concretely:

   - **Fold aggregates up into their owning context.** `Loan`, `Hold`, and
     `Checkout` are aggregates of one `Lending` context — emit `Lending`, not
     three domains.
   - **Split only at a real seam**: a schema seam (disjoint table clusters), a
     coupling seam (modules that barely reference each other), or a *language*
     seam (the same word means different things on either side).
   - Directory structure and file count are **hints, never seams**. Do not split
     a context just because its directory is large — the unguided harness's
     known failure mode is over-splitting, and a size cap makes it worse.

   When you cannot resolve a seam, **mark the node `@draft`** — the annotation
   built for exactly this. A generated model that cannot say which parts it
   guessed at invites the reader to trust all of it equally
   (`docs/adr/1990-karasu-nest-pivot-server-reverse.md` decision 4).

   ```krs
   system Payments {
     service Ledger {
       domain Posting {}
     }
     service Reconciliation @draft {
       label "Reconciliation"
       domain Settlement @draft {}
     }
   }
   ```

   Write it on the `domain` / `service` whose seam was the judgement call, never
   as a document-level note: the useful signal is *which* seam was uncertain,
   and a document-level score averages that away. The bare mark is complete, and
   what a human review deletes — that deletion is the ratchet, so keep it one
   token to remove. `@draft(confidence: "low" | "medium" | "high")` refines it,
   but **`karasu fmt` drops the parameter today** (#2571) and Phase 3 ends with
   `fmt`, so anything that must survive goes in `description`, not in the
   parameter.

   Over-splitting is recoverable by a human folding domains up; a wrong merge is
   not, so when genuinely torn, prefer the split and mark it. A finished model
   carrying **no** `@draft` anywhere is making a strong claim about itself and is
   worth doubting.

   **A `@draft` mark is a question, and Phase 2 is where it gets answered.**
   Do not leave it as a shrug. Every `@draft` domain's fan-out agent is given the
   seam question explicitly and must return a verdict with evidence both ways
   (Phase 2). In a real run this resolved 3 of 5 marked seams outright, each on
   evidence a scout pass could not have reached — one of them decided by the
   discovery that the product had *deliberately forked the vocabulary*, renaming
   the older feature so the two would stop colliding. The marks that survive are
   then genuinely the ones a human must arbitrate.

5. Assign canonical ids (**English PascalCase**; `label` follows the user's
   language). Subagents reuse these ids instead of inventing their own.

   **Ids share more namespaces than you would expect, and two of the collisions
   are silent.** Before finalizing, check that no id is used twice across:
   `domain` vs `entity` (warns `entity-anchor-collision`), `domain` vs an infra
   **leaf** (`table` / `queue-item` / `bucket` — **no diagnostic at all**; it
   surfaces only when `karasu subtree <id>` refuses to resolve an ambiguous id),
   and `service` vs `domain`. Rename the *infra leaf*, not the domain: the leaf's
   real name survives in its `label`.

6. **Declare the cross-cutting vocabulary once, here.** A deep-dive meets facts
   that are not structure at all — "this table holds personal data", "this
   usecase sits behind the auth guard", "this store is in PCI scope". Those name
   a set defined *outside* the architecture, which is what a `facet` declares:

   ```krs
   facet pii {
     label "Personal data"
     description "Holds or transits data identifying a natural person"
     link "https://example.com/privacy" "Privacy policy"
   }
   ```

   The ids belong in `skeleton.krs` for the same reason domain ids are assigned
   here: the *declaration* is model-wide but *membership* is written
   element-side (`facets pii` on the node), so five agents left to invent ids
   produce `auth` / `requires_auth` / `authenticated` and one set silently
   becomes three. Fan-out agents reference these ids and declare none (Phase 2).

   Keep the vocabulary small and externally grounded — a regulation, a policy,
   an audit scope. A `facet` says *which* elements a policy covers; what the
   policy *says* stays prose in `description` + `link`, permanently
   (`docs/adr/832-no-runtime-authz-modeling.md`). If a candidate describes what
   the element *is* rather than which set it belongs to, it is an archetype and
   the builtin tag vocabulary already covers it — the four-way register split is
   in `reference/tags-annotations.md` § Vocabulary registers.

   **Draft the `description` precisely, because agents apply it literally.**
   A facet described as "credentials **encrypted at rest**" will be withheld from
   a store holding raw tokens in a 30-minute Redis draft — which is the most
   secret-bearing element in that domain. If the set you mean is "must never be
   logged or exported", say that instead.

7. Output: `skeleton.krs` (system / service / domain scaffold + physical spine +
   `facet` declarations) and a **domain work-list**.

### Phase 2: Deep-dive fan-out (one subagent per domain)

For each domain in the work-list, **launch one subagent (Task tool)**. Each
subagent:

- reads **only the source slice for its domain** (not other domains — isolation
  is what buys uniform depth), plus `reference/syntax.md` and
  `reference/notation-cookbook.md` — pass those two paths in the subagent's
  prompt. Isolation cuts it off from this file as well as from the other
  domains, so an agent given no grammar writes what it remembers of one;
- writes that domain's `usecase` / `entity` / `resource` into a `.krs` fragment:
  - a `usecase` holds the `resource`s it touches (`resource InfraId.SubId
    { operations create, read }`). **`operations` verbs are comma-separated** —
    `operations read, delete`, never `operations read delete` (space-separated
    fails to parse; normalize it in synthesis if an agent slips).
  - **keep the source's own verb and decorate it with its CRUD intent** rather
    than flattening to bare CRUD: `operations list:read, search:read` keeps a
    collection query distinguishable from a get, `operations enqueue:create` is
    how a publish onto a queue item is recorded, and `replace:create,delete`
    is a genuine delete-insert. The right-hand side accepts only
    `create` / `read` / `update` / `delete` (anything else is the error
    `invalid-crud-decoration`), and a decorated verb never trips
    `unknown-resource-operation`. Bare verbs must come before decorated ones on
    one line — after a `verb:`, commas continue that verb's CRUD list until the
    next `<id>:`.
  - an `entity` carries identity **and its relations** (no attributes). Do not
    stop at identity-only — derive relations from the schema's foreign keys and
    write each inside the reference-holding entity, starting at that entity:
    `Message -> Chat "belongs to"` inside `entity Message { … }`.
  - **a relation leaving the domain must name its target `DomainId.EntityId`.**
    A bare id resolves intra-domain only: pointed at a foreign entity it does
    not ghost, it is **dropped from the entity view** with no diagnostic, so the
    relation you found disappears silently. Write
    `Order -> Customers.Customer "placed by"`. The target may be a domain no
    fragment has written yet (Phase 3 step 7 is what makes those ids agree).
  - resources **reference the physical declaration** (the logical side is a
    reference; the physical declaration is canonical);
  - **records a cross-cutting fact as `facets <id>`** on the element that has it
    — `facets pii` on the entity whose table holds personal data, on the store
    itself, on the usecase behind the auth guard. Use **only the ids the
    skeleton declares** (Phase 1 step 6); a set you found that none of them
    covers goes in your return value as a proposal, not into a `facet` block of
    your own — a `facet` written inside a node block is an error, and a
    fragment-local vocabulary is the id drift step 6 exists to prevent.
    `facets` is accepted on every node kind and membership is 1:N (`facets pii,
    pci`), so nothing is structurally excluded and multi-membership is normal.
- validates its own fragment with `karasu render <fragment> -o /dev/null` before
  returning (non-zero exit = the fragment is structurally broken; `-o /dev/null`
  discards the SVG so only diagnostics surface). A fragment that declares only
  `domain` / `usecase` blocks renders fine — unassigned-node *warnings* are
  expected at this stage and do not fail the gate, and so is
  `facet-not-declared`, because the declarations live in the skeleton this
  fragment has not been merged into yet. After the merge it is a real finding
  (Phase 3 step 5).

Domains are independent, so launch the subagents in parallel.

#### The return value is a deliverable — persist it

Each agent returns a structured report: cross-domain relations written, ones it
could not resolve, external-service dependencies, facet proposals, tableless
entities with justification, notation gaps, and — for a `@draft` domain — the
seam verdict. **Half the value of this skill is in those reports, and they are
the fragile half.**

**Instruct every agent to write its report to a file beside its fragment**
(`frag/<Domain>.report.md`) *and* return it. A return value exists only in the
orchestrator's context; a file survives. In a real run a usage limit killed all
19 agents mid-flight: every fragment that had been written survived on disk and
the model was unaffected, while **every report was lost**, including the seam
verdicts. Recovering three of them cost a second pass.

**Order the agent's work so the durable artifact lands first**: read, write the
fragment, write the report file, validate, return. Tell the agent explicitly to
write before it runs low on room rather than reading exhaustively first.

#### Budget and pacing — this phase is the cost centre

A full run over the *smallest* repo measured in spike #1991 (85 files, 3 domains)
cost ~318k output tokens and ~12 minutes; the same repo at aggregate granularity
cost ~489k and ~13 min. Cost scales with *domains × slice size*, so a large repo
(Dify: ~7.8k files, 19 domains) runs several times that — measure ~110-145k
output tokens per domain agent.

Two consequences: getting Phase 1 granularity right is a **cost** decision as
well as a quality one, and for a large repo you should confirm the domain count
with the user before launching the fan-out rather than discovering the bill
afterwards.

**Launch in batches of about five, not all at once.** A rate or usage limit that
lands mid-flight kills every agent then running. Batching bounds the loss to one
batch, and the batches that already finished keep their fragments *and* their
reports. Nineteen concurrent agents is how you lose nineteen reports at once.

#### Slice by content, not by path

Give each agent an explicit file list, and remember that a directory name is not
a domain boundary. In a real run a 533-line controller sitting under
`console/datasets/rag_pipeline/` was entirely a *different* domain's content, so
it fell outside both agents' slices and ~11 endpoints went unmodelled — caught
only because a neighbouring agent mentioned it in passing.

After the fan-out, **cross-check coverage against the controller surface**: list
the route-defining files in each slice and confirm the agent's usecases account
for them. A file whose path suggests domain A but whose imports are all domain B
is the pattern to look for.

#### Foreign tables — pick one rule and give it to every agent

A domain routinely reads and writes tables another domain's entity owns
(a retention job, an uninstall cascade, an audit aggregation). Decide once:

> Write `resource <Db>.<ForeignTable>` when your usecase really touches it, and
> **never** claim a `table` line for it — the owning entity lives elsewhere.

This produces `cross-domain-store-access` **info** diagnostics in the merged
model, which are boundary-crossing *facts*, not defects. Telling some agents to
record foreign reads and others to omit them — which is what happens if the rule
is left to each prompt — makes several domains understate their real data
footprint and makes the `coverage` numbers incomparable across domains.

### Phase 3: Synthesis (one pass)

1. Merge each fragment into the skeleton to form a single `.krs`.

   Write the merge as a **script**, not by hand: it will be re-run many times as
   Phase 4 repairs land. Do not assume a fragment's first line is its `domain`
   block — agents add provenance comments above it. Locate the `domain` line and
   its matching close, and keep the skeleton's header (it carries `@draft`) and
   its `label` / `description` (they carry the seam rationale), taking everything
   below from the fragment.

2. **Cross-domain edges** may be observed from both sides — dedup by the
   `(src-id, dst-id, kind)` composite key. Direction follows the referencing
   side (the FK holder).
3. Match identity by `id`, never by `label`.
4. Resolve resource-location conflicts structurally: the physical declaration
   lives in one place; every domain references it.
5. **Carry the skeleton's declarations through the merge — verbatim.**
   The merge reads as "combine the fragments", but the fragments only *reference*
   what the skeleton declares: the `database` / `storage` / `queue` **blocks**
   and the `facet` blocks live in the skeleton alone. Dropping them silently
   deletes every table no fragment happened to reference. Real run (spike
   #1991): the merged `index.krs` had no `database` block at all, and **9 of 35
   real tables vanished** from the model purely for lack of a referent.
   **Reached state**: `karasu render index.krs` prints no
   `unresolved-resource-ref` / `unresolved-table-ref` / `facet-not-declared`
   warning. The first two fire when a `resource Db.T` or `table Db.T` names an
   infra block or leaf nothing declares; the third when a `facets` reference
   names no `facet` block. A dropped declaration makes every reference to it
   dangle at once — so an empty run of that grep is the check that step 5
   happened. The infra message says whether the *block* or only the *leaf* is
   missing; a wall of "no database / queue / storage block declares" means you
   skipped this step.

   Any facet the fan-out **proposed** (Phase 2) is decided here, in one place:
   accept it by adding the declaration, or drop the memberships that reference
   it. Two `facet` blocks with one id is the error `duplicate-facet-id`, so a
   proposal that duplicates an existing set must be folded, not appended.

   **Do not declare a facet you cannot populate.** Proposals arrive *after* the
   fan-out wrote its memberships, so accepting one means either re-tagging every
   element by hand or shipping a declaration with partial membership — and an
   under-inclusive facet misleads worse than an absent one. Default to recording
   the proposal in the deliverable notes as promotion-gate evidence. Accept it
   only when the proposing agents named the concrete elements, so the initial
   membership is a fact rather than a guess. Note which proposals were
   **convergent** — several domains independently proposing the same set, under
   different names, is the strongest evidence a run produces (a real run had one
   set proposed by four domains as `enterprise_only` / `edition_gated` /
   `deployment_gated`).

6. **Verify entity↔table mappings survived the fan-out.** For every table a
   domain touches via `resource <Db>.<Table>`, the owning entity must carry the
   matching `table <Db>.<Table>` line. Deep-dive agents routinely write the
   entity and omit the mapping — the pathological output is an empty
   `entity Goal {}`.

   **Reached state**: `karasu coverage index.krs --format json` reports
   `physical.infra[].unmappedButReferenced` empty **for the `database` block that
   holds the system of record**. Read the three fields it gives you as three
   different repairs:

   | Field | What it means | Repair |
   | --- | --- | --- |
   | `unmappedButReferenced` | a usecase touches the leaf, no entity maps it | the entity exists — add its `table` line. Mechanical |
   | `unreferenced` | nothing maps *or* touches the leaf | that slice was never dug — re-dive the owning domain (Phase 4) |
   | `tablelessEntities` | the entity carries no mapping at all | judgement: a read-model projection / KV-backed aggregate / computed view is legitimately tableless. Record which, do not invent a table |

   **An entity may declare only ONE physical mapping**, so this metric cannot be
   driven to zero for every block, and chasing it will make you pad. Three cases
   are structurally unreachable and should be recorded rather than repaired:

   - An entity that is **both a DB row and an object in a store** (`UploadFile` ↔
     `upload_files` **and** `FileStore.UploadFiles`) can declare only one; the
     other leaf stays `unmappedButReferenced` forever.
   - **Generic infra leaves** (a cache, a lock namespace, a broker) have no
     owning entity by design.
   - **Every queue leaf**: a queue's content is a message *type*, and the fan-out
     will not have modelled message entities unless the source has such an
     aggregate. Inventing them to clear the metric is padding.

   Do make the mappings that *are* mechanical: an entity that is precisely the
   stored object — a spool file, a key blob, a request snapshot — should carry
   `table <Storage>.<Bucket>`. `table` accepts any infra sub-resource, not only a
   `database` leaf.

   Steps 5 and 6 are mechanical and deterministic, which is why they are
   measured by the CLI rather than asserted by an agent (the structural side of
   the split — ADR-1895). **A tableless entity is never a diagnostic**; only a
   reference to something undeclared is.

7. **Cross-domain entity relations — one roster pass, then a mechanical check.**
   A per-domain subagent only knows its own entity ids, so cross-domain foreign
   keys risk id mismatch. After merging, run **one** relations agent over the
   *full entity roster* (every entity id + its domain) plus the schema; it emits
   FK-derived relations (`{from, to, label}`, both ids in the roster) that you
   inject into each reference-holding entity block. Seeing all ids at once is
   what makes cross-domain relations resolve consistently. **Qualify every target
   that leaves the domain as `DomainId.EntityId` while injecting.**

   Then run the relation checker (below). The roster pass reduces mismatches; it
   does not prove there are none.

8. **Organizational overlay — model ownership as its own axis, bind with
   `owns`.** If the repo carries ownership signals (`CODEOWNERS`, `OWNERS`),
   model them on karasu's **organizational axis**, which is independent of the
   logical and physical models and renders as a separate Org view. The shape is
   a named `organization <Id>` holding named `team <Id>` blocks (**both need an
   id — a bare `organization {` / `team {` is a parse error**), each `team`
   carrying `member`s and `owns`:

   ```
   organization <Id> {
     team <TeamId> { owns <DomainOrServiceId> }
   }
   ```

   - one `team` per owner (a GitHub team, or a set of individuals as `member`s);
     an individual owner with no team → a single-member team. Nest teams to
     mirror the org hierarchy;
   - resolve each owner's covered paths to the logical node they map to (the
     `domain` / `service` whose source slice those paths fall in) and declare
     `owns <NodeId>` **inside the team** — `owns` binds organization → logical
     (or physical), symmetric to how `realizes` binds physical → logical;
   - **an owner whose paths are all UI is not an owner of a backend domain.**
     Bind front-end owners to the front-end `service` / `client` and list them as
     `member`s. Mapping a UI-area owner onto the backend bounded context their
     screens happen to call is Conway's team structure leaking into the logical
     model — the exact failure ADR-2077 measured;
   - **an owner whose paths are two files is a `member`, not a team with `owns`.**
     Giving them a domain overstates what CODEOWNERS says. Put the specialization
     in their `member` `description`;
   - build this **after** the logical decomposition, so the `owns` targets
     already exist. **Never let ownership decide where domains split** (Phase 1) —
     that is Conway's team structure, not the product's ubiquitous language (see
     Notes / ADR-2077). A node is `owns`-ed by at most one team; if two owners
     cover it, declare both and let the `duplicate-owner-assignment` **info**
     diagnostic surface the overlap (the first team is kept as primary owner;
     render still exits 0) rather than forcing a domain merge.

9. **Observed grouping — put it on the `boundary` axis, never back into the
   seams.** Phase 1 uses the directory / package / deployment structure as a
   *hint* and then throws it away, because it is not a bounded-context seam.
   It is still real information about the repo, and `boundary` is where it lives
   without touching the decomposition: a named cluster of nodes, drawn as a
   second *Group by* axis beside team ownership.

   ```krs
   boundary legacy {
     label "Legacy monolith"
     contains Billing
     contains Wallet
   }

   system Shop {
     service Billing {}
     service Wallet {}
     service Checkout {}    // not contained — drawn outside the frame
   }
   ```

   - **Use both placements.** The top-level form above groups nodes *by
     reference* across the whole model. A **scoped** `boundary` inside a node
     block groups that node's **direct children** by bare id and frames only that
     node's canvas. `system` / `service` / `domain` / `usecase` **and the infra
     blocks** each host one; `entity` / `resource` / `user` / `client` and infra
     leaves draw no canvas, so a `boundary` there is the error
     `boundary-not-in-context`.
   - **A large infra block needs a scoped `boundary` — it has no other grouping
     axis.** `owns` rejects an infra *leaf* (`invalid-owns`), and the domain
     ownership derived from `entity … table` mappings does not frame the store's
     own drill-down view. A `database` with 137 `table` leaves therefore renders
     as one flat wall with no bands at all unless you scope a `boundary` into it.
     Reach for this whenever a store, queue or bucket set is large enough that a
     reader would scan rather than read. Good evidence to group by:
     - the **module that declares** each table (`api/models/*.py`) — and it is
       worth drawing precisely when it *cuts across* the domain decomposition,
       because "this one module declares 31 tables spanning six domains" is
       actionable;
     - for queues, **which worker actually consumes each one** (from the
       authoritative list in Phase 1 step 3), including the group that appears in
       *no* default worker set and therefore needs an explicit override.
   - **Declare one only for a grouping you can point at evidence for** — the
     monorepo package a set of domains ships from, a deployment tier they share,
     the old/new split of a migration in flight. A cluster with no source behind
     it is noise on a third axis, and it reads to the human as a claim.
   - **The `description` is prose the tool cannot check.** In a real run a
     boundary justified itself by "the only domains reaching the vector store",
     and a later pass disproved it — the frame was right, the stated reason was
     wrong, and nothing in the toolchain could tell. Prefer a description that
     states what the cluster *is* over one that asserts an exclusivity you have
     not verified.
   - **Overlap is a fact, not a repair.** Membership is 1:N — a node in two
     boundaries reports the info diagnostic `duplicate-boundary-assignment`, and
     every membership is kept. Do not merge two clusters to silence it.
   - `contains` names ids, so it inherits the Phase 1 canonical ids; a target
     that does not exist stays inert and warns `contains-target-not-found`.
     If you generate the memberships, **assert that every leaf lands in exactly
     one group** so the grouping cannot silently drift from the leaf list.

10. **Normalize with `karasu fmt`.** Merged / injected `.krs` almost always has
    uneven indentation (a closing `}` can land under-indented and *look* like a
    missing brace even though it parses). Always finish synthesis — and any
    mechanical node injection — with `karasu fmt <file>`.

### Phase 4: Validate & repair loop

1. Run `karasu coverage index.krs --format json` to **detect thin domains
   quantitatively** (`thin: true`) and read the `physical` section for what the
   merge lost (Phase 3 step 6). The two halves answer different questions —
   `domains[].thin` asks whether a *logical* slice was dug deeply enough,
   `physical` asks whether the *declared* physical layer is represented. A model
   can pass one and fail the other.
2. Run `karasu render index.krs` to confirm the model **draws** (failure = a
   structural break) and to catch what the overlays lost. The exit code covers
   only half of it, so **grep the output as well as reading the exit code**:

   | Diagnostic | Severity | What it means here |
   | --- | --- | --- |
   | `unresolved-resource-ref` / `unresolved-table-ref` | warning, exit 0 | an infra block or leaf the merge dropped (Phase 3 step 5) |
   | `facet-not-declared` | warning, exit 0 | a `facets` id no `facet` block declares — a fan-out proposal that never got decided (Phase 3 step 5) |
   | `contains-target-not-found` | warning, exit 0 | a `boundary` member id that does not exist; the membership is inert (Phase 3 step 9) |
   | `edge-source-mismatch` | error, non-zero | a relation inside `entity X` that does not start at `X` — the usual cause is a rename that missed one of its three sites |
   | `duplicate-facet-id`, `duplicate-boundary-id`, `boundary-not-in-context` | error, non-zero | the overlay is structurally wrong, not merely dangling |
   | `entity-anchor-collision` | warning, exit 0 | an entity id equal to its domain id, or duplicated across domains |
   | `duplicate-boundary-assignment`, `duplicate-owner-assignment`, `cross-domain-store-access` | info | overlapping membership / a boundary crossing — facts, not repairs |
   | `Circular dependency detected` | warning, exit 0 | may be a real fact (two services that genuinely call each other). Verify in source before "fixing" it |

   The warnings are the ones that need the grep: each names a reference to
   something nothing declares, which is precisely what a merge drops silently.

3. **Run the relation checker — no CLI command covers this.** See "Silent
   losses" below. Write it once and re-run it after every merge.
4. For each thin domain, re-dive it:
   - `karasu subtree <DomainId> index.krs` extracts the current slice to hand to
     a subagent for a deeper pass;
   - merge the additions and re-run `coverage`.
5. **Stop condition**: every domain is `thin: false` **or recorded as genuinely
   thin with the reason**, the system-of-record `database` reports an empty
   `unmappedButReferenced`, the relation checker is clean, and the warning greps
   of step 2 come back empty. `coverage` scores the logical and physical layers
   only — no metric measures the `facet` / `boundary` / `organization` overlays,
   so those are held by the render greps alone.
6. **Distinguish structural thinness from under-modelling before re-diving.**
   `coverage` counts *distinct* resource leaves, so a domain that owns exactly
   one table scores near zero no matter how well it is modelled — fifteen
   usecases all referencing the same leaf count as one. Check the fragment before
   spending an agent: if every `resource` line points at the same leaf and the
   slice touches no cache, queue, storage or index, the thinness is real. Record
   *why*, and note whether the domain would score normally if a notation gap were
   closed (state persisted inside another domain's JSON column, an outbound call
   whose address is a row, a boot-time scan of the code image — all unwritable
   today, all reasons a well-modelled domain measures as thin).
7. **Re-measure after any enrichment.** `coverage` scores are *relative* across
   domains, so enriching one dimension (e.g. adding entity relations) raises the
   normalization baseline and can newly flag a domain that has none of that
   dimension. A domain that turns thin only after enrichment is usually genuinely
   thin — do not pad it; record why.
8. **A cheap recovery pass beats a full re-dive.** When what is missing is the
   *report* rather than the model — a lost return value, an unexamined `@draft` —
   give the agent the existing fragment (or `karasu subtree` output) plus a
   narrow source slice and ask only for the analysis. It costs roughly half a
   full dive, and it is also the right shape for answering one specific question
   (a seam verdict, a tableless-entity justification) about a domain that is
   otherwise finished.

   Give that agent the **list of findings already reported**, so it returns what
   is new instead of re-deriving the catalogue. Verify the file exists before you
   launch — a shell `&&` chain that dies before its heredoc will leave you with a
   confident `echo` and no file.

9. Record any un-modelable idioms (notation gaps). Both original collectors are
   closed: shipped idioms belong in the cookbook (`reference/notation-cookbook.md`,
   whose source is `docs/guide/notation-cookbook.md`),
   and a genuinely missing construct is judged by the promotion gate,
   `docs/adr/1820-notation-promotion-gate.md`. That gate wants **real-usage
   evidence**, which is what a run of this skill produces for the experimental
   `boundary` and `facet` — so report how they were used, not only where they
   fell short.

   These recur across agents and repos; expect them rather than rediscovering
   them, and report only what is new or a sharper instance:

   - **Polymorphic foreign keys — the single most-reported gap** (9 of 19 domains
     in one run). One column, several possible targets, discriminated by a
     `type` / `kind` sibling column. Agents either write one edge and lose the
     alternatives, or write several and overstate them. There is no notation for
     a discriminated relation.
   - **Redis (or any KV) as a system of record, flattened to one leaf.** Token
     state machines, work queues built on lists, pub/sub channels, stream logs
     and lock namespaces all collapse into one `database` leaf, so state that
     *is* the record of truth reads as incidental caching.
   - **String-keyed soft references.** A name or id string with no FK is
     indistinguishable from a real reference once written as a relation.
   - **"State lives in an external service"** has no counterpart to `table`. A
     domain that is mostly a client of a daemon or SaaS has no way to say so
     except prose, and `coverage` then cannot distinguish it from a thin domain.
   - **domain-event publication from a usecase** (outbox / publish) — recordable
     as far as the data goes: declare the event as a `queue` leaf and reference
     it from the usecase, `resource OrderEvents.OrderPlaced { operations
     enqueue:create }` (`dequeue:delete` on the consuming side). What is still
     missing is publish/subscribe as an **edge** semantic — the pairing is
     inferred from the shared leaf, never stated, and "usecase A enqueues usecase
     B" cannot be written, so a multi-hop async chain renders as a single hop.
   - **async background-job / scheduled pipelines** (Celery, `@Scheduled` outbox
     drains, queue consumers) — the *physical* side lands cleanly on `job` with
     `schedule` (omit `schedule` and it is a one-shot job); the *logical* side
     still maps only loosely onto the single `queue` kind, and nothing
     distinguishes a usecase a human invokes from one a timer invokes — including
     the case where the schedule is **tenant-authored data**, not configuration.
   - **`entity` id colliding with its `domain` id** → `entity-anchor-collision`
     (deep-link `#krs-entity-X`), which forces a rename.
   - **value objects / identity types / state machines** — no structural home
     (an `entity` carries no attributes), so they survive only as prose. At scale
     this changes what the model is *for*: a streaming API's ~30 event types are
     its real public contract and are entirely absent.
   - **Endpoint authentication class.** Unauthenticated, signed-URL,
     session-authenticated, capability-URL and internal-token routes are
     indistinguishable, even when one usecase is reachable through four of them
     at once.
   - **State persisted as a JSON sub-document inside another domain's column.**
     `table` binds an entity to a table it *owns*, so genuinely-persisted
     configuration reads as a code-only concept and `coverage` penalises the
     domain for storage it demonstrably has.
   - **An outbound call whose address is a row.** The convention of not writing
     resources for external HTTP APIs is right for fixed services, but a
     tenant-registered endpoint's address *is* data — and the usecase then
     carries no resource line at all.

   Two entries earlier revisions listed are **closed**, so do not re-report them:
   list-vs-single reads are now the verb decoration `operations list:read,
   search:read` (Phase 2), and a policy's *scope* is now a `facet` — only the
   policy's *content* stays prose, and that one is closed by decision, not by a
   gap (ADR-832).

## Silent losses — write the checker

Three losses produce **no diagnostic of any kind**. `render` exits 0, `coverage`
is unaffected, and the model looks finished. Two of them cost real relations in a
measured run.

1. **A bare cross-domain relation target.** `Order -> Customer` where `Customer`
   lives in another domain resolves to nothing and is dropped from the entity
   view. Documented (TPL-1936), still silent.
2. **A qualified target naming an entity that does not exist.** `Order ->
   Customers.Custmer`, or a correct-looking `-> Plugin.Plugin` where the deep-dive
   actually named the entity `PluginDeclaration`. Also dropped, also silent.
3. **An infra leaf id equal to a domain id.** No diagnostic; it surfaces only
   when `karasu subtree <that id>` refuses to resolve an ambiguous id.

Write a small script that parses the merged `.krs` for `domain` / `entity`
declarations and every `A -> B` / `A --> B` inside an entity block, then reports:

- a qualified target `D.E` where `D` is not a declared domain, or `E` is not one
  of `D`'s entities (offer the near-matches — the usual cause is one agent
  guessing another domain's entity id);
- a bare target inside `entity X` that is not an entity of `X`'s own domain.

Two authoring notes for that script, both learned the hard way:

- **The arrow regex is `--?>`, not `-->?`.** The latter means "two dashes, then
  an optional `>`" and silently matches nothing in a file full of `->`. This bug
  will make your checker report a clean run on a broken model.
- **A rename has three sites**: the `entity X {` declaration, every relation
  **source** `X -> …` inside it, and every bare intra-domain **target** `… -> X`
  elsewhere in the same domain, plus every qualified `Domain.X` model-wide.
  Missing the target site is the one that stays silent — missing the source site
  at least raises `edge-source-mismatch`. In one run a synthesis rename broke ten
  relations this way and only the checker found them.

## Deliverables

- `index.krs` (plus e.g. `deploy.krs` if needed). The **`.krs` is the source of truth**.
- A coverage report (a quantitative record of how deeply each domain was recovered).
- The list of seams left `@draft`, **and the seams that started `@draft` and were
  resolved**, with the evidence — the resolutions are what a reviewer most needs
  and they are invisible in the `.krs` once the mark is gone.
- Notes on any notation gaps encountered, and on how the experimental `boundary`
  / `facet` constructs were used (evidence for the promotion gate, ADR-1820):
  which facets were declared and how many memberships each carries, which were
  proposed and declined and why, which proposals were **convergent**, and which
  `boundary` placements were used — a run that used only the top-level form has
  produced no evidence at all about the scoped one.
- A record of what the run could **not** establish: reports lost, slices never
  cross-checked, relations an agent declined to write for lack of a target id.

## Notes

- **Never fabricate the physical layer.** Reach for `translate` first — including
  `--from wrangler`, which exists — and hand-model bindings only for a manifest
  with no adapter. If you are about to write an infra block by hand, first check
  that no adapter covers it.
- **Split at bounded-context granularity, not aggregate granularity** — the
  highest-leverage instruction here, and the one the unguided harness gets wrong.
- **Do not decide domain seams from ownership or change-history signals**
  (CODEOWNERS, commit-coupling, package ownership). Spike #1991 measured this as
  a quality lever and it did not pay: inert on small repos (identical
  decomposition down to 3 decimals), and on a large repo (Dify) it made the
  result *worse* vs the domain gold (V-measure 0.83 → 0.70) by pulling seams
  toward per-owner vertical slices — that is Conway's *team* structure, not the
  product's ubiquitous language. Domain decomposition ≠ team decomposition
  (ADR-2077). **This forbids using ownership to *split domains*, not modelling
  ownership at all**: ownership is a first-class axis of its own — capture it as
  `organization` / `team` / `owns` (Phase 3 step 8) and bind it to the finished
  logical layer, never fold it into the seams.
- **Three overlays, three axes, none of them a seam.** Everything the repo says
  that is *not* the logical decomposition has its own construct, and each is
  bound to the finished logical layer rather than allowed to shape it:
  ownership → `organization` / `team` / `owns` (Phase 3 step 8), observed
  grouping → `boundary` / `contains` (Phase 3 step 9), set membership →
  `facet` / `facets` (Phase 1 step 6, Phase 2). The single test for all three:
  **the domain seams must be unchanged by adding one.** If a candidate overlay
  would move a seam, it is telling you something about Phase 1 — go re-argue the
  seam there, on ubiquitous-language evidence, and leave the overlay out.
- **Match identity by `id`**, not `label`. **Never silently drop thin domains**
  (surface them via `coverage`). **Invent no vocabulary of your own**: v1 is
  frozen, and `boundary` / `facet` are shipped-but-experimental (backward
  compatibility is not yet promised, ADR-1820) — use them as spec'd, and route
  anything they do not cover to the gap notes rather than to a new keyword or a
  non-builtin tag. `facet` is the *only* user extension point in the vocabulary;
  tags and annotations are tool-owned.
- Tell each subagent explicitly to read **only its domain's source slice** —
  letting it read the whole repo destroys the uniform depth — and to read
  `reference/syntax.md` for the grammar, which is the one thing isolation must
  not withhold. Telling it the entity ids other fragments already use is *not* a
  violation either, and it saves the roster pass work.
- **Always `karasu fmt` after any machine generation or injection**, and
  keep `operations` verbs **comma-separated** — these are the two mechanical
  slips that real runs hit most.
- **Authoring gotchas that cost a build in a real run**: an unescaped `"` ends
  the string — write `\"` (one of exactly three escapes, with `\\` and `\n`;
  any other `\<char>` yields the bare character), and a `deploy` block accepts
  `label` but **not** `description`. Reach for a triple-quoted `"""…"""` raw
  string when a value carries Markdown; there is no need to restructure a
  sentence around a quotation mark.
- **A cross-domain entity relation must be written `DomainId.EntityId`.** A bare
  id is intra-domain only and is dropped from the entity view with no
  diagnostic — see "Silent losses", which also covers the qualified-but-wrong
  case that the roster pass alone will not catch.
- The merge is where *physical* fidelity is lost: infra declaration blocks and
  `table` mappings do not survive on their own (Phase 3 steps 5-6). Both losses
  are now measurable rather than eyeballed — `render` warns on a reference to
  something undeclared, `coverage` counts what the declared physical layer got
  represented by. Neither is optional; a merged model that renders clean can
  still be missing a third of its tables.
- **The fan-out is not only a modelling device — it is a physical-layer audit.**
  Expect it to find leaves the Phase 1 extraction missed, controllers that sit in
  the wrong directory, and seams the scout could not resolve. Treat those
  findings as first-class output: verify each in source, fold it back into the
  skeleton, and re-run. A run in which no agent contradicted Phase 1 probably
  means the agents were not reading deeply enough.
- **This skill hardcodes CLI command names, and the CLI moves.** Two instances of
  skill-vs-CLI drift have already shipped (`lint-style` #2084, `--from wrangler`
  #2090) and neither was visible to CI. Before trusting any command written here,
  confirm it against `karasu <cmd> --help`.
