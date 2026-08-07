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
