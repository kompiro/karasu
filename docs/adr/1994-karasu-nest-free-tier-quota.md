---
id: ADR-1994
title: karasu-nest の free-tier quota — installation あたり月 3 回・全体同時実行 1
status: accepted
date: 2026-08-02
topic: project
authors: [kompiro]
depends_on: [ADR-1990]
related_to: [ADR-2262]
scope:
  packages: [nest]
  concerns: [deployment, security]
assumptions:
  - "file: packages/nest/src/quota/policy.ts"
  - "file: packages/nest/src/quota/ledger.ts"
  - "file: packages/nest/src/quota/gate.ts"
  - "grep: packages/nest/src/reverse/pipeline.ts :: MAX_TOKENS"
  - "Anthropic の公開価格が claude-opus-5 で入力 $5/1M・出力 $25/1M（2026-06-24 時点）"
---

# ADR-1994: karasu-nest の free-tier quota — installation あたり月 3 回・全体同時実行 1

- **日付**: 2026-08-02
- **ステータス**: 決定済み
- **Issue**: [#1994](https://github.com/kompiro/karasu/issues/1994)（quota + rate limit）／親 [#1990](https://github.com/kompiro/karasu/issues/1990)／gate [#2226](https://github.com/kompiro/karasu/issues/2226)（計測）

## 背景

[ADR-1990](1990-karasu-nest-pivot-server-reverse.md) 決定 3 は「サービス側が推論費を払い、free-tier に厳しい quota を置く」と決め、**quota の水準を空欄のまま残した**。埋めるには 1 回の reverse がいくらかを知る必要があり、それが #2226 の役割だった。

#2226 で計測系を実装した時点で、本番実測はまだ取れない。ADR-1990 決定 6 により [#1996](https://github.com/kompiro/karasu/issues/1996)（data-trust）が入るまでこのサービスを他人の repo に向けないので、本番トラフィックが構造的に存在しない。したがって本 ADR が拠るのは**パイプラインの上限定数から導いた投影**であり、その旨を数値と一緒に記録する。

投影の初版は誤っていた。spike [#1991](https://github.com/kompiro/karasu/issues/1991) のローカル harness の測定値（出力 0.3〜0.5M トークン）をサーバ側パイプラインに持ち込み、1 回 $12〜19 と見積もった。サーバ側パイプライン（[#1993](https://github.com/kompiro/karasu/issues/1993)）は `MAX_TOKENS = {survey: 8_000, decompose: 12_000, synthesise: 64_000}` で出力を合計 84,000 トークンに縛り、上限に当たったパスは切り詰めずに `ReverseFailed` を投げる。0.4M トークンを出力する実行は存在しえない。コードレビューで指摘されて訂正した。**この訂正が無ければ本 ADR は 4〜6 倍過大な単価に基づいて quota を決め、service-paid そのものを諦める判断に至りえた。**

## 決定

free-tier を以下とする。

| 項目 | 値 | 置き場所 |
| --- | --- | --- |
| installation あたりの月間 reverse 数 | **3** | `MONTHLY_REVERSES` |
| デプロイ全体の同時実行数 | **1** | `MAX_CONCURRENT_RUNS` |
| busy 時の Retry-After | 5 分 | `BUSY_RETRY_AFTER_SECONDS` |
| 同一 SHA の再要求 | quota を消費しない | 既存のキャッシュ経路 |
| 失敗した試行 | quota を消費する | `charge` は dispatch 時 |

上限に達した呼び出しは **429 とローカル逆生成ガイドへの導線**を返す。

## 理由

**単価から逆算した。** 構造的上限 $3.60/回（入力 0.30M × $5 + 出力 0.084M × $25）、想定 $2.15/回。上限価格で 10 installation × 月 3 回 = $108/月。個人が払える範囲に収まり、かつ 1 つの repo で試して終わりにならない回数である。月 1 回では「もう 1 つの repo でも試す」ができず、zero-setup で入ってきた人が最初の判断をする前に止まる。

**同時実行 1 は latency を犠牲にしていない。** 1 回の reverse は分単位の逐次モデル呼び出しなので、並列にしても個々は速くならない。並列が買うのは**支出速度**だけである。同一 commit の二重起動は [#2288](https://github.com/kompiro/karasu/issues/2288) の決定的 Workflow インスタンス id が既に潰しているので、ここが縛るのは異なる repo 間の同時実行になる。

**失敗した試行も消費する。** 失敗した実行は課金されている（throw に至るまでに完了したパスは支払い済み）。消費しない設計にすると、確実に失敗する repo が quota を減らさずに予算を焼ける。

**quota を先に、capacity を後に見る。** 「今月の 3 回を使い切った」は呼び出し側が行動を決められる安定した答えで、「5 分後に来て」はそうではない。順序が逆だと、待たせた末に quota で断ることになり、待ち時間と KV 読み取りの両方が無駄になる。

**断り方に導線を付ける。** ADR-1990 決定 3 が quota を厳しくするのはサービスを存続させるためで、その主張は「断られてもモデルを得る道が残る」ことが前提になっている。429 の本文からローカル逆生成ガイドに送る。

**モデルは `claude-opus-5` を維持する。** ADR-1990 決定 4 が domain 分析の品質を差別化要因に置いている。安いモデルで質を落とすのは差別化を捨てて費用を下げる取引で、それをするくらいなら quota を下げるほうが筋が通る。

## 実装上の判断

**台帳は KV で、正確ではない。** KV に atomic increment は無く、月次カウンタも in-flight カウンタも read-modify-write である。ずれる向きを設計で固定した: 月次カウンタは**少なく数える**ことを許容し（取りこぼし 1 回のコストは約 $3.60）、in-flight カウンタは**多めに数える**（水増しは仕事を断る方向で、認可する方向ではない）。正確さを買うなら installation ごとの Durable Object が要るが、月 3 回の world でその複雑さは見合わない。

**スロットは期限付きで持つ。** decrement せずに死んだ run（isolate の eviction・プラットフォーム由来のキャンセル）がスロットを永久に握ると、デプロイ全体が止まる。`GenerateWorkflow` の `finally` が高速路で、90 分の TTL がその下の床である。`finally` は保証ではない（プラットフォームに打ち切られれば走らない）ので、両方要る。

**charge は dispatch の前。** check と create の間が、2 人目がすり抜ける窓である。早めに課金して create が失敗したら返金するほうが、遅めに課金して二重に走らせるより安い。

**アンインストールで台帳も消える。** ADR-1990 決定 6 に例外は無い（[TPL-2226](../test-perspectives/TPL-2226-every-key-prefix-must-be-purgeable.md)）。再インストールで月がリセットされる副作用は受け入れる: 代替は「忘れてくれと言われた組織の利用記録を保持し続けること」で、防ごうとしている濫用は加害者にとって月 3 回分の価値より手間が大きい。

## 却下した案

**月 1 回。** 初版の投影（$12〜19）から出した数字で、単価の訂正とともに撤回した。1 回では zero-setup の約束（試してみて判断する）が成立しない。

**BYO-LLM key への切り替え・併用。** 初版はこれを提案していた。根拠は誤った単価で、$3.60 なら 10〜20 installation 規模で service-paid が成立するので、ADR-1990 が zero-setup を理由に退けた判断を覆す理由が無い。再検討は installation 数が 2 桁後半に届いたときで、そのときは実測が揃っている。

**日次・時間あたりの rate limit。** 月次と同時実行 1 で支出は既に有界になっている（最悪でも 3 × installation 数 × $3.60/月）。3 番目の軸は、断られ方を増やして説明を難しくするだけで、防ぐ支出が無い。

**Durable Object による正確なカウンタ。** 上記のとおり、ずれる向きを固定できるので月 3 回の world では不要。quota が「サービスと払えない請求の間に立つ唯一のもの」になったときに払う。

**quota 超過を 403 で返す。** 429 + `Retry-After` のほうが正確で、機械可読な回復時刻を伝えられる。403 は「あなたには権限が無い」で、実際には「今は無い」なので嘘になる。

## 実測に置き換わるまで

`GET /admin/metrics` が本番データで埋まったら、`docs/design/2226-nest-cost-model.md` の投影表を実測表に差し替え、本 ADR の水準を再評価する。上げるにせよ下げるにせよ、新しい ADR で supersede する。**この ADR の数値を引用するときは投影であることを併記すること。**
