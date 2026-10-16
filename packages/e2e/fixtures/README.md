# Playwright fixtures

Reusable test fixtures for `@karasu-tools/e2e`.

## `opfs.ts` — OPFS state fixture

Seeds and resets OPFS / `localStorage` state so tests can drive
ProjectMode flows deterministically without depending on the app's
first-run seeding. Also exposes a `mode` switch for running the same
suite against `MemoryModeApp` (`?mode=memory`).

Design rationale: [ADR-862](../../../docs/adr/862-opfs-fixture-helper.md) (its design doc was folded into the ADR).

### Quick start

```ts
import { test, expect } from "../fixtures/opfs";

test("seeded project is preselected", async ({ page, opfs }) => {
  await opfs.seed({
    projects: [
      {
        id: "demo",
        name: "Demo",
        files: { "index.krs": 'system "X" {}\n' },
      },
    ],
    lastProjectId: "demo",
  });
  await opfs.gotoApp();

  await expect(page.getByRole("combobox", { name: "Project", exact: true })).toHaveValue("demo");
});
```

### API

| Method                     | Purpose                                                                                                                         |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `opfs.seed(options)`       | Wipe OPFS + `localStorage`, pin `karasu-locale=en` by default, then write `projects`, `lastProjectId`, and remember the `mode`. |
| `opfs.reset(options)`      | Wipe OPFS + `localStorage` without seeding. Re-pins `karasu-locale=en` by default.                                              |
| `opfs.read(path)`          | Read a file from OPFS (returns `null` if missing).                                                                              |
| `opfs.gotoApp(path = "/")` | Navigate to the app, appending `?mode=memory` automatically when the fixture is in memory mode.                                 |
| `opfs.mode`                | The current mode (`"opfs"` by default; updated by `seed()`).                                                                    |

`seed()` and `reset()` are safe to call before or between `gotoApp()`
calls. The fixture establishes the OPFS origin internally by booting
`?mode=memory` once on first use, so tests do not need to perform a
preliminary navigation.

`lastProjectId` is applied in both modes — it is written to
`localStorage` regardless of `mode`. `MemoryModeApp` does not consume
it, but tests that toggle between OPFS and memory in the same
`describe` block can rely on `localStorage` being clean either way.
`projects` are silently dropped in memory mode (and OPFS is left
untouched by that call).

### Two-environment runs (AT-0014 and similar)

When the same scenario must run in both OPFS and InMemory modes,
iterate over the modes in the test body rather than duplicating the
entire test suite via Playwright `projects:`. The fixture's `mode`
parameter handles URL routing.

```ts
test.describe("AT-XXXX scenario", () => {
  for (const mode of ["opfs", "memory"] as const) {
    test(`scenario X (${mode})`, async ({ page, opfs }) => {
      await opfs.seed({
        mode,
        projects: [/* ... */],
      });
      await opfs.gotoApp();
      // ...
    });
  }
});
```

