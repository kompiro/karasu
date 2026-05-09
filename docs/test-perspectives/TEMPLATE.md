---
id: TPL-YYYYMMDD-NN
title: "観点を1行で表現"
status: active
date: YYYY-MM-DD
applicable_to:
  - "この観点が適用される範囲"
discovered_from:
  - issue: "#NNNN"
  # - root_cause_adr: "ADR-XXXXXXXX-XX"
  # - root_cause_file: "path/to/file.ts:LINE"
related_to: []
topic: core-concepts
scope:
  packages: []
---

# TPL-YYYYMMDD-NN: 観点を1行で表現

## 観点

何を検証すべきかを、再利用可能な抽象度で記述する。具体実装に閉じた書き方ではなく、別の機能でも適用できる原則として書く。

## 想定される失敗モード

この観点が見落とされた場合に、どのような形で失敗が現れるか。具体例があれば、それも記述する。

## チェックリスト

新機能の実装/修正時に、以下を確認する:

- [ ] チェック項目1
- [ ] チェック項目2
- [ ] チェック項目3

3〜5項目に絞る。多すぎると使われない。

## 既知の対処パターン

過去にこの問題を解決した方法があれば、ここに記述する。なければ「（未確立）」と記す。

## 関連テスト

この観点を検証する既存のテストがあれば、ここにパスを記述する。
