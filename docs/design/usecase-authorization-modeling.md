# ユーザー属性ベースの usecase 認可モデリング

- **日付**: 2026-05-01
- **ステータス**: ドラフト
- **関連**:
  - Issue #832（本検討の起点）
  - ADR-20260428-06（client / MCP modeling — `role` / `license` / `group` / `plan` / `requires` / `allows` / `policy` を将来語彙として予約）
  - ADR-20260429-07（client capability modeling — capability と policy の区別）
  - `docs/spec/syntax.md`（`user.role`、`usecase`）
  - `docs/concepts.md`（論理 / 物理分離）

---

## 背景・課題

karasu は現在、`user [human|ai] { role "<name>" }` という形で**単一のロール**だけを表現できる。
一方、現代のプロダクトは usecase の実行可否を以下の組み合わせで判断するのが普通である:

- **ロール** — `Admin` だけが `RefundOrder` を実行可能
- **ライセンス / プラン** — `AdvancedAnalytics` は `enterprise` プラン契約者のみ
- **グループ / コホート** — `BetaFeature` は `beta-tester` グループ所属者のみ
- **組み合わせ** — `OverrideShipping` は `admin` AND `pro` プラン

今の karasu では:

1. usecase 側に「実行に必要な属性」を宣言する手段がない
2. user 側にロール以外の属性（プラン・ライセンス・グループ）を宣言する手段がない

結果として、図を読んだ人が「どの user が、どの usecase を呼べるのか」を判断できない。

これは **モデリング / コミュニケーション** の問題であって、ランタイム enforcement
（OPA / Cedar / Casbin の代替）を作る話ではない。図を読めば「ここは admin 限定」「ここは pro プラン以上」と
**伝わる**ようにしたい、というだけの話である。

ADR-20260428-06 で `role` / `license` / `group` / `plan` / `requires` / `allows` / `policy` を
将来の認可語彙として**予約**してあるので、語彙衝突は避けられている。本ドキュメントは
このうちどれを採用するかを決める。

## 制約・前提

- C1: **モデリング目的に閉じる**。runtime IAM は別物。表現力は「読み手に伝わる」レベルで十分。
- C2: **ID + 属性の二段構成は維持する**。user / usecase の id は今のまま。属性だけが増える。
- C3: **`client.handles` (UI 上の枠)** との関係を整理する。ADR-20260428-06 の
  方針通り、`handles` (UI 露出) と認可 (実行可否) は**直交する二段チェック**として扱う。
- C4: **後方互換**。既存の `user.role "name"` を壊さない。新語彙が増えるだけにする。
- C5: **語彙の予約は ADR-20260428-06 で済んでいる**。本ドキュメントでは新語彙を
  追加で予約する場合のみ ADR を更新する。
- C6: **オープンセット**。ロール名・プラン名・グループ名はユーザー定義の自由文字列
  （capability と同じスタンス、ADR-20260429-07）。controlled vocabulary は持たない。

## 検討した選択肢

### 案A: `usecase.requires` 述語（インライン）

usecase ブロックの中に「実行に必要な属性」を直接書く。

```
user Customer [human] {
  roles ["customer"]
  plan "pro"
}
user Admin [human] {
  roles ["admin", "support"]
  plan "enterprise"
  groups ["staff"]
}

domain Order {
  usecase PlaceOrder {
    label "Place an order"
    // 制約なし — 全 user が呼べる
  }
  usecase RefundOrder {
    label "Refund an order"
    requires role = "admin"
  }
  usecase OverrideShipping {
    label "Override shipping rule"
    requires role = "admin" and plan = "enterprise"
  }
  usecase AdvancedAnalytics {
    label "Open analytics dashboard"
    requires plan in ["enterprise", "business"]
  }
  usecase BetaFeature {
    requires group = "beta-tester"
  }
}
```

検証セマンティクス:

- `requires` 句は usecase に **0 個または 1 個**。複数行は AND ではなく
  「複数書ける」と勘違いされやすいので 1 行に正規化する。
- 述語の文法は `<attr> <op> <value>` を AND / OR / NOT で組み合わせる小さい式言語:
  - `<attr>` = `role` | `roles` | `plan` | `license` | `licenses` | `group` | `groups`
  - `<op>` = `=` | `!=` | `in` | `not in`
  - 値はクォート付き文字列、または `[...]` のリスト
- バリデータは `user` 側にどの属性が一度も宣言されていないかを警告する
  （typo 検出 — 例: usecase が `plan = "enterpise"` と書き、どの user も
  `plan` を持っていなければ `usecase-requires-unsatisfiable` 警告）。

**メリット**:
- 一番**読みやすい**: usecase の定義を見ればその場で「これは admin 限定」と分かる。
- ID 解決が不要（user 側の宣言は集合判定だけ）。
- 認可ルールが usecase に局所化されるため、レビュー時に diff が読みやすい。

**デメリット**:
- 述語の文法を新規に作る必要がある（パーサ拡張のコスト）。
- 同じルールを多数の usecase に書きたい場合（例: 「経理ドメインは全部 admin」）
  に DRY にできない。 → 案B のほうが一覧性が高い。
