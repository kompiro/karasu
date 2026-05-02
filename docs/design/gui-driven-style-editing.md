# GUI-driven style editing in Preview

- **日付**: 2026-05-02
- **ステータス**: 検討中
- **関連**:
  - 親 Issue: [#1076](https://github.com/kompiro/karasu/issues/1076) — GUI-driven style editing in Preview
  - 関連 Issue: [#1071](https://github.com/kompiro/karasu/issues/1071) — Edge readability brainstorm（最初の具体ユースケースの候補）
  - 関連 Issue: [#1063](https://github.com/kompiro/karasu/issues/1063), [#1067](https://github.com/kompiro/karasu/issues/1067) — read/write edge differentiation（per-edge override の素材）
  - 既存仕様: `docs/spec/style.md`
  - 関連設計: `docs/concepts.md`（論理/物理分離）

## 背景・課題

`.krs.style` の語彙は機能追加のたびに増えている（色、edge differentiation、
label position、direction 候補など）。各々の追加そのものは設計上クリーンに
できても、**ユーザー側が「どんな knob があるのか」を把握しきれなくなる**
という問題が前面に出てきた。文法を整えるだけでは到達できない壁で、
discoverability の課題に近い。

#1071 で edge direction 装飾（PlantUML 風）を入れるかどうか議論する中で、
「文法を増やす vs ユーザー認知負荷」のトレードオフが明示的になった。
そこから派生して、本 Issue では **Preview 上の対話操作で style を編集する**
という方向を検討する。

ねらい:

- ユーザーは Preview の要素を選び、コンテキストメニューから値を選ぶだけで
  済む。selector 構文も spec も読む必要がない
- `.krs.style` はテキストファイルとして残り、レビュー・差分・git で扱える
- 新しい style 機能を追加するコストの大半が GUI 側に寄る
  （= 文法追加の心理的ハードルが下がる）

## 制約・前提

- `.krs.style` は **テキストファイルが source of truth**。GUI 編集はその
  上に乗る構造化エディタとして振る舞う（ファイルに書き戻す形）
- `.krs` 本体の文法・語彙は変えない（presentation の話なので `.krs.style`
  側で完結させる）
- 論理/物理分離（`docs/concepts.md`）を維持する。direction や色などの
  presentation は `.krs.style` の領域、ロジカルな構造は `.krs` の領域
- Monaco エディタが editor 側で別途開かれている可能性がある（両方向の
  同期が必要）
- `karasu serve` / `app` の Web プレビューを主要対象とする（VS Code 拡張
  への展開はフォローアップ）
- karasu の根本コンセプトは「テキストで描く」こと。GUI 編集はあくまで
  **補助** であって、すべての操作を GUI でできる必要はない

## 検討した選択肢

### 案1: 文法のみで解決（現状の延長）

`.krs.style` に新しい機能（edge direction、label position 等）を追加する
たび spec を拡充し、ユーザーには `docs/spec/style.md` を読んで覚えて
もらう。

- 利点: ツール側の実装がシンプル。テキスト編集者にとっては最も透明
- 欠点: 追加された機能の discoverability がゼロ。spec を読まないと
  そもそも存在に気付けない。機能数が増えるほど認知負荷が線形に上がる

### 案2: GUI 編集 — 既存ルールを書き換える

選択中要素に対応する既存ルールを `.krs.style` から探し、見つかれば値を
in-place 更新、なければ追加する。

- 利点: ファイルが肥大化しない
- 欠点: round-trip の難度が高い。AST 書き出し時に既存の整形・コメント・
  ルール並び順を保つ必要があり、editor との衝突や意図しない diff が
  起きやすい。selector の specificity が同じ既存ルールが複数ある場合の
  解決ロジックが必要

### 案3: GUI 編集 — カスケード上書きで append のみ（採用候補）

選択中要素に対応する **より specificity の高いルールを末尾に追記する** だけ。
既存ルールは触らない。CSS のカスケードと同じ発想で、後ろに置いた
specificity の高いルールが勝つ。

- 利点:
  - 既存ファイルを書き換えないので diff が予測可能
  - ID 形式 selector を使えば衝突しない（後述）
  - 「update or append?」の意思決定が GUI 側で不要
  - editor との同時編集にも壊れにくい（追記しか起きない）
- 欠点:
  - 操作のたびにルールが積み重なる（override sprawl）
  - 整理は別タイミングで明示的に行う必要がある（Tidy Style コマンド）

### 案4: GUI 編集 — 毎回ファイル全体を書き直す

GUI 編集のたびに `.krs.style` を AST から再生成する。

- 利点: 常にきれいなファイルが保てる
- 欠点: PR diff が編集のたびに大きくなる。コメント・ルール並び順・
  グループ化など著者の意図が失われる。Monaco との同時編集が事実上不可能

## 比較

| 観点 | 案1 文法のみ | 案2 in-place | 案3 append（カスケード） | 案4 毎回書き直し |
|---|---|---|---|---|
| Discoverability | 悪 | 良 | 良 | 良 |
| 実装コスト | 低 | 高 | 中 | 中 |
| diff 予測性 | 高 | 中 | 高 | 低 |
| 著者の意図保護 | 高 | 中 | 高 | 低 |
| 競合耐性 | 高 | 中 | 高 | 低 |
| 整理の手間 | 不要 | 自動 | 明示（Tidy Style） | 自動 |

## 現時点の方針

**案3（append のみのカスケード上書き）+ 明示的な Tidy Style コマンド** を
採用する。

### 編集モデル

1. ユーザーが Preview 上の要素を選択
2. コンテキストメニューに該当要素で適用可能な style プロパティが並ぶ
3. 値を選ぶと `.krs.style` の末尾に specificity の高いルールが追記される
4. 既存ルールは一切書き換えない。カスケードによって新しいルールが勝つ

### Selector 戦略

「この要素だけ」変えるケースは **ID 形式 selector** をデフォルトにする:

```
edge#A->B { direction: down }
```

- GUI が semantic 解析なしに生成できる
- 兄弟要素を巻き込まない（一意指定）
- 生成された `.krs.style` を読む人にも対応関係が分かる

メニューには「同種すべてに適用」など広い selector を出す選択肢も用意
するが、デフォルトは ID 形式。

### Tidy（整理コマンド）

`go mod tidy` と同じ語感で、**散らかった状態を矛盾なくまとめ直す** 操作。
本設計では **コマンド族** として位置付ける:

- **Tidy Style** — `.krs.style` を対象。本設計の MVP に含める
  - 重複・上書きされて死んでいるルールを畳む
  - selector 単位でグルーピング・並び替え
  - rule 内部の whitespace を正規化
- **Tidy Source** — `.krs` を対象。**本設計のスコープ外**。将来別設計
  として扱う。論理モデル削除を伴うため、より保守的なデフォルト
  （opt-in 粒度・dry-run プレビュー）が要る

LSP 標準の **Format Document**（純粋な whitespace 整形、`.krs` / `.krs.style`
両方対象、決定的）とは別概念として扱う。Tidy はセマンティクスを伴う整理、
Format は構文整形、と境界を分ける。

Tidy Style はあくまで **明示的なコマンド** で、GUI 編集のたびに走らせない。
理由は、編集ごとに走らせると PR diff が肥大化し著者の意図が消えるため。

### Undo

Monaco の undo スタックとの統合は MVP のスコープから外す。GUI 編集と
editor 編集はそれぞれ独立した undo を持つ。Cmd+Z は editor のテキスト
編集にしか効かず、Preview 側の操作は Preview 側の undo（または `git
diff` での確認）に頼る、という seam を持たせる。後で実害が出れば再検討
する。

## MVP スコープ

最小構成として 1 機能を end-to-end で通し、append 書き戻し・ID selector・
editor 同期の3点を検証する。

候補:

- **edge の direction 指定**（#1071 と接続するため最有力）
- edge の color 上書き
- read/write override（#1067）

候補の中から #1071 の議論進捗に応じて選ぶ。MVP 外:

- Tidy Style コマンド（必要性は MVP で append が積み上がるのを見て判断）
- 「同種すべてに適用」の広 selector
- Monaco undo との統合
- VS Code 拡張への展開
- 複数 `.krs.style` ファイルへの書き分け（後述の open question）

## アクセプタンステスト観点

実装時に `docs/acceptance/` で起こす AT に含めたい人手確認:

- Preview 上で edge を右クリック → メニュー表示 → 値を選ぶ → 図に反映
- `.krs.style` ファイルにルールが追記される（既存内容は無傷）
- editor 側で `.krs.style` を開いた状態で GUI 操作しても editor 表示が
  追従する
- 同じ操作を繰り返したときに重複 rule が積まれることをユーザーが確認
  できる（後の Tidy Style 必要性判断の素材）

CI で見れる項目（unit / integration）は AT 側には書かない。

## 未解決の問い

なし。以下の項目はこの段階で結論を確定しないが、現時点の方針で十分に
進められると判断したもの。実装時に判断する。

- **書き戻し対象ファイルの選択**: 複数の `.krs.style` がインポートされて
  いる場合、どこに append するか。MVP ではプロジェクトのルート相当の
  `.krs.style` 1 つに絞る。複数ファイル対応はフォローアップ
- **要素 ID の正規化**: 同一エンドポイントペア間に複数の edge がある
  ケースの一意 ID 規則。`from->to` で一意になればそのまま、衝突するなら
  index 付与。Spec 側で edge ID の正規形を定義する作業は MVP の前段で
  Spec PR として切り出す
- **既存 style grammar が ID selector を表現できるか**: 現状の `style.md`
  にない場合、文法拡張 PR が前提タスクとして必要かを実装着手時に確認
- **MVP 機能の最終決定**: edge direction / color / read-write override
  のどれを最初に通すかは #1071 の方向性に揃える
