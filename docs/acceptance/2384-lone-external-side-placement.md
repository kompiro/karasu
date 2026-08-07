# AT-2384: 単独 external のサイド振り分けが consumer の側に従う

- **日付**: 2026-08-07
- **Issue**: [#2384](https://github.com/kompiro/karasu/issues/2384)（bug。`[external]` が 1 件のとき常に左へ寄る）
- **設計 (ADR)**: [ADR-1728](../adr/1728-external-on-sides-layout.md)（external をサイド列へ。本 AT はその「consuming-hub でサイドを決める」規則の実装漏れを塞ぐ）
- **関連 ADR**: [ADR-1724](../adr/1724-system-view-infra-external-tier-split.md)（infra/external ティア分割）、[ADR-969](../adr/969-style-column-layout-hint.md)（`column` ヒント）
- **Related TPLs**: [TPL-1761](../test-perspectives/TPL-1761-external-side-placement-invariant.md)（サイド配置の不変条件。本 bug で `discovered_from` を追記）
- **対象**: `packages/core/src/renderer/layout.ts`（`placeExternalServicesOnSides`）

## 概要

auto 割り当ての `[external]` が 1 件しか無い（より一般には hub barycenter が全て同値の）とき、
median 分割は退化して median がその値そのものになり、`hubX <= median` が常に成立していた。
結果、「tie は左」という規則が全件を飲み込み、consuming-hub の位置が一切効かなかった。

退化しているときは分類対象自身ではなく **content centre**（in-boundary ノードの水平スパンの中心。
サイド列が寄り添う span そのもの）と比較するようにした。tie が左であることは維持する。
振り分けは引き続き座標由来かつ決定的（[ADR-1728]）。

`examples/en/client-mcp` が実例で、`OrderMcp [external]` を消費する `PartnerAgent` と
`ClaudeDesktop` は右半分に居るのに `OrderMcp` は左端に置かれていた。

## 受け入れ条件

### AC-1: 単独 external が consumer の側に置かれる

> ✅ Automated by `packages/core/src/renderer/layout.test.ts` (suite-wide)

- [x] auto 割り当ての external が 1 件で、消費ハブが 2 つとも content centre より右にあるとき、
      external は**右**のサイド列に置かれる（`puts a lone external on the side its consumers are on (#2384)`）
- [x] 同じ入力形で消費ハブが左にあるときは**左**のまま（`keeps a lone external left when its consumers are on the left (#2384)`）
- [x] どちらの場合も external は in-boundary ノードの水平スパンの外に出る（サイド列であってバンドではない）

### AC-2: barycenter が全同値になる複数 external も同じ規則に従う

> ✅ Automated by `packages/core/src/renderer/layout.test.ts` (suite-wide)

- [x] auto 割り当ての external 2 件が同じハブ集合に消費される（barycenter が一致する）とき、
      両方ともハブと同じ側に置かれる（`puts externals that share one right-side hub set on the right (#2384)`）

### AC-3: tie は左のまま

> ✅ Automated by `packages/core/src/renderer/layout.test.ts` (suite-wide)

- [x] 消費ハブの barycenter が content centre とちょうど一致するとき、external は**左**に置かれる
      （`breaks a centred lone external toward the left (#2384)`）

### AC-4: 既存の振り分け・override・gate に回帰が無い

> ✅ Automated by `packages/core/src/renderer/layout.test.ts` (suite-wide)

- [x] 複数 external の median 分割は従来どおり（`assigns each external to the side of its consuming hub (#1728)`）
- [x] `column: left` / `column: right` が自動振り分けより優先される（`honors column:left/right to override the auto side assignment (#1728)`）
- [x] 単一ハブ図は従来どおり最下段バンドに残る（`keeps a single-hub external in the bottom band, not a side column (gate, #1728)`）
- [x] `pnpm gen:guide-diagrams` が差分を生まない（コミット済み guide 図に退行が無い）
- [x] `client-mcp` は `routing-parity.test.ts` の `UNGROUPED_MODELS` に残り、penetration 0 /
      collinear overlap 0 / hop mark の fence が引き続き掛かる（本修正で外れるのは
      「router が実際に迂回を引いたこと」を要求する 3 つの list のみ。下記参照）

### AC-5: client-mcp の実モデルで迂回が消える

`examples/en/client-mcp/index.krs` を system view で開く。座標としては `OrderMcp` は
左端 `x=40` から右サイド `x=1023` へ移り、入ってくる 2 本の水平距離は 515 + 543 から
100 + 313 に縮む。以下は目視でしか判定できない項目。

- [ ] **手動**: `OrderMcp` が `PartnerAgent` / `ClaudeDesktop` と同じ右側に置かれ、
      3 本のエッジが短い直線・斜線になっている。図の全幅を横断する線が無い。
- [ ] **手動**: コンテナを in-place 展開して grouped router を走らせた状態でも、
      `OrderMcp` に入る 2 本が外側 gutter へ右に出て下って左へ戻る U 字の迂回を描かない。
- [ ] **手動**: `#OrderMcp { column: right; }` を書かなくてもこの配置になる
      （作者側 styling で補う必要が無い。[ADR-1728] が却下した方向）。

## 副作用: routing fixture としての client-mcp の卒業

`packages/core/src/renderer/routing-parity.test.ts`（#2362 / #2365）は
`en/client-mcp/index.krs` を「router が実際に迂回を引いた」ことの証拠として 3 つの
list に入れていた。本修正で `OrderMcp` が consumer の隣に来た結果、この model は
**引くべき迂回そのものが無くなった**（waypoint を持つエッジ 0 本、straight
centre-to-centre penetration 0、interior corridor 0）。

そこで `PREVIOUSLY_PIERCED` / `PIERCED_CENTRE_TO_CENTRE` / `HAS_INTERIOR_LANE` から
`client-mcp` を外した。assertion は一切緩めていない。外した後も各 list は空にならず
（`hr-tool` / `hato` / `ec-platform/04-annotations` が残る）、`client-mcp` 自身は
`UNGROUPED_MODELS` に残って penetration・collinear overlap・hop mark の fence を
受け続ける。

## 検証方法

- 自動: `pnpm --filter @karasu-tools/core test`（AC-1〜AC-4）、`pnpm gen:guide-diagrams`（AC-4 の図の退行）。
- 手動: `node packages/cli/dist/index.js render examples/en/client-mcp/index.krs --view system -o /tmp/client-mcp.svg`
  の出力、または app で `examples/en/client-mcp/index.krs` を開いて AC-5 を確認する。
