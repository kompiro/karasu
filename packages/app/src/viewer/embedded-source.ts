/**
 * Where the viewer finds the `.krs` it shows (#2997).
 *
 * The server embeds the submission in the document as JSON, so the viewer
 * never asks the network for it:
 *
 * ```html
 * <script type="application/json" id="krs-source">"system Shop { … }"</script>
 * ```
 *
 * JSON (not raw text) so the server can escape `<`, `>` and `&` as `<`
 * etc. and a source containing `</script>` cannot close the element early.
 */
export const EMBEDDED_SOURCE_ID = "krs-source";

/**
 * Read the embedded source. Returns `null` when the element is missing or does
 * not hold a JSON string, so the caller can show an empty viewer instead of
 * crashing on a malformed page.
 */
export function readEmbeddedSource(doc: Document): string | null {
  const text = doc.getElementById(EMBEDDED_SOURCE_ID)?.textContent;
  if (!text) return null;
  try {
    const value: unknown = JSON.parse(text);
    return typeof value === "string" ? value : null;
  } catch {
    return null;
  }
}
