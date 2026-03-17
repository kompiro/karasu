/// <reference types="vite/client" />

declare module "*.svg?raw" {
  const content: string;
  export default content;
}

declare module "@karasu/core/icons/icons.json" {
  const manifest: import("@karasu/core").IconManifest;
  export default manifest;
}

declare module "@karasu/core/icons/*.svg?raw" {
  const content: string;
  export default content;
}
