---
id: TPL-20260624-01
title: "AT ↔ e2e spec の linkage は machine guard で固定する（spec を足す / rename したら AT doc から辿れること）"
status: active
date: 2026-06-24
applicable_to:
  - "`packages/e2e/tests/at-*.spec.ts` を追加・rename・削除するとき"
  - "`docs/acceptance/*.md` に automation marker（`> ✅ Automated by ...`）で spec path を書くとき"
  - "AT と自動テストを「同じ意図を 2 つの表現で持つ」関係で結ぶ仕組み一般"
known_consumers:
  - acceptance-docs
  - playwright-tests
related_to:
  - TPL-20260623-01
  - TPL-20260510-14
discovered_from:
  - issue: "#1680"
  - root_cause_file: "scripts/acceptance/coverage.ts"
topic: testing
scope:
  packages:
    - e2e
---

# TPL-20260624-01: AT ↔ e2e spec の linkage は machine guard で固定する

## 観点

`docs/acceptance/*.md`（AT）と `packages/e2e/tests/at-*.spec.ts`（e2e spec）は、`> ✅ Automated by \`<spec path>\`` という marker で結ばれている。これは「ある AC を自動で守っているのはどの spec か」を **AT 側から辿れる** ようにするための紐付けであり、TPL-20260623-01（app/CLI surface ↔ docs/tools）と同じ「同じ意図を 2 つの表現で持つ」構造の **テスト軸版** にあたる。

紐付けが **散文の手書き** である限り、次のように静かに drift する:

- spec を新規追加したが、どの AT doc からも path で参照されない → **orphan spec**（AT 側から到達できない自動テスト）。
- spec を rename / 削除したが、AT doc が古い path を指したまま → **stale reference**（存在しない spec を「自動化済み」と称する死んだリンク）。実例として `at-0033-drilldown-export.spec.ts` ↔ `0033-drill-down-export.md` のような slug 揺れ（`drilldown` / `drill-down`）は、純粋な番号・slug 一致では検出できない。

`scripts/acceptance/coverage.ts` は元々「AT doc に automation marker が **一つでも** あるか」を見ていたが、それは「e2e spec が **名指しで** リンクされているか」までは保証しない。番号一致ベースの heuristic cross-ref（`missing-marker-with-spec`）も over-match を避けるため緩く、`--strict` の根拠にしづらい。そこで **exact（path 完全一致）な双方向 guard** を足して固定する。

## 想定される失敗モード

- e2e spec を追加したのに AT doc から名指しされず、AT を読んでも「この AC は e2e で守られている」と分からない（カバレッジが見えない）。
- spec を rename したが AT doc の `Automated by \`...\`` が旧 path のまま → CI もビルドも緑で、AT は「自動化済み」と主張し続けるが実体はリンク切れ。
- doc 側 glob（`docs/acceptance/**`）だけを hook 対象にしていると、**spec の追加 / rename**（`packages/e2e/tests/**` の変更）では guard が走らず、push してから気づく。

## チェックリスト

- [ ] 追加した `packages/e2e/tests/at-*.spec.ts` を、対応する `docs/acceptance/*.md` の automation marker（`> ✅ Automated by \`<full path>\``）で **full path** 名指ししたか（`pnpm at:check-coverage --strict` が緑か）。
- [ ] spec を rename / 削除したとき、その path を参照している AT doc を **全て** 追従更新したか（stale reference を残していないか）。
- [ ] AT-numbered でない smoke / fixture spec（`*.smoke.spec.ts`）は orphan guard の対象外で良いか（AT に縛られない test infra なら可）。
- [ ] guard の hook glob が **spec 側（`packages/e2e/tests/**`）も** 含むか（doc 側だけだと spec 追加で発火しない）。

## 既知の対処パターン

- **exact 双方向 guard**: `scripts/acceptance/coverage.ts` の `analyzeLinkage`。
  - `orphan-spec`: `packages/e2e/tests/at-*.spec.ts` の全 path が、いずれかの AT doc 本文に出現するか（forward）。
  - `stale-spec-ref`: AT doc が参照する全 `packages/e2e/tests/*.spec.ts` path が実在するか（backward）。
  - いずれも path 完全一致で heuristic を含まないため `--strict` で gating できる。
- **CI / hook gating**: lefthook の `at-check-coverage`（glob に `packages/e2e/tests/**` を追加）+ `scripts` vitest プロジェクト（`coverage.test.ts`）が CI mirror。
- enumerable な linkage は機械化し、AT 番号の slug 揺れのような non-enumerable な drift も path 一致で機械検出に寄せる（heuristic な番号・slug マッチに頼らない）。

## 関連テスト

- `scripts/acceptance/coverage.test.ts`（`analyzeLinkage` の単体 + `analyzeRepo` の temp-repo 統合で orphan / stale を検出）
