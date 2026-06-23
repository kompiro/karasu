# 多すぎる兄弟ノードをバランス grid で畳む

- **日付**: 2026-06-23
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#1737](https://github.com/kompiro/karasu/issues/1737)
  - 関連 TPL: [TPL-20260510-21](../test-perspectives/TPL-20260510-21-scoped-glance-drill-down.md)（一度に見せる範囲を限定する）, [TPL-20260510-11](../test-perspectives/TPL-20260510-11-parallel-function-parity.md)（並列関数のパリティ）
  - コード: `packages/core/src/renderer/layout.ts`

## 背景・課題

あるコンテナが直接子を多数持つ（span of control が大きい）とき、子ノードが
**1 本の横長な行に潰れて並び**、読めなくなる。実際に system frame
`Hato API` の view で、直下の子（usecase / domain 相当）が 10 個ほど横一列に
並び、view に収めようとズームすると各ボックスが判読困難なサイズに縮む症状が
観測された。

これは karasu 自身のコア原則 **「一度に見せる量を限定する / scoped glance」**
（`docs/concepts.ja.md`）を内側から崩す。階層は各レベルを認知可能な量に保つ
ための設計のはずだが、1 レベルに兄弟が多すぎるとその前提が崩れる。
[TPL-20260510-21](../test-perspectives/TPL-20260510-21-scoped-glance-drill-down.md)
が想定する失敗モード「1 画面のノード数が上限なく増え、レイアウトと描画コストが
破綻する」に正面から該当する。

## 現状（インベントリ）

レイアウトには **2 つの経路**があり、折り返すのは片方だけ。

| 観点 | 現状 |
| --- | --- |
| `layout()`（メイン経路） | 単一 system view と **全 drill-down view**（service / domain root）が通る。`getLayoutConstants` から `{ LAYER_GAP, NODE_GAP }` のみ取得し（`layout.ts:607`）、配置ループ（`layout.ts:721-750`）は `xOffset += dims.width + NODE_GAP` で**横に並べるだけ。折り返し判定が一切ない**。1 レイヤーは無制限に 1 行へ伸びる |
| `layoutMultipleSystems()`（複数 system root view 専用） | `MAX_LAYER_WIDTH`（通常 1200 / compact 1040）を超えると sub-row へ折り返す（`layout.ts:1046-1077`） |
| `MAX_LAYER_WIDTH` | `layout.ts:47,49` で定義。メイン経路からは**参照されていない** |
| レイヤー内の順序制御 | `bucketByColumn`（`layoutHints` による column バケツ）+ `applyEdgeDirectionWithinLayer`。forced kind-based layering（user → client → service）あり |
| 既存の style hint | `column: left/center/right`（単数）= レイヤー内の x 方向バケツ。**列数指定ではない** |

つまり「`MAX_LAYER_WIDTH` が効いていない」のは正しく、根本原因は
**メイン経路にそもそも折り返しが存在しない**こと。折り返しは複数 system root
view にしか実装されておらず、これは
[TPL-20260510-11](../test-perspectives/TPL-20260510-11-parallel-function-parity.md)
が言う「並列に存在する似た関数の片方だけ拡張されて drift する」型の不整合。

## 制約・前提

- **決定性は死守**: 同じ入力 → 同じ SVG、安定した順序（`docs/concepts.md`
  Goals「Diffs are easy to compute」）。乱数・実測幅依存の最適化は不可。
- **visualizes, does not prescribe**: どんな形でも描き続ける。「子が多すぎるから
  描かない / error」は範囲外。本件はレイアウトのみで救い、診断は起こさない。
- **Non-goal「No fully-automatic layout optimization」との線引き**: pixel-perfect
  な見栄え最適化エンジンは作らない（escape hatch は draw.io export）。本件の
  「兄弟を決定的に格子へ畳む既定規則」はこれに**抵触しない**との判断を ADR に
  残す（後述）。
- 宣言順を壊さない: forced layer 内は宣言順保持（既存方針 Q11）。grid 化は
  row-major で宣言順を保つ。
- forced kind-based layering / barycenter / edge 方向制御を壊さない。
- out of scope（v1）: span of control 過多を知らせる info 診断（follow-up 候補）。

## 検討した選択肢

### 案1: メイン経路に「数を意識したバランス grid」を追加する（採用）

メイン経路の配置ループに、兄弟数に応じた格子折り返しを入れる。

- **既定（style 未指定）**: 列数 = `ceil(sqrt(n))` を目安に、row-major・宣言順で
  畳む。例: 2 → そのまま 1 行、9 → 3×3、10 → 4×3。≈ 正方形に近づけることで
  横長 1 行も縦長 1 列も避ける。
- **著者オーバーライド**: `.krs.style` で列数を明示でき、指定時はそれを優先。
  既存の `column: left/center/right`（単数）と同じ「自動既定 + 著者上書き」の作法。
  既存 `layoutHints` / `bucketByColumn` を足場にできる。
- **`MAX_LAYER_WIDTH` は上限の安全弁として残す**: 自動でも著者指定でも、grid の
  1 行が `MAX_LAYER_WIDTH` を超える場合はさらに折り返す。
- **2 経路の統一**: メイン経路と `layoutMultipleSystems` の sub-row ロジックを
  共通の「兄弟パッキング関数」に寄せ、両経路が同じ規則で畳むようにする
  （parity を構造的に保証 → TPL-20260510-11）。

**メリット**

- 症状（横長 1 行潰れ）を直接解消。scoped glance を実際のレイアウトで担保。
- 決定的（`ceil(sqrt(n))` も row-major も決定的）。
- 著者に最終制御を残しつつ、無設定でも妥当な既定。
- 2 経路統一で将来の drift を防ぐ。

