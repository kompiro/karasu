# shape mode のテキストスロット付き `url()` アイコンは、ピクトグラムを角に置いて通常のテキストスタックで描く

- **日付**: 2026-09-17
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#2803](https://github.com/kompiro/karasu/issues/2803)（slotted アイコンがメタ行・client チップを落とし、その高さだけ確保する）
  - 先行 Issue / PR: [#2696](https://github.com/kompiro/karasu/issues/2696) / PR [#2797](https://github.com/kompiro/karasu/pull/2797)（shape mode の `url()` にカード枠と比率保持を入れた。slotted アイコンを左上に寄せる規則もここで入った）
  - 関連 Issue: [#2802](https://github.com/kompiro/karasu/issues/2802)（利用者の SVG を読むホストが無い）、[#2816](https://github.com/kompiro/karasu/issues/2816)（`url()` を `icon()` に綴り替える。同じ spec 節を書き換える）
  - 関連 ADR: [ADR-2376](../adr/2376-icon-display-mode-de-emphasis-and-removal-path.md)（icon mode の removal path。移行先は shape mode）、[ADR-2366](../adr/2366-node-chrome-and-ports.md)（`user` のメダリオン、`contentInset`、コーナーレーン）、[ADR-9005](../adr/9005-svg-icon-file-import.md)（テキストスロット規約）
  - 関連 TPL: [TPL-2803](../test-perspectives/TPL-2803-measured-lines-are-drawn-lines.md)（本 PR で proactive に起こす）、[TPL-1001](../test-perspectives/TPL-1001-display-mode-cross-surface.md)、[TPL-2385](../test-perspectives/TPL-2385-attachment-follows-drawn-outline.md)、[TPL-2157](../test-perspectives/TPL-2157-resolved-relation-rendered-for-every-kind.md)
  - コード: `packages/core/src/renderer/svg-renderer.ts`（`renderNode` / `iconBodyBox` / `renderSlottedText` / `renderDefaultText`）、`packages/core/src/renderer/layout-measure.ts`（`measureNode`）

## 背景・課題

`renderNode` はカードのテキストを 2 系統で描く。アイコン定義が `krs-label` スロットを持てば
`renderSlottedText`、持たなければ `renderDefaultText`。寸法を決める `measureNode` は
shape mode では常に後者（中央寄せのテキストスタック）の行数で高さと幅を測る。
slotted 系統は測った行の一部しか描かないので、測定と描画が食い違う。

#2803 はその食い違いのうち、メタ行（link 数・team）、`role`、client の resource /
capability チップが描かれない点を報告している。同じ probe を広げると、食い違いは
それだけではなかった。

### 実測

`packages/core/icons/` の実物（`service.svg`、viewBox 160×100、ピクトグラム 20×20 を
(6, 4)、label スロット (30, 19) start、description スロット (8, 44) start）を登録し、
`service { shape: url("service"); }` の有無で同じノードを shape mode で render した。

| ノード | シートなし: カード / 描かれた行 | `url("service")`: カード / 本体 scale / 描かれた行 |
| --- | --- | --- |
| label のみ | 160×66 / label | 160×66 / **0.66** / label（カード上端から 12.5px） |
| label + description | 340×102 / label + description 2 行（折り返し） | 340×102 / 1.02 / label + description **1 行（折り返さない）** |
| link 2 件 | 160×84 / label + link チップ | 160×84 / **0.84** / label のみ（**link チップなし**） |
| client + capability + link（#2803 の例） | 160×120 / label + description + 🔐×1 + link | 160×120 / 1.0 / label + description のみ（**チップ 0**） |

ここから 4 つの症状が読める。

1. **メタ行・`role`・client チップが描かれない**（#2803 本題）。`renderMetaRow` を呼ぶのは
   `renderDefaultText` だけで、`renderSlottedText` には相当物が無い。
2. **テキストがカード上部に固まり、下が空く**。スロットは本体の座標系の比率で置かれる
   （label は上から 19/100）。カードは中央寄せスタックの高さで測られているので、
   link 2 件のカードでは 84px のうち上 16px に label があり、残りは空白になる。
3. **ピクトグラムの大きさがノードごとに変わる**。本体はカードに内接させる 1 つの scale で
   描かれ、scale はカードの高さで決まる。同じ図の中で 13.2px（label のみ）から 20px 以上
   （背の高いカード）まで揺れる。
4. **description が折り返されない**。`measureNode` は `DESC_MAX_LINES` 行に折り返して
   高さを確保するが、slotted 系統はスロット位置に 1 行で描く。

### なぜ今か

[ADR-2376](../adr/2376-icon-display-mode-de-emphasis-and-removal-path.md) は icon mode の
移行先を shape mode の `url()`（#2696）と定めた。icon mode の利用者が deprecation 告知に
従うと、shape mode のカードにはあったチップを失う経路に乗る。
[TPL-2175](../test-perspectives/TPL-2175-deprecation-announced-only-with-a-migration-target.md)
の言う「警告に従うと機能が減る」状態であり、告知の前に移行先を完成させる必要がある。

## 現状（インベントリ）

| 観点 | 現状 |
| --- | --- |
| 登録アイコン | `icons.json` の 30 個すべてが 160×100 のカードデザインで、ピクトグラムを `<g class="krs-pictogram" transform="translate(6, 4)">` に、スロットを同じ座標に持つ |
| 利用者の SVG | 読み込むホストが無い（#2802）。スロット無しの「シルエット」アイコンは原理上しか存在しない |
| 分岐条件 | `renderNode` は `iconDef?.labelSlot` で slotted / default を選ぶ。display mode は見ない |
| 本体の配置 | `iconBodyBox`: icon mode はカードそのもの、shape mode は比率を保って内接。slotted は左上寄せ、スロット無しは中央寄せ（#2797） |
| 測定 | `measureNode` は `displayMode === "icon"` だけ特別扱い（固定 160×100 / 160×56）。shape mode ではアイコンを見ず、`shapeForNode` 経由で `contentInset` だけを読む。`url()` アイコンは inset を登録しないので padding（X 40 / Y 24）のみ |
| ピクトグラム単体の描画 | 既にある。`SvgIconDef.pictogramBody`（`krs-pictogram` の中身、0〜20px 座標）を org-renderer の `renderPictogramGroup` が (6, 4) に、`renderPictogram` が Outline / 詳細パネル向けに描く |
| 左上角 | shape mode のカードでは空いている。コーナーレーン（バッジ・i / D ボタン）と縮退タブは右上、ファセットリングは外周 |

## 制約・前提

- **icon mode は変えない。** ADR-2376 は icon mode 固有の描画不具合に投資しないと決めている。
  icon mode の slotted カードも同じくメタ行を落とすが、それは本件の範囲外で、#2639 と同じ扱い。
- **measure と render は 1 つのテキストレイアウトを共有する。** 測った行は描き、描く行は測る
  （本 PR で起こす [TPL-2803](../test-perspectives/TPL-2803-measured-lines-are-drawn-lines.md)）。
- **輪郭はノードの箱のまま。** カード枠を箱に置き、エッジとクロームはそこに付く（TPL-2385、#2797）。
- **スロット無しアイコンの挙動は変えない**（中央寄せで内接）。
- 全描画面（app / CLI / VS Code webview / export）は core の `render` を通るので、core の変更で揃う（TPL-1001）。

## 検討した選択肢

### 案A: 測定をアイコン対応にし、スロットの座標系に行を足す

`measureNode` が shape mode でもアイコン定義を読み、スロット位置から寸法を出す。
本体は scale 1 で左上に固定し、description はスロット x から折り返し、その下に `role`・
チップ・メタ行をスロット x 揃えで積む。

**メリット**

- icon mode のカードの見た目（ピクトグラムの横に label、その下に左揃えの本文）を shape mode でも保つ。

**デメリット**

- **アイコンが宣言していない位置を発明する。** スロット規約（ADR-9005）は label と description の
  2 点しか持たない。3 行目以降の置き場所はアイコンの座標系の外で、結局 renderer の定数になる。
- **shape mode にテキストレイアウトが 2 つ残る。** 折り返し幅、`contentInset`、コーナーレーンとの
  干渉、チップの幅予約を slotted 系統にも複製する必要があり、片方だけ直る drift の温床になる
  （TPL-2234 と同じ形）。
- 測定に新しい分岐が入り、`shapeForNode` が返す名前からアイコン定義を引く経路を増やす。

### 案B: ピクトグラムを角に固定サイズで置き、テキストは通常スタックで描く（採用候補）

shape mode でテキストスロットを持つアイコンは、本体を内接させず、`pictogramBody` を
**固定 20px でカードの左上 (6, 4)** に描く。テキストは `renderDefaultText` で描く。
つまり shape mode ではスロットを読まない。スロットは icon mode 専用になる。

(6, 4)〜(26, 24) は shape mode のカードの padding 帯（X 40 / Y 24）の内側に収まるので、
**テキストとは幾何的に重ならず、`measureNode` を変えなくてよい。** 測定は既に
`renderDefaultText` の行数で測っているので、4 つの症状はすべて「測った通りに描く」ことで消える。

**メリット**

- 症状 1〜4 がまとめて解消する。メタ行・`role`・チップ・折り返し・中央寄せ・`contentInset` は
  他のすべての shape と同じ 1 本の経路で描かれ、今後そこに入る変更も自動で届く。
- ピクトグラムがどのカードでも同じ 20px になる（org-renderer・icon mode のカードと同じ大きさと位置）。
- 測定の変更が要らない。レイアウト・ルーティングの結果は byte 単位で変わらず、変わるのはカードの中身だけ。
- `iconBodyBox` の「slotted は左上寄せ」分岐が不要になり、#2797 の頃の前提（中央寄せの
  テキストに対して本体を置く）に依存する規則が消える。

**デメリット**

- icon mode のカードとは見た目が違う（label はピクトグラムの横ではなく中央）。ただし icon mode は
  removal path にあり、shape mode の他のカードと揃うほうが移行後の図として一貫する。
- `krs-pictogram` 以外の本体（カード全体の装飾）はアイコンに描かれていても shape mode では落ちる。
  現在の 30 個はピクトグラムしか持たず、利用者の SVG を読むホストも無い（#2802）ので、実害は無い。
  将来そういうアイコンを受け入れるときに再検討する（「未解決の問い」）。
- スロットはあるがピクトグラム group が無いアイコンの置き場所を決める必要がある（下記「実装の指針」2）。

### 案B': 案B のピクトグラムを `user` 型のメダリオンにする

ピクトグラムをカード上辺にまたがる円に入れ、`contentInset` の top でテキストを下げる（ADR-2366 の `user`）。

**デメリット**

- 高さが増えるので `measureNode` と `portFrame` の変更が要り、全カードのレイアウトが動く。
- 輪郭がカード矩形でなくなり、エッジの付き方（TPL-2385）を再検討することになる。
- 角に置く案B で同じ識別性が得られ、上記のコストを払う理由が無い。

### 案C: 足りない行だけ `renderSlottedText` に足す

description スロットの下に `role`・チップ・メタ行を追加し、測定は変えない。

**デメリット**

- #2803 の本題（症状 1）しか直らない。症状 2〜4 は残り、行を足すほど scale が小さい短いカードでは
  はみ出す（label のみのカードは本体 scale 0.66 で、スロット座標の外に行を置く余地が無い）。

## 比較

| 観点 | 案A | 案B | 案B' | 案C |
| --- | --- | --- | --- | --- |
| 症状 1（行が落ちる） | 解消 | 解消 | 解消 | 解消 |
| 症状 2（上に固まる） | 解消 | 解消 | 解消 | 残る |
| 症状 3（ピクトグラムの大きさ） | 解消 | 解消 | 解消 | 残る |
| 症状 4（折り返し） | 解消 | 解消 | 解消 | 残る |
| `measureNode` の変更 | 新分岐 | なし | inset 追加 | なし |
| shape mode のテキストレイアウト数 | 2 | 1 | 1 | 2 |
| レイアウト結果への影響 | 変わる | 変わらない | 変わる | 変わらない |
| icon mode との見た目の一致 | 高い | 低い | 低い | 中 |

## 現時点の方針

**案B を採用する。** 4 つの症状は「shape mode で measure と render が別のテキストレイアウトを
使っている」ことの現れで、案B はその片方を消す。案A は 2 つのレイアウトを保ったまま一致させ続ける
コストを恒久的に払う。icon mode との見た目の一致は、icon mode が removal path にある以上、
2 つのレイアウトを保つ理由として弱い。

#2797 のコメントが残した「メダリオン案の却下理由」（`url()` をカスタムシルエットとして示していた
spec）については、実在するアイコンがすべてカードデザインであることが分かったので前提として採らない。
スロット無しのアイコンはシルエットとして今まで通り内接・中央寄せで描くので、その用途も失われない。

### 実装の指針

1. `renderNode`（`svg-renderer.ts`）のテキスト分岐を display mode で切る。
   `displayMode === "icon" && iconDef?.labelSlot` のときだけ `renderSlottedText`、それ以外は
   `renderDefaultText`。これで shape mode にメタ行・`role`・チップ・折り返しが入る。
2. shape mode の本体描画を分ける。
   - アイコンが `labelSlot` と `pictogramBody` の両方を持つ（カードデザイン）: 本体を内接させず、
     `pictogramBody` を 20px でカード左上 (6, 4) に描く。色の置換（`{{color}}` など）は
     `registerIcon` の描画関数と同じ規則に揃える。位置と大きさは org-renderer の
     `renderPictogramGroup` と同じ値なので、定数を 1 箇所に寄せる（TPL-2234）。
   - それ以外（スロット無し、またはピクトグラム group が無い）: 今まで通り `iconBodyBox` で
     内接・中央寄せ。スロットはあってもピクトグラムを切り出せないアイコンは、シルエットと同じ扱いにする。
   - `iconBodyBox` の「slotted は左上寄せ」分岐は shape mode で到達しなくなるので削除する。
3. `measureNode` は変更しない。変更しないことをテストで固定する（同じノードのカード寸法が
   シートの有無で一致する）。
4. テスト（`external-icon-card.test.ts`）:
   - #2803 の例（client + capability + link）で、`url()` の有無で `data-meta-glyph` の数と
     `data-client-capability-count` が一致する。team / `role` / resource も同様に 1 ケースずつ。
   - 描いたテキスト行の y がカードの箱の内側に収まり、中央寄せスタックと同じ位置にある
     （シートなしの描画と同じ y）。描画出力から読む（TPL-2385）。
   - ピクトグラムが label のみ・背の高いカードの両方で同じ 20px・同じ角位置にあり、
     label の `<text>` の範囲と重ならない。
   - description が折り返される（`<text>` が複数行）。
   - 既存の "puts both of the icon's text slots on the body they belong to" は shape mode では
     成り立たなくなるので、icon mode の describe に移すか、「shape mode はスロットを読まない」
     assert に書き換える。"centres a slot-less icon" は残す。
   - 退行検証: 分岐を元に戻すとテストが落ちることを一度確かめる。
5. spec: `docs/spec/style.md` / `style.ja.md` の「How a `url()` icon is drawn」節を更新する。
   テキストスロットは icon mode でだけ使われ、shape mode ではカードデザインのアイコンは
   ピクトグラムを角に置き、テキストは他の shape と同じスタックで描く、と書く。節末の
   `> Related TPLs:` に TPL-2803 を足す。#2816 が同じ節を書き換えるので、先にマージされた側に合わせる。
6. AT: `docs/acceptance/2803-slotted-icon-card-text.md`。人間の確認が要るのは見た目だけ:
   - app の shape mode で `client { shape: url("client-web"); }` を当てた client カードに
     🔐 / 📦 / link / team のチップが出て、ピクトグラムが左上に 20px で出ている
   - label のみ・description ありの `service` カードで、テキストが中央に座り下が空かない
   - dark / light 両テーマでピクトグラムの色がカードの文字色と揃う
7. changeset: `@karasu-tools/core` の patch（shape mode の `url()` カードの中身が変わる）。
8. ADR 昇格: 実装完了後、`docs/adr/2803-slotted-icon-card-text.md` として昇格し、本 Design Doc は同 PR で削除する。
   #2696 の決定（カード枠・比率保持）も ADR が無いので、同じ ADR に経緯として含める。

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: shape mode で `url()` にカードデザインのアイコンを当てているカードの中身が変わる
  （ピクトグラムが角の 20px に、テキストが中央スタックに、チップが出る）。カードの寸法とレイアウトは変わらない。
  icon mode は変わらない。
- ドキュメント更新: `docs/spec/style.md` / `style.ja.md`（上記 5）
- テスト・examples への影響: `external-icon-card.test.ts` の slotted 系 assert。examples に shape mode の
  `url()` を使う箇所があれば見た目だけ変わる（drift ガードの対象かは実装時に確認する）。

## 未解決の問い / 決めないこと

- **ピクトグラム以外の装飾を持つカードデザインのアイコン**をどう描くか。現存せず、読み込むホストも無い
  （#2802）。利用者の SVG を受け入れる時点で、スロット規約と合わせて決め直す。
- **icon mode の slotted カードがメタ行を落とす件**は直さない（ADR-2376 の投資凍結）。
- ピクトグラムを label の左に並べる（中央スタックの 1 行目に組み込む）見た目は検討しない。
  label の幅予約が変わり、測定の変更が要るため。案B の実装後に見た目の要望が出たら別 Issue で扱う。
