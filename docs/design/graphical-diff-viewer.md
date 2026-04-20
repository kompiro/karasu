# グラフィカル diff ビューア（2 つの .krs ファイル）

- **日付**: 2026-04-20
- **ステータス**: ADR 化（[ADR-20260420-02](../adr/20260420-02-graphical-diff-viewer.md)）
- **関連**:
  - Issue #650 (Closed), PR #725 (Phase 1 実装)
  - フォローアップ Issue: #735, #736, #737, #738, #739, #740
  - Issue #645 — "Diff-friendly text source" positive goal
  - Issue #648（Closed） — エッジモデルの整理
  - ADR-20260317-01 (`docs/adr/20260317-01-two-layer-rendering.md`) — 2 層レンダリング（layout → renderer）
  - ADR-20260413-02 (`docs/adr/20260413-02-implicit-edge-sync-async-distinction.md`) — 暗黙エッジの sync/async 区別
  - `packages/core/src/view/view-extract.ts`、`packages/core/src/renderer/layout.ts`、`packages/core/src/renderer/svg-renderer.ts`
  - `packages/app/src/components/PreviewPane.tsx`

## 背景・課題

karasu の `.krs` テキストはローカライズされた意味のある diff が出るように設計されており（#645）、その性質を **ユーザー向けに支払う** 機能として「ダイアグラム自体に変更を重ねて見せる」グラフィカル diff ビューアが Issue #650 で提案されている。

現状、PR レビューや OPFS デモの履歴閲覧では、ユーザーが「テキストの diff を読んで頭の中でアーキテクチャを再構築する」必要がある。図表ツールである karasu の本質を考えれば、これは支払うべきコストではない。

### 解決したい具体例

- PR レビュー: 「この PR でアーキテクチャの何が変わった？」
- OPFS デモ（git なし）: ブラウザ内のスナップショット履歴比較
- ステークホルダー説明: 非エンジニアに before/after を見せる

### Issue が明示している未解決の論点

1. 片側にしか存在しないノードのレイアウト戦略
2. 集約された暗黙エッジの構成集合が変わった場合の扱い
3. アノテーションのみの変更（例: `@deprecated` 追加）の表示形式

## 制約・前提

- **テキストレベルの diff ではなく、意味的（ノード・エッジ単位）な diff** とする — 表面的なフォーマット変更で偽陽性が出てはならない（Issue 明記）。
- **既存のレイアウトエンジンを再利用する** — 第二のレイアウトパスを発明しない（Issue 明記）。
- **ビューごと（system / deploy / org）に動作する** — 既存のレンダリングと整合する（Issue 明記）。
- **ドリルダウンと相互運用する** — トップレベルの diff からサブレベルへナビゲートできる（Issue 明記）。
- **読み取り専用** — diff ビュー上での編集はスコープ外（Issue 明記）。
- **レンダリングは 2 層（layout → renderer）に分離されている**（ADR-20260317-01）。差分情報は両層に伝播する必要がある。
- 暗黙エッジは集約されて単一エッジとして描画される（ADR-20260410-01 ほか）。集約構成の変化を扱える設計でなければならない。
- 既存の `PreviewPane` は `svg: string` + `nodeMetadata: Map<string, NodeMetadata>` を受け取る薄い層で、SVG 属性ベースのインタラクション（`data-node-id` など）を採用している。

### スコープ外（Issue 明記）

- 三方マージ／コンフリクト解消
- アプリ内での git 連携（git ref からのロード） — まずファイル入力で着手し必要なら後追い
- diff ビューでの編集

## 検討した選択肢

diff 機能の設計は大きく **「どこで diff を計算するか」** と **「どう描画するか」** の 2 軸に分けられる。それぞれ整理する。

### 軸A: diff の計算レイヤー

#### A-1: テキスト diff（行ベース）

`.krs` テキストを行差分し、対応行の AST ノードに着色する。

- **メリット**: 既存の git diff エコシステムにそのまま乗る。
- **デメリット**: フォーマット変更（インデント、コメント追加、属性順序）で偽陽性が出る。Issue が明示的に却下している。**不採用**。

#### A-2: AST diff

`packages/core/src/parser/` の出力（`KrsNode` ツリー）同士を比較する。

- **メリット**: パッケージ境界として最も上流。CLI でも UI でも再利用可能。
- **デメリット**: AST には集約前のすべての宣言が並んでおり、ビュー単位（system view / deploy view / org view）で「実際に描画されるもの」と一致しない。集約された暗黙エッジの diff が AST レベルでは表現できない。

#### A-3: View-slice diff（採用候補）

`view-extract.ts` 系が出す `ViewSlice`（描画対象が確定した状態; `childNodes`, `edges`, 集約済みの暗黙エッジを含む）同士を比較する。

