/* eslint-disable no-console -- `console` is the Workers logging transport; there is no alternative sink in this runtime */
/**
 * The one place karasu-nest writes to the log.
 *
 * Funnelling it through a single module keeps the `no-console` exemption to a
 * single file, and gives one place to enforce the rule that matters here:
 * **nothing a submitter entrusted to us goes to the log.** The rule narrowed
 * with #2590 — there is no repository being read any more — but it did not go
 * away: a submitted document, a session id and a GitHub identifier all pass
 * through this service, and a log line is retention.
 *
 * `detail` is deliberately typed `unknown` and passed straight to the runtime
 * rather than interpolated: an `Error` keeps its stack in the Cloudflare log
 * without us formatting anything ourselves.
 */
export function logError(message: string, detail?: unknown): void {
  if (detail === undefined) console.error(message);
  else console.error(message, detail);
}
