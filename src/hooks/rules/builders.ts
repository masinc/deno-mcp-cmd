import type {
  Rule,
  RuleAction,
} from "./types.ts";
import { isAllPathsWithinCurrentDirectory } from "./path-utils.ts";
import {
  createTemplateData,
  createWarningReason,
  getActionVerb,
  renderReason,
} from "./template-utils.ts";

/**
 * Simple rule builders for common patterns
 */

// Unified command-based rules
export function createCommandRule(
  action: RuleAction,
  commands: string | string[],
  reason?: string,
): Rule {
  const commandList = Array.isArray(commands) ? commands : [commands];
  const actionVerb = getActionVerb(action);
  const name = commandList.length === 1
    ? `${action}-${commandList[0]}`
    : `${action}-commands-${commandList.join("-")}`;

  return {
    name,
    condition: (ctx) => {
      if (commandList.includes(ctx.toolInput.command)) {
        const defaultReason = `${ctx.toolInput.command} command ${actionVerb}`;
        const finalReason = reason
          ? renderReason(
            reason,
            createTemplateData(ctx, {
              action,
            }),
          )
          : defaultReason;

        return { action, reason: finalReason };
      }
      return null;
    },
  };
}

// Convenience functions for backward compatibility and readability
export function blockCommand(command: string, reason?: string): Rule {
  return createCommandRule("block", command, reason);
}

export function confirmCommand(command: string, reason?: string): Rule {
  return createCommandRule("confirm", command, reason);
}

export function approveCommand(command: string, reason?: string): Rule {
  return createCommandRule("approve", command, reason);
}

export function blockCommands(commands: string[], reason?: string): Rule {
  return createCommandRule("block", commands, reason);
}

export function confirmCommands(commands: string[], reason?: string): Rule {
  return createCommandRule("confirm", commands, reason);
}

export function approveCommands(commands: string[], reason?: string): Rule {
  return createCommandRule("approve", commands, reason);
}


// Flag-based rules
export function blockCommandWithFlags(
  command: string,
  dangerousFlags: string[],
  reason?: string,
): Rule {
  return {
    name: `block-${command}-with-flags`,
    condition: (ctx) => {
      if (ctx.toolInput.command === command) {
        const hasDangerous = ctx.toolInput.args?.some((arg) =>
          dangerousFlags.includes(arg)
        );
        if (hasDangerous) {
          const foundFlags = ctx.toolInput.args?.filter((arg) =>
            dangerousFlags.includes(arg)
          );
          const defaultReason = `${command} with dangerous flags: ${
            foundFlags?.join(", ")
          }`;
          const finalReason = reason
            ? renderReason(
              reason,
              createTemplateData(ctx, {
                action: "block",
              }),
            )
            : defaultReason;

          return {
            action: "block",
            reason: finalReason,
          };
        }
      }
      return null;
    },
  };
}

// Path-based rules
export function blockOutsideCurrentDirectory(reason?: string): Rule {
  return {
    name: "block-outside-current-directory",
    condition: (ctx) => {
      const args = ctx.toolInput.args || [];
      if (args.length === 0) return null;

      if (!isAllPathsWithinCurrentDirectory(args, ctx.toolInput.cwd)) {
        const defaultReason =
          "Operations outside current directory not allowed";
        const finalReason = reason
          ? renderReason(
            reason,
            createTemplateData(ctx, {
              action: "block",
            }),
          )
          : defaultReason;

        return {
          action: "block",
          reason: finalReason,
        };
      }
      return null;
    },
  };
}

// Generic rule builder for custom conditions
export function createRule(
  name: string,
  action: RuleAction,
  condition: (ctx: import("./types.ts").RuleContext) => boolean,
  reason?: string,
): Rule {
  return {
    name,
    condition: (ctx) => {
      if (condition(ctx)) {
        const defaultReason = `${name} rule triggered`;
        const finalReason = reason
          ? renderReason(
            reason,
            createTemplateData(ctx, {
              ruleName: name,
              action,
            }),
          )
          : defaultReason;

        return { action, reason: finalReason };
      }
      return null;
    },
  };
}

