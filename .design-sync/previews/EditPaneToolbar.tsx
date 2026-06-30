import { EditPaneToolbar } from "@karasu-tools/app";

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

// Editor tab: Format + Tidy style actions enabled.
export const Default = () => (
  <Frame>
    <EditPaneToolbar
      activeTab="editor"
      onFormat={() => {}}
      onTidyStyle={() => {}}
      hasParseErrors={false}
    />
  </Frame>
);

// Format is disabled while the source has parse errors.
export const ParseErrors = () => (
  <Frame>
    <EditPaneToolbar
      activeTab="editor"
      onFormat={() => {}}
      onTidyStyle={() => {}}
      hasParseErrors={true}
    />
  </Frame>
);
