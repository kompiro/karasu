---
id: ADR-20260720-01
title: formatter の top-level 網羅は手で列挙せず `KrsFile` から導出して型と test で強制する
status: accepted
date: 2026-07-20
topic: parser
related_to: [ADR-20260410-02, ADR-20260422-05, ADR-20260422-04, ADR-20260713-01, ADR-20260714-02]
assumptions:
  - "symbol: packages/core/src/formatter/formatter.ts :: Printer"
  - "grep: packages/core/src/formatter/formatter.ts :: const topLevel"
  - "file: packages/core/src/formatter/formatter-top-level-coverage.test.ts"
  - "symbol: packages/core/src/types/ast.ts :: createEmptyKrsFile"
---

# ADR-20260720-01: formatter の top-level 網羅は手で列挙せず `KrsFile` から導出して型と test で強制する

- **日付**: 2026-07-20
- **ステータス**: 決定済み
- **関連**:
  - Issue: [#2076](https://github.com/kompiro/karasu/issues/2076)（`karasu fmt` が top-level `boundary` を無言で削除する）
  - 実装 PR: (このコミットの PR)
  - ADR: [ADR-20260410-02](20260410-02-krs-formatter.md)（`.krs` フォーマッター — 本 ADR が網羅性の担保方法を追加）、[ADR-20260422-05](20260422-05-top-level-infra-rendering.md) / [ADR-20260422-04](20260422-04-top-level-service-rendering.md)（top-level infra / service の受理 — 今回落ちていた構文の出所）、[ADR-20260713-01](20260713-01-notation-promotion-gate.md)（experimental notation の gate）、[ADR-20260714-02](20260714-02-reverse-architecture-harness.md)（`boundary` を生成し `fmt` を必須ステップに持つ harness — 被害の発見経路）
  - AT: [2076-fmt-top-level-round-trip.md](../acceptance/2076-fmt-top-level-round-trip.md)
  - TPL: [TPL-20260510-02](../test-perspectives/TPL-20260510-02-round-trip-guarantee.md)（round-trip 保証 — 本 ADR で「網羅性も round-trip の一部」を追記）

## 背景

`karasu fmt` が top-level `boundary` ブロックを無言で削除していた（[#2076](https://github.com/kompiro/karasu/issues/2076)）。`render` は同じファイルをエラーなく受理するため、parser は受理し renderer は使うが formatter だけが捨てる、という非対称が生じていた。

Issue の当初仮説は「boundary の出力が organization のコードパスに coupling している」だったが、実測すると**そもそも boundary の出力コードが存在しない**。`organization` が生き残るのは、単にそれが列挙されている側だったからにすぎない。

原因は `Printer.printFile` の一箇所である。top-level ブロックを

```ts
const topLevel = [...file.systems, ...file.services, ...file.domains, ...file.deploys, ...file.organizations]
```

と**手で列挙**しており、`KrsFile` が持つ 11 個の配列プロパティのうち 5 個しか含んでいなかった。実測で確認した欠落は 6 構文:

| 構文 | `fmt` 後 |
| --- | --- |
| `boundary` | 削除（Issue 報告） |
| `legend` | 削除 |
| `client` / `database` / `queue` / `storage` | 削除 |

被害は報告分より広い。top-level infra ブロックは `karasu translate --from db` が設計上出力する形（[ADR-20260422-05](20260422-05-top-level-infra-rendering.md)）であり、それだけで構成されたファイルに `fmt` をかけると**ファイル全体が空になった**。`boundary` の側も、reverse-architecture harness（[ADR-20260714-02](20260714-02-reverse-architecture-harness.md)）が可読性のために生成し、SKILL.md が `karasu fmt` を必須ステップに置いているため、生成物が harness 自身の手順で毎回削られていた（spike [#1991](https://github.com/kompiro/karasu/issues/1991) の dog-fooding 中に発覚）。

この欠落は 3 年越しに見つかったのではなく、**構文が増えるたびに再発してきた**。列挙リストは `boundary`（P2b）・`legend`・infra 昇格のいずれの PR でも更新されず、どの PR のレビューでも指摘されなかった。原因を「今回の 6 構文」に置くと同じことがもう一度起きる。

## 決定

### 1. 6 構文すべてを修正する（Issue のスコープを広げる）

`boundary` だけを直さない。根本原因が同一の一箇所であり、`fmt` の受け入れ基準は Issue 本文が述べるとおり「parser が受理する構文をすべて round-trip する」であるため、部分修正は基準を満たさない。`client` / infra は `KrsNode` なので既存の `renderNode` がそのまま使える（列挙への追加のみ）。`boundary` / `legend` は新規に renderer を書く。

### 2. 網羅性の期待集合を `KrsFile` から**導出**する

「6 個テストを足す」で終わらせない。テストが列挙する構文の集合と実装が列挙する集合が、**同じ人間の同じ思い込み**から生まれる限り、次の構文でまた抜ける。よって期待集合を型・スキーマ側から機械的に導出し、二重にガードする:

- **実行時**: `createEmptyKrsFile()` の配列プロパティを `Object.keys` で走査し、fixture 表のキー集合と `toEqual` で突き合わせる。fixture のない top-level 配列があればテストが落ちる
- **型**: fixture 表を `Record<ArrayKeys<KrsFile>, string>` に代入し、キー欠落を `tsc --noEmit` で落とす

加えて各 fixture は「その配列を実際に非空にするか」も assert する。fixture が構文を取り違えて別物を測っていた場合も検出するため。

これにより、`KrsFile` に新しい top-level 配列を足した人は、formatter に配線するまで**テストか typecheck のどちらかで必ず止まる**。ガードが効くことは、修正を部分的に revert して 2 テストが落ちることを確認済み。

### 3. `boundary` の label はプロパティ位置に正規化する

parser は header 位置（`boundary g "G" {`）とプロパティ位置（`label "G"`）の両方を受理し、どちらも同じ AST（`label` フィールド）になる。formatter は後者に正規化する。`organization` / `team` / `member` と同じ形になり、出力が一意（= idempotent）になるため。AST は同一なので round-trip 保証は保たれる。header 位置で書いた author の diff が 1 行動くのは許容する。

### 4. TPL は新設せず TPL-20260510-02 を拡張する

3-Yes ルール（横展開しうる / 構造的に再発しうる / 既存 TPL に未掲載）のうち第 3 項を満たさない。[TPL-20260510-02](../test-perspectives/TPL-20260510-02-round-trip-guarantee.md) が round-trip 保証を既に所有しているため、そこに「**網羅性も round-trip の一部**」という節・チェックリスト項目・対処パターンを追記する。近い内容の TPL を 2 本置くと、次に参照する人がどちらを見ればよいか分からなくなる。

## 却下した案

### `boundary` のみを修正する

Issue のタイトルどおりの最小修正。却下。同じ一行が原因の欠落を 5 つ残すことになり、とくに「infra だけのファイルが空になる」は `translate` 経路の実害としてより重い。修正コストの差もほぼない（列挙への 1 語追加）。

### 実行時テストのみ（型ガードを置かない）

fixture 表と `createEmptyKrsFile()` の突き合わせだけでも欠落は捕まる。却下ではないが不十分と判断した。型側のガードは `pnpm typecheck` という**テストより手前・より速い**段階で落ち、CI を待たずに気づける。コストは 5 行程度なので両方置く。

### `printFile` を `KrsFile` のキー走査で書き直し、列挙自体を無くす

「列挙するから漏れる。ならば `Object.entries(file)` を走査して block らしきものを全部出せばよい」。却下。出力順序（`@import` → `import` → ブロック群）と、配列ごとに異なる renderer の対応付けが暗黙になり、`ownerIndex` 等の派生 Map や非ブロック配列を除外する条件も動的判定になる。**壊れ方が静かになる**方向の変更であり、今回の教訓と逆行する。列挙は明示のまま残し、列挙漏れを機械検出する方を採った。

### spec 側で `boundary` を非 experimental に昇格させて対応する

`boundary` は experimental notation（[ADR-20260713-01](20260713-01-notation-promotion-gate.md)）だが、experimental であることは `fmt` が受理済み構文を削除してよい理由にならない（Issue 本文の指摘どおり）。昇格の判断は本件と独立であり、[#1822](https://github.com/kompiro/karasu/issues/1822) の promotion gate で別途扱う。

## 影響

- `karasu fmt` / `serializeKrsFile` の出力に、これまで欠落していた 6 構文が現れる。既存ファイルに対しては**内容が増える方向**の差分であり、削られていたものが戻るだけなので破壊的変更ではない
- `serializeKrsFile` は inline share（`share/synthesize.ts`）と `karasu subtree` が使う。これらの出力にも top-level infra / boundary / legend が載るようになり、共有リンク先で欠けていた情報が復元される
- `.changeset` は `@karasu-tools/core` / `karasu` の patch（利用者に影響するバグ修正）
