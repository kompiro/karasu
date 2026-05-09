---
id: TPL-20260510-03
title: "列挙型メンバー追加時に消費側の網羅性を型で強制する"
status: active
date: 2026-05-10
applicable_to:
  - "Discriminated union や enum like なリテラル union を扱う全コード（activeView / diagramType / NodeKind / ToolType など）"
discovered_from:
  - issue: "#1094"
  - root_cause_file: "packages/app/src/hooks/useHistoryNavigation.ts"
related_to: []
topic: navigation
scope:
  packages:
    - app
    - core
---

# TPL-20260510-03: 列挙型メンバー追加時に消費側の網羅性を型で強制する

## 観点

`activeView: "system" | "deploy" | "org" | "matrix"` のような **リテラル union 型** を消費する場所が複数ある場合、新しいメンバーを追加したときに **すべての消費側を更新したことを TypeScript の型システムで保証** すべき。`if-else if` の連鎖や `default` 句は「未知の値を黙って既知の値として扱う」フォールバックを許してしまうため、列挙の追加漏れを silent にする。

#1094 では CRUD matrix タブを `DiagramTabBar` には追加したものの、`buildHash` / `parseHash`（`packages/app/src/hooks/useHistoryNavigation.ts`）の if-else 連鎖を更新し忘れ、URL hash 経由のタブ復元が動かなかった。`activeView` の取りうる値が複数ファイル / 複数関数で if-else 形式に散在しており、コンパイラに網羅漏れを検出させる仕組みがなかった。

## 想定される失敗モード

- 新しい列挙メンバーを追加した PR が型エラーなく通り、レビューでも見落とされる
- 一部の機能（URL hash / 永続化 / シリアライズ / 表示ラベル）でだけ新メンバーが扱われず、フォールバック先の既知値として silent に誤動作する
- バグの観測が「特定操作のときだけ挙動が違う」形になり、原因特定が難しい

## チェックリスト

新機能の実装/修正時に、以下を確認する:

- [ ] 列挙型のメンバーを追加するとき、その列挙を扱う全箇所をリポジトリ全体で grep で洗い出したか（型名・代表的なリテラル両方で）
- [ ] 各消費側で `switch` + `never` による exhaustive check か Discriminated Union の網羅性チェックが効いているか
- [ ] `else` 分岐や `default` 句が「想定外の値」を「既知の値」として扱っていないか（fallback の意図を明示しているか）
- [ ] フォールバック先が新しいメンバーを silent に正しくない値として扱わないか（例: 不明な値を `"system"` にフォールバックすると新メンバーがすべて system と誤認される）

## 既知の対処パターン

- `switch (value) { case ...: ...; default: { const _exhaustive: never = value; throw ... } }` で exhaustive にする
- `Record<ActiveView, T>` のような **キーが union と一致するマップ型** を使い、メンバー追加時に key 不足を型エラーにする
- if-else 連鎖は型システムによる網羅性検査が効かないため、列挙を扱う場面では **意識的に switch / Record に置き換える**

## 関連テスト

- `packages/app/src/hooks/useHistoryNavigation.test.ts`
