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
3. **Enumerate the logical domains (primary axis).** Use the physical output
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
4. Assign canonical ids (**English PascalCase**; `label` follows the user's
   language). Subagents reuse these ids instead of inventing their own.
5. **Declare the cross-cutting vocabulary once, here.** A deep-dive meets facts
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
   in `docs/spec/tags-annotations.md` § Vocabulary registers.
6. Output: `skeleton.krs` (system / service / domain scaffold + physical spine +
   `facet` declarations) and a **domain work-list**.

### Phase 2: Deep-dive fan-out (one subagent per domain)

For each domain in the work-list, **launch one subagent (Task tool)**. Each
subagent:

- reads **only the source slice for its domain** (not other domains — isolation
  is what buys uniform depth);
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
    skeleton declares** (Phase 1 step 5); a set you found that none of them
    covers goes in your return value as a proposal, not into a `facet` block of
    your own — a `facet` written inside a node block is an error, and a
    fragment-local vocabulary is the id drift step 5 exists to prevent.
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

**This phase is the cost centre — budget before you fan out.** A full run over
the *smallest* repo measured in spike #1991 (85 files, 3 domains) cost ~318k
output tokens and ~12 minutes; the same repo at aggregate granularity cost ~489k
and ~13 min. Cost scales with *domains × slice size*, so a large repo (Dify:
~7.8k files, 19 domains) runs several times that. Two consequences: getting
Phase 1 granularity right is a **cost** decision as well as a quality one, and
for a large repo you should confirm the domain count with the user before
launching the fan-out rather than discovering the bill afterwards.

### Phase 3: Synthesis (one pass)

1. Merge each fragment into the skeleton to form a single `.krs`.
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
6. **Verify entity↔table mappings survived the fan-out.** For every table a
   domain touches via `resource <Db>.<Table>`, the owning entity must carry the
   matching `table <Db>.<Table>` line. Deep-dive agents routinely write the
   entity and omit the mapping — the pathological output is an empty
   `entity Goal {}`.

   **Reached state**: `karasu coverage index.krs --format json` reports
   `physical.infra[].unmappedButReferenced` empty for every block. Read the
   three fields it gives you as three different repairs:

   | Field | What it means | Repair |
   | --- | --- | --- |
   | `unmappedButReferenced` | a usecase touches the leaf, no entity maps it | the entity exists — add its `table` line. Mechanical |
   | `unreferenced` | nothing maps *or* touches the leaf | that slice was never dug — re-dive the owning domain (Phase 4) |
   | `tablelessEntities` | the entity carries no mapping at all | judgement: a read-model projection / KV-backed aggregate / computed view is legitimately tableless. Record which, do not invent a table |

   Steps 5 and 6 are mechanical and deterministic, which is why they are
   measured by the CLI rather than asserted by an agent (the structural side of
   the split — ADR-1895). **A tableless entity is never a diagnostic**; only a
   reference to something undeclared is.
7. **Cross-domain entity relations — one roster pass.** A per-domain subagent
   only knows its own entity ids, so cross-domain foreign keys risk id mismatch.
   After merging, run **one** relations agent over the *full entity roster*
   (every entity id + its domain) plus the schema; it emits FK-derived relations
   (`{from, to, label}`, both ids in the roster) that you inject into each
   reference-holding entity block. Seeing all ids at once is what makes
   cross-domain relations resolve consistently. **Qualify every target that
   leaves the domain as `DomainId.EntityId` while injecting** — the roster
   carries each entity's domain precisely so this step can, and a bare
   cross-domain id is dropped from the entity view without a diagnostic, which
   is why the loss is invisible unless it is prevented here.
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
   without touching the decomposition: a named cluster of system-view nodes,
   drawn as a second *Group by* axis beside team ownership.

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

   - **Declare one only for a grouping you can point at evidence for** — the
     monorepo package a set of domains ships from, a deployment tier they share,
     the old/new split of a migration in flight. A cluster with no source behind
     it is noise on a third axis, and it reads to the human as a claim.
   - **Scope it to one canvas when it is that layer's own concern.** A
     `boundary` inside a node block groups that node's **direct children** by
     bare id and frames only its canvas. `system` / `service` / `domain` /
     `usecase` and the infra blocks each host one; `entity` / `resource` /
     `user` / `client` and infra leaves draw no canvas, so a `boundary` there is
     the error `boundary-not-in-context`. Two blocks with one id in the same
     scope is the error `duplicate-boundary-id`; the same id in *another* scope
     is a different boundary, deliberately.
   - **Overlap is a fact, not a repair.** Membership is 1:N — a node in two
     boundaries reports the info diagnostic `duplicate-boundary-assignment`, and
     every membership is kept. Do not merge two clusters to silence it.
   - `contains` names ids, so it inherits the Phase 1 canonical ids; a target
     that does not exist stays inert and warns `contains-target-not-found`.
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
   | `duplicate-facet-id`, `duplicate-boundary-id`, `boundary-not-in-context` | error, non-zero | the overlay is structurally wrong, not merely dangling |
   | `duplicate-boundary-assignment`, `duplicate-owner-assignment` | info | overlapping membership — a fact, not a repair |

   The warnings are the ones that need the grep: each names a reference to
   something nothing declares, which is precisely what a merge drops silently.
