# Low の PR が外のドメインへのリンクを足したら、人間のレビューに回す

- **日付**: 2026-11-14
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#3786](https://github.com/kompiro/karasu/issues/3786)（#3781 のレビューで kompiro が挙げた）
  - 関連 ADR: [ADR-3286](../adr/3286-risk-based-review-tiers.md)（段階の分類器と Low の範囲）、[ADR-2331](../adr/2331-adr-automerge-scope.md)（ADR の PR の auto-merge）、[ADR-3620](../adr/3620-promotion-swap-sibling-link-and-label.md)（張り替えでは別のドメインへのリンクを作れないことと、本件への申し送り）
  - 関連 TPL: [TPL-3286](../test-perspectives/TPL-3286-merge-eligibility-judged-on-final-diff.md)（人間を通らないマージは、当たらない入力を厳しい側に倒す）、[TPL-168](../test-perspectives/TPL-168-trust-boundary-input-validation.md)（境界で正規化してから確かめる）、[TPL-2287](../test-perspectives/TPL-2287-detector-near-misses-are-the-spec.md)（検出器の境界の外側をテストで固定する）、[TPL-2804](../test-perspectives/TPL-2804-guard-scan-set-fails-loud-on-the-unknown.md)（未知のものを対象外に落とさない）
  - コード: `scripts/review/tier.ts`（`classifyChange`、`fileTier`、変更ファイルの両側の全文を読む箇所）

## 背景・課題

Low の PR は人間が読まずにマージされる（ADR-3286。Low PR merger かネイティブの auto-merge）。新しい ADR、`docs/test-perspectives/**`、`docs/guide/**` は、中身を問わず Low になる。そのためこれらのファイルに外のドメインへのリンクを書くと、ローカルレビューの記録と CodeRabbit CLI の 1 回（どちらも作成者が自分で報告するもの）だけを通って `docs/` に入り、ドキュメントサイト（`kompiro.github.io/karasu`）にも載る。フィッシングのリンクがこの経路で誰にも読まれずに公開されうる。

ADR-3620 で広げた参照の張り替えは、決まった形（新しい ADR のパス・名前・`ADR-<n>`）しか書けず、残りの文字は base の行と一致しなければならないので、ドメインを足せない。開いているのはファイルの中身が丸ごと Low になる経路である。

kompiro の方針（#3781）: 「リンクの場合は変更内容を確認し、karasu の開発ドキュメント以外のドメイン等への変更の時は人のレビューを行う。フィッシング疑いを検出し、人のレビューに回す。」

## 現状（インベントリ）

| 観点 | 現状 |
| --- | --- |
| Low のファイル | `docs/test-perspectives/**`・`docs/guide/**`（Markdown と SVG）・新しいテストファイル（`LOW_GLOBS`）、新しい ADR と既存 ADR の frontmatter（`adrFileTier`）、ADR の昇格の差分（Design Doc の削除・張り替え・AT へのリンクの追加。`fileTier`）、ADR と TPL の索引の再生成 |
| 中身の検査 | 張り替え（`isLinkSwap`）とリンクの追加（`isLinkInsert`）は許す形を決め打ちにしている。それ以外の Low のファイルは中身を見ない |
| 両側の全文 | `ChangedFile.before` / `after` を読むのは `package.json`、ADR、AT だけ |
| 今ある外のリンク | Low のドキュメントの URL のうち github.com が約 1,770 件で、そのうち 1,728 件は `kompiro/karasu`、残りも多くは `kompiro/` 以下。ほかは `karasu.kompiro.dev`・`taka.kompiro.dev`・`www.w3.org`（SVG の名前空間）・`example.com` 系・`localhost` と、上流の Issue や公式ドキュメントへのリンクが数件 |
| 実際の頻度 | 2026-09-01 以降に main に入り、Low のドキュメントに触れた 357 コミットのうち、そのファイルの base に無い外の URL を足したものは 12 件（誤検出を含む）。うち 4 件は Dependabot のトリアージ ADR が上流の Issue や PR を引いたもの |
| 生成物 | ADR と TPL の索引（`effective.md`・`graph.md`・`graph/*.md`・`index.md`）は今 URL を含まない |

