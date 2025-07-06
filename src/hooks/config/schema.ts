import * as z from "zod/v4";

/**
 * Zod schemas for user rule configuration validation
 */

// Pattern schemas
const CommandPatternSchema = z.union([
  z.string().meta({
    description: "Exact command name to match",
    examples: ["docker", "npm", "git"]
  }),
  z.object({
    exact: z.string().optional().meta({
      description: "Exact command name to match",
      examples: ["docker", "kubectl", "helm"]
    }),
    oneOf: z.array(z.string()).optional().meta({
      description: "Match if command is one of these values",
      examples: [["rm", "mv", "cp"], ["npm", "yarn", "pnpm"]]
    }),
    regex: z.string().optional().meta({
      description: "Match if command matches this regex pattern",
      examples: ["^npm.*", "docker.*", ".*install.*"]
    }),
    startsWith: z.string().optional().meta({
      description: "Match if command starts with this prefix",
      examples: ["docker", "npm", "git"]
    }),
    endsWith: z.string().optional().meta({
      description: "Match if command ends with this suffix",
      examples: ["install", "run", "build"]
    }),
  }).refine(
    (data) => Object.values(data).filter(Boolean).length === 1,
    "Exactly one command pattern type must be specified",
  ),
]).meta({
  description: "Pattern for matching command names with various matching strategies",
  examples: ["docker", { oneOf: ["rm", "mv"] }, { regex: "^npm" }]
});

const ArgsPatternSchema = z.object({
  containsAny: z.array(z.string()).optional().meta({
    description: "Match if args contain any of these strings (OR logic)",
    examples: [["--force", "-f"], ["--privileged"]]
  }),
  containsAll: z.array(z.string()).optional().meta({
    description: "Match if args contain all of these strings (AND logic)",
    examples: [["--force", "--recursive"], ["--user", "--group"]]
  }),
  containsNone: z.array(z.string()).optional().meta({
    description: "Match only if args contain none of these strings (safe filtering)",
    examples: [["-d", "--delete"], ["-m", "--move"], ["--force", "-f"]]
  }),
  exact: z.array(z.string()).optional().meta({
    description: "Match if args exactly match this array",
    examples: [["run", "--rm"], ["apply", "-f", "config.yaml"]]
  }),
  startsWith: z.array(z.string()).optional().meta({
    description: "Match if the first argument starts with any of these prefixes (OR logic)",
    examples: [["status", "log", "show"], ["--oneline"], ["push", "pull"]]
  }),
  regexAny: z.string().optional().meta({
    description: "Match if any arg matches this regex pattern (OR logic)",
    examples: ["--port=\\d+", ".*\\.yaml$"]
  }),
  regexAll: z.array(z.string()).optional().meta({
    description: "Match if all these regex patterns are found in args (AND logic)",
    examples: [["--user=.*", "--group=.*"], ["^-.*", ".*\\.conf$"]]
  }),
  minLength: z.number().min(0).optional().meta({
    description: "Match if args array has at least this many elements",
    examples: [1, 3]
  }),
  maxLength: z.number().min(0).optional().meta({
    description: "Match if args array has at most this many elements", 
    examples: [5, 10]
  }),
}).meta({
  description: "Pattern for matching command arguments with various filtering options",
  examples: [
    { containsAny: ["--force"] },
    { containsAll: ["--force", "--recursive"] },
    { containsNone: ["-d", "--delete"] },
    { exact: ["run", "--rm"] },
    { startsWith: ["--oneline"] },
    { regexAny: "--port=\\d+" },
    { regexAll: ["--user=.*", "--group=.*"] }
  ]
});

