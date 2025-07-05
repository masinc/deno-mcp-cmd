import { initOrGetDb } from "./index.ts";
import { type OutputId, OutputSchema } from "./types.ts";
import type { SQLInputValue } from "node:sqlite";
import { encodeBase64, decodeBase64 } from "@std/encoding";

export function createOutputId(): OutputId {
  const id = crypto.randomUUID();
  return id as OutputId;
}

export function isOutputId(id: unknown): id is OutputId {
  return typeof id === "string" && id.length === 36;
}

export function idToString(id: OutputId): string {
  if (!isOutputId(id)) {
    throw new Error(`Invalid OutputId: ${id}`);
  }
  return id;
}

type InsertOutputParams = {
  id: OutputId;
  stdout: string;
  stdoutIsEncoded?: boolean;
  stderr?: string;
  stderrIsEncoded?: boolean;
  status?: "running" | "completed" | "failed";
  exitCode?: number | null;
};

export function insertOutput(
  params: InsertOutputParams,
): OutputId {
  try {
    const db = initOrGetDb();
    const createdAt = new Date().toISOString();

    const result = db.prepare(
      `INSERT INTO outputs (id, stdout, stdoutIsEncoded, stderr, stderrIsEncoded, status, exitCode, createdAt) VALUES (:id, :stdout, :stdoutIsEncoded, :stderr, :stderrIsEncoded, :status, :exitCode, :createdAt)`,
    ).run({
      id: params.id,
      stdout: params.stdout,
      stdoutIsEncoded: params.stdoutIsEncoded ? 1 : 0,
      stderr: params.stderr || "",
      stderrIsEncoded: params.stderrIsEncoded ? 1 : 0,
      status: params.status || "running",
      exitCode: params.exitCode || null,
      createdAt,
    });

    if (result.changes !== 1) {
      throw new Error(`Failed to insert output: expected 1 change, got ${result.changes}`);
    }

    return params.id;
  } catch (error) {
    throw new Error(`Database error while inserting output: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

type OutputResult = {
  stdout: string;
  stdoutIsEncoded: boolean;
  stderr: string;
  stderrIsEncoded: boolean;
  status: "running" | "completed" | "failed";
  exitCode: number | null;
  createdAt: string;
};

export function getOutputById(id: OutputId): OutputResult | undefined {
  try {
    if (!isOutputId(id)) {
      throw new Error(`Invalid output ID format: ${id}`);
    }

    const db = initOrGetDb();
    const result = db.prepare(`SELECT * FROM outputs WHERE id = ?`).get(id);

    if (!result) {
      return undefined;
    }

    const output = OutputSchema.safeParse(result);

    if (!output.success) {
      throw new Error(`Failed to parse output result: ${output.error.message}`);
    }

    return {
      stdout: output.data.stdout,
      stdoutIsEncoded: Boolean(output.data.stdoutIsEncoded),
      stderr: output.data.stderr,
      stderrIsEncoded: Boolean(output.data.stderrIsEncoded),
      status: output.data.status,
      exitCode: output.data.exitCode,
      createdAt: output.data.createdAt,
    };
  } catch (error) {
    throw new Error(`Database error while getting output by ID: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export function deleteExpiredOutputs(
  expirationDays: number = 1,
): number {
  try {
    const db = initOrGetDb();
    const expirationDate = new Date();
    expirationDate.setDate(expirationDate.getDate() - expirationDays);
    const isoExpirationDate = expirationDate.toISOString();

    const result = db.prepare(
      `DELETE FROM outputs WHERE createdAt < ?`,
    ).run(isoExpirationDate);
    
    return Number(result.changes);
  } catch (error) {
    throw new Error(`Database error while deleting expired outputs: ${error instanceof Error ? error.message : 'Unknown error'}`);
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

export function updateOutput(params: UpdateOutputParams): void {
  try {
    const db = initOrGetDb();
    
    const setParts: string[] = [];
    const values: Record<string, SQLInputValue> = { id: params.id };
    
    if (params.stdout !== undefined) {
      setParts.push("stdout = :stdout");
      values.stdout = params.stdout;
    }
    if (params.stdoutIsEncoded !== undefined) {
      setParts.push("stdoutIsEncoded = :stdoutIsEncoded");
      values.stdoutIsEncoded = params.stdoutIsEncoded ? 1 : 0;
    }
    if (params.stderr !== undefined) {
      setParts.push("stderr = :stderr");
      values.stderr = params.stderr;
    }
    if (params.stderrIsEncoded !== undefined) {
      setParts.push("stderrIsEncoded = :stderrIsEncoded");
      values.stderrIsEncoded = params.stderrIsEncoded ? 1 : 0;
    }
    if (params.status !== undefined) {
      setParts.push("status = :status");
      values.status = params.status;
    }
    if (params.exitCode !== undefined) {
      setParts.push("exitCode = :exitCode");
      values.exitCode = params.exitCode;
    }
    
    if (setParts.length === 0) {
      throw new Error("No fields to update");
    }
    
    const sql = `UPDATE outputs SET ${setParts.join(", ")} WHERE id = :id`;
    const result = db.prepare(sql).run(values);
    
    if (result.changes !== 1) {
      throw new Error(`Failed to update output: expected 1 change, got ${result.changes}`);
    }
  } catch (error) {
    throw new Error(`Database error while updating output: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export function updateStreamOutput(
  outputId: OutputId,
  streamType: "stdout" | "stderr",
  content: string | Uint8Array,
  isBinary: boolean,
): void {
  try {
    const currentOutput = getOutputById(outputId);
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
        const newText = typeof content === "string" ? content : new TextDecoder().decode(content);
        updatedStdout = currentOutput.stdout + newText;
      }
      
      updateOutput({
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
        const newText = typeof content === "string" ? content : new TextDecoder().decode(content);
        updatedStderr = currentOutput.stderr + newText;
      }
      
      updateOutput({
        id: outputId,
        stderr: updatedStderr,
        stderrIsEncoded: willBeEncoded,
      });
    }
  } catch (error) {
    console.error(`Failed to update stream output for ${outputId}:`, error);
  }
}