## 制約・前提

- 分類器は依存を持たない（Review tier と Low PR merger は依存をインストールせずに動かす。ADR-3286）。URL の解析も標準の機能と正規表現で行う
- 人間を通らないマージを許す判定なので、読めない入力は外として数え、厳しい側に倒す（TPL-3286）
- 許すドメインの一覧は Low の PR から広げられない場所に置く。分類器の外の設定ファイルに置くと、同じ Low の PR で一覧に足してリンクを入れられる
- Medium・Design・High の PR は人間が読むので、本件は Low になるファイルだけを変える
- 誤検出（Low で済むはずの PR が Medium になる）は人間が 1 回読むだけで済むので受け入れる。見逃しは受け入れない

## 検討した選択肢

### 案 1: Low のドキュメントが足した URL のホストを許可リストで判定する（Issue の提案）

テストファイルを除く Low のファイルについて、追加行から URL をすべて拾い、そのファイルの base に無いもののホストが karasu のドメインでなければ、そのファイルを Medium にする。

**メリット**

- kompiro の方針どおり、外のドメインへのリンクだけが人に回る。karasu 自身へのリンク（大半）は Low のまま
- 誤検出は 2 か月半で 12 件程度で、人間の手間は小さい

**デメリット**

- URL の拾い方に穴があれば見逃す。Markdown と HTML は URL を書く形が多い（リンク、参照の定義、autolink、`www.`、HTML の属性、文字参照、バックスラッシュのエスケープ、行をまたぐ属性）。拾い方を広く取り、読めないものは外として数える必要がある

### 案 2: Low のドキュメントが URL を 1 つでも足したら Medium にする

ホストを見ず、http(s) の URL や `www.` を足した時点で Medium にする。

**メリット**

- 判定が単純で、ホストの解析の穴が無い

**デメリット**

- ADR や TPL は `github.com/kompiro/karasu/issues/N` や `karasu.kompiro.dev` へのリンクを日常的に足すので、新しい ADR の多くが Medium になり、ADR-2331 の auto-merge がほぼ効かなくなる

### 案 3: リンクを Markdown パーサーで取り出す

**メリット**

- リンクの形を正しく読める

**デメリット**

- 分類器が依存を持てない（ADR-3620 で `marked` が読み込めなかったのと同じ）。パーサーも、ブラウザやドキュメントサイトの描画が URL として読む形（行をまたぐ HTML の属性など）をすべては拾わない

### 案 4: Low の範囲から ADR とドキュメントを外す

**メリット**

- 判定が要らない

**デメリット**

- ADR の昇格と TPL の追加がすべて人間のレビューに戻る。ADR-2331 と ADR-3286 が解いた問題が戻る

## 現時点の方針

**案 1 を採用する。** 外のドメインへのリンクだけを人に回し、karasu 自身へのリンクは Low のまま通す。URL の拾い方は広く取り、読めないものは外として数える。

決めること:

- **D1: 対象。** 分類器が Low とした変更ファイルのうち、テストファイル（`isTestFile`）でないもの。今は Markdown と SVG だけで、どこに置いたファイルでも同じに扱う。テストファイルの URL は描画されず読者に届かないので見ない（kompiro の決定）。Medium 以上のファイルは見ない
- **D2: 新しい URL。** 追加行の URL のうち、そのファイルの base の全文（下の D3 の正規化をかけたもの）に同じ文字列が無いものだけを数える。行を直すだけで既にある外のリンクが人に回らないようにするためである。別のファイルから移したリンクは新しく数える。新しいファイルは base が空なので、すべて数える
- **D3: URL の拾い方。** 比べる前に、ブラウザとドキュメントサイトの描画が URL として読むものに近づける。
  1. ASCII の記号の前のバックスラッシュを外す（CommonMark のエスケープ。`https:\/\/x` は `https://x`）
  2. 数値の文字参照（`&#58;`・`&#x2F;`）を文字に戻す。`&amp;` `&lt;` `&gt;` `&quot;` `&apos;` `&nbsp;` 以外の名前付きの文字参照（`&colon;` など）がある行は、それだけで外として数える
  3. hunk の連続した追加行を、改行とタブを除いてつないだ文字列も同じように調べる（URL の解析は改行とタブを捨てるので、`https:/` と `/x.com` に分けた属性は 1 つの URL になる）

  そのうえで、次をすべて URL として拾う。`<scheme>:` の後に `//` が続くもの、`//` で始まり前が行頭・空白・`(` `<` `"` `'` `=` のもの（scheme を省いた形）、`www.` で始まり前が英数字・`.`・`/` でないもの（GFM の autolink）、`<local>@<domain>` のメールアドレス（GFM が `mailto:` にする）、`mailto:` `javascript:` `data:` `vbscript:` `file:` で始まるもの。SVG の `xmlns` / `xmlns:<prefix>` 属性の値は名前空間の名前でリンクではないので拾わない