const PathPatternSchema = z.object({
  startsWith: z.string().optional().meta({
    description: "Match if current working directory starts with this path",
    examples: ["/usr", "/home/user", "/opt"]
  }),
  contains: z.string().optional().meta({
    description: "Match if current working directory contains this substring",
    examples: ["node_modules", ".git", "src"]
  }),
  regex: z.string().optional().meta({
    description: "Match if current working directory matches this regex pattern",
    examples: [".*\\.git.*", "/home/[^/]+/projects"]
  }),
  outside: z.string().optional().meta({
    description: "Match if current working directory is outside this path",
    examples: ["/home", "/usr/local"]
  }),
  isSubdirectory: z.boolean().optional().meta({
    description: "Match if current working directory is a subdirectory (not the root or exact match)",
    examples: [true, false],
    note: "When true, matches only if cwd is deeper than the initial working directory"
  }),
}).meta({
  description: "Pattern for matching file system paths and working directories",
  examples: [
    { startsWith: "/usr" },
    { contains: "node_modules" },
    { outside: "/home" },
    { isSubdirectory: true }
  ]
});

// Base rule schema
const BaseRuleSchema = z.object({
  name: z.string().min(1).meta({
    description: "Unique identifier for the rule",
    examples: ["block-sudo", "approve-git-read", "warn-docker-privileged", "protect-system-dirs"],
    pattern: "kebab-case recommended",
    constraints: "Must be unique within configuration"
  }),
  enabled: z.boolean().default(true).meta({
    description: "Whether this rule is active",
    examples: [true, false],
    default: true,
    usage: "Set to false to temporarily disable without removing rule"
  }),
}).meta({
  description: "Base schema for all user-defined rules",
  version: "1.0.0",
  inheritance: "Extended by all specific rule types"
});

// Specific rule schemas
const BlockCommandRuleSchema = BaseRuleSchema.extend({
  kind: z.literal("BlockCommandRule").meta({
    description: "Rule type identifier for blocking commands",
    constant: "BlockCommandRule",
    purpose: "Prevents command execution when patterns match"
  }),
  spec: z.object({
    command: CommandPatternSchema.optional().meta({
      description: "Pattern to match against the command name",
      examples: ["sudo", { oneOf: ["rm", "mv"] }, { regex: "^docker.*" }],
      optional: "Can be omitted if args or cwd patterns are specified"
    }),
    args: ArgsPatternSchema.optional().meta({
      description: "Pattern to match against command arguments",
      examples: [
        { containsAny: ["--force", "-f"] },
        { startsWith: ["status", "log", "show"], containsNone: ["-n", "--dry-run"] }
      ],
      optional: "Can be omitted if command or cwd patterns are specified"
    }),
    cwd: PathPatternSchema.optional().meta({
      description: "Pattern to match against current working directory",
      examples: [
        { startsWith: "/usr" },
        { contains: ".git", outside: "/tmp" }
      ],
      optional: "Can be omitted if command or args patterns are specified"
    }),
    reason: z.string().optional().meta({
      description: "Human-readable explanation for why the command is blocked",
      examples: [
        "Sudo access not allowed in this environment",
        "Dangerous file operations blocked for safety",
        "System directory modifications prohibited"
      ],
      optional: "Will use default message if not provided"
    }),
  }).refine(
    (data) => data.command || data.args || data.cwd,
    "At least one of command, args, or cwd must be specified",
  ).meta({
    description: "Specification for what commands to block and why",
    validation: "Must include at least one pattern (command, args, or cwd)"
  }),
}).meta({
  description: "Rule that blocks command execution when patterns match",
  category: "security",
  severity: "high",
  useCases: ["Preventing dangerous commands", "Enforcing security policies", "Blocking unauthorized access"],
  examples: [
    {
      name: "block-sudo",
      kind: "BlockCommandRule",
      spec: { command: "sudo", reason: "Sudo access not allowed" }
    },
    {
      name: "block-force-operations",
      kind: "BlockCommandRule",
      spec: {
        args: { containsAny: ["--force", "-f"] },
        reason: "Force operations require manual approval"
      }
    },
    {
      name: "block-system-modifications",
      kind: "BlockCommandRule",
      spec: {
        command: { oneOf: ["rm", "mv", "chmod"] },
        cwd: { startsWith: "/usr" },
        reason: "System directory modifications blocked"
      }
    }
  ]
});

