---
title: karasu
template: splash
hero:
  tagline: 論理構造と物理構造を分離して表現する、テキストベースのアーキテクチャモデリングツール。C4 Model に触発されつつ独自の語彙を持つ。
  actions:
    - text: ガイドを読む
      link: guide/
      icon: right-arrow
      variant: primary
    - text: 構文リファレンス
      link: spec/syntax/
      icon: open-book
    - text: GitHub
      link: https://github.com/kompiro/karasu
      icon: external
---

## karasu とは

karasu（鴉）はテキストベースのアーキテクチャモデリングツールです。システム・
ドメイン・チーム・デプロイを `.krs` ファイルで記述すると SVG 図を生成します。
**論理構造**（何が存在し、どう関係するか）と**物理構造**（どこで動くか）を
分離して表現します。

- **[ガイド](guide/)** — サービス境界・チーム境界の設計、オンボーディング、進化。
- **[リファレンス](spec/syntax/)** — `.krs` / `.krs.style` の構文・タグ・アノテーション。
- **[コンセプト](concepts/)** — karasu の設計思想。
