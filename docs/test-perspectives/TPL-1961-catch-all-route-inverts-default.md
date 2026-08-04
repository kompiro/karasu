---
id: TPL-1961
title: "既定を反転させる catch-all ルートは、反転しない側の経路を判別子か機械チェックで固定する"
status: active
date: 2026-08-01
applicable_to:
  - "root catch-all の Pages Function / サーバルート（`functions/[[path]].ts` など）を追加・改修するとき"
  - "`_routes.json` の `exclude` や `_redirects` の fallback など、「どのリクエストがアプリに届くか」を決める設定を書くとき"
  - "SPA に新しい path ルートを足すとき（既存 catch-all の受理範囲と衝突しないかの確認）"
known_consumers:
  - repo-permalink
  - useProjectNavigation
discovered_from:
  - issue: "#1961"
  - root_cause_file: "functions/r/[[path]].ts"
related_to:
  - TPL-1480
  - TPL-168
topic: navigation
scope:
  packages:
    - app
  concerns:
    - deployment
---

# TPL-1961: 既定を反転させる catch-all ルートは、反転しない側の経路を判別子か機械チェックで固定する

## 観点

catch-all ルートを追加すると、「未知のパスがどこへ行くか」という既定が静かに反転する。反転前は *未知 → アプリ（SPA fallback）*、反転後は *未知 → 新しい resolver* になる。この反転は追加した PR では見えず、**後から別のルートを足した人が踏む**。

したがって catch-all を足すときの設計問題は「resolver が正しく動くか」ではなく「**resolver が受け取ってはいけないものを、何が止めるのか**」である。止め方は 3 通りで、どれを採るか明示する:

1. **判別子（discriminator）**: URL 自体に、アプリ側のルートが構造的に持ちえない印を要求する（例: `@<ref>` 必須）。予約リストが不要になるので後からルートを足す人が何も知らなくてよいが、**その印を必須にすることが機能要件を壊さないときだけ**選べる（#1961 では ref 省略を第一級にする要件と両立しなかった）。
2. **安全側 fallthrough**: resolver が **deterministic な negative**（「そんなものは無い」と確定した答え）を返したら、エラーにせず元の既定（アプリ）へ差し戻す。判別を guard から resolver の結果へ後ろ倒しする形で、**予約リストが不完全でも既定が壊れない**のが効き目。transient な失敗（upstream 5xx）は差し戻さない — 障害を「そんなページは無い」と偽ってしまうため。代償は、差し戻す前に上流を叩くぶんのレイテンシ。
3. **予約リスト + 機械チェック**: 単独で正しさを担う場合は、予約リストを「アプリ側のルート定義」から単一の出所で導出し、片方だけ増えたら落ちるテストを置く（TPL-1480 と同型 — 発火条件は「チェックが書いてある側」ではなく「破りうる変更」で決める）。2 と併用するなら、役割はレイテンシ最適化と多層防御に格下げできる。

**1 も 2 も無い、機械チェックもされない予約リストは、書いた人が去った時点で腐る。**

## 想定される失敗モード

- SPA が `/projects/<id>` のような 2 セグメントのルートを持っているところに bare な `/<owner>/<repo>` catch-all を足すと、`/projects/<id>` を直接リロードした読者に「そんな repo は無い」という 404 が出る。pushState 経由では再現せず、リロード・ブックマーク・共有でだけ壊れるので発見が遅れる（#1961 の PoC で実測: `shape` guard 下の `/docs/getting-started` が `404 No .krs found at docs/getting-started@HEAD` を返した）。
- 予約リストで塞いだつもりでも、**後から SPA ルートを足した PR** はリストの存在を知らない。症状は「新ルートだけ 404」で、原因は無関係に見える別ファイルにある。
- `_routes.json` の `exclude` に載せたパスは Function から永久に見えなくなる。後でそのパスを Function で扱いたくなったとき、コードを足しても起動しない。
- 判別子を URL に置いても、**復号前の生の pathname に guard を当てる**と判別子を取り逃がす。`%40` は `@` に一致しないので、正当な permalink が黙って SPA に落ちる（#1961 PoC）。判別子を使う設計では、正規化を guard の前に置くこと自体が要件になる。
- 安全側 fallthrough を **transient な失敗にも広げてしまう**と、上流の障害時に「そんなページは無い」を返すことになる。実在するリンクが白紙のアプリの裏に隠れ、障害の症状が「404 が増えた」ではなく「何も起きない」になって切り分けが遅れる。

## チェックリスト

catch-all ルート、または「どのリクエストがアプリに届くか」を変える設定を追加・改修するとき:

- [ ] 反転しない側（アプリ・静的アセット・兄弟ルート）が今日と同じ応答を返すことを、**経路を列挙した表**で確認したか（`/`・静的・兄弟 Function・既知の path ルート・未知の 1 セグメント・未知の複数セグメント）
- [ ] resolver に渡さない条件は、判別子（1）・安全側 fallthrough（2）・機械チェック付き予約リスト（3）のどれで実現しているか。どれでもないなら腐る前提で書き直す
- [ ] fallthrough を使うなら、差し戻す条件は **deterministic な negative に限定**されているか（upstream 5xx を差し戻して障害を隠していないか）
- [ ] 予約リストを使うなら、その出所はアプリ側のルート定義か。ルート定義だけを増やしたとき落ちるテストがあるか
- [ ] 上流に問い合わせてから差し戻す設計なら、その negative 結果をキャッシュしているか（未知パスへのクロールが上流への fetch に増幅しないか）
- [ ] guard を当てる文字列は正規化済みか（percent-decode・末尾スラッシュ・大文字小文字）
- [ ] catch-all の「辞退」経路（`context.next()` 相当）が、静的アセットと fallback の**両方**に戻ることを実測したか。ユニットテストでは検証できないので dev サーバか preview deployment で確認する

## 既知の対処パターン

- **deterministic negative で差し戻す**: #1961 の採用案。`<owner>/<repo>` 形を受けて GitHub に問い合わせ、「その `.krs` は無い」と確定した（400 / 404）なら SPA へ `context.next()` する。502 / 500 は差し戻さない。「未知パス = アプリ」の既定が保たれ、予約リストの漏れが 404 ではなく数百 ms の遅延に縮む。
- **判別子は「意図のシグナル」としても使える**: 必須にできなくても、`@<ref>` が URL にあるときだけ差し戻さずエラーを出す、という非対称にできる。permalink を意図した読者は診断を受け取り、たまたま形が似ただけの人はアプリに着く。
- **`_routes.json` の `include` は広く、`exclude` だけを絞る**: `include: ["/*"]` にしておけば、新しい Function を足したときの include 漏れが起きない。メンテ対象を `exclude` 側だけに閉じ込める。
- **実測は dev サーバで**: `wrangler pages dev` は実 workerd + 実 Pages ルーティングでこの手の precedence を再現する。ただし `_redirects` の SPA fallback の扱いは本番と差があるため、fallback だけは preview deployment で確認する。

karasu での route 形の決定は [ADR-1828](../adr/1828-repo-backed-ref-pinned-permalink.md)（`/r/` prefix）と #1961（bare 形）にある。

## 派生元 spec

- `docs/spec/permalink.md` / `docs/spec/permalink.ja.md` — 「Route forms that carry an anchor」。bare 形は root catch-all なので、spec が定める「SPA と兄弟 Function が持つ経路には手を出さない」が破られたときに検出する proactive TPL。
