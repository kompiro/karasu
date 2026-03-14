import { useState, useCallback } from "react";
import { EditorPane } from "./components/EditorPane.js";
import { PreviewPane } from "./components/PreviewPane.js";
import { WarningPanel } from "./components/WarningPanel.js";
import { useKarasu } from "./hooks/useKarasu.js";

const SAMPLE_KRS = `@import "default.krs.style"

system "ECプラットフォーム" {
  person Customer "顧客" "商品を購入する一般ユーザー"
  person Admin "管理者" "システムを運用する担当者"

  service ECommerce "ECサイト" "商品管理と注文処理"
  service Payment "決済サービス" "クレジットカード決済処理" [external]
  service Inventory "在庫管理" "在庫データの管理" [external] @deprecated

  Customer -> ECommerce "商品を購入する"
  Admin -> ECommerce "商品を管理する"
  ECommerce -> Payment "決済を処理する"
  ECommerce --> Inventory "在庫を同期する"
}
`;

const SAMPLE_STYLE = `/* karasu default theme */

person {
  background-color: #1D4ED8;
  color: #DBEAFE;
  border-color: #1E40AF;
  border-width: 2px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: bold;
  shape: person;
}

service {
  background-color: #0369A1;
  color: #E0F2FE;
  border-color: #075985;
  border-width: 2px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: bold;
  shape: box;
}

[external] {
  background-color: #1F2937;
  color: #D1D5DB;
  border-color: #374151;
  border-style: dashed;
}

@deprecated {
  badge-color: #EF4444;
  badge-icon: "⚠";
  badge-label: "非推奨";
  opacity: 0.6;
}

edge {
  color: #94A3B8;
  stroke-width: 1.5px;
  font-size: 11px;
}

edge[async] {
  border-style: dashed;
  color: #6B7280;
}
`;

export function App() {
  const [krsSource, setKrsSource] = useState(SAMPLE_KRS);
  const [styleSource] = useState(SAMPLE_STYLE);

  const { svg, warnings, diagnostics } = useKarasu(krsSource, styleSource);

  const handleEditorChange = useCallback((value: string) => {
    setKrsSource(value);
  }, []);

  return (
    <div className="app">
      <EditorPane value={krsSource} onChange={handleEditorChange} />
      <PreviewPane svg={svg} diagnostics={diagnostics} />
      <WarningPanel warnings={warnings} />
    </div>
  );
}
