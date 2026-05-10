# テスト観点ライブラリ（Test Perspective Library, TPL）

## 目的

karasu で **再発しうる失敗パターン** を、構造化された観点として蓄積する。新機能の DesignDoc 作成時や受け入れテスト設計時に、これらの観点が自動的に参照される状態を作ることが目的。

運用開始の意思決定は [ADR-20260509-04](../adr/20260509-04-test-perspective-library.md) に記録されている。

### 観点の起源 — retrospective と proactive

TPL は **2 つの起源** から生まれる:

- **Retrospective（事後）** — 過去の `bug` / `test-infra` Issue から、実際に起きた失敗を一般化する。バックフィルの主流（TPL-01〜17）はこの形
- **Proactive（事前）** — `docs/concepts.ja.md` のようなアーキテクチャ原則 / 非目標 / north-star から、**原則が破られたときに起きるであろう失敗** を予測して観点化する（TPL-18〜20 はこの形）

どちらも 3-Yes ルール（次節）と同じ基準で評価する。バグ起源 / 原則起源は frontmatter の `discovered_from` を見れば分かる（`issue:` か `root_cause_file: docs/concepts.*` か）。両方とも同じスキーマ・同じ運用ルールに乗る。

## ADR との違い

- **ADR**: 判断の記録（「私たちはこう判断した」）
- **TPL**: 検証すべき観点の集約（「これを検証すべき」）

ADR が **過去の判断を残す** ためのものに対し、TPL は **未来の検証を促す** ためのもの。両者は frontmatter の `topic` / `scope.packages` を共有しており、同じトピックで横串検索することで「過去の判断」と「検証すべき観点」を同時に発見できる。

## エントリの構造

各 TPL は 1 ファイル = 1 観点で、`docs/test-perspectives/TPL-YYYYMMDD-NN-<slug>.md` というファイル名規約に従う。

### Frontmatter

```yaml
---
id: TPL-YYYYMMDD-NN
title: "観点を1行で表現"
status: active            # active | deprecated
date: YYYY-MM-DD
applicable_to:
  - "再利用可能な抽象パターン（例: KrsFile.systems を消費する機能）"
  - "1 パターン 1 行に分解する（複数の抽象パターンに当てはまるなら複数行）"
known_consumers:           # optional — この観点が適用されると判明している具体的な consumer
  - renderer               # kebab-case の feature / module 名（grep 可能な形）
  - matrix
discovered_from:
  - issue: "#1234"
  - root_cause_adr: "ADR-XXXXXXXX-XX"        # optional
  - root_cause_file: "path/to/file.ts:LINE"  # optional
related_to:
  - TPL-XXXXXXXX-XX
topic: app-ui              # ADR と同じ controlled vocabulary
scope:
  packages:
    - app
---
```

各フィールドの意図:

- **`applicable_to`** — この観点が適用される **抽象パターン**。再利用可能な抽象度で書く。1 行 = 1 パターンに分解し、複数パターンに当てはまる観点なら複数行で並べる。consumer の具体名は書かない（そちらは `known_consumers`）
- **`known_consumers`** — この観点が適用されると判明している **具体的な consumer**（feature / module / package など）。kebab-case で、grep で検索しやすい形にする。union のように consumer 空間が広すぎて列挙が無意味な場合は省略する（フィールドごとオミット）。新たに該当 consumer が見つかったら追記する
- **`topic`** — ADR と同じ controlled vocabulary（`docs/adr/README.md` のセクション見出しを参照）。たとえば: `core-concepts` / `parser` / `resolver` / `renderer` / `edges` / `styling` / `navigation` / `app-ui` / `project` / `chat-ai` / `cli` / `vscode` / `testing` / `build` / `adr-tooling`

### 本文セクション

1. **観点** — 何を検証すべきかを、再利用可能な抽象度で記述する
2. **想定される失敗モード** — この観点が見落とされた場合に、どのような形で失敗が現れるか
3. **チェックリスト** — 新機能の実装/修正時に確認する項目。**3〜5項目に絞る**（多すぎると使われない）
4. **既知の対処パターン** — 過去にこの問題を解決した方法
5. **関連テスト** — この観点を検証する既存テストのパス

## 運用ルール

### 新規エントリの追加タイミング

`bug` または `test-infra` ラベルが付いた Issue が起票されたとき、以下の **3-Yes ルール** で TPL 化を検討する（`test-infra` は E2E flake / fixture / harness の問題で、典型的には testing-topic TPL を生む — 例: TPL-20260510-13 / TPL-20260510-14）。

1. 同じ root cause が **別の機能でも発生しうる** か?
2. 構造的なパターンとして **再発する可能性がある** か?
3. 既存の TPL でカバーされていない観点か?

3つすべてが Yes なら新規 TPL として起こす。1つでも No なら個別 Issue として処理して TPL は作らない。

### 既存エントリの更新

新しい Issue が既存 TPL のパターンに該当する場合、その TPL の `discovered_from` セクションに Issue を追記する。チェックリストや「既知の対処パターン」の更新が必要なら、それも併せて行う。

### deprecated への移行

実装の構造変更などで、ある観点が原理的に発生しなくなった場合、`status` を `deprecated` に変更する。エントリ自体は **削除しない** — なぜ deprecated にしたかを末尾に追記する（後から「この観点はなぜ消えたのか」を辿れるようにするため）。

## TPL のライフサイクル

TPL は以下のライフサイクルを持つ。**proactive を先に書ければ書けるほど、retrospective に学ぶしかない bug が減る**。

