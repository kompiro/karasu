# AT: アノテーション名の open set 明文化と near-miss typo ヒント

- **日付**: 2026-06-12
- **関連 Issue**: [#1499](https://github.com/kompiro/karasu/issues/1499)（spec 適合性監査 [#1502](https://github.com/kompiro/karasu/issues/1502) 由来）
- **関連 TPL**: [TPL-1503](../test-perspectives/TPL-1503-accepted-vocabulary-must-have-effect.md)
- **対象ファイル**: `packages/core/src/resolver/warnings.ts`,
  `packages/core/src/types/warnings.ts`,
  `packages/i18n/src/{en,ja,types,render-warning}.ts`,
  `docs/spec/tags-annotations.md` / `.ja.md`

## 受け入れ条件（自動）

### detector — `packages/core/src/resolver/warnings.test.ts`

- [x] 組み込み名の near-miss（`@depracated`）はパーサーが `annotation-possible-typo` エラーで拒否し、suggestion が `deprecated` になる。拒否したアノテーションはモデルに入らない（`.krs language v2.0` で変更 — #2677）

  > ✅ Automated — `warnings.test.ts` › `annotation-possible-typo error (#2677)` › `rejects a near-miss of a builtin annotation and keeps it out of the model`

- [x] 隣接転置（`@nwe` → `@new`）も編集距離 1 として捕捉する

  > ✅ Automated — `warnings.test.ts` › `catches an adjacent transposition of a short builtin (@nwe → @new)`

- [x] severity は `error`（v2.0 で語彙は閉じたので、組み込み名の near-miss は誤記と断定する。v1.x では open set のため `info`）（`.krs language v2.0` で変更 — #2677）

  > ✅ Automated — `warnings.test.ts` › `rejects a near-miss of a builtin annotation and keeps it out of the model`（`severity` が `error`）/ `packages/lsp/src/diagnostics.test.ts` › `surfaces annotation-possible-typo as an error`

- [x] 組み込み名そのもの・組み込みから遠いユーザー定義名には `annotation-possible-typo` を出さない（遠い名前は `annotation-not-builtin` 側。両者は排他）

  > ✅ Automated — `warnings.test.ts` › `stays silent for exact builtin names` / `leaves @%s alone (outside the budget, so annotation-not-builtin instead)`

- [x] スタイルシートのアノテーションセレクタによる抑制は無い。`annotation-possible-typo` はスタイルシートを見ないパーサー診断で、near-miss には `annotation-not-builtin` も出ない（v1.x ではセレクタに現れる名前を意図的なユーザー定義としてヒントを抑制していた）（`.krs language v2.0` で変更 — #2677）

  > ✅ Automated — `warnings.test.ts` › `annotation-not-builtin warning (#2159, closed register in v2.0)` › `never fires on a near-miss: the parser rejects it as annotation-possible-typo` / `is not suppressed by a style selector`

- [x] system 直付け・ネストした resource・team のアノテーションも走査される

  > ✅ Automated — `warnings.test.ts` › `walks systems, nested resources and teams`

### i18n — `packages/i18n/src/render-diagnostic.test.ts`

- [x] en / ja 両 locale でメッセージに誤記名・suggestion が含まれ、placeholder が残らない（パーサー診断になったため `render-warning` から `render-diagnostic` へ移った）（`.krs language v2.0` で変更 — #2677）

  > ✅ Automated — `render-diagnostic.test.ts` › `renderDiagnostic — i18n coverage for every DiagnosticCode`（`Record<DiagnosticCode, …>` により code 追加時に強制）

### spec — `docs/spec/tags-annotations.md` / `.ja.md`

- [x] 「Non-builtin annotation names have no effect」節（旧「Annotation names are an open set」）が en / ja 同構造で存在する（CI `lint:spec-structure-sync`）（`.krs language v2.0` で変更 — #2677）

  > ✅ Automated — `scripts/lint/spec-structure-sync.ts`（pre-push / CI）

## 受け入れ条件（手動）

- [ ] app のプレビューで `service Legacy @depracated {}` を含む `index.krs` を開くと、エラーとして `@depracated` と提案 `@deprecated` を含むメッセージが表示される（ja locale では日本語メッセージ）（`.krs language v2.0` で変更 — #2677）
- [ ] 同じ内容で VS Code 拡張（LSP）の Problems パネルに Error 重要度の診断が出る（`.krs language v2.0` で変更 — #2677）
