# `.krs` を持たない repo の permalink — resolution と generation の境界

- **日付**: 2026-08-02
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#2249](https://github.com/kompiro/karasu/issues/2249)（親: [#1990](https://github.com/kompiro/karasu/issues/1990) nest ピボット epic）
  - 関連 ADR: [ADR-1990](../adr/1990-karasu-nest-pivot-server-reverse.md)（nest ピボット — server-side reverse）、[ADR-1828](../adr/1828-repo-backed-ref-pinned-permalink.md)（repo-backed permalink resolver）、[ADR-1829](../adr/1829-adr-permalink-convention.md)（permalink は record ではなく pointer）、[ADR-1895](../adr/1895-reverse-architecture-harness.md)（reverse harness）、[ADR-2077](../adr/2077-reverse-bc-granularity.md)（BC 粒度）、[ADR-9017](../adr/9017-cloudflare-deployment-and-byok-ai.md)（BYOK・認証なし）
  - 関連 TPL: [TPL-1829](../test-perspectives/TPL-1829-adr-permalink-records-source.md)、[TPL-168](../test-perspectives/TPL-168-trust-boundary-input-validation.md)、本 PR で起こす proactive [TPL-2249](../test-perspectives/TPL-2249-resolution-stays-deterministic.md)
  - 関連 design doc: `docs/design/bare-permalink-route.md`（[#1961](https://github.com/kompiro/karasu/issues/1961)。本 doc の結論により **unblock される** — 後述）
  - コード: `packages/app/src/render/repo-permalink.ts`、`functions/r/[[path]].ts`、`docs/guide/reverse-engineering-with-ai.md`

## 背景・課題

[ADR-1828](../adr/1828-repo-backed-ref-pinned-permalink.md) の resolver は **repo に commit 済みの `.krs`** を要求する。[ADR-1990](../adr/1990-karasu-nest-pivot-server-reverse.md) はまさにそれを、ピボットが壊しにいく 2 つの壁の 1 つとして名指している:

> **「repo に `.krs` が commit されている」前提** — repo-backed permalink（ADR-1828）の resolver は committed `.krs` を要求するが、それを持つ repo は現実にはほぼ無い。

ADR-1990 は「GitHub App で任意の repo を読み、server-side で AI reverse して `.krs` を生成する」と決め、子 Issue [#2227](https://github.com/kompiro/karasu/issues/2227) の scope に「repo URL → cached `.krs` if present, **otherwise trigger the reverse pipeline**」と書いている。一方 [#1961](https://github.com/kompiro/karasu/issues/1961) は同じ `/<owner>/<repo>` を Pages app 側の route として実装しようとしており、その design doc は miss を黙って SPA に差し戻すことを推奨していた。

**2 つの面が同じ URL 名前空間を要求しているように見え、その境界を誰も持っていなかった。** 本 doc はその境界を決める。

### 前提の整理（ここが本 doc の出発点）

議論を難しくしていたのは、**permalink 面を「生成もしうる面」の候補として扱っていた**ことである。役割を言い切ると解ける:

- **#1961 / ADR-1828 の permalink 面は、指定 repo に `.krs` が存在する前提のレンダリング機能である。** resolution だけを行い、生成はしない。
- **karasu-nest とは GitHub App そのものである。** ADR-1990 が決めた「読む・reverse する・生成する」は全部その App の責務であって、permalink 面の責務ではない。

この 2 つを固定すると、`.krs` が無い miss で permalink 面がすべきことは 1 つに絞られる — **karasu-nest（および今日すでにあるローカル reverse 手順）へ案内すること**である。生成も、受付も、待ちも、通知も持たない。

## 役割分担 — どこまでが karasu 本体で、どこからが karasu-nest か

面が 2 つあるのは実装都合ではない。**扱える規模が違う**からである。

### karasu 本体の permalink: 手が届く規模を、インフラなしで共有する

permalink（inline `#s=` / `/s?s=` / repo-backed `/r/`）の強みは、**サービスを何も持たずに成立する**ことにある — 認証なし、state なし、コストなし、ステートレス。ADR に貼れる pointer（ADR-1829）として機能するのも、この軽さゆえである。

その代償として**規模の天井が実在する**。payload は URL に載るので、`MAX_UNFURL_PAYLOAD = 8000`（encoded 文字数）という明示的な上限がコード側にある（`packages/app/src/utils/inline-share.ts`）。Cloudflare の ~16 KB URL 上限と crawler 側の制限に対する余裕を見た値である。

実測（本 repo の examples を `encodeShare` にかけたもの。複数ファイルのディレクトリは、resolver が import を平坦化した後の payload に相当する）:

| モデル | raw `.krs` | encoded | 上限比 |
| --- | --- | --- | --- |
| `examples/en/getting-started`（1 ファイル） | 4.9 KB | 2,123 | 27% |
| `examples/en/multi-file-system`（5 ファイル） | 7.0 KB | 3,247 | 41% |
| `examples/en/ec-platform`（15 ファイル） | 14.6 KB | 4,582 | **57%** |
| `examples/en/feature-samples`（19 ファイル） | 27.5 KB | 12,402 | **155%（超過）** |

圧縮率はおおむね 0.53 なので、**天井は flattened `.krs` でおよそ 15 KB** に相当する。ADR-1783 が実測した「実 repo を reverse した `.krs`」が encoded ~5k（上限の 63%）だったことと合わせると、**現実的な reverse 出力はすでに天井の半分以上を使っている**。その 1.5〜2 倍の規模で線を越える。

> 補足: 今日 repo に入っている examples は、**単体 URL では天井に届かない**。上表の超過分はディレクトリ全体を連結した集計値で、`feature-samples` の `index.krs` は他ファイルを import していないため 1 つの payload にはならない。天井の位置を示す数値であって、既存 URL が壊れているという意味ではない。

規模の壁は payload だけではない:

- **可読性** — 大きな図はそもそも人が読めない（[#1817](https://github.com/kompiro/karasu/issues/1817) comprehension epic が扱う別の壁）。
- **多ファイル解決** — repo-backed resolver は import ごとに GitHub raw を叩き、directory listing は v1 では持たない（ADR-1828）。ファイル数に比例してレイテンシが伸びる。
- **そもそも手で書けない** — 大規模 repo の `.krs` を人が書き起こすのは非現実的。これが reverse が要る理由そのものである。

### karasu-nest: その先を引き受けるサービス

karasu-nest（= GitHub App）は、permalink が届かない側を担当する。**AI reverse で `.krs` を起こし**、生成・state・認証・推論コストを引き受ける。ADR-1990 がサービス・secret・quota を導入したのは、この規模帯に踏み込むための代償である。

| | karasu 本体の permalink | karasu-nest |
| --- | --- | --- |
| 想定規模 | 人が書ける / repo に commit されている `.krs`（flattened で〜15 KB 目安） | 実在の大規模 repo（手では書けない規模） |
| `.krs` の出どころ | 既にある（人が書いた / reverse 済みで commit された） | **その場で生成する** |
| 持つもの | 何も持たない（認証・state・コストなし） | App 認証・KV/D1・LLM キー・推論コスト |
| 強み | 軽さ。ADR に貼れる恒久 pointer | 規模。ゼロ設定で実 repo が図になる |
| 制約 | URL 長・可読性・手で書ける範囲 | コスト・レイテンシ（12〜19 分）・data-trust |

**この分担が、本 doc の seam の理由そのものである。** permalink 面に生成を持ち込まないのは責務分割の美学ではなく、**軽さこそが permalink の価値だから**である。生成（コスト・state・認証・待ち時間）を載せた瞬間、permalink は「サービスを持たずに成立する」という強みを失う。逆に karasu-nest がそれらを持つのは、規模の壁を越えるために避けられない対価である。

そして 2 つは対立しない — **karasu-nest の出力が repo に commit されれば、それは permalink が扱える形になる**（後述「2 つの面はどこで合流するのか」）。nest は permalink の代替ではなく、**permalink に載る `.krs` を用意する上流**である。

> **見つかった不足**: `resolveRepoPermalink` は `encodeShare` の結果を `MAX_UNFURL_PAYLOAD` と照合していない（`packages/app/src/render/repo-permalink.ts`）。クライアントの Share ボタン（`buildShareUrls`）は上限超過時に unfurl URL を諦めて fragment 形に degrade するが、**repo-backed route は上限を超えた payload でもそのまま `/s?s=` へ 302 する**。大きなモデルを指す `/r/` URL は、crawler 側の制限と Cloudflare の URL 上限のどちらかで破綻する。本 doc の範囲外なので [#2259](https://github.com/kompiro/karasu/issues/2259) に切り出した。

## 現状（インベントリ）

| | permalink 面（今日動いている） | karasu-nest = GitHub App（未実装） |
| --- | --- | --- |
| 出典 | ADR-1828 / #1961 | ADR-1990 / #1992・#1993・#2227 |
| 責務 | **committed `.krs` のレンダリングのみ** | 読む・reverse する・`.krs` を生成する |
| 実体 | 静的 Pages app の Function | 別の Cloudflare Workers サービス + GitHub App |
| 想定利用者 | **reader**（リンクを踏む人。誰でも） | **installer**（App を入れる repo 所有者） |
| 認証 | 無し（ADR-9017） | GitHub App installation |
| state / secret | 持たない | KV/D1 + App private key + LLM key |
| レイテンシ | 40–500 ms | **12–19 分**（85 ファイルの最小 repo。実測値、ADR-1990） |
| コスト | 実質ゼロ | service-paid。per-installation の月次 quota（decision 3） |

補足:

- 生成ロジック自体は既に存在する（[ADR-1895](../adr/1895-reverse-architecture-harness.md) の 4-phase harness、[ADR-2077](../adr/2077-reverse-bc-granularity.md) の BC 粒度指示）。今日それは Agent Skill としてクライアント側で回り、手順は [`docs/guide/reverse-engineering-with-ai.md`](../guide/reverse-engineering-with-ai.md)（ADR-1783 から引き継がれた決定）にある。#1993 がそれを server 側へ載せる。
- 描画は両者とも `packages/app` の `MemoryModeApp` を `/s?s=<payload>` 経由で再利用する。

## 制約・前提

- **permalink の JTBD は「読者が誰でもクリックして見える恒久リンク」**（ADR-1828）。URL が内容を決めることが前提で、ADR-1829 は permalink を record ではなく pointer と位置づけている。
- **ADR-1990 decision 5**: secret・state・webhook を静的 Pages app に同居させない。
- **ADR-1990 decision 6**: data-trust（同意・生コード非保存・zero-retention・uninstall purge・開示）は成立条件。
- **生成は 12–19 分**（85 ファイル。`Dify` 規模はその数倍）。同期 HTTP に載らない。
- **Pages app 面は認証なし**（ADR-9017）。反転するなら別 ADR が要る。
- out of scope: reverse pipeline の中身（#1993）、quota 水準（#2226 / #1994）、karasu-nest 側の UI と受付設計、描画側（#1817）。

## 3 つの緊張

素朴に「miss したら生成する」と繋ぐと壊れる 3 点。**結論を先に言うと、役割を分けた本 doc の方針では 3 つとも permalink 面から出ていき、karasu-nest 側の設計課題になる。** それでも列挙するのは、なぜ permalink 面が生成を持ってはいけないかの根拠がここにあるためである。

### 緊張 1: reader 向けの URL に、installer 向けの行為をぶら下げている

permalink を踏むのは reader で、認証も installation も持たない通りすがりである。一方 ADR-1990 の推論コストは **installation 単位**で計量される。App が入っていない repo の URL から生成を起動できるなら、**そのコストの課金先が存在しない**。誰でも踏める URL が誰かの quota を焼く構造は、そのまま abuse 面でもある。

これは quota の**水準**の問題（#2226 / #1994）ではなく、**課金先が存在するか**という構造の問題である。

### 緊張 2: リクエスト駆動の生成は permalink の determinism を壊す

「ユーザーのリクエストを基に生成する」を素朴に permalink に載せると、**同じ URL が読者ごとに違う内容を返す**。ADR-1828 の immutability も ADR-1829 の pointer 論も、「URL → 内容」が関数であることに乗っている。

性質の違う 2 つの操作が混ざっている:

- **resolution（解決）** — URL を内容へ写す。冪等・決定的・誰にとっても同じ。
- **creation（生成）** — 入力から新しい成果物を作る。副作用があり、コストと時間を伴い、入力ごとに違う結果になる。

**生成は resolution ではなく creation である。** 混ぜてはならない（[TPL-2249](../test-perspectives/TPL-2249-resolution-stays-deterministic.md)）。

### 緊張 3: 12–19 分は同期 HTTP に載らない

302 の裏に隠せる時間ではない。permalink を踏んだ reader にとって「12 分待て」は導線として重い — その人は図を見に来ただけで、生成を依頼しに来たわけではない。**miss 時に同期で誠実に返せるのは「今どういう状態か」と「次の一手」だけ**である。

## 検討した選択肢

### 軸1: `/<owner>/<repo>` をどの面が持つか

| | 案 | 内容 |
| --- | --- | --- |
| 1-A | **permalink 面が持ち、生成面とは HTTP で繋がない** | permalink 面は committed `.krs` の解決だけ。karasu-nest は独立したサービス・独立した導線 |
| 1-B | **Pages Function が service binding で生成面に委譲** | route 判定は Pages app 側、生成を伴う面は binding で nest Worker を呼ぶ |
| 1-C | **nest Worker が zone route で先取り** | `karasu.kompiro.dev/*` を Worker に向け、Pages は SPA だけを持つ |

- **1-A メリット**: 2 つの面が**実行時に一切結合しない**。permalink 面は今日の責務のまま、state も secret も持たない（decision 5 に自明に適合）。karasu-nest 側の障害・未デプロイが permalink の解決に影響しない。#1961 が nest の完成を待たずに出せる。**デメリット**: 生成物を permalink 面に載せる経路が別途要る（後述のとおり、それは「repo に commit される」ことで自然に解決する）。
- **1-B メリット**: 生成結果をそのまま同じ URL で返せる。**デメリット**: Pages app と nest のデプロイが結合し、単独ロールバックがしにくい。permalink 面が生成面の可用性に依存する。そして **permalink 面に「生成もしうる」責務が滲む** — 緊張 1〜3 が permalink 面に流れ込む。
- **1-C メリット**: 生成面が名前空間を完全に所有する。**デメリット**: #1961 の実装が丸ごと無駄になり、`/s`・`/render`・SPA も Worker 経由になって今日動いている面のリスクが上がる。

### 軸2: `.krs` が無い miss に何を返すか

| | 案 | 内容 |
| --- | --- | --- |
| 2-A | **SPA へ差し戻す** | #1961 の当初案。miss は無かったことになる |
| 2-B | **案内ページ** | 「この repo にはまだ `.krs` がありません」＋ **karasu-nest / ローカル reverse 手順への導線**を 200 で返す |
| 2-C | **受付ページ**（リクエストを permalink 面が受ける） | miss ページがリクエストのカウンタを持つ |
| 2-D | **即座に生成を起動** | miss がそのまま job になる |

- **2-A メリット**: 実装ゼロ。**デメリット**: 「この repo には `.krs` が無い」という有用な事実を握りつぶし、次の一手も示さない。
- **2-B メリット**: 同期で誠実に返せる範囲ちょうど。**permalink 面に state を持ち込まない**（decision 5 に触れない）。karasu-nest がまだ無い今日でも、既にある [`reverse-engineering-with-ai.md`](../guide/reverse-engineering-with-ai.md) を行き先にできるので**即出せる**。**デメリット**: 1 画面ぶんの UI が要る。
- **2-C メリット**: 需要シグナルが取れる。**デメリット**: permalink 面が KV を持つことになり decision 5 への例外が要る。受付は karasu-nest の責務なので、置き場所として筋が悪い。
- **2-D**: 緊張 1・3 の両方を踏む。却下。

### 軸3: 生成の入力（リクエスト駆動）／ 軸4: 完了通知

**いずれも karasu-nest 側の設計課題であり、本 doc の範囲外に移す。** 役割を分けた結果、permalink 面はリクエストも受けず完了も通知しないので、ここで決めることが無くなった。

参考として、これまでの検討で出た論点を karasu-nest 側へ引き継ぐ:

- 入力: ゼロ設定（ADR-1990 のまま）か、「どの観点で見たいか」を受けるか。後者は cache key に入力が入り、生成物は**別 URL に mint** する必要がある（緊張 2）。
- 通知: 進捗ページ / メール / PR-back / **リクエスト受付のみ（通知なし・人手実行）**。先行例として DeepWiki は、未 index の repo にはメール登録で完了通知、private repo は Devin アカウント必須、onboarding で接続した repo は自動生成、と **owner 導線と reader 導線で手段を分けている**。
- 摩擦: reader に GitHub Issue を書かせるような導線は、「気軽に試したい」層を取りこぼし、**需要データを歪める**。受付を作るならボタン 1 つに留める。
- 個人データ: メール通知を採ると karasu-nest が初めて personal data を預かる。預かるものが増えるほどプライバシーポリシーが厚くなる（後述）。

## 現時点の方針

**軸1 = 1-A、軸2 = 2-B。** permalink 面と karasu-nest を**実行時に結合させない**。

### 役割

| | permalink 面（#1961 / ADR-1828） | karasu-nest = GitHub App（ADR-1990） |
| --- | --- | --- |
| すること | committed `.krs` を解決して描画する | repo を読み、reverse し、`.krs` を生成する |
| `.krs` が無いとき | **案内ページを返して karasu-nest へ促す** | 生成する（受付・通知・quota はこちらの設計課題） |
| 持つもの | 何も持たない（state も secret も個人データも） | KV/D1・App private key・LLM key・（採るなら）個人データ |

`/<owner>/<repo>` の意味:

| 状態 | 応答 |
| --- | --- |
| committed `.krs` がある | 302 → `/s?s=…`（今日どおり） |
| `.krs` が無い | **200 案内ページ**（karasu-nest への導線 + ローカル reverse 手順） |
| 明示 `@<ref>` があって解決できない | エラー（permalink 意図が明示されているので診断を出す） |

### 2 つの面はどこで合流するのか — repo である

1-A の唯一の弱点は「生成物をどうやって permalink 面に載せるか」だが、これは **karasu-nest が生成した `.krs` を repo に PR する**ことで解ける。merge されればそれは committed `.krs` になり、**permalink 面は何も変えずにそれを解決する**。

この合流点の置き方には 3 つ利点がある:

- **HTTP 境界も binding も要らない。** 2 つのサービスは repo を介して疎に繋がる。
- **[ADR-1829](../adr/1829-adr-permalink-convention.md) の record / pointer 分離と一致する。** 記録の正本は in-repo `.krs`、permalink はそれを指す pointer — 生成物も同じ形に着地する。
- **ADR-1990 decision 4 の human PR-back ラチェット（[#2228](https://github.com/kompiro/karasu/issues/2228)）と同じ機構である。** 通知・成果物の配達・ラチェットが 1 つの仕組みで済む。

PR が merge されない repo（または private repo）の生成物は karasu-nest 側でホストされ、nest の URL で見る。それは permalink 面の関心事ではない。

### 3 つの緊張の行き先

| | permalink 面 | karasu-nest 側 |
| --- | --- | --- |
| 緊張 1（課金先が居ない） | **消える** — 生成を起動しない | 残る。誰が生成を起動できるかを nest が決める |
| 緊張 2（determinism） | **消える** — resolution しかしない | 残る。リクエスト駆動を採るなら別 URL に mint する |
| 緊張 3（12〜19 分） | **消える** — 待たせる処理が無い | 残る。受付・通知の設計課題 |

### #1961 は unblock される

本 doc は当初 #1961 を blocking していたが、**役割を分けた結果ブロックは解ける**。permalink 面は生成に一切関与しないので、karasu-nest の設計が固まるのを待つ必要がない。

#1961 に残る変更は 1 つだけ: **deterministic-negative fallthrough の行き先を SPA ではなく案内ページにする**（案5 の差し替え）。これは自己完結した変更で、nest の内部設計に依存しない。

### 今日から出せる形（karasu-nest 以前）

karasu-nest はまだ無いが、**案内ページは今日出せる**。行き先として [`docs/guide/reverse-engineering-with-ai.md`](../guide/reverse-engineering-with-ai.md) が既にある（ADR-1783 から引き継がれた BYO reverse 手順）。

- 今日: 案内ページ →「自分の LLM で `.krs` を作る手順」＋「作った `.krs` を repo に commit すればこの URL で開けます」
- karasu-nest 後: 同じページに karasu-nest の導線を足す

**この段階では新しいインフラが 1 つも要らない。** ページ 1 枚である。

### 既存 Issue への落とし込み

| 決定 | 落とし先 |
| --- | --- |
| 2-B 案内ページ（fallthrough の行き先） | [#1961](https://github.com/kompiro/karasu/issues/1961)（案5 を差し替える。unblock 済み） |
| 1-A（HTTP 結合しない）を scaffold の前提にする | [#2227](https://github.com/kompiro/karasu/issues/2227)（routing scope から「permalink 面からの委譲」を外す） |
| 生成物の PR-back を配達経路にする | [#2228](https://github.com/kompiro/karasu/issues/2228)（ラチェットと同じ機構。配達としての用途を scope に足す） |
| 受付・通知・リクエスト駆動の設計 | **karasu-nest 側で新規起票**（#1990 の子。本 doc の「軸3 / 軸4」節を引き継ぎ材料にする） |
| 利用規約 + プライバシーポリシー | [#1996](https://github.com/kompiro/karasu/issues/1996)（下記の段階分けを反映） |

## 法務（日本向けに karasu-nest を提供する場合）

本節は「設計が何を引き起こすか」の整理であって、法的助言ではない。実際の文面は専門家のレビューを前提とする。

**個人情報を一切預からなくても利用規約は要る。** karasu-nest は他者の repo から **AI が導出した成果物を提供する**サービスなので、personal data とは独立に次が発生する:

- **成果物の正確性と免責** — 生成された構造図はその project の公式見解ではなく、誤りうる。「AI 生成物であり無保証」の明示。
- **取り下げ導線** — repo 所有者から「やめてほしい」と言われたときの窓口と手順。
- **派生物の扱い** — 元 repo のライセンスと生成 `.krs` の位置づけ。

プライバシーポリシーの厚みは**何を預かるかに完全に従属する**:

| 段階 | 預かる個人データ | ポリシーの範囲 |
| --- | --- | --- |
| permalink 面（本 doc の方針） | **なし** | 変更不要 |
| karasu-nest / 受付のみ・匿名 | なし | アクセスログ相当の最小限 |
| karasu-nest / メール通知 | メールアドレス | 利用目的・保管期間・削除要求・**送信 provider を第三者提供先として開示** |
| karasu-nest / private repo | 他者のコード | 委託先管理・安全管理措置・越境移転（LLM provider） |

日本向けでは**個人情報保護法**が軸になり、メールアドレスを取得した時点で利用目的の特定・通知が要る。無償提供である限り特定商取引法は絡まない。EU 圏に開くなら GDPR が別途乗る（IP アドレスも個人データ扱いになる点が日本より厳しい）。

**役割を分けた効果がここにも出る**: permalink 面は個人データを一切持たないので、法務の負担は karasu-nest 側に閉じる。#1996 の scope はこの段階分けを反映して組み替える。

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: なし（`/r/…` も committed `.krs` の解決も変わらない）。miss の応答だけが SPA から案内ページに変わる。
- permalink 面が新たに預かるデータ: **なし**。state も secret も持たない。
- ドキュメント更新: `docs/design/bare-permalink-route.md`（案5 の fallthrough 行き先）、`docs/spec/permalink.md`（`/<owner>/<repo>` の意味表）。
- ADR: 合意後 `docs/adr/2249-permalink-generation-seam.md` として昇格し（`refines: [ADR-1990, ADR-1828]`）、本 Design Doc は同 PR で削除する。

## 未解決の問い / 決めないこと

- **案内ページの中身**: karasu-nest への導線と BYO 手順をどう並べるか。i18n（`docs/spec/i18n.md`）の対象になる文字列が増える。
- **karasu-nest 側の受付・通知・リクエスト駆動**: 本 doc の軸3 / 軸4 節を引き継ぎ材料として、nest 側で決める。特に「reader が他人の repo の生成を起動できるのか」は緊張 1 が残る場所で、答え次第でメール保管の要否も決まる。
- **生成物が PR として受け入れられなかったとき**: nest 側でホストする URL の形（`/g/<id>` か repo + 入力のハッシュか）、deep anchor 文法（ADR-1827）を共有するか。nest 側で決める。
- **karasu-nest のホスト名**: permalink 面と HTTP 結合しないので、別 hostname でもサブパスでも成立する。nest 側で決める。
- **cache hit を reader にどう見せるか**: 生成由来の `.krs`（と confidence、#1995）であることをどこで伝えるか。描画面の話なので #1995 / #1817 側。
- **quota の水準**: #2226 の実測待ち（ADR-1990 の未決事項のまま）。
