# エッジの hover affordance を identity から切り離す

- **日付**: 2026-09-11
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#2632](https://github.com/kompiro/karasu/issues/2632)
  - 関連 ADR: [ADR-1096](../adr/1096-edge-id-selector.md)（`edge#<id>` selector と canonical id）, [ADR-1400](../adr/1400-edge-context-menu-shadcn-menu.md)（edge context menu）, [ADR-2209](../adr/2209-edge-property-block.md)（property block と左クリック）, [ADR-2598](../adr/2598-edge-routing-channel-capacity.md)（deploy view を共有配線チェーンへ）
  - 関連 TPL: [TPL-219](../test-perspectives/TPL-219-parallel-function-parity.md), [TPL-1983](../test-perspectives/TPL-1983-view-state-gate-parity-across-surfaces.md), [TPL-1001](../test-perspectives/TPL-1001-display-mode-cross-surface.md), [TPL-1223](../test-perspectives/TPL-1223-scoped-glance-drill-down.md)
  - 受け入れテスト: [AT-1186](../acceptance/1186-edge-hover-highlight-dim.md)（本 Design Doc で規定を書き換える）
  - spike: `spike/deploy-edge-hover`（`reports/2632-deploy-edge-hover/` に計測スクリプト・数値・スクリーンショット）
  - コード: `packages/core/src/renderer/edge-routing.ts`, `packages/app/src/styles/components/preview.css`

## 背景・課題

deploy view のエッジに hover しても何も起きない。stroke は太くならず、明るくもならず、
他のエッジも dim されない。system view の同じ操作はエッジを強調する。

#2632 はこれを `renderEdge` の 1 つのフラグに帰している。

```ts
const interactive = edge.canonicalId !== undefined;
```

`canonicalId` は `assignEdgeCanonicalIds` が付けるが、compile パイプラインはこれを
system 経路でしか走らせない（`compile.ts:520`、対象は `viewSlice.childEdges`）。

**spike で計測したところ、この診断は正しいが範囲が狭かった。** 実際には独立した
**3 つの gate** があり、canonical id を配らない **4 つの経路** があり、同じ症状は
すでに system view でも起きている。以下の数値はすべて `reports/2632-deploy-edge-hover/`
のスクリプトによる実測で、モデルは組み込み `ExampleProject`（アプリが実際に開くもの）と
reverse した dify モデル。

### 影響範囲は drawn edge の 24.7%

45 render surface・534 本のエッジのうち、**132 本（24.7%）に今日 hover affordance が無い。**
deploy view はそのうち 20 本にすぎない。原因別の内訳:

| 原因 | 本数 | 内容 |
| --- | --- | --- |
| `no-id-pass` | 82 | multi-system / `__unassigned__` root は各フレームを `sys.edges` からレイアウトする（`view-extract.ts:595` のコメントが明言）。id パスは `viewSlice.childEdges` しか見ないので、フレーム内のエッジは 1 本も id を持たない |
| `ghost` | 50 | 縮約された ghost レンダリング。意図的に `canonicalId` を落とす。**deploy エッジ全部を含む** — `deploy-layout.ts:641` が配線後に `ghost` を立てる（[AT-2609](../acceptance/2609-deploy-routing-chain.md) AT-D） |

特に悪いのは、どちらも読者が最初に着地する既定ビューであること:

| project | surface | edges | interactive |
| --- | --- | --- | --- |
| `feature-samples` | system | 74 | **0** |
| `multi-file-system` | system | 6 | **0** |
| `dify` | deploy | 16 | **0** |

`feature-samples` は `system` ブロックを 24 個、`multi-file-system` は 5 個宣言している。
どちらも multi-system root になる。

## 現状（インベントリ）

### gate は 3 つある