- 「OR / NOT を式言語に入れるか」を決める必要がある。複雑度が上がる。

### 案B: 独立した `policy` ブロック（第三軸）

`system` / `organization` と並ぶ第三軸として `policy` を導入する。

```
policy ECPlatform {
  rule AdminOnly {
    requires role = "admin"
    applies_to RefundOrder, OverrideShipping
  }
  rule EnterpriseOnly {
    requires plan = "enterprise"
    applies_to AdvancedAnalytics
  }
  rule BetaCohort {
    requires group = "beta-tester"
    applies_to BetaFeature
  }
}
```

**メリット**:
- 認可ルールが**一覧できる**。セキュリティレビュー時に policy ブロックだけ
  読めば全体像がつかめる。
- 同じルールを複数 usecase に適用可能（DRY）。
- usecase 定義側は認可の存在を知らずに済む（関心分離）。

**デメリット**:
- usecase 定義を見ても「このユースケースに何が要るか」がその場で分からない。
  読み手が usecase ↔ policy を往復する必要がある。
- 語彙が大きくなる（`policy` / `rule` / `applies_to` を新規導入）。
- usecase id の参照解決が必要（typo で applies_to が誤った id を指していたら
  バリデータがエラーを出す責務が発生）。
- 「どこに policy ブロックを書くか」というファイル配置の指針も別途要る。

### 案C: エッジアノテーション

エッジに認可ラベルを付ける。

```
Admin -> RefundOrder @allowed
Customer -> RefundOrder @denied
```

**メリット**:
- 構文の追加がほぼゼロ（既存のエッジ + アノテーション）。

**デメリット**:
- **組み合わせ爆発**: user 数 × usecase 数のエッジを書かないと完全な表現にならない。
- 属性ベースのルール（「pro プラン以上なら誰でも」）を**自然に表現できない**。
  user 単位の列挙しか書けない。
- 実運用でほぼ確実に「user が増えたらエッジを追加し忘れる」事故になる。
- → これは早期に**棄却**で良い。

### 案D: ハイブリッド (A + B)

usecase 局所のルールは `requires`（案A）、横断ルールは `policy`（案B）。

```
domain Order {
  usecase RefundOrder {
    requires role = "admin"   // 局所ルール
  }
}

policy ECPlatform {
  rule EnterpriseFeatures {
    requires plan = "enterprise"
    applies_to AdvancedAnalytics, AuditLog, SsoConfig
  }
}
```

**メリット**:
- 局所ルールは案A の読みやすさ、横断ルールは案B の一覧性を両取り。

**デメリット**:
- **どちらに書くべきか** の判断が必要（ガバナンス的負担）。
- 同じ usecase に両方が掛かった場合のセマンティクスを定義する必要がある
  （AND で重ねる、と決めればそんなに難しくはない）。
- 構文表面積が一番大きい。

## ユーザー属性語彙の拡張

どの認可案を採るにしても、`user` 側に属性を増やす必要がある。
ここは案A〜D に対して**直交**の決定なので別途決める。

### 現状

```
user <id> [human|ai] {
  role "<name>"   // 単一
}
```

### 拡張案

```
user <id> [human|ai] {
  roles ["admin", "support"]      // 複数可
  licenses ["pro", "ai-addon"]    // 複数可
  groups ["beta-tester", "staff"] // 複数可
  plan "enterprise"               // 単一（プランは一つしか持てない想定）
}
```

互換性:

- 既存の `role "name"` は **`roles ["name"]` の糖衣**として残す。パーサで吸収。
- どれも optional。1 個も書かなくても従来どおりパスする。

語彙の重複（`role` vs `roles`）を許す/許さないかは未解決の問いに残す。

## 比較

| 観点 | A: requires | B: policy | C: edge | D: A+B |
|---|---|---|---|---|
| 読みやすさ（局所） | ◎ | △（往復必要） | × | ◎ |
| 一覧性（横断） | △ | ◎ | × | ◎ |
| DRY | × | ◎ | × | ◎ |
| 構文追加コスト | 中（式言語） | 大（新ブロック） | 小 | 大 |
| user 数増加への耐性 | ◎ | ◎ | × | ◎ |
| 属性ルール表現 | ◎ | ◎ | × | ◎ |
| MVP 適性 | ◎ | △ | — | △（後で B 追加可） |

## 現時点の方針（暫定）

- **案C（エッジ）は棄却**。理由は組み合わせ爆発と属性ルール非対応。
- **MVP は案A（`usecase.requires`）から始める**。
  - 局所性・読みやすさが karasu の他構文（usecase の中に resource を書く、client の中に capability を書く）と整合する。
  - 横断ルール需要が顕在化したら**後追いで案D（policy ブロック追加）**に拡張可能。
  - 案A の DSL 表面と案B のブロック表面は**衝突しない**ため、後付けは破壊的変更にならない。
