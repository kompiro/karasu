---
"@karasu-tools/core": minor
"karasu": minor
---

system view の Group by: team で、同一 infra/external target を共有する複数エッジを 1 本のトランク（縦 spine）に合流させ、target ごとに専用レーンを割り当てて spine の重なりを解消する（#1859 P2c-B）。各トランクエッジは edge identity を保ったまま `trunkId` を持つ。貫通ゼロと Group by: none の byte 一致は不変。junction dot / hop マークは後続（P2c-C）。
