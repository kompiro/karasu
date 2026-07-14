# repo-backed + ref-pinned permalink（nest Phase 2 GitHub resolver）

- **日付**: 2026-07-14
- **Issue**: #1828（親エピック #1826 permalink layer）
- **ステータス**: 検討中
- **関連**:
  - PRD [`docs/prd/keystone-primary-path.md`](../prd/keystone-primary-path.md)（#1825）
  - [ADR-20260626-01](../adr/20260626-01-karasu-nest-hosted-preview.md)（karasu-nest v1 = inline `?s=`、`/<owner>/<repo>` を Phase 2 として明示的に後続化）
  - [ADR-20260404-06](../adr/20260404-06-github-markdown-render-service.md)（`/render` の `src` URL fetch + SSRF 対策 `isSafeUrl()`）
  - [ADR-20260407-04](../adr/20260407-04-cloudflare-deployment-and-byok-ai.md)（BYOK 原則 — サービス横断 token を持たない）
  - [ADR-20260330-04](../adr/20260330-04-permanent-link.md)（`nodePathIndex` + URL hash による deep anchor）
  - Deep permalink アンカー contract [`docs/spec/permalink.md`](../spec/permalink.md)
  - Discussion #1786（Phase 2 resolver / taka 統合 contract）

## 背景・課題

keystone PRD が定めた retained loop の backbone が permalink layer（#1826）である:

> 設計判断をする → 結果の構造を in-repo `.krs` に記録する → その構造を **karasu permalink で指す** ADR を書く。

permalink layer の near-term 3 児（#1827 deep anchor / #1829 taka inline / #1830 dangling 検証）は既にマージ済みで、**inline `?s=` snapshot + taka** の permalink は今日動く。しかし inline snapshot は次の弱点を抱える:

- **repo 非連動**: payload を URL に凍結しているため、`.krs` の version 管理された正本（source of truth）と切れている。読者は「この図の元ソースはどこか」を辿れない。
- **point-in-time の担保が payload 依存**: immutable ではあるが、それは「URL に凍結したから」であって「ある git ref の内容だから」ではない。ADR が指したいのは「**その決定時点の committed 構造**」である。

#1828 が解く permalink 属性は **repo-backed（GitHub repo の `.krs` を解決して描画）** かつ **ref-pinned（特定の git ref/SHA に固定して immutable に描画）**。到達目標は次の形の URL:

```
karasu-nest.<host>/<owner>/<repo>@<ref-or-sha>#krs-<view>-<id>
```

読者がクリックすると、その repo の `.krs` を **その ref の時点**で解決・合成し、既存の drill-down preview を **deep anchor が指す要素にフォーカスした状態**で開く。ADR の「決定時点の構造への恒久リンク」という要件に、inline snapshot より素直に適合する。

Discussion #1786 が Phase 2 として温めていた `/<owner>/<repo>` resolver を、keystone 決定が **funnel-only の後回し項目から retained-product backbone へ格上げ**した。本 doc はその resolver の設計を詰め、#1786 の open questions（source-path 規約 / repo-FS import 解決 / private repo / caching / app surface）に答えを出す。

## 制約・前提

### 過去決定の確認（衝突スキャン結果）

`docs/adr/` を permalink / resolver / github fetch / token / phase 2 の語彙で走査した。**衝突（覆すべき却下決定）は無い。** repo-backed resolver は ADR-20260626-01 が「## 後続（本 ADR の範囲外）」で明示的に指した Phase 2 そのものであり、格上げは keystone PRD の決定に基づく。踏襲すべき制約は以下:

- **ステートレス原則（ADR-20260626-01）** — nest は DB / 保存型 paste を持たない。「保存型 paste（DB あり）」は同 ADR で**却下済み**。repo-backed resolver も **永続ストアを新設しない**。SHA-keyed cache は許容されるが、それは *ephemeral cache*（Cloudflare Cache API / KV の TTL 付き）であって「短縮 URL の永続レコード」ではない — 永続化は taka（外部 D1）に閉じる、という #1786 の役割分担を維持する。
- **BYOK / BYO token（ADR-20260407-04, #1786）** — private repo のアクセスは**ユーザー自身の GitHub token** を使い、サービス横断 token を絶対に持たない。
- **SVG-only / PNG は Worker 限定（ADR-20260404-03, ADR-20260626-01）** — resolver は既存 render パイプライン（`renderSharePayload` / `MemoryModeApp`）を再利用し、描画層を新設しない。
- **deep anchor grammar は確定済み（spec/permalink.md）** — `#krs-<view>-<id>` は static SVG と SPA で共有される単一 grammar。repo-backed permalink は fragment を**そのまま運ぶ**だけで、新 grammar を作らない。
- **SSRF 対策の先例（ADR-20260404-06 `isSafeUrl()`）** — `/render?src=` は既に任意 URL fetch の trust boundary を持つ。repo-backed resolver の GitHub fetch も同じ枠組みに載せる（[TPL-20260510-17](../test-perspectives/TPL-20260510-17-trust-boundary-input-validation.md)）。

