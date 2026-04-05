/// <reference types="vite/client" />

declare module "*.svg?raw" {
  const content: string;
  export default content;
}

declare module "@karasu-tools/core/icons/icons.json" {
  const manifest: import("@karasu-tools/core").IconManifest;
  export default manifest;
}

declare module "@karasu-tools/core/icons/*.svg?raw" {
  const content: string;
  export default content;
}