- **`user` 側は `roles[]` / `licenses[]` / `groups[]` / `plan` を追加**。`role "name"` は糖衣として残す。
- **`client.handles` との関係**: ADR-20260428-06 の方針どおり、UI 露出（`handles`）と
  実行可否（`requires`）は二段チェックとして扱う。バリデータの警告は別カテゴリ
  （`client-handles-not-exposed` と `usecase-requires-unsatisfiable`）に分け、
  片方だけ満たして片方落ちても診断が分離されるようにする。

## 具体例（案A 採用前提）

```
system ECPlatform {
  user Customer [human] {
    roles ["customer"]
    plan "free"
  }
  user ProCustomer [human] {
    roles ["customer"]
    plan "pro"
  }
  user Admin [human] {
    roles ["admin"]
    plan "enterprise"
    groups ["staff"]
  }
  user BetaTester [human] {
    roles ["customer"]
    plan "pro"
    groups ["beta-tester"]
  }

  service ECommerce {
    domain Order {
      usecase PlaceOrder { label "Place an order" }
      usecase RefundOrder {
        label "Refund an order"
        requires role = "admin"
      }
      usecase AdvancedAnalytics {
        label "Analytics dashboard"
        requires plan in ["pro", "enterprise"]
      }
      usecase OverrideShipping {
        label "Override shipping"
        requires role = "admin" and plan = "enterprise"
      }
      usecase BetaCheckout {
        label "New checkout flow"
        requires group = "beta-tester"
      }
    }
  }
}
```

レンダリング案（別 Issue / ADR で確定）:

- usecase カードに **🔒 ×N** 的な制約バッジを 1 個出し、`NodeDetailPanel` で
  式を全文表示する（capability / resource バッジと同じパターン）。
- user カードには `roles` / `plan` / `licenses` / `groups` のサマリ行を出す。
- ホバー時に「この user はこの usecase を満たすか」を線の色で示す案もあり
  得るが、組み合わせ爆発するため MVP では描画しない。

## スコープ外（明示）

- ランタイム認可（OPA / Cedar / Casbin への export 等）。
- リソースレベル ABAC（行単位 / レコード単位）。**usecase 粒度に留める**。
- 認証フロー（OAuth2 / OIDC 等）— ADR-20260428-06 とそこから派生する
  Issue #834 で扱う。
- 動的属性（時刻・地理・端末状態）。MVP は静的属性のみ。

## 未解決の問い

1. **`role` (単数糖衣) を残すか、`roles[]` に統一して deprecation するか?**
   - 案: 当面は両方受け入れる。`role` は内部で `roles` に正規化。将来の major で `role` を削除するかは別途。
2. **`requires` の式文法に OR / NOT を入れるか?**
   - MVP は AND と `in` だけで十分か、OR まで欲しいか。
   - 提案: MVP は **AND + `in`** に絞る。OR は `in` で代替可能なケースが多い。NOT は `not in` で代替。完全な式言語は需要が出てから。
3. **複数 `requires` 行を許して暗黙 AND にするか、1 行に強制するか?**
   - 提案: **1 行強制**。複数行 AND は読み手の解釈ブレを生むのでバリデータでエラー。
4. **`plan` は単一 / `licenses[]` は複数 という非対称を維持するか?**
   - 提案: 維持。プランは「一つしか持てない」契約モデルが普通、ライセンスは加算購入されるのが普通、という現実を反映。
5. **属性値の controlled vocabulary は導入するか?**
   - 提案: しない（capability と同じオープンセット方針）。typo 検出は「user 側に未宣言の値が usecase 側にだけ出てきたら警告」で十分。
6. **`policy` ブロック（案B）を将来追加する余地を構文上どう確保するか?**
   - 提案: 何もしない。`policy` キーワードは ADR-20260428-06 で予約済み。トップレベル文法に新キーワードを足すだけで非破壊的に追加可能。
7. **AI user (`user [ai]`) に対して `roles` / `plan` 等の属性は意味があるか?**
   - 提案: 意味がある（M2M でも「サービスアカウントのロール」は普通の概念）。文法上は同じ語彙を許す。
8. **`requires` を**満たさない**user → usecase エッジが書かれた場合の挙動?**
   - 提案: バリデーション警告 `usecase-requires-violated-by-edge`。エラーではなく警告に留める（モデリング途中の状態を許容）。
9. **`client.handles` で usecase を露出しているが `requires` を満たさない user が
   その client を使っている場合の挙動?**
   - 提案: 警告は出さない。`handles` は UI スコープ、`requires` は実行可否で
   関心が違う。両方の警告は独立に出るので、読み手が組み合わせて判断する。
   組み合わせ警告は需要が出てから別 Issue で。
10. **ADR 化のタイミング**
    - 本 Design Doc が合意されたら、構文確定範囲だけ ADR-YYYYMMDD-NN として固定。
      実装は別 PR。usecase 側の `requires`、user 側の属性追加はそれぞれ別々の
      Issue / 実装 PR に分ける（パーサ・バリデータ・レンダラの担当が異なるため）。