### 実装上の前提

- nest は独立パッケージではなく **`packages/app` + Cloudflare Pages Functions（`functions/`）** に内包（ADR-20260626-01）。resolver は新 Function（例 `functions/[owner]/[repo].ts` 相当の catch-all route）+ app 側の source resolver として実装され、`MemoryModeApp` の surface は変えない。
- multi-file の単一 `.krs` 合成は Phase 1 で `ImportResolver` / `serializeKrsFile` / `synthesizeSharePayload` として存在する。repo-backed では **import を repo FS（GitHub tree）に対して解決する**点だけが差分。
- GitHub raw は `https://raw.githubusercontent.com/<owner>/<repo>/<ref>/<path>`。ref は branch / tag / SHA いずれも解決可能。

## 検討した選択肢

論点を 4 軸に分ける。各軸で選択肢を比較し、現時点の推奨を示す。

### 軸1: source-path 規約（repo のどこを見るか）

#1786 の open question「`index.krs`? `*.krs` at root? `.karasu/` dir? manifest field?」。

- **案 1-A: `karasu.krs` / `index.krs` を repo root で look up（固定名・優先順）**
  - ⭕ ゼロ設定。読者が URL を組み立てるだけで動く。karasu の app は `index.krs` のみ対応という既存慣習（feedback: app only supports index.krs）とも整合。
  - ❌ 慣習に合わない repo は解決不能。モノレポで複数モデルを持てない。
- **案 1-B: path を URL で明示（`/<owner>/<repo>/<path...>@<ref>`）**
  - ⭕ 任意の場所の `.krs` を指せる。モノレポ対応。ref-pinning とも直交。
  - ❌ URL が長くなる。root 慣習だけの repo でも path 必須だと冗長。
- **案 1-C: manifest field（`package.json` の `karasu.entry` 等）で entry を宣言**
  - ⭕ repo 側が正本の場所を宣言でき、URL は短いまま。
  - ❌ 追加の規約発明。ecosystem が薄い現状（#1786「今日ほぼ誰も committed `.krs` を持たない」）で manifest 規約を先に敷くのは時期尚早。
- **推奨: 1-A を既定、1-B を明示 override として両立。** `/<owner>/<repo>@<ref>` は root の `index.krs`（無ければ `karasu.krs`）にフォールバックし、`/<owner>/<repo>/<path>@<ref>` で path を明示できる。manifest（1-C）は将来の最適化として open questions に残す。

### 軸2: ref-pinning の immutability 保証

「`@<ref>`」が branch 名（`@main`）でも SHA でも書けるとき、ADR permalink の immutability をどう担保するか。

- **案 2-A: 受け取った ref をそのまま raw fetch に渡す（branch でも SHA でも）**
  - ⭕ 実装が薄い。
  - ❌ `@main` は可変。ADR が「決定時点の構造」を指す要件を満たさない。**ADR permalink には不適**。
- **案 2-B: resolver 側で ref を SHA に解決し、正準 URL を SHA 形へ normalize（`@main` で来ても解決した SHA を canonical とみなす）**
  - ⭕ immutable を構造的に保証。`adr:check-permalinks`（#1830）は SHA 形を検証すれば dangling を確実に検出できる。
  - ⭕ ADR 執筆規約を「permalink は SHA で pin する」と単純化できる。
  - ❌ branch → SHA 解決に GitHub API 1 hop 増える（cache で吸収可能）。
