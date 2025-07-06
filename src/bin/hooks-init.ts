#!/usr/bin/env -S deno run --allow-env --allow-read --allow-write

import { parseArgs } from "@std/cli/parse-args";
import { stringify } from "@std/yaml";
import { ensureFile, exists } from "@std/fs";
import { PRESET_CONFIGS } from "../hooks/config/defaults.ts";

interface InitOptions {
  preset?: string;
  project?: boolean;
  user?: boolean;
  force?: boolean;
  help?: boolean;
}

const HELP_TEXT = `
mcp-cmd hooks-init - Initialize MCP command hook configuration

USAGE:
    hooks-init [OPTIONS]

OPTIONS:
    --preset <name>     Use preset configuration (default: empty)
                        Available: ${Object.keys(PRESET_CONFIGS).join(", ")}
    --project           Create project-local configuration (./.mcp-cmd/hooks-rules.yaml)
    --user              Create user-global configuration (~/.config/@masinc/mcp-cmd/hooks-rules.yaml)
    --force             Overwrite existing configuration file
    --help              Show this help message

EXAMPLES:
    hooks-init --preset default --project
    hooks-init --preset development --user
    hooks-init --force --preset example --project
`;

function expandPath(path: string): string {
  if (path.startsWith("~/")) {
    const homeDir = Deno.env.get("HOME") || Deno.env.get("USERPROFILE") || "/";
    return path.replace("~/", homeDir + "/");
  }
  return path;
}

function getConfigPath(options: InitOptions): string {
  if (options.project) {
    return "./.mcp-cmd/hooks-rules.yaml";
  }

  if (options.user) {
    return "~/.config/@masinc/mcp-cmd/hooks-rules.yaml";
  }

  throw new Error("Must specify either --project or --user");
}

async function initConfig(options: InitOptions): Promise<void> {
  const presetName = options.preset || "empty";
  const config = PRESET_CONFIGS[presetName as keyof typeof PRESET_CONFIGS];

  if (!config) {
    console.error(`Error: Unknown preset '${presetName}'`);
    console.error(
      `Available presets: ${Object.keys(PRESET_CONFIGS).join(", ")}`,
    );
    Deno.exit(1);
  }

  const outputPath = expandPath(getConfigPath(options));

  // Check if file exists and force flag
  if (await exists(outputPath) && !options.force) {
    console.error(`Error: Configuration file already exists: ${outputPath}`);
    console.error("Use --force to overwrite");
    Deno.exit(1);
  }

  // Ensure directory exists
  await ensureFile(outputPath);

  // Generate YAML content with header comment
  const yamlContent = `# MCP Command Hook Rules Configuration
# Generated with: hooks-init --preset ${presetName}

${stringify(config)}`;

  // Write configuration file
  await Deno.writeTextFile(outputPath, yamlContent);

  console.log(`✅ Configuration file created: ${outputPath}`);
  console.log(`📋 Preset: ${presetName} (${config.rules.length} rules)`);

  if (config.rules.length > 0) {
    console.log("\nRules included:");
    for (const rule of config.rules) {
      console.log(`  - ${rule.name} (${rule.kind})`);
    }
  }
}

// Main execution
if (import.meta.main) {
  const args = parseArgs(Deno.args, {
    string: ["preset"],
    boolean: ["project", "user", "force", "help"],
    alias: {
      p: "preset",
      f: "force",
      h: "help",
    },
  });

  if (args.help) {
    console.log(HELP_TEXT);
    Deno.exit(0);
  }

  // Validate options
  if (args.project && args.user) {
    console.error("Error: Cannot specify both --project and --user");
    Deno.exit(1);
  }

  if (!args.project && !args.user) {
    console.error("Error: Must specify either --project or --user");
    console.error("Use --help for more information");
    Deno.exit(1);
  }

  try {
    await initConfig({
      preset: args.preset,
      project: args.project,
      user: args.user,
      force: args.force,
    });
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    Deno.exit(1);
  }
}
