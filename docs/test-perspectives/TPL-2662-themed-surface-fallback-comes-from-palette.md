---
id: TPL-2662
title: "テーマ付き surface の「誰も色を指定しなかったとき」の色は palette から取る"
status: active
date: 2026-09-07
applicable_to:
  - "描画要素の色を `?? default` / ベース style フォールバックで決めるコードを書くとき"
  - "合成 id（`__group_<id>__` のような描画都合の id）を持つ要素を新設するとき"
  - "既存の描画要素に light / dark テーマを通すとき"
discovered_from:
  - issue: "#2662"
  - root_cause_file: "packages/core/src/renderer/svg-renderer.ts"
related_to:
  - TPL-1666
  - TPL-2366
  - TPL-2234
topic: renderer
scope:
  packages:
    - core
  concerns:
    - accessibility
---

# TPL-2662: テーマ付き surface の「誰も色を指定しなかったとき」の色は palette から取る

## 観点

テーマ対応した描画面の色は、**指定された色**と**指定されなかったときの色**の 2 つがある。
前者だけ palette / theme に通して後者をベース style（`DEFAULT_NODE_STYLE` のような
片テーマ固定のリテラル）に任せると、**既定のまま使う利用者だけ**が壊れる。指定
した色は両テーマで正しいので、テストも目視レビューも通り抜ける。

判定は 1 つ: **その色が canvas 上に出うるなら、指定なしの経路も `DiagramPalette`
の role を経由しているか**。経由していない箇所は、片方のテーマで必ず誤った色になる。

「誰も指定しなかった」の現れ方は 2 つあり、片方だけ塞ぐと残りが漏れる:

1. **lookup が構造的に外れる** — 合成 id（`__group_<team>__`、collapse stub、
   `containerId::unitId`）は style map のキーになりえないので `?? default` に必ず落ちる
2. **lookup は当たるがベース値のまま** — 実 id を持つが、どのルールもその kind を
   塗っていない（例: `system`）。エントリは存在するのに中身はベース値

そして判定は**解決済みの値では行えない**。解決済み style はベース値から作られるので、
「誰も指定しなかった」と「ベース値と同じ色を明示的に指定した」は値として区別がつかない。
値の一致で代用すると、既定色を狙って書いた指定を黙って塗り替える。**カスケードが何を
言ったか**（どのプロパティが適用されたか）を別に持ち、それで判定する。

## 想定される失敗モード

- 既定のまま使うと片テーマで文字が消える。#2662 では group frame のタイトルが
  両テーマとも `#F9FAFB` 固定で、light の canvas（`#FFFFFF`）上で **1.03:1**。
  `.krs.style` で色を書いた場合だけは両テーマとも正しく、report も来なかった。
- カード用のベース値をカードでない要素（塗りのないフレーム、区切り線）に流用する。
  「暗い塗りの上の明るいラベル」という前提ごと持ち込むので、塗りが無い面では
  前提が成立しない。
- 「muted な要素だから muted な色 role」と選び、opacity による減光と二重にかかって
  可読性を割る（#2662 では `textMuted` を 0.7 で合成すると dark 2.48:1 / light 2.71:1。
  減光を opacity が担うなら基色は primary 側を取る）。

## チェックリスト

描画要素の色を決めるコードを書く / 触るとき:

- [ ] 「どのルールもこの要素を塗らなかった」経路の色は `DiagramPalette` の role 由来か
      （片テーマ固定のリテラルやベース style を経由していないか）
- [ ] 「塗られなかった」の判定を**解決済みの値の一致**で代用していないか
      （ベース値を明示指定したケースを黙って塗り替える）
- [ ] その要素がカードでない（塗りが無い / 破線フレーム / 区切り）なら、カード用の
      ベース色をそのまま流用していないか
- [ ] opacity で減光する要素は、**合成後**の色でコントラストを機械検証したか
      （`default-style-contrast.test.ts` に合成後の比を足す）
- [ ] 指定なしの既定と、作者が指定した色の**両方**を、dark / light 両テーマで
      アサートするテストがあるか（指定した色だけのテストでは本観点は素通りする）

## 既知の対処パターン

- resolver が「どのプロパティを適用したか」を解決済み style と別に持ち
  （#2662: `ResolvedStyles.paintedColors`）、renderer はそれが無いときだけ palette の
  role に落ちる（`containerStyleOf` in `svg-renderer.ts`）。合成 id で lookup が外れる
  経路と実 id でベース値が残る経路の両方を、明示指定を潰さずに拾える。built-in シート
  も「塗った」に数える。問いは誰が塗ったかではなく塗られたかなので。
- role は、その surface と同じ役割に対して chrome palette が既に持っているものを取る
  （#2662 は `org-tree-renderer.ts` の `treeDefaults` が同じ 2 つの用途に名指ししている
  `textPrimary` / `mutedBorder`）。「同じエンティティだから別レンダリングの既定も同じ」
  という揃え方ではない — 既定は各レンダリングが自分で持つ（ADR-2269）。揃うのは
  作者が書いたルールの届き方であって、既定ではない。

## 関連テスト

- `packages/core/src/renderer/container-frame-theme-defaults.test.ts` — 指定なしの
  frame（合成 id の group frame と実 id の ghost ancestor）が両テーマで palette の
  role を描き、作者指定はそれに勝つことを検証。
- `packages/core/src/builtins/default-style-contrast.test.ts` — frame タイトルを
  `MUTED_FRAME_TITLE_OPACITY` で合成した後の比を canvas と全 boundary tint 上で検証。
