---
id: TPL-20260514-05
title: "edge / relation の片側が未解決でも、解決できた側のノードは drop しない"
status: active
date: 2026-05-14
applicable_to:
  - "node と edge を別々に持つ AST / IR で、edge の endpoint 解決を edge レイヤで行う resolver"
  - "`realizes` / `owns` / `handles` のような cross-reference を持つ宣言の検証"
known_consumers:
  - import-resolver
  - edge-resolver
discovered_from:
  - root_cause_file: "docs/spec/syntax.md#multi-file-import-semantics"
  - issue: "#1381"
related_to:
  - TPL-20260510-10
topic: resolver
scope:
  packages:
    - core
---

# TPL-20260514-05: edge / relation の片側が未解決でも、解決できた側のノードは drop しない

## 観点

`A -> B` の B が未解決のとき、resolver は:

- **edge を drop して `unresolved-edge-endpoint` warning を発する** — endpoint id と source location を含める
- **A 自身は drop しない** — A は宣言された場所に存在するという原則を守る

`realizes` / `owns` / `handles` などの cross-reference も同じ — source node は残り、relation だけが warning と共に消える。

「edge endpoint が無効 → node ごとガベージコレクト」の実装は、別ファイルの import 漏れや typo 1 つで連鎖的にノードが消える状況を生み、ユーザーは何が消えたか追跡できない。node は宣言された側の責任で存在し、edge は両 endpoint の合意の責任で存在する、と責任分離する。

## 想定される失敗モード

- 別ファイルの import が漏れて参照先が無いとき、参照元ノードまで消える（#1381 で `LicenseApply --> LicenseManagement` の `LicenseManagement` 消失に巻き添えで `LicenseApply` まで消えた）
- typo（`LicenseManagment` のような）で endpoint が解決できないとき、source node も消えるため、ユーザーは「ノードを書いたはずなのに表示されない」状態になる
- node が消える二次被害が連鎖し、最終的に「何が起きたか分からない」モデルになる
- `realizes` / `owns` / `handles` が「未解決なら宣言自体を drop」する実装も同じ shape のバグ

## チェックリスト

cross-reference を持つ宣言の検証 / resolver 経路を実装 / 変更するときに確認する:

- [ ] endpoint 未解決時に warning を出すテストがある
- [ ] 同じケースで **source / target のうち解決できた側のノードが残る** ことを直接 assert している（TPL-20260510-10 の「正しい参照に warning を出さない」と対称）
- [ ] 1 つの import 漏れが「最大何個のノードを消すか」をテストで上限抑止している（理想は 0、実装上は warning 経由でユーザーに見える状態を保つ）
- [ ] `realizes` / `owns` / `handles` などの他の cross-reference にも同じ規則を適用しているか

## 既知の対処パターン

- node insert と edge insert を別々のパスにし、edge insert で endpoint 解決が失敗したら edge だけスキップ + diagnostic 追加
- 「unresolved-realizes」「unresolved-handles」のような既存 diagnostic と命名 / 構造を揃え、新しい未解決系を追加するときの shape を統一する

## 関連テスト

未確立（spec PR 後の実装 PR で追加予定）。`examples/multi-file-system/` を使った AT でも「全ノードが現れること」を assert する。

## 派生元 spec

- `docs/spec/syntax.md` §「Multi-file import semantics」 S6
