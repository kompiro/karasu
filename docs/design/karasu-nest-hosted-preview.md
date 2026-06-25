# karasu-nest — URL で .krs を共有・プレビューするホスト型サービス

- **日付**: 2026-06-25
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#1783](https://github.com/kompiro/karasu/issues/1783)
  - PR: [#1785](https://github.com/kompiro/karasu/pull/1785)
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
- **共有はステートレス inline**。`.krs` 内容を URL（fragment）に圧縮格納する（mermaid.live 方式）。**DB なし・保存型 paste なし・モデレーション面なし**。要件は「ユーザー間で共有できる URL」であり inline で満たせる。実リバース `.krs`（Dify, ~12KB）の実測で、圧縮後の fragment は ~5k 文字 ＝ 最も厳しい Safari(~80k) でも 16 倍超のヘッドルームがあり、現状のサイズ域では URL 長は問題にならない。
- **multi-file は単一ファイルへ合成して inline に載せる**。`import` を跨ぐプロジェクトは、import を解決した**単一の合成 `.krs` 文字列**にしてから fragment へ格納する（仮想 FS を URL に詰めるのではなく 1 ファイルに畳む）。
- **Phase 1 は既存 karasu app 内で完結させる**。独立したサービス／リポジトリを新設せず、inline 共有と静的 SVG を `packages/app`（+ `packages/core`）の機能として実装し、その app をデプロイしたものが karasu-nest になる。
- **既存 app を再利用する**。新規ビューアをゼロから作らず、`MemoryModeApp` を URL ソース解決で初期化する。
- **新しい描画 surface である**ことを TPL-20260510-06 に照らして意識する（displayMode・drill-down・icon-theme 等の挙動が既存 surface と一致すること）。
- **out of scope（MVP 外。アイデアとして GitHub Discussions に記録）**:
  - `/<owner>/<repo>` GitHub resolver（Phase 2）→ [Discussion #1786](https://github.com/kompiro/karasu/discussions/1786)
  - in-site editor + repo への `.krs`/画像 PR 還元ループ（Phase 3）→ [Discussion #1787](https://github.com/kompiro/karasu/discussions/1787)
  - サービス側での LLM reverse（当面やらない。reverse は BYO）
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

**案1 を採用する** — 「任意の `.krs` を drill-down 付きで描画し、URL で共有できる」という要件を、既存 app の再利用とステートレス inline で最小コストかつ運用負荷ゼロで満たせる。静的 SVG（案2 の利点）は副エンドポイントとして取り込み、案3 の DB は持たない。**Phase 1 は新規パッケージ/サービスを立てず、`packages/app`（+ `packages/core`）内の機能として実装し、その app をデプロイしたものを karasu-nest とする。**

### 実装の指針（すべて Phase 1 = karasu app 内）

1. **inline URL エンコード方式**: `.krs` を圧縮（例: LZ 系）して URL fragment に格納する（`https://karasu-nest.../#krs=<compressed>` 等）。fragment はサーバへ送られないため Worker はステートレス。
2. **multi-file → 単一ファイル合成**: 共有対象が `import` を跨ぐ場合、core の import 解決を流用して **単一の合成 `.krs` 文字列**を作り、それを fragment にエンコードする。命名衝突・named import path（#927）の扱いは合成ユーティリティ側で吸収する。
3. **app の URL ソース入口**: `MemoryModeApp` を fragment デコード結果で初期化する経路を追加する。共有 URL の生成・コピー UX は後述「UI: Share ボタンと共有ダイアログ」を参照。**復元できない fragment（壊れた・古い形式・解凍失敗）の場合は、その旨をユーザーに警告したうえで通常の ProjectMode で開く**（共有データを破棄して既存のローカルプロジェクト体験にフォールバックする。白画面やクラッシュにしない）。
4. **ホスティング**: app を静的ビルドして Cloudflare Pages/Worker（`karasu-nest.kompiro.workers.dev`）へデプロイする。
5. **静的 SVG/PNG エンドポイント（副）**: Worker 上で core の `buildAllViewsSvg` を呼び、**全ビューを返す**（ビュー指定クエリ、デフォルトは `system` トップ）。README 埋め込み・OGP・将来（Phase 3）の「画像で還元」に流用する。AI 生成近似である旨を UI に明示する。
6. **reverse レシピのアナウンス**: `syntax.md` を同梱した即利用可能なプロンプト / Claude Project 手順を docs ページとして公開する。強いビュー（`system` トップ + `deploy`）へ誘導し、弱いビュー（深い `domain`・`org`）に過度な期待をさせない注意書きを添える。
7. AT: `docs/acceptance/` に新規ファイル。TC は:
   - inline URL を開くと `.krs` が drill-down 付きで描画される
   - **実リバース `.krs`（Dify サンプル, multi-service + deploy）が inline で開け、全ビューに drill-down できる**
   - multi-file プロジェクトが単一ファイル合成を経て inline で開ける
   - **Share ボタン押下でダイアログに inline URL が表示され、クリップボードへコピーされる**
   - **Share で生成した URL を別タブで開くと元の図が再現される（ラウンドトリップ）**
   - drill-down 後の表示が既存 app の挙動と一致する（displayMode / icon-theme 等、TPL-20260510-06）
   - 静的 SVG エンドポイントが全ビューを既存と同等の SVG で返す
   - URL fragment がサーバへ送信されない（ステートレス性）
8. ADR 昇格: 方針が固まったら `docs/adr/YYYYMMDD-NN-karasu-nest-hosted-preview.md` として昇格し、本 Design Doc は同 PR で削除する。
9. 後続フェーズは本ドキュメントに抱えず、`/<owner>/<repo>` resolver（[Phase 2 / Discussion #1786](https://github.com/kompiro/karasu/discussions/1786)）と editor + PR 還元ループ（[Phase 3 / Discussion #1787](https://github.com/kompiro/karasu/discussions/1787)）を **GitHub Discussions（Ideas カテゴリ）にアイデアとして記録**済み。MVP 外の未確定構想を backlog 化せず温めておくのが目的で、機運が高まった時点で Issue 化する。

### UI: Share ボタンと共有ダイアログ

共有 URL の生成導線は **Project ツールバーの Share ボタン**として置く（`↗ Focus` / `↓ Export SVG` と同じ actionable ボタン列）。

- **ボタン**: shadcn `Button` を `variant="actionable"` で。icon + text label 必須（規約 `app-ui.md` / ADR-20260328）なので `🔗 Share` とする。Export SVG が「図を画像で出す」のに対し Share は「ソースを URL で出す」ので、Export の隣に並べるのが意味的に自然。
- **押下時の処理**:
  1. 現在のプロジェクトを単一 `.krs` に合成（multi-file なら import 解決、単一ファイルならそのまま）
  2. 圧縮 → fragment エンコード → 完全な inline URL を組み立てる
  3. **その場でクリップボードへコピー**（Share クリックは user gesture なので `navigator.clipboard.writeText` が使える）
  4. 共有ダイアログを開く
- **ダイアログ**: shadcn `Dialog` プリミティブ（規約 `dialog.md`）。
  - `DialogTitle`: 「Share this diagram」
  - 本文: 生成された inline URL を **read-only な入力欄**に表示（フォーカス時に全選択）。「Copied to clipboard」のフィードバックと、再コピー用の `Copy` ボタン（`variant="actionable"`）。
  - `DialogDescription` 相当の注意書き: 「リンクを知っている人は誰でもこの図を閲覧できます。内容は URL 自体に埋め込まれています」。
  - `DialogFooter`: `Close`（default ghost）。
  - Radix が focus trap / Esc / outside-click / 返却フォーカスを提供するので独自の keydown/overlay リスナーは付けない（規約準拠）。
- **エンコード前提**: URL は **ソース `.krs` のみ**を運び、ビュー選択は固定しない（開いた側は `system` トップから drill-down する）。「現在のビューを URL に固定する」のは将来の任意拡張とし v1 では持たない。

### 実装フェーズ分割（PR 戦略）

Phase 1 は機能が 5 つあり 1 PR では大きいので、以下の順で **複数 PR に分割**して進める。各 PR は単独でレビュー・マージ可能な単位にする。

| PR | スコープ | 依存 |
| --- | --- | --- |
| **PR 1 — inline share（単一ファイル）** | `.krs` を `fflate` deflate → base64url で URL fragment（キー `#s=`）に encode/decode。Share ボタン + 共有ダイアログ。復元経路（`MemoryModeApp` を decode 結果で seed、共有リンクは ephemeral な in-memory ビューで開く）。復元失敗時は警告して ProjectMode へフォールバック。**単一ファイルのみ** | なし |
| **PR 2 — multi-file 合成 + style バンドル** | `import` を跨ぐプロジェクトを `ImportResolver` の結果から **単一 `.krs` 文字列へ合成**（core `serializeKrsFile` / `synthesizeSharePayload`）。さらに `.krs.style` も**バンドル**（`{krs, style}` ペイロード）。`.krs` 単体ではスタイルが運べないため必須。PR1 の生 `.krs` 形式は後方互換でデコード | PR 1 |
| **PR 3 — 静的 SVG/PNG エンドポイント** | Cloudflare Worker 上で `buildAllViewsSvg` を呼び全ビューを返す。PNG ラスタライズを含む。README 埋め込み・OGP 用 | PR 1 |
| **PR 4 — ホスティング + reverse レシピ** | app の Cloudflare Pages/Worker デプロイ設定 + `syntax.md` 同梱の reverse レシピ docs ページ | PR 1（必要なら PR 3） |

決定事項（PR 1 で確定）:

- **共有リンクは ephemeral**: OPFS 対応ブラウザでも共有ソースは in-memory で開き、訪問者のローカル（OPFS）プロジェクトを汚さない。
- **再共有は Share ボタン経由**: 開いた直後の fragment は drill-down ナビ（`#krs-…`）に上書きされるため、再共有は常に現在の編集内容を読む Share ボタンで行う（アドレスバーの URL を当てにしない）。
- **復元不可時は ProjectMode フォールバック + 警告**。

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: なし（新サービスの追加。既存 app/CLI/LSP の挙動は変えない）。
- ドキュメント更新: reverse レシピの新規 docs ページ。`docs/concepts` 等の変更は不要。
- テスト・examples への影響: なし（新規 AT のみ追加）。

## 決めたこと（旧・未解決の問い）

壁打ちで以下を確定した:

- **URL 長**: 実リバース `.krs`（Dify, ~12KB）の実測で圧縮後 ~5k 文字。全モダンブラウザで余裕があり、v1 は inline で割り切る。溢れた場合の案内（Phase 2 の resolver 等）は当面不要。
- **multi-file**: import を解決した**単一の合成 `.krs`** にしてから inline 化する（仮想 FS は使わない）。Phase 1 スコープに含める。
- **静的 SVG のビュー**: **全ビューを返す**（ビュー指定クエリ、デフォルト `system` トップ）。
- **Phase 2 / 3**: 本ドキュメントには抱えず、`/<owner>/<repo>` resolver と editor + PR 還元ループを **GitHub Discussions（Ideas）にアイデアとして記録**する（MVP 外のため Issue 化はしない）。Phase 1 は karasu app 内で完結する。
