# bare `/<owner>/<repo>[@<ref>]` permalink route（`/r/` prefix の除去）

- **日付**: 2026-08-02
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#1961](https://github.com/kompiro/karasu/issues/1961)（親: [#1828](https://github.com/kompiro/karasu/issues/1828) / エピック [#1826](https://github.com/kompiro/karasu/issues/1826)）
  - 関連 ADR: [ADR-1828](../adr/1828-repo-backed-ref-pinned-permalink.md)（repo-backed + ref-pinned permalink。本 doc はその「決着した論点 #4 route precedence」を再開する）、[ADR-1827](../adr/1827-permalink-deep-element.md)、[ADR-1990](../adr/1990-karasu-nest-pivot-server-reverse.md)（**nest ピボット — 同じ URL 名前空間を要求する。「ADR-1990 との境界」節を参照**）、[ADR-1783](../adr/1783-karasu-nest-hosted-preview.md)（ADR-1990 が supersede 済み）、[ADR-9017](../adr/9017-cloudflare-deployment-and-byok-ai.md)
  - 関連 TPL: [TPL-1827](../test-perspectives/TPL-1827-deep-link-anchor-cross-surface-parity.md)、[TPL-1480](../test-perspectives/TPL-1480-consistency-check-triggers-on-both-sides.md)、[TPL-168](../test-perspectives/TPL-168-trust-boundary-input-validation.md)、本 PR で起こす proactive [TPL-1961](../test-perspectives/TPL-1961-catch-all-route-inverts-default.md)
  - コード: `functions/r/[[path]].ts`、`packages/app/src/render/repo-permalink.ts`、`packages/app/public/_redirects`、`packages/app/src/hooks/useProjectNavigation.ts`

## 背景・課題

ADR-1828 が定めた repo-backed permalink の URL 形は `…/r/<owner>/<repo>[/<path>][@<ref>]` で、`/r/` prefix が付いている。design doc が本来目指していたのは prefix なしの `…/<owner>/<repo>` だったが、実装（PR #1945）時点で「Cloudflare Pages では root の catch-all Function が静的アセットより **先に** 走るため、bare な 2-segment catch-all は `/s`・`/render`・SPA ルートを丸ごと shadow してしまう」と判断し、prefix で route を隔離した。ADR-1828 はこれを「#1961 で別途検討」として明示的に後続化している。

`/r/` は今日動いており、機能上の不足はない。#1961 が問うのは URL の形だけである。求める到達点は **`github.com/<owner>/<repo>` と同じ手触り** — つまり:

- `karasu.kompiro.dev/<owner>/<repo>` と打てば **default branch の HEAD** が開く。読者に commit SHA を調べさせない。
- `@<ref>` を足したときだけ、その ref に固定される。

**ref 省略が第一級であること**が本 doc の必須要件である。SHA を要求する形は「その決定時点の構造を指す」ADR permalink には正しいが、人が手で打つ・口頭で伝える discovery の導線としては使えない。

## 現状（インベントリ）

nest deployment（`karasu.kompiro.dev` / `karasu.pages.dev`、Cloudflare Pages、`wrangler.toml` の `pages_build_output_dir = packages/app/dist`）が今日応答する経路:

| 経路 | 実体 | 備考 |
| --- | --- | --- |
| `/` | 静的 `index.html` | SPA エントリ |
| `/assets/*` | 静的（**186 ファイル**） | Monaco 由来の chunk が大半 |
| `/fonts/*`, `/favicon.svg`, `/logo.svg`, `/karasu-logo-1200w.png` | 静的 | `/render` の PNG 用フォントを含む |
| `/s` | Function `functions/s.ts` | share page（OGP + human bounce） |
| `/render` | Function `functions/render.ts` | SVG / PNG レンダリング |
| `/r/<owner>/<repo>…` | Function `functions/r/[[path]].ts` | repo-backed permalink resolver。**すでに ref 省略 = HEAD** |
| `/projects/<id>` | **SPA ルート（2 セグメント）** | `useProjectNavigation.ts` の `PROJECT_PATH_RE = /^\/projects\/([^/]+)/` |
| その他すべて | `_redirects` の `/* /index.html 200` | SPA fallback |

