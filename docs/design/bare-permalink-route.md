# bare `/<owner>/<repo>@<ref>` permalink route（`/r/` prefix の除去）

- **日付**: 2026-08-01
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#1961](https://github.com/kompiro/karasu/issues/1961)（親: [#1828](https://github.com/kompiro/karasu/issues/1828) / エピック [#1826](https://github.com/kompiro/karasu/issues/1826)）
  - 関連 ADR: [ADR-1828](../adr/1828-repo-backed-ref-pinned-permalink.md)（repo-backed + ref-pinned permalink。本 doc はその「決着した論点 #4 route precedence」を再開する）、[ADR-1827](../adr/1827-permalink-deep-element.md)、[ADR-1783](../adr/1783-karasu-nest-hosted-preview.md)、[ADR-9017](../adr/9017-cloudflare-deployment-and-byok-ai.md)
  - 関連 TPL: [TPL-1827](../test-perspectives/TPL-1827-deep-link-anchor-cross-surface-parity.md)、[TPL-1480](../test-perspectives/TPL-1480-consistency-check-triggers-on-both-sides.md)、[TPL-168](../test-perspectives/TPL-168-trust-boundary-input-validation.md)、本 PR で起こす proactive [TPL-1961](../test-perspectives/TPL-1961-catch-all-route-inverts-default.md)
  - コード: `functions/r/[[path]].ts`、`packages/app/src/render/repo-permalink.ts`、`packages/app/public/_redirects`、`packages/app/src/hooks/useProjectNavigation.ts`

## 背景・課題

ADR-1828 が定めた repo-backed permalink の URL 形は `…/r/<owner>/<repo>[/<path>][@<ref>]` で、`/r/` prefix が付いている。design doc が本来目指していたのは prefix なしの `…/<owner>/<repo>@<sha>` だったが、実装（PR #1945）時点で「Cloudflare Pages では root の catch-all Function が静的アセットより **先に** 走るため、bare な 2-segment catch-all は `/s`・`/render`・SPA ルートを丸ごと shadow してしまう」と判断し、prefix で route を隔離した。ADR-1828 はこれを「#1961 で別途検討」として明示的に後続化している。

`/r/` は今日動いており、機能上の不足はない。#1961 が問うのは **URL の見栄え**（GitHub 風の bare な `owner/repo@sha`）だけである。したがって本 doc の役割は「やる／やらない」を美観だけで決めることではなく、**当時 shadow を恐れて避けた route が本当に不可能なのか、可能ならどんな代償が付くのかを実測で確定させる**ことにある。

## 現状（インベントリ）

nest deployment（`karasu.kompiro.dev` / `karasu.pages.dev`、Cloudflare Pages、`wrangler.toml` の `pages_build_output_dir = packages/app/dist`）が今日応答する経路:

| 経路 | 実体 | 備考 |
| --- | --- | --- |
| `/` | 静的 `index.html` | SPA エントリ |
| `/assets/*` | 静的（**186 ファイル**） | Monaco 由来の chunk が大半 |
| `/fonts/*`, `/favicon.svg`, `/logo.svg`, `/karasu-logo-1200w.png` | 静的 | `/render` の PNG 用フォントを含む |
| `/s` | Function `functions/s.ts` | share page（OGP + human bounce） |
| `/render` | Function `functions/render.ts` | SVG / PNG レンダリング |
| `/r/<owner>/<repo>…` | Function `functions/r/[[path]].ts` | repo-backed permalink resolver |
| `/projects/<id>` | **SPA ルート（2 セグメント）** | `useProjectNavigation.ts` の `PROJECT_PATH_RE = /^\/projects\/([^/]+)/` |
| その他すべて | `_redirects` の `/* /index.html 200` | SPA fallback |

**`/projects/<id>` の存在が本件の核心**である。これは pushState で作られるが、リロード・ブックマーク・共有時にはサーバへ到達する実ルートであり、形が `/<owner>/<repo>` と完全に同型である。ADR-1828 執筆時に想定されていた「SPA ルート」は具体的にはこれを指す。

## 制約・前提

