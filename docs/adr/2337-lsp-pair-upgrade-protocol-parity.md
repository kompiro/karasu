---
id: ADR-2337
title: LSP は client と server を同時に上げ、protocol 版の一致を不変条件として維持する
status: accepted
date: 2026-08-13
topic: build
scope:
  packages: [lsp, vscode]
  concerns: [dependencies, ci]
related_to: [ADR-2333, ADR-2447, ADR-2318]
assumptions:
  - "grep: packages/lsp/package.json :: \"vscode-languageserver\": \"\\^10.1.0\""
  - "grep: packages/vscode/package.json :: \"vscode-languageclient\": \"\\^10.1.0\""
  - "grep: .github/dependabot.yml :: vscode-languageserver-textdocument"
  - "symbol: packages/lsp/src/diagnostics.test.ts :: messageOf"
  - "grep: packages/lsp/tsconfig.json :: \"types\": \\[\"node\"\\]"
  - "grep: packages/vscode/tsconfig.json :: \"types\": \\[\"node\"\\]"
---

# ADR-2337: LSP は client と server を同時に上げ、protocol 版の一致を不変条件として維持する

- **日付**: 2026-08-13
- **ステータス**: 決定済み
- **関連**:
  - 引き金 Issue: [#2337](https://github.com/kompiro/karasu/issues/2337)
  - 実装 PR: [#2453](https://github.com/kompiro/karasu/pull/2453)（spike は [#2449](https://github.com/kompiro/karasu/pull/2449)）
  - 却下された前段: [ADR-2333](2333-dependabot-triage-2026-08-04.md)（#2328 を却下し本 Issue を起票）
  - 保留の経緯: [ADR-2447](2447-dependabot-triage-2026-08-10.md)（#2432 / #2433 を保留した回）
  - group 化の先例: [ADR-2318](2318-dependabot-triage-2026-08-03.md)（react group）
  - 積み残し: [#2456](https://github.com/kompiro/karasu/issues/2456)（position drift の機構特定）
  - CI の穴: [#2446](https://github.com/kompiro/karasu/issues/2446)（lsp / vscode が typecheck されていない）
  - コード: `packages/lsp/package.json`, `packages/vscode/package.json`, `.github/dependabot.yml`, `packages/lsp/src/diagnostics.test.ts`

## 背景

[ADR-2333](2333-dependabot-triage-2026-08-04.md) は `vscode-languageserver-protocol` 3.17.5 → 3.18.2
（[#2328](https://github.com/kompiro/karasu/pull/2328)）を却下した。ExTester の 3 件
（AT-0037-9 / AT-0038 TC-04 / AT-0039 TC-03）が落ち、症状が **position が動かないのではなく
間違った行に着く**というものだったためである。当時は機構を特定できず、`vscode-languageserver`
の major とセットで扱う Issue として本 #2337 を起こした。

その後 [ADR-2447](2447-dependabot-triage-2026-08-10.md) の回に、Dependabot が
`vscode-languageserver` と `vscode-languageclient` を**片側ずつ 2 本の PR**
（#2432 / #2433）で提示した。結果としてこれが対照実験になった。

## 決定

**client と server を同時に 10.x へ上げ、両側の protocol を 3.18.2 に揃える。
片側だけの更新は採らない。** この不変条件を Dependabot の `lsp` group で構造的に守る。

| パッケージ | 版 |
| --- | --- |
| `vscode-languageserver`（lsp） | `^10.1.0` |
| `vscode-languageserver-protocol`（lsp、直接依存） | `^3.18.2` |
| `vscode-languageserver-textdocument`（lsp） | `^1.0.13` |
| `vscode-languageclient`（vscode） | `^10.1.0` |

protocol / `vscode-jsonrpc` / `vscode-languageserver-types` /
`vscode-languageserver-textdocument` は lockfile 上いずれも 1 版に畳まれる。

## 理由

### 対照実験で「壊れる条件」が絞れた

ExTester の失敗は 4 状態を通じて毎回同じ 3 件・同じメッセージだった。

| 状態 | server 側 protocol | client 側 protocol | ExTester |
| --- | --- | --- | --- |
| 変更前の main | 3.17.5 | 3.17.5 | 通る |
| #2328（protocol 直接依存のみ 3.18.2） | runtime 3.17.5・`packages/lsp` の import 3.18.2 | 3.17.5 | 3 件が落ちる |
| #2432（server のみ 10.1.0） | 3.18.2 | 3.17.5 | **全部通る** |
| #2433（client のみ 10.1.0） | 3.17.5 | 3.18.2 | 3 件が落ちる |
| 本決定（両方 10.1.0） | 3.18.2 | 3.18.2 | **全部通る** |

**版が食い違うこと自体は引き金ではない。** server 3.18.2 × client 3.17.5 の skew は通る。
落ちる 2 例はどちらも「**position を送り出す側が 3.18 で、受け取る側が 3.17.5**」であり、
#2328 も `packages/lsp` のコードだけが 3.18.2 を掴み、実際に connection を張る runtime は
3.17.5 のままという同じ形だった。

### 機構は特定していない

上記は「壊れる条件」であって「なぜずれるか」ではない。LSP 3.18 の position encoding
negotiation が原因という仮説は症状（計算されないのではなくずれて計算される）と整合するが、
本決定では証明していない。**症状が消えたことと原因が分かったことを混同しない**ため、
機構の特定は [#2456](https://github.com/kompiro/karasu/issues/2456) に分離した。

### group だけでは守れなかったものが、10.x で守れるようになった

ADR-2333 は「grouping では解決しない」として group 化を却下した。`vscode-languageserver@9.0.1`
が protocol を完全固定しているため、major を取るまで protocol は上がらず、まとめて offer されても
状況が変わらなかったからである。**10.x に上げた今、その前提が消えたので group を入れた。**
却下の撤回ではなく、却下理由が解消したことによる実施である。

`vscode-languageserver-textdocument` も group に含めた。`vscode-languageclient@10` はこれを
exact pin で持つ（9 には無かった依存）ため、単独で来ると client が要求する版とずれる。
Dependabot の `patterns` は前方一致ではなく完全一致なので 1 行ずつ挙げる必要がある。

### 露出した 2 つの潜在バグは upgrade の副作用ではない

どちらも元からあった穴が、v9 の依存エッジが消えたことで見えるようになったものである。

1. **`Diagnostic.message` の型が `string | MarkupContent` に拡大**（LSP 3.18）。
   test の 12 箇所を upstream の `Diagnostic.getMessageString` 経由（`messageOf` ヘルパー）に
   統一した。karasu の server は常に string しか出さないので型だけの話である。
2. **`packages/lsp` と `packages/vscode` が `@types/node` を v9 経由で暗黙に受け取っていた。**
   どちらも `fs` / `path` / `url` / `Buffer` を import しているのに宣言していなかった。
   両パッケージに明示宣言と `types: ["node"]` を入れた。これは `packages/core` が
   pnpm 移行時（#318）に受けたのと同じ手当てで、当時 lsp / vscode が取り残されていた。

いずれも CI では検出されない（[#2446](https://github.com/kompiro/karasu/issues/2446)）。
検出したのは pre-push hook の `pnpm -r run typecheck` である。

## 却下した案

### #2432（server のみ）を単独でマージする

全 CI green なので技術的には可能だった。**却下** — protocol が 1 版に畳まれるのは両方
上げたときだけで、本 Issue の到達状態に届かない。加えて server だけ先に入れると、次の作業が
「9 → 10 のペア upgrade」ではなく「skew 状態からの復旧」になり、上表の対照条件を壊す。
dev 体験に効く更新でもなく、急ぐ利得がなかった。

### 直接依存の `vscode-languageserver-protocol` を exact pin にする

**見送り（本 ADR の範囲外）** — `packages/lsp` は protocol を `^3.18.2` の caret で直接持つ。
`vscode-languageserver@10.1.0` は同じものを `3.18.2` の exact pin で持つため、
**protocol 3.19 が server の対応リリースより先に出ると、caret 側だけ先行して #2328 と
同じ形が再来しうる**。exact pin にすればこの経路は消えるが、機構が未特定のまま対処法を
固定するより、#2456 で原因が判明してから決めるほうが筋が通る。#2456 に hardening 候補として
引き継いだ。なお本決定の時点で protocol の最新は 3.18.2 であり、ずれる先は存在しない。

## 影響

- 利用者への影響: なし。両側が一致している状態は変更前後で保たれており、position drift は
  skew したときだけ現れる潜在挙動だった。`karasu-vscode` には patch の changeset を入れている。
- 実機確認: エディタ ↔ プレビューのカーソル同期が双方向で動くこと。自動側は ExTester 18 passing
  で担保済み。
- 今後の Dependabot: LSP 4 パッケージは 1 つの PR で届く。片側だけの PR は原則出ない。
