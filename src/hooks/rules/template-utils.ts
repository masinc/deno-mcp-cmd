import type {
  RuleAction,
  RuleContext,
  RuleTemplateData,
} from "./types.ts";
import { RuleTemplateDataSchema } from "./types.ts";
import { Eta } from "eta";

// Create eta instance for rendering templates
const eta = new Eta();

// Helper function to render eta templates for reasons with strong typing
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

// Helper function to create standardized warning messages
export function createWarningReason(ruleName: string, description: string): string {
  return `${description}\n\nTo proceed anyway, add acknowledgeWarnings: ["${ruleName}"] to your request.`;
}

// Helper function to get appropriate verb for action
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

// Helper function to create template data from context
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