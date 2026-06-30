import { ErrorBanner } from "@karasu-tools/app";

const Frame = ({ children }) => (
  <div style={{ background: "var(--bg-base)", padding: 20, fontFamily: "var(--font-ui)" }}>
    {children}
  </div>
);

// A parse error surfaced from the .krs editor. `message` is the only content;
// the dismiss affordance is built in. Localized through LocaleProvider.
export const ParseError = () => (
  <Frame>
    <ErrorBanner
      message="Unexpected token at line 12: expected '}' to close system block"
      onDismiss={() => {}}
    />
  </Frame>
);

export const StyleError = () => (
  <Frame>
    <ErrorBanner
      message="Unknown style key 'colour' in index.krs.style — did you mean 'color'?"
      onDismiss={() => {}}
    />
  </Frame>
);