**`/projects/<id>` の存在が本件の核心**である。pushState で作られるが、リロード・ブックマーク・共有時にはサーバへ到達する実ルートであり、形が `/<owner>/<repo>` と完全に同型である。ADR-1828 執筆時に想定されていた「SPA ルート」は具体的にはこれを指す。

なお ref 省略 = HEAD の解決自体は `/r/` で既に動いており（`raw.githubusercontent.com/<owner>/<repo>/HEAD/…` が GitHub API hop なしで default branch を解決する）、本件で新たに作る必要はない。**本 doc が解くのは resolver ではなく route の切り分けだけ**である。

## 制約・前提

- **ref 省略が第一級**（本 doc の必須要件）: `…/<owner>/<repo>` が default branch を開く。`@<ref>` は任意の pin 手段。
- **後方互換**: すでに公開済みの `/r/…` permalink を壊さない（#1961 本文の要求）。ADR の `permalink[].short` に貼られたリンクを含む。
- **未知パスの既定を変えない**: 今日 SPA fallback に落ちているパスは、明日も SPA fallback に落ちる。
- **Pages app 面は stateless のまま**: ADR-1990 は ADR-1783 を supersede したが、それは nest の **service 面**に限った反転であり、inline 共有・`/render`・静的 Pages app は「引き継ぐ決定」として無傷である。本 doc が触るのは Pages app 面なので、ここに永続ストアを作らない制約は生きている（cache は Cache API の ephemeral に留める）。生成 `.krs` の SHA-keyed cache は ADR-1990 の別 Workers サービス側の話。
- **hot path で GitHub API を叩かない**（ADR-1828）: ref 解決は `raw.githubusercontent.com` で済ませる。REST API（repo 存在確認など）は rate limit を hot path に持ち込むので使わない。
- **Functions 実行回数**: Cloudflare Pages Functions は invocation 課金・制限がある。全リクエストを Worker に通す構成はコスト面で受け入れられない。
- **out of scope**: private repo（#1960）、deep anchor 文法の変更（ADR-1827 / `docs/spec/permalink.md` のまま）、shortener（taka）側の形。

## PoC（実測）

### 検証方法

`wrangler pages dev packages/app/dist`（wrangler 4.118.0 / workerd 1.20260730.1、実 Pages ルーティング実装）を worktree 内で起動し、`curl` で経路ごとの応答とレイテンシを観測した。PoC 用に以下を追加した（**本 PR には含めない** — 検証済みの内容は「実装の指針」に転記する）:

- `functions/[[path]].ts` — root catch-all。permalink 形でなければ `context.next()` で静的アセット側へ差し戻す。差し戻し時に `x-karasu-bare-guard` ヘッダを付け、「Function が起動して辞退した」のか「そもそも起動していない」のかを外から判別できるようにした。
- `packages/app/public/_routes.json` — `include: ["/*"]` + 静的パス・`/projects/*` の `exclude`。
- guard は 3 変種を `KARASU_BARE_GUARD` binding で切り替え: `shape`（ref 省略可・素の形）、`at`（`@<ref>` 必須）、`fallback`（ref 省略可 + 後述の deterministic-negative fallthrough）。

再現手順:

```
pnpm add -w -D wrangler
pnpm --filter @karasu-tools/core run build && pnpm --filter @karasu-tools/app run build
npx wrangler pages dev packages/app/dist --port 8788 --binding KARASU_BARE_GUARD=fallback
```

### 結果 1: bare route 自体は成立する

