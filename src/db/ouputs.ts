import { initOrGetDrizzleDb, outputs } from "./drizzle.ts";
import type { OutputId } from "./schema.ts";
import { OutputIdSchema } from "./schema.ts";
import { eq, lt } from "drizzle-orm";
import { decodeBase64, encodeBase64 } from "@std/encoding";

export function createOutputId(): OutputId {
  // 9桁数字 = 3トークン、10億パターン (25トークンから88%削減)
  const id = Math.floor(Math.random() * 1000000000).toString().padStart(9, '0');
  return OutputIdSchema.parse(id);
}

export function isOutputId(id: unknown): id is OutputId {
  // Zodスキーマを使用した型安全なバリデーション
  return OutputIdSchema.safeParse(id).success;
}

export function idToString(id: OutputId): string {
  // Zodスキーマでバリデーション
  return OutputIdSchema.parse(id);
}

type InsertOutputParams = {
  id: OutputId;
  stdout: string;
  stdoutIsEncoded?: boolean;
  stderr?: string;
  stderrIsEncoded?: boolean;
  status?: "running" | "completed" | "failed";
  exitCode?: number | null;
  cwd: string;
};

export async function insertOutput(
  params: InsertOutputParams,
): Promise<OutputId> {
  try {
    const db = await initOrGetDrizzleDb();
    const createdAt = new Date().toISOString();

    await db.insert(outputs).values({
      id: params.id,
      stdout: params.stdout,
      stdoutIsEncoded: params.stdoutIsEncoded ?? false,
      stderr: params.stderr ?? "",
      stderrIsEncoded: params.stderrIsEncoded ?? false,
      status: params.status ?? "running",
      exitCode: params.exitCode ?? null,
      cwd: params.cwd,
      createdAt,
    });

    return params.id;
  } catch (error) {
    throw new Error(
      `Database error while inserting output: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
    );
  }
}

type OutputResult = {
  stdout: string;
  stdoutIsEncoded: boolean;
  stderr: string;
  stderrIsEncoded: boolean;
  status: "running" | "completed" | "failed";
  exitCode: number | null;
  cwd: string;
  createdAt: string;
};

export async function getOutputById(
  id: OutputId,
): Promise<OutputResult | undefined> {
  try {
    if (!isOutputId(id)) {
      throw new Error(`Invalid output ID format: ${id}`);
    }

    const db = await initOrGetDrizzleDb();
    const result = await db.select().from(outputs).where(eq(outputs.id, id))
      .limit(1);

    if (result.length === 0) {
      return undefined;
    }

    const output = result[0];
    return {
      stdout: output.stdout,
      stdoutIsEncoded: output.stdoutIsEncoded,
      stderr: output.stderr,
      stderrIsEncoded: output.stderrIsEncoded,
      status: output.status,
      exitCode: output.exitCode,
      cwd: output.cwd,
      createdAt: output.createdAt,
    };
  } catch (error) {
    throw new Error(
      `Database error while getting output by ID: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
    );
  }
}

export async function deleteExpiredOutputs(
  expirationDays: number = 1,
): Promise<number> {
  try {
    const db = await initOrGetDrizzleDb();
    const expirationDate = new Date();
    expirationDate.setDate(expirationDate.getDate() - expirationDays);
    // SQLite datetime('now') format: YYYY-MM-DD HH:MM:SS (no milliseconds)
    const isoExpirationDate = expirationDate.toISOString().slice(0, 19).replace('T', ' ');

    const result = await db.delete(outputs).where(
      lt(outputs.createdAt, isoExpirationDate),
    );

    return result.rowsAffected || 0;
  } catch (error) {
    throw new Error(
      `Database error while deleting expired outputs: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
    );
  }
}

type UpdateOutputParams = {
  id: OutputId;
  stdout?: string;
  stdoutIsEncoded?: boolean;
  stderr?: string;
  stderrIsEncoded?: boolean;
  status?: "running" | "completed" | "failed";
  exitCode?: number | null;
};

export async function updateOutput(params: UpdateOutputParams): Promise<void> {
  try {
    const db = await initOrGetDrizzleDb();

    const updateValues: Record<string, string | number | boolean | null> = {};

    if (params.stdout !== undefined) {
      updateValues.stdout = params.stdout;
    }
    if (params.stdoutIsEncoded !== undefined) {
      updateValues.stdoutIsEncoded = params.stdoutIsEncoded;
    }
    if (params.stderr !== undefined) {
      updateValues.stderr = params.stderr;
    }
    if (params.stderrIsEncoded !== undefined) {
      updateValues.stderrIsEncoded = params.stderrIsEncoded;
    }
    if (params.status !== undefined) {
      updateValues.status = params.status;
    }
    if (params.exitCode !== undefined) {
      updateValues.exitCode = params.exitCode;
    }

    if (Object.keys(updateValues).length === 0) {
      throw new Error("No fields to update");
    }

    const result = await db.update(outputs).set(updateValues).where(
      eq(outputs.id, params.id),
    );

    if (result.rowsAffected !== 1) {
      throw new Error(
        `Failed to update output: expected 1 change, got ${result.rowsAffected}`,
      );
    }
  } catch (error) {
    throw new Error(
      `Database error while updating output: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
    );
  }
}

export async function updateStreamOutput(
  outputId: OutputId,
  streamType: "stdout" | "stderr",
  content: string | Uint8Array,
  isBinary: boolean,
): Promise<void> {
  try {
    const currentOutput = await getOutputById(outputId);
    if (!currentOutput) {
      throw new Error(`Output with ID ${outputId} not found`);
    }

    if (streamType === "stdout") {
      const willBeEncoded = isBinary || currentOutput.stdoutIsEncoded;
      let updatedStdout: string;

      if (willBeEncoded) {
        // バイナリデータとして処理
        const existingData = currentOutput.stdoutIsEncoded
          ? decodeBase64(currentOutput.stdout)
          : new TextEncoder().encode(currentOutput.stdout);
        const newData = typeof content === "string"
          ? new TextEncoder().encode(content)
          : content;

        const combined = new Uint8Array(existingData.length + newData.length);
        combined.set(existingData);
        combined.set(newData, existingData.length);
        updatedStdout = encodeBase64(combined);
      } else {
        // テキストデータとして処理
        const newText = typeof content === "string"
          ? content
          : new TextDecoder().decode(content);
        updatedStdout = currentOutput.stdout + newText;
      }

      await updateOutput({
        id: outputId,
        stdout: updatedStdout,
        stdoutIsEncoded: willBeEncoded,
      });
    } else {
      const willBeEncoded = isBinary || currentOutput.stderrIsEncoded;
      let updatedStderr: string;

      if (willBeEncoded) {
        // バイナリデータとして処理
        const existingData = currentOutput.stderrIsEncoded
          ? decodeBase64(currentOutput.stderr)
          : new TextEncoder().encode(currentOutput.stderr);
        const newData = typeof content === "string"
          ? new TextEncoder().encode(content)
          : content;

        const combined = new Uint8Array(existingData.length + newData.length);
        combined.set(existingData);
        combined.set(newData, existingData.length);
        updatedStderr = encodeBase64(combined);
      } else {
        // テキストデータとして処理
        const newText = typeof content === "string"
          ? content
          : new TextDecoder().decode(content);
        updatedStderr = currentOutput.stderr + newText;
      }

      await updateOutput({
        id: outputId,
        stderr: updatedStderr,
        stderrIsEncoded: willBeEncoded,
      });
    }
  } catch (error) {
    console.error(`Failed to update stream output for ${outputId}:`, error);
  }
}
