import type { Rule, RuleAction, RuleContext, RuleTemplateData } from "./types.ts";
import { RuleTemplateDataSchema } from "./types.ts";
import {
  isAllPathsWithinCurrentDirectory,
} from "./path-utils.ts";
import { Eta } from "eta";

/**
 * Simple rule builders for common patterns
 */


// Create eta instance for rendering templates
const eta = new Eta();

// Helper function to render eta templates for reasons with strong typing
function renderReason(template: string, data: RuleTemplateData): string {
  try {
    // Validate template data with Zod
    const validatedData = RuleTemplateDataSchema.parse(data);
    return eta.renderString(template, validatedData) as string;
  } catch (_error) {
    // Fallback to the template string if rendering fails
    // Note: Error is silently ignored to maintain backward compatibility
    return template;
  }
}

// Helper function to create standardized warning messages
function createWarningReason(ruleName: string, description: string): string {
  return `${description}\n\nTo proceed anyway, add acknowledgeWarnings: ["${ruleName}"] to your request.`;
}

// Helper function to create template data from context
function createTemplateData(
  ctx: RuleContext,
  additionalData: Partial<RuleTemplateData> = {}
): RuleTemplateData {
  const baseData = {
    // Core command information from context
    command: ctx.toolInput.command,
    args: ctx.toolInput.args,
    cwd: ctx.toolInput.cwd,
    sessionId: ctx.sessionId,
    
    // Additional computed fields
    argCount: ctx.toolInput.args?.length || 0,
  };
  
  // Merge additional rule-specific data
  const mergedData = { ...baseData, ...additionalData };
  
  // Auto-generate actionVerb if action is provided but actionVerb is not
  if (mergedData.action && !mergedData.actionVerb) {
    mergedData.actionVerb = getActionVerb(mergedData.action);
  }
  
  return mergedData as RuleTemplateData;
}

// Unified command-based rules
export function createCommandRule(
  action: RuleAction,
  commands: string | string[],
  reason?: string
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
          ? renderReason(reason, createTemplateData(ctx, {
              action,
            }))
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

// Helper function to get appropriate verb for action
function getActionVerb(action: RuleAction): string {
  switch (action) {
    case "block": return "blocked";
    case "warning": return "warned";
    case "confirm": return "requires confirmation";
    case "approve": return "approved";
    case "skip": return "skipped";
  }
}

// Flag-based rules
export function blockCommandWithFlags(
  command: string,
  dangerousFlags: string[],
  reason?: string
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
          const defaultReason = `${command} with dangerous flags: ${foundFlags?.join(", ")}`;
          const finalReason = reason
            ? renderReason(reason, createTemplateData(ctx, {
                action: "block",
              }))
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
        const defaultReason = "Operations outside current directory not allowed";
        const finalReason = reason
          ? renderReason(reason, createTemplateData(ctx, {
              action: "block",
            }))
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
  reason?: string
): Rule {
  return {
    name,
    condition: (ctx) => {
      if (condition(ctx)) {
        const defaultReason = `${name} rule triggered`;
        const finalReason = reason
          ? renderReason(reason, createTemplateData(ctx, {
              ruleName: name,
              action,
            }))
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
      const hasShellCommand = shellPatterns.some(pattern => 
        ctx.toolInput.command.includes(pattern)
      );
      
      // Check if any args contain shell execution patterns
      const hasShellArgs = ctx.toolInput.args?.some(arg => 
        shellPatterns.some(pattern => arg.includes(pattern))
      );

      if (hasShellCommand || hasShellArgs) {
        // If warning is acknowledged, approve the command
        if (ctx.toolInput.acknowledgeWarnings?.includes("warn-shell-expansion")) {
          const approveReason = reason
            ? renderReason(reason, createTemplateData(ctx, {
                action: "approve",
              }))
            : "Shell expansion warning acknowledged - command allowed but may not work as expected";
          
          return { 
            action: "approve", 
            reason: approveReason
          };
        }
        
        // Otherwise, issue warning (always use default message)
        const warningReason = createWarningReason(
          "warn-shell-expansion",
          `Shell expansion syntax detected in command '${ctx.toolInput.command}'. In this MCP environment, $(command) and \`command\` are treated as literal text, not executed. Use a plain string instead.`
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

// Pattern-based rules (for regex or glob patterns)
export function createPatternRule(
  action: RuleAction,
  pattern: RegExp,
  reason?: string
): Rule {
  const actionVerb = getActionDescription(action);
  return {
    name: `${action}-pattern-${pattern.source}`,
    condition: (ctx) => {
      if (pattern.test(ctx.toolInput.command)) {
        const defaultReason = `Command matches ${actionVerb} pattern: ${pattern}`;
        const finalReason = reason
          ? renderReason(reason, createTemplateData(ctx, {
              pattern: pattern.source,
              action,
            }))
          : defaultReason;

        return { action, reason: finalReason };
      }
      return null;
    },
  };
}

// Convenience functions for backward compatibility
export function blockCommandPattern(pattern: RegExp, reason?: string): Rule {
  return createPatternRule("block", pattern, reason);
}

export function confirmCommandPattern(pattern: RegExp, reason?: string): Rule {
  return createPatternRule("confirm", pattern, reason);
}

export function approveCommandPattern(pattern: RegExp, reason?: string): Rule {
  return createPatternRule("approve", pattern, reason);
}

// Helper function to get appropriate description for pattern actions
function getActionDescription(action: RuleAction): string {
  switch (action) {
    case "block": return "blocked";
    case "warning": return "warning";
    case "confirm": return "confirmation";
    case "approve": return "approval";
    case "skip": return "skip";
  }
}