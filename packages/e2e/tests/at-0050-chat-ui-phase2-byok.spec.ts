import { test, expect } from "../fixtures/anthropic.js";
import { bootChat, sendChatMessage, CHAT_ERROR_CASES } from "../fixtures/chat.js";
import { rightClickEdge } from "../fixtures/edges.js";

/**
 * AT-0050 Chat UI Phase 2 — BYOK + AI integration.
 *
 * Drives the BYOK chat flow against the Anthropic transport mock from
 * #864 (ADR-864). Each AC corresponds 1:1 to a bullet in
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
/** How long AC-11 watches for a save or follow-up after a refused Apply. */
const APPLY_SETTLE_MS = 1000;
const SEED_PROJECT = {
  id: PROJECT_ID,
  name: "BYOK Demo",
  files: { "index.krs": INITIAL_KRS },
} as const;

const PROJECT_OPTIONS = {
  projects: [SEED_PROJECT],
  lastProjectId: PROJECT_ID,
};

// The cases run in parallel like every other `opfs` spec: each test gets its
// own browser context, and with it its own OPFS and `localStorage`, even at
// the same origin. The file ran `serial` until #3236 over an OPFS-handle
// flake seen in local runs; serial pinned all 15 cases to one worker, which
// put the file at 55-64s under `workers: 2`.

