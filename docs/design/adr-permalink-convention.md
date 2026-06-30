# ADR から karasu permalink を貼る authoring convention

- **日付**: 2026-06-29
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#1829](https://github.com/kompiro/karasu/issues/1829)（taka-shortened inline snapshot を near-term ADR permalink にする — 残ゴール「ADR-authoring convention の文書化」）
  - **PR**: [#1836](https://github.com/kompiro/karasu/pull/1836)
  - epic: [#1826](https://github.com/kompiro/karasu/issues/1826)（permalink layer）
  - 兄弟: [#1827](https://github.com/kompiro/karasu/issues/1827) / PR [#1833](https://github.com/kompiro/karasu/pull/1833)（deep permalink のエンコード — `target` を `SharePayload` 同梱）、[#1828](https://github.com/kompiro/karasu/issues/1828)（repo-backed / ref-pinned）、[#1830](https://github.com/kompiro/karasu/issues/1830)（`adr:check-assumptions` を permalink 検証へ拡張）
  - 関連 ADR: [ADR-20260626-04](../adr/20260626-04-karasu-nest-ogp-share-page.md)（`/s?s=` OGP 共有ページ）、[ADR-20260626-01](../adr/20260626-01-karasu-nest-hosted-preview.md)（nest stateless）
  - taka 契約: discussion [#1786](https://github.com/kompiro/karasu/discussions/1786) のコメント「A separate, generic path to short share URLs: `taka`」
  - 関連 TPL: [TPL-20260510-17](../test-perspectives/TPL-20260510-17-trust-boundary-input-validation.md)、[TPL-20260510-18](../test-perspectives/TPL-20260510-18-text-as-single-source-of-truth.md)、[TPL-20260510-20](../test-perspectives/TPL-20260510-20-id-not-label-for-identity.md)
  - コード: `package.json :: adr:check-assumptions`、`packages/app/src/utils/inline-share.ts :: buildShareUrls`

## 背景・課題

keystone の製品ループ（#1826）は「設計判断をする → 結果の構造を in-repo の `.krs` に記録する → その構造に **リンクする** ADR を書く」。このうち「ADR から karasu の構造へリンクする」部分の **near-term** 実装が #1829 で、内訳は次の 3 つ:

1. 判断対象の構造を inline `?s=` snapshot にする（既存 share 経路）— ✅ 実装済み
2. taka で短縮する（server-side 302、OGP は `/s` が所有）— ✅ 実装済み・実機確認済み（`taka.kompiro.dev/<slug>` → `/s?s=` → SNS unfurl）
3. **ADR-authoring convention の文書化**（ADR が permalink を **どう capture して link するか**）— 本 Design Doc の対象

1 と 2 は「URL を作る機構」が揃った状態。残るのは「その URL を **ADR のどこに・どんな形で・どう再現可能性を担保して** 書くか」という運用規約で、機構ではなくドキュメント／規約の設計である。

規約が無いと次の症状が出る:

- ADR ごとに permalink の置き場所がバラバラ（本文の散文 / related / 末尾）になり、機械検証（#1830）が掛けられない。
- taka 短縮 URL は **opaque**（`taka.kompiro.dev/TkrZQG` を見ても何を指すか分からない）。短縮 URL **だけ**を貼ると、後から「この ADR がどの構造を指していたか」を **再現・監査できない**。リンク切れ（D1 のレコード削除 / 期限切れ）に気づく術もない。

## 現状（インベントリ）

| 観点 | 現状 |
| --- | --- |
| inline share URL | `https://karasu.kompiro.dev/#s=<payload>`（fragment, private）と `https://karasu.kompiro.dev/s?s=<payload>`（query, unfurlable）の 2 本を `buildShareUrls` が生成（ADR-20260626-04） |
| payload | `.krs` を deflate+base64url した自己完結ペイロード。repo 非依存・immutable（凍結）。~5KB、oversize 時は unfurl URL が `null` |
| OGP | `/s?s=` を server-render（`functions/s.ts` + `share-page.ts`）。`og:image` は `/render?…&view=system&format=png` |
| taka | karasu 非依存の単一ユーザ shortener（CF Workers + D1）。destination は opaque 文字列。`/s?s=` を登録し 302。OGP は持たない（#1786 契約） |
| deep target | PR #1833（案B）が `target` を `SharePayload` に同梱予定。1 トークンで `#s=` / `/s?s=` / taka 短縮形すべてに同一に効く |
| ADR frontmatter | `assumptions:`（`file:` / `symbol:` 参照）を持ち、`adr:check-assumptions`（`adr` CLI）が参照先の実在を検証する |
| ADR ↔ 構造の現状リンク | 規約なし。ADR は散文で `examples/foo.krs` 等を指すのみで、レンダリング済み構造への安定リンクは無い |

## 制約・前提

- **ADR は point-in-time の記録** — 判断時点の構造を指すべき。inline `?s=` snapshot（凍結ペイロード）はこの性質に合致する（repo 非依存はここでは欠点ではなく適合）。
- **貼る URL の形は #1833 に従う** — 本 Doc は「URL の中身（どの要素/ビューを指すか）の決め方」は決めない。model-level でも deep でも「ADR に貼る1本の URL」という前提のみ共有する。
- **taka 短縮の機構は #1829 で実装済み** — 本 Doc は機構を作らず、その産物を ADR にどう載せるかだけを決める。
- **TPL-20260510-18（text as single source of truth）** — 構造の source of truth は in-repo `.krs`。permalink は派生表現であり、SoT を置き換えない。
- **TPL-20260510-17（trust boundary）** — 本 Doc は ADR docs の規約であり新しい入力経路を増やさない（trust boundary 面は増やさない）。
- **out of scope**: repo-backed / ref-pinned permalink（#1828）、deep target のエンコード（#1833）、`adr:check-assumptions` の実装拡張（#1830 — 本 Doc は「何を検証可能な形で書くか」だけ定義し、検証ロジックは委ねる）。

### スコープ — 「karasu を参照する ADR」は誰の ADR か

epic #1826 が想定する「設計判断 → `.krs` 記録 → ADR がリンク」の developer は **karasu ユーザー**であり、その ADR は **ユーザーの repo に・ユーザーの ADR 規約で**存在する（adr-tools / Log4brains / 素の Markdown / 無規約）。したがって karasu が**固定の置き場所（frontmatter スキーマや固定見出し）を一律に強制することはできない**。これを踏まえ規約を 2 層に分ける:

| 層 | 対象 | 強制力 | 中身 |
| --- | --- | --- | --- |
| **L1: portable guide** | 任意の ADR ツール / 無規約のユーザー | 推奨のみ（強制不可） | 「何を書くか」だけ縛る — `/s?s=` 短縮を貼る（`#s=` 不可）、再現用に source を併記。**置き場所は縛らない** |
| **L2: adr-tools 実装** | `@kompiro/adr-tools` を採用した repo（karasu 自身を含む） | repo が opt-in した範囲で強制 | 固定の置き場所 ＋ `adr:check-assumptions` による機械検証（#1830）。L1 を満たす reference 実装 |

`@kompiro/adr-tools` は public npm 公開済みで portable なので、L2 を adr-tools の機能として実装すれば「採用ユーザー全員に効く」。karasu 自身の `docs/adr/` は L2 の **dogfooding 兼 reference** として規約を適用する。ユーザーは adr-tools を採らなくても L1 guide を見て自分のツールに合わせて工夫できる。

## 検討した選択肢

スコープを 2 層（L1 portable guide / L2 adr-tools 実装）に分けたので、論点も層ごとに意味が変わる。**(A) 置き場所**は L2（adr-tools を採用した repo）でのみ強制でき、L1 では「縛らない」が答え。**(B) 再現可能性**は両層で共通の content ルール。以下の A-* は **L2（adr-tools 実装）でどの形を採るか**の検討であり、L1 guide はそのうち「何を書くか」だけを置き場所非依存で推奨する。

### 論点A: 置き場所（L2 = adr-tools 実装でどの形を採るか）

#### A-1: 本文の散文に markdown リンクとして貼るだけ

`## 背景` や `## 決定` の中で `[この構造](https://taka.kompiro.dev/TkrZQG)` と書く。

**メリット**: ゼロ規約。今すぐできる。
**デメリット**: 機械検証（#1830）が掛けられない（どのリンクが permalink か判別不能）。ADR ごとに位置がバラつく。

#### A-2: frontmatter に専用フィールド `permalink:` を新設

```yaml
permalink:
  - short: https://taka.kompiro.dev/TkrZQG
    source: examples/keystone/payments.krs   # 再現用（論点B）
    view: system
```

**メリット**: 構造化され機械検証しやすい。`adr:check-assumptions`（#1830）が拾える。ADR スキーマの一部として一貫。
**デメリット**: ADR frontmatter スキーマの変更が要る（バリデータ更新）。`assumptions:` と二系統になる。

#### A-3: `assumptions:` を拡張して `permalink:` kind を足す

既存 `assumptions:`（`file:` / `symbol:`）に `permalink:` 種別を追加:

```yaml
assumptions:
  - "file: examples/keystone/payments.krs"
  - "permalink: https://taka.kompiro.dev/TkrZQG"
```

**メリット**: 既存の検証パイプライン（`adr check-assumptions`）に自然に乗る。「この ADR が前提とする外部参照」という意味づけが `assumptions` と一致する。新フィールド不要。
**デメリット**: `assumptions` の意味（コード symbol の実在前提）が permalink まで広がり、やや過負荷。permalink は「壊れたら invalidate」ではなく「壊れたら警告」で扱いたい（重みが違う）。

#### A-4: 本文に専用セクション `## 構造（permalink）` を規約化

ADR 本文末尾に決まった見出しで節を置き、その中に表形式で短縮 URL・source・view を書く。

**メリット**: frontmatter スキーマ変更が不要。人間が読みやすい（クリックできる）。見出しが固定なので機械抽出も可能。
**デメリット**: frontmatter ほど厳密でない（Markdown パースが要る）。

### 論点B: 再現可能性・監査性（opaque 短縮 URL 対策）

#### B-1: 短縮 URL だけ記録

`https://taka.kompiro.dev/TkrZQG` のみ。

**メリット**: 最小・クリーン。
**デメリット**: opaque。リンクが死んでも検出不能。指す構造を再現できない。**ADR の point-in-time 記録としては不十分**（リンク先 = 外部 D1 に依存）。

#### B-2: 短縮 URL ＋ 展開後 `/s?s=` URL の両方を記録

短縮（人間用）と展開済み `/s?s=<payload>`（自己完結・凍結）を併記。

**メリット**: 凍結ペイロードを ADR が直接保持するので taka が消えても構造は再現可能（payload を decode すれば `.krs` が戻る）。真に immutable な point-in-time 記録。
**デメリット**: 展開 URL が長い（~5KB）。frontmatter / 本文が膨らむ。

#### B-3: 短縮 URL ＋ source `.krs` の repo 参照（path、可能なら commit）

短縮 URL に加えて、構造の元になった in-repo `.krs` の path を記録（将来 #1828 で ref-pin）。

**メリット**: SoT（in-repo `.krs`、TPL-20260510-18）と紐づく。監査時に「この ADR はこのファイルのこの状態」を辿れる。`adr:check-assumptions` が `file:` 実在チェックを既に持つので相性良。
**デメリット**: path だけだと「判断時点の状態」ではなく「現在の状態」を指す（ファイルは変わりうる）。真の immutability は #1828（ref-pin）待ち。near-term では「判断時点 ≒ ADR の date 時点の git 状態」と緩く解釈。

#### B-4: payload（自己完結 `/s?s=` URL）を**正**にし、短縮はシュリンカ非依存にする

短縮 URL を「正」とせず、自己完結した `/s?s=<payload>`（凍結スナップショット）を **source of truth** として ADR に記録する。短縮 URL は **任意のシュリンカ（taka を含む）が生む差し替え可能な表示用別名**として扱う（無くてもよい）。

**メリット**:
- **taka を必須依存にしない** — 短縮レイヤは交換可能。taka が消えても ADR の permalink（payload）は壊れない。#1786 が taka を「karasu 非依存の汎用シュリンカ」と定義した精神に合致。
- **immutability が構造的に保証** — payload は凍結スナップショットそのもの。ref-pin（#1828）不要で、判断時点の構造を完全保持。
- **trust posture をユーザーが選べる** — `/s?s=` には図情報が入る。taka で短縮すれば taka(D1) がそれを保持する。許容して taka を使う / 別シュリンカを使う / 長い URL をそのまま貼る、を **ユーザーが選択**できる。karasu が「図を taka に預けよ」と規約で強制しない。

**デメリット**: payload URL が長い（~5KB）。正を frontmatter に置くと frontmatter が膨らむ（L2 で本文を生成すれば本文側は短縮 URL でクリーンに保てる）。短縮 URL とのリンク切れは「別名が切れただけ」で正（payload）は無傷だが、別名の有効性を別途検出したいなら検証が要る。

## 比較

| 観点 | A-1 散文 | A-2 専用 frontmatter | A-3 assumptions 拡張 | A-4 専用セクション |
| --- | --- | --- | --- | --- |
| 機械検証(#1830)親和性 | ✕ | ◎ | ◎ | ○ |
| スキーマ変更コスト | なし | 中 | 小 | なし |
| 人間可読（クリック） | ○ | △ | △ | ◎ |
| 既存 `assumptions` との整合 | — | 二系統 | 一系統 | 独立 |

| 観点 | B-1 短縮のみ | B-2 短縮+展開 | B-3 短縮+repo参照 | **B-4 payload正・短縮は別名** |
| --- | --- | --- | --- | --- |
| point-in-time immutability | ✕ | ◎ | △（ref-pin 待ち） | **◎（凍結 payload が正）** |
| 監査・再現性 | ✕ | ○ | ◎（SoT に紐づく） | **◎（自己完結）** |
| taka 必須依存 | あり | あり | あり | **なし（交換可能）** |
| trust posture 選択 | 不可 | 不可 | 不可 | **ユーザーが選べる** |
| 記述量 | 最小 | 大 | 小 | 大（本文生成で緩和） |
| リンク切れ耐性 | 不能 | 自己完結 | repo 参照で代替 | **正は無傷（別名のみ切れる）** |

## Related TPLs

| TPL | 関係 |
| --- | --- |
| [TPL-20260510-18](../test-perspectives/TPL-20260510-18-text-as-single-source-of-truth.md) | 構造の SoT は in-repo `.krs`。permalink は派生表現で SoT を置き換えない（source 参照 = living source への辿り道） |
| [TPL-20260510-17](../test-perspectives/TPL-20260510-17-trust-boundary-input-validation.md) | `/s?s=` payload は URL 由来 input。本 Doc は新たな trust boundary 面を増やさない（規約のみ）。L2 検証（#1830）が payload を decode する際の入力検証に back-ref |
| [TPL-20260510-20](../test-perspectives/TPL-20260510-20-id-not-label-for-identity.md) | deep permalink の対象は author-given `id`（#1833）。source 併記で要素を指す際も `id` を使う |
| **proactive TPL（本 PR で新規）** | 「ADR permalink の正は自己完結 `/s?s=` payload であり、短縮 URL（taka 等）を正にしない＝短縮レイヤを必須依存にしない」。L1 guide（`docs/guide/`）/ L2 rules を派生元 spec として相互リンク |

## 現時点の方針

**規約を 2 層に分け、L1（portable guide）を baseline、L2（adr-tools 実装）をその reference 実装とする。permalink の正は自己完結 `/s?s=` payload（B-4）。短縮 URL は taka を含む任意シュリンカが生む差し替え可能な別名で、必須ではない。L2 は frontmatter を正とし（A-2 相当）、本文のクリック用サマリは adr-tools が生成する。**

理由:

- **L1 / L2 の分離**（ユーザー指摘を反映）— karasu を参照する ADR はユーザーの repo にあり、karasu は置き場所を一律強制できない。だから「何を書くか」だけの portable guide（L1）を baseline にし、固定置き場所＋機械検証は adr-tools を採用した repo（L2）に限定する。ユーザーは adr-tools 非採用でも L1 guide を見て自分のツールに合わせて工夫できる。
- **正は payload、短縮は交換可能な別名（B-4）**（ユーザー提案を反映）— 短縮 URL を正にすると taka が必須依存になり、taka が図情報（payload）を保持することを規約が強制してしまう。代わりに自己完結 `/s?s=` payload を正にすると、(1) taka を必須にせず短縮レイヤを交換可能にでき、(2) 凍結スナップショットなので構造的に immutable（ref-pin #1828 不要）、(3) **「図を taka に預けるか・別シュリンカか・短縮しないか」の trust posture をユーザーが選べる**。
- **source `.krs` 参照は任意の traceability**（B-3 を降格して併存）— in-repo `.krs`（TPL-20260510-18 の SoT）への参照は「living source への辿り道」として任意で添える。ただし permalink の immutability は payload 正が担うので、source は再現性の必須要素ではなく補助。
- **L2 は frontmatter が正・本文は生成** — frontmatter に payload 正（＋任意の short / source）を持ち、人間がクリックする本文サマリは adr-tools が生成する。これで検証は単一ソース（frontmatter）に集約し、本文の二重メンテを避けつつ可読性（epic #1826 の「読者がクリックして構造を見る」）も満たす。

### 規約（ドラフト）

**L1 portable guide（任意ツール向け・推奨）:**

ADR が karasu 構造にリンクするとき、ツールを問わず次を満たす:

- **正は自己完結 `/s?s=<payload>` URL**（凍結スナップショット）。OGP が要る共有では `/s?s=`（query, server-visible）を使う — fragment `#s=` は server に届かず unfurl が死ぬ（#1786 契約 1）。
- 短縮 URL を貼る場合は **`/s?s=` を宛先に短縮**する（`#s=` の短縮は不可）。短縮は taka でも他サービスでもよく、**正（payload）ではなく表示用の別名**として扱う。短縮しない選択（長い URL をそのまま貼る）も可。
- 任意で **source（in-repo `.krs` への参照）** を添えると living source を辿れる。deep permalink（#1833）なら対象要素 id も添える（例 `payments.krs#krs-system-payment-api`）。

> **trust note**: `/s?s=` payload には図情報が入る。taka 等で短縮すると、そのシュリンカが destination（＝図を含む URL）を保持する。機密構造では「短縮しない」「自前シュリンカを使う」を選べる旨を guide に明記する。

**L2 adr-tools 実装（採用 repo・karasu 自身を含む）:**

frontmatter を正にする（payload が必須、short / source は任意）:

```yaml
permalink:
  - payload: https://karasu.kompiro.dev/s?s=<self-contained ~5KB>  # 正（凍結・immutable）
    short:   https://taka.kompiro.dev/TkrZQG                       # 任意: 表示用別名（任意シュリンカ）
    source:  examples/keystone/payments.krs                        # 任意: living source への traceability
    view:    system
```

本文のクリック用サマリ節は **adr-tools が frontmatter から生成**する（手書きしない＝二重メンテなし）:

```markdown
## 構造（permalink）

| 構造 | リンク | source |
| --- | --- | --- |
| system | [図を開く](https://taka.kompiro.dev/TkrZQG) | `examples/keystone/payments.krs` |
<!-- short が無ければ payload URL を直接リンクにする -->
```

### 実装の指針

本 Doc は karasu 側の機構実装を伴わない（規約 ＋ ドキュメント。L2 検証実装は #1830 / adr-tools 側）。成果物は:

1. **L1 guide を公開ドキュメントとして文書化** — `docs/guide/NN-adr-permalinks.md`（＋ i18n ポリシーに従い `.ja.md` 兄弟）を新設し、上記 L1 content ルール（payload 正・`/s?s=`・短縮は任意別名・trust note）を規定。`packages/docs-site/scripts/lib/site-map.ts` の `PUBLISHED_DOCS` に登録して docs-site で公開する（ユーザー向け）。
2. **L2 規約を `.claude/rules/adr.md`** に追記（karasu 自身の ADR 執筆時に Claude / adr-tools が従えるよう）。frontmatter `permalink:` フィールド（`payload` 必須 / `short` `source` `view` 任意）の定義と、本文サマリ節の生成フォーマットを規定。
3. **#1830 / adr-tools への引き継ぎ** — frontmatter `permalink:` の検証（`payload` が decode 可能な有効 `/s?s=` か・任意 `source` `.krs` が実在するか・任意 `short` が 302 で `payload` に解決するか）と本文サマリの生成は #1830 / `@kompiro/adr-tools` に委ねる。本 Doc は「検証・生成可能な記述形」を確定するところまで。
4. 既存の代表 ADR 1 本（例: keystone 系、または ADR-20260626-04）に L2 を適用したサンプルを示す。
5. **proactive TPL を 1 件同梱**（CLAUDE.md の「spec/concepts/guide 新規節には proactive TPL を最低 1 件同梱」規約）— 観点:「ADR から karasu 構造へリンクするとき、正は自己完結 `/s?s=` payload であり、短縮 URL（taka 等）を正にしない（短縮レイヤを必須依存にしない）」。L1 guide / L2 rules を派生元 spec として back-ref する。
6. AT: `docs/acceptance/` に受け入れ条件（規約どおりのサンプル ADR が存在し、permalink の正が `/s?s=` payload で、短縮 URL は別名として任意であること）。人手確認は「短縮 URL が実際に SNS で unfurl される」程度（#1786 の end-to-end 課題に合流）。
7. ADR 昇格: 規約が固まり #1830 と接続したら ADR 化し、本 Design Doc は同 PR で削除する。

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: なし（規約・ドキュメント。L1 は推奨、L2 は opt-in）。
- ドキュメント更新: `docs/guide/`（L1）、`.claude/rules/adr.md`（L2）、必要なら `docs/process.md`。
- 既存 ADR への遡及適用: 不要（今後の ADR から適用。過去 ADR は任意）。
- 前方リンク: #1830（検証）・#1833（エンコード）・#1828（ref-pin）。

## 決定済み（壁打ちで確定）

- **スコープは 2 層**（L1 portable guide / L2 adr-tools 実装）。karasu はユーザー ADR のフォーマットを強制できないため。
- **正は payload（B-4）**、短縮 URL は taka を含む任意シュリンカの差し替え可能な別名。→ immutability は payload 正が構造的に担保し、ref-pin（#1828）は repo-backed 経路の話に切り分け。
- **L2 は frontmatter `permalink:` が正、本文サマリは adr-tools が生成**（二重メンテなし）。
- **trust posture はユーザー選択**（短縮しない / 自前シュリンカ / taka）を guide に明記。
- **L1 guide は `docs/guide/` に置き docs-site で公開**（ユーザー向け）。`site-map.ts` の `PUBLISHED_DOCS` に登録、`.ja.md` 兄弟を伴う。
- **proactive TPL は 1 件に集約** — 観点「ADR permalink の正は自己完結 `/s?s=` payload であり、短縮 URL を正にしない（短縮レイヤを必須依存にしない）」を同 PR で起こす。

## 未解決の問い / 決めないこと

1. **frontmatter `permalink:` の検証強度（#1830 へ申し送り）。** `payload` の decode 検証は必須として、任意 `short` の 302 解決チェックを CI で常時叩くか（外部 taka への依存をテストに持ち込む是非）。本 Doc では「申し送り」に留める。
