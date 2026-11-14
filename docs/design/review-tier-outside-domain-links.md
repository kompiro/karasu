# Low の PR が外のドメインへのリンクを足したら、人間のレビューに回す

- **日付**: 2026-11-14
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#3786](https://github.com/kompiro/karasu/issues/3786)（#3781 のレビューで kompiro が挙げた）
  - 関連 ADR: [ADR-3286](../adr/3286-risk-based-review-tiers.md)（段階の分類器と Low の範囲）、[ADR-2331](../adr/2331-adr-automerge-scope.md)（ADR の PR の auto-merge）、[ADR-3620](../adr/3620-promotion-swap-sibling-link-and-label.md)（張り替えでは別のドメインへのリンクを作れないことと、本件への申し送り。正規表現で markdown の構造を追うと穴が続いた経緯）
  - 関連 TPL: [TPL-3286](../test-perspectives/TPL-3286-merge-eligibility-judged-on-final-diff.md)（人間を通らないマージは、当たらない入力を厳しい側に倒す）、[TPL-168](../test-perspectives/TPL-168-trust-boundary-input-validation.md)（境界で正規化してから確かめる）、[TPL-2287](../test-perspectives/TPL-2287-detector-near-misses-are-the-spec.md)（検出器の境界の外側をテストで固定する）、[TPL-2804](../test-perspectives/TPL-2804-guard-scan-set-fails-loud-on-the-unknown.md)（未知のものを対象外に落とさない）、[TPL-2786](../test-perspectives/TPL-2786-guard-failure-must-fail-the-run.md)（結論を出せなければ失敗として扱う）
  - コード: `scripts/review/tier.ts`（`LOW_GLOBS`、`classifyChange`、`fileTier`、変更ファイルの両側の全文を読む箇所）

## 背景・課題

Low の PR は人間が読まずにマージされる（ADR-3286。Low PR merger かネイティブの auto-merge）。新しい ADR、`docs/test-perspectives/**`、`docs/guide/**` は、中身を問わず Low になる。そのためこれらのファイルに外のドメインへのリンクを書くと、ローカルレビューの記録と CodeRabbit CLI の 1 回（どちらも作成者が自分で報告するもの）だけを通って `docs/` に入る。Low の PR を作れるのは信頼リストの作成者（kompiro）だけなので、想定するのは、そのセッションで動くエージェントがプロンプトインジェクションなどで外のリンクを書くことである。

ADR-3620 で広げた参照の張り替えは、決まった形（新しい ADR のパス・名前・`ADR-<n>`）しか書けず、残りの文字は base の行と一致しなければならないので、ドメインを足せない。開いているのはファイルの中身が丸ごと Low になる経路である。

kompiro の方針（#3781）: 「リンクの場合は変更内容を確認し、karasu の開発ドキュメント以外のドメイン等への変更の時は人のレビューを行う。フィッシング疑いを検出し、人のレビューに回す。」

## 現状（インベントリ）

| 観点 | 現状 |
| --- | --- |
| Low のファイル | `docs/test-perspectives/**`・`docs/guide/**`（拡張子を問わない）・新しいテストファイル（`LOW_GLOBS`）、新しい ADR と既存 ADR の frontmatter（`adrFileTier`）、ADR の昇格の差分（Design Doc の削除・張り替え・AT へのリンクの追加。`fileTier`）、ADR と TPL の索引の再生成 |
| 描画される場所 | ADR と TPL は GitHub の表示だけで、GitHub はスクリプトやイベント属性を取り除き、リンクと画像を残す。`docs/guide/*.md` はドキュメントサイト（Starlight、`kompiro.github.io/karasu`。`PUBLISHED_EN_FILES`）にも載り、生の HTML をそのまま出す。`docs/guide/` には SVG の図もある |
| 中身の検査 | 張り替え（`isLinkSwap`）とリンクの追加（`isLinkInsert`）は許す形を決め打ちにしている。それ以外の Low のファイルは中身を見ない |
| 両側の全文 | `ChangedFile.before` / `after` を読むのは `package.json`、ADR、AT、テストファイルとコードのファイルなどで、TPL と guide は読まない |
| 今ある外のリンク | ADR・TPL・guide の URL のうち github.com が約 1,770 件で、そのうち 1,728 件は `kompiro/karasu`。karasu のホストへのリンクは `karasu.kompiro.dev` のトップ、`karasu-nest.kompiro.dev`、`taka.kompiro.dev` の短縮リンク 1 件だけで、`github.com/kompiro/` の `blob`・`tree` は `main` を指すものだけ |
| 実際の頻度 | 2026-09-01 以降に main に入り、Low のドキュメントに触れた 357 コミットのうち、そのファイルの base に無い外の URL を足したものは 12 件（誤検出を含む）。うち 4 件は Dependabot のトリアージ ADR が上流の Issue や PR を引いたもの。`docs/guide/` の変更は 2026-08-01 以降で 27 コミット（うち SVG を含むもの 15） |
| 生成物 | ADR と TPL の索引（`effective.md`・`graph.md`・`graph/*.md`・`index.md`）は今 URL を含まない |

