/**
 * The public karasu app (ADR-1809). A link meant for someone else is built on
 * this origin when the page it is made on cannot be opened by them: `karasu
 * serve` runs on the author's own machine, so its links point here (#3162,
 * TPL-3162). The docs site holds the same URL as `APP_URL`; a drift test keeps
 * the two equal.
 */
export const HOSTED_APP_ORIGIN = "https://karasu.kompiro.dev";
