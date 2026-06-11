---
id: TPL-20260610-02
title: "spec が約束する診断は専用の診断コードとして実装されていることを検証する"
status: active
date: 2026-06-10
applicable_to:
  - "spec（`docs/spec/*.md`）に「警告を出す」「エラーになる」と挙動を約束する記述を追加・変更するとき"
  - "spec が約束済みの診断に対応する resolver / parser 実装を追加・変更するとき"
  - "構文上の配置制限（トップレベル限定など）を spec が parse error と規定しているとき"
known_consumers:
  - style-resolver
  - parser-legend
discovered_from:
  - root_cause_file: "docs/spec/style.md"
  - root_cause_file: "docs/spec/syntax.md"
related_to:
  - TPL-20260511-02
  - TPL-20260514-08
topic: parser
scope:
  packages:
    - core
---

# TPL-20260610-02: spec が約束する診断は専用の診断コードとして実装されていることを検証する

## 観点

spec の散文が「⚠ Warning を出す」「parse error になる」と **診断挙動を約束** したら、
実装には対応する **専用の診断コード** が存在しなければならない。
TPL-20260511-02 がキーワード一覧の spec↔実装同期を縛るのに対し、本観点は
**挙動の約束**（診断の存在・メッセージの意図）の同期を縛る。

失敗には 2 段階ある:

1. **診断が存在しない** — spec はメッセージ文面例つきで警告を約束しているのに、
   実装に検出コードがない（spec が実装より先に書かれるフローで起きうる形。
   2026-06-10 の監査で `docs/spec/style.md` のセレクタ重複警告がこの状態と
   疑われたが、これは **false positive** だった — 下記「監査側の教訓」参照）
2. **汎用エラーに落ちる** — 拒否はされるが専用コードがなく、unexpected-token 系の
   汎用エラーになり、spec の意図（「legend はトップレベル限定」）がユーザーに
   伝わらない。同監査では `system` 内にネストした `legend` がこの状態だった
   （こちらは実コードで裏取り済み）

どちらも「挙動は概ね仕様どおりなので機能テストでは気づけない」のが厄介な点。
spec の散文約束は `krs` fence の実行チェック（`spec-syntax.test.ts`）でも
キーワード subset チェック（`reference-spec-sync.test.ts`）でも捕捉できない。

### 監査側の教訓（#1493 の false positive）

セレクタ重複警告は実際には `detectStyleConflicts()` + `style-conflict`
警告として end-to-end 実装済みで、構文処理本体（`style-resolver.ts` /
`style-parser.ts`）だけに grep を絞ったため「未実装」と誤判定した（#1493 は
invalid クローズ）。karasu では spec が約束する診断が **横断レイヤー**
（`resolver/warnings.ts` の `analyze()`、warning kind は
`types/warnings.ts`、メッセージは `packages/i18n/src/render-warning.ts`）に
集約されている。本 TPL のチェックリストを適用するときは
`.claude/rules/spec-audit.md` の経路追跡（warning kind → 発行箇所 →
i18n メッセージ → UI 表示）を踏んでから「存在しない」と結論すること。

## 想定される失敗モード

- spec に警告の文面例まで書いたのに実装が後回しになり、そのまま忘れられる
  （spec が実装より先に書かれる開発フローで起きやすい）
- 配置制限・禁止構文が汎用 parse error に落ち、ユーザーがエラーメッセージから
  「何が悪いのか」を読み取れず、spec を逆引きする羽目になる
- 実装側で診断コードを rename / 削除したとき、spec の約束が宙に浮く
  （逆方向の drift）

## チェックリスト

spec に診断の約束を書く / 約束済み領域の実装を変更するとき:

- [ ] spec に「警告 / エラーを出す」と書いた約束それぞれに、対応する専用診断コードが実装に存在するか（`.claude/rules/spec-audit.md` の経路 — `types/warnings.ts` の kind → `resolver/warnings.ts` の発行箇所 → i18n メッセージ — を repo-wide で追って確認。構文処理本体だけの grep で「不在」と結論しない）
- [ ] 約束だけ先行する場合、同じ PR で実装するか、tracking Issue を起こして spec 側に注記したか
- [ ] 禁止構文（配置制限など）は汎用 unexpected-token ではなく、spec の意図を伝える専用メッセージで拒否しているか
- [ ] 診断の register（error / warning / info）は spec の約束および TPL-20260514-08 の判定樹と一致しているか
- [ ] 実装から診断を削除・rename するとき、spec 側の約束も同じ PR で更新したか

## 既知の対処パターン

- **spec の約束を test の名前にする**: 「spec style.md 301-313 が約束するセレクタ
  重複警告が出る」のように、spec の節を参照する unit test を診断ごとに 1 件置く。
  spec 改訂時に test 名が逆引きの索引になる
- **実装しないと決めたら spec を改訂する**: 約束を守れない / 守らないと判断した
  場合は、実装側に合わせて spec から約束を削除する（例: 「last wins のみ、
  警告なし」に改訂）。約束と実装の不一致を放置するのが最悪の状態

## 関連テスト

- `packages/core/src/spec-syntax.test.ts` — `docs/spec/syntax.md` の `krs` fence ↔ parser
  （構文例は縛れるが診断の約束は縛れない — 本 TPL はその補完）
- `packages/core/src/builtins/reference-spec-sync.test.ts` — キーワード集合の同期
  （TPL-20260511-02 の担保。挙動の約束は対象外）
- `packages/core/src/resolver/warnings.test.ts` — セレクタ重複警告
  （`detectStyleConflicts()` / `style-conflict`）の実装側担保。spec style.md の約束に対応する

## 派生元 spec

- `docs/spec/style.md` — 「@import scope and conflicts」節（セレクタ重複警告の約束 — `style-conflict` 警告として実装済み）
- `docs/spec/syntax.md` — 「Diagram legend > Top-level placement」節（ネストは parse error の約束）