`/kompiro/karasu/examples/en/hato/index.krs@<sha>` は `/r/…` と同一の payload へ 302 し、`/r/` 形も同時に生き続けた。兄弟 Function（`/s`・`/render`・`/r/[[path]]`）は root catch-all に勝ち、`/`・静的アセットも従来どおり返る。**catch-all の設置は SPA の全滅を意味しない** — これが ADR-1828 時点で検証されていなかった前提である。リダイレクト hop も不要で、bare と `/r/` は素直に併存する。

### 結果 2: `context.next()` は静的アセットにも SPA fallback にも正しく戻る

root catch-all の中で `context.next()` を返すと、静的アセットがそのまま返り、存在しないパスは `_redirects` の SPA fallback（`index.html` 200）に落ちる。`/nope` が `x-karasu-bare-guard` ヘッダ付きで `200 index.html` を返したことで、「Function が起動 → 辞退 → SPA」の経路が成立していることを確認した。**この差し戻しは GitHub への fetch を await した後でも機能する**（結果 4 の土台）。

### 結果 3: 手書き `_routes.json` は honor される（コスト面で必須）

`functions/` がある場合 Pages は `_routes.json` を自動生成するが、出力ディレクトリに手書きのものを置くとそちらが使われる。実測:

| 構成 | `/favicon.svg` | `/assets/<chunk>.js` | `/projects/my-project` | `/nope` |
| --- | --- | --- | --- | --- |
| `_routes.json` なし | Function 起動 | **Function 起動** | Function 起動 | Function 起動 |
| `_routes.json` あり（exclude 済み） | 起動せず | **起動せず** | 起動せず | Function 起動（辞退） |

`_routes.json` を置かないと **186 個のアセット chunk すべてが Worker invocation を消費する**。bare route は「Function を 1 個足す」話ではなく「`_routes.json` を自前管理し始める」話であり、これが最大の恒久コストである。なお `include: ["/*"]` のままなので、**新しい Function を足しても include 漏れは起きない**（メンテが要るのは exclude 側だけ）。

### 結果 4: 素の shape guard は既定を反転させるが、fallthrough で戻せる

ref 省略を許す（= `@` を判別子に使えない）以上、guard は「形が `<owner>/<repo>` に見えるか」しか判定できない。素朴にそれだけで受けると（`shape` 変種）:

| リクエスト | `shape` guard | 期待 |
| --- | --- | --- |
| `/nope/deeper` | **`404 No .krs found at nope/deeper@HEAD`** | SPA fallback |
| `/docs/getting-started` | **`404 No .krs found at docs/getting-started@HEAD`** | SPA fallback |

**「未知の 2 セグメントパス = SPA」という既定が「= GitHub への repo 照会」に反転する。**

`fallback` 変種はこれを解く。resolver が **deterministic な negative**（400「`.krs` パスではない」/ 404「そこに `.krs` が無い」）を返し、かつ URL に明示的な `@<ref>` が無いなら、**エラーを返さず `context.next()` で SPA へ差し戻す**。transient な失敗（502 upstream / 500）は差し戻さずそのまま出す — GitHub 障害時に SPA を出すと、実在する permalink が白紙のエディタの裏に隠れてしまうため。

実測:

| リクエスト | 結果 | 判定 |
| --- | --- | --- |
| `/kompiro/karasu/examples/en/hato/index.krs`（**ref 省略**） | `302 → /s?s=…` | ✅ GitHub 同様、HEAD が開く |
| `/kompiro/karasu/examples/en/hato/index.krs@<sha>` | `302 → /s?s=…` | ✅ pin も効く |
| `/nope/deeper` | `200` SPA | ✅ 既定が保たれる |
| `/docs/getting-started/intro` | `200` SPA | ✅ |
| `/guide/boundary/design` | `200` SPA | ✅ |
| `/kompiro/karasu/docs/foo.txt` | `200` SPA | ✅ |
| `/projects/my-project` | `200` SPA | ✅ |
| `/nope` | `200` SPA | ✅ |
| `/kompiro/karasu/examples/en/hato/nope.krs@<sha>`（**明示 ref**） | `404 No .krs found at …` | ✅ permalink 意図には診断を出す |

