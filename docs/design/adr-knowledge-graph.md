# ADR を機械可読なアーキテクチャ知識グラフにする

- **日付**: 2026-04-22
- **ステータス**: 検討中
- **関連**:
  - Issue #788（本 Issue）
  - `docs/adr/` 配下の既存 ADR（約 100 本）
  - `docs/adr/README.md` — 現行のトピック別 / ステータス別インデックス
  - `docs/process.md` — ADR ライフサイクルと supersede ルール
  - [ADR-20260410-03](../adr/20260410-03-structural-krs-patch.md) — 構造的パッチの先行事例（テキスト → 構造化データへの段階移行パターン）

## 背景・課題

`docs/adr/` は 100 本を超え、ADR-20260322 以降は「関連 ADR」を人間が散文で列挙している。
現状 ADR 同士の関係性は README のトピック分類と各 ADR 本文中のリンクに依存し、次のことが機械的に不可能になっている:

1. **依存性の整合性検証**: accepted な ADR が暗黙に superseded / deprecated な ADR に依存していても検出できない。
2. **双方向 supersede の保証**: 旧 ADR に `Superseded by ADR-X` を書き忘れても気づけない（`docs/process.md` L129 が要請する運用が人手頼み）。
3. **有効 ADR セットの抽出**: あるモジュール（例: `packages/core` の resolver）を触るときに、今も生きている関連 ADR だけを切り出すには README を目で追うしかない。
4. **前提条件の陳腐化検出**: ADR が依拠する前提（例: 「translate は top-level infra を出す」）がコード変更で崩れても、その ADR は沈黙したまま古くなる。
5. **AI コンテキストへの投入品質**: `CLAUDE.md` からの参照は今のところ粗く、全 ADR を人間が選別しないと AI に適切な文脈を渡せない。

README の「ステータス別」セクション（L190-194）にも既に

> 本 PR では superseded 関係の網羅的な整理は行わず… superseded 関係の棚卸しや、各 ADR への status フロントマターの追加は follow-up work。

と書かれており、本 Issue はこの follow-up を受ける位置付けである。

### 解決したい具体例

- ADR-20260422-04（top-level service）を変更するとき、依存している ADR-20260422-05（top-level infra）が自動で提示される。
- 誰かが ADR-20260405-05 を `superseded` にすると、それに `depends_on` している accepted ADR が CI で検出される。
- AI に「resolver まわりを触ってほしい」と頼むとき、scope: `resolver` で絞った有効 ADR だけがコンテキストに入る。

### Issue 明記のスコープ（Phase 1）

- YAML Frontmatter スキーマの確定
- 関係性セマンティクスの定義（supersedes / depends_on / related_to / conflicts_with / refines）
- バリデータスクリプト（Node/TS）と CI フック
- 代表的な ADR 3〜5 本の移行（異なる時期・supersede 関係を含むもの）
- 新規 ADR 用テンプレートの更新
- 抽出（effective set / slice）・可視化・全本移行は **Phase 2 以降の別 Issue** に切り出す

## 制約・前提

- 既存 ADR は 100 本超 — 全移行を 1 PR に含めない（レビュー不能になる）。
- 旧 ADR の本文ヘッダ（`- **日付**:` / `- **ステータス**:` / `- **関連**:`）は当面は frontmatter と **共存** させる。GitHub での視認性を損なわないため。
- ステータス値は `docs/process.md` の運用語彙と整合させる:
  - 設計ドキュメントは「検討中 / 採用 / 取りやめ」
  - ADR は「決定済み / Superseded by ADR-X」
  - 「Not adopted」は README の独立カテゴリ
  - frontmatter の `status` は英語の統制語彙に正規化する（後述）。
- ID は **既存のファイル名由来**（`ADR-YYYYMMDD-NN`）をそのまま採用する — 新規 ID 体系の導入は移行コストを倍加させるため避ける。
- スクリプトの依存は TypeScript + pnpm workspace 内にとどめる。新規の外部依存は最小限（YAML パーサーと JSON Schema バリデータのみ）。
- バリデータは既存の `ADR-XXXXXXXX-YY` 記法と README 内のリンク整合性も将来的に拾えるよう拡張可能にしておく（Phase 1 では ID と関係の整合のみ）。

### スコープ外（Phase 1）