- **後方互換**: すでに公開済みの `/r/…` permalink を壊さない（#1961 本文の要求）。ADR の `permalink[].short` に貼られたリンクを含む。
- **stateless 原則**（ADR-1783）: 新しい永続ストアを作らない。cache は Cache API の ephemeral に留める。
- **hot path で GitHub API を叩かない**（ADR-1828）: ref 解決は `raw.githubusercontent.com/<owner>/<repo>/HEAD/…` で済ませる。
- **Functions 実行回数**: Cloudflare Pages Functions は invocation 課金・制限がある。全リクエストを Worker に通す構成はコスト面で受け入れられない。
- **out of scope**: private repo（#1960）、deep anchor 文法の変更（ADR-1827 / `docs/spec/permalink.md` のまま）、shortener（taka）側の形。

## PoC（実測）

### 検証方法

`wrangler pages dev packages/app/dist`（wrangler 4.118.0 / workerd 1.20260730.1、実 Pages ルーティング実装）を worktree 内で起動し、`curl` で経路ごとの応答を観測した。PoC 用に以下を追加した（**本 PR には含めない** — 検証済みコードは「実装の指針」に転記する）:

- `functions/[[path]].ts` — root catch-all。permalink 形でなければ `context.next()` で静的アセット側へ差し戻す。差し戻し時に `x-karasu-bare-guard: fallthrough` ヘッダを付け、「Function が起動して辞退した」のか「そもそも起動していない」のかを外から判別できるようにした。
- `packages/app/public/_routes.json` — `include: ["/*"]` + 静的パス・`/projects/*` の `exclude`。
- guard は 2 変種を `KARASU_BARE_GUARD` binding で切り替え: `shape`（`@<ref>` 任意。`/r/` と同じ受理範囲）と `at`（`@<ref>` 必須）。

再現手順:

```
pnpm add -w -D wrangler
pnpm --filter @karasu-tools/core run build && pnpm --filter @karasu-tools/app run build
npx wrangler pages dev packages/app/dist --port 8788 --binding KARASU_BARE_GUARD=at
```

### 結果 1: bare route は成立する

`@`-required guard + `_routes.json` 構成での実測（SHA は `03e906d7259d440b2a59855b5459da734a0adb30`）:

| リクエスト | 結果 | 期待どおりか |
| --- | --- | --- |
| `/kompiro/karasu/examples/en/hato/index.krs@<sha>` | `302 → /s?s=lVZdb9s2…` | ✅ bare が解決する |
| `/r/kompiro/karasu/examples/en/hato/index.krs@<sha>` | `302 → /s?s=lVZdb9s2…`（同一 payload） | ✅ `/r/` も同時に生きる |
| `/` , `/favicon.svg` , `/logo.svg` , `/fonts/…` | `200` 静的 | ✅ |
| `/s` , `/render` | `400 Missing 's' query parameter.` | ✅ 兄弟 Function が catch-all に勝つ |
| `/projects/my-project` | `200` SPA | ✅ |
| `/nope` , `/nope/deeper` | `200` SPA fallback | ✅ |
| `/kompiro/karasu`（`@` なし） | `200` SPA | 仕様どおり（後述） |

**bare route は技術的に可能**。しかも `/r/` と併存でき、リダイレクトによる余計な hop も要らない。ADR-1828 が避けた「shadow」は、次の 2 つの仕組みで回避できる。

### 結果 2: `context.next()` は静的アセットにも SPA fallback にも正しく戻る

root catch-all の中で `context.next()` を返すと、静的アセットがそのまま返り、存在しないパスは `_redirects` の SPA fallback（`index.html` 200）に落ちる。`x-karasu-bare-guard` ヘッダ付きで `/nope` が `200 index.html` を返したことで「Function が起動 → 辞退 → SPA」の経路が成立していることを確認した。**catch-all の設置は SPA の全滅を意味しない** — これが ADR-1828 時点で検証されていなかった前提である。

### 結果 3: 手書き `_routes.json` は honor される（コスト面で必須）

`functions/` がある場合 Pages は `_routes.json` を自動生成するが、出力ディレクトリに手書きのものを置くとそちらが使われる。実測:

