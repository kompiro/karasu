---
id: TPL-1522
title: "style 連動の diagnostic はシート不在の文脈（LSP 単一ドキュメント）での挙動を仕様化する"
status: active
date: 2026-06-12
applicable_to:
  - "stylesheet の内容を入力に取る warning / hint / diagnostic を追加・変更するとき"
  - "import で結合した他ファイルの宣言を入力に取る diagnostic を追加・変更するとき（単一ドキュメント文脈では同じ「入力の一部が無い」形になる）"
  - "diagnostic の発火条件・抑制条件に stylesheet 由来の情報（セレクタ・ルール・テーマ）を組み込むとき"
  - "analyze() / compile パイプラインの出力を新しい surface（editor 拡張・CI ツール等）に接続するとき"
discovered_from:
  - issue: "#1522"
  - issue: "#2082"
  - root_cause_file: "packages/lsp/src/diagnostics.ts:82"
related_to:
  - TPL-1386
  - TPL-1001
  - TPL-219
topic: core-concepts
scope:
  packages:
    - core
    - lsp
    - app
---

# TPL-1522: style 連動の diagnostic はシート不在の文脈（LSP 単一ドキュメント）での挙動を仕様化する

## 観点

`analyze()` は app / CLI ではプロジェクトの stylesheet 群を受け取るが、LSP の
単一ドキュメント文脈では `analyze(file, [])` — **シートなし**で呼ばれる。
stylesheet を入力に取る diagnostic は、この文脈差で挙動が **2 方向**に割れる:

1. **style 依存型** — stylesheet がなければ発火しようがない
   （`style-conflict`, `legend-ref-unresolved`）。LSP では単に出ない
2. **style 抑制型** — stylesheet は「出さない」判断にだけ使われる
   （`annotation-possible-typo` のセレクタ定義による抑制）。LSP では
   **抑制なしで発火**し、app より診断が増える

どちらの割れ方も設計上は許容しうるが、**どちらに割れるかを実装時に明示的に
決め、コード（当該 surface のコメント）に記録する**こと。決めずに出荷すると、
surface 間の診断差分が「意図された制約」なのか「バグ」なのか後から判別できない。

**import 結合型の diagnostic も同じ形の文脈差を持つ。** LSP は import を解決せず
1 ドキュメントだけを parse するので、他ファイルの宣言が入力から欠ける。ここで
「宣言が無い」を根拠に発火する検査（`*-target-not-found` 系 / `unresolved-edge-endpoint`）
は、単一ドキュメントでは**偽陽性しか生まない** — 欠けているのはモデルではなく入力である。
不足が過少報告にしかならない検査（`edge-endpoint-not-at-scope` /
`shared-infra-fan-in`）は抑制せず出す。抑制の判断は surface 側の filter でも
検査側の早期 return でもよいが、**どちらに置いたかを記録する**: `owns-target-not-found`
は「未解決 import が残る file では判定しない」を検査側（`validateOwnsReferences`）に
置いた（#2082。LSP の filter に足す形だと、同じ穴が app の single-file 経路に残る）。

現状の台帳（import 結合）:

| 診断 | 単一ドキュメントでの側 | 置き場所 |
| --- | --- | --- |
| `unresolved-edge-endpoint` | 抑制（偽陽性しか出ない） | LSP の filter |
| `owns-target-not-found` | 判定しない | 検査側（`validateOwnsReferences`, #2082） |
| `edge-endpoint-not-at-scope` | 出す（過少報告のみ） | — |
| `shared-infra-fan-in` | 出す（過少報告のみ） | — |
| `contains-target-not-found` | **未決定 — 偽陽性が出ている** | [#2410](https://github.com/kompiro/karasu/issues/2410) |
| `invalid-owns` | **未決定 — 偽陽性が出ている** | [#2410](https://github.com/kompiro/karasu/issues/2410) |

未決定の 2 件は上の原則からは抑制側に落ちるべきだが、まだ実装が追いついていない。
**この表に行が無い import 結合の診断を足してはならない** — 側を決めるまでが実装である。

## 想定される失敗モード

- style 抑制型の hint を追加した開発者が app でのみ動作確認し、editor では
  抑制が効かず診断が出続けることに利用者が先に気づく（#1521 → #1522 の経緯）
- 逆に style 依存型の warning を LSP でも出るものと誤解した利用者が
  「editor で警告が出ない」を bug として報告する
- 将来 LSP がワークスペース全体の stylesheet を読むようになったとき、
  どの diagnostic が文脈差前提で書かれていたか棚卸しできない

## チェックリスト

stylesheet を入力に取る diagnostic を追加・変更するとき:

- [ ] `analyze(file, [])`（シートなし）での発火・非発火を単体テストで固定したか
- [ ] 文脈差が生じる場合、style 依存型（LSP では出ない）か style 抑制型（LSP では抑制なしで出る）かを判断し、`packages/lsp/src/diagnostics.ts` の analyze() 呼び出し上のコメントに追記したか
- [ ] 文脈差を許容する根拠（severity の register、ケースの希少性など）を Issue または ADR に残したか
- [ ] app / LSP 両方の手動確認項目を AT 記録に含めたか（cross-surface — TPL-1001）
- [ ] import 結合型なら、単一ドキュメント文脈で偽陽性側に倒れるか過少報告側に倒れるかを判断し、抑制を surface の filter と検査側の早期 return のどちらに置いたか記録したか（#2082）

## 既知の対処パターン

- **コメントによる asymmetry の台帳化**: `packages/lsp/src/diagnostics.ts` の
  analyze() 呼び出し直上のコメントが、シート不在文脈の制約と既知の非対称
  （style 依存型 / style 抑制型の両方向）を列挙する単一の記録点になっている
  （#1522）。新しい文脈差はここに追記する
- **register による緩和**: 抑制なしで発火する側に割れる hint は info register
  （TPL-1386）に置き、誤発火の摩擦を下げる

## 関連テスト

- `packages/lsp/src/diagnostics.test.ts` — LSP 文脈（シートなし）での診断出力
- `packages/core/src/resolver/warnings.test.ts`（`annotation-possible-typo hint`）—
  シートあり / なし両方の抑制挙動