- **推奨: 2-B（SHA-required 版）。** branch/tag ref を受けたら **render はする**（閲覧の利便）が、**ADR permalink は `@<sha>` を必須規約**とする（#1830 の検証もこれ前提）。重要なのは **branch→SHA 解決を hot path で強制しない**こと: GitHub API の unauthenticated rate-limit（60 req/h/IP）を permalink 表示のたびに踏むのを避ける。SHA-pinned URL は raw fetch だけで完結し API hop 不要。branch permalink の canonical 化（302/rel=canonical）は best-effort の付加機能に留め、必須経路に置かない。immutable = 「SHA の内容だから」であって「URL に凍結したから」ではない、という inline snapshot との本質的差分をここで作る。

### 軸3: private repo の認証（BYO token）

- **案 3-A: public repo のみ対応、private は非対応（raw fetch のみ）**
  - ⭕ token 授受ゼロ。最も安全（サービスが credential を一切扱わない）。
  - ❌ private repo の ADR permalink が作れない。社内利用が主戦場だと痛い。
- **案 3-B: BYO token を都度入力（fragment / header に載せずクライアント保持、GitHub API を app からユーザー token で叩く）**
  - ⭕ ADR-20260407-04 の BYOK 原則に整合。サービスは token を保持しない。
  - ❌ 「クリックしたら見える恒久リンク」という permalink の体験と両立しにくい（読者ごとに token が要る）。private の共有リンクは本質的にこのジレンマを持つ。
- **推奨: v1 は 3-A（public のみ）。** private は #1786 の BYO token 方針を踏まえ **後続**に切る。理由: ①permalink の JTBD（ADR 読者が誰でもクリックして見える）と per-reader token は緊張関係、②現状 committed `.krs` の seeding は OSS/public から始まる想定（reverse harness の実運用も public repo）。private 対応は「認証済み閲覧」という別の体験設計を要するため分離する。

### 軸4: caching / rate-limit（ステートレス原則との両立）

- **案 4-A: cache なし（毎回 raw fetch + 合成 + render）**
  - ⭕ 最小。ADR-20260404-06 の MVP と同じ。
  - ❌ SHA-pinned は内容不変なのに毎回 fetch/compile は無駄。GitHub raw の rate-limit に晒される。
- **案 4-B: SHA-keyed ephemeral cache（Cloudflare Cache API、TTL 付き）**
  - ⭕ SHA は immutable なので cache 適合度が高い（`Cache-Control: immutable` を付けられる）。ステートレス原則を破らない（永続レコードではなく CDN cache）。
  - ⭕ rate-limit 緩和。cold-start コスト（font/wasm）は既に module-scope cache 済み（`functions/render.ts` の先例）。
  - ❌ branch ref はキャッシュ不可（可変）。→ 軸2 の SHA-normalize と組み合わせれば branch も解決後 SHA でキャッシュできる。
- **推奨: 4-B。** SHA-pinned URL に長 TTL + `immutable`、branch/tag は短 TTL（または解決 SHA へ 302 して SHA をキャッシュ）。**新設ストアではなく Cache API** を使うことでステートレス却下決定（ADR-20260626-01）と衝突しない。

## 比較

| 軸 | 推奨 | ステートレス原則 | BYOK 原則 | 既存資産の再利用 | #1830 検証との整合 |
|---|---|---|---|---|---|
| 1 source-path | 1-A 既定 + 1-B override | ○ | — | app `index.krs` 慣習 | anchor は path 非依存 |
| 2 ref-pinning | 2-B SHA-normalize | ○ | — | — | **SHA 形を検証** |
| 3 private | 3-A public のみ（v1） | ○（token 非保持） | ○ | raw fetch | public permalink を検証 |
| 4 caching | 4-B SHA-keyed ephemeral | ○（Cache API） | — | `functions/render.ts` の module cache | immutable cache |

**全体像**: repo-backed permalink `= /<owner>/<repo>[/<path>]@<sha>#krs-<view>-<id>`。resolver Function が ①ref→SHA 解決、②raw fetch + `ImportResolver` で repo-FS import 解決 + `synthesizeSharePayload` で単一 payload 合成、③`MemoryModeApp` を seed して deep anchor へ drill、④SHA-keyed immutable cache。**新パッケージ・新 DB・新描画層・新 anchor grammar のいずれも作らない** — 既存 4 資産（`/render` の fetch+SSRF、Phase 1 の合成、permalink deep anchor、Cache API）の合成で構成する。

## Related TPLs

