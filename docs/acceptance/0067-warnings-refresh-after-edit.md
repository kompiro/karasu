---
type: product
---

# AT-0067: Warnings refresh consistently after editor edits

## 概要

`.krs` を編集した結果として警告 (`warning.*`) や診断 (`diagnostic.*`) の集合が変化した場合、WarningPanel の表示が**両方向に**正しく更新されることを確認する
（Issue [#891](https://github.com/kompiro/karasu/issues/891)）。

これまで view hooks (`useSystemView` / `useDeployView` / `useOrgView`) の compile 結果は SVG 文字列のみで早期リターンを判定していたため、
グラフ構造が変わらないが警告だけが変わる編集（例: `client.handles` のドメイン参照を typo → 修正）で WarningPanel が古い状態に固着していた。

## 前提条件

- 任意の `.krs` を編集できる状態
- WarningPanel が表示されている

## 受け入れ条件

### 1. 警告を発生させる修正で WarningPanel に出る

新規プロジェクトを作って以下を保存する:

```krs
system S {
  client WebApp [web] { handles Order }
  service Backend { domain Order {} }
  WebApp -> Backend
}
```

→ WarningPanel に警告は表示されない。

続いて `handles Order` を `handles Ordr` (typo) に変える:

```krs
system S {
  client WebApp [web] { handles Ordr }
  service Backend { domain Order {} }
  WebApp -> Backend
}
```

→ 数百ミリ秒後に WarningPanel に「Client "WebApp" declares handles "Ordr"...」が表示される。

### 2. 警告を解消する修正で WarningPanel から消える

上記の typo 状態から `Ordr` を `Order` に直す。

→ 数百ミリ秒後に WarningPanel が空になる（警告が残らない）。

### 3. 既存の `unassigned-*` 警告でも同じ振る舞い

```krs
service Standalone { label "Standalone" }
```

だけのファイルを開く → `unassigned-service` が出る。

`system S { service Standalone {} }` で system に取り込む → 警告が消える。

逆に取り出す → 再び出る。

### 4. Deploy / Org ビューでも同じ振る舞い

Deploy view / Org view を開いて、それぞれの警告（例: `missing-runtime` を伴う deploy ノードの `runtime` を消す/追加する操作、`invalid-owns` を伴う team の `owns` を直す操作）でも、両方向の更新が反映されることを確認する。

## 自動化された検証

- `packages/app/src/hooks/useSystemView.test.tsx` —
  - 「clears a warning after the source is fixed even when SVG topology is identical」
  - 「surfaces a new warning when one is introduced after a clean compile」
- 既存の「skips setState when recompile produces the same SVG」テストは引き続き通過し、純粋な「何も変わらない再コンパイル」では state 更新が省略されることを確認している（最適化が壊れていないこと）。

## 関連

- 親 Issue: [#891](https://github.com/kompiro/karasu/issues/891)
- 関連 PR: PR #880 (Phase 4 `handles` — 症状の発見元)
- 関連 hooks: `useSystemView` / `useDeployView` / `useOrgView`