「明示 `@<ref>` があればエラーを出す / 無ければ黙って SPA」という非対称が要点で、**`@` を必須にせずに `@` を意図のシグナルとして使う**。読者が SHA を調べる必要はどこにも無い。

### 結果 5: fallthrough のレイテンシ代償は狭い

`context.next()` に落ちる前に GitHub を叩くので、未知パスが遅くなる。3 回計測（ローカル dev サーバ、GitHub raw への実 fetch を含む）:

| パスの種類 | 実測 | GitHub への fetch |
| --- | --- | --- |
| `/`, `/projects/my-project`（`_routes.json` で exclude） | 3–6 ms | 0 |
| `/nope`（1 セグメント → guard が即却下） | 2–5 ms | 0 |
| `/docs/getting-started/intro`, `/guide/boundary/design`（`.krs` で終わらない 3+ セグメント → parse が**ローカルで** 400） | 2–4 ms | **0** |
| `/nope/deeper`, `/kompiro/karasu`（ref 省略のちょうど 2 セグメント） | **110–430 ms** | 2（`index.krs` → `karasu.krs`） |
| 解決成功（`…/index.krs`） | 37–82 ms | 1–2 |

**遅くなるのは「ref 省略のちょうど 2 セグメント」だけ**である。`/docs/getting-started/intro` のような多くの SPA ルート候補は、`.krs` サフィックス要件によって GitHub に触れる前にローカルで弾かれる。既知の 2 セグメントルート（`/projects/*`）は `_routes.json` の exclude が 4 ms 側に留める。露出範囲は当初の懸念よりかなり狭い。

残る代償は、**未知の 2 セグメントパスへのアクセスが GitHub raw への 2 fetch を発生させる**こと。クローラや scanner が増幅させうるので、negative 結果も Cache API に短命でキャッシュする必要がある（実装の指針 5）。

### 結果 6: 実装上の落とし穴

- **percent-encoding**: `url.pathname` は `%40` を復号しない。`/r/` は Pages が復号済みの `params.path` を渡すため無意識に救われていたが、bare guard を `url.pathname` に直接当てると `%40` 形の pin が判別されない。guard の前に `decodeURIComponent` を通すことで解消することを実測で確認した。
- **`caches.default`**: 現行 `/r/` は Cache API で 302 をキャッシュしている。bare 側にも同じロジックが要る。
- **`_redirects` の local 警告**: `wrangler pages dev` は `/* /index.html 200` を "Infinite loop detected" として無視する。それでも fallback は効いた（アセットサーバの not-found 処理）。local と production で SPA fallback の経路が微妙に違うため、**この 1 点だけは本番 preview deployment で確認が要る**。
- **`adr:check-permalinks` は route 形に非依存**: `@kompiro/adr-tools` の `checkRepoBackedPin` は `hostname` の allowlist 照合と `pathname` の最後の `@` しか見ない（`dist/cli.js`）。bare 形でも `@<40-hex-sha>` 推奨 warning はそのまま効くので、adr-tools 側の変更は不要。
- **karasu 自身は短い形を持たない**: ref 省略の最短形 `…/<owner>/<repo>` が成立するのは repo root に `index.krs` か `karasu.krs` がある場合だけ（`DEFAULT_ENTRIES`）。karasu repo には無いので、自リポジトリを指す例は `…/kompiro/karasu/examples/en/hato/index.krs` になる。ショーケース URL を短くしたいなら repo root に `index.krs` を置く別判断が要る。

## ADR-1990 との境界（未解決 — 本 doc 単独では決められない）

[ADR-1990](../adr/1990-karasu-nest-pivot-server-reverse.md)（2026-07-30 決定済み、gate 通過）は nest を「GitHub App で任意の repo を読み、**server-side で AI reverse して `.krs` を生成し**、返すと同時に図示する hosted サービス」へ転換すると決めている。その動機の 1 つが、まさに本 doc の resolver の前提である:

