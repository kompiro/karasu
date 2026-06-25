# karasu-nest — URL で .krs を共有・プレビューするホスト型サービス

- **日付**: 2026-06-25
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#1783](https://github.com/kompiro/karasu/issues/1783)
  - 関連 ADR: [ADR-20260616-03](../adr/20260616-03-docs-site-ssg.md)（docs-site SSG — ビルド時 headless レンダリングの先例）
  - 関連 Design Doc: [docs-site-examples-gallery](docs-site-examples-gallery.md)（同じ headless SVG レンダリング系統を使う）
  - 関連 TPL: [TPL-20260510-06](../test-perspectives/TPL-20260510-06-display-mode-cross-surface.md)（描画モード切替は全描画面の点検が必要 — karasu-nest は新しい描画 surface になる）
  - コード: `packages/core/src/index.ts`（`compile` / `buildAllViewsSvg` / `compileProject` / `buildAllViewsSvgProject`）, `packages/app/src/MemoryModeApp.tsx`

## 背景・課題

いくつかの OSS（Dify / Kubernetes / n8n）を、`syntax.md` を読み込ませた Claude/ChatGPT に与えて `.krs` で表現させてみたところ、思いのほかうまくいった。drill-down も含めて概要を把握するには十分だった。観測した傾向は以下:

- **`system` 図のトップ構成**: リポジトリ全体の構成把握に役立つ（強い）
- **`system` 図の `domain` 以下**: どのサービスがどのドメインを扱うかは分かるが、LLM で最初から完全な形でリバースするのは非現実的（弱い）
- **`deploy` 図**: サービス全体構成を把握できるレベルが生成できる（強い）
- **`org` 図**: ガバナンスが強いプロジェクト（k8s 等）でないとまともにならない（弱い）

この「LLM に `.krs` を作らせて概要をつかむ」体験を多くの人に届けたい。そのために、**生成した `.krs` を貼ると preview でき、その URL を他の人と共有できる**ホスト型サービス `karasu-nest` を立ち上げたい。本 Design Doc はその v1 スコープを定める。

重要な前提転換: reverse（repo → karasu）は **ユーザー自身が自分の Claude/ChatGPT で行う（BYO LLM）**。サービスは LLM を持たず、受け取った `.krs` を **描画するだけ**。これによりコスト・キャッシュ・推論メータリングの問題が v1 から消える。

## 現状（インベントリ）

| 観点 | 現状 |
| --- | --- |
| レンダリング API | core に `compile()` + `buildAllViewsSvg()`（単一ファイル）、`compileProject()` + `buildAllViewsSvgProject()`（import 解決込み）。いずれも Pure TS で headless 実行可能。docs-site ビルドが既にこれを browser 無しで使っている |
| app のモード | `MemoryModeApp` / `ProjectModeApp` / `ServeModeApp` の 3 モード。`MemoryModeApp` は in-memory の `.krs` 内容を drill-down 付きで描画する（ローカル FS に依存しない） |
| 既存の headless 描画先例 | docs-site の examples gallery（[Design Doc](docs-site-examples-gallery.md)）が `compileProject` + `NodeFileSystemProvider` でビルド時に全ビュー SVG を生成している |
| ホスティング基盤 | karasu-nest 用のものは未整備（docs-site は GitHub Pages、想定ドメインは `karasu-nest.kompiro.workers.dev`） |
| reverse の手段 | サービスには無い。ユーザーが手元の Claude/ChatGPT で `syntax.md` を与えて生成する |

## 制約・前提

- **v1 はサービス側 LLM ゼロ**。reverse は BYO（Claude/ChatGPT + `syntax.md`）。サービスは `.krs` を描画するだけ。
- **drill-down を保持する**。分析価値は drill-down（system トップ → domain、deploy の内部）に依存するため、静的 SVG 1 枚では不十分。v1 は **インタラクティブ preview を主 surface** とする。
- **共有はステートレス inline**。`.krs` 内容を URL（fragment）に圧縮格納する（mermaid.live 方式）。**DB なし・保存型 paste なし・モデレーション面なし**。要件は「ユーザー間で共有できる URL」であり inline で満たせる。
- **既存 app を再利用する**。新規ビューアをゼロから作らず、`MemoryModeApp` を URL ソース解決で初期化する。
- **新しい描画 surface である**ことを TPL-20260510-06 に照らして意識する（displayMode・drill-down・icon-theme 等の挙動が既存 surface と一致すること）。
- **out of scope（将来フェーズ）**:
  - `/<owner>/<repo>` GitHub resolver（Phase 2）
  - in-site editor + repo への `.krs`/画像 PR 還元ループ（Phase 3）
  - サービス側での LLM reverse
  - 保存型 paste（短縮 URL のための DB）

## 検討した選択肢

### 案1: ホスト版 app + inline-URL ソース解決（採用）

既存の React app を静的ホスティングし、`.krs` 内容を URL fragment から復元して `MemoryModeApp` を初期化する。副として core の `buildAllViewsSvg` を使う静的 SVG/PNG エンドポイントを置く。

**メリット**