This keeps the cost local to the AT that needs it; existing tests
(which depend on the app's first-run seed path) are unaffected.

### Caveats

- **Chromium only.** OPFS support varies across browsers; Playwright
  is already configured chromium-only for this package.
- **Call before `gotoApp`.** `seed()` / `reset()` mutate OPFS in the
  test page, then `gotoApp()` reloads the app so it picks up the
  state. Calling them after a real navigation works (the fixture
  re-uses the established origin) but the app must be reloaded
  separately.
- **`localStorage` is wiped on every `seed()` / `reset()`** so the app
  cannot restore stale `lastProjectId` from a previous run.
- **`karasu-locale` is pinned to `"en"` by default** after the wipe so
  English UI strings (button labels, empty-state copy, toolbar text)
  stay stable on CI runners with non-English `navigator.language`. Pass
  `pinLocale: null` to either `seed()` or `reset()` to opt out — e.g.
  when the test explicitly verifies Japanese UI. Pass `pinLocale: "ja"`
  to pin Japanese explicitly.

## `editor.ts` — deterministic Monaco editing

`replaceEditorContent(page, content)` replaces the Monaco buffer without
racing the editor's focus handling. The naive `click .view-lines` +
`Ctrl+A` / `Delete` / `keyboard.insertText` pattern silently no-ops in
roughly 1 out of 5 runs (the historical dominant flake source across
AT-0007 / 0011 / 0044 / 0046 / 0049 / 0053 / 0054 / 0057); this helper
instead focuses the EditContext textbox, asserts focus, pastes via the
clipboard (which bypasses Monaco's per-newline auto-indent), verifies the
first pasted line is rendered, and waits out the compile debounce +
auto-switch effects (`COMPILE_SETTLE_MS`).

Requires `clipboard-read` / `clipboard-write` permissions — already
granted suite-wide in `playwright.config.ts`.

`expectNoWarningMatching(page, pattern?)` asserts the "no warning appears"
negative idiom used by specs that prove a source does _not_ trigger a
diagnostic: it settles for `WARNING_SETTLE_MS` (500ms, defined next to
`COMPILE_SETTLE_MS`) then checks the `.warning-panel`, if present, either
has zero `.warning-item`s (`pattern` omitted) or does not contain text
matching `pattern`. There is no positive signal to wait on for a negative
assertion, so the settle sleep stays — tightening it is a separate,
riskier follow-up.

## `boot.ts` — memory-mode boot sequence

`bootMemoryApp(page, opfs, krs)` is the canonical 3-step boot used by
most memory-mode specs, extracted verbatim:

```ts
await opfs.seed({ mode: "memory" });
await opfs.gotoApp();
await replaceEditorContent(page, krs);
```

Use it whenever a spec just needs "the app in memory mode with this
`.krs` in the editor". Specs that need a different seed (OPFS projects,
locale opt-out) or a custom `gotoApp` path keep calling the fixture
methods directly.

`bootProjectApp(page, opfs, krs, project?)` is the project-mode (OPFS)
counterpart: it seeds one project (`demo` / `Demo` by default) whose
`index.krs` is `krs`, opens it, and waits until the diagram has drawn a
node. Use it when the spec needs what only project mode mounts: the file
sidebar, the Outline view, or the `Switch Project…` command. Specs that
need several projects call `opfs.seed` themselves (AT-1482).

## `tabs.ts` — race-safe view-tab switching

`openViewTab(page, name)` clicks the view tab (`"System"`, `"Deploy"`,
`"Org"`, ...) and asserts `selected: true` before returning. The
assertion is load-bearing: a click right after an edit races the
auto-switch effects (`useAutoSwitchToOrg`, `useAutoSwitchToDeploy`), so
callers must not assert on tab content until the switch has been
observed. Do not remove it.

Specs that intentionally skip the selected assertion (AT-0044's
`openOrgTab`) or assert `aria-selected` via `toHaveAttribute` keep their
own inline choreography.

`selectedTab(page, name)` is the tab locator restricted to the selected
state. Specs that switch tabs from the keyboard (or the command palette)
rather than by clicking read the result through it:
`await expect(selectedTab(page, "Deploy")).toBeVisible()`.

`setDisplayMode(page, "shape" | "icon")` and `setTheme(page, "light" | "dark")`
drive the two Settings-tab selects the preview re-renders from. `setTheme`
polls `<html data-theme>` before returning, which is the signal every themed
surface (app chrome, Monaco, the SVG canvas) repaints on. The `system` theme
is not offered: it follows the OS and is exercised through
`test.use({ colorScheme })` instead (AT-1470).

## `keyboard.ts` — app keyboard shortcuts

- `pressChord(page, "Shift+P")` presses `ControlOrMeta+Shift+P`, which the
  app reads as `mod+shift+p` (`packages/app/src/keyboard/chord.ts`). Write
  the chord as a literal at the call site:
  `scripts/lint/e2e-command-coverage.ts` finds a keybinding's spec by this
  argument or by the full `"ControlOrMeta+…"` string, so a chord built from
  a variable does not count.
- `blurToPreview(page)` clicks the preview's empty corner so no text input
  holds focus, and asserts that. Commands with `whenTextInputFocused:
"skip"` (the default) only fire then.
- `focusEditor(page)` focuses the Monaco textbox and waits for it;
  `editorTextbox(page)` is that locator.

A "this shortcut is ignored in the editor" assertion has nothing to wait on.
Instead of a sleep, follow the ignored chord with one that fires inside the
editor (`pressChord(page, "Shift+2")` selects Chat) and wait for that. Key
events are handled in order, so once Chat is selected the ignored chord has
already been processed (AT-1411 / 1422 / 1423 / 1458).

## `drill.ts` — drilling through rendered nodes

`drillInto(page, ["OrderService", "Ordering"])` clicks each node id in turn
(`svg [data-node-id=...]`). Playwright's auto-wait on the next locator is what
sequences the clicks: the child exists only after the parent's drill-down has
rendered. The locator is strict by default, so a renderer regression that
draws an id twice fails the spec; pass `{ firstMatch: true }` only where a
second copy is expected (a root drawn once per system, #2917; a ghost copy,
AT-0054; the entity specs AT-1907 / 2800 that always used `.first()`).

Pass `{ expectBreadcrumb: true }` when the ids are also the labels and the spec
reads the view right after the drill; the `.breadcrumb-current` assertion
then makes each step wait for the re-render (AT-0049). `nodeLocator(page, id,
options?)` is the same locator for specs that click or assert on a single node
without drilling.

Replaces the `drillIntoOrderingDomain` / `drillIntoOrderDomain` / `drillInto`
copies that AT-1907, AT-2800, AT-0049 and AT-0054 each carried (#3040).

## `org.ts` — Org tab sub-modes

`openOrgTreeView(page)` and `openTeamDependencies(page)` switch to the Org tab
through `openViewTab` (race-safe) and click the Tree View / derived
team-dependencies toggle. `toggleOrgTreeView(page)` only clicks, for specs
that put the app on the Org tab themselves (AT-0044 keeps its own `openOrgTab`,
the documented exception above). The two toggle locators
(`orgTreeViewToggle`, `teamDependenciesToggle`) are exported for presence
assertions.

## `edges.ts` — clicking a drawn edge

`clickEdge(page, canonicalId)` and `rightClickEdge(page, canonicalId)` press the
edge whose group carries `data-edge-canonical-id` (the author id such as
`settlementFeed`, or the base id `From->To`). A left-click opens the edge detail
panel for an edge with a property block; a right-click opens the direction menu
(`EdgeContextMenu`). `edgeLocator(page, canonicalId)` is the group itself.

The pointer lands on a point read off the edge's transparent 14px hitline
(`krs-edge__hitline`) through the SVG's screen transform, 35% of the way along
(the bounding-box centre misses an L-shaped or diagonal edge). Because
`page.mouse.click` skips Playwright's actionability check, the helper first
asserts with `elementFromPoint` that the point hits the edge group, and throws
naming the covering element otherwise. Used by AT-1098 (which also hosts AT-1141 /
AT-1142) and AT-2543 (#3045).

## `snapshots.ts` — OPFS history snapshots

Reads and seeds the per-file snapshot store under
`/projects/<pid>/.snapshots/<relPath>/` (`index.json` plus one `<id>.krs` per
record), restating the on-disk shape of `SnapshotManager` (AT-0060, #3047).

- `seedSnapshotRecords(relPath, seeds)` — returns `{ files, records }`. Spread
  `files` into an `opfs.seed` project's `files` map; `records` carries the
  generated ids. Records are dated in `seeds` order from 2020-01-01, one
  minute apart, so `seeds[0]` is the oldest and every seeded record is older
  than a capture the app makes. `contentHash` is a non-hex placeholder, so a
  seeded record never makes the next auto capture look like a duplicate.
- `readSnapshotIndex(opfs, pid, relPath)` — the stored records, or `null`
  before the first write. The app creates `index.json` empty and commits its
  content on `close()`, so an empty read also returns `null`; poll on it.
- `readSnapshotContent(opfs, pid, relPath, id)` / `snapshotDir(pid, relPath)`
  — one record's content, and the directory path for `opfs.read`.

### Driving the 5-minute idle timer with `page.clock`

`useSnapshotAutoCapture` waits 5 minutes after the last edit. AT-0060 installs
Playwright's clock and jumps over the wait:

```ts
await page.clock.install(); // before opfs.seed(): the fixture navigates
await opfs.seed({ projects: [...] });
await opfs.gotoApp();
// ... edit ...
await page.clock.fastForward(5 * 60 * 1000);
await expect.poll(() => readSnapshotIndex(opfs, pid, "index.krs")).not.toBeNull();
```

- **Install before the first navigation.** The clock is injected into each
  new document; installing after `gotoApp()` leaves the app on real timers.
- **`fastForward`, not `runFor`.** `runFor` replays every tick of the period
  (Monaco's cursor blink, animation frames) and crashed the renderer in about
  1 run in 10. `fastForward` fires each due timer once, which is what an idle
  tab sees.
- `install()` keeps time flowing at the real rate, so the compile debounce
  and `replaceEditorContent` behave as in any other spec.

## `color.ts` — WCAG colour maths

- `luminance(rgb)` — relative luminance of a computed `rgb()` / `rgba()`
  string. Returns `NaN` when the string does not parse or has alpha 0
  (`getComputedStyle` reports an unpainted background as `rgba(0, 0, 0, 0)`,
  which a channels-only regex would read as opaque black), so an element that
  never painted fails `toBeLessThan` / `toBeGreaterThan` instead of reading as
  "dark enough" (the per-spec copy in AT-1470 returned `-1` on a parse miss,
  which `toBeLessThan(0.5)` accepted). A non-zero alpha is ignored.
- `contrastRatio(fg, bg)` — WCAG ratio, order-independent.
- `contrastOf(locator)` — the element's text against its _effective_
  background (first non-transparent ancestor), which is what AA is measured
  against. If nothing in the chain paints, the ratio is `NaN` and the AA
  assertion fails (a selector on the wrong element, not a 21:1 contrast).
  Used by the AA sweeps in AT-1470.

## `file-tree.ts` — file-tree rows and context menu

- `treeItem(page, name)` — the `.file-tree-item` row whose name is exactly
  `name` (`index.krs` does not match `index.krs.style`).
- `openTreeContextMenu(page, name)` — right-clicks the row and returns the
  `.context-menu` once it is visible.
- `treeContextMenuAction(page, name, "Rename" | "Delete")` — opens the menu
  and clicks the item. The item is looked up inside `.context-menu`, because
  the project selector's "✎ Rename" / "✕ Delete" buttons match the same
  names. A Delete asks `window.confirm`, so register `page.once("dialog", …)`
  before calling it.

## `download.ts` — download plumbing

- `clickAndDownload(locator)` — registers `waitForEvent("download")` on
  `locator.page()` _before_ clicking, so the event cannot be missed.
- `readDownloadText(download)` — reads the download's bytes into a UTF-8
  string for content assertions.
- `downloadToPath(download)` — returns the download's on-disk path, asserting
  the file exists, so it can be passed to `setInputFiles` (the ZIP export →
  import round trip in AT-0004).

## `anthropic.ts` — Anthropic transport mock

Intercepts `POST https://api.anthropic.com/v1/messages` (the only endpoint
`useChatSession` hits via `@anthropic-ai/sdk`) and serves scripted
responses, so the BYOK Chat UI can be driven deterministically without a
real API key. The fixture extends `opfs`, so a single test composes both
filesystem seeding and API-key seeding.

Design rationale: [ADR-864](../../../docs/adr/864-chat-anthropic-mock-fixture.md) (its design doc was folded into the ADR).

### Quick start

```ts
import { test, expect } from "../fixtures/anthropic";

test("chat round-trip", async ({ page, opfs, anthropic }) => {
  await opfs.seed({
    projects: [{ id: "demo", name: "Demo", files: { "index.krs": 'system "X" {}\n' } }],
    lastProjectId: "demo",
  });
  await anthropic.seedApiKey("sk-ant-test-fake");
  await anthropic.scriptTurns([{ kind: "text", text: "Hi" }]);
  await opfs.gotoApp();

  await page.getByRole("tab", { name: /Chat/ }).click();
  // ... drive the chat input, assert the AI response shows up
});
```

### API

| Method                          | Purpose                                                                       |
| ------------------------------- | ----------------------------------------------------------------------------- |
| `anthropic.scriptTurns(turns)`  | FIFO queue of responses for upcoming `messages.create` calls.                 |
| `anthropic.respondWithError(e)` | Serve `{status: 401 \| 429 \| 500}` to every request until reset (sticky).    |
| `anthropic.requests`            | Captured request bodies in arrival order — assert tool definitions, etc.      |
| `anthropic.seedApiKey(key, o)`  | Write the BYOK key + persist setting and (by default) pin `karasu-locale=en`. |
| `anthropic.clearApiKey()`       | Remove the key from both storages (AC-4 / AC-5).                              |

### Scripted turn shapes

```ts
// Text reply.
{ kind: "text", text: "Done.", stopReason?: "end_turn" }

// Tool-use reply. The SDK then issues a follow-up request carrying
// `tool_result`, which consumes the next entry from the queue.
{ kind: "tool_use", tool: "navigate_view", input: { path: ["sys-id"] }, precedingText?: "..." }
{ kind: "tool_use", tool: "apply_krs_patch", input: { operation: "...", description: "...", ... } }
```

When the queue runs dry while the app is still calling, the fixture
returns `500 fixture_exhausted` so the test fails loudly rather than
hanging on a real network attempt.

### Caveats

- **Call `seedApiKey()` after `opfs.seed()`.** `opfs.seed()` wipes
  `localStorage`, so any earlier `seedApiKey()` would be undone. Natural
  order: `opfs.seed → seedApiKey → scriptTurns → gotoApp`. `seedApiKey`
  also pins `karasu-locale=en` by default; pass `pinLocale: null` to opt
  out (e.g. when explicitly verifying Japanese UI).
- **Errors are sticky** rather than one-shot. The same error answers
  every request until you call `scriptTurns(...)` or another
  `respondWithError(...)`. This is required because `@anthropic-ai/sdk`
  retries `429` / `5xx` by default; a one-shot mock would be hidden by
  the retry.
- **The 401/429/500 body shape mirrors the real Anthropic API** so
  `@anthropic-ai/sdk` still produces `APIError` instances and
  `useChatSession/errors.ts` keeps classifying them correctly.

## `chat.ts` — Chat UI choreography

Shared by AT-0050 and `anthropic-fixture.smoke.spec.ts` so the two specs'
boot/send choreography and error-expectation table can't drift apart.

- `bootChat(opfs, anthropic, options)` — seeds OPFS (`projects` /
  `lastProjectId`), then either `anthropic.seedApiKey(options.apiKey ??
"sk-ant-test-fake")` or, when `options.apiKey` is `null`,
  `anthropic.clearApiKey()` (the ApiKeySetup / no-key boot path), then
  `opfs.gotoApp()`.
- `sendChatMessage(page, text)` — opens the Chat tab, fills the message
  input, and sends it via `ControlOrMeta+Enter`. Returns the input
  `Locator` so callers that keep asserting on it (`toHaveValue("")`,
  `toBeDisabled()`) don't have to re-locate it.
- `CHAT_ERROR_CASES` — the 401/429/500 error-expectation table (status,
  expected inline-error text, expected/hidden action button), consumed by
  both specs' `for` loops.

AT-0050 and the smoke spec both run their Chat UI tests against the same
Vite preview origin; AT-0050 additionally runs `serial` due to prior OPFS
flake (see the comment at the top of that spec) — this fixture only
extracts the driving choreography, it does not restructure either
`describe` block.

## `preview-pane.ts` — diagram pane structural fence

The checks TPL-2800 asks of every diagram pane that goes through
`PreviewPane`, in one place so the entity, org tree and team dependencies
specs cannot drift apart. `paneSelector` names one pane (e.g.
`.preview-pane--org-tree`).

- `expectInSharedContainer(page, paneSelector)` — the SVG sits inside
  `.preview-container`, which carries both the fit rules and the wheel/drag
  handlers. "The diagram is drawn" does not detect a pane that bypasses
  `PreviewPane`; this does.
- `expectFitsPane(page, paneSelector)` — the diagram is intrinsically wider
  than the pane _and_ drawn no wider than it. The first half is what makes the
  second non-trivial, so boot a model that is wide on purpose.
- `expectWheelZooms(page, paneSelector)` — wheel over the pane changes the zoom
  layer's `transform`.
- `expectDragPans(page, paneSelector)` — a press that moves past the click
  threshold changes the `transform`. The move is stepped so it lands after the
  mousedown's drag state has rendered.

## `serve.ts` — the `karasu serve` project

For specs in the `serve` project (AT-0032, #3049), which runs only under
`E2E_SERVE=1` — see "Serve mode" in [`../README.md`](../README.md). The
server watches `.serve-scratch/`, a fresh copy of `serve-project/` made on
every server start. Ports and paths live in `serve-env.ts`, which imports
nothing from Playwright so `scripts/start-serve.ts` can share it.

- `serveProject.open(path = "/")` — navigate on the serve server. `/` is the
  default file, `/<name>` is `<name>.krs`.
- `serveProject.write(name, content)` — overwrite `<name>.krs` on disk, as an
  external editor would. The file goes back to its checked-in content after
  the test. Give a test that rewrites a file a file of its own
  (`live.krs` for TC-04): the other specs run in parallel and read theirs.
- `serveProject.dir` — the served directory, for anything else on disk.