#2632 は「`interactive` が hoverable と addressable を混ぜている」と書くが、
[#2543](https://github.com/kompiro/karasu/issues/2543) がすでに hit-line を
`needsHitArea` として分離済みで、現状は 2 つに割れている。残る混線は hover 表現側にある。
dify で shape tag 別に計測した結果（`main` = 現状のスタイルシート）:

| surface | variant | shape | edges | 太線化 | 全強度 | peer dim |
| --- | --- | --- | --- | --- | --- | --- |
| system | main | `path` | 18 | **0/18** | 18/18 | 18/18 |
| system | main | `line` | 5 | 5/5 | 5/5 | 5/5 |
| system | main | `polyline` | 1 | 1/1 | 1/1 | 1/1 |
| deploy | main | `polyline` | 12 | **0/12** | **0/12** | **0/12** |
| deploy | main | `line` | 2 | **0/2** | **0/2** | **0/2** |

ここから 3 つの gate が読み取れる。

1. **グループの class**（#2632 が指摘したもの）。`.krs-edge--interactive` は id gate なので、
   deploy エッジは hover 規則に 1 つもマッチしない。
2. **shape tag**。stroke 規則は `line` と `polyline` しか名指ししていない。hop mark を持つ
   エッジ（#1859 P2c-C）は `gappedStrokePath` により `<path>` で描かれるため、どちらにも
   マッチしない。**dify の system view では計測可能な 24 本中 18 本が今日すでに太線化も
   brightening もされていない。** canonical id を持つエッジで、報告された症状が system view
   側ですでに起きている。
3. **祖先グループの opacity**。deploy エッジは `<g class="ghost-edges" opacity="0.3">` の中に
   描かれる。group opacity は乗算合成されるので、hover した子に `opacity: 1 !important` を
   当てても持ち上がらない。セレクタを広げるだけだと `{focused: 0.3, peer: 0.075}` になり、
   4:1 のコントラストは出るが焦点のエッジは沈んだままで、system view の
   `{focused: 1, peer: 0.25}` には揃わない。

### context menu は deploy エッジでは空振りする

`deploy-layout.ts` は `direction:` を一度も読まない。DAG は
`assignLayers(classifiedIds, slice.ghostEdges)` から作る。したがって deploy エッジに
canonical id を合成しても（#2632 の direction 2）、開くメニューの唯一のアクションは
*system* 側のエッジに書き戻すだけで、読者が見ているキャンバスは何も変わらない。

### affordance は app 専用

`packages/vscode/src/webview-content.ts` は自前のインライン `<style>` を組み立てており、
`.krs-edge` 規則を 1 つも持たない。つまり VS Code preview には、どのビューでも、
addressable かどうかにかかわらず、エッジの hover affordance が**無い**。
同じ能力に対する 4 つ目の答え（[TPL-1983](../test-perspectives/TPL-1983-view-state-gate-parity-across-surfaces.md) そのもの）。

## 制約・前提

- **addressability の gate は動かさない。** canonical id を持つエッジだけが
  `edge#<id>` selector と direction menu の対象であることは [ADR-1096](../adr/1096-edge-id-selector.md) /
  [ADR-1400](../adr/1400-edge-context-menu-shadcn-menu.md) の決定であり、本 Design Doc は触らない。
- **AT-1186 の既存規定を書き換えることになる。** 現行 CSS のコメントは「canonical id を
  持たないエッジに hover しても peer を dim しない」と明記している。これは #1186 当時の
  判断で、ADR には昇格していない（`docs/adr/` に該当 ADR 無し）。本 Design Doc はこれを
  改訂する立場を取る。
- **静的出力が太る。** hit-line を無条件化すると、組み込みコーパスの SVG は 3,186,533 →
  3,207,123 バイト（**+20,590 バイト / +0.65%**）。dify の deploy view は 57,438 → 60,384
  （+5.1%、16 本で 1 本あたり約 184 バイト、長い routed polyline のため）。
  静的出力は addressable なエッジについてはすでに hit-line を載せているので、
  新しいコストではなく既存コストの拡大。
- **out of scope**: multi-system root でエッジを *addressable* にすること（別 Issue）。
  VS Code webview に affordance を載せること（別 Issue）。deploy エッジを ghost group から
  出すこと（[AT-2609](../acceptance/2609-deploy-routing-chain.md) AT-D の決定）。

## 検討した選択肢

### 案1: affordance を identity から切り離す（#2632 direction 1）

hover 表現と hit-line は「全エッジが持つもの」を gate にする。`krs-edge--interactive` は
右クリック予告だけを意味し続ける。3 つの gate すべてに手を入れる:

1. `renderEdge` の hit-line を無条件化する。
2. hover 規則を `.krs-edge` に付け替え、shape セレクタに `path` を足す。
3. hover を抱えている `.ghost-edges` を持ち上げる 1 行を足す。

```css
.preview-container svg .ghost-edges:has(.krs-edge:hover) { opacity: 1; }
```

**メリット**

- 規則が 1 つに畳める — 「描かれたエッジは追跡できる」。同期を保つべき条件が消える。
- 4 経路すべてを 1 箇所で直す。`renderEdge` は system / drill-down / all-layers / deploy の
  唯一の共通経路（`svg-renderer.ts:606`）なので、[TPL-219](../test-perspectives/TPL-219-parallel-function-parity.md) /
  [TPL-1983](../test-perspectives/TPL-1983-view-state-gate-parity-across-surfaces.md) の parity が構造的に成立する。
- spike の実測で deploy view が `{focused: 1, peer: 0.25}` に到達し、system view と一致する。
- system view の `path` エッジ 18 本（dify）に初めて太線化が効く。

**デメリット**

- 静的出力が +0.65% 太る。
- base 衝突で id を失ったエッジ・ghost エッジ・collapse stub も hover に反応するようになる。
  #1186 当時の「domain 的な意味を持たないエッジは dim を起こさない」という判断の撤回。

### 案2: deploy エッジに canonical id を合成する（#2632 direction 2）

`deploy-layout.ts` で ghost edge に id を振る。

**メリット**

- 差分が最小。CSS に触らない。

**デメリット**

- deploy view だけが直り、82 本の `no-id-pass` エッジと 34 本の非 deploy ghost エッジは
  放置される。#2632 の症状の 15% しか消えない。
- `path` エッジの太線化が効かない問題（system view 18/24 本）は残る。
- ghost group の opacity 問題が残る — id を得ても焦点のエッジは 0.3 のまま。
- context menu が空振りする。「意図的で、テストされている」（#2632 受け入れ条件）を
  満たすには、deploy でだけメニューを抑止する分岐が別途必要になり、gate が 1 つ増える。

### 案3: 全経路で canonical id を配る

`assignEdgeCanonicalIds` を multi-system root の `sys.edges` にも、ghost 縮約にも、
deploy ghost edge にも走らせる。

**メリット**

- affordance に加えて addressability も直る。`edge#<id>` selector が multi-system root で
  効くようになる。

**デメリット**

- gate の混線そのものは残る。hover できるかどうかが「id を持つか」で決まり続けるので、
  次に id を配らない経路が生えたとき同じバグが再発する。
- ghost レンダリングが `canonicalId` を落とすのは縮約の一部という設計判断
  （`layout-edges.ts:185`）の撤回になる。deploy エッジについては、書き戻し先の無い
  id を配ることになる。
- `path` エッジの太線化と ghost group の opacity は 1 つも直らない — この 2 つは identity と
  無関係だから。

## 比較

| 観点 | 案1 | 案2 | 案3 |
| --- | --- | --- | --- |
| 直る drawn edge | 132/132 | 20/132 | 132/132（affordance）|
| `path` の太線化（system 18 本）| 直る | 残る | 残る |
| ghost group の opacity | 直る | 残る | 残る |
| 変更量 | core 1 箇所 + CSS 4 規則 | core 1 箇所 | core 複数経路 |
| 再発耐性 | gate が消える | gate が 1 つ増える | gate が残る |
| 後方互換性 | SVG +0.65%、hover 対象が広がる | 影響なし | `edge#<id>` の解決先が増える |

## 現時点の方針

**案1 を採用する。** 「描かれたエッジは追跡できる」は例外を持たない規則で、これを
gate にすれば同期を保つべき条件が無くなる。#2632 が direction 1 を推したのと同じ理由だが、
spike はそれに加えて、identity と無関係な 2 つの gate（shape tag・祖先グループ）が
同じ症状を生んでいることを示した。案2 も案3 もこの 2 つを直さないので、deploy view を
直しても system view の 18 本は沈んだままになる。

hover affordance と addressability は違う能力である、という #2543 の
（`nodeControls` を `interactive` に畳まなかったのと同じ）論法をもう一段進めた形になる。

### 実装の指針

1. **`packages/core/src/renderer/edge-routing.ts`** — hit-line を無条件で emit する。
   `needsHitArea` と `hasDetail` を削除し、コメントを「2 つの問い」から
   「hover / hit は全エッジ、右クリックは addressable なエッジだけ」に書き換える。
   `interactive` の意味は変えない。
2. **`packages/app/src/styles/components/preview.css`** — hover 強調と #1186 の peer dim を
   `.krs-edge--interactive:hover` から `.krs-edge:hover` へ。stroke セレクタに
   `path:not(.krs-edge__hitline)` を追加。`.ghost-edges:has(.krs-edge:hover)` を追加。
   `cursor: context-menu` は `.krs-edge--interactive` に残す。コメントの
   「非 interactive なエッジは dim を起こさない」を撤回理由つきで書き換える。
3. **`packages/app/src/styles/styles-no-raw-color.test.ts`** — `DIMMING_ALLOWED` の
   セレクタをスタイルシートと同時に更新する。
4. **deploy エッジは addressable にしない。** canonical id を合成せず、context menu も
   出さない。#2632 受け入れ条件の「意図的で、テストされている」はこちら側で満たす
   （出さないことをテストする）。
5. **`packages/core/src/renderer/drill-down-svg.test.ts:1293`** — 可視 stroke を
   `<g data-edge-…><(?:line|path)[^>]*>` で拾っており、グループ内の最初の shape が
   hit-line になったため落ちる。`(?![^>]*krs-edge__hitline)` を足す。挙動の変更ではなく
   ハーネスの前提。
6. **テスト**
   <!-- absent-path-next-line: 本 Design Doc が作る予定のテスト (#2632) -->
   - `packages/core/src/renderer/edge-affordance-parity.test.ts`（新規）: 組み込みコーパスの
     system / deploy / drill-down 各 surface で、`krs-edge` グループが必ず hit-line を
     1 本持ち、`krs-edge--interactive` と `data-edge-canonical-id` が双方向に一致すること。
     surface ごとに assert する（#2632 受け入れ条件 4、TPL-1983 / TPL-219）。
   - `packages/core/src/renderer/svg-renderer.test.ts`: 旧結合を固定している 2 件を更新。
   <!-- absent-path-next-line: 本 Design Doc が作る予定のテスト (#2632) -->
   - `packages/e2e/tests/at-2632-deploy-edge-hover.spec.ts`（新規）: Deploy タブでエッジに
     hover し、peer が 0.25 に、焦点が **実効 opacity 1** に（祖先グループの合成込みで
     測る — 子の computed opacity だけ見ると ghost group の 0.3 を見逃す）。
   - `.krs-edge` は `transition: opacity 0.15s ease` を持つので、hover 直後にサンプルすると
     遷移途中の値を読む。e2e は遷移の収束を待つ。
7. **AT**: `docs/acceptance/2632-edge-hover-affordance.md` を新規作成し、
   [AT-1186](../acceptance/1186-edge-hover-highlight-dim.md) の AT-A の文言（「インタラクティブな
   edge（`[data-edge-canonical-id]` が付いた…）」）を「描かれた全エッジ」に改訂する。
8. **TPL**: 3-Yes（横展開しうる / 構造的に再発しうる / 既存 TPL に未掲載）を満たすので
   新規 TPL を起こす。観点は「**閲覧者向けの affordance を、作者側の identity で gate しない**」。
   [TPL-1983](../test-perspectives/TPL-1983-view-state-gate-parity-across-surfaces.md) /
   [TPL-219](../test-perspectives/TPL-219-parallel-function-parity.md) に `related_to` を張り返す。
9. **ADR 昇格**: 実装完了後に `docs/adr/2632-edge-hover-affordance.md` として昇格し、
   本 Design Doc は同 PR で削除する。

### 影響範囲・マイグレーション

- **既存ユーザーへの影響**: preview 上で hover に反応するエッジが増える。`.krs` の解釈は
  変わらない。エクスポートした SVG は hit-line の分だけ大きくなる（+0.65%）が、
  見た目は同一。
- **ドキュメント更新**: `docs/acceptance/1186-edge-hover-highlight-dim.md`（AT-A の対象範囲）。
  `docs/spec/` に新規セクションは追加しないので、spec-audit の proactive TPL 要件は発火しない。
- **テスト・examples への影響**: core 4,409 件中 1 件が落ちる（上記 5）。app 1,388 件は素通り。
  e2e は全 175 件（174 passed / 1 skipped）が素通り。examples の `.krs` は変更なし。

## 未解決の問い / 決めないこと

- **multi-system root の addressability**（82 本）。本 Design Doc は affordance だけを直す。
  これらのエッジは root view で `edge#<id>` selector の対象にも context menu の対象にも
  ならないままで、それは別の bug として別 Issue に起こす。`assignEdgeCanonicalIds` を
  `sys.edges` にも走らせる話になり、view 横断の id 一意性（`validateProjectEdgeIdUniqueness`）
  との関係を詰める必要がある。
- **VS Code webview の affordance**。`webview-content.ts` のインライン CSS に `.krs-edge`
  規則が無い。構造的な問題は CSS が二重に存在することで、共有スタイルシート片に切り出す
  のは #2632 より大きい変更になる。別 Issue。
- **hover 対象が広がったときの体感**。密なモデルでパンしているとポインタがエッジを
  次々に通過し、dim が明滅しうる。addressable なエッジが大多数の system view では
  すでにそうなっているので新規の問題ではないが、`feature-samples`（74 本すべてが対象に
  なる）で実機確認する価値はある。AT の手動項目に入れる。
