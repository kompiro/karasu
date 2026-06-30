import { BreadcrumbBar } from "@karasu-tools/app";

const Frame = ({ children }) => (
  <div
    style={{
      background: "var(--bg-base)",
      padding: 16,
      fontFamily: "var(--font-ui)",
      color: "var(--text-primary)",
    }}
  >
    {children}
  </div>
);

// Drill-down breadcrumb for the active diagram view.
export const DrillPath = () => (
  <Frame>
    <BreadcrumbBar
      items={[
        { id: "root", label: "EC Platform" },
        { id: "checkout", label: "Checkout" },
        { id: "payments", label: "Payments" },
      ]}
      onNavigate={() => {}}
    />
  </Frame>
);

// At the system root.
export const Root = () => (
  <Frame>
    <BreadcrumbBar items={[{ id: "root", label: "EC Platform" }]} onNavigate={() => {}} />
  </Frame>
);
