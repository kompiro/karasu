/**
 * Plain-text bodies the repo permalink route (`/r/…`, the bare
 * `/<owner>/<repo>` route) sends back when it refuses a permalink. Kept apart
 * from `types.ts` / `en.ts` / `ja.ts` for the same line-budget reason as
 * `first-run.ts`, and joined with it in `catalog-parts.ts`.
 *
 * The route has no locale source yet, so the resolver asks for `en` (#3838).
 */

export type PermalinkTranslations = {
  /**
   * 413: the model at `source` (`owner/repo@ref`) encodes to `length`
   * characters, past the `limit` a server-visible share URL can carry
   * (TPL-2259: the refusal names the cause and the remedy). The caller does not
   * know `limit`: `describeUnfurlOverflow` in the app's `inline-share.ts`
   * supplies it, so the budget stays private to that module.
   */
  "permalink.tooLarge.message": (params: {
    source: string;
    length: number;
    limit: number;
  }) => string;
};

export const permalinkEn: PermalinkTranslations = {
  "permalink.tooLarge.message": ({ source, length, limit }) =>
    `Model too large for a permalink: ${source} ` +
    `encodes to ${length} characters, over the ${limit} a shareable URL can carry. ` +
    "Point the permalink at a narrower entry .krs, or split the model.",
};

export const permalinkJa: Partial<PermalinkTranslations> = {
  "permalink.tooLarge.message": ({ source, length, limit }) =>
    `モデルが大きすぎて permalink にできません: ${source} は ${length} 文字にエンコードされ、` +
    `共有 URL に載せられる ${limit} 文字を超えています。` +
    "permalink の参照先をより狭い入口の .krs にするか、モデルを分割してください。",
};