- [TPL-20260510-17](../test-perspectives/TPL-20260510-17-trust-boundary-input-validation.md) — 外部 input（`<owner>/<repo>[/<path>]@<ref>`）を trust boundary を越える前に validate / canonicalize する。resolver は URL segment から GitHub raw URL / import path を組み立てるため、path traversal（`..`）・SSRF（raw host 固定・redirect 検証）・ref 文字種の canonicalize が必須。`known_consumers` に `karasu-nest-share-page` が既にあり、resolver Function は同じ観点の新 consumer。実装 PR でこの TPL を back-ref し、resolver 入力検証テストで消化する。
- [TPL-20260630-01](../test-perspectives/TPL-20260630-01-deep-link-anchor-cross-surface-parity.md) — deep anchor grammar は static-SVG と SPA で単一。repo-backed permalink は fragment を素通しするだけなので、resolver が独自 anchor 解釈を足さないこと（grammar を分岐させない）を担保する観点。

## 現時点の方針

1. **URL 形**: `/<owner>/<repo>[/<path>]@<ref>#krs-<view>-<id>`。ref は branch/tag/SHA を受けて render するが、**ADR permalink は `@<sha>` を必須規約**（軸2-B）。branch→SHA 解決は hot path で強制せず、SHA-pinned URL は raw fetch のみで完結させる（GitHub API rate-limit を permalink 表示経路に持ち込まない）。
2. **source-path**: root `index.krs`（無ければ `karasu.krs`）を既定、`/<path>` で override（軸1-A + 1-B）。
3. **private**: v1 は public repo のみ（軸3-A）。BYO token での private は後続。
4. **caching**: SHA-keyed ephemeral（Cloudflare Cache API、immutable）。永続ストアは持たない（軸4-B、ステートレス原則維持）。
5. **security**: GitHub fetch を `isSafeUrl()` 系の trust-boundary 検証に載せ、host を `raw.githubusercontent.com` に固定、ref/path を canonicalize（TPL-20260510-17）。
6. **実装分割案**: (a) resolver Function（ref→SHA 解決 + raw fetch + 合成、public のみ）→ (b) repo-FS import 解決 → (c) deep-anchor seed + SHA-keyed cache → (d) ADR 執筆規約 + `adr:check-permalinks` の SHA 形対応（#1830 の拡張）。各スライスを別 Issue/PR に落とす。
7. **taka との関係**: repo-backed は「discovery / immutable record」、taka は「任意 inline URL の短縮」で **直交**（#1786 の整理）。repo-backed URL は `/<owner>/<repo>@<sha>` が構造的に十分短いため、taka 短縮は必須ではない。

固まったら ADR に昇格し、本 doc は同 PR で削除する。実装は #1828 を親に、上記 6 のスライスを子 Issue として起票する。

## 決着した論点（レビュー確認済み）

1. **ref→SHA 解決の hop（→ SHA-required で決着）** — resolver は branch/tag も render するが、**ADR permalink は `@<sha>` 必須**とし、branch→SHA 解決を permalink 表示の hot path に置かない。SHA-pinned URL は raw fetch のみで完結し、GitHub API の unauthenticated rate-limit（60 req/h/IP）を踏まない。branch の canonical 化は best-effort の付加機能に留める。
2. **private repo（→ v1 public-only で決着）** — サービスは GitHub token を一切保持せず、public repo の raw fetch のみ。private（BYO-token・per-reader 認証）は後続に分離する。理由: permalink の JTBD（読者が誰でもクリックして見える恒久リンク）と per-reader token は緊張関係にあり、committed `.krs` の seeding も OSS/public から始まる。dogfooding は karasu 自身の ADR に SHA-pinned public permalink を貼って確認する。
3. **deep anchor の存在検証（責務分担で決着）** — resolver は寛容に開く（`<id>` 不在なら spec 通り whole-model / nearest-resolvable へ fallback、throw しない）。dangling 検出は CI 側 #1830 `adr:check-permalinks`（SHA 形対応）に委ねる。resolver は「開く」責務、検証は「壊れを CI で落とす」責務、と分離する。
4. **catch-all route と SPA ルーティングの衝突（設計方針で決着）** — `/s`・`/render` は既存の確定路。resolver は Pages Function の route 優先順位でそれ以外の 2-segment path（`/<owner>/<repo>`）を先取りし、未該当は既存 `_redirects` の SPA fallback へ落とす。この優先順位ルールを実装 PR で明文化・テストする。
