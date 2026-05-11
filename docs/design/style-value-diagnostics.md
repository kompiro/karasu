# `.krs.style` value-level diagnostics と構造化 value AST（フェーズ 3）

- **日付**: 2026-05-10
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#1178](https://github.com/kompiro/karasu/issues/1178)
  - 親 Design Doc（フェーズ計画全体）: [`docs/design/style-ast-shape.md`](./style-ast-shape.md)
  - 前提 ADR: [ADR-20260509-02](../adr/20260509-02-style-ast-position-and-recovery.md)（Phase 1 — AST loc + recovery）、[ADR-20260510-01](../adr/20260510-01-tidy-style-and-trivia.md)（Phase 2 — trivia + Tidy）
  - 関連 ADR: [ADR-20260322-01](../adr/20260322-01-builtin-style-and-reference.md)（builtin + cascade）

## 背景

現状の `.krs.style` は value を `parser` で **空白区切りの文字列** に
joining し、`resolver` が必要に応じて `parseFloat` / enum セット照合を
する。typo / 型不一致は silent:

- `direction: dwon` — `EDGE_DIRECTION_VALUES` セットに無いので default に
  fallback、診断なし
- `border-style: dashedd` — `as "solid"|"dashed"|"dotted"` 型キャスト後
  そのまま SVG `stroke-dasharray` 経由で browser に渡る → ブラウザが
  無効値として無視 → 実線
