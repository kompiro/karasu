# ADR-0011: Deployment Diagram Design Decisions

## Status

Accepted

## Context

When implementing the deployment diagram feature (see `docs/design/deployment-diagram.md`), several design decisions with non-obvious trade-offs were made. This ADR records the rationale so future contributors understand why things are the way they are.

## Decisions

### 1. Layout: flat placement with `realizes`-based container grouping

Deploy units that share the same `realizes` target are grouped inside a labeled container. Units without `realizes` are placed in an "未分類" (uncategorized) container.

**Rationale**: A hierarchical tree layout would imply a containment relationship that does not exist in the domain model. The flat-with-grouping approach communicates "these units belong to the same logical service" without implying nesting or ownership.

### 2. Ghost edges: system edges rendered as dashed lines between containers

Edges defined in the system diagram (`A -> B`) are mirrored in the deploy diagram as semi-transparent dashed lines between the corresponding containers (not between individual deploy units).

**Rationale**: Showing edges between individual units would be misleading — the logical dependency is between services, not between specific runtime artifacts. Container-level edges preserve the semantic meaning while providing context for why containers communicate.

### 3. Click navigation is one-directional: Deploy → System only

Clicking a container in the deploy diagram switches to the system diagram and highlights the corresponding service. The reverse direction (System → Deploy) is not implemented.

**Rationale**: In the system diagram, clicking a node already triggers drill-down navigation. Adding a cross-diagram jump on the same click gesture would create ambiguity. This conflict must be resolved (e.g., via modifier key or separate affordance) before the reverse direction can be implemented. See [#29](https://github.com/kompiro/karasu/issues/29).

### 4. Deploy node kind colors are hardcoded, not in the style system

Each deploy node kind (`oci`, `lambda`, `jar`, etc.) has a fixed background and border color defined directly in `deploy-renderer.ts`.

**Rationale**: Integrating kind-based colors into the style resolution pipeline requires selector support for `node[kind=X]`, which was out of scope for the initial implementation. Hardcoding allows the feature to ship without blocking on style system changes. Migration to the style system is tracked in [#30](https://github.com/kompiro/karasu/issues/30).

## Consequences

- The one-directional navigation is a known limitation; users navigating from System → Deploy must switch tabs manually until #29 is resolved.
- Hardcoded colors cannot be overridden by `.krs.style` files until #30 is resolved.
- The container grouping layout may need revisiting if deploy units with multiple `realizes` targets become a common use case.

## Related

- `docs/design/deployment-diagram.md`
- [#29](https://github.com/kompiro/karasu/issues/29) — System → Deploy click navigation
- [#30](https://github.com/kompiro/karasu/issues/30) — Deploy node kind style system integration
