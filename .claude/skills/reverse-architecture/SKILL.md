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

Design rationale: `docs/design/reverse-architecture-skill.md` and
`docs/design/repo-reverse-engineer-harness.md`.

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
| Structural | **slice / measure / render / validate** the produced `.krs` | CLI (deterministic) | `translate` / `subtree` / `coverage` / `render` / `lint-style` |

`subtree` / `coverage` statically analyze the **produced `.krs` model**, not the
source — that is why they are deterministic.

## Procedure (4-phase pipeline)

### Phase 1: Scout (one pass)

1. Map the repo's top level (language, build setup, entry points, directory tree).
2. Extract the physical spine deterministically:
   - `docker-compose*.yml` → `karasu translate --from compose <file>`
   - a k8s manifest → `karasu translate --from k8s <file>`
   - OpenAPI → `karasu translate --from openapi <file>` (usecases under a service)
   - DB schema → `karasu translate --from db <file>` (database / table blocks)
3. **Enumerate the logical domains (primary axis).** Use the physical output
   (containers / services) and the directory / module tree as *seam hints* to
   infer bounded contexts. For a ball-of-mud that resists decomposition, split
   the directory tree with a size cap and **record low-confidence seams
   explicitly** (never drop them silently).
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
    { operations ... }`);
  - an `entity` expresses relations as edges (no attributes);
  - resources **reference the physical declaration** (the logical side is a
    reference; the physical declaration is canonical);
- validates its own fragment with `karasu lint-style <fragment>` before returning.

Domains are independent, so launch the subagents in parallel.

### Phase 3: Synthesis (one pass)

1. Merge each fragment into the skeleton to form a single `.krs`.
2. **Cross-domain edges** may be observed from both sides — dedup by the
   `(src-id, dst-id, kind)` composite key. Direction follows the referencing
   side (the FK holder).
3. Match identity by `id`, never by `label`.
4. Resolve resource-location conflicts structurally: the physical declaration
   lives in one place; every domain references it.

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
5. Record any un-modelable idioms (notation gaps) for the cookbook (#1818) /
   notation watch (#1816).

## Deliverables

- `index.krs` (plus e.g. `deploy.krs` if needed). The **`.krs` is the source of truth**.
- A coverage report (a quantitative record of how deeply each domain was recovered).
- Notes on any notation gaps encountered.

## Notes

- **Never fabricate the physical layer** (use `translate`). **Match identity by
  `id`**, not `label`. **Never silently drop thin domains** (surface them via
  `coverage`). **Do not introduce new `.krs` syntax** (v1 is frozen).
- Tell each subagent explicitly to read **only its domain's source slice** —
  letting it read the whole repo destroys the uniform depth.
