import * as z from "zod";

export const TOOL_RUN = "mcp__cmd__runCommand";
export const TOOL_GET = "mcp__cmd__getCommand";

export const TOOLS = [TOOL_RUN, TOOL_GET] as const;

export const PreToolUseInputSchema = z.object({
  session_id: z.string(),
  transcript_path: z.string(),
  tool_name: z.string(),
  tool_input: z.record(z.unknown()),
});

export type PreToolUseInput = z.infer<typeof PreToolUseInputSchema>;

export const SimpleOutputSchema = z.object({
  message: z.string(),
  exitCode: z.number().optional(),
});

export type SimpleOutput = z.infer<typeof SimpleOutputSchema>;

export const PreToolUseOutputSchema = z.object({
  continue: z.boolean().optional(),
  stopReason: z.string().optional(),
  suppressOutput: z.boolean().optional(),
  decision: z.enum(["approve", "block"]).optional(),
  reason: z.string().optional(),
});

export type PreToolUseOutput = z.infer<typeof PreToolUseOutputSchema>;

export const ToolInputRunSchema = z.object({
  command: z.string(),
  args: z.array(z.string()).optional(),
  stdin: z.string().optional(),
  stdinForOutput: z.string().optional(),
  cwd: z.string().optional(),
  acknowledgeWarnings: z.array(z.string()).optional(),
});

export type ToolInputRun = z.infer<typeof ToolInputRunSchema>;
