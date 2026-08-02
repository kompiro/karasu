# `.krs` を持たない repo の permalink — resolution と generation の境界

- **日付**: 2026-08-02
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#2249](https://github.com/kompiro/karasu/issues/2249)（親: [#1990](https://github.com/kompiro/karasu/issues/1990) nest ピボット epic）。[#1961](https://github.com/kompiro/karasu/issues/1961)（bare permalink route）を blocking
  - 関連 ADR: [ADR-1990](../adr/1990-karasu-nest-pivot-server-reverse.md)（nest ピボット — server-side reverse）、[ADR-1828](../adr/1828-repo-backed-ref-pinned-permalink.md)（repo-backed permalink resolver）、[ADR-1829](../adr/1829-adr-permalink-convention.md)（permalink は record ではなく pointer）、[ADR-1895](../adr/1895-reverse-architecture-harness.md)（reverse harness）、[ADR-2077](../adr/2077-reverse-bc-granularity.md)（BC 粒度）、[ADR-9017](../adr/9017-cloudflare-deployment-and-byok-ai.md)（BYOK・認証なし）
  - 関連 TPL: [TPL-1829](../test-perspectives/TPL-1829-adr-permalink-records-source.md)、[TPL-168](../test-perspectives/TPL-168-trust-boundary-input-validation.md)、本 PR で起こす proactive [TPL-2249](../test-perspectives/TPL-2249-resolution-stays-deterministic.md)
  - 関連 design doc: `docs/design/bare-permalink-route.md`（#1961。本 doc が blocking している）
  - コード: `packages/app/src/render/repo-permalink.ts`、`functions/r/[[path]].ts`

## 背景・課題

[ADR-1828](../adr/1828-repo-backed-ref-pinned-permalink.md) の resolver は **repo に commit 済みの `.krs`** を要求する。[ADR-1990](../adr/1990-karasu-nest-pivot-server-reverse.md) はまさにそれを、ピボットが壊しにいく 2 つの壁の 1 つとして名指している:

> **「repo に `.krs` が commit されている」前提** — repo-backed permalink（ADR-1828）の resolver は committed `.krs` を要求するが、それを持つ repo は現実にはほぼ無い。