## 制約・前提

- 分類器は依存を持たない（Review tier と Low PR merger は依存をインストールせずに動かす。ADR-3286）。URL の解析も標準の機能と正規表現で行う
- 人間を通らないマージを許す判定なので、読めない入力は外として数え、厳しい側に倒す（TPL-3286）。ADR-3620 では、正規表現で markdown の構造（リンクかコードか地の文か）を見分けようとして、レビューのたびに穴が見つかった。本件では構造を見分けず、ファイル全体から URL になりうるものをすべて拾う
- 許すドメインの一覧は Low の PR から広げられない場所に置く。分類器の外の設定ファイルに置くと、同じ Low の PR で一覧に足してリンクを入れられる
- Medium・Design・High の PR は人間が読むので、本件は Low になるファイルだけを変える
- 誤検出（Low で済むはずの PR が Medium になる）は人間が 1 回読むだけで済むので受け入れる。見逃しは受け入れない

## 検討した選択肢

### 案 1: Low のドキュメントが足した URL のホストを許可リストで判定する（Issue の提案）

Low のファイルから URL を拾い、新しく増えたもののホストが karasu のドメインでなければ、そのファイルを Medium にする。

**メリット**

- kompiro の方針どおり、外のドメインへのリンクだけが人に回る。karasu 自身へのリンク（大半）は Low のまま
- 誤検出は 2 か月半で 12 件程度で、人間の手間は小さい

**デメリット**

- ドキュメントサイトは生の HTML を出すので、`docs/guide/` では URL を書かずに外へ飛ばせる（`<img src=x onerror=…>`、`<script>`）。SVG もスクリプトやリンクを持てる。URL を拾うだけでは塞げない
- URL の拾い方に穴があれば見逃す

### 案 2: 案 1 に加え、`docs/guide/**` を Low から外す（採用）

ドキュメントサイトに載る `docs/guide/**` は Medium にし、URL の検査は GitHub の表示にしか出ない ADR と TPL の Markdown に当てる。

**メリット**

- 生の HTML と SVG の経路が、検出ではなく範囲から消える
- 残る ADR と TPL は GitHub がスクリプトを取り除くので、塞ぐものがリンクと画像の行き先だけになる

**デメリット**

- `docs/guide/` の変更（2026-08-01 以降で 27 コミット）が kompiro のレビューに回る

### 案 3: Low のドキュメントが URL を 1 つでも足したら Medium にする

**メリット**

- ホストの解析の穴が無い

**デメリット**

- ADR や TPL は `github.com/kompiro/karasu/issues/N` へのリンクを日常的に足すので、新しい ADR の多くが Medium になり、ADR-2331 の auto-merge がほぼ効かなくなる

### 案 4: リンクを Markdown パーサーで取り出す

**メリット**

- リンクの形を正しく読める

**デメリット**

- 分類器が依存を持てない（ADR-3620 で `marked` が読み込めなかったのと同じ）

### 案 5: Low の範囲から ADR と TPL も外す

**メリット**

- 判定が要らない

**デメリット**

- ADR の昇格と TPL の追加がすべて人間のレビューに戻る。ADR-2331 と ADR-3286 が解いた問題が戻る

## 現時点の方針

