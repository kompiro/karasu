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
        projects: [
          /* ... */
        ],
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
