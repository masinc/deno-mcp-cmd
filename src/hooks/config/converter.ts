import { createWarningRule, createRule } from "../rules/builders.ts";
import type { Rule, RuleContext } from "../rules/types.ts";
import { 
  PathPatternSchema,
  type UserRule, 
  type UserRulesConfig,
  type BlockCommandRule, 
  type ApproveCommandRule,
  type ConfirmCommandRule,
  type WarningRule as UserWarningRule, 
  type ConditionalRule, 
  type LocationRule,
  type CommandPattern,
  type ArgsPattern,
  type PathPattern,
} from "./schema.ts";

/**
 * Convert user-defined rules to internal Rule format
 */

export function convertUserRuleToRule(userRule: UserRule): Rule {
  if (userRule.enabled === false) {
    return createDisabledRule(userRule.name);
  }

  switch (userRule.kind) {
    case "BlockCommandRule":
      return convertBlockCommandRule(userRule);
    case "ApproveCommandRule":
      return convertApproveCommandRule(userRule);
    case "ConfirmCommandRule":
      return convertConfirmCommandRule(userRule);
    case "WarningRule":
      return convertWarningRule(userRule);
    case "ConditionalRule":
      return convertConditionalRule(userRule);
    case "LocationRule":
      return convertLocationRule(userRule);
    default: {
      const _exhaustiveCheck: never = userRule;
      throw new Error(`Unknown rule kind: ${JSON.stringify(_exhaustiveCheck)}`);
    }
  }
}

function convertBlockCommandRule(rule: BlockCommandRule): Rule {
  return createRule(
    rule.name,
    "block",
    (ctx) => {
      // Check if any of the specified patterns match
      if (rule.spec.command && !matchesCommandPattern(ctx.toolInput.command, rule.spec.command)) {
        return false;
      }
      if (rule.spec.args && !matchesArgsPattern(ctx.toolInput.args || [], rule.spec.args)) {
        return false;
      }
      if (rule.spec.cwd && !matchesCwdPattern(ctx.toolInput.cwd, rule.spec.cwd)) {
        return false;
      }
      return true;
    },
    rule.spec.reason || `BlockCommandRule: ${rule.name}`
  );
}

function convertApproveCommandRule(rule: ApproveCommandRule): Rule {
  return createRule(
    rule.name,
    "approve",
    (ctx) => {
      // Check if any of the specified patterns match
      if (rule.spec.command && !matchesCommandPattern(ctx.toolInput.command, rule.spec.command)) {
        return false;
      }
      if (rule.spec.args && !matchesArgsPattern(ctx.toolInput.args || [], rule.spec.args)) {
        return false;
      }
      if (rule.spec.cwd && !matchesCwdPattern(ctx.toolInput.cwd, rule.spec.cwd)) {
        return false;
      }
      return true;
    },
    rule.spec.reason || `ApproveCommandRule: ${rule.name}`
  );
}

function convertConfirmCommandRule(rule: ConfirmCommandRule): Rule {
  return createRule(
    rule.name,
    "confirm",
    (ctx) => {
      // Check if any of the specified patterns match
      if (rule.spec.command && !matchesCommandPattern(ctx.toolInput.command, rule.spec.command)) {
        return false;
      }
      if (rule.spec.args && !matchesArgsPattern(ctx.toolInput.args || [], rule.spec.args)) {
        return false;
      }
      if (rule.spec.cwd && !matchesCwdPattern(ctx.toolInput.cwd, rule.spec.cwd)) {
        return false;
      }
      return true;
    },
    rule.spec.reason || rule.spec.message || `ConfirmCommandRule: ${rule.name}`
  );
}

function convertWarningRule(rule: UserWarningRule): Rule {
  return createWarningRule(
    rule.name,
    (ctx) => matchesPatterns(ctx, rule.spec.patterns),
    rule.spec.warningReason,
    rule.spec.acknowledgedReason,
    rule.spec.acknowledgedAction,
  );
}

function convertConditionalRule(rule: ConditionalRule): Rule {
  if (rule.spec.action === "warning") {
    return createWarningRule(
      rule.name,
      (ctx) => evaluateCondition(ctx, rule.spec.condition),
      rule.spec.message || "Conditional rule triggered",
      rule.spec.reason,
      "skip", // Default to skip for conditional warning rules
    );
  }

  return createRule(
    rule.name,
    rule.spec.action,
    (ctx) => evaluateCondition(ctx, rule.spec.condition),
    rule.spec.reason,
  );
}