**案 2 を採用する。** ドキュメントサイトに載る `docs/guide/**` は Low から外す（kompiro の決定）。残る Low の Markdown では、外のドメインへのリンクだけを人に回し、karasu 自身へのリンクは Low のまま通す。URL は構造を見分けずにファイル全体から広く拾い、読めないものは外として数える。

決めること:

- **D1: Low の範囲を狭める。** `LOW_GLOBS` から `docs/guide/**` を外し、`docs/test-perspectives/**` は `.md` だけにする（ほかの拡張子は Medium）。ADR の記録はもともと `.md` だけである
- **D2: 対象。** 分類器が Low とした変更ファイルのうち、テストファイル（`isTestFile`）でないもの。テストファイルの URL は描画されず読者に届かないので見ない（kompiro の決定）。対象のファイルは変更後の全文を読み、読めなければ（バイナリ、hunk の無い変更、読み出しの失敗）外の URL を足したものとして扱う
- **D3: 正規化。** 変更前と変更後の全文に同じ正規化をかける。
  1. 数値の文字参照（`&#58;`・`&#x2F;`。末尾の `;` は無くてもよい）を文字に戻す。`&amp;` `&lt;` `&gt;` `&quot;` `&apos;` `&nbsp;` を文字に戻し、ほかの名前付きの文字参照（`&colon;` など）は、それ自体を読めない URL として 1 つ数える
  2. バックスラッシュをすべて `/` にする（CommonMark のエスケープ `https:\/\/x` と、URL の解析が `\` を `/` と読むこと（`/\evil.com`）の両方を拾う）
  3. 大文字小文字を区別しない
- **D4: URL の拾い方。** 正規化した全文と、そこから改行・CR・タブを除いた文字列（URL の解析はこれらを捨てるので、行や hunk をまたいで分けた URL がつながる）の両方から、次をすべて拾う。markdown の構造（リンク・コード・地の文）は見分けない
  - `http:` と `https:` のすべての出現（後ろに何が続いても）
  - `mailto:` `javascript:` `data:` `vbscript:` `file:` のすべての出現（いつも外として数える）
  - `//` の後に空白・行末以外の文字が続くすべての出現（scheme を省いた形。前の文字は問わない。URL の解析は余分な `/` を読み飛ばすので、`///evil.com` も外を指す。コードのコメント `// x` は空白が続くので拾わない）
  - `www.` の前が英数字・`.`・`/`・`-` でない出現（GFM の autolink）
  - `<local>@<domain>` のメールアドレス（GFM が `mailto:` にする。いつも外として数える）
- **D5: 新しい URL。** 拾ったものを、下の D6 で読んだ形の文字列で数え、変更後の数が変更前より多いものを新しい URL とする。行を直したり、ファイルの中でリンクを動かしたりしても数は変わらないので、既にある外のリンクは人に回らない。別のファイルから移したリンクは新しく数える。新しいファイルは変更前が空なので、すべて数える
- **D6: ホストの判定。** 次の形にちょうど当たるものだけを karasu のドメインと見なし、それ以外（ほかの scheme、`http:evil.com` や `http:/evil.com` のように `//` の続かない形、authority の後ろの `@`・`%`・非 ASCII の文字、空のホスト、メールアドレス、名前付きの文字参照）はすべて外として数える
  - scheme が `http` か `https` で（scheme を省いた `//` の形も同じに扱う）、`//` の後の authority が ASCII の英数字・`.`・`-` と任意の `:<port>` だけからなり、その直後が `/` `?` `#` 空白・行末・`)` `]` `>` `"` `'` `` ` `` `*` `_` `~` `,` `;` `!` のどれかであること。ホストは末尾の `.` を外して比べる
  - パスは、その直後の空白・`)` `>` `"` `'` `` ` `` までとし、`..`・`%`・`//` を含めば外として数える
  - ホストとパスが次のどれかに当たること。サブドメインは許さず、ホストはちょうど一致させる
    - `github.com` で、最初のパスの区切りが `kompiro` のもの（`/kompiro` か `/kompiro/…`。owner 名は大文字小文字を区別しない）。ただし `raw` の区切りを含むものと、`blob`・`tree`・`commit` の次の区切りが 7 文字以上の 16 進数（コミットの SHA）のものは外として数える。fork に push したコミットは親のリポジトリの URL からも見えるので、SHA を指す URL は他人の中身を出しうる。github.com には誰でもリポジトリや gist を置けるので、ホストだけでは信用しない（kompiro の決定）
    - `karasu.kompiro.dev` で、query が無く、パスが空・`/`・`/kompiro/…` のもの。共有の payload（`?s=`）や他人のリポジトリを読む permalink（`/<owner>/<repo>`）は、karasu のホストでも他人の中身（`.krs` の `link`）を出せる
    - `karasu-nest.kompiro.dev` で query が無いもの（ギャラリーの投稿は operator だけ。ADR-2969）
    - `kompiro.github.io`（ドキュメントサイトと kompiro のページ）
    - `karasu.pages.dev`（本番の Cloudflare Pages）。branch の preview（`*.karasu.pages.dev`）は `spike/**` の push だけで誰の中身でも出せるので許さない
    - 登録できない名前（RFC 2606・RFC 6761）: `localhost`、`127.0.0.1`、`example.com`・`example.net`・`example.org` とそのサブドメイン、`*.example`・`*.test`・`*.invalid`・`*.localhost`
  - `taka.kompiro.dev` は短縮リンクで行き先を確かめられないので許さない。permalink の `short:` に taka を書いた ADR は Medium になる