| 構成 | `/favicon.svg` | `/assets/<chunk>.js` | `/projects/my-project` | `/nope` |
| --- | --- | --- | --- | --- |
| `_routes.json` なし | Function 起動 | **Function 起動** | Function 起動 | Function 起動 |
| `_routes.json` あり（exclude 済み） | 起動せず | **起動せず** | 起動せず | Function 起動（辞退） |

`_routes.json` を置かないと **186 個のアセット chunk すべてが Worker invocation を消費する**。bare route は「Function を 1 個足す」話ではなく「`_routes.json` を自前管理し始める」話であり、これが最大の恒久コストである。なお `include: ["/*"]` のままなので、**新しい Function を足しても include 漏れは起きない**（メンテが要るのは exclude 側だけ）。

### 結果 4: guard の受理範囲を誤ると既定が反転する

`shape` 変種（`@` 任意、`/r/` と同じ受理範囲）での実測:

| リクエスト | `shape` guard | `at` guard |
| --- | --- | --- |
| `/nope/deeper` | **`404 No .krs found at nope/deeper@HEAD`** | `200` SPA fallback |
| `/docs/getting-started` | **`404 No .krs found at docs/getting-started@HEAD`** | `200` SPA fallback |

`@` を要求しない bare catch-all は、**「未知の 2 セグメントパス = SPA」という既定を「未知の 2 セグメントパス = GitHub への repo 照会」に反転させる**。`/projects/*` のような既知ルートは予約リストで守れるが、守るべき対象が「今ある SPA ルート」ではなく「今後増えるすべての SPA ルート」になる点が問題で、これは恒久的な設計税になる。

`@` を必須にすると判別子が URL 内に明示的に存在するため、この税がほぼゼロになる。`@` を含む SPA ルートは現在も将来も想定しにくい（`/projects/<id>` の id は OPFS のプロジェクト id）。

### 結果 5: 実装上の落とし穴

- **percent-encoding**: `url.pathname` は `%40` を復号しない。`/r/` は Pages が復号済みの `params.path` を渡すため無意識に救われていたが、bare guard を `url.pathname` に直接当てると `/<owner>/<repo>%40<sha>` が判別子 `@` に一致せず **黙って SPA に落ちる**。guard の前に `decodeURIComponent` を通すことで解消することを実測で確認した（修正後 `%40` 形も `302` になる）。
- **`caches.default`**: 現行 `/r/` は Cache API で 302 をキャッシュしている。bare 側にも同じロジックが要る（同一内容が 2 つのキャッシュキーを持つが、ephemeral なので許容）。
- **`_redirects` の local 警告**: `wrangler pages dev` は `/* /index.html 200` を "Infinite loop detected" として無視する。それでも fallback は効いた（アセットサーバの not-found 処理）。local と production で SPA fallback の経路が微妙に違うため、**この 1 点だけは本番 preview deployment で確認が要る**。
- **`adr:check-permalinks` は route 形に非依存**: `@kompiro/adr-tools` の `checkRepoBackedPin` は `hostname` の allowlist 照合と `pathname` の最後の `@` しか見ない（`dist/cli.js`）。bare 形でも `@<40-hex-sha>` 推奨検証はそのまま効くので、adr-tools 側の変更は不要。

## 検討した選択肢

### 案1: bare catch-all（`@<ref>` 任意 — `/r/` と同じ受理範囲）

root catch-all が `<owner>/<repo>[/<path>][@<ref>]` 形すべてを受ける。`/r/` は別名として残す。

**メリット**

- `/r/` と bare が完全に等価。説明が「prefix は省略可」の 1 行で済む。

**デメリット**

- 結果 4 のとおり既定が反転する。未知の 2 セグメントパスが SPA fallback ではなく GitHub 404 になる。
- 予約リスト（`projects`, `docs`, …）の維持が、SPA ルートを増やすたびに発生する恒久税になる。しかも破ったときの症状が「新ルートが 404 になる」という遠い場所での失敗で、原因に辿り着きにくい。

### 案2: bare catch-all（`@<ref>` **必須**）+ `/r/` は ref-less/discovery 用に存続

