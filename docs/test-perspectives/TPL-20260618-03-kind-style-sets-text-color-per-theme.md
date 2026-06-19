---
id: TPL-20260618-03
title: "ノード kind ルールで background-color を設定したら、対になる text color も設定する（テーマごと）"
status: active
date: 2026-06-18
applicable_to:
  - "`default-style.ts` の builtin テーマテンプレート（dark / light）にノード kind ルールを追加・変更するとき"
  - "新しい deploy kind / node kind に背景色を与えるとき"
discovered_from:
  - issue: "#1697"
  - root_cause_file: "packages/core/src/builtins/default-style.ts"
related_to:
  - TPL-20260618-01
topic: styling
scope:
  packages:
    - core
---

# TPL-20260618-03: ノード kind ルールで background-color を設定したら、対になる text color も設定する（テーマごと）

## 観点

builtin テーマ（dark / light）のノード kind ルールが `background-color` を設定する
なら、**同じルールで text `color` も設定する**。`color` を省くとラベルは
`defaultNodeStyle.color`（テーマ非依存の白 `#F9FAFB`）に落ちる。dark テーマの濃い
カードでは白文字で読めるため、**light テーマで初めて「薄いカード × 白文字」で
読めなくなる**（contrast バグ）。dark だけ目視確認すると見落とす。

#1697: light テンプレートの deploy kind（`oci`/`lambda`/`job`/…）が
`background-color`/`border-color`/`badge-*` だけ設定して `color` を欠いていたため、
light theme の deploy ラベルが白で潰れていた。logical kind は `color` を持っていた。

## 想定される失敗モード

- light テンプレートに新しい kind を足し、背景色だけ指定して text color を忘れる
  → その kind のラベルが light theme で白く潰れる。
- dark テンプレートでだけ目視確認し、light theme を確認しないため気づかない。

## チェックリスト

`default-style.ts` の kind ルールを追加・変更するとき:

- [ ] `background-color` を設定したルールは、対になる **text `color`** も設定したか
- [ ] **light テーマ**でラベルが背景に対して読めるか（白文字 `#F9FAFB` に落ちて
      いないか）を確認したか（dark だけでなく light も render して確認）
- [ ] dark / light の両テンプレートで同じ kind 集合を揃えているか

## 既知の対処パターン

- light テンプレートの各 deploy kind に、背景の色相に合わせた濃い text `color`
  （例: `oci` → `#1E3A8A`、`job` → `#7F1D1D`）を追加した（#1697）。badge / accent は
  彩度を保つ（ADR-20260522-01）。

## 関連テスト

- `packages/core/src/renderer/deploy-renderer.test.ts` — 「light theme renders dark,
  readable node text (not the white default)」。light の `oci` unit ラベルが
  `#1E3A8A`（白 `#F9FAFB` ではない）ことを assert する。
