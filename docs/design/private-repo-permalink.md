# private-repo repo-backed permalink（BYO GitHub token）

- **日付**: 2026-07-15
- **Issue**: #1960（親 #1828 permalink layer / epic #1826）
- **PR**: #1971
- **ステータス**: **却下記録**（2026-07-16）— client-side BYO-PAT 方式は「reader が PAT を貼って手元で fetch」＝**local ツールに収束**し、nest(funnel)/core(my-system) の境界を越える（#1960 の当初動機に反する）。private repo は代わりに **karasu-nest の GitHub App ピボット**（installation 認証で server-side reverse、reader は PAT 不要）で解く。→ [#1783](https://github.com/kompiro/karasu/issues/1783) / [PR #1978](https://github.com/kompiro/karasu/pull/1978)（`docs/design/karasu-nest-pivot-github-app.md`、マージ後に有効）。本 doc は「なぜ client-PAT を採らずピボットに至ったか」の推論記録として残す。
- **関連**:
  - repo-backed permalink 設計 [`docs/design/repo-backed-ref-pinned-permalink.md`](./repo-backed-ref-pinned-permalink.md)（軸3 private を v1 で public-only に決定・後続化）
  - [ADR-9017](../adr/9017-cloudflare-deployment-and-byok-ai.md)（BYOK 原則・token/secret をサービスが持たない・sessionStorage 既定 / localStorage opt-in）
  - [ADR-1783](../adr/1783-karasu-nest-hosted-preview.md)（nest = stateless・DB なし）
  - 既存 BYOK 実装 `packages/app/src/utils/api-key-storage.ts`（`karasu.ai.anthropic.apiKey`）
  - Discussion #1786（private repos は **reader 自身の GitHub token**（BYO）を使う、サービス横断 token は不可）

## 背景・課題

repo-backed permalink resolver（#1945 で slice 1、#1958 で deep-anchor+cache）は **public repo 専用**である。private repo は今の経路では解決できない:

```
/r/<owner>/<repo>@<sha>  →  Function（server）が raw.githubusercontent.com を fetch
                          →  private は 401/404（サービスは token を持たない）
```

**BYOK 不変条件（ADR-9017・#1786）**: nest はサービス横断 GitHub token を**絶対に持たない**。よって server-side で private `.krs` を取得する道は原理的に存在しない。private repo permalink を成立させるには **reader 自身の token でクライアント側から取得する**しかない。

同時に permalink の JTBD「リンクをクリックすれば構造が見える恒久リンク」と private の緊張がある: private は「誰でも見える」ではなく「repo にアクセスできる人が、自分の token で見る」= **authenticated viewer** 体験になる。本 doc はその access model を決める（#1960 の求めるとおり、実装前に設計を固める）。

## 制約・前提

### 過去決定（衝突スキャン結果）

`docs/adr/` を byok / token / auth / private / oauth / credential で走査。**衝突する却下決定は無い。** 踏襲する制約:

- **BYOK / サービスは token・secret を持たない（ADR-9017）** — Claude API key と同じ扱いを GitHub token に適用する。sessionStorage 既定 / localStorage opt-in、namespaced key。
- **stateless（ADR-1783）** — DB・保存型ストア無し。private でも server 側に状態を作らない。
- **client-only 完結が可能** — core（`synthesizeSharePayload` / `ImportResolver`）は pure TS でブラウザで動く。slice 1 の `GitHubRawFileSystemProvider` の authenticated・client 版を書けば、**合成をブラウザで**行える。

### 重要な観察: private permalink は「repo ポインタ」であって「payload」ではない

public の inline `#s=` は payload（構造の全文）を URL に凍結する。private でそれをやると**private な構造が URL に載る**（漏洩面）。だが repo-backed permalink `/r/<owner>/<repo>@<sha>` は **repo ポインタしか含まない** — 構造の実体は reader の token で毎回 fetch して初めて materialize する。これは private にとって**むしろ最良のプライバシー特性**である（URL 単体では中身が見えない／authorized reader だけが描画できる／OGP は出さない）。この観察が設計の軸になる。

## 検討した選択肢

論点を軸に分ける。

### 軸1: private の検出と URL 形

public server 経路が 401/404 のとき、どう「client 認証経路」に切り替えるか。

- **案 1-A: URL は public と同一 `/r/<owner>/<repo>@<sha>`。Function は public raw を試み、失敗（404/401）なら SPA landing を返し「private か？ 自分の token で開く」を client 側で再試行**
  - ⭕ permalink grammar が public/private で**統一**。ADR 著者は public/private を意識せず `/r/...` を貼れる（URL の見た目に repo の可視性が漏れない）。
  - ⭕ 既存 slice の URL・route（`/r/` prefix）をそのまま使える。
  - ❌ server は「public-404（本当に無い）」と「private-404（token があれば見える）」を**区別できない**。→ 真に存在しない public repo でも「token で開く？」を提示してしまう UX の混線。