**デメリット**

- 既存の単一 system / drill-down view のスナップショットが広範に変わる
  （回帰テスト・examples の再生成が必要）。
- forced layering / barycenter との相互作用の設計が要る（後述の未解決）。

### 案2: メイン経路でも `MAX_LAYER_WIDTH` 幅基準の折り返しだけ入れる

`layoutMultipleSystems` と同じ幅基準の折り返しをメイン経路にも移植するだけ。

**メリット**

- 変更が最小。2 経路のロジックが揃う。

**デメリット**

- **症状を解決しない**。細い兄弟が多数のとき幅に収まり 1 行のまま潰れる
  （まさに今回の `Hato API`）。span of control = 数の問題に、幅基準は無力。

### 案3: 著者が `.krs.style` の列数指定をしたときだけ折り返す（自動既定なし）

**メリット**

- 既定挙動が変わらず後方互換。スナップショット影響が最小。

**デメリット**

- 無設定のユーザー（=大多数）は救われない。「既定で読める」を満たさない。
  scoped glance の担保を著者の手作業に丸投げすることになる。

## 比較

| 観点 | 案1（バランス grid + 上書き） | 案2（幅基準のみ移植） | 案3（明示指定時のみ） |
| --- | --- | --- | --- |
| 症状の解決 | ◎ 数基準で必ず畳む | ✕ 細い兄弟多数で潰れる | △ 著者が設定した時だけ |
| 既定での可読性 | ◎ | △ | ✕ |
| 決定性 | ◎ | ◎ | ◎ |
| 後方互換（既存出力） | ✕ 広範に変化 | △ 一部変化 | ◎ ほぼ不変 |
| 2 経路の parity | ◎ 統一する | ○ 揃う | △ メインのみ分岐追加 |
| 実装コスト | 中 | 小 | 小〜中 |

## 現時点の方針

**案1 を採用する** — 症状の本質は「兄弟の数」であり、幅基準（案2）では解決
しない。既定で読める状態を作るのが scoped glance の責務なので、著者設定前提の
案3 も不十分。決定的なバランス grid を既定にしつつ `.krs.style` で上書きでき、
かつ 2 経路を統一することで、可読性・決定性・parity を同時に満たす。
スナップショット影響は大きいが、出力の改善が目的そのものなので許容する。

### 実装の指針

1. 兄弟パッキングを行う共通関数を切り出す（入力: ノード寸法列・列数方針・
   `MAX_LAYER_WIDTH`、出力: 各ノードの行・列・座標）。決定的・row-major・宣言順。
2. 列数の決定: style 指定があればその値、なければ `ceil(sqrt(n))`。いずれも
   1 行が `MAX_LAYER_WIDTH` を超える場合はさらに折り返す。
3. メイン経路（`layout()` の配置ループ `layout.ts:721-750`）をこの共通関数に
   置き換える。`layoutMultipleSystems` の sub-row 部分も同関数へ寄せる。
4. forced kind-based layering との関係: 各 forced layer の**中で**兄弟が多い場合に
   その layer 内を grid 化する（layer 構造自体は壊さない）。barycenter / edge 方向
   制御との順序関係を定義する。
5. `.krs.style` の列数プロパティを追加（命名は未解決、下記参照）。style パーサ /
   resolver / `ResolvedLayoutHints` を拡張。
6. AT: `docs/acceptance/` に新規ファイル。TC は:
   - 子 N 個（N = 1,2,9,10,17…）で期待する行×列に畳まれる（決定的）
   - `MAX_LAYER_WIDTH` を超える幅では style 指定があってもさらに折り返す
   - `.krs.style` の列数指定が自動既定を上書きする
   - 単一 system / drill-down(service) / drill-down(domain) / 複数 system root の
     全経路で同一規則が適用される（parity）
   - `index.krs` を app で開いたときに横長 1 行に潰れない
7. ADR 昇格: 実装完了後、`docs/adr/YYYYMMDD-NN-balanced-grid-sibling-layout.md`
   として昇格し、本 Design Doc は同 PR で削除する。Non-goal「No fully-automatic
   layout optimization」との線引き（決定的既定規則であって pixel 最適化ではない）を
   ADR の決定理由に明記する。

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: 既存モデルの**描画結果が変わる**（横並びが格子化）。
  破壊的変更ではない（テキストは不変、SVG のレイアウトのみ）。
- ドキュメント更新: `docs/spec/style.md` / `style.ja.md`（列数プロパティ追加）、
  `docs/concepts*.md`（scoped glance がレイアウトでも担保される旨）、必要なら
  `docs/spec/diagnostics.md` は変更なし（診断は起こさない）。
- テスト・examples への影響: renderer のスナップショットを広範に再生成。
  `examples/` の見た目が変わりうる（`update-examples` skill で同期）。

## 未解決の問い / 決めないこと

- **style プロパティ名**: 単数 `column`（left/center/right、既存）と紛らわしい。
  複数 `columns: N` か `grid-columns: N` か別案か。
- **列数の正確な式**: `ceil(sqrt(n))` を基本としつつ、上限（例: 7±2 由来で最大
  5〜6 列）を設けるか。縦に伸びすぎるのを許容するか。
- **forced layering との順序**: layer 分割が先か grid 化が先か、両立のルール。
- **resource 行・org / deploy コンテナ**を同じ grid 規則に含めるか（v1 で含める
  か後続にするか）。
- **info 診断（span of control 過多の気づき）**: 本 Doc では起こさない。レイアウトで
  救えた後に、なお別途「気づき」を出す価値があるかを follow-up で再評価する。
