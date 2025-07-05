import * as z from "zod";

export const OutputIdSchema = z.string().uuid().brand("outputId");

export const CommandStatusSchema = z.enum(["running", "completed", "failed"]);

export const OutputSchema = z.object({
  id: OutputIdSchema,
  stdout: z.string(),
  stdoutIsEncoded: z.number().default(0),
  stderr: z.string().default(""),
  stderrIsEncoded: z.number().default(0),
  status: CommandStatusSchema.default("running"),
  exitCode: z.number().nullable().default(null),
  createdAt: z.string().datetime(),
});

export type OutputId = z.infer<typeof OutputIdSchema>;
export type CommandStatus = z.infer<typeof CommandStatusSchema>;
export type Output = z.infer<typeof OutputSchema>;
