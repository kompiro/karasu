# TPL の索引を毎日の再生成 PR で生成する

- **日付**: 2026-11-02
- **ステータス**: 検討中
- **関連**:
  - Issue [#3289](https://github.com/kompiro/karasu/issues/3289)（README の手書き一覧表の衝突）
  - [ADR-3416](../adr/3416-regenerate-adr-index-daily-pr.md)（ADR の生成物は PR に含めず、毎日の再生成 PR でだけ更新する）
  - [ADR-788](../adr/788-adr-knowledge-graph.md)（生成物を repo に置いたまま読む）、[ADR-1192](../adr/1192-test-perspective-library.md)（TPL の運用）、[ADR-2648](../adr/2648-record-source-path-guard.md)（`tpl:validate` を Check で回す）
  - tpl-tools の ADR-27（`tpl regenerate` と `indexFile`）、ADR-31（チェックリストの印と状態）。`@kompiro/tpl-tools@0.0.12` で公開済み
  - #3038 スライス 3（[#3488](https://github.com/kompiro/karasu/issues/3488)）: 索引に TPL ごとの状態を出す

## 背景・課題

`docs/test-perspectives/README.md` の末尾の一覧表は手書きで、TPL を足す PR はそこに 1 行ずつ追記する。
TPL の id は Issue 番号で単調に増えるので、新しい行はいつも表の末尾に入り、同時に開いた 2 本の PR は
同じ位置への挿入として衝突する（#3289 の測定では、2026-09-19〜10-19 に README を触った 28 commit のうち
23 が 1 行の追記だった）。

#3289 は、tpl-tools の `tpl regenerate` で topic ごとに分けた索引 `index.md` を生成し、各 PR がそれを
コミットして CI の `tpl regenerate --check` で鮮度を検査する、と提案していた。topic で分けると衝突は
「同じ topic に足す PR 同士」に減るが、Issue 自身の見積もりで並行する組の約 30% は衝突し続ける。

この形は、ADR の生成物が 2026-11-01 まで採っていたものと同じである。ADR-3416 は、生成物を PR が運ぶ
こと自体が無関係な PR 同士の衝突を生み、衝突した Low の PR が auto-merge で止まる、という理由でこの形を
やめ、生成物は毎日の routine が出す再生成 PR でだけ更新することにした。TPL の PR も段階は Low
（`docs/test-perspectives/**`）で、同じ止まり方をする。

## 制約・前提

- **ADR-3416 の仕組みがそのまま前提になる。** `pnpm adr:regenerate-pr` が `main` から生成し直した
  生成物だけを変える PR を `chore/adr-regenerate` に作り、required check の `Validate`
  （`scripts/adr/check-generated.ts`）が差分を「生成物に触れない PR」か「ちょうど再生成である PR」に
  分け、それ以外を落とす。マージの可否は routine ではなくこの check が保証する（TPL-3286、TPL-2658）
- **`tpl validate` は、`indexFile` を設定すると索引が全 TPL を載せていることを要求する**（tpl-tools
  ADR-27）。索引が 1 日遅れる運用では、TPL を足す・改名する PR は必ずこの検査に落ちる。外す手段は
  今の tpl-tools に無い
- 生成物のパスの集合を決める処理（`scripts/adr/generated.ts`）は `adr.config.json` の
  `paths.outputs` だけを読む。`regenerationWaivesRecord`（Review tier）、`regenerate-pr-flow.ts`、
  `check-freshness.ts` も同じ前提で書かれている
- `Validate` の workflow（`adr-validate.yml`）は path filter で起動し、対になる
  `adr-validate-skip.yml` の `paths-ignore` と一致させる必要がある（TPL-1480）

## 検討した選択肢

### D1: 索引を誰が書くか

#### 案 1-A: 各 PR が `index.md` をコミットし、CI の `--check` で鮮度を見る（#3289 の提案）

- 実装は小さい（版上げ・config・README の表の削除・CI に 1 行）
- 同じ topic に足す並行 PR は衝突し続け、衝突した Low の PR は誰かが生成し直して push するまで止まる
- ADR-3416 が却下した形を TPL にだけ残すことになる

#### 案 1-B: PR は `index.md` に触れず、毎日の再生成 PR が書く（採用）

- 索引で衝突する PR が無くなる。再生成 PR も索引しか触らない
- `index.md` は repo に置いたままなので、GitHub でも clone 直後でも読める（ADR-788 と同じ読み方）
- 代償は ADR と同じで、`main` の索引は最大 1 日（待ちきれない日を挟むと 2 日）遅れる。その日に足した
  TPL はファイルを直接読めば分かる

### D2: 再生成 PR を ADR と分けるか

#### 案 2-A: ADR の再生成 PR に TPL の索引も載せる（採用）

`scripts/adr/generated.ts` が返す「生成物のパスの集合 G」を、ADR の出力と TPL の索引の和集合にする。
差分の分類（ふつうの PR / 再生成の PR / 混在）、`Validate` の「ちょうど再生成であること」の比較、
Review tier の記録の免除、鮮度の見張りは、G が広がるだけで規則は変えない。

- routine は 1 日 1 回、PR も 1 本のまま。待つ check も同じ
- 生成器が 2 つになるので、「head の入力から生成し直す」処理は両方を実行し、比較する木も両方の出力を
  合わせたものにする
- ブランチ名 `chore/adr-regenerate` と本文の印 `<!-- adr-regenerate -->` は変えない。再生成 PR を
  見分ける 4 つの印（ADR-3416）・`review-request.yml`・routine の設定がこの名前を持っており、
  名前を変える利益より、それらを同時に書き換える危険のほうが大きい。PR のタイトルは
  「ADR と TPL の索引を再生成する」意味に変える

#### 案 2-B: TPL 専用の再生成 PR を別に作る

- ブランチ・印・routine の起動・鮮度の見張りが二重になる。約 1100 行の ADR 用スクリプトを
  パラメータ化するか複製するかが必要で、どちらにしても 2 本の PR が同じ required check を待つ
- 利点は ADR の生成と TPL の生成が互いの失敗に巻き込まれないことだが、どちらの生成器も依存の
  install 後に同じ worktree で動くので、片方だけ壊れる場面は版上げの PR に限られ、それは `Validate`
  がその PR で落とす

### D3: `tpl validate` に索引の完全さを求めさせない

案 1-B では索引が遅れるのが正常なので、`validate` は索引を見てはいけない。索引が正しいことは、
再生成 PR の「ちょうど生成器の出力であること」の比較が保証する。

#### 案 3-A: tpl-tools に、索引の検査を外す config のキーを足す（採用）

`indexFile` を設定したまま、`validate` の索引の検査（全 TPL が載っている・リンクが解決する）を
止める opt-in のキーを足す。`regenerate` と、索引への状態の表示はそのまま使える。

- config のキーにするのは、`validate` を呼ぶ場所（pre-push、CI の 2 つの Check）が全部同じ設定を読む
  ようにするため。flag だと呼び出しごとに付け忘れがありうる（tpl-tools ADR-17 は逆に flag を選んだが、
  あれは「どのディレクトリを検査するか」の範囲の指定で、呼び出しごとに変わりうるものだった）
- キー名は tpl-tools 側の設計で決める（候補: `"indexCheck": false`）

#### 案 3-B: `validate` 用と `regenerate` 用に config を分ける

`validate` には `indexFile` の無い config を渡す。だが `indexFile` が無いと `validate` は
`README.md` の一覧表を検査するので、表を消した README で全 TPL が「行が無い」と落ちる。tpl-tools の
変更なしには成り立たない。

### D4: 生成物の検査をどこで回すか

再生成 PR は ADR の生成物と TPL の索引の両方を触るので、分類の規則は 1 か所で持つ。今の `Validate`
（`adr-validate.yml` の `check-generated.ts`）に TPL の索引を含め、`adr-validate.yml` の `paths` に
`docs/test-perspectives/**` を足す（`tpl.config.json` は既にある）。`adr-validate-skip.yml` の
`paths-ignore` にも同じ行を足す（TPL-1480）。pre-push の `adr-generated-check` の glob にも足す。

TPL を足すだけの PR でも `Validate` が走るようになるが、`adr validate` と生成器の実行は数秒で終わる。

## 比較

| 論点 | 採用 | 主な却下案 | 決め手 |
| --- | --- | --- | --- |
| 索引を誰が書くか | 毎日の再生成 PR（1-B） | 各 PR がコミットして `--check`（1-A） | 並行 PR の衝突が無くなる。ADR-3416 と同じ形にそろう |
| 再生成 PR | ADR と同じ 1 本（2-A） | TPL 専用の PR（2-B） | routine・check・見張りを二重にしない |
| `validate` の索引検査 | tpl-tools の config キーで止める（3-A） | config を分ける（3-B） | 3-B は README の表の検査に落ちて成り立たない |
| 検査の場所 | `Validate` に TPL の索引を含める | 別の workflow | 再生成 PR は両方を触るので、分類の規則を 1 か所に置く |

## Related TPLs

- [TPL-3286](../test-perspectives/TPL-3286-merge-eligibility-judged-on-final-diff.md): 再生成 PR を人を通さずマージしてよいかは、最終の差分で `Validate` が判定する。TPL の索引を G に入れても判定の仕方は変えない
- [TPL-2658](../test-perspectives/TPL-2658-agent-write-scope-is-declared-not-prompted.md): routine が書いてよい範囲は prompt ではなく G の宣言で検証する。G を広げるのは config と `generated.ts` の変更として PR に残る
- [TPL-1480](../test-perspectives/TPL-1480-consistency-check-triggers-on-both-sides.md): `adr-validate.yml` の `paths` と `adr-validate-skip.yml` の `paths-ignore` を同じ PR でそろえる
- [TPL-2786](../test-perspectives/TPL-2786-guard-failure-must-fail-the-run.md): 鮮度の見張りが TPL の索引について結論を出せないときは、通過ではなく失敗にする
- [TPL-1032](../test-perspectives/TPL-1032-derived-state-staleness.md): 索引は TPL の frontmatter と本文から導出できる値で、手で持たない

proactive TPL は起こさない。本設計が破りうる原則として「遅れることが正常な生成物を、PR ごとの検査の
前提にしない」（D3）を検討したが、ADR 側で同じ形を `adr validate` が既に守っており、TPL 側は 3-A の
キーと、その上で `tpl:validate` が通ることで機械的に確かめられる。違反は今回の 1 か所に限られ、
横展開しうる先が見当たらない。

## 現時点の方針

案 1-B + 2-A + 3-A、検査は `Validate` に含める。

### 実装の指針

1. **tpl-tools**: 索引の検査を止める config キーを足して release する（tpl-tools の repo に Issue と
   英語の ADR）。karasu 側はこの版を待つ
2. **karasu**（1 本の PR）:
   - `@kompiro/tpl-tools` を上げ、`tpl.config.json` に `indexFile: "index.md"` と 1 のキーを設定する
   - `scripts/adr/generated.ts` の G に TPL の索引を足す。G を読む側（`check-generated.ts`、
     `regenerate-at.ts` の生成と比較、`regenerate-pr-flow.ts` の生成とコミット、`tier.ts` の
     `regenerationWaivesRecord`、`check-freshness.ts`）を、両方の生成器を実行する形にする
   - `adr-validate.yml` / `adr-validate-skip.yml` / `lefthook.yml` の `adr-generated-check` に
     `docs/test-perspectives/**` を足す
   - README の一覧表を消し、生成された `index.md` へのリンクを置く。「新規エントリの追加タイミング」と
     Validator の節を直す（表への追記の手順を消し、索引は翌日の再生成 PR が更新すると書く）
   - `pnpm tpl:regenerate` を足す（手元で索引を見るため。生成物の差分はコミットしない、を
     `.claude/rules/adr.md` の生成物の注意と同じ形で書く）
   - **この PR は `index.md` を書かない。** 出力の設定を変える PR が生成物を書くと `Validate` は
     混在として落とす（ADR-3416）。最初の `index.md` は次の再生成 PR が作る。表を消してから最初の
     再生成 PR がマージされるまでの最大 1 日、索引が無い。急ぐならマージ直後に手元で
     `pnpm adr:regenerate-pr` を実行する
3. 受け入れテスト（`docs/acceptance/`）は作らない。利用者から見える挙動は無く、`check-generated.ts`
   と `generated.ts` の既存のユニットテストに TPL の索引の場合を足して確かめる。ADR-3416 の
   受け入れテストのうち、再生成 PR の流れを確かめる項目は TPL の索引を含めて読み替える
4. ADR への昇格は 2 のマージ後。ADR-3416 を覆すのではなく範囲を広げる決定なので、新しい ADR で
   `related_to: ADR-3416` とし、ADR-3416 の本文は変えない

## 未解決の問い

- **索引への状態の表示（#3488）の遅れ**: 状態も 1 日遅れて索引に出る。Design Doc を書く人が使う
  `tpl related --status` は手元で導出するので遅れない。索引の状態は一覧として眺める用途に限り、
  遅れを許容するつもりでいる
- **tpl-tools のキーの形**: 索引の検査を止めるだけのキーにするか、`indexFile` を
  `{ "path": "index.md", "check": false }` のような形に広げるか。tpl-tools 側の設計で決める
