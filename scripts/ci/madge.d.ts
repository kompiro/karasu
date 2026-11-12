// madge ships no types. The slice `raster-input.ts` calls: the dependency
// graph of a set of directories, as file -> the files it imports, and the
// specifiers it could not resolve.
declare module "madge" {
  interface MadgeConfig {
    baseDir?: string;
    includeNpm?: boolean;
    fileExtensions?: string[];
    excludeRegExp?: RegExp[];
    detectiveOptions?: Record<string, { mixedImports?: boolean }>;
  }
  interface MadgeResult {
    obj(): Record<string, string[]>;
    warnings(): { skipped: string[] };
  }
  export default function madge(
    path: string | string[],
    config?: MadgeConfig,
  ): Promise<MadgeResult>;
}
