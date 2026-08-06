/* eslint-disable no-console -- `console` is the Workers logging transport; there is no alternative sink in this runtime */
/**
 * The one place karasu-nest writes to the log.
 *
 * Funnelling it through a single module keeps the `no-console` exemption to a
 * single file, and gives one place to enforce the rule that matters here:
 * **nothing derived from a repository's contents goes to the log.** The
 * service is a data processor for other people's private code (ADR-1990
 * decision 6), and a log line is retention.
 *
 * `detail` is deliberately typed `unknown` and passed straight to the runtime
 * rather than interpolated: an `Error` keeps its stack in the Cloudflare log
 * without us formatting anything ourselves.
 */
export function logError(message: string, detail?: unknown): void {
  if (detail === undefined) console.error(message);
  else console.error(message, detail);
}

/**
 * For the handful of events worth a trace even when nothing went wrong — a
 * purge, above all, since "it ran" is the only thing anyone can check after
 * the fact.
 */
export function logInfo(message: string): void {
  console.log(message);
}