const ApproveCommandRuleSchema = BaseRuleSchema.extend({
  kind: z.literal("ApproveCommandRule").meta({
    description: "Rule type identifier for auto-approving commands",
    constant: "ApproveCommandRule",
    purpose: "Automatically approves command execution when patterns match"
  }),
  spec: z.object({
    command: CommandPatternSchema.optional().meta({
      description: "Pattern to match against the command name",
      examples: [
        "ls",
        { oneOf: ["git", "npm", "yarn"] },
        { startsWith: "docker" }
      ],
      optional: "Can be omitted if args or cwd patterns are specified"
    }),
    args: ArgsPatternSchema.optional().meta({
      description: "Pattern to match against command arguments",
      examples: [
        { startsWith: ["log"], containsNone: ["-d", "--delete"] },
        { containsAny: ["--help", "-h"] }
      ],
      optional: "Can be omitted if command or cwd patterns are specified"
    }),
    cwd: PathPatternSchema.optional().meta({
      description: "Pattern to match against current working directory",
      examples: [
        { contains: "projects" },
        { startsWith: "/home/user" }
      ],
      optional: "Can be omitted if command or args patterns are specified"
    }),
    reason: z.string().optional().meta({
      description: "Reason why this command should be automatically approved",
      examples: [
        "Safe development command",
        "Pre-approved for this environment",
        "Read-only operations are always safe",
        "Git read operations in project directories"
      ],
      optional: "Will use default message if not provided"
    }),
  }).refine(
    (data) => data.command || data.args || data.cwd,
    "At least one of command, args, or cwd must be specified",
  ).meta({
    description: "Specification for what commands to auto-approve and why",
    validation: "Must include at least one pattern (command, args, or cwd)"
  }),
}).meta({
  description: "Rule that automatically approves command execution when patterns match",
  category: "convenience",
  severity: "low",
  useCases: ["Streamlining safe operations", "Auto-approving read-only commands", "Speeding up development workflows"],
  examples: [
    {
      name: "approve-ls",
      kind: "ApproveCommandRule",
      spec: { command: "ls", reason: "Safe directory listing command" }
    },
    {
      name: "approve-git-read",
      kind: "ApproveCommandRule",
      spec: {
        command: "git",
        args: { 
          startsWith: ["log"], 
          containsNone: ["-d", "--delete", "-m", "--move"] 
        },
        reason: "Git read-only log operations"
      }
    },
    {
      name: "approve-dev-commands",
      kind: "ApproveCommandRule",
      spec: { 
        command: { oneOf: ["npm", "yarn", "git"] },
        cwd: { contains: "projects" },
        reason: "Development commands in projects directory" 
      }
    },
    {
      name: "approve-help-commands",
      kind: "ApproveCommandRule",
      spec: {
        args: { containsAny: ["--help", "-h", "--version", "-v"] },
        reason: "Help and version commands are always safe"
      }
    }
  ]
});

