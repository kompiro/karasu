# タグ・アノテーション リファレンス

## タグ（`[...]`）

タグは**アーキテクチャ上の意味**を宣言する。スタイルはタグを受けて変わる。
タグは意味の宣言であり、見た目の直接指定ではない。見た目の制御は `.krs.style` で行う。

| タグ | 意味 | デフォルト描画への影響 |
|------|------|----------------------|
| `[external]` | システム境界の外側 | 枠線を破線、色をグレー系に |
| `[async]` | 非同期通信（エッジ用） | 破線矢印 |
| `[sync]` | 同期通信（エッジ用） | 実線矢印（デフォルト） |
| `[human]` | 人間の利用者 | user ノードにのみ使用。デフォルトスタイルへの影響なし |
| `[ai]` | AIエージェント | user ノードにのみ使用。デフォルトスタイルへの影響なし |

### 記述例

```
service Payment "決済サービス" [external]
ECommerce --> Inventory "在庫を同期する" [async]
user Customer "顧客" [human]
user AIAgent "注文自動化エージェント" [ai]
```

---

## アノテーション（`@...`）

アノテーションは**ライフサイクル・状態**を表すメタ情報。タグとは別の概念。

| アノテーション | 意味 | デフォルト描画 |
|--------------|------|--------------|
| `@deprecated` | 廃止予定 | ⚠バッジ、ノードを半透明に |
| `@new` | 新規追加 | ✦バッジ |
| `@experimental` | 実験的 | ⚗バッジ |
| `@migration_target` | 移行先 | →バッジ |

### 記述例

複数付与可。タグとの併用も可。

```
service Legacy "旧システム" [external] @deprecated @migration_target
service NewAPI "新API"                 @new @experimental
```

---

## タグとアノテーションの違い

| | タグ | アノテーション |
|---|------|--------------|
| 表す内容 | アーキテクチャ上の位置・役割 | ライフサイクル・開発状態 |
| 例 | `[external]`（境界の外） | `@deprecated`（廃止予定） |
| スタイルへの影響 | `.krs.style` のタグセレクタで制御 | `.krs.style` のアノテーションセレクタで制御 |

---

## システム自動付与タグ（System-assigned tags）

以下のタグはユーザーが `.krs` ファイルに記述するものではなく、ツールが自動的に付与する。
`.krs.style` のタグセレクタで参照・上書きできる。

### エッジへの自動タグ

| タグ | 付与条件 | デフォルトスタイル |
|-----|---------|-----------------|
| `[implicit]` | domain エッジから派生した暗黙のサービス間エッジ | アンバー（`#F59E0B`）破線 |
| `[async]` | `-->` で宣言されたエッジ | 破線 |
| `[sync]` | `->` で宣言されたエッジ | 実線 |
| `[cyclic]` | 循環依存検出時 | 赤（`#EF4444`）実線 |

### カスタマイズ例

```krs.style
edge[implicit] {
  color: purple;
  border-style: dotted;
}
```

---

## チーム連絡先コンベンション（`team` + `link`）

組織クエリ（「このサービスのオーナーチームは？」「影響するチームに連絡したい」）を AI チャットで利用するには、
`service` や `domain` ノードに `team` プロパティと `link` プロパティを追加する。

```krs
service ECommerce {
  label "ECサイト"
  team "ECチーム"
  link "https://slack.com/archives/C..." "ECチーム Slack"
  link "https://notion.so/..."          "チームページ"
}
```

### `team` プロパティ

チーム名を文字列で記述する。AI はこの値を組織クエリの回答で使用する。

```krs
service Payment {
  team "Fintechチーム"
}
```

### `link` プロパティ（チーム連絡先）

`link "<url>" "<label>"` の形式で連絡先 URL を追加する。
ラベルに以下のキーワードが含まれる場合、AI はチーム連絡先として認識する：

| キーワード例 | 用途 |
|---|---|
| `Slack` | Slack チャンネル |
| `Teams` | Microsoft Teams チャンネル |
| `チームページ` | Notion や Confluence などのチームページ |
| `Runbook` | オンコール・運用手順書 |

### 使用例（AI チャットでのクエリ）

モデルに上記の情報を記述しておくと、Chat タブで以下のようなクエリが可能になる：

```
Q: "Order サービスに依存しているチームを教えて"
A: - Fintechチーム（Payment サービス）
     → https://slack.com/... (Fintechチーム Slack)
   - Platformチーム（Notification サービス）
     → https://slack.com/... (Platformチーム Slack)

Q: "オンボーディングで最初に会うべき人は？"
A: ECommerce（最もエッジが多い）: ECチーム
     → https://notion.so/... (チームページ)
```
