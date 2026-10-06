# karasu

## 0.8.0

### Minor Changes

- 3a352bb: Add `karasu capabilities --json`, which reports the CLI version, every command with its flags, and any deprecated or removed names with their replacements, so skills and scripts can check what the installed CLI accepts. Renamed commands and flags now keep working under their old names until the next major release: an old name runs its replacement and prints one fixed-format line to stderr (`karasu: deprecated: 'old' -> 'new' (since X, removal Y)`), and a removed name fails with the same line instead of "unknown command" (#2961).
- c168d22: Add `karasu check <file>`: validate a `.krs` project (imports included) and write nothing. It prints every diagnostic in the same format as `render` and exits 1 when any is an error, so a file that passes `check` renders.

### Patch Changes

- c168d22: `buildAllViewsSvgProject` (behind the default `karasu render`) now raises `duplicate-edge-id`. It previously skipped the project-wide edge id check, so `karasu render index.krs` accepted a model that `karasu render --view system` rejected. The source-level `buildAllViewsSvg` is unchanged, so the karasu-nest gallery and the app's share render still treat duplicate edge ids as the author's call.
- 5dbdb3d: Rendering dense diagrams is faster: when an edge detours through the gaps between cards, the router now picks the nearest few candidate gaps directly instead of sorting all of them for every edge. Output is unchanged (#2944).
- 8a5bf97: Correction to the 0.3.0 (core) / 0.7.0 (CLI) release notes: **icon display
  mode is still deprecated, but it will not necessarily be removed in the next
  major version.** It will be removed in a future major; which release is not
  decided yet. Moving to shape mode with `shape: url(...)` remains the
  recommended path (ADR-2906, superseding ADR-2376).
- 612aa45: The multi-system root view now draws every same-named node: two systems that
  both declare `service Api` used to merge onto one card (the later system's), so
  the other frame went empty and its edges started from nowhere (#2917). Both
  cards keep `data-node-id="Api"`, and every real node card on a logical-view
  canvas now also carries `data-node-path` (`Shop.Api`, the same injective text
  form a deploy container's id uses), naming the one node the card stands for;
  ghost cards and collapse stubs carry none. The
  compile result exposes the same metadata keyed by that path as
  `nodeMetadataByPath`, and `nodePathRefId` / `parseNodePathRefId` are exported
  for readers of the attribute.

## 0.7.0

### Minor Changes

- cca275f: Wire the experimental **"Group by: boundary"** axis (P2b-B). The declared
  `boundary` blocks from P2b-A now group the system view: selecting the boundary
  axis bands nodes by their `boundary` and draws a boundary frame per group,
  reusing the P2a/P2c grouping machinery (two-level layout, collapse, orthogonal
  routing). The boundary axis is independent of and exclusive with the team
  (`owns`) axis — `ownerIndex` remains the per-card team badge regardless of axis.
  In the app the Group-by selector shows the "Boundary" option only when the model
  declares a `boundary` (data-driven visibility, mirroring the "Team" option's
  `organization` gate). Experimental notation (ADR-1820). Refs #1822.
- 6b82fbd: Collapsing one `boundary` no longer hides a node that also belongs to another,
  still-expanded one (#2180). A node folds only when every boundary it belongs to
  on that canvas is collapsed, and it folds once — into the group it was placed
  in. A collapsed boundary whose members all stayed visible draws no stub at all
  instead of `<Boundary> (0)`.
- 7e953f7: Add the experimental `boundary { contains … }` declaration (P2b-A). A `boundary`
  declares a semantic cluster of system-view nodes and builds a 1:1 `boundaryIndex`
  (node id → boundary id), mirroring `organization`/`owns`/`ownerIndex`.
  Multi-membership resolves first-declared-wins and surfaces the new info
  diagnostic `duplicate-boundary-assignment`; a `contains` target that is not found
  in the system hierarchy warns via `contains-target-not-found`. This is a
  parse-time slice only — the Group-by "boundary" axis and rendering land in a
  follow-up. Experimental notation (ADR-1820); backward compatibility is not
  yet promised. Refs #1822.
- a5a752f: `boundary` membership is now 1:N at the model layer (#2178, slice A of #2161).
  A node listed in several boundaries keeps every declared membership instead of
  only the first; the banded _Group by: boundary_ view still places it in its
  first-declared boundary, so diagrams are unchanged. The
  `duplicate-boundary-assignment` info diagnostic now states only the model fact
  ("belongs to more than one boundary") and no longer describes how a view
  resolves it. A `boundary` declared in an imported file now reaches the importing
  model, which it previously did not. TS API: `KrsFile.boundaryIndex` /
  `scopedBoundaryIndex` become `boundaryMembership` / `scopedBoundaryMembership`
  with array values, plus the new `primaryBoundaryOf` helper.
- 840d44e: Register the built-in icon set inside core, so `shape: url("<name>")` and icon display mode draw the icons on every surface — `karasu render` / `karasu diff` / `karasu serve`, the VS Code preview, and any embedder of `@karasu-tools/core` — not only in the browser app.

  A `url()` that names no registered icon is now reported as a new `style-unknown-icon` warning at the declaration (app warning panel, VS Code Problems via the LSP, `karasu lint-style`, `karasu render`) instead of silently drawing a `box`. `karasu render` now prints the position of any warning that carries one, the way it already prints a diagnostic's.

  Core gains `registerBuiltinIcons()` and `resetRegistryToBuiltins()` for embedders and tests that clear the shape registry (#2802).

- ec854c5: Add the builtin store-role tags `[cache]` / `[analytics]` and the lifecycle annotation `@planned` (#2172).

  `[cache]` (a store you could rebuild — a session store, a CDN origin cache) and `[analytics]` (a warehouse / data lake) apply to `database` and `storage`, and join `[index]` on one axis: which way this store is not the system of record. All three are now out of scope for the shared-store diagnostics (`shared-infra-fan-in`, `cross-domain-store-access`), which describe a shared _system of record_. `@planned` marks an element the design places but that does not exist yet.

  Behaviour changes to expect:

  - A model already using `[cache]`, `[analytics]` or `@planned` stops warning and starts rendering a badge. Using any of the three on a kind outside its `appliesTo` (`service Api [cache]`) now warns as `tag-not-applicable`.
  - `karasu translate --from wrangler` emits `database <id> [cache]` for a KV namespace instead of a bare `database`, closing the degrade recorded in ADR-1935.
  - Opening a model that uses the new names with an older karasu warns them as `tag-not-builtin` / `annotation-not-builtin`.

  The review also rejected `[kv]`, `[bff]`, `[graph]`, `[timeseries]`, `[replica]`, `@canary` and `@sunset`; those keep warning, with the reasons recorded.

- 02b9f7f: Choose the row-width budget by canvas area instead of leaving it at a fixed constant, so a view holds the least empty space it can while staying inside a screen-shaped aspect band. Deep views that used to grow into a tall narrow ribbon now spread sideways; a view that already fits keeps exactly the layout it had. A deploy container holding more than three units also wraps them into a grid rather than stacking them in one column; smaller containers keep the single column they had, so no existing deploy diagram changes.
- f73fb4e: System view: collapsing an external/infra layer now **re-targets** its
  boundary-crossing edges onto the `⊕` stub instead of dropping them, matching how
  team-group collapse already behaves (#1872 / ADR-1872). Folding the
  external/infra layers — including via "Collapse all" — keeps the "who depends on
  the external/infra layer" edges as aggregation trunks to the stub, so the
  compact overview still shows the dependency structure.
- 823584d: Entity view now surfaces **cross-domain relations** as muted **ghost** entities. A relation targeting a qualified `DomainId.EntityId` (e.g. `Order -> Customers.Customer`) draws the foreign entity faded — both outgoing (this domain → foreign) and incoming (foreign → this domain) — sub-labelled with its owning domain, reusing the existing ghost mechanism. Qualified targets are required because entity ids are only warning-level unique; a bare id stays intra-domain only. (#1911, follows #1870/#1896/#1919)
- e0ffadd: Add the `cross-domain-store-access` info diagnostic: a usecase in one domain that reads/writes an infra leaf owned by another domain is surfaced as an informational boundary-crossing fact. Ownership is derived from `entity` mappings (no new syntax), keyed at leaf granularity, held as a set of owning domains, scoped per system, with `[external]` / `[index]` stores excluded. Orthogonal to `shared-infra-fan-in` (#1819).
- 4e29bf4: Group by team (system view): crossing marks now also cover **diagonal** crossings, not just right-angle ones (#1939 Part 1). `computeCrossingMarks` detects any strict-interior segment crossing and draws the hop arc oriented along the more-horizontal segment, so a "clear" intra-band edge left straight no longer produces an unmarked crossing. Axis-aligned crossings render exactly as before.
- c701cfc: Route the deploy view's container edges through the shared routing chain
  (#2609). Edges into one container now fan out along its side instead of all
  ending at one point, and an edge detours around a container that sits between
  its endpoints instead of piercing it. In-place expansion no longer switches on
  Group-by trunk aggregation, so two parallel edges into an expanded service keep
  their own corridor and anchor (#2490).
- e95ef40: Add the `entity` node kind — a conceptual domain entity declared as a `domain` child. An entity carries a name, relations to other entities (`->` / `-->`, one edge per association, origin = the reference-holding entity), and an optional `table <Infra>.<sub>` physical mapping — never attributes. New diagnostics: `entity-not-in-domain` (error) for misplacement and `entity-anchor-collision` (warning) for deep-link namespace clashes. The entity view, `resource` → entity resolution, and `translate --from db` scaffolding follow in later PRs (#1870).

  Note: `entity` is now a reserved keyword. A model that used `entity` as a node id or edge endpoint must rename it.

- c6bc0ee: Add a per-domain **entity view** to the all-views bundle. A domain that owns `entity` nodes now renders a dedicated view of its entities and their intra-domain relations, reachable via the `#krs-entity-<domainId>` fragment. Entities render with their own default style (distinct from usecases) and are kept out of the domain's usecase view; the entity views are fragment-only and do not rescale the shipped system/deploy/org views. The interactive usecase/entity toggle, cross-domain ghost entities, and `resource` → entity resolution follow in later PRs (#1870).
- 5c7cb50: Add the `@draft` builtin annotation, with an optional `confidence` parameter.

  `@draft` marks a statement the model makes but nobody has confirmed. It exists
  so a `.krs` that was reverse-engineered rather than written by hand can say
  which parts it guessed at, instead of inviting the reader to trust all of it
  equally.

  ```krs
  service Reconciliation @draft(confidence: "low")
  domain Settlement @draft
  ```

  A bare `@draft` is complete; `confidence` takes `low` / `medium` / `high`, and
  any other string is kept verbatim as a display-only value rather than being
  rejected. The mark is per node, not per document, because a generated
  decomposition errs at judgement-call seams rather than uniformly. karasu never
  warns about, downranks or refuses to render a low-confidence node: penalising
  the mark would just remove the mark.

  `@draft` renders with a ✎ badge in both themes. A node renders one badge, and
  `@draft` is ordered to win that tie: it is the mark that changes how a reader
  should treat everything else on the node.

  `NodeMetadata.draft` carries the interpreted level for consumers to read. No
  surface displays it yet — the badge is the effect that ships here; a detail-panel
  row is a separate change.

  **Behaviour change for anyone already writing `@draft`**: it was accepted as a
  non-builtin annotation and warned with `annotation-not-builtin`. That warning
  no longer fires for it, and a `@draft(confidence: …)` parameter that previously
  produced `annotation-param-unsupported` is now recognised. Both changes remove
  a warning rather than adding one.

  **The language version does not move.** `@<identifier>` already accepts any
  identifier under `.krs language v1.0`, so the grammar is unchanged and the
  freeze in ADR-1314 is untouched; what grows is the tool-owned builtin
  vocabulary, admitted through the three-question gate in TPL-2172 (register:
  lifecycle, since it describes the state of a statement in a review process;
  no existing construct expresses it, since `@experimental` describes the
  subject's maturity rather than our confidence in the description; stopping
  rule: one binary axis, "has a human confirmed this").

- 80d1bb2: Grouped exports now draw group frames on drill-down levels, for both Group-by axes (#1983). Grouping resolves per view, against the nodes rendered at the level being drawn: the Show All Layers / drill-down / Open All Views exports frame each level's own members (previously root-level only), and the entity view accepts a new optional `groupBy` argument (`renderEntityView`) so entity members are framed there too. Ungrouped output stays byte-identical, and levels without members keep their exact previous layout. For the stable team axis (`organization` / `owns`) this changes grouped exports of models that own nested domains; the experimental `boundary` axis gains the same per-level frames (still experimental — no compatibility promise, stable promotion remains gated on real-usage evidence).
- 505fb5c: Add an English variant of the full `ec-platform` getting-started drill-down. ProjectMode now seeds the locale-matching set on first launch — English-browser users get the multi-stage tutorial (system → users → clients → domains → annotations → multifile → deploy → cross-system) in English instead of Japanese. Exposes `EC_PLATFORM_PROJECTS_EN` from `@karasu-tools/core` (#1777).
- 6ff819d: Report edges that render on no view: a new `edge-endpoint-not-at-scope` warning fires when an edge names an endpoint that exists in the model but is not a peer at the scope where the edge is declared — e.g. `A -> B` written at `system` scope where `A` and `B` are domains inside a service. Previously such an edge parsed, was seen by the circular-dependency check, and then silently disappeared from every diagram. Placements that do render (a `domain` → `domain` dependency at any distance, a qualified cross-domain `entity` relation) are unaffected. See #2075 and `docs/spec/syntax.md` § Endpoint scope.
- 74e3a74: Edges accept an optional property block, `A --> B [async] #id { label / description / link }`, giving them a place for prose and links that the positional label could never hold. The shorthand `A -> B "calls"` is unchanged and stays canonical: `karasu fmt` folds a block that carries nothing but a `label` back to it, and keeps a block that carries a `description` or a `link`. Writing the label both positionally and in the block is a new `duplicate-edge-label` error. Left-clicking an edge that carries a `description` or a `link` opens the edge detail panel. Also fixes `karasu fmt` silently deleting an edge's author-supplied `#<id>`, which removed the target of any `edge#<id>` style selector. Closes #2543.
- 4e2e245: Size inter-row channels from the traffic they carry (#2608). Edges that share a
  channel between two rows now sit one fixed lane pitch apart whatever their route
  shape — a gutter route's approach runs take part too — and a channel that needs
  more room than the default gap holds gets it: the rows are placed once more with
  that room reserved, instead of an 18px band being split N ways until the lines
  drew on top of each other. Fanned-out gutter ports are spread over the part of the
  side the outline actually offers, so outline seating no longer folds them back
  onto one point. Views whose channels already fit are laid out exactly as before;
  the multi-system root view keeps its default gaps.
- 4035487: Export `createEmptyKrsFile()` from `@karasu-tools/core` — a factory returning a fresh, empty `KrsFile` literal on every call. This replaces three independent copies of the same 17-field empty-object literal across the parser, the import resolver, and the CLI's `subtree` command. The copies were identical, but each duplicate was a distinct opportunity for the defaults to silently diverge as `KrsFile` gains fields: the compiler forces every copy to have the right shape, but not the right default values. Centralizing the literal in one factory removes that risk. No `.krs` / `.krs.style` parsing or rendering behavior changes.
- e703379: Add `renderEntityView(krsSource, viewPath, …)` — the live, single-level render of a domain's **entity view** (its entities and intra-domain relations), the interactive counterpart to the static `#krs-entity-<domainId>` bundle level. The share `ShareTarget` gains an `entityView` boolean so a deep-link can address the entity sub-mode of a drilled domain. In the app the entity view is now reachable via an **Entities** toggle in the system view and is carried in the URL hash as `#krs-entity-<domainId>` (#1907, follows #1870/#1896).
- 94b28bf: Add in-place container expansion to the system view (#1921): a ⊕ control on a service box expands it to show its domain children inside a boundary frame while sibling services stay collapsed, with cross-boundary edges re-anchored to the exact internal domain (or the frame border for service-level edges). Interactive preview only; at most one container expands at a time. Phase 1 of the mixed level-of-detail work (#1815).
- c44631d: Allow expanding multiple containers in place at once in the system view (#1923). Lifts the single-expansion cap and routes edges so each expanded frame's edges connect to its own domains/border while detouring around the other frames (extends the group router to frame-anchored endpoints — this also removes the residual frame-crossing from single expansion). Scoped-glance stays protected softly: Collapse all folds every expansion back to the overview and a hint appears when many are open.
- 8840d50: Add the experimental `facet` construct: a top-level `facet <id> { label | description | link }` declaration for externally-defined sets (PCI scope, PII, "requires auth"), plus a `facets <id>[, <id>]*` property accepted on every node kind. Membership is 1:N, merges across imported files, and round-trips through `karasu fmt`. Two diagnostics come with it: `facet-not-declared` (warning) when a reference names no declaration — checked on the merged model, so a declaration in another file counts — and `duplicate-facet-id` (error) when the same id is declared twice. Default rendering is unchanged; the overlay, style selectors, and overview arrive in the follow-up slices of #2160. Refs #2173.
- 399df81: The preview's Facets menu gains **Membership overview** — a panel answering the other half of the question, "which elements belong to facet X", with each facet's description, policy links and member list.

  The list is derived from the `facets` properties on every compile, never authored: writing membership element-side is what keeps a rename from meaning an edit to a distant list, and deriving the centralized view is how that trade-off is paid without giving it up. Two same-named elements in different scopes appear as two rows, told apart by their path.

  `getReference`'s neighbour on the core API: `buildFacetOverview(file)` and `SystemCompileResult.facetOverview` expose the same derivation to any consumer.

  Also adds `feature-samples/tag-facet-registers.krs`, which puts all four vocabulary registers — tag (archetype), annotation (lifecycle), facet (external membership), boundary (view grouping) — on one diagram, with a companion sheet showing the selector that belongs to each.

  `facet` remains **experimental** notation (`.krs language v1.0` unchanged).

- 33eae8a: `.krs.style` can now match on facet membership: `[facets=pii]` styles every element that declares `facets pii`, compounds with a kind (`database[facets=pci]`), and repeats to require several memberships at once. It scores 10 — exactly what the `[pii]` tag selector scores — so a sheet can be migrated one rule at a time without changing which rule wins.

  With that migration target in place, `.krs.style` selectors naming a tag or annotation outside the tool vocabulary are now deprecated: `style-tag-selector-not-builtin` / `style-annotation-selector-not-builtin` (warnings). **The rules still apply** — this release only announces the change; syntax v2.0 is where they stop matching. `docs/spec/style.md` § Facet selectors carries the before/after rewrite.

  `facet` remains **experimental** notation (`.krs language v1.0` unchanged — this is an additive diagnostic plus a new selector form, not a language-version transition).

- 1fa005a: Group-by views now bundle the edges that leave one service for gutter-routed targets onto one spine that leaves the source once and branches at each target's row. The count at each split goes down as siblings leave, and the band thins with it, the mirror of the fan-in trunk (#2883). The canvas gets narrower and fewer lines cross. A fan-in trunk whose target sits above its sources no longer puts a "1" on its lowest corner (#2885).
- 098ed14: Group frames ("Group by" team / boundary) now show the group's declared `label` as the frame title, falling back to the group id when no label is given. The frame container id stays `__group_<id>__`, so collapse state and permalinks are unchanged. The positional label form (`<kw> <id> "<label>"`) is retired per ADR-19: `boundary` now rejects it with the `positional-label-removed` error (experimental construct, no deprecation window). The same form on `organization` / `team` / `member` is covered by its own entry — it was deprecated here and removed in #2208 before either shipped, so no release ever emitted the intermediate warning. (#2133)
- 4f5b546: Raise the supported Node.js floor from `>=20` to `>=22`. Node 20 reached end of life on 2026-04-30, so `engines.node: ">=20"` advertised a runtime that no longer receives security fixes. Node 22 is supported through 2027-04. The CLI bundle is now compiled with `--target=node22` to match. See Issue #2397.
- ea50cba: system view の Group by: team で、同一 infra/external target を共有する複数エッジを 1 本のトランク（縦 spine）に合流させ、target ごとに専用レーンを割り当てて spine の重なりを解消する（#1859 P2c-B）。各トランクエッジは edge identity を保ったまま `trunkId` を持つ。貫通ゼロと Group by: none の byte 一致は不変。junction dot / hop マークは後続（P2c-C）。
- e7834a0: system view の "Group by: team" グループ化を compare（diff）モードでも有効化した。`compileSystemDiff` が `groupBy` / `collapsedGroups` / `collapsedCategories` / `interactive` を受け取り、diff の after-slice を team 境界フレームで囲み、⊖ category 折り畳みコントロールも compare モードで機能するようになった（#1873, ADR-1858 の follow-up）。
- e0a0e24: Render "Group by: team" boundary frames in the export / secondary system-view
  SVGs — Show All Layers, drill-down export, and Open & Export All Views — when
  the viewer has grouping active. Exports keep the **full structure** (collapse is
  never applied there by design); the root system-view level is grouped into team
  bands with boundary frames while every node stays drawn. Threads `groupBy`
  through `buildAllLayersSvg` / `buildDrillDownSvg` / `buildAllViewsSvg`
  (#1879, ADR-1858).
- abb66a5: Draw an interactive ⊖/⊕ collapse control on each system-view team boundary frame (Issue #1858, P2a). In `groupBy: "team"` live preview (`interactive: true`), clicking a group's ⊖ folds it to a `<Team> (N)` stub (⊕ to expand) via `data-collapse-group`. Static outputs stay clean. `ContainerRect` gains an optional `groupId`.
- c849e53: Add a `collapsedGroups` system-view render option (Issue #1858, P2a): with `groupBy: "team"`, a collapsed team folds to a `<Team> (N)` stub and its cross-group edges re-target onto the stub, so collapsing every team yields the compact group-dependency-DAG view. Intra-team edges drop and duplicate stub edges de-duplicate. Omit for the default fully-expanded grouped render.
- 9d9e894: Group by team (system view): draw circuit-diagram crossing marks so a crossing can no longer be misread as a connection (#1859 P2c-C). Where a horizontal edge segment crosses a vertical (gutter corridor / trunk spine) at a right angle it now arcs over it (hop = "not connected"); aggregation-trunk merge points get a junction dot (= "connected"). Marks are derived from final coordinates, so they are deterministic. Ungrouped ("Group by: none") output is unchanged.
- e9641a5: system view の Group by: team で、展開ビューのエッジを直交ルーティングに切り替え、サイドガター経由でノード・グループフレームの貫通をゼロにする（#1859 P2c-A）。逆流（against-flow）の依存エッジは破線で描く。Group by: none（未グループ）の出力は不変。集約トランクと hop/junction マークは後続。
- 1981795: Choose the gutter side by free capacity and detour length instead of a fixed
  right-first order (#2610). Edges that cannot take an interior corridor spread
  over both gutters, and the side is decided by geometry, not by where in the file
  an edge was declared. Every edge attached to a node side is fanned out together,
  so a rerouted edge no longer lands on a port another edge still uses.
- e3b25ea: `import { … }` entries resolve by the shared suffix rule (#2088 slice D2, #2576): a nested node can be imported by any suffix of its full path (`import { Checkout.Payment }`), roots are no longer limited to systems, every match is imported (bare-id parity), and non-uniform multi-matches draw the new `import-target-ambiguous` warning. `import-path-not-found` now reports the segment that emptied the candidate pool under right-to-left narrowing. Each entry of a named import carries its own source range, so `import-id-not-found` / `import-path-not-found` / `import-target-ambiguous` underline the entry that failed instead of the whole statement. A named import whose path roots at a `database` / `queue` / `storage` block now takes part in the S4.5 reopen protocol like a whole-file import does, reporting `infra-redeclared-across-files` and `infra-leaf-redeclared-silently` instead of merging two declarations silently.
- ebf1ff0: Add `synthesizeSharePayload` / `serializeKrsFile` to flatten a multi-file `.krs`
  project (resolving `import`s and merging styles) into a single self-contained
  `.krs` + `.krs.style`. Powers karasu-nest inline sharing of multi-file projects.

  Also fixes `serializeStyleSheet` dropping `edge[from=<id>]` / `edge[to=<id>]`
  endpoint predicates (#1755) — they collapsed to a universal `edge` selector,
  which lost source/target edge colors and merged distinct rules (affected Tidy
  and share).

- b303075: Kind colors now follow two rules and a hue table instead of case-by-case picks
  (#2421, spec: `docs/spec/style.md` § Kind color vocabulary). In the logical
  layer, `usecase` renders fill-less and `resource` becomes neutral slate, so the
  four kinds that shared one navy in the dark theme are finally distinguishable —
  and a fill-less card lets a boundary frame's tint show through, making
  membership readable in color. Every deploy kind's fill and label are now its
  accent hue at low and high lightness, retiring the desaturated brown and olive
  that left `war` and `function` looking muddy. A contrast guard verifies the
  result in both themes, including the fill-less border over every boundary tint.
- 31a73f2: Edges can belong to a `facet`. `A -> B { facets pii }` is accepted in the edge property block, spelled and merged exactly as on a node, and it does something: the edge lights up in the facet overlay, `edge[facets=pii]` in a `.krs.style` sheet matches it, `facet-not-declared` catches a typo on the merged model, and it appears in the membership overview. A derived edge takes the union of what it folds — an aggregated `"N domain edges"` and a collapsed group's stub edge both belong to every facet their constituents do. Writing the property changes nothing until a reader selects that facet. Closes #2544 (slice B of #2209).
- 7696271: System view: collapse/expand the **external** and **infra** node categories to cut horizontal density on large diagrams. A new `collapsedCategories` render/compile option folds each collapsed category to a single ⊕ stub before layout, so the diagram reflows and edges to the hidden nodes drop (#1821).
- 5cf789f: The five comma-separated value properties (`facets`, `delivers`, `handles`, `operations`, `realizes`) now read on one grammar. A list no longer jumps a line on its own, so a trailing comma no longer absorbs the next line (an element that spans lines, such as a dotted reference path, still carries the list with it); a separator with no value after it raises one `expected-id-after` anchored on the comma itself rather than on the following token; a leading comma (`facets ,pii`) is now reported on the comma too rather than on the keyword, which is what the spec always promised; and `realizes` moves onto `expected-id-after` from `expected-property-value`, so the same mistake reports the same way whichever property it is written on (#2551).
- 2418580: `unassigned-domain` now also fires for a `domain` declared directly inside a `system`, not just for a top-level one. Both placements express the same modelling state — "this domain is not assigned to a service" — so the author picks the spelling, not the meaning ([#2184](https://github.com/kompiro/karasu/issues/2184)). Rendering is unchanged: the `(Unassigned)` pseudo-system still wraps only the top-level form, since a system-nested domain already has a container to render in. Files that are silent today may gain this warning; it stays a warning, so nothing that parses now stops parsing.
- 8b673e7: Group by: Boundary now places shared members deliberately (#2176). Boundaries that share a node are banded next to each other where the dependency flow allows it, the shared node is seated on the row of its band that touches the other boundary's band, and a boundary whose members are all claimed by earlier ones takes one of its shared members so it gets a frame instead of vanishing. The band stack is still a minimum feedback-arc-set first and models with no shared members lay out exactly as before.
- 54819f4: The multi-system root view now routes its edges instead of drawing them as straight lines. Edges avoid the cards between their endpoints, fan out across ports, get lane separation, and crossings are marked with hop arcs — the same treatment a single-system view already had. This also reaches the grouped root view, which previously drew bands and frames but left every edge straight. Refs #2363 (#2330).
- c39cc28: Node cards pack everything in their top-right corner into one right-packed lane — `[i] [D] [chip]` — so the annotation badge and the info / deploy buttons can no longer overlap. The badge moves from a circle floating outside the card, where it collided with incoming edges and neighbouring cards, to an inset pill whose label elides at 40% of the card width instead of being clipped. Its text takes whichever ink reads better on the pill.

  Static output (`karasu render`, `/render`, exports) no longer draws the i / D buttons: they are affordances only a live viewer can honour, and are now requested explicitly through the new `nodeControls` render option. Issue #2420.

- 27696e8: Export a shared node-detail-panel field descriptor from `@karasu-tools/core`: `NODE_DETAIL_PROPERTY_FIELDS` (the ordered `{ metaKey, emoji, label }` rows for a node's runtime/type/image/schedule/realizes properties), the `NODE_DETAIL_ROLE_EMOJI` / `NODE_DETAIL_TAGS_EMOJI` / `NODE_DETAIL_TEAM_EMOJI` glyph constants, and the `NodeDetailPropertyField` type. These were previously hand-mirrored between the app's React detail panel and the VS Code webview's string-built panel — with the emoji, labels, and row order duplicated in two places and already drifting. Both renderers now derive that content from this single spec. No `.krs` / `.krs.style` parsing or rendering behavior changes; the detail panels render identically to before.
- 02b0162: Node text legibility batch (#2366 proposals C/D/E): descriptions may widen cards up to 260px and wrap into two lines at word boundaries instead of truncating early (the Latin char-width estimate is now 0.8x, matching real sans-serif metrics); the meta row and client count chips draw theme-aware vector glyphs instead of emoji (🔗👥📦🔐), so SVG output no longer depends on the viewer having a color-emoji font; secondary text (description, role, meta row) inherits the node's text color at fixed opacities instead of low-contrast palette values, and the one edge label color below WCAG AA was fixed (dark edge[delivers] #8B5CF6 -> #A78BFA, 4.22 -> 6.56:1). Node sizes and layout positions shift accordingly.
- 56940c8: Node shape legibility (#2366 proposals F + G): shapes now declare a content inset mirroring their drawn geometry, so node text clears the cylinder's top ellipse, the queue's end cap, the hexagon's side notches and the cloud's wavy outline, and centres on the shape's visual body; hexagon (and wide cloud) cards grow so the notches no longer eat into the measured text width. The `user` shape is redrawn as a rounded card with a fixed-size person medallion on the top edge — wide user nodes no longer degrade into a stretched silhouette, and their text centres on the card below the medallion.
- 2b4bfdc: A `.krs.style` sheet can now set a boundary frame's colour. `boundary#pci { border-color: #C0392B }` repaints one boundary and `boundary { border-style: solid }` every frame, mirroring the existing `edge` / `edge#<id>` pair down to the specificity (1 and 101). Boundaries a sheet does not name keep the cycled hue #2179 assigns. One `border-color` drives the stroke, the tint and the title together, since a boundary's colour is what lets two overlapping frames read as an overlap; `background-color` / `color` set them apart deliberately. `boundary` stays experimental notation (#2234).
- 2ed2daa: Draw the derived team dependencies on the org tab as a third mode, beside the grid and Tree View (#2636). Solid arrows are `sync` dependencies and dashed ones `async`; a muted arrow is a pair where one team sits inside the other in the org tree. Endpoints that resolve to no team are counted in the footer rather than omitted, and the mode is offered only when the model declares an `organization`. Slice B of #2597.
- 3cd6470: `owns` and `contains` accept node reference paths (`owns Shop.Checkout.Payment`), resolved by the shared suffix rule (#2088 slice B, #2548): a bare id keeps its broadcast meaning, a longer path narrows to exactly the node it names, and multi-matches that mix kind or depth draw the new `owns-target-ambiguous` / `contains-target-ambiguous` warnings listing candidate full paths. `ownerIndex` and `boundaryMembership` are now keyed by node full path, and cross-file co-ownership is reported on the merged model (`duplicate-owner-assignment`).
- 81d412f: Add deep permalink support (#1827): `SharePayload` gains an optional `target`
  (view / leaf node / highlight / orgTree) so a shared nest URL opens drilled and
  focused on a specific element/view instead of the whole model. A new `anchorId`
  helper centralizes the `krs-<view>-<id>` element-anchor grammar used by the
  static drill-down SVG and the app history hash for the drillable system/org
  views (contract: `docs/spec/permalink.md`).
- d68cf57: Report dangling physical references and measure physical-layer recovery (#2078).

  Two new warnings, `unresolved-resource-ref` and `unresolved-table-ref`, fire when
  a usecase's `resource <Infra>.<Leaf>` or an entity's `table <Infra>.<Leaf>` names
  an infra block or leaf nothing declares; the message says which half is missing.
  Until now the dotted form was taken as resolved on sight, so a model could
  reference tables of a `database` block that had been deleted outright and still
  render clean. `[external]` references are exempt, and the check is import-coupled
  like `owns` / `contains`.

  `karasu coverage` gains a `physical` section reporting, per infra block, how many
  declared leaves an entity maps and a usecase reaches — separating leaves that are
  referenced but unmapped from leaves nothing represents at all, plus the entities
  carrying no table mapping. Per-domain `score` / `thin` values are unchanged.

- 42c920a: The positional label form (`<kw> <id> "<label>"`) on `organization` / `team` / `member` is now the `positional-label-removed` error, finishing ADR-19 (#2208). Write `label "..."` inside the block instead. Like any error, it stops the diagram from being drawn until the file is fixed — the app keeps showing the last valid render, and `karasu render` / `karasu subtree` exit 1. **Run `karasu fmt` before upgrading**: it rewrites the form into the property form, but only while the form still parses without an error. (#2208)
- 5044b07: Edge endpoints now accept and resolve qualified paths at any depth: `A -> Shop.Checkout.Payment` parses, resolves to exactly that node, and renders as a ghost inside the target's top-level system with the intermediate path shown beneath the card. Lifting the parser's two-segment cap also unlocks deep qualifiers on entity relations.

  Reach is decided by structure rather than spelling: a qualified endpoint must spell the whole path from a top-level `system` down to the target, which is the same condition the renderer can draw. Bare endpoints keep their peer binding, and existing qualified endpoints already spell a whole path, so they resolve exactly as before. A reference that is only a fragment (`Checkout.Payment`) is now reported with the spelling to use instead.

  Two diagnostics move on existing models. `edge-target-ambiguous` is new, drawn when a qualified endpoint matches nodes of mixed kind or depth — reachable when two `system` blocks in one file share an id. And a qualified endpoint rooted at a top-level orphan rather than a `system` now reports `edge-endpoint-not-at-scope`, naming the spelling to use, where it previously reported `cross-system-ref-unresolved`.

  Slice E of #2088; closes #2577.

- 0dd0fc6: Derive team-to-team dependencies from `owns` × the logical edges, and read them from the CLI with `karasu team-dependencies` (md matrix + provenance, or csv). No `.krs` syntax changes: a node with no `owns` of its own now resolves to its nearest owned ancestor's team, co-owned nodes keep every owner, sync and async stay separate, and endpoints that reach no team are reported rather than dropped. Slice A of #2597 (#2635).
- 408c6a8: `realizes` now accepts a comma-separated list of targets on one line (`realizes OrderService, InventoryService`), as sugar for repeated `realizes` lines. Both forms produce the same model and may be mixed within a deploy unit; `karasu fmt` keeps emitting one target per line. A list stays on the line its `realizes` keyword is on, so it never continues across a line break in either direction.

  A malformed list (`realizes A,` / `realizes ,B`) now reports a single diagnostic on the offending comma, instead of the generic `unexpected-token-in-block` on whatever followed. `unresolved-realizes` is likewise reported on the target identifier that failed to resolve, spanning just that identifier, rather than on the whole deploy node.

  The AST type `DeployNodeProperties.realizes` changes from `string[]` to `RealizesTarget[]` (`{ id, loc }`) to carry those per-target ranges. Callers reading `properties.realizes` directly need `.map(t => t.id)`; the compiled `NodeMetadata.realizes` is unchanged and stays `string[]`. See #2167.

- 9df9a56: `realizes` and `handles` accept node reference paths (`realizes Shop.Api`, `handles Backend.Order`), resolved by the shared suffix rule (#2088 slice C, #2549). A rejected form (dangling dot) now reports once and records nothing at these sites — previously `realizes Shop.` silently recorded `realizes Shop` next to a cascade of errors — and the report's range covers the dot. The `handles` one-hop expose rule is evaluated against the resolved domain rather than the reference text, `unresolved-handles` now anchors on the reference that failed rather than on the declaring node, and `karasu fmt` prints `handles` instead of deleting the line. The new `realizes-target-ambiguous` warning lists candidate full paths for mixed-kind/depth multi-matches; `handles` has no ambiguity code, since every candidate the expose rule can reach is a `domain` at the same depth. In the deploy view, a qualified `realizes` now narrows the container it groups into, so two systems' same-named services no longer merge under one (id-collision containers are addressed by their qualified path).
- dbdd3b6: `getReference()` now carries a `groupingConstructs` catalog, so `boundary` and `facet` are reachable from the Reference surface (they were shipped, spec'd, and absent from it — #2316). Each entry says how membership is written, which is what the `facets` property listed on every node kind actually points at.

  Entries carry an `experimental` flag rather than being hidden: experimental notation is listed so it can be found, and flagged so being listed does not read as a stability promise (ADR-2316). The Syntax tab gains a matching `import` / `@import` section and an `experimental?` marker on `SyntaxSection`.

  No change to the `.krs` language — this is a TypeScript API addition only.

- 2b80387: A usecase's bare `resource <id>` now resolves to a unique `entity` of the same
  id (the canonical logical form): the resolver follows `usecase → entity → table
→ database` to derive the same `service → database` edge and read/write tags as
  a physical dot-notation reference, and a physical and entity-mediated reference
  to the same store are no longer double-counted. A bare resource is promoted with
  zero edits — its `unassigned-resource` warning disappears — the moment a matching
  `entity` is declared anywhere in the model; that warning moved from the parser to
  the resolver so the check can span declarations. An ambiguous bare id (>1 matching
  entity) stays unresolved and the collision is surfaced by `entity-anchor-collision`.
  Refs #1908.
- 3fe5d7f: Add `karasu coverage` and `karasu subtree` CLI commands (and the core
  `extractCoverage` API). `coverage` reports per-domain density (usecases /
  entities / resources / edges) over a resolved `.krs` model and flags thinly-modeled
  domains; `subtree` extracts one node's sub-tree as standalone `.krs`. These are the
  structural primitives for the architecture-reverse workflow (#1895).
- e7da348: `boundary` blocks can now be declared inside a node block (`system` / `service` / `domain` / `usecase` / `database` / `queue` / `storage`), not only at the top level. A scoped block's `contains` resolves against that node's **direct children**, so it can only ever name one node — the ambiguity a top-level `contains` has when the same id exists at several levels (#2036) cannot be written in this form.

  Two diagnostics come with it: `boundary-not-in-context` (error) when a block sits in a kind that draws no canvas of its own, and `duplicate-boundary-id` (error) when one scope declares the same boundary id twice. Existing top-level `boundary` blocks are untouched, including their behaviour on duplicate ids.

  `karasu fmt` preserves scoped `boundary` blocks, and `duplicate-node-id-parent` now also covers the children of a top-level `database` / `queue` / `storage` block — previously that check was only seeded from `system`, top-level `service` and top-level `domain`, so a system-less infra block with two same-id children parsed clean. Models relying on that gap will start reporting the duplicate.

  This first slice covers the grammar, the scope-keyed membership index and the diagnostics; frames for scoped boundaries are wired into the renderer in a follow-up.

- 705380c: Scoped `boundary` declarations (experimental, #2036) now carry a scope-qualified group identity: a same-named boundary declared in another scope is a different boundary — its frame, label, and collapse state are independent per scope, and its collapse stub is titled with the bare boundary id. Top-level boundaries are unchanged (one declaration, one shared collapse state across levels). Also documents the scoped form in the syntax spec and ships a `scoped-boundary.krs` feature sample.
- a0919d1: Scoped `boundary` blocks now draw their frames. Under _Group by: boundary_, a `boundary` declared inside a node block frames that node's canvas — the service's drill-down view, the domain's usecase or entity view, an infra block's leaf view — and appears nowhere else. Top-level `boundary` blocks keep their model-wide reach unchanged; where both name the same node, the scoped block wins, being the more specific declaration.

  The axis reaches every render surface: interactive compile, the drill-down and all-layers bundles, the entity view and diff mode. In diff mode a node removed from a scoped boundary stays framed in its former boundary, matching the top-level and team axes (#1886).

- 3b3e606: Edges now stop on the shape that is drawn, not on its bounding box. A `user` card's arrowhead no longer lands in the empty corner beside the medallion, a cylinder's no longer floats above the rim, and a cloud's reaches the blob instead of the box above it. Shapes declare this themselves — which parts of each side their outline covers, and how far in it sits — so a new shape brings its own attachment rule.

  The card's own chrome (the corner lane of #2420, the boundary tabs of #2179) keeps ports out of the way where an edge has a bend that can absorb the move; a straight edge stays straight. Diagrams built only from rectangles are unchanged. Issue #2422.

- bf5fac5: System-view edges now avoid obstacles in the default (Group by: none) view, not just in the grouped view. Same-layer and upward edges are routed orthogonally, blocked edges detour through an inter-row channel or a side gutter, and no edge is drawn through a node card it does not connect to. Measured over the bundled examples, penetrations in the ungrouped view went from 10 to 0 while the grouped view is unchanged. Refs #2362 (#2330).
- dd45b2b: Publish the language version (`.krs language v1.0`): new `KRS_LANGUAGE_VERSION` export in core, and `karasu --version` now prints two lines — the real package version (fixing the previously hardcoded `0.0.0`) and the language version the build implements (ADR-2124).
- 711b74e: Draw `entity` relations on a `database` canvas. Drilling into a store now shows
  table-to-table edges projected from entity relations whose both endpoints carry a
  `table <Db>.<leaf>` mapping into that store, with no change to the `.krs`. Each
  projected edge keeps the relation's label and `->` / `-->` kind and carries the
  new system-assigned `[projected]` tag (colour only, sky blue by default), so it
  reads apart from an edge the `.krs` records. Relations touching a tableless
  entity, or spanning two stores, are not projected; the view is documented as
  lossy. Slice A of #2585 (#2721).
- d5bdbcf: `karasu coverage` now diffs, per `database`, the table relations the `.krs`
  records against the entity relations projected onto that store. Four new
  `InfraCoverage` lists of ordered `{from, to}` leaf pairs:
  `recordedWithoutProjection` (the store states a relation the logical model
  lacks), `projectionWithoutRecorded` (application-level integrity, reported as a
  fact), `directionMismatch` and `kindMismatch` (disagreements the canvas resolves
  toward the recorded side). Shown as a table in the markdown output and carried
  through `--format json`. Slice C of #2585 (#2723).
- 436d4d4: Report structural overlap — a node owned by one team living inside a node owned by another (#2637). No edge crosses that boundary, so the team-dependency join is blind to it, yet the two teams still have to agree on the enclosing structure. Both ends must declare `owns`: an inherited owner is by definition the enclosing team, so inheritance never reads as an overlap. `karasu team-dependencies` gives it its own markdown section and a `structural-overlap` row in csv, and the org tab's dependency graph counts it in the footer rather than staying silent about a fact it cannot draw. Slice C of #2597.
- 5149616: Add an opt-in `groupBy: "team"` system-view render option (#1858, P2a slice A). When set, nodes are bucketed into their owning team (from the `organization`/`owns` block), the teams are stacked in dependency order (min feedback-arc-set), and each team is enclosed in a boundary frame. Omitting the option leaves the default kind-tier layout byte-for-byte unchanged.
- f08530d: Add `tag-not-builtin` / `annotation-not-builtin` deprecation warnings: any tag or annotation name outside the tool vocabulary (builtin tags + system-assigned tags / the four builtin annotations) is now warned as deprecated, pointing at the migration targets (the upcoming facet construct for membership labeling, builtin-addition requests for new archetypes / lifecycle states). Parse behaviour is unchanged (ADR-1314 freeze); syntax v2.0 will accept tool vocabulary only, still as a warning. Part A of the tags-and-facets design (#2159, refs #2065).
- 26cd7e2: Warn when a builtin tag is used on a node kind outside its applicability (`tag-not-applicable`).

  `appliesTo` was declared for every builtin tag, exposed through the reference API and printed in the spec table, but nothing validated it — so `service Api [index]` parsed with exit 0, rendered no badge, and said nothing. From the author's side that is indistinguishable from a typo.

  **Behaviour change:** models that were silently inert now emit a warning. Files still parse; nothing becomes an error. Two redundant spellings start warning in particular — `storage Bucket [storage]` and `queue Q [queue]`, because `[storage]` / `[queue]` are resource _shape_ tags (`appliesTo: ["resource"]`) and carry no meaning on the infra block itself. Remove the tag, or move it to a `resource`.

  The diagnostic never fires together with `tag-not-builtin`: a name outside the builtin set has no applicability to violate.

- 838cd1a: `.krs.style` can now set a team frame's colour in the system view under _Group by: team_. A team is one entity with two renderings — the card in the org tree view and the frame here — so `team`, `#<TeamId>` and the new `team#<TeamId>` compound address both, each property landing on the part of the frame that answers to the part of the card it paints. Teams no sheet names keep the muted dashed frame: the built-in sheet's `team { … }` styles the card only. Also fixes three things the new spec section surfaced: `karasu fmt` re-emitting `boundary#<id>` as the wider bare `boundary`, `border-style: dotted` rendering identically to `dashed` on every group frame, and a non-numeric `border-width` reaching the SVG as `stroke-width="NaN"`. See #2269 / ADR-2269.
- d42a2b1: Give each annotation's default badge a per-theme color pair. `defaultBadge.color`
  in the reference payload is now `{ dark, light }` instead of a single (dark)
  string, and the light palette moves from `default-style.ts` into
  `reference-data.ts`, so the built-in stylesheet and any consumer showing a badge
  resolve the same value for the active theme. The Reference panel painted the
  dark palette under the light theme before this (#2482).
- 48ed39d: `translate --from db` now scaffolds conceptual entities and relations. In the
  default (aggregate) granularity, after the physical `database` block it emits a
  provisional per-database `domain` with one `entity` per aggregate root (mapped
  to its table). Cross-aggregate FK links become entity relations; a relation
  derived purely from a Soft FK (a `<stem>_id` / `<stem>_code` column with no
  declared `REFERENCES`) carries the new auto-assigned `[inferred]` tag, while an
  explicit FK leaves it untagged (confirmed). `[inferred]` renders in a muted
  grey, orthogonal to `[sync]` / `[async]` line style. `--granularity table` is
  unchanged. Refs #1909, #1870.
- 5bbaa41: `translate --from db` now records each foreign key as a `table -> table` edge
  inside the emitted `database` block (declared FKs untagged, Soft FKs
  `[inferred]`; a folded child's FKs roll up to its aggregate root), so a schema
  dump with no `entity` layer gets a store ER view straight away. The `database`
  canvas unions these recorded edges with the projected entity relations: one
  edge per pair, drawn as recorded, labelled from the relation when the record has
  no label; an opposite-direction conflict draws the recorded side only. Slice B
  of #2585 (#2722).
- 4e29bf4: The system view now draws crossing marks (hop arcs) in the **ungrouped** view too — Group by: none — not only in the Group-by view (#1956). So the default view's edge crossings read unambiguously (crossing ≠ connection). Junction dots stay grouped-only, since the ungrouped view has no aggregation trunks. Views without any crossing are unchanged.
- 4613295: Export a `NODE_DETAIL_KIND_ICON_NAMES` kind→icon-name map from `@karasu-tools/core`, the single source of truth for the node detail panel's header pictogram (each surface maps the icon name to its own form — an SVG pictogram in the app, an emoji glyph in the VS Code webview). This resolves the panel's kind→icon divergence in the VS Code preview (#2068): a `usecase` node no longer shares `domain`'s icon, and `store` nodes now get a distinct icon instead of the generic `■` fallback. The two renderers can no longer silently drift because they consume the same exported map.
- 4b68d69: Nesting a logical node outside its parent's documented children now emits the `node-not-in-context` warning (#2165). The **May contain** column of the Logical structure table is the single definition of the rule, and the parser enforces it: a `usecase` written inside a `client`, for example, is still parsed and drawn but is reported as carrying no defined meaning there. A `domain` declared directly inside a `system` is now recognised as a valid placement (a domain not yet assigned to a service) and no longer differs between the spec and the implementation. This is a warning, not an error — `.krs language v1.0` is frozen (ADR-1314), so every file that parses today keeps parsing; promotion to an error is registered to the Syntax 2.0 program (#2162), i.e. `.krs language v2.0`.
- cdd5cb5: Under _Group by: boundary_, a node listed in more than one `boundary` is now enclosed by every frame that can reach it — the frame widens out of its band into a rectilinear outline, and the node is still drawn exactly once. Each boundary gets an identifying colour (stroke, faint fill and title), without which two overlapping frames read as one nested in the other. A frame is widened only when the corridor to the card holds no non-member, so no frame ever encloses a node it does not contain; where it cannot reach, the card carries a dashed `◇ <boundary>` tab and the view reports the new info diagnostic `boundary-membership-not-drawn`. Team frames are unaffected. Slice B of #2161 (#2179).
- ed815ca: Add `karasu translate --from wrangler`: extract a Cloudflare Workers app's physical layer from its `wrangler.toml`. Emits an engine-neutral logical `system` (the Worker `service`, binding-derived `database` / `storage` / `queue` infra, and edges) plus a physical `deploy` where the concrete Cloudflare technology lands in `store { type ... }` — never in a logical label. Mapping: D1 → `database`, R2 → `storage`, Queues → `queue`, Vectorize → `database [index]`, KV → `database`, Workers AI / Durable Objects → `service [external]`, service bindings → communication edges. Unknown bindings are skipped with a warning. The App's translate dialog gains a "Cloudflare wrangler.toml" option. See #1943.

### Patch Changes

- 000b500: Stop drawing an edge whose source is not the block that declares it. An explicit
  edge inside a `service` / `domain` / `entity` block must start at that block
  (`edge-source-mismatch`); the rejected declaration is now drawn on no view —
  including the entity view, where the same rule is what fixes a relation's
  direction — so the error is the only signal. Edges in blocks that carry no
  origin-scope rule (`client`, `database`, `queue`, `storage`) are unchanged.
- 0e6ab50: Add a `boundary-clusters.krs` feature-samples example demonstrating the
  experimental `boundary` / `contains` grouping axis (P2b-C). Documents the
  `boundary` construct in `docs/spec/syntax.md` and registers it in the
  `docs/roadmap.md` post-v1.0 experimental notation watch. Refs #1974.
- b76a1d3: Keep the edges into a collapsed `infra` / `external` category on the multi-system root view: they now re-target onto the category stub as aggregation trunks, the way the single-system view already did, instead of being dropped so the stub was drawn with nothing pointing at it (#2646). Each system also gets its own stub, so two systems folding the same category no longer collapse onto one card.
- 62571e1: A `client` owned by a team now shows the `👥` owner chip on its system-view card and the team row in the detail panel, and a `client` a deploy unit `realizes` now gets the deploy-view jump button — both were silently dropped even though `owns` / `realizes` resolved (Issue #2157, following ADR-1720). The chip and the detail panel now show the team's declared `label` (falling back to its id), matching how `Group by: team` frames title themselves; navigation still resolves by team id.
- 9d67f29: Fix the `--help` Examples of `karasu append`, `apply` and `insert`: they taught `label: "…"`, which the parser rejects, and a `usecase` placed directly under a `service`, which the validator warns about. Every `.krs` snippet in `--help` is now parse-checked by a test.
- 7cd1c75: Honor `LC_MESSAGES` when resolving the CLI's output locale. The message-catalog
  locale now follows the POSIX precedence `LC_ALL` > `LC_MESSAGES` > `LANG`, so
  the standard `LANG=en_US.UTF-8 LC_MESSAGES=ja_JP.UTF-8` split (English
  formatting, Japanese program messages) selects the Japanese catalog.

  This affects every localized string the CLI emits, not only `karasu render`'s
  resolver warnings: `karasu diff` and `karasu lint-style` diagnostics, and the
  422 bodies `karasu serve` returns to the browser. Note that `serve` resolves
  from the _server_ process environment while the app UI resolves from the
  browser, so the two can now disagree if you set `LC_MESSAGES` for the server
  but browse with a different language.

- af617fd: Fix false `contains-target-not-found` / `owns-target-not-found` warnings in
  project (multi-file) mode. A `boundary … contains` member or a `team … owns`
  target declared in an imported file no longer warns — reference existence is now
  validated against the merged id-space instead of per file. Genuinely missing ids
  still warn. (#2032)
- 166a983: Deploy containers now carry `data-realized-node-id`, the bare id of the node
  the container realizes, beside their `data-container-id` identity. A viewer
  matches a cross-navigation highlight against it, so a container whose id is
  qualified (`Shop.Api`) or quoted (`"www.example.com"`) is found from the
  node's own id and vice versa (#2818, ADR-2714). The attribute is absent when no
  single node answers to the bare id.
- 00799ea: Keep parallel edges apart when both endpoints are services expanded in place. The bundling pass now separates any edge still drawn on a sibling's line instead of only ghost and cyclic edges, so a `S1 -> S2` / `S1 --> S2` pair no longer collapses into one arrow (#2477, ADR-2477).
- 6220857: Compute edge crossing marks once per view, on the placement that wins the width-budget search, instead of once per candidate. Dense views lay out faster; the drawing is unchanged (#2761).
- bbac2b2: Deploy view: when two systems declare a same-named service and infra, each system's `service → infra` dependency edge is now drawn between its own containers instead of the second one being dropped, and an edge no longer lands on another system's same-named container when the system's own node is not deployed (#2817).
- 6566f82: Diagnostic locations now point at the file and line they are about (#2715). In a multi-file project, `karasu render` used to print a problem found in an imported file (or decided across files) as a line of the entry file, often one that did not exist; it now prints that file's path. Printed lines and columns were also one too high, even in a single file, and are now exact. A `.krs.style` syntax error is reported against the sheet, with its line. `SourceRange` gains an optional `file`, set when `Parser.parse` / `StyleParser.parse` are given a path.
- 94fa80a: Fix the drill-down "← Back" control being buried under the level canvas rect in the bundled all-views SVG and its popup preview. The back button is now painted after the level content so it stays visible and clickable, restoring Back navigation (#2044).
- 75c3aec: Fix the deploy view giving two containers one id when a node id itself contains a dot. A quoted id such as `service "Shop.Api"` spelled the same string as the qualified path `Shop.Api`, so the two containers shared `data-container-id` and every ghost edge addressed to that id landed on whichever was drawn last. Container ids now quote a segment that carries the separator, a double quote or a backslash, or is empty (`Weird."Shop.Api"`); an id with none of those is unchanged.

  The consumers that match a container against the node it realizes, namely the system view's deploy-jump button and the draw.io metadata lookup, now key on the node's own id, so a dotted id keeps both. Two behaviors change alongside: a ref that narrows to one of several same-named nodes (`realizes Shop.Api` while `Admin.Api` also exists) no longer lights the deploy-jump button on both of them, and in the draw.io export two same-named services with qualified container ids each keep their own tags and annotations instead of sharing whichever was read last (#2714, ADR-2714).

- 3fbb69b: Text is centred with an em-unit `dy` instead of `dominant-baseline`. The attribute belongs to the SVG text module, which rasterizers outside the browser drop without a word — the text then falls to its baseline and sits 3 to 4.5px too high inside its card. `dy` is core SVG 1.1, so an exported diagram now reads the same in Inkscape, CairoSVG or an Office import as it does in a browser. Positions move by at most 0.35px; layout coordinates are unchanged. Issue #2473, ADR-2473.
- c119283: `karasu fmt` keeps a qualified edge endpoint spelled as the author wrote it: `-> Shop.Checkout.Payment` no longer comes back as `-> "Shop.Checkout.Payment"`. The target's segments now travel on the AST beside the joined form, so the endpoint serialises segment by segment like every other reference site (#2650).
- 5610ba9: Auto collision-avoidance for edge labels (#2048): edge labels that would overlap a node card or another label are now nudged off the collision in a bounded, deterministic layout post-pass. Diagrams with no label collisions render byte-identically, and author-set `label-position` / `label-offset` still win.
- 908bf54: Cross-domain entity relations resolve by the shared suffix rule (#2088 slice D1, #2575): when two domains share an id, a qualified relation now resolves to the domain that actually declares the referenced entity, instead of being silently dropped because the first-declared domain occupied the lookup slot.
- 94b28bf: Render an in-place-expanded container's frame prominently — a solid accent border with a faint tint — so an opened service stands out instead of blending into a busy diagram as the muted dashed team-frame style did (#1921 feedback).
- 1441472: Stop `[external]` side-column cards from overlapping. The column divided its content span into equal steps, which folds the cards into each other once there are more of them than the span can hold — 14 externals overlapped by 25px each on a real model. A column that no longer fits now stacks at a fixed clearance and the system frame grows to wrap it; a column that already had room keeps the placement it had.
- 4032371: system view: keep an `[external]` service on the side its own consuming hubs are on when every hub sits on one half of the diagram. The side split compared each external against the median of the hub barycenters, which always lands inside the set and so split it whatever the hubs were doing — stranding the lowest external in the far column with its edge crossing the whole figure. The median is now used only when the barycenters straddle the content centre, which is the case it was chosen for (separating two hubs' fans, ADR-1728). Diagrams whose hubs straddle the centre are unchanged.
- 67a5f17: Rendering large models is faster: every drill-down level of an export bundle no
  longer rebuilds the whole-model indices (resource maps, entity and ghost-endpoint
  resolvers), and cross-system endpoint lookups scan only same-named nodes. About
  20% off the all-views bundle of a 400-level model; the output is unchanged (#2759).
- 9c85481: fix(core): stop distinct edges overlapping in the expanded "Group by" view (#1927, follow-up to #1859 P2c-B). Single-incoming gutter edges now get their own lane so two corridors no longer render as one collinear vertical line (a false connection), and the edges leaving **or entering** one node on the same side are fanned across the node's edge so their horizontal stubs no longer overlap into one line (this also fixes an incoming edge sitting on an outgoing edge when a team is collapsed). Trunk siblings keep their shared merge entry; lanes stay clear of aggregation-trunk lanes; every route stays outside all cards/frames (no node/frame penetration).
- 3ce2018: `karasu fmt` now keeps annotation parameters. `@draft(confidence: "low")` came back as a bare `@draft` and `@deprecated(until: "2026-12-31")` as a bare `@deprecated`; on the organizational axis the annotation was dropped whole, so `team payments @migration_target(from: "legacy")` formatted to `team payments`. The parser read these and the compiler consumed them; only the formatter never emitted them, on the one command whose contract is "reformat, change nothing". A display-only value (`until` / `confidence`) emits quoted, a node reference (`from`) emits like every other reference. Closes #2571.
- 9ca779b: Escape embedded quotes, backslashes and newlines in emitted string values. `karasu fmt` previously wrote `label "say "hi""` for a label containing a quote, producing a file that no longer parses; `karasu translate --from openapi` emitted an unparseable model when an operation `summary` contained `"""`. Values now round-trip through both commands, and a description containing `"""` falls back to the single-line form. Closes #2087; see ADR-2087.
- e2ac2c8: Fix `karasu fmt` silently deleting top-level constructs. `boundary`, `legend`, `client`, `database`, `queue` and `storage` blocks declared at the top level were parsed and rendered but dropped by the formatter — a file made only of top-level infra blocks (the shape `karasu translate --from db` emits) formatted to an empty file. All top-level constructs now round-trip. Closes #2076; see ADR-2076.
- 8df8b2e: Group-collapse (`groupBy: "team"`) now re-anchors a collapsed member's ghost-system connectors onto its `<Team> (N)` stub. Previously the ghost-edge lists kept referencing the folded member id, so the connector fell back to the surrounding container border instead of the stub (#1874).
- 58abad8: Fix system-view "Group by: team" in compare/diff mode (#1886): a node removed in
  the after-slice now renders inside its former team frame (grouping uses the merged
  before ∪ after ownerIndex, after wins) instead of dropping to the trailing band,
  and a wholesale-removed team draws an all-removed frame. Collapsed-team stub edges
  keep their diff decoration — re-keyed onto the stub id and folded across the
  aggregated originals (single state carries through, a mix reports `changed`).
- 4901609: Fix: `groupBy: "team"` (and `collapsedGroups`) is now applied in the multi-system
  root view, not only when focused on a single system. Previously the multi-system
  layout branch silently dropped these options, so team boundary frames and
  per-team collapse disappeared as soon as a model had two or more systems — which
  coincided with the presence of a cross-system (ghost) edge. Grouping is applied
  per-(system, team): a team that owns members in two systems is framed once inside
  each system. (#1884)
- a08e18d: Group-by (`groupBy: "team"`) now keeps the overall user → client → service → infra → external flow: team bands occupy the service tier's slot, with actors/clients above and un-owned services, infra and external below, instead of pushing every un-grouped node beneath the team bands (#1858).
- e5a3e43: Refine the multi-system Group-by-team fix (#1884): collapsed-team stub ids in
  the multi-system root view are now namespaced by system id at generation
  (`__group_collapsed_<sys>_<team>__`) instead of being de-collided by a post-hoc
  rewrite. A team spanning systems keeps one stub per system by construction.
  Single-system output is unchanged.
- 2c83d44: Draw an unpainted container frame in the theme's chrome instead of the cascade's card default (#2662). A group frame and a ghost ancestor container took their title and outline from `DEFAULT_NODE_STYLE`, which is hard-coded to the dark palette, so on the light theme the title was near-white (`#F9FAFB`) on a white canvas. Both now fall back to the chrome palette's `textPrimary` / `mutedBorder`, the roles `org-tree-renderer.ts` already names for the same two jobs. A colour any rule names is unaffected: the fallback is chosen from which properties the cascade applied, so naming the base hex on purpose is honoured rather than read as silence.
- e948669: Fix grouped (Group by → Team) system-view edges that ran straight through node cards when a plain side-gutter reroute was blocked on both sides — a flanked infra target or an actor-row-blocked source (#1954). Such edges now take a mixed route: a side stub on the clear endpoint and a top/bottom inter-row channel detour on the blocked one. The #1927 lane-separation and port fan-out passes were generalized to cover these routes, so the fix reaches zero node/frame penetration and zero collinear overlap together (verified on `examples/en/getting-started`).
- 423054d: Draw a crossing so it reads as a crossing. The hop arc's radius goes from 4px to
  6px in every view: 4px was chosen when nothing competed with the arc, and on a
  real model at 6x zoom it reads as a nick in the line rather than a mark, which
  is the one thing the mark must not do. 6px is the ceiling, bounded by the
  spacing of the ports along one card side rather than by the lane pitch, and a
  raise past it now fails a fence instead of degrading quietly.

  Also fixes an arc that was drawn flat inside the trunk band it hops. The taller
  arc a band-riding crossing is given never reached the SVG, because the renderer
  wrote the default radius as every arc's height, so a crossing over a wide band
  read as a line merging into it. Routes, ports and canvas size are unchanged.

- 4e29bf4: Crossing hops now break the host edge's line where they arc, so a hop reads as a real jump-over instead of an arc sitting on top of a continuous line (a "half-moon"). The crossed line stays continuous — it is the through-line the hop jumps over. Part of the #1859/#1939 crossing-marks work.
- 0711b92: Fit node text to the card in icon display mode (#2533). A label longer than
  the fixed 160px card used to be drawn at full length, running out of its card
  and printing over the neighbouring label; it is now truncated with an ellipsis.
  Descriptions wrap against the icon card's own width instead of the shape-mode
  content box, which on a 160px card left 80px and broke them into two-word
  stubs. Shape mode is unchanged.
- d3d0484: Stop two owns/contains diagnostics from false-firing in the editor on ordinary cross-file models. `contains-target-not-found` now declines to decide in a document that still has imports to resolve, the way `owns-target-not-found` already did — the member may be declared in an imported file, and a cross-file `system` reopen can add the child a scoped `contains` names. `invalid-owns` now reports only what its name says: a target that **resolves to a node** of an unownable kind. An id that resolves to nothing is `owns-target-not-found`'s verdict alone, so a cross-file target draws nothing in a single-document context, and a plain typo draws one code instead of two (#2410). Owning a node of a kind the existence check does not track — an `entity`, `usecase`, `resource` or `user` — still draws both codes; that residual is #2442.
- 77b01e5: Multi-file imports no longer merge away edges that only share their endpoints. A `->` and a `-->` over the same pair, or two edges with different labels, now both survive a `system` reopen and a named import, matching the `(from, to, kind, label)` dedup identity in `docs/spec/syntax.md` (#2780).
- 976101a: Keep the edges declared in a reopened infra block's body. Merging the same
  `database` / `queue` / `storage` id across files unioned its leaves but dropped
  `sessions -> users` written in the block body, so a store declared in two files
  kept its tables and silently lost the relations between them (#2754).
- f79a369: An edge that has to detour around an obstacle now takes a lane between columns when one is clear, instead of always running out to the edge of the diagram. On the bundled examples this cuts total edge length in the default view by about 6% and removes three crossings, with the widest single improvement being 42%. Grouped views are unchanged. Refs #2365 (#2330).
- 49a1915: Stop warning `invalid-owns` when a team owns a `database` / `queue` / `storage`. Infra blocks are owns targets per the spec, and the existence check already accepted them, so `team backend { owns OrderDB }` drew a warning saying the kind cannot be owned while nothing else objected. Both owns checks now read one shared kind enumeration (`OWNS_TARGET_KINDS`), and infra nested inside a `system` counts the same as a top-level block. An infra leaf (`table` / `queue-item` / `bucket`) and a `capability` are still rejected (#2408).
- 6a23d24: Hyphenated vocabulary names now lex as one name. `[my-team-internal-tag]` parses as a single tag instead of seven silent fragments, and the same kebab-case rule applies to annotation names (`@my-mark`), legend `ref` targets, and (as before) `capability` names — all through one shared helper. A kebab-case tag written in `.krs` now matches the same spelling in a `.krs.style` selector, and `tag-not-builtin` reports the name the author actually wrote. (#2509)
- 591c3ce: Route an edge that spans several rows through the columns between the cards
  instead of out to a gutter. An interior corridor is now reached the way a
  gutter route is — a side stub when that is clear, a top/bottom port and the
  inter-row channel when a sibling blocks it — and an edge whose endpoints are
  rows apart may take one gap of every row in between. Where a row leaves no
  column at all, one is reserved and the placement is run once more, within the
  existing two-pass bound. Measured on a 10k-line reverse-engineered model
  (20 views, 1,102 edges): edges leaving the content for a gutter 987 → 592,
  segment crossings −17.3%, route length −12.8%, canvas area −9.7%, and
  collinear overlapping segment pairs 3 horizontal / 13 vertical → **0 / 0**.
- ed203a7: Fix legend swatches ignoring the cross-sheet declaration order, so a `.krs.style` rule that ties a built-in rule on specificity now wins on the swatch exactly as it does on the node it stands for (#2445). The cascade itself moved into one shared function that both the style resolver and the legend read.
- 15fc524: Light-theme badge colors (deploy kinds oci/lambda/jar/war/function/assets/job/artifact/store and the new/experimental annotations) are darkened so badge labels meet WCAG AA (>= 4.5:1) on the white canvas; previously `function` rendered at 1.92:1. The light `edge[implicit]` label color moves off the same illegible hex (#D97706 -> #B45309). A contrast regression test now guards every builtin badge-color (and the palette badge fallback) in both themes. Refs #2366 (proposal A).
- 43acb9f: Place a lone `[external]` service on the side its consumers are on. When only one external was auto-assigned (or several shared the same consuming hubs), the median split collapsed onto that value and the "ties go left" rule sent every one of them to the left column regardless of where the calling services sat, so edges crossed the whole diagram. The degenerate case now compares the consuming-hub barycenter against the content centre instead. Fixes #2384, refines [ADR-1728](https://github.com/kompiro/karasu/blob/main/docs/adr/1728-external-on-sides-layout.md).
- 0077eb9: Report a deploy unit id declared twice in one `deploy` block, and stop a container from reserving a grid cell for a unit it will not draw (#2713). `duplicate-node-in-deploy` previously fired only when a wildcard import merged the collision; a single file, and both named-import routes, said nothing.
- 1d745f3: A deploy unit that names the same `realizes` target twice now declares one relation instead of two (#2552). The repeat is dropped wherever it sits — later in the same comma list or on a line of its own — and the unit joins that target's container once, so the container no longer reserves a grid cell for a unit that is drawn only once. Two refs that resolve to one node (`realizes Api` alongside `realizes Shop.Api`) stay two entries in the model, each keeping its own range for the reference diagnostics.
- d73d45c: `duplicate-boundary-assignment` is now decided on the merged model, so a node
  listed in a `boundary` in one file and another `boundary` in a second file is
  reported once instead of going silent (#2221). Boundary membership is rebuilt
  from the merged declarations rather than unioned per file, so the index and the
  diagnostic have one derivation.
- 66b5fab: Converge the multi-system root view with the single-system layout pipeline
  (#2521). The root view now sizes its canvas around routed edges instead of
  container rects alone, so a dense fan-in no longer draws trunk lanes outside
  the viewBox (#2513); it seats edge endpoints on each shape's drawn outline
  like every other surface does (#2515); and both pipelines share one
  placement pass, which fixes an off-by-one-gap wrap threshold and brings
  crossing minimisation to drill-down views (#2514). Six bundled examples gain
  fewer edge crossings as a result.
- e929dd6: Fix multi-view and all-layers diagrams being cropped to the top-left in the preview when larger than the pane. The composed root `<svg>` now carries a `viewBox` matching its `width`/`height`, so it scales responsively under `max-width/max-height: 100%` like single-view renders (#1790).
- 5258f90: Edge labels no longer sit on top of another edge's line. The label placement pass now treats every drawn edge polyline as an obstacle (a label's own line is exempt), so text and stroke stop being drawn over each other. Measured across `examples/en`: 49 labels on a foreign line → 0. Diagrams with no collision are unchanged. See [#2360](https://github.com/kompiro/karasu/issues/2360) / ADR-2360.
- dbb4711: `node-id-multiple-locations` no longer depends on declaration order within a file (#2550): candidates are collected first and the verdict is decided afterwards. The warning is now a logical-layer verdict: it fires when two or more `service` / `domain` / `client` declarations share an id at different paths, while same names across the logical/physical boundary and within the physical layer (`database` / `queue` / `storage` and their sub-resources) are tolerated silently, physical references being dot-qualified. `nodePathIndex` keeps the `@migration_target`-priority winner (infra leaves inherit their block's annotations; ties keep the first declaration in traversal order), and parked (system-less) services and clients are now indexed and addressable. Fixes deep permalinks / viewPath silently resolving to the wrong node. Cross-file collisions still merge first-file-wins (#2596).
- 384f74e: Decide node-id multiplicity on the merged model. `nodePathIndex` was the last derived index the import resolver merged with a first-file-wins union, so `node-id-multiple-locations` went silent across files and a bare-id permalink resolved to whichever file merged first: a `@migration_target` service in an imported file lost the index entry to the `@deprecated` one it was replacing. Nodes brought in by a named import now get an index entry too, so deep links to them resolve. See #2596. One collision that used to be silent now reports: a whole-file import of a file declaring a top-level `service X` alongside a `system` that declares its own `X` leaves two nodes in the merged model, and bare-id navigation resolves to only one of them.
- 1e8acaf: Report one code, not two, when a team owns something it cannot own. `owns U` on a declared `user` (or `usecase` / `entity` / `resource`) used to draw both `owns-target-not-found` and `invalid-owns`, because the existence check filtered its id set by ownable kind and read "no such ownable node" as "not found". Existence now asks only whether a node with that id exists, so every kind refusal comes from `invalid-owns` alone, and its message names the kind it refused instead of claiming no service or domain has that id.

  Owning a `system` id changes verdict rather than count: it drew `owns-target-not-found` before and now draws `invalid-owns` naming `system`, because a system does exist and refusing it by kind is the accurate thing to say (#2442).

- 44dfbfc: Fix a false `owns-target-not-found` warning on named imports. A team owning a node brought in by `import { X } from "./f.krs"` warned even though the merged model resolves it, while the identical declaration reached through `import "./f.krs"` did not. The `owns` valid-target set is now derived from the merged tree instead of the per-file `nodePathIndex`, so the verdict no longer depends on the import form — and a top-level (system-less) `service` is recognised as an ownable target in single-file models too (#2082).
- 4b79ec9: Draw every derived edge on the root view, not just the declared ones

  A root view with more than one system, and the `Unassigned` root that a model
  with no `system` block gets, drew only the dependencies written as an explicit
  arrow. The same dependency expressed the way the spec recommends — through a
  `usecase`'s `resource` reference, a `delivers` declaration, or cross-service
  domain edges — rendered as disconnected boxes, and a collapsed `Infra` layer
  showed a stub with nothing pointing at it.

  Each system frame now draws the edges derived from its own children, so those
  dependencies appear wherever the system sits. Compare mode keeps a removed
  derived edge visible and marks it on the system that lost it. Drill-down and
  single-system views are unchanged.

- f681a62: Rendering dense diagrams is faster: the routing chain now asks a spatial index for the obstacles near a candidate route instead of testing every card and frame on the canvas. Output is unchanged (#2790).
- 71e070d: A `boundary` declared inside a `system` (or a `database` / `queue` / `storage`)
  that another file reopens now reaches the merged model instead of being silently
  dropped (#2246) — it frames its members like any other scoped boundary. Two
  files declaring the same boundary id in one scope now report
  `duplicate-boundary-id` once, decided on the merged model.
- 21921a1: Render edges declared inside a `service` block. `service S1 { S1 -> S2 }` is the
  spelling the edge origin scope rule asks for, but it used to render on no view
  at all for any target; it now draws wherever the declaring service is a node
  (system view, system drill-down, the `Unassigned` frame), and a qualified target
  feeds the same ghost-system path as the `system`-scope spelling. The
  `edge-endpoint-not-at-scope` warning stops firing for the placements that now
  render ([#2223](https://github.com/kompiro/karasu/issues/2223)).
- a1521f8: Shape mode now draws an external SVG icon (`shape: url(...)`) as a proper card:
  the `background-color` / `border-color` / `border-width` / `border-radius` you
  declare are painted behind the icon, and the icon body keeps its `viewBox`
  aspect ratio instead of being stretched to the card the text measured. Icon
  mode is unchanged (#2696).

  **This changes how an existing shape-mode `url()` node looks**: it used to draw
  the icon alone on the canvas, and now draws it on the card its style declares —
  which until now was silently dropped. Add `background-color: transparent;` and
  `border-width: 0;` to that rule to keep the icon on the bare canvas.

  With that migration target shipped, **icon display mode is deprecated** and
  will be removed in the next major version — use shape mode with
  `shape: url(...)` instead (ADR-2376).

- 7546530: Shape mode now draws a card-design icon (`shape: url()` with `krs-label` /
  `krs-description` slots) as a native-size pictogram in the card's top-left
  corner plus the normal text stack, so the card keeps the meta row, `role` and
  the client resource / capability chips it was measured for, wraps its
  description, and no longer leaves the reserved height empty (#2803). Icon mode
  is unchanged. Card sizes and layout are unaffected.
- a9a7706: Rendering dense views is faster: the crossing-mark pass and the edge-label placement pass look up nearby segments and rects through a spatial index instead of testing every pair, so a big canvas (hundreds of edges) no longer spends most of its render time in those two passes. The output is unchanged: the same crossing marks and the same label positions, byte for byte (#2760).
- a215752: Add a `team-dependencies.krs` feature-samples example that exercises every signal the team-dependency derivation produces: cross-team with sync and async kept apart, a nested pair, an unowned endpoint, and structural overlap in both of its relations. The bundled examples had none of them, so the feature shipped with no model a reader could open to see it. Refs #2597.
- 2b4b7bb: Resolve the display language by the whole primary subtag instead of a `ja` prefix, so a user whose environment reports Javanese (`jav`, `jav-ID`) or Jamaican Creole (`jam`, `jam-JM`) gets the English fallback rather than a Japanese UI. Japanese keeps resolving from every form the surfaces report, including the POSIX modifier (`ja@cjknarrow`) and Windows' `Japanese_Japan.932`.
- 6877d70: Read a fan-in trunk by count in the Group-by view. Edges into one shared target
  still merge onto one spine and one entry, which is what the aggregation is, but
  the drawing now says how many: the merge mark carries the number the spine holds
  onward instead of being a bare dot, and the spine is drawn as a band that wide,
  carried through the shared run into the target. A trunked edge's label moves to
  the stub only that edge owns, so N labels no longer stack along a line that
  names none of them. Where a crossing rides a band, its arc is widened and
  raised to stay outside it, and the count steps along the spine rather than
  covering it: a crossing that cannot be seen reads as a connection. Routes,
  ports and canvas size are unchanged.
- 772d92c: An unquoted annotation parameter value is no longer silently corrupted. The lexer used to drop digits, so `@deprecated(until: 2026-12-31)` was recorded as `until: "-"` and `karasu fmt` wrote that back into the file. A value must now be one string literal or one bare word; anything else (`until: 2026-12-31`, `from: system`, `from: Shop.Legacy`) raises the new `annotation-param-value-unreadable` warning and records nothing. The diagram still renders, and `karasu fmt` refuses to rewrite such a file rather than write the value away. Quote the value to fix it: `until: "2026-12-31"`.

  The same annotation written twice on one element now warns (`duplicate-annotation`), and giving one parameter two different values warns (`annotation-param-conflict`) and keeps the first, with `fmt` refusing the file rather than printing one value over the other.

  Words that start with a digit are no longer dropped elsewhere either. `A -> 2B` is reported instead of becoming an edge to `B`, `[2026]` stays a tag (with `tag-not-builtin`), and `[team-1]`, `@phase-2` and `capability p2p-2` are each read as one name, so `[team-1]` matches the same `.krs.style` selector. See #2707.

- ca425f1: Shorten the canvas width-budget candidate ladder from 12 steps to 8 (#2761). The
  ladder's length was never measured when ADR-2593 introduced the search; on a
  10k-line model the candidates after the first were about a third of an all-views
  render. Eight steps takes roughly 70 ms of that back on the reference corpus for
  +0.05% total canvas area: 4 of 405 drill-down levels redraw, two of them
  _smaller_, and no level newly falls outside the readable aspect band. The bundled
  examples and every deploy view are byte-identical.
- 9c07492: Fix the Reference panel's node-kind catalog, which had drifted from the parser (#2158): `client` now lists `capability`, `resource` lists `operations`, the `entity` kind is present (it was missing from the panel and from the generated `docs/spec/syntax.md` table), and `service` / `domain` no longer advertise `team` — a property ADR-14 removed that is now a parse error. A new parser-driven test keeps the catalog and the parser in agreement in both directions (TPL-2158).

## 0.6.0

> Version note: the `karasu` npm package had a legacy 0.x line up to `0.5.2`
> (2020–2021). The current architecture-tool incarnation restarted at `0.1.0`;
> this release leaps past the legacy line to `0.6.0` so the published version is
> free. `@karasu-tools/core` is versioned independently (`0.2.0`).

### Minor Changes

- b80a879: Add a balanced-grid sibling layout for nodes with a high span of control. When a parent has many children, siblings are arranged in a balanced grid instead of a single overflowing row, keeping wide diagrams compact and readable. See ADR-1737 and #1748.
- 1476a62: Add a job lane to the deploy view (first kind band). Deploy units are grouped into a dedicated lane by kind, giving the deploy view a structured first band for job-style workloads. See #1749.
- 5a6907b: Add `edge[from=<id>]` / `edge[to=<id>]` source/target edge style selectors

  `.krs.style` can now color a node's whole fan-out (or fan-in) in one rule —
  `edge[from=ApiGateway] { color: #3B82F6; }` matches every edge originating at
  `ApiGateway`, and `edge[to=X]` matches every edge terminating at `X`. `<id>`
  accepts dot-notation endpoints for synthesized usecase→resource edges, and
  both selectors score 11 (same tier as `edge[<tag>]`). An attribute other than
  `from` / `to` raises an `unknown-edge-selector-attribute` error.

- fc2145d: `[index]` stores are now excluded from shared-infra-fan-in detection. Because a derived index is expected to be fed from a source of truth, fan-in into an `[index]` store is no longer flagged as shared-infrastructure coupling, refining the diagnostic introduced for the `[index]` tag. See #1741.
- be83dc8: Add the `[index]` tag for derived search / vector-index databases. A `database`, `queue`, or `storage` block tagged `[index]` is recognized as a read-optimized projection built from a source of truth, letting karasu distinguish derived indexes from primary stores in the system and deploy views. See #1727.
- d9d158e: Split the system-view dependency tier into separate infra and external rows. Infrastructure and external dependencies are now laid out in distinct bands instead of one mixed tier, improving readability of the system view. See ADR-1724 and #1736 / #1724.

### Patch Changes

- ba945ab: `client` is now resolved as a valid `realizes` / `owns` target. Relationships pointing at a `client` node no longer fail to link, so client-facing ownership and realization edges render correctly. Fixes #1721.
- 44afcd9: Give deploy nodes dark text in the light theme. Deploy node labels were previously hard to read against the light-theme background; they now use a dark foreground color for adequate contrast. Fixes #1698.

## 0.1.0

### Minor Changes

- 39bbccc: Lifecycle annotations can now carry migration-intent parameters: `@deprecated(until: "2026-Q3")` / `@experimental(until: …)` and `@migration_target(from: …)`. Values follow graceful degradation — a date / year-month / quarter is machine-usable, any other string is kept verbatim (display-only). An unrecognized key or a parameter on another annotation is dropped with an `annotation-param-unsupported` warning; custom annotations stay parameter-less. The annotation name list (and `.krs.style` selectors / inheritance) is unaffected. See ADR-1568.
- a31a520: `duplicate-owner-assignment` (the same node `owns`ed by more than one `team`) is now an **info** diagnostic instead of an error. Transient co-ownership during an inverse-Conway migration is a tolerated structural fact, surfaced like `domain-dispersal`; the first-declared team is kept as the node's primary owner. See ADR-1566.
- 54e9f85: Same-id `database` / `queue` / `storage` blocks declared in multiple `.krs` files now merge instead of erroring. A new `info` diagnostic (`infra-redeclared-across-files`) surfaces the fact for the App / LSP / CLI without prescribing how to fix it — shared infrastructure is a structural fact karasu visualizes but does not refuse to model. See `docs/spec/syntax.md` §"Multi-file import semantics" S4.5 for the full rules and recommended pattern (declare once in `infra.krs`, import everywhere).
- 17d7e9d: `domain-dispersal` is now reported at the **info** register, with fact-first wording, per ADR-1386. Previously rendered as a warning ("⚠ domain X is dispersed across multiple services — Check the cohesion of the domain"), it now reads as an informational note ("ℹ Domain X appears under multiple services — DDD sometimes calls cross-service domain reuse a cohesion smell"). Same detection, same params; only the display register and wording change. A new `warningSeverity(kind)` helper is exported from `@karasu-tools/core` so UI consumers can map `WarningKind` to `"warning" | "info"`. `missing-runtime` and `missing-realizes` are also tagged as info severity — preserving their pre-existing ℹ icon in the App, but now exposing the register to consumers other than the App.

  Fixes a bug where a `domain` id shared by multiple services within one system also raised the `domain-id-not-unique` **error**, which made the App refuse to draw the diagram. A dispersed domain is a structural fact karasu visualizes, not a defect that blocks rendering — the `domain-id-not-unique` diagnostic code is removed, and the `nodePathIndex` keeps the first occurrence (the same way the migration-coexistence path already picks a winner). The dispersal is still surfaced, now solely through the `domain-dispersal` info diagnostic.

- b2007c4: Migration-intent annotation params now have a consumer. A new core helper interprets a `@deprecated` / `@experimental` `until` value by precision — a date (`YYYY-MM-DD`), year-month (`YYYY-MM`), or quarter (`YYYY-Qn`) is machine-usable (a normalized lower-bound `sortKey` is exposed for sorting / filtering); any other string stays opaque and display-only. No "now" comparison is performed — `until` is recorded intent, not a runtime deadline (ADR-1568). The node detail panel surfaces the interpreted `until` and the `@migration_target(from: …)` source. Follow-up to #1568; see #1595.
- 0fe7769: Remove the deprecated `team` property on `service` / `domain`. Ownership is now declared solely with an `organization` block and `owns`; writing `team "..."` on a service or domain reports an error (`team-property-removed`). Team contact links move to the `team` block's `link` property. See ADR-1564.
- e270fb8: First release of the `karasu` CLI to npm. The CLI is now built as a single self-contained ESM bundle (`@karasu-tools/core` is bundled in via esbuild), and releases are managed with changesets.
- 77f5fd5: `team` blocks now accept annotations (`team payments @migration_target(from: "legacy") { … }`), parsed into `TeamNode.annotations` / `annotationParams`. During an inverse-Conway handoff where a node is `owns`-ed by more than one team, the 1:1 `ownerIndex` now picks the `@migration_target` team as the primary owner (unmarked next, `@deprecated` last; ties keep the first declaration) — symmetric with the domain migration-coexistence rule on `nodePathIndex`. Co-ownership stays a tolerated fact via the `duplicate-owner-assignment` info diagnostic. `@migration_target` / `@deprecated` on a team also render as a badge in the organization view (grid, icon, and tree layouts), mirroring the system-diagram node badge. Closes #1583.
- 8136144: Add the `unresolved-edge-endpoint` warning. When an edge references a node id that exists nowhere in the merged model, the edge is dropped during rendering (the resolved endpoint is kept) — this previously happened silently. `karasu render` now surfaces it as a warning naming the unknown id and the edge. Cross-system dotted refs (`Sys.Svc`) keep their existing `cross-system-ref-*` handling, and the warning is suppressed in the single-document LSP context where imports are unresolved.

### Patch Changes

- 68c501c: Pin the `karasu` CLI's published `files` to the single esbuild bundle (`dist/index.js`) instead of the whole `dist/` directory. The bundle is the only runtime artifact; the previous `["dist"]` whole-directory glob would also pack any stray `tsc` emit (`*.test.js` / `*.d.ts` / `*.map`) left in the gitignored `dist/`, making the tarball non-deterministic. The published surface is now exactly `dist/index.js` + `THIRD_PARTY_NOTICES.md`, regardless of `dist/` hygiene. Fixes #1681.
- f9fa6cb: Fix multi-file import: splitting one `system` across files via `import "p.krs"` now merges cleanly. The resolver no longer warns on DAG re-arrival, no longer drops content on the second visit to an already-touched file, unions same-id `deploy` / `organization` blocks, and emits a `system-property-conflict` warning instead of silently overwriting `label` / `description`. See `docs/spec/syntax.md` §"Multi-file import semantics" for the full rules.
