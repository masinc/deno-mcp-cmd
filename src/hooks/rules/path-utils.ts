import { relative, resolve } from "@std/path";

/**
 * Checks if a path is within the current directory
 * @param targetPath - The path to check
 * @param currentDir - The current directory (defaults to Deno.cwd())
 * @returns true if the path is within the current directory
 */
export function isWithinCurrentDirectory(
  targetPath: string,
  currentDir?: string,
): boolean {
  const cwd = currentDir || Deno.cwd();

  // Convert to absolute paths
  const absoluteTarget = resolve(cwd, targetPath);
  const absoluteCwd = resolve(cwd);

  // Calculate relative path
  const relativePath = relative(absoluteCwd, absoluteTarget);

  // If it starts with "..", it's going to parent directory
  // If it starts with absolute path, it's also external
  return !relativePath.startsWith("..") && !relativePath.startsWith("/");
}

/**
 * Extracts paths from command arguments (including option arguments)
 * @param args - Command arguments
 * @returns Array of extracted paths
 */
export function extractPathsFromArgs(args: string[]): string[] {
  const paths: string[] = [];

  for (const arg of args) {
    if (arg.startsWith("-")) {
      // Check all options containing =
      const generalPattern = /^-[^=]*=(.+)$/;
      const match = arg.match(generalPattern);
      if (match && isPathLike(match[1])) {
        paths.push(match[1]);
      }
    } else {
      // Regular arguments that look like paths
      if (isPathLike(arg)) {
        paths.push(arg);
      }
    }
  }

  return paths;
}

/**
 * Determines if a string looks like a path
 * @param str - The string to check
 * @returns true if the string looks like a path
 */
function isPathLike(str: string): boolean {
  return (
    str.includes("/") ||
    str.includes("\\") ||
    str === "." ||
    str === ".." ||
    str.startsWith("~") ||
    str.startsWith("./") ||
    str.startsWith("../") ||
    str.includes(".") // Contains file extension
  );
}

/**
 * Extracts paths from command arguments and checks if all are within current directory
 * @param args - Command arguments
 * @param currentDir - The current directory
 * @returns true if all paths are within the current directory
 */
export function isAllPathsWithinCurrentDirectory(
  args: string[],
  currentDir?: string,
): boolean {
  const paths = extractPathsFromArgs(args);

  return paths.every((path) => isWithinCurrentDirectory(path, currentDir));
}