function convertLocationRule(rule: LocationRule): Rule {
  return createRule(
    rule.name,
    rule.spec.action,
    (ctx) => {
      const { command, cwd } = ctx.toolInput;
      
      // Check if command is in allowed list (if specified)
      if (rule.spec.commands && !rule.spec.commands.includes(command)) {
        return false;
      }

      // Check path conditions
      if (rule.spec.paths.startsWith && cwd && cwd.startsWith(rule.spec.paths.startsWith)) {
        return true; // Trigger if inside specified path
      }

      if (rule.spec.paths.outside && cwd && !cwd.startsWith(rule.spec.paths.outside)) {
        return true; // Trigger if outside allowed path
      }

      if (rule.spec.paths.contains && cwd && cwd.includes(rule.spec.paths.contains)) {
        return true; // Trigger if path contains specified string
      }

      // Parse paths with Zod to ensure type safety
      const pathsResult = PathPatternSchema.safeParse(rule.spec.paths);
      if (pathsResult.success) {
        const paths = pathsResult.data;
        
        if (paths.isSubdirectory !== undefined && cwd) {
          // For now, we'll check if the path has more than a certain depth
          // This is a simplified implementation - ideally we'd compare against initial working directory
          const pathSegments = cwd.split('/').filter(segment => segment.length > 0);
          const isDeepPath = pathSegments.length > 2; // More than just /home/user level
          
          if (paths.isSubdirectory === true && isDeepPath) {
            return true; // Trigger if we want subdirectories and this is a deep path
          }
          if (paths.isSubdirectory === false && !isDeepPath) {
            return true; // Trigger if we want root-level and this is a shallow path
          }
        }
      }

      return false;
    },
    rule.spec.reason,
  );
}

// Helper functions

function createDisabledRule(name: string): Rule {
  return {
    name: `${name}-disabled`,
    condition: () => null,
  };
}

function matchesPatterns(ctx: RuleContext, patterns: {
  command?: CommandPattern;
  args?: ArgsPattern;
  cwd?: PathPattern;
}): boolean {
  if (patterns.command && !matchesCommandPattern(ctx.toolInput.command, patterns.command)) {
    return false;
  }
  if (patterns.args && !matchesArgsPattern(ctx.toolInput.args || [], patterns.args)) {
    return false;
  }
  if (patterns.cwd && !matchesCwdPattern(ctx.toolInput.cwd, patterns.cwd)) {
    return false;
  }
  return true;
}

function evaluateCondition(ctx: RuleContext, condition: string): boolean {
  try {
    // Create safe evaluation context
    const { command, args = [], cwd } = ctx.toolInput;
    
    // Simple expression evaluation with limited scope
    // Note: This is a basic implementation. For production, consider using a safer evaluator
    const func = new Function("command", "args", "cwd", `return (${condition})`);
    return Boolean(func(command, args, cwd));
  } catch (error) {
    console.warn(`Conditional rule evaluation failed: ${error}`);
    return false;
  }
}


function matchesCommandPattern(command: string, pattern: CommandPattern): boolean {
  if (typeof pattern === "string") {
    return command === pattern;
  }
  
  if (pattern.exact) return command === pattern.exact;
  if (pattern.oneOf) return pattern.oneOf.includes(command);
  if (pattern.regex) return new RegExp(pattern.regex).test(command);
  if (pattern.startsWith) return command.startsWith(pattern.startsWith);
  if (pattern.endsWith) return command.endsWith(pattern.endsWith);
  
  return false;
}

function matchesArgsPattern(args: string[], pattern: ArgsPattern): boolean {
  if (pattern.containsAny && !pattern.containsAny.some(arg => args.includes(arg))) {
    return false;
  }
  
  if (pattern.containsAll && !pattern.containsAll.every(arg => args.includes(arg))) {
    return false;
  }
  
  if (pattern.containsNone && pattern.containsNone.some(arg => args.includes(arg))) {
    return false;
  }
  
  if (pattern.exact && JSON.stringify(args) !== JSON.stringify(pattern.exact)) {
    return false;
  }
  
  if (pattern.startsWith && !matchesArgsStartsWith(args, pattern.startsWith)) {
    return false;
  }
  
  if (pattern.regexAny && !args.some(arg => new RegExp(pattern.regexAny!).test(arg))) {
    return false;
  }
  
  if (pattern.regexAll && !pattern.regexAll.every(regexPattern => 
    args.some(arg => new RegExp(regexPattern).test(arg))
  )) {
    return false;
  }
  
  if (pattern.minLength !== undefined && args.length < pattern.minLength) {
    return false;
  }
  
  if (pattern.maxLength !== undefined && args.length > pattern.maxLength) {
    return false;
  }
  
  return true;
}

function matchesArgsStartsWith(args: string[], prefixes: string[]): boolean {
  // Check if args array starts with the specified prefix array
  if (args.length < prefixes.length) {
    return false;
  }
  
  for (let i = 0; i < prefixes.length; i++) {
    if (args[i] !== prefixes[i]) {
      return false;
    }
  }
  
  return true;
}

function matchesCwdPattern(cwd: string | undefined, pattern: PathPattern): boolean {
  if (!cwd) return false;
  
  if (pattern.startsWith && !cwd.startsWith(pattern.startsWith)) {
    return false;
  }
  
  if (pattern.contains && !cwd.includes(pattern.contains)) {
    return false;
  }
  
  if (pattern.regex && !new RegExp(pattern.regex).test(cwd)) {
    return false;
  }
  
  if (pattern.outside && cwd.startsWith(pattern.outside)) {
    return false;
  }
  
  return true;
}

/**
 * Convert user rules configuration to array of internal rules
 */
export function convertUserRulesConfigToRules(config: UserRulesConfig): Rule[] {
  return config.rules.map(convertUserRuleToRule);
}