- **案 1-B: 別 route / marker（例 `/rp/...` or `/r/...?auth`）で client 認証経路を明示**
  - ⭕ server が迷わず client 経路へ。混線なし。
  - ❌ ADR 著者が「これは private」と URL に印を付ける必要 → grammar が割れる／可視性が URL に漏れる。
- **推奨: 1-A。** 統一 grammar の価値が大きい。public-404 の混線は「token で再試行しても 404 なら『存在しない or アクセス権が無い』と表示」で吸収する（reader が token を持っていれば 1 回の再試行で判明する）。marker（1-B）は将来 opt-in で足せる。

### 軸2: token の種類と取得・保管

- **案 2-A: BYO fine-grained PAT（Personal Access Token, contents:read）を SPA に入力・保管**
  - ⭕ 既存 BYOK パターン（`api-key-storage.ts`）を GitHub 用に複製するだけ。backend 不要・secret 不要・stateless を保つ。
  - ⭕ fine-grained PAT なら「特定 repo の contents read」に絞れる（最小権限）。
  - ❌ PAT を手で発行・貼り付ける摩擦。token 管理は reader の責任。
- **案 2-B: GitHub OAuth（device flow / OAuth App）で token 取得**
  - ⭕ PAT 発行不要の滑らかな UX。
  - ❌ OAuth token endpoint は**ブラウザから CORS 不可** → token 交換に proxy（backend）が要る。device flow でも token polling は CORS 非対応。**stateless / no-secret 不変条件を破る**（proxy = サーバ状態・OAuth app secret）。v1 に不適。
- **推奨: 2-A（BYO PAT）。** BYOK 不変条件と backend-less を保てる唯一の選択。key store は `karasu.github.token`（sessionStorage 既定 / localStorage opt-in、namespaced）を `api-key-storage.ts` と同型で追加。OAuth（2-B）は PAT 摩擦が問題化したら proxy 込みで再検討する後続。

### 軸3: client fetch 機構（ブラウザから private `.krs` を読む）

- **案 3-A: GitHub Contents API `GET /repos/{o}/{r}/contents/{path}?ref={sha}` + `Authorization: Bearer <PAT>`**
  - ⭕ api.github.com は **CORS 対応**（ブラウザ直叩き可・要 spike 検証）。base64 content を返す。authenticated rate-limit 5000/h。
  - ⭕ slice 1 の `GitHubRawFileSystemProvider` の client・authenticated 版（`GitHubApiFileSystemProvider`）として実装でき、`synthesizeSharePayload` / `ImportResolver` をそのまま再利用（single + multi-file 解決も同一コード）。
  - ❌ raw と違い base64 decode が要る／API の shape が異なる（`readDir` は同 API の dir list で public v1 の未対応制約を private でも踏襲）。
- **案 3-B: authenticated raw（`raw.githubusercontent.com` を token で）**
  - ❌ private raw は header token を素直に受けず、一時 token 付き URL を要する（Contents API 経由で発行）。ブラウザから安定して使いにくい。3-A に劣る。
- **推奨: 3-A（Contents API, client-side）。** **CORS + Authorization がブラウザで通ることを実装前に spike で検証**（本 doc の未解決 #1）。通れば `GitHubApiFileSystemProvider` を core の `FileSystemProvider` として実装し、既存合成パイプラインに載せる。

### 軸4: 描画・payload・OGP

- private は **`#s=` payload URL を作らない**（軸「repo ポインタであって payload でない」）。client が token で fetch→synthesize→**in-memory で `MemoryModeApp` を seed**して開く。URL は `/r/<owner>/<repo>@<sha>` のまま（構造は載らない）。
- **OGP は出さない**（private の unfurl は情報漏洩）。server は private 経路で OGP meta を出さず、landing だけ返す。
- **deep anchor** は slice c の `resolveDeepLinkHash` を再利用。client-resolve 完了後に同じ正規化で `#krs-…` へドリル。

### 軸5: セキュリティ

- token は**ブラウザから出ない**（nest server に送らない・api.github.com へ直接）。TPL-168（trust boundary）: token は Authorization header にのみ載せ、URL / OGP / ログに出さない。
- 保管は BYOK 準拠（session 既定）。設定 UI に「fine-grained PAT・contents:read 最小権限・session 既定」の注意書き。
- private 構造は in-memory のみ・OPFS を汚さない（`MemoryModeApp` の既存 ephemeral 特性）。

## 比較

| 軸 | 推奨 | BYOK 不変条件 | stateless | 既存資産の再利用 |
|---|---|---|---|---|
| 1 検出/URL | 1-A 統一 `/r/...` + client 再試行 | ○ | ○ | slice の route |
| 2 token | 2-A BYO fine-grained PAT | ○（no secret） | ○ | `api-key-storage.ts` 同型 |
| 3 fetch | 3-A Contents API client-side | ○（token 非送信） | ○ | `synthesizeSharePayload` / provider |
| 4 描画 | in-memory・payload URL なし・OGP なし | ○ | ○ | `MemoryModeApp` / `resolveDeepLinkHash` |

