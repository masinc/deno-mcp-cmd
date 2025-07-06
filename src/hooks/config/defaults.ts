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
 * Default preset configuration (matches src/hooks/rules/presets.ts SECURITY_RULES)
 */
export const DEFAULT_PRESET_CONFIG: UserRulesConfig = {
  rules: [
    // Approve safe git commands first (higher priority)
    {
      name: "approve-safe-git-commands",
      kind: "ApproveCommandRule",
      enabled: true,
      spec: {
        command: "git",
        args: {
          startsWith: ["status", "log", "show", "diff", "help", "version", "describe", "shortlog", "blame", "grep", "ls-files", "rev-parse"]
        },
        reason: "Safe git commands approved for read-only operations",
      },
    },
    // Block directory navigation
    {
      name: "block-cd",
      kind: "BlockCommandRule",
      enabled: true,
      spec: {
        command: "cd",
        reason: "Directory navigation via cd not allowed",
      },
    },
    // Block shell commands
    {
      name: "block-shell-commands",
      kind: "BlockCommandRule",
      enabled: true,
      spec: {
        command: {
          oneOf: ["bash", "sh", "zsh", "fish", "csh", "tcsh", "ksh"],
        },
        reason: "Shell commands are not allowed for security reasons",
      },
    },
    // Confirm network commands
    {
      name: "confirm-network-commands",
      kind: "ConfirmCommandRule",
      enabled: true,
      spec: {
        command: {
          oneOf: ["curl", "wget", "nc", "netcat"],
        },
        reason: "Network commands require confirmation",
      },
    },
    // Block privilege escalation
    {
      name: "block-privilege-escalation",
      kind: "BlockCommandRule",
      enabled: true,
      spec: {
        command: {
          oneOf: ["sudo", "su", "doas"],
        },
        reason: "Privilege escalation commands not allowed",
      },
    },
    // Block operations outside current directory
    {
      name: "block-outside-current-directory",
      kind: "LocationRule",
      enabled: true,
      spec: {
        paths: {
          outside: "."
        },
        action: "block",
        reason: "Operations outside current directory not allowed",
      },
    },
    // Warn about shell expansion attempts in command
    {
      name: "warn-shell-expansion-command",
      kind: "WarningRule",
      enabled: true,
      spec: {
        patterns: {
          command: {
            regex: ".*[$`].*"
          }
        },
        warningReason: "Shell expansion syntax detected in command. In this MCP environment, $(command) and `command` are treated as literal text, not executed. Use a plain string instead.",
        acknowledgedAction: "skip",
        acknowledgedReason: "Shell expansion syntax in command acknowledged - proceeding with literal interpretation",
      },
    },
    // Warn about shell expansion attempts in args
    {
      name: "warn-shell-expansion-args",
      kind: "WarningRule",
      enabled: true,
      spec: {
        patterns: {
          args: {
            regexAny: ".*[$`].*"
          }
        },
        warningReason: "Shell expansion syntax detected in arguments. In this MCP environment, $(command) and `command` are treated as literal text, not executed. Use a plain string instead.",
        acknowledgedAction: "skip",
        acknowledgedReason: "Shell expansion syntax in arguments acknowledged - proceeding with literal interpretation",
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
    case "default":
    case "@mcp-cmd/default-preset":
      return DEFAULT_PRESET_CONFIG;
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
    "default",
    "@mcp-cmd/default-preset", 
    "development",
    "@mcp-cmd/development-preset",
    "example",
  ];
}