const WarningRuleSchema = BaseRuleSchema.extend({
  kind: z.literal("WarningRule").meta({
    description: "Rule type identifier for warning about potentially dangerous commands",
    constant: "WarningRule",
    purpose: "Shows warnings for potentially dangerous operations"
  }),
  spec: z.object({
    patterns: z.object({
      command: CommandPatternSchema.optional().meta({
        description: "Pattern to match against the command name",
        examples: ["docker", { oneOf: ["git", "rm"] }],
        optional: "Can be omitted if args or cwd patterns are specified"
      }),
      args: ArgsPatternSchema.optional().meta({
        description: "Pattern to match against command arguments",
        examples: [
          { containsAny: ["--privileged"] },
          { startsWith: ["push"], containsAny: ["--force"] }
        ],
        optional: "Can be omitted if command or cwd patterns are specified"
      }),
      cwd: PathPatternSchema.optional().meta({
        description: "Pattern to match against current working directory",
        examples: [
          { startsWith: "/usr" },
          { contains: "production" }
        ],
        optional: "Can be omitted if command or args patterns are specified"
      }),
    }).refine(
      (data) => data.command || data.args || data.cwd,
      "At least one pattern must be specified",
    ).meta({
      description: "Patterns to match for triggering the warning",
      validation: "Must include at least one pattern (command, args, or cwd)"
    }),
    warningReason: z.string().min(1).meta({
      description: "Reason or message to display when the warning is triggered",
      examples: [
        "Privileged container detected",
        "Force push will rewrite Git history",
        "Working in production environment",
        "Dangerous file operation attempted"
      ],
      required: true
    }),
    acknowledgedAction: z.enum(["skip", "confirm", "approve"]).default("skip").meta({
      description: "Action to take when warning is acknowledged",
      examples: ["skip", "confirm", "approve"],
      default: "skip",
      options: {
        skip: "Skip the command execution",
        confirm: "Ask for explicit confirmation",
        approve: "Proceed with execution"
      }
    }),
    acknowledgedReason: z.string().optional().meta({
      description: "Custom reason to display when warning is acknowledged",
      examples: [
        "User approved privileged container",
        "Force push acknowledged by developer",
        "Production access confirmed",
        "Override authorized by team lead"
      ],
      optional: "Will use default message if not provided"
    }),
  }).meta({
    description: "Specification for warning conditions and acknowledgment behavior",
    workflow: "Pattern match → Show warning → User acknowledges → Take acknowledgedAction"
  }),
}).meta({
  description: "Rule that shows warnings for potentially dangerous operations with configurable acknowledged action",
  category: "safety",
  severity: "medium",
  useCases: ["Warning about risky operations", "Requiring explicit confirmation", "Documenting dangerous actions"],
  examples: [
    {
      name: "warn-docker-privileged",
      kind: "WarningRule",
      spec: {
        patterns: { command: "docker", args: { containsAny: ["--privileged"] } },
        warningReason: "Privileged container detected",
        acknowledgedAction: "confirm"
      }
    },
    {
      name: "warn-force-push",
      kind: "WarningRule",
      spec: {
        patterns: {
          command: "git",
          args: { startsWith: ["push"], containsAny: ["--force", "-f"] }
        },
        warningReason: "Force push will rewrite Git history",
        acknowledgedAction: "approve",
        acknowledgedReason: "Force push confirmed by developer"
      }
    },
    {
      name: "warn-production-access",
      kind: "WarningRule",
      spec: {
        patterns: { cwd: { contains: "production" } },
        warningReason: "Working in production environment",
        acknowledgedAction: "confirm"
      }
    }
  ]
});

const ConfirmCommandRuleSchema = BaseRuleSchema.extend({
  kind: z.literal("ConfirmCommandRule").meta({
    description: "Rule type identifier for requiring user confirmation",
    constant: "ConfirmCommandRule",
    purpose: "Requires explicit user confirmation before command execution"
  }),
  spec: z.object({
    command: CommandPatternSchema.optional().meta({
      description: "Pattern to match against the command name",
      examples: [
        "kubectl",
        { oneOf: ["docker", "podman"] },
        { regex: ".*deploy.*" }
      ],
      optional: "Can be omitted if args or cwd patterns are specified"
    }),
    args: ArgsPatternSchema.optional().meta({
      description: "Pattern to match against command arguments",
      examples: [
        { containsAny: ["prod", "production"] },
        { startsWith: ["apply"] },
        { containsAll: ["--force", "--yes"] }
      ],
      optional: "Can be omitted if command or cwd patterns are specified"
    }),
    cwd: PathPatternSchema.optional().meta({
      description: "Pattern to match against current working directory",
      examples: [
        { contains: "production" },
        { startsWith: "/etc" },
        { outside: "/home" }
      ],
      optional: "Can be omitted if command or args patterns are specified"
    }),
    reason: z.string().optional().meta({
      description: "Human-readable explanation for why confirmation is required",
      examples: [
        "Production deployment requires confirmation",
        "System-level changes need approval",
        "Potentially destructive operation",
        "Compliance requirement"
      ],
      optional: "Will use default message if not provided"
    }),
    message: z.string().optional().meta({
      description: "Custom confirmation prompt to display to user",
      examples: [
        "Are you sure you want to deploy to production?",
        "This will modify system files. Continue?",
        "Confirm destructive operation",
        "Proceed with Kubernetes changes?"
      ],
      optional: "Falls back to reason if not provided"
    }),
  }).refine(
    (data) => data.command || data.args || data.cwd,
    "At least one of command, args, or cwd must be specified",
  ).meta({
    description: "Specification for what commands require confirmation and why",
    validation: "Must include at least one pattern (command, args, or cwd)"
  }),
}).meta({
  description: "Rule that requires user confirmation before command execution",
  category: "safety",
  severity: "medium",
  useCases: [
    "Production deployments",
    "System modifications",
    "Potentially destructive operations", 
    "Compliance requirements"
  ],
  examples: [
    {
      name: "confirm-prod-deploy",
      kind: "ConfirmCommandRule",
      spec: {
        args: { containsAny: ["prod", "production"] },
        reason: "Production deployment requires confirmation",
        message: "Deploy to production environment?"
      }
    },
    {
      name: "confirm-kubectl-apply",
      kind: "ConfirmCommandRule",
      spec: {
        command: "kubectl",
        args: { startsWith: ["apply"] },
        reason: "Kubernetes changes require confirmation"
      }
    },
    {
      name: "confirm-system-changes",
      kind: "ConfirmCommandRule",
      spec: {
        cwd: { startsWith: "/etc" },
        reason: "System configuration changes need approval",
        message: "Modify system configuration files?"
      }
    },
    {
      name: "confirm-force-operations",
      kind: "ConfirmCommandRule",
      spec: {
        args: { containsAll: ["--force", "--yes"] },
        reason: "Multiple force flags detected",
        message: "Execute potentially dangerous operation?"
      }
    }
  ]
});