- **D4: ホストの判定。** scheme が `http` か `https` で、authority が ASCII の英数字・`.`・`-` と任意の `:<port>` だけからなり、小文字にして末尾の `.` を外したホストが次の一覧に当たるときだけ karasu のドメインと見なす。それ以外（ほかの scheme、userinfo の `@`、パーセントエンコード、非 ASCII の文字、バックスラッシュ、空のホスト、メールアドレス）はすべて外として数える
  - `github.com` で、パスが `/kompiro/` か `/kompiro` で始まるもの（owner 名は大文字小文字を区別しない）。github.com のほかのパスは外として数える。github.com には誰でもリポジトリや gist を置けるので、ホストだけでは信用しない（kompiro の決定）
  - `kompiro.dev` とそのサブドメイン（`karasu.kompiro.dev`・`taka.kompiro.dev`・`karasu-nest.kompiro.dev`）
  - `kompiro.github.io`（ドキュメントサイト）
  - `karasu.pages.dev` とそのサブドメイン（Cloudflare Pages のプロジェクトと、その branch の preview）
  - 登録できない名前（RFC 2606・RFC 6761）: `localhost` と `*.localhost`、`127.0.0.1`、`example.com`・`example.net`・`example.org` とそのサブドメイン、`*.example`・`*.test`・`*.invalid`

  サブドメインは `.<domain>` で終わることで判定し、`karasu.kompiro.dev.evil.com` のように途中に含むだけのものは当たらない
- **D5: 結果。** 外の URL を 1 つでも足したファイルは Medium になり、PR も Medium 以上になる。Review tier の summary と reasons に、ファイルとホスト（読めなかったものは「読めない URL」）を 1 行ずつ出す。Medium の PR は auto-merge されず、記録と人間の判断で通る
- **D6: 一覧の置き場。** 分類器（`scripts/review/tier.ts`）の中に定数で置く。分類器は High のパスなので、一覧を広げる変更は CodeRabbit のラウンドと kompiro のレビューを通る

### 仕様の変更

```diff file=docs/process/review.md
@@
   なったら Medium に下げる。#3540）
 - テストファイルはこの 2 つの規則から外れ、新しいファイルは Low、既存のファイルの変更は Medium のまま。ただし
   セキュリティの境界のテストから行を消す変更は High になる
+- **外のドメインへのリンク**：Low になるファイル（テストファイルを除く）が、base のそのファイルに無い URL を
+  足し、その URL が karasu のドメインを指していなければ、そのファイルは Medium になる。karasu のドメインは
+  `github.com/kompiro/` 以下、`kompiro.dev` とそのサブドメイン、`kompiro.github.io`、`karasu.pages.dev` とその
+  サブドメイン、登録できない名前（`localhost`・`127.0.0.1`・`example.com` など）。読めない URL も外として数える。
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
+  上流の Issue や PR を引くトリアージの ADR はこれに当たり、人間が読む
 - PR を作った後に差分を足すときは、**push の前に** auto-merge を解いて draft に戻す。
   push した瞬間に auto-merge が確認前の差分をマージしうるからである。
   ```
````

### 実装の指針

