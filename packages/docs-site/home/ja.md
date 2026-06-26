---
title: karasu
template: splash
hero:
  tagline: システムの論理・物理・組織を一つの言語で描き、チームとアーキテクチャを一緒に設計するためのテキストベース DSL。
  image:
    alt: karasu
    # Relative to the synced location src/content/docs/ja/index.md (one level
    # deeper than the en home, hence the extra ../ vs home/en.md).
    file: ../../../assets/karasu-logo.png
  actions:
    - text: ブラウザで試す
      link: https://karasu.kompiro.dev/
      icon: rocket
      variant: primary
    - text: ガイドを読む
      link: guide/
      icon: right-arrow
    - text: 構文リファレンス
      link: spec/syntax/
      icon: open-book
    - text: GitHub
      link: https://github.com/kompiro/karasu
      icon: external
    - text: DeepWiki
      link: https://deepwiki.com/kompiro/karasu
      icon: open-book
---

## karasu とは

karasu（鴉）はアーキテクチャのためのテキストベース DSL です。一つの `.krs`
言語で、システムの 3 つの次元 — **論理構造**（サービスやドメインと、その関係）、
**物理構造**（それらを realize するデプロイ単位）、**組織構造**（それらを所有
するチーム） — を記述し、チームとアーキテクチャを一緒に設計できます。各次元は
ドリルダウン可能な SVG 図としてレンダリングされます。

- **[ガイド](guide/)** — サービス境界・チーム境界の設計、オンボーディング、進化。
- **[リファレンス](spec/syntax/)** — `.krs` / `.krs.style` の構文・タグ・アノテーション。
- **[コンセプト](concepts/)** — karasu の設計思想。

コードベースを AI が生成した対話型 wiki として DeepWiki で閲覧できます:

[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/kompiro/karasu)