- `…/<owner>/<repo>[/<path>]@<ref>` — bare。`@` が判別子なので SPA ルートと衝突しない。
- `…/r/<owner>/<repo>[/<path>][@<ref>]` — 現行のまま。`@` を省いた「今の default branch を見る」形はこちらだけ。

**メリット**

- 実測で SPA・静的・fallback・兄弟 Function のすべてが今日と同じ挙動のまま（結果 1）。
- 既定が反転しない。予約リストは defense-in-depth に格下げでき、設計税がほぼ消える。
- ADR-1828 が別途規約で担保しようとしていた「ADR permalink は `@<sha>` で pin する」が、**URL 文法そのものに埋まる**。見栄えのよい短い形＝pin された形になる。
- 公開済み `/r/…` はそのまま動く（リダイレクト hop なし）。

**デメリット**

- 形が 2 つになり、能力が非対称（bare は ref 必須、`/r/` は任意）。ドキュメントで説明が要る。
- `_routes.json` の自前管理が始まる（案1 も同じ）。
- `@` を含む SPA ルートを将来作れなくなる（現実的な制約とは考えにくい）。

### 案3: 現状維持（`/r/` のみ）

**メリット**

- 追加コストゼロ。`_routes.json` を自前管理しない。root catch-all という「毎リクエストが通る関門」を作らない。

**デメリット**

- ADR-1828 が目指した URL 形に到達しない。#1961 は open のまま。

### 案4: bare を受けて `/r/…` へ 301 リダイレクト

**メリット**

- resolver の実体が 1 つに保たれる。

**デメリット**

- 301 → 302 → `/s` の 3 hop になる。permalink を踏むたびに余計な往復が増える。resolver を共有すれば実体の重複は案2 でも起きないので、hop を払う理由がない。

## 比較

| 観点 | 案1 bare（`@` 任意） | 案2 bare（`@` 必須） | 案3 現状維持 | 案4 bare→`/r/` 301 |
| --- | --- | --- | --- | --- |
| URL の見栄え（#1961 の目的） | ◎ | ◎ | ✕ | ◎ |
| SPA ルートとの衝突 | **✕ 既定が反転** | ◎ 衝突なし（実測） | ◎ | ✕ 案1 と同じ guard 問題 |
| 既存 `/r/` permalink | ◎ 併存 | ◎ 併存 | ◎ | ◎ |
| 恒久的な設計税 | 大（SPA ルート追加のたびに予約リスト） | 小（`_routes.json` の exclude のみ） | なし | 大 |
| リクエスト hop | 1 | 1 | 1 | 2 |
| `@<sha>` pin 規約との整合 | 中立 | ◎ 文法が規約を体現 | 中立 | 中立 |
| 実装量 | 中 | 中 | ゼロ | 中 |

## 現時点の方針

**案2 を採用する** — PoC で「bare route は可能」と「愚直な bare catch-all は既定を反転させる」の両方が実測で出た。`@<ref>` を bare 形の必須要素にすると、判別子が URL に明示されるので guard が SPA ルートの列挙に依存しなくなり、ADR-1828 が恐れた shadow が構造的に起きない。加えて ADR-1828 が「resolver ではなく上位規約で担保する」とした `@<sha>` pin が、短い bare 形を使う限り自動的に満たされる — 規約と文法が同じ方向を向く。

`/r/` は廃止せず、**ref-less な discovery 形の正規の置き場**として残す。これは後方互換のための deprecated alias ではなく役割分担であり、そう位置づけることで「いつ `/r/` を消すか」という宿題を作らずに済む。

一方で、これは **URL の美観のための変更であり、機能追加ではない**。`_routes.json` の自前管理と root catch-all という恒久コストを払う判断は、#1961 が low priority と自認していることと突き合わせて決める価値がある。採用しない（案3）という結論も本 doc の実測結果と矛盾しない。

### 実装の指針

実装は 1 PR で収まる規模のため、スライス分割はしない。


