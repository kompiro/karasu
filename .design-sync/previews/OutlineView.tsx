import { OutlineView } from "@karasu-tools/app";

const Frame = ({ children }) => (
  <div
    style={{
      background: "var(--bg-base)",
      padding: 12,
      fontFamily: "var(--font-ui)",
      color: "var(--text-primary)",
      width: 280,
    }}
  >
    {children}
  </div>
);

// A system's logical structure: services → domains → usecases / resources.
const nodes = [
  {
    id: "checkout",
    label: "Checkout",
    kind: "service",
    children: [
      {
        id: "payments",
        label: "Payments",
        kind: "domain",
        children: [
          { id: "charge", label: "Charge card", kind: "usecase", children: [] },
          { id: "orders", label: "orders", kind: "resource", tags: ["table"], children: [] },
        ],
      },
    ],
  },
  {
    id: "catalog",
    label: "Catalog",
    kind: "service",
    children: [{ id: "search", label: "Search", kind: "usecase", children: [] }],
  },
];

export const SystemOutline = () => (
  <Frame>
    <OutlineView
      nodes={nodes}
      highlightedNodeId="payments"
      onSelectNode={() => {}}
      onActivateNode={() => {}}
    />
  </Frame>
);
