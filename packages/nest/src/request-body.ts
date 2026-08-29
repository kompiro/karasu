/**
 * Reading a request body with a cap applied **while** it arrives.
 *
 * This lives beside `http.ts` rather than inside it because `http.ts` is about
 * what this Worker answers, and this is about what it is willing to read. Both
 * doors that take a `.krs` need the same guard, and a guard that each route
 * writes for itself is a guard the next route forgets: `routes/submit.ts` had
 * it and `routes/console.ts` did not, so the console read an unbounded body
 * into the isolate and only then asked `validateSubmission` how big the
 * document was.
 *
 * `request.text()` (and `request.formData()`, which buffers the same way)
 * reads the whole body first and asks about its size afterwards, which makes
 * the check a statement about memory already spent: a Worker gets 128MB for
 * everything it does, and a request that understates its length or declares
 * none is exactly the request a cap exists to refuse. Counting as the chunks
 * come in means the refusal happens at the byte that crosses the line, and
 * cancelling the reader tells the runtime to stop pulling the rest instead of
 * draining a body nobody will read.
 *
 * Decoding as it goes also removes a second full copy: measuring by
 * re-encoding the finished string leaves an accepted body existing twice at
 * once, and materialises an oversized one twice before the 413.
 */
import { error } from "./http.js";
import { MAX_SUBMISSION_BYTES } from "./store/submissions.js";

/**
 * The ceiling on a JSON submission request: twice the document cap, so the
 * JSON envelope has room.
 */
export const MAX_JSON_BODY_BYTES = MAX_SUBMISSION_BYTES * 2;

/**
 * The ceiling on a form post, four times the document cap rather than twice.
 *
 * `application/x-www-form-urlencoded` percent-encodes, and a byte that needs
 * encoding costs three characters — so a `.krs` full of Japanese labels
 * arrives at three times its stored size. A cap of `MAX_SUBMISSION_BYTES * 2`
 * here would turn a document the gallery accepts into a 413 at the transport
 * layer, which is both a refusal of something legitimate and the wrong reason
 * given for it. Four times leaves the encoding its worst case plus the field
 * names.
 */
export const MAX_FORM_BODY_BYTES = MAX_SUBMISSION_BYTES * 4;

/**
 * The transport-level refusal, with a code of its own.
 *
 * `too_large` already means "the document exceeds its cap", returned as 400 by
 * `validateSubmission`. This is the other thing — the request was too big to
 * read at all — and `http.ts` says callers branch on the code, so the two do
 * not share one. `routes/webhook.ts` split the same way.
 */
export const payloadTooLarge = (limit: number): Response =>
  error(413, "payload_too_large", `A request body must be at most ${limit} bytes.`);

/**
 * Read the body with the cap applied as it arrives, or `undefined` once it
 * goes past.
 */
export async function readCapped(
  body: ReadableStream<Uint8Array> | null,
  limit: number,
): Promise<string | undefined> {
  // No body at all is not oversized; it fails as JSON — or reads as an empty
  // form — a few lines later, which is the truthful thing to say about it.
  if (body === null) return "";
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done || value === undefined) break;
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel();
        return undefined;
      }
      // `stream: true`: a multi-byte character split across two chunks is
      // ordinary here (`.krs` files carry Japanese labels), and decoding each
      // chunk on its own would replace the halves with U+FFFD.
      text += decoder.decode(value, { stream: true });
    }
  } finally {
    reader.releaseLock();
  }
  return text + decoder.decode();
}

/**
 * Whether the sender's declared length is already past the cap.
 *
 * Worth refusing on when it is present and honest — it costs nothing and stops
 * the transfer earliest — but never on its own: `Content-Length` is absent on
 * a chunked request and can simply be understated, and an absent header reads
 * as `0` rather than as "unknown".
 */
export function declaredOverLimit(request: Request, limit: number): boolean {
  const header = request.headers.get("Content-Length");
  if (header === null) return false;
  const declared = Number(header);
  return Number.isFinite(declared) && declared > limit;
}

/**
 * A form post, read under the cap, or the 413 to answer with.
 *
 * `URLSearchParams` rather than `request.formData()`. The console's forms
 * carry no `enctype`, so what arrives is always urlencoded, and parsing it
 * here keeps the read capped — `formData()` has no way to be. It also cannot
 * throw on a body that is not a form, where `formData()` would, turning a
 * malformed request into a 500 instead of an empty field set the route
 * already knows how to reject.
 */
export async function readFormBody(
  request: Request,
  limit: number = MAX_FORM_BODY_BYTES,
): Promise<URLSearchParams | Response> {
  if (declaredOverLimit(request, limit)) return payloadTooLarge(limit);
  const raw = await readCapped(request.body, limit);
  if (raw === undefined) return payloadTooLarge(limit);
  return new URLSearchParams(raw);
}
