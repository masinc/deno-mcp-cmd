import type { Rule, RuleContext, RuleResult } from "./types.ts";

export function evaluateRules(rules: Rule[], context: RuleContext): RuleResult {
  const results: RuleResult[] = [];

  for (const rule of rules) {
    const result = rule.condition(context);
    if (result && result.action !== "skip") {
      results.push(result);
    }
  }

  const blockResult = results.find((r) => r.action === "block");
  if (blockResult) return blockResult;

  const confirmResult = results.find((r) => r.action === "confirm");
  if (confirmResult) return confirmResult;

  const approveResult = results.find((r) => r.action === "approve");
  if (approveResult) return approveResult;

  return { action: "skip" };
}
