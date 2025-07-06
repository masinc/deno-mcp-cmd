#!/usr/bin/env -S deno run --allow-env --allow-read --allow-write

import { Command } from "@cliffy/command";
import { stringify } from "@std/yaml";
import { ensureFile, exists } from "@std/fs";
import { PRESET_CONFIGS } from "../hooks/config/defaults.ts";
import { UserRulesConfigSchema } from "../hooks/config/schema.ts";
import * as z from "zod/v4";

interface ConfigOptions {
  preset: string;
  output: "project" | "user" | "stdout";
  force?: boolean;
}

interface JsonSchemaOptions {
  // No options needed - always output to stdout
}

function expandPath(path: string): string {
  if (path.startsWith("~/")) {
    const homeDir = Deno.env.get("HOME") || Deno.env.get("USERPROFILE") || "/";
    return path.replace("~/", homeDir + "/");
  }
  return path;
}

function getConfigPath(options: ConfigOptions): string {
  switch (options.output) {
    case "project":
      return "./.mcp-cmd/hooks-rules.yaml";
    case "user":
      return "~/.config/@masinc/mcp-cmd/hooks-rules.yaml";
    case "stdout":
      return "stdout";
    default:
      throw new Error("Invalid output option");
  }
}

async function initConfig(options: ConfigOptions): Promise<void> {
  const presetName = options.preset || "empty";
  const config = PRESET_CONFIGS[presetName as keyof typeof PRESET_CONFIGS];

  if (!config) {
    console.error(`Error: Unknown preset '${presetName}'`);
    console.error(
      `Available presets: ${Object.keys(PRESET_CONFIGS).join(", ")}`,
    );
    Deno.exit(1);
  }

  const outputPath = getConfigPath(options);

  // Generate YAML content with header comment
  const yamlContent = `# MCP Command Hook Rules Configuration
# Generated with: hooks-init config --preset ${presetName}

${stringify(config)}`;

  if (options.output === "stdout") {
    // Output to stdout
    console.log(yamlContent);
    return;
  }

  const expandedPath = expandPath(outputPath);

  // Check if file exists and force flag
  if (await exists(expandedPath) && !options.force) {
    console.error(`Error: Configuration file already exists: ${expandedPath}`);
    console.error("Use --force to overwrite");
    Deno.exit(1);
  }

  // Ensure directory exists
  await ensureFile(expandedPath);

  // Write configuration file
  await Deno.writeTextFile(expandedPath, yamlContent);

  console.log(`✅ Configuration file created: ${expandedPath}`);
  console.log(`📋 Preset: ${presetName} (${config.rules.length} rules)`);

  if (config.rules.length > 0) {
    console.log("\nRules included:");
    for (const rule of config.rules) {
      console.log(`  - ${rule.name} (${rule.kind})`);
    }
  }
}

const configCommand = new Command()
  .name("config")
  .description("Initialize hooks configuration file")
  .option("-p, --preset <preset>", "Configuration preset to use", {
    default: "empty",
    value: (value: string) => {
      if (!Object.keys(PRESET_CONFIGS).includes(value)) {
        throw new Error(
          `Unknown preset '${value}'. Available: ${
            Object.keys(PRESET_CONFIGS).join(", ")
          }`,
        );
      }
      return value;
    },
  })
  .option(
    "-o, --output <location>",
    "Output location: project, user, or stdout",
    {
      default: "stdout",
      value: (value: string) => {
        if (!["project", "user", "stdout"].includes(value)) {
          throw new Error(
            `Invalid output location '${value}'. Available: project, user, stdout`,
          );
        }
        return value as "project" | "user" | "stdout";
      },
    },
  )
  .option("-f, --force", "Overwrite existing configuration file")
  .action(async (options: ConfigOptions) => {
    // Output location is already validated by the option parser

    try {
      await initConfig({
        preset: options.preset,
        output: options.output,
        force: options.force,
      });
    } catch (error) {
      console.error(
        `Error: ${error instanceof Error ? error.message : String(error)}`,
      );
      Deno.exit(1);
    }
  });

async function generateJsonSchema(_options: JsonSchemaOptions): Promise<void> {
  // Generate JSON Schema from Zod schema
  const jsonSchema = z.toJSONSchema(UserRulesConfigSchema, {
    target: "draft-7",
  });

  // Always output to stdout
  console.log(JSON.stringify(jsonSchema, null, 2));
}

const jsonschemaCommand = new Command()
  .name("jsonschema")
  .description("Generate JSON Schema for hooks configuration validation")
  .action(async () => {
    await generateJsonSchema({});
  });

const mainCommand = new Command()
  .name("hooks-init")
  .description("MCP Command hooks configuration initialization tool")
  .version("1.0.0")
  .command("config", configCommand)
  .command("jsonschema", jsonschemaCommand);

// Main execution
if (import.meta.main) {
  // Show help if no arguments provided
  if (Deno.args.length === 0) {
    mainCommand.showHelp();
  } else {
    await mainCommand.parse(Deno.args);
  }
}
