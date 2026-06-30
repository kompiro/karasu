import { DiagramTabBar } from "@karasu-tools/app";

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

// System view active — the four diagram views (System / Deploy / Org / CRUD).
export const SystemView = () => (
  <Frame>
    <DiagramTabBar active="system" onChange={() => {}} />
  </Frame>
);

// Deploy view active, with a deploy-block selector (>1 block).
export const DeployWithBlocks = () => (
  <Frame>
    <DiagramTabBar
      active="deploy"
      onChange={() => {}}
      deployBlocks={[
        { id: "prod", label: "production" },
        { id: "staging", label: "staging" },
      ]}
      selectedDeployBlockId="prod"
      onDeployBlockChange={() => {}}
    />
  </Frame>
);

// Org view active.
export const OrgView = () => (
  <Frame>
    <DiagramTabBar active="org" onChange={() => {}} />
  </Frame>
);
