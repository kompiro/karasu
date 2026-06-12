# AT: アノテーション名の open set 明文化と near-miss typo ヒント

- **日付**: 2026-06-12
- **関連 Issue**: [#1499](https://github.com/kompiro/karasu/issues/1499)（spec 適合性監査 [#1502](https://github.com/kompiro/karasu/issues/1502) 由来）
- **関連 TPL**: [TPL-20260610-01](../test-perspectives/TPL-20260610-01-accepted-vocabulary-must-have-effect.md)
- **対象ファイル**: `packages/core/src/resolver/warnings.ts`,
  `packages/core/src/types/warnings.ts`,
  `packages/i18n/src/{en,ja,types,render-warning}.ts`,
  `docs/spec/tags-annotations.md` / `.ja.md`

## 受け入れ条件（自動）

### detector — `packages/core/src/resolver/warnings.test.ts`

- [x] 組み込み名の near-miss（`@depracated`）に `annotation-possible-typo` ヒントが出て、suggestion が `deprecated` になる

  > ✅ Automated — `warnings.test.ts` › `hints a near-miss of a built-in annotation`

- [x] 隣接転置（`@nwe` → `@new`）も編集距離 1 として捕捉する

  > ✅ Automated — `warnings.test.ts` › `catches an adjacent transposition of a short built-in (@nwe → @new)`

- [x] severity は `info`（open set なので defect とは断定しない）

  > ✅ Automated — `warnings.test.ts` › `renders as info, not warning — annotation names are an open set`

- [x] 組み込み名そのもの・組み込みから遠いユーザー定義名にはヒントを出さない

  > ✅ Automated — `warnings.test.ts` › `stays silent for exact built-in names` / `stays silent for user-defined names far from any built-in`

- [x] スタイルシートのアノテーションセレクタに現れる名前は意図的なユーザー定義としてヒントを抑制する

  > ✅ Automated — `warnings.test.ts` › `treats a name targeted by a stylesheet annotation selector as intentional`

- [x] system 直付け・ネストした resource のアノテーションも走査される

  > ✅ Automated — `warnings.test.ts` › `walks annotations on systems and nested resources`

### i18n — `packages/i18n/src/render-warning.test.ts`

- [x] en / ja 両 locale でメッセージに nodeId・誤記名・suggestion が含まれ、placeholder が残らない

  > ✅ Automated — `render-warning.test.ts` › 網羅テスト（`Record<WarningKind, …>` により kind 追加時に強制）

### spec — `docs/spec/tags-annotations.md` / `.ja.md`

- [x] 「Annotation names are an open set」節が en / ja 同構造で存在する（CI `lint:spec-structure-sync`）

  > ✅ Automated — `scripts/lint/spec-structure-sync.ts`（pre-push / CI）

## 受け入れ条件（手動）

- [ ] app のプレビューで `service Legacy @depracated {}` を含む `index.krs` を開くと、WarningPanel に ℹ（info）アイコンで `"@depracated" on Legacy — did you mean "@deprecated"?` が表示される（ja locale では日本語メッセージ）
- [ ] 同じ内容で VS Code 拡張（LSP）の Problems パネルに Information 重要度の診断が出る
