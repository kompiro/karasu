import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  Button,
} from "@karasu-tools/app";

// Dialog renders into a portal with a full-viewport overlay; the card is set to
// `single` + a fixed viewport so the open modal is captured in-frame.
export const ShareDialog = () => (
  <div
    style={{
      background: "var(--bg-base)",
      width: "100%",
      height: "100%",
      fontFamily: "var(--font-ui)",
    }}
  >
    <Dialog open modal={false}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Share this diagram</DialogTitle>
          <DialogDescription>
            Anyone with the link can view a read-only snapshot of the current view.
          </DialogDescription>
        </DialogHeader>
        <input
          readOnly
          value="https://karasu.app/s?s=eyJ2IjoxLCJk…"
          style={{
            width: "100%",
            padding: "8px 10px",
            borderRadius: 6,
            border: "1px solid var(--border-strong)",
            background: "var(--bg-raised)",
            color: "var(--text-secondary)",
            fontFamily: "var(--font-mono)",
            fontSize: 12,
          }}
        />
        <DialogFooter>
          <Button variant="ghost">Cancel</Button>
          <Button variant="actionable">Copy link</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
);
