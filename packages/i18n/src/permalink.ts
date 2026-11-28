/**
 * Plain-text bodies the repo permalink route (`/r/…`, the bare
 * `/<owner>/<repo>` route) sends back when it refuses a permalink. Kept apart
 * from `types.ts` / `en.ts` / `ja.ts` for the same line-budget reason as
 * `first-run.ts`, and joined with it in `catalog-parts.ts`.
 *
 * The route has no locale source yet, so the resolver asks for `en` (#3838).
 * The English text is the plain-text body the route has always sent; callers
 * and crawlers may read it, so change it only on purpose.
 */

export type PermalinkTranslations = {
  /** 400: the permalink path is empty. */
  "permalink.parse.empty": string;
  /** 400: `@` is present but nothing follows it. */
  "permalink.parse.emptyRef": string;
  /** 400: the ref after `@` is not a SHA or a slash-free branch/tag name. */
  "permalink.parse.invalidRef": (params: { ref: string }) => string;
  /** 400: the path has fewer than two segments (`<owner>/<repo>`). */
  "permalink.parse.shape": string;
  /** 400: the owner segment is not a valid GitHub owner name. */
  "permalink.parse.invalidOwner": (params: { owner: string }) => string;
  /** 400: the repo segment is not a valid GitHub repo name. */
  "permalink.parse.invalidRepo": (params: { repo: string }) => string;
  /** 400: the file path is absolute, traverses upward, or uses backslashes. */
  "permalink.parse.invalidPath": (params: { path: string }) => string;
  /** 400: the file path does not end in `.krs`. */
  "permalink.parse.notKrs": (params: { path: string }) => string;
  /**
   * 404: no `.krs` exists at `source` (`owner/repo@ref`); `tried` is the
   * explicit path, or the default entry names joined with ` / `.
   */
  "permalink.notFound.message": (params: { source: string; tried: string }) => string;
  /** 502: GitHub answered with an error `status` while fetching the model. */
  "permalink.upstream.message": (params: { status: number }) => string;
  /** 500: resolving `source` failed unexpectedly; `detail` is the error's message. */
  "permalink.failed.message": (params: { source: string; detail: string }) => string;
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
  "permalink.parse.empty": "Empty permalink.",
  "permalink.parse.emptyRef":
    "Empty ref after '@' — give a branch/tag/SHA, or omit '@' for the default branch.",
  "permalink.parse.invalidRef": ({ ref }) =>
    `Invalid ref "${ref}". Use a commit SHA, or a slash-free branch/tag name.`,
  "permalink.parse.shape": "Expected '<owner>/<repo>[/<path>]@<ref>'.",
  "permalink.parse.invalidOwner": ({ owner }) => `Invalid owner "${owner}".`,
  "permalink.parse.invalidRepo": ({ repo }) => `Invalid repo "${repo}".`,
  "permalink.parse.invalidPath": ({ path }) => `Invalid path "${path}".`,
  "permalink.parse.notKrs": ({ path }) => `Path must point to a .krs file, got "${path}".`,
  "permalink.notFound.message": ({ source, tried }) =>
    `No .krs found at ${source} (looked for ${tried}).`,
  "permalink.upstream.message": ({ status }) => `Upstream GitHub error (${status}).`,
  "permalink.failed.message": ({ source, detail }) => `Failed to resolve ${source}: ${detail}`,
  "permalink.tooLarge.message": ({ source, length, limit }) =>
    `Model too large for a permalink: ${source} ` +
    `encodes to ${length} characters, over the ${limit} a shareable URL can carry. ` +
    "Point the permalink at a narrower entry .krs, or split the model.",
};

export const permalinkJa: Partial<PermalinkTranslations> = {
  "permalink.parse.empty": "permalink が空です。",
  "permalink.parse.emptyRef":
    "'@' の後ろに ref がありません。ブランチ・タグ・SHA を書くか、既定のブランチなら '@' を省いてください。",
  "permalink.parse.invalidRef": ({ ref }) =>
    `ref "${ref}" は使えません。コミットの SHA か、スラッシュを含まないブランチ名・タグ名にしてください。`,
  "permalink.parse.shape": "'<owner>/<repo>[/<path>]@<ref>' の形で書いてください。",
  "permalink.parse.invalidOwner": ({ owner }) => `owner "${owner}" は使えません。`,
  "permalink.parse.invalidRepo": ({ repo }) => `repo "${repo}" は使えません。`,
  "permalink.parse.invalidPath": ({ path }) => `パス "${path}" は使えません。`,
  "permalink.parse.notKrs": ({ path }) =>
    `パスは .krs ファイルを指す必要があります（指定: "${path}"）。`,
  "permalink.notFound.message": ({ source, tried }) =>
    `${source} に .krs が見つかりません（探したもの: ${tried}）。`,
  "permalink.upstream.message": ({ status }) => `GitHub がエラーを返しました（${status}）。`,
  "permalink.failed.message": ({ source, detail }) => `${source} を解決できませんでした: ${detail}`,
  "permalink.tooLarge.message": ({ source, length, limit }) =>
    `モデルが大きすぎて permalink にできません: ${source} は ${length} 文字にエンコードされ、` +
    `共有 URL に載せられる ${limit} 文字を超えています。` +
    "permalink の参照先をより狭い入口の .krs にするか、モデルを分割してください。",
};
