import { parse as parseYaml } from "@std/yaml";
import { UserRulesConfigSchema } from "./schema.ts";
import type { UserRulesConfig } from "./schema.ts";

/**
 * Configuration file loader for user-defined rules
 */

export interface LoadResult {
  config: UserRulesConfig;
  source: string;
}

/**
 * Default configuration paths to search for user rules
 */
export const DEFAULT_CONFIG_PATHS = [
  "~/.config/@masinc/mcp-cmd/hooks-rules.yaml",
  "~/.config/@masinc/mcp-cmd/hooks-rules.yml",
  "~/.config/@masinc/mcp-cmd/hooks-rules.json",
  "./.mcp-cmd/hooks-rules.yaml",
  "./.mcp-cmd/hooks-rules.yml",
  "./.mcp-cmd/hooks-rules.json",
] as const;

/**
 * Expand tilde (~) in file paths to home directory
 */
function expandPath(path: string): string {
  if (path.startsWith("~/")) {
    const homeDir = Deno.env.get("HOME") || Deno.env.get("USERPROFILE") || "/";
    return path.replace("~/", homeDir + "/");
  }
  return path;
}

/**
 * Load user rules configuration from YAML or JSON file
 */
export async function loadUserRulesConfig(
  filePath: string,
): Promise<UserRulesConfig> {
  const expandedPath = expandPath(filePath);
  try {
    const content = await Deno.readTextFile(expandedPath);
    const parsed = filePath.endsWith(".json")
      ? JSON.parse(content)
      : parseYaml(content);

    // Validate with Zod schema
    const result = UserRulesConfigSchema.safeParse(parsed);
    if (!result.success) {
      const errorMessages = result.error.issues.map((issue) =>
        `${issue.path.join(".")}: ${issue.message}`
      );
      throw new Error(
        `Invalid configuration in ${filePath}:\n${errorMessages.join("\n")}`,
      );
    }

    return result.data;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      throw new Error(`Configuration file not found: ${filePath}`);
    }
    if (error instanceof SyntaxError) {
      throw new Error(
        `Invalid YAML/JSON syntax in ${filePath}: ${error.message}`,
      );
    }
    throw error;
  }
}

/**
 * Load user rules from default configuration paths
 * Returns the first valid configuration found
 */
export async function loadUserRulesFromDefaultPaths(): Promise<
  LoadResult | null
> {
  for (const configPath of DEFAULT_CONFIG_PATHS) {
    try {
      const config = await loadUserRulesConfig(configPath);
      return { config, source: configPath };
    } catch (error) {
      // Continue to next path if file not found
      if (error instanceof Error && error.message.includes("not found")) {
        continue;
      }
      // Re-throw validation and syntax errors
      throw error;
    }
  }

  return null; // No configuration file found
}

/**
 * Load user rules from multiple configuration files and merge them
 */
export async function loadAndMergeUserRules(
  configPaths: string[],
): Promise<UserRulesConfig> {
  const configs: UserRulesConfig[] = [];

  for (const path of configPaths) {
    try {
      const config = await loadUserRulesConfig(path);
      configs.push(config);
    } catch (error) {
      if (error instanceof Error && error.message.includes("not found")) {
        continue; // Skip missing files
      }
      throw error;
    }
  }

  if (configs.length === 0) {
    return { rules: [] }; // Return empty config if no files found
  }

  // Merge configurations
  const mergedConfig: UserRulesConfig = {
    rules: [],
  };

  for (const config of configs) {
    mergedConfig.rules.push(...config.rules);
  }

  return mergedConfig;
}

/**
 * Check if a configuration file exists at the given path
 */
export async function configFileExists(filePath: string): Promise<boolean> {
  const expandedPath = expandPath(filePath);
  try {
    const stat = await Deno.stat(expandedPath);
    return stat.isFile;
  } catch {
    return false;
  }
}
