---
id: ADR-2482
title: バッジ色はテーマ別の対で持ち、テーマ非依存の値を掴めなくする
status: accepted
date: 2026-08-14
topic: styling
refines: [ADR-2461]
related_to: [ADR-1479, ADR-1508]
scope:
  packages: [core, app]
  concerns: [accessibility]
assumptions:
  - "symbol: packages/core/src/builtins/reference-data.ts :: ThemedBadgeColor"
  - "grep: packages/core/src/builtins/default-style.ts :: a\\.defaultBadge\\.color\\[theme\\]"
  - "grep: packages/app/src/components/ReferenceContent.tsx :: defaultBadge\\.color\\[effectiveTheme\\]"
  - "grep: packages/app/src/styles/themes.css :: --badge-preview-text"
---

# ADR-2482: バッジ色はテーマ別の対で持ち、テーマ非依存の値を掴めなくする

- **日付**: 2026-08-14
- **ステータス**: 決定済み
- **関連**:
  - Issue [#2482](https://github.com/kompiro/karasu/issues/2482) — Reference パネルが light テーマで dark パレットのバッジ色を出す
  - [ADR-2461](2461-accent-ink-and-composited-contrast.md) — 色の上の文字は per-theme のインク（本 ADR がバッジ節を具体化・改訂）
  - [ADR-1479](1479-svg-diagram-theming.md) — light / dark パレットと `LIGHT_BADGE_COLORS` の出自
  - [TPL-2366](../test-perspectives/TPL-2366-badge-color-canvas-contrast.md) — バッジ色のテーマ別 4.5:1 機械検証
  - [TPL-1001](../test-perspectives/TPL-1001-display-mode-cross-surface.md) — グローバル切替は全描画面を点検する

## 背景

アノテーションのバッジ色は 2 か所に分かれていた。canonical な dark 値が
`reference-data.ts` の `defaultBadge.color`（単一の文字列）、light 値が
`default-style.ts` の `LIGHT_BADGE_COLORS`（private な Record）にあり、light への
差し替えは `getBuiltinStyleSheet()` の中でしか起きない。

Reference パネルはこの経路を通らず `defaultBadge.color` を直接 inline style に
渡していたため、light テーマでも dark パレット値を塗っていた（`@deprecated` は
パネルが `#EF4444`、図が `#DC2626`）。パネルは語彙のドキュメント面であり、
読み手はそこを見てアノテーションを選ぶので、図が使わない色を宣伝することになる。

ADR-2461 は `--badge-preview-text` を「両テーマで同じインク」と決めたが、その根拠は
「背景がテーマに追従しない以上、前景も追従させるほうが誤り」という条件付きだった。
本 ADR はその前提（背景がテーマ非依存）を取り除くため、バッジ節だけを具体化し直す。
ADR-2461 の他の決定（`SOLID_PAIRS` / `TINTED_PAIRS` の判定方法）は有効なままなので
supersede ではなく `refines` とする。

## 決定

`defaultBadge.color` を `ThemedBadgeColor`（`{ dark, light }`）にし、両パレットを
`reference-data.ts` に置く。`LIGHT_BADGE_COLORS` は削除し、built-in シートも
Reference パネルもアクティブなテーマで同じ対から引く。パネルの `--badge-preview-text`
は通常のテーマ対になり、light では白（`#ffffff`）へ倒す。

## 理由

- **テーマ非依存の値を残さないことが修正の本体**。`color: string` を残したまま
  `colorLight` を足すと、パネルが再び「テーマを考えなくても取れる値」を掴める。
  形を対にすれば、消費側はテーマを選ばずに色を得られない。
- **単一ソースなら drift しない**。ラベル / アイコンは既に `reference-data.ts` が
  正本で、シートとパネルの一致がテストで固定されている（TPL-1415）。色だけが
  例外だったのを揃える。
- **インクは背景に従う**。light パレットは同色相の暗色なので白が読める
  （実測 4.76〜5.70:1）。dark パレットは明るいので既存の `#0f0f0f` のまま
  （旧インクを light に残すと `#DC2626` 上で 3.97:1 と AA を割る）。
- **判定はテスト側でも単一ソースにする**。`theme-contrast.test.ts` はバッジ色を
  6 個のリテラルで持っていた。これは「dark 値を両テーマに書き写す」という
  今回のバグと同じ形なので、`getReference()` からテーマ別に読む形に変えた。

## 却下した案

- **後方互換のため `color: string` を残し `colorLight` を追加**。移行は軽いが、
  誤用できる値が残る。公開しているのは 0.x の reference API で、`defaultBadge.color`
  の外部消費者は repo 内に存在しない（app のみ）ため、形を変える方を採る。
- **light 色を app 側の CSS カスタムプロパティで持つ**。パネルだけは直せるが、色が
  core と app に二重化し、TPL-2366 の機械検証（core 側で両テーマを走査）から
  外れる。
- **`getReference(locale, theme)` にテーマ引数を足す**。キャッシュがロケール単位
  なのでキーが増え、パネル以外の全消費者にテーマ決定を強いる。色だけの問題に
  API 全体を巻き込む必要はない。
