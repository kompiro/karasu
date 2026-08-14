---
id: ADR-2456
title: LSP の position drift は position encoding ではなく vscode-jsonrpc の二重コピーだった
status: accepted
date: 2026-08-13
topic: vscode
related_to: [ADR-2447, ADR-2333, ADR-2318]
scope:
  packages: [lsp, vscode, vscode-e2e]
  concerns: [dependencies, ci]
assumptions:
  - "file: packages/vscode/src/protocol-request-identity.test.ts"
  - "symbol: packages/lsp/src/protocol.ts :: PositionOfNodeRequest"
  - "grep: .github/dependabot.yml :: vscode-languageclient"
---

# ADR-2456: LSP の position drift は position encoding ではなく vscode-jsonrpc の二重コピーだった

- **日付**: 2026-08-13
- **ステータス**: 決定済み
- **関連**:
  - Issue: [#2456](https://github.com/kompiro/karasu/issues/2456)（本 ADR で close）/ [#2337](https://github.com/kompiro/karasu/issues/2337) の scope 4
  - 直前の記録: [ADR-2447](2447-dependabot-triage-2026-08-10.md)（4 状態の対照表。本 ADR はその推論を訂正する）
  - 症状を消した PR: [#2453](https://github.com/kompiro/karasu/pull/2453)（LSP 両側を 10.x へ）
  - 対照実験になった Dependabot PR: [#2432](https://github.com/kompiro/karasu/pull/2432) / [#2433](https://github.com/kompiro/karasu/pull/2433) / 先行 [#2328](https://github.com/kompiro/karasu/pull/2328)
  - 観点: [TPL-2456](../test-perspectives/TPL-2456-module-instance-scoped-identity.md)
  - ソース: `packages/lsp/src/protocol.ts`, `packages/vscode/src/protocol-request-identity.test.ts`

## 背景

[ADR-2447](2447-dependabot-triage-2026-08-10.md) は LSP 9 → 10 の片側ずつの Dependabot PR を
対照実験として扱い、ExTester の同じ 3 件（AT-0037-9 / AT-0038 TC-04 / AT-0039 TC-03）が
落ちる 4 状態を記録した。#2453 が両側を 3.18.2 に揃えて症状は消えたが、**機構は未証明**の
まま #2456 に切り出された。

ADR-2447 が立てた仮説は 2 つある。「落ちるのは position を送り出す側が受け取る側より
新しい場合」という規則性と、その説明としての **LSP 3.18 の position encoding negotiation**。
本 ADR はどちらも否定する。

ExTester は `pull_request` でしか動かず aarch64 devcontainer では実行できないため、
VS Code を介さない純 Node のハーネス（`vscode-languageserver-protocol` の 3.17.5 / 3.18.2 を
別ディレクトリに入れ、custom request を実際に往復させる）で再現を取った。

## 決定

**機構は「extension バンドル内に `vscode-jsonrpc` のコピーが 2 つ存在すること」と確定する。**
position encoding は無関係であり、**`positionEncoding` を明示宣言しない**。
再発検出は `packages/vscode/src/protocol-request-identity.test.ts` の drift guard が担う。

## 理由

### 機構: `ParameterStructures` は参照同一性で判定される

`packages/lsp/src/protocol.ts` は `vscode-languageserver-protocol` の `RequestType` で
`karasu/positionOfNode` / `karasu/nodeAtPosition` を組み立て、この module は extension
（LSP client 側）にもバンドルされる。`RequestType` は `parameterStructures` フィールドに
`vscode-jsonrpc` の module スコープで定義された singleton を持つ。

送信側の `computeSingleParam` は、そのフィールドを **`switch` による参照比較**で振り分ける:

```js
switch (parameterStructures) {
  case messages_1.ParameterStructures.auto:       /* ... */
  case messages_1.ParameterStructures.byName:     /* ... */
  case messages_1.ParameterStructures.byPosition: /* ... */
  default:
    throw new Error(`Unknown parameter structure ${parameterStructures.toString()}`);
}
```

`RequestType` を作ったコピーと `vscode-languageclient` が読み込むコピーが別物だと、
どの `case` にも一致せず `default` に落ちる。したがって **`karasu/*` の全リクエストが
wire に出る前に throw する**。

純 Node ハーネスでの 4 通り（`ParameterStructures.is()` は `computeSingleParam` と同じ
参照比較を行う）:

| connection | `RequestType` の出所 | 結果 |
| --- | --- | --- |
| 3.17.5 | 3.17.5 | 成功 |
| 3.18.2 | 3.18.2 | 成功 |
| 3.18.2 | 3.17.5 | `Unknown parameter structure auto` |
| 3.17.5 | 3.18.2 | `Unknown parameter structure auto` |

**これはバージョンの問題ではない。** `computeSingleParam` と `ParameterStructures` の
実装は `vscode-jsonrpc` 8.2.0 と 9.0.1 で意味的に同一で、コピーが 2 つあれば
どの組み合わせでも同じことが起きる。

### この機構は記録済みの 4 状態を全て説明する

判定条件は「`protocol.ts` が解決する `vscode-languageserver-protocol` と
`vscode-languageclient` が解決するそれが同一コピーか」の 1 つだけである。
lockfile の実物で確認した:

| 状態 | `protocol.ts` 側 | client runtime 側 | 同一 | ExTester |
| --- | --- | --- | --- | --- |
| #2453 以前の main | 3.17.5 | 3.17.5 | ○ | 通る |
| #2328（protocol のみ 3.18.2） | 3.18.2 | 3.17.5 | × | 3 件落ちる |
| #2432（server のみ 10.1.0） | 3.17.5 | 3.17.5 | ○ | 通る |
| #2433（client のみ 10.1.0） | 3.17.5 | 3.18.2 | × | 3 件落ちる |
| #2453（両側 10.x） | 3.18.2 | 3.18.2 | ○ | 通る |

#2432 が通ったのは「server だけ上げたから」ではない。`packages/lsp` の
`vscode-languageserver-protocol` は直接依存として `3.17.5` に解決されたままで、
`vscode-languageclient@9` と同じコピーを共有し続けたからである。
ADR-2447 の「送り出す側が新しいと落ちる」は 4 点の偶然であって規則ではない。

### 落ちる 3 件と通る 18 件の内訳も一致する

standard な LSP 機能（diagnostics / hover / definition / formatting / document symbol）の
`RequestType` は `vscode-languageclient` 自身のコピー由来なので影響を受けない。
落ちるのは karasu の custom request を使う経路だけで、それが 3 件と正確に一致する。

- `handleNavigate` は `await client.sendRequest(PositionOfNodeRequest, ...)` が reject し、
  呼び出し側が `void` で捨てるためカーソルが動かない → AT-0038 TC-04 / AT-0039 TC-03
- cursor watcher は `.then()` に到達せず `previewPanel.highlight` が呼ばれない → AT-0037-9

### position encoding は機構ではなく、宣言しても無意味

`general.positionEncodings` は 3.18 ではなく **3.17 で導入**済みで、両バージョンで差がない。

- `vscode-languageclient` 9 / 10 はどちらも `generalCapabilities.positionEncodings = ['utf-16']`
  を宣言する（実装が同一行）
- `vscode-languageserver` 9 / 10 は `positionEncoding` を一切扱わない（完全な pass-through）
- client は server が `utf-16` 以外を宣言すると `Unsupported position encoding` で throw する

したがって karasu の server が書ける値は `utf-16` しかなく、それは省略時の交渉結果と
同じである。**明示宣言は no-op** なので入れない。加えて、落ちていた 3 件の fixture は
ASCII のみで、encoding 差では症状が起こりえない。

### 検出は「解決の一意性」で行い、ExTester には依存させない

真の不変条件は module 解決の段階で確定しており、VS Code の実行は要らない。
`packages/vscode/src/protocol-request-identity.test.ts` は
`vscode-languageclient` 経由で解決した `ParameterStructures` が
`@karasu-tools/lsp/protocol` の `RequestType` を受理するかを検証する
（健全時 `true` / 二重コピー時 `false` を実測で確認済み）。
これで `pnpm test` が原因そのものを名指しで落とす。

## 却下した案

### `positionEncoding: 'utf-16'` を server capabilities に明示する

#2456 の scope 2 が問うていた案。上記のとおり交渉結果を変えず、
`utf-16` 以外を書けば client が接続を拒否する。**守るべき不変条件を持たない宣言**は、
将来の読み手に「ここで encoding を選べる」という誤った余地を示すだけなので入れない。

### `RequestType` をやめ、method 名の文字列 + 独自の型付き descriptor で持つ

コピー境界をオブジェクトが跨がなくなるので、この失敗を検出ではなく**発生不能**にできる。
`protocol.ts` が `vscode-languageserver-protocol` に依存しなくなり、
「`/node` から import するとサーバ実装ごとバンドルされる」という現在の注意書きも消える。

見送った理由は、置き換わるのが ExTester でしか通らないランタイム経路であり、
得られるのが drift guard と同じ「二重コピーで壊れない」保証だからである。
upstream の型付き `RequestType` を捨てる対価に見合わない。二重コピーが再発した記録が
付いたら再評価する。

### `.github/dependabot.yml` の `lsp` グループ（#2453）だけを再発防止とする

グループは 4 パッケージを 1 つの PR で提示するが、`vscode-languageclient` と
`vscode-languageserver` が別々の protocol マイナーに解決される可能性は残る。
グループは提示の単位であって、解決の一意性を保証しない。

## 影響

- `packages/lsp/src/protocol.ts` の冒頭コメントを訂正した。旧コメントは
  「dispatch は method 名の文字列で行うので `RequestType` の class identity は無関係」と
  書いており、**受信側については正しいが送信側については誤り**だった。この記述が
  #2337 の時点で class identity 説を除外させ、機構の特定を遅らせた
- ExTester 側の 2 つの欠陥も同 PR で修正した。どちらも「機構が特定されなかった」ことの
  直接の原因である
  - `at-0039-detail-panel.test.ts`: `driver.wait` の第 3 引数は呼び出し時に評価される
    ただの文字列なので、`lastLine` の補間が常に初期値 `0` を報告していた。
    「positions arrive, but wrong」という #2456 の前提はここから来ていた
  - `at-0038-cmd-click-hint.test.ts` TC-03: AT-0037-9 がカーソルを 2 行目に置いた状態で
    2 行目への jump を assert していたため、`positionOfNode` が完全に死んでいても
    green だった。各クリック前にカーソルを退避し、退避できたことを確認してから
    assert するようにした
- `positionEncoding` を宣言しない判断は、UTF-8 前提の非 VS Code クライアントが
  現れた場合に再評価が要る。現時点で karasu の client は VS Code 拡張のみ