const ConditionalRuleSchema = BaseRuleSchema.extend({
  kind: z.literal("ConditionalRule").meta({
    description: "Rule type identifier for custom JavaScript conditions",
    constant: "ConditionalRule",
    purpose: "Allows custom JavaScript logic for complex rule conditions"
  }),
  spec: z.object({
    condition: z.string().min(1).meta({
      description: "JavaScript expression to evaluate for rule matching",
      examples: [
        "command === 'kubectl' && args.includes('prod')",
        "args.some(arg => arg.match(/prod|production/i))",
        "command.includes('docker') && cwd && cwd.includes('production')",
        "args.length > 5 && args.includes('--force')"
      ],
      syntax: "JavaScript expression with access to: command, args[], cwd",
      security: "Use with caution - expressions are evaluated as JavaScript"
    }),
    action: z.enum(["block", "confirm", "approve", "warning"]).meta({
      description: "Action to take when condition evaluates to true",
      examples: ["block", "confirm", "approve", "warning"],
      options: {
        block: "Block command execution",
        confirm: "Ask for user confirmation",
        approve: "Automatically approve execution",
        warning: "Show warning but allow execution"
      }
    }),
    reason: z.string().optional().meta({
      description: "Human-readable explanation for the rule",
      examples: [
        "Production deployment requires confirmation",
        "Complex security check failed",
        "Custom business logic validation"
      ],
      optional: "Will use default message if not provided"
    }),
    message: z.string().optional().meta({
      description: "Custom message to display when rule triggers",
      examples: [
        "Production environment detected",
        "Multiple force flags detected",
        "Custom validation message"
      ],
      optional: "Used for warning action, falls back to reason if not provided"
    }),
  }).meta({
    description: "Specification for custom JavaScript-based rule logic",
    evaluation: "Condition is evaluated in a sandboxed JavaScript context"
  }),
}).meta({
  description: "Rule with custom JavaScript condition for complex logic",
  category: "advanced",
  severity: "variable",
  useCases: ["Complex business logic", "Multi-field validation", "Dynamic rule conditions"],
  security: "Use with caution - JavaScript evaluation can be dangerous",
  examples: [
    {
      name: "confirm-prod-deploy",
      kind: "ConditionalRule",
      spec: {
        condition: "command === 'kubectl' && args.includes('prod')",
        action: "confirm",
        reason: "Production deployment requires confirmation"
      }
    },
    {
      name: "block-complex-danger",
      kind: "ConditionalRule",
      spec: {
        condition: "args.includes('--force') && args.includes('--recursive') && cwd && cwd.startsWith('/usr')",
        action: "block",
        reason: "Dangerous combination: force + recursive in system directory"
      }
    },
    {
      name: "warn-many-args",
      kind: "ConditionalRule",
      spec: {
        condition: "args.length > 10",
        action: "warning",
        message: "Command has many arguments, please review"
      }
    }
  ]
});

