import { test, expect, type AnthropicFixture } from "../fixtures/anthropic.js";
import type { OpfsFixture } from "../fixtures/opfs.js";

/**
 * Smoke tests for the Anthropic transport fixture.
 *
 * Proves that:
 * 1. A scripted text turn round-trips through `useChatSession`: the user
 *    message and AI response both appear in the DOM, and the request body
 *    is captured for assertion.
 * 2. A scripted `navigate_view` tool_use turn triggers the SDK's tool-use
 *    follow-up (a second `messages.create` call carrying `tool_result`),
 *    proving the mock returns the right shape for the SDK to decode.
 * 3. A scripted 401 surfaces as the auth-typed inline error in the chat,
 *    proving the SDK's `APIError` classification path is preserved by the
 *    mock and that `useChatSession/errors.ts` still maps it correctly.
 *
 * If these pass, AT-0050 (BYOK Chat UI) can build on top of this fixture.
 *
 * Chromium-only: the underlying `opfs` fixture is chromium-only. The
 * `bootChat` helper pins `karasu-locale=en` after `opfs.seed()` (which
 * wipes localStorage) so the English button labels used by the
 * `getByRole(...)` selectors below stay stable across CI runners with
 * different `navigator.language`.
 */

const PROJECT = {
  id: "fixture-only",
  name: "Fixture Only",
  files: { "index.krs": 'system "Fixture Only" {}\n' },
};

async function bootChat(opts: {
  page: import("@playwright/test").Page;
  opfs: OpfsFixture;
  anthropic: AnthropicFixture;
}) {
  await opts.opfs.seed({ projects: [PROJECT], lastProjectId: PROJECT.id });
  await opts.page.evaluate(() => localStorage.setItem("karasu-locale", "en"));
  await opts.anthropic.seedApiKey("sk-ant-test-fake");
  await opts.opfs.gotoApp();
}

test.describe("anthropic fixture smoke", () => {
  test("scripts a text turn so the chat round-trips end-to-end", async ({
    page,
    opfs,
    anthropic,
  }) => {
    await bootChat({ page, opfs, anthropic });

    await anthropic.scriptTurns([{ kind: "text", text: "Hello from the fixture." }]);

    await page.getByRole("tab", { name: /Chat/ }).click();
    const input = page.getByRole("textbox", { name: /Chat message input/i });
    await input.fill("Hi");
    await input.press("ControlOrMeta+Enter");

    await expect(page.locator(".chat-message--user .chat-message-content")).toHaveText("Hi");
    await expect(page.locator(".chat-message--assistant")).toContainText("Hello from the fixture.");

    expect(anthropic.requests).toHaveLength(1);
    expect(anthropic.requests[0]?.body.messages).toEqual([{ role: "user", content: "Hi" }]);
  });

  test("scripts a navigate_view tool_use so the SDK issues a tool_result follow-up", async ({
    page,
    opfs,
    anthropic,
  }) => {
    await bootChat({ page, opfs, anthropic });

    await anthropic.scriptTurns([
      {
        kind: "tool_use",
        tool: "navigate_view",
        input: { path: ["fixture-only"] },
        toolUseId: "toolu_test_navigate",
      },
      { kind: "text", text: "Navigated to fixture-only." },
    ]);

    await page.getByRole("tab", { name: /Chat/ }).click();
    const input = page.getByRole("textbox", { name: /Chat message input/i });
    await input.fill("Show me the fixture system");
    await input.press("ControlOrMeta+Enter");

    await expect(page.locator(".chat-message--assistant")).toContainText(
      "Navigated to fixture-only.",
    );

    // Two requests: the initial turn and the tool_result follow-up.
    expect(anthropic.requests).toHaveLength(2);
    const followup = anthropic.requests[1]?.body.messages as Array<{
      role: string;
      content: unknown;
    }>;
    const lastUserBlock = followup.at(-1);
    expect(lastUserBlock?.role).toBe("user");
    expect(lastUserBlock?.content).toEqual([
      { type: "tool_result", tool_use_id: "toolu_test_navigate", content: "Navigated." },
    ]);
  });

  test("respondWithError(401) surfaces the auth-typed inline error", async ({
    page,
    opfs,
    anthropic,
  }) => {
    await bootChat({ page, opfs, anthropic });

    await anthropic.respondWithError({ status: 401 });

    await page.getByRole("tab", { name: /Chat/ }).click();
    const input = page.getByRole("textbox", { name: /Chat message input/i });
    await input.fill("This should fail with 401");
    await input.press("ControlOrMeta+Enter");

    const errorMsg = page.locator(".chat-message--error");
    await expect(errorMsg).toContainText("API key is invalid");

    // Auth-typed errors swap the retry button for the Open Settings button.
    await expect(errorMsg.getByRole("button", { name: /Open Settings/i })).toBeVisible();
    await expect(errorMsg.getByRole("button", { name: /Retry/i })).toHaveCount(0);
  });
});
