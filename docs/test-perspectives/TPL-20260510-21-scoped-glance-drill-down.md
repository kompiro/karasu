---
id: TPL-20260510-21
title: "一度に見せる範囲を限定し、drill-down を first-class に保つ"
status: active
date: 2026-05-10
applicable_to:
  - "システム / サービス / ドメインなどモデルの内容を画面に出す新しい view（overview、minimap、サイドバー、検索結果、AI 応答パネル など）"
  - "複数のノードを並べて表示するナビゲーション系機能（一覧、ツリー、グラフ俯瞰、breadcrumb の拡張）"
  - "「すべてを一度に見せる」誘惑のある機能（expand-all トグル、深さ無制限の inline 展開、tooltip 内のフルコンテキスト）"
known_consumers:
  - renderer
  - app-shell
  - navigation
  - chat-panel
discovered_from:
  - root_cause_file: "docs/concepts.ja.md"
related_to:
  - TPL-20260510-07
topic: core-concepts
scope:
  packages:
    - core
    - app
    - vscode
---

# TPL-20260510-21: 一度に見せる範囲を限定し、drill-down を first-class に保つ

## 観点

karasu の認知モデルは **scoped glance + drill-down**（`docs/concepts.ja.md` 「ドリルダウン型アーキテクチャ把握」節）。任意の瞬間に画面に出ているのは **限定されたスコープ** であり、より深い／広い情報は **明示的な drill 操作** を経由して見にいく。これは単なるナビゲーション設計ではなく、**一度に見せる情報量を限定する** ための認知設計上の選択である。

新しい view を追加するとき、無自覚に **「全体を 1 枚で見せる」** 設計に流れると、scoped glance の境界が崩れる。たとえば:

- 全 system / service / domain を一覧する minimap が常時表示される
- 「すべて展開」トグルで inline-nest をすべて開けるようになり、認知帯域を超えた図が標準ビューになる
- 検索結果が一致したすべてのノードを上下文なしで列挙する（drill-down が始まる起点を選べない）
- Chat / AI 出力が現在のスコープと無関係に全モデルをダンプする
- ghost が描画されず、drill-down 先からは外の世界が完全に消える（境界の文脈が失われる）

これらが許されると、ユーザーは「広すぎる図」と「文脈を失った詳細」を行き来することになり、**scoped glance を first class** にした前提が崩れる。

## 想定される失敗モード

- 1 画面のノード数が上限なく増え、レイアウトと描画コストが破綻する
- ユーザーが「次にどこへ降りるか」を選べず、目で全部スキャンする読み方しかできなくなる
- drill-down 後に外部依存（ghost）が見えず、境界の議論ができない（scoped glance の対義語に戻る）
- 「expand-all」を一度押すと元の scoped glance に戻れず、UI が広がりっぱなしになる
- Chat / 検索などモデル外の経路が、現在のスコープと無関係に詳細を露出させ、view 側のスコープ制御を空洞化する

## チェックリスト

新しい view / ナビゲーション機能を設計するとき、以下を確認する:

- [ ] 任意の瞬間に画面に出る要素数 / 階層数に **明示的な上限** があるか（無制限に広がる "show all" を default にしていないか）
- [ ] より広い／深い情報へ行く経路が **明示的な drill 操作**（クリック、コマンド、`extract`、ファイル遷移など）として分離されているか
- [ ] drill-down で視野が狭まったとき、**外部との境界**（ghost domain / ghost system 相当）が失われずに描画されるか
- [ ] 「expand-all」「全表示モード」のような scope を解除する機能を入れる場合、**戻るパス** と **default は scoped 側** の両方が確保されているか
- [ ] Chat / 検索 / AI 応答など view 外の経路が、現在のスコープと **整合的に振る舞う**（無関係なノードを文脈なしで噴出させない）か
- [ ] 単一ビュー内のレイアウトが **一目で把握できる解像度** を保つか（多数の兄弟ノードを横一列に流して zoom-to-fit で全体が潰れる状態を default にしていないか。要素数だけでなく **視覚的密度・縦横比** にも上限の発想があるか）

## 既知の対処パターン

- **inline nest + extract**: 育った範囲は外部ファイルに extract し、親図では子の存在だけが見える状態に戻す（`docs/concepts.ja.md` ドリルダウン節）
- **ghost domain / ghost system**: drill-down 先から見える外の世界は、半透明プレースホルダで境界の存在だけ残す（ADR-20260404-09、ADR-20260405-07、ADR-20260411-05）
- **edge aggregation**: 俯瞰時は sync / async ごとに 1 本に畳み、詳細は drill-down と詳細パネルに委ねる（ADR-20260410-01、ADR-20260413-02）
- **default scope を絞ったまま提供**: 「一覧表示」を追加するときも、default は scope を絞った形にし、「すべて見る」は明示操作に分離する

## 関連テスト

- `packages/core/src/render/` — drill-down 描画（ghost を含む scoped 描画の中核）
- `packages/app/src/` — view 構成（scope 境界の UI 表現）
- `docs/concepts.ja.md` 「ドリルダウン型アーキテクチャ把握」節
- TPL-20260510-07（書き手と読み手の非対称性をエッジ層で具現化する観点 — scoped glance のエッジ側の現れ）

## 派生元 spec

- `docs/concepts.ja.md` 「一度に見せる範囲を限定し、ドリルダウンで詳細へ降りる（scoped glance）」節（英語版 `docs/concepts.md` "Limit what is shown at once; drill down for detail"）。同節は scoped glance が **ナビゲーションの深さだけでなく単一ビューの解像度・視覚的密度** までを含むことを規定しており、本 TPL のチェックリスト「単一ビュー内のレイアウトが一目で把握できる解像度を保つか」がその違反を検出する。
