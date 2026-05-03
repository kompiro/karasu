# Edge direction as a `.krs.style` property

- **日付**: 2026-05-02
- **ステータス**: 検討中
- **関連**:
  - 親 Issue: [#1071](https://github.com/kompiro/karasu/issues/1071) — Edge readability brainstorm
  - 親設計: `docs/design/gui-driven-style-editing.md`（#1076 MVP の文脈）
  - 依存: [#1096](https://github.com/kompiro/karasu/issues/1096) — edge ID selector spec
  - 関連: [#1063](https://github.com/kompiro/karasu/issues/1063), [#1067](https://github.com/kompiro/karasu/issues/1067) — read/write edge differentiation
  - 既存仕様: `docs/spec/style.md`、`docs/concepts.md`

## 背景・課題

dense な図で edge が交差したり、レイアウトエンジンが選んだ方向のせいで
label が窮屈になるケースがある（#1071）。PlantUML では `-down->` `-d->`
等で edge ごとに方向ヒントを与えられるが、karasu でこれをどう扱うかが
論点だった。

#1076 の設計が固まったことで、判断軸が変わった:

- 文法を増やすコスト = ユーザー認知負荷（=高い）だった
- が、Preview の右クリックメニューで操作できるなら discoverability の
  問題は GUI が吸収する → 文法追加のハードルが下がる

本ドキュメントは **edge の方向ヒントを `.krs.style` のプロパティとして
追加する** 設計を詰める。#1076 の GUI 編集器の **最初の MVP プロパティ**
として位置付ける。

## 制約・前提

- **論理 / 物理分離（`docs/concepts.md`）を守る**: 方向は presentation で
  あって logical model ではない。`.krs` には載せず `.krs.style` 専属
- **レイアウトエンジン非依存にする**: 将来 dagre → ELK → 自前 のエンジン
  切り替えがあっても陳腐化しない粒度に留める
- **既存スタイルの cascade を壊さない**: ID selector が無くても `edge {}`
  全体への direction 指定は機能する
- **GUI 編集が一次インターフェイス、テキスト編集は二次**: 文法は最小限、
  値の自由度は控えめ
- **依存**: per-edge override には #1096 の edge ID selector が必要

## 検討した選択肢

### 案A: `.krs` 構文で表現（PlantUML 風 `-d->`）

```
ECommerce -d-> Database
```

- 利点: 既存 PlantUML ユーザーには馴染みがある
- 欠点: presentation を logical に混ぜる。論理/物理分離に反する。
  layout エンジンを差し替えたとき意味が壊れる可能性。スタイル変更で
  diff が `.krs` に出る → 論理モデルの履歴が汚れる

→ **却下**

### 案B: `.krs.style` プロパティ（採用候補）

```
edge#A->B { direction: down }
```

- 利点:
  - presentation は presentation の場所にとどまる
  - 既存の cascade に乗る
  - ID selector があれば per-edge、なければ `edge {}` で全体に効く
  - GUI 編集器（#1076）が同じ書き方を生成する
- 欠点:
  - layout engine が direction ヒントを解釈する必要がある（実装コスト）
  - 自由度の高い値を許すと engine 依存になる

→ **採用**

### 案C: layout 側の自動最適化のみ（属性追加なし）

エッジ交差・label 衝突を engine 側で全自動で解く。

- 利点: ユーザーが何も書かなくていい
- 欠点: 全自動で解けるなら既にそうなっているはず。最後の数 % は人間の
  意図（「writes は下に流したい」など）が要る。**これだけでは足りない**

→ 補完的に進める価値はあるが、本ドキュメントの範囲外。direction property
  との **両立** で進める

## 値の設計

### 値域

`up | down | left | right | auto`（5 値の閉じた enum）

- `auto` (default): layout engine の判断に任せる
- `up | down | left | right`: 始点 → 終点 の **進行方向** をその向きに
  寄せるヒント

### 自由度を絞る理由

- 角度を許すと engine 依存になる（dagre は四方向、ELK は他にも）
- `northwest` 等の斜め値は意味が曖昧（全 layout が解釈できるとは
  限らない）
- 5 値なら GUI のメニュー項目としても自然（ラジオボタン or サブメニュー）
- 将来必要なら拡張する。最初から広くしない

### `auto` を default にする理由

- 既存の `.krs.style` を壊さない（全 edge に `direction: auto` が暗黙に
  当たっているのと同義）
- ヒントを与えない = engine が今まで通り動く、を明示できる

### 用語の選択: `direction` vs `flow` vs `orientation`

| 候補 | 採用判断 |
|---|---|
| `direction` | 採用。CSS の `direction` とは意味領域が違うが selector が `edge` に限定されるので衝突しない |
| `flow` | 「進行方向」のニュアンスは合うが、karasu の他語彙との関係が曖昧 |
| `orientation` | 双方向を含意するため不適切（edge は有向） |

## 文法上の置き場所

`.krs.style` の edge ルール内のプロパティ:

```
edge {
  direction: auto;          /* 全 edge のデフォルト（書かなくても auto） */
}

edge[async] {
  direction: down;          /* tag-based: 非同期 edge は下方向 */
}

edge#OrderService->Database {
  direction: right;         /* per-edge override（#1096 の文法に依存） */
}
```

specificity は既存ルール（`docs/spec/style.md`）に従う。`edge#<id>` は
node ID と同等の 100 + `edge` の 1 = 101 を想定（詳細は #1096）。

## レイアウトエンジン側のセマンティクス

### ヒントの強さ

direction は **ヒント** であって絶対指定ではない。layout engine が
direction を尊重した結果**サイクルや交差**が発生するなら、engine が
最終判断をして良い。これは:

- engine の挙動を予測しやすくする
- ユーザーが direction を書きすぎても破綻しない
- 将来 engine を差し替えたとき強いセマンティクスに引っ張られない

### 矛盾するヒントが複数あったとき

例: `A -> B` に `down` を、`B -> A` に `up` を別ルールから付与した（=
同じ視覚的方向を意味する）。これは矛盾しない。一方、`A -> B` に同じ
selector specificity で `down` と `right` が両方当たったら cascade で
**後勝ち**（既存の resolution と同じ）。

### read/write edge differentiation との関係

#1067 の read/write 差別化と組み合わせた使い方:

```
edge[write] { direction: down }
edge[read]  { direction: right }
```

これにより「writes は下に流れる、reads は横に伸びる」という慣習を
スタイルで表現できる。MVP では同時に動くことを確認するに留め、
推奨パターンとして spec に書くかは別議論（後段）。

## GUI 編集（#1076）との接続

#1076 の MVP として通すフロー:

1. ユーザーが Preview で edge を右クリック
2. メニュー「Direction ▸ Auto / Up / Down / Left / Right」
3. 値を選択 → `.krs.style` 末尾に append:
   ```
   edge#<picked-edge-id> { direction: <value> }
   ```
4. 図が再レンダリング、選んだ方向に向きが寄る

「`auto` を選ぶ = 解除」の意味で扱う。append 戦略で書き戻すので、過去の
direction ルールは残るが、後勝ちで `auto` が効く。残骸は `Tidy Style`
（#1076 のフォロー）で畳める。

## アクセプタンステスト観点

実装時に `docs/acceptance/` で起こす AT 候補:

- `edge { direction: down }` を書いて、全 edge が概ね下方向に伸びる
- `edge[async] { direction: down }` で非同期 edge だけ下に流れる
- `edge#A->B { direction: right }` で対象の edge だけ右に伸び、他は影響を
  受けない
- direction を書いても layout engine がサイクルを避ける（engine が最終判断
  する例として）
- GUI（#1076 MVP）で edge を選び direction を変更すると、ファイルに
  rule が append され、図が更新される

CI で見れる単体・結合テストは AT に書かない。

## 実装の段取り（参考）

本 Design Doc の対象は **方向プロパティの設計** までで、実装の作業分割
は別 Issue で扱う。参考までに依存関係:

```
#1096 (edge ID selector spec)  ──┐
                                  ├─→ #1076 MVP impl (direction を最初の機能として)
本 Design Doc → ADR 化  ─────────┘
```

`docs/spec/style.md` の更新（property 表に `direction`、値の enum、
default、specificity 例）はこの設計が ADR 化された段階で行う。

## 現時点の方針

- **direction property を `.krs.style` に追加**（案 B）
- 値は `up | down | left | right | auto` の 5 値 enum、default `auto`
- ヒント扱い（engine が最終判断）
- `edge`、`edge[tag]`、`edge#<id>` の各 selector で書ける（per-edge は
  #1096 が landing 次第）
- GUI 編集（#1076 MVP）の最初のプロパティとして実装

## 未解決の問い

なし。以下は実装着手時に決める運用判断:

- **layout engine 側でのヒント反映方式**: dagre の `rankdir` と per-edge
  ヒントの重ね方は実装時に検証する。汎用 enum なので最悪 engine 内で
  fallback しても外向きの仕様は崩れない
- **`auto` を明示的に書く意味**: cascade を上書きして「親ルールの direction
  指定を解除する」用途。GUI でも「Direction ▸ Auto」を選んだら明示の
  `direction: auto` を書く運用にする
- **read/write 慣習をデフォルトテーマで採用するか**: `default.krs.style`
  に `edge[write] { direction: down }` 等を入れるかは別 Issue の判断