> **「repo に `.krs` が commit されている」前提** — repo-backed permalink（ADR-1828）の resolver は committed `.krs` を要求するが、それを持つ repo は現実にはほぼ無い。

そして子 Issue [#2227](https://github.com/kompiro/karasu/issues/2227) の scope には次がある:

> Routing: repo URL → cached `.krs` if present, **otherwise trigger the reverse pipeline (#1993)** → render

つまり **`/<owner>/<repo>` という URL 名前空間を、2 つの面が同時に要求している**:

| | 面 | 入力 | miss したとき |
| --- | --- | --- | --- |
| 本 doc（#1961 / ADR-1828） | 静的 Pages app の Function | repo に commit 済みの `.krs` | **SPA へ差し戻す**（案5） |
| ADR-1990 / #2227 | **別の Workers サービス**（decision 5） | 任意の repo（`.krs` 不要） | **reverse pipeline を起動して生成する** |

**案5 の deterministic-negative fallthrough は、生成が拾うべきケースをちょうど飲み込む。** ref 省略の `…/<owner>/<repo>` が 404 になるのは「その repo にはまだ `.krs` が無い」ときで、ADR-1990 の世界ではそれは失敗ではなく**生成のトリガ**である。本 doc の推奨をそのまま実装すると、その入口が黙って SPA に化ける。

この境界は本 doc の範囲を超える。決めるべきは次の 3 点で、いずれも #1961 単独では決められない:

1. **ホスト**: `karasu.kompiro.dev/<owner>/<repo>` を最終的に持つのは Pages app と nest サービスのどちらか。ADR-1990 decision 5 は secret / state / webhook を Pages app に同居させないと決めているので、生成を伴う面は別サービスに置かれる。両者が同じ hostname を分け合うのか、サービスを別 hostname に置くのかは未決。
2. **miss 時の振る舞い**: SPA へ差し戻す（案5）／生成を提案する UI を返す／生成を起動する、のいずれか。生成起動は同期では成立しない — spike 実測で **85 ファイルの最小 repo でも 12〜19 分**（ADR-1990 未決事項）であり、302 の裏に隠せる時間ではない。非同期 job + 進捗ページという別の設計面が要る。
3. **ゼロ設定 vs リクエスト駆動**: ADR-1990 の売りは「App を入れる → 図が出る」ゼロ設定である。「利用者のリクエスト文（どの観点で見たいか）を入力に取る生成」は decision 4 の agentic reverse とは別の入力モードで、ADR-1990 には無い。

**本 doc の推奨（案5）は、この境界が決まるまでの Pages app 面の振る舞いとしては整合する** — 生成が別サービスに載るなら Pages app の miss は SPA で正しい。だが「同じ URL で生成まで通す」なら #1961 の実装は待つべきで、その場合の正しい順序は #2227 → #1961 である。**この依存関係は #1961 に status を付ける前に決着させる必要がある。**

## 検討した選択肢

### 案1: 素の bare catch-all（shape guard のみ）

形が `<owner>/<repo>` に見えたら resolver に渡し、解決できなければエラーを返す。

**メリット**

- 実装が単純。ref 省略も自然に通る。

**デメリット**

- 結果 4 のとおり既定が反転する。未知の 2 セグメントパスが SPA fallback ではなく GitHub 404 になる。
- 予約リストの維持が、SPA ルートを増やすたびに発生する恒久税になる。破ったときの症状は「新ルートだけ 404」で、原因は無関係に見える別ファイルにある。

### 案2: `@<ref>` を必須にする

bare 形は `…/<owner>/<repo>@<ref>` のみ受け、ref 省略形は `/r/` に残す。

**メリット**

- `@` が判別子になるので SPA ルートと構造的に排他。予約リストがほぼ不要。

**デメリット**

- **読者に ref を調べさせる**。手打ち・口頭伝達の discovery 導線として使えず、本 doc の必須要件を満たさない。
- 「短くて綺麗な形」と「ref 省略で気軽に開ける形」が別 URL に分かれ、覚えることが増える。

→ **却下**（要件不成立）。

### 案3: 現状維持（`/r/` のみ）

**メリット**

- 追加コストゼロ。`_routes.json` を自前管理しない。root catch-all という「毎リクエストが通る関門」を作らない。

**デメリット**

- ADR-1828 が目指した URL 形に到達しない。

### 案4: bare を受けて `/r/…` へ 301 リダイレクト

**メリット**

- resolver の実体が 1 つに保たれる。

**デメリット**

- 301 → 302 → `/s` の 3 hop になる。resolver 共有は案5 でも実現できるので、hop を払う理由がない。
- 判別の問題（案1 のデメリット）は解決しない。リダイレクト前に同じ guard が要る。

### 案5: bare catch-all（ref 省略可）+ deterministic-negative fallthrough

`@<ref>` は任意。形が合えば resolver に渡すが、**deterministic な negative（400 / 404）で明示 `@<ref>` が無いなら SPA へ差し戻す**。予約リストと `_routes.json` はレイテンシと多層防御のために残す。

**メリット**

- **GitHub と同じ手触り**: `…/<owner>/<repo>` で HEAD、`@<sha>` で pin。要件を満たす。
- 既定が反転しない（結果 4 で実測）。しかも予約リストが**完全でなくても壊れない** — 漏れた SPA ルートは fallthrough が拾う。予約リストは正しさの前提から、レイテンシ最適化と多層防御に格下げされる。
- 明示 `@<ref>` のときだけエラーを出すので、permalink を意図した読者は診断を受け取れる。
- 公開済み `/r/…` はそのまま動く（hop なし）。
- ADR-1828 の「resolver は permissive に保ち、immutability は上位規約（`adr:check-permalinks` の warn）で担保する」という philosophy と**同じ方向**。案2 が文法で規約を強制しようとしたのに対し、案5 は resolver を permissive なまま据え置く。

**デメリット**

- 未知の 2 セグメントパスが 110–430 ms かかる（結果 5）。negative cache が要る。
- 「repo は実在するが `.krs` が無い」と「そんなパスは無い」を区別せず、どちらも SPA を出す。区別には GitHub REST API hop が要り、ADR-1828 の制約に反するので採らない。
- `_routes.json` の自前管理が始まる（案1・案4 も同じ）。

## 比較

| 観点 | 案1 素の shape | 案2 `@` 必須 | 案3 現状維持 | 案4 301 | **案5 fallthrough** |
| --- | --- | --- | --- | --- | --- |
| ref 省略で HEAD（**必須要件**） | ◎ | **✕ 要件不成立** | ◎（`/r/` で） | ◎ | ◎ |
| SPA ルートとの衝突 | ✕ 既定が反転 | ◎ | ◎ | ✕ | ◎ 実測で衝突なし |
| 予約リストの正しさへの依存 | 大（漏れ = 404） | 小 | — | 大 | **小（漏れても SPA に落ちる）** |
| 未知パスのレイテンシ | 即 404 | 即 SPA | 即 SPA | 即 404 | 110–430 ms（2 セグメントのみ） |
| 既存 `/r/` permalink | ◎ 併存 | ◎ 併存 | ◎ | ◎ | ◎ 併存 |
| リクエスト hop | 1 | 1 | 1 | 2 | 1 |
| 実装量 | 中 | 中 | ゼロ | 中 | 中 |

## 現時点の方針

**案5 を採用する。** URL 形は次の 2 つで、どちらも同じ resolver に落ちる:

```
…/<owner>/<repo>[/<path>]           → default branch HEAD（GitHub と同じ手触り）
…/<owner>/<repo>[/<path>]@<ref>     → その ref に固定
…/r/<owner>/<repo>[/<path>][@<ref>] → 現行のまま（公開済みリンクの互換）
```

ref 省略を第一級にすると `@` を判別子に使えず、guard は形しか見られない。そこで判別を **guard から resolver の結果へ後ろ倒しする** — GitHub が「そこに `.krs` は無い」と確定的に答えたなら、それは permalink ではなかったのだから SPA へ返す。これで「未知パス = SPA」という既定が保たれ、しかも予約リストの完全性に正しさが依存しなくなる。予約リストと `_routes.json` は残すが、役割はレイテンシ最適化と多層防御であって、抜けても 404 にはならない。

代償はレイテンシで、**ref 省略のちょうど 2 セグメントのパスだけ** 110–430 ms かかる。`.krs` サフィックス要件のおかげで他の SPA ルート形はローカルで弾かれ、既知の 2 セグメントルートは `_routes.json` が守る。negative 結果を短命キャッシュすれば増幅も抑えられる。

`/r/` は廃止せず、**公開済みリンクの互換経路**として残す。bare と機能が完全に等価になるので「いつ消すか」の宿題は残るが、消さなくても害はない。

一方で、これは **URL の形のための変更であり、機能追加ではない**（ref 省略 = HEAD は `/r/` で既に動く）。`_routes.json` の自前管理・root catch-all・未知 2 セグメントパスのレイテンシという恒久コストを払う判断は、#1961 が low priority と自認していることと突き合わせて決める価値がある。**案3（やらない）も本 doc の実測と矛盾しない。**

### 実装の指針

実装は 1 PR で収まる規模のため、スライス分割はしない。

1. `functions/[[path]].ts` を追加する。`onRequest` で以下を行う:
   - `decodeURIComponent(url.pathname)` を **guard の前に** 通す（結果 6）。復号に失敗したら `context.next()`。
   - `looksLikeBarePermalink()`: 2 セグメント以上 / owner・repo が `repo-permalink.ts` の `OWNER_RE`・`REPO_RE` に一致 / 先頭セグメントが予約リストに無い。**`@` の有無は問わない。**
   - 非該当・非 GET は `context.next()` で差し戻す。
   - 該当時は `resolveRepoPermalink()` に渡す。`status === 200` なら 302。
   - **`(status === 400 || status === 404) && !pathname.includes("@")` なら `context.next()`** で SPA へ差し戻す。502 / 500 は差し戻さずそのまま返す（結果 4）。
2. **302 生成と cache 処理を `functions/r/[[path]].ts` と共有する。** 現行 `/r/` handler の本体を `packages/app/src/render/` 側の関数に切り出し、両 Function を薄い adapter にする。`Cache-Control` の分岐や `boundFetch` の "Illegal invocation" 回避（`functions/r/[[path]].ts` のコメント参照）を二重管理しない。
3. `packages/app/public/_routes.json` を追加する。`include: ["/*"]`、`exclude` は `/`, `/index.html`, `/assets/*`, `/fonts/*`, root の静的ファイル（`favicon.svg` / `logo.svg` / `karasu-logo-1200w.png`）、`/projects/*`。上限は 100 ルール・各 100 文字。
4. 予約リストと `_routes.json` の `exclude` を **1 箇所から導出**する。SPA のルート定義（現状 `PROJECT_PATH_RE` が持つ `/projects/`）を単一の出所とし、ルートを足したのに両方へ反映されないと落ちるテストを置く（proactive TPL-1961）。案5 では抜けても 404 にはならないが、抜ければ静かに 200 ms 遅くなるので、機械チェックは残す価値がある。
5. **negative fallthrough もキャッシュする。** 差し戻す `context.next()` の応答を `caches.default` に短い `s-maxage` で載せ、クローラが同じ未知パスを叩き続けても GitHub raw への fetch が増えないようにする。TTL は短く（`@<sha>` の 302 と違い、後から実在する repo になりうる）。
6. ドキュメント更新: `docs/spec/permalink.md`（route 形の節を足すなら proactive TPL の紐付けも同 PR — CLAUDE.md の spec 改訂ルール）、`README.md` / `README.ja.md` の permalink 例、`docs/guide/adr-permalinks.md`。ADR-1828 は書き換えず新 ADR から `refines` で参照する。
7. AT: `docs/acceptance/` に新規ファイル。TC は:
   - **ref 省略の bare**（`…/<owner>/<repo>/<path>.krs`）が default branch の内容で開くこと
   - bare `@<sha>` が pin された内容で開くこと
   - `/r/<owner>/<repo>@<sha>`（公開済み形）が引き続き 302 すること
   - 未知の 2 セグメントパスが SPA fallback すること（既定が反転していないこと）
   - 明示 `@<ref>` 付きの解決不能パスは **エラーを表示**すること（SPA に飲まれないこと）
   - `/projects/<id>` を直接リロードして SPA が開くこと
   - `/s` / `/render` / 静的アセットが今日と同じ応答であること
   - **手動**: preview deployment（本番 Pages）で SPA fallback と `/assets/*` の Function 非起動を確認する（`wrangler pages dev` は `_redirects` の扱いが本番と異なる — 結果 6）
8. ADR 昇格: 実装完了後、`docs/adr/1961-bare-permalink-route.md` として昇格し（`refines: [ADR-1828]`）、本 Design Doc は同 PR で削除する。

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: なし（`/r/…` は併存、SPA・静的・`/s`・`/render` は実測で不変）。
- 新規リスク: `_routes.json` を自前管理し始めるため、`exclude` に載ったパスは **Function から永久に見えなくなる**。将来 `/projects/…` を Function で処理したくなったら exclude を外す必要がある。
- 新規リスク: 未知の 2 セグメントパスが GitHub raw への fetch を発生させる（negative cache で緩和）。
- ドキュメント更新: `docs/spec/permalink.md`、`README*.md`、`docs/guide/adr-permalinks.md`、ADR-1828 を参照している箇所。
- テスト・examples への影響: なし。

## 未解決の問い / 決めないこと

- **ADR-1990 との URL 名前空間の分担**（最優先）: 「ADR-1990 との境界」節の 3 点。**#1961 に着手 status を付ける前に決着させる。** 生成が別 hostname / 別サービスに載るなら本 doc はこのまま進められるが、同じ URL で生成まで通すなら #2227 が先。
- **そもそも払う価値があるか**: 案5 は技術的に安全だが、得られるのは URL の形だけである（ref 省略 = HEAD は `/r/` で既に動く）。`_routes.json` の自前管理・root catch-all・未知 2 セグメントパスのレイテンシと引き換えにするかは、レビューでの判断に委ねる（案3 も妥当な結論）。
- **`DEFAULT_ENTRIES` を 1 つに絞るか**: ref 省略の 2 セグメント fallthrough は `index.krs` → `karasu.krs` の 2 fetch を払う。`karasu.krs` を落とせば半減するが ADR-1828 の既定を変えることになるため、本 doc では決めない。
- **karasu repo 自身に root `index.krs` を置くか**: 置けば `karasu.kompiro.dev/kompiro/karasu` が最短のショーケース URL になる（結果 6）。model の置き場所の判断なので別 Issue。
- **どちらを canonical と呼ぶか**: bare と `/r/` の両方が動くとき、ADR の `permalink[].short` に貼るのはどちらかを規約で決めるか。決めるなら `adr:check-permalinks` に足すのが自然だが adr-tools 側の変更が要るので本 doc では決めない。
- **短縮 URL（taka）側**: 短縮後の形は本 doc の対象外。
- **private repo（#1960）との相互作用**: private 対応が入ったとき bare 形も同じ扱いにするかは #1960 側で決める。
