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

したがって catch-all を足すときの設計問題は「resolver が正しく動くか」ではなく「**resolver が受け取ってはいけないものを、何が止めるのか**」である。止め方は 2 通りしかなく、どちらかを選んで明示する:

1. **判別子（discriminator）**: URL 自体に、アプリ側のルートが構造的に持ちえない印を要求する（例: repo-backed permalink の `@<ref>`）。予約リストが不要になるので、後からルートを足す人が何も知らなくてよい。**こちらが望ましい。**
2. **予約リスト + 機械チェック**: 判別子を置けない場合のみ。予約リストは「アプリ側のルート定義」を単一の出所として導出し、片方だけ増えたら落ちるテストを置く（TPL-1480 と同型 — チェックの発火条件は「チェックが書いてある側」ではなく「破りうる変更」で決める）。

判別子も機械チェックも無い予約リストは、**書いた人が去った時点で腐る**。

## 想定される失敗モード

- SPA が `/projects/<id>` のような 2 セグメントのルートを持っているところに bare な `/<owner>/<repo>` catch-all を足すと、`/projects/<id>` を直接リロードした読者に「そんな repo は無い」という 404 が出る。pushState 経由では再現せず、リロード・ブックマーク・共有でだけ壊れるので発見が遅れる（#1961 の PoC で実測: `shape` guard 下の `/docs/getting-started` が `404 No .krs found at docs/getting-started@HEAD` を返した）。
- 予約リストで塞いだつもりでも、**後から SPA ルートを足した PR** はリストの存在を知らない。症状は「新ルートだけ 404」で、原因は無関係に見える別ファイルにある。
- `_routes.json` の `exclude` に載せたパスは Function から永久に見えなくなる。後でそのパスを Function で扱いたくなったとき、コードを足しても起動しない。
- 判別子を URL に置いても、**復号前の生の pathname に guard を当てる**と判別子を取り逃がす。`%40` は `@` に一致しないので、正当な permalink が黙って SPA に落ちる（#1961 PoC の結果 5）。判別子で守る設計では、正規化を guard の前に置くこと自体が要件になる。

## チェックリスト

catch-all ルート、または「どのリクエストがアプリに届くか」を変える設定を追加・改修するとき:

- [ ] 反転しない側（アプリ・静的アセット・兄弟ルート）が今日と同じ応答を返すことを、**経路を列挙した表**で確認したか（`/`・静的・兄弟 Function・既知の path ルート・未知の 1 セグメント・未知の複数セグメント）
- [ ] resolver に渡さない条件は、判別子（1）か機械チェック付きの予約リスト（2）のどちらで実現しているか。どちらでもないなら腐る前提で書き直す
- [ ] 予約リストを使うなら、その出所はアプリ側のルート定義か。ルート定義だけを増やしたとき落ちるテストがあるか
- [ ] guard を当てる文字列は正規化済みか（percent-decode・末尾スラッシュ・大文字小文字）
- [ ] catch-all の「辞退」経路（`context.next()` 相当）が、静的アセットと fallback の**両方**に戻ることを実測したか。ユニットテストでは検証できないので dev サーバか preview deployment で確認する

## 既知の対処パターン

- **判別子を要求する**: repo-backed permalink の bare 形は `@<ref>` を必須にすることで、`@` を持たない SPA ルートすべてと構造的に排他になる（#1961 案2）。予約リストは defense-in-depth に格下げできる。
- **`_routes.json` の `include` は広く、`exclude` だけを絞る**: `include: ["/*"]` にしておけば、新しい Function を足したときの include 漏れが起きない。メンテ対象を `exclude` 側だけに閉じ込める。
- **実測は dev サーバで**: `wrangler pages dev` は実 workerd + 実 Pages ルーティングでこの手の precedence を再現する。ただし `_redirects` の SPA fallback の扱いは本番と差があるため、fallback だけは preview deployment で確認する。

karasu での route 形の決定は [ADR-1828](../adr/1828-repo-backed-ref-pinned-permalink.md)（`/r/` prefix）と #1961（bare 形）にある。anchor 文法は別レイヤで、[`docs/spec/permalink.md`](../spec/permalink.md) が持つ。
