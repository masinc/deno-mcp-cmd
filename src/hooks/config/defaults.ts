import type { UserRulesConfig } from "./schema.ts";

/**
 * Default configuration and preset rules
 */

export const DEFAULT_USER_RULES_CONFIG: UserRulesConfig = {
  rules: [],
};

/**
 * Example configuration for documentation and testing
 */
export const EXAMPLE_USER_RULES_CONFIG: UserRulesConfig = {
  rules: [
    {
      name: "block-sudo",
      kind: "BlockCommandRule",
      enabled: true,
      spec: {
        command: "sudo",
        reason: "Sudo access not allowed in this environment",
      },
    },
    {
      name: "warn-docker-privileged",
      kind: "WarningRule",
      enabled: true,
      spec: {
        patterns: {
          command: "docker",
          args: {
            containsAny: ["--privileged"],
          },
        },
        warningReason: "Privileged Docker containers detected - verify security implications",
        acknowledgedAction: "skip",
        acknowledgedReason: "Privileged container usage acknowledged",
      },
    },
    {
      name: "confirm-production-deploy",
      kind: "ConditionalRule",
      enabled: true,
      spec: {
        condition: "(command === 'kubectl' || command === 'helm') && args.some(arg => arg.includes('prod'))",
        action: "confirm",
        reason: "Production deployment requires explicit confirmation",
      },
    },
    {
      name: "block-system-modifications",
      kind: "LocationRule",
      enabled: true,
      spec: {
        paths: {
          outside: "/usr",
        },
        commands: ["rm", "mv", "chmod", "chown"],
        action: "block",
        reason: "System directory modifications are not allowed",
      },
    },
  ],
};

/**
 * Security-focused preset configuration
 */
export const SECURITY_PRESET_CONFIG: UserRulesConfig = {
  rules: [
    {
      name: "block-dangerous-flags",
      kind: "BlockCommandRule",
      enabled: true,
      spec: {
        command: {
          oneOf: ["rm", "chmod", "chown"],
        },
        args: {
          containsAny: ["-f", "--force", "-R", "--recursive"],
        },
        reason: "Dangerous file operations with force/recursive flags are blocked",
      },
    },
    {
      name: "block-force-recursive-combo",
      kind: "BlockCommandRule",
      enabled: true,
      spec: {
        command: {
          oneOf: ["rm", "cp", "mv"],
        },
        args: {
          containsAll: ["--force", "--recursive"],
        },
        reason: "Combination of force and recursive flags is extremely dangerous",
      },
    },
    {
      name: "warn-network-access",
      kind: "WarningRule",
      enabled: true,
      spec: {
        patterns: {
          command: {
            regex: "^(curl|wget|nc|ssh|scp|rsync)$",
          },
        },
        warningReason: "Network access detected - verify destination security",
        acknowledgedAction: "confirm",
        acknowledgedReason: "Network access verified and approved",
      },
    },
    {
      name: "confirm-package-installation",
      kind: "ConditionalRule",
      enabled: true,
      spec: {
        condition: "command.includes('install') || command.includes('add') || command.includes('update')",
        action: "confirm",
        reason: "Package installation/update requires confirmation",
      },
    },
  ],
};

/**
 * Development-friendly preset configuration
 */
export const DEVELOPMENT_PRESET_CONFIG: UserRulesConfig = {
  rules: [
    {
      name: "warn-git-force-push",
      kind: "WarningRule",
      enabled: true,
      spec: {
        patterns: {
          command: "git",
          args: {
            containsAny: ["--force", "-f"],
          },
        },
        warningReason: "Force push detected - this will rewrite Git history",
        acknowledgedAction: "approve",
        acknowledgedReason: "Force push acknowledged - proceeding with caution",
      },
    },
    {
      name: "confirm-database-operations",
      kind: "ConditionalRule",
      enabled: true,
      spec: {
        condition: "command.includes('mysql') || command.includes('psql') || command.includes('mongo')",
        action: "confirm",
        message: "Database operation detected",
        reason: "Database operations require confirmation in development",
      },
    },
    {
      name: "approve-safe-commands",
      kind: "ApproveCommandRule",
      enabled: true,
      spec: {
        command: {
          oneOf: ["ls", "pwd", "whoami", "date", "echo"]
        },
        reason: "Safe read-only commands are automatically approved",
      },
    },
    {
      name: "approve-dev-tools",
      kind: "ApproveCommandRule",
      enabled: true,
      spec: {
        command: {
          oneOf: ["npm", "yarn", "pnpm", "node", "deno"]
        },
        cwd: {
          contains: "projects"
        },
        reason: "Development tools in projects directory are pre-approved",
      },
    },
  ],
};

/**
 * Get preset configuration by name
 */
export function getPresetConfig(presetName: string): UserRulesConfig | null {
  switch (presetName) {
    case "security":
    case "@mcp-cmd/security-preset":
      return SECURITY_PRESET_CONFIG;
    case "development":
    case "@mcp-cmd/development-preset":
      return DEVELOPMENT_PRESET_CONFIG;
    case "example":
      return EXAMPLE_USER_RULES_CONFIG;
    default:
      return null;
  }
}

/**
 * List all available preset names
 */
export function getAvailablePresets(): string[] {
  return [
    "security",
    "@mcp-cmd/security-preset", 
    "development",
    "@mcp-cmd/development-preset",
    "example",
  ];
}