- **メリット**:
  - 描画されるものに対する diff が直接得られ、「テキスト上は変わったが描画には影響しない」変更を自動的に無視できる。
  - 集約済みエッジを「集約構成の集合」単位で比較できる（後述 軸C）。
  - layout / renderer の上流で完結し、両層への注入が小さい変更で済む。
- **デメリット**:
  - ビューごとに 3 種類の diff 関数が必要（system / deploy / org）— ただし共通インタフェース化は容易。
  - drill-down のサブビューも各レベルで diff を計算する必要がある（とはいえ既存の view-extract も各レベルで呼ぶので追加負荷は小さい）。

### 軸B: 「ユニオン」のレイアウト戦略

片側にしか存在しないノードをどう配置するか（Issue Q1）。

#### B-1: 各側を独立にレイアウトしてオーバーレイ

両側を独立にレイアウトし、変わらないノードを位置整合させて重ねる。

- **メリット**: 既存のレイアウトを 2 回呼ぶだけ。
- **デメリット**: 「変わらないノード」が両側で違う位置になりうる（追加・削除されたノードが周囲を押し出すため）。整合させるために事後の位置補正が必要で、複雑度は B-2 より高くなる。

#### B-2: ユニオン AST を構築して 1 回レイアウトする（採用候補）

before / after の両方のノード・エッジを **`diffState` メタデータ付きで** マージしたユニオン AST を構築し、既存の layout / renderer をそのまま流す。

- **メリット**:
  - 「変わらないノード」が定義上 1 つの位置を持つ — Issue Q1 の懸念が構造的に解決する。
  - 既存レイアウトエンジンをそのまま再利用できる（Issue 制約に直接合致）。
  - 描画段では `diffState` を見て色・破線を変えるだけで済む。
- **デメリット**:
  - 同一 ID のノードがあるが内容が異なる（例: `label` が変わった）場合のマージルールを決める必要がある — ただしこれは「changed」として 1 つにマージし、詳細を別パネルで提示する自然な答えがある。
  - 削除ノードと追加ノードが両方ある状態をレイアウトするので、図が一時的に大きくなる — diff の性質上、これは妥当（読者は両方を見たい）。

#### B-3: after を主、before を「ゴースト」として周囲に追加

after 側の通常レイアウトをして、削除されたものは周囲のゴーストレイヤーに薄く描画する。

- **メリット**: 「現在の姿」がベースになるので、最新状態を中心に読みたい用途には向く。
- **デメリット**: 削除されたものが文脈（隣接関係）から離れた場所に描かれ、「何の隣にあった何が消えたのか」が読み取りづらい。Issue の意図（変更を文脈の中で見せる）と合わない。

### 軸C: 集約された暗黙エッジの diff（Issue Q2）

#### C-1: 集約後のエッジ数だけを比較

「2 → 3 domain edges」のように数だけ示す。

- **デメリット**: 実際に増えたのがどれかが分からない。意味のある diff にならない。

#### C-2: 構成エッジの集合を比較する（採用候補）

集約エッジは「構成エッジの集合」を持っている（既存実装でも `EdgeDetailPanel` で見せている: ADR-20260413-02 系）。集合に対して set diff を取り、

- 集合に変化なし: 集約エッジは "unchanged"
- 構成集合に追加だけ: "added-into" 状態（薄い緑のオーバーレイ）
- 構成集合から削除だけ: "removed-from"
- 両方: "changed"

として描画し、**ラベルクリック時に開く `EdgeDetailPanel` 側で構成エッジの diff を行レベルで表示する**。

- **メリット**: 既存の集約エッジ詳細パネルの拡張で済み、視覚的なノイズを抑えながら情報を完全に保持する。
- **デメリット**: 集約エッジの「変更」状態を表す視覚語彙（色・線種）を 1 つ追加する必要がある。

### 軸D: アノテーションのみ変更の扱い（Issue Q3）

#### D-1: ノード全体を "changed" として強調

簡潔だが、`@deprecated` のような頻繁に増減する属性で図全体が黄色に染まる懸念。

#### D-2: バッジ・記号の差分のみ強調（採用候補）

ノード本体は "unchanged" のまま、付随するバッジ（⚠ や `@deprecated` リボン）に diff 装飾を付ける。詳細は detail panel で `+ @deprecated` / `- @experimental` のように行ベースで表示。

- **メリット**: 視覚的ノイズを抑えつつ、属性変更も拾える。
- **デメリット**: 視覚語彙が増える（バッジの diff 表現） — ただし既存のアノテーションバッジ機構の拡張で済む。

## 比較