- **D7: 結果。** 外の URL を 1 つでも新しく足したファイルは Medium になり、PR も Medium 以上になる。Review tier の summary と reasons に、ファイルとホスト（読めなかったものは「読めない URL」）を 1 行ずつ出す。Medium の PR は auto-merge されず、記録と人間の判断で通る
- **D8: 一覧の置き場。** 分類器（`scripts/review/tier.ts`）の中に定数で置く。分類器は High のパスなので、一覧を広げる変更は CodeRabbit のラウンドと kompiro のレビューを通る

### 仕様の変更

```diff file=docs/process/review.md
@@
 
 | 段階 | 変更したもの | PR での CodeRabbit | 通す条件 |
 | --- | --- | --- | --- |
-| Low | `docs/test-perspectives/**`・`docs/guide/**`・新しいテストファイル（既存のテストファイルの変更は Medium）、新しい ADR、ADR の昇格（Design Doc の削除、リンクの張り替え、ADR へのリンクの追加）、既存 ADR の frontmatter、ADR の生成物と TPL の索引だけを変える再生成 PR | 回さない | 記録と CI が通れば auto-merge（再生成 PR は記録なしで、スクリプトが REST でマージする） |
+| Low | `docs/test-perspectives/**` の Markdown・新しいテストファイル（既存のテストファイルの変更は Medium）、新しい ADR、ADR の昇格（Design Doc の削除、リンクの張り替え、ADR へのリンクの追加）、既存 ADR の frontmatter、ADR の生成物と TPL の索引だけを変える再生成 PR | 回さない | 記録と CI が通れば auto-merge（再生成 PR は記録なしで、スクリプトが REST でマージする） |
 | Design | `docs/design/**` | ready の直後に 1 回だけ。ゲートにしない | 記録と人間のレビュー |
-| Medium | ほかのすべて（`packages/*`・`docs/acceptance/**`・`examples/**`・既存 ADR の本文など） | 回さない | 記録と、人間の判断。描画やレイアウトが変わる PR（`rendering-change` ラベル、下）は人間が preview で動作を確かめる |
+| Medium | ほかのすべて（`packages/*`・`docs/acceptance/**`・`docs/guide/**`・`examples/**`・既存 ADR の本文など） | 回さない | 記録と、人間の判断。描画やレイアウトが変わる PR（`rendering-change` ラベル、下）は人間が preview で動作を確かめる |
 | High | workflow・release・依存の変更・`docs/spec/**`・`docs/concepts*.md`・`docs/process.md`・`docs/process/**`・`.claude/rules/**`・`.coderabbit.yaml`・レビューの仕組み（`scripts/review/**`・`scripts/coderabbit/**`・`scripts/render-equivalence/**`・`.claude/skills/**` など）・セキュリティの境界（下）・言語の挙動（下） | Critical / Major の未対応が無くなるまで回す（再レビューは 3 回まで） | 人間が High のファイルと `## For Reviewers` 節を読む。合意済みの Design Doc が裏付ける PR は、節と、summary が並べるファイル（セキュリティの境界と、決定・言語の挙動のパスの外の High のファイル）を読む（下の「High の PR で人間が読むもの」）。決定のパスのファイルは、差分が裏付けの Design Doc に載せた文面とちょうど一致すれば Medium に数える（下の「Design Doc に載せた仕様の文面」） |
 
 - **セキュリティの境界**：信頼できない入力（他人の `.krs`、URL、webview のメッセージ、ディスクのパス）を受ける
@@
   なったら Medium に下げる。#3540）
 - テストファイルはこの 2 つの規則から外れ、新しいファイルは Low、既存のファイルの変更は Medium のまま。ただし
   セキュリティの境界のテストから行を消す変更は High になる
+- **外のドメインへのリンク**：Low になる Markdown（テストファイルを除く）が URL を足し、その URL が karasu の
+  ドメインを指していなければ、そのファイルは Medium になる。karasu のドメインは `github.com/kompiro/` 以下、
+  `karasu.kompiro.dev`・`karasu-nest.kompiro.dev`・`kompiro.github.io`・`karasu.pages.dev`、登録できない名前
+  （`localhost`・`127.0.0.1`・`example.com` など）で、パスや query に条件がある。読めない URL も外として数える。
+  一覧の正本は分類器で、分類器は High のパスにあるので、Low の PR からは広げられない
 
 - **`rendering-change` ラベル**：check「Render equivalence」が merge base と HEAD で描画・診断・整形の出力に差を
   見つけたか、比較を終えられなかった PR に、workflow が付ける。次の比較で差が無ければ外す。マージは止めない。比較が
```

````diff file=.claude/rules/adr.md
@@
   「何を検証したか」の記録なので、レビューなしに書き換わってよい対象ではない
 - 適用条件のいずれかが満たされない場合（例: `packages/**` のファイルが 1 つでも
   差分に含まれる場合）も同様に例外を適用せず、通常通りユーザー確認を経る
+- 新しい ADR が karasu のドメインの外への URL を足すと、その ADR は Medium になり、
+  auto-merge しない（`docs/process/review.md`「リスク段階」の「外のドメインへのリンク」）。
+  上流の Issue や PR を引くトリアージの ADR や、taka の短縮リンクを書いた ADR はこれに当たり、人間が読む
 - PR を作った後に差分を足すときは、**push の前に** auto-merge を解いて draft に戻す。
   push した瞬間に auto-merge が確認前の差分をマージしうるからである。
   ```
````

### 実装の指針

1. `LOW_GLOBS` から `docs/guide/**` を外し、`docs/test-perspectives/**` を `docs/test-perspectives/**/*.md` にする（D1）
2. 変更ファイルの両側の全文を読む対象に、Low になりうる Markdown（TPL、ADR、昇格で Low になる Markdown）を足す
3. `outsideLinks(f: ChangedFile): string[]` を足す。D3 の正規化、D4 の拾い方、D6 の判定、D5 の数の比較を行い、外として数えた URL の説明（ホストか「読めない URL」）を返す。読めないファイルは「読めないファイル」を返す。一覧（D6）は同じファイルの定数にする
4. `classifyChange` で、ファイルの段階が Low でテストファイルでなく、`outsideLinks` が空でないとき、そのファイルを Medium にし、reasons と summary に出す。`fileTier` の中ではなく後段に置くのは、張り替えや ADR の判定がどの経路で Low を出しても同じ検査を通すためである
5. `scripts/review/tier.test.ts` に足すテスト（TPL-2287）:
   - 受け入れる（Low のまま）: `github.com/kompiro/karasu/issues/1`・`github.com/Kompiro/hane`・`github.com/kompiro/karasu/blob/main/x.md`、`karasu.kompiro.dev/`・`karasu-nest.kompiro.dev/auth/callback`、`kompiro.github.io/karasu/`、`karasu.pages.dev`、`localhost:5173`・`127.0.0.1`、`example.com` 系と `.example`・`.test`・`.invalid`、文末の `.` や `**…**` で囲んだ karasu の URL、既にある外のリンクを含む行の書き換えと、同じファイルの中での移動、テストファイルに足した外の URL
   - 拒む（Medium）: github.com のほかの owner と `github.com/kompiro-evil/x`、`github.com/kompiro/../x`・`%2e%2e`、`github.com/kompiro/karasu/raw/main/x`・`/blob/<40 桁の SHA>/x`・`/commit/<SHA>`、`gist.github.com`・`raw.githubusercontent.com`、`taka.kompiro.dev/x`、`karasu.kompiro.dev/s?s=…`・`karasu.kompiro.dev/attacker/repo`、`spike-x.karasu.pages.dev`、`kompiro.dev.evil.com`・`evilkompiro.dev`、userinfo（`https://karasu.kompiro.dev@evil.com`）、非 ASCII のホスト（キリル文字の `о` を含む `kompirо.dev`）、パーセントエンコードしたホスト、バックスラッシュ（`https://karasu.kompiro.dev\@evil.com`・`/\evil.com`・`https:\\evil.com`・`https:\/\/evil.com`）、`http:evil.com`・`http:/evil.com`、大文字の `HTTPS://EVIL.COM`・`Www.evil.com`、`www.evil.com`、`//evil.com`（前が `(` `<` `"` `;` `,` `>` 空白・行頭のどれでも）・`///evil.com`・`//%65vil.com`・`//évil.com`、`<https://evil.com>`、参照の定義 `[x]: https://evil.com`、`[https://karasu.kompiro.dev](https://evil.com)`（リンクの文字列と行き先が違う）、画像 `![](https://evil.com/x.png)`、HTML の `href` と `src`、メールアドレス、`mailto:`・`javascript:`・`data:`、数値の文字参照（`https&#58;//evil.com`・`&#x2F;&#x2F;evil.com`・`;` の無い `&#58`）、名前付きの文字参照（`&colon;`）、改行・CR・タブで分けた URL（隣の行、空行をはさんだ別の hunk、変えていない行で始まる URL）、コードブロックの中の外の URL（構造を見分けないので数える）、別のファイルから移した外のリンク、新しい ADR とその昇格の PR、バイナリや hunk の無い TPL のファイル
   - 段階が変わること: `docs/guide/` の Markdown と SVG、`docs/test-perspectives/` の `.md` 以外のファイルは Medium
   - 段階が変わらないこと: Medium・Design・High のファイルが外の URL を足しても、段階はそのまま