- drill-down をそのまま得られる（app 既存機能の再利用）。
- ステートレス。fragment はサーバへ送信されないため Worker は完全ステートレス、内容がアクセスログに残らない（プライバシー的にも素直）。
- 実装量が小さい（新規描画ロジックを書かない）。

**デメリット**

- URL 長の上限。大きな `.krs`（whole-repo リバース）は圧縮しても URL が長くなりうる。
- inline は単一ファイル前提。multi-file（`import`）プロジェクトをそのままは運べない。

### 案2: 専用の軽量ビューア（静的 SVG 中心）を新規構築

app に依存せず、`buildAllViewsSvg` の出力 SVG を表示するだけの薄いページを作る。

**メリット**

- 軽量・高速。README 埋め込みや OGP に向く。

**デメリット**

- **drill-down が落ちる**。今回の分析価値の中心を失うため、v1 の主 surface には不適。
- app と二重メンテになる（描画面の挙動差 → TPL-20260510-06 のリスク）。

→ 静的 SVG は「副エンドポイント」として案1 に内包する形で活かす（主にしない）。

### 案3: 保存型 paste（DB あり）

`.krs` を保存し短い ID の URL を発行する。

**メリット**

- URL が短く、長い `.krs` でも共有しやすい。

**デメリット**

- ストレージ・ライフタイム管理・abuse/モデレーション面が発生する。
- 「短くて永続な URL」のニーズは Phase 2 の `/<owner>/<repo>` resolver が別途満たす見込みで、v1 で DB を持つ動機が薄い。

## 比較

| 観点 | 案1 inline + app | 案2 静的ビューア | 案3 保存型 paste |
| --- | --- | --- | --- |
| drill-down | ○ 保持 | ✕ 失う | ○ 保持（app 再利用なら） |
| 実装コスト | 小（app 再利用） | 中（新規 surface） | 大（DB/運用） |
| 状態・運用 | ステートレス | ステートレス | DB・モデレーション必要 |
| URL 共有 | △ 長くなりうる | △ | ○ 短い |
| abuse 面 | 無し | 無し | あり |

## 現時点の方針

**案1 を採用する** — 「任意の `.krs` を drill-down 付きで描画し、URL で共有できる」という要件を、既存 app の再利用とステートレス inline で最小コストかつ運用負荷ゼロで満たせる。静的 SVG（案2 の利点）は副エンドポイントとして取り込み、案3 の DB は持たない。

### 実装の指針

1. **inline URL エンコード方式**: `.krs` を圧縮（例: LZ 系）して URL fragment に格納する（`https://karasu-nest.../#krs=<compressed>` 等）。fragment はサーバへ送られないため Worker はステートレス。
2. **app の URL ソース入口**: `MemoryModeApp` を fragment デコード結果で初期化する経路を追加する。
3. **ホスティング**: app を静的ビルドして Cloudflare Pages/Worker（`karasu-nest.kompiro.workers.dev`）へデプロイする。
4. **静的 SVG/PNG エンドポイント（副）**: Worker 上で core の `buildAllViewsSvg` を呼び、SVG/PNG を返す。README 埋め込み・OGP・将来（Phase 3）の「画像で還元」に流用する。AI 生成近似である旨を UI に明示する。
5. **reverse レシピのアナウンス**: `syntax.md` を同梱した即利用可能なプロンプト / Claude Project 手順を docs ページとして公開する。強いビュー（`system` トップ + `deploy`）へ誘導し、弱いビュー（深い `domain`・`org`）に過度な期待をさせない注意書きを添える。
6. AT: `docs/acceptance/` に新規ファイル。TC は:
   - inline URL を開くと `.krs` が drill-down 付きで描画される
   - drill-down 後の表示が既存 app の挙動と一致する（displayMode / icon-theme 等、TPL-20260510-06）
   - 静的 SVG エンドポイントが既存ビューと同等の SVG を返す
   - URL fragment がサーバへ送信されない（ステートレス性）
7. ADR 昇格: 方針が固まったら `docs/adr/YYYYMMDD-NN-karasu-nest-hosted-preview.md` として昇格し、本 Design Doc は同 PR で削除する。

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: なし（新サービスの追加。既存 app/CLI/LSP の挙動は変えない）。
- ドキュメント更新: reverse レシピの新規 docs ページ。`docs/concepts` 等の変更は不要。
- テスト・examples への影響: なし（新規 AT のみ追加）。

## 未解決の問い / フェーズ分け

- **URL 長の上限**: 大きな `.krs` を圧縮しても fragment に収まるか。収まらない場合のフォールバック（Phase 2 の GitHub resolver / 将来の gist 連携）をどう示すか。
- **multi-file inline**: `import` を跨ぐプロジェクトを inline で運ぶか（仮想 FS を JSON で詰める案）、それとも v1 は単一ファイルに限定し multi-file は Phase 2 に回すか。
- **静的 SVG のビュー**: 副エンドポイントは全ビューを返すか、トップビュー 1 枚に絞るか。
- **Phase 2 / 3 のスコープ確定**: `/<owner>/<repo>` resolver と PR 還元ループは別 Design Doc に切り出すか、本ドキュメントの後続節として育てるか。
