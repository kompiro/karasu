# AT: karasu-nest がプロバイダのエラーを調査可能な形で記録する

- **日付**: 2026-08-06
- **関連 Issue**: [#2379](https://github.com/kompiro/karasu/issues/2379)（provider error detail + unread body）／親 [#1990](https://github.com/kompiro/karasu/issues/1990)
- **関連 ADR**: [ADR-1990](../adr/1990-karasu-nest-pivot-server-reverse.md)（決定 6: 生コード由来の文字列を持ち出さない）
- **関連 TPL**: [TPL-2379](../test-perspectives/TPL-2379-expensive-failure-records-its-cause.md)（高価な失敗は原因を記録する）、[TPL-2374](../test-perspectives/TPL-2374-long-call-bounded-by-silence-not-duration.md)
- **対象ファイル**:
  - `packages/nest/src/reverse/llm.ts`（`error.type` の抽出と body の消費）
  - `packages/nest/src/reverse/pipeline.ts`（`onPass` — 試行中のパス名）
  - `packages/nest/src/generate/run.ts` / `meter/record.ts`（`failedPass`）

> 1 回の生成は数分と実費（実測で 1 ラン約 $3）がかかる。**原因を落とした記録は、最も安い調査手段が「もう一度回す」になる**ことを意味する。持ち出してよいのは固定語彙（`error.type`）までで、message は決定 6 の対象。

## 受け入れ条件

- [x] AT-A: HTTP エラーの body が JSON なら、status に加えて `error.type` を報告する

  > ✅ Automated — `packages/nest/src/reverse/llm.test.ts` › `carries the provider's error type, which is a fixed vocabulary`

- [x] AT-B: `error.type` が型名の形をしていなければ status だけを報告する（従来どおり）

  > ✅ Automated — `packages/nest/src/reverse/llm.test.ts` › `drops an error type that is not shaped like one`

- [x] AT-C: body が JSON でない場合も status だけを報告し、プロバイダの散文は載らない

  > ✅ Automated — `packages/nest/src/reverse/llm.test.ts` › `keeps the provider's response body out of the error`

- [x] AT-D: エラー経路でレスポンス body を読み切る（未消費のストリームを残さない）

  > ✅ Automated — `packages/nest/src/reverse/llm.test.ts` › `leaves no unread body behind on an error`

- [x] AT-E: モデル呼び出しで落ちたランは、試行中だったパス名を記録する

  > ✅ Automated — `packages/nest/src/generate/run.test.ts` › `names the pass a run died on, rather than leaving it to be subtracted`

- [x] AT-F: モデル呼び出しの後で落ちたランは、パス名を記録しない（動いた呼び出しを責めない）

  > ✅ Automated — `packages/nest/src/generate/run.test.ts` › `leaves the failed pass unnamed when a run breaks after the model calls`

## 手動確認

N/A — 自動テストですべて覆っている。

意図的に外したものがある。この 3 つは当初ここに置いていた:

- 生成が provider エラーで失敗したとき、`/status` の `error` に型名が含まれる
- その run の metrics レコードに `failedPass` が入っている
- provider エラーの直後に `The Workers runtime canceled this request` が出ない

**どれも「本番で失敗が起きたら見る」という形でしか実施できず、再実行できない。** AT の手動項目は
実機確認が繰り返される前提で置くもの（`.claude/rules/acceptance.md`）なので、起きるかどうかが
こちらの手にない事象を待つ項目は、記録としては「確認していない」と永久に同じ意味になる。

エラー経路を意図した瞬間に観測する手段は、AT ではなく**決定論的な再現経路**の側で用意する
（[#2383](https://github.com/kompiro/karasu/pull/2383) 第 2 段階）。それが入るまで、この経路の
検証は上の自動テストが持つ。
