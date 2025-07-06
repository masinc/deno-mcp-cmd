import type { Rule, RuleContext, RuleResult } from "./schema.ts";

/**
 * Evaluates a list of rules against a given context and returns the highest priority result
 *
 * Rules are evaluated in order, and the first matching rule of each action type is collected.
 * Priority order (highest to lowest): block > warning > confirm > approve > skip
 *
 * @param rules - Array of rules to evaluate
 * @param context - The rule context containing command and session information
 * @returns The highest priority rule result, or skip action if no rules match
 */
export function evaluateRules(rules: Rule[], context: RuleContext): RuleResult {
  const results: RuleResult[] = [];

  // Collect all matching rule results (except skip actions)
  for (const rule of rules) {
    const result = rule.condition(context);
    if (result && result.action !== "skip") {
      results.push(result);
    }
  }

  // Return the highest priority action found
  // Priority order: block > warning > confirm > approve > skip

  const blockResult = results.find((r) => r.action === "block");
  if (blockResult) return blockResult;

  const warningResult = results.find((r) => r.action === "warning");
  if (warningResult) return warningResult;

  const confirmResult = results.find((r) => r.action === "confirm");
  if (confirmResult) return confirmResult;

  const approveResult = results.find((r) => r.action === "approve");
  if (approveResult) return approveResult;

  // If no rules matched or all returned skip, return default skip action
  return { action: "skip" };
}
