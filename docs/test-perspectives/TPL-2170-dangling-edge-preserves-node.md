---
id: TPL-2170
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
  - TPL-907
topic: resolver
scope:
  packages:
    - core
---

# TPL-2170: edge / relation の片側が未解決でも、解決できた側のノードは drop しない

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
- [ ] 同じケースで **source / target のうち解決できた側のノードが残る** ことを直接 assert している（TPL-907 の「正しい参照に warning を出さない」と対称） [guard: `packages/core/src/compile/dangling-reference-corpus.test.ts`]
- [ ] 1 つの import 漏れが「最大何個のノードを消すか」をテストで上限抑止している（理想は 0、実装上は warning 経由でユーザーに見える状態を保つ） [guard: `packages/core/src/compile/dangling-reference-corpus.test.ts`]
- [ ] `realizes` / `owns` / `handles` などの他の cross-reference にも同じ規則を適用しているか

## 既知の対処パターン

- node insert と edge insert を別々のパスにし、edge insert で endpoint 解決が失敗したら edge だけスキップ + diagnostic 追加
- 「unresolved-realizes」「unresolved-handles」のような既存 diagnostic と命名 / 構造を揃え、新しい未解決系を追加するときの shape を統一する

## 関連テスト

- `packages/core/src/resolver/warnings.test.ts` — `unresolved-edge-endpoint warning`。未解決の endpoint で
  warning が出て params に `from` / `to` / `unresolvedId` が載ること、両 endpoint が解決できれば出ないこと。
  他の cross-reference は同じファイルの `unresolved-realizes warning` と `unresolved-handles warning` が見ている

- `packages/core/src/compile/dangling-reference-corpus.test.ts` — 出荷している全 example を変異させて回す
  （2・3 項目目のガード）。各 example が読み込む全ファイルの、model に入っている全エッジについて、片方の endpoint を
  どこにも無い id に書き換え、`unresolved-edge-endpoint` がその id を名指すことと、変異前に描かれていた全ノードが
  まだ描かれていることを確かめる。また各 import 行を 1 本ずつ落とし、entry が丸ごと読み込むファイル（whole-file と
  ディレクトリ import を辿る）で宣言された全ノードが merge 結果と描画に残ることを確かめる。新しい example・エッジ・
  import は追加した日から加わる。corpus が形を持つこと（変異したエッジが 500 本を超えること、import を落とすと
  参照が宙に浮く example があること）もテストが確かめる。named import で読み込んだ top-level service は、それを
  名指すエッジの `system` に置かれる（`resolveBareIdImport` の規則 2）。そのエッジを書き換えると service は
  top-level に移るので、そうして移った service とその配下に限り、root の segment を外した path（配下は
  `__unassigned__` の下）を「残った」と数える。ほかのノードは path が完全に一致しなければ失ったと数える

## 派生元 spec

- `docs/spec/syntax.md` §「Multi-file import semantics」 S6