// Shell command execution detection rule with warning
export function warnShellExpansion(reason?: string): Rule {
  return {
    name: "warn-shell-expansion",
    condition: (ctx) => {
      // Check if command contains shell execution patterns
      const shellPatterns = ["$(", "`"];
      const hasShellCommand = shellPatterns.some((pattern) =>
        ctx.toolInput.command.includes(pattern)
      );

      // Check if any args contain shell execution patterns
      const hasShellArgs = ctx.toolInput.args?.some((arg) =>
        shellPatterns.some((pattern) => arg.includes(pattern))
      );

      if (hasShellCommand || hasShellArgs) {
        // If warning is acknowledged, skip the command
        if (
          ctx.toolInput.acknowledgeWarnings?.includes("warn-shell-expansion")
        ) {
          const skipReason = reason
            ? renderReason(
              reason,
              createTemplateData(ctx, {
                action: "skip",
              }),
            )
            : "Shell expansion warning acknowledged - command allowed but may not work as expected";

          return {
            action: "skip",
            reason: skipReason,
          };
        }

        // Otherwise, issue warning (always use default message)
        const warningReason = createWarningReason(
          "warn-shell-expansion",
          `Shell expansion syntax detected in command '${ctx.toolInput.command}'. In this MCP environment, $(command) and \`command\` are treated as literal text, not executed. Use a plain string instead.`,
        );

        return { action: "warning", reason: warningReason };
      }
      return null;
    },
  };
}

// Keep old functions for backward compatibility
export function warnShellExecution(reason?: string): Rule {
  return warnShellExpansion(reason);
}

export function blockShellExecution(reason?: string): Rule {
  return warnShellExpansion(reason);
}

// Pattern-based command matching types
type ArgPattern =
  | string // 完全一致
  | (string | { startsWith: string } | { regex: string })[] // いずれかにマッチ
  | "*" // 任意の1つの引数
  | "**" // 任意の数の引数（0個以上）
  | { startsWith: string } // 前方一致
  | { regex: string }; // 正規表現マッチ (文字列パターン)

type CommandPattern = {
  name: string;
  cmd: string | string[] | { regex: string };
  args?: ArgPattern[];
  action: RuleAction;
  reason: string;
};

// Pattern matching helper function
function matchesPattern(
  command: string,
  args: string[],
  pattern: CommandPattern,
): boolean {
  // Check command match
  let cmdMatch = false;

  if (Array.isArray(pattern.cmd)) {
    cmdMatch = pattern.cmd.includes(command);
  } else if (typeof pattern.cmd === "string") {
    cmdMatch = pattern.cmd === command;
  } else if (typeof pattern.cmd === "object" && "regex" in pattern.cmd) {
    const regex = new RegExp(pattern.cmd.regex);
    cmdMatch = regex.test(command);
  }

  if (!cmdMatch) return false;

  // If no args pattern specified, any args are fine
  if (!pattern.args) return true;

  // Check args pattern
  let argIndex = 0;
  for (let i = 0; i < pattern.args.length; i++) {
    const argPattern = pattern.args[i];

    if (argPattern === "**") {
      // "**" matches any remaining arguments
      return true;
    }

    if (argIndex >= args.length) {
      // No more args to match
      return false;
    }

    const currentArg = args[argIndex];

    if (argPattern === "*") {
      // "*" matches any single argument
      argIndex++;
    } else if (typeof argPattern === "string") {
      // Exact string match
      if (currentArg !== argPattern) return false;
      argIndex++;
    } else if (Array.isArray(argPattern)) {
      // Match any item in array (strings or objects)
      let matched = false;
      for (const item of argPattern) {
        if (typeof item === "string") {
          if (currentArg === item) {
            matched = true;
            break;
          }
        } else if (typeof item === "object" && "startsWith" in item) {
          if (currentArg.startsWith(item.startsWith)) {
            matched = true;
            break;
          }
        } else if (typeof item === "object" && "regex" in item) {
          const regex = new RegExp(item.regex);
          if (regex.test(currentArg)) {
            matched = true;
            break;
          }
        }
      }
      if (!matched) return false;
      argIndex++;
    } else if (typeof argPattern === "object" && "startsWith" in argPattern) {
      // Prefix match
      if (!currentArg.startsWith(argPattern.startsWith)) return false;
      argIndex++;
    } else if (typeof argPattern === "object" && "regex" in argPattern) {
      // Regex match
      const regex = new RegExp(argPattern.regex);
      if (!regex.test(currentArg)) return false;
      argIndex++;
    }
  }

  // All patterns matched and we consumed all specified patterns
  return true;
}

// Create rule from command pattern
export function createPatternBasedRule(pattern: CommandPattern): Rule {
  return {
    name: pattern.name,
    condition: (ctx) => {
      if (
        matchesPattern(ctx.toolInput.command, ctx.toolInput.args || [], pattern)
      ) {
        const finalReason = renderReason(
          pattern.reason,
          createTemplateData(ctx, {
            action: pattern.action,
          }),
        );

        return { action: pattern.action, reason: finalReason };
      }
      return null;
    },
  };
}
