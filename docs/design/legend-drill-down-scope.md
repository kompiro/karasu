# ドリルダウンビューでの legend 表示と切り替え

- **日付**: 2026-06-11
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#1513](https://github.com/kompiro/karasu/issues/1513)
  - 関連 ADR: [ADR-20260428-07](../adr/20260428-07-diagram-legend-syntax.md)（legend 構文の導入）
  - 関連 ADR: [ADR-20260429-03](../adr/20260429-03-legend-in-use-fallback.md)（in-use fallback）
  - 関連 Issue/PR: #1495 / #1512（`legend-not-top-level` — ネスト legend は parse error）
  - コード: `packages/core/src/renderer/svg-renderer.ts`, `packages/core/src/renderer/drill-down-svg.ts`, `packages/core/src/index.ts`

## 背景・課題

service や domain にドリルダウンしたとき、レベルごとに関連する凡例へ
切り替えたい（#1513）。トップレベルではサービス境界色や `[external]` の
説明が重要だが、domain レベルでは usecase→resource の `R`/`W` エッジ
ラベルなど、深い階層でのみ現れる語彙の説明が必要になる。

設計調査の過程で、Issue 記載の現状認識より問題が深いことが分かった:
**ドリルダウンビューには legend がそもそも描画されていない**。
切り替え以前に、凡例がトップレベル表示の専用機能になっている。

## 現状（インベントリ）

| 観点 | 現状 |
| --- | --- |
| 文法 | `legend ::= "legend" view-scope? title? "{" entry* "}"`、`view-scope ::= "system" \| "deploy" \| "org"`（ADR-20260428-07） |
| 配置 | トップレベル限定。ブロック内ネストは `legend-not-top-level`（#1512） |
| renderer | `render()` は `options.legends` と `options.viewScope` が**両方**渡されたときのみ `buildLegendFooter` を描画（`svg-renderer.ts:302`） |
| トップレベル描画 | `index.ts` の compile が system / deploy / org の各ビューで `legends` + `viewScope` + `legendUsage` を渡している（`index.ts:462,506,547`） |
| ドリルダウン描画 | `drill-down-svg.ts` は `render(slice, styles, ..., { theme })` と **`{ theme }` のみ**渡す（L116, L337）→ legend なし |
| all-layers 描画 | 同じ callbacks 経由のため同様に legend なし |
| スタッキング | scope が一致した legend は宣言順に縦に積まれる（spec § Legend） |

つまり「ドリルダウンで legend を切り替えられない」の実体は
「(a) ドリルダウンに legend が配管されていない」+「(b) レベルを
区別するスコープ語彙が文法にない」の 2 つに分解できる。
(a) は TPL-20260510-11 の言う並列レンダーパス間の drift が実際に
起きた例でもある。

## 制約・前提

- 後方互換: 既存ファイルのトップレベル表示（`legend` / `legend system` /
  `legend deploy` / `legend org`）の見え方は変えない。
- legend のトップレベル配置は維持する（#1512 で「service ブロック内に
  legend を書く」authoring は意図的に閉じた）。レベル指定は legend
  ヘッダの語彙拡張で表現する。
- scoped glance 原則（TPL-20260510-21 / `docs/concepts.ja.md`）:
  各スコープで見せる情報量を限定するのが karasu の認知設計。レベルごとに
  関連する凡例だけを見せる方向はこの原則に沿う。逆に「全レベルの凡例を
  常に全部出す」は原則に反する。
- `service` / `domain` は既存キーワードなので lexer 追加は不要。
- out of scope: deploy / org ビュー内の階層遷移（現状ドリルダウンは
  論理ビューのみ）、legend エントリ内容の自動生成。

## 検討した選択肢

前提として、どの案でも **Phase 0（配管修正）** が必要:
`drill-down-svg.ts` / all-layers の render 呼び出しに `legends` /
`legendUsage` / スコープ情報を渡し、ドリルダウンでも legend を
描画できるようにする。

### 案A: view-scope に深さ語彙を追加（`legend service` / `legend domain`）

`view-scope ::= "system" | "service" | "domain" | "deploy" | "org"` に拡張。
`legend service "..."` はサービスを root にしたドリルダウンビューでのみ、
`legend domain "..."` は domain レベルでのみ表示する。

**メリット**

- 文法変更が最小（scope トークンの追加のみ）。著者の学習コストが低い
- 「このレベルではこの凡例」という共通ケースを最短で表現できる
- 既存のスタッキング規則（scope 一致を宣言順に積む）をそのまま流用できる

**デメリット**

- scope 語彙が「ビュー種別」（system/deploy/org）と「深さ」
  （service/domain）の混在になり、`legend system` の意味の再定義が必要
  （後述の未解決の問い 1）
- 「特定のサービスだけ」を狙えない（全 service レベルで同じ凡例になる）

### 案B: ノード指定 legend（`legend #OrderService "..."`）

legend ヘッダに ID セレクタを許し、そのノードがドリルダウンの root の
ときのみ表示する。

**メリット**

- 表現力が最大。サービスごとに異なる凡例を出し分けられる
- style の `edge#<id>`（外科的上書き）と対になる語彙ポジション

**デメリット**

- 文法・解決コストが高い: id 検証、import / ghost との相互作用、
  rename 時の追従、未解決 id の診断（`legend-ref-unresolved` の header 版）
- 共通ケース（「domain レベルでは R/W の説明」）でも全ノード分書く
  ことになり、authoring が重い

### 案C: 案A を v1、案B を将来拡張（段階導入）