ADR-1990 は「GitHub App で任意の repo を読み、server-side で AI reverse して `.krs` を生成する」と決め、子 Issue [#2227](https://github.com/kompiro/karasu/issues/2227) の scope に「repo URL → cached `.krs` if present, **otherwise trigger the reverse pipeline**」と書いている。

一方 [#1961](https://github.com/kompiro/karasu/issues/1961) は同じ `/<owner>/<repo>` を Pages app 側の route として実装しようとしている。その design doc の推奨（deterministic-negative fallthrough）は、**`.krs` が無い miss を黙って SPA に差し戻す** — ADR-1990 の世界ではそれこそが生成のトリガであるにもかかわらず。

**2 つの面が同じ URL 名前空間を要求しており、その境界を誰も持っていない。** 本 doc はその境界だけを決める。生成 pipeline の中身（#1993）・quota 水準（#2226 / #1994）・data-trust と法務（#1996）は決めない。

## 現状（インベントリ）

| | permalink resolver（今日動いている） | nest service（未実装） |
| --- | --- | --- |
| 出典 | ADR-1828 / #1961 | ADR-1990 decision 5 / #2227 |
| 実体 | 静的 Pages app の Function | **別の** Cloudflare Workers サービス |
| 入力 | repo に commit 済みの `.krs` | 任意の repo（`.krs` 不要） |
| 想定利用者 | **reader**（リンクを踏む人。誰でも） | **installer**（App を入れた人） |
| 認証 | 無し（ADR-9017） | GitHub App installation |
| state / secret | 持たない（Pages app 面は stateless のまま） | KV/D1 + App private key + LLM key |
| レイテンシ | 40–500 ms | **12–19 分**（85 ファイルの最小 repo。実測値、ADR-1990） |
| コスト | 実質ゼロ | service-paid。**per-installation の月次 quota**（decision 3） |
| miss したとき | SPA へ差し戻す（#1961 案5） | reverse pipeline を起動する（#2227） |

補足:

- 生成ロジック自体は既に存在する（[ADR-1895](../adr/1895-reverse-architecture-harness.md) の 4-phase harness、[ADR-2077](../adr/2077-reverse-bc-granularity.md) の BC 粒度指示）。ただし今日それは Agent Skill としてクライアント側で回る。#1993 がそれを server 側へ載せる。
- 描画は両者とも `packages/app` の `MemoryModeApp` を `/s?s=<payload>` 経由で再利用する（ADR-1783 から引き継がれた決定）。生成された `.krs` も最終的には同じ描画面に落ちる。

## 制約・前提

- **permalink の JTBD は「読者が誰でもクリックして見える恒久リンク」**（ADR-1828）。URL が内容を決めることが前提で、ADR-1829 は permalink を record ではなく pointer と位置づけている。
- **ADR-1990 decision 5**: secret・state・webhook を静的 Pages app に同居させない。生成を伴う面は別サービスに置く。
- **ADR-1990 decision 3**: 推論コストは service-paid で、**per-installation** の月次 quota + global rate-limit で cap する。
- **ADR-1990 decision 6**: data-trust（同意・生コード非保存・zero-retention・uninstall purge・開示）は成立条件であって follow-up ではない。**これが揃うまで他者の private コードに触れてはならない。**
- **生成は 12–19 分**（85 ファイル。`Dify` 規模はその数倍）。同期 HTTP に載らない。
- **Pages app 面は認証なし**（ADR-9017）。反転するなら別 ADR が要る。
- out of scope: reverse pipeline の中身、quota の水準、法務、描画側（#1817 の大規模図の可読性）。

## 3 つの緊張

本 doc の主眼は選択肢の列挙ではなく、**素朴に繋ぐと壊れる 3 点**を先に固定することにある。

### 緊張 1: reader 向けの URL に、installer 向けの行為をぶら下げている

permalink を踏むのは reader で、認証も installation も持たない通りすがりである。一方 ADR-1990 の推論コストは **installation 単位**で計量される。

`karasu.kompiro.dev/someorg/somerepo` に App が入っていなかったら、**その生成のコストを誰に付けるのか**。誰でも踏める URL が誰かの quota を焼く構造は、そのまま abuse 面でもある（URL を撒けば他人の quota を消費できる）。

これは quota の**水準**の問題（#2226 / #1994）ではなく、**課金先が存在するか**という構造の問題なので、水準が決まるのを待たずに決められるし、決めておかないと #2227 の routing が書けない。

### 緊張 2: リクエスト駆動の生成は permalink の determinism を壊す

「ユーザーのリクエストを基に生成する」を素朴に permalink に載せると、**同じ URL が読者ごとに違う内容を返す**。これは permalink が唯一保証すべき性質を壊す。ADR-1828 の immutability も ADR-1829 の pointer 論も、「URL → 内容」が関数であることに乗っている。

解きほぐすと、性質の違う 2 つの操作が混ざっている:

- **resolution**（解決）— URL を内容へ写す。冪等・決定的・誰にとっても同じ。
- **creation**（生成）— 入力から新しい成果物を作る。副作用があり、コストを伴い、入力ごとに違う結果になる。

**生成は resolution ではなく creation である。** したがって生成はその場で permalink の応答をすげ替えるのではなく、**新しい安定した URL を mint してそこへ送る**べきである。`/<owner>/<repo>` は「その repo の正準 `.krs`」を指し続け（committed でも生成済みでも）、リクエストで観点を変えたものは別の資源になる。

### 緊張 3: 12–19 分は同期 HTTP に載らない

302 の裏に隠せる時間ではない。そして permalink を踏んだ reader にとって「12 分待て」は導線として重い — その人は図を見に来ただけで、生成を依頼しに来たわけではない。

**miss 時に同期で誠実に返せるのは「今どういう状態か」と「次の一手」だけ**である。生成そのものは非同期 job + 進捗導線という別の surface になる。

## 検討した選択肢

### 軸1: `/<owner>/<repo>` をどの面が持つか

| | 案 | 内容 |
| --- | --- | --- |
| 1-A | **別 hostname** | nest サービスを `nest.karasu.kompiro.dev` 等に置き、名前空間を分ける |
| 1-B | **Pages Function が service binding で委譲** | route 判定は Pages app 側（#1961 の PoC 資産）、生成を伴う面は service binding で nest Worker を呼ぶ |
| 1-C | **nest Worker が zone route で先取り** | `karasu.kompiro.dev/*` を Worker route で Worker に向け、Pages は SPA だけを持つ |

- **1-A メリット**: 完全に独立。secret も state も物理的に分離され、ADR-1990 decision 5 に最も素直。**デメリット**: URL の見栄えが #1961 の目的から遠ざかる（`nest.` が付く）。ADR に貼る permalink の host が増え、`adr.config.json` の `repoBackedHosts` も増える。
- **1-B メリット**: hostname は 1 つ。#1961 で実測済みの guard・`_routes.json`・`context.next()` fallthrough がそのまま生きる。secret は Worker 側に留まる（Pages app は binding を呼ぶだけで鍵を持たない）。**デメリット**: Pages app と nest サービスのデプロイが binding で結合する。どちらかの単独ロールバックがしにくい。
- **1-C メリット**: 生成面が名前空間を完全に所有し、境界の二重管理が無い。**デメリット**: #1961 の実装が丸ごと無駄になる（route 判定が Worker 側へ移る）。`/s`・`/render`・SPA も Worker 経由になり、今日動いている面のリスクが上がる。

### 軸2: `.krs` が無い miss に何を返すか

| | 案 | 内容 |
| --- | --- | --- |
| 2-A | **SPA へ差し戻す** | #1961 案5 のまま。miss は無かったことになる |
| 2-B | **状態説明ページ** | 「この repo にはまだ `.krs` がありません」＋次の一手（install 導線 / 生成の開始）を 200 で返す |
| 2-C | **即座に生成を起動** | miss がそのまま job になる |

- **2-A メリット**: 実装ゼロ、レイテンシ最小。**デメリット**: ピボットの入口をちょうど塞ぐ。ADR-1990 が壊しにいった壁の前で黙って引き返す。
- **2-B メリット**: 緊張 3 に対する唯一の誠実な同期応答。reader は 12 分待たされず、状況が分かる。生成を望む人だけが次へ進む。**デメリット**: 1 画面ぶんの UI が要る。「ゼロ設定で図が出る」体験に 1 クリック挟まる。
- **2-C メリット**: ゼロ設定に最も近い。**デメリット**: 緊張 1・3 の両方を踏む。課金先の無い訪問者が 12 分の job を起動でき、abuse 面がそのまま開く。

### 軸3: 生成の入力

| | 案 | 内容 |
| --- | --- | --- |
| 3-A | **ゼロ設定のみ** | ADR-1990 のまま。repo を入力に自動 reverse |
| 3-B | **リクエスト駆動を足す** | 「どの観点で見たいか」を入力に取る。生成物は**別 URL に mint** する（緊張 2） |

- **3-A メリット**: ADR-1990 の決定そのまま。cache が SHA だけで keyed でき単純。**デメリット**: 「この repo の決済まわりだけ見たい」に応えられない。
- **3-B メリット**: #2249 の出発点である「利用者のリクエストを基に」を満たす。ADR-2077 の BC 粒度指示が既にプロンプト側のレバーとして効くと実証済みなので、指示を受け取る器としては自然。**デメリット**: cache key にリクエスト文が入る（同じ repo でも別成果物）。permalink の determinism を守るには mint した URL 側に安定 id が要り、それは**新しい永続資源**なので ADR-1990 decision 6 の purge 範囲に入る。

## 現時点の方針

**軸1 = 1-B、軸2 = 2-B、軸3 = 3-B（ただし生成物は別 URL に mint）** を採る。

- **1-B（service binding で委譲）**: hostname を 1 つに保ちながら、ADR-1990 decision 5 の「secret を Pages app に置かない」を守れる唯一の案である。Pages app は route を判定して binding を呼ぶだけで、App private key も LLM key も Worker 側に留まる。#1961 で実測済みの資産（guard・`_routes.json`・`context.next()` fallthrough）がそのまま活き、1-C のように今日動いている `/s`・`/render` をリスクに晒さない。
- **2-B（状態説明ページ）**: 緊張 3 より、同期で返せるのは状態と次の一手だけである。これは #1961 案5 の fallthrough を**置き換える**もので、「deterministic な 404 → SPA」ではなく「deterministic な 404 → 状態説明」になる。ただし **installation が無い repo では生成を提案せず、install 導線だけを出す**（緊張 1）— 課金先の無い生成は起動させない。
- **3-B（リクエスト駆動、ただし別 URL）**: `/<owner>/<repo>` は「その repo の正準 `.krs`」を指し続ける。リクエストで観点を変えた生成物は creation の成果として別の安定 URL を得る。これで permalink の determinism（緊張 2）を壊さずに要望を容れられる。

結果として `/<owner>/<repo>` の意味は次のように整理される:

| 状態 | 応答 |
| --- | --- |
| committed `.krs` がある | 302 → `/s?s=…`（今日どおり） |
| 生成済み `.krs` が cache にある | 302 → `/s?s=…`（reader から見て区別されない） |
| どちらも無い + installation あり | 200 状態説明ページ（生成を開始できる） |
| どちらも無い + installation なし | 200 状態説明ページ（install 導線のみ） |
| 明示 `@<ref>` があって解決できない | エラー（permalink 意図が明示されているので診断を出す） |

**この方針は #1961 の案5 を上書きする。** #1961 の実装は本 doc の合意後に着手し、fallthrough の行き先を SPA ではなく状態説明ページにする。

### 既存 Issue への落とし込み

新しいスライス群は起こさない。本 doc が決めるのは境界であり、実装は既存スライスの中に落ちる。

| 決定 | 落とし先 |
| --- | --- |
| 1-B service binding の配線 | [#2227](https://github.com/kompiro/karasu/issues/2227)（scaffold の routing scope に既に含まれる） |
| 2-B 状態説明ページ | [#1961](https://github.com/kompiro/karasu/issues/1961)（fallthrough の行き先として。案5 を差し替える） |
| installation 有無による分岐 | [#1992](https://github.com/kompiro/karasu/issues/1992)（App auth） |
| 3-B リクエスト駆動 + 別 URL mint | **ADR-1990 に無い入力モードなので、#1990 の子として新規起票が要る**（本 doc 合意後） |
| 生成物 URL の purge 範囲 | [#1996](https://github.com/kompiro/karasu/issues/1996)（data-trust。mint した資源も purge 対象に含める） |

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: なし（`/r/…` も committed `.krs` の解決も変わらない）。miss の応答だけが SPA から状態説明ページに変わる。
- ドキュメント更新: `docs/design/bare-permalink-route.md`（案5 の fallthrough 行き先を差し替え）、`docs/spec/permalink.md`（`/<owner>/<repo>` の意味表）。
- ADR: 本 doc 合意後、`docs/adr/2249-permalink-generation-seam.md` として昇格し（`refines: [ADR-1990, ADR-1828]`）、本 Design Doc は同 PR で削除する。

## 未解決の問い / 決めないこと

- **service binding のデプロイ結合をどう切るか**: 1-B は Pages app と nest サービスを binding で結ぶ。binding 先が未デプロイ / 障害中のときに Pages app 側が何を返すかは、#2227 着手時に決める（フェイルセーフは「committed `.krs` の解決だけは binding 無しで完結する」ことを保つ形になるはず）。
- **生成物 URL の形**: 3-B が mint する安定 URL の文法（`/g/<id>` か、repo + リクエストのハッシュか）は決めない。permalink の deep anchor 文法（ADR-1827）を共有するかも含めて、新規起票側で決める。
- **public repo の扱い**: public repo は installation 無しでも読めるが、**推論コストは同じくかかる**。「public なら誰でも生成を起動してよい」とすると緊張 1 がそのまま残る。訪問者サインイン（ADR-9017 の認証なしを app 面でも反転）まで踏み込むかは本 doc では決めない。
- **cache hit を reader にどう見せるか**: 生成済み `.krs` を 302 で返すとき、それが AI 生成物である事実（と confidence、#1995）をどこで伝えるか。描画面の話なので #1995 / #1817 側。
- **quota の水準**: #2226 の実測待ち（ADR-1990 の未決事項のまま）。
