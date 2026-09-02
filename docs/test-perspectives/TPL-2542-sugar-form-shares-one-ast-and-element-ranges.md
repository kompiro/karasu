---
id: TPL-2542
title: "既存プロパティに 2 つ目の受理形（sugar）を足したら、両形が同一 AST に落ちること・formatter の往復・要素単位の range を同じ PR で固定する"
status: active
date: 2026-08-17
applicable_to:
  - "既に受理している構文に、同じ意味の別表記（カンマ列挙・行の繰り返し・省略形）を追加するとき"
  - "宣言 1 行の shorthand に対して、同じ事実を書けるプロパティブロック形を追加するとき"
  - "1 行が複数の要素を持つリスト値プロパティを新設・拡張するとき"
  - "リスト要素を対象とする診断（未解決参照など）の range を決めるとき"
known_consumers:
  - realizes-comma-list
  - edge-property-block
discovered_from:
  - issue: "#2167"
  - issue: "#2543"
  - root_cause_file: "packages/core/src/parser/parser.ts"
related_to:
  - TPL-1101
  - TPL-1503
  - TPL-2133
topic: parser
scope:
  packages:
    - core
---

# TPL-2542: 既存プロパティに 2 つ目の受理形（sugar）を足したら、両形が同一 AST に落ちること・formatter の往復・要素単位の range を同じ PR で固定する

## 観点

同じ意味を別の書き方でも受け付ける「sugar」を足すとき、**新しい形が parse できること**だけを
テストすると、その形を書いた利用者だけが後段で別の挙動を踏む。sugar が sugar であるとは
「後段のどの層から見ても既存形と区別がつかない」ことなので、確認すべきは 3 点ある。

1. **両形が同一 AST に落ちる** — 新形と既存形を別々に parse し、AST を直接突き合わせる。
   新形単体で期待値リテラルと比べるだけでは、既存形の側が変わったときに気づけない
2. **formatter が往復で意味を保つ** — どちらの形を canonical として出力するか決め、
   非 canonical 側は parse → format → parse で AST が保たれることを固定する。カンマ列挙を
   受理しても fmt が行の繰り返しを出すなら、それは仕様であってテストで宣言する対象
3. **要素単位の診断は要素の range を持つ** — 1 行に複数要素が並ぶ形を許した瞬間、
   ノード単位・行単位の range では「どの要素が壊れているか」を言えなくなる。AST が要素ごとの
   range を保持し、診断がそれを使うことを assert する

**判定基準は 1 つ、同じ意味を 2 通り以上で書けるようにしたかどうか。** そうしたなら上の 3 点が
同じ PR に含まれる。

## 想定される失敗モード

- **後段の分岐** — parser は両形を受けるのに style 解決 / レンダリング / diff のどこかが片方の形しか
  想定しておらず、書き方によって図が変わる。sugar の定義に反するが、新形だけを見るテストは通る
- **fmt が意味を落とす** — 新形を fmt に通すと要素が 1 つに潰れる・順序が変わる。fmt は
  「壊れていないこと」を確認せずに使われるので、利用者が気づくのは差分を見返したときになる
- **fmt が既存形の付随情報を落としていたことに、新形を足すまで気づかない** — #2543 で
  block 形と `#<id>` の共存を round-trip テストにした時点で、それ以前から `renderEdge` が
  エッジの `#<id>` を無条件に削っていたことが判明した（`edge#<id>` セレクタの対象が
  `karasu fmt` で消える）。新形の round-trip は既存形の round-trip も同時に主張するので、
  この観点は既存形の穴を掘り出す側にも効く
- **診断が行全体を指す** — `realizes A, Bogus` の警告がノード全体に付き、エディタ上でどちらの
  対象が未解決なのか読み取れない。要素が 1 行 1 つだった時代の range をそのまま流用すると起きる
- **区切り記号の扱いが方向で非対称になる** — 末尾の区切り（`realizes A,`）は診断が出るのに、
  次行頭の区切り（`realizes A` の下に `,B`）は黙って通り、リストが行をまたいで伸びる。同じ利用者の
  意図が片方だけ silent に通ると、spec に書いていない書き方がモデルに入り込む
- **診断が「壊れた場所」でなく「次のトークン」に付く** — 区切り記号の直後に要素が無いと気づいた
  時点でカーソルは既に次のトークンに進んでいるため、素朴に「現在位置」で診断を作ると、
  末尾カンマの squiggle が次の（正しい）行に付く。要素単位 range を売りにした変更で、
  新設した診断だけが最も不正確になりうる
- **要素 range が幅ゼロになる** — トークンが開始位置しか持たない字句器では、要素の range が
  `start === end` になり、エディタ上では何も下線が引かれない。ノード全体を指していた頃より
  見た目の情報が減る後退で、`start` だけを assert するテストは素通りする

## チェックリスト

同じ意味の別表記を追加するとき、以下を確認する:

