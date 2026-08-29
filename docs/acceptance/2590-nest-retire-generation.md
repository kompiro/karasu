# AT: karasu-nest から server-side 生成が消えている

- **日付**: 2026-08-23
- **関連 Issue**: [#2590](https://github.com/kompiro/karasu/issues/2590)（retire server-side generation）／親 [#2578](https://github.com/kompiro/karasu/issues/2578)
- **関連 ADR**: [ADR-2578](../adr/2578-nest-retires-server-side-reverse.md)（ADR-1990・ADR-1994 を supersede）、[ADR-2077](../adr/2077-reverse-bc-granularity.md)（分解の粒度 — 消費者がローカル skill に移った）
- **関連 TPL**: [TPL-2226](../test-perspectives/TPL-2226-every-key-prefix-must-be-purgeable.md)、[TPL-2587](../test-perspectives/TPL-2587-author-managed-content-has-no-ttl.md)、[TPL-1032](../test-perspectives/TPL-1032-derived-state-staleness.md)（文書とコードの二重管理）
- **対象ファイル**:
  - `packages/nest/src/`（`reverse/` `generate/` `quota/` `meter/` `deliver/` `github/` と `store/` の生成側を削除）
  - `packages/nest/wrangler.toml`（`[[workflows]]`・`PR_DELIVERY` 削除、`cpu_ms` 再測定、binding 改名）
  - `scripts/lint/nest-retention-policy-sync.test.ts` / `docs/policy/nest-data-handling.md`（drift ガードと記述の対）
  - `scripts/lint/reverse-skill-adr-sync.test.ts`（ADR-2077 のガードを消費者の移動に追随させた）
  - `docs/acceptance/` / `docs/design/` / `docs/test-perspectives/`（生成を前提に書かれた記録の整理。削除した機能の AT 8 件と design doc 2 件を消し、生き残る記録が指す先を現行ファイルに付け替えた）

> 削除は「使われなくなったから消す」ではない。**生成があること自体が前提だった記述**
> （保持期間・同意文面・サブプロセッサ・quota）がすべて偽になるので、コードと文書は
> 同じ変更で動く必要がある。片方だけ残ると、サービスが「そう書いてあること」と違う
> ことをしている状態になる。

## 受け入れ条件

- [x] AT-A: 生成関連のモジュールがリポジトリに存在しない

  > ✅ Automated — `scripts/lint/nest-retention-policy-sync.test.ts` › `says the service does not read anyone's repository` / `does not claim a model provider is involved`（`github/client.ts` と `reverse/llm.ts` の不在を assert）

- [x] AT-B: Workers エントリが default handler だけを export する（`[[workflows]]` の class が消えた）

  > ✅ Automated — `packages/nest/src/worker.test.ts` › `exports only shapes the runtime accepts` / `does not re-export the barrel`

- [x] AT-C: `/healthz` が報告する binding が現行の 4 つだけになっている

  > ✅ Automated — `packages/nest/src/app.test.ts` › `serves /healthz` / `reports a binding as present without disclosing its value`

- [x] AT-D: ルート表に生成系の経路が無く、未知のパスが素直に 404 になる

  > ✅ Automated — `packages/nest/src/app.test.ts` › `exposes only the routes this slice ships` / `404s an unknown path`

- [x] AT-E: `requireBinding` が現行の secret 名で動き、空文字を未設定として扱う

  > ✅ Automated — `packages/nest/src/env.test.ts` › `returns a configured value` / `throws a named error when a binding is absent` / `treats an empty string as absent`

- [x] AT-F: structure-only 検査は残り、egress 用の `redactFiles` は消えている

  > ✅ Automated — `packages/nest/src/redact/redact.test.ts` › `assertStructureOnly` の各ケース（`redactFiles` の describe は削除済み）

- [x] AT-G: 保持ポリシー文書と実装の突き合わせがギャラリーの事実で通る

  > ✅ Automated — `scripts/lint/nest-retention-policy-sync.test.ts` › 全 8 ケース

- [x] AT-H: **投稿・アカウントに TTL が無いこと**が文書側からも機械で確かめられる

  > ✅ Automated — `scripts/lint/nest-retention-policy-sync.test.ts` › `keeps a submission until its author deletes it, and says so` / `keeps the account record on the same condition`

- [x] AT-I: ADR-2077 の分解ルールが、消費者の移動後も両側で保たれている

  > ✅ Automated — `scripts/lint/reverse-skill-adr-sync.test.ts` › 5 つの条件それぞれ + `still names the spike the measurement came from`

- [x] AT-J: 削除で使われなくなった export が残っていない

  > ✅ Automated — `pnpm knip`（CI）

- [x] AT-K: 生き残る記録が、削除したファイルを指していない。削除された機能そのものの AT・design doc は残っていない

  > ✅ Automated — `pnpm at:check-coverage`（marker と design-doc 参照）、`pnpm adr:check-assumptions`（ADR の `assumptions:` が指すファイルの実在）
  >
  > **`packages/nest/**` へのパス参照が本文に残っていないことは、この 2 つでは検出できない**（`at:check-coverage` は
  > unit テストのパスを実在確認しない）。今回は目視で 0 件にしたが、機械化は未了。ADR 本文は当時の記録として
  > 意図的に据え置くため（ADR-706）、ガードを作るなら `docs/adr/**` を除外範囲に含める必要がある。

## 手動確認

- [ ] 🧑 `[limits] cpu_ms` の再決定が実機で妥当である。本番デプロイ後、`https://<nest のホスト名>/g/<id>` に
      大きめ（100KB 以上）の投稿を置いて開き、`Worker exceeded CPU time limit` にならないことを確認する

  > 測定はこの devcontainer で行った（220KB の文書で 78ms CPU）。Workers の実機は
  > ハードウェアが違うので、10 倍の余裕を取った 1 秒が実際に足りているかは
  > **実機でしか判定できない**。落ちた場合は値を上げるのではなく、まず測り直す。