const LocationRuleSchema = BaseRuleSchema.extend({
  kind: z.literal("LocationRule").meta({
    description: "Rule type identifier for location-based restrictions",
    constant: "LocationRule",
    purpose: "Controls operations based on working directory paths"
  }),
  spec: z.object({
    paths: z.object({
      startsWith: z.string().optional().meta({
        description: "Match if working directory starts with this path",
        examples: ["/usr", "/etc", "/opt", "C:\\Program Files"]
      }),
      outside: z.string().optional().meta({
        description: "Match if working directory is outside this path",
        examples: ["/home", "/usr/local", "C:\\Users"]
      }),
      contains: z.string().optional().meta({
        description: "Match if working directory contains this substring",
        examples: ["node_modules", ".git", "production", "staging"]
      }),
    }).refine(
      (data) => data.startsWith || data.outside || data.contains,
      "At least one path condition must be specified",
    ).meta({
      description: "Path matching conditions",
      validation: "Must specify at least one path condition"
    }),
    commands: z.array(z.string()).optional().meta({
      description: "Specific commands to apply this rule to",
      examples: [
        ["rm", "mv", "chmod"],
        ["docker", "kubectl"],
        ["npm", "yarn"]
      ],
      optional: "If omitted, applies to all commands in matching paths"
    }),
    action: z.enum(["block", "confirm", "approve"]).meta({
      description: "Action to take when path and command conditions match",
      examples: ["block", "confirm", "approve"],
      options: {
        block: "Block execution in matching paths",
        confirm: "Require confirmation in matching paths",
        approve: "Auto-approve in matching paths"
      }
    }),
    reason: z.string().optional().meta({
      description: "Human-readable explanation for the path restriction",
      examples: [
        "System directory protection",
        "Production environment safety",
        "Node modules should not be modified manually"
      ],
      optional: "Will use default message if not provided"
    }),
  }).meta({
    description: "Specification for path-based command restrictions",
    matching: "Evaluates path conditions against current working directory"
  }),
}).meta({
  description: "Rule that controls operations based on working directory paths",
  category: "file-system",
  severity: "medium",
  useCases: ["Protecting system directories", "Environment-specific rules", "Project structure enforcement"],
  examples: [
    {
      name: "protect-system-dirs",
      kind: "LocationRule",
      spec: {
        paths: { startsWith: "/usr" },
        commands: ["rm", "mv", "chmod"],
        action: "block",
        reason: "System directory protection"
      }
    },
    {
      name: "confirm-outside-home",
      kind: "LocationRule",
      spec: {
        paths: { outside: "/home" },
        action: "confirm",
        reason: "Working outside user directories requires confirmation"
      }
    },
    {
      name: "approve-project-tools",
      kind: "LocationRule",
      spec: {
        paths: { contains: "projects" },
        commands: ["npm", "yarn", "git"],
        action: "approve",
        reason: "Development tools in project directories"
      }
    }
  ]
});

// Union of all rule types
export const UserRuleSchema = z.discriminatedUnion("kind", [
  BlockCommandRuleSchema,
  ApproveCommandRuleSchema,
  ConfirmCommandRuleSchema,
  WarningRuleSchema,
  ConditionalRuleSchema,
  LocationRuleSchema,
]).meta({
  description: "Union type for all supported user rule types",
  discriminator: "kind",
  supportedTypes: ["BlockCommandRule", "ApproveCommandRule", "ConfirmCommandRule", "WarningRule", "ConditionalRule", "LocationRule"],
  ruleTypes: {
    BlockCommandRule: "Blocks command execution when patterns match",
    ApproveCommandRule: "Auto-approves command execution when patterns match",
    ConfirmCommandRule: "Requires user confirmation before command execution",
    WarningRule: "Shows warnings for potentially dangerous operations",
    ConditionalRule: "Uses custom JavaScript conditions for complex logic",
    LocationRule: "Controls operations based on working directory paths"
  },
  examples: [
    {
      name: "block-sudo",
      kind: "BlockCommandRule",
      spec: { command: "sudo", reason: "Sudo access not allowed" }
    },
    {
      name: "approve-git-read",
      kind: "ApproveCommandRule", 
      spec: {
        command: "git",
        args: { startsWith: ["log"], containsNone: ["-d", "--delete"] },
        reason: "Safe git read operations"
      }
    },
    {
      name: "confirm-prod-deploy",
      kind: "ConfirmCommandRule",
      spec: {
        args: { regexAny: "prod|production" },
        reason: "Production deployment requires confirmation"
      }
    },
    {
      name: "warn-force-push",
      kind: "WarningRule",
      spec: {
        patterns: {
          command: "git",
          args: { startsWith: ["push"], containsAny: ["--force"] }
        },
        warningReason: "Force push detected",
        acknowledgedAction: "confirm"
      }
    }
  ]
});

