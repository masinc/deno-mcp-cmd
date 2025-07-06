import type { RuleAction, RuleContext, RuleTemplateData } from "./types.ts";
import { RuleTemplateDataSchema } from "./types.ts";
import { Eta } from "eta";

// Create eta instance for rendering templates
const eta = new Eta();

/**
 * Renders an Eta template with rule template data and strong typing
 * @param template - The Eta template string
 * @param data - Template data conforming to RuleTemplateData schema
 * @returns Rendered string or original template if rendering fails
 */
export function renderReason(template: string, data: RuleTemplateData): string {
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

/**
 * Creates standardized warning messages with acknowledgment instructions
 * @param ruleName - The name of the rule generating the warning
 * @param description - The warning description
 * @returns Formatted warning message with acknowledgment instructions
 */
export function createWarningReason(
  ruleName: string,
  description: string,
): string {
  return `${description}\n\nTo proceed anyway, add acknowledgeWarnings: ["${ruleName}"] to your request.`;
}

/**
 * Converts a rule action to its corresponding verb form
 * @param action - The rule action
 * @returns The verb form of the action
 */
export function getActionVerb(action: RuleAction): string {
  switch (action) {
    case "block":
      return "blocked";
    case "warning":
      return "warned";
    case "confirm":
      return "requires confirmation";
    case "approve":
      return "approved";
    case "skip":
      return "skipped";
  }
}

/**
 * Creates template data from rule context with optional additional data
 * @param ctx - The rule context
 * @param additionalData - Additional data to merge into the template data
 * @returns Complete template data object with auto-generated fields
 */
export function createTemplateData(
  ctx: RuleContext,
  additionalData: Partial<RuleTemplateData> = {},
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
