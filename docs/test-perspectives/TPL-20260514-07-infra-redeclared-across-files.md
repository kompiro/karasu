---
id: TPL-20260514-07
title: "同名 database / queue / storage の再宣言は union merge、info 診断で surface する"
status: active
date: 2026-05-14
applicable_to:
  - "複数ファイルで同じ id の infra block (`database` / `queue` / `storage`) を宣言できる resolver"
  - "「視覚化はするが prescribe しない」事実を区別したい diagnostic レイヤ"
known_consumers:
  - import-resolver
discovered_from:
  - root_cause_file: "docs/spec/syntax.md#multi-file-import-semantics"
  - issue: "#1385"
  - root_cause_adr: "ADR-20260514-01"
related_to:
  - TPL-20260514-02
  - TPL-20260514-03
topic: resolver
scope:
  packages:
    - core
---

# TPL-20260514-07: 同名 database / queue / storage の再宣言は union merge、info 診断で surface する

## 観点

infra block (`database` / `queue` / `storage`) が複数ファイルで宣言されたら、resolver は:

- **同一インスタンス** (DAG 経由で同じファイルが 2 回到達): silent dedup（S5 と同じ shape）
- **別インスタンス・同 id**: union merge — children (table 等) を find-or-create で結合し、infra body プロパティは root-entry-wins (S3 と同じ shape) で reconcile。同時に `infra-redeclared-across-files` **info** 診断を発火する

ここで重要なのは register の選択: **error でも warning でもなく info**。karasu は共有 infra（複数 service が同じ DB を読み書きする状況）を **可視化** するが、それが Database-per-Service 原則違反かどうかは流派 / 文脈次第なので、resolver が prescribe しない。文言は事実先行で「複数ファイルで宣言されている、merge した」だけを伝える。

## 想定される失敗モード

- **register が `error` だと**: マイクロサービス移行途中で同じ DB を 2 ファイル両方で記述するユーザーが、強制的に片方を消す or 別 id にする必要に迫られる。実装の段階的進化を spec が阻む。
- **register が `warning` だと**: warning は「修正すべき」のニュアンスが強く、shared DB が意図された設計の場合に noise になり、警告抑制タグの議論が際限なく始まる。
- **identity dedup なしだと**: 同じ infra.krs を 3 つのスライスがそれぞれ import すると、3 倍に複製されて duplicate-* が誤発火する（DAG 再到達のクラシックバグ）。
- **info を表示しないと**: ユーザーが「あれ、なぜ merge されたの？」とコードを追う羽目になる。情報量が下がるのは UX 後退。

## チェックリスト

新しい infra-style ノード種別を追加する / 既存 infra の merge 規則を変更するときに確認する:

- [ ] **同一インスタンス**は黙って dedup される（DAG 経由）
- [ ] **別インスタンス・同 id** は union merge + `infra-redeclared-across-files` (info) を発火する
- [ ] **別インスタンス・別 id** はそれぞれ別ノードとしてマージ済みに並ぶ
- [ ] 文言は事実先行（「複数ファイルで宣言されている」「merged」）— 「smell」「anti-pattern」「Database-per-Service」のような流派用語は文言から外す
- [ ] LSP / App / CLI の表示パイプラインに `info` が通っており、`warning` より控えめに描画される

## 既知の対処パターン

- 専用 infra ファイル (例: `examples/multi-file-system/infra.krs`) に 1 度だけ宣言し、使う側のスライスから `import "infra.krs"` で取り込む。S2 (whole-file completeness) + S5 (DAG memoization) によりこのパターンでは info 診断が出ない。
- info 診断は既存の `error` / `warning` と別管理。`error` の存在で「描画不可」と判定する箇所では `info` を含めない（`PreviewPane` の `hasErrors` 判定が precedent）。
- 流派系 diagnostic を新規追加する際は、まず info で出して `docs/concepts*.md` から原理を再導出できるようにする。warning に「昇格」したくなったら、それ自体が prescription なので慎重に。

## 関連テスト

- `packages/core/src/fs/import-resolver.test.ts` の "S4.5: same-id infra reopen ..." 系ケース

## 派生元 spec

- `docs/spec/syntax.md` §「Multi-file import semantics」 S4.5
- ADR-20260514-01（spec の根拠）
- 設計 doc: `docs/design/karasu-position-on-style-prescriptions.md` (info severity 採用の経緯)
