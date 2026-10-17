import { deflateRawSync, inflateRawSync } from "node:zlib";
import { type Locator, type Page, expect } from "@playwright/test";
import { replaceEditorContent } from "./editor.js";
import type { OpfsFixture, SeedOptions } from "./opfs.js";

/**
 * Share dialog choreography and the "open the produced URL" step shared by the
 * share / permalink specs (AT-1783, AT-1801, AT-1827, AT-1958; #3043).
 */

/** The toolbar Share button (`preview.share.ariaLabel`). */
export function shareButton(page: Page): Locator {
  return page.getByRole("button", { name: "Share this diagram" });
}

/** Click Share and return the dialog once the private link has been generated. */
export async function openShareDialog(page: Page): Promise<Locator> {
  await shareButton(page).click();
  const dialog = page.getByRole("dialog", { name: "Share this diagram" });
  await expect(privateUrlInput(dialog)).toHaveValue(/#s=/);
  return dialog;
}

/** The private `#s=` link field (`preview.share.dialog.privateUrlAriaLabel`). */
export function privateUrlInput(dialog: Locator): Locator {
  return dialog.getByRole("textbox", { name: "Private shareable URL" });
}

/** The server-visible `/s?s=` link field (`preview.share.dialog.unfurlUrlAriaLabel`). */
export function previewUrlInput(dialog: Locator): Locator {
  return dialog.getByRole("textbox", { name: "Shareable URL with preview" });
}

/** The private link as shown in the dialog. */
export async function readPrivateUrl(dialog: Locator): Promise<string> {
  return privateUrlInput(dialog).inputValue();
}

/** The `<enc>` of a `#s=<enc>` or `?s=<enc>` URL. */
export function sharePayloadOf(url: string): string {
  const parsed = new URL(url);
  const fromHash = new URLSearchParams(parsed.hash.slice(1)).get("s");
  const encoded = fromHash ?? parsed.searchParams.get("s");
  if (encoded === null) throw new Error(`no s= payload in ${url}`);
  return encoded;
}

/** The JSON a `#s=` payload decodes to (`SharePayload` in `@karasu-tools/core`). */
export interface DecodedSharePayload {
  krs: string;
  style?: string;
  target?: { view: string; node?: string; highlight?: string; orgTree?: true };
}

/**
 * Decode a share `<enc>`, apply `edit`, and encode it again. The app's codec is
 * JSON → raw DEFLATE (fflate `deflateSync`) → base64url (`utils/inline-share.ts`).
 * For links no Share click can produce, e.g. a `target` whose node the model
 * no longer has.
 */
export function rewriteSharePayload(
  encoded: string,
  edit: (payload: DecodedSharePayload) => DecodedSharePayload,
): string {
  const json = inflateRawSync(Buffer.from(encoded, "base64url")).toString("utf8");
  const payload = edit(JSON.parse(json) as DecodedSharePayload);
  return deflateRawSync(Buffer.from(JSON.stringify(payload), "utf8")).toString("base64url");
}

/**
 * Put the sharer on `/?mode=memory` with `krs` in the editor, while the fixture
 * itself stays in `opfs` mode (see {@link openSharedUrl}). `seed` goes to
 * `opfs.seed` first, so a spec can give the visitor a local project to keep
 * intact; memory mode never touches it. Its `mode` must stay `"opfs"`.
 */
export async function bootSharer(
  page: Page,
  opfs: OpfsFixture,
  krs: string,
  seed: Omit<SeedOptions, "mode"> = {},
): Promise<void> {
  await opfs.seed(seed);
  await opfs.gotoApp("/?mode=memory");
  await replaceEditorContent(page, krs);
}

/**
 * Open a produced share URL the way a visitor does: a full document load.
 *
 * `App.tsx` reads the `#s=` payload and the `?krs=` anchor once, from a
 * snapshot taken when the module loads. A navigation that changes only the
 * hash is same-document, so the app never re-reads them, and a spec that
 * asserts on the still-rendered sharer view passes without testing the
 * restore at all. Two things make a navigation hash-only, and this refuses
 * both instead of letting the spec pass vacuously:
 *
 * - the fixture in `memory` mode, whose `gotoApp` appends `?mode=memory` and
 *   so rewrites the URL under test;
 * - a current page with the same path and query as `url` (e.g. sharing from
 *   `/projects/<id>`, whose private link is `/projects/<id>#s=…`).
 */
export async function openSharedUrl(page: Page, opfs: OpfsFixture, url: string): Promise<void> {
  if (opfs.mode !== "opfs") {
    throw new Error("openSharedUrl: seed the fixture in opfs mode; memory mode rewrites the URL");
  }
  const current = new URL(page.url());
  const target = new URL(url);
  if (
    current.origin + current.pathname + current.search ===
    target.origin + target.pathname + target.search
  ) {
    throw new Error(`openSharedUrl: ${url} differs from the current page only by its hash`);
  }
  await opfs.gotoApp(url);
}