1. 変更ファイルの両側の全文を読む対象に、Low になりうるドキュメント（`LOW_GLOBS` のテストファイル以外と、ADR の昇格で Low になる Markdown）を足す。読めなければ、そのファイルは外の URL を足したものとして扱う（TPL-2786）
2. `outsideLinks(f: ChangedFile): string[]` を足す。D3 の正規化と拾い方、D4 のホストの判定、D2 の base との比較を行い、外として数えた URL の説明（ホストか「読めない URL」）を返す。一覧（D4）は同じファイルの定数にする
3. `classifyChange` で、ファイルの段階が Low でテストファイルでなく、`outsideLinks` が空でないとき、そのファイルを Medium にし、reasons と summary に出す。`fileTier` の中ではなく後段に置くのは、張り替えや ADR の判定がどの経路で Low を出しても同じ検査を通すためである
4. `scripts/review/tier.test.ts` に足すテスト（TPL-2287）:
   - 受け入れる（Low のまま）: `github.com/kompiro/karasu/issues/1`・`github.com/Kompiro/hane`、`karasu.kompiro.dev`・`taka.kompiro.dev`、`kompiro.github.io/karasu/`、`karasu.pages.dev` とその preview、`localhost:5173`・`127.0.0.1`、`example.com` 系と `.example`・`.test`・`.invalid`、base のそのファイルに既にある外の URL を含む行の書き換え、SVG の `xmlns`、テストファイルに足した外の URL
   - 拒む（Medium）: github.com のほかの owner、`gist.github.com`・`raw.githubusercontent.com`、`kompiro.dev.evil.com`・`evilkompiro.dev`・`kompiro.github.io.evil.com`、userinfo（`https://karasu.kompiro.dev@evil.com`）、非 ASCII のホスト（キリル文字の `о` を含む `kompirо.dev`）と `xn--`、パーセントエンコードしたホスト、バックスラッシュ（`https://karasu.kompiro.dev\@evil.com`）、末尾の `.` 付きの外のホスト、`www.evil.com`、scheme を省いた `//evil.com`、`<https://evil.com>`、参照の定義 `[x]: https://evil.com`、`[https://karasu.kompiro.dev](https://evil.com)`（リンクの文字列と行き先が違う）、画像 `![](https://evil.com/x.png)`、HTML の `href` と `src`、メールアドレス、`mailto:`・`javascript:`・`data:`、文字参照（`https&#58;//evil.com`・`&#x2F;&#x2F;evil.com`）、名前付きの文字参照（`&colon;`）、バックスラッシュのエスケープ（`https:\/\/evil.com`）、2 行に分けた属性（`href="https:/` と `/evil.com"`）、別のファイルから移した外のリンク、新しい ADR とその昇格の PR、`docs/guide/` の SVG
   - 段階が変わらないこと: Medium・Design・High のファイルが外の URL を足しても、段階はそのまま
5. `docs/process/review.md` と `.claude/rules/adr.md` を上の「仕様の変更」のとおりにする
6. 受け入れテスト（`docs/acceptance/`）は作らない。変わるのは分類器の判定だけで、上のテストで確かめる
7. ADR 昇格: 実装 PR のマージ後、`docs/adr/3786-review-tier-outside-domain-links.md` として昇格し、本 Design Doc は同じ PR で削除する

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: なし（開発の運用だけ）
- 上流の Issue や PR を引く Dependabot のトリアージ ADR、公式ドキュメントへのリンクを足す ADR や TPL は Medium になり、kompiro が読む。2 か月半の実績では 12 件程度
- ADR と TPL の索引の再生成 PR は、生成物が今 URL を含まないので影響しない。生成物が外の URL を含むようになると Medium になって自動マージが止まるので、そのときに扱いを決める
- ドキュメント更新: `docs/process/review.md`、`.claude/rules/adr.md`

## 未解決の問い / 決めないこと

- ドメインの一覧は、実際に人に回ったリンクを見てから広げる。広げるのは分類器を変える High の PR で行う
- 外のリンクの行き先が安全かどうか（中身）は判定しない。人に回すところまでを分類器が行う
- テストファイルの URL（テストの実行時に取りにいく先）は本件の対象外。新しいテストファイルが CI でコードを動かすのは ADR-3286 で受け入れた範囲である
