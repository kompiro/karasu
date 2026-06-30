import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  Button,
} from "@karasu-tools/app";

const item = {
  padding: "6px 10px",
  borderRadius: 5,
  fontSize: 13,
  cursor: "pointer",
  color: "var(--text-primary)",
};
const sep = { height: 1, margin: "4px 0", background: "var(--border-default)" };

// Edge context menu (right-click on a diagram edge). Rendered open via the
// controlled `open` prop so the portal menu is captured in-frame.
export const ContextMenu = () => (
  <div
    style={{
      background: "var(--bg-base)",
      width: "100%",
      height: "100%",
      padding: 24,
      fontFamily: "var(--font-ui)",
    }}
  >
    <DropdownMenu open modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost">Edge actions ▾</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem style={item}>Make synchronous (→)</DropdownMenuItem>
        <DropdownMenuItem style={item}>Make asynchronous (⇢)</DropdownMenuItem>
        <DropdownMenuSeparator style={sep} />
        <DropdownMenuItem style={item}>Add label…</DropdownMenuItem>
        <DropdownMenuItem style={{ ...item, color: "var(--error)" }}>Remove edge</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </div>
);
