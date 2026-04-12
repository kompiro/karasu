# ブロック内エッジの暗黙 source 簡略記法

- **日付**: 2026-04-12
- **ステータス**: 検討中
- **関連**:
  - [Issue #496](https://github.com/kompiro/karasu/issues/496)
  - [Issue #477](https://github.com/kompiro/karasu/issues/477) — この課題が発見されたきっかけ

## 背景・課題

現在、ブロック内でエッジを宣言するには source を明示的に書く必要がある。

```krs
domain Contract {
  Contract -> Billing      // ← source が冗長
  Contract --> Shipping    // ← 同じ
}
```

source は親ブロックの ID と同一であり、`from` が自分であることは文脈から自明なため、
以下の簡略記法をサポートしたい。

```krs
domain Contract {
  -> Billing               // Contract -> Billing と等価
  --> Shipping             // Contract --> Shipping と等価
}
```

#477（移行期のドメイン共存）の受け入れテスト作成時に発見された。

---

## 制約・前提

- 既存の `Source -> Target` 明示記法は引き続きサポートする（後方互換性）
- パーサーで `edge.from` を親 ID で補完し、下流（view-extract、LSP など）に影響を与えない
- エッジのラベル・タグは簡略記法でもそのまま使える: `-> Target "label" [async]`

---

## 検討した選択肢

### 論点 A: 適用範囲

#### A-1: domain ブロック限定

Issue #496 の元々のスコープ。domain 内でのみ `-> Target` を許容する。

**メリット:** 影響範囲が小さい
**デメリット:** 他のブロックでも同じ冗長性がある

#### A-2: service と domain ブロック（採用案）

`service`、`domain` で `-> Target` を許容する。
`system` は内部に複数の service を持ち、source が自明でないため対象外とする。
`usecase`、`resource` は現状のモデリングでエッジ（依存関係）を宣言するユースケースがないため対象外とする。
将来 `usecase` 間の依存関係が必要になった場合に拡張できる設計にしておく。

```krs
service ECommerce {
  -> Payment "delegates payment"    // ECommerce -> Payment
}

domain Contract {
  -> Billing                        // Contract -> Billing
}
```

**メリット:** 実際に使われるブロックに限定し、影響範囲が明確
**デメリット:** `usecase` / `resource` で後から拡張が必要になる可能性（ただしパーサーの変更は `parentId` を渡すだけ）

---

### 論点 B: 構文の曖昧性

#### `->` で始まる行は他の構文と衝突するか

現在のパーサーでブロック内の行頭に来るトークンは以下のいずれか：

| トークン | 意味 |
|---------|------|
| `label` | プロパティ |
| `description` | プロパティ |
| `link` | プロパティ |
| `team` | プロパティ（deprecated） |
| `role` | プロパティ（user only） |
| `Identifier` + `->` | 明示的エッジ |
| `Identifier` (keyword) | 子ノード宣言 |
| `}` | ブロック終端 |

`->` / `-->` で始まる行は**既存のどの構文とも衝突しない**。
Arrow トークンはプロパティキーワードでも論理ノードキーワードでもないため、
安全に「暗黙 source エッジ」として解釈できる。

---

### 論点 C: `-->` (async) の対応

sync（`->`）と async（`-->`）の両方に対して簡略記法をサポートする。

```krs
domain Order {
  -> Payment             // sync
  --> Notification       // async
}
```

パーサーの条件は `token.type === TokenType.Arrow || token.type === TokenType.DashedArrow` であり、
両方を同一の分岐で処理できる。追加コストはない。

---

### 論点 D: ブロック内エッジの `from` 制約

#### 現状の問題

現在のパーサーはブロック内エッジの `from` を検証していない。以下のコードはエラーなく受け入れられる：

```krs
domain Contract {
  OtherDomain -> Billing   // from = "OtherDomain"（Contract ではない）
}
```

これは意味的に不正 — `domain Contract` ブロック内のエッジの source は `Contract` であるべきである。

#### 方針: `from` を親 ID に制限する（採用）

明示記法で `from ≠ parentId` の場合はエラーにする。

```krs
domain Contract {
  Contract -> Billing      // OK: from === parentId
  OtherDomain -> Billing   // ERROR: from !== parentId
  -> Billing               // OK: 簡略記法（from = parentId で補完）
}
```

**メリット:**
- 意味的に正しいエッジのみ許容される
- `from` が常に `parentId` であることが保証されるため、フォーマッターは安全に簡略記法を出力できる
- view-extract 等の下流が `edge.from` に不正な値を受け取るリスクがなくなる

**適用範囲:** `service` と `domain` ブロック。
`system` ブロック内のエッジは `from` が複数の service のいずれかを指すため、この制約は適用しない。
`usecase`、`resource` は現状エッジの宣言ユースケースがなく対象外。

---

### 論点 E: view-extract・LSP・フォーマッターへの影響

パーサーが `edge.from` に親ブロックの ID を補完し、`from` を親 ID に制限するため、
AST の `KrsEdge` 構造は明示記法と簡略記法で**同一**になる。

- `view-extract.ts`（`deriveImplicitServiceEdges` など）: `edge.from` を参照するのみ → 変更不要
- `svg-renderer.ts`: エッジ描画は AST の `KrsEdge` に依存 → 変更不要
- LSP: 診断・補完は AST ベース → 変更不要
- `format.ts`（フォーマッター）: `from` が常に `parentId` であることが保証されるため、
  `renderEdge()` を変更して簡略記法（`from` 省略）で出力する。
  これにより `format()` は冗長な `Contract -> Billing` を `-> Billing` に正規化する

---

## 比較

| 軸 | A-1 domain 限定 | A-2 service + domain |
|----|----------------|---------------------|
| 一貫性 | △ | ◎ |
| 実装コスト | ○ | ○（同じ変更箇所） |
| ユーザー体験 | △ | ◎ |

---

## 現時点の方針

**A-2（service と domain ブロック）を採用する。**

- `service`、`domain` で `-> Target` / `--> Target` を許容
- `system` は対象外（内部に複数の service があり source が自明でない）
- `usecase`、`resource` は対象外（現状エッジの宣言ユースケースがない。将来 `parentId` を渡すだけで拡張可能）
- パーサーで `edge.from` を親 ID に補完し、下流は変更不要
- 明示記法で `from ≠ parentId` の場合はエラー（`system` ブロックは除く）
- フォーマッターは簡略記法で出力（`from` が自明なため省略）

### 実装方針

1. `parseBlockContentsWithProperties()` に `parentId?: string` パラメータを追加
2. Arrow / DashedArrow で始まる行を検出し、`parseEdge(parentId)` を呼ぶ
3. `parseEdge()` に `implicitFrom?: string` パラメータを追加。省略時は現在の動作（source トークンを読む）
4. `parseNodeDecl()` から呼び出し時に `id` を渡す（`system` は渡さない）
5. 明示記法で `from ≠ parentId` の場合にエラー診断を出す
6. `formatter.ts` の `renderEdge()` を変更し、ブロック内エッジは簡略記法で出力

---

## 未解決の問い

なし。
