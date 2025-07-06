import * as z from "zod";

export const RuleActionSchema = z.enum(["block", "approve", "confirm", "skip"]);
export type RuleAction = z.infer<typeof RuleActionSchema>;

export const RuleContextSchema = z.object({
  toolInput: z.object({
    command: z.string(),
    args: z.array(z.string()).optional(),
    stdin: z.string().optional(),
    stdinForOutput: z.string().optional(),
    cwd: z.string().optional(),
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

export const RuleSchema = z.object({
  name: z.string(),
  condition: z.function()
    .args(RuleContextSchema)
    .returns(z.union([RuleResultSchema, z.null()])),
});
export type Rule = z.infer<typeof RuleSchema>;
