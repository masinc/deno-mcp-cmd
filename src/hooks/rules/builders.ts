import type { Rule, RuleAction, RuleContext } from "./schema.ts";
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

/**
 * Creates a rule based on command matching with specified action
 * @param action - The action to take when the rule matches
 * @param commands - Single command or array of commands to match
 * @param reason - Optional custom reason template (uses Eta templating)
 * @returns A rule that matches the specified commands
 */
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
    condition: (ctx: RuleContext) => {
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

/**
 * Creates a rule that blocks a specific command
 * @param command - The command to block
 * @param reason - Optional custom reason template
 * @returns A rule that blocks the specified command
 */
export function blockCommand(command: string, reason?: string): Rule {
  return createCommandRule("block", command, reason);
}

/**
 * Creates a rule that requires confirmation for a specific command
 * @param command - The command requiring confirmation
 * @param reason - Optional custom reason template
 * @returns A rule that requires confirmation for the specified command
 */
export function confirmCommand(command: string, reason?: string): Rule {
  return createCommandRule("confirm", command, reason);
}

/**
 * Creates a rule that approves a specific command
 * @param command - The command to approve
 * @param reason - Optional custom reason template
 * @returns A rule that approves the specified command
 */
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

/**
 * Creates a rule that blocks a command when used with dangerous flags
 * @param command - The command to monitor
 * @param dangerousFlags - Array of flags that make the command dangerous
 * @param reason - Optional custom reason template
 * @returns A rule that blocks the command when dangerous flags are present
 */
export function blockCommandWithFlags(
  command: string,
  dangerousFlags: string[],
  reason?: string,
): Rule {
  return {
    name: `block-${command}-with-flags`,
    condition: (ctx: RuleContext) => {
      if (ctx.toolInput.command === command) {
        const hasDangerous = ctx.toolInput.args?.some((arg: string) =>
          dangerousFlags.includes(arg)
        );
        if (hasDangerous) {
          const foundFlags = ctx.toolInput.args?.filter((arg: string) =>
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

/**
 * Creates a rule that blocks commands operating outside the current directory
 * @param reason - Optional custom reason template
 * @returns A rule that blocks operations outside the current directory
 */
export function blockOutsideCurrentDirectory(reason?: string): Rule {
  return {
    name: "block-outside-current-directory",
    condition: (ctx: RuleContext) => {
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

/**
 * Creates a custom rule with a user-defined condition function
 * @param name - The name of the rule
 * @param action - The action to take when the rule matches
 * @param condition - Function that determines if the rule should trigger
 * @param reason - Optional custom reason template
 * @returns A rule with custom condition logic
 */
export function createRule(
  name: string,
  action: RuleAction,
  condition: (ctx: import("./schema.ts").RuleContext) => boolean,
  reason?: string,
): Rule {
  return {
    name,
    condition: (ctx: RuleContext) => {
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

/**
 * Creates a warning rule that shows a warning first, then performs configurable action on acknowledgment
 * @param name - The warning name (used in acknowledgeWarnings array)
 * @param condition - Function that determines if the warning should trigger
 * @param warningReason - The warning reason/message to display
 * @param acknowledgedReason - Optional custom reason template for acknowledgment case
 * @param acknowledgedAction - Action to take when warning is acknowledged (default: "skip")
 * @returns A rule that warns first, then performs the specified action when acknowledged
 */
export function createWarningRule(
  name: string,
  condition: (ctx: import("./schema.ts").RuleContext) => boolean,
  warningReason: string,
  acknowledgedReason?: string,
  acknowledgedAction: "skip" | "confirm" | "approve" = "skip",
): Rule {
  return {
    name,
    condition: (ctx: RuleContext) => {
      if (condition(ctx)) {
        // If warning is acknowledged, perform the configured action
        if (ctx.toolInput.acknowledgeWarnings?.includes(name)) {
          const finalAcknowledgedReason = acknowledgedReason
            ? renderReason(
              acknowledgedReason,
              createTemplateData(ctx, {
                action: acknowledgedAction,
              }),
            )
            : `${name} warning acknowledged - command ${
              acknowledgedAction === "skip"
                ? "allowed but may not work as expected"
                : acknowledgedAction === "approve"
                ? "approved"
                : "requires confirmation"
            }`;

          return {
            action: acknowledgedAction,
            reason: finalAcknowledgedReason,
          };
        }

        // Otherwise, issue warning
        const finalWarningReason = createWarningReason(name, warningReason);
        return { action: "warning", reason: finalWarningReason };
      }
      return null;
    },
  };
}

/**
 * Pattern for matching command arguments with various matching strategies
 */
type ArgPattern =
  | string // Exact match
  | (string | { startsWith: string } | { regex: string })[] // Match any in array
  | "*" // Any single argument
  | "**" // Any number of arguments (0 or more)
  | { startsWith: string } // Prefix match
  | { regex: string }; // Regular expression match (string pattern)

/**
 * Pattern definition for sophisticated command and argument matching
 */
type CommandPattern = {
  /** Unique name for the pattern rule */
  name: string;
  /** Command pattern: exact string, array of strings, or regex pattern */
  cmd: string | string[] | { regex: string };
  /** Optional array of argument patterns to match */
  args?: ArgPattern[];
  /** Action to take when pattern matches */
  action: RuleAction;
  /** Reason template (supports Eta templating) */
  reason: string;
};

/**
 * Determines if a command and its arguments match a given pattern
 * @param command - The command to check
 * @param args - Command arguments to check
 * @param pattern - The pattern to match against
 * @returns true if the command and arguments match the pattern
 */
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

/**
 * Creates a rule based on sophisticated pattern matching for commands and arguments
 * @param pattern - Pattern definition including command patterns, argument patterns, action, and reason
 * @returns A rule that matches commands based on the specified patterns
 */
export function createPatternBasedRule(pattern: CommandPattern): Rule {
  return {
    name: pattern.name,
    condition: (ctx: RuleContext) => {
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
