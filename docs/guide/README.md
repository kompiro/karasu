# karasu ガイド

タスク指向の how-to ガイド集。構文の正確な仕様は [`docs/spec/`](../spec/)、設計思想は [`docs/concepts.md`](../concepts.md) を参照してください。各ガイドは英語版（`.md`）と日本語版（`.ja.md`）を持ちます。

| ガイド | 対象 | 内容 |
|--------|------|------|
| [サービス/チーム境界設計](service-team-design.ja.md)（[EN](service-team-design.md)） | アーキテクト | ドメイン依存からのサービス分割、逆コンウェイ戦略、チーム別ファイル分割、CRUD マトリクス |
| [オンボーディング](onboarding.ja.md)（[EN](onboarding.md)） | 中途入社・引き継ぎ | `translate` で既存資産から骨格を起こし、読み下しながら図にまとめる |
| [進化・移行](evolution.ja.md)（[EN](evolution.md)） | 変更を進める人 | ライフサイクルアノテーション・継承、`karasu diff`、段階的移行（Strangler Fig） |
| [伝達（スタイル・凡例・CI）](communicating-diagrams.ja.md)（[EN](communicating-diagrams.md)） | 全員 | `.krs.style` のテーマ、`legend`、CI で図を最新に保つ、draw.io エクスポート |
| [アクセス経路とクライアント](access-paths.ja.md)（[EN](access-paths.md)） | プロダクトアーキテクト | `user → client → service`、`handles` / `delivers`、form-factor / capability |

## ガイドの関係

アーキテクチャのライフサイクルに沿って読むと流れがつかめます。

```
設計（境界設計）→ 理解（オンボーディング）→ 進化（進化・移行）
        └──────── 横串: 伝達 / アクセス経路 ────────┘
```

- **境界設計** は抽象から具体へ降ろす「これから設計する（前向き）」道具としての使い方。
- **オンボーディング** は具体から抽象へ上げる「既に在るものを読み解く（逆向き）」使い方。
- **進化・移行** は「在るものを安全に変えていく」段階。
- **伝達** と **アクセス経路** は、どの段階にも横串で効く観点（図を共有物にする / プロダクトの面を描く）。
