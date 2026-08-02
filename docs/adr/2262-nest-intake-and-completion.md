---
id: ADR-2262
title: karasu-nest の受付と完了通知 — installer 起動 + PR 還元、reader は無通知のリクエスト受付
status: accepted
date: 2026-08-02
topic: project
authors: [kompiro]
refines: [ADR-1990]
related_to:
  - ADR-2249
  - ADR-1829
  - ADR-9017
  - ADR-2077
  - ADR-1828
scope:
  packages: [app]
  concerns: [deployment, security]
assumptions:
  - "file: docs/adr/2249-permalink-generation-seam.md"
  - "file: docs/guide/reverse-engineering-with-ai.md"
  - "GitHub App の installation token で pull request を作成できる"
---

# ADR-2262: karasu-nest の受付と完了通知 — installer 起動 + PR 還元、reader は無通知のリクエスト受付

- **日付**: 2026-08-02
- **ステータス**: 決定済み
- **関連**:
  - Issue [#2262](https://github.com/kompiro/karasu/issues/2262)（親: [#1990](https://github.com/kompiro/karasu/issues/1990) nest ピボット epic）。検討材料は Issue 本文が保持する
  - [ADR-1990](1990-karasu-nest-pivot-server-reverse.md)（nest ピボット。本 ADR はその decision 3 / 4 の「誰が起動し、どう届くか」を具体化する）
  - [ADR-2249](2249-permalink-generation-seam.md)（permalink 面は解決のみ。受付・通知は nest 側 = 本 ADR の担当と宣言した）
  - [ADR-1829](1829-adr-permalink-convention.md)（記録の正本は in-repo `.krs`、URL は pointer）
  - [ADR-9017](9017-cloudflare-deployment-and-byok-ai.md)（静的 SPA 面の「認証なし」）
  - 後続: [#2289](https://github.com/kompiro/karasu/issues/2289)（PR 還元の実装）、[#2288](https://github.com/kompiro/karasu/issues/2288)（生成ルート）、[#1996](https://github.com/kompiro/karasu/issues/1996)（同意・規約）、[#2228](https://github.com/kompiro/karasu/issues/2228)（ラチェットの検証）

## 背景

ADR-2249 は permalink 面と nest の境界を「解決は本体、生成は nest」と決め、その際に permalink 面から追い出した 3 つの緊張を明示的に nest 側へ送った。

1. **課金先が居ない** — ADR-1990 decision 3 は推論コストを installation 単位で計量する。installation を持たない訪問者が生成を起動できるなら、そのコストの引き受け手が居ない。
2. **determinism** — 「リクエストに応じて生成する」を既存 URL に載せると、同じ URL が読者ごとに違う内容を返す。
3. **12〜19 分** — gate spike の実測（85 ファイルの最小 repo、`Dify` 規模はその数倍）。同期 HTTP に載る時間ではない。

3 つとも「誰が起動でき、完了をどう知るか」を決めない限り消えない。ADR-1990 は decision 4 で「human PR 還元のラチェット」を質のレバーとして名指していたが、それが**配達手段でもある**ことは書かれていなかった。本 ADR はそこを繋ぐ。

## 決定

**生成を起動できるのは App を入れた installer だけとし、完了は生成物を対象 repo に pull request として出すことで通知する。installation を持たない reader には、生成を起動しない「リクエスト受付」だけを開き、通知は返さない。メールアドレスは預からない。**

4 点に分解する。

1. **起動権限は installation に紐づく。** `owner/repo` に対する生成は、その repo を含む installation が存在し、かつ要求元がその installation の文脈にあるときだけ走る。installation を持たない訪問者からの起動経路は開かない（緊張 1 が構造的に発生しない）。
2. **完了通知は PR 還元（#2262 の選択肢 C）。** 生成した `.krs` を対象 repo へ PR として出す。GitHub の通知に乗るので待ち時間が問題にならず、個人データを 1 件も預からず、merge されればそれは committed `.krs` になって ADR-2249 の合流点に着く。進捗ページ（A）とメール（B）は採らない。
3. **reader 経路は「無通知のリクエスト受付」（選択肢 D）から始める。** installation を持たない訪問者には `owner/repo → count` のカウンタだけを置き、何も起動せず、何も返さない。走らせるかどうかは人（メンテナ）が決める。**受付は 1 クリックとし、フォームや Issue 起票を要求しない** — 摩擦を足すと「もともと動機の強い人」だけが残り、需要データとしての意味が落ちるため。識別子は保存しない。
4. **リクエスト駆動の入力（「payments 側だけ見たい」）は v1 では採らない。** 採るときは、リクエスト文字列を cache key に含め、**出力は専用の URL を mint する**（既存 URL の意味を読者ごとに変えない — TPL-2249）。ADR-1990 はゼロ設定を売りにしており、入力欄はその主張と逆を向く。

## 理由

- **起動権限を installation に閉じると、緊張 1 が「対処すべき問題」ではなく「発生しない状態」になる。** quota の水準（#2226 / #1994）は依然として要るが、それは「誰に請求するか」ではなく「どれだけ許すか」の話に縮む。DeepWiki も同じ線を引いている（public は匿名リクエスト可、private は account 必須）。
- **PR 還元は通知・配達・ラチェットを 1 つの機構で済ませる。** ADR-1990 decision 4 のラチェット（#2228）と、ADR-2249 が「2 つの面は repo で合流する」と決めた配達経路と、完了通知が、すべて同じ pull request である。別々に作れば 3 つの仕組みになる。
- **個人データをゼロに保てる。** メール通知（選択肢 B）は「読者が待たずに立ち去れる」唯一の手段だが、karasu-nest が抱える最初の個人データになる。privacy policy の厚み・保持期間・削除請求・メール事業者の subprocessor 開示（#1996）がすべてそこから発生する。solo 運用でその重りを最初から背負う理由が、いまは無い。
- **進捗ページは reader の来訪目的と噛み合わない。** 図を見に来た人に 12〜19 分タブを保持させる設計は、それ自体が失敗である。
- **受付を 1 クリックにするのは、需要データを歪めないため。** 受付の目的は「どの repo が求められているか」を知ることで、そのためのフォームは目的を自分で壊す。カウンタが水増しされうる点は許容する — 実際に走らせるかを人が決めるので、水増しのコストは金銭ではなく signal の質にしか効かない。

## 却下した案

- **進捗ページ（poll / SSE）で完了を伝える（選択肢 A）** — 12〜19 分タブを保持させる。reader にも installer にも合理性が無い。
- **メール通知（選択肢 B）** — reader が立ち去れる唯一の手段だが、最初の個人データを抱え込む。**将来リクエスト量が正当化したときの拡張余地としては残す**（捨て切らない）。
- **reader にも生成を起動させる（installation 不要の匿名起動）** — ゼロ設定に最も近いが、課金先の無い呼び出し元が 12 分の job を起動でき、abuse 面がそのまま開く。ADR-2249 が permalink 面から追い出した緊張をそのまま nest で踏み直すことになる。
- **public repo に限って匿名起動を許す** — 課金先問題は残ったまま（コストは repo の可視性ではなく計算量に比例する）。ただし quota 実測（#2226）後に、global rate-limit と合わせて再考する余地はある。
- **受付をフォーム / GitHub Issue にする** — 需要シグナルの質を落とす（上記「理由」）。加えて Issue 起票は他人の repo を汚す。
- **リクエスト駆動の生成を v1 に入れる** — ゼロ設定という主張と逆を向き、cache key と URL 設計を最初から複雑にする。決定 4 のとおり、採るなら別 URL を mint する形で後から足せる。
- **permalink 面にカウンタを置く** — ADR-2249 が却下済み（Pages app に KV を持つことになり ADR-1990 decision 5 への例外が要る）。

## 未決（本 ADR の範囲外）

- **`contents:write` + `pull_requests:write` への権限拡大**（#2289）— PR 還元は ADR-1990 decision 6 が同意の scope とした `contents:read` を越える。install 時の説明文（#1996）がこの拡大を明示していなければ、実装があっても使ってはならない。
- **生成物が PR として受け入れられなかったときのホスト URL の形**（ADR-2249 の未決を引き継ぐ）。
- **リクエスト受付カウンタの置き場所と可視化** — nest 側の KV に置くことだけが決まっており、公開するかは未定。
- **quota の水準**（#2226 / #1994）。
