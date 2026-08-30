---
paths:
  - "docs/acceptance/**/*.md"
  - "docs/test-perspectives/**/*.md"
  - "docs/design/**/*.md"
---

# 記録がソースパスを名指しするときのルール

**到達状態**: `pnpm run lint:record-source-paths` が finding ゼロで通る。

```
pnpm run lint:record-source-paths
```

判定基準は 1 つ、**コードスパンに書いた `packages/…` / `scripts/…` のパスは実在する**。
リネームや削除は「そのファイルを名指しした記録」を静かに嘘にするので、
`docs/{acceptance,test-perspectives,design}` の全コードスパンを working tree と
突き合わせる。観点は
[TPL-2254](../../docs/test-perspectives/TPL-2254-durable-record-points-at-durable-address.md)、
経緯は [#2648](https://github.com/kompiro/karasu/issues/2648)。

## 不在が正しいときは宣言する

履歴（「かつて〜があった」）・例示・設計がこれから作るファイルは、**不在であることが
正しい**。その行の上に理由を添えて宣言する。

```markdown
<!-- absent-path-next-line: retired test, named as history (#1585) -->
- _（retired）_ かつて `packages/e2e/tests/at-1468-….spec.ts` が …
```

` ```krs invalid `（[krs-fences.md](krs-fences.md)）と同じで、これは**主張の宣言であって
検査の停止ではない**。だから逆向きにも検査される。

- 理由が空なら落ちる。宣言が無効なので抑止も効かず、その次の行の不在パスはそのまま報告される
- **宣言した行のパスが全部実在するようになったら落ちる**。設計ドキュメントが実装された
  合図であり、`docs/process.md`「決定が下りたら ADR に昇格させ、設計ドキュメントは削除
  する」がまだ済んでいないという通知になる

宣言は**直上の 1 行**にだけ効く。間に空行を挟むと効かない。

## `docs/adr/**` は対象外

ADR 本文は**当時の実装と決定の記録**であり、コードが動いても書き換えない（ADR-706）。
だから ADR の不在参照は欠陥ではなく、検査もしない。ADR の frontmatter は逆に
`pnpm adr:check-assumptions` が working tree と照合している。
