---
id: ADR-YYYYMMDD-NN
title: Short human-readable title (matches body H1 after the `:`)
status: accepted
date: YYYY-MM-DD
# topic must match one of the section headings in docs/adr/README.md:
# core-concepts | parser | resolver | renderer | edges | styling |
# navigation | app-ui | project | chat-ai | cli | vscode | testing | build |
# adr-tooling
topic: core-concepts
# authors: [your-handle]

# --- Relationships (all optional; leave as empty arrays if unused) ---
# supersedes: [ADR-YYYYMMDD-NN]           # this ADR replaces the listed ones (status=superseded on those)
# superseded_by: ADR-YYYYMMDD-NN          # only when status=superseded; scalar or null
# depends_on: [ADR-YYYYMMDD-NN]           # prerequisites this ADR assumes
# related_to: [ADR-YYYYMMDD-NN]           # reference-only; no semantic dependency
# conflicts_with: [ADR-YYYYMMDD-NN]       # mutually exclusive alternatives
# refines: [ADR-YYYYMMDD-NN]              # this ADR is a concrete specialization of an abstract one

# --- Scope (optional) ---
# `scope.concerns` is a controlled vocabulary of cross-cutting aspects that
# are orthogonal to `topic`. Prefer leaving it empty when `topic` already
# captures the categorization; add a concern only when the ADR touches a
# dimension that a topic-only query would miss.
# Allowed values: accessibility | ci | dependencies | deployment | i18n |
#                 performance | security
# NOTE: renamed from `scope.domains` to avoid collision with karasu's
# product-side `domain` modeling primitive.
# scope:
#   packages: [core, app, cli, lsp, vscode]
#   concerns: [security, dependencies]

# --- Assumptions (optional; checked by `pnpm adr:check-assumptions`) ---
# Supported formats:
#   "file: <path>"                    asserts the path exists
#   "symbol: <path> :: <name>"        asserts the identifier appears as a whole
#                                     word (use for function / class / const /
#                                     type names). Prefer this over grep: when
#                                     the target is a named code entity.
#   "grep: <path> :: <regex>"         asserts the regex matches inside the file;
#                                     use for non-identifier patterns.
#   "<anything else>"                 free text, surfaced for manual review only
# assumptions:
#   - "file: packages/core/src/view/unassigned-system.ts"
#   - "symbol: packages/core/src/view/unassigned-system.ts :: withUnassignedSystem"
#   - "grep: packages/core/src/parser/parser.ts :: case TokenType.Database"
#   - "external IdP remains available"
---

# ADR-YYYYMMDD-NN: Short human-readable title (matches frontmatter title after the `:`)

- **日付**: YYYY-MM-DD
- **ステータス**: 決定済み
- **関連**:
  - Issue #NNN
  - Related ADRs / design docs / source files

## 背景

What prompted this decision? What problem or option were we evaluating?

## 決定

One sentence stating what was decided.

## 理由

- Bullet points explaining why the decision was made.

## 却下した案

Alternatives considered and rejected (only when useful for posterity).

---

## Frontmatter reference

- `status` must be one of: `proposed` | `accepted` | `deprecated` | `superseded` | `not_adopted`.
- `topic` is required and must be one of the controlled values listed above (matches `docs/adr/README.md` section headings).
- `id` must equal `ADR-<YYYYMMDD>-<NN>` derived from the filename.
- The body H1 heading must match `ADR-<id>: <title>` from frontmatter.
- When `status: superseded`, `superseded_by` is required **and** the new ADR must list this ID in its `supersedes`. The validator enforces bidirectional consistency.
- The prose header (`- **日付**:`, `- **ステータス**:`, `- **関連**:`) stays for human readers; frontmatter is for tooling. Both coexist.

See `docs/design/adr-knowledge-graph.md` for the full schema rationale, or run `pnpm adr:validate` to check your ADR locally.
