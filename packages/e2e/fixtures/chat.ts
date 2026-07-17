import type { Locator, Page } from "@playwright/test";
import type { AnthropicFixture } from "./anthropic.js";
import type { OpfsFixture, SeedProject } from "./opfs.js";

/**
 * Options for `bootChat`. Mirrors the `projects` / `lastProjectId` shape of
 * `OpfsFixture.seed()` plus the API-key state every Chat UI spec needs to
 * pick before the app boots.
 */
export type BootChatOptions = {
  projects: ReadonlyArray<SeedProject>;
  lastProjectId: string;
  /**
   * API key to seed via `anthropic.seedApiKey()`. Pass `null` to instead
   * call `anthropic.clearApiKey()` — the no-key boot path used by AT-0050's
   * AC-1..AC-5 (ApiKeySetup / Settings-pane cases). Default:
   * `"sk-ant-test-fake"`.
   */
  apiKey?: string | null;
};

/**
 * Seed OPFS, seed or clear the BYOK API key, and navigate to the app — the
 * boot sequence shared by every Chat UI spec:
 *
 *   await opfs.seed({ projects, lastProjectId });
 *   await anthropic.seedApiKey(apiKey);   // or anthropic.clearApiKey()
 *   await opfs.gotoApp();
 */
export async function bootChat(
  opfs: OpfsFixture,
  anthropic: AnthropicFixture,
  options: BootChatOptions,
): Promise<void> {
  await opfs.seed({ projects: [...options.projects], lastProjectId: options.lastProjectId });
  if (options.apiKey === null) {
    await anthropic.clearApiKey();
  } else {
    await anthropic.seedApiKey(options.apiKey ?? "sk-ant-test-fake");
  }
  await opfs.gotoApp();
}

/**
 * Open the Chat tab, fill the message input, and send it via
 * `ControlOrMeta+Enter` — the "open Chat tab, fill input, send" triple
 * repeated by every message-sending Chat UI test.
 *
 * Returns the input locator so callers that need to keep asserting on it
 * afterward (e.g. `toHaveValue("")`, `toBeDisabled()`) don't have to
 * re-locate it.
 */
export async function sendChatMessage(page: Page, text: string): Promise<Locator> {
  await page.getByRole("tab", { name: /Chat/ }).click();
  const input = page.getByRole("textbox", { name: /Chat message input/i });
  await input.fill(text);
  await input.press("ControlOrMeta+Enter");
  return input;
}

/**
 * The 401 / 429 / 500 error-expectation table for the Anthropic mock.
 * Shared by AT-0050 (AC-13..AC-15) and the fixture smoke spec so the two
 * copies can't drift when `useChatSession/errors.ts` strings change.
 *
 * `ac` labels the AT-0050 acceptance criterion for its test titles; the
 * smoke spec ignores it.
 */
export const CHAT_ERROR_CASES = [
  {
    ac: "AC-13",
    status: 401 as const,
    expectedText: /API key is invalid/,
    expectedButton: /Open Settings/i,
    hiddenButton: /Retry/i,
  },
  {
    ac: "AC-14",
    status: 429 as const,
    expectedText: /Rate limit reached/,
    expectedButton: /Retry/i,
    hiddenButton: /Open Settings/i,
  },
  {
    ac: "AC-15",
    status: 500 as const,
    expectedText: /Anthropic server error/,
    expectedButton: /Retry/i,
    hiddenButton: /Open Settings/i,
  },
] as const;