```
concept (docs/concepts.ja.md / ADR)
   │
   │   原則を実装に落とすときに違反しうる観点を抽出
   ▼
proactive TPL  ← 開発前に書く（予防可能な学習）
   │
   ▼
development (DesignDoc + 実装)
   │
   ▼
bug (proactive TPL でカバーできなかった失敗)
   │
   │   実際に起きた失敗を一般化
   ▼
retrospective TPL  ← bug 修正と同じ PR で書く（不可避な学習）
```

### 非対称性

- **proactive TPL** は **予防可能** な学習。書ければ bug を未然に防げる
- **retrospective TPL** は **不可避** な学習。起きてからしか書けないが、起きたら必ず書く（同じ bug を 2 回起こさない）

retrospective TPL を書くたびに「**この観点を proactive TPL として書いておけたか?**」を自問する。書けたはずなら、それは「**proactive スキャンの漏れ**」自体が次回への学びになる（ただし TPL として記録するわけではなく、レトロスペクティブの素材として扱う）。

### 起源と運用ルールは独立

proactive / retrospective の区別は **起源** の違いだけで、frontmatter スキーマも 3-Yes ルールも運用ルール（更新 / deprecated）も同じ。`discovered_from` を見れば起源は判る:

- `discovered_from.issue: #N` → retrospective（`bug` または `test-infra` 起源）
- `discovered_from.root_cause_file: docs/concepts.*` → proactive（原則起源）

## 参照タイミング

- **DesignDoc 作成時**: 以下の 2 段階で観点を取り込む:
  1. 該当する `topic` / `scope.packages` の **既存 TPL** を一覧する
  2. 同じ `topic` の `docs/concepts.ja.md` セクションと関連 ADR を読み、**まだ TPL になっていない原則** で今回の設計が違反しうるものがないか確認する。あれば 3-Yes ルールに照らして proactive TPL を起こす（同じ PR で起こすのが最も摩擦が少ない）
- **新機能の実装時**: 受け入れテストの項目を作る前に該当 TPL のチェックリストを確認する
- **bug 修正時**: 同じパターンの TPL がすでに存在しないか確認し、あれば `discovered_from` に追記する。なければ 3-Yes ルールで retrospective TPL の新規作成を検討する。**併せて「この bug は proactive TPL を書いていれば防げたか?」も自問する**（防げた場合、それ自体が次のレトロスペクティブの素材）

## 一覧

現時点で active な TPL は以下:

| ID | タイトル | topic | 起源 |
|---|---|---|---|
| [TPL-20260510-01](TPL-20260510-01-top-level-orphans.md) | top-level orphans の扱い | core-concepts | #1160, #412 |
| [TPL-20260510-02](TPL-20260510-02-round-trip-guarantee.md) | コード変換における round-trip 保証 | parser | #1101, #1058 |
| [TPL-20260510-03](TPL-20260510-03-enum-member-addition.md) | 列挙型メンバー追加時の更新漏れ | navigation | #1094 |
| [TPL-20260510-04](TPL-20260510-04-continuous-input-dom-interference.md) | 連続操作中の DOM 介入 | app-ui | #1053 |
| [TPL-20260510-05](TPL-20260510-05-implicit-data-filtering.md) | データ表示の暗黙フィルタ | renderer | #999, #132 |
| [TPL-20260510-06](TPL-20260510-06-display-mode-cross-surface.md) | 表示モード切替の cross-surface 点検 | renderer | #1001, #279, #132, #183 |
| [TPL-20260510-07](TPL-20260510-07-derivation-tag-semantics.md) | 派生タグでの semantic 区別の保存 | edges | #510 |
| [TPL-20260510-08](TPL-20260510-08-derived-state-staleness.md) | 派生 view / panel の memoization と publish | app-ui | #1032, #891 |
| [TPL-20260510-09](TPL-20260510-09-event-handler-ui-restructure.md) | UI 構造を変える event handler の event 漏れ | app-ui | #948 |
| [TPL-20260510-10](TPL-20260510-10-cross-reference-validation.md) | cross-reference プロパティの resolver-side 検証 | parser | #907 |
| [TPL-20260510-11](TPL-20260510-11-parallel-function-parity.md) | 並列関数ファミリの parameter parity | build | #219, #160 |
| [TPL-20260510-12](TPL-20260510-12-ast-parser-renderer-agreement.md) | AST 型 / parser keyword / renderer fallback の三点同意 | parser | #74 |
| [TPL-20260510-13](TPL-20260510-13-e2e-fixture-controlled-state.md) | E2E fixture が状態 / 環境 / 後始末を所有する | testing | #976, #1006, #1007 |
| [TPL-20260510-14](TPL-20260510-14-wait-for-stable-state.md) | E2E は到達した stable state を待ってから assert する | testing | #1171, #976 |
| [TPL-20260510-15](TPL-20260510-15-dev-vs-packaged-mode-parity.md) | dev mode と packaged / installed mode の parity | vscode | #1024 |
| [TPL-20260510-16](TPL-20260510-16-convenience-vs-principled-api.md) | consumer 境界では convenience より principled API | cli | #239, #507 |
| [TPL-20260510-17](TPL-20260510-17-trust-boundary-input-validation.md) | trust boundary で外部入力を validate / canonicalize | cli | #168 |
| [TPL-20260510-18](TPL-20260510-18-text-as-single-source-of-truth.md) | `.krs` テキストを single source of truth に保つ | core-concepts | concepts.ja.md |
| [TPL-20260510-19](TPL-20260510-19-information-flows-up.md) | 情報の流れは抽象化方向（up）か詳細化方向（down）かを判定する | core-concepts | concepts.ja.md |
| [TPL-20260510-20](TPL-20260510-20-id-not-label-for-identity.md) | identity は `id` で判定し `label` を比較に使わない | resolver | concepts.ja.md |
