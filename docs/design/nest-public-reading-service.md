# karasu-nest を public repository の読み手向けサービスにする — operator 限定 generate・リクエスト受付・nest 側の描画面

- **日付**: 2026-08-06
- **ステータス**: 検討中
- **関連**:
  - 親 Epic: [#1990](https://github.com/kompiro/karasu/issues/1990)（nest ピボット）
  - 関連 ADR: [ADR-1990](../adr/1990-karasu-nest-pivot-server-reverse.md)（ピボット。決定 3 コスト・決定 6 データ信頼）／[ADR-2262](../adr/2262-nest-intake-and-completion.md)（受付と完了通知。**本 doc は決定 1・2 を改訂する**）／[ADR-2249](../adr/2249-permalink-generation-seam.md)（permalink と生成の境界。**未決だったホスト URL の形を決める**）／[ADR-1994](../adr/1994-karasu-nest-free-tier-quota.md)（quota）／[ADR-1996](../adr/1996-karasu-nest-data-trust.md)（データ信頼）／[ADR-2259](../adr/2259-permalink-payload-cap.md)（inline payload 上限）
  - 関連 policy: [`docs/policy/nest-data-handling.md`](../policy/nest-data-handling.md)
  - コード: `packages/nest/src/app.ts`, `packages/nest/src/routes/{generate,repo}.ts`, `packages/nest/src/github/client.ts`, `packages/nest/src/quota/policy.ts`

## 背景・課題

`karasu-nest.kompiro.dev` を公開したときに成立していてほしい状態は 3 つある。

1. GitHub 認証があり、**生成を起動できるのは operator（`kompiro`）だけ**である
2. **任意の public repository に対する生成リクエストを受け付け**、operator が起動できる
3. 任意の public repository のモデルを、**図として読める**

現在の実装はどれも満たしていない。それぞれ理由が違う。

- **認証機構が無い。** `POST /<owner>/<repo>/generate` は無認証で、installation がある repository に対してなら誰でも起動できる（[ADR-2262](../adr/2262-nest-intake-and-completion.md) 決定 1）。[`docs/policy/nest-data-handling.md`](../policy/nest-data-handling.md) は「第三者が他人の installation の quota を使い切ることは可能である」と既知の穴として記録している。
- **installation が無い repository は読めない。** 読み取りは installation token 経由の tarball（`github/client.ts`）で、`installationIdFor` が空なら 404 を返す。他人の public repository に App を入れることはできないので、この経路では目標 2・3 が構造的に不可能である。
- **描画面が無い。** `GET /<owner>/<repo>` は `.krs` テキストを返すだけで、図にはならない。app 側の permalink 面（`karasu.kompiro.dev/<owner>/<repo>`）は **commit 済み** `.krs` しか解決せず（[ADR-2249](../adr/2249-permalink-generation-seam.md)）、そこへ payload を渡す経路は inline share の 8000 文字上限（[ADR-2259](../adr/2259-permalink-payload-cap.md)、`MAX_UNFURL_PAYLOAD`）に当たる。生成物はこの上限を超える。

同時に、この 3 つを満たす形は ADR-1990 が退避先として明記していた **「public repos only に縮小」** とほぼ一致する。[ADR-1996](../adr/1996-karasu-nest-data-trust.md) の未了（zero-retention 契約・privacy policy・ToS・DPA）は「他者の private repository に向ける」ことを条件に発火するので、public に限れば**公開までの距離が大きく縮む**。目標の姿は縮退ではなく、先に出せる形である。

## 現状（インベントリ）

| 面 | 現状 | 目標との差 |
| --- | --- | --- |
| `POST /<owner>/<repo>/generate` | 無認証・installation 必須・per-installation quota 3/月・同時実行 1 | 認証と operator 限定が無い／installation 無しでは動かない |
| `GET /<owner>/<repo>/status` | 無認証 | 変更不要 |
| `GET /<owner>/<repo>` | 生成済み `.krs` を返す。`no-store`。private repo は 404（[ADR-1996](../adr/1996-karasu-nest-data-trust.md) 決定 4） | HTML（図）を返さない |
| `GET /admin/metrics`, `/admin/failed/...` | bearer token | operator session でも通れると運用が楽 |
| `POST /webhooks/github` | HMAC 検証・uninstall で purge | 変更不要 |
| リクエスト受付 | **未実装**（[ADR-2262](../adr/2262-nest-intake-and-completion.md) 決定 3 で決定済み） | 目標 2 の前半 |
| PR 還元 | 実装済み・`PR_DELIVERY=on` で有効（既定 off） | installation が無い repo では使えない |
| 読み取り経路 | installation token のみ | public repo 用の経路が無い |

## 制約・前提

- **nest は runtime 依存ゼロ**（`packages/nest/README.md`）。App private key を持つ唯一のデプロイなので、third-party パッケージを足さない。`@karasu-tools/core` は workspace の first-party なのでこの規約には抵触しない。
- **private repository のモデルは配信しない**（[ADR-1996](../adr/1996-karasu-nest-data-trust.md) 決定 4）。本 doc はこれを動かさない。
- **生ソースは保存しない**（同決定 1）。session 設計もこの原則に揃える — GitHub の access token を保存しない。
- **12〜19 分**の生成時間は変わらない。同期 HTTP に載らない。
- **`karasu.kompiro.dev`（Pages app）と `karasu-nest.kompiro.dev`（Worker）は runtime で繋がない**（[ADR-2249](../adr/2249-permalink-generation-seam.md)、[ADR-1990](../adr/1990-karasu-nest-pivot-server-reverse.md) 決定 5）。本 doc はこの分離を維持する側で解く。
- **out of scope**: 課金（Stripe）、private repository の公開、メール通知、リクエスト駆動の入力（「payments 側だけ見たい」— [ADR-2262](../adr/2262-nest-intake-and-completion.md) 決定 4 のまま据え置き）。

## 検討した選択肢

### 論点 1: 誰が生成を起動できるか

#### 案 1-A: installation 起動を維持し、operator 起動を足す

現状の installer 起動（[ADR-2262](../adr/2262-nest-intake-and-completion.md) 決定 1）を残したまま、operator 用の経路を追加する。

- **メリット**: 既存実装と ADR に手を入れない。
- **デメリット**: 「generate は私だけ」という目標に反する。既知の穴（第三者が他人の quota を使い切れる）が残る。起動権限が 2 系統になり、quota の意味（誰の予算か）が経路ごとに変わる。

#### 案 1-B: 起動権限を operator に閉じ、installation は「読み取り資格」に降格する（採用）

起動権限と読み取り資格を分離する。

- **起動権限** = operator session ただ 1 つ
- **読み取り資格** = public repository なら operator 名義の token、private repository なら installation token（同意モデルは [ADR-1990](../adr/1990-karasu-nest-pivot-server-reverse.md) 決定 6 のまま）

- **メリット**: [ADR-2262](../adr/2262-nest-intake-and-completion.md) が起動権限を installation に縛った理由（「課金先が居ない」）は、引き受け手が operator に確定することで消える。既知の quota 濫用の穴が閉じる。「誰が起動できるか」が 1 行で言える。
- **デメリット**: installer が自分で起動できなくなる（install したのに待たされる）。ただし現在 installer は operator 本人しか居ない。

### 論点 2: installation の無い public repository をどう読むか

| 案 | 認証 | rate limit | 評価 |
| --- | --- | --- | --- |
| **2-A** 未認証で codeload / raw を叩く | なし | 60 req/h/IP。Workers の egress IP は共有 | 生成 1 回で tree + 最大 200 ファイルを読むので、共有 IP では即枯れる。運用に耐えない |
| **2-B** operator の fine-grained PAT（public repo read-only）を secret で持つ（採用） | PAT | 5,000 req/h | secret が 1 つ増える。scope は public repo の contents:read のみで、漏れても書き込めない |
| **2-C** OAuth で得た operator の user token を session に保持して使う | user token | 5,000 req/h | token を KV に保存することになり、「保存しない」原則と逆を向く。session の寿命と token の寿命が絡む |

**2-B を採る。** 2-C は保存物を増やすのに対し、2-B の PAT は他の secret（App private key・LLM key）と同じ置き場で、失効も再発行も独立している。

visibility の判定は generate の入口で行い、**private かつ installation 無しなら 404**（現在と同じ答え。存在の判別材料にしない）。

### 論点 3: 図をどこで描くか

#### 案 3-A: Pages app の bare route が runtime で nest を参照する

`karasu.kompiro.dev/<owner>/<repo>` が commit 済み `.krs` を探し、無ければ nest の生成物を取得して描く。deepwiki と同じ 1 URL。

- **メリット**: URL が 1 つに畳まれる。読者に説明することが最も少ない。
- **デメリット**: [ADR-2249](../adr/2249-permalink-generation-seam.md) の「2 つの面は runtime で繋がない」を正面から覆す。permalink 面の可用性が nest の可用性に依存し、[TPL-2249](../test-perspectives/TPL-2249-resolution-stays-deterministic.md) が守っている「URL が内容を決める」性質に、生成という副作用のある操作が近づく。**不採用**。

#### 案 3-B: nest 自身が HTML を返す（採用）

`GET /<owner>/<repo>` を content negotiation にする。

| 要求 | 応答 |
| --- | --- |
| `Accept: text/html`（ブラウザ） | サーバサイドで描いた SVG を埋め込んだ HTML |
| `?format=json` | 現状のまま（`.krs` + provenance） |
| それ以外（`curl` 等） | 現状のまま（`text/plain` の `.krs`） |

描画は `@karasu-tools/core` の renderer をサーバサイドで呼ぶ。view の切り替えは `?view=<name>` の別 URL とし、client 側 JS を持たない。

- **メリット**: 2 面の分離が維持される（nest の生成物は nest が配る）。inline payload 上限（[ADR-2259](../adr/2259-permalink-payload-cap.md)）を経由しないので、生成物のサイズ制約が消える。JS ゼロなので配布物が増えない。deep permalink の anchor（`#krs-<view>-<id>`）は SVG に既に含まれている。
- **デメリット**: 描画が CPU を使う（`cpu_ms = 60_000` の枠内。生成の tar 展開・redact より軽い）。app のインタラクション（drill-down・collapse）は初手では無い。

#### 案 3-C: nest が app のバンドルを配る / iframe で埋める

- **デメリット**: 同じ資産を 2 面から配ることになり、SPA ルーティングと nest のルート表が衝突する。iframe 経由で payload を渡す形は 8000 文字上限に戻る。**不採用**。

### 論点 4: リクエスト受付の形

[ADR-2262](../adr/2262-nest-intake-and-completion.md) 決定 3 が既に決めている（1 クリック・カウンタのみ・識別子非保存・通知しない）。本 doc は**実装の置き場所**だけを足す: 未生成時の HTML ページにボタンを置き、operator 用の `GET /admin/requests` で件数順に並べ、そこから起動する。

## 比較

| 観点 | 現状 | 本 doc の方針 |
| --- | --- | --- |
| 起動権限 | installation を持つ誰でも | operator のみ（GitHub OAuth + allowlist） |
| 読み取り資格 | installation token のみ | public = operator PAT／private = installation token |
| 配信 | `.krs` テキスト | 同じ URL で HTML（図）／`format=json` は据え置き |
| quota の意味 | installation ごとの無料枠 | operator の予算 cap（同時実行 1 は維持） |
| 公開ブロッカー | private を扱う前提の法務一式 | public 限定なら「生成物の免責・takedown・licence の扱い」まで |

## Related TPLs

- [TPL-2249](../test-perspectives/TPL-2249-resolution-stays-deterministic.md) — 解決に生成・パーソナライズを混ぜない。案 3-A を落とした根拠であり、採用案でも `GET /<owner>/<repo>` は**解決のまま**（生成は `POST .../generate`、リクエストは `POST .../request` と別資源）に保つ。
- [TPL-1961](../test-perspectives/TPL-1961-catch-all-route-inverts-default.md) — catch-all が既定を反転させる。`/:owner/:repo` の下に `/request` を足すので、リテラルルートの登録順（`app.ts` のコメントが根拠を持つ）を崩さない。
- [TPL-168](../test-perspectives/TPL-168-trust-boundary-input-validation.md) — `<owner>/<repo>` は信頼境界を越える入力。public 読み取り経路でも `normaliseName` を通した後にしか URL を組み立てない。
- [TPL-2226](../test-perspectives/TPL-2226-every-key-prefix-must-be-purgeable.md) — 新しい KV prefix（リクエストカウンタ・session を KV に置く場合）は purge 網羅テストの射程に入れる。
- proactive TPL（本 PR で起こす）— **公開してよい資源とそうでない資源が同じルートを通るとき、安全側を既定にし、反転を 1 か所の判定に閉じる**。HTML 面とキャッシュ可能化は、現在の `no-store` 既定を public 生成物についてだけ反転させる変更であり、反転条件が複数箇所（`Cache-Control` / CORS / ログ / OGP）に散ると、片方だけ private に効かなくなる形で壊れる。

## 現時点の方針

**案 1-B・2-B・3-B を採り、リクエスト受付は [ADR-2262](../adr/2262-nest-intake-and-completion.md) 決定 3 のまま実装する。** 起動権限を operator に閉じることが全体の要で、これが決まると (a) コストの引き受け手が確定し、(b) public repository を installation 無しで読んでよい根拠（読むのは公開コード、起動するのは費用を負う本人）が立ち、(c) 既知の quota 濫用の穴が閉じる。描画面を nest 側に置くのは、2 面を runtime で繋がないという既存の決定を守ったまま「URL を開けば図」を成立させる唯一の形だからである。

この形は [ADR-1990](../adr/1990-karasu-nest-pivot-server-reverse.md) が退避先として記録していた「public repos only」であり、[ADR-1996](../adr/1996-karasu-nest-data-trust.md) の未了が発火する条件（他者の private repository を扱う）を踏まない。**public 公開を先に出し、private は法務が揃ってから開く**という順序になる。

### スライス（実装ステップ）

| スライス | 前提 | 独立に出荷できる理由 |
| --- | --- | --- |
| **A** GitHub OAuth + operator gate | — | 既存機能を絞る変更のみ。生成の挙動は変わらず、無認証起動が閉じるので単体で安全側に倒れる |
| **B** public repository の読み取り経路 | A | A の前に出すと、無認証の起動口が任意の public repository に開くことになる（順序制約） |
| **C** HTML 描画面（SSR SVG + view 切替） | — | 既に生成済みのモデルに対して出荷でき、`format=json` の既存挙動を変えない |
| **D** リクエスト受付 + operator キュー | A | 受付自体は無認証だが、キュー画面と起動導線が A の session に乗る |
| **E** 公開運用（免責・takedown・install 文面・indexability） | B, C | 公開の直前に置く。技術面が確定してからでないと文面が書けない |

依存は A → B / D の 1 本だけで、C は独立して先に出せる。

### 実装の指針

1. **A: 認証**
   - 既存の GitHub App の user authorization flow を使う（新規 OAuth App は不要。`client_id` / `client_secret` を secret に足す）。
   - `GET /auth/github`（state 付き redirect）／`GET /auth/callback`／`POST /auth/logout`。
   - session は **HMAC 署名した stateless cookie**（`HttpOnly` / `Secure` / `SameSite=Lax` / 短命）。中身は login 名と失効時刻のみ。**GitHub の access token は保存しない** — login を確定したら捨てる（[ADR-1996](../adr/1996-karasu-nest-data-trust.md) 決定 1 の「保存しない」と揃える）。
   - allowlist は secret（`NEST_OPERATORS`、カンマ区切り login）。空なら**全拒否**（`requireBinding` と同じく、未設定は degrade ではなく refuse）。
   - `POST /<owner>/<repo>/generate` を operator 限定にする。`/admin/*` は既存 bearer に加えて session でも通す（bearer は CLI 用に残す）。
2. **B: public 読み取り**
   - `GITHUB_PUBLIC_READ_TOKEN`（fine-grained PAT、public repo contents:read）を secret に足す。
   - `GitHubClient` に「installation token または public token」を選ぶ 1 か所を作り、呼び出し側が token の出所を意識しないようにする。
   - visibility は generate の入口で確認し、private かつ installation 無しは 404。
   - PR 還元は installation があるときのみ有効（`PR_DELIVERY=on` の条件に installation の有無を足す）。無いときの配達は hosted URL（= C）。
3. **C: 描画面**
   - `routes/repo.ts` に content negotiation を足す。HTML は `core` の renderer で SVG を生成して埋め込む。
   - `?view=` の既定と一覧は core の view 語彙に合わせる。未知の view は 400 ではなく既定 view にフォールバックしない（URL が内容を決める性質を守る — [TPL-2249](../test-perspectives/TPL-2249-resolution-stays-deterministic.md)）。
   - キャッシュ: 配信可能（= public）と判定された生成物にのみ `public, max-age=...` を許し、判定は 1 か所に閉じる（proactive TPL）。
   - 未生成時の HTML は 404 のまま、本文にリクエストボタン（D）と local reverse ガイドへの導線を置く。
4. **D: リクエスト受付**
   - `POST /<owner>/<repo>/request` — カウンタのみ、識別子非保存、レスポンスは受け付けた事実だけ。
   - KV prefix を 1 つ足し、`nest-purge-coverage.test.ts` の射程に入れる（[TPL-2226](../test-perspectives/TPL-2226-every-key-prefix-must-be-purgeable.md)）。
   - `GET /admin/requests` — 件数順の一覧と起動導線（operator session）。
5. **E: 公開運用**
   - 生成物の免責（下書きであって設計の保証ではない）、takedown 経路、元 repository の licence と生成物の関係を 1 枚に書く。[ADR-1996](../adr/1996-karasu-nest-data-trust.md) の未了のうち **public 限定でも要るもの**だけを切り出す。
   - takedown の実行手段（operator による purge）を admin 経路に置く。
   - install 時の同意文面を「public のみを対象に運用している」状態へ更新する（[`docs/policy/nest-data-handling.md`](../policy/nest-data-handling.md) の文面案）。
6. **AT**: `docs/acceptance/` に新規。TC は少なくとも:
   - 未ログインで `POST /<owner>/<repo>/generate` → 401（installation の有無で答えが変わらない）
   - allowlist 外の GitHub アカウントでログイン → generate は 403
   - installation の無い public repository を operator が起動 → 生成が走る
   - private repository（installation 無し）→ 404（「未生成」と同じ本文）
   - ブラウザで `GET /<owner>/<repo>` → 図が表示され、`?format=json` は従来どおり `.krs`
   - private repository の生成物は HTML 面でも配信されない・キャッシュされない
   - リクエスト受付を 2 回押しても生成が走らない
7. **ADR 昇格**: 実装完了後、本 doc を `docs/adr/<n>-nest-public-reading-service.md` として昇格し、同 PR で削除する。昇格時に [ADR-2262](../adr/2262-nest-intake-and-completion.md) 決定 1・2 を refine し、[ADR-2249](../adr/2249-permalink-generation-seam.md) の未決（PR にならなかった生成物のホスト URL の形）を閉じる。

### 影響範囲・マイグレーション

- **既存ユーザーへの影響**: 実質なし（installer は operator 本人のみ）。無認証だった generate が閉じる。
- **ドキュメント更新**: `packages/nest/README.md`（ルート表・secret 一覧）、[`docs/policy/nest-data-handling.md`](../policy/nest-data-handling.md)（public 読み取り経路・新しい KV prefix・同意文面）、`docs/roadmap.md` の nest 行。
- **secret の追加**: `GITHUB_OAUTH_CLIENT_ID` / `GITHUB_OAUTH_CLIENT_SECRET` / `SESSION_SECRET` / `NEST_OPERATORS` / `GITHUB_PUBLIC_READ_TOKEN`。`GET /healthz` の boolean 一覧に足す。
- **テストへの影響**: nest の既存テストは無認証前提で generate を叩いているので、session を組み立てるヘルパを `src/testing/` に足す。

## 未解決の問い / 決めないこと

- **quota の読み替え。** 起動が operator だけになると per-installation の月 3 回は意味を失う。deployment 単位の月次上限へ読み替えるか、[ADR-1994](../adr/1994-karasu-nest-free-tier-quota.md) の数字をそのまま「operator の予算」として使うか。同時実行 1（`MAX_CONCURRENT_RUNS`）は維持する。
- **immutable な URL の要否。** `GET /<owner>/<repo>` は「最新」を指す mutable な面である。ADR から貼れる immutable な形（`?sha=` を mint する等）が要るかは、[TPL-2249](../test-perspectives/TPL-2249-resolution-stays-deterministic.md) の観点で別途決める。
- **indexability。** 他人の repository について AI 由来の記述を検索エンジンに載せるかどうか（`robots.txt` / `noindex`）。E で決める。
- **app 側 signpost からの導線。** `karasu.kompiro.dev/<owner>/<repo>` の未解決ページから nest への**静的リンク**を置くか。runtime 参照ではないので [ADR-2249](../adr/2249-permalink-generation-seam.md) には抵触しないが、面の境界の説明が要る。
- **HTML 面のインタラクション**（drill-down・collapse）は初手では持たない。必要になったら、app の資産を再利用する形を別途検討する。