- `color: #zzzz` — そのまま SVG に流れて browser がデフォルト色（黒）に
  fallback (#1168 系の silent failure)
- `stroke-width: 1.5` — 単位が無いケース、browser によっては動くが spec
  上は曖昧

これらは **個別に** 診断を足せば解消するが、その都度 resolver や
renderer に分散させると重複コードと診断の網羅性が崩れやすい。フェーズ 3
では **value を構造化された AST にして、property ごとの schema に対する
validator が一本化された診断を返す** 構造を入れる。

ただしフェーズ 3 のコストは高い:
- parser に value-level の lookahead が増える
- resolver / Tidy / svg-builder すべてが文字列を読んでいるので shim
  が必要
- property schema を追加するたびに 3 箇所（parser type / resolver /
  validator）を更新する保守コスト

このまま広く取ると遠すぎるので、本 design doc では **MVP を絞り込む**:

- 駆動シナリオを **value-level diagnostic 一本** に絞る
- 構造化 AST は parser 側で出すが、resolver / svg-builder / Tidy は
  既存の `properties: Record<string, string>` をそのまま読む
- validator は新しいパスとして core に配置、`@karasu-tools/lsp` /
  `cli` から呼べるようにする

## 制約・前提

- **Phase 1/2 の AST に additive**: `loc` / `trivia` は維持
- **resolver は触らない**: `properties: Record<string, string>` を残し、
  resolver / Tidy / svg-builder は変えない。新フィールド `valueNodes`
  を別途持つ
- **後方互換**: 既存テスト fixture（`makeRule(...)` 等）が壊れないよう
  optional フィールドで導入
- **MVP のスコープ**: validation だけ。値の正規化（`#FF0000` → `red` 等）
  や completion 対応は future
- **言語サーバ統合**: 診断は LSP の `publishDiagnostics` に乗る経路に
  揃える。CLI でも diagnostic を出す経路は既存（`tidy-style --check`
  と同じ枠組みで `karasu lint-style` 相当を後で考える）
- **「全 property を網羅する」より「ありがちな typo を捕まえる」**: spec
  に明確に enum / 数値 / 単位がある property だけ schema を入れる

## 検討した選択肢

### 案1: ValueNode を生やさず、validator が生 string を見る

parser は今のまま `properties: Record<string, string>`。validator が
property 名で switch して string に regex / 含有チェックを走らせる。

- 利点:
  - 実装コスト最小
  - 既存 AST 不変
- 欠点:
  - validator が parse をやり直す形になり、parser/resolver と知識が
    重複（`url(...)` の中身を読む等）
  - 位置情報が粗い（property 全体の loc しか出せない、value 内のどの
    トークンが悪いかピンポイントで指せない）

### 案2: ValueNode AST + validator pass + resolver は shim でそのまま（採用候補）

parser が value も AST 化（discriminated union: `Identifier`、`HexColor`、
`Number`、`Length`、`Function`、`String`、`List`）し、`StyleRule` に
`valueNodes: Record<string, ValueNode>` を additive で生やす。validator
が走査して diagnostic を返す。resolver は `valueNodes` を読まない（既存の
`properties` 文字列を引き続き使用）。

- 利点:
  - validator が AST を読むだけで済み、parse の知識が一箇所に集中
  - 値内のトークン単位の loc を持てる（typo 部分にだけ波線を引ける）
  - 将来の completion / hover / 値正規化（フェーズ 3+）への基礎が
    できる
- 欠点:
  - parser 改修と value AST のテストが増える
  - schema を property ごとに書く必要がある
  - `properties` と `valueNodes` の **二重表現** が当面残る — どちらが
    canonical かを決めておかないと future が混乱

### 案3: ValueNode AST で `properties` を **置き換える**

`properties: Record<string, ValueNode>` に置換し、resolver / Tidy /
svg-builder の既存 `props["..."]` 読み取りを `valueNodeToString` shim
で受ける。

- 利点:
  - 単一の真実
  - 将来は value 正規化にスムーズに移行
- 欠点:
  - 全 consumer を一斉に変える必要があり PR サイズが大きい
  - resolver の type cast (`as "solid"|"dashed"|"dotted"`) が破綻し
    やすい — 文字列前提の `parseFloat` コードが多数

### 案4: 案2 + Phase 3 完了時に `properties` を deprecate するロードマップ

案2 で additive に出しつつ、シリアライザ / Tidy / 新規 consumer は
順次 `valueNodes` 側に書き換える。`properties` はフェーズ 3 完了後の
**将来 PR** で削除（ロードマップを ADR に明記）。

- 利点:
  - 段階的移行で破壊的変更を避ける
  - 「`properties` と `valueNodes` の二重表現」のリスクを期限付きで
    解消する道筋を残す
- 欠点:
  - 二重表現が当面続く

## 比較

| 観点 | 案1 string only | 案2 ValueNode 追加 | 案3 一斉置換 | 案4 段階移行 |
|---|---|---|---|---|
| validator 実装の素直さ | 中 | **高** | 高 | 高 |
| 値レベル loc の精度 | 低 | **高** | 高 | 高 |
| 既存 consumer への影響 | 0 | 0（読まなければ） | 大 | 0（最初は） |
| 実装コスト | **低** | 中 | 高 | 中 |
| 将来の completion / 正規化への準備 | × | ◯ | ◯ | ◯ |
| 二重表現リスク | n/a | 中（永続） | n/a | 低（期限付き） |

## 現時点の方針（仮）

**案2 を MVP として採用、案4 を future ロードマップとして併記** する。

理由:

- 既存の resolver / Tidy / svg-builder を一切触らずに value-level
  diagnostic を出せる。本 PR のリスクを最小化
- 一方で「永遠の二重表現」を避けるため、Phase 3 完了後の PR で
  `properties` を `valueNodes` 由来に切り替えるロードマップを ADR に
  明記する（実施は別 PR・別 ADR）
- フェーズ 3 の主目的は「typo 検出」「無効 hex 検出」。これは ValueNode
  と property schema さえあれば足りる

## 駆動シナリオ（採用候補）

**value-level diagnostic を最優先**:

| 例 | 期待診断 |
|---|---|
| `direction: dwon;` | `style-invalid-enum-value` (severity=error)。message: `direction` accepts: `auto/up/down/left/right` |
| `border-style: dashedd;` | 同上、列挙: `solid/dashed/dotted` |
| `color: #zzzz;` | `style-invalid-hex-color` (error)。message: hex color must be 3/4/6/8 hex digits |
| `stroke-width: 1.5;` | `style-missing-length-unit` (warning)。message: expected unit (`px`, etc.) |
| `opacity: 1.5;` | `style-out-of-range` (warning)。message: opacity must be in [0, 1] |
| `shape: usre;` | `style-invalid-enum-value` (error)。enum 列挙 |

非対象（フェーズ 3 のスコープ外）:

- value 正規化 (`#FF0000` → `red` のような変換)
- completion / hover の充実
- `font-family` の文字列 escape 検査
- `column` 等の既存個別 diagnostic（resolver 側にある）の構造化への
  完全移行（後で揃えれば良い）

## MVP スコープ

### 1. ValueNode 型を追加（additive）

```ts
// packages/core/src/types/value-node.ts (NEW)
export type ValueNode =
  | { kind: "ident"; value: string; loc: SourceRange }
  | { kind: "hex"; value: string; loc: SourceRange }      // includes leading "#"
  | { kind: "number"; value: number; raw: string; loc: SourceRange }
  | { kind: "length"; value: number; unit: string; raw: string; loc: SourceRange }
  | { kind: "string"; value: string; loc: SourceRange }   // unquoted
  | { kind: "function"; name: string; argRaw: string; loc: SourceRange }
  | { kind: "list"; items: ValueNode[]; loc: SourceRange }; // comma-separated
```

`StyleRule` に additive で追加:
```ts
interface StyleRule {
  // ...既存
  valueNodes?: Record<string, ValueNode>;
}
```

### 2. parser を拡張

`parseValue` の中で token 列から ValueNode を組み立て、最後に既存の
join 文字列も併せて返す。`properties` と `valueNodes` の両方を populate。

### 3. property schema 定義（限定）

```ts
// packages/core/src/style/property-schema.ts (NEW)
type ValueSpec =
  | { kind: "ident-of"; values: readonly string[] }
  | { kind: "hex" }
  | { kind: "number"; min?: number; max?: number }
  | { kind: "length"; allowedUnits: readonly string[] }
  | { kind: "string" }
  | { kind: "url" }
  | { kind: "list-of"; item: ValueSpec }
  | { kind: "any" }; // 不明 / 未定義は any（warning だけ後で）

export const PROPERTY_SCHEMAS: Record<string, ValueSpec> = {
  "direction": { kind: "ident-of", values: ["auto", "up", "down", "left", "right"] },
  "border-style": { kind: "ident-of", values: ["solid", "dashed", "dotted"] },
  "stroke-style": { kind: "ident-of", values: ["solid", "dashed", "dotted"] },
  "font-weight": { kind: "ident-of", values: ["normal", "bold"] },
  "shape": ... // ident-of + url() の union が必要 → 型を拡張
  "color": { kind: "hex" },
  "background-color": { kind: "hex" },
  "border-color": { kind: "hex" },
  "stroke-width": { kind: "length", allowedUnits: ["px"] },
  "border-width": { kind: "length", allowedUnits: ["px"] },
  "font-size": { kind: "length", allowedUnits: ["px"] },
  "border-radius": { kind: "length", allowedUnits: ["px"] },
  "opacity": { kind: "number", min: 0, max: 1 },
  // ... 他の property は any
};
```

### 4. validator pass

```ts
// packages/core/src/style/value-validator.ts (NEW)
export interface ValueDiagnostic {
  code: "style-invalid-enum-value"
      | "style-invalid-hex-color"
      | "style-missing-length-unit"
      | "style-invalid-length-unit"
      | "style-out-of-range";
  severity: "error" | "warning";
  property: string;
  loc: SourceRange;
  params: Record<string, string | number | string[]>;
}

export function validateStyleValues(sheet: StyleSheet): ValueDiagnostic[];
```

### 5. 既存 diagnostic infra への接続

- `Diagnostic` の `DiagnosticParamsByCode` に新 code を追加
- legacy formatter / i18n を更新
- LSP server の `validateDocument` から `validateStyleValues` を呼んで
  `connection.sendDiagnostics` にマージ

### 6. テスト

- `value-validator.test.ts`: 各 schema kind ごとの hit / miss
- `style-parser.test.ts`: ValueNode の shape を確認
- LSP integration: 診断が `publishDiagnostics` に出ることを確認（後で）

## TPL から確認した観点

`docs/test-perspectives/` を `topic: parser` / `topic: styling` で
スキャンし、本フェーズで明示的に押さえるべき観点を抽出した。受け入れ
テストの設計時に観点 ID を引用する。

| TPL | 観点 | フェーズ 3 への適用 |
|---|---|---|
| [TPL-20260510-02](../test-perspectives/TPL-20260510-02-round-trip-guarantee.md) | `parse(format(x)) ≡ parse(x)` の round-trip 保証 | ValueNode を文字列に再シリアライズしたとき、元の `properties` 文字列とトークン列が等価であること。Tidy の round-trip 契約はフェーズ 2 で確立済みだが、ValueNode 経由でも保たれることを fixture テストで確認する |
| [TPL-20260510-03](../test-perspectives/TPL-20260510-03-enum-member-addition.md) | 列挙型メンバー追加時に消費側の網羅性を **型で** 強制 | `direction` / `border-style` の `ident-of` リストに値を足したとき、validator・resolver・renderer の switch / Record が exhaustive check で漏れを検出できる構造にする。`ValueSpec` を discriminated union にして switch + `never` の exhaustive チェックを必須化 |
| [TPL-20260510-10](../test-perspectives/TPL-20260510-10-cross-reference-validation.md) | parser は loose に受理、resolver / 別パスが validate | フェーズ 3 がやろうとしている分業そのもの。parser は ValueNode を **意味解釈なしに** 受理し、validator pass で property schema に対する整合性を見る。設計の根拠としてこの TPL を引用 |
| [TPL-20260510-12](../test-perspectives/TPL-20260510-12-ast-parser-renderer-agreement.md) | AST 型 / parser / renderer の三点同意 | `ValueNode` を AST に追加するときは、parser が出力できること・consumer（validator / 将来の resolver / Tidy）が読めること・既存 renderer が壊れないことを同時に検証。型レベルで `ValueNode | undefined` の取扱を強制 |
| [TPL-20260510-17](../test-perspectives/TPL-20260510-17-trust-boundary-input-validation.md) | trust boundary を越える input は validate | `.krs.style` は外部 input。validator が値を検証するのは trust boundary 越えの一環。LSP の `publishDiagnostics` 経由でユーザに即フィードバックする経路を設計に織り込む |
| [TPL-20260510-18](../test-perspectives/TPL-20260510-18-text-as-single-source-of-truth.md) | `.krs` テキストが単一の真実 | `valueNodes` は **派生** で、永続化対象ではない。serializer は `properties` 側を canonical とする（案2 の二重表現で `valueNodes` を canonical に格上げするのは案4 の future ロードマップで扱う） |

## 受け入れテスト案（TPL を踏まえた骨子）

最終的な AT は実装 PR で確定するが、本 design doc の段階で以下を予定:

- **AT-A〜D（validator hit/miss）**: enum / hex / length / number/range の各
  schema kind について、valid / typo の双方を fixture でカバー。TPL-10
  の「parser は受理、validator が検出」の分業を確認
- **AT-E（exhaustive switch）**: `ValueSpec` の判別子を 1 つ追加した
  ら、validator が型エラーで網羅漏れを検出する。TPL-03 由来
- **AT-F（round-trip）**: `tidyStyleSheet(input).output === tidyStyleSheet(tidyStyleSheet(input).output).output` が ValueNode 経由でも成り立つ。TPL-02 由来
- **AT-G（既存 consumer 不変）**: `valueNodes` 追加後も `resolver` /
  `svg-builder` / `Tidy` の挙動が一切変わらない。回帰テスト（fixture
  で SVG 出力 diff 0）。TPL-12 由来
- **AT-H（LSP 表示）**: `publishDiagnostics` 経由で `.krs.style` のエラー
  位置に波線が出る。TPL-17 由来。manual だが reproducible なシナリオを
  AT 文書に書く
- **AT-I（永続化されない）**: ValueNode は parser の出力にのみ存在し、
  ファイル / セッション / キャッシュには保存されないこと。TPL-18 由来。
  knip / 静的検査で `valueNodes` を `JSON.stringify` するコードが入って
  いないことを確認

## 確定した方針

レビューで以下を確定した:

1. **`ValueSpec` を union 拡張**: `{ kind: "union"; specs: ValueSpec[] }`
   を ValueSpec に追加し、validator は順に試して 1 つでも match したら
   OK。`shape` だけでなく `color` の hex/named-color union も同じ仕組み
   で扱える
2. **未知 property は warning**: spec.md 由来の `KNOWN_PROPERTIES` セット
   を保持し、一致しない property 名に対して `style-unknown-property`
   warning を出す（error にせず将来追加予定の property での誤検出を抑える）
3. **color は hex または CSS named color (147 色) を許容**:
   ```ts
   color: { kind: "union", specs: [
     { kind: "hex" },
     { kind: "ident-of", values: CSS_NAMED_COLORS },
   ]}
   ```
   それ以外は error。`color: primary` のような design token 風の文字列は
   未対応（将来 design token 機能が立ち上がったら別途検討）
4. **CLI は専用コマンド `karasu lint-style`**: `fmt` / `tidy-style` と並ぶ
   3 つ目。lint と Tidy を別コマンドに分けることで CI のフローに乗せ
   やすく、将来 `.krs` の lint も同じコマンドの拡張で乗せられる
5. **新規 diagnostic は全て error severity**: 厳密スタートで CI を強く
   止める。緩める方が後から容易。spec.md と齟齬がある値は明らかな
   バグなので error で問題ない
6. **enum 値は case sensitive (error)**: spec.md は全て小文字、karasu の
   vocabulary は小さく、規復コストが低い。`direction: DOWN` は error。
   CSS の case-insensitivity に揃える必要は無い
7. **ロードマップ「`properties` を `valueNodes` 由来に置換」は本 ADR の
   「スコープ外」節に明記、実施は別 ADR**: 二重表現の長期化リスクは
   認識しつつ、本 PR で実施するとレビュー粒度が肥大化する。Phase 3
   完了後に別 PR/ADR で対応する旨を ADR の末尾に記録