// Main configuration schema
export const UserRulesConfigSchema = z.object({
  rules: z.array(UserRuleSchema).meta({
    description: "Array of user-defined command rules",
    examples: [
      [
        {
          name: "block-sudo",
          kind: "BlockRule",
          spec: { command: "sudo" }
        },
        {
          name: "approve-ls",
          kind: "ApproveRule",
          spec: { command: "ls" }
        }
      ]
    ],
    validation: "Each rule must have a unique name",
    processing: "Rules are evaluated in the order they appear"
  }),
}).meta({
  description: "Configuration schema for user-defined MCP command rules",
  version: "1.0.0",
  author: "MCP-CMD",
  usage: "Define custom rules to control command execution behavior",
  configurationFile: "Typically saved as mcp-rules.yaml or mcp-rules.json",
  documentation: "See MCP-CMD documentation for complete rule configuration guide",
  examples: [
    {
      rules: [
        {
          name: "block-sudo",
          kind: "BlockCommandRule",
          spec: { command: "sudo", reason: "Sudo access not allowed" }
        }
      ]
    },
    {
      rules: [
        {
          name: "security-baseline",
          kind: "BlockCommandRule",
          spec: {
            command: { oneOf: ["rm", "mv", "chmod"] },
            args: { containsAny: ["--force", "-f"] },
            reason: "Force operations on file commands blocked"
          }
        },
        {
          name: "approve-dev-tools",
          kind: "ApproveCommandRule",
          spec: {
            command: { oneOf: ["npm", "yarn", "git"] },
            cwd: { contains: "projects" },
            reason: "Development tools in project directories"
          }
        },
        {
          name: "warn-production",
          kind: "WarningRule",
          spec: {
            patterns: { cwd: { contains: "production" } },
            warningReason: "Working in production environment",
            acknowledgedAction: "confirm"
          }
        }
      ]
    }
  ]
});

// Export types derived from schemas
export type UserRulesConfig = z.infer<typeof UserRulesConfigSchema>;
export type UserRule = z.infer<typeof UserRuleSchema>;
export type BlockCommandRule = z.infer<typeof BlockCommandRuleSchema>;
export type ApproveCommandRule = z.infer<typeof ApproveCommandRuleSchema>;
export type ConfirmCommandRule = z.infer<typeof ConfirmCommandRuleSchema>;
export type WarningRule = z.infer<typeof WarningRuleSchema>;
export type ConditionalRule = z.infer<typeof ConditionalRuleSchema>;
export type LocationRule = z.infer<typeof LocationRuleSchema>;
export type CommandPattern = z.infer<typeof CommandPatternSchema>;
export type ArgsPattern = z.infer<typeof ArgsPatternSchema>;
export type PathPattern = z.infer<typeof PathPatternSchema>;

// Export individual schemas for testing and validation
export {
  ApproveCommandRuleSchema,
  ArgsPatternSchema,
  BlockCommandRuleSchema,
  CommandPatternSchema,
  ConfirmCommandRuleSchema,
  ConditionalRuleSchema,
  LocationRuleSchema,
  PathPatternSchema,
  WarningRuleSchema,
};

// Export JSON Schema for external tooling (IDE support, documentation, etc.)
export const UserRulesConfigJsonSchema = z.toJSONSchema(UserRulesConfigSchema);
export const UserRuleJsonSchema = z.toJSONSchema(UserRuleSchema);