- 全 ADR の frontmatter 付与
- Mermaid 依存グラフの自動生成
- Assumption-drift checker（「前提がコードと矛盾していないか」の定期チェック）
- `docs/adr/effective.md` の自動生成
- AI コンテキストへの自動投入パイプライン
- README の自動生成化（当面は手動メンテを継続）

## 検討した選択肢

### 軸A: メタデータの格納場所

#### A-1: YAML Frontmatter（ファイル先頭）

\`\`\`markdown
---
id: ADR-20260422-05
title: ...
status: accepted
...
---

# ADR-20260422-05: ...
\`\`\`

- **メリット**: ほぼ全ての Markdown ツールが素通しする。GitHub のレンダラーも表示しつつ本文を壊さない。Jekyll / Hugo / VitePress など後々の選択肢を閉じない。
- **デメリット**: 既存ヘッダ（`- **日付**:` 等）と情報が重複する。

#### A-2: 別ファイル（`20260422-05.meta.yaml`）

- **メリット**: 本文と分離でき、厳格な JSON Schema 検証が純粋に回せる。
- **デメリット**: ファイル数が倍になり、ADR と対応 meta のドリフトが起こる。GitHub 上で「1 ADR = 1 ファイル」の単純さが崩れる。

#### A-3: 中央レジストリ（`docs/adr/index.yaml`）

- **メリット**: グラフ全体を 1 ファイルで俯瞰できる。
- **デメリット**: ADR 本文との局所性が失われ、PR コンフリクトが起きやすい。ADR 追加のたびに中央ファイルを編集する必要があり、忘れやすい。

**採用: A-1（YAML Frontmatter）**

理由:
- 本文と同じ PR で必ず一緒に動くため、ドリフトしない。
- GitHub のレンダリング互換（frontmatter は無視されるか薄く表示される）。
- Phase 2 で中央レジストリ（effective.md / graph.json）を作るなら、frontmatter から **生成** すればよい。正本は frontmatter 側に置く。
- 既存ヘッダは一旦併存させ、将来 frontmatter に統合するか削除するかは Phase 2 で判断する（本 Phase では変えない）。

### 軸B: 関係性の語彙

#### B-1: 単一の `related` バッグ

現状の ADR 本文と同じく、「関連」という 1 種類のリンクだけを持つ。

- **メリット**: スキーマが極小。移行負荷も低い。
- **デメリット**: 「これは supersede なのか単なる参照なのか」を機械で区別できない。陳腐化検出も整合性検証も不可能。今の困りごとを解決しない。

#### B-2: セマンティクス分離（supersedes / depends_on / related_to / conflicts_with / refines）

以下の 5 種を区別する:

| 関係 | 方向 | 意味 | 違反例 |
|------|------|------|--------|
| `supersedes` / `superseded_by` | 双方向 | 時間軸の置き換え。新 ADR が古い ADR を完全に無効化 | 片側だけ記載 |
| `depends_on` | 一方向 | 前提として成立している必要がある | 依存先が superseded になっている |
| `related_to` | 一方向（対称扱い可） | 参照のみ。意思決定には影響しない | — |
| `conflicts_with` | 双方向 | 同時採用不可の選択肢 | 両方 accepted になっている |
| `refines` | 一方向 | 上位 ADR の具体化（抽象→具体） | 循環 |

- **メリット**: 検証ルールを具体的に書ける。AI 抽出時に「単なる参照」と「崩れたら困る前提」を区別できる。
- **デメリット**: 新規 ADR を書くとき 5 種のどれに該当するか判断コストがかかる。

#### B-3: グラフ DB 的な任意ラベル方式

`{to: ADR-X, label: "inspired_by"}` のように自由ラベル。

- **メリット**: 将来の拡張に強い。
- **デメリット**: 検証ルールが書けない（ラベル毎に手書きしないと成立しない）。組織的統制がぶれる。

**採用: B-2（5 種のセマンティクス）**

理由: Issue #788 で挙げた課題 1〜4 は「supersedes と depends_on の整合性」に集約される。この 2 つを最低限持ち、残り 3 つ（related_to / conflicts_with / refines）は将来の拡張余地として定義だけ済ませておく。Phase 1 のバリデータは主に前 2 つを検査する。

### 軸C: ID の発行戦略

#### C-1: 既存のファイル名由来（`ADR-YYYYMMDD-NN`）をそのまま採用

- **メリット**: 移行不要。README との整合も保てる。
- **デメリット**: 日付が衝突した場合に `NN` を手で決める必要がある（現行運用と同じ）。

#### C-2: 連番 ID（ADR-0001, ADR-0002 ...）を別途発行

- **メリット**: グラフでのラベルが短くなる。
- **デメリット**: 100 本を再採番する必要。既存の本文中のリンク（例: `ADR-20260405-05` への言及）が全て壊れる。

**採用: C-1**

### 軸D: ステータス語彙

#### D-1: 英語統制語彙 `proposed | accepted | deprecated | superseded | not_adopted`

- **メリット**: 検証が一意に書ける。国際的な ADR 慣行（MADR 等）とも整合。
- **デメリット**: README の日本語カテゴリ（決定済み / Not adopted）とずれる。

#### D-2: 日本語 `決定済み | Superseded by ADR-X | 取りやめ | 検討中`

- **メリット**: 既存 ADR 本文と完全一致。
- **デメリット**: 機械処理で不要な正規化が要る。英日混在（`Superseded by`）で既にブレている。

**採用: D-1**（frontmatter は英語統制語彙）

ただし本文の日本語ヘッダ（`- **ステータス**: 決定済み`）は当面残す。
両者の対応は Phase 1 のドキュメントに明記する:

| frontmatter `status` | 本文表記 | README カテゴリ |
|---------------------|----------|----------------|
| `accepted` | 決定済み | （トピック別） |
| `superseded` | Superseded by ADR-X | （トピック別に残す） |
| `not_adopted` | 決定済み（不採用として） | Not adopted |
| `deprecated` | 非推奨 | （Phase 2 で整理） |
| `proposed` | 検討中 | — |

### 軸E: バリデータの実行場所

#### E-1: pnpm workspace 内の TypeScript スクリプト + lefthook pre-commit + GitHub Actions

- **メリット**: 既存の CI 基盤（`.github/workflows/*.yml`）と lefthook に乗せるだけ。TypeScript で統一できる。
- **デメリット**: ADR 変更時にしか動かさないよう glob フィルタが要る。

#### E-2: 独立シェルスクリプト

- **メリット**: 依存ゼロ。
- **デメリット**: YAML パースと JSON Schema 検証をシェルで書くのは非現実的。

#### E-3: 既存 `adr-tools` / `log4brains` を採用

- **メリット**: 車輪の再発明を避けられる。
- **デメリット**: 我々のファイル名規則（`YYYYMMDD-NN`）やステータス語彙と合わず、設定より改修が多くなる見込み。ADR 本文の日本語ヘッダも追加のカスタマイズが要る。

**採用: E-1**（TypeScript スクリプト + lefthook + GitHub Actions）

配置は `scripts/adr/validate.ts` とし、ルートの `package.json` に `pnpm adr:validate` スクリプトを追加する。CI では `docs/adr/**` が変更された PR でのみ起動する。

## 決定事項（Phase 1 として合意したい内容）

### 1. Frontmatter スキーマ

\`\`\`yaml
---
id: ADR-20260422-05                  # 必須。ファイル名と一致すること
title: ...                           # 必須。本文 H1 と一致すること（検証対象）
status: accepted                     # 必須。proposed | accepted | deprecated | superseded | not_adopted
date: 2026-04-22                     # 必須。ISO 8601（YYYY-MM-DD）
authors: [kompiro]                   # 任意

# 関係性（すべて任意、デフォルトは空配列）
supersedes: []                       # 例: [ADR-20260405-05]
superseded_by: null                  # status=superseded のとき必須
depends_on: []
related_to: []
conflicts_with: []
refines: []

# スコープ（任意だが推奨）
scope:
  packages: [core, app]              # packages/* の短縮名
  domains: [resolver, rendering]     # 自由タグ（将来 controlled vocabulary にする余地）

# 前提条件（任意・Phase 2 の drift 検出で使う）
assumptions: []                      # 自由記述の文字列配列
---
\`\`\`

### 2. バリデーションルール（Phase 1）

1. `id` がファイル名と一致（`20260422-05-top-level-infra-rendering.md` → `ADR-20260422-05`）。
2. `status` が統制語彙のいずれか。
3. `status: superseded` のとき `superseded_by` が必須、それ以外では null。
4. `supersedes` に列挙された ADR の `superseded_by` が自分を指している（双方向整合）。
5. `depends_on` / `supersedes` / `related_to` / `conflicts_with` / `refines` に列挙された ID がすべて実在する。
6. `depends_on` と `refines` にサイクルがない。
7. `status: accepted` な ADR の `depends_on` に `superseded` / `deprecated` / `not_adopted` が含まれない（警告、エラーではない — Phase 2 で昇格を検討）。
8. `title` が本文 H1 行と一致する。

### 3. 移行する代表 ADR（Phase 1）

次の 5 本を選ぶ。理由は supersede / depends_on / not_adopted をそれぞれ含み、バリデータの挙動を実戦で検証できるため:

| ADR | 役割 |
|-----|------|
| `20260422-05-top-level-infra-rendering.md` | 最新 accepted、`depends_on` を豊富に持つ |
| `20260422-04-top-level-service-rendering.md` | 22-05 が depends_on する側 |
| `20260405-05-database-as-first-class-node.md` | 22-05 が depends_on する先行決定 |
| `20260323-01-yaml-style-syntax-cancelled.md` | `not_adopted` 事例 |
| `20260404-01-bun-not-adopted.md` | `not_adopted` 事例・新しめ |

supersede 関係の実サンプルがあれば 6 本目として追加する（ヒアリング対象）。

### 4. 新規 ADR テンプレート

`docs/adr/TEMPLATE.md`（新規）に frontmatter と本文の雛形を置き、`docs/process.md` のリンクを追記する。

### 5. CI 統合

- `scripts/adr/validate.ts` を追加
- ルート `package.json` に `"adr:validate": "tsx scripts/adr/validate.ts"`
- `.github/workflows/` に `adr-validate.yml`（paths: `docs/adr/**`, `scripts/adr/**`）
- `lefthook.yml` の `pre-commit` に ADR ファイル変更時のみ走るエントリを追加

### 6. ADR 昇格

本 Design Doc は Phase 1 完了時に ADR に昇格させる（`YYYYMMDD-NN-adr-knowledge-graph.md`）。Phase 2 以降の Issue はその ADR を `refines` で参照する。

## 受け入れテスト（Phase 1）

- [ ] `pnpm adr:validate` がローカルで成功する（代表 5 本が通る）。
- [ ] 故意に不整合（例: `supersedes` の片側だけ記載）を作ると exit code 1 で失敗する。
- [ ] 未知の ID を `depends_on` に書くと失敗する。
- [ ] `status: accepted` で `superseded_by` を書くと失敗する。
- [ ] サイクル（A depends_on B, B depends_on A）を作ると失敗する。
- [ ] GitHub Actions が PR で ADR ファイル変更を検出したときのみ起動する（他の PR では無走）。
- [ ] `docs/adr/TEMPLATE.md` が存在し、`docs/process.md` から参照されている。

自動化不可（手動 QA）:

- [ ] 代表 ADR を GitHub 上で閲覧しても frontmatter が邪魔していない（本文の日本語ヘッダは従来通り見える）。
- [ ] 新規 ADR を書くとき、テンプレートが意図した通りにコピー元として機能する。

## Phase 2 以降の作業（別 Issue で起票予定）

- 残り 95 本超の ADR 移行（トピック別に 5〜10 PR に分割）
- `depends_on` が superseded/deprecated を指す場合の **エラー昇格**（Phase 1 では警告）
- `scripts/adr/extract.ts` — effective set / scope slice / transitive closure コマンド
- `scripts/adr/visualize.ts` — Mermaid 依存グラフ生成
- `scripts/adr/check-assumptions.ts` — `assumptions` とコード/他 ADR の矛盾検出
- `docs/adr/effective.md` 自動生成 + `CLAUDE.md` からの参照
- 本文日本語ヘッダ（`- **日付**:` 等）の frontmatter への統合可否の判断

## 実装順序（Phase 1）

1. 本 Design Doc を PR として提出し、承認を得る（Refs #788）。
2. 承認後、実装 PR を別途作成:
   1. `scripts/adr/validate.ts` + スキーマ JSON 雛形
   2. 代表 5〜6 本に frontmatter 付与
   3. `docs/adr/TEMPLATE.md` 追加・`docs/process.md` 更新
   4. `package.json` / `lefthook.yml` / GitHub Actions 連携
   5. 受け入れテスト結果を PR body に記載
