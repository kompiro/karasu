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

   When you cannot resolve a seam, **record it as low-confidence explicitly**
   (never drop it silently). Over-splitting is recoverable by a human folding
   domains up; a wrong merge is not, so when genuinely torn, prefer the split
   and mark it.
4. Assign canonical ids (**English PascalCase**; `label` follows the user's
   language). Subagents reuse these ids instead of inventing their own.
5. Output: `skeleton.krs` (system / service / domain scaffold + physical spine)
   and a **domain work-list**.

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
  - an `entity` carries identity **and its relations** (no attributes). Do not
    stop at identity-only — derive relations from the schema's foreign keys and
    write each inside the reference-holding entity, starting at that entity:
    `Message -> Chat "belongs to"` inside `entity Message { … }`. A relation may
    cross domains (the target entity may live in another fragment).
  - resources **reference the physical declaration** (the logical side is a
    reference; the physical declaration is canonical);
- validates its own fragment with `karasu render <fragment> -o /dev/null` before
  returning (non-zero exit = the fragment is structurally broken; `-o /dev/null`
  discards the SVG so only diagnostics surface). A fragment that declares only
  `domain` / `usecase` blocks renders fine — unassigned-node *warnings* are
  expected at this stage and do not fail the gate.

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
5. **Carry the skeleton's infra declarations through the merge — verbatim.**
   The merge reads as "combine the fragments", but the fragments only *reference*
   infra; the `database` / `storage` / `queue` **declaration blocks** live in the
   skeleton alone. Dropping them silently deletes every table no fragment
   happened to reference. Real run (spike #1991): the merged `index.krs` had no
   `database` block at all, and **9 of 35 real tables vanished** from the model
   purely for lack of a referent.
6. **Verify entity↔table mappings survived the fan-out.** For every table a
   domain touches via `resource <Db>.<Table>`, the owning entity must carry the
   matching `table <Db>.<Table>` line. Deep-dive agents routinely write the
   entity and omit the mapping — the pathological output is an empty
   `entity Goal {}`. Flag empty entities and missing mappings, and repair them
   before Phase 4. Both this and step 5 are mechanical and deterministic: they
   belong on the structural side of the split (ADR-1895), not to agent
   judgement.
7. **Cross-domain entity relations — one roster pass.** A per-domain subagent
   only knows its own entity ids, so cross-domain foreign keys risk id mismatch.
   After merging, run **one** relations agent over the *full entity roster*
   (every entity id + its domain) plus the schema; it emits FK-derived relations
   (`{from, to, label}`, both ids in the roster) that you inject into each
   reference-holding entity block. Seeing all ids at once is what makes
   cross-domain relations resolve consistently.
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
9. **Normalize with `karasu fmt`.** Merged / injected `.krs` almost always has
   uneven indentation (a closing `}` can land under-indented and *look* like a
   missing brace even though it parses). Always finish synthesis — and any
   mechanical node injection — with `karasu fmt <file>`.

### Phase 4: Validate & repair loop

1. Run `karasu coverage index.krs --format json` to **detect thin domains
   quantitatively** (`thin: true`).
2. Run `karasu render index.krs` to confirm the model **draws** (failure = a
   structural break).
3. For each thin domain, re-dive it:
   - `karasu subtree <DomainId> index.krs` extracts the current slice to hand to
     a subagent for a deeper pass;
   - merge the additions and re-run `coverage`.
4. **Stop condition**: every domain is `thin: false` (coverage target reached).
   If a domain stays thin after a few rounds, note it as "the source is
   genuinely thin here" rather than padding it.
5. **Re-measure after any enrichment.** `coverage` scores are *relative* across
   domains, so enriching one dimension (e.g. adding entity relations) raises the
   normalization baseline and can newly flag a domain that has none of that
   dimension. A domain that turns thin only after enrichment (e.g. a
   singleton-store domain with no foreign keys) is usually genuinely thin — do
   not pad it; record why.
6. Record any un-modelable idioms (notation gaps) for the cookbook (#1818) /
   notation watch (#1816). These five recur across agents and repos, so expect
   them rather than rediscovering them:
   - **domain-event publication from a usecase** (outbox / publish) — no v1
     vocabulary at all; the most widespread gap;
   - **async background-job / scheduled pipelines** (Celery, `@Scheduled` outbox
     drains, queue consumers) — map only loosely onto the single `queue` kind;
   - **`entity` id colliding with its `domain` id** → `entity-anchor-collision`
     (deep-link `#krs-entity-X`), which forces a rename;
   - **list-vs-single reads** — the CRUD verb set collapses a collection query
     and a get into one `read`;
   - **value objects / identity types / state machines / policies** — no
     structural home (an `entity` carries no attributes), so they survive only
     as prose.

## Deliverables

- `index.krs` (plus e.g. `deploy.krs` if needed). The **`.krs` is the source of truth**.
- A coverage report (a quantitative record of how deeply each domain was recovered).
- Notes on any notation gaps encountered.

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
- **Match identity by `id`**, not `label`. **Never silently drop thin domains**
  (surface them via `coverage`). **Do not introduce new `.krs` syntax** (v1 is
  frozen).
- Tell each subagent explicitly to read **only its domain's source slice** —
  letting it read the whole repo destroys the uniform depth.
- **Always `karasu fmt` after any machine generation or injection**, and
  keep `operations` verbs **comma-separated** — these are the two mechanical
  slips that real runs hit most.
- The merge is where *physical* fidelity is lost: infra declaration blocks and
  `table` mappings do not survive on their own (Phase 3 steps 5-6).
- **This skill hardcodes CLI command names, and the CLI moves.** Two instances of
  skill-vs-CLI drift have already shipped (`lint-style` #2084, `--from wrangler`
  #2090) and neither was visible to CI. Before trusting any command written here,
  confirm it against `karasu <cmd> --help`.
