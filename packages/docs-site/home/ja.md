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
    - text: 開発ふりかえり
      # Deliberately base-absolute (exception to the route-relative convention):
      # home/*.md is copied verbatim (no build-time templating), and astro
      # dev/preview can serve /karasu/ja without a trailing slash (trailingSlash
      # "ignore"), where a route-relative link would resolve outside the base.
      # Update if astro.config.mjs `base` ever changes.
      link: /karasu/retrospective/?lang=ja
      icon: open-book
---

## karasu とは

karasu（鴉）はアーキテクチャのためのテキストベース DSL です。一つの `.krs`
言語で、システムの 3 つの次元 — **論理構造**（サービスやドメインと、その関係）、
**物理構造**（それらを realize するデプロイ単位）、**組織構造**（それらを所有
するチーム） — を記述し、チームとアーキテクチャを一緒に設計できます。各次元は
ドリルダウン可能な SVG 図としてレンダリングされます。

描いたものには 4 種類のラベル（register）が付きます。**tag** は何であるか、
**annotation** はいまどの段階か（どちらも karasu が定める語彙）、**facet** はどの
集合に属するか（利用者が宣言する）、**boundary** はビューの中でどう束ねて見るかを
表します。詳しくは [語彙の register](spec/tags-annotations/#語彙の-register--boundary--annotation--tag--facet)
と [グルーピングと所属](examples/grouping-and-membership/) のサンプルを参照してください。

- **[ガイド](guide/)** — サービス境界・チーム境界の設計、オンボーディング、進化。
- **[リファレンス](spec/syntax/)** — `.krs` / `.krs.style` の構文・タグ・アノテーション。
- **[コンセプト](concepts/)** — karasu の設計思想。

コードベースを AI が生成した対話型 wiki として DeepWiki で閲覧できます:

[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/kompiro/karasu)