- [ ] 新形と既存形をそれぞれ parse して **AST 同士を直接比較**し（期待値リテラルとの比較だけで済ませていないか）、両形を**混在**させた入力が記述順に累積し、parse に失敗した入力で値を持たないプロパティが**空配列として実体化しない**ことを固定したか
- [ ] canonical な出力形と**その判定条件 1 つ**を決め、条件の両側（畳む入力・畳まない入力）で **parse → format → parse で AST が保たれる**ことを固定したか
- [ ] 同じ事実を**両方の形で同時に書いた**入力に専用の診断があり（片方が黙って勝つ実装になっていないか）、片方の形でしか書けない付随情報（`#<id>` 等）を formatter が**もう片方の形でも落とさない**ことを確認したか
- [ ] 1 行に複数要素が並ぶなら、AST が**要素ごとの range**（`start === end` の幅ゼロになっていないか — `end` も assert する）を持ち、区切り記号の後に要素が無い入力で **診断 1 件がその区切り記号自身**を指し（次のトークンではなく）、**次の行を消費せず**、末尾と次行頭の区切りを**対称に**扱うことを確認したか
- [ ] spec に両形と canonical 形を書き、新形の fence を `krs` として `pnpm run lint:krs-fences` に載せたか

## 既知の対処パターン

- **AST 比較**: 両形をそれぞれ `Parser.parse` し、比較対象のサブツリーを直接 `toEqual` で突き合わせる
  （`parser.test.ts` の "parses a comma-separated list into the same array as repeated lines"）。
  `loc` を含めたくない場合は formatter テストの `expectAstRoundTrip` が使う loc 除去ヘルパーを流用する
- **リストは 1 行に閉じる**: 区切り記号も要素も、プロパティ名が現れた行にあることを要求する
  （`parser.ts` の `parseRealizesList`）。「区切りの次の要素だけ」を見る実装は片方向にしか効かず、
  次行頭の区切りを通してしまう。キーワード名の列挙でガードする案は語彙が増えるたびに漏れるうえ、
  karasu では property 名がそれぞれ専用のトークン型を持つため元々要素にはなりえない —
  行の判定なら語彙に依存せず、実際に危ういケース（次行の裸の識別子）だけを止める
- **壊れた区切りを指す診断**: 「現在位置」で診断を作るヘルパーは、区切りの誤りを検出した時点で
  既に次のトークンを指している。壊れた区切り記号のトークンを保持しておき、それを loc にする
- **要素単位 range は字句器から取る**: `value` は復号後の文字列なので、引用符やエスケープを含む
  長さを後から復元できない。トークンに終端位置を持たせ（karasu では `Token.end`、lexer の
  カーソルから 1 箇所で刻印）、range を要素の綴りそのものに一致させる

## 関連テスト

- `packages/core/src/parser/parser.test.ts`（`describe("comma-separated realizes (#2167)")` — 同一 AST・混在累積・要素 range・末尾/先頭カンマの recovery）
- `packages/core/src/parser/comma-list-properties.test.ts`（#2551。`facets` / `delivers` / `handles` / `operations` / `realizes` の 5 プロパティを同じ malformed 入力に通し、列挙形と行の繰り返しが同一 AST・診断コード・アンカー位置・行またぎ拒否で揃うことを固定）
- `packages/core/src/formatter/formatter.test.ts`（"normalizes a comma-separated realizes list to one target per line"）
- `packages/core/src/resolver/warnings.test.ts`（"points at the offending identifier within a comma-separated list"）
- `packages/core/src/parser/edge-property-block.test.ts`（#2543 — shorthand と block が同一 AST・`duplicate-edge-label`・block 内の未知キーワード）
- `packages/core/src/formatter/edge-property-block-round-trip.test.ts`（#2543 — canonical 化の両側・冪等性・`#<id>` の保存）

## 派生元 spec

- `docs/spec/syntax.md` / `docs/spec/syntax.ja.md` — §Writing physical diagrams の `realizes`
  複数指定（行の繰り返しとカンマ列挙、canonical は行の繰り返し）
- `docs/spec/syntax.md` / `docs/spec/syntax.ja.md` — §Edge declaration の
  [Property block](../spec/syntax.md#property-block--label--description--link-)（位置引数 shorthand と
  プロパティブロック、canonical 化の判定条件は「ブロックが `label` 以外を持つか」の 1 つ、
  二重 label は `duplicate-edge-label`）
- [`docs/spec/diagnostics.md`](../spec/diagnostics.md#declaration-edge-placement--structure) /
  `docs/spec/diagnostics.ja.md` — §規則ファミリー › 宣言・edge の配置・構造 の
  `duplicate-edge-label`（同じ事実を両方の形で同時に書いた入力を、優先規則ではなく診断で断る）
- `docs/spec/syntax.md` / `docs/spec/syntax.ja.md` の §Comma-separated value lists /
  §カンマ区切りの値リスト（5 プロパティが共有する列挙の文法。行に閉じること、
  宙に浮いた区切りを `expected-id-after` として区切り自身の位置で報告すること、
  誤りより前に読めた要素を保持すること）
- 関連決定: [ADR-2167](../adr/2167-realizes-comma-list.md)（reference list はカンマ、membership は 1 行 1 件）
