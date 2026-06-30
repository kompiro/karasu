import { Tabs, TabsList, TabsTrigger } from "@karasu-tools/app";

const Frame = ({ children }) => (
  <div
    style={{
      background: "var(--bg-base)",
      padding: 20,
      fontFamily: "var(--font-ui)",
      color: "var(--text-primary)",
    }}
  >
    {children}
  </div>
);

// The edit-pane tab set: Editor / Chat / Settings.
export const EditPaneTabs = () => (
  <Frame>
    <Tabs defaultValue="editor">
      <TabsList>
        <TabsTrigger value="editor">Editor</TabsTrigger>
        <TabsTrigger value="chat">Chat</TabsTrigger>
        <TabsTrigger value="settings">Settings</TabsTrigger>
      </TabsList>
    </Tabs>
  </Frame>
);

// A different active tab.
export const ChatActive = () => (
  <Frame>
    <Tabs defaultValue="chat">
      <TabsList>
        <TabsTrigger value="editor">Editor</TabsTrigger>
        <TabsTrigger value="chat">Chat</TabsTrigger>
        <TabsTrigger value="settings">Settings</TabsTrigger>
      </TabsList>
    </Tabs>
  </Frame>
);
