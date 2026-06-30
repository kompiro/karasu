import { Button } from "@karasu-tools/app";

// karasu's Button always pairs an icon with a text label (ADR-20260328).
const Frame = ({ children }) => (
  <div
    style={{
      background: "var(--bg-base)",
      padding: 24,
      fontFamily: "var(--font-ui)",
      color: "var(--text-primary)",
      display: "flex",
      gap: 12,
      alignItems: "center",
      flexWrap: "wrap",
    }}
  >
    {children}
  </div>
);

const Ico = ({ d }) => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <path d={d} />
  </svg>
);
const FormatD = "M4 6h16M4 12h10M4 18h16";
const TidyD = "M12 3v18M5 8l7-5 7 5M5 16l7 5 7-5";
const EyeD = "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z M12 9a3 3 0 100 6 3 3 0 000-6z";

// Tier 1 (actionable) vs Tier 2 (ghost) — the two toolbar tiers.
export const Variants = () => (
  <Frame>
    <Button variant="actionable">
      <Ico d={FormatD} />
      Format
    </Button>
    <Button variant="ghost">
      <Ico d={TidyD} />
      Tidy style
    </Button>
  </Frame>
);

// Two sizes used across the chrome.
export const Sizes = () => (
  <Frame>
    <Button variant="actionable" size="sm">
      <Ico d={FormatD} />
      Small
    </Button>
    <Button variant="actionable" size="md">
      <Ico d={FormatD} />
      Medium
    </Button>
  </Frame>
);

// Disabled + the aria-pressed toggle look (Icon Mode / Focus toggles).
export const States = () => (
  <Frame>
    <Button variant="ghost">
      <Ico d={EyeD} />
      Icon Mode
    </Button>
    <Button variant="ghost" aria-pressed="true">
      <Ico d={EyeD} />
      Icon Mode (on)
    </Button>
    <Button variant="actionable" disabled>
      <Ico d={FormatD} />
      Disabled
    </Button>
  </Frame>
);

// A realistic toolbar row.
export const Toolbar = () => (
  <Frame>
    <Button variant="actionable">
      <Ico d={FormatD} />
      Format
    </Button>
    <Button variant="ghost">
      <Ico d={TidyD} />
      Tidy style
    </Button>
    <Button variant="ghost" aria-pressed="true">
      <Ico d={EyeD} />
      Icon Mode
    </Button>
  </Frame>
);