3. For each thin domain, re-dive it:
   - `karasu subtree <DomainId> index.krs` extracts the current slice to hand to
     a subagent for a deeper pass;
   - merge the additions and re-run `coverage`.
4. **Stop condition**: every domain is `thin: false`, every infra block reports
   an empty `unmappedButReferenced`, and the warning greps of step 2 come back
   empty. `coverage` scores the logical and physical layers only — no metric
   measures the `facet` / `boundary` / `organization` overlays, so those are
   held by the render greps alone. If a domain stays thin after a few
   rounds, note it as "the source is genuinely thin here" rather than padding
   it; the same goes for a leaf that stays in `unreferenced` because nothing in
   the source actually uses that table.
5. **Re-measure after any enrichment.** `coverage` scores are *relative* across
   domains, so enriching one dimension (e.g. adding entity relations) raises the
   normalization baseline and can newly flag a domain that has none of that
   dimension. A domain that turns thin only after enrichment (e.g. a
   singleton-store domain with no foreign keys) is usually genuinely thin — do
   not pad it; record why.
6. Record any un-modelable idioms (notation gaps). Both original collectors are
   closed: shipped idioms belong in the cookbook, `docs/guide/notation-cookbook.md`,
   and a genuinely missing construct is judged by the promotion gate,
   `docs/adr/1820-notation-promotion-gate.md`. That gate wants **real-usage
   evidence**, which is what a run of this skill produces for the experimental
   `boundary` and `facet` — so report how they were used, not only where they
   fell short.

   Four of these recur across agents and repos; expect them rather than
   rediscovering them:
   - **domain-event publication from a usecase** (outbox / publish) — recordable
     as far as the data goes: declare the event as a `queue` leaf and reference
     it from the usecase, `resource OrderEvents.OrderPlaced { operations
     enqueue:create }` (`dequeue:delete` on the consuming side). What is still
     missing is publish/subscribe as an **edge** semantic — the pairing is
     inferred from the shared leaf, never stated;
   - **async background-job / scheduled pipelines** (Celery, `@Scheduled` outbox
     drains, queue consumers) — the *physical* side lands cleanly on `job` with
     `schedule` (omit `schedule` and it is a one-shot job); the *logical* side
     still maps only loosely onto the single `queue` kind;
   - **`entity` id colliding with its `domain` id** → `entity-anchor-collision`
     (deep-link `#krs-entity-X`), which forces a rename;
   - **value objects / identity types / state machines** — no structural home
     (an `entity` carries no attributes), so they survive only as prose.

   Two entries the earlier runs listed are **closed**, so do not re-report them:
   list-vs-single reads are now the verb decoration `operations list:read,
   search:read` (Phase 2), and a policy's *scope* is now a `facet` — only the
   policy's *content* stays prose, and that one is closed by decision, not by a
   gap (ADR-832).

## Deliverables

- `index.krs` (plus e.g. `deploy.krs` if needed). The **`.krs` is the source of truth**.
- A coverage report (a quantitative record of how deeply each domain was recovered).
- The list of seams left `@draft`, so the human review knows where to look first.
- Notes on any notation gaps encountered, and on how the experimental `boundary`
  / `facet` constructs were used (evidence for the promotion gate, ADR-1820).

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
  `facet` / `facets` (Phase 1 step 5, Phase 2). The single test for all three:
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
  letting it read the whole repo destroys the uniform depth.
- **Always `karasu fmt` after any machine generation or injection**, and
  keep `operations` verbs **comma-separated** — these are the two mechanical
  slips that real runs hit most. Note one thing `fmt` does *not* preserve:
  annotation parameters are dropped (`@draft(confidence: "low")` comes back as
  `@draft`, #2571), so nothing load-bearing goes in a parameter. Drop this
  caveat when #2571 lands.
- **A cross-domain entity relation must be written `DomainId.EntityId`.** A bare
  id is intra-domain only and is dropped from the entity view with no
  diagnostic — the one loss in this pipeline that neither `render` nor
  `coverage` will tell you about. Phase 3 step 7's roster pass exists to make
  the qualification mechanical.
- The merge is where *physical* fidelity is lost: infra declaration blocks and
  `table` mappings do not survive on their own (Phase 3 steps 5-6). Both losses
  are now measurable rather than eyeballed — `render` warns on a reference to
  something undeclared, `coverage` counts what the declared physical layer got
  represented by. Neither is optional; a merged model that renders clean can
  still be missing a third of its tables.
- **This skill hardcodes CLI command names, and the CLI moves.** Two instances of
  skill-vs-CLI drift have already shipped (`lint-style` #2084, `--from wrangler`
  #2090) and neither was visible to CI. Before trusting any command written here,
  confirm it against `karasu <cmd> --help`.
