import * as z from "zod/v4";

export const RuleActionSchema = z.enum([
  "block",
  "warning",
  "approve",
  "confirm",
  "skip",
]);
export type RuleAction = z.infer<typeof RuleActionSchema>;

export const RuleContextSchema = z.object({
  toolInput: z.object({
    command: z.string(),
    args: z.array(z.string()).optional(),
    stdin: z.string().optional(),
    stdinForOutput: z.string().optional(),
    cwd: z.string().optional(),
    acknowledgeWarnings: z.array(z.string()).optional(),
  }),
  sessionId: z.string(),
  transcriptPath: z.string(),
  timestamp: z.date(),
});
export type RuleContext = z.infer<typeof RuleContextSchema>;

export const RuleResultSchema = z.object({
  action: RuleActionSchema,
  reason: z.string().optional(),
});
export type RuleResult = z.infer<typeof RuleResultSchema>;

// zod/v4では z.function() がZodSchemaではなくなったため、
// z.custom()を使用して関数バリデーションを実装
export const RuleSchema = z.object({
  name: z.string(),
  condition: z.custom<(ctx: RuleContext) => RuleResult | null>(
    (val) => typeof val === "function",
    {
      message: "Expected a function",
    },
  ),
});

export type Rule = z.infer<typeof RuleSchema>;

export const RuleTemplateDataSchema = z.object({
  // Core command information
  command: z.string(),
  args: z.array(z.string()).optional(),
  cwd: z.string().optional(),
  sessionId: z.string(),

  // Rule-specific data
  action: RuleActionSchema,
  actionVerb: z.string(),

  // Pattern-specific data
  pattern: z.string().optional(),

  // Path-specific data
  argCount: z.number().optional(),

  // Custom rule data
  ruleName: z.string().optional(),
});
export type RuleTemplateData = z.infer<typeof RuleTemplateDataSchema>;
