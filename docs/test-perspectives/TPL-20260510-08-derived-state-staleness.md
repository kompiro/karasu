---
id: TPL-20260510-08
title: "派生 view / panel の memoization は source state の変化次元すべてを key に含める"
status: active
date: 2026-05-10
applicable_to:
  - "AST / compile 結果から派生したデータを受け取り、UI に表示する panel / view / hook"
  - "memoization・cache・前回値保持で再計算をスキップするコンポーネント"
  - "編集 → 再 compile → 表示更新 のパイプラインを持つ機能"
known_consumers:
  - node-detail-panel
  - warning-panel
  - use-system-view
discovered_from:
  - issue: "#1032"
  - issue: "#891"
  - root_cause_file: "packages/core/src/index.ts:664"
  - root_cause_file: "packages/app/src/hooks/useSystemView.ts"
related_to: []
topic: app-ui
scope:
  packages:
    - app
    - core
---

# TPL-20260510-08: 派生 view / panel の memoization は source state の変化次元すべてを key に含める

## 観点

`.krs` 編集 → 再 compile → 派生 view / panel への反映、というパイプラインで、**「source は変わったが派生先が更新されない」** タイプのバグが繰り返し起きる。原因は概ね 3 つのいずれか:

1. **memoization key の不足** — panel が `nodeId` だけを key にしており、`nodeMetadata` の中身が変わっても再計算されない（#1032 のケース）
2. **publish 経路の取りこぼし** — recompile は走るが、その結果が React state に push されない（debounce drop / ref-stale closure / 条件分岐で publish がスキップされる）（#891 missing-warning ケース）
3. **clear 経路の不在** — 新しい結果は publish されるが、前回の結果が残る（差分マージで「消えたエントリ」を扱わない）（#891 stale-warning ケース）

これらは **方向（増えるバグ / 消えるバグ）** で別物に見えるが、根は同じ「source state の変化次元のうち、どれが派生先の更新を駆動するか」を設計時に列挙していないこと。

## 想定される失敗モード

- 編集 → reopen で **古い内容が表示** され続ける（stale-content）
- 編集で本来出るべき表示が **遅れて出る / 出ない**（missing-update）
- 編集で本来消えるべき表示が **残る**（stale-clear）
- 「タブを切り替えると治る」「ファイルを開き直すと治る」など **副作用的な再描画でしか直らない** 形で観測される

特に怖いのは「片方向だけ壊れる」パターン: invalid → valid 編集では消える / valid → invalid 編集では出ない、のように一方向のテストだけだと見つからない。

## チェックリスト

派生 view / panel / hook を実装するとき、以下を確認する:

- [ ] 派生先の表示を駆動する **入力次元** がすべて列挙されているか（`nodeId` だけでなく `nodeMetadata` の中身、`compile result version`、`displayMode` など）
- [ ] memoization / `useMemo` / `useEffect` の依存配列がそれら全次元を含んでいるか（reference equality だけで済むか、deep な version key が要るか）
- [ ] recompile 結果の **publish が無条件** か（debounce drop / 条件 skip / ref stale で落ちないか）。落ちうる経路にはログまたはテストを置く
- [ ] **両方向**（追加された / 消えた / 変わった）の編集を 1 つの test で連続適用し、派生先がそのたびに正しく更新されることを assert しているか
- [ ] 同じ source 状態を消費する複数の派生先（panel / 警告 / legend / matrix）の更新タイミングが揃っているか（片方だけ stale にならないか）

## 既知の対処パターン

- panel 側を `nodeId` で memoize するのではなく、**メタデータの version 番号 / object reference / hash** を一緒に key にする。`buildNodeMetadata` を呼ぶ側で同一性が壊れるなら、それで十分
- recompile 結果を React state に publish する経路を **1 箇所に集約** し、そこにログ / メトリクスを置く。複数の経路から publish していると debounce drop の原因になりやすい
- warning / diagnostic のような「リスト系」では、**前回リストを完全に置き換える**（差分マージしない）方針を default とする。差分マージするなら「消えたエントリの除去」を必ず実装する
- テストは **invalid → valid → invalid → valid** の 4-step を 1 つの test に押し込み、各 step で観察可能な数（warning count / panel content）を assert する

## 関連テスト

- `packages/app/src/components/NodeDetailPanel.test.tsx`
- `packages/app/src/components/WarningPanel.test.tsx`
- `packages/app/src/hooks/useSystemView.test.tsx`