深さ scope を先に入れ、ノード指定は需要が観測されてから足す。
style spec が tag セレクタ（分類追従）を常用とし `edge#<id>` を
一点物に位置付けているのと同じ構図。

**メリット**

- 共通ケースを小さい変更で先に届けられる。文法は後方互換に拡張可能
  （`#id` を後から足しても `service` / `domain` と衝突しない）

**デメリット**

- 2 段階のリリースになる（ただし各段は独立して価値がある）

## 比較

| 観点 | 案A | 案B | 案C |
| --- | --- | --- | --- |
| 文法変更量 | 小（scope 2 語追加） | 中（#id ヘッダ + 解決） | 小→中（段階） |
| 後方互換性 | scope 再定義の整理が必要 | 完全追加 | A と同じ |
| 表現力 | レベル単位 | ノード単位 | 段階的に両方 |
| authoring コスト | 低 | 高（共通ケースで冗長） | 低 |
| 実装コスト | 小 | 中〜大 | 小（v1） |
| scoped glance 適合 | ◯ | ◯ | ◯ |

## Related TPLs

- [TPL-20260510-21](../test-perspectives/TPL-20260510-21-scoped-glance-drill-down.md)
  — scoped glance + drill-down を first-class に保つ。レベル別凡例は
  この原則の凡例への適用。逆に「全スコープの凡例を常時全部出す」案は
  この TPL に照らして却下
- [TPL-20260510-11](../test-perspectives/TPL-20260510-11-parallel-function-parity.md)
  — 並列レンダーパス（トップレベル / drill-down / all-layers）の
  parity drift。Phase 0 はこの観点の実例修正であり、実装時は
  3 パスすべてに legend オプションが渡ることを contract test で固定する
- [TPL-20260511-02](../test-perspectives/TPL-20260511-02-spec-doc-reference-data-sync.md)
  — scope 語彙を spec に足すときは reference データ・
  `reference-spec-sync.test.ts` と同期する

## 現時点の方針

**案C を採用する** — Phase 0（ドリルダウンへの legend 配管）+
深さ scope（`legend service` / `legend domain`）を v1 とし、
ノード指定（`legend #<id>`）は需要が観測されるまで保留する。
共通ケースの authoring コストと実装コストが最小で、文法は後から
ノード指定へ後方互換に拡張できる。

### 確定した表示セマンティクス（レビューで確定）

scope は**深さ対称**に解釈し、各深さは自分の scope に正確にマッチする
legend だけを表示する（切り替えセマンティクス）:

| legend ヘッダ | 表示される場所 |
| --- | --- |
| （省略） | 各ビューのトップレベルのみ（現行どおり全ビュー横断） |
| `legend system` | 論理ビューのトップレベル（system 一覧）のみ |
| `legend service` | service を root にしたドリルダウンレベルのみ |
| `legend domain` | domain を root にしたドリルダウンレベルのみ |
| `legend deploy` / `legend org` | 各ビュー（深さ概念なし = ビュー全体） |

- **深さをまたぐ重ね合わせはしない**。domain レベルに `legend system` は
  現れない（最も specific な scope だけが表示される、の徹底形）
- **同一深さ内**では現行どおり、マッチした legend を宣言順に積む
- 既存ファイル（省略 / system / deploy / org のみ使用）の見え方は
  Phase 0 後も**完全に不変** — ドリルダウン先の凡例は `legend service` /
  `legend domain` を書いた著者だけが opt-in で得る
- all-layers ビューは**レベル帯ごと**に、そのレベルの scope の凡例を
  帯直下に表示する

### 実装の指針

1. **Phase 0**: `drill-down-svg.ts` / all-layers の render callbacks に
   `legends` / `legendUsage` / 深さ情報を配管。レベルと scope の
   マッチングは renderer 側のフィルタに集約
2. `parseLegendScope` に `service` / `domain` を追加し、
   `LegendViewScope` 型を拡張
3. 上記「確定した表示セマンティクス」の表を renderer の
   scope フィルタに実装 + 単体テスト
4. spec 更新: `docs/spec/syntax.md` / `syntax.ja.md` の Legend 節
   （view-scope 文法と表示マトリクス）、reference データ同期
5. examples: `examples/feature-samples/legend.krs` にレベル別凡例の
   サンプル追加（`update-examples` ルールに従い examples.ts 同期）
6. AT: `docs/acceptance/` に新規。TC:
   - app でドリルダウンしたとき凡例がレベルに応じて切り替わる（人間確認）
   - all-layers ビューでの凡例表示位置（人間確認）
7. ADR 昇格: 実装完了後、本 Design Doc を ADR に昇格し同 PR で削除

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: **なし**。深さ対称セマンティクスにより、既存の
  scope（省略 / system / deploy / org）はすべて「そのビューのトップ
  レベル」の意味を保ち、ドリルダウン先の凡例は新しい scope を書いた
  著者だけが opt-in で得る
- ドキュメント更新: `docs/spec/syntax.md` / `syntax.ja.md` Legend 節
- テスト・examples への影響: legend.krs 拡張、`legend service` /
  `legend domain` を使った場合のみ drill-down スナップショットに
  凡例帯が追加される

## 決めないこと

- **ノード指定 legend（`legend #<id>`）**: 需要が観測されてから別 Issue で
  検討する。深さ scope の文法とは衝突しないことのみ確認済み
- **deploy ビューの深さ語彙**: deploy ビューに階層遷移が将来できた場合に
  あらためて検討する。今回は語彙を予約しない
