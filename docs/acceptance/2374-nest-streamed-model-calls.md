# AT: karasu-nest のモデル呼び出しをストリーミングにする

- **日付**: 2026-08-06
- **関連 Issue**: [#2374](https://github.com/kompiro/karasu/issues/2374)（streamed model calls）／親 [#1990](https://github.com/kompiro/karasu/issues/1990)
- **関連 ADR**: [ADR-1990](../adr/1990-karasu-nest-pivot-server-reverse.md)（決定 6: 生コード・プロンプトを持ち出さない）
- **関連 TPL**: [TPL-2374](../test-perspectives/TPL-2374-long-call-bounded-by-silence-not-duration.md)（無通信で打ち切る）
- **対象ファイル**:
  - `packages/nest/src/reverse/llm.ts`（SSE 受信・無通信タイムアウト）

> `synthesise` パスは `max_tokens: 64_000` を要求する。非ストリーミングだと「まだ生成中」と「ハングした」が経路上のどの層からも区別できず、5 分走ったランが 524 で落ちた。ストリーミングにすると生存が可視になり、打ち切りの根拠を総所要時間から**無通信**に移せる。

## 受け入れ条件

- [x] AT-A: リクエストボディが `stream: true` を含む

  > ✅ Automated — `packages/nest/src/reverse/llm.test.ts` › `asks for a stream`

- [x] AT-B: チャンク境界をまたいだフレームが取りこぼされずに再構成される

  > ✅ Automated — `packages/nest/src/reverse/llm.test.ts` › `reassembles a frame that arrives split across chunks`

- [x] AT-C: text delta だけを連結し、thinking delta は本文に混ぜない。`usage` と `stop_reason` はイベントから復元する

  > ✅ Automated — `packages/nest/src/reverse/llm.test.ts` › `assembles the streamed text and the reported usage`

- [x] AT-D: 応答が申告したモデル名を返す（要求したモデル名ではなく）

  > ✅ Automated — `packages/nest/src/reverse/llm.test.ts` › `reports the model the provider served, not the one that was asked for`

- [x] AT-E: `stop_reason: "refusal"` は短い回答ではなく失敗として扱う

  > ✅ Automated — `packages/nest/src/reverse/llm.test.ts` › `treats a refusal as a failure rather than a short answer`

- [x] AT-F: text を 1 つも受け取らずに終わったストリームは失敗として扱う

  > ✅ Automated — `packages/nest/src/reverse/llm.test.ts` › `treats an empty completion as a failure rather than an empty model`

- [x] AT-G: HTTP エラーの body を例外に載せない（プロンプトは他人の repo 由来）

  > ✅ Automated — `packages/nest/src/reverse/llm.test.ts` › `keeps the provider's response body out of the error`

- [x] AT-H: ストリーム内 `error` イベントの message も載せない。持ち出すのは固定語彙の `type` だけ

  > ✅ Automated — `packages/nest/src/reverse/llm.test.ts` › `keeps an in-stream error's message out of the error it raises`

- [x] AT-I: 無通信が続いたら打ち切り、504 と専用メッセージで失敗する

  > ✅ Automated — `packages/nest/src/reverse/llm.test.ts` › `gives up on a stream that goes silent`

## 手動確認（実デプロイでのみ検証可能）

ADR-1990 決定 6 により、#1996 が入るまで他人の private repo には向けない。以下は自分の repo に対してのみ実施する。

- [ ] M-1: `ddd-library` と同規模（150〜200 ファイル）の repo を 1 回生成し、524 を出さずに `state: "done"` に到達する
- [ ] M-2: `GET /admin/metrics` がパス別の入出力トークンとモデル名を返す（成功したランと失敗したランの両方で）
