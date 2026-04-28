---
type: product
---

# AT-0068: `client` kind — Phase 8 subtype icons

## 概要

`client` kind に対して、サブタイプタグ（`[mobile]` / `[web]` / `[desktop]` /
`[cli]` / `[device]` / `[extension]` / `[embed]`）ごとに視覚的に区別できる
SVG icon が割り当てられることを確認する
（Issue [#877](https://github.com/kompiro/karasu/issues/877)、設計は
`docs/design/client-mcp-modeling.md` Q13 / Phase 13）。

Phase 2（[#851](https://github.com/kompiro/karasu/issues/851) /
[AT-0065](./0065-client-kind-phase2-icon.md)）で導入した汎用 `client.svg`
を補完する。タグなし `client` は引き続き汎用 icon にフォールバックする。

## 前提条件

- Phase 2（#851 / PR #876）が main にマージされている
- 7 種類のサブタイプ用 SVG が `packages/core/icons/` に揃っている

## 受け入れ条件

### 1. icon mode で各サブタイプが固有の絵柄になる

サブタイプタグが付いた `client` ノードは、icon mode で次のように描画される:

| `.krs` 記述                          | 描画される icon |
| ------------------------------------ | --------------- |
| `client Mobile [mobile]`             | スマホ枠 + シングルアプリ |
| `client Browser [web]`               | ブラウザウィンドウ + タブ + アドレスバー |
| `client Desktop [desktop]`           | モニター + タイトルバー + スタンド |
| `client CliTool [cli]`               | ターミナル枠 + `>` プロンプト + カーソル |
| `client Sensor [device]`             | アンテナ付き IoT 筐体 + LED |
| `client BrowserExt [extension]`      | パズルピース |
| `client Widget [embed]`              | 外枠 + 内側ウィジェット + コーナーブラケット |

各 icon は隣接するノードと混ざらず、kind を一目で識別できること。

### 2. タグなしの `client` は汎用 icon にフォールバックする

```krs
client Generic {}
```

→ Phase 2 の `client.svg`（汎用 device + アプリグリッド）が描画される。

### 3. 認識されないタグは汎用 icon にフォールバックする

```krs
client InternalTool [my-team-internal]
```

→ `[my-team-internal]` は 7 種のサブタイプに含まれないため、汎用 `client.svg`
が選ばれる（warning は出ない）。

### 4. 複数サブタイプタグは「最初に書いたタグ」が勝つ（first-match-wins）

複数のサブタイプタグを持つノードは、`.krs` 上で **最初に宣言されたタグ** に
対応する icon が選ばれる。CSS cascade の last-wins ではない:

| `.krs` 記述                                 | 描画される icon |
| ------------------------------------------- | --------------- |
| `client X [mobile] [desktop]`               | `client-mobile` |
| `client Y [desktop] [mobile]`               | `client-desktop` |
| `client Z [my-internal] [web] [v2] [mobile]` | `client-web` （最初の認識されたサブタイプ） |

> 実装上、cascade で解決した `client-<X>` shape を resolver が後処理して
> 「node.tags 上の最初の認識サブタイプ」に書き換える
> （`packages/core/src/resolver/style-resolver.ts` の
> `applyClientSubtypeFirstMatch`）。
> ユーザが `client X { shape: box; }` のように shape を明示上書きしている
> ケースは触らない。

### 5. shape mode との一貫性

- shape mode では Phase 1 と同じ紫色のカード（`#6D28D9`）— サブタイプによって
  shape は変わらない（カードに表示されるラベル / アイコンの差分のみ）
- icon mode に切り替えると、サブタイプ別の icon に変わる
- 切り替えても label / description / links などのテキスト情報は欠落しない

### 6. ユーザー定義スタイルが client subtype icon を上書きできる

icon mode 中でも、ユーザー stylesheet で明示的に shape を指定すると上書きされる:

```krs.style
client[mobile] { shape: box; }
```

→ `client X [mobile]` は box shape（紫の四角）で描画される。
（cascade の sourceIndex が icon-theme より大きいため、user sheet が勝つ）

## 自動化された検証

- `packages/core/src/index.test.ts` —
  `getIconThemeStyleSheet()` が `client[<subtype>]` 各タグに対して
  `client-<subtype>` shape を割り当てる（7 件 + multi-tag + fallback）
- 既存の icon-mode 関連テスト群が引き続きすべて通過

## スコープ外

- Capability axis icons（カメラ / 位置情報バッジなど）
  — [#837](https://github.com/kompiro/karasu/issues/837) で別途追跡
- Phase 6 レイアウト変更（[#856](https://github.com/kompiro/karasu/issues/856) で完了）

## 関連

- 親 Issue: [#823](https://github.com/kompiro/karasu/issues/823)
- 本 Phase: [#877](https://github.com/kompiro/karasu/issues/877)
- 依存: [#851](https://github.com/kompiro/karasu/issues/851) / PR #876（Phase 2）
- 設計ドキュメント: `docs/design/client-mcp-modeling.md` Phase 2 / Q13
