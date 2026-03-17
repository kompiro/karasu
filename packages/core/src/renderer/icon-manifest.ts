/**
 * Icon manifest — loads icons from a manifest definition.
 *
 * The manifest (icons.json) maps icon names to SVG file paths.
 * The actual file reading is the caller's responsibility (core has no FS access).
 * Callers pass both the manifest and a map of file contents.
 */

import { loadAndRegisterIcon } from "./svg-icon-loader.js";

export interface IconManifestEntry {
  /** Icon name used in .krs.style shape property */
  name: string;
  /** SVG file path relative to the manifest file */
  file: string;
}

export interface IconManifest {
  icons: IconManifestEntry[];
}

/**
 * Register all icons described in a manifest.
 *
 * @param manifest - The parsed icons.json content
 * @param svgContents - Map of filename → SVG string content (key matches entry.file)
 */
export function resolveIconManifest(
  manifest: IconManifest,
  svgContents: Record<string, string>
): void {
  for (const entry of manifest.icons) {
    const svg = svgContents[entry.file];
    if (svg) {
      loadAndRegisterIcon(entry.name, svg);
    }
  }
}
