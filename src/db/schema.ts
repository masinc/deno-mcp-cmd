import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";

export const outputs = sqliteTable("outputs", {
  id: text("id").primaryKey(),
  stdout: text("stdout").notNull().default(""),
  stdoutIsEncoded: integer("stdoutIsEncoded", { mode: "boolean" }).notNull()
    .default(false),
  stderr: text("stderr").notNull().default(""),
  stderrIsEncoded: integer("stderrIsEncoded", { mode: "boolean" }).notNull()
    .default(false),
  status: text("status", { enum: ["running", "completed", "failed"] }).notNull()
    .default("running"),
  exitCode: integer("exitCode"),
  createdAt: text("createdAt").notNull().default("datetime('now')"),
});

// Zod schemas for validation
export const insertOutputSchema = createInsertSchema(outputs);
export const selectOutputSchema = createSelectSchema(outputs);

// Types inferred from schema
export type Output = typeof outputs.$inferSelect;
export type NewOutput = typeof outputs.$inferInsert;

// Custom branded type for OutputId (9桁数字)
export const OutputIdSchema = z.string().regex(/^\d{9}$/).brand("outputId");
export type OutputId = z.infer<typeof OutputIdSchema>;

export const CommandStatusSchema = z.enum(["running", "completed", "failed"]);
export type CommandStatus = z.infer<typeof CommandStatusSchema>;