test.describe("AT-0050 Chat UI Phase 2 — BYOK + AI", () => {
  // ── AC-1〜AC-5: Settings + ApiKeySetup (no scripted turns needed) ─────────

  test("AC-1: Settings pane shows BYOK security explanation and key input", async ({
    page,
    opfs,
    anthropic,
  }) => {
    // No API key seeded.
    await bootChat(opfs, anthropic, { ...PROJECT_OPTIONS, apiKey: null });

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
    await bootChat(opfs, anthropic, { ...PROJECT_OPTIONS, apiKey: null });

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
    await bootChat(opfs, anthropic, { ...PROJECT_OPTIONS, apiKey: null });

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
    await bootChat(opfs, anthropic, { ...PROJECT_OPTIONS, apiKey: null });

    await page.getByRole("tab", { name: /Chat/ }).click();

    await expect(page.getByText(/Claude API key is required/)).toBeVisible();
    await expect(page.getByRole("button", { name: /Configure in Settings/ })).toBeVisible();
    await expect(page.getByRole("textbox", { name: /Chat message input/ })).toHaveCount(0);
  });

  test("AC-5: ApiKeySetup button navigates to Settings tab", async ({ page, opfs, anthropic }) => {
    await bootChat(opfs, anthropic, { ...PROJECT_OPTIONS, apiKey: null });

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
      await bootChat(opfs, anthropic, PROJECT_OPTIONS);
    });

    test("AC-6: sending a message round-trips and renders the AI reply", async ({
      page,
      anthropic,
    }) => {
      anthropic.scriptTurns([{ kind: "text", text: "Hello from AT-0050." }]);

      const input = await sendChatMessage(page, "Describe this system");

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

      await sendChatMessage(page, "Show me the system");

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

      const input = await sendChatMessage(page, "Add an Order service");

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

      await sendChatMessage(page, "Add Order");

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

      await sendChatMessage(page, "Add Order");

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

    // AC-11 needs a seed with an edge to write through — see its own describe below.

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

      await sendChatMessage(page, "Add Order");

      await expect(page.locator(".chat-patch-proposal")).toBeVisible();

      await page.getByRole("button", { name: /New Session/ }).click();

      await expect(page.locator(".chat-message--user")).toHaveCount(0);
      await expect(page.locator(".chat-message--assistant")).toHaveCount(0);
      await expect(page.locator(".chat-patch-proposal")).toHaveCount(0);
      await expect(page.getByRole("textbox", { name: /Chat message input/ })).toBeEnabled();
    });

    // ── AC-13〜AC-15: error states ──────────────────────────────────────

    for (const { ac, status, expectedText, expectedButton, hiddenButton } of CHAT_ERROR_CASES) {
      test(`${ac}: ${status} surfaces the inline error with the matching action button`, async ({
        page,
        anthropic,
      }) => {
        anthropic.respondWithError({ status });

        await sendChatMessage(page, `Trigger ${status}`);

        const errorMsg = page.locator(".chat-message--error");
        await expect(errorMsg).toContainText(expectedText);
        await expect(errorMsg.getByRole("button", { name: expectedButton })).toBeVisible();
        await expect(errorMsg.getByRole("button", { name: hiddenButton })).toHaveCount(0);
      });
    }
  });

  // ── AC-11: a stale patch is not applied ─────────────────────────────────
  //
  // The AC needs the open `.krs` to change while the proposal is pending, with
  // Chat still mounted. Editing in the Editor tab cannot do that: `EditPane`
  // mounts `<ChatPane>` only while the Chat tab is active, so the proposal is
  // gone on the tab switch. The preview column stays mounted, and picking an
  // edge direction on a `.krs` without `@import` makes `useEdgeDirectionWriter`
  // inject the import through `handleEditorChange` — the same state update an
  // editor edit makes, so `fileContentRef` (and its hash) changes under Chat.

  test.describe("with an edge to write through the preview", () => {
    const EDGE_KRS = `system Shop {
  service Api {}
  service Db {}
  Api -> Db
}
`;
    const IMPORTED_KRS = `@import "index.krs.style"\n${EDGE_KRS}`;

    test.beforeEach(async ({ opfs, anthropic }) => {
      await bootChat(opfs, anthropic, {
        projects: [{ ...SEED_PROJECT, files: { "index.krs": EDGE_KRS } }],
        lastProjectId: PROJECT_ID,
      });
    });

    test("AC-11: Apply on a patch proposed before the file changed is a no-op", async ({
      page,
      opfs,
      anthropic,
    }) => {
      // One scripted turn only: if Apply went through, its follow-up request
      // would find the queue empty and show up in `anthropic.requests`.
      anthropic.scriptTurns([
        {
          kind: "tool_use",
          tool: "apply_krs_patch",
          input: {
            operation: "append",
            description: "Add Order service",
            content: 'service "Order" {}',
          },
          toolUseId: "toolu_patch_ac11",
        },
      ]);

      await sendChatMessage(page, "Add Order");
      const proposal = page.locator(".chat-patch-proposal");
      await expect(proposal.getByRole("button", { name: /Apply/ })).toBeVisible();
      const requestsAtProposal = anthropic.requests.length;

      // Dirty the file from the preview while Chat stays on screen.
      await rightClickEdge(page, "Api->Db");
      await page.getByRole("menuitem", { name: "↓ Down" }).click();
      await expect.poll(() => opfs.read(INDEX_PATH)).toBe(IMPORTED_KRS);

      const staleWarnings: string[] = [];
      page.on("console", (msg) => {
        if (msg.type() === "warning" && msg.text().includes("hash mismatch")) {
          staleWarnings.push(msg.text());
        }
      });

      await proposal.getByRole("button", { name: /Apply/ }).click();

      // The click reached `applyPatch`, which refused the stale proposal. Its
      // warning is the only positive signal of the refusal (a no-op leaves no
      // DOM trace), and it is what keeps the absence checks below from passing
      // on a click that never landed...
      await expect.poll(() => staleWarnings.length).toBe(1);
      // ...so nothing changed: the proposal is still pending, no follow-up
      // turn was sent, and the file differs from the seed only by the import.
      // Apply leaves no completion signal, so the absence is held for a
      // window: a regression that warned and then went on to save or send
      // the follow-up would show up inside it.
      const holdUntil = Date.now() + APPLY_SETTLE_MS;
      do {
        expect(anthropic.requests.length).toBe(requestsAtProposal);
        expect(await opfs.read(INDEX_PATH)).toBe(IMPORTED_KRS);
        await page.waitForTimeout(100);
      } while (Date.now() < holdUntil);
      await expect(proposal.getByRole("button", { name: /Apply/ })).toBeVisible();
      await expect(proposal.getByRole("button", { name: /Reject/ })).toBeVisible();
    });
  });
});
