# AT: 日本語判定が `ja` を名乗る他言語を取り込まない

- **日付**: 2026-09-02
- **関連 Issue**: [#2535](https://github.com/kompiro/karasu/issues/2535)
- **設計 (ADR)**: [ADR-2535](../adr/2535-locale-ja-exact-subtag.md)
- **対象ファイル**: `packages/i18n/src/locale.ts`,
  `packages/i18n/src/locale.test.ts`,
  `scripts/lint/locale-normalization-single-owner.ts`,
  `docs/spec/i18n.md`

## 受け入れ条件

- [x] `jav` / `jav-ID`（Javanese）と `jam` / `jam-JM`（Jamaican Creole）が英語に落ちる。日本語でも英語でもない言語に対する答えはフォールバックの en である

  > ✅ Automated — `packages/i18n/src/locale.test.ts` › `resolveLocaleTag` › `primary-subtag boundary (ADR-2535)` › `leaves non-Japanese ja* languages to the English fallback`

- [x] Windows が言語名で報告する `Japanese_Japan.932` は日本語のままである（締め直しで日本語 Windows ユーザーを英語に落とさない）

  > ✅ Automated — `packages/i18n/src/locale.test.ts` › `resolveLocaleTag` › `primary-subtag boundary (ADR-2535)` › `keeps the Windows language-name form on Japanese`

- [x] Windows の言語名の許可は日本語だけに閉じており、`English_United States.1252` のような他の言語名を経路に載せない

  > ✅ Automated — `packages/i18n/src/locale.test.ts` › `resolveLocaleTag` › `primary-subtag boundary (ADR-2535)` › `does not extend the Windows allowance to other language names`

- [x] 既存の日本語タグは形式を問わず日本語のままである（BCP-47・POSIX・大文字小文字・サブタグが続く形）

  > ✅ Automated — `packages/i18n/src/locale.test.ts` › `resolveLocaleTag` › `resolves Japanese BCP-47 tags to 'ja'` / `resolves Japanese POSIX locale strings to 'ja'` / `matches the language subtag case-insensitively` / `primary-subtag boundary (ADR-2535)` › `matches Japanese however many subtags follow it`

- [x] 未設定（`""` / `null` / `undefined`）と非日本語タグは従来どおり英語に落ちる

  > ✅ Automated — `packages/i18n/src/locale.test.ts` › `resolveLocaleTag` › `falls back to 'en' for any non-Japanese tag` / `falls back to 'en' when the environment reports no tag`

- [x] 判定規則の所有者は `resolveLocaleTag` 1 つのままで、consumer が新しいイディオム（主要サブタグの完全一致）を再インライン化したらビルドが落ちる

  > ✅ Automated — `scripts/lint/locale-normalization-single-owner.test.ts` › `locale-normalization-single-owner scanner` › `regression rehearsal` › `flags the primary-subtag comparison form the owner now uses`

- [x] drift ガードの所有者免除がパスの腐りで死んでいない — 免除しているパスに今も `resolveLocaleTag` が居る

  > ✅ Automated — `scripts/lint/locale-normalization-single-owner.test.ts` › `locale-normalization-single-owner scanner` › `real repo: the allowlist still points at the rule's owner`

- [x] ロケールと無関係な分割（ファイル名・バージョン・複合識別子を `[.]` / `[._-]` / `[-_]` で切る）や、同じ 2 文字で始まる識別子（`java-service` / `jamstack`）はガードの検出対象にならない

  > ✅ Automated — `scripts/lint/locale-normalization-single-owner.test.ts` › `locale-normalization-single-owner scanner` › `regression rehearsal` › `does not flag unrelated identifiers that begin the same way`

- [x] 実リポジトリで再インライン化がゼロである

  > ✅ Automated — `scripts/lint/locale-normalization-single-owner.test.ts` › `locale-normalization-single-owner scanner` › `real repo: no package re-implements the tag-matching rule`

## 手動確認

N/A — 自動テストですべて覆っている。

判定は純粋関数の入出力表で、`resolveLocaleTag` に渡る生タグの取り出しは consumer 側の
既存テストが別途覆っている。Javanese を報告するブラウザやエディタを用意しても、
確認できるのは上の表と同じ判定であり、実機を要する項目にはならない。
