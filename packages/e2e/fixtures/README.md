# Playwright fixtures

Reusable test fixtures for `@karasu-tools/e2e`.

## `opfs.ts` — OPFS state fixture

Seeds and resets OPFS / `localStorage` state so tests can drive
ProjectMode flows deterministically without depending on the app's
first-run seeding. Also exposes a `mode` switch for running the same
suite against `MemoryModeApp` (`?mode=memory`).

Design rationale: see `docs/design/opfs-fixture-helper.md`.

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

  await expect(page.locator(".project-selector select.project-selector-dropdown")).toHaveValue(
    "demo",
  );
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

## `download.ts` — download plumbing

- `clickAndDownload(locator)` — registers `waitForEvent("download")` on
  `locator.page()` _before_ clicking, so the event cannot be missed.
- `readDownloadText(download)` — reads the download's bytes into a UTF-8
  string for content assertions.

## `anthropic.ts` — Anthropic transport mock

Intercepts `POST https://api.anthropic.com/v1/messages` (the only endpoint
`useChatSession` hits via `@anthropic-ai/sdk`) and serves scripted
responses, so the BYOK Chat UI can be driven deterministically without a
real API key. The fixture extends `opfs`, so a single test composes both
filesystem seeding and API-key seeding.

Design rationale: see `docs/design/chat-anthropic-mock-fixture.md`.

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
