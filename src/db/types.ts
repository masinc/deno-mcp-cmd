import * as z from "zod";

export const OutputIdSchema = z.string().uuid().brand("outputId");

export const OutputSchema = z.object({
  id: OutputIdSchema,
  stdout: z.string(),
  stdoutIsEncoded: z.number().default(0),
  stderr: z.string().default(""),
  stderrIsEncoded: z.number().default(0),
  createdAt: z.string().datetime(),
});

export type OutputId = z.infer<typeof OutputIdSchema>;
export type Output = z.infer<typeof OutputSchema>;