|軸|案|採否|主な理由|
|---|---|---|---|
|A 計算層|A-3 view-slice|採用|描画されるものに対する diff が得られ、集約後エッジも扱える|
|B レイアウト|B-2 ユニオン AST|採用|変わらないノードが定義上 1 位置になり既存レイアウトをそのまま使える|
|C 集約エッジ|C-2 構成集合 diff|採用|既存の detail panel の拡張で完全な情報を保持できる|
|D アノテーション|D-2 バッジ diff|採用|視覚ノイズを抑える|

## 採用案の概略

### データモデル

```ts
type DiffState = "unchanged" | "added" | "removed" | "changed";

interface DiffMeta {
  state: DiffState;
  changes?: {                    // state === "changed" のときのみ
    label?: { before?: string; after?: string };
    annotations?: { added: string[]; removed: string[] };
    description?: { before?: string; after?: string };
    // ...
  };
}

interface DiffedViewSlice extends ViewSlice {
  // 各ノード・エッジに DiffMeta を持たせるユニオンビュー
  // childNodes と edges は before/after の和集合
  diff: Map<string /* nodeId or edgeId */, DiffMeta>;
}
```

### モジュール配置

- `packages/core/src/diff/`
  - `view-diff.ts` — `diffViewSlices(before, after): DiffedViewSlice` を 3 ビュー（system/deploy/org）分提供
  - `view-diff.test.ts`
- `packages/core/src/renderer/svg-renderer.ts` — `diff?: Map<...>` を受け取り、SVG 要素に `data-diff-state="added|removed|changed|unchanged"` 属性を付与（描画ロジックは CSS / スタイル側で吸収）
- `packages/app/src/components/`
  - `DiffPane.tsx` — diff モード用のプレビュー（既存 `PreviewPane` をラップ／拡張）
  - `EdgeDetailPanel.tsx` 拡張 — 構成エッジの diff を行ベースで表示
  - `NodeDetailPanel.tsx` 拡張 — `+/-` 形式でアノテーション・ラベル変更を表示

### 視覚語彙（初期案）

- added: 緑、ストロークやや太め、薄い緑塗り
- removed: 赤、破線、薄い赤塗り、opacity 0.6
- changed: アンバー（黄）、ストローク色のみ変化
- unchanged: 既存スタイル、ただし全体に opacity 0.55 を掛けて変更を浮き立たせる

CSS 変数で `--diff-color-*` を定義し、ユーザーがテーマで上書きできるようにする。

### 入力ソース

Issue が挙げた 3 種類:
- ワークスペース内の別ファイル（FileTree から選択）
- ペーストされた `.krs` テキスト
- OPFS 履歴スナップショット（後追い、最初のリリースでは "別ファイル" のみで足りる）

最初のリリースは **ワークスペース内別ファイル選択** から始め、ペースト・OPFS は段階的に追加する。

### ドリルダウンとの相互運用

ユニオン AST はそのままドリルダウン可能。サブレベルでも同じ `diffViewSlice` 計算が走り、孫ノード・エッジまで diff が伝播する。`diff: Map` をビュー切り替えのたびに作り直す必要があるが、コストは既存の view-extract と同程度。

## 段階的リリース計画

1. **Phase 1**: core の `view-diff.ts` 実装 + 単体テスト。CLI なし、UI なし。
2. **Phase 2**: SVG レンダラーへ `diff` メタデータ伝播 + `data-diff-state` 属性付与 + デフォルト CSS。
3. **Phase 3**: `DiffPane` UI（ファイル選択 → 比較表示）。NodeDetailPanel・EdgeDetailPanel の拡張。
4. **Phase 4**: ペースト入力。OPFS 履歴スナップショット連携は別 Issue に切り出す。

## アクセプタンステスト

`docs/acceptance/` に追加する受け入れテスト項目（人間確認が必要なもののみ）:

- AT-1: ワークスペース内の別ファイルを比較対象に選び、追加・削除されたサービスがそれぞれ緑・赤で表示される
- AT-2: 同じ `.krs` 内容の 2 ファイル比較で「変更なし」表示になる（フォーマット差異を含む）
- AT-3: ドメインに `@deprecated` を追加した diff で、ノード本体は unchanged、バッジが changed として表示される
- AT-4: 集約された暗黙エッジの構成が変わった場合、エッジラベル色が変化し、クリックで構成エッジの行ベース diff が表示される
- AT-5: トップレベルの diff からサービスをドリルダウンしても、内部のドメイン・ユースケースに diff 装飾が引き継がれる
- AT-6: deploy ビュー、org ビューでも同様の diff 装飾が表示される

## 未解決の論点（実装中に決める）

- diff モード時のツールバー UI 配置（既存ツールバーへの追加 or 専用バー）
- 差分のないビューを切り替えたときの「何も変わっていません」表示の有無
- アノテーションバッジの diff 表現の具体的な視覚デザイン — `/svg-icon` スキルで詰める