6. `docs/process/review.md` と `.claude/rules/adr.md` を上の「仕様の変更」のとおりにする
7. 受け入れテスト（`docs/acceptance/`）は作らない。変わるのは分類器の判定だけで、上のテストで確かめる
8. ADR 昇格: 実装 PR のマージ後、`docs/adr/3786-review-tier-outside-domain-links.md` として昇格し、本 Design Doc は同じ PR で削除する

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: なし（開発の運用だけ）
- `docs/guide/` の変更は Medium になり、kompiro が読む
- 上流の Issue や PR を引く Dependabot のトリアージ ADR、公式ドキュメントへのリンクや taka の短縮リンクを足す ADR や TPL は Medium になり、kompiro が読む。2 か月半の実績では 12 件程度
- 構造を見分けないので、コードブロックや地の文で外の URL に触れるだけ（`javascript:` スキームの説明など）でも Medium になる
- ADR と TPL の索引の再生成 PR は、生成物が今 URL を含まないので影響しない。生成物が外の URL を含むようになると Medium になって自動マージが止まるので、そのときに扱いを決める
- ドキュメント更新: `docs/process/review.md`、`.claude/rules/adr.md`

## 未解決の問い / 決めないこと

- ドメインの一覧は、実際に人に回ったリンクを見てから広げる。広げるのは分類器を変える High の PR で行う
- 外のリンクの行き先が安全かどうか（中身）は判定しない。人に回すところまでを分類器が行う
- 残るリスクとして受け入れるもの: 既にファイルにある外の URL（コードブロックの中の例を含む）を、数を増やさずにリンクへ書き換える変更は通る。本件の後にその URL が入ったなら、入ったときに人が読んでいる。許可したドメインの中の、karasu の誰かが置いた中身（Issue に貼った画像など）は確かめない
- テストファイルの URL（テストの実行時に取りにいく先）は本件の対象外。新しいテストファイルが CI でコードを動かすのは ADR-3286 で受け入れた範囲である
