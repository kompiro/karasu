import { test, expect } from "../fixtures/anthropic.js";

/**
 * AT-0050 Chat UI Phase 2 — BYOK + AI integration.
 *
 * Drives the BYOK chat flow against the Anthropic transport mock from
 * #864 (ADR-20260428-04). Each AC corresponds 1:1 to a bullet in
 * `docs/acceptance/0050-chat-ui-phase2-byok-ai.md` (English-locale
 * variant — selectors target `karasu-locale=en` strings, which the
 * `anthropic` fixture pins by default).
 *
 * Out of scope (kept manual or covered elsewhere):
 *  - Full markdown rendering / link sanitization (visual review)
 *  - Phase 3 chat features (tracker #597)
 */

const PROJECT_ID = "at-0050-byok";
const INITIAL_KRS = 'system "BYOK Demo" {}\n';
const INDEX_PATH = `/projects/${PROJECT_ID}/index.krs`;
const SEED_PROJECT = {
  id: PROJECT_ID,
  name: "BYOK Demo",
  files: { "index.krs": INITIAL_KRS },
} as const;

const PROJECT_OPTIONS = {
  projects: [SEED_PROJECT],
  lastProjectId: PROJECT_ID,
};

// Run AT-0050 cases serially. Each test boots `ProjectModeApp` against the
// same Vite preview origin and seeds OPFS / `localStorage`; running them
// in parallel under one origin produced flake on the OPFS handles. The
// trade-off is acceptable — the file is 15 cases.
test.describe.configure({ mode: "serial" });

