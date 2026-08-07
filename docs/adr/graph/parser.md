# ADR Topic: parser

23 ADRs in this topic. Solid nodes belong to `parser`; gray dashed nodes are ghosts showing cross-topic references to help navigation.

Other topics: [overview](../graph.md).
```mermaid
flowchart TD
  subgraph parser["parser"]
    ADR_7["ADR-7<br/>YAML スタイル構文移行の見送り"]
    ADR_19["ADR-19<br/>ID 必須化と `label` のプロパティ化"]
    ADR_211["ADR-211<br/>`compile()` API 統一 — Discriminated Union による戻り値型"]
    ADR_281["ADR-281<br/>ワイルドカードインポートと2パス解決の採用"]
    ADR_292["ADR-292<br/>Directory Import — `import &quot;dir/&quot;` 構文"]
    ADR_412["ADR-412<br/>トップレベル service の Named Import — スタブ補完 + エッジ参照によ..."]
    ADR_438["ADR-438<br/>`.krs` フォーマッター — トークン列ベースでコメント保持"]
    ADR_442["ADR-442<br/>構造的 `.krs` パッチ — ノード ID ベースの `append` / `replac..."]
    ADR_496["ADR-496<br/>ブロック内エッジの暗黙 source 簡略記法"]
    ADR_927["ADR-927<br/>system にネストした service / domain の Named Import は..."]
    ADR_1046["ADR-1046<br/>usecase 内 resource に CRUD operations プロパティを追加する"]
    ADR_1082["ADR-1082<br/>usecase resource operations に verb 装飾構文（1:N CRU..."]
    ADR_1168["ADR-1168<br/>`.krs.style` AST に位置情報と sheetId を持たせ、parser の e..."]
    ADR_1177["ADR-1177<br/>Tidy Style コマンド — `.krs.style` に trivia 保持と軸グルー..."]
    ADR_1178["ADR-1178<br/>`.krs.style` 値レベル診断 — 構造化 ValueNode AST と prope..."]
    ADR_1567["ADR-1567<br/>規則と診断を分離し、診断カタログで完全性を担保する"]
    ADR_1974["ADR-1974<br/>system view の意味的クラスタを宣言する `boundary` 構文と `bound..."]
    ADR_2036["ADR-2036<br/>boundary をスコープ内に宣言する — 「層ごとの関心事」としての boundary 再定義"]
    ADR_2076["ADR-2076<br/>formatter の top-level 網羅は手で列挙せず `KrsFile` から導出し..."]
    ADR_2087["ADR-2087<br/>出力する文字列「値」を lexer のデコード規則と 1:1 で escape し、表現不能な..."]
    ADR_2165["ADR-2165<br/>論理ノードの containment 規則は `canContain` を唯一の定義とし、違反..."]
    ADR_2173["ADR-2173<br/>facet の文法と model 層 — 診断は resolver 側、カタログには載せる、m..."]
    ADR_9008["ADR-9008<br/>AST 再構成 — Discriminated Union とプロパティブロック"]
  end
  ADR_285["ADR-285<br/>[edges] クロスシステムサービス参照 — ドット記法（`SystemId.ServiceId`）"]
  ADR_429["ADR-429<br/>[navigation] マルチファイルプロジェクトでのクロスファイルナビゲーション"]
  ADR_477["ADR-477<br/>[resolver] 移行期における重複ドメイン ID の共存を `@deprecated` + `@migrati..."]
  ADR_681["ADR-681<br/>[renderer] トップレベル service / domain を `(Unassigned)` 擬似システム..."]
  ADR_1061["ADR-1061<br/>[renderer] usecase→resource edge を read/write で視覚的に区別する"]
  ADR_1296["ADR-1296<br/>[build] in-app Reference データを `reference-data.ts` に集約し、..."]
  ADR_1314["ADR-1314<br/>[build] .krs / .krs.style を v1.0 として凍結する（ハイブリッド版管理）"]
  ADR_1820["ADR-1820<br/>[build] notation promotion gate — experimental notation..."]
  ADR_1858["ADR-1858<br/>[renderer] system view を team（owns）軸でグループ化し、折り畳み可能な境界フレームで..."]
  ADR_1983["ADR-1983<br/>[renderer] boundary grouping の drill-down 拡張 — 描画レベルとの交差によ..."]
  ADR_2065["ADR-2065<br/>[core-concepts] 語彙 register の確定 — tag / annotation をツール語彙に閉じ、fa..."]
  ADR_2075["ADR-2075<br/>[resolver] 宣言スコープで描画できない edge endpoint を診断する — peer はノードイン..."]
  ADR_2174["ADR-2174<br/>[renderer] facet overlay — renderer に焼き、多重所属は同心リング、色は既知 fa..."]
  ADR_2184["ADR-2184<br/>[resolver] 同じモデリング状態を表す配置には同じ診断を出す — `system` 直下の domain に..."]
  ADR_2234["ADR-2234<br/>[styling] boundary フレーム色の style セレクタ — `boundary` / `boun..."]
  ADR_9007["ADR-9007<br/>[renderer] インタラクティブ SVG レンダリングと NodeDetailPanel"]
  ADR_19 --> ADR_9008
  ADR_292 --> ADR_281
  ADR_412 --> ADR_292
  ADR_412 --> ADR_281
  ADR_496 --> ADR_477
  ADR_1177 --> ADR_1168
  ADR_1178 --> ADR_1168
  ADR_1178 --> ADR_1177
  ADR_1974 --> ADR_1858
  ADR_1974 --> ADR_1820
  ADR_2036 --> ADR_1974
  ADR_2036 --> ADR_1983
  ADR_2165 --> ADR_1296
  ADR_2165 --> ADR_1314
  ADR_2173 --> ADR_2065
  ADR_285 --> ADR_281
  ADR_429 --> ADR_412
  ADR_429 --> ADR_211
  ADR_681 --> ADR_412
  ADR_1061 --> ADR_1046
  ADR_1820 --> ADR_1314
  ADR_2065 --> ADR_1314
  ADR_2065 --> ADR_1820
  ADR_2075 --> ADR_1567
  ADR_2075 --> ADR_1314
  ADR_2174 --> ADR_2065
  ADR_2174 --> ADR_2173
  ADR_2184 --> ADR_2165
  ADR_2184 --> ADR_1314
  ADR_2234 --> ADR_1974
  ADR_2234 --> ADR_2036
  ADR_9007 --> ADR_9008

  classDef accepted fill:#d4edda,stroke:#28a745,color:#155724
  classDef proposed fill:#fff3cd,stroke:#ffc107,color:#856404
  classDef deprecated fill:#f8d7da,stroke:#dc3545,color:#721c24
  classDef superseded fill:#e2e3e5,stroke:#6c757d,color:#383d41
  classDef not_adopted fill:#e2e3e5,stroke:#6c757d,color:#383d41,stroke-dasharray:3 3
  classDef ghost fill:#f5f5f5,stroke:#adb5bd,color:#6c757d,stroke-dasharray:2 2
  class ADR_7 not_adopted
  class ADR_19 accepted
  class ADR_211 accepted
  class ADR_281 accepted
  class ADR_292 accepted
  class ADR_412 accepted
  class ADR_438 accepted
  class ADR_442 accepted
  class ADR_496 accepted
  class ADR_927 accepted
  class ADR_1046 accepted
  class ADR_1082 accepted
  class ADR_1168 accepted
  class ADR_1177 accepted
  class ADR_1178 accepted
  class ADR_1567 accepted
  class ADR_1974 accepted
  class ADR_2036 accepted
  class ADR_2076 accepted
  class ADR_2087 accepted
  class ADR_2165 accepted
  class ADR_2173 accepted
  class ADR_9008 accepted
  class ADR_285 ghost
  class ADR_429 ghost
  class ADR_477 ghost
  class ADR_681 ghost
  class ADR_1061 ghost
  class ADR_1296 ghost
  class ADR_1314 ghost
  class ADR_1820 ghost
  class ADR_1858 ghost
  class ADR_1983 ghost
  class ADR_2065 ghost
  class ADR_2075 ghost
  class ADR_2174 ghost
  class ADR_2184 ghost
  class ADR_2234 ghost
  class ADR_9007 ghost
```