**全体像**: private permalink `= /r/<owner>/<repo>@<sha>`（public と同一）。server public fetch が失敗 → SPA landing → reader が BYO PAT を入力 → client `GitHubApiFileSystemProvider`（Contents API + Authorization）が `.krs` を取得 → `synthesizeSharePayload` で in-memory 合成 → `MemoryModeApp` を seed して開く（deep anchor 適用）。**構造は URL に載らず**、OGP も出さず、token はブラウザから出ない。新 backend・新 DB・新 secret を作らない。

## Related TPLs

- [TPL-168](../test-perspectives/TPL-168-trust-boundary-input-validation.md) — token / owner / repo / ref / path が trust boundary を越える。token は Authorization header 限定（URL/OGP/ログ非出力）、path traversal 拒否、host 固定は private でも維持。
- [TPL-1827](../test-perspectives/TPL-1827-deep-link-anchor-cross-surface-parity.md) — deep anchor は client-resolve でも同一 grammar（`resolveDeepLinkHash` 再利用、fork しない）。

## 現時点の方針

1. **access model = client-side authenticated resolve**。private は server で取れない（BYOK 不変条件）ため client で reader の token を使う。
2. **URL は public と統一**（`/r/<owner>/<repo>@<sha>`、軸1-A）。server public fetch 失敗時に SPA が「token で開く」を提示。
3. **token = BYO fine-grained PAT**（contents:read 最小権限）、`karasu.github.token` を BYOK パターンで保管（session 既定 / local opt-in、軸2-A）。
4. **fetch = GitHub Contents API を client から**（`GitHubApiFileSystemProvider`、`synthesizeSharePayload` 再利用、軸3-A）。**CORS+Authorization の spike を実装前に必ず通す**。
5. **private は payload URL を作らず in-memory 描画・OGP なし**（軸4）。構造は URL に載らない = private permalink の最良プライバシー特性。
6. **token はブラウザから出ない**（軸5、TPL-168）。
7. **`adr:check-permalinks`（#1830/#1959）は private permalink を CI で解決検証できない**（token 無し）→ private と判定できる permalink は **skip / warn** に留める（dangling 検出は public に限る）。#1959 の enforcement 設計に private 分岐を申し送る。
8. **実装スライス案**: (a) `GitHubApiFileSystemProvider`（core, contents API, client）+ CORS spike → (b) token store（`github-token-storage.ts`）+ 設定/入力 UI → (c) SPA の private-resolve フロー（landing → token → fetch → in-memory seed → deep anchor）→ (d) `adr:check-permalinks` の private skip/warn。各スライスを子 Issue に落とす。

### 決定（レビュー確認済み 2026-07-15）

方針 3〜4 の 2 つの主要分岐と scope はレビューで確定:

- **token = BYO fine-grained PAT**（軸2-A 採用）。OAuth（2-B）は CORS proxy = backend/secret が要り stateless/no-secret 不変条件を破るため v1 不採用、PAT 摩擦が問題化したら再検討（未解決 #4）。
- **URL は public と統一 `/r/<owner>/<repo>@<sha>`**（軸1-A 採用）。public-404 と private の混線は landing 文言で吸収（未解決 #2）。
- **本 slice の実装は保留**。理由: (i) 軸3 の CORS spike（未解決 #1）が未検証で、通らなければ設計の前提が崩れる、(ii) private テスト repo が要り OSS/public-first の karasu では dogfooding しにくい（未解決 #5）。→ **本 doc をレビュー・マージして access model を確定させ、実装は具体的な private-repo need が出た時点で着手**する（#1960 は `designed` に留める）。

固まったら ADR に昇格（#1828 親のスライス a/c/d と束ねる方針、[[project_repo_backed_permalink]] の申し送りに合わせる）。本 doc は昇格 PR で削除する。

## 未解決の問い

1. **CORS spike（最優先）** — api.github.com の Contents API がブラウザから `Authorization: Bearer <PAT>` 付きで CORS 成功するか（preflight 含む）。ここが通らなければ軸3 全体が崩れ、proxy（backend）が要る = stateless 不変条件と衝突。実装最初のタスクとして spike する。
2. **public-404 と private の混線 UX（軸1-A）** — 真に存在しない public repo で「token で開く？」を出す混線をどこまで許容するか。案: landing に「public として見つからない。private なら token で再試行」と両義的に出し、token 再試行後も 404 なら「存在しない or アクセス権なし」。この文言で十分か。
3. **fine-grained PAT の repo スコープ** — reader は「その 1 repo だけ contents:read」の PAT を作れるが、複数 private repo を見るなら都度切替 or 広めの PAT。UX/セキュリティのバランス（1 token を使い回すか repo ごとか）。
4. **OAuth device flow の将来採用** — PAT 摩擦が実運用で問題化したら、CORS proxy（最小の stateless worker）を許容してでも OAuth に進むか。stateless 不変条件をどこまで厳格に守るか（proxy は secret を持つ）。
5. **ADR permalink としての private の是非** — そもそも private repo の構造を ADR permalink で指すユースケースは、社内 repo の ADR が社内 reader を想定する文脈に限られる。OSS の karasu 自身の dogfooding では検証しにくい（private のテスト repo が要る）。need 検証。
