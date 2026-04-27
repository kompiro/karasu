---
type: product
---

# AT-0064: Org-only file renders without a system block

## 概要

`system` ブロックも `deploy` ブロックも持たず `organization` ブロックのみを含む
`.krs` ファイルを開いたとき、Org タブが自動で選択され、組織図が正しく描画される
ことを確認する（Issue [#817](https://github.com/kompiro/karasu/issues/817)）。

AT-0063（deploy-only）と並列の構成。両機能の優先度ルール
（system > deploy > org）も併せて確認する。

## 前提条件

`examples/org-only/index.krs` に以下のような org のみのファイルが存在する。

```krs
organization Acme {
  label "Acme Engineering"

  team "platform-team" {
    label "プラットフォームチーム"
    member alice { label "Alice" }
    member bob { label "Bob" }
  }

  team "product-team" {
    label "プロダクトチーム"
    member carol { label "Carol" }
  }
}
```

## 受け入れ基準

### 1. org-only ファイルを開くと Org タブが自動で選ばれる

- **操作**: `examples/org-only/index.krs` をプレビューに読み込ませる。
- **期待**:
  - タブバーの `Org` がアクティブ状態になっている。
  - プレビューキャンバスに 2 つのチーム（`プラットフォームチーム`, `プロダクトチーム`）と各メンバーが描画されている。
  - `"No nodes to render"` のプレースホルダが出ていない。

### 2. System タブは空だが操作可能である

- **操作**: タブバーで `System` をクリックする。
- **期待**:
  - System タブに切り替わり、`"No nodes to render"` のプレースホルダが表示される。
  - Org タブに戻ると、組織図がそのまま描画される。

### 3. 一度 System に戻したら再スイッチされない（sticky semantics）

- **操作**:
  1. org-only ファイルを開く（自動で Org になる）
  2. `System` タブに手動で切り替える
  3. ファイル内容を編集して再コンパイルを誘発する（例: メンバーの label を変更）
- **期待**:
  - 再コンパイル後も `System` タブが選択されたままで、自動的に Org に戻されない。

### 4. 別の org-only ファイルに切り替えると再び自動選択される

- **操作**: 同じプロジェクト内にもう1つ org-only の `.krs` を追加し、ファイルツリーで選び直す。
- **期待**:
  - 選び直した直後、Org タブが自動で選択される。

### 5. system + organization のファイルでは自動選択されない

- **操作**: `examples/getting-started/index.krs` のような system と organization 両方を含むファイルを開く。
- **期待**:
  - 既存挙動どおり、初期タブは `System` のままで自動スイッチされない。

### 6. deploy + organization の優先度（regression check）

- **操作**: `examples/deploy-org/index.krs` を開く（`system` 無し、`deploy` と `organization` の両方を含む）。
- **期待**:
  - Deploy タブが自動で選択される（org ではなく deploy が優先）。
  - Org タブをクリックすれば組織図が描画される。

## 自動化範囲

- `packages/app/src/hooks/useAutoSwitchToOrg.test.ts` が Hook の分岐を網羅する。
- 優先度ルール（system > deploy > org）はフックの guard 節と
  `packages/app/src/hooks/useAutoSwitchToDeploy.test.ts` の組み合わせで担保される。
- ユーザーが実際にタブ切替を視認する部分のみ手動検証とする。