1. `functions/[[path]].ts` を追加する。`onRequest` で以下を行う:
   - `decodeURIComponent(url.pathname)` を **guard の前に** 通す（結果 5）。復号に失敗したら `context.next()`（SPA に 404 させる）。
   - `looksLikeBarePermalink()`: `@` の存在必須 / `@` 以降が非空 / 2 セグメント以上 / owner・repo が `repo-permalink.ts` の `OWNER_RE`・`REPO_RE` に一致 / 先頭セグメントが予約リストに無い。
   - 非該当・非 GET は `context.next()` で差し戻す。
   - 該当時は `resolveRepoPermalink()` に渡し、`functions/r/[[path]].ts` と同じ 302 + `Cache-Control` + `caches.default` 処理を行う。
2. **302 生成と cache 処理を `functions/r/[[path]].ts` と共有する。** 現行の `/r/` handler の本体を `packages/app/src/render/repo-permalink.ts` 側（または隣接モジュール）の関数に切り出し、両 Function を薄い adapter にする。`Cache-Control` の分岐や `boundFetch` の "Illegal invocation" 回避（`functions/r/[[path]].ts` のコメント参照）を二重管理しない。
3. `packages/app/public/_routes.json` を追加する。`include: ["/*"]`、`exclude` は `/`, `/index.html`, `/assets/*`, `/fonts/*`, root の静的ファイル（`favicon.svg` / `logo.svg` / `karasu-logo-1200w.png`）、`/projects/*`。上限は 100 ルール・各 100 文字。
4. 予約リストと `_routes.json` の `exclude` を **1 箇所から導出**し、SPA ルートの追加が両方に反映されないと落ちるようにする（proactive TPL-1961）。最低でも `looksLikeBarePermalink` の unit test に `/projects/<id>` を含む「SPA が所有する経路」の表を置き、SPA 側のルート定義（`PROJECT_PATH_RE`）と突き合わせる。
5. ドキュメント更新: `docs/spec/permalink.md`（route 形の節を足すなら proactive TPL の紐付けも同 PR — CLAUDE.md の spec 改訂ルール）、`README.md` / `README.ja.md` の permalink 例、`docs/adr/1828-…` は書き換えず新 ADR から `refines` で参照する。
6. AT: `docs/acceptance/` に新規ファイル。TC は:
   - bare `@<sha>` が `/s?s=…` へ 302 し、開いた画面が `/r/` 形と同一であること
   - `/r/<owner>/<repo>@<sha>`（公開済み形）が引き続き 302 すること
   - `/projects/<id>` を直接リロードして SPA が開くこと
   - `/s` / `/render` / 静的アセットが今日と同じ応答であること
   - 存在しないパス（1 セグメント / 2 セグメント）が SPA fallback すること
   - **手動**: preview deployment（本番 Pages）で SPA fallback と `/assets/*` の Function 非起動を確認する（`wrangler pages dev` は `_redirects` の扱いが本番と異なる — 結果 5）
7. ADR 昇格: 実装完了後、`docs/adr/1961-bare-permalink-route.md` として昇格し（`refines: [ADR-1828]`）、本 Design Doc は同 PR で削除する。

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: なし（`/r/…` は併存、SPA・静的・`/s`・`/render` は実測で不変）。
- 新規リスク: `_routes.json` を自前管理し始めるため、`exclude` に載ったパスは **Function から永久に見えなくなる**。将来 `/projects/…` を Function で処理したくなったら exclude を外す必要がある。
- ドキュメント更新: `docs/spec/permalink.md`、`README*.md`、ADR-1828 を参照している箇所。
- テスト・examples への影響: なし。

## 未解決の問い / 決めないこと

- **そもそも払う価値があるか**: 案2 は技術的に安全だが、得られるのは URL の見栄えだけである。`_routes.json` の自前管理と root catch-all の恒久コストと引き換えにするか否かは、レビューでの判断に委ねる（案3 も妥当な結論）。
- **どちらを canonical と呼ぶか**: bare と `/r/` の両方が動くとき、ADR の `permalink[].short` に貼るのはどちらかを規約で決めるか、決めずに放置するか。決めるなら `adr:check-permalinks` に足すのが自然だが、adr-tools 側の変更が要るので本 doc では決めない。
- **短縮 URL（taka）側**: 短縮後の形は本 doc の対象外。
- **private repo（#1960）との相互作用**: private 対応が入ったとき bare 形も同じ扱いにするかは #1960 側で決める。
