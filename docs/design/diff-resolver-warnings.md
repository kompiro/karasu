# `karasu diff` が resolver warning を報告する

- **日付**: 2026-10-08
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#2879](https://github.com/kompiro/karasu/issues/2879)
  - 調査中に見つけた別件: [#3097](https://github.com/kompiro/karasu/issues/3097)（既定の `karasu render` が `@import` した `.krs.style` を無視する）
  - 関連 ADR: [ADR-1020](../adr/1020-karasu-diff-cli.md)（`karasu diff` CLI。in-app と CLI で同じ pipeline を共有する方針）, [ADR-1025](../adr/1025-bundled-all-views-diff.md)（bundled all-views diff）, [ADR-650](../adr/650-graphical-diff-viewer.md)（graphical diff viewer）, [ADR-1386](../adr/1386-style-prescription-stance.md)（`info` の register）
  - 関連 Design Doc: [diagnostic-source-file-identity.md](./diagnostic-source-file-identity.md)（「`diff.ts` にファイル名を出すか」を決めずに残している）
  - 関連 TPL: [TPL-219](../test-perspectives/TPL-219-parallel-function-parity.md)（並行する関数の同等性。#1438 / #2911 と同じ形）, [TPL-2715](../test-perspectives/TPL-2715-source-position-carries-its-document.md)（位置はその文書を持つ）, [TPL-1417](../test-perspectives/TPL-1417-single-renderer-for-structured-messages.md)（構造化メッセージの描画は 1 箇所）
  - コード: `packages/core/src/compile/compile-diff.ts`, `packages/core/src/compile/compile.ts`, `packages/cli/src/diff.ts`, `packages/cli/src/report-diagnostics.ts`

## 背景・課題

`karasu diff` は resolver warning（`domain-dispersal`、`unassigned-domain`、`style-unknown-icon` など）を
1 件も出さない。同じモデルを `karasu render` に渡すと出る。

```
$ karasu render after.krs -o /dev/null
Warning: after.krs:6:1: Domain "Orphan" is not assigned to any service
$ karasu diff before.krs after.krs -o /dev/null
$ karasu diff before.krs after.krs --view system -o /dev/null
```

`packages/cli/src/diff.ts` には `result.warnings` を印字するループがあるが、どの diff 経路も
`warnings` を返さないので到達しない。core の diff 結果型（`SystemDiffCompileResult` /
`DeployDiffCompileResult` / `OrgDiffCompileResult` / `BundledDiffCompileResult`）に `warnings`
フィールドが無い。

Issue が挙げる通り、配線だけでは済まない。決めることが 2 つある。

1. **どちらのモデルの warning を出すか。** diff は before と after の 2 モデルをコンパイルする。
2. **bundled で何回出すか。** 既定の bundled 出力は最大 3 view を同じ 2 モデルから描くので、
   view ごとに集めて連結すると同じ warning が 3 回出る。

### 測ってわかった前提の欠陥: 1 つの `ImportResolver` を 2 つの resolve で共有している

`resolveBeforeAfter` は 1 つの `ImportResolver` で before と after を `Promise.all` で並行に
resolve する。`ImportResolver.resolve()` は冒頭でインスタンスの状態（`diagnostics` /
`loadedKrs` / `visitedStyles` / `resolvedCache` ほか）を消すので、2 つの呼び出しが互いの状態を
消し合い、同じ `diagnostics` 配列を共有する。実測した症状は 2 つ。

```
# before に重複 Api、after に重複 Web
$ karasu diff b2.krs a2.krs -o /dev/null
Error: 3:3 Duplicate node id "Api" under the same parent
Error: 5:3 Duplicate node id "Web" under the same parent
Error: 3:3 Duplicate node id "Api" under the same parent
Error: 5:3 Duplicate node id "Web" under the same parent

# before と after が同じ ./s.krs.style を @import する（git external-diff の典型）
$ karasu diff before.krs after.krs --view system -o d.svg
Warning:  Circular style import detected: /.../s.krs.style
Warning:  Circular style import detected: /.../s.krs.style
```

- 両側の診断が両側に入り、全件が 2 回出る。
- 両側が同じ style sheet を import すると、後から来た側が `visitedStyles` に当たって sheet を
  落とし、循環 import の誤報を出す。

後者は本件の前提を崩す。after の warning を after の style sheet から集めても、その sheet が
落ちていれば `style-unknown-icon` などは消える。したがって本件はこの欠陥の修正を含む。
app の比較モードも `compileSystemDiff` を呼ぶので同じ症状を持つ（app は warning を別経路から
取るので、症状は診断の重複と誤報）。

## 現状（インベントリ）

| 面 | warning の出所 | 備考 |
| --- | --- | --- |
| `karasu render --view <x>` | `_compileFromPreparedInput`: `analyze()` + user sheet ごとの `validateStyleValues()` + view の `resolveStyles()` が返す style warning | style warning は validator の warning を位置なしで言い直したもの（`column: "middle"` が位置付きと位置なしで 2 行出る） |
| `karasu render`（bundled） | `buildAllViewsSvg`: `analyze()` を 1 回 | 「resolver warning は view に依らないモデルの事実」（#1438 / #1452）。style sheet は #3097 で落ちている |
| app の比較モード | 比較中も `compileProject(entryPath)` の `warnings`（entry = after） | diff 結果からは取らない |
| `karasu diff`（全経路） | なし | 本件 |

## 制約・前提

- diff の warning は終了コードを変えない（`render` と同じ。error だけが exit 1）。
- `karasu diff` の診断（error / warning severity の Diagnostic）の表記は本件で変えない。
  ファイル名を出すかは [diagnostic-source-file-identity.md](./diagnostic-source-file-identity.md) が
  決めずに残した問いで、before / after の 2 系統をどう示すかを別に決める必要がある。
  ただし重複して出る件は上の resolver 修正で直る。
- #3097（bundled render が style sheet を落とす）は直さない。別 Issue で直す。

## 検討した選択肢

### 決めること 1: どちらのモデルの warning を出すか

#### 案 A: after の warning だけを出す

after は「これから受け入れるモデル」で、warning が指す問題を直す対象も after にある。

**メリット**

- `karasu render after.krs` と同じ集合になる。diff を見る人が render で確かめたときに食い違わない（TPL-219）。
- app の比較モードがすでにそうしている（entry = after の `compileProject` の warning）。CLI と app が揃う。
- before が main にある既存のモデルなら、その warning は毎回の diff に同じものが出るだけでノイズになる。

**デメリット**

- before にしか無い warning は見えない。ただし before は置き換えられる側なので、見えて困る場面は少ない。

#### 案 B: before と after の両方を、どちら由来かを付けて出す

**メリット**

- 情報は欠けない。

**デメリット**

- 変更していない部分の warning が before と after で 2 回出る。数が倍になり、読む人が差を探すことになる。
- 「どちら由来か」の表記を新しく決める必要がある（診断のファイル名と同じ未決の問い）。
- render にも app にもない集合で、どの面とも比べられない。

#### 案 C: 変更で増えた warning（after − before）だけを出す

レビューで知りたいのは「この変更が持ち込んだ問題」だ、という見方。

**メリット**

- レビューの用途には最も直接的。

**デメリット**

- warning を版をまたいで同定する手段が無い。位置は上の行を 1 行足すだけでずれ、params の id は rename で変わる。
  同定規則を決めないと「直したのに新規と出る」「新規なのに消える」が起きる。
- render にも app にもない集合になる（TPL-219 の分岐をわざわざ作る）。

### 決めること 2: bundled で何回出すか

#### 案 X: モデル単位で 1 回だけ集める

warning はモデルの事実で view に依らない。bundled render が #1452 でそうしたのと同じ考え方で、
diff の経路が何 view を描いても after のモデルから 1 回だけ集める。`--view` 指定の経路も同じ集合を返す。

#### 案 Y: view ごとに集めて連結し、重複を除く

重複除去の同一判定（kind + params + loc）を新しく持つことになる。集めた後で消すくらいなら、
最初から 1 回だけ集めればよい。

## 比較

| 観点 | 案 A | 案 B | 案 C |
| --- | --- | --- | --- |
| render / app との一致 | 一致 | 不一致 | 不一致 |
| 新しく決める規則 | なし | 由来の表記 | 版をまたぐ同定 |
| レビューでの読みやすさ | 中 | 低（倍になる） | 高（同定が正しければ） |

## 現時点の方針

**案 A と案 X を採る。** `karasu diff` は after のモデルの warning を、経路と view の数に関わらず
1 回だけ報告する。集める中身は per-view の render と同じ「`analyze()` + user sheet ごとの
`validateStyleValues()`」で、after の style sheet だけを対象にする。

- **after の sheet だけを対象にする。** diff の描画は before と after の sheet を連結して解決する
  （removed ノードに before の style を当てるため）が、warning は after のモデルの話なので before の
  sheet は渡さない。渡すと before の sheet の行を指す warning が混ざる。
- **view の `resolveStyles()` が返す style warning は入れない。** validator が同じ問題を位置付きで
  出しており、位置なしの言い直しになる。また diff の解決は before の sheet も含むので、after の
  モデルに無い値の warning が混ざりうる。このため `diff --view system` は `render --view system` より
  この言い直しの分だけ少ない。
- **bundled render との差。** #3097 が直るまで、既定の `karasu render` は style-value warning を出さない。
  diff は出す。#3097 を直すときに bundled render が同じ helper を使えば揃う。

案 C の用途（この変更が持ち込んだ warning）は否定しない。必要になったら同定規則と合わせて
opt-in のフラグとして別に検討する。

### 実装の指針

1. **resolver を側ごとに分ける**（`compile-diff.ts` `resolveBeforeAfter`）: before と after に
   別々の `ImportResolver` を作る。並行性はそのまま保てる。
2. **warning を集める helper を 1 つにする**（`compile.ts`）: `_compileFromPreparedInput` の
   「`analyze()` + `validateStyleValues()` → `diagnosticToWarning()`」を
   `collectModelWarnings(krsFile, sheets)` に切り出し、per-view compile と diff の両方が呼ぶ（TPL-219、
   TPL-1417 と同じく 1 箇所で作る）。
3. **diff 結果型に `warnings: Warning[]` を足す**（必須フィールド）。4 つの結果型すべて。
   `compileSystemDiff` / `compileDeployDiff` / `compileOrgDiff` は `afterResolved` と
   `[builtin, ...afterResolved.styleSheets]` から集める。`buildAllViewsSvgDiffProject` は前段の resolve
   結果から 1 回集め、各 view の結果の `warnings` は連結しない。
4. **CLI の印字を render と同じ規則にする**（`report-diagnostics.ts` / `diff.ts`）: warning の印字部分を
   `reportWarnings(filePath, warnings)` として切り出し、`reportDiagnostics` と `diff` の両方が使う。
   info の register（ADR-1386）と位置の表記（`<file>:<line>:<col>`、#2802）が揃う。`<file>` は
   warning の `loc.file` が決める（`diagLocFormatter` の既存の規則）。`loc.file` が after の entry か
   `loc.file` が無いときだけ after の entry を表記し、それ以外（after が import した `.krs` や
   `.krs.style`）は作業ディレクトリからの相対パスで表記する。entry のパスで import 先のファイルを
   置き換えない。置き換えると行番号が別のファイルを指す（TPL-2715）。after が stdin（`-`）のときは、
   entry にあたる一時ファイルのパスではなく `-` と表記する。
   `diff.ts` の `DiffCompileResult.warnings?` は必須にし、到達しないループを消す。
5. テスト:
   - core: 各 `compile*Diff` と bundled が after の warning を返し、before の warning を返さない。
     bundled で同じ warning が 1 回だけ。before と after が同じ style sheet を import しても
     循環 import の誤報が出ず、診断が重複しない。
   - cli（`packages/cli` の vitest）: `karasu diff` が既定・`--view` の両方で after の warning を出し、
     info kind は `Info:` で出す。位置は発生元のファイルで出す: after の entry の warning は
     `Warning: after.krs:<line>:<col>: ...`、after が import した style sheet の warning（`style-unknown-icon`
     など）は `Warning: after.krs.style:<line>:<col>: ...`。stdin の after は entry の warning が `-:<line>:<col>`。
6. TPL: TPL-219 の `discovered_from` に #2879 を足す。resolver の共有は 3-Yes を満たす
   （状態を持つ core のクラスは他にもある / 並行呼び出しは構造的に再発しうる / 既存 TPL に無い）ので、
   「状態を持つインスタンスを並行する呼び出しで共有しない」TPL を実装 PR で起こす。
7. AT: `docs/acceptance/` に新規。TC は、自動テストで覆えない部分（git external-diff の設定で
   `git diff` から呼んだときの stderr）を手動項目にする。
8. ADR 昇格: 実装後に `docs/adr/2879-diff-resolver-warnings.md` として昇格し、本 Design Doc は同 PR で削除する。

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: `karasu diff` の stderr に `Warning:` / `Info:` 行が増える。終了コードは変わらない。
  重複していた診断が 1 回になり、循環 style import の誤報が消える。
- core の公開型: 4 つの diff 結果型に `warnings` が増える（追加のみ）。
- app: 比較モードの診断の重複と誤報が消える。warning の出所は変えない。
- ドキュメント: `docs/spec/diagnostics.md` の位置表記の表で `karasu diff` の行を書き換える。今は
  「`<line>:<column>`、ファイルなし」だけで、warning は `karasu render` と同じ規則（`<file>` は
  `loc.file`、entry のときは after の entry の表記）で `<file>:<line>:<column>`、診断は従来どおりと分けて書く。表には TPL-2715 の back-ref がすでにあるので、新しい規定の破れも
  TPL-2715 が観点として覆う（`.claude/rules/spec-audit.md`）。

## 未解決の問い / 決めないこと

- **diff の診断にファイル名を出すか**は決めない（diagnostic-source-file-identity.md の残課題のまま）。
  warning は after だけなのでファイルを曖昧さなく示せるが、診断は before と after が混ざる。
- **変更で増えた warning だけを出す opt-in**（案 C）は決めない。同定規則が要る。
- **app の比較モードが diff 結果の `warnings` を使うか**は決めない。今の `compileProject` 経由で同じ集合が出ている。
