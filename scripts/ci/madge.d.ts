// madge ships no types. The slice `raster-input.test.ts` calls: the dependency
// graph of a set of directories, as file -> the files it imports.
declare module "madge" {
  interface MadgeConfig {
    baseDir?: string;
    includeNpm?: boolean;
    fileExtensions?: string[];
    excludeRegExp?: RegExp[];
  }
  interface MadgeResult {
    obj(): Record<string, string[]>;
  }
  export default function madge(
    path: string | string[],
    config?: MadgeConfig,
  ): Promise<MadgeResult>;
}