test.describe("AT-0050 Chat UI Phase 2 — BYOK + AI", () => {
  // ── AC-1〜AC-5: Settings + ApiKeySetup (no scripted turns needed) ─────────

  test("AC-1: Settings pane shows BYOK security explanation and key input", async ({
    page,
    opfs,
    anthropic,
  }) => {
    await opfs.seed(PROJECT_OPTIONS);
    // No API key seeded; pin locale only.
    await anthropic.clearApiKey();
    await page.evaluate(() => localStorage.setItem("karasu-locale", "en"));
    await opfs.gotoApp();

    await page.getByRole("tab", { name: /Settings/ }).click();

    const security = page.locator(".settings-security-notice");
    await expect(security.locator(".settings-security-notice__heading")).toContainText(
      /About security/,
    );
    await expect(security.getByRole("link", { name: /console\.anthropic\.com/ })).toHaveAttribute(
      "href",
      "https://console.anthropic.com",
    );

    await expect(page.locator("input#settings-api-key")).toBeVisible();
    await expect(page.getByRole("checkbox", { name: /Persist across sessions/ })).toBeVisible();
  });

  test("AC-2: API key entered with persist OFF lands in sessionStorage", async ({
    page,
    opfs,
    anthropic,
  }) => {
    await opfs.seed(PROJECT_OPTIONS);
    await anthropic.clearApiKey();
    await page.evaluate(() => localStorage.setItem("karasu-locale", "en"));
    await opfs.gotoApp();

    await page.getByRole("tab", { name: /Settings/ }).click();
    await page.locator("input#settings-api-key").fill("sk-ant-test-fake");
    // Persist checkbox left unchecked — default "session".
    await page.getByRole("button", { name: /Save/ }).click();

    const stored = await page.evaluate(() => ({
      session: sessionStorage.getItem("karasu.ai.anthropic.apiKey"),
      local: localStorage.getItem("karasu.ai.anthropic.apiKey"),
      persist: localStorage.getItem("karasu.ai.settings.persist"),
    }));
    expect(stored.session).toBe("sk-ant-test-fake");
    expect(stored.local).toBeNull();
    expect(stored.persist).toBe("session");
  });

  test("AC-3: API key with persist ON lands in localStorage", async ({ page, opfs, anthropic }) => {
    await opfs.seed(PROJECT_OPTIONS);
    await anthropic.clearApiKey();
    await page.evaluate(() => localStorage.setItem("karasu-locale", "en"));
    await opfs.gotoApp();

    await page.getByRole("tab", { name: /Settings/ }).click();
    await page.locator("input#settings-api-key").fill("sk-ant-test-fake");
    await page.getByRole("checkbox", { name: /Persist across sessions/ }).check();
    await page.getByRole("button", { name: /Save/ }).click();

    const stored = await page.evaluate(() => ({
      session: sessionStorage.getItem("karasu.ai.anthropic.apiKey"),
      local: localStorage.getItem("karasu.ai.anthropic.apiKey"),
      persist: localStorage.getItem("karasu.ai.settings.persist"),
    }));
    expect(stored.local).toBe("sk-ant-test-fake");
    expect(stored.session).toBeNull();
    expect(stored.persist).toBe("local");
  });

  test("AC-4: Chat tab shows ApiKeySetup when no key is stored", async ({
    page,
    opfs,
    anthropic,
  }) => {
    await opfs.seed(PROJECT_OPTIONS);
    await anthropic.clearApiKey();
    await page.evaluate(() => localStorage.setItem("karasu-locale", "en"));
    await opfs.gotoApp();

    await page.getByRole("tab", { name: /Chat/ }).click();

    await expect(page.getByText(/Claude API key is required/)).toBeVisible();
    await expect(page.getByRole("button", { name: /Configure in Settings/ })).toBeVisible();
    await expect(page.getByRole("textbox", { name: /Chat message input/ })).toHaveCount(0);
  });

  test("AC-5: ApiKeySetup button navigates to Settings tab", async ({ page, opfs, anthropic }) => {
    await opfs.seed(PROJECT_OPTIONS);
    await anthropic.clearApiKey();
    await page.evaluate(() => localStorage.setItem("karasu-locale", "en"));
    await opfs.gotoApp();

    await page.getByRole("tab", { name: /Chat/ }).click();
    await page.getByRole("button", { name: /Configure in Settings/ }).click();

    await expect(page.getByRole("tab", { name: /Settings/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  // ── AC-6〜AC-12: BYOK happy paths and patch flow ────────────────────────

  test.describe("with API key seeded", () => {
    test.beforeEach(async ({ opfs, anthropic }) => {
      await opfs.seed(PROJECT_OPTIONS);
      await anthropic.seedApiKey("sk-ant-test-fake");
      await opfs.gotoApp();
    });

    test("AC-6: sending a message round-trips and renders the AI reply", async ({
      page,
      anthropic,
    }) => {
      anthropic.scriptTurns([{ kind: "text", text: "Hello from AT-0050." }]);

      await page.getByRole("tab", { name: /Chat/ }).click();
      const input = page.getByRole("textbox", { name: /Chat message input/ });
      await input.fill("Describe this system");
      await input.press("ControlOrMeta+Enter");

      await expect(page.locator(".chat-message--user .chat-message-content")).toHaveText(
        "Describe this system",
      );
      await expect(page.locator(".chat-message--assistant")).toContainText("Hello from AT-0050.");
      await expect(input).toHaveValue("");
    });

    test("AC-7: navigate_view tool call updates the chat scope indicator", async ({
      page,
      anthropic,
    }) => {
      anthropic.scriptTurns([
        {
          kind: "tool_use",
          tool: "navigate_view",
          input: { path: [PROJECT_ID] },
          toolUseId: "toolu_navigate_byok",
        },
        { kind: "text", text: "Navigated to BYOK Demo." },
      ]);

      await page.getByRole("tab", { name: /Chat/ }).click();
      await page.getByRole("textbox", { name: /Chat message input/ }).fill("Show me the system");
      await page.getByRole("textbox", { name: /Chat message input/ }).press("ControlOrMeta+Enter");

      await expect(page.locator(".chat-message--assistant")).toContainText(
        "Navigated to BYOK Demo.",
      );
      // The chat header re-renders the new scope. The seed has a single
      // system "BYOK Demo" so navigating to its id resolves to that label.
      await expect(page.locator(".chat-scope-indicator")).toContainText(/BYOK Demo|byok/i);
    });

    test("AC-8: apply_krs_patch surfaces Apply / Reject buttons and disables input", async ({
      page,
      anthropic,
    }) => {
      anthropic.scriptTurns([
        {
          kind: "tool_use",
          tool: "apply_krs_patch",
          input: {
            operation: "append",
            description: "Add a new service",
            content: 'service "Order" {}',
          },
          toolUseId: "toolu_patch_ac8",
          precedingText: "Here is a proposed change:",
        },
      ]);

      await page.getByRole("tab", { name: /Chat/ }).click();
      const input = page.getByRole("textbox", { name: /Chat message input/ });
      await input.fill("Add an Order service");
      await input.press("ControlOrMeta+Enter");

      const proposal = page.locator(".chat-patch-proposal");
      await expect(proposal).toContainText("Add a new service");
      await expect(proposal.getByRole("button", { name: /Apply/ })).toBeVisible();
      await expect(proposal.getByRole("button", { name: /Reject/ })).toBeVisible();
      // Input is disabled while a patch is pending confirmation.
      await expect(input).toBeDisabled();
    });

    test("AC-9: Apply persists the patch to OPFS and emits an AI follow-up", async ({
      page,
      opfs,
      anthropic,
    }) => {
      anthropic.scriptTurns([
        {
          kind: "tool_use",
          tool: "apply_krs_patch",
          input: {
            operation: "append",
            description: "Add Order service",
            content: 'service "Order" {}',
          },
          toolUseId: "toolu_patch_ac9",
        },
        { kind: "text", text: "Applied." },
      ]);

      await page.getByRole("tab", { name: /Chat/ }).click();
      await page.getByRole("textbox", { name: /Chat message input/ }).fill("Add Order");
      await page.getByRole("textbox", { name: /Chat message input/ }).press("ControlOrMeta+Enter");

      await page.locator(".chat-patch-proposal").getByRole("button", { name: /Apply/ }).click();

      await expect(page.locator(".chat-message--assistant").last()).toContainText("Applied.");
      // OPFS reflects the appended service.
      await expect.poll(() => opfs.read(INDEX_PATH)).toContain('service "Order"');

      // The follow-up turn carries `tool_result: "Applied."`.
      const followup = anthropic.requests[1]?.body.messages as Array<{
        role: string;
        content: unknown;
      }>;
      const lastBlock = followup.at(-1);
      expect(lastBlock?.role).toBe("user");
      expect(lastBlock?.content).toEqual([
        { type: "tool_result", tool_use_id: "toolu_patch_ac9", content: "Applied." },
      ]);
    });

    test("AC-10: Reject sends tool_result 'User declined.' and emits an AI follow-up", async ({
      page,
      opfs,
      anthropic,
    }) => {
      anthropic.scriptTurns([
        {
          kind: "tool_use",
          tool: "apply_krs_patch",
          input: {
            operation: "append",
            description: "Add Order service",
            content: 'service "Order" {}',
          },
          toolUseId: "toolu_patch_ac10",
        },
        { kind: "text", text: "Acknowledged — leaving the file as-is." },
      ]);

      await page.getByRole("tab", { name: /Chat/ }).click();
      await page.getByRole("textbox", { name: /Chat message input/ }).fill("Add Order");
      await page.getByRole("textbox", { name: /Chat message input/ }).press("ControlOrMeta+Enter");

      await page
        .locator(".chat-patch-proposal")
        .getByRole("button", { name: /Reject/ })
        .click();

      await expect(page.locator(".chat-message--assistant").last()).toContainText("Acknowledged");
      // The OPFS file was never touched.
      expect(await opfs.read(INDEX_PATH)).toBe(INITIAL_KRS);

      const followup = anthropic.requests[1]?.body.messages as Array<{
        role: string;
        content: unknown;
      }>;
      const lastBlock = followup.at(-1);
      expect(lastBlock?.content).toEqual([
        { type: "tool_result", tool_use_id: "toolu_patch_ac10", content: "User declined." },
      ]);
    });

    // AC-11 — "Apply is silently ignored when the file changes after the
    // proposal" — is currently not E2E-testable. The AC requires (a)
    // surfacing a patch proposal in Chat, (b) switching to the Editor tab
    // and editing the .krs, (c) switching back to Chat and clicking
    // Apply. But `EditPane` mounts `<ChatPane>` only while the Chat tab
    // is active (`{activeTab === "chat" && <ChatPane>}`), so the chat
    // session — including the pending patch — is unmounted on the tab
    // switch and the proposal disappears. The hash-mismatch path in
    // `useChatSession.applyPatch` is exercised by unit tests instead.
    // Re-enable here once `<ChatPane>` is kept mounted across tab
    // switches (or AT-0050 AC-11 is rewritten with a different dirtying
    // mechanism).
    test.skip("AC-11: stale-patch Apply is no-op (skipped — see comment)", () => {});

    test("AC-12: New Session resets the chat including a pending patch", async ({
      page,
      anthropic,
    }) => {
      anthropic.scriptTurns([
        {
          kind: "tool_use",
          tool: "apply_krs_patch",
          input: {
            operation: "append",
            description: "Add Order service",
            content: 'service "Order" {}',
          },
          toolUseId: "toolu_patch_ac12",
        },
      ]);

      await page.getByRole("tab", { name: /Chat/ }).click();
      await page.getByRole("textbox", { name: /Chat message input/ }).fill("Add Order");
      await page.getByRole("textbox", { name: /Chat message input/ }).press("ControlOrMeta+Enter");

      await expect(page.locator(".chat-patch-proposal")).toBeVisible();

      await page.getByRole("button", { name: /New Session/ }).click();

      await expect(page.locator(".chat-message--user")).toHaveCount(0);
      await expect(page.locator(".chat-message--assistant")).toHaveCount(0);
      await expect(page.locator(".chat-patch-proposal")).toHaveCount(0);
      await expect(page.getByRole("textbox", { name: /Chat message input/ })).toBeEnabled();
    });

    // ── AC-13〜AC-15: error states ──────────────────────────────────────

    const errorCases = [
      {
        ac: "AC-13",
        status: 401 as const,
        expectedText: /API key is invalid/,
        expectedButton: /Open Settings/,
        hiddenButton: /Retry/,
      },
      {
        ac: "AC-14",
        status: 429 as const,
        expectedText: /Rate limit reached/,
        expectedButton: /Retry/,
        hiddenButton: /Open Settings/,
      },
      {
        ac: "AC-15",
        status: 500 as const,
        expectedText: /Anthropic server error/,
        expectedButton: /Retry/,
        hiddenButton: /Open Settings/,
      },
    ];

    for (const { ac, status, expectedText, expectedButton, hiddenButton } of errorCases) {
      test(`${ac}: ${status} surfaces the inline error with the matching action button`, async ({
        page,
        anthropic,
      }) => {
        anthropic.respondWithError({ status });

        await page.getByRole("tab", { name: /Chat/ }).click();
        await page.getByRole("textbox", { name: /Chat message input/ }).fill(`Trigger ${status}`);
        await page
          .getByRole("textbox", { name: /Chat message input/ })
          .press("ControlOrMeta+Enter");

        const errorMsg = page.locator(".chat-message--error");
        await expect(errorMsg).toContainText(expectedText);
        await expect(errorMsg.getByRole("button", { name: expectedButton })).toBeVisible();
        await expect(errorMsg.getByRole("button", { name: hiddenButton })).toHaveCount(0);
      });
    }
  });
});
