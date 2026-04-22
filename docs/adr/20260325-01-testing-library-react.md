---
id: ADR-20260325-01
title: コンポーネントテストに @testing-library/react を採用する
status: accepted
date: 2026-03-25
related_to:
  - ADR-20260324-01
scope:
  packages:
    - app
  domains:
    - testing
---

# ADR-20260325-01: コンポーネントテストに @testing-library/react を採用する

- **日付**: 2026-03-25
- **ステータス**: 決定済み
- **関連**: Issue #40, ADR-20260324-01

## 背景

ADR-20260324-01 で Playwright 等の E2E フレームワークは採用しないと決定した。
一方、PR #27 で追加された `onClearHighlight` コールバックのような「クリック操作→コールバック呼び出し」という
React コンポーネントの振る舞いは、Pure TS のユニットテストでは検証できない。

Reducer レベルの状態遷移は既存のユニットテストでカバーされているが、
「実際に DOM 要素をクリックしたときにコールバックが呼び出されるか」という
コンポーネントの振る舞いを自動検証する手段が不足していた。

## 決定

`@testing-library/react`（および必要に応じて `@testing-library/user-event`）を
`packages/app` の devDependency として採用する。

jsdom 環境は `// @vitest-environment jsdom` アノテーションでテストファイル単位にスコープし、
既存の Pure TS テストには影響を与えない。

## 理由

- **React コミュニティのデファクトスタンダード**: React 19 に対応しており、メンテナンスが活発
- **振る舞い中心のテスト設計**: 実装詳細（state, ref）ではなく、ユーザー視点の操作（クリック）と
  その結果（コールバック呼び出し、CSS クラス付与）を検証する設計思想が karasu の QA 方針と合致する
- **既存テストへの影響なし**: jsdom 環境をファイル単位にスコープできるため、
  Pure TS テストは引き続き Node 環境で実行される
- **軽量**: Playwright（E2E）と異なりフルブラウザ起動が不要で、CI での実行コストが低い
- **Vitest との親和性**: `vitest` と `@testing-library/react` の組み合わせは公式にサポートされている

## 再評価の条件

以下のいずれかが当てはまる場合は、本決定を見直す。

- jsdom の限界（CSS 計算・レイアウト依存のテスト）により検証できないケースが増えた
- ADR-20260324-01 が見直され、E2E フレームワークが採